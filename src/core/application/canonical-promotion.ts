import { createHash, randomUUID } from "node:crypto";
import {
	CANONICAL_DOCUMENT_SCHEMA_VERSION,
	assertCanonicalDocumentDraft,
	canonicalMarkdownDiff,
	targetForCanonicalDocument,
	type CanonicalDocumentDraft,
	type CanonicalDocumentDraftInput,
	type CanonicalDocumentTarget,
} from "../domain/canonical-document";
import { sanitizeTerminalText } from "../domain/terminal";

export interface StoredCanonicalDocument {
	readonly body: string;
	readonly digest: string;
}

export type CanonicalWriteResult =
	| { readonly status: "written"; readonly document: StoredCanonicalDocument }
	| { readonly status: "conflict"; readonly document: StoredCanonicalDocument };

export interface CanonicalDocumentStore {
	read(target: CanonicalDocumentTarget): Promise<StoredCanonicalDocument>;
	/** CAS write: verifies expectedDigest immediately before the atomic rename. */
	writeAtomic(target: CanonicalDocumentTarget, expectedDigest: string, body: string): Promise<CanonicalWriteResult>;
}

export interface AcceptedCanonicalPromotion {
	readonly status: "accepted";
	readonly gitState: "uncommitted";
	readonly token: string;
	readonly acceptedAt: string;
	readonly acceptedBy: string;
	readonly target: CanonicalDocumentTarget;
	readonly beforeDigest: string;
	readonly afterDigest: string;
	readonly diff: string;
}

export interface PromotedCanonicalPromotion {
	readonly status: "promoted";
	readonly gitState: "uncommitted";
	readonly target: CanonicalDocumentTarget;
	readonly beforeDigest: string;
	readonly afterDigest: string;
	readonly diff: string;
}

export interface StaleCanonicalPromotion {
	readonly status: "stale";
	readonly gitState: "uncommitted";
	readonly reason: "unknown-token" | "draft-changed" | "target-changed";
	readonly target: CanonicalDocumentTarget;
	readonly beforeDigest: string;
	readonly afterDigest: string;
	readonly diff: string;
}

export type CanonicalPromotionResult = AcceptedCanonicalPromotion | PromotedCanonicalPromotion | StaleCanonicalPromotion;

interface PendingAcceptance {
	readonly fingerprint: CanonicalDocumentFingerprint;
	readonly target: CanonicalDocumentTarget;
}

interface CanonicalDocumentFingerprint {
	readonly bodyDigest: string;
	readonly sourceDigest: string;
	readonly targetDigest: string;
	readonly digest: string;
}

/**
 * Capability boundary for tracked Markdown. Calling accept is the only way to mint a
 * one-time token; promote writes an accepted file but never creates a git commit, push, or PR.
 */
export class CanonicalPromotionService {
	private readonly pending = new Map<string, PendingAcceptance>();

	constructor(private readonly store: CanonicalDocumentStore) {}

	async accept(draft: CanonicalDocumentDraft, acceptedBy: string): Promise<AcceptedCanonicalPromotion> {
		assertPromotionDraft(draft);
		if (!isHumanAcceptance(acceptedBy)) throw new Error("사람 승인자 식별자가 필요합니다.");
		const current = await this.store.read(draft.target);
		assertStoredDigest(current);
		const fingerprint = fingerprintCanonicalDocument(draft, current.digest);
		const token = `www-promotion-v1.${randomUUID()}.${fingerprint.digest}`;
		this.pending.set(token, { fingerprint, target: draft.target });
		return {
			status: "accepted",
			gitState: "uncommitted",
			token,
			acceptedAt: new Date().toISOString(),
			acceptedBy,
			target: draft.target,
			beforeDigest: current.digest,
			afterDigest: digestCanonicalDocument(draft.body),
			diff: canonicalMarkdownDiff(current.body, draft.body),
		};
	}

	async promote(draft: CanonicalDocumentDraft, token: string): Promise<PromotedCanonicalPromotion | StaleCanonicalPromotion> {
		assertPromotionDraft(draft);
		const current = await this.store.read(draft.target);
		assertStoredDigest(current);
		const accepted = this.pending.get(token);
		if (!accepted) return stale("unknown-token", draft.target, current.body, current.digest, draft.body);
		const actual = fingerprintCanonicalDocument(draft, current.digest);
		if (accepted.target !== draft.target || accepted.fingerprint.bodyDigest !== actual.bodyDigest || accepted.fingerprint.sourceDigest !== actual.sourceDigest) {
			return stale("draft-changed", draft.target, current.body, current.digest, draft.body);
		}
		if (accepted.fingerprint.targetDigest !== actual.targetDigest) {
			return stale("target-changed", draft.target, current.body, current.digest, draft.body);
		}
		const write = await this.store.writeAtomic(draft.target, current.digest, draft.body);
		assertStoredDigest(write.document);
		if (write.status === "conflict") return stale("target-changed", draft.target, write.document.body, write.document.digest, draft.body);
		this.pending.delete(token);
		return {
			status: "promoted",
			gitState: "uncommitted",
			target: draft.target,
			beforeDigest: current.digest,
			afterDigest: write.document.digest,
			diff: canonicalMarkdownDiff(current.body, write.document.body),
		};
	}
}

/** Creates a redacted Todo or T-note promotion draft from an immutable source snapshot. */
export function createCanonicalDocumentDraft(input: CanonicalDocumentDraftInput): CanonicalDocumentDraft {
	if (typeof input.body !== "string" || typeof input.source.body !== "string") throw new Error("정본 문서 본문과 source는 문자열이어야 합니다.");
	const body = sanitizeTerminalText(input.body, 256 * 1024);
	const draft: CanonicalDocumentDraft = {
		schemaVersion: CANONICAL_DOCUMENT_SCHEMA_VERSION,
		kind: input.kind,
		body,
		source: { id: input.source.id, kind: input.kind, digest: digestCanonicalDocument(input.source.body) },
		provenance: input.provenance,
		redaction: { policy: "www-v1", bodyDigest: digestCanonicalDocument(body) },
		target: targetForCanonicalDocument(input.kind, input.source.id),
	};
	assertPromotionDraft(draft);
	return draft;
}

export function digestCanonicalDocument(value: string): string {
	return createHash("sha256").update(value, "utf8").digest("hex");
}

export function fingerprintCanonicalDocument(draft: CanonicalDocumentDraft, targetDigest: string): CanonicalDocumentFingerprint {
	assertPromotionDraft(draft);
	if (!isDigest(targetDigest)) throw new Error("대상 문서 digest가 유효하지 않습니다.");
	const bodyDigest = digestCanonicalDocument(draft.body);
	const sourceDigest = draft.source.digest;
	const digest = digestCanonicalDocument(`${bodyDigest}\n${sourceDigest}\n${targetDigest}\n${draft.target}`);
	return { bodyDigest, sourceDigest, targetDigest, digest };
}

function assertPromotionDraft(draft: CanonicalDocumentDraft): void {
	assertCanonicalDocumentDraft(draft);
	if (sanitizeTerminalText(draft.body, 256 * 1024) !== draft.body || draft.redaction.bodyDigest !== digestCanonicalDocument(draft.body)) {
		throw new Error("정본 문서 본문은 redaction을 거쳐야 합니다.");
	}
}

function stale(
	reason: StaleCanonicalPromotion["reason"],
	target: CanonicalDocumentTarget,
	before: string,
	beforeDigest: string,
	after: string,
): StaleCanonicalPromotion {
	return { status: "stale", gitState: "uncommitted", reason, target, beforeDigest, afterDigest: digestCanonicalDocument(after), diff: canonicalMarkdownDiff(before, after) };
}

function assertStoredDigest(value: StoredCanonicalDocument): void {
	if (value.digest !== digestCanonicalDocument(value.body)) throw new Error("정본 문서 저장소 digest가 일치하지 않습니다.");
}

function isHumanAcceptance(value: string): boolean {
	return /^[A-Za-z0-9][A-Za-z0-9._:@ -]{0,127}$/u.test(value);
}

function isDigest(value: unknown): value is string {
	return typeof value === "string" && /^[a-f0-9]{64}$/u.test(value);
}

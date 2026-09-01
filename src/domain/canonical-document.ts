export const CANONICAL_DOCUMENT_SCHEMA_VERSION = 1 as const;
export const CANONICAL_DOCUMENT_KINDS = ["todo", "tnote"] as const;
export type CanonicalDocumentKind = (typeof CANONICAL_DOCUMENT_KINDS)[number];

export type CanonicalDocumentTarget = ".www/vault/Todo.md" | `.www/vault/t-notes/${string}.md`;

export interface CanonicalDocumentSource {
	readonly id: string;
	readonly kind: CanonicalDocumentKind;
	/** Digest of the immutable source snapshot from which this draft was derived. */
	readonly digest: string;
}

export interface CanonicalDocumentProvenance {
	readonly sessionId: string;
	readonly capturedAt: string;
	readonly turnId?: string;
}

export interface CanonicalDocumentRedaction {
	readonly policy: "www-v1";
	/** Digest of the already-redacted body. The application verifies its value. */
	readonly bodyDigest: string;
}

/** Narrow portable contract shared by Todo and T-note drafts. */
export interface CanonicalDocumentDraft {
	readonly schemaVersion: typeof CANONICAL_DOCUMENT_SCHEMA_VERSION;
	readonly kind: CanonicalDocumentKind;
	readonly body: string;
	readonly source: CanonicalDocumentSource;
	readonly provenance: CanonicalDocumentProvenance;
	readonly redaction: CanonicalDocumentRedaction;
	readonly target: CanonicalDocumentTarget;
}

export interface CanonicalDocumentDraftInput {
	readonly kind: CanonicalDocumentKind;
	readonly body: string;
	readonly source: { readonly id: string; readonly body: string };
	readonly provenance: CanonicalDocumentProvenance;
}

const MAX_MARKDOWN_CHARACTERS = 256 * 1024;
const SHA256 = /^[a-f0-9]{64}$/u;
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const SAFE_NOTE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/u;
const TNOTE_TARGET = /^\.www\/vault\/t-notes\/([A-Za-z0-9][A-Za-z0-9._-]{0,63})\.md$/u;

export function targetForCanonicalDocument(kind: CanonicalDocumentKind, sourceId?: string): CanonicalDocumentTarget {
	if (kind === "todo") return ".www/vault/Todo.md";
	if (!sourceId || !SAFE_NOTE_ID.test(sourceId)) throw new Error("T-note source id는 안전한 파일 이름이어야 합니다.");
	return `.www/vault/t-notes/${sourceId}.md`;
}

/** Validates untrusted persisted/transported drafts before acceptance or write. */
export function assertCanonicalDocumentDraft(value: CanonicalDocumentDraft): void {
	if (!value || typeof value !== "object") throw new Error("정본 문서 초안이 필요합니다.");
	if (value.schemaVersion !== CANONICAL_DOCUMENT_SCHEMA_VERSION) throw new Error("지원하지 않는 정본 문서 schema입니다.");
	if (!CANONICAL_DOCUMENT_KINDS.includes(value.kind)) throw new Error("지원하지 않는 정본 문서 종류입니다.");
	if (typeof value.body !== "string" || value.body.length > MAX_MARKDOWN_CHARACTERS || /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/u.test(value.body)) {
		throw new Error("정본 문서 본문이 유효하지 않거나 너무 큽니다.");
	}
	if (!value.source || value.source.kind !== value.kind || !isIdentifier(value.source.id) || !isDigest(value.source.digest)) {
		throw new Error("정본 문서 source가 유효하지 않습니다.");
	}
	if (!value.provenance || !isIdentifier(value.provenance.sessionId) || !isIsoDate(value.provenance.capturedAt) || (value.provenance.turnId !== undefined && !isIdentifier(value.provenance.turnId))) {
		throw new Error("정본 문서 provenance가 유효하지 않습니다.");
	}
	if (!value.redaction || value.redaction.policy !== "www-v1" || !isDigest(value.redaction.bodyDigest)) {
		throw new Error("정본 문서 redaction 증명이 유효하지 않습니다.");
	}
	if (!isCanonicalTargetFor(value.target, value.kind, value.source.id)) throw new Error("정본 문서 target allowlist를 벗어났습니다.");
}

/** A compact, deterministic preview for the human approval surface. */
export function canonicalMarkdownDiff(before: string, after: string): string {
	if (before === after) return "";
	const beforeLines = before.split("\n");
	const afterLines = after.split("\n");
	let start = 0;
	while (start < beforeLines.length && start < afterLines.length && beforeLines[start] === afterLines[start]) start += 1;
	let beforeEnd = beforeLines.length;
	let afterEnd = afterLines.length;
	while (beforeEnd > start && afterEnd > start && beforeLines[beforeEnd - 1] === afterLines[afterEnd - 1]) {
		beforeEnd -= 1;
		afterEnd -= 1;
	}
	return [
		`@@ -${start + 1},${beforeEnd - start} +${start + 1},${afterEnd - start} @@`,
		...beforeLines.slice(start, beforeEnd).map(line => `-${line}`),
		...afterLines.slice(start, afterEnd).map(line => `+${line}`),
	].join("\n");
}

export function isCanonicalDocumentTarget(value: unknown): value is CanonicalDocumentTarget {
	return typeof value === "string" && (value === ".www/vault/Todo.md" || TNOTE_TARGET.test(value));
}

function isCanonicalTargetFor(target: CanonicalDocumentTarget, kind: CanonicalDocumentKind, sourceId: string): boolean {
	if (kind === "todo") return target === ".www/vault/Todo.md";
	if (!SAFE_NOTE_ID.test(sourceId)) return false;
	return target === `.www/vault/t-notes/${sourceId}.md`;
}

function isDigest(value: unknown): value is string {
	return typeof value === "string" && SHA256.test(value);
}

function isIdentifier(value: unknown): value is string {
	return typeof value === "string" && IDENTIFIER.test(value);
}

function isIsoDate(value: unknown): value is string {
	return typeof value === "string" && Number.isFinite(Date.parse(value));
}

import { existsSync, readFileSync, realpathSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";
import type { RegistryEnvelope, TraceabilityLedger, VerificationReceipt } from "../../../core/domain/development/development-traceability.js";
import { digestLedger } from "./development-traceability-digest.js";
import { canonicalDigest, requiredCoverageFromRegistries, sha256, validateLedger, validateRegistryEnvelope, validateVerificationReceipt } from "./development-traceability-contract.js";
import { inspectObsidianVault, type ObsidianVaultDocument } from "./obsidian-contract.js";
import { obsidianWikiTarget } from "../../../core/domain/development/obsidian-contract.js";

const registryKind = (kind: string) => kind === "spec" ? "specs" : kind === "test-contract" ? "tests" : `${kind}s`;
const containedFile = (root: string, path: string): string => {
	if (isAbsolute(path) || path.split(/[\\/]/u).some((part) => part === "..")) throw new Error("SOURCE_PATH_MUST_BE_RELATIVE");
	const canonicalRoot = realpathSync(root);
	const canonicalPath = realpathSync(resolve(canonicalRoot, path));
	const offset = relative(canonicalRoot, canonicalPath);
	if (offset === ".." || offset.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`) || isAbsolute(offset)) {
		throw new Error("SOURCE_PATH_ESCAPES_PROJECT");
	}
	return canonicalPath;
};

function sameValues(left: readonly string[], right: readonly string[]): boolean {
	return JSON.stringify([...left].sort()) === JSON.stringify([...right].sort());
}

export interface ObsidianNoteProjection {
	documentId: string;
	path: string;
	digest: string;
	linearId: string;
	schemaVersion: 2;
	status: "current" | "renamed" | "content-changed" | "renamed-and-content-changed" | "unmapped";
}

export interface ObsidianTraceabilityInspection {
	notes: ObsidianNoteProjection[];
	errors: string[];
}

function wikiAliases(document: ObsidianVaultDocument): string[] {
	const withoutExtension = document.relativePath.replace(/\.md$/u, "");
	return [withoutExtension, withoutExtension.split("/").at(-1)!];
}

function linearObsidianPath(description: string | undefined): string | undefined {
	const uri = description?.match(/^[-*] Obsidian:\s*\[[^\]]+\]\(<?(obsidian:\/\/[^)>]+)>?\)$/mu)?.[1];
	if (!uri) return undefined;
	try {
		const parsed = new URL(uri);
		const path = parsed.searchParams.get("file") ?? parsed.searchParams.get("path");
		if (!path) return undefined;
		return decodeURIComponent(path).replaceAll("\\", "/").replace(/^\/+/, "").replace(/\.md$/u, "");
	} catch { return undefined; }
}

function sameObsidianPath(observed: string, expected: string): boolean {
	const canonicalExpected = expected.replace(/\.md$/u, "");
	return observed === canonicalExpected || observed.endsWith(`/${canonicalExpected}`);
}

/**
 * Obsidian Properties are the authoring source. The ledger must contain the
 * normalized document identities and relationships; SQLite may only project
 * this read-only inspection result.
 */
export function inspectObsidianTraceability(options: {
	vaultRoot: string;
	ledger: TraceabilityLedger;
	specRoot?: string;
	linearSnapshot?: readonly unknown[];
	requiredLinearIds?: readonly string[];
}): ObsidianTraceabilityInspection {
	const inspected = inspectObsidianVault(options.vaultRoot, { specRoot: options.specRoot, requiredLinearIds: options.requiredLinearIds });
	const errors = inspected.issues
		.filter(problem => problem.code !== "PATH_DRIFT")
		.map(problem => `OBSIDIAN_CONTRACT_INVALID:${problem.code}:${problem.path}`);
	const documents = inspected.documents.filter((document): document is ObsidianVaultDocument & { documentId: string; linearId: string; properties: NonNullable<ObsidianVaultDocument["properties"]> } =>
		Boolean(document.documentId && document.linearId && document.properties));
	const aliases = new Map<string, ObsidianVaultDocument[]>();
	for (const document of documents) for (const alias of wikiAliases(document)) aliases.set(alias, [...(aliases.get(alias) ?? []), document]);
	const scopedRefs = new Set(documents.map(document => `note:${document.documentId}`));
	const normalizedSpecRoot = options.specRoot?.replaceAll("\\", "/").replace(/^\/+|\/+$/gu, "");
	const notes: ObsidianNoteProjection[] = [];
	const expectedEdges = new Set<string>();
	const expectedPropertyEdges = new Set<string>();
	const noteEntities = options.ledger.entities.filter(entity => entity.kind === "note");
	for (const document of documents) {
		const ref = `note:${document.documentId}` as const;
		const entity = noteEntities.find(candidate => candidate.ref === ref && candidate.id === document.documentId);
		let status: ObsidianNoteProjection["status"] = "current";
		if (!entity) {
			errors.push(`OBSIDIAN_NOTE_LEDGER_MISSING:${ref}`);
			status = "unmapped";
		} else if (!entity.source) {
			errors.push(`OBSIDIAN_NOTE_SOURCE_MISSING:${ref}`);
			status = "unmapped";
		} else {
			const renamed = entity.source.path !== document.relativePath;
			const contentChanged = entity.source.digest !== document.digest;
			status = renamed && contentChanged ? "renamed-and-content-changed" : renamed ? "renamed" : contentChanged ? "content-changed" : "current";
		}
		notes.push({ documentId: document.documentId, path: document.relativePath, digest: document.digest, linearId: document.linearId, schemaVersion: 2, status });
		const issueRef = `issue:${document.linearId}`;
		if (!options.ledger.edges.some(edge => edge.from === issueRef && edge.relation === "detailed-by" && edge.to === ref)) errors.push(`OBSIDIAN_LINEAR_EDGE_MISSING:${issueRef}:${ref}`);
		const relationships: Array<{ relation: "parent-of" | "related-to"; link: string; parent: boolean }> = [];
		if (document.properties.parent) relationships.push({ relation: "parent-of", link: document.properties.parent, parent: true });
		for (const link of document.properties.related) relationships.push({ relation: "related-to", link, parent: false });
		for (const relationship of relationships) {
			const target = obsidianWikiTarget(relationship.link);
			const matches = target ? aliases.get(target) ?? [] : [];
			if (matches.length !== 1) continue;
			const targetRef = `note:${matches[0]!.documentId}`;
			const from = relationship.parent ? targetRef : ref;
			const to = relationship.parent ? ref : targetRef;
			expectedEdges.add(`${from}|${relationship.relation}|${to}`);
		}
		const declared: Array<{ kind: "spec" | "unit" | "test-contract" | "exception" | "decision"; ids: readonly string[] }> = [
			{ kind: "spec", ids: document.properties.spec_ids }, { kind: "unit", ids: document.properties.code_ids },
			{ kind: "test-contract", ids: document.properties.test_ids }, { kind: "exception", ids: document.properties.exception_ids },
			{ kind: "decision", ids: document.properties.decision_ids },
		];
		for (const property of declared) for (const id of property.ids) {
			const matches = options.ledger.entities.filter(candidate => candidate.kind === property.kind && candidate.id === id)
				.sort((left, right) => (right.version ?? 0) - (left.version ?? 0));
			if (!matches.length) errors.push(`OBSIDIAN_PROPERTY_ENTITY_MISSING:${ref}:${property.kind}:${id}`);
			else expectedPropertyEdges.add(`${ref}|references|${matches[0]!.ref}`);
		}
	}
	for (const edge of options.ledger.edges.filter(edge => (edge.relation === "parent-of" || edge.relation === "related-to")
		&& (!normalizedSpecRoot || (scopedRefs.has(edge.from) && scopedRefs.has(edge.to))))) {
		const key = `${edge.from}|${edge.relation}|${edge.to}`;
		if (!expectedEdges.delete(key)) errors.push(`OBSIDIAN_RELATION_EDGE_UNDECLARED:${key}`);
	}
	for (const edge of expectedEdges) errors.push(`OBSIDIAN_RELATION_EDGE_MISSING:${edge}`);
	for (const edge of options.ledger.edges.filter(edge => edge.relation === "references" && (!normalizedSpecRoot || scopedRefs.has(edge.from)))) {
		const key = `${edge.from}|${edge.relation}|${edge.to}`;
		if (!expectedPropertyEdges.delete(key)) errors.push(`OBSIDIAN_PROPERTY_EDGE_UNDECLARED:${key}`);
	}
	for (const edge of expectedPropertyEdges) errors.push(`OBSIDIAN_PROPERTY_EDGE_MISSING:${edge}`);
	for (const entity of noteEntities) {
		const belongsToScope = !normalizedSpecRoot || entity.source?.path.replaceAll("\\", "/").startsWith(`${normalizedSpecRoot}/`);
		if (belongsToScope && !documents.some(document => document.documentId === entity.id)) errors.push(`OBSIDIAN_NOTE_DOCUMENT_MISSING:${entity.ref}`);
	}
	if (options.linearSnapshot) {
		const issues = options.linearSnapshot.filter((value): value is { id: string; description?: string } => Boolean(value && typeof value === "object" && typeof (value as { id?: unknown }).id === "string"));
		for (const note of notes) {
			const issue = issues.find(candidate => candidate.id === note.linearId);
			if (!issue) continue;
			const observed = linearObsidianPath(issue.description);
			if (!observed || !sameObsidianPath(observed, note.path)) errors.push(`LINEAR_OBSIDIAN_URI_STALE:${note.linearId}:${note.documentId}`);
		}
		const targetIssues = options.requiredLinearIds?.length
			? new Set(options.requiredLinearIds)
			: normalizedSpecRoot ? new Set(notes.map(note => note.linearId)) : new Set(issues.map(issue => issue.id));
		for (const issue of issues.filter(candidate => targetIssues.has(candidate.id))) {
			const detailEdges = options.ledger.edges.filter(edge => edge.from === `issue:${issue.id}` && edge.relation === "detailed-by");
			if (detailEdges.length !== 1) errors.push(`LINEAR_DETAILED_BY_EXACTLY_ONE_REQUIRED:${issue.id}:${detailEdges.length}`);
			else if (!notes.some(note => `note:${note.documentId}` === detailEdges[0]!.to)) errors.push(`LINEAR_DETAILED_BY_CANONICAL_TARGET_REQUIRED:${issue.id}:${detailEdges[0]!.to}`);
		}
	}
	return { notes: notes.sort((left, right) => left.documentId < right.documentId ? -1 : left.documentId > right.documentId ? 1 : 0), errors: [...new Set(errors)].sort() };
}

/** The receipt's evidence list is authoritative; the graph is its immutable projection. */
export function validateReceiptEvidenceAlignment(ledger: TraceabilityLedger, receipts: ReadonlyMap<string, VerificationReceipt>): string[] {
	const errors: string[] = [];
	const expectedEvidence = new Map<string, { path: string; digest: string }>();
	for (const [receiptRef, receipt] of receipts) {
		const targets = receipt.evidence.map(evidence => `evidence:${evidence.id}`);
		for (const evidence of receipt.evidence) {
			const existing = expectedEvidence.get(evidence.id);
			if (existing && (existing.path !== evidence.path || existing.digest !== evidence.sha256)) {
				errors.push(`RECEIPT_EVIDENCE_CONFLICT:${evidence.id}`);
			} else {
				expectedEvidence.set(evidence.id, { path: evidence.path, digest: evidence.sha256 });
			}
		}
		for (const relation of ["produced", "evidenced-by"] as const) {
			const actual = ledger.edges
				.filter(edge => edge.from === receiptRef && edge.relation === relation)
				.map(edge => edge.to);
			if (!sameValues(actual, targets)) errors.push(`RECEIPT_EVIDENCE_EDGE_MISMATCH:${receiptRef}:${relation}`);
		}
		const revisions = ledger.edges
			.filter(edge => edge.from === receiptRef && edge.relation === "at-revision")
			.map(edge => edge.to);
		if (!sameValues(revisions, [`git-revision:${receipt.sourceRevision}`])) errors.push(`RECEIPT_SOURCE_REVISION_EDGE_MISMATCH:${receiptRef}`);
	}
	const evidenceEntities = ledger.entities.filter(entity => entity.kind === "evidence");
	if (!sameValues(evidenceEntities.map(entity => entity.id), [...expectedEvidence.keys()])) {
		errors.push("RECEIPT_EVIDENCE_ENTITY_SET_MISMATCH");
	}
	for (const entity of evidenceEntities) {
		const expected = expectedEvidence.get(entity.id);
		if (!entity.immutable || !entity.source || !expected || entity.source.path !== expected.path || entity.source.digest !== expected.digest) {
			errors.push(`RECEIPT_EVIDENCE_ENTITY_MISMATCH:${entity.ref}`);
		}
	}
	return errors;
}

/** Validate durable v3 sources before any SQLite projection transaction. */
export async function validateTraceability(options: { projectRoot: string; ledger: TraceabilityLedger; vaultRoot: string; specRoot?: string; linearSnapshot?: readonly unknown[]; requiredLinearIds?: readonly string[] }): Promise<string[]> {
	const { projectRoot, ledger } = options;
	const errors = validateLedger(ledger, digestLedger(ledger));
	const receipts = new Map<string, VerificationReceipt>();
	for (const entity of ledger.entities.filter(entity => ["spec", "test-contract", "exception", "decision"].includes(entity.kind))) {
		const path = entity.source?.path ?? `.www/control-ledger/registry/${registryKind(entity.kind)}/${entity.id}.json`;
		let absolute: string;
		try { absolute = containedFile(projectRoot, path); }
		catch (error) { errors.push(`REGISTRY_SOURCE_INVALID:${entity.ref}:${String(error)}`); continue; }
		if (!existsSync(absolute)) { errors.push(`REGISTRY_SOURCE_MISSING:${entity.ref}`); continue; }
		try {
			const envelope = JSON.parse(readFileSync(absolute, "utf8")) as RegistryEnvelope<unknown>;
			errors.push(...validateRegistryEnvelope(envelope));
			if (envelope.id !== entity.id || envelope.version !== entity.version || envelope.kind !== entity.kind) errors.push(`REGISTRY_ENTITY_MISMATCH:${entity.ref}`);
			if (entity.source && sha256(readFileSync(absolute)) !== entity.source.digest) errors.push(`REGISTRY_SOURCE_DIGEST_MISMATCH:${entity.ref}`);
		} catch (error) { errors.push(`REGISTRY_SOURCE_INVALID:${entity.ref}:${String(error)}`); }
	}
	for (const entity of ledger.entities.filter(entity => entity.kind === "receipt")) {
		const path = entity.source?.path ?? `.www/evidence/${entity.id}/verification-receipt.json`;
		let absolute: string;
		try { absolute = containedFile(projectRoot, path); }
		catch (error) { errors.push(`RECEIPT_SOURCE_INVALID:${entity.ref}:${String(error)}`); continue; }
		if (!existsSync(absolute)) { errors.push(`RECEIPT_SOURCE_MISSING:${entity.ref}`); continue; }
		try {
			const receipt = JSON.parse(readFileSync(absolute, "utf8")) as VerificationReceipt;
			errors.push(...validateVerificationReceipt(receipt));
			if (receipt.id !== entity.id) errors.push(`RECEIPT_ENTITY_MISMATCH:${entity.ref}`);
			if (entity.source && sha256(readFileSync(absolute)) !== entity.source.digest) errors.push(`RECEIPT_SOURCE_DIGEST_MISMATCH:${entity.ref}`);
			receipts.set(entity.ref, receipt);
			for (const evidence of receipt.evidence) {
				try {
					const evidencePath = containedFile(projectRoot, evidence.path);
					if (sha256(readFileSync(evidencePath)) !== evidence.sha256) errors.push(`EVIDENCE_DIGEST_MISMATCH:${evidence.id}`);
				} catch {
					errors.push(`EVIDENCE_DIGEST_MISMATCH:${evidence.id}`);
				}
			}
		} catch (error) { errors.push(`RECEIPT_SOURCE_INVALID:${entity.ref}:${String(error)}`); }
	}
	for (const [receiptRef, receipt] of receipts) {
		const required = requiredCoverageFromRegistries(projectRoot, ledger, receipt);
		if (canonicalDigest([...(receipt.requiredAcceptanceRefs ?? [])].sort()) !== canonicalDigest(required.requiredAcceptances)
			|| canonicalDigest([...(receipt.applicableExceptionStages ?? [])].sort((left, right) => left.exceptionRef.localeCompare(right.exceptionRef)))
				!== canonicalDigest(required.importantStages)) {
			errors.push(`RECEIPT_REQUIRED_COVERAGE_MISMATCH:${receiptRef}`);
		}
	}
	errors.push(...validateReceiptEvidenceAlignment(ledger, receipts));
	const noteInspection = inspectObsidianTraceability({ vaultRoot: options.vaultRoot, ledger, specRoot: options.specRoot, linearSnapshot: options.linearSnapshot, requiredLinearIds: options.requiredLinearIds });
	errors.push(...noteInspection.errors);
	if (options.linearSnapshot) {
		const issues = options.linearSnapshot.filter((value): value is { id: string; description?: string } =>
			Boolean(value && typeof value === "object" && typeof (value as { id?: unknown }).id === "string"));
		for (const entity of ledger.entities.filter((value) => value.kind === "issue")) {
			const issue = issues.find((value) => value.id === entity.id);
			if (!issue) {
				errors.push(`LINEAR_READBACK_MISSING:${entity.id}`);
				continue;
			}
			const expectedUnits = ledger.edges
				.filter((edge) => edge.from === entity.ref && edge.relation === "implemented-by" && edge.to.startsWith("unit:"))
				.map((edge) => edge.to.slice("unit:".length))
				.sort();
			const codeIdLine = issue.description?.match(/^[-*] Code-ID:\s*(.+)$/mu)?.[1] ?? "";
			const observedUnits = [...new Set([...codeIdLine.matchAll(/Code-\d{3}/gu)].map((match) => match[0]!))].sort();
			if (JSON.stringify(expectedUnits) !== JSON.stringify(observedUnits)) errors.push(`LINEAR_CODE_ID_MISMATCH:${entity.id}`);
		}
	}
	return [...new Set(errors)].sort();
}

import { existsSync, readFileSync, realpathSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";
import type { RegistryEnvelope, TraceabilityLedger, VerificationReceipt } from "../../core/domain/development/development-traceability.js";
import { digestLedger } from "./development-traceability-digest.js";
import { canonicalDigest, requiredCoverageFromRegistries, sha256, validateLedger, validateRegistryEnvelope, validateVerificationReceipt } from "./development-traceability-contract.js";

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
export async function validateTraceability(options: { projectRoot: string; ledger: TraceabilityLedger; vaultRoot: string; linearSnapshot?: readonly unknown[] }): Promise<string[]> {
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

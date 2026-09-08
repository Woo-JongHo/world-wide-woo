import { createHash } from "node:crypto";
import { readFileSync, realpathSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";
import { canonicalTraceabilityRef, deriveVerificationVerdict, entityRefs, type EvidenceArtifact, type ExceptionContract, type RegistryEnvelope, type SpecContract, type TestContract, type TraceEntityKind, type TraceabilityLedgerV3, type TraceabilityRef, type TraceabilityRelation, type VerificationReceipt } from "../../../core/domain/development/development-traceability.js";
import type { CompletionReceipt } from "../../../core/runtime/execution-run.js";

const SHA256 = /^[a-f0-9]{64}$/iu;
const VERSIONED = /@v([1-9]\d*)$/u;
const REF = /^([a-z-]+):(.+)$/u;
const safePath = (path: string) => Boolean(path) && !path.startsWith("/") && !path.split(/[\\/]/u).some(part => !part || part === "." || part === "..");
const stable = (value: unknown): string => {
	if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
	if (value && typeof value === "object") return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`).join(",")}}`;
	return JSON.stringify(value);
};
export const sha256 = (value: string | Buffer): string => createHash("sha256").update(value).digest("hex");
export const canonicalDigest = (value: unknown): string => sha256(stable(value));
const digestWithout = (value: Record<string, unknown>, field = "payloadDigest") => { const { [field]: _, ...body } = value; return canonicalDigest(body); };
const duplicate = (values: readonly string[]) => values.filter((value, index) => values.indexOf(value) !== index);

export function requiredCoverageFromRegistries(
	projectRoot: string,
	ledger: TraceabilityLedgerV3,
	scope: {
		readonly acceptanceCoverage: readonly VerificationReceipt["acceptanceCoverage"][number][];
		readonly exceptionCoverage: readonly VerificationReceipt["exceptionCoverage"][number][];
	},
): {
	readonly requiredAcceptances: readonly TraceabilityRef[];
	readonly importantStages: readonly { exceptionRef: TraceabilityRef; stages: readonly ("detect" | "control" | "recovery")[] }[];
} {
	const requiredAcceptances: TraceabilityRef[] = [];
	const importantStages: { exceptionRef: TraceabilityRef; stages: ("detect" | "control" | "recovery")[] }[] = [];
	const acceptanceRefs = new Set(scope.acceptanceCoverage.map((item) => item.acceptanceRef));
	const scopedSpecs = new Set(ledger.edges
		.filter((edge) => edge.relation === "has-acceptance" && acceptanceRefs.has(edge.to))
		.map((edge) => edge.from));
	if (scopedSpecs.size === 0) throw new Error("RECEIPT_SPEC_SCOPE_REQUIRED");
	const scopedExceptions = new Set(ledger.edges
		.filter((edge) => edge.relation === "excepted-by" && scopedSpecs.has(edge.from))
		.map((edge) => edge.to));
	for (const entity of ledger.entities.filter((value) =>
		(value.kind === "spec" && scopedSpecs.has(value.ref))
		|| (value.kind === "exception" && scopedExceptions.has(value.ref)))) {
		const path = entity.source?.path
			?? `.www/control-ledger/registry/${entity.kind === "spec" ? "specs" : "exceptions"}/${entity.id}.json`;
		if (isAbsolute(path) || path.split(/[\\/]/u).some((part) => part === "..")) throw new Error("REGISTRY_SOURCE_PATH_INVALID");
		const canonicalRoot = realpathSync(projectRoot);
		const canonicalPath = realpathSync(resolve(canonicalRoot, path));
		const offset = relative(canonicalRoot, canonicalPath);
		if (isAbsolute(offset) || offset === ".." || offset.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`)) {
			throw new Error("REGISTRY_SOURCE_PATH_ESCAPES_PROJECT");
		}
		const bytes = readFileSync(canonicalPath);
		if (entity.source && sha256(bytes) !== entity.source.digest) throw new Error(`REGISTRY_SOURCE_DIGEST_MISMATCH:${entity.ref}`);
		const envelope = JSON.parse(bytes.toString("utf8")) as RegistryEnvelope<SpecContract & ExceptionContract>;
		const envelopeErrors = validateRegistryEnvelope(envelope);
		if (envelopeErrors.length || envelope.kind !== entity.kind || envelope.id !== entity.id || envelope.version !== entity.version) {
			throw new Error(`REGISTRY_SOURCE_INVALID:${entity.ref}:${envelopeErrors.join(",")}`);
		}
		if (entity.kind === "spec") {
			for (const acceptance of envelope.payload.acceptances ?? []) {
				if (!acceptance.required) continue;
				const id = acceptance.id.includes("/") ? acceptance.id : `${entity.id}/${acceptance.id}`;
				const ref = `acceptance:${id}@v${entity.version}` as const;
				if (!ledger.edges.some((edge) => edge.from === entity.ref && edge.relation === "has-acceptance" && edge.to === ref)) {
					throw new Error(`REQUIRED_ACCEPTANCE_LEDGER_EDGE_MISSING:${entity.ref}:${ref}`);
				}
				requiredAcceptances.push(ref);
			}
		} else if (envelope.payload.importance === "important") {
			importantStages.push({ exceptionRef: entity.ref, stages: ["detect", "control", "recovery"] });
		}
	}
	return {
		requiredAcceptances: requiredAcceptances.sort(),
		importantStages: importantStages.sort((left, right) => left.exceptionRef.localeCompare(right.exceptionRef)),
	};
}

export interface VerificationReceiptCompletionContext {
	readonly receiptId: string;
	readonly observedSourceRevision: string;
	readonly execution: { readonly environment: string };
	readonly evidenceArtifacts: readonly EvidenceArtifact[];
	readonly acceptanceCoverage: readonly VerificationReceipt["acceptanceCoverage"][number][];
	readonly requiredAcceptanceRefs: readonly NonNullable<VerificationReceipt["requiredAcceptanceRefs"]>[number][];
	readonly exceptionStageCoverage: readonly VerificationReceipt["exceptionCoverage"][number][];
	readonly applicableExceptionStages: readonly NonNullable<VerificationReceipt["applicableExceptionStages"]>[number][];
	readonly limitations: readonly string[];
}

export function validateRegistryEnvelope(envelope: RegistryEnvelope<unknown>): string[] {
	const errors: string[] = [];
	if (envelope.schemaVersion !== 3 || !envelope.immutable) errors.push("REGISTRY_ENVELOPE_INVALID");
	if (!envelope.id || !Number.isSafeInteger(envelope.version) || envelope.version < 1) errors.push("REGISTRY_ID_OR_VERSION_INVALID");
	if (envelope.supersedes && (envelope.supersedes.id !== envelope.id || envelope.supersedes.version >= envelope.version)) errors.push("INVALID_SUPERSEDES");
	if (envelope.payloadDigest !== digestWithout(envelope as unknown as Record<string, unknown>)) errors.push("REGISTRY_DIGEST_MISMATCH");
	const payload = envelope.payload as Partial<SpecContract & TestContract & ExceptionContract>;
	if (envelope.kind === "spec") for (const acceptance of (payload.acceptances ?? [])) if (!acceptance.id || !acceptance.purpose || !acceptance.risk || !acceptance.pass) errors.push("ACCEPTANCE_PURPOSE_RISK_PASS_REQUIRED");
	if (envelope.kind === "test-contract" && (!payload.purpose || !payload.risk || !payload.pass || !payload.acceptanceIds?.length)) errors.push("TEST_PURPOSE_RISK_PASS_REQUIRED");
	if (envelope.kind === "exception" && payload.importance === "important" && (!payload.detect || !payload.control || !payload.recovery || !payload.testIds?.length)) errors.push("IMPORTANT_EXCEPTION_HAS_NO_TEST");
	return errors;
}

export function validateVerificationReceipt(receipt: VerificationReceipt, expectedSourceRevision?: string): string[] {
	const errors: string[] = [];
	if (receipt.schemaVersion !== 3 || !receipt.immutable || !/^VR-[A-Za-z0-9-]+$/u.test(receipt.id)) errors.push("RECEIPT_INVALID");
	if (!receipt.sourceRevision || (expectedSourceRevision && receipt.sourceRevision !== expectedSourceRevision)) errors.push("RECEIPT_SOURCE_REVISION_MISMATCH");
	if (receipt.payloadDigest !== digestWithout(receipt as unknown as Record<string, unknown>)) errors.push("RECEIPT_DIGEST_MISMATCH");
	for (const evidence of receipt.evidence) if (!/^EV-[A-Za-z0-9-]+$/u.test(evidence.id) || !safePath(evidence.path) || !SHA256.test(evidence.sha256) || !evidence.immutable) errors.push("EVIDENCE_DIGEST_MISMATCH");
	if (receipt.execution && !receipt.execution.environment) errors.push("RECEIPT_EXECUTION_ENVIRONMENT_REQUIRED");
	if (receipt.limitations && !receipt.limitations.length) errors.push("RECEIPT_LIMITATIONS_REQUIRED");
	if (receipt.completion && (!receipt.completion.runId || !SHA256.test(receipt.completion.checkpointDigest) || !receipt.completion.evidenceRefs.every(ref => receipt.evidence.some(evidence => evidence.id === ref)))) errors.push("COMPLETION_RECEIPT_MAPPING_INVALID");
	if (receipt.verdict !== deriveVerificationVerdict(receipt)) errors.push("RECEIPT_VERDICT_MISMATCH");
	return errors;
}

export function verificationReceiptFromCompletion(completion: CompletionReceipt, context: VerificationReceiptCompletionContext): VerificationReceipt {
	if (!/^VR-[A-Za-z0-9-]+$/u.test(context.receiptId)) throw new Error("VERIFICATION_RECEIPT_ID_INVALID");
	if (!completion.runId || !SHA256.test(completion.checkpointDigest) || !context.observedSourceRevision || !context.execution?.environment || !Array.isArray(context.evidenceArtifacts) || !context.evidenceArtifacts.length || !Array.isArray(context.acceptanceCoverage) || !Array.isArray(context.requiredAcceptanceRefs) || !Array.isArray(context.exceptionStageCoverage) || !Array.isArray(context.applicableExceptionStages) || !Array.isArray(context.limitations) || !context.limitations.length) throw new Error("COMPLETION_CONTEXT_REVISION_EVIDENCE_EXECUTION_COVERAGE_LIMITATIONS_REQUIRED");
	if (!context.evidenceArtifacts.every(evidence => /^EV-[A-Za-z0-9-]+$/u.test(evidence.id) && safePath(evidence.path) && SHA256.test(evidence.sha256) && evidence.immutable)) throw new Error("COMPLETION_CONTEXT_EVIDENCE_INVALID");
	const receipt: VerificationReceipt = {
		schemaVersion: 3, id: context.receiptId, immutable: true, sourceRevision: context.observedSourceRevision,
		acceptanceCoverage: [...context.acceptanceCoverage], exceptionCoverage: [...context.exceptionStageCoverage],
		requiredAcceptanceRefs: [...context.requiredAcceptanceRefs],
		applicableExceptionStages: context.applicableExceptionStages.map(item => ({ exceptionRef: item.exceptionRef, stages: [...item.stages] })),
		evidence: [...context.evidenceArtifacts], execution: { environment: context.execution.environment }, limitations: [...context.limitations],
		completion: { runId: completion.runId, checkpointDigest: completion.checkpointDigest, status: completion.status, evidenceRefs: context.evidenceArtifacts.map(evidence => evidence.id) },
		verdict: deriveVerificationVerdict({ acceptanceCoverage: [...context.acceptanceCoverage], exceptionCoverage: [...context.exceptionStageCoverage], requiredAcceptanceRefs: [...context.requiredAcceptanceRefs], applicableExceptionStages: context.applicableExceptionStages.map(item => ({ exceptionRef: item.exceptionRef, stages: [...item.stages] })) }), payloadDigest: "",
	};
	if (validateVerificationReceipt(receipt).filter(error => error !== "RECEIPT_DIGEST_MISMATCH").length) throw new Error("COMPLETION_CONTEXT_VERIFICATION_INVALID");
	receipt.payloadDigest = digestWithout(receipt as unknown as Record<string, unknown>);
	return Object.freeze({
		...receipt,
		acceptanceCoverage: Object.freeze(receipt.acceptanceCoverage.map(item => Object.freeze({ ...item }))),
		exceptionCoverage: Object.freeze(receipt.exceptionCoverage.map(item => Object.freeze({ ...item }))),
		requiredAcceptanceRefs: Object.freeze([...receipt.requiredAcceptanceRefs!]),
		applicableExceptionStages: Object.freeze(receipt.applicableExceptionStages!.map(item => Object.freeze({ exceptionRef: item.exceptionRef, stages: Object.freeze([...item.stages]) }))),
		evidence: Object.freeze(receipt.evidence.map(item => Object.freeze({ ...item }))),
		execution: Object.freeze({ ...receipt.execution! }),
		limitations: Object.freeze([...receipt.limitations!]),
		completion: Object.freeze({ ...receipt.completion!, evidenceRefs: Object.freeze([...receipt.completion!.evidenceRefs]) }),
	}) as VerificationReceipt;
}

const allowed: Record<TraceabilityRelation, readonly [TraceEntityKind, TraceEntityKind][]> = {
	"has-acceptance": [["spec", "acceptance"]], tracks: [["spec", "issue"]], "implemented-by": [["issue", "unit"], ["spec", "unit"]], "verified-by": [["acceptance", "test-contract"], ["exception", "test-contract"]], executes: [["receipt", "test-contract"]], covers: [["receipt", "acceptance"], ["receipt", "exception"], ["legacy", "issue"], ["legacy", "unit"]], "excepted-by": [["spec", "exception"]], "decided-by": [["spec", "decision"]], produced: [["receipt", "evidence"]], "evidenced-by": [["receipt", "evidence"]], "at-revision": [["receipt", "git-revision"]], supersedes: [["spec", "spec"], ["test-contract", "test-contract"], ["exception", "exception"], ["decision", "decision"]], "recorded-in": [["receipt", "note"], ["legacy", "note"]], "detailed-by": [["issue", "note"]], "code-evidenced-by": [["issue", "pr"]], "parent-of": [["note", "note"]], "related-to": [["note", "note"]], references: [["note", "spec"], ["note", "unit"], ["note", "test-contract"], ["note", "exception"], ["note", "decision"]]
};

function omitDigest<T extends { payloadDigest: string }>(value: T): Omit<T, "payloadDigest"> { const { payloadDigest: _, ...body } = value; return body; }
export function validateTraceabilityLedgerV3(ledger: TraceabilityLedgerV3, computedPayloadDigest = canonicalDigest(omitDigest(ledger))): string[] {
	const errors: string[] = [];
	if (ledger.schemaVersion !== 3) errors.push("LEDGER_SCHEMA_VERSION_INVALID");
	if (!ledger.projectId) errors.push("PROJECT_ID_REQUIRED");
	if (ledger.payloadDigest !== computedPayloadDigest) errors.push("LEDGER_DIGEST_MISMATCH");
	for (const value of duplicate(ledger.entities.map(entity => canonicalTraceabilityRef(entity.ref)))) errors.push(`ID_REUSED:${value}`);
	for (const entity of ledger.entities) {
		const match = REF.exec(entity.ref); if (!match || match[1] !== entity.kind || !entity.id || entity.ref !== `${entity.kind}:${entity.id}${entity.version ? `@v${entity.version}` : ""}`) errors.push(`ENTITY_REF_INVALID:${entity.ref}`);
		if (entity.version !== undefined && (!Number.isSafeInteger(entity.version) || entity.version < 1 || !VERSIONED.test(entity.ref))) errors.push(`ENTITY_VERSION_INVALID:${entity.ref}`);
		if (entity.immutable && (!entity.source || !safePath(entity.source.path) || !SHA256.test(entity.source.digest))) errors.push(`IMMUTABLE_SOURCE_INVALID:${entity.ref}`);
	}
	for (const value of duplicate(ledger.edges.map(edge => `${edge.from}|${edge.relation}|${edge.to}`))) errors.push(`DUPLICATE_EDGE:${value}`);
	const refs = entityRefs(ledger); const byRef = new Map(ledger.entities.map(entity => [entity.ref, entity]));
	for (const edge of ledger.edges) {
		const from = byRef.get(edge.from); const to = byRef.get(edge.to);
		if (!refs.has(edge.from) || !refs.has(edge.to)) { errors.push(`DANGLING_EDGE:${edge.from}:${edge.to}`); continue; }
		if (!allowed[edge.relation].some(([a, b]) => from!.kind === a && to!.kind === b)) errors.push(`INVALID_EDGE_DIRECTION:${edge.from}:${edge.relation}:${edge.to}`);
	}
	for (const acceptance of ledger.entities.filter(entity => entity.kind === "acceptance")) if (!ledger.edges.some(edge => edge.from === acceptance.ref && edge.relation === "verified-by")) errors.push(`ACCEPTANCE_UNVERIFIED:${acceptance.ref}`);
	for (const acceptance of ledger.entities.filter(entity => entity.kind === "acceptance")) if (!ledger.edges.some(edge => edge.relation === "covers" && edge.to === acceptance.ref && byRef.get(edge.from)?.kind === "receipt")) errors.push(`ACCEPTANCE_RECEIPT_MISSING:${acceptance.ref}`);
	return errors;
}
export function validateLedger(ledger: TraceabilityLedgerV3, computedPayloadDigest = canonicalDigest(omitDigest(ledger))): string[] { return validateTraceabilityLedgerV3(ledger, computedPayloadDigest); }

export function migrateTraceabilityV2ToV3(input: any): TraceabilityLedgerV3 {
	if (input?.schemaVersion !== 2) throw new Error("V2_MIGRATION_INPUT_INVALID");
	const entities = [
		...(input.units ?? []).map((value: any) => ({ ref: `unit:${value.key}`, kind: "unit" as const, id: value.key })),
		...(input.issues ?? []).map((value: any) => ({ ref: `issue:${value.id}`, kind: "issue" as const, id: value.id })),
		...(input.notes ?? []).map((value: any) => ({ ref: `note:${value.id}`, kind: "note" as const, id: value.id })),
		...(input.pullRequests ?? []).map((value: any) => ({ ref: `pr:${value.id}`, kind: "pr" as const, id: value.id })),
		...(input.runs ?? []).map((value: any) => ({ ref: `legacy:${value.id}`, kind: "legacy" as const, id: value.id })),
	];
	const ref = (value: string) => value.replace(/^run:/u, "legacy:").replace(/^code:/u, "unit:").replace(/^pull-request:/u, "pr:");
	const relation: Record<string, TraceabilityRelation> = { "implemented-by": "implemented-by", "detailed-by": "detailed-by", "code-evidenced-by": "code-evidenced-by", "recorded-in": "recorded-in", verifies: "covers" };
	const aliases = [...new Set<string>((input.edges ?? []).flatMap((edge: any) => [edge.from, edge.to]).filter((value: string) => /^(code|pull-request):/u.test(value)))];
	const ledger: TraceabilityLedgerV3 = { schemaVersion: 3, projectId: input.projectId, entities, edges: (input.edges ?? []).map((edge: any) => ({ from: ref(edge.from), relation: relation[edge.relation] ?? "recorded-in", to: ref(edge.to) })), tombstones: [...(input.tombstones ?? []), ...aliases], migrations: [...(input.migrations ?? []), ...aliases.map(from => ({ from, to: ref(from), reason: "canonical v3 vocabulary migration; historical alias tombstoned" }))], payloadDigest: "" };
	ledger.payloadDigest = canonicalDigest(omitDigest(ledger));
	return ledger;
}

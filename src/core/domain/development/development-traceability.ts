/** Opaque identities are never inferred from filenames, symbols, or Linear titles. */
export type TraceEntityKind = "spec" | "acceptance" | "test-contract" | "test-code" | "exception" | "decision" | "receipt" | "evidence" | "git-revision" | "issue" | "unit" | "pr" | "note" | "legacy";
export type TraceabilityRef = `${TraceEntityKind}:${string}`;
export type TraceRef = TraceabilityRef;
export type TraceabilityRelation = "has-acceptance" | "tracks" | "implemented-by" | "verified-by" | "executes" | "covers" | "excepted-by" | "decided-by" | "produced" | "evidenced-by" | "at-revision" | "supersedes" | "recorded-in" | "detailed-by" | "code-evidenced-by" | "parent-of" | "related-to" | "references";

export interface TraceabilityEntity {
	ref: TraceabilityRef;
	kind: TraceEntityKind;
	id: string;
	version?: number;
	immutable?: boolean;
	source?: { path: string; digest: string };
}
export interface TraceabilityEdge { from: TraceabilityRef; relation: TraceabilityRelation; to: TraceabilityRef }
export interface TraceabilityLedgerV3 {
	schemaVersion: 3;
	projectId: string;
	entities: TraceabilityEntity[];
	edges: TraceabilityEdge[];
	tombstones: string[];
	migrations: readonly { from: string; to: string; reason: string }[];
	payloadDigest: string;
}
export type TraceabilityLedger = TraceabilityLedgerV3;

export interface RegistryEnvelope<T> {
	schemaVersion: 3;
	kind: "spec" | "test-contract" | "exception" | "decision";
	id: string;
	version: number;
	supersedes?: { id: string; version: number };
	immutable: true;
	payload: T;
	payloadDigest: string;
}
export interface AcceptanceContract { id: string; purpose: string; risk: string; pass: string; required: boolean }
export interface SpecContract { acceptances: AcceptanceContract[] }
export interface TestContract { purpose: string; risk: string; pass: string; acceptanceIds: string[] }
export interface ExceptionContract { importance: "important" | "normal"; detect?: string; control?: string; recovery?: string; testIds: string[] }
export interface DecisionContract { decision: string }
export interface EvidenceArtifact { id: string; path: string; sha256: string; immutable: true }
export interface VerificationReceipt {
	schemaVersion: 3;
	id: string;
	immutable: true;
	sourceRevision: string;
	acceptanceCoverage: { acceptanceRef: TraceabilityRef; testRef: TraceabilityRef; status: "pass" | "fail" | "blocked" | "unknown" }[];
	exceptionCoverage: { exceptionRef: TraceabilityRef; stage: "detect" | "control" | "recovery"; testRef?: TraceabilityRef; status: "pass" | "fail" | "blocked" | "unknown" }[];
	requiredAcceptanceRefs?: TraceabilityRef[];
	applicableExceptionStages?: { exceptionRef: TraceabilityRef; stages: ("detect" | "control" | "recovery")[] }[];
	evidence: EvidenceArtifact[];
	execution?: { environment: string };
	limitations?: string[];
	completion?: { runId: string; checkpointDigest: string; status: "completed" | "cancelled" | "interrupted" | "failed"; evidenceRefs: string[] };
	verdict: "pass" | "fail" | "partial" | "blocked";
	payloadDigest: string;
}

export function entityRefs(ledger: TraceabilityLedgerV3): Set<string> { return new Set(ledger.entities.map(entity => entity.ref)); }
export function canonicalTraceabilityKind(kind: TraceEntityKind): TraceEntityKind {
	return kind;
}
export function canonicalTraceabilityRef(ref: TraceabilityRef): string {
	const separator = ref.indexOf(":");
	return `${canonicalTraceabilityKind(ref.slice(0, separator) as TraceEntityKind)}:${ref.slice(separator + 1)}`;
}
export function deriveVerificationVerdict(receipt: Pick<VerificationReceipt, "acceptanceCoverage" | "exceptionCoverage" | "requiredAcceptanceRefs" | "applicableExceptionStages">): VerificationReceipt["verdict"] {
	const acceptanceRefs = new Set(receipt.acceptanceCoverage.map(item => item.acceptanceRef));
	const requiredAcceptances = receipt.requiredAcceptanceRefs ?? [...acceptanceRefs];
	const exceptionStages = new Set(receipt.exceptionCoverage.map(item => `${item.exceptionRef}|${item.stage}`));
	const requiredExceptionStages = receipt.applicableExceptionStages
		?? [...new Set(receipt.exceptionCoverage.map(item => item.exceptionRef))].map(exceptionRef => ({ exceptionRef, stages: ["detect", "control", "recovery"] as const }));
	const coverage = [...receipt.acceptanceCoverage, ...receipt.exceptionCoverage];
	if (!coverage.length || !requiredAcceptances.length || requiredAcceptances.some(ref => !acceptanceRefs.has(ref)) || requiredExceptionStages.some(({ exceptionRef, stages }) => stages.some(stage => !exceptionStages.has(`${exceptionRef}|${stage}`)))) return "partial";
	if (coverage.some(item => item.status === "fail")) return "fail";
	if (coverage.some(item => item.status === "blocked")) return "blocked";
	return coverage.some(item => item.status === "unknown") ? "partial" : "pass";
}

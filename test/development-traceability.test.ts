import { describe, expect, test } from "bun:test";
import {
	deriveVerificationVerdict,
	type RegistryEnvelope,
	type TraceabilityLedgerV3,
	type VerificationReceipt,
} from "../src/core/domain/development-traceability";
import type { CompletionReceipt } from "../src/core/runtime/execution-run";
import {
	canonicalDigest,
	migrateTraceabilityV2ToV3,
	verificationReceiptFromCompletion,
	validateRegistryEnvelope,
	validateTraceabilityLedgerV3,
	validateVerificationReceipt,
	type VerificationReceiptCompletionContext,
} from "../src/adapters/outbound/development-traceability-contract";

const digest = <T extends object>(value: T): string => {
	const { payloadDigest: _, ...body } = value as unknown as Record<string, unknown>;
	return canonicalDigest(body);
};
function ledger(): TraceabilityLedgerV3 {
	const result: TraceabilityLedgerV3 = {
		schemaVersion: 3, projectId: "project", tombstones: [], migrations: [], payloadDigest: "",
		entities: [
			{ ref: "spec:CHAT-001@v1", kind: "spec", id: "CHAT-001", version: 1 },
			{ ref: "acceptance:CHAT-001/A-01@v1", kind: "acceptance", id: "CHAT-001/A-01", version: 1 },
			{ ref: "test-contract:TEST-031@v1", kind: "test-contract", id: "TEST-031", version: 1 },
			{ ref: "exception:EXC-014@v1", kind: "exception", id: "EXC-014", version: 1 },
			{ ref: "test-contract:TEST-032@v1", kind: "test-contract", id: "TEST-032", version: 1 },
			{ ref: "receipt:VR-001", kind: "receipt", id: "VR-001", immutable: true, source: { path: ".www/evidence/receipt.json", digest: "a".repeat(64) } },
			{ ref: "evidence:EV-001", kind: "evidence", id: "EV-001", immutable: true, source: { path: ".www/evidence/receipt.json", digest: "a".repeat(64) } },
			{ ref: "git-revision:git:abc", kind: "git-revision", id: "git:abc" },
		],
		edges: [
			{ from: "spec:CHAT-001@v1", relation: "has-acceptance", to: "acceptance:CHAT-001/A-01@v1" },
			{ from: "acceptance:CHAT-001/A-01@v1", relation: "verified-by", to: "test-contract:TEST-031@v1" },
			{ from: "spec:CHAT-001@v1", relation: "excepted-by", to: "exception:EXC-014@v1" },
			{ from: "exception:EXC-014@v1", relation: "verified-by", to: "test-contract:TEST-032@v1" },
			{ from: "receipt:VR-001", relation: "executes", to: "test-contract:TEST-031@v1" },
			{ from: "receipt:VR-001", relation: "covers", to: "acceptance:CHAT-001/A-01@v1" },
			{ from: "receipt:VR-001", relation: "evidenced-by", to: "evidence:EV-001" },
			{ from: "receipt:VR-001", relation: "at-revision", to: "git-revision:git:abc" },
		],
	}; result.payloadDigest = digest(result); return result;
}
function receipt(): VerificationReceipt {
	const value: VerificationReceipt = {
		schemaVersion: 3, id: "VR-001", immutable: true, sourceRevision: "git:abc", verdict: "pass", payloadDigest: "",
		acceptanceCoverage: [{ acceptanceRef: "acceptance:CHAT-001/A-01@v1", testRef: "test-contract:TEST-031@v1", status: "pass" }],
		exceptionCoverage: ["detect", "control", "recovery"].map(stage => ({ exceptionRef: "exception:EXC-014@v1", stage: stage as "detect" | "control" | "recovery", testRef: "test-contract:TEST-032@v1", status: "pass" })),
		evidence: [{ id: "EV-001", path: ".www/evidence/receipt.json", sha256: "a".repeat(64), immutable: true }],
		completion: { runId: "run", checkpointDigest: "b".repeat(64), status: "completed", evidenceRefs: ["EV-001"] },
	}; value.payloadDigest = digest(value); return value;
}

describe("traceability v3 contracts", () => {
	test("accepts a complete typed chain and derives verdict from coverage, not terminal completion", () => {
		expect(validateTraceabilityLedgerV3(ledger())).toEqual([]);
		expect(validateVerificationReceipt(receipt(), "git:abc")).toEqual([]);
		const completedButFailed = receipt(); completedButFailed.acceptanceCoverage = [{ ...completedButFailed.acceptanceCoverage[0]!, status: "fail" }]; completedButFailed.verdict = "fail"; completedButFailed.payloadDigest = digest(completedButFailed);
		expect(deriveVerificationVerdict(completedButFailed)).toBe("fail");
	});
	test("never derives pass from empty required coverage", () => {
		expect(deriveVerificationVerdict({ acceptanceCoverage: [], exceptionCoverage: [] })).toBe("partial");
	});
	test("adapts a real reducer completion receipt only with explicit evidence-bound verification context", () => {
		const completion: CompletionReceipt = {
			receiptId: "runtime-receipt", receiptDigest: "c".repeat(64), runId: "run", threadId: "thread", turnId: "turn", status: "completed", objective: "objective",
			checkpointDigest: "b".repeat(64), changed: [], verification: [], evidenceRefs: [{ activityId: "activity", sequence: 1, sourceDigest: "sha256:runtime", kind: "verification", status: "passed", summary: "observed" }],
			remaining: [], completedAt: "2026-09-08T00:00:00.000Z", terminalSource: { id: "activity", sequence: 1, sourceDigest: "sha256:runtime" },
		};
		const context: VerificationReceiptCompletionContext = {
			receiptId: "VR-002", observedSourceRevision: "git:abc", execution: { environment: "test" },
			evidenceArtifacts: [{ id: "EV-001", path: ".www/evidence/run.json", sha256: "a".repeat(64), immutable: true }] as const,
			acceptanceCoverage: receipt().acceptanceCoverage, requiredAcceptanceRefs: ["acceptance:CHAT-001/A-01@v1"],
			exceptionStageCoverage: receipt().exceptionCoverage, applicableExceptionStages: [{ exceptionRef: "exception:EXC-014@v1", stages: ["detect", "control", "recovery"] }],
			limitations: ["No live environment."],
		};
		const adapted = verificationReceiptFromCompletion(completion, context);
		expect(validateVerificationReceipt(adapted, "git:abc")).toEqual([]);
		expect(Object.isFrozen(adapted)).toBe(true);
		expect(() => verificationReceiptFromCompletion(completion, { ...context, evidenceArtifacts: [] })).toThrow("COMPLETION_CONTEXT_REVISION_EVIDENCE_EXECUTION_COVERAGE_LIMITATIONS_REQUIRED");
		expect(() => verificationReceiptFromCompletion(completion, { ...context, observedSourceRevision: "" })).toThrow("COMPLETION_CONTEXT_REVISION_EVIDENCE_EXECUTION_COVERAGE_LIMITATIONS_REQUIRED");
		expect(() => verificationReceiptFromCompletion(completion, { ...context, execution: { environment: "" } })).toThrow("COMPLETION_CONTEXT_REVISION_EVIDENCE_EXECUTION_COVERAGE_LIMITATIONS_REQUIRED");
	});
	test("preserves distinct exception test mappings by stage", () => {
		const value = receipt();
		value.exceptionCoverage = [
			{ exceptionRef: "exception:EXC-014@v1", stage: "detect", testRef: "test-contract:TEST-031@v1", status: "pass" },
			{ exceptionRef: "exception:EXC-014@v1", stage: "control", testRef: "test-contract:TEST-032@v1", status: "blocked" },
			{ exceptionRef: "exception:EXC-014@v1", stage: "recovery", testRef: "test-contract:TEST-032@v1", status: "unknown" },
		];
		value.verdict = "blocked"; value.payloadDigest = digest(value);
		expect(validateVerificationReceipt(value)).toEqual([]);
	});
	test("rejects duplicate, dangling, stale, and unverified identities", () => {
		const duplicate = ledger(); duplicate.entities.push({ ...duplicate.entities[0]! }); duplicate.payloadDigest = digest(duplicate);
		expect(validateTraceabilityLedgerV3(duplicate).join(" ")).toContain("ID_REUSED");
		const dangling = ledger(); dangling.edges.push({ from: "spec:CHAT-001@v1", relation: "tracks", to: "issue:WOO-686" }); dangling.payloadDigest = digest(dangling);
		expect(validateTraceabilityLedgerV3(dangling).join(" ")).toContain("DANGLING_EDGE");
		const stale = ledger(); stale.entities[0] = { ...stale.entities[0]!, version: 2 }; stale.payloadDigest = digest(stale);
		expect(validateTraceabilityLedgerV3(stale).join(" ")).toContain("ENTITY_REF_INVALID");
		const missing = ledger(); missing.edges = missing.edges.filter(edge => edge.relation !== "verified-by"); missing.payloadDigest = digest(missing);
		expect(validateTraceabilityLedgerV3(missing).join(" ")).toContain("ACCEPTANCE_UNVERIFIED");
	});
	test("requires purpose, risk, pass, and complete important exception recovery tests", () => {
		const envelope: RegistryEnvelope<unknown> = { schemaVersion: 3, kind: "test-contract", id: "TEST-031", version: 1, immutable: true, payload: { purpose: "", risk: "r", pass: "p", acceptanceIds: [] }, payloadDigest: "" }; envelope.payloadDigest = digest(envelope);
		expect(validateRegistryEnvelope(envelope)).toContain("TEST_PURPOSE_RISK_PASS_REQUIRED");
		const exception: RegistryEnvelope<unknown> = { schemaVersion: 3, kind: "exception", id: "EXC-014", version: 1, immutable: true, payload: { importance: "important", detect: "d", control: "c", testIds: ["TEST-032"] }, payloadDigest: "" }; exception.payloadDigest = digest(exception);
		expect(validateRegistryEnvelope(exception)).toContain("IMPORTANT_EXCEPTION_HAS_NO_TEST");
	});
	test("rejects receipt/evidence digest and source revision mismatches", () => {
		const badEvidence = receipt(); badEvidence.evidence[0] = { ...badEvidence.evidence[0]!, sha256: "nope" }; badEvidence.payloadDigest = digest(badEvidence);
		expect(validateVerificationReceipt(badEvidence, "git:abc")).toContain("EVIDENCE_DIGEST_MISMATCH");
		const stale = receipt(); expect(validateVerificationReceipt(stale, "git:def")).toContain("RECEIPT_SOURCE_REVISION_MISMATCH");
		stale.payloadDigest = "0".repeat(64); expect(validateVerificationReceipt(stale)).toContain("RECEIPT_DIGEST_MISMATCH");
	});
	test("migrates v2 deterministically without reusing its runtime format", () => {
		const v2 = { schemaVersion: 2, projectId: "project", units: [{ key: "Code-001" }], issues: [{ id: "WOO-686" }], notes: [], pullRequests: [], runs: [], edges: [{ from: "issue:WOO-686", relation: "implemented-by", to: "unit:Code-001" }], tombstones: [], migrations: [] };
		const migrated = migrateTraceabilityV2ToV3(v2);
		expect(migrated).toEqual(migrateTraceabilityV2ToV3(structuredClone(v2)));
		expect(migrated.entities).toContainEqual({ ref: "unit:Code-001", kind: "unit", id: "Code-001" });
	});
});

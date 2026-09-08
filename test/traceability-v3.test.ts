import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import type { TraceabilityLedgerV3 } from "../src/core/domain/development-traceability.js";
import type { ProjectActivity } from "../src/core/domain/project-activity.js";
import { createExecutionRun, normalizeProjectActivity, replayExecutionRun } from "../src/core/runtime/execution-run.js";
import { DevelopmentStore } from "../src/adapters/outbound/development-store.js";
import { canonicalDigest, requiredCoverageFromRegistries, sha256 } from "../src/adapters/outbound/development-traceability-contract.js";
import { validateTraceability } from "../src/adapters/outbound/traceability-validator.js";
import { runTraceability, selectedCompletionReceipt } from "../scripts/traceability.js";

const roots: string[] = [];
afterEach(() => {
	for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("receipt-scoped registry authority", () => {
	function scopedFixture() {
		const root = dataRoot();
		const directory = join(root, ".www/control-ledger/registry/specs");
		mkdirSync(directory, { recursive: true });
		const entities: TraceabilityLedgerV3["entities"] = [];
		const edges: TraceabilityLedgerV3["edges"] = [];
		for (const id of ["ONE", "TWO"]) {
			const envelope = {
				schemaVersion: 3 as const,
				kind: "spec" as const,
				id,
				version: 1,
				immutable: true as const,
				payload: { acceptances: [{ id: "A-01", purpose: id, risk: "scope leak", pass: "isolated", required: true }] },
				payloadDigest: "",
			};
			const { payloadDigest: _, ...body } = envelope;
			envelope.payloadDigest = canonicalDigest(body);
			const path = `.www/control-ledger/registry/specs/${id}.json`;
			const content = JSON.stringify(envelope);
			writeFileSync(join(root, path), content);
			entities.push({ ref: `spec:${id}@v1`, kind: "spec", id, version: 1, source: { path, digest: sha256(content) } });
			entities.push({ ref: `acceptance:${id}/A-01@v1`, kind: "acceptance", id: `${id}/A-01`, version: 1 });
			edges.push({ from: `spec:${id}@v1`, relation: "has-acceptance", to: `acceptance:${id}/A-01@v1` });
		}
		const ledger: TraceabilityLedgerV3 = {
			schemaVersion: 3,
			projectId: "00000000-0000-4000-8000-000000000002",
			entities,
			edges,
			tombstones: [],
			migrations: [],
			payloadDigest: "",
		};
		return { root, ledger };
	}

	test("does not make an unrelated spec retroactively required", () => {
		const { root, ledger } = scopedFixture();
		const required = requiredCoverageFromRegistries(root, ledger, {
			acceptanceCoverage: [{ acceptanceRef: "acceptance:ONE/A-01@v1", testRef: "test-contract:ONE@v1", status: "pass" }],
			exceptionCoverage: [],
		});
		expect(required.requiredAcceptances).toEqual(["acceptance:ONE/A-01@v1"]);
	});

	test("rejects traversal, symlink escape, digest tamper, and envelope identity mismatch", () => {
		const { root, ledger } = scopedFixture();
		const scope = {
			acceptanceCoverage: [{ acceptanceRef: "acceptance:ONE/A-01@v1" as const, testRef: "test-contract:ONE@v1" as const, status: "pass" as const }],
			exceptionCoverage: [],
		};
		const source = ledger.entities.find((entity) => entity.ref === "spec:ONE@v1")!.source!;
		source.path = "../outside.json";
		expect(() => requiredCoverageFromRegistries(root, ledger, scope)).toThrow("REGISTRY_SOURCE_PATH_INVALID");

		source.path = ".www/control-ledger/registry/specs/ONE.json";
		source.digest = "0".repeat(64);
		expect(() => requiredCoverageFromRegistries(root, ledger, scope)).toThrow("REGISTRY_SOURCE_DIGEST_MISMATCH");

		const outside = join(dataRoot(), "outside.json");
		writeFileSync(outside, "{}");
		const link = join(root, ".www/control-ledger/registry/specs/escape.json");
		symlinkSync(outside, link);
		source.path = ".www/control-ledger/registry/specs/escape.json";
		source.digest = sha256("{}");
		expect(() => requiredCoverageFromRegistries(root, ledger, scope)).toThrow("REGISTRY_SOURCE_PATH_ESCAPES_PROJECT");

		const validPath = join(root, ".www/control-ledger/registry/specs/ONE.json");
		const invalid = JSON.parse(readFileSync(validPath, "utf8"));
		invalid.id = "OTHER";
		const { payloadDigest: _, ...body } = invalid;
		invalid.payloadDigest = canonicalDigest(body);
		writeFileSync(validPath, JSON.stringify(invalid));
		source.path = ".www/control-ledger/registry/specs/ONE.json";
		source.digest = sha256(readFileSync(validPath));
		expect(() => requiredCoverageFromRegistries(root, ledger, scope)).toThrow("REGISTRY_SOURCE_INVALID");
	});
});

function dataRoot(): string {
	const root = mkdtempSync(join(tmpdir(), "www-traceability-v3-"));
	roots.push(root);
	return root;
}

const runtimeActivity = (sequence: number, id: string, threadId: string, turnId: string, payload: Record<string, unknown>, phase: ProjectActivity["phase"] = "updated"): ProjectActivity => ({
	schemaVersion: 1, id, projectId: "project-thread-stream", sequence, recordedAt: `2026-09-08T00:00:0${sequence}.000Z`,
	kind: "progress", phase, provider: "codex", nativeRefs: { threadId, turnId }, sourceDigest: `sha256:${sha256(`source:${id}`)}`, payload,
});
const runtimeJournal = () => {
	const threadId = "thread", turnId = "turn";
	const activities = [
		runtimeActivity(1, "message", threadId, turnId, { direction: "outbound", text: "runtime" }),
		runtimeActivity(2, "verification", threadId, turnId, { method: "verification/completed", command: "bun test", exitCode: 0, result: "pass" }, "completed"),
		runtimeActivity(3, "terminal", threadId, turnId, { method: "turn/completed" }, "completed"),
	];
	const hash = { sha256Hex: (input: Uint8Array) => sha256(Buffer.from(input)) };
	const completion = replayExecutionRun(
		createExecutionRun({ runId: `${threadId}:${turnId}`, threadId, turnId, hash }),
		activities.map(normalizeProjectActivity),
		hash,
	).receipt!;
	const receiptActivity = runtimeActivity(4, "receipt", threadId, turnId, { method: "execution/completion-receipt", receipt: completion }, "completed");
	return { activities: [...activities, receiptActivity], completion };
};

describe("runtime receipt journal authentication", () => {
	test("selects the exact receipt from a multi-turn ProjectActivity JSONL journal", () => {
		const { activities, completion } = runtimeJournal();
		activities.push(runtimeActivity(5, "other-turn", "thread", "other-turn", { method: "turn/started" }));
		expect(selectedCompletionReceipt(`${activities.map(activity => JSON.stringify(activity)).join("\n")}\n`, completion.receiptId)).toEqual(completion);
	});

	test("rejects replay tampering, global sequence gaps, and receipt checkpoint tampering", () => {
		const { activities, completion } = runtimeJournal();
		const journal = (items: readonly ProjectActivity[]) => `${items.map(activity => JSON.stringify(activity)).join("\n")}\n`;
		const sourceTampered = activities.map(activity => activity.id === "verification" ? { ...activity, sourceDigest: `sha256:${sha256("tampered")}` } : activity);
		expect(() => selectedCompletionReceipt(journal(sourceTampered), completion.receiptId)).toThrow("JOURNAL_COMPLETION_RECEIPT_REPLAY_MISMATCH");
		const gap = activities.map(activity => activity.id === "verification" ? { ...activity, sequence: 7 } : activity);
		expect(() => selectedCompletionReceipt(journal(gap), completion.receiptId)).toThrow("JOURNAL_ACTIVITY_SEQUENCE_GAP");
		const checkpointTampered = activities.map(activity => activity.id === "receipt"
			? { ...activity, payload: { ...activity.payload, receipt: { ...completion, checkpointDigest: "a".repeat(64) } } }
			: activity);
		expect(() => selectedCompletionReceipt(journal(checkpointTampered), completion.receiptId)).toThrow("JOURNAL_COMPLETION_RECEIPT_DIGEST_MISMATCH");
	});
});

describe("traceability v3 SQLite projection", () => {
	test("rebuilds identical logical and row digests after deleting SQLite", () => {
		const root = dataRoot();
		const firstStore = new DevelopmentStore({ projectRoot: resolve("."), dataRoot: root });
		const first = firstStore.rebuildTraceability();
		const indexPath = firstStore.indexPath;
		firstStore.close();
		for (const suffix of ["", "-wal", "-shm"]) rmSync(`${indexPath}${suffix}`, { force: true });

		const rebuiltStore = new DevelopmentStore({ projectRoot: resolve("."), dataRoot: root });
		const rebuilt = rebuiltStore.rebuildTraceability();
		expect(rebuilt.logicalDigest).toBe(first.logicalDigest);
		expect(rebuilt.rowDigest).toBe(first.rowDigest);
		const ledger = JSON.parse(readFileSync(resolve(".www/control-ledger/traceability-v3.json"), "utf8")) as TraceabilityLedgerV3;
		expect(rebuilt.entities).toBe(ledger.entities.length);
		expect(rebuilt.edges).toBe(ledger.edges.length);
		rebuiltStore.close();
	});

	test("projects current receipts from aligned source digests and deterministic coverage", () => {
		const root = dataRoot();
		const store = new DevelopmentStore({ projectRoot: resolve("."), dataRoot: root });
		const rebuilt = store.rebuildTraceability();
		const coverage = store.coverageForSpec("CHAT-001");
		expect(coverage.logicalDigest).toBe(rebuilt.logicalDigest);
		expect(coverage.acceptances).toEqual([
			expect.objectContaining({ acceptanceRef: "acceptance:CHAT-001/A-01@v1", status: "pass" }),
			expect.objectContaining({ acceptanceRef: "acceptance:CHAT-001/A-02@v1", status: "pass" }),
			expect.objectContaining({ acceptanceRef: "acceptance:CHAT-001/A-03@v1", status: "unknown" }),
		]);
		expect(store.queryTraceability("exception", "EXC-014").entities.some(entity => entity.ref === "exception:EXC-014@v1")).toBe(true);
		expect(store.traceabilityDrift().stale).not.toContainEqual({ ref: "receipt:VR-CHAT-001-001", status: "stale" });
		expect(store.traceabilityOrphans()).toEqual({ logicalDigest: rebuilt.logicalDigest, entities: [] });
		store.close();
	});

	test("projects a contained runtime receipt through the production CLI into validated evidence and store queries", async () => {
		const root = dataRoot();
		const evidence = ".www/evidence/runtime-proof.txt";
		const output = ".www/evidence/VR-RUNTIME-001/verification-receipt.json";
		mkdirSync(join(root, ".www/control-ledger"), { recursive: true });
		mkdirSync(join(root, ".www/control-ledger/registry/specs"), { recursive: true });
		mkdirSync(join(root, ".www/control-ledger/registry/tests"), { recursive: true });
		mkdirSync(join(root, ".www/evidence"), { recursive: true });
		writeFileSync(join(root, evidence), "runtime proof\n");
		const evidenceDigest = sha256("runtime proof\n");
		const specEnvelope = { schemaVersion: 3 as const, kind: "spec" as const, id: "CHAT-001", version: 1, immutable: true as const, payload: { acceptances: [{ id: "A-01", purpose: "runtime receipt", risk: "unprojected runtime proof", pass: "receipt covers acceptance", required: true }] }, payloadDigest: "" };
		const { payloadDigest: _specDigest, ...specBody } = specEnvelope;
		specEnvelope.payloadDigest = canonicalDigest(specBody);
		const testEnvelope = { schemaVersion: 3 as const, kind: "test-contract" as const, id: "RUNTIME-TEST", version: 1, immutable: true as const, payload: { purpose: "project runtime receipt", risk: "invalid evidence", pass: "validated receipt", acceptanceIds: ["RUNTIME/A-01"] }, payloadDigest: "" };
		const { payloadDigest: _testDigest, ...testBody } = testEnvelope;
		testEnvelope.payloadDigest = canonicalDigest(testBody);
		const specPath = ".www/control-ledger/registry/specs/CHAT-001.json";
		const testPath = ".www/control-ledger/registry/tests/RUNTIME-TEST.json";
		const specContent = JSON.stringify(specEnvelope);
		const testContent = JSON.stringify(testEnvelope);
		writeFileSync(join(root, specPath), specContent);
		writeFileSync(join(root, testPath), testContent);
		const ledger: TraceabilityLedgerV3 = {
			schemaVersion: 3, projectId: "00000000-0000-4000-8000-000000000001", tombstones: [], migrations: [], payloadDigest: "",
			entities: [
				{ ref: "spec:CHAT-001@v1", kind: "spec", id: "CHAT-001", version: 1, source: { path: specPath, digest: sha256(specContent) } },
				{ ref: "acceptance:CHAT-001/A-01@v1", kind: "acceptance", id: "CHAT-001/A-01", version: 1 },
				{ ref: "test-contract:RUNTIME-TEST@v1", kind: "test-contract", id: "RUNTIME-TEST", version: 1, source: { path: testPath, digest: sha256(testContent) } },
				{ ref: "receipt:VR-RUNTIME-001", kind: "receipt", id: "VR-RUNTIME-001", immutable: true, source: { path: output, digest: "d".repeat(64) } },
				{ ref: "git-revision:git:runtime", kind: "git-revision", id: "git:runtime" },
			],
			edges: [
				{ from: "spec:CHAT-001@v1", relation: "has-acceptance", to: "acceptance:CHAT-001/A-01@v1" },
				{ from: "acceptance:CHAT-001/A-01@v1", relation: "verified-by", to: "test-contract:RUNTIME-TEST@v1" },
				{ from: "receipt:VR-RUNTIME-001", relation: "covers", to: "acceptance:CHAT-001/A-01@v1" },
				{ from: "receipt:VR-RUNTIME-001", relation: "executes", to: "test-contract:RUNTIME-TEST@v1" },
				{ from: "receipt:VR-RUNTIME-001", relation: "produced", to: "evidence:EV-RUNTIME-001" },
				{ from: "receipt:VR-RUNTIME-001", relation: "at-revision", to: "git-revision:git:runtime" },
			],
		};
		ledger.entities.push({ ref: "evidence:EV-RUNTIME-001", kind: "evidence", id: "EV-RUNTIME-001", immutable: true, source: { path: evidence, digest: evidenceDigest } });
		const { payloadDigest: _, ...ledgerBody } = ledger;
		ledger.payloadDigest = canonicalDigest(ledgerBody);
		writeFileSync(join(root, ".www/control-ledger/traceability-v3.json"), JSON.stringify(ledger));
		for (const command of [
			["git", "init"],
			["git", "config", "user.email", "traceability@example.com"],
			["git", "config", "user.name", "Traceability Test"],
			["git", "add", "."],
			["git", "commit", "-m", "fixture"],
		]) {
			const result = Bun.spawnSync(command, { cwd: root, stdout: "pipe", stderr: "pipe" });
			expect(result.exitCode, result.stderr.toString()).toBe(0);
		}
		const head = Bun.spawnSync(["git", "rev-parse", "HEAD"], { cwd: root, stdout: "pipe" }).stdout.toString().trim();
		const { activities, completion } = runtimeJournal();
		writeFileSync(join(root, "runtime-journal.json"), `${activities.map(activity => JSON.stringify(activity)).join("\n")}\n`);
		writeFileSync(join(root, "receipt-context.json"), JSON.stringify({
			receiptId: "VR-RUNTIME-001", observedSourceRevision: `worktree:${head}:dirty`, execution: { environment: "test" },
			evidenceArtifacts: [{ id: "EV-RUNTIME-001", path: evidence, sha256: evidenceDigest, immutable: true }],
			acceptanceCoverage: [{ acceptanceRef: "acceptance:CHAT-001/A-01@v1", testRef: "test-contract:RUNTIME-TEST@v1", status: "pass" }],
			requiredAcceptanceRefs: ["acceptance:CHAT-001/A-01@v1"], exceptionStageCoverage: [], applicableExceptionStages: [], limitations: ["No deployment environment."],
		}));
		const generated = await runTraceability(["receipt-from-runtime", "--project-root", root, "--journal", "runtime-journal.json", "--runtime-receipt-id", completion.receiptId, "--context", "receipt-context.json", "--output", output]);
		expect(generated).toContain("VR-RUNTIME-001");
		const alignedLedger = JSON.parse(readFileSync(join(root, ".www/control-ledger/traceability-v3.json"), "utf8")) as TraceabilityLedgerV3;
		const receiptRef = "receipt:VR-RUNTIME-001";
		expect(alignedLedger.entities.filter(entity => entity.kind === "evidence").map(entity => entity.ref)).toEqual(["evidence:EV-RUNTIME-001"]);
		expect(alignedLedger.edges.filter(edge => edge.from === receiptRef && ["produced", "evidenced-by"].includes(edge.relation)).map(edge => `${edge.relation}:${edge.to}`).sort()).toEqual([
			"evidenced-by:evidence:EV-RUNTIME-001", "produced:evidence:EV-RUNTIME-001",
		]);
		await expect(validateTraceability({ projectRoot: root, ledger: alignedLedger, vaultRoot: root })).resolves.toEqual([]);
		const store = new DevelopmentStore({ projectRoot: root, dataRoot: join(root, "data") });
		store.rebuildTraceability();
		expect(store.queryTraceability("receipt", "VR-RUNTIME-001").entities).toContainEqual(expect.objectContaining({ ref: "receipt:VR-RUNTIME-001" }));
		expect(store.coverageForSpec("CHAT-001").acceptances).toEqual([expect.objectContaining({ status: "pass", receiptRef: "receipt:VR-RUNTIME-001" })]);
		store.close();
	});
});

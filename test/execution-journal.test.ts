import { createHash } from "node:crypto";
import { describe, expect, test } from "bun:test";
import legacy from "./fixtures/legacy-execution-receipt.json";
import type { ProjectActivity } from "../src/core/domain/execution/project-activity";
import { createExecutionRun, normalizeProjectActivity, replayV2ExecutionRunForVerification } from "../src/core/runtime/execution-run";
import { ExecutionJournal } from "../src/core/application/orchestration/execution-journal";

const hash = { sha256Hex: (input: Uint8Array) => createHash("sha256").update(input).digest("hex") };
const canonical = (value: unknown) => JSON.stringify(value);
const activity = (sequence: number, id: string, method: string, phase: ProjectActivity["phase"] = "completed", payload: Record<string, unknown> = {}): ProjectActivity => ({
	schemaVersion: 1, id, projectId: "project", sequence, recordedAt: `2026-09-10T00:00:0${sequence}.000Z`, kind: method.startsWith("item/") ? "tool" : "progress", phase,
	provider: "native", nativeRefs: { threadId: "thread", turnId: "turn", ...(method.startsWith("item/") ? { itemId: id } : {}) },
	sourceDigest: `sha256:${sequence.toString(16).padStart(64, "0")}`, payload: { method, ...payload },
});
const receiptActivity = (receipt: unknown, sequence: number): ProjectActivity => activity(sequence, `receipt-${sequence}`, "execution/completion-receipt", "completed", { receipt });

describe("ExecutionJournal", () => {
	test("restores an authenticated v3 receipt and rejects replay tampering", () => {
		const source = [
			activity(1, "start", "turn/started", "started"),
			activity(2, "plan", "turn/plan/updated", "completed", { params: { plan: [{ step: "검증", status: "inProgress" }] } }),
			activity(3, "terminal", "turn/completed"),
		];
		const live = new ExecutionJournal(hash, canonical);
		for (let index = 0; index < source.length; index++) live.observe(source[index]!, source.slice(0, index + 1));
		const receipt = live.get("thread:turn")!.receipt!;
		expect(receipt.algorithmVersion).toBe(3);
		const journal = [...source, receiptActivity(receipt, 4)];
		const restored = new ExecutionJournal(hash, canonical);
		expect(restored.restore(journal)).toEqual([]);
		expect(restored.get("thread:turn")?.receipt).toEqual(receipt);
		const premature = new ExecutionJournal(hash, canonical);
		expect(premature.restore([receiptActivity(receipt, 0), ...source])[0]).toContain("종료 원본을 확인할 수 없습니다");

		const tampered = source.map(item => item.id === "plan" ? { ...item, payload: { ...item.payload, params: { plan: [{ step: "변조", status: "inProgress" }] } } } : item);
		const rejected = new ExecutionJournal(hash, canonical);
		expect(rejected.restore([...tampered, receiptActivity(receipt, 4)])[0]).toContain("원본 관측이 일치하지 않습니다");
		expect(rejected.get("thread:turn")).toBeUndefined();
	});

	test("bounds v3 replay context at the authenticated terminal source", () => {
		const source = [activity(1, "start", "turn/started", "started"), activity(2, "terminal", "turn/completed")];
		const live = new ExecutionJournal(hash, canonical);
		for (let index = 0; index < source.length; index++) live.observe(source[index]!, source.slice(0, index + 1));
		const receipt = live.get("thread:turn")!.receipt!;
		const latePlan = activity(3, "late-plan", "turn/plan/updated", "completed", { params: { plan: [{ step: "후행 계획", status: "inProgress" }] } });
		const restored = new ExecutionJournal(hash, canonical);
		expect(restored.restore([...source, latePlan, receiptActivity(receipt, 4)])).toEqual([]);
		expect(restored.get("thread:turn")?.receipt).toEqual(receipt);
	});

	test("does not let a future Plan revision alter an earlier replay event", () => {
		const source = [activity(1, "start", "turn/started", "started"), activity(2, "terminal", "turn/completed")];
		const future = activity(3, "future-plan", "turn/plan/updated", "completed", { params: { plan: [{ step: "미래 계획", status: "inProgress" }] } });
		const live = new ExecutionJournal(hash, canonical);
		live.observe(source[0]!, [...source, future]);
		expect(live.get("thread:turn")?.tasks).toEqual([]);
		live.observe(source[1]!, [...source, future]);
		expect(live.get("thread:turn")?.receipt?.remaining).toEqual([]);
	});

	test("authenticates fixed v2 and versionless receipts without rewriting bytes", () => {
		const source = [activity(1, "start", "turn/started", "started"), activity(2, "terminal", "turn/completed")];
		const initial = createExecutionRun({ runId: "thread:turn", threadId: "thread", turnId: "turn", hash });
		const v2 = replayV2ExecutionRunForVerification(initial, source.map(normalizeProjectActivity), hash).receipt!;
		const v2Journal = new ExecutionJournal(hash, canonical);
		expect(v2Journal.restore([...source, receiptActivity(v2, 3)])).toEqual([]);
		expect(canonical(v2Journal.get("thread:turn")?.receipt)).toBe(canonical(v2));

		const historical = legacy as unknown as { activities: ProjectActivity[]; receipt: unknown };
		const legacyJournal = new ExecutionJournal(hash, canonical);
		expect(legacyJournal.restore(historical.activities)).toEqual([]);
		expect(canonical(legacyJournal.get("thread:turn")?.receipt)).toBe(canonical(historical.receipt));
	});

	test("rejects unsupported versions and versionless commandResults", () => {
		const base = { ...(legacy as unknown as { receipt: Record<string, unknown> }).receipt };
		for (const receipt of [{ ...base, algorithmVersion: 4 }, { ...base, commandResults: [] }]) {
			const journal = new ExecutionJournal(hash, canonical);
			expect(journal.restore([...(legacy as unknown as { activities: ProjectActivity[] }).activities.slice(0, -1), receiptActivity(receipt, 5)])[0]).toContain("지원하지 않는 실행 Receipt 버전");
		}
	});
});

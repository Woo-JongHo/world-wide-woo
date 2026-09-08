import { describe, expect, test } from "bun:test";
import type { ProjectActivity } from "../src/core/domain/project-activity";
import {
	createExecutionRun,
	executionCheckpointDigest,
	normalizeProjectActivity,
	reduceExecutionRun,
	replayExecutionRun,
} from "../src/core/runtime/execution-run";

const hash = { sha256Hex: (input: Uint8Array) => [...input].reduce((value, byte) => ((value * 33) ^ byte) >>> 0, 5381).toString(16).padStart(64, "0") };
const activity = (sequence: number, method: string, phase: ProjectActivity["phase"] = "completed", kind: ProjectActivity["kind"] = "progress", runSequence?: number, payload: Record<string, unknown> = {}): ProjectActivity => ({
	schemaVersion: 1, id: `a-${sequence}`, projectId: "project", sequence, recordedAt: `2026-09-08T00:00:0${sequence}.000Z`, kind, phase,
	provider: "native", nativeRefs: { threadId: "thread", turnId: "turn", itemId: "task" }, sourceDigest: `digest-${sequence}`,
	payload: { method, text: method, ...(runSequence === undefined ? {} : { runSequence }), ...payload },
});
const initial = () => createExecutionRun({ runId: "thread:turn", threadId: "thread", turnId: "turn", hash });
const reduce = (state: ReturnType<typeof initial>, value: ProjectActivity) => reduceExecutionRun(state, normalizeProjectActivity(value), hash);

describe("ExecutionRun reducer", () => {
	test("reduces normal durable evidence deterministically into a structured receipt", () => {
		const events = [
			activity(1, "turn/started", "started"),
			activity(2, "file/change", "completed", "file-change", undefined, { ref: "src/a.ts", summary: "Added receipt projection" }),
			activity(3, "verification/completed", "completed", "progress", undefined, { command: "bun test", result: "passed", status: "passed" }),
			activity(4, "turn/completed"),
		].map(normalizeProjectActivity);
		const live = events.reduce((state, event) => reduceExecutionRun(state, event, hash).state, initial());
		const replayed = replayExecutionRun(initial(), events, hash);
		expect(live).toEqual(replayed);
		expect(live.receipt?.status).toBe("completed");
		expect(live.receipt?.changed).toEqual([{ kind: "file-change", ref: "src/a.ts", summary: "Added receipt projection" }]);
		expect(live.receipt?.verification).toEqual([{ command: "bun test", status: "passed", result: "passed", evidenceRefs: ["a-3"] }]);
		expect(live.receipt?.checkpointDigest).toBe(executionCheckpointDigest({ ...live, receipt: null }));
	});

	test("creates failed, cancelled, and interrupted receipts only from terminal evidence", () => {
		const failed = reduce(initial(), activity(1, "turn/failed", "failed")).state;
		const cancelled = reduce(initial(), activity(1, "turn/cancelled", "cancelled")).state;
		const interrupted = reduce(initial(), activity(1, "turn/interrupted", "cancelled")).state;
		expect(failed.receipt?.status).toBe("failed");
		expect(cancelled.receipt?.status).toBe("cancelled");
		expect(interrupted.receipt?.status).toBe("interrupted");
	});

	test("keeps a failed tool as recoverable evidence until an authoritative turn terminal", () => {
		const failedTool = reduce(initial(), activity(1, "tool/failed", "failed", "tool")).state;
		expect(failedTool.phase).toBe("blocked");
		expect(failedTool.receipt).toBeNull();
		expect(failedTool.tasks[0]?.status).toBe("failed");
		const recovered = reduce(failedTool, activity(2, "tool/started", "started", "tool")).state;
		expect(recovered.phase).toBe("executing");
		const completed = reduce(recovered, activity(3, "turn/completed")).state;
		expect(completed.receipt?.status).toBe("completed");
	});

	test("does not invent verification from text-only durable observations", () => {
		const verification = reduce(initial(), activity(1, "verification/completed", "completed", "progress")).state;
		const completed = reduce(verification, activity(2, "turn/completed")).state;
		expect(completed.receipt?.verification).toEqual([]);
	});

	test("preserves explicit skipped verification instead of promoting its completed activity phase", () => {
		const verification = reduce(initial(), activity(1, "verification/completed", "completed", "progress", undefined, {
			command: "bun test", result: "not run: dependency unavailable", outcome: "skipped",
		})).state;
		const completed = reduce(verification, activity(2, "turn/completed")).state;
		expect(completed.receipt?.verification).toEqual([{
			command: "bun test",
			status: "skipped",
			result: "not run: dependency unavailable",
			evidenceRefs: ["a-1"],
		}]);
	});

	test("treats completed verification without an explicit outcome or exit code as unknown", () => {
		const verification = reduce(initial(), activity(1, "verification/completed", "completed", "progress", undefined, {
			command: "bun test", result: "output observed",
		})).state;
		const completed = reduce(verification, activity(2, "turn/completed")).state;
		expect(completed.receipt?.verification?.[0]?.status).toBe("unknown");
	});

	test("accepts a run's observations across unrelated global journal sequence values", () => {
		const started = reduce(initial(), activity(10, "turn/started", "started")).state;
		const result = reduce(started, activity(42, "turn/plan/updated"));
		expect(result.reason).toBe("applied");
		expect(result.state.phase).toBe("planning");
	});

	test("ignores duplicates and late events after terminal", () => {
		const done = reduce(initial(), activity(1, "turn/completed")).state;
		expect(reduce(done, activity(1, "turn/completed")).reason).toBe("duplicate");
		expect(reduce(done, activity(2, "tool/started", "started", "tool")).state).toEqual(done);
	});

	test("enters reconciling on a durable gap and never manufactures a receipt", () => {
		const result = reduce(initial(), activity(2, "turn/completed"));
		expect(result.reason).toBe("applied");
		const gapped = reduce(result.state, activity(4, "turn/completed"));
		expect(gapped.reason).toBe("late");
		const gap = reduce(initial(), activity(1, "turn/started", "started", "progress", 1));
		const reconciling = reduce(gap.state, activity(3, "turn/completed", "completed", "progress", 3));
		expect(reconciling.reason).toBe("gap");
		expect(reconciling.state.phase).toBe("reconciling");
		expect(reconciling.state.receipt).toBeNull();
	});
});

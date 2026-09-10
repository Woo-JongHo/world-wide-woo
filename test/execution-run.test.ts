import { describe, expect, test } from "bun:test";
import type { ProjectActivity } from "../src/core/domain/execution/project-activity";
import {
	createExecutionRun,
	executionCheckpointDigest,
	normalizeProjectActivity,
	reduceExecutionRun,
	replayExecutionRun,
	replayV2ExecutionRunForVerification,
} from "../src/core/runtime/execution-run";

const hash = { sha256Hex: (input: Uint8Array) => [...input].reduce((value, byte) => ((value * 33) ^ byte) >>> 0, 5381).toString(16).padStart(64, "0") };
const activity = (sequence: number, method: string, phase: ProjectActivity["phase"] = "completed", kind: ProjectActivity["kind"] = "progress", runSequence?: number, payload: Record<string, unknown> = {}): ProjectActivity => ({
	schemaVersion: 1, id: `a-${sequence}`, projectId: "project", sequence, recordedAt: `2026-09-08T00:00:0${sequence}.000Z`, kind, phase,
	provider: "native", nativeRefs: { threadId: "thread", turnId: "turn", itemId: "task" }, sourceDigest: `sha256:${sequence.toString(16).padStart(64, "0")}`,
	payload: { method, text: method, ...(runSequence === undefined ? {} : { runSequence }), ...payload },
});
const initial = () => createExecutionRun({ runId: "thread:turn", threadId: "thread", turnId: "turn", hash });
const reduce = (state: ReturnType<typeof initial>, value: ProjectActivity) => reduceExecutionRun(state, normalizeProjectActivity(value), hash);

describe("ExecutionRun reducer", () => {
	test("keeps approval waiting through write-ahead and uncertain audit observations", () => {
		let state = reduce(initial(), activity(1, "approval/requested", "started", "approval")).state;
		expect(state.phase).toBe("waiting");
		const waitingActivity = state.activeActivity;
		for (const [index, method] of ["governance/decision-prepared", "governance/decision-uncertain", "governance/decision-dispatched"].entries()) {
			state = reduce(state, activity(index + 2, method, method.endsWith("uncertain") ? "failed" : "completed")).state;
			expect(state.phase).toBe("waiting");
			expect(state.waitReason).toBe("approval");
			expect(state.activeActivity).toEqual(waitingActivity);
		}
		expect(state.activities).toHaveLength(4);
		state = reduce(state, activity(5, "approval/resolved", "completed", "approval", undefined, { eventType: "approval-resolved" })).state;
		expect(state.phase).toBe("executing");
	});
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
		expect(failedTool.tasks).toEqual([]);
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

	test("uses dplan-v1 identity and association across reorder, insert, and delete", () => {
		const journal = [
			activity(1, "turn/started", "started"),
			activity(2, "turn/plan/updated", "completed", "progress", undefined, { params: { plan: [
				{ step: "A", status: "inProgress" }, { step: "B", status: "pending" },
			] } }),
			activity(3, "tool/completed", "completed", "tool", undefined, { command: "prove A" }),
			activity(4, "turn/plan/updated", "completed", "progress", undefined, { params: { plan: [
				{ step: "B", status: "inProgress" }, { step: "A", status: "completed" }, { step: "C", status: "pending" },
			] } }),
			activity(5, "tool/completed", "completed", "tool", undefined, { command: "prove B" }),
			activity(6, "turn/plan/updated", "completed", "progress", undefined, { params: { plan: [
				{ step: "C", status: "inProgress" }, { step: "B", status: "completed" },
			] } }),
		];
		const states = journal.reduce<ReturnType<typeof initial>[]>((values, item, index) => {
			const state = reduceExecutionRun(values.at(-1) ?? initial(), normalizeProjectActivity(item), hash, { journalActivities: journal.slice(0, index + 1) }).state;
			return [...values, state];
		}, []);
		const before = states[2]!;
		const reordered = states[3]!;
		const final = states[5]!;
		const a = before.tasks.find(task => task.title === "A")!;
		expect(reordered.tasks.find(task => task.title === "A")?.id).toBe(a.id);
		expect(reordered.tasks.find(task => task.title === "A")?.activityIds).toEqual(["a-3"]);
		expect(reordered.tasks.find(task => task.title === "B")?.activityIds).toEqual([]);
		expect(final.tasks.map(task => task.title)).toEqual(["C", "B"]);
		expect(final.tasks.find(task => task.title === "B")?.activityIds).toEqual(["a-5"]);
	});

	test("keeps duplicate running Plan association unowned and requires complete journal context", () => {
		const journal = [
			activity(1, "turn/started", "started"),
			activity(2, "turn/plan/updated", "completed", "progress", undefined, { params: { plan: [
				{ step: "same", status: "inProgress" }, { step: "same", status: "inProgress" },
			] } }),
			activity(3, "tool/completed", "completed", "tool"),
		];
		const withoutContext = journal.reduce((state, item) => reduceExecutionRun(state, normalizeProjectActivity(item), hash).state, initial());
		expect(withoutContext.tasks).toEqual([]);
		const withContext = journal.reduce((state, item, index) => reduceExecutionRun(state, normalizeProjectActivity(item), hash, { journalActivities: journal.slice(0, index + 1) }).state, initial());
		expect(withContext.tasks).toHaveLength(2);
		expect(withContext.tasks.every(task => task.activityIds.length === 0)).toBe(true);
	});

	test("uses the global journal prefix across foreign root turns and excludes public Plan documents", () => {
		const foreign = { ...activity(2, "turn/started", "started"), id: "foreign-2", nativeRefs: { threadId: "other", turnId: "other-turn" } };
		const journal = [
			activity(1, "turn/started", "started"),
			foreign,
			activity(3, "turn/plan/updated", "completed", "progress", undefined, { params: { plan: [{ step: "native", status: "inProgress" }] } }),
		];
		const native = journal.reduce((state, item, index) => item.nativeRefs.threadId === "thread"
			? reduceExecutionRun(state, normalizeProjectActivity(item), hash, { journalActivities: journal.slice(0, index + 1) }).state
			: state, initial());
		expect(native.tasks.map(task => task.title)).toEqual(["native"]);

		const publicPlan = activity(4, "turn/plan/public-fallback", "completed", "progress", undefined, {
			source: "public-user-request",
			params: { plan: [{ step: "문서 계획", status: "inProgress" }] },
		});
		const projected = reduceExecutionRun(native, normalizeProjectActivity(publicPlan), hash, { journalActivities: [...journal, publicPlan] }).state;
		expect(projected.tasks).toEqual([]);
	});

	test("keeps v2 replay byte-stable while live receipts use algorithmVersion 3", () => {
		const events = [activity(1, "turn/started", "started"), activity(2, "turn/completed")].map(normalizeProjectActivity);
		const v2 = replayV2ExecutionRunForVerification(initial(), events, hash);
		const live = replayExecutionRun(initial(), events, hash, { journalActivities: events.map(event => event.activity!) });
		expect(v2.receipt?.algorithmVersion).toBe(2);
		expect(live.receipt?.algorithmVersion).toBe(3);
		expect(JSON.stringify(replayV2ExecutionRunForVerification(initial(), events, hash).receipt)).toBe(JSON.stringify(v2.receipt));
	});
});

import { describe, expect, test } from "bun:test";
import type { ProjectActivity } from "../src/core/domain/execution/project-activity";
import type { ExecutionRunState } from "../src/core/domain/execution/execution-run-contract";
import { projectPerformance } from "../src/core/domain/work/performance";

const activity = (sequence: number, id: string, turnId: string | undefined, method: string, payload: Record<string, unknown> = {}, phase: ProjectActivity["phase"] = "completed", kind: ProjectActivity["kind"] = "progress", itemId = id): ProjectActivity => ({
	schemaVersion: 1, id, projectId: "project", sequence, recordedAt: `2026-09-10T00:00:0${sequence}.000Z`, kind, phase, provider: "native",
	nativeRefs: { threadId: "thread", ...(turnId ? { turnId } : {}), itemId }, sourceDigest: `sha256:${sequence.toString(16).padStart(64, "0")}`, payload: { method, ...payload },
});
const run = (turnId: string, verification: ExecutionRunState["receipt"] extends infer _T ? readonly { status: "passed" | "failed" | "skipped" | "unknown" }[] : never = []): ExecutionRunState => ({
	runId: `thread:${turnId}`, threadId: "thread", turnId, phase: "completed", waitReason: null, objective: "질문 처리", tasks: [], activeActivity: null, evidence: [], activities: [], lastSequence: null,
	checkpoint: { runId: `thread:${turnId}`, sequence: 0, digest: "checkpoint" }, rejectedEventIds: [],
	receipt: verification.length ? { receiptId: "r", receiptDigest: "d", checkpointDigest: "c", runId: `thread:${turnId}`, threadId: "thread", turnId, status: "completed", objective: "질문 처리", changed: [], verification: verification.map((item, index) => ({ command: `check-${index}`, status: item.status, result: "observed", evidenceRefs: [] })), evidenceRefs: [], remaining: [], completedAt: "2026-09-10T00:00:09Z", terminalSource: { id: "terminal", sequence: 9, sourceDigest: "sha256:x" } } : null,
});
const flow = { source: null, retirements: [], orphans: [], rejections: [], goal: "", steps: [], completedCount: 0, currentStepNumber: null, observationCount: 0, summary: "" } as const;

describe("performance projection", () => {
	test("binds each independent question to its own request item and turn", () => {
		const activities = [
			activity(1, "q1", undefined, "message", { direction: "outbound", text: "첫 질문" }, "completed", "message", "request-1"),
			activity(2, "s1", "turn-1", "request/started", {}, "started", "progress", "request-1"),
			activity(3, "q2", undefined, "message", { direction: "outbound", text: "둘째 질문" }, "completed", "message", "request-2"),
			activity(4, "s2", "turn-2", "request/started", {}, "started", "progress", "request-2"),
		];
		expect(projectPerformance({ activities, run: run("turn-1"), flow }).request?.text).toBe("첫 질문");
		expect(projectPerformance({ activities, run: run("turn-2"), flow }).request?.text).toBe("둘째 질문");
	});

	test("does not leak an assigned goal across a different goal turn boundary", () => {
		const activities = [
			activity(1, "goal", undefined, "message", { direction: "outbound", text: "첫 목표", goal: true }, "completed", "message", "goal-request"),
			activity(2, "goal-start", "turn-1", "request/started", {}, "started", "progress", "goal-request"),
			activity(3, "question", undefined, "message", { direction: "outbound", text: "독립 질문" }, "completed", "message", "question-request"),
			activity(4, "question-start", "turn-2", "request/started", {}, "started", "progress", "question-request"),
		];
		expect(projectPerformance({ activities, run: run("turn-1"), flow }).workContext?.goal).toBe("첫 목표");
		expect(projectPerformance({ activities, run: run("turn-2"), flow }).workContext).toBeNull();
	});

	test("does not display successful command output as acceptance verification", () => {
		const command = activity(1, "cmd", "turn-1", "item/completed", { params: { item: { type: "commandExecution", command: "bun test", exitCode: 0, aggregatedOutput: "all pass" } } }, "completed", "tool");
		expect(projectPerformance({ activities: [command], run: run("turn-1"), flow }).verification).toBe("not-verified");
		expect(projectPerformance({ activities: [command], run: run("turn-1", [{ status: "passed" }]), flow }).verification).toBe("passed");
	});

	test("excludes governance and uncertain request observations from execution failures", () => {
		const activities = [
			activity(1, "governance", "turn-1", "governance/decision-uncertain", {}, "failed"),
			activity(2, "request", "turn-1", "request/uncertain", {}, "failed"),
			activity(3, "request-failed", "turn-1", "request/failed", {}, "failed"),
		];
		expect(projectPerformance({ activities, run: run("turn-1"), flow }).health.observedFailures).toBe(0);
	});

	test("counts each actual failed tool, turn, and verification observation", () => {
		const activities = [
			activity(1, "tool-1", "turn-1", "item/completed", { params: { item: { type: "commandExecution", exitCode: 1 } } }, "completed", "tool", "same-item"),
			activity(2, "tool-2", "turn-1", "item/failed", {}, "failed", "tool", "same-item"),
			activity(3, "verification", "turn-1", "verification/failed", {}, "failed"),
			activity(4, "turn", "turn-1", "turn/failed", {}, "failed"),
		];
		expect(projectPerformance({ activities, run: run("turn-1"), flow }).health.observedFailures).toBe(4);
	});
});

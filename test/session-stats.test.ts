import { describe, expect, test } from "bun:test";
import type { ProjectActivity } from "../src/domain/project-activity";
import type { WorkbenchSnapshot } from "../src/domain/workbench";
import { projectSessionStats } from "../src/domain/session-stats";

function activity(input: { id: string; sequence: number; method: string; kind?: ProjectActivity["kind"]; phase?: ProjectActivity["phase"]; turnId?: string; itemId?: string; payload?: Record<string, unknown>; approvalRequestId?: string }): ProjectActivity {
	return { schemaVersion: 1, id: input.id, projectId: "project", sequence: input.sequence, recordedAt: `2026-09-03T00:00:${String(input.sequence).padStart(2, "0")}.000Z`, kind: input.kind ?? "progress", phase: input.phase ?? "updated", provider: "openai-codex", nativeRefs: { threadId: "thread-1", turnId: input.turnId, itemId: input.itemId, approvalRequestId: input.approvalRequestId }, sourceDigest: `sha256:${input.id.padEnd(64, "0").slice(0, 64)}`, payload: { method: input.method, ...input.payload } };
}
function snapshot(activities: ProjectActivity[], extra: Record<string, unknown> = {}): WorkbenchSnapshot { return { projectId: "project", threadId: "thread-1", phase: "ready", activities, sessionGoal: null, tnotes: [], workFlow: { goal: null, currentStepNumber: null, steps: [] }, ...extra } as unknown as WorkbenchSnapshot; }

describe("session stats projection", () => {
	test("uses approval envelopes and separates collaboration agents from executable tools", () => {
		const stats = projectSessionStats(snapshot([
			activity({ id: "start", sequence: 1, method: "turn/started", turnId: "t", phase: "started" }),
			activity({ id: "agent", sequence: 2, method: "item/started", turnId: "t", itemId: "a", kind: "tool", payload: { params: { item: { type: "collabAgentToolCall" } } } }),
			activity({ id: "tool", sequence: 3, method: "item/commandExecution/started", turnId: "t", itemId: "c", kind: "tool", phase: "started", payload: { params: { item: { type: "commandExecution" } } } }),
			activity({ id: "request", sequence: 4, method: "unknown", turnId: "t", kind: "approval", phase: "started", payload: { eventType: "approval-requested", approval: { requestId: "r" } } }),
			activity({ id: "resolved", sequence: 5, method: "unknown", turnId: "t", kind: "approval", phase: "completed", approvalRequestId: "r", payload: { eventType: "approval-resolved" } }),
		]));
		expect(stats.session).toMatchObject({ agentOperations: 1, toolOperations: 1, approvals: 1, waits: 0 });
		expect(stats.speed.averageApprovalWaitMs).toBe(1000);
		expect(stats.activities).toEqual(expect.arrayContaining([
			expect.objectContaining({ id: "agent", category: "agent", sourceActivityId: "agent" }),
			expect.objectContaining({ id: "tool", category: "tool", sourceActivityId: "tool" }),
			expect.objectContaining({ id: "request", category: "approval", sourceActivityId: "request" }),
		]));
	});
	test("detects completed-status nested errors and nonzero exits without false turn-complete recovery", () => {
		const stats = projectSessionStats(snapshot([
			activity({ id: "bad", sequence: 1, method: "item/completed", turnId: "t", itemId: "x", kind: "tool", phase: "completed", payload: { params: { item: { status: "failed", error: "nested failure", exitCode: 2 } } } }),
			activity({ id: "turn-end", sequence: 2, method: "turn/completed", turnId: "t", phase: "completed" }),
		]));
		expect(stats.failures).toEqual([expect.objectContaining({ activityId: "bad", summary: "nested failure", recovered: false, recoveryActivityId: null })]);
	});
	test("accepts only an explicit subsequent success for the same item as recovery", () => {
		const stats = projectSessionStats(snapshot([
			activity({ id: "bad", sequence: 1, method: "item/completed", turnId: "t", itemId: "x", kind: "tool", phase: "completed", payload: { exitCode: 1 } }),
			activity({ id: "retry", sequence: 2, method: "item/completed", turnId: "t", itemId: "x", kind: "tool", phase: "completed" }),
		]));
		expect(stats.failures[0]).toMatchObject({ recovered: true, recoveryActivityId: "retry" });
	});
	test("marks first output and unavailable provenance unknown when no text delta exists, and labels partial usage", () => {
		const stats = projectSessionStats(snapshot([activity({ id: "start", sequence: 1, method: "turn/started", turnId: "t", phase: "started" })], { sessionUsage: { totalTokens: 12, unattributedTokens: 1, models: [] } }));
		expect(stats.turns[0]).toMatchObject({ firstOutputMs: null, firstOutputAuthority: "unknown" });
		expect(stats.usage).toMatchObject({ authority: "since-process-attach" });
		expect(stats.usage.limitation).toContain("resumed");
	});
	test("keeps claims sourced and bounds long activity source lists", () => {
		const activities = Array.from({ length: 20 }, (_, index) => activity({ id: `a${index}`, sequence: index + 1, method: "turn/started", turnId: "t" }));
		const stats = projectSessionStats(snapshot(activities));
		expect(stats.summary.purpose).toMatchObject({ text: "unknown", authority: "unknown", sourceActivityIds: [] });
		expect(stats.summary.actions.authority).toBe("www-observed");
		expect(stats.session.activityIds.at(-1)).toContain("omitted");
	});

	test("counts only root-thread turns as requests while retaining child work as agent activity", () => {
		const stats = projectSessionStats(snapshot([
			activity({ id: "root-start", sequence: 1, method: "turn/started", turnId: "root-turn", phase: "started" }),
			{ ...activity({ id: "child-start", sequence: 2, method: "turn/started", turnId: "child-turn", phase: "started" }), nativeRefs: { threadId: "child-thread", turnId: "child-turn" } },
			{ ...activity({ id: "child-agent", sequence: 3, method: "item/started", turnId: "child-turn", itemId: "agent-1", kind: "tool", payload: { params: { item: { type: "subAgentActivity" } } } }), nativeRefs: { threadId: "child-thread", turnId: "child-turn", itemId: "agent-1" } },
			{ ...activity({ id: "child-end", sequence: 4, method: "turn/completed", turnId: "child-turn", phase: "completed" }), nativeRefs: { threadId: "child-thread", turnId: "child-turn" } },
			activity({ id: "root-end", sequence: 5, method: "turn/completed", turnId: "root-turn", phase: "completed" }),
		]));
		expect(stats.session).toMatchObject({ turns: 1, completedTurns: 1, agentOperations: 1 });
		expect(stats.turns.map(turn => turn.id)).toEqual(["root-turn"]);
	});

	test("counts collab wait operations once and does not double-count approval as wait", () => {
		const stats = projectSessionStats(snapshot([
			activity({ id: "wait-start", sequence: 1, method: "item/started", turnId: "t", itemId: "wait-1", kind: "tool", phase: "started", payload: { params: { item: { type: "collabAgentToolCall", tool: "wait" } } } }),
			activity({ id: "wait-end", sequence: 2, method: "item/completed", turnId: "t", itemId: "wait-1", kind: "tool", phase: "completed", payload: { params: { item: { type: "collabAgentToolCall", tool: "wait" } } } }),
			activity({ id: "approval", sequence: 3, method: "unknown", turnId: "t", kind: "approval", phase: "started", payload: { eventType: "approval-requested", approval: { requestId: "r" } } }),
		]));
		expect(stats.session).toMatchObject({ waits: 1, approvals: 1 });
		expect(stats.turns[0]).toMatchObject({ waits: 1, approvals: 1 });
	});
});

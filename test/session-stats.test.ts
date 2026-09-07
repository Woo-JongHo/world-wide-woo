import { describe, expect, test } from "bun:test";
import type { ProjectActivity } from "../src/domain/project-activity";
import type { WorkbenchSnapshot } from "../src/domain/workbench";
import { projectSessionStats } from "../src/domain/session-stats";

function activity(input: { id: string; sequence: number; method: string; kind?: ProjectActivity["kind"]; phase?: ProjectActivity["phase"]; turnId?: string; itemId?: string; payload?: Record<string, unknown>; approvalRequestId?: string }): ProjectActivity {
	return { schemaVersion: 1, id: input.id, projectId: "project", sequence: input.sequence, recordedAt: `2026-09-03T00:00:${String(input.sequence).padStart(2, "0")}.000Z`, kind: input.kind ?? "progress", phase: input.phase ?? "updated", provider: "openai-codex", nativeRefs: { threadId: "thread", turnId: input.turnId, itemId: input.itemId, approvalRequestId: input.approvalRequestId }, sourceDigest: `sha256:${input.id.padEnd(64, "0").slice(0, 64)}`, payload: { method: input.method, ...input.payload } };
}
function snapshot(activities: ProjectActivity[], extra: Record<string, unknown> = {}): WorkbenchSnapshot { return { projectId: "project", threadId: "thread", phase: "ready", activities, sessionGoal: null, tnotes: [], workFlow: { goal: null, currentStepNumber: null, steps: [] }, ...extra } as unknown as WorkbenchSnapshot; }
function request(id: string, sequence: number, suffix: string, payload: Record<string, unknown> = {}): ProjectActivity { return activity({ id: `${id}-${suffix}`, sequence, method: `request/${suffix}`, itemId: id, payload: { requestId: id, ...payload } }); }

// @linear WOO-714
describe("session review projection", () => {
	test("A: projects an empty session without unavailable compatibility fields", () => {
		const stats = projectSessionStats(snapshot([]));
		expect(stats).toMatchObject({ state: "empty", coverage: "unknown", observedTotalTokens: null, lifecycle: { rootTurns: 0 } });
		expect(stats).not.toHaveProperty("speed");
		expect(stats).not.toHaveProperty("turns");
	});

	test("distinguishes unobserved token usage from an observed zero", () => {
		const unobserved = projectSessionStats(snapshot([activity({ id: "event", sequence: 1, method: "event" })]));
		const zero = projectSessionStats(snapshot([activity({ id: "event", sequence: 1, method: "event" })], {
			sessionUsage: { totalTokens: 0, observedTotalTokens: 0, unattributedTokens: 0, models: [], observationCoverage: { interactive: true, detached: false } },
		}));
		expect(unobserved.observedTotalTokens).toBeNull();
		expect(zero.observedTotalTokens).toBe(0);
	});

	test("B: preserves a single model's three successful root turns", () => {
		const activities = ["one", "two", "three"].flatMap((turnId, index) => [activity({ id: `${turnId}-start`, sequence: index * 2 + 1, method: "turn/started", turnId, phase: "started" }), activity({ id: `${turnId}-end`, sequence: index * 2 + 2, method: "turn/completed", turnId, phase: "completed" })]);
		const stats = projectSessionStats(snapshot(activities, { sessionUsage: { totalTokens: 30, observedTotalTokens: 30, unattributedTokens: 0, models: [{ model: "gpt", effort: "high", interactiveRootTurns: 3, interactiveTokens: 30, detachedInvocations: 0, detachedTokens: 0, totalTokens: 30 }], observationCoverage: { interactive: true, detached: false } } }));
		expect(stats.lifecycle).toMatchObject({ rootTurns: 3, completedRootTurns: 3, activeRootTurns: 0 });
		expect(stats.modelUsage).toEqual([expect.objectContaining({ namespace: "interactive", interactiveRootTurns: 3, totalTokens: 30 })]);
	});

	test("C: separates interactive and detached model namespaces", () => {
		const stats = projectSessionStats(snapshot([], { sessionUsage: { totalTokens: 5, observedTotalTokens: 5, unattributedTokens: 0, models: [{ model: "a", effort: null, interactiveRootTurns: 1, interactiveTokens: 3, detachedInvocations: 2, detachedTokens: 2, totalTokens: 5 }], observationCoverage: { interactive: true, detached: true } } }));
		expect(stats.modelUsage).toEqual([
			expect.objectContaining({ namespace: "interactive", detachedInvocations: 0, totalTokens: 3 }),
			expect.objectContaining({ namespace: "detached", interactiveRootTurns: 0, detachedInvocations: 2, totalTokens: 2 }),
		]);
	});

	test("D: reports recovery only for an explicit later success with the same concrete item ID", () => {
		const stats = projectSessionStats(snapshot([activity({ id: "bad", sequence: 1, method: "item/completed", turnId: "t", itemId: "x", kind: "tool", phase: "completed", payload: { exitCode: 1 } }), activity({ id: "other", sequence: 2, method: "item/completed", turnId: "t", itemId: "y", kind: "tool", phase: "completed" }), activity({ id: "fixed", sequence: 3, method: "item/completed", turnId: "t", itemId: "x", kind: "tool", phase: "completed" })]));
		expect(stats.issues).toEqual([expect.objectContaining({ activityId: "bad", recovered: true, recoveryActivityId: "fixed" })]);
	});

	test("E: measures only paired approval time", () => {
		const stats = projectSessionStats(snapshot([activity({ id: "approval", sequence: 1, method: "approval/request", kind: "approval", phase: "started", approvalRequestId: "r", payload: { eventType: "approval-requested" } }), activity({ id: "resolved", sequence: 11, method: "approval/resolve", kind: "approval", phase: "completed", approvalRequestId: "r", payload: { eventType: "approval-resolved" } })]));
		expect(stats.performance.averageApprovalWaitMs).toBe(10_000);
	});

	test("F: labels resumed local observations as partial coverage", () => {
		const stats = projectSessionStats(snapshot([
			activity({ id: "a", sequence: 1, method: "item/updated", turnId: "partially-observed-turn", kind: "tool" }),
		], { resumeCoverage: { mode: "partial-local-journal" } }));
		expect(stats).toMatchObject({ state: "observed", coverage: "partial-local-journal", lifecycle: { rootTurns: 1, activeRootTurns: 0 } });
	});

	test.each([
		["active", [activity({ id: "active", sequence: 1, method: "turn/started", turnId: "active", phase: "started" })]],
		["failed", [activity({ id: "failed", sequence: 1, method: "turn/failed", turnId: "failed", phase: "failed" })]],
		["cancelled", [activity({ id: "cancelled", sequence: 1, method: "turn/cancelled", turnId: "cancelled", phase: "cancelled" })]],
		["completed", [activity({ id: "completed", sequence: 1, method: "turn/completed", turnId: "completed", phase: "completed" })]],
	] as const)("projects the %s observed session state", (state, activities) => {
		expect(projectSessionStats(snapshot([...activities])).state).toBe(state);
	});

	test("classifies native turn/completed events by the nested turn status", () => {
		const stats = projectSessionStats(snapshot([
			activity({ id: "completed-start", sequence: 1, method: "turn/started", turnId: "completed", phase: "started" }),
			activity({ id: "completed-end", sequence: 2, method: "turn/completed", turnId: "completed", phase: "completed", payload: { params: { turn: { status: "completed", error: null } } } }),
			activity({ id: "interrupted-start", sequence: 3, method: "turn/started", turnId: "interrupted", phase: "started" }),
			activity({ id: "interrupted-end", sequence: 4, method: "turn/completed", turnId: "interrupted", phase: "completed", payload: { params: { turn: { status: "interrupted", error: null } } } }),
			activity({ id: "failed-start", sequence: 5, method: "turn/started", turnId: "failed", phase: "started" }),
			activity({ id: "failed-end", sequence: 6, method: "turn/completed", turnId: "failed", phase: "completed", payload: { params: { turn: { status: "failed", error: { message: "boom" } } } } }),
		]));

		expect(stats.state).toBe("failed");
		expect(stats.lifecycle).toMatchObject({
			rootTurns: 3,
			completedRootTurns: 1,
			failedRootTurns: 1,
			cancelledRootTurns: 1,
		});
		expect(stats.performance).toMatchObject({
			averageCompletedRootTurnMs: 1_000,
			completedRootTurnDurationObservations: 1,
		});
		expect(stats.issues).toEqual([
			expect.objectContaining({ activityId: "failed-end", turnId: "failed", recovered: false }),
		]);
	});

	test.each([
		["failed", "failed"],
		["cancelled", "cancelled"],
	] as const)("honors a corrected %s activity phase for turn/completed", (state, phase) => {
		const stats = projectSessionStats(snapshot([
			activity({ id: "start", sequence: 1, method: "turn/started", turnId: "turn", phase: "started" }),
			activity({ id: "end", sequence: 2, method: "turn/completed", turnId: "turn", phase, payload: { params: { turn: { status: "completed", error: null } } } }),
		]));
		expect(stats.lifecycle).toMatchObject({ [`${state}RootTurns`]: 1, completedRootTurns: 0 });
	});

	test("G: gives unattributed usage its own warning", () => {
		const stats = projectSessionStats(snapshot([], { sessionUsage: { totalTokens: 2, observedTotalTokens: 2, unattributedTokens: 2, models: [], observationCoverage: { interactive: true, detached: false } } }));
		expect(stats).toMatchObject({ observedTotalTokens: 2, unattributedUsage: { totalTokens: 2 } });
		expect(stats.diagnostics.warnings).toHaveLength(1);
	});

	test("H: keeps details bounded and shortlists issues before slowest and recent requests", () => {
		const activities = Array.from({ length: 51 }, (_, index) => [request(`r${index}`, index * 2 + 1, "submitted", { text: `request ${index}` }), request(`r${index}`, index * 2 + 2, index === 0 ? "failed" : "completed")]).flat();
		const stats = projectSessionStats(snapshot(activities));
		expect(stats.requests).toMatchObject({ submitted: 51, omittedCount: 0 });
		expect(stats.requests.shortlist).toHaveLength(8);
		expect(stats.requests.shortlist[0]).toMatchObject({ requestId: "r0", lifecycle: "failed" });
		expect(stats.requests.shortlist.flatMap(row => row.sourceActivityIds).some(id => id.includes("omitted"))).toBe(false);
	});

	test("retains every shortlisted issue for drill-down beyond one thousand requests", () => {
		const activities = Array.from({ length: 1005 }, (_, index) => [
			request(`long-${index}`, index * 2 + 1, "submitted", { text: `request ${index}` }),
			request(`long-${index}`, index * 2 + 2, index === 0 ? "failed" : "completed"),
		]).flat();
		const stats = projectSessionStats(snapshot(activities));
		expect(stats.requests.details).toHaveLength(1000);
		expect(stats.requests.omittedCount).toBe(5);
		for (const selected of stats.requests.shortlist) {
			expect(stats.requests.details.some(detail => detail.ordinal === selected.ordinal)).toBe(true);
		}
	});

	test("does not assign elapsed time to an active root turn", () => {
		const stats = projectSessionStats(snapshot([activity({ id: "start", sequence: 1, method: "turn/started", turnId: "t", phase: "started" }), activity({ id: "later", sequence: 2, method: "event", turnId: "t" })]));
		expect(stats.lifecycle.activeRootTurns).toBe(1);
		expect(stats.performance.averageCompletedRootTurnMs).toBeNull();
		expect(stats.performance.completedRootTurnDurationObservations).toBe(0);
	});

	test("excludes a completed root turn without an observed start from elapsed averages", () => {
		const stats = projectSessionStats(snapshot([
			activity({ id: "terminal-only", sequence: 2, method: "turn/completed", turnId: "t", phase: "completed" }),
		]));
		expect(stats.lifecycle).toMatchObject({ rootTurns: 1, completedRootTurns: 1 });
		expect(stats.performance).toMatchObject({ averageCompletedRootTurnMs: null, completedRootTurnDurationObservations: 0 });
	});

	test("uses root turns and paired observations as the explicit performance denominators", () => {
		const activities = [
			request("request-1", 1, "submitted", { text: "one user request" }),
			activity({ id: "t1-start", sequence: 2, method: "turn/started", turnId: "t1", phase: "started" }),
			activity({ id: "t1-first", sequence: 3, method: "turn/first-output-observed", turnId: "t1", phase: "completed" }),
			activity({ id: "tool-start", sequence: 4, method: "item/started", turnId: "t1", itemId: "tool-1", kind: "tool", phase: "started" }),
			activity({ id: "tool-end", sequence: 5, method: "item/completed", turnId: "t1", itemId: "tool-1", kind: "tool", phase: "completed" }),
			activity({ id: "approval-start", sequence: 6, method: "approval/request", turnId: "t1", kind: "approval", phase: "started", approvalRequestId: "approval-1", payload: { eventType: "approval-requested" } }),
			activity({ id: "approval-end", sequence: 7, method: "approval/resolve", turnId: "t1", kind: "approval", phase: "completed", approvalRequestId: "approval-1", payload: { eventType: "approval-resolved" } }),
			activity({ id: "unpaired-tool-end", sequence: 8, method: "item/completed", turnId: "t1", itemId: "tool-2", kind: "tool", phase: "completed" }),
			activity({ id: "t1-end", sequence: 9, method: "turn/completed", turnId: "t1", phase: "completed" }),
			activity({ id: "t2-start", sequence: 10, method: "turn/started", turnId: "t2", phase: "started" }),
			activity({ id: "t2-end", sequence: 12, method: "turn/completed", turnId: "t2", phase: "completed" }),
		];
		const stats = projectSessionStats(snapshot(activities, {
			sessionUsage: { totalTokens: 1_000, observedTotalTokens: 1_000, unattributedTokens: 0, models: [{ model: "gpt", effort: null, interactiveRootTurns: 2, interactiveTokens: 100, detachedInvocations: 3, detachedTokens: 900, totalTokens: 1_000 }], observationCoverage: { interactive: true, detached: true } },
		}));
		expect(stats.requests.submitted).toBe(1);
		expect(stats.lifecycle.rootTurns).toBe(2);
		expect(stats.observedTotalTokens).toBe(1_000);
		expect(stats.performance).toMatchObject({
			averageCompletedRootTurnMs: 4_500,
			completedRootTurnDurationObservations: 2,
			pairedToolTimeMs: 1_000,
			pairedToolObservations: 1,
			averageApprovalWaitMs: 1_000,
			pairedApprovalWaitObservations: 1,
			averageFirstOutputMs: 1_000,
			firstOutputObservations: 1,
			interactiveTokensPerCompletedRootTurn: 50,
		});
		expect(stats.modelUsage).toEqual([
			expect.objectContaining({ namespace: "interactive", interactiveRootTurns: 2, totalTokens: 100 }),
			expect.objectContaining({ namespace: "detached", detachedInvocations: 3, totalTokens: 900 }),
		]);
	});

	test("captures the first output milestone from a text delta", () => {
		const stats = projectSessionStats(snapshot([activity({ id: "start", sequence: 1, method: "turn/started", turnId: "t", phase: "started" }), activity({ id: "first-output", sequence: 4, method: "turn/first-output-observed", turnId: "t", phase: "completed" }), activity({ id: "end", sequence: 5, method: "turn/completed", turnId: "t", phase: "completed" })]));
		expect(stats.performance.averageFirstOutputMs).toBe(3000);
	});

	test("does not classify error:null as a failure and marks t-note results unverified", () => {
		const stats = projectSessionStats(snapshot([activity({ id: "ok", sequence: 1, method: "item/completed", phase: "completed", payload: { error: null } })], { tnotes: [{ id: "note", title: "title", summary: "결과: done", sourceActivityIds: ["ok"], updatedAt: "2026-09-03T00:00:01.000Z" }] }));
		expect(stats.issues).toEqual([]);
		expect(stats.claims.result).toMatchObject({ text: "done", authority: "t-note", independentlyVerified: false });
	});
});

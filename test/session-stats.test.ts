import { describe, expect, test } from "bun:test";
import type { ProjectActivity } from "../src/domain/project-activity";
import type { WorkbenchSnapshot } from "../src/domain/workbench";
import { projectSessionStats } from "../src/domain/session-stats";

function activity(input: { id: string; sequence: number; method: string; kind?: ProjectActivity["kind"]; phase?: ProjectActivity["phase"]; turnId?: string; itemId?: string; payload?: Record<string, unknown>; approvalRequestId?: string }): ProjectActivity {
	return { schemaVersion: 1, id: input.id, projectId: "project", sequence: input.sequence, recordedAt: `2026-09-03T00:00:${String(input.sequence).padStart(2, "0")}.000Z`, kind: input.kind ?? "progress", phase: input.phase ?? "updated", provider: "openai-codex", nativeRefs: { threadId: "thread", turnId: input.turnId, itemId: input.itemId, approvalRequestId: input.approvalRequestId }, sourceDigest: `sha256:${input.id.padEnd(64, "0").slice(0, 64)}`, payload: { method: input.method, ...input.payload } };
}
function snapshot(activities: ProjectActivity[], extra: Record<string, unknown> = {}): WorkbenchSnapshot { return { projectId: "project", threadId: "thread", phase: "ready", activities, sessionGoal: null, tnotes: [], workFlow: { goal: null, currentStepNumber: null, steps: [] }, ...extra } as unknown as WorkbenchSnapshot; }
function request(id: string, sequence: number, suffix: string, payload: Record<string, unknown> = {}): ProjectActivity { return activity({ id: `${id}-${suffix}`, sequence, method: `request/${suffix}`, itemId: id, payload: { requestId: id, ...payload } }); }

describe("session review projection", () => {
	test("A: projects an empty session without unavailable compatibility fields", () => {
		const stats = projectSessionStats(snapshot([]));
		expect(stats).toMatchObject({ state: "empty", coverage: "unknown", lifecycle: { rootTurns: 0 } });
		expect(stats).not.toHaveProperty("speed");
		expect(stats).not.toHaveProperty("turns");
	});

	test("B: preserves a single model's three successful root turns", () => {
		const activities = ["one", "two", "three"].flatMap((turnId, index) => [activity({ id: `${turnId}-start`, sequence: index * 2 + 1, method: "turn/started", turnId, phase: "started" }), activity({ id: `${turnId}-end`, sequence: index * 2 + 2, method: "turn/completed", turnId, phase: "completed" })]);
		const stats = projectSessionStats(snapshot(activities, { sessionUsage: { totalTokens: 30, unattributedTokens: 0, models: [{ model: "gpt", effort: "high", interactiveRootTurns: 3, interactiveTokens: 30, detachedInvocations: 0, detachedTokens: 0, totalTokens: 30 }] } }));
		expect(stats.lifecycle).toMatchObject({ rootTurns: 3, completedRootTurns: 3, activeRootTurns: 0 });
		expect(stats.modelUsage).toEqual([expect.objectContaining({ namespace: "interactive", interactiveRootTurns: 3, totalTokens: 30 })]);
	});

	test("C: separates interactive and detached model namespaces", () => {
		const stats = projectSessionStats(snapshot([], { sessionUsage: { totalTokens: 5, unattributedTokens: 0, models: [{ model: "a", effort: null, interactiveRootTurns: 1, interactiveTokens: 3, detachedInvocations: 2, detachedTokens: 2, totalTokens: 5 }] } }));
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
		const stats = projectSessionStats(snapshot([activity({ id: "a", sequence: 1, method: "event" })], { resumeCoverage: { mode: "partial-local-journal" } }));
		expect(stats.coverage).toBe("partial-local-journal");
	});

	test("G: gives unattributed usage its own warning", () => {
		const stats = projectSessionStats(snapshot([], { sessionUsage: { totalTokens: 12, unattributedTokens: 2, models: [] } }));
		expect(stats.unattributedUsage).toMatchObject({ totalTokens: 2 });
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

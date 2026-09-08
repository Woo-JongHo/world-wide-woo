import { describe, expect, test } from "bun:test";
import { stripTerminalSequences, visibleWidth } from "@earendil-works/pi-tui";
import type { ProjectActivity } from "../src/core/domain/project-activity";
import type { SessionStatsSnapshot } from "../src/core/domain/session-stats";
import { projectSessionStats } from "../src/core/domain/session-stats";
import type { WorkbenchSnapshot } from "../src/core/domain/workbench";
import { SessionStatsView } from "../src/adapters/inbound/tui/session-stats-view";

const longPrompt = "Implement review dashboard with a very long raw prompt that must never wrap into a conversation transcript or occupy several dashboard rows";
const request = { ordinal: 1, requestId: "hidden-id", turnId: "turn-1", excerpt: longPrompt, excerptSourceActivityId: "activity-1", lifecycle: "completed", observedElapsedMs: 30_000, models: ["gpt-5.4-sol"], sourceActivityIds: ["activity-1"] } as const;
const stats: SessionStatsSnapshot = {
	state: "completed", coverage: "fresh", activeModel: "gpt-5.4-sol", observedTotalTokens: 5_948_459, usageObservationCoverage: { interactive: true, detached: false },
	lifecycle: { threadId: "st011-acceptance-hardening", startedAt: null, endedAt: null, journalSpanMs: 1_478_000, rootTurns: 8, completedRootTurns: 8, failedRootTurns: 0, cancelledRootTurns: 0, activeRootTurns: 0, boundaryOnlyRootTurns: 0 },
	performance: { journalSpanMs: 1_478_000, rootTurnCompletionPercent: 100, averageCompletedRootTurnMs: 114_000, completedRootTurnDurationObservations: 8, pairedToolTimeMs: 532_000, pairedToolObservations: 12, averageApprovalWaitMs: null, totalApprovalWaitMs: null, pairedApprovalWaitObservations: 0, averageFirstOutputMs: 3_200, firstOutputObservations: 7, interactiveTokensPerCompletedRootTurn: 743_557 },
	modelUsage: [{ namespace: "interactive", model: "gpt-5.4-sol", effort: "high", interactiveRootTurns: 8, detachedInvocations: 0, totalTokens: 5_948_459 }], unattributedUsage: null,
	claims: { purpose: { text: "unknown", authority: "unknown", sourceActivityIds: [], independentlyVerified: false }, actions: { text: "3 activities", authority: "journal", sourceActivityIds: [], independentlyVerified: false }, result: { text: "unknown", authority: "unknown", sourceActivityIds: [], independentlyVerified: false } },
	requests: { submitted: 1, shortlist: [request], details: [request], omittedCount: 0 }, issues: [],
	diagnostics: { activityCounts: { message: 3 }, retryCount: 1, waitCount: 2, compactionCount: 0, providerMetricsUnavailable: ["provider wait timing"], warnings: [] },
};

function projectedStats(methods: readonly string[], partial = false): SessionStatsSnapshot {
	const activities = methods.map((method, index): ProjectActivity => ({
		schemaVersion: 1,
		id: `activity-${index}`,
		projectId: "project",
		sequence: index + 1,
		recordedAt: `2026-09-07T00:00:${String(index).padStart(2, "0")}.000Z`,
		kind: "progress",
		phase: method.endsWith("started") ? "started" : method.includes("failed") ? "failed" : method.includes("cancelled") ? "cancelled" : "completed",
		provider: "openai-codex",
		nativeRefs: { threadId: "thread", turnId: `turn-${index}` },
		sourceDigest: `sha256:${String(index).padEnd(64, "0")}`,
		payload: { method },
	}));
	return projectSessionStats({
		projectId: "project", threadId: "thread", phase: "ready", activities,
		sessionUsage: { totalTokens: 0, observedTotalTokens: null, unattributedTokens: 0, models: [], observationCoverage: { interactive: false, detached: false } },
		resumeCoverage: partial ? { mode: "partial-local-journal", processAttachedAt: "2026-09-07T00:00:00.000Z", priorProviderHistoryHydrated: false } : { mode: "fresh", processAttachedAt: "2026-09-07T00:00:00.000Z", priorProviderHistoryHydrated: false },
		sessionGoal: null, tnotes: [], workFlow: { goal: null, currentStepNumber: null, steps: [] },
	} as unknown as WorkbenchSnapshot);
}

// @linear WOO-714
describe("session stats view", () => {
	test("renders a visual dashboard with KPI, usage bar, compact metrics, and request table", () => {
		const output = stripTerminalSequences(new SessionStatsView(() => stats).render(160).join("\n"));
		for (const text of ["WORLD WIDE WOO · SESSION STATS", "COMPLETION", "24m38s", "5.95M", "MODEL USAGE", "████", "PERFORMANCE", "REQUESTS · 1", "✓ No orchestration issues observed"]) expect(output).toContain(text);
		for (const reportText of ["SESSION REVIEW", "RESULT NARRATIVE", "Source authority", "interactive turns"]) expect(output).not.toContain(reportText);
	});
	test("keeps request prompts to one truncated table row", () => {
		for (const width of [80, 120, 160]) {
			const output = stripTerminalSequences(new SessionStatsView(() => stats).render(width).join("\n"));
			expect(output).not.toContain(longPrompt);
			expect(output.match(/01\s+Implement review dashboard/g)?.length).toBe(1);
		}
	});
	test("marks the selected shortlist request so Enter has a visible target", () => {
		const output = stripTerminalSequences(new SessionStatsView(() => stats, () => "session", () => null, () => 1).render(120).join("\n"));
		expect(output).toContain("▶01");
	});
	test("keeps wide, normal, and narrow layouts bounded", () => {
		for (const width of [40, 42, 80, 109, 110, 120, 159, 160, 220]) for (const row of new SessionStatsView(() => stats).render(width)) expect(visibleWidth(row)).toBeLessThanOrEqual(width);
	});
	test("renders diagnostics and request investigation as separate top-level views", () => {
		const diagnostics = stripTerminalSequences(new SessionStatsView(() => stats, () => "diagnostics").render(100).join("\n"));
		expect(diagnostics).toContain("SESSION DIAGNOSTICS");
		expect(diagnostics).toContain("Retries");
		const detail = stripTerminalSequences(new SessionStatsView(() => stats, () => 1).render(100).join("\n"));
		expect(detail).toContain("REQUEST INVESTIGATION");
		expect(detail).toContain("Implement review dashboard with a very long raw prompt");
		expect(detail).toContain("conversation transcript or occupy several dashboard rows");
		expect(detail).toContain("/source activity-1");
		expect(detail).not.toContain("SESSION STATS");
	});
	test("keeps empty sessions quiet", () => {
		const empty = projectedStats([]);
		const output = stripTerminalSequences(new SessionStatsView(() => empty).render(80).join("\n"));
		expect(output).toContain("Waiting for the first request");
		expect(output).toContain("EMPTY · coverage fresh");
		expect(output).toContain("Token usage unobserved");
		expect(output).not.toContain("COMPLETED");
		for (const noise of ["PERFORMANCE", "MODEL USAGE", "REQUESTS", "Retries"]) expect(output).not.toContain(noise);
	});

	test("renders coverage, observation units, denominators, and acceptance boundary", () => {
		const partial = { ...stats, coverage: "partial-local-journal" as const };
		const output = stripTerminalSequences(new SessionStatsView(() => partial).render(160).join("\n"));
		for (const text of [
			"OBSERVED COMPLETED", "coverage partial local journal", "8/8 root turns", "observed namespaces",
			"ROOT TURN AVG", "8/8 completed pairs", "12 paired calls", "7/8 root turns", "interactive tokens ÷ 8 completed root turns",
			"Execution observations only", "not task acceptance", "Cost unavailable",
		]) expect(output).toContain(text);
		for (const misleading of ["REQUEST AVG", "TOKENS / REQUEST"]) expect(output).not.toContain(misleading);
	});

	test.each([
		["ACTIVE", ["turn/started"]],
		["FAILED", ["turn/failed"]],
		["CANCELLED", ["turn/cancelled"]],
		["OBSERVED", ["item/updated"]],
	] as const)("renders the %s observation state", (label, methods) => {
		const output = stripTerminalSequences(new SessionStatsView(() => projectedStats(methods)).render(160).join("\n"));
		expect(output).toContain(` · ${label} · coverage fresh`);
		expect(output).not.toContain("OBSERVED COMPLETED");
	});

	test("keeps mixed active, failed, cancelled, and completed root-turn outcomes visible", () => {
		const mixed = projectedStats(["turn/completed", "turn/failed", "turn/cancelled", "turn/started"]);
		const output = stripTerminalSequences(new SessionStatsView(() => mixed).render(160).join("\n"));
		expect(output).toContain(" · ACTIVE · coverage fresh");
		expect(output).toContain("ROOT OUTCOMES · completed 1 · failed 1 · cancelled 1 · active 1 · boundary-only 0");
	});

	test.each([40, 80, 120])("keeps every root outcome count above the first rule at %d columns", width => {
		const mixed = projectedStats(["turn/completed", "turn/failed", "turn/cancelled", "turn/started"]);
		const rows = new SessionStatsView(() => mixed).render(width).map(stripTerminalSequences);
		const firstRule = rows.findIndex(row => /^─+$/u.test(row));
		const header = rows.slice(0, firstRule).join(" ").replace(/\s+/gu, " ");
		expect(header).toContain("ROOT OUTCOMES · completed 1 · failed 1 · cancelled 1 · active 1 · boundary-only 0");
		for (const row of rows) expect(visibleWidth(row)).toBeLessThanOrEqual(width);
	});

	test("discloses partial coverage and excludes a terminal-only root turn from elapsed pairs", () => {
		const partial = projectedStats(["turn/completed"], true);
		const output = stripTerminalSequences(new SessionStatsView(() => partial).render(160).join("\n"));
		expect(output).toContain("coverage partial local journal");
		expect(output).toContain("0/1 completed pairs");
		expect(output).toContain("Elapsed pairs use local journal start → terminal only");
		expect(partial.performance.averageCompletedRootTurnMs).toBeNull();
	});

	test("renders observed zero tokens differently from unobserved usage", () => {
		const zero = stripTerminalSequences(new SessionStatsView(() => ({ ...stats, observedTotalTokens: 0, usageObservationCoverage: { interactive: true, detached: false }, modelUsage: [] })).render(120).join("\n"));
		const unobserved = stripTerminalSequences(new SessionStatsView(() => ({ ...stats, observedTotalTokens: null, usageObservationCoverage: { interactive: false, detached: false }, performance: { ...stats.performance, interactiveTokensPerCompletedRootTurn: null }, modelUsage: [] })).render(120).join("\n"));
		expect(zero).toContain("observed namespaces");
		expect(zero).toContain("0 observed tokens");
		expect(zero).toContain("interactive observed · detached unobserved");
		expect(unobserved).toContain("usage unobserved");
		expect(unobserved).toContain("Token usage unobserved");
	});
	test("renders a conservatively bounded historical session drilldown", () => {
		const historical = {
			sessionId: "thread-history", projectId: null, boundary: "observed" as const,
			startedAt: "2026-09-01T00:00:00Z", endedAt: "2026-09-01T00:01:00Z",
			result: "completed" as const, failures: 0, retries: 0, usage: null,
		};
		const output = stripTerminalSequences(new SessionStatsView(() => stats, () => "session", () => historical).render(100).join("\n"));
		expect(output).toContain("thread-history · COMPLETED");
		expect(output).toContain("TOKENS       —");
		expect(output).toContain("Request details and live execution are unavailable");
	});
});

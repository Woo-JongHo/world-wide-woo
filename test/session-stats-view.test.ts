import { describe, expect, test } from "bun:test";
import { stripTerminalSequences, visibleWidth } from "@earendil-works/pi-tui";
import type { SessionStatsSnapshot } from "../src/domain/session-stats";
import { SessionStatsView } from "../src/presentation/tui/session-stats-view";

const request = { ordinal: 1, requestId: "hidden-id", turnId: "turn-1", excerpt: "Implement review dashboard", excerptSourceActivityId: "activity-1", lifecycle: "completed", observedElapsedMs: 30_000, models: ["gpt-5.4"], sourceActivityIds: ["activity-1"] } as const;
const stats: SessionStatsSnapshot = {
	state: "observed", coverage: "fresh", activeModel: "gpt-5.4",
	lifecycle: { threadId: "thread-1", startedAt: null, endedAt: null, journalSpanMs: 60_000, rootTurns: 3, completedRootTurns: 3, failedRootTurns: 0, cancelledRootTurns: 0, activeRootTurns: 0 },
	performance: { journalSpanMs: 60_000, rootTurnCompletionPercent: 100, averageCompletedRootTurnMs: 20_000, pairedToolTimeMs: 3_000, averageApprovalWaitMs: null, totalApprovalWaitMs: null, averageFirstOutputMs: 1_000, interactiveTokensPerCompletedRootTurn: 1400 },
	modelUsage: [{ namespace: "interactive", model: "gpt-5.4", effort: "high", interactiveRootTurns: 3, detachedInvocations: 0, totalTokens: 4200 }], unattributedUsage: null,
	claims: { purpose: { text: "Implement dashboard", authority: "session-goal", sourceActivityIds: ["goal-1"], independentlyVerified: false }, actions: { text: "3 activities", authority: "journal", sourceActivityIds: [], independentlyVerified: false }, result: { text: "Completed", authority: "t-note", sourceActivityIds: [], independentlyVerified: false } },
	requests: { submitted: 1, shortlist: [request], details: [request], omittedCount: 0 }, issues: [],
	diagnostics: { activityCounts: { message: 3 }, retryCount: 1, waitCount: 2, compactionCount: 0, providerMetricsUnavailable: ["provider wait timing"], warnings: [] },
};

describe("session stats view", () => {
	test("renders review-first session semantics without diagnostics or raw request IDs", () => {
		const output = stripTerminalSequences(new SessionStatsView(() => stats).render(120).join("\n"));
		for (const text of ["SESSION REVIEW", "PURPOSE", "RESULT NARRATIVE", "UNVERIFIED", "PERFORMANCE", "MODEL USAGE", "interactive turns", "REQUESTS", "WWW local journal"]) expect(output).toContain(text);
		expect(output).not.toContain("ISSUES");
		expect(output).not.toContain("hidden-id");
		expect(output).not.toContain("Retries");
	});
	test("keeps all responsive layouts bounded", () => {
		for (const width of [42, 80, 120, 160, 220]) for (const row of new SessionStatsView(() => stats).render(width)) expect(visibleWidth(row)).toBeLessThanOrEqual(width);
	});
	test("renders diagnostics and request investigation as separate top-level views", () => {
		const diagnostics = stripTerminalSequences(new SessionStatsView(() => stats, () => "diagnostics").render(100).join("\n"));
		expect(diagnostics).toContain("SESSION DIAGNOSTICS");
		expect(diagnostics).toContain("Retries");
		const detail = stripTerminalSequences(new SessionStatsView(() => stats, () => 1).render(100).join("\n"));
		expect(detail).toContain("REQUEST INVESTIGATION");
		expect(detail).toContain("/source activity-1");
		expect(detail).not.toContain("SESSION REVIEW");
	});
	test("keeps empty sessions quiet", () => {
		const empty = { ...stats, state: "empty" as const, modelUsage: [], requests: { submitted: 0, shortlist: [], details: [], omittedCount: 0 }, issues: [] };
		const output = stripTerminalSequences(new SessionStatsView(() => empty).render(80).join("\n"));
		expect(output).toContain("Waiting for the first request");
		expect(output).toContain("Active model · gpt-5.4");
		for (const noise of ["PERFORMANCE", "MODEL USAGE", "REQUESTS", "ISSUES", "Retries"]) expect(output).not.toContain(noise);
	});
});

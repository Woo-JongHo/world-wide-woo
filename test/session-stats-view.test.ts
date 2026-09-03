import { describe, expect, test } from "bun:test";
import { stripTerminalSequences, visibleWidth } from "@earendil-works/pi-tui";
import type { SessionStatsSnapshot } from "../src/domain/session-stats";
import { SessionStatsView } from "../src/presentation/tui/session-stats-view";

const longPrompt = "Implement review dashboard with a very long raw prompt that must never wrap into a conversation transcript or occupy several dashboard rows";
const request = { ordinal: 1, requestId: "hidden-id", turnId: "turn-1", excerpt: longPrompt, excerptSourceActivityId: "activity-1", lifecycle: "completed", observedElapsedMs: 30_000, models: ["gpt-5.4-sol"], sourceActivityIds: ["activity-1"] } as const;
const stats: SessionStatsSnapshot = {
	state: "observed", coverage: "fresh", activeModel: "gpt-5.4-sol",
	lifecycle: { threadId: "st011-acceptance-hardening", startedAt: null, endedAt: null, journalSpanMs: 1_478_000, rootTurns: 8, completedRootTurns: 8, failedRootTurns: 0, cancelledRootTurns: 0, activeRootTurns: 0 },
	performance: { journalSpanMs: 1_478_000, rootTurnCompletionPercent: 100, averageCompletedRootTurnMs: 114_000, pairedToolTimeMs: 532_000, averageApprovalWaitMs: null, totalApprovalWaitMs: null, averageFirstOutputMs: 3_200, interactiveTokensPerCompletedRootTurn: 743_557 },
	modelUsage: [{ namespace: "interactive", model: "gpt-5.4-sol", effort: "high", interactiveRootTurns: 8, detachedInvocations: 0, totalTokens: 5_948_459 }], unattributedUsage: null,
	claims: { purpose: { text: "unknown", authority: "unknown", sourceActivityIds: [], independentlyVerified: false }, actions: { text: "3 activities", authority: "journal", sourceActivityIds: [], independentlyVerified: false }, result: { text: "unknown", authority: "unknown", sourceActivityIds: [], independentlyVerified: false } },
	requests: { submitted: 1, shortlist: [request], details: [request], omittedCount: 0 }, issues: [],
	diagnostics: { activityCounts: { message: 3 }, retryCount: 1, waitCount: 2, compactionCount: 0, providerMetricsUnavailable: ["provider wait timing"], warnings: [] },
};

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
	test("keeps wide, normal, and narrow layouts bounded", () => {
		for (const width of [42, 80, 109, 110, 159, 160, 220]) for (const row of new SessionStatsView(() => stats).render(width)) expect(visibleWidth(row)).toBeLessThanOrEqual(width);
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
		const empty = { ...stats, state: "empty" as const, modelUsage: [], requests: { submitted: 0, shortlist: [], details: [], omittedCount: 0 }, issues: [] };
		const output = stripTerminalSequences(new SessionStatsView(() => empty).render(80).join("\n"));
		expect(output).toContain("Waiting for the first request");
		for (const noise of ["PERFORMANCE", "MODEL USAGE", "REQUESTS", "Retries"]) expect(output).not.toContain(noise);
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

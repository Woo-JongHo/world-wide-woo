import * as before from "./before";
import * as after from "../../../../src/adapters/inbound/tui/features/stats/view/session-stats-view";
import { runGolden } from "../golden-lib";

const longPrompt = "Implement review dashboard with a very long raw prompt that must never wrap into a conversation transcript or occupy several dashboard rows";
const request = { ordinal: 1, requestId: "hidden-id", turnId: "turn-1", excerpt: longPrompt, excerptSourceActivityId: "activity-1", lifecycle: "completed", observedElapsedMs: 30_000, models: ["gpt-5.4-sol"], sourceActivityIds: ["activity-1"] } as const;
const stats: any = {
	state: "completed", coverage: "fresh", activeModel: "gpt-5.4-sol", observedTotalTokens: 5_948_459, usageObservationCoverage: { interactive: true, detached: false },
	lifecycle: { threadId: "st011-acceptance-hardening", startedAt: null, endedAt: null, journalSpanMs: 1_478_000, rootTurns: 8, completedRootTurns: 8, failedRootTurns: 0, cancelledRootTurns: 0, activeRootTurns: 0, boundaryOnlyRootTurns: 0 },
	performance: { journalSpanMs: 1_478_000, rootTurnCompletionPercent: 100, averageCompletedRootTurnMs: 114_000, completedRootTurnDurationObservations: 8, pairedToolTimeMs: 532_000, pairedToolObservations: 12, averageApprovalWaitMs: null, totalApprovalWaitMs: null, pairedApprovalWaitObservations: 0, averageFirstOutputMs: 3_200, firstOutputObservations: 7, interactiveTokensPerCompletedRootTurn: 743_557 },
	modelUsage: [{ namespace: "interactive", model: "gpt-5.4-sol", effort: "high", interactiveRootTurns: 8, detachedInvocations: 0, totalTokens: 5_948_459 }], unattributedUsage: null,
	claims: { purpose: { text: "unknown", authority: "unknown", sourceActivityIds: [], independentlyVerified: false }, actions: { text: "3 activities", authority: "journal", sourceActivityIds: [], independentlyVerified: false }, result: { text: "unknown", authority: "unknown", sourceActivityIds: [], independentlyVerified: false } },
	requests: { submitted: 1, shortlist: [request], details: [request], omittedCount: 0 }, issues: [],
	diagnostics: { activityCounts: { message: 3 }, retryCount: 1, waitCount: 2, compactionCount: 0, providerMetricsUnavailable: ["provider wait timing"], warnings: [] },
};


const variants: any[] = [
	stats,
	{ ...stats, state: "empty", observedTotalTokens: null },
	{ ...stats, state: "empty", observedTotalTokens: 42 },
	{ ...stats, observedTotalTokens: null },
	{ ...stats, observedTotalTokens: 0, modelUsage: [] },
	{ ...stats, observedTotalTokens: 0 },
	{ ...stats, modelUsage: [], unattributedUsage: { totalTokens: 1234 } },
	{ ...stats, issues: [{ recovered: true, turnId: "t1", method: "turn/failed", summary: "복구됨" }, { recovered: false, turnId: null, method: "x", summary: "실패" }], requests: { ...stats.requests, submitted: 14 } },
];
const historical: any = { sessionId: "s-9", projectId: null, boundary: "observed", startedAt: "2026-09-01T00:00:00.000Z", endedAt: "2026-09-01T00:02:30.000Z", result: "completed", failures: 0, retries: 1, usage: null };
const targets: [string, () => any, () => any][] = [["session", () => "session", () => null], ["historical", () => "session", () => historical], ["diagnostics", () => "diagnostics", () => null], ["latest", () => "latest", () => null], ["#1", () => 1, () => null], ["#9", () => 9, () => null]];
runGolden("session-stats-view", variants.flatMap((variant, i) => targets.flatMap(([name, target, history]) => [40, 80, 109, 110, 160, 220].map(width => ({
	label : `#${i} ${name} width=${width}`,
	before: () => new before.SessionStatsView(() => variant, target, history, () => 1).render(width),
	after : () => new after.SessionStatsView(() => variant, target, history, () => 1).render(width),
})))));

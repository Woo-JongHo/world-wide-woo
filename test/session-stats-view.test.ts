import { describe, expect, test } from "bun:test";
import { stripTerminalSequences, visibleWidth } from "@earendil-works/pi-tui";
import type { SessionStatsSnapshot } from "../src/domain/session-stats";
import { SessionStatsView } from "../src/presentation/tui/session-stats-view";

const stats = {
	session: { threadId: "thread-1", startedAt: "2026-09-03T00:00:00.000Z", endedAt: "2026-09-03T00:01:00.000Z", durationMs: 60_000, timeAuthority: "www-observed", turns: 2, completedTurns: 1, failedActivities: 1, cancelledActivities: 0, agentOperations: 1, toolOperations: 3, approvals: 1, compactions: 0, retries: 1, waits: 1, activityIds: ["activity-1"] },
	speed: { averageTurnMs: 30_000, averageToolMs: 2_500, averageFirstOutputMs: null, averageApprovalWaitMs: 8_000, activitiesPerMinute: 12.5, generationTokensPerSecond: null },
	usage: { totalTokens: 4200, unattributedTokens: 100, authority: "since-process-attach", limitation: "since process attach; prior/resumed session usage is unknown", models: [{ model: "gpt-5.4", effort: "high", turns: 2, totalTokens: 4100 }] },
	summary: { purpose: { text: "Stats를 구현한다", authority: "session-goal", sourceActivityIds: ["goal-1"] }, actions: { text: "Tool 3개", authority: "www-observed", sourceActivityIds: ["activity-1"] }, result: { text: "unknown", authority: "unknown", sourceActivityIds: [] } },
	turns: [{ id: "turn-1", number: 1, startedAt: "2026-09-03T00:00:00.000Z", endedAt: "2026-09-03T00:00:30.000Z", durationMs: 30_000, firstOutputMs: null, firstOutputAuthority: "unknown", agents: 1, tools: 3, approvals: 1, compactions: 0, retries: 1, waits: 1, failures: 1, activityIds: ["activity-1"] }],
	activities: [{ id: "activity-1", turnId: "turn-1", itemId: "tool-1", recordedAt: "2026-09-03T00:00:01.000Z", category: "tool", phase: "started", method: "item/commandExecution/started", observedDurationMs: 2_000, sourceActivityId: "activity-1" }],
	failures: [{ activityId: "failure-1", turnId: "turn-1", recordedAt: "2026-09-03T00:00:10.000Z", method: "item/commandExecution/completed", summary: "exit 1", recovered: false, recoveryActivityId: null }], unavailable: ["provider generation speed"],
} as const satisfies SessionStatsSnapshot;

describe("session stats view", () => {
	test("renders provenance, unknown values, partial usage, sources, and failure state", () => {
		const output = stripTerminalSequences(new SessionStatsView(() => stats).render(100).join("\n"));
		for (const text of ["SESSION STATS", "www-observed", "session-goal", "since-process-attach", "prior/resumed", "unknown", "ACTIVE", "failure-1", "activity-1"]) expect(output).toContain(text);
	});
	test("keeps every row within a narrow terminal width", () => { for (const row of new SessionStatsView(() => stats).render(42)) expect(visibleWidth(row)).toBeLessThanOrEqual(42); });
	test("shows latest and numbered turn detail without replacing session totals", () => { const output = stripTerminalSequences(new SessionStatsView(() => stats, () => 1).render(100).join("\n")); expect(output).toContain("REQUEST DETAIL"); expect(output).toContain("#1 · turn-1"); expect(output).toContain("wall clock"); });
});

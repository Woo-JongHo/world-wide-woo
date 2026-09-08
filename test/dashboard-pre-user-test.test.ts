import { describe, expect, test } from "bun:test";
import { stripTerminalSequences, visibleWidth } from "@earendil-works/pi-tui";
import type { ObservabilityDashboard, ObservabilitySessionSummary } from "../src/core/domain/observability/observability-dashboard";
import { dashboardSessionWindow } from "../src/adapters/inbound/tui/dashboard/dashboard-session-window";
import { ObservabilityDashboardView } from "../src/adapters/inbound/tui/dashboard/observability-dashboard-view";

const session = (index: number): ObservabilitySessionSummary => ({
	sessionId: `session-${String(index).padStart(2, "0")}`,
	projectId: `project-${index}`,
	boundary: "observed",
	startedAt: "2026-09-07T00:00:00.000Z",
	endedAt: index === 11 ? null : "2026-09-07T00:01:00.000Z",
	result: index === 11 ? "active" : "completed",
	failures: 0,
	retries: 0,
	usage: index === 11 ? {
		totalTokens: 120,
		observedTotalTokens: 120,
		unattributedTokens: 0,
		observationCoverage: { interactive: true, detached: false },
		models: [{ model: "gpt-5.6-sol", effort: "medium", interactiveRootTurns: 1, interactiveTokens: 120, detachedInvocations: 0, detachedTokens: 0, totalTokens: 120 }],
	} : null,
});

function dashboard(state: ObservabilityDashboard["coverage"]["state"] = "observed"): ObservabilityDashboard {
	return {
		coverage: { state, observedFrom: state === "unknown" ? null : "2026-09-06T00:00:00.000Z", observedUntil: state === "unknown" ? null : "2026-09-07T00:00:00.000Z", streamsRead: state === "unknown" ? 0 : 12, skippedStreams: state === "partial-local-journal" ? 2 : 0 },
		sessions: { active: 1, completed: 11, failures: 0 },
		usage: { totalTokens: 120, models: [{ model: "gpt-5.6-sol", effort: "medium", totalTokens: 120, interactiveRootTurns: 1, detachedInvocations: 0 }] },
		health: { completionPercent: 100, retries: 0, failures: 0 },
		trend: { available: false, buckets: [] },
		attention: [],
		recentSessions: Array.from({ length: 12 }, (_, index) => session(index)),
	};
}

describe("dashboard before user testing", () => {
	test("keeps the twelfth keyboard selection visible and identifies its Stats target", () => {
		expect(dashboardSessionWindow(12, 9)).toEqual({ selectedIndex: 9, start: 0, end: 10 });
		expect(dashboardSessionWindow(12, 10)).toEqual({ selectedIndex: 10, start: 1, end: 11 });
		expect(dashboardSessionWindow(12, 11)).toEqual({ selectedIndex: 11, start: 2, end: 12 });
		const output = stripTerminalSequences(new ObservabilityDashboardView(() => dashboard(), () => 11).render(80).join("\n"));
		expect(output).toContain("Selected 12/12 · session-11");
		expect(output).toContain("Project project-11 · active · Model gpt-5.6-sol · medium");
		expect(output).toContain("> session-11");
		expect(output).toContain("Showing 3–12 of 12 · ↑↓ select · Enter Stats detail");
		expect(output).not.toContain("session-00");
	});

	test("states unknown and partial local-journal coverage without declaring system health", () => {
		const unknown = stripTerminalSequences(new ObservabilityDashboardView(() => ({ ...dashboard("unknown"), recentSessions: [], sessions: { active: null, completed: null, failures: null }, usage: { totalTokens: null, models: [] }, health: { completionPercent: null, retries: null, failures: null } })).render(80).join("\n"));
		expect(unknown).toContain("NOT OBSERVED · event range — — —");
		expect(unknown).toContain("Attention unavailable · no local journal sessions observed");
		expect(unknown).not.toContain("No sessions need attention");
		const partial = stripTerminalSequences(new ObservabilityDashboardView(() => dashboard("partial-local-journal")).render(80).join("\n"));
		expect(partial).toContain("PARTIAL LOCAL JOURNAL");
		expect(partial).toContain("12 streams read · 2 skipped · local journal only");
		expect(partial).toContain("No flagged sessions in this partial local-journal range");
	});

	test("keeps dashboard rows bounded at user-test widths", () => {
		for (const width of [40, 80, 120]) {
			for (const row of new ObservabilityDashboardView(() => dashboard(), () => 11).render(width)) {
				expect(visibleWidth(row)).toBeLessThanOrEqual(width);
			}
		}
	});
});

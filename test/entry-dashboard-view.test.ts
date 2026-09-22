import { describe, expect, test } from "bun:test";
import chalk from "chalk";
import { stripTerminalSequences, visibleWidth } from "@earendil-works/pi-tui";
import { AstraDashboardRail, EntryDashboardView, WwwDashboardView } from "../src/adapters/inbound/tui/features/dashboard/entry-dashboard-view";
import { a } from "../src/adapters/inbound/tui/foundation/theme/astra-theme";
import { colors } from "../src/adapters/inbound/tui/foundation/theme/theme";
import type { LinearProjectDashboard } from "../src/core/domain/work/linear-dashboard";
import { astraFixture } from "./fixtures/astra-snapshot";

const dashboard: LinearProjectDashboard = {
	state: "ready",
	projectName: "World Wide Woo",
	fetchedAt: "2026-09-10T09:29:00.000Z",
	issues: [
		{ id: "WOO-679", title: "[Chat] 대화·실행·결과를 읽기 좋은 하나의 흐름으로 보여준다", status: "In Progress", statusType: "started", dueDate: null, updatedAt: "2026-09-10T09:11:00.000Z" },
		{ id: "WOO-907", title: "연결된 Linear 프로젝트를 입장 Dashboard에서 요약한다", status: "Backlog", statusType: "backlog", dueDate: null, updatedAt: "2026-09-10T09:27:00.000Z" },
		{ id: "WOO-909", title: "Chat slash UI에서 MCP·Clear·Context 압축을 조작한다", status: "Backlog", statusType: "backlog", dueDate: null, updatedAt: "2026-09-10T09:26:00.000Z" },
		{ id: "WOO-845", title: "실행 상태를 하나의 계약으로 수렴시켜 Todo·진행·완료를 일치시킨다", status: "Backlog", statusType: "backlog", dueDate: null, updatedAt: "2026-09-10T09:25:00.000Z" },
	],
	update: { body: "# 09/10 · Chat 실행 관측 구조 정리\n\n- Todo → Flow → Now → Health로 계층 재정의\n- Tracer의 raw execution 노출 제거", createdAt: "2026-09-10T09:20:00.000Z" },
	comments: [
		{ id: "comment-1", body: "## 변경\n\n- Comment가 다시 보인다", createdAt: "2026-09-09T09:00:00.000Z", author: "우종호" },
	],
	milestones: [],
	error: null,
};

describe("EntryDashboardView", () => {
	test("uses the same white RGB foreground in both TUI foundations", () => {
		const previous = chalk.level;
		chalk.level = 3;
		try {
			expect(colors.text("본문")).toContain("\x1b[38;2;255;255;255m");
			expect(a.text("본문")).toContain("\x1b[38;2;255;255;255m");
		} finally {
			chalk.level = previous;
		}
	});

	test("renders the WWW first screen from the current Workbench snapshot", () => {
		const snapshot = astraFixture("working");
		snapshot.sessionGoal = { text: "현재 요청을 검증한다", sourceActivityId: "request", updatedAt: "2026-09-11T09:42:00.000Z" };
		const output = stripTerminalSequences(new WwwDashboardView(() => snapshot).render(100).join("\n"));
		expect(output).toContain("SESSION OVERVIEW");
		expect(output).toContain("ACTIVITY EVENTS");
		expect(output).toContain("working");
		expect(output).toContain("astra-preview · preview-thread");
		expect(output).toContain("revision 1");
		expect(output).toContain("SYSTEM MODULE ROUTER");
		expect(output).toContain("CONTEXT");
		expect(output).toContain("14%");
		expect(output).toContain("재개 시나리오를 테스트하는 중");
		expect(output).toContain("현재 요청을 검증한다");
		expect(output).toContain("TOKEN ALLOCATION");
		expect(output).toContain("ACTIVITY HEATMAP");
		expect(output).toContain("message");
		expect(output).toContain("EVENTS");
		expect(output).toContain("INPUT / OUTPUT / CACHE");
		expect(output).toContain("┌");
		expect(output).toContain("┘");
	});

	test("uses only observed cache access counts and keeps compact dashboard rows bounded", () => {
		const snapshot = { ...astraFixture("ready"), cacheObservations: [{
			id: "context-projection" as const, entries: 1, logicalBytes: null,
			hits: 9, misses: 1, evictions: 0, latencyMs: 2, lastAccessedAt: "2026-09-11T09:42:00.000Z",
		}] };
		const wide = stripTerminalSequences(new WwwDashboardView(() => snapshot).render(120).join("\n"));
		expect(wide).toContain("90% hit");
		expect(wide).toContain("9/10 accesses");

		for (const width of [36, 60, 78, 81, 90]) {
			const compact = new WwwDashboardView(() => snapshot).render(width);
			expect(stripTerminalSequences(compact.join("\n"))).toMatch(/session overview/iu);
			for (const row of compact) expect(visibleWidth(row)).toBeLessThanOrEqual(width);
		}
	});

	test("keeps token proportion and activity heatmap landmarks when telemetry is unavailable", () => {
		const snapshot = { ...astraFixture("ready"), contextUsage: null, sessionUsage: undefined, activities: [] };
		const output = stripTerminalSequences(new WwwDashboardView(() => snapshot).render(80).join("\n"));
		expect(output).toContain("TOKEN ALLOCATION / PROPORTION");
		expect(output).toContain("INPUT / OUTPUT / CACHE");
		expect(output).toContain("ACTIVITY HEATMAP");
		expect(output).toContain("recordedAt unavailable");
		expect(output).not.toContain("last 24h · observed");
	});

	test("keeps the dashboard rail snapshot-backed and bounded in wide and compact panes", () => {
		const snapshot = astraFixture("working");
		for (const width of [24, 48]) {
			const rows = new AstraDashboardRail(() => snapshot).render(width);
			const output = stripTerminalSequences(rows.join("\n"));
			expect(output).toContain("Session context");
			expect(output).toContain("Session state");
			expect(output).not.toMatch(/system load/iu);
			expect(output).toContain("/cache");
			for (const row of rows) expect(visibleWidth(row)).toBeLessThanOrEqual(width);
		}
	});

	test("renders the project pulse in the requested information order", () => {
		const output = stripTerminalSequences(new EntryDashboardView(() => dashboard, () => new Date("2026-09-10T09:29:00.000Z")).render(100).join("\n"));
		for (const label of ["DASHBOARD · World Wide Woo", "NOW", "NEXT", "UPDATE", "ACTIVITY", "RECENT", "HEALTH", "synced 09:29"]) expect(output).toContain(label);
		expect(output.indexOf("NOW")).toBeLessThan(output.indexOf("NEXT"));
		expect(output.indexOf("NEXT")).toBeLessThan(output.indexOf("UPDATE"));
		expect(output.indexOf("UPDATE")).toBeLessThan(output.indexOf("RECENT"));
		expect(output.indexOf("ACTIVITY")).toBeLessThan(output.indexOf("RECENT"));
		expect(output.indexOf("RECENT")).toBeLessThan(output.indexOf("HEALTH"));
		expect(output.indexOf("▶ WOO-679")).toBeLessThan(output.indexOf("○ WOO-907"));
		expect(output).toContain("18m ago");
		expect(output).toContain("09:27  WOO-907");
		expect(output).toContain("Comment가 다시 보인다");
		expect(output).toContain("blocked — · stale 0");
	});

	test("keeps loading and unavailable states explicit", () => {
		const loading = stripTerminalSequences(new EntryDashboardView(() => ({ ...dashboard, state: "loading", fetchedAt: null, issues: [], update: null })).render(60).join("\n"));
		expect(loading).toContain("DASHBOARD · World Wide Woo");
		expect(loading).toContain("연결 중");

		const unavailable = stripTerminalSequences(new EntryDashboardView(() => ({ ...dashboard, state: "unavailable", error: "Linear MCP 인증이 필요합니다." })).render(60).join("\n"));
		expect(unavailable).toContain("Linear Dashboard unavailable");
		expect(unavailable).toContain("Linear MCP 인증이 필요합니다.");
	});

	test("keeps a stale snapshot visible with its recovery context", () => {
		const stale = stripTerminalSequences(new EntryDashboardView(() => ({ ...dashboard, state: "stale", error: "일시적인 Linear 오류" })).render(80).join("\n"));
		expect(stale).toContain("갱신 실패 · 마지막 성공 값");
		expect(stale).toContain("실패 이유 · 일시적인 Linear 오류");
		expect(stale).toContain("stale 1");
	});

	test("bounds every row to the pane width", () => {
		for (const width of [24, 40, 80, 120]) {
			for (const row of new EntryDashboardView(() => dashboard, () => new Date("2026-09-10T09:29:00.000Z")).render(width)) {
				expect(visibleWidth(row)).toBeLessThanOrEqual(width);
			}
		}
	});
});

import { describe, expect, test } from "bun:test";
import { stripTerminalSequences, visibleWidth } from "@earendil-works/pi-tui";
import { EntryDashboardView } from "../src/adapters/inbound/tui/dashboard/entry-dashboard-view";
import type { LinearProjectDashboard } from "../src/core/domain/work/linear-dashboard";

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
	milestones: [],
	error: null,
};

describe("EntryDashboardView", () => {
	test("renders the project pulse in the requested information order", () => {
		const output = stripTerminalSequences(new EntryDashboardView(() => dashboard, () => new Date("2026-09-10T09:29:00.000Z")).render(100).join("\n"));
		for (const label of ["DASHBOARD · World Wide Woo", "NOW", "NEXT", "UPDATE", "RECENT", "HEALTH", "synced 09:29"]) expect(output).toContain(label);
		expect(output.indexOf("NOW")).toBeLessThan(output.indexOf("NEXT"));
		expect(output.indexOf("NEXT")).toBeLessThan(output.indexOf("UPDATE"));
		expect(output.indexOf("UPDATE")).toBeLessThan(output.indexOf("RECENT"));
		expect(output.indexOf("RECENT")).toBeLessThan(output.indexOf("HEALTH"));
		expect(output.indexOf("▶ WOO-679")).toBeLessThan(output.indexOf("○ WOO-907"));
		expect(output).toContain("18m ago");
		expect(output).toContain("09:27  WOO-907");
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

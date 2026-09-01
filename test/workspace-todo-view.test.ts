import { describe, expect, test } from "bun:test";
import { visibleWidth } from "@earendil-works/pi-tui";
import type { TodoDocument } from "../src/domain/todos";
import { WorkspaceTodoView } from "../src/presentation/tui/shared-dashboard-views";

function todo(items: TodoDocument["items"]): TodoDocument {
	return {
		version: 1,
		revision: 1,
		ownerSessionId: "session",
		storyId: null,
		title: "릴리스",
		items,
		updatedAt: "2026-08-31T00:00:00.000Z",
	};
}

const mixedTodo = todo([
	{ id: "pending", content: "한국어 pending 작업", status: "pending", evidenceIds: [], details: [] },
	{
		id: "active",
		content: "\u001B[31m진행 중인 아주 긴 작업\u001B[0m",
		status: "in_progress",
		evidenceIds: [],
		details: [
			{ id: "active-detail-1", content: "재현 완료", status: "completed", evidenceIds: ["proof"] },
			{ id: "active-detail-2", content: "캐시 구현", status: "in_progress", evidenceIds: [] },
			{ id: "active-detail-3", content: "검증 예정", status: "pending", evidenceIds: [] },
		],
	},
	{ id: "completed", content: "완료 작업", status: "completed", evidenceIds: ["proof"], details: [] },
	{ id: "blocked", content: "막힌 작업", status: "blocked", evidenceIds: [], details: [] },
]);

describe("WorkspaceTodoView", () => {
	test("shows no active work for a missing or empty todo", () => {
		for (const document of [null, todo([])]) {
			const output = new WorkspaceTodoView(() => document).render(70).join("\n");
			expect(output).not.toContain("TODO 0/0");
			expect(output).toContain("진행 중인 작업 없음");
		}
	});

	test.each([30, 40, 70, 120])("wraps Korean and ANSI todo content safely within %i columns", (width) => {
		const output = new WorkspaceTodoView(() => mixedTodo).render(width);
		expect(output.every(line => visibleWidth(line) <= width)).toBe(true);
	});

	test("uses status markers without mixing project metadata or commands into Todo", () => {
		const output = new WorkspaceTodoView(() => mixedTodo).render(120).join("\n");
		expect(output).toContain("TODO 1/4 · 세부 1/3");
		expect(output).toContain("릴리스");
		expect(output).toContain("○ 한국어 pending 작업");
		expect(output).toContain("◉");
		expect(output).toContain("\u001B[31m진행 중인 아주 긴 작업\u001B[0m");
		expect(output).toContain("✓ 완료 작업");
		expect(output).toContain("◆ 막힌 작업");
		expect(output).toContain("├ ✓ 재현 완료");
		expect(output).toContain("├ ◉ 캐시 구현");
		expect(output).toContain("└ ○ 검증 예정");
		expect(output).not.toContain("프로젝트");
		expect(output).not.toContain("작업 위치");
		expect(output).not.toContain("/usage");
		expect(output).not.toContain("최근 세션");
		expect(output).not.toContain("Map");
		expect(output).not.toContain("Architecture");
		expect(output).not.toContain("T-Notes");
	});

	test("uses the active item rather than an earlier pending item in compact layout", () => {
		const output = new WorkspaceTodoView(() => mixedTodo).render(40).join("\n");
		expect(output).toContain("TODO 1/4 · 세부 1/3");
		expect(output).toContain("◉");
		expect(output).toContain("└ ◉ 캐시 구현");
		expect(output).not.toContain("○");
		expect(output).not.toContain("✓");
		expect(output).not.toContain("◆");
	});
});

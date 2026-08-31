import { describe, expect, test } from "bun:test";
import { stripTerminalSequences, visibleWidth, type Component } from "@earendil-works/pi-tui";
import { renderLayoutFrame } from "@earendil-works/pi-tui/dist/layout.js";
import type { LayoutBox } from "@earendil-works/pi-tui/dist/layout.js";
import { createDashboardLayout } from "../src/presentation/tui/dashboard-layout";

class Lines implements Component {
	constructor(private readonly lines: string[]) {}
	invalidate(): void {}
	render(): string[] { return this.lines; }
}

const identity = (text: string) => text;

function scrollContent(box: LayoutBox): string[] {
	return [...(box.scrollContentLines ?? []), ...box.children.flatMap(scrollContent)];
}

function dashboard() {
	return createDashboardLayout(
		() => "WWW · test/model",
		{ title: "대화 · 작업", color: identity, component: new Lines(["왼쪽 내용"]) },
		{ title: "실시간 사용량", color: identity, component: new Lines(["Codex 66% 남음", "Claude 로그인 필요"]) },
		{ title: "Router · 세션", color: identity, component: new Lines(["openai-codex", "최근 세션"]) },
	);
}

describe("dashboard layout", () => {
	test("keeps three regions in one wide frame with independent viewports", () => {
		const layout = dashboard();
		const frame = renderLayoutFrame(layout.component, 120, 30, () => undefined);
		expect(frame.lines.every((line) => visibleWidth(line) === 0 || visibleWidth(line) === 120)).toBe(true);
		expect(frame.lines.join("\n")).toContain("대화 · 작업");
		expect(frame.lines.join("\n")).toContain("실시간 사용량");
		expect(frame.lines.join("\n")).toContain("Router · 세션");
		expect(frame.lines.filter((line) => line.includes("╭")).length).toBe(1);
		expect(frame.lines.at(-1)).toContain("╰");
		for (const line of frame.lines.slice(1, -1)) {
			const plain = stripTerminalSequences(line);
			expect(plain.startsWith("│")).toBe(true);
			expect(plain.endsWith("│")).toBe(true);
		}
		expect(layout.leftScroll).not.toBe(layout.usageScroll);
		expect(layout.usageScroll).not.toBe(layout.routerScroll);
		expect(layout.leftScroll.viewportHeight).toBeGreaterThan(0);
		expect(layout.usageScroll.viewportHeight).toBeGreaterThan(0);
		expect(layout.routerScroll.viewportHeight).toBeGreaterThan(0);
	});

	test("uses one ordered viewport inside the same frame when compact", () => {
		const frame = renderLayoutFrame(dashboard().component, 70, 24, () => undefined);
		expect(frame.lines.every((line) => visibleWidth(line) === 0 || visibleWidth(line) === 70)).toBe(true);
		expect(frame.lines.join("\n")).toContain("대화 · 작업");
		expect(frame.lines.join("\n")).toContain("실시간 사용량");
		expect(frame.lines.join("\n")).toContain("Router · 세션");
	});

	test.each([10, 13])("keeps every section reachable at 120×%i", (height) => {
		const frame = renderLayoutFrame(dashboard().component, 120, height, () => undefined);
		const output = scrollContent(frame.root).join("\n");
		expect(output).toContain("대화 · 작업");
		expect(output).toContain("실시간 사용량");
		expect(output).toContain("Router · 세션");
	});
});

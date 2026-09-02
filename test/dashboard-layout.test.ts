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

class MutableLines implements Component {
	constructor(public lines: string[]) {}
	invalidate(): void {}
	render(): string[] { return [...this.lines]; }
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
		// Todo/Plan owns more of the right column than the T-note list.
		expect(layout.routerScroll.viewportHeight).toBeGreaterThan(layout.usageScroll.viewportHeight);
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

	test("reuses section rows when a child returns the same stable projection", () => {
		const layout = dashboard();
		const first = layout.leftScroll.render(80);
		const second = layout.leftScroll.render(80);
		expect(second).toBe(first);
		expect(layout.leftScroll.render(70)).not.toBe(first);
	});

	test("reuses unchanged prefixes without retaining a stale dynamic tail", () => {
		const left = new MutableLines(["stable one", "stable two", "tail one"]);
		const fixed = new Lines(["fixed"]);
		const layout = createDashboardLayout(
			() => "WWW",
			{ title: "Work", color: identity, component: left },
			{ title: "Router", color: identity, component: fixed },
			{ title: "Todo", color: identity, component: fixed },
		);
		const first = layout.leftScroll.render(80);
		left.lines = ["stable one", "stable two", "tail two"];
		const second = layout.leftScroll.render(80);
		expect(second).not.toBe(first);
		expect(second.join("\n")).toContain("tail two");
		expect(second.join("\n")).not.toContain("tail one");
	});

	test("keeps every wheel delta in its contained chat viewport while content renders", () => {
		const left = new MutableLines(Array.from({ length: 40 }, (_, index) => `message ${index}`));
		const fixed = new Lines(["fixed"]);
		const layout = createDashboardLayout(
			() => "WWW",
			{ title: "Chat", color: identity, component: left },
			{ title: "Usage", color: identity, component: fixed },
			{ title: "Todo", color: identity, component: fixed },
		);
		renderLayoutFrame(layout.component, 120, 14, () => undefined);
		const start = layout.leftScroll.scrollTop;

		const offsets = [-2, -2, -2].map((delta, index) => {
			layout.leftScroll.scrollBy(delta);
			left.lines.push(`stream ${index}`);
			renderLayoutFrame(layout.component, 120, 14, () => undefined);
			return layout.leftScroll.scrollTop;
		});

		expect(offsets).toEqual([start - 2, start - 4, start - 6]);
		expect(layout.leftScroll.isFollowingEnd).toBe(false);
		expect(layout.usageScroll.scrollTop).toBe(0);
		expect(layout.routerScroll.scrollTop).toBe(0);

		layout.leftScroll.scrollToEnd();
		expect(layout.leftScroll.isFollowingEnd).toBe(true);
	});
});

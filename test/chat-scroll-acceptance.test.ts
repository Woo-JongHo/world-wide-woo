import { describe, expect, test } from "bun:test";
import { stripTerminalSequences, type Component } from "@earendil-works/pi-tui";
import { renderLayoutFrame } from "@earendil-works/pi-tui/dist/layout.js";
import { createDashboardLayout } from "../src/tui/layout/dashboard-layout";

class WrappingMessages implements Component {
	constructor(public messages: string[]) {}
	invalidate(): void {}
	render(width: number): string[] {
		const rows: string[] = [];
		for (const message of this.messages) {
			for (let offset = 0; offset < message.length; offset += Math.max(1, width)) {
				rows.push(message.slice(offset, offset + Math.max(1, width)));
			}
		}
		return rows;
	}
}

class FixedLines implements Component {
	invalidate(): void {}
	render(): string[] { return ["fixed"]; }
}

const identity = (text: string) => text;

function fixture() {
	const chat = new WrappingMessages(Array.from(
		{ length: 36 },
		(_, index) => `message-${String(index).padStart(2, "0")} ${`detail-${index} `.repeat(index % 7 === 0 ? 90 : index % 3 === 0 ? 2 : 18)}`,
	));
	const fixed = new FixedLines();
	return {
		chat,
		layout: createDashboardLayout(
			() => "WWW",
			{ title: "Chat", color: identity, component: chat },
			{ title: "Usage", color: identity, component: fixed },
			{ title: "Todo", color: identity, component: fixed },
		),
	};
}

function render(layout: ReturnType<typeof createDashboardLayout>, width: number) {
	return renderLayoutFrame(layout.component, width, 14, () => undefined);
}

function firstVisibleMessage(frame: ReturnType<typeof renderLayoutFrame>): number {
	const match = stripTerminalSequences(frame.lines.join("\n")).match(/message-(\d+)/);
	if (!match) throw new Error("No chat message is visible");
	return Number(match[1]);
}

describe("chat scroll acceptance", () => {
	test("retains the older reading anchor and disabled follow across 120, 80, and 40 columns while streaming", () => {
		const { chat, layout } = fixture();
		render(layout, 120);
		layout.leftScroll.scrollBy(-28);
		const wide = render(layout, 120);
		const anchor = firstVisibleMessage(wide);
		expect(layout.leftScroll.isFollowingEnd).toBe(false);

		chat.messages.push(`message-36 ${"stream ".repeat(18)}`);
		const medium = render(layout, 80);
		expect(layout.compactScroll.isFollowingEnd).toBe(false);
		expect(Math.abs(firstVisibleMessage(medium) - anchor)).toBeLessThanOrEqual(2);

		chat.messages.push(`message-37 ${"stream ".repeat(18)}`);
		const narrow = render(layout, 40);
		expect(layout.compactScroll.isFollowingEnd).toBe(false);
		expect(Math.abs(firstVisibleMessage(narrow) - anchor)).toBeLessThanOrEqual(2);

		chat.messages.push(`message-38 ${"stream ".repeat(18)}`);
		const wideAgain = render(layout, 120);
		expect(layout.leftScroll.isFollowingEnd).toBe(false);
		expect(Math.abs(firstVisibleMessage(wideAgain) - anchor)).toBeLessThanOrEqual(2);
	});

	test("restores follow when the reader returns to latest before changing width", () => {
		const { chat, layout } = fixture();
		render(layout, 80);
		layout.compactScroll.scrollBy(-20);
		render(layout, 80);
		expect(layout.compactScroll.isFollowingEnd).toBe(false);

		layout.compactScroll.scrollToEnd();
		render(layout, 120);
		expect(layout.leftScroll.isFollowingEnd).toBe(true);
		const before = layout.leftScroll.scrollTop;

		chat.messages.push(`message-36 ${"newest ".repeat(18)}`);
		const frame = render(layout, 120);
		expect(layout.leftScroll.isFollowingEnd).toBe(true);
		expect(layout.leftScroll.scrollTop).toBeGreaterThan(before);
		expect(stripTerminalSequences(frame.lines.join("\n"))).toContain("message-36");
	});
});

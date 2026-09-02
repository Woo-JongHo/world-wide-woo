import { describe, expect, test } from "bun:test";
import { stripTerminalSequences, visibleWidth } from "@earendil-works/pi-tui";
import { WorkbenchBottomHudView } from "../src/presentation/tui/workbench-bottom-hud";
import { UsageStripView } from "../src/presentation/tui/usage-strip-view";
import { WOONI_FULL_WIDTH } from "../src/presentation/tui/wooni-dock";

function usageView(): UsageStripView {
	const usage = new UsageStripView(() => ({
		totalTokens: 229_000,
		unattributedTokens: 0,
		models: [{ model: "gpt-5.6-sol", effort: "ultra", turns: 1, totalTokens: 229_000 }],
	}));
	usage.update([
		{
			provider: "openai-codex",
			state: "ready",
			fetchedAt: 1,
			limits: [{ label: "7 days", remainingPercent: 13, usedPercent: 87, status: "ok" }],
		},
		{
			provider: "anthropic",
			state: "ready",
			fetchedAt: 1,
			limits: [
				{ label: "Claude 5 Hour", remainingPercent: 100, usedPercent: 0, status: "ok" },
				{ label: "Claude 7 Day", remainingPercent: 100, usedPercent: 0, status: "ok" },
			],
		},
	]);
	return usage;
}

describe("workbench bottom HUD", () => {
	test("places the three-row Wooni character beside the three model-usage rows", () => {
		const lines = new WorkbenchBottomHudView(usageView()).render(160).map(stripTerminalSequences);

		expect(lines).toHaveLength(3);
		expect(lines[0]).toContain("Sol");
		expect(lines[0]).toContain("Fable");
		expect(lines[0]).toContain("╭─ WOONI ─╮");
		expect(lines[1]).toContain("Terra");
		expect(lines[1]).toContain("Opus");
		expect(lines[1]).toContain("●");
		expect(lines[2]).toContain("Luna");
		expect(lines[2]).toContain("Sonnet");
		expect(lines[2]).toContain("╰─── ᴗ ───╯");
		expect(lines[1]).toContain("wooni@worldwide:~$");
		for (const line of lines) {
			const wooniStart = line.search(/[╭│╰]/u);
			expect(wooniStart).toBe(160 - WOONI_FULL_WIDTH);
			expect(line.slice(wooniStart - 2, wooniStart)).toBe("  ");
		}
		expect(lines.every((line) => visibleWidth(line) === 160)).toBe(true);
	});

	test.each([97, 112, 205])("preserves the full three-row identity without clipping at width %i", (width) => {
		const lines = new WorkbenchBottomHudView(usageView()).render(width).map(stripTerminalSequences);

		expect(lines).toHaveLength(3);
		expect(lines[0]).toContain("╭─ WOONI ─╮");
		expect(lines[1]).toContain("●");
		expect(lines[1]).toContain("wooni@worldwide:~$");
		expect(lines[2]).toContain("╰─── ᴗ ───╯");
		expect(lines.every((line) => visibleWidth(line) === width)).toBe(true);
	});

	test.each([64, 96])("keeps all three model rows and hides Wooni when both cannot fit at width %i", (width) => {
		const lines = new WorkbenchBottomHudView(usageView()).render(width).map(stripTerminalSequences);

		expect(lines).toHaveLength(3);
		expect(lines.join("\n")).toContain("Sol");
		expect(lines.join("\n")).toContain("Sonnet");
		expect(lines.join("\n")).not.toContain("WOONI");
		expect(lines.every((line) => visibleWidth(line) === width)).toBe(true);
	});
});

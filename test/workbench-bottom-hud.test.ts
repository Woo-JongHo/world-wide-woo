import { describe, expect, test } from "bun:test";
import { stripTerminalSequences, visibleWidth } from "@earendil-works/pi-tui";
import { WorkbenchBottomHudView } from "../src/presentation/tui/workbench-bottom-hud";
import { UsageStripView } from "../src/presentation/tui/usage-strip-view";
import { WOONI_FULL_WIDTH } from "../src/presentation/tui/wooni-dock";

function usageView(): UsageStripView {
	const usage = new UsageStripView();
	usage.update([
		{
			provider: "openai-codex",
			state: "ready",
			fetchedAt: 1,
			limits: [
				{ label: "5 hours", remainingPercent: 13, usedPercent: 87, status: "ok" },
				{ label: "7 days", remainingPercent: 13, usedPercent: 87, status: "ok" },
				{ label: "7 days (Spark)", remainingPercent: 13, usedPercent: 87, status: "ok" },
			],
		},
		{
			provider: "anthropic",
			state: "ready",
			fetchedAt: 1,
			limits: [
				{ label: "Claude 5 Hour", remainingPercent: 100, usedPercent: 0, status: "ok" },
				{ label: "Claude 7 Day", remainingPercent: 100, usedPercent: 0, status: "ok" },
				{ label: "Claude 7 Day (Opus)", remainingPercent: 100, usedPercent: 0, status: "ok" },
			],
		},
	]);
	return usage;
}

describe("workbench bottom HUD", () => {
	test("keeps the four quota rows beside the three-row Wooni dock with a blank fourth dock row", () => {
		const lines = new WorkbenchBottomHudView(usageView()).render(160).map(stripTerminalSequences);

		expect(lines).toHaveLength(4);
		expect(lines[0]).toContain("Codex");
		expect(lines[1]).toContain("Claude");
		expect(lines[3]).toContain("Gemini");
		expect(lines[0]).toContain("╭─ WOONI ─╮");
		expect(lines[1]).toContain("7d");
		expect(lines[1]).toContain("●");
		expect(lines[2]).toContain("5h");
		// Claude reports 100% remaining on both windows, so both bars are full.
		expect(lines[2]).toContain("██████████");
		expect(lines[2]).toContain("╰─── ᴗ ───╯");
		expect(lines[3]).toContain("Gemini");
		expect(lines[3]).toContain("—");
		expect(lines[3]?.slice(160 - WOONI_FULL_WIDTH).trim()).toBe("");
		for (const line of lines.slice(0, 3)) {
			const wooniStart = line.search(/[╭│╰]/u);
			expect(wooniStart).toBe(160 - WOONI_FULL_WIDTH);
			expect(line.slice(wooniStart - 2, wooniStart)).toBe("  ");
		}
		expect(lines.every((line) => visibleWidth(line) === 160)).toBe(true);
	});

	test.each([97, 112, 205])("preserves the dock and the fourth quota row at width %i", (width) => {
		const lines = new WorkbenchBottomHudView(usageView()).render(width).map(stripTerminalSequences);

		expect(lines).toHaveLength(4);
		expect(lines[0]).toContain("╭─ WOONI ─╮");
		expect(lines[1]).toContain("●");
		expect(lines[2]).toContain("╰─── ᴗ ───╯");
		expect(lines[3]).toContain("Gemini");
		expect(lines.every((line) => visibleWidth(line) === width)).toBe(true);
	});

	test.each([64, 96])("keeps all four usage rows and hides Wooni when both cannot fit at width %i", (width) => {
		const lines = new WorkbenchBottomHudView(usageView()).render(width).map(stripTerminalSequences);

		expect(lines).toHaveLength(4);
		expect(lines.join("\n")).toContain("Codex");
		expect(lines.join("\n")).toContain("5h");
		expect(lines.join("\n")).not.toContain("WOONI");
		expect(lines.every((line) => visibleWidth(line) === width)).toBe(true);
	});
});

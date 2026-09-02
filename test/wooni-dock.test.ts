import { describe, expect, test } from "bun:test";
import { stripTerminalSequences, visibleWidth } from "@earendil-works/pi-tui";
import {
	WOONI_COMPACT_WIDTH,
	WOONI_FULL_WIDTH,
	WooniDockView,
	workbenchWooniDockFrame,
} from "../src/presentation/tui/wooni-dock";

describe("Wooni bottom dock", () => {
	test("keeps the supplied identity and prompt without the side statistics", () => {
		const output = workbenchWooniDockFrame(false).map(stripTerminalSequences).join("\n");
		expect(output).toContain("≋ ●   ● ≋");
		expect(output).toContain("ᴗ");
		expect(output).toContain("WOONI");
		expect(output).toContain("wooni@worldwide:~$");
		expect(output).not.toContain("AI Assistant");
		expect(output).not.toContain("Engineering Atlas");
		expect(output).not.toContain("Status");
	});

	test("keeps the frame widths coupled to their exported layout widths", () => {
		expect(WOONI_FULL_WIDTH).toBe(31);
		expect(WOONI_COMPACT_WIDTH).toBe(11);
		expect(workbenchWooniDockFrame(false).every((line) => visibleWidth(line) === WOONI_FULL_WIDTH)).toBe(true);
		expect(workbenchWooniDockFrame(true).every((line) => visibleWidth(line) === WOONI_COMPACT_WIDTH)).toBe(true);
	});

	test("keeps the full identity and compact character at exactly three rows", () => {
		const full = new WooniDockView(false).render(80);
		const compact = new WooniDockView(true).render(50);
		expect(full).toHaveLength(3);
		expect(compact).toHaveLength(3);
		expect(full.every(line => visibleWidth(line) <= 80)).toBe(true);
		expect(compact.every(line => visibleWidth(line) <= 50)).toBe(true);
		expect(full.map(stripTerminalSequences).join("\n")).toContain("wooni@worldwide:~$");
		expect(compact.map(stripTerminalSequences).join("\n")).toContain("╰─── ᴗ ───╯");
		expect(compact.map(stripTerminalSequences).join("\n")).not.toContain("wooni@worldwide:~$");
	});
});

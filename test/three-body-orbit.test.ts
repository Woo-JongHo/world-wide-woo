import { describe, expect, test }                   from "bun:test";
import { stripTerminalSequences, visibleWidth }     from "@earendil-works/pi-tui";
import { threeBodyOrbitFrame, threeBodyOrbitLabel } from "../src/adapters/inbound/tui/features/chat/three-body-orbit";

describe("three-body welcome orbit", () => {
	test("moves the three bodies between deterministic frames", () => {
		const start = threeBodyOrbitFrame(0, 48).join("\n");
		const middle = threeBodyOrbitFrame(1_800, 48).join("\n");

		expect(start).not.toBe(middle);
		expect(stripTerminalSequences(start).match(/W/g)).toHaveLength(3);
		expect(stripTerminalSequences(middle).match(/W/g)).toHaveLength(3);
	});

	test("stays within narrow terminal widths", () => {
		for (const width of [1, 10, 20, 48, 80]) {
			for (const row of threeBodyOrbitFrame(2_400, width)) {
				expect(visibleWidth(row)).toBeLessThanOrEqual(width);
			}
		}
	});

	test("uses a tall Braille canvas with visible integrated hierarchical trails", () => {
		const frame = threeBodyOrbitFrame(2_400, 48).join("\n");

		expect(threeBodyOrbitFrame(2_400, 48)).toHaveLength(21);
		expect(stripTerminalSequences(frame)).toMatch(/[⠀-⣿]/u);
	});

	test("hides the preset caption", () => {
		expect(threeBodyOrbitLabel(80)).toBe("");
		expect(threeBodyOrbitLabel(20)).toBe("");
	});

	test("builds a trail from an empty start and preserves it across a completed lap", () => {
		const count = (ms: number) => (stripTerminalSequences(threeBodyOrbitFrame(ms, 100).join("\n")).match(/[⠁-⣿]/gu) ?? []).length;
		expect(count(0)).toBe(0);
		expect(count(4_000)).toBeGreaterThan(30);
		expect(count(8_890)).toBeGreaterThan(60);
		expect(count(9_000)).toBeGreaterThan(60);
	});
});

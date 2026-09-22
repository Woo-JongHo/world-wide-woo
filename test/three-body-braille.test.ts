import { describe, expect, test } from "bun:test";
import { stripTerminalSequences, visibleWidth } from "@earendil-works/pi-tui";
import { HIERARCHICAL_TRIPLE_PRESET, ThreeBodySimulation, type Vector2 } from "../src/core/domain/work/three-body-simulation";
import { renderThreeBodyBrailleFrame, type ThreeBodyTrail } from "../src/adapters/inbound/tui/features/chat/three-body-braille";

function referenceTrail(): readonly ThreeBodyTrail[] {
	const simulation = ThreeBodySimulation.fromPreset(HIERARCHICAL_TRIPLE_PRESET);
	const points = new Map<string, Vector2[]>(HIERARCHICAL_TRIPLE_PRESET.bodies.map(body => [body.id, []]));
	for (let elapsed = 0; elapsed <= HIERARCHICAL_TRIPLE_PRESET.referenceDuration; elapsed += 0.02) {
		const snapshot = simulation.snapshot();
		for (const body of snapshot.bodies) points.get(body.id)!.push(body.position);
		simulation.advance(Math.min(0.02, HIERARCHICAL_TRIPLE_PRESET.referenceDuration - elapsed));
	}
	return HIERARCHICAL_TRIPLE_PRESET.bodies.map(body => ({ bodyId: body.id, points: points.get(body.id)! }));
}

describe("three-body Braille renderer", () => {
	test("projects the integrated hierarchical paths into a bounded 2x4 subpixel canvas", () => {
		const simulation = ThreeBodySimulation.fromPreset(HIERARCHICAL_TRIPLE_PRESET);
		simulation.advance(1.8);
		const rows = renderThreeBodyBrailleFrame(simulation.snapshot(), {
			width: 52,
			height: 12,
			trails: referenceTrail(),
			showTrail: true,
		});
		const plain = rows.map(stripTerminalSequences);

		expect(rows).toHaveLength(12);
		expect(rows.every(row => visibleWidth(row) <= 52)).toBe(true);
		expect(plain.join("\n")).toMatch(/[⠀-⣿]/u);
		expect(plain.join("\n")).toContain("A");
		expect(plain.join("\n")).toContain("B");
		expect(plain.join("\n")).toContain("C");
		expect(plain.filter(row => row.trim()).length).toBeGreaterThanOrEqual(8);
	});

	test("keeps tiny terminal projections inside their requested dimensions", () => {
		const simulation = ThreeBodySimulation.fromPreset(HIERARCHICAL_TRIPLE_PRESET);
		for (const [width, height] of [[8, 3], [20, 6], [80, 18]] as const) {
			const rows = renderThreeBodyBrailleFrame(simulation.snapshot(), { width, height, trails: [], showTrail: false });
			expect(rows).toHaveLength(height);
			expect(rows.every(row => visibleWidth(row) <= width)).toBe(true);
		}
	});
});

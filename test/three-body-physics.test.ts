import { describe, expect, test }                          from "bun:test";
import { HIERARCHICAL_TRIPLE_PRESET, ThreeBodySimulation } from "../src/core/domain/work/three-body-simulation";

describe("three-body physics", () => {
	test("starts from the configured hierarchical triple state", () => {
		const simulation = ThreeBodySimulation.fromPreset(HIERARCHICAL_TRIPLE_PRESET);
		const snapshot = simulation.snapshot();

		expect(snapshot.bodies.map(body => [body.position.x, body.position.y, body.velocity.x, body.velocity.y])).toEqual([
			[-2, 0.5, -0.70710678, -0.23570226],
			[-2, -0.5, 0.70710678, -0.23570226],
			[4, 0, 0, 0.47140452],
		]);
		expect(snapshot.momentum.x).toBeCloseTo(0, 12);
		expect(snapshot.momentum.y).toBeCloseTo(0, 12);
		expect(snapshot.centerOfMass.x).toBeCloseTo(0, 12);
		expect(snapshot.centerOfMass.y).toBeCloseTo(0, 12);
		expect(snapshot.angularMomentum).toBeGreaterThan(3.5);
		expect(snapshot.energy.total).toBeLessThan(0);
	});

	test("conserves invariants without claiming a published periodic return", () => {
		const simulation = ThreeBodySimulation.fromPreset(HIERARCHICAL_TRIPLE_PRESET);
		simulation.advance(10);
		const evolved = simulation.snapshot();

		expect(evolved.time).toBeCloseTo(10, 6);
		expect(Math.abs(evolved.relativeEnergyDrift)).toBeLessThan(1e-5);
		expect(Math.hypot(evolved.momentum.x, evolved.momentum.y)).toBeLessThan(1e-12);
		expect(evolved.angularMomentum).toBeCloseTo(3.5355339, 6);
	});
});

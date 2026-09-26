import { describe, expect, test }               from "bun:test";
import { stripTerminalSequences, visibleWidth } from "@earendil-works/pi-tui";
import { ThreeBodyLabView }                     from "../src/adapters/inbound/tui/features/chat/view/three-body-lab";

function output(view: ThreeBodyLabView, width = 88): string {
	return view.render(width).map(stripTerminalSequences).join("\n");
}

describe("THREE BODY LAB", () => {
	test("renders the live nonlinear simulation, diagnostics, bodies, and controls", () => {
		const view = new ThreeBodyLabView({ viewportHeight: () => 24 });
		const rendered = output(view);

		expect(rendered).toContain("THREE BODY LAB");
		expect(rendered).toContain("ORBITING PAIR / GUARDIAN");
		expect(rendered).toContain("RUNNING");
		expect(rendered).toContain("TIME");
		expect(rendered).toContain("DT");
		expect(rendered).toContain("ENERGY");
		expect(rendered).toContain("ΔE");
		expect(rendered).toContain("MOMENTUM");
		expect(rendered).toContain("MASS");
		expect(rendered).toContain("VX");
		expect(rendered).toContain("[SPACE] Pause");
		expect(view.render(88).every(row => visibleWidth(row) <= 88)).toBe(true);
		expect(view.render(88).length).toBeLessThanOrEqual(24);
	});

	test("controls pause, reset, speed, trail, preset, and close without touching the composer", () => {
		let closed = 0;
		const view = new ThreeBodyLabView({ viewportHeight: () => 24, onClose: () => { closed += 1; } });

		view.advanceElapsed(1_000);
		expect(output(view)).toContain("TIME 4.000");
		expect(view.handleInput(" ")).toBe(true);
		view.advanceElapsed(1_000);
		expect(output(view)).toContain("PAUSED");
		expect(output(view)).toContain("TIME 4.000");

		expect(view.handleInput("+")).toBe(true);
		expect(output(view)).toContain("8.00×");
		expect(view.handleInput(" ")).toBe(true);
		view.advanceElapsed(500);
		expect(output(view)).toContain("TIME 8.000");

		expect(view.handleInput("t")).toBe(true);
		expect(output(view)).toContain("Trail off");
		expect(view.handleInput("1")).toBe(true);
		expect(output(view)).toContain("Hierarchical triple preset");
		expect(view.handleInput("r")).toBe(true);
		expect(output(view)).toContain("0.000");
		expect(view.handleInput("q")).toBe(true);
		expect(closed).toBe(1);
		expect(view.handleInput("x")).toBe(false);
	});
});

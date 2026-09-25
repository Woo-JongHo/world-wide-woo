import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { stripTerminalSequences, visibleWidth }                 from "@earendil-works/pi-tui";
import {
	WorkbenchWelcomeView,
	workbenchWelcomeLogoFrame,
} from "../src/adapters/inbound/tui/features/chat/workbench-welcome";
import {
	OCTOPUS_INTRO_DURATION_MS,
	OCTOPUS_INTRO_TURNS,
	octopusScanFrame,
} from "../src/adapters/inbound/tui/features/chat/octopus-scan";

describe("workbench welcome intro", () => {
	let noColor: string | undefined, reducedMotion: string | undefined;
	beforeEach(() => { noColor = process.env.NO_COLOR; reducedMotion = process.env.ASTRA_REDUCED_MOTION; delete process.env.NO_COLOR; delete process.env.ASTRA_REDUCED_MOTION; });
	afterEach(() => {
		if (noColor === undefined) delete process.env.NO_COLOR; else process.env.NO_COLOR = noColor;
		if (reducedMotion === undefined) delete process.env.ASTRA_REDUCED_MOTION; else process.env.ASTRA_REDUCED_MOTION = reducedMotion;
	});
	test("sweeps a stable WWW wordmark through distinct gradient frames", () => {
		const opening = workbenchWelcomeLogoFrame(0).join("\n")     ;
		const moving  = workbenchWelcomeLogoFrame(900).join("\n")   ;
		const resting = workbenchWelcomeLogoFrame(2_400).join("\n") ;

		expect(opening).not.toBe(moving);
		expect(moving).not.toBe(resting);
		expect(stripTerminalSequences(opening)).toBe(stripTerminalSequences(resting));
		expect(stripTerminalSequences(resting)).toContain("██╗");
	});

	test("shows the point-cloud Wooni in the welcome instead of the three-body orbit", () => {
		const view = new WorkbenchWelcomeView();
		const output = view.render(100).map(stripTerminalSequences).join("\n");
		expect(output).toContain("██╗");
		expect(output).not.toContain("ORBITING PAIR");
		expect(output).not.toContain("GUARDIAN");
		expect(output).toContain("/three-body");
		expect(output).toContain("🐙 Wooni · Native Project Workbench");
		expect(output).toContain("v0.0.19");
		expect(output).not.toContain("WOONI");
		expect(output).not.toContain("wooni@worldwide:~$");
		expect(output).not.toContain("Three Body");
		expect(output).toMatch(/[\u2801-\u28ff]/u);
		expect(view.render(80, 32)).toHaveLength(32);
		expect(view.render(80, 14)).toHaveLength(14);
	});

		test("turns in depth three times and settles front-on with bounded rows at every terminal size", () => {
		const frame = (elapsed: number) => stripTerminalSequences(octopusScanFrame(elapsed, 64, 23).join("\n"));
		expect(OCTOPUS_INTRO_TURNS).toBe(3);
		expect(frame(0)).not.toBe(frame(600));
		expect(frame(600)).not.toBe(frame(1200));
		expect(frame(0)).toBe(frame(OCTOPUS_INTRO_DURATION_MS));
		expect(frame(OCTOPUS_INTRO_DURATION_MS)).toBe(frame(10_000));
		for (const width of [1, 8, 36, 80, 160]) for (const height of [1, 4, 14, 32]) {
			const rows = new WorkbenchWelcomeView().render(width, height);
			expect(rows.length).toBeLessThanOrEqual(height);
			expect(rows.every(row => visibleWidth(row) <= width)).toBe(true);
		}
	});

	test("uses the extra room in a tall terminal for a larger readable expression", () => {
		const view = new WorkbenchWelcomeView();
		const artRows = (height: number) => view.render(100, height).map(stripTerminalSequences).filter(row => /[\u2801-\u28ff]/u.test(row));
		const compact = artRows(32), expanded = artRows(40);
		const occupiedWidth = (rows: string[]) => Math.max(...rows.map(row => visibleWidth(row.trim())));
		expect(expanded.length).toBeGreaterThan(compact.length);
		expect(occupiedWidth(expanded)).toBeGreaterThan(occupiedWidth(compact));
		expect(view.render(100, 40).join("\n")).toContain("Native Project Workbench");
	});

	test("stops the intro clock after three turns and does not replay on a second entry", async () => {
		let now = 0, repaints = 0;
		const clock = spyOn(performance, "now").mockImplementation(() => now);
		const view = new WorkbenchWelcomeView();
		try {
			view.playIntro(() => repaints++);
			now = OCTOPUS_INTRO_DURATION_MS + 1;
			await Bun.sleep(65);
			const settledRepaints = repaints;
			view.playIntro(() => repaints++);
			await Bun.sleep(65);
			expect(settledRepaints).toBe(2);
			expect(repaints).toBe(settledRepaints);
		} finally { view.dispose(); clock.mockRestore(); }
	});

	test("reduced motion and NO_COLOR render a static octopus without scheduling animation", async () => {
		for (const key of ["ASTRA_REDUCED_MOTION", "NO_COLOR"]) {
			const previous = process.env[key];
			process.env[key] = "1";
			let repaints = 0;
			const view = new WorkbenchWelcomeView();
			try {
				view.playIntro(() => repaints++);
				const first = view.render(80, 24).join("\n");
				await Bun.sleep(65);
				expect(view.render(80, 24).join("\n")).toBe(first);
				expect(repaints).toBe(1);
				if (key === "NO_COLOR") expect(first).not.toContain("\x1b[");
			} finally { view.dispose(); if (previous === undefined) delete process.env[key]; else process.env[key] = previous; }
		}
	});
});

import { describe, expect, test } from "bun:test";
import { stripTerminalSequences } from "@earendil-works/pi-tui";
import { WorkbenchWelcomeView, workbenchWelcomeLogoFrame } from "../src/presentation/tui/workbench-welcome";

describe("workbench welcome intro", () => {
	test("sweeps a stable WWW wordmark through distinct gradient frames", () => {
		const opening = workbenchWelcomeLogoFrame(0).join("\n");
		const moving = workbenchWelcomeLogoFrame(900).join("\n");
		const resting = workbenchWelcomeLogoFrame(2_400).join("\n");

		expect(opening).not.toBe(moving);
		expect(moving).not.toBe(resting);
		expect(stripTerminalSequences(opening)).toBe(stripTerminalSequences(resting));
		expect(stripTerminalSequences(resting)).toContain("██╗");
	});

	test("keeps Wooni out of the main welcome surface", () => {
		const output = new WorkbenchWelcomeView().render(100).map(stripTerminalSequences).join("\n");
		expect(output).toContain("██╗");
		expect(output).toContain("bori · Native Project Workbench");
		expect(output).not.toContain("WOONI");
		expect(output).not.toContain("wooni@worldwide:~$");
	});
});

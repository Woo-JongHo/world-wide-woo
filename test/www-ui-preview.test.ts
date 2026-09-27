import { expect, test }           from "bun:test";
import { stripTerminalSequences } from "@earendil-works/pi-tui";
import { previewCwd, snapshot }   from "../scripts/www-ui-preview";
import { WwwGoalBar, WwwHeader }  from "../src/adapters/inbound/tui/shell/www-surface";

test("offline preview labels fixture provenance on every page header and goal bar", () => {
	for (const page of ["Dashboard", "Context", "Usage", "Cache", "Workflow"]) {
		for (const width of [80, 120, 160]) {
			const header = new WwwHeader(() => snapshot, () => page, previewCwd, () => 0).render(width).map(stripTerminalSequences);
			expect(header.join("\n")).toContain("DEMO DATA");
			const goalBar = new WwwGoalBar(() => snapshot).render(width).map(stripTerminalSequences);
			expect(goalBar.join("\n")).toContain("GOAL");
			expect(goalBar.join("\n")).toContain("synthetic fixtures");
		}
	}
});

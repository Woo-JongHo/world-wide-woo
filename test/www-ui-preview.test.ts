import { expect, test }           from "bun:test";
import { stripTerminalSequences } from "@earendil-works/pi-tui";
import { previewCwd, snapshot }   from "../scripts/www-ui-preview";
import { WwwHeader }              from "../src/adapters/inbound/tui/shell/www-surface";

test("offline preview labels fixture provenance on every page header", () => {
	for (const page of ["Dashboard", "Context", "Usage", "Cache", "Workflow"]) {
		for (const width of [80, 120, 160]) {
			const rows = new WwwHeader(() => snapshot, () => page, previewCwd, () => 0).render(width).map(stripTerminalSequences);
			expect(rows.join("\n")).toContain("DEMO DATA");
			expect(rows.join("\n")).toContain("synthetic fixtures");
		}
	}
});

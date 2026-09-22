import { expect, test } from "bun:test";
import { stripTerminalSequences } from "@earendil-works/pi-tui";
import { previewCwd, snapshot } from "../scripts/astra-ui-preview";
import { AstraHeader } from "../src/adapters/inbound/tui/shell/astra-surface";

test("offline preview labels fixture provenance on every page header", () => {
	for (const page of ["Dashboard", "Context", "Usage", "Cache", "Workflow"]) {
		for (const width of [80, 120, 160]) {
			const rows = new AstraHeader(() => snapshot, () => page, previewCwd, () => 0).render(width).map(stripTerminalSequences);
			expect(rows.join("\n")).toContain("DEMO DATA");
			expect(rows.join("\n")).toContain("synthetic fixtures");
		}
	}
});

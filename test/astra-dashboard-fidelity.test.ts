import { expect, test } from "bun:test";
import chalk from "chalk";
import { stripTerminalSequences, visibleWidth } from "@earendil-works/pi-tui";
import { AstraDashboardRail, WwwDashboardView } from "../src/adapters/inbound/tui/features/dashboard/entry-dashboard-view";
import { astraFixture } from "./fixtures/astra-snapshot";
import { renderLayoutFrame } from "@earendil-works/pi-tui/dist/layout.js";
import { AstraWorkspace } from "../src/adapters/inbound/tui/shell/astra-surface";
import { createAstraDemoState } from "../src/adapters/inbound/tui/features/demo/astra-demo";

test.each([160, 200])("Dashboard fits its lower analysis and rail in the first %i by 36 viewport", width => {
	const demo = createAstraDemoState(astraFixture());
	const dashboard = new WwwDashboardView(() => demo.snapshot, () => true);
	const workspace = new AstraWorkspace(() => demo.snapshot, () => demo.usage, undefined, () => 0, false, null, dashboard, undefined, undefined, {}, undefined, () => true);
	workspace.show("dashboard");
	const rows = renderLayoutFrame(workspace.component, width, 36, () => {}).lines;
	const text = rows.map(stripTerminalSequences).join("\n");
	for (const label of ["TOKEN ALLOCATION TRENDS", "SESSION EVENT AGGREGATES", "Critical failures", "NAVIGATION GUIDE", "PERSISTENT CACHE"]) expect(text).toContain(label);
	expect(rows.every(row => visibleWidth(row) <= width)).toBe(true);
});

test.each([100, 118, 160, 200])("Dashboard Figma catalog keeps panels and fixed meter axes within %i cells", width => {
	const rows = new WwwDashboardView(astraFixture, () => true).render(width);
	const plain = rows.map(stripTerminalSequences);
	const text = plain.join("\n");
	for (const title of ["ACTIVE SESSION ID", "TOTAL REQUESTS", "SESSION TOKENS", "ELAPSED TIME", "SYSTEMS HEALTH", "SYSTEM INTEGRATED MODULE ROUTER", "TOKEN ALLOCATION TRENDS", "ACCESS FREQUENCY HEATMAP", "SESSION EVENT AGGREGATES"]) expect(text).toContain(title);
	expect(rows.every(row => visibleWidth(row) === width)).toBe(true);
	expect(rows.length).toBeLessThanOrEqual(30);
	const meters = plain.filter(row => /^│(?:INPUT|OUTPUT|CACHED)\s/u.test(row) && row.includes("█"));
	expect(meters).toHaveLength(3);
	expect(new Set(meters.map(row => row.indexOf("█"))).size).toBe(1);
	expect(new Set(meters.map(row => row.indexOf("%"))).size).toBe(1);
});

test.each([1, 20, 40, 60, 80])("Dashboard catalog and rail remain bounded at %i cells", width => {
	const components = [new WwwDashboardView(astraFixture, () => true), new AstraDashboardRail(astraFixture, () => true)];
	for (const component of components) expect(component.render(width).every(row => visibleWidth(row) <= width)).toBe(true);
});

test("Dashboard fixtures require explicit opt-in and never leak into live snapshot rendering", () => {
	const snapshot = astraFixture();
	snapshot.projectId = "DEMO DATA synthetic";
	const live = stripTerminalSequences(new WwwDashboardView(() => snapshot).render(160).join("\n"));
	expect(live).toContain("INPUT / OUTPUT / CACHE · unavailable");
	expect(live).not.toContain("2,842");
	expect(live).not.toContain("4,120");
});

test("Dashboard heatmap has distinct supplied intensity colors and rail shows bounded load meters", () => {
	const before = chalk.level;
	chalk.level = 3;
	try {
		const rows = new WwwDashboardView(astraFixture, () => true).render(160);
		const heat = rows.filter(row => (row.match(/\x1b\[48;2;\d+;\d+;\d+m/gu)?.length ?? 0) >= 12);
		expect(heat).toHaveLength(3);
		expect(new Set(heat.join("").match(/\x1b\[48;2;\d+;\d+;\d+m/gu)).size).toBeGreaterThanOrEqual(5);
		const rail = stripTerminalSequences(new AstraDashboardRail(astraFixture, () => true).render(34).join("\n"));
		for (const label of ["SESSION CONTEXT SPACE", "SYSTEM LOAD", "VIRTUAL SWAP", "PERSISTENT CACHE", "NAVIGATION GUIDE", "synthetic", "█"]) expect(rail).toContain(label);
	} finally { chalk.level = before; }
});

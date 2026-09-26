import { expect, test }                         from "bun:test";
import chalk                                    from "chalk";
import { stripTerminalSequences, visibleWidth } from "@earendil-works/pi-tui";
import { renderLayoutFrame }                    from "@earendil-works/pi-tui/dist/layout.js";
import { WwwWorkspace }                         from "../src/adapters/inbound/tui/shell/www-surface";
import { WwwContextView }                       from "../src/adapters/inbound/tui/features/context/view/www-context-view";
import { createWwwDemoState }                   from "../src/adapters/inbound/tui/features/demo/view-model/www-demo";
import { wwwFixture }                           from "./fixtures/www-snapshot";

test.each([160, 200])("Demo Context catalog is visible in the first %i x 36 workspace viewport", width => {
	const demo = createWwwDemoState(wwwFixture(), () => 0);
	const workspace = new WwwWorkspace(() => demo.snapshot, () => demo.usage, undefined, () => 0, false, null, undefined, undefined, undefined, {}, undefined, () => true);
	workspace.show("context");
	const rows = renderLayoutFrame(workspace.component, width, 36, () => {}).lines;
	const text = rows.map(stripTerminalSequences).join("\n");
	for (const label of ["TOTAL CAPACITY", "USED TOKENS", "FREE SPACE", "COMPRESSION", "LAST RETRIEVAL", "ACTIVE MODEL", "EFFORT CONFIG", "CONTEXT ACCUMULATION SPECTROMETER", "CONTEXT COMPOSITION BREAKDOWN", "CONTEXT CHANGE ACTIVITY", "DIAGNOSTIC EVENT AGGREGATES", "SYSTEM DEPENDENCY MAP", "TOP ITEMS BY SIZE", "STATE CHANGE ALERTS", "LOADED SKILLS", "MCP SERVERS", "STORAGE METRICS", "synthetic fixtures", "not live telemetry", "T-8", "T-1"]) expect(text).toContain(label);
	expect(rows.every(row => visibleWidth(row) <= width)).toBe(true);
});

test("Demo spectrometer uses multiple source colors and proportional cells; Live never opts in from snapshot text", () => {
	const before = chalk.level;
	chalk.level = 3;
	try {
		const snapshot = createWwwDemoState(wwwFixture()).snapshot                                                                                               ;
		const rows     = new WwwContextView(() => snapshot, undefined, false, () => true).render(118)                                                            ;
		const bar      = rows.find(row => stripTerminalSequences(row).includes("SYS") && stripTerminalSequences(row).includes("CONV") && row.includes("48;2;"))! ;
		expect(bar).toBeDefined();
		expect(new Set(bar.match(/\x1b\[48;2;\d+;\d+;\d+m/gu)).size).toBeGreaterThanOrEqual(7);
		const sys = bar.match(/\x1b\[48;2;131;165;152m(?:\x1b\[[0-9;]*m)*([^\x1b]*)/u)!;
		const conv = bar.match(/\x1b\[48;2;251;241;199m(?:\x1b\[[0-9;]*m)*([^\x1b]*)/u)!;
		expect(visibleWidth(sys[1]!)).toBe(Math.round(116 * 4 / 48));
		expect(visibleWidth(conv[1]!)).toBe(Math.round(116 * 24 / 48) - Math.round(116 * 4 / 48));
		const composition = rows.map(stripTerminalSequences).find(row => row.includes("CONV") && row.includes("41.7%"))!;
		expect(composition).toContain("█");
		expect(composition).toContain("░");
		const live = stripTerminalSequences(new WwwContextView(() => snapshot).render(118).join("\n"));
		expect(live).toContain("Source token allocation unavailable");
		expect(live).not.toContain("CONV growing");
		expect(live).not.toMatch(/MCP[^\n]*64%/u);
	} finally { chalk.level = before; }
});

test.each([40, 60, 80, 118])("Demo Context remains bounded and scrollable at %i columns", width => {
	const demo = createWwwDemoState(wwwFixture());
	const rows = new WwwContextView(() => demo.snapshot, undefined, false, () => true).render(width);
	expect(rows.every(row => visibleWidth(row) <= width)).toBe(true);
	expect(stripTerminalSequences(rows.join("\n"))).toContain("CONTEXT CHANGE ACTIVITY");
});

test("Demo Context renders only the Figma catalog instead of appending the live ledger", () => {
	const demo = createWwwDemoState(wwwFixture());
	const text = stripTerminalSequences(new WwwContextView(() => demo.snapshot, () => demo.usage, false, () => true).render(160).join("\n"));
	expect(text).toContain("CONTEXT ACCUMULATION SPECTROMETER");
	expect(text).toContain("STATE CHANGE ALERTS");
	expect(text).not.toContain("Context Ledger");
	expect(text).not.toContain("Provider 사용량");
	expect(text).not.toContain("계획 연결 근거");
});

test("Demo Context composition uses one shared table axis for every source", () => {
	const demo   = createWwwDemoState(wwwFixture())                                                                                     ;
	const rows   = new WwwContextView(() => demo.snapshot, () => demo.usage, false, () => true).render(160).map(stripTerminalSequences) ;
	const header = rows.find(row => row.includes("DISTRIBUTION") && row.includes("SHARE"))                                              ;
	expect(header).toBeDefined();
	const start      = rows.findIndex(row => row.includes("CONTEXT COMPOSITION BREAKDOWN"))                                  ;
	const end        = rows.findIndex((row, index) => index > start && row.includes("CONTEXT CHANGE ACTIVITY"))              ;
	const sourceRows = rows.slice(start, end).filter(row => /^│(?:SYS|CONV|SKILL|MCP|MEM|WORK|RUNT|NOTE|TOOL)\s/u.test(row)) ;
	expect(sourceRows).toHaveLength(9);
	const sizeAxis = header!.indexOf("SIZE");
	const shareAxis = header!.indexOf("SHARE");
	expect(sourceRows.every(row => row.indexOf("MB") >= sizeAxis && row.indexOf("%") >= shareAxis)).toBe(true);
});

test.each([118, 160])("Demo Context diagnostic and ranking values share axes at %i columns", width => {
	const demo        = createWwwDemoState(wwwFixture())                                                                                       ;
	const rows        = new WwwContextView(() => demo.snapshot, () => demo.usage, false, () => true).render(width).map(stripTerminalSequences) ;
	const diagnostics = rows.filter(row => /■ (SYSTEM INIT|MCP SYNC|MEMORY EVICTIONS|RUNTIME COMPILE|EVICTION RISK)/u.test(row))               ;
	expect(diagnostics).toHaveLength(5);
	const stateColumns = diagnostics.map(row => visibleWidth(row.slice(0, row.search(/OK|FREED|NONE NOW/u))));
	expect(new Set(stateColumns).size).toBe(1);
	const items = rows.filter(row => /│0[1-4]  /u.test(row));
	expect(items).toHaveLength(4);
	const sizeColumns = items.map(row => {
		const item = row.slice(row.search(/│0[1-4]  /u));
		return visibleWidth(item.slice(0, item.indexOf("MB")));
	});
	expect(new Set(sizeColumns).size).toBe(1);
});

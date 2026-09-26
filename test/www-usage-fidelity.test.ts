import { expect, test }                         from "bun:test";
import { stripTerminalSequences, visibleWidth } from "@earendil-works/pi-tui";
import { renderLayoutFrame }                    from "@earendil-works/pi-tui/dist/layout.js";
import { WwwWorkspace }                         from "../src/adapters/inbound/tui/shell/www-surface";
import { WwwUsageView }                         from "../src/adapters/inbound/tui/features/usage/view/www-usage-view";
import { createWwwDemoState }                   from "../src/adapters/inbound/tui/features/demo/view-model/www-demo";
import { wwwFixture }                           from "./fixtures/www-snapshot";

test.each([160, 200])("Usage explains resource use in the first %i x 36 workspace", width => {
	const demo = createWwwDemoState(wwwFixture(), () => 0);
	const workspace = new WwwWorkspace(() => demo.snapshot, () => demo.usage, undefined, () => 0, false, null, undefined, undefined, undefined, {}, undefined, () => true);
	workspace.show("usage");
	const rows = renderLayoutFrame(workspace.component, width, 36, () => {}).lines;
	const text = rows.map(stripTerminalSequences).join("\n");
	for (const label of ["모델별 사용 내역", "직접 대화", "분리 실행", "작업별 귀속", "DEMO DATA"]) expect(text).toContain(label);
	for (const label of ["Token Trend", "Performance Trend", "Provider Load Ratio"]) expect(text).not.toContain(label);
	expect(rows.every(row => visibleWidth(row) <= width)).toBe(true);
});

test("Usage separates observed execution routes from unobserved task attribution", () => {
	const snapshot = wwwFixture();
	snapshot.sessionUsage = {
		totalTokens: 1650, observedTotalTokens: 1650, unattributedTokens: 150,
		models: [{ model: "test-model", effort: "high", interactiveRootTurns: 2, interactiveTokens: 1200, detachedInvocations: 1, detachedTokens: 300, totalTokens: 1500 }],
		observationCoverage: { interactive: true, detached: true },
	};
	const text = new WwwUsageView(() => snapshot, () => []).render(120).map(stripTerminalSequences).join("\n");
	for (const value of ["test-model", "1.2K", "300", "150", "작업별 귀속 미확인"]) expect(text).toContain(value);
	expect(text).not.toContain("DEMO DATA");
	snapshot.sessionUsage = { ...snapshot.sessionUsage, observedTotalTokens: null, models: [], observationCoverage: { interactive: false, detached: false } };
	const missing = new WwwUsageView(() => snapshot, () => []).render(120).map(stripTerminalSequences).join("\n");
	expect(missing).toContain("모델 사용 내역 미관측");
	expect(missing).not.toContain("0 tokens");
});

test.each([true, false])("Usage labels partial route coverage as observed, interactive=%s", interactive => {
	const snapshot = wwwFixture();
	snapshot.sessionUsage = {
		totalTokens: 300, observedTotalTokens: 300, unattributedTokens: 0,
		models: [{ model: "partial-model", effort: null, interactiveRootTurns: interactive ? 1 : 0, interactiveTokens: interactive ? 300 : 0, detachedInvocations: interactive ? 0 : 1, detachedTokens: interactive ? 0 : 300, totalTokens: 300 }],
		observationCoverage: { interactive, detached: !interactive },
	};
	for (const width of [60, 120]) {
		const text = new WwwUsageView(() => snapshot, () => []).render(width).map(stripTerminalSequences).join("\n");
		expect(text).toContain("미관측");
		expect(text).toContain("관측");
		expect(text).toContain("0 tokens");
		expect(text).not.toContain("TOTAL");
	}
});

test.each([40, 60, 80, 118, 160])("Usage demo stays bounded at %i columns and requires explicit opt-in", width => {
	const demo = createWwwDemoState(wwwFixture());
	const rows = new WwwUsageView(() => demo.snapshot, () => demo.usage, () => true).render(width);
	expect(rows.every(row => visibleWidth(row) <= width)).toBe(true);
	const live = new WwwUsageView(() => demo.snapshot, () => demo.usage).render(width).map(stripTerminalSequences).join("\n");
	expect(live).not.toContain("14.2M/8.1M/4.1M");
});

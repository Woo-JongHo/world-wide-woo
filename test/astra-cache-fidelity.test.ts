import { expect, test } from "bun:test";
import chalk from "chalk";
import { stripTerminalSequences, visibleWidth } from "@earendil-works/pi-tui";
import { composeCacheTelemetry } from "../src/core/domain/observability/cache-telemetry";
import { AstraCacheRail, AstraCacheView } from "../src/adapters/inbound/tui/features/cache/astra-cache-view";

const emptyCache = () => composeCacheTelemetry({ collectedAt: "2026-09-22T00:00:00Z", observations: [] });

test.each([118, 160, 200])("Cache demo exposes every reference panel in 36 rows at %i columns", width => {
	const rows = new AstraCacheView(emptyCache, () => true).render(width);
	const text = rows.map(stripTerminalSequences).join("\n");
	for (const label of ["CACHE OCCUPIED", "MAX CAPACITY", "CACHE HIT RATE", "MISS RATE", "ACTIVE EVICTIONS", "LAST PURGE", "CACHE SLICES", "CACHE OCCUPANCY DISTRIBUTION", "ACCESS FREQUENCY HEATMAP", "HIT / MISS TREND", "EVICTION TREND", "MISS CAUSE SUMMARY", "DIAGNOSTIC SUMMARY", "DATA REUSE FLOW MAP", "STALE / EVICTION RISK"]) expect(text).toContain(label);
	expect(rows.length).toBeLessThanOrEqual(36);
	expect(rows.every(row => visibleWidth(row) === width)).toBe(true);
	expect(text).toContain("synthetic fixtures · not live telemetry");
	expect(text).toContain("EVICT_READY");
});

test("Cache slice hit bars and state values share fixed axes", () => {
	const rows = new AstraCacheView(emptyCache, () => true).render(160).map(stripTerminalSequences);
	const start = rows.findIndex(row => row.includes("CACHE SLICES"));
	const slices = rows.slice(start + 3, start + 10);
	expect(slices).toHaveLength(7);
	expect(new Set(slices.map(row => row.indexOf("█"))).size).toBe(1);
	expect(new Set(slices.map(row => row.search(/SAFE|PROTECTED|EVICT_READY|IMMUTABLE/u))).size).toBe(1);
});

test.each([1, 20, 40, 60, 80, 99])("Cache demo retains bounded rows at %i columns", width => {
	for (const component of [new AstraCacheView(emptyCache, () => true), new AstraCacheRail(emptyCache, () => true)]) {
		const rows = component.render(width);
		expect(rows.every(row => visibleWidth(row) <= width)).toBe(true);
	}
});

test("Cache demo chart colors and rail are explicit previews; live remains unobserved", () => {
	const before = chalk.level;
	chalk.level = 3;
	try {
		const demo = new AstraCacheView(emptyCache, () => true).render(160).join("\n");
		expect(new Set(demo.match(/\x1b\[38;2;\d+;\d+;\d+m/gu)).size).toBeGreaterThanOrEqual(6);
		const rail = stripTerminalSequences(new AstraCacheRail(emptyCache, () => true).render(36).join("\n"));
		expect(rail).toContain("EVICTION RATE TREND");
		expect(rail).toContain("Actions are preview only");
		expect(rail).not.toContain("EXEC");
		const live = stripTerminalSequences(new AstraCacheView(emptyCache).render(160).join("\n"));
		expect(live).toContain("unavailable");
		expect(live).not.toContain("142.4 MB");
		expect(live).not.toContain("94.2%");
	} finally { chalk.level = before; }
});

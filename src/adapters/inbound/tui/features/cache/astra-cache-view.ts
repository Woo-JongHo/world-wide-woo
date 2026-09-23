import type { Component } from "@earendil-works/pi-tui";
import type { CacheLayerTelemetry, CacheTelemetrySnapshot } from "../../../../../core/domain/observability/cache-telemetry";
import { monitoringCard, monitoringColumns, monitoringMeter, monitoringWidths } from "../../foundation/layout/astra-monitoring-layout";
import { a, fit, number, pair, prose, railSection, section } from "../../foundation/theme/astra-theme";
import { syntheticCacheRailRows, syntheticCacheRows } from "./astra-cache-catalog";

function bytes(value: number | null): string {
	if (value === null) return "미관측";
	if (value < 1024) return `${value} B`;
	if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KiB`;
	return `${(value / 1024 / 1024).toFixed(2)} MiB`;
}

function count(value: number | null): string { return value === null ? "—" : number(value); }
function access(value: string | null): string { return value ? value.replace("T", " ").replace(/\.\d{3}Z$/u, "Z") : "—"; }
function rate(layer: CacheLayerTelemetry): string {
	if (layer.hits === null || layer.misses === null || layer.hits + layer.misses === 0) return "미관측";
	return `${Math.round(layer.hits / (layer.hits + layer.misses) * 100)}%`;
}
function stateInk(layer: CacheLayerTelemetry): (text: string) => string {
	if (layer.state === "stale") return a.attention;
	if (layer.state === "unobserved") return a.muted;
	return a.success;
}
function layerRows(layer: CacheLayerTelemetry, width: number): string[] {
	return [
		pair(stateInk(layer)(layer.label), `${layer.state}  ·  ${count(layer.entries)} entries`, width),
		pair(a.muted(`  Size ${bytes(layer.logicalBytes)}`), a.muted(`Hit ${rate(layer)}  ·  Evict ${count(layer.evictions)}`), width),
	];
}

function summaryRows(cache: CacheTelemetrySnapshot, hitRate: number | null, observed: number, width: number): string[] {
	const cards = [
		{ title: "Entries", value: count(cache.totals.entries), detail: "observed cache records" },
		{ title: "Logical size", value: bytes(cache.totals.logicalBytes), detail: "known retained bytes" },
		{ title: "Hit rate", value: hitRate === null ? "미관측" : `${hitRate}%`, detail: "observed hits / access" },
		{ title: "Misses", value: count(cache.totals.misses), detail: "owner cache misses" },
		{ title: "Evictions", value: count(cache.totals.evictions), detail: "observed replacements" },
		{ title: "Coverage", value: `${observed}/7`, detail: "instrumented layers" },
	];
	const countPerRow = width >= 108 ? 3 : width >= 64 ? 2 : 1;
	const rows: string[] = [];
	for (let index = 0; index < cards.length; index += countPerRow) {
		const group = cards.slice(index, index + countPerRow);
		const widths = monitoringWidths(width, group.length);
		rows.push(...monitoringColumns(group.map((card, cardIndex) => monitoringCard(card, widths[cardIndex]!)), widths));
	}
	return rows;
}

function cacheGrid(layers: readonly CacheLayerTelemetry[], width: number): string[] {
	if (width < 78) return layers.flatMap(layer => layerRows(layer, width));
	const widths = [18, 7, 10, 6, 7, width - 70, 5, 10];
	const row = (cells: readonly string[]) => cells.map((cell, index) => fit(cell, widths[index]!)).join(" ");
	return [
		a.muted(row(["CACHE SLICE", "ENTRIES", "USAGE", "HIT", "MISS", "LAST ACCESS", "TTL", "STATUS"])),
		a.rule("─".repeat(Math.min(width, widths.reduce((sum, value) => sum + value, 0) + widths.length - 1))),
		...layers.map(layer => row([
			stateInk(layer)(layer.label), count(layer.entries), bytes(layer.logicalBytes), count(layer.hits), count(layer.misses),
			access(layer.lastAccessedAt), "—", layer.state,
		])),
	];
}

function observedTotal(layers: readonly CacheLayerTelemetry[], key: "logicalBytes" | "hits" | "misses" | "evictions"): number | null {
	const values = layers.flatMap(layer => layer[key] ?? []);
	return values.length ? values.reduce((total, value) => total + value, 0) : null;
}

function logicalByteDistributionPanel(layers: readonly CacheLayerTelemetry[], width: number): string[] {
	const byteLayers = layers.filter((layer): layer is CacheLayerTelemetry & { logicalBytes: number } => layer.logicalBytes !== null);
	const total = observedTotal(layers, "logicalBytes");
	const rows = [...section("Logical byte distribution", width, total === null ? "unavailable" : "observed byte shares", a.active)];
	rows.push(a.caption("Capacity limit unavailable · shares are not utilization."));
	if (total === null || byteLayers.length === 0) return [...rows, a.muted("Logical-byte source unavailable for every cache layer.")];
	rows.push(pair("Observed logical bytes", bytes(total), width));
	for (const layer of byteLayers) {
		const share = total > 0 ? Math.round(layer.logicalBytes / total * 100) : 0;
		rows.push(pair(layer.label, `${bytes(layer.logicalBytes)} · ${share}% of observed bytes`, width));
		rows.push(monitoringMeter(layer.logicalBytes, total, Math.max(8, Math.min(34, width - 2)), stateInk(layer)));
	}
	return rows;
}

function hitMissEvictionPanel(layers: readonly CacheLayerTelemetry[], width: number): string[] {
	const hits = observedTotal(layers, "hits");
	const misses = observedTotal(layers, "misses");
	const evictions = observedTotal(layers, "evictions");
	const rows = [...section("Hit / Miss & Eviction Trends", width, "aggregate only", a.active)];
	if (hits === null || misses === null) rows.push(a.muted("Hit / miss aggregate unavailable."));
	else {
		rows.push(pair("Observed access", `${number(hits)} hit · ${number(misses)} miss`, width));
		rows.push(monitoringMeter(hits, hits + misses, Math.max(8, Math.min(34, width - 2)), a.success));
	}
	rows.push(pair("Observed evictions", count(evictions), width));
	rows.push(a.muted("Cycle trend unavailable: no time-bucket telemetry source."));
	return rows;
}

function accessHeatmapPanel(width: number): string[] {
	return [
		...section("Access Heatmap", width, "unavailable", a.active),
		a.muted("Access timestamp buckets are not collected."),
		a.muted("A heatmap is enabled only when a time-bucket source is present."),
	];
}

function missDiagnosticsPanel(layers: readonly CacheLayerTelemetry[], width: number): string[] {
	const misses = layers.filter((layer): layer is CacheLayerTelemetry & { misses: number } => layer.misses !== null);
	const rows = [...section("Miss Diagnostics", width, "cause source unavailable", a.active)];
	if (misses.length === 0) rows.push(a.muted("No per-layer miss counters are observed."));
	else for (const layer of misses) rows.push(pair(layer.label, `${number(layer.misses)} observed misses`, width));
	rows.push(a.muted("TTL, cold-start, invalidation, and upstream causes are not collected."));
	return rows;
}

function telemetryFlowPanel(layers: readonly CacheLayerTelemetry[], width: number): string[] {
	const observed = layers.filter(layer => layer.state !== "unobserved");
	const rows = [...section("Telemetry Flow", width, `${observed.length}/7 observed`, a.active)];
	if (observed.length === 0) rows.push(a.muted("Runtime cache observation source unavailable."));
	else {
		rows.push(pair("Runtime observations", `${observed.length} layer feeds`, width));
		rows.push(a.muted("observed layers → cache telemetry snapshot → Cache dashboard"));
		rows.push(a.muted(observed.map(layer => layer.label).join(" · ")));
	}
	rows.push(a.muted("Upstream backend identity is unavailable unless emitted by telemetry."));
	return rows;
}

export class AstraCacheView implements Component {
	constructor(private readonly get: () => CacheTelemetrySnapshot, private readonly isDemo: () => boolean = () => false) {}
	invalidate(): void {}
	render(width: number): string[] {
		if (this.isDemo()) return syntheticCacheRows(width);
		const cache = this.get();
		const observedRates = cache.layers.filter(layer => layer.hits !== null && layer.misses !== null);
		const hits = observedRates.reduce((sum, layer) => sum + layer.hits!, 0);
		const misses = observedRates.reduce((sum, layer) => sum + layer.misses!, 0);
		const hitRate = hits + misses > 0 ? Math.round(hits / (hits + misses) * 100) : null;
		const observed = cache.layers.filter(layer => layer.state !== "unobserved").length;
		const rows = [
			...section("Cache Controller", width, `${observed}/7 observed`),
			...summaryRows(cache, hitRate, observed, width),
			...section("Cache slices", width, "AGI Workbench 7 layers"),
			...cacheGrid(cache.layers, width),
		];
		rows.push(
			...logicalByteDistributionPanel(cache.layers, width),
			...hitMissEvictionPanel(cache.layers, width),
			...accessHeatmapPanel(width),
			...missDiagnosticsPanel(cache.layers, width),
			...telemetryFlowPanel(cache.layers, width),
		);
		rows.push(
			...section("Telemetry policy", width),
			a.muted("직접 관측된 값만 합산합니다. 알 수 없는 bytes·hit·miss는 0으로 추정하지 않습니다."),
			a.muted(`Collected ${cache.collectedAt}`),
		);
		return rows.flatMap(row => prose(fit(row, width), width));
	}
}

export class AstraCacheRail implements Component {
	constructor(private readonly get: () => CacheTelemetrySnapshot, private readonly isDemo: () => boolean = () => false) {}
	invalidate(): void {}
	render(width: number): string[] {
		if (this.isDemo()) return syntheticCacheRailRows(width);
		const cache = this.get();
		const stale = cache.layers.filter(layer => layer.state === "stale");
		const missing = cache.layers.filter(layer => layer.state === "unobserved");
		const health = stale.length ? `${stale.length} stale` : missing.length ? `${missing.length} unobserved` : "nominal";
		const healthInk = stale.length ? a.attention : missing.length ? a.muted : a.success;
		const rows = [
			...railSection("Cache health", width, health, healthInk),
			pair("Layers", `${cache.layers.length}`, width),
			pair("Entries", count(cache.totals.entries), width),
			pair("Logical", bytes(cache.totals.logicalBytes), width),
			pair("Evictions", count(cache.totals.evictions), width),
			...railSection("State alerts", width),
		];
		if (!stale.length && !missing.length) rows.push(a.success("✓ 모든 cache layer 관측 중"));
		for (const layer of stale) rows.push(a.attention(`! ${layer.label} · stale`));
		for (const layer of missing) rows.push(a.muted(`· ${layer.label} · unobserved`));
		for (const layer of cache.layers.filter(layer => layer.state === "ready").slice(0, 3)) rows.push(a.success(`✓ ${layer.label} · ready`));
		rows.push(
			...railSection("Cache actions", width, "read-only"),
			pair("Force eviction purge", "disabled", width),
			pair("Sync directory cache", "unavailable", width),
			pair("Reset statistics", "disabled", width),
			pair("Validate integrity", "unavailable", width),
			...railSection("24-hour trend", width, "unobserved"),
			a.muted("시계열 source가 연결되면 활성화됩니다."),
		);
		return rows.flatMap(row => prose(fit(row, width), width));
	}
}

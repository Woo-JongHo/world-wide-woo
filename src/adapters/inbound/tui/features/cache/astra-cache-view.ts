import type { Component } from "@earendil-works/pi-tui";
import { a, fit, number, pair, prose, section } from "../../foundation/theme/astra-theme";

export interface CacheDiagnostics {
	readonly durableBlockCount: number;
	readonly volatileBlockCount: number;
	readonly markdownEntries: number;
	readonly rowEntries: number;
	readonly rowLogicalBytes: number;
	readonly widthStates: number;
	readonly widthMetadataLogicalBytes: number;
	readonly exactCountBuilds: number;
	readonly exactCountBuildMs: number;
	readonly requestedRows: number;
	readonly requestedMaterializationMs: number;
	readonly renderedBlocks: number;
	readonly durableGraphBuilds: number;
	readonly durableGraphBuildMs: number;
	readonly durableGenerationNoopReuses: number;
	readonly durableCountReusedBlocks: number;
	readonly durableCountRenderedBlocks: number;
}

const ROW_LIMIT = 8 * 1024 * 1024;
const WIDTH_LIMIT = 4 * 1024 * 1024;
function bytes(value: number): string { return value < 1024 ? `${value} B` : value < 1024 * 1024 ? `${(value / 1024).toFixed(1)} KiB` : `${(value / 1024 / 1024).toFixed(2)} MiB`; }
function meter(value: number, total: number, width: number): string {
	const filled = Math.round(Math.max(0, Math.min(1, total ? value / total : 0)) * width);
	return a.active("━".repeat(filled)) + a.rule("━".repeat(width - filled));
}
function rate(hit: number, built: number): string { const total = hit + built; return total ? `${Math.round(hit / total * 100)}%` : "—"; }

export class AstraCacheView implements Component {
	constructor(private readonly get: () => CacheDiagnostics) {}
	invalidate(): void {}
	render(width: number): string[] {
		const c = this.get();
		const gaugeWidth = Math.max(8, Math.min(30, width - 2));
		const rows = [
			...section("Cache Dashboard", width, "live"),
			pair(a.strong(`${number(c.rowEntries)} rendered rows`), `${number(c.markdownEntries)} markdown views`, width),
			pair(`Reuse  ${rate(c.durableCountReusedBlocks, c.durableCountRenderedBlocks)}`, `No-op reuse  ${number(c.durableGenerationNoopReuses)}`, width),
			"",
			pair("Row cache", `${bytes(c.rowLogicalBytes)} / ${bytes(ROW_LIMIT)}`, width),
			meter(c.rowLogicalBytes, ROW_LIMIT, gaugeWidth),
			pair("Width metadata", `${bytes(c.widthMetadataLogicalBytes)} / ${bytes(WIDTH_LIMIT)}`, width),
			meter(c.widthMetadataLogicalBytes, WIDTH_LIMIT, gaugeWidth),
			...section("Layers", width),
			pair("Durable graph", `${number(c.durableBlockCount)} blocks  ·  ${number(c.durableGraphBuilds)} builds`, width),
			pair("Volatile graph", `${number(c.volatileBlockCount)} blocks`, width),
			pair("Layout states", `${number(c.widthStates)} widths  ·  ${number(c.exactCountBuilds)} exact counts`, width),
			...section("Work", width),
			pair("Materialized", `${number(c.requestedRows)} rows  ·  ${c.requestedMaterializationMs.toFixed(1)} ms`, width),
			pair("Rendered", `${number(c.renderedBlocks)} blocks`, width),
			pair("Graph build", `${c.durableGraphBuildMs.toFixed(1)} ms`, width),
			"",
			a.muted("현재 프로세스의 transcript 렌더 캐시입니다. 화면을 다시 그리면 수치가 갱신됩니다."),
		];
		return rows.flatMap(row => prose(fit(row, width), width));
	}
}

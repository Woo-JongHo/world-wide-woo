import type { UsageSnapshot } from "@/core/ports/observability/usage-monitor-port";
import {
	monitoringBars,
	monitoringColumns,
	monitoringCompactPanel,
	monitoringMeter,
	monitoringTable,
	monitoringWidths,
} from "@/adapters/inbound/tui/foundation/layout/www-monitoring-layout";
import { a, fit, pair }       from "@/adapters/inbound/tui/foundation/theme/www-theme";

// Presentation fixtures only: enabled by the shell's explicit Demo state.
const providers = [
	{ id : "openai-codex" , label : "Codex"       , ink : a.codex  },
	{ id : "anthropic"    , label : "Claude"      , ink : a.claude },
	{ id : "google"       , label : "Antigravity" , ink : a.gemini },
	{ id : "zai"          , label : "Z.AI"        , ink : a.zai    },
] as const;

function heading(title: string, width: number): string[] {
	return [fit(a.active("■ " + title), width), a.rule("─".repeat(width))];
}

function providerStrip(usage: readonly UsageSnapshot[], width: number): string[] {
	const widths = monitoringWidths(width, width >= 96 ? 4 : 1);
	const cards = providers.map((provider, index) => {
		const size      = widths[index] ?? width                                   ;
		const quota     = usage.find(item => item.provider === provider.id)        ;
		const remaining = quota?.limits[0]?.remainingPercent                       ;
		const label     = remaining == null ? "미관측" : `${remaining}% remaining` ;
		const rows = [
			provider.ink(label),
			remaining == null ? a.muted("quota unavailable") : monitoringMeter(remaining, 100, Math.max(4, size - 2), provider.ink),
			pair("TTL", quota?.stale ? "STALE" : quota?.state ?? "미관측", size - 2),
		];
		return monitoringCompactPanel(provider.label, rows, size);
	});
	return width >= 96 ? monitoringColumns(cards, widths) : cards.flat();
}

function modelTable(width: number): string[] {
	const columns = [
		{ heading : "MODEL"        , minWidth : 19 , weight : 1 , align : "left"  },
		{ heading : "EFFORT"       , minWidth : 6  , weight : 0 , align : "left"  },
		{ heading : "CALLS"        , minWidth : 5  , weight : 0 , align : "right" },
		{ heading : "IN/OUT/CACHE" , minWidth : 17 , weight : 1 , align : "right" },
		{ heading : "TIME"         , minWidth : 5  , weight : 0 , align : "right" },
		{ heading : "RECENT"       , minWidth : 6  , weight : 0 , align : "right" },
	] as const;
	const rows = [
		[ "Codex-Instruct-v4"  , a.active("Middle"), "1420", "14.2M/8.1M/4.1M", "0.24s", "3s"  ],
		[ "Claude-3.5-Sonnet"  , a.active("xHigh") , "844" , "42.8M/18.2M/24M", "1.12s", "12s" ],
		[ "Antigravity-Base"   , a.active("Low")   , "310" , "1.2M/0.8M/0.1M", "0.08s", "4m"  ],
		[ "Z.AI-Refiner-Core"  , a.active("High")  , "98"  , "8.4M/4.2M/1.5M", "0.45s", "12m" ],
	];
	if (width < 72) return rows.flatMap(row => [
		fit(`${row[0]} · ${row[1]}`, width),
		fit(`Calls ${row[2]} · ${row[3]}`, width),
		fit(`Time ${row[4]} · Recent ${row[5]}`, width),
	]);
	return monitoringTable({ columns, rows }, width);
}

function availability(usage: readonly UsageSnapshot[], width: number): string[] {
	return providers.flatMap(provider => {
		const limits = usage.find(item => item.provider === provider.id)?.limits.slice(0, 2) ?? [];
		return [provider.ink(provider.label), ...limits.map(limit => {
			const value = limit.remainingPercent;
			if (value == null) return a.muted("미관측");
			return monitoringMeter(value, 100, Math.max(4, width - 6), provider.ink) + ` ${String(value).padStart(3)}%`;
		})];
	});
}

export function syntheticUsageRows(usage: readonly UsageSnapshot[], width: number): string[] {
	const widths = monitoringWidths(width, width >= 96 ? 3 : 1) ;
	const left   = (widths[0] ?? width) - 2                     ;
	const middle = (widths[1] ?? width) - 2                     ;
	const right  = (widths[2] ?? width) - 2                     ;

	const columns = [
		monitoringCompactPanel("Provider Availability Window", [
			...availability(usage, left),
			...heading("Time Until Renewal", left),
			...providers.map((provider, index) => pair(provider.ink(provider.label), ["2d 6h", "4d 15h", "1d 8h", "2h 20m"][index] ?? "—", left)),
		], left + 2),
		monitoringCompactPanel("Model Effort Distribution", [
			a.failure("█".repeat(Math.floor(middle * 0.48))) + a.active("█".repeat(Math.floor(middle * 0.26))) + a.attention("█".repeat(Math.floor(middle * 0.14))) + a.tool("█".repeat(middle - Math.floor(middle * 0.48) - Math.floor(middle * 0.26) - Math.floor(middle * 0.14))),
			a.muted("xHigh 48% · High 26%"), a.muted("Middle 14% · Low 12%"),
			...heading("Token Trend", middle),
			...monitoringBars([28, 35, 32, 48, 44, 40, 55, 58, 62, 64], middle, 4),
			pair("SESSION START", "NOW", middle),
			...heading("Today vs Session", middle),
			pair("Today", "2,672 calls", middle), monitoringMeter(62, 100, middle, a.success),
			pair("Session", "4d 12h 35m", middle), monitoringMeter(78, 100, middle, a.tool),
		], middle + 2),
		monitoringCompactPanel("Provider Load Ratio", [
			monitoringMeter(52, 100, right, a.tool), a.muted("Claude 52% · Codex 31% · Z.AI 17%"),
			...heading("Token Consumption Matrix", right),
			pair("Session", "1.23M / 1.5M", right), monitoringMeter(82, 100, right, a.success),
			...heading("Input / Output Ratio", right),
			pair("Input / Output / Cached", "52/26/22%", right), monitoringMeter(52, 100, right, a.attention),
			...heading("Performance Trend", right),
			...monitoringBars([30, 48, 42, 65, 62, 78, 75, 84], right, 4),
			pair("5h ago", "NOMINAL", right),
		], right + 2),
	];
	return [
		...heading("Active Providers Telemetry", width),
		...providerStrip(usage, width),
		a.muted("DEMO DATA · synthetic fixtures · not live telemetry"),
		...modelTable(width),
		...(width >= 96 ? monitoringColumns(columns, widths) : columns.flat()),
	].map(row => fit(row, width));
}

export function syntheticUsageRail(width: number): string[] {
	return [
		...heading("Workbench Metrics", width),
		...monitoringCompactPanel("Today requests", [a.success("2,672 CALLS")], width),
		...monitoringCompactPanel("Session uptime", [a.tool("4d 12h 35m")], width),
		...monitoringCompactPanel("Avg response", [a.cream("0.44s")], width),
		...heading("Time Window Performance", width),
		...monitoringBars([30, 48, 42, 65, 62, 78, 75, 84], width, 4),
		pair("5h ago", "CURRENT", width),
		...heading("System Hints", width),
		a.muted("R previous · E next"), a.muted("Esc return to live"),
		a.attention("DEMO · synthetic metrics"),
	].map(row => fit(row, width));
}

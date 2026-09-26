import chalk            from "chalk";
import {
	monitoringBars,
	monitoringColumns,
	monitoringCompactPanel,
	monitoringMeter,
	monitoringTable,
	monitoringWidths,
} from "@/adapters/inbound/tui/foundation/layout/www-monitoring-layout";
import { a, fit, pair } from "@/adapters/inbound/tui/foundation/theme/www-theme";
import type { WwwInk }  from "@/adapters/inbound/tui/foundation/theme/www-theme";

// Figma 50:1403 presentation fixtures; only the explicit demo switch enables these values.
const slices = [
	{ name : "Transcript"     , entries : 142  , used : 32.4 , limit : 64  , hit : 96.4  , access : "1.2s" , ttl : "59m" , state : "SAFE"        , ink : a.cream     },
	{ name : "Render"         , entries : 84   , used : 14.1 , limit : 32  , hit : 91.2  , access : "4.5s" , ttl : "12m" , state : "SAFE"        , ink : a.tool      },
	{ name : "Context Proj"   , entries : 12   , used : 48.0 , limit : 128 , hit : 98.9  , access : "0.1s" , ttl : "4h"  , state : "PROTECTED"   , ink : a.response  },
	{ name : "Usage Snapshot" , entries : 1142 , used : 8.2  , limit : 16  , hit : 84.2  , access : "14s"  , ttl : "2m"  , state : "EVICT_READY" , ink : a.attention },
	{ name : "Model Catalog"  , entries : 4    , used : 0.4  , limit : 4   , hit : 100.0 , access : "1h"   , ttl : "24h" , state : "IMMUTABLE"   , ink : a.success   },
	{ name : "Dashboard Data" , entries : 310  , used : 6.3  , limit : 16  , hit : 89.5  , access : "3.2s" , ttl : "5m"  , state : "SAFE"        , ink : a.info      },
	{ name : "Session Read"   , entries : 512  , used : 33.0 , limit : 256 , hit : 97.1  , access : "0.8s" , ttl : "30m" , state : "SAFE"        , ink : a.active    },
] as const;
const eviction = [12, 10, 8, 14, 16, 20, 24, 22, 18, 14, 12, 10, 8, 4, 6, 8, 12, 10];

export function syntheticCacheRows(width: number): string[] {
	const widths = width >= 108 ? monitoringWidths(width, 3) : [width, width, width];
	const left = widths[0] ?? width, middle = widths[1] ?? width, right = widths[2] ?? width;
	const analyses = [
		[...occupancy(left), ...heatmap(left)],
		[...trends(middle), ...diagnostics(middle)],
		[...flow(right), ...risks(right)],
	];
	return [
		a.muted("DEMO DATA · synthetic fixtures · not live telemetry"),
		...summary(width),
		...sliceGrid(width),
		...(width >= 108 ? monitoringColumns(analyses, widths) : analyses.flat()),
	].map(row => fit(row, width));
}

export function syntheticCacheRailRows(width: number): string[] {
	const actions = ["FORCE EVICTION PURGE", "SYNC DIRECTORY CACHE", "RESET STATISTICS", "VALIDATE INTEGRITY"];
	return [
		...monitoringCompactPanel("CACHE ACTIONS", actions.map(action => pair(action, a.muted("DEMO"), width - 2)), width),
		...monitoringCompactPanel("EVICTION RATE TREND", [
			pair(a.muted("24 HOUR TIMELINE"), a.attention("STABLE"), width - 2),
			...monitoringBars(eviction, width - 2, 3, a.attention),
		], width),
		...monitoringCompactPanel("CONTROLLER SPEC", [
			"PID: 2841-A · synthetic", "Engine: WWWMem-SQLite", "Sync Policy: Write-Back", a.muted("Actions are preview only"),
		], width),
	].map(row => fit(row, width));
}

function summary(width: number): string[] {
	const cards: readonly [string, string, WwwInk][] = [
		[ "CACHE OCCUPIED"  , "142.4 MB"   , a.cream     ],
		[ "MAX CAPACITY"    , "512.0 MB"   , a.muted     ],
		[ "CACHE HIT RATE"  , "94.2%"      , a.success   ],
		[ "MISS RATE"       , "5.8%"       , a.active    ],
		[ "ACTIVE EVICTIONS", "14 UNITS/hr", a.attention ],
		[ "LAST PURGE"      , "4d 12h AGO" , a.tool      ],
	];
	if (width < 108) return cards.map(([label, value, ink]) => pair(a.muted(label), ink(value), width));
	const widths = monitoringWidths(width, cards.length);
	return monitoringColumns(cards.map(([title, value, ink], index) =>
		monitoringCompactPanel(title, [ink(value)], widths[index] ?? 1),
	), widths);
}

function sliceGrid(width: number): string[] {
	const columns = [
		{ heading : "CACHE SLICE" , minWidth : 14 , weight : 1 , align : "left"  },
		{ heading : "ENTRIES"     , minWidth : 7  , weight : 0 , align : "right" },
		{ heading : "USAGE/LIMIT" , minWidth : 12 , weight : 0 , align : "right" },
		{ heading : "HIT / MISS"  , minWidth : 14 , weight : 1 , align : "left"  },
		{ heading : "ACCESS"      , minWidth : 6  , weight : 0 , align : "right" },
		{ heading : "TTL"         , minWidth : 4  , weight : 0 , align : "right" },
		{ heading : "STALE"       , minWidth : 5  , weight : 0 , align : "left"  },
		{ heading : "EVICT STATE" , minWidth : 11 , weight : 0 , align : "left"  },
	] as const;
	const rows = slices.map(slice => [
		slice.ink(slice.name), String(slice.entries), `${slice.used.toFixed(1)}/${slice.limit} MB`,
		`${hitBar(slice.hit, 6)} ${a.success(`${slice.hit.toFixed(1)}%`)}`,
		slice.access, slice.ttl, slice.state === "EVICT_READY" ? a.attention("YES") : a.muted("NO"),
		slice.state === "EVICT_READY" ? a.active(slice.state) : a.tool(slice.state),
	]);
	const compact = slices.map(slice => pair(slice.ink(slice.name), `${slice.used.toFixed(1)} MB · ${slice.hit}%`, width - 2));
	return monitoringCompactPanel("CACHE SLICES · synthetic",
		width >= 100 ? monitoringTable({ columns, rows }, width - 2) : compact, width);
}

function occupancy(width: number): string[] {
	const columns = [
		{ heading : "SLICE" , minWidth : 10 , weight : 0 , align : "left"  },
		{ heading : "USED"  , minWidth : 4  , weight : 1 , align : "left"  },
		{ heading : "MB"    , minWidth : 5  , weight : 0 , align : "right" },
	] as const;
	const rows = slices.map(slice => [slice.ink(slice.name), monitoringMeter(slice.used, slice.limit, Math.max(4, width - 21), slice.ink), slice.used.toFixed(1)]);
	return monitoringCompactPanel("CACHE OCCUPANCY DISTRIBUTION", [
		pair("142.4 / 512 MB", "27.8%", width - 2),
		occupancyStack(width - 2),
		...monitoringTable({ columns, rows }, width - 2).slice(2),
	], width);
}

function occupancyStack(width: number): string {
	const cells = Math.max(0, width);
	const total = slices.reduce((sum, slice) => sum + slice.used, 0);
	let used = 0, boundary = 0;
	return slices.map(slice => {
		used += slice.used;
		const next = Math.round(used / total * cells);
		const segment = slice.ink("█".repeat(next - boundary));
		boundary = next;
		return segment;
	}).join("");
}

function heatmap(width: number): string[] {
	const bucketCount = Math.max(1, Math.min(12, Math.floor((width - 12) / 2)));
	const cellWidth = Math.max(1, Math.floor((width - 12 - bucketCount) / bucketCount));
	const rows = slices.map((slice, index) => {
		const cells = Array.from({ length: bucketCount }, (_, time) => {
			const intensity = 0.18 + ((time * 3 + index * 5) % 11) / 13;
			const cell = slice.ink("█".repeat(cellWidth));
			return intensity > 0.6 ? cell : chalk.dim(cell);
		}).join(" ");
		return `${fit(slice.ink(slice.name), 10)} ${cells}`;
	});
	return monitoringCompactPanel("ACCESS FREQUENCY HEATMAP", [
		...rows, pair(a.muted("24h ago"), a.active("NOW"), width - 2),
	], width);
}

function trends(width: number): string[] {
	return monitoringCompactPanel("HIT / MISS TREND", [
		pair(a.success("HIT RATE"), a.success("94.2% AVG"), width - 2),
		...monitoringBars([68, 74, 78, 82, 84, 88, 92, 90, 94, 96, 94, 94], width - 2, 2, a.success),
		pair(a.active("MISS RATE"), a.active("5.8% AVG"), width - 2),
		hitBar(94.2, Math.max(4, width - 2)),
		a.active("■ EVICTION TREND"),
		pair(a.muted("24H WINDOW"), a.attention("14 / hr"), width - 2),
		...monitoringBars(eviction, width - 2, 2, a.attention),
	], width);
}

function diagnostics(width: number): string[] {
	const columns = [
		{ heading : "CAUSE" , minWidth : 16 , weight : 1 , align : "left"  },
		{ heading : "COUNT" , minWidth : 5  , weight : 0 , align : "right" },
		{ heading : "STATE" , minWidth : 4  , weight : 0 , align : "left"  },
	] as const;
	const rows = [
		[ a.attention("TTL EXPIRATION"), "7", a.attention("HIGH") ],
		[ a.active("EVICTION PURGE")   , "4", a.active("MED")     ],
		[ a.response("COLD START")     , "2", a.muted("LOW")      ],
	];
	return monitoringCompactPanel("MISS CAUSE SUMMARY", [
		...monitoringTable({ columns, rows }, width - 2).slice(2),
		a.active("■ DIAGNOSTIC SUMMARY"),
		pair("INDEX FRAGMENTATION", a.success("1.2%"), width - 2),
		pair("MEMORY PRESSURE", a.tool("SAFE"), width - 2),
		pair("AUTO-PURGE HEALTH", a.success("98%"), width - 2),
	], width);
}

function flow(width: number): string[] {
	const columns = [
		{ heading : "SOURCE" , minWidth : 6 , weight : 1 , align : "left" },
		{ heading : "CACHE"  , minWidth : 9 , weight : 1 , align : "left" },
		{ heading : "TARGET" , minWidth : 7 , weight : 1 , align : "left" },
	] as const;
	const rows = [
		[ a.cream("SQLite"), a.cream("Transcript"), a.active("Core")     ],
		[ a.tool("MCP")    , a.tool("Render/Ctx") , a.info("Skills")     ],
		[ a.success("FS")  , a.success("Session") , a.success("Agents")   ],
	];
	return monitoringCompactPanel("DATA REUSE FLOW MAP", [
		a.active("SOURCES → CACHE → CONSUMERS"),
		...monitoringTable({ columns, rows }, width - 2),
		pair(a.muted("REUSE RATIO"), a.success("94.2% HIT"), width - 2),
		hitBar(94.2, Math.max(4, width - 2)),
	], width);
}

function risks(width: number): string[] {
	return monitoringCompactPanel("STALE / EVICTION RISK", [
		pair(a.attention("Usage Snapshot"), a.active("EVICT_RDY"), width - 2),
		pair(a.success("Render · TTL 12m"), a.success("WATCH"), width - 2),
		pair(a.tool("Ctx Proj"), a.tool("PROTECTED"), width - 2),
		pair(a.muted("Model Catalog"), a.muted("IMMUTABLE"), width - 2),
	], width);
}

function hitBar(percent: number, width: number): string {
	const filled = Math.round(width * percent / 100);
	return a.success("█".repeat(filled)) + a.active("█".repeat(width - filled));
}

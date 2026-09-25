import chalk                                         from "chalk";
import type { WorkbenchSnapshot }                    from "@/core/domain/work/workbench";
import {
	monitoringColumns,
	monitoringTable,
	monitoringWidths,
} from "@/adapters/inbound/tui/foundation/layout/astra-monitoring-layout";
import { a, astraPalette, fit, pair, safe }          from "@/adapters/inbound/tui/foundation/theme/astra-theme";
import type { AstraInk }                             from "@/adapters/inbound/tui/foundation/theme/astra-theme";
import { getActiveTuiTheme, palette }                from "@/adapters/inbound/tui/foundation/theme/theme";
import { workbenchEffortLabel, workbenchModelLabel } from "@/adapters/inbound/tui/foundation/labels";

// Presentation-only fixtures. The shell must explicitly opt in; snapshot labels never enable them.
const sources = [
	{ code: "SYS", mb: 4, color: "tool" }, { code: "CONV", mb: 20, color: "text" },
	{ code: "SKILL", mb: 3, color: "success" }, { code: "MCP", mb: 2, color: "response" },
	{ code: "MEM", mb: 1, color: "attention" }, { code: "WORK", mb: 6, color: "info" },
	{ code: "RUNT", mb: 2, color: "active" }, { code: "NOTE", mb: 1, color: "muted" },
	{ code: "TOOL", mb: 1, color: "failure" },
] as const;
const capacityMB = 48;
const usedMB = sources.reduce((sum, source) => sum + source.mb, 0);
function sourceColor(color: typeof sources[number]["color"]): string {
	if (color === "text") return astraPalette.cream;
	if (color === "failure" && getActiveTuiTheme() === "gruvbox") return "#af3a03";
	return astraPalette[color];
}
const foreground = a.cream;

/** Two borders, no blank gutters: bounded native cells retain the reference's panel density. */
function panel(title: string, rows: string[], width: number): string[] {
	const inner = Math.max(1, width - 2);
	const body = rows.map(row => `${a.rule("│")}${chalk.bgHex(palette.panel)(fit(row, inner))}${a.rule("│")}`);
	return [fit(`${a.rule("┌")}${a.active(title)}${a.rule("─".repeat(Math.max(0, inner - title.length)) + "┐")}`, width), ...body, a.rule(`└${"─".repeat(inner)}┘`)];
}
function meter(value: number, total: number, width: number, ink: AstraInk, solid = false): string {
	const fill = Math.round(width * value / total);
	return ink((solid ? "█" : "━").repeat(fill)) + a.rule((solid ? "░" : "━").repeat(width - fill));
}
function summary(snapshot: WorkbenchSnapshot, width: number): string[] {
	const cards: readonly [string, string, AstraInk][] = [
		["TOTAL CAPACITY", `${capacityMB.toFixed(1)} MB`, a.muted],
		["USED TOKENS", "1.23M / 1.5M", foreground],
		["FREE SPACE", "8 MB (16.7%)", a.success],
		["COMPRESSION", "8:1 OPTIMIZED", a.info],
		["LAST RETRIEVAL", "42s AGO", a.tool],
		["ACTIVE MODEL", workbenchModelLabel(snapshot.activeModel ?? snapshot.model), a.active],
		["EFFORT CONFIG", workbenchEffortLabel(snapshot.effort), a.response],
	];
	if (width < 108) return cards.map(([title, value, ink]) => pair(a.muted(title), ink(value), width));
	const widths = monitoringWidths(width, cards.length);
	return monitoringColumns(cards.map(([title, value, ink], index) => panel(title, [ink(value)], widths[index])), widths);
}
function spectrometer(width: number): string[] {
	const inner = width - 2;
	let boundary = 0, cumulative = 0;
	const bar = sources.map(source => {
		cumulative += source.mb;
		const next = Math.round(inner * cumulative / capacityMB), cells = next - boundary;
		boundary = next;
		const label = cells >= source.code.length ? source.code.padStart(Math.floor((cells + source.code.length) / 2)).padEnd(cells) : " ".repeat(cells);
		return chalk.bgHex(sourceColor(source.color)).hex(palette.background)(label);
	}).join("") + chalk.bgHex(palette.border)(" ".repeat(inner - boundary));
	return panel("CONTEXT ACCUMULATION SPECTROMETER", [
		pair(a.muted("synthetic source sizes · MB"), foreground(`${usedMB} / ${capacityMB} MB`), inner),
		bar,
		fit(sources.map(source => chalk.hex(sourceColor(source.color))(`${source.code} ${source.mb}`)).join(" · ") + a.muted(" · FREE 8"), inner),
	], width);
}
function composition(width: number): string[] {
	const barWidth = Math.max(4, width - 25);
	const columns = [
		{ heading : "SOURCE"       , minWidth : 7 , weight : 0 , align : "left"  },
		{ heading : "DISTRIBUTION" , minWidth : 4 , weight : 1 , align : "left"  },
		{ heading : "SIZE"         , minWidth : 6 , weight : 0 , align : "right" },
		{ heading : "SHARE"        , minWidth : 6 , weight : 0 , align : "right" },
	] as const;
	const rows = sources.map(source => [
		chalk.hex(sourceColor(source.color))(source.code),
		meter(source.mb, capacityMB, barWidth, chalk.hex(sourceColor(source.color)), true),
		foreground(`${source.mb} MB`),
		a.muted(`${(source.mb / capacityMB * 100).toFixed(1)}%`),
	]);
	return [
		a.active("■ CONTEXT COMPOSITION BREAKDOWN"),
		...monitoringTable({ columns, rows }, width),
	];
}
// Eight independent synthetic turns: each stack is added/updated/compressed/removed KB.
const turns = [[30, 14, 8, 6], [38, 12, 10, 4], [28, 16, 6, 8], [44, 10, 12, 6], [36, 18, 10, 4], [48, 12, 8, 6], [40, 14, 12, 4], [50, 16, 8, 6]] as const;
function activity(width: number): string[] {
	const cellWidth = Math.max(3, Math.min(6, Math.floor((width - 4) / turns.length)))                         ;
	const inks      = [a.success, a.tool, a.active, a.failure]                                                 ;
	const rows      = [a.active("■ CONTEXT CHANGE ACTIVITY"), a.muted("KB / TURN · synthetic · last 8 turns")] ;
	for (let level = 4; level > 0; level--) {
		const columns = turns.map(values => {
			const threshold = (level - 0.5) * 20                                                    ;
			let sum         = 0                                                                     ;
			const color     = values.findIndex(value => { sum += value; return threshold <= sum; }) ;
			return color < 0 ? a.rule("·".repeat(cellWidth - 1)) + " " : inks[color]("█".repeat(cellWidth - 1)) + " ";
		});
		rows.push(`${a.muted(String(level * 20).padStart(2))} ${columns.join("")}`);
	}
	rows.push(a.muted("   " + turns.map((_, index) => `T-${8 - index}`.padEnd(cellWidth)).join("")));
	rows.push(`${a.success("+ Added")} ${a.tool("~ Updated")} ${a.active("↓ Compressed")} ${a.failure("− Removed")}`);
	return rows;
}
function diagnostics(width: number): string[] {
	const columns = [
		{ heading : "EVENT"  , minWidth : 18 , weight : 1 , align : "left"  },
		{ heading : "COUNT"  , minWidth : 5  , weight : 0 , align : "right" },
		{ heading : "CHANGE" , minWidth : 6  , weight : 0 , align : "right" },
		{ heading : "STATE"  , minWidth : 8  , weight : 0 , align : "left"  },
	] as const;
	const rows = [
		[ a.tool("■ SYSTEM INIT")          , "1"  , "—"     , foreground("OK")      ],
		[ a.response("■ MCP SYNC")         , "3"  , "—"     , foreground("OK")      ],
		[ a.attention("■ MEMORY EVICTIONS"), "2"  , "−14 KB", a.success("FREED")    ],
		[ a.active("■ RUNTIME COMPILE")    , "114", "—"     , foreground("OK")      ],
		[ a.success("■ EVICTION RISK")     , "—"  , "—"     , a.success("NONE NOW") ],
	];
	return [a.active("■ DIAGNOSTIC EVENT AGGREGATES"), ...monitoringTable({ columns, rows }, width).slice(2)];
}
function dependencies(snapshot: WorkbenchSnapshot, width: number): string[] {
	const skills  = snapshot.skillInventory                                             ;
	const servers = snapshot.mcpServers                                                 ;
	const agents  = (snapshot.delegation ?? []).flatMap(projection => projection.tasks) ;
	const columns = [
		{ heading : "SKILLS", minWidth : 12, weight : 1, align : "left" },
		{ heading : "MCP"   , minWidth : 10, weight : 1, align : "left" },
	] as const;
	const rows = Array.from({ length: 4 }, (_, index) => [
		foreground(safe(skills?.names[index] ?? "—")),
		a.response(safe(servers[index]?.name ?? "—")),
	]);
	return [a.active("■ SYSTEM DEPENDENCY MAP"), a.active("                 ASTRA CORE"),
		pair(a.success(`├ Skills · ${skills?.count ?? 0} loaded`), a.response(`MCP · ${servers.filter(server => server.enabled).length} enabled`), width),
		...monitoringTable({ columns, rows }, width).slice(2),
		a.tool(`└ Agents · ${agents.length} · ${agents.filter(agent => agent.status === "running").length} running`),
		pair(a.muted("Memory zones"), a.info("83% / 13% / 22%"), width),
		a.muted("occupancy / swap / cache · synthetic")];
}
function insights(width: number): string[] {
	const columns = [
		{ heading : "#"     , minWidth : 2  , weight : 0 , align : "left"  },
		{ heading : "ITEM"  , minWidth : 12 , weight : 1 , align : "left"  },
		{ heading : "SIZE"  , minWidth : 5  , weight : 0 , align : "right" },
		{ heading : "STATE" , minWidth : 5  , weight : 0 , align : "left"  },
	] as const;
	const rows = [
		[ "01", foreground("CONV / message-thread") , a.attention("20 MB"), a.attention("LARGE") ],
		[ "02", foreground("WORK / artifacts-cache"), a.info("6 MB")      , foreground("OK")     ],
		[ "03", foreground("SYS / system-prompt")   , a.tool("4 MB")      , foreground("OK")     ],
		[ "04", foreground("SKILL / loaded-catalog"), a.success("3 MB")   , foreground("OK")     ],
	];
	return [a.active("■ TOP ITEMS BY SIZE"),
		...monitoringTable({ columns, rows }, width).slice(2),
		a.rule("─".repeat(width)), a.active("■ STATE CHANGE ALERTS"),
		a.attention("! CONV growing · +2.1 MB/cycle avg"),
		a.success("✓ 2 stale MEM keys evicted · 14 KB freed"),
		a.tool("i Free space below 20% · monitor advised")];
}

export function syntheticContextRows(snapshot: WorkbenchSnapshot, width: number): string[] {
	const widths: [number, number] = [Math.floor((width - 1) * 0.57), width - 1 - Math.floor((width - 1) * 0.57)];
	const analysis = (left: number, right: number): string[][] => [
		panel("SOURCE ANALYSIS · synthetic", [...composition(left - 2), ...activity(left - 2), ...diagnostics(left - 2)], left),
		panel("CONTEXT INSIGHTS · synthetic", [...dependencies(snapshot, right - 2), ...insights(right - 2)], right),
	];
	return [
		...summary(snapshot, width),
		a.muted("DEMO DATA · synthetic fixtures · not live telemetry"),
		...spectrometer(width),
		...(width >= 108 ? monitoringColumns(analysis(widths[0], widths[1]), widths) : analysis(width, width).flat()),
	].map(row => fit(row, width));
}
export function syntheticStorageRows(width: number): string[] {
	return [a.active("■ STORAGE METRICS"), a.muted("synthetic fixtures · not live"),
		pair("MEMORY OCCUPANCY", "40960/49152 KB", width), meter(40, 48, width, a.active),
		pair("VIRTUAL SWAP", "2144/16384 KB", width), meter(2144, 16384, width, a.success),
		pair("PERSISTENT CACHE", "14280/65536 KB", width), meter(14280, 65536, width, a.tool)];
}

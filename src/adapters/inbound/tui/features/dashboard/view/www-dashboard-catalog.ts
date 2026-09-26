import chalk                        from "chalk";
import type { WorkbenchSnapshot }   from "@/core/domain/work/workbench";
import {
	monitoringColumns,
	monitoringCompactPanel,
	monitoringMeter,
	monitoringPanel,
	monitoringTable,
	monitoringWidths,
} from "@/adapters/inbound/tui/foundation/layout/www-monitoring-layout";
import { a, wwwPalette, fit, pair } from "@/adapters/inbound/tui/foundation/theme/www-theme";
import type { WwwInk }              from "@/adapters/inbound/tui/foundation/theme/www-theme";

/** Figma 50:2169 presentation fixtures, enabled only by the shell's explicit demo flag. */
export function syntheticDashboardRows(snapshot: WorkbenchSnapshot, width: number): string[] {
	const summaries: readonly [string, string, WwwInk][] = [
		[ "ACTIVE SESSION ID", "ST-701A-X"     , a.cream     ],
		[ "TOTAL REQUESTS"   , "4,120 / TODAY" , a.tool      ],
		[ "SESSION TOKENS"   , "1.23M / 1.5M"  , a.attention ],
		[ "ELAPSED TIME"     , "4d 12h 35m"    , a.success   ],
		[ "SYSTEMS HEALTH"   , "NOMINAL (100%)", a.success   ],
	];
	const cards = summaries.map(([title, value, ink]) => ({ title, value, ink }));
	const summaryWidths = monitoringWidths(width, cards.length);
	const summary = width >= 100
		? monitoringColumns(cards.map((card, index) => monitoringCompactPanel(a.muted(card.title), [card.ink(card.value)], summaryWidths[index])), summaryWidths)
		: cards.map(card => pair(a.muted(card.title), card.ink(card.value), width));
	const left   = width >= 100 ? Math.floor((width - 1) * 0.65) : width ;
	const right  = width >= 100 ? width - left - 1 : width               ;
	const panels = [tokenPanel(left), heatmapPanel(right)]               ;
	return [
		...summary,
		a.muted("DEMO DATA · synthetic fixtures · not live telemetry"),
		...moduleRouter(width),
		...(width >= 100 ? monitoringColumns(panels, [left, right]) : panels.flat()),
		pair(a.muted("ACTIVE WORKBENCH"), a.cream(snapshot.projectId), width),
	].map(row => fit(row, width));
}

export function syntheticDashboardRail(snapshot: WorkbenchSnapshot, width: number): string[] {
	const inner = Math.max(1, width - 2);
	return [
		...monitoringPanel({ title: "SESSION CONTEXT SPACE", ink: a.active, rows: [
			pair(a.cream(snapshot.projectId), a.success("ACTIVE"), inner),
			pair(a.cream("branch:ref-auth"), a.tool("SYNCED"), inner),
			a.muted("synthetic workspace state"),
		] }, width),
		...monitoringPanel({ title: "SYSTEM LOAD", ink: a.active, rows: [
			pair("VIRTUAL SWAP", "2MB / 16MB", inner),
			monitoringMeter(2, 16, inner, a.active),
			pair("PERSISTENT CACHE", "14MB / 64MB", inner),
			monitoringMeter(14, 64, inner, a.tool),
			a.muted("synthetic load metrics"),
		] }, width),
		...monitoringPanel({ title: "NAVIGATION GUIDE", ink: a.active, rows: [
			a.cream("R / E   이전 / 다음 화면"),
			a.cream("Esc     데모 종료"),
			a.muted("/context   컨텍스트"),
			a.muted("/cache     캐시"),
			a.muted("/usage     사용량"),
			a.muted("/workflow  워크플로"),
		] }, width),
	].map(row => fit(row, width));
}

function moduleRouter(width: number): string[] {
	const modules: readonly [string, string, string, WwwInk][] = [
		[ "/context" , "40,960 KB / 49K", "ACTIVATE MONITOR"   , a.active  ],
		[ "/cache"   , "94.2% HIT RATE" , "ACTIVATE CONTROLLER", a.success ],
		[ "/usage"   , "TOKEN TELEMETRY", "ACTIVATE TELEMETRY" , a.tool    ],
		[ "/workflow", "AGENT PIPELINES", "ACTIVATE FLOW"      , a.muted   ],
	];
	const inner = Math.max(1, width - 2);
	const widths = monitoringWidths(inner, modules.length);
	const rows = width >= 100
		? monitoringColumns(modules.map(([title, detail, action, ink], index) => monitoringCompactPanel(ink(title), [a.muted(detail), a.cream(`» ${action}`)], widths[index])), widths)
		: modules.map(([title, detail, , ink]) => pair(ink(title), a.cream(detail), inner));
	return monitoringCompactPanel(a.active("SYSTEM INTEGRATED MODULE ROUTER & SESSION HEALTH MAP"), rows, width);
}

function tokenPanel(width: number): string[] {
	const inner = Math.max(1, width - 2);
	const sources: readonly [string, number, WwwInk][] = [
		[ "INPUT" , 57, a.tool      ],
		[ "OUTPUT", 26, a.success   ],
		[ "CACHED", 17, a.attention ],
	];
	let boundary = 0;
	let cumulative = 0;
	const stacked = sources.map(([, share, ink]) => {
		cumulative += share * 0.82;
		const next = Math.round(inner * cumulative / 100);
		const cells = next - boundary;
		boundary = next;
		return ink("█".repeat(cells));
	}).join("") + a.rule("░".repeat(inner - boundary));
	const columns = [
		{ heading : "SOURCE" , minWidth : 6 , weight : 0 , align : "left"  },
		{ heading : "SHARE"  , minWidth : 4 , weight : 1 , align : "left"  },
		{ heading : "%"      , minWidth : 3 , weight : 0 , align : "right" },
	] as const;
	const barWidth = Math.max(4, inner - 13);
	const rows = sources.map(([label, share, ink]) => [a.muted(label), monitoringMeter(share, 100, barWidth, ink), ink(`${share}%`)]);
	return monitoringCompactPanel(a.active("TOKEN ALLOCATION TRENDS"), [
		stacked,
		pair(a.muted("SESSION ACCUMULATION"), a.tool("1.23M / 1.5M · 82%"), inner),
		a.rule("─".repeat(inner)),
		a.active("INPUT vs OUTPUT PROPORTION ANALYSIS"),
		...monitoringTable({ columns, rows }, inner),
		a.muted("SESSION vs TODAY · synthetic"),
	], width);
}

function heatmapPanel(width: number): string[] {
	const inner = Math.max(1, width - 2);
	const matrix = [
		[ 1, 0, 0, 1, 0, 2, 1, 0, 0, 1, 2, 0 ],
		[ 3, 1, 0, 1, 3, 1, 0, 1, 3, 1, 0, 1 ],
		[ 4, 0, 0, 0, 0, 0, 4, 0, 0, 0, 0, 0 ],
	];
	const colors    = [wwwPalette.rule, wwwPalette.success, wwwPalette.attention, wwwPalette.tool, wwwPalette.active]  ;
	const cellWidth = Math.max(1, Math.floor((inner - 11) / 12))                                                       ;
	const heatmap   = matrix.map(row => row.map(value => chalk.bgHex(colors[value])(" ".repeat(cellWidth))).join(" ")) ;
	return monitoringCompactPanel(a.active("ACCESS FREQUENCY HEATMAP"), [
		...heatmap,
		pair(a.muted("T-24H       T-12H"), a.active("NOW"), inner),
		a.rule("─".repeat(inner)),
		a.active("SESSION EVENT AGGREGATES"),
		pair("Cache hits", a.success("2,842 / 94.2%"), inner),
		pair("Subagents invoked", a.tool("14 agents"), inner),
		pair("Critical failures", a.success("0 NOMINAL"), inner),
		a.muted("synthetic access events"),
	], width);
}

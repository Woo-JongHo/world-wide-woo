import {
	monitoringCard,
	monitoringColumns,
	monitoringCompactPanel,
	monitoringMeter,
	monitoringTable,
	monitoringWidths,
} from "@/adapters/inbound/tui/foundation/layout/www-monitoring-layout";
import { a, fit, pair } from "@/adapters/inbound/tui/foundation/theme/www-theme";
import type { WwwInk }  from "@/adapters/inbound/tui/foundation/theme/www-theme";

/** Figma 50:1986. Synthetic display values are accessible only through the explicit demo path. */
const demoLanes = [
	{ name : "LANE_A" , percent : 72 , state : "ACTIVE" , ink : a.active  },
	{ name : "LANE_B" , percent : 41 , state : "LOADED" , ink : a.tool    },
	{ name : "LANE_C" , percent : 95 , state : "SYNC"   , ink : a.success },
	{ name : "LANE_D" , percent : 11 , state : "BLOCK"  , ink : a.failure },
];

function panel(title: string, rows: readonly string[], width: number): string[] {
	return monitoringCompactPanel(title, rows, width);
}

function summary(width: number): string[] {
	const cards = [
		{ title : "Active goal"      , value : "AUTH & MEMORY PROFILE" , detail : "redesign in progress" , ink : a.cream     },
		{ title : "Delegated agents" , value : "5 ACTIVE / 8 TOTAL"    , detail : "3 waiting"            , ink : a.tool      },
		{ title : "Elapsed time"     , value : "02h 45m 12s"           , detail : "sample duration"      , ink : a.success   },
		{ title : "Context budget"   , value : "12.3% USED"            , detail : "87.7% remaining"      , ink : a.response  },
		{ title : "Stalled events"   , value : "0 CRITICAL"            , detail : "2 watched"            , ink : a.attention },
	];
	const count = width >= 100 ? 5 : width >= 60 ? 3 : 1;
	return Array.from({ length: Math.ceil(cards.length / count) }, (_, index) => {
		const group = cards.slice(index * count, (index + 1) * count);
		const widths = monitoringWidths(width, group.length, 1);
		return monitoringColumns(group.map((card, column) => monitoringCard({
			...card, value: card.ink(card.value),
		}, widths[column] ?? 1)), widths);
	}).flat();
}

function node(label: string, name: string, detail: string, ink: WwwInk, width: number): string[] {
	return monitoringCompactPanel(label, [ink(name), a.muted(detail)], width);
}

function relationshipTree(width: number): string[] {
	const inner = Math.max(1, width - 2);
	if (width < 90) return panel("Subagent delegation relationship tree", [
		a.active("■ PARENT  WWW-CORE"),
		a.tool("└─ DELEGATE  subagent-auth-eval  RUNNING"),
		a.success("   ├─ RESOLVED  auth-token-parser  42s"),
		a.muted("   │  └─ WAITING  rpa-sync-runner  #02"),
		a.attention("   └─ BLOCKED  mem-leak-monitor  MCP-FILE"),
		a.muted("      └─ WAITING  cache-purge-trigger  #03"),
	], width);
	const nodeWidth = Math.floor((inner - 9) / 4);
	const branch = [
		...node("✓ RESOLVED", "auth-token-parser", "Took: 42s", a.success, nodeWidth),
		...node("! BLOCKED", "mem-leak-monitor", "Lock: MCP-FILE", a.attention, nodeWidth),
	];
	const targets = [
		...node("· WAITING", "rpa-sync-runner", "Queue: #02", a.muted, nodeWidth),
		...node("· WAITING", "cache-purge-trigger", "Queue: #03", a.muted, nodeWidth),
	];
	const parent = [...Array<string>(2).fill(""), ...node("■ PARENT", "WWW-CORE", "Claude 3.5 Sonnet", a.active, nodeWidth)];
	const delegate = [...Array<string>(2).fill(""), ...node("» DELEGATE", "subagent-auth-eval", "Status: RUNNING", a.tool, nodeWidth)];
	const rows = Array.from({ length: branch.length }, (_, index) => {
		const parentLink = index === 3 ? a.active("───") : "   "                                                                                                            ;
		const branchLink = index === 1 ? a.success("┌──") : index === 5 ? a.attention("└──") : index === 3 ? a.tool("┤  ") : index > 1 && index < 5 ? a.rule("│  ") : "   " ;
		const targetLink = index === 1 ? a.success("───") : index === 5 ? a.attention("───") : "   "                                                                        ;
		return fit(parent[index] ?? "", nodeWidth) + parentLink + fit(delegate[index] ?? "", nodeWidth) + branchLink
			+ fit(branch[index] ?? "", nodeWidth) + targetLink + fit(targets[index] ?? "", nodeWidth);
	});
	return panel("Subagent delegation relationship tree", rows, width);
}

function execution(width: number): string[] {
	const inner = Math.max(1, width - 2);
	const columns = [
		{ heading : "LANE"  , minWidth : 6 , weight : 0 , align : "left" },
		{ heading : "LOAD"  , minWidth : 4 , weight : 1 , align : "left" },
		{ heading : "STATE" , minWidth : 6 , weight : 0 , align : "left" },
	] as const;
	const barWidth = Math.max(4, inner - 16);
	const rows = demoLanes.map(lane => [
		a.muted(lane.name), monitoringMeter(lane.percent, 100, barWidth, lane.ink), lane.ink(lane.state),
	]);
	const queueColumns = [
		{ heading : "TASK"  , minWidth : 8 , weight : 1 , align : "left"  },
		{ heading : "RETRY" , minWidth : 5 , weight : 0 , align : "right" },
		{ heading : "STATE" , minWidth : 8 , weight : 0 , align : "left"  },
	] as const;
	const queueRows = [
		[ a.cream("parse-user-payload"  ), a.success("0/3"  ), a.tool("EXEC"      ) ],
		[ a.cream("scan-cache-indexes"  ), a.plan(   "2/3"  ), a.plan("RE-INDEX"  ) ],
		[ a.cream("commit-git-artifacts"), a.failure("STALL"), a.failure("BLOCKED") ],
	];
	return [
		...panel("Parallel execution pipeline", monitoringTable({ columns, rows }, inner), width),
		...panel("Active work queue & retry counts", monitoringTable({ columns: queueColumns, rows: queueRows }, inner), width),
	];
}

function stateMatrix(width: number): string[] {
	const columns = [
		{ heading : "ID"    , minWidth : 2 , weight : 0 , align : "right" },
		{ heading : "AGENT" , minWidth : 6 , weight : 1 , align : "left"  },
		{ heading : "AGE"   , minWidth : 4 , weight : 0 , align : "right" },
		{ heading : "STATE" , minWidth : 5 , weight : 0 , align : "left"  },
	] as const;
	const rows = [
		[ "01", a.cream("auth-eval"     ), "12s" , a.success("RUN ›") ],
		[ "02", a.cream("mcp-filesystem"), "34s" , a.success("DONE" ) ],
		[ "03", a.cream("mem-evictor"   ), "1.5m", a.plan(   "STBY" ) ],
		[ "04", a.cream("git-committer" ), "5.2m", a.failure("LOCK" ) ],
	];
	return [
		...panel("Subagent state matrix", monitoringTable({ columns, rows }, Math.max(1, width - 2)), width),
		...panel("State change event log", [
			a.success("14:12:02  auth-eval initialized OK"),
			a.tool("14:12:35  delegated token parsing"),
			a.attention("14:14:10  MCP-FILE lock-wait"),
		], width),
	];
}

export function workflowDemoRows(width: number): string[] {
	const leftWidth = Math.floor((width - 1) * 0.64);
	const rightWidth = width - leftWidth - 1;
	const workspace = width >= 90
		? monitoringColumns([execution(leftWidth), stateMatrix(rightWidth)], [leftWidth, rightWidth])
		: [...execution(width), ...stateMatrix(width)];
	return [...summary(width), ...relationshipTree(width), ...workspace].map(row => fit(row, width));
}

export function workflowDemoRail(width: number): string[] {
	const inner = Math.max(1, width - 2);
	return [
		...panel("Active processes", [
			pair("eval-session", a.success("NOMINAL"), inner),
			pair("stream-tokens", a.success("NOMINAL"), inner),
			pair("index-cache", a.attention("LAGGING"), inner),
		], width),
		...panel("Pipeline throttles", [
			pair("SUBAGENT ALLOC", a.tool("5/8 UNITS"), inner),
			monitoringMeter(5, 8, inner, a.tool),
			pair("PARALLEL CPU LOAD", a.active("42.8%"), inner),
			monitoringMeter(42.8, 100, inner, a.active),
		], width),
		...panel("Shortcut system", [
			a.muted("R / E  previous / next page"),
			a.muted("↑ / ↓  scroll workspace"),
			a.muted("Esc    exit demo"),
		], width),
	].map(row => fit(row, width));
}

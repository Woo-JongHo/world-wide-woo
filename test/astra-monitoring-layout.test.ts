import { describe, expect, test }               from "bun:test";
import { stripTerminalSequences, visibleWidth } from "@earendil-works/pi-tui";
import {
	monitoringDiagnostics,
	monitoringFlow,
	monitoringMatrix,
	monitoringPanel,
	monitoringQueue,
	monitoringTable,
	monitoringUnavailablePanel,
} from "../src/adapters/inbound/tui/foundation/layout/astra-monitoring-layout";

describe("astra monitoring layout", () => {
	test.each([52, 80])("keeps reusable monitoring panels bounded at %i columns", width => {
		const rows = [
			...monitoringPanel({ title: "Provider availability", meta: "live" }, ["OpenAI Codex · ready", "Anthropic · unavailable"], width),
			...monitoringUnavailablePanel("Performance chart", "time-series source is not connected", width),
			...monitoringMatrix({
				columns: ["MODEL", "TOKENS", "CACHE", "STATE"],
				rows: Array.from({ length: 10 }, (_, index) => [`model-${index}`, `${index + 1}K`, index % 2 ? "observed" : "미관측", "ready"]),
			}, width, 6),
			...monitoringFlow([{ label: "Collect", detail: "native signal" }, { label: "Project" }, { label: "Render", detail: "terminal pane" }], width),
			...monitoringQueue([{ label: "Refresh usage", state: "queued", detail: "manual" }, { label: "Fetch catalog", state: "running" }], width),
			...monitoringDiagnostics([{ label: "Latency", value: "18 ms" }, { label: "Cache source", value: "native" }], width),
		];
		const output = stripTerminalSequences(rows.join("\n"));
		expect(output).toContain("Provider availability");
		expect(output).toContain("Performance chart");
		expect(output).toContain("미관측");
		expect(output).toContain("4 additional rows not shown");
		expect(rows.every(row => visibleWidth(row) <= width)).toBe(true);
	});

	test("does not decorate missing monitoring sources as empty telemetry", () => {
		const output = stripTerminalSequences([
			...monitoringMatrix({ columns: [], rows: [] }, 52),
			...monitoringFlow([], 52),
			...monitoringDiagnostics([], 52),
		].join("\n"));
		expect(output).toContain("matrix data 미관측");
		expect(output).toContain("flow data 미관측");
		expect(output).toContain("diagnostic data 미관측");
		expect(stripTerminalSequences(monitoringQueue([], 52).join("\n"))).toContain("queue empty");
	});

	test("renders page-defined columns on stable shared axes", () => {
		const rows = monitoringTable({
			columns: [
				{ heading : "SOURCE"       , minWidth : 7                     },
				{ heading : "DISTRIBUTION" , minWidth : 12 , weight : 1       },
				{ heading : "SIZE"         , minWidth : 6  , align  : "right" },
				{ heading : "SHARE"        , minWidth : 6  , align  : "right" },
			],
			rows: [
				["SYS", "████", "4 MB", "8.3%"],
				["CONV", "████████████", "20 MB", "41.7%"],
			],
		}, 52);
		const plain = rows.map(stripTerminalSequences);
		expect(plain).toHaveLength(4);
		expect(["SOURCE", "DISTRIBUTION", "SIZE", "SHARE"].map(label => plain[0]!.indexOf(label))).toEqual([0, 9, 40, 47]);
		expect(plain[2]!.indexOf("MB")).toBe(42);
		expect(plain[3]!.indexOf("MB")).toBe(42);
		expect(plain[2]!.indexOf("%")).toBe(51);
		expect(plain[3]!.indexOf("%")).toBe(51);
		expect(rows.every(row => visibleWidth(row) === 52)).toBe(true);
	});
});

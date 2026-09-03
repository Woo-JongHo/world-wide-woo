import { describe, expect, test } from "bun:test";
import { stripTerminalSequences, visibleWidth } from "@earendil-works/pi-tui";
import type { ObservabilityDashboard } from "../src/domain/observability-dashboard";
import type { RuntimeMonitorProjection } from "../src/domain/runtime-monitor";
import { ObservabilityDashboardView } from "../src/presentation/tui/observability-dashboard-view";
import { RuntimeMonitorView } from "../src/presentation/tui/runtime-monitor-view";

const dashboard: ObservabilityDashboard = {
	coverage:{state:"observed",observedFrom:"2026-09-01T00:00:00Z",observedUntil:"2026-09-03T00:00:00Z",streamsRead:3,skippedStreams:0},
	sessions:{active:1,completed:2,failures:0}, usage:{totalTokens:1_000_000,models:[{model:"gpt-5.6-sol",effort:"low",totalTokens:1_000_000,interactiveRootTurns:3,detachedInvocations:0}]},
	health:{completionPercent:100,retries:0,failures:0},trend:{available:false,buckets:[]},attention:[],recentSessions:[],
};
const monitor: RuntimeMonitorProjection = {state:"running",activeRequest:{label:"Implement dashboard",sourceActivityId:"a1",elapsed:{startedAt:"2026-09-03T00:00:00Z",elapsedMs:null}},model:"gpt-5.6-sol",agent:"executor",currentTool:{label:"github.search",sourceActivityId:"a2",elapsed:{startedAt:"2026-09-03T00:00:10Z",elapsedMs:null}},approval:null,retryCount:1,failureCount:0,sourceActivityIds:["a1","a2"],recentEvents:[{kind:"TOOL",activityId:"a2",recordedAt:"2026-09-03T00:00:10Z",label:"github.search"}]};

describe("observability views",()=>{
	test("renders aggregate dashboard hierarchy without inventing trend",()=>{const output=stripTerminalSequences(new ObservabilityDashboardView(()=>dashboard).render(120).join("\n"));for(const value of ["DASHBOARD","ACTIVE","MODEL USAGE","████","Trend unavailable","No sessions need attention"])expect(output).toContain(value);});
	test("renders live current state and indeterminate tool elapsed",()=>{const output=stripTerminalSequences(new RuntimeMonitorView(()=>monitor,()=>Date.parse("2026-09-03T00:00:20Z")).render(120).join("\n"));for(const value of ["LIVE MONITOR","RUNNING","Implement dashboard","github.search","10s","Retry 1"])expect(output).toContain(value);expect(output).not.toContain("%");});
	test("keeps all responsive rows bounded",()=>{for(const width of [42,80,109,110,159,160,220])for(const View of [new ObservabilityDashboardView(()=>dashboard),new RuntimeMonitorView(()=>monitor)])for(const row of View.render(width))expect(visibleWidth(row)).toBeLessThanOrEqual(width);});
});

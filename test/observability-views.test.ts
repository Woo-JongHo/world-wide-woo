import { describe, expect, test } from "bun:test";
import { stripTerminalSequences, visibleWidth } from "@earendil-works/pi-tui";
import type { ObservabilityDashboard } from "../src/core/domain/observability/observability-dashboard";
import type { RuntimeMonitorProjection } from "../src/core/domain/observability/runtime-monitor";
import { ObservabilityDashboardView } from "../src/adapters/inbound/tui/dashboard/observability-dashboard-view";
import { RuntimeMonitorView } from "../src/adapters/inbound/tui/dashboard/runtime-monitor-view";

const dashboard: ObservabilityDashboard = {
	coverage:{state:"observed",observedFrom:"2026-09-01T00:00:00Z",observedUntil:"2026-09-03T00:00:00Z",streamsRead:3,skippedStreams:0},
	sessions:{active:1,completed:2,failures:0}, usage:{totalTokens:1_000_000,models:[{model:"gpt-5.6-sol",effort:"low",totalTokens:1_000_000,interactiveRootTurns:3,detachedInvocations:0}]},
	health:{completionPercent:100,retries:0,failures:0},trend:{available:false,buckets:[]},attention:[],recentSessions:[],
};
const monitor: RuntimeMonitorProjection = {state:"running",activeRequest:{label:"Implement dashboard",sourceActivityId:"a1",elapsed:{startedAt:"2026-09-03T00:00:00Z",elapsedMs:null}},model:"gpt-5.6-sol",agent:"executor",currentTool:{label:"github.search",sourceActivityId:"a2",elapsed:{startedAt:"2026-09-03T00:00:10Z",elapsedMs:null}},approval:null,retryCount:1,failureCount:0,sourceActivityIds:["a1","a2"],recentEvents:[{kind:"TOOL",activityId:"a2",recordedAt:"2026-09-03T00:00:10Z",label:"github.search"}],skillRun:null};

describe("observability views",()=>{
	test("renders aggregate dashboard hierarchy without inventing trend",()=>{const output=stripTerminalSequences(new ObservabilityDashboardView(()=>dashboard).render(120).join("\n"));for(const value of ["DASHBOARD","ACTIVE","MODEL USAGE","████","Trend unavailable","No sessions need attention"])expect(output).toContain(value);});
	test("renders live current state and indeterminate tool elapsed",()=>{const output=stripTerminalSequences(new RuntimeMonitorView(()=>monitor,()=>Date.parse("2026-09-03T00:00:20Z")).render(120).join("\n"));for(const value of ["LIVE MONITOR","RUNNING","Implement dashboard","github.search","10s","Retry 1"])expect(output).toContain(value);expect(output).not.toContain("%");});
	test("marks empty projection unknown instead of inventing idle zeroes",()=>{const empty:RuntimeMonitorProjection={state:"idle",activeRequest:null,model:null,agent:null,currentTool:null,approval:null,retryCount:0,failureCount:0,sourceActivityIds:[],recentEvents:[],skillRun:null};const output=stripTerminalSequences(new RuntimeMonitorView(()=>empty).render(40).join("\n"));for(const value of ["UNKNOWN","Observation unknown","Retry 0","Coverage","Esc back"])expect(output).toContain(value);expect(output).not.toContain("No active execution observed.");});
	test("keeps current state, request, tool, and coverage visible at 40 columns",()=>{const output=stripTerminalSequences(new RuntimeMonitorView(()=>monitor,()=>Date.parse("2026-09-03T00:00:20Z")).render(40).join("\n"));for(const value of ["RUNNING","Request","Implement dashboard","Tool","github.search","Coverage","Esc back"])expect(output).toContain(value);expect(output).not.toContain(" ACTIVITY ");});
	test("renders a bounded Skill Run projection",()=>{const value:RuntimeMonitorProjection={...monitor,skillRun:{runId:"run-1",skill:"rpa-map",stage:"running",processId:"RPA-GMB-FTA",taskId:"T01",candidateId:"candidate-1",receiptId:null}};const output=stripTerminalSequences(new RuntimeMonitorView(()=>value).render(100).join("\n"));for(const text of ["SKILL RUN","run-1","rpa-map · running","RPA-GMB-FTA / T01","candidate-1"])expect(output).toContain(text);});
	test.each(["completed","failed"] as const)("renders the observed %s terminal state",state=>{const terminal:RuntimeMonitorProjection={...monitor,state,activeRequest:null,currentTool:null};const output=stripTerminalSequences(new RuntimeMonitorView(()=>terminal).render(40).join("\n"));expect(output).toContain(state.toUpperCase());});
	test("keeps all responsive rows bounded",()=>{for(const width of [42,80,109,110,159,160,220])for(const View of [new ObservabilityDashboardView(()=>dashboard),new RuntimeMonitorView(()=>monitor)])for(const row of View.render(width))expect(visibleWidth(row)).toBeLessThanOrEqual(width);});
});

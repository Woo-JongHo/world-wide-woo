import      { describe, expect, test } from "bun:test"                                                              ;
import      { stripTerminalSequences } from "@earendil-works/pi-tui"                                                ;
import      { renderLayoutFrame      } from "@earendil-works/pi-tui/dist/layout.js"                                 ;
import      { WwwWorkspace           } from "../src/adapters/inbound/tui/shell/www-surface"                         ;
import      { WwwPlanView            } from "../src/adapters/inbound/tui/features/plan/view/www-plan-view"          ;
import      { WwwMonitorView         } from "../src/adapters/inbound/tui/features/monitoring/view/www-monitor-view" ;
import      { projectRuntimeMonitor  } from "../src/core/domain/observability/runtime-monitor"                      ;
import type { WorkbenchSnapshot      } from "../src/core/domain/work/workbench"                                     ;
import      { wwwFixture             } from "./fixtures/www-snapshot"                                               ;

function workingSnapshot(): WorkbenchSnapshot {
	const snapshot: WorkbenchSnapshot = { ...wwwFixture("working"), planActivities: [{ id: "current", turnId: "preview-turn", stepId: "inspect", stepTitle: "회귀 검사", summary: "현재 표시 경로를 검증합니다.", status: "running", sequence: 7 }] };
	snapshot.requestRuntime = [{
		schemaVersion: 1, protocolVersion: 4, requestId: "request", threadId: snapshot.threadId, turnId: snapshot.activeTurnId,
		objective: "표시 검증", status: "running", stages: [], attempt: 1, previousAttempts: [], deliveries: [], requiredDeliveries: [],
		events: [], startedAt: "2026-10-07T00:00:00Z", completedAt: null, issues: [], actions: [],
		checkpoints: [{ id: "WORK", status: "running", summary: "Native 작업 실행 중입니다.", activityIds: ["work"], observedAt: null }],
	}];
	return snapshot;
}

function workspaceRows(snapshot: WorkbenchSnapshot): string[] {
	const workspace = new WwwWorkspace(() => snapshot, () => [], height => height, Date.now, false, null, undefined, null, undefined, {}, undefined, undefined, () => projectRuntimeMonitor(snapshot));
	try { return renderLayoutFrame(workspace.component, 160, 70, () => {}).lines; }
	finally { workspace.transcript.dispose(); }
}

const surfaces = {
	plan      : (snapshot: WorkbenchSnapshot) => new WwwPlanView(() => snapshot).render(100),
	rail      : (snapshot: WorkbenchSnapshot) => new WwwMonitorView(() => projectRuntimeMonitor(snapshot), Date.now, false, () => snapshot, true).render(100),
	workspace : workspaceRows,
};

describe("protocol v4 in-flight PROGRESS visibility", () => {
	for (const [name, surface] of Object.entries(surfaces)) {
		const progress = (snapshot: WorkbenchSnapshot) => stripTerminalSequences(surface(snapshot).join("\n")).split("PROGRESS")[1]?.split("TEST")[0] ?? "";
		test(`${name} falls back to detail when observed WORK has no summary`, () => {
			const snapshot = workingSnapshot()                              ;
			const work     = snapshot.requestRuntime?.[0]?.checkpoints?.[0] ;
			if (!work) throw new Error("fixture WORK missing");
			work.status = "observed";
			work.summary = null;
			expect(progress(snapshot)).toContain("현재 표시 경로를 검증합니다.");
			expect(progress(snapshot)).not.toContain("Native 진행 보고 대기");
		});
		test(`${name} follows its retained Plan or active Chat turn when a new turn starts`, () => {
			const source = workingSnapshot();
			const snapshot: WorkbenchSnapshot = {
				...source,
				activeTurnId   : "new-turn",
				planActivities : [...(source.planActivities ?? []), { id: "new", turnId: "new-turn", stepId: "new", stepTitle: "새 작업", summary: "새 요청의 관측된 진행입니다.", status: "running", sequence: 99 }],
				requestRuntime : (source.requestRuntime ?? []).flatMap(item => [item, { ...item, requestId: "new-request", turnId: "new-turn" }]),
			};
			const output = stripTerminalSequences(surface(snapshot).join("\n"));
			if (name === "plan") {
				expect(output            )    .toContain("세션과 이벤트 결합 지점 확인") ;
				expect(progress(snapshot))    .toContain("현재 표시 경로를 검증합니다.") ;
				expect(progress(snapshot)).not.toContain("새 요청의 관측된 진행입니다.") ;
			} else {
				expect(progress(snapshot)).toContain("새 요청의 관측된 진행입니다.");
				expect(progress(snapshot)).not.toContain("현재 표시 경로를 검증합니다.");
			}
		});
		test(`${name} shows current detail before RESULT observes WORK`, () => {
			const snapshot = workingSnapshot();
			expect(progress(snapshot)                                    )    .toContain("현재 표시 경로를 검증합니다.") ;
			expect(progress(snapshot)                                    ).not.toContain("Native 진행 보고 대기"       ) ;
			expect(snapshot.requestRuntime?.[0]?.checkpoints?.[0]?.status)    .toBe     ("running"                     ) ;
		});
		test(`${name} shows the running WORK summary while detail is absent`, () => {
			const snapshot: WorkbenchSnapshot = { ...workingSnapshot(), planActivities: [] };
			expect(progress(snapshot)).toContain("Native 작업 실행 중입니다.");
		});
		test(`${name} explicitly waits when neither summary nor detail was observed`, () => {
			const snapshot: WorkbenchSnapshot = { ...workingSnapshot(), planActivities: [] }   ;
			const work                        = snapshot.requestRuntime?.[0]?.checkpoints?.[0] ;
			if (!work) throw new Error("fixture WORK missing");
			work.summary = null;
			expect(progress(snapshot)).toContain("Native 진행 보고 대기");
		});
		test(`${name} never attaches older-turn detail to the current Plan`, () => {
			const source                      = workingSnapshot()                                                                                                                               ;
			const snapshot: WorkbenchSnapshot = { ...source, planActivities: (source.planActivities ?? []).map(item => ({ ...item, turnId: "older-turn", summary: "이전 요청의 진행 문장" })) } ;
			expect(progress(snapshot)).not.toContain("이전 요청의 진행 문장");
			expect(progress(snapshot)).toContain("Native 작업 실행 중입니다.");
		});
		test(`${name} keeps the observed final WORK summary authoritative`, () => {
			const snapshot = workingSnapshot()                              ;
			const work     = snapshot.requestRuntime?.[0]?.checkpoints?.[0] ;
			if (!work) throw new Error("fixture WORK missing");
			work.status = "observed";
			work.summary = "최종 검증 결과를 확인했습니다.";
			expect(progress(snapshot)).toContain("최종 검증 결과를 확인했습니다.");
			expect(progress(snapshot)).not.toContain("현재 표시 경로를 검증합니다.");
		});
		test(`${name} keeps the final summary when a higher-sequence detail arrives late`, () => {
			let snapshot = workingSnapshot()                              ;
			const work   = snapshot.requestRuntime?.[0]?.checkpoints?.[0] ;
			if (!work) throw new Error("fixture WORK missing");
			work.status = "observed";
			work.summary = "최종 검증 결과를 확인했습니다.";
			expect(progress(snapshot)).toContain("최종 검증 결과를 확인했습니다.");
			snapshot = { ...snapshot, planActivities: [...(snapshot.planActivities ?? []), { id: "late", turnId: "preview-turn", stepId: "inspect", stepTitle: "회귀 검사", summary: "늦게 도착한 세부 작업 문장", status: "completed", sequence: 99 }] };
			expect(progress(snapshot)).toContain("최종 검증 결과를 확인했습니다.");
			expect(progress(snapshot)).not.toContain("늦게 도착한 세부 작업 문장");
		});
	}
});

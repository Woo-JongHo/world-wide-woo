import      {
              describe                    ,
              expect                      ,
              test                        ,
                                            } from "bun:test"                                                                  ;
import      {
              Editor                      ,
              ProcessTerminal             ,
              TuiAltScreen                ,
              VStack                      ,
              stripTerminalSequences      ,
              visibleWidth                ,
                                            } from "@earendil-works/pi-tui"                                                    ;
import chalk                             from "chalk";
import      { renderLayoutFrame             } from "@earendil-works/pi-tui/dist/layout.js"                                     ;
import      { sliceByColumn                 } from "@earendil-works/pi-tui/dist/utils.js"                                      ;
import      { wwwFixture                    } from "./fixtures/www-snapshot"                                                   ;
import type { WorkbenchSnapshot             } from "../src/core/domain/work/workbench"                                         ;
import      { projectChatFeature            } from "../src/core/application/orchestration/workbench-feature-reads"             ;
import      {
              WwwCommandPalette           ,
              WwwComposer                 ,
              WwwExecutionHeading         ,
              WwwGoalBar                  ,
              WwwHeader                   ,
              WwwHud                      ,
              WwwSheet                    ,
              WwwStageHud                 ,
              WwwViewSwitcher             ,
              WwwWorkspace                ,
              WWW_COMMANDS                ,
              WWW_VIEWS                   ,
              HelpView                    ,
                                            } from "../src/adapters/inbound/tui/shell/www-surface"                             ;
import      {
              WwwTranscriptView           ,
              wwwConversationLabels       ,
              wwwExecutionIsLive          ,
              wwwNowLabel                 ,
              wwwTNoteMarkdown            ,
              wwwToolRows                 ,
              executionHeading            ,
                                            } from "../src/adapters/inbound/tui/features/chat/view/www-execution"              ;
import      { WwwPlanView                   } from "../src/adapters/inbound/tui/features/plan/view/www-plan-view"              ;
import      { compactStatusRows             } from "../src/adapters/inbound/tui/foundation/components/status-card"             ;
import      { WwwWorkflowView               } from "../src/adapters/inbound/tui/features/workflow/view/www-workflow-view"      ;
import      { WwwContextView                } from "../src/adapters/inbound/tui/features/context/view/www-context-view"        ;
import      {
              WwwCacheRail                ,
              WwwCacheView                ,
                                            } from "../src/adapters/inbound/tui/features/cache/view/www-cache-view"            ;
import      { WwwDashboardView              } from "../src/adapters/inbound/tui/features/dashboard/view/entry-dashboard-view"  ;
import      { composeCacheTelemetry         } from "../src/core/domain/observability/cache-telemetry"                          ;
import      { WwwHistoryView                } from "../src/adapters/inbound/tui/features/session/view/www-history-view"        ;
import      { WwwStatsView                  } from "../src/adapters/inbound/tui/features/stats/view/www-stats-view"            ;
import      { projectObservabilityDashboard } from "../src/core/domain/observability/observability-dashboard"                  ;
import      { projectSessionStats           } from "../src/core/domain/observability/session-stats"                            ;
import      { projectRuntimeMonitor         } from "../src/core/domain/observability/runtime-monitor"                          ;
import      { WwwMonitorView                } from "../src/adapters/inbound/tui/features/monitoring/view/www-monitor-view"     ;
import      { projectPerformance            } from "../src/core/domain/work/performance"                                       ;
import      { ApprovalOverlay               } from "../src/adapters/inbound/tui/features/approval/view/approval-overlay"       ;
import      { NativeThreadPicker            } from "../src/adapters/inbound/tui/features/session/view/native-thread-picker"    ;
import      {
              a                           ,
              wwwColors                   ,
              wwwEditorTheme              ,
              wwwPalette                  ,
              wwwPulse                    ,
              duration                    ,
                                            } from "../src/adapters/inbound/tui/foundation/theme/www-theme"                    ;
import      {
              wwwQuotaHudRows             ,
              wwwUsageLine                ,
                                            } from "../src/adapters/inbound/tui/features/usage/view/www-usage"                 ;
import      {
              requestRuntimeMotionActive  ,
              requestRuntimeRows          ,
              requestStatusGradient       ,
                                            } from "../src/adapters/inbound/tui/features/monitoring/view/request-runtime-view" ;
import type { UsageSnapshot                 } from "../src/core/ports/observability/usage-monitor-port"                        ;
import      { REQUEST_STAGES                } from "../src/core/domain/execution/request-runtime"                              ;

describe("Www execution console", () => {
	test("stage HUD shows seven stages only for the active request", () => {
		const snapshot = wwwFixture("working")           ;
		const stageHud = new WwwStageHud(() => snapshot) ;
		const request = {
			schemaVersion: 1 as const, protocolVersion: 2 as const, requestId: "request-hud", threadId: snapshot.threadId, turnId: snapshot.activeTurnId,
			objective: "HUD 상태 표시", status: "running" as const, attempt: 1, previousAttempts: [], deliveries: [], requiredDeliveries: [], events: [],
			startedAt: "2026-09-28T00:00:00Z", completedAt: null, issues: [], actions: [],
			stages: REQUEST_STAGES.map((id, index) => ({ id, status: index === 0 ? "completed" as const : index === 1 ? "running" as const : "pending" as const,
				goal: id, input: [], owner: "orchestrator" as const, model: null, agents: [], tools: [], output: null, evidence: [], decision: null,
				skipReason: null, startedAt: null, completedAt: null, next: REQUEST_STAGES[index + 1] ?? null, evidenceAfterSequence: 0, tasks: [] })),
		};
		snapshot.requestRuntime = [request];
		const heading = stripTerminalSequences(new WwwExecutionHeading(() => snapshot, () => null, () => Date.parse("2026-09-28T00:00:01Z"), false).render(120).join("\n"));
		expect(heading).toContain("DECOMPOSE · running");
		for (const stage of REQUEST_STAGES) expect(heading).toContain(stage);
		const level = chalk.level; chalk.level = 3;
		try {
			const first      = new WwwExecutionHeading(() => snapshot, () => null, () => 1_000, true).render(120)        ;
			const next       = new WwwExecutionHeading(() => snapshot, () => null, () => 1_120, true).render(120)        ;
			const runningRow = (rows: string[]) => rows.find(row => stripTerminalSequences(row).includes("UNDERSTAND"))! ;
			expect(stripTerminalSequences(runningRow(first)))    .toBe     (stripTerminalSequences(runningRow(next))) ;
			expect(runningRow(first)                        ).not.toBe     (runningRow(next)                        ) ;
			expect(runningRow(first)                        )    .toContain(a.success("✓")                          ) ;
		} finally { chalk.level = level; }
		expect(heading).not.toContain("중복되는 이벤트 결합 경로");
		const dashboard = stripTerminalSequences(new WwwDashboardView(() => snapshot).render(80).join("\n"));
		expect(dashboard           ).toContain("QUESTIONS / MONITOR RECORDS") ;
		expect(dashboard           ).toContain("/monitor #1"                ) ;
		expect(dashboard           ).toContain("HUD 상태 표시"              ) ;
		expect(stageHud.isVisible()).toBe     (true                         ) ;
		const wide = stripTerminalSequences(stageHud.render(120).join(""));
		for (const stage of REQUEST_STAGES) expect(wide).toContain(stage);
		const compact = stripTerminalSequences(stageHud.render(60).join(""))                                                                          ;
		const skipped = { ...request, stages: request.stages.map(stage => stage.id === "GROUND" ? { ...stage, status: "skipped" as const } : stage) } ;
		snapshot.requestRuntime = [skipped];
		expect(stripTerminalSequences(new WwwExecutionHeading(() => snapshot).render(120).join("\n"))).toContain("− GROUND");
		expect(stripTerminalSequences(stageHud.render(120)[0]!)).toContain("− GROUND");
		snapshot.requestRuntime = [request];
		const blockedSnapshot = { ...snapshot, activeTurnId: null, requestRuntime: [{ ...request, status: "blocked" as const, stages: request.stages.map(stage => stage.id === "GROUND" ? { ...stage, status: "blocked" as const } : stage) }] } ;
		const blockedHeading  = stripTerminalSequences(new WwwExecutionHeading(() => blockedSnapshot).render(80).join("\n"))                                                                                                                     ;
		for (const stage of REQUEST_STAGES) expect(blockedHeading).toContain(stage);
		expect(blockedHeading).not.toContain("Stages 2/7");
		const blockedHud = stripTerminalSequences(new WwwHud(() => blockedSnapshot, () => [], false).render(140).join("\n"));
		expect(blockedHud).not.toContain("Request 2/7");
		for (const stage of ["UND", "DEC", "GRD", "DCD", "EXE", "VER", "DLV"]) expect(compact).toContain(stage);
		const tiny = stripTerminalSequences(stageHud.render(24).join(""));
		for (const marker of ["✓U", "●D", "·G", "·E", "·V", "·L"]) expect(tiny).toContain(marker);
		snapshot.phase = "ready";
		snapshot.requestRuntime = [{ ...request, status: "blocked", stages: request.stages.map((stage, index) => ({ ...stage, status: index < 2 ? "completed" as const : index === 2 ? "blocked" as const : "pending" as const })) }];
		expect(stageHud.isVisible()).toBe(true);
		const blocked = stripTerminalSequences(stageHud.render(24).join(""));
		for (const marker of ["✓U", "✓D", "×G", "·E", "·V", "·L"]) expect(blocked).toContain(marker);
		snapshot.requestRuntime = [{ ...request, protocolVersion: 1 }];
		expect(stageHud.isVisible()).toBe(false);
		expect(stageHud.render(120)).toEqual([]);
		snapshot.requestRuntime = [request];
		snapshot.activeTurnId = "another-turn";
		expect(stageHud.isVisible()).toBe(false);
		expect(stageHud.render(120)).toEqual([]);
	});
	test("Chat request has a themed full-width surface without coloring the response", () => {
		const level = chalk.level; chalk.level = 3;
		try {
			const rows        = new WwwTranscriptView(wwwFixture("ready")).render(60)                 ;
			const requestRow  = rows.find(row => stripTerminalSequences(row).includes("INPUT 1"))!    ;
			const responseRow = rows.find(row => stripTerminalSequences(row).includes("OUTPUT 1-1"))! ;
			expect(requestRow              )    .toContain("\u001b[48;2;") ;
			expect(responseRow             ).not.toContain("\u001b[48;2;") ;
			expect(visibleWidth(requestRow))    .toBe     (60            ) ;
		} finally { chalk.level = level; }
	});
	test("Chat rail separates the Native plan from interpreted progress", () => {
		const snapshot = { ...wwwFixture("working"), planActivities: [{ id: "step-result", turnId: "preview-turn", stepId: "step-1", stepTitle: "세션과 이벤트 결합 지점 확인", summary: "중복되는 이벤트 결합 경로를 찾았습니다.", status: "completed" as const, sequence: 7 }] } ;
		const rail     = stripTerminalSequences(new WwwMonitorView(() => projectRuntimeMonitor(snapshot), Date.now, false, () => snapshot, true).render(40).join("\n"))                                                                                                            ;
		const progress = rail.slice(rail.indexOf("PROGRESS"))                                                                                                                                                                                                                      ;
		expect(rail    )    .toContain("세션과 이벤트 결합 지점 확인"        ) ;
		expect(progress)    .toContain("중복되는 이벤트 결합 경로"           ) ;
		expect(progress).not.toContain("세션과 이벤트 결합 지점 확인"        ) ;
		expect(rail    )    .toContain("TEST"                                ) ;
		expect(rail    )    .toContain("bun test test/session-resume.test.ts") ;
	});

	test("PROGRESS uses the accepted WORK summary for a current protocol 4 request", () => {
		const snapshot = { ...wwwFixture("working"), planActivities: [{ id: "old", turnId: "preview-turn", stepId: "one", stepTitle: "계획", summary: "모델이 만든 이전 요약", status: "completed" as const, sequence: 3 }] };
		snapshot.requestRuntime = [{
			schemaVersion: 1, protocolVersion: 4, requestId: "request", threadId: snapshot.threadId, turnId: snapshot.activeTurnId,
			objective: "진행 확인", status: "running", stages: [], attempt: 1, previousAttempts: [], deliveries: [], requiredDeliveries: [],
			events: [], startedAt: "2026-09-11T09:42:01.000Z", completedAt: null, issues: [], actions: [],
			checkpoints: [{ id: "WORK", status: "observed", summary: "실제 조회 결과를 확인했습니다.", activityIds: ["work-report"], observedAt: "2026-09-11T09:42:03.000Z" }],
		}];
		const view     = new WwwMonitorView(() => projectRuntimeMonitor(snapshot), Date.now, false, () => snapshot, true) ;
		const progress = stripTerminalSequences(view.render(60).join("\n")).split("PROGRESS")[1]!.split("TEST")[0]!       ;
		expect(progress).toContain("실제 조회 결과를 확인했습니다.");
		expect(progress).not.toContain("모델이 만든 이전 요약");
		const planProgress = stripTerminalSequences(new WwwPlanView(() => snapshot).render(60).join("\n")).split("PROGRESS")[1]!;
		expect(planProgress).toContain("실제 조회 결과를 확인했습니다.");
		expect(planProgress).not.toContain("모델이 만든 이전 요약");
	});

	test("Chat rail keeps the active Native plan when Monitor still points to an older request", () => {
		const snapshot = wwwFixture("working")                                                                                                  ;
		const monitor  = projectRuntimeMonitor(snapshot)                                                                                        ;
		const stale    = monitor.requestRuntime ? { ...monitor, requestRuntime: { ...monitor.requestRuntime, turnId: "older-turn" } } : monitor ;
		const output   = stripTerminalSequences(new WwwMonitorView(() => stale, Date.now, false, () => snapshot, true).render(40).join("\n"))   ;
		expect(output).toContain("세션과 이벤트 결합 지점 확인");
		expect(output).toContain("PLAN");
	});

	test("Chat rail wraps a long interpreted progress sentence without losing its ending", () => {
		const snapshot = { ...wwwFixture("working"), planActivities: [{ id: "long-progress", turnId: "preview-turn", stepId: "step-1", stepTitle: "경계 확인", summary: "긴 검증 결과를 모두 읽고 마지막 결론까지 확인했습니다.", status: "completed" as const, sequence: 8 }] } ;
		const output   = stripTerminalSequences(new WwwMonitorView(() => projectRuntimeMonitor(snapshot), Date.now, false, () => snapshot, true).render(20).join("\n"))                                                                                                          ;
		expect(output.replace(/\s+/gu, "")).toContain("마지막결론까지확인했습니다.");
	});
	test("Chat uses public runtime summaries for tool rows and puts stage timing in the final report", () => {
		const snapshot = wwwFixture("working");
		const stage = {
			id: "DECIDE" as const, status: "completed" as const, goal: "재개 경계 결정", input: [], owner: "orchestrator" as const,
			model: null, agents: [], tools: [], output: "중복 결합 지점을 확인했습니다.", evidence: [],
			decision: { decision: "병합 조건을 좁힙니다.", rationale: "PRIVATE_RATIONALE", selectedApproach: "merge", rejectedAlternatives: [], executionPlan: [] },
			skipReason: null, startedAt: "2026-09-28T00:00:00Z", completedAt: "2026-09-28T00:00:03Z", next: "EXECUTE" as const,
			evidenceAfterSequence: 0, tasks: [],
		};
		const thought = { ...snapshot.activities[4]!, id: "runtime-thought", sequence: 5, kind: "progress" as const, payload: { method: "runtime/stage-report", authority: "runtime", report: { requestId: "request-workstream", stage: "DECIDE", status: "completed", summary: "중복 결합 지점을 확인했습니다." } } };
		snapshot.activities = [...snapshot.activities.slice(0, 4), thought, ...snapshot.activities.slice(4)];
		snapshot.requestRuntime = [{
			schemaVersion: 1, protocolVersion: 2, requestId: "request-workstream", threadId: snapshot.threadId, turnId: snapshot.activeTurnId,
			objective: "재개 동작 확인", status: "running", attempt: 1, previousAttempts: [], deliveries: [], requiredDeliveries: [], events: [{ id: "stage-result", type: "stage.completed", requestId: "request-workstream", stage: "DECIDE", activityId: thought.id, at: thought.recordedAt, reason: null }],
			startedAt: "2026-09-28T00:00:00Z", completedAt: null, issues: [], actions: [], stages: [stage],
		}];
		const view   = new WwwTranscriptView(snapshot)                    ;
		const output = stripTerminalSequences(view.render(80).join("\n")) ;
		expect(output                                          ).not.toContain   ("Thought"                       ) ;
		expect(output                                          )    .toContain   ("중복 결합 지점을 확인했습니다.") ;
		expect(output                                          )    .toContain   ("1건"                           ) ;
		expect(output.indexOf("중복 결합 지점을 확인했습니다."))    .toBeLessThan(output.indexOf("OUTPUT 1-1")    ) ;
		expect(output                                          ).not.toContain   ("CHAT / NATIVE WORKSTREAM"      ) ;
		expect(output                                          ).not.toContain   ("DECIDE  3s"                    ) ;
		expect(output                                          ).not.toContain   ("PRIVATE_RATIONALE"             ) ;
		const completed = { ...snapshot.activities[1]!, id: "turn-complete", payload: { method: "turn/completed" }, phase: "completed" as const };
		snapshot.activities = [...snapshot.activities, completed];
		snapshot.requestRuntime = [{ ...snapshot.requestRuntime[0]!, status: "completed", completedAt: "2026-09-28T00:00:04Z" }];
		view.update(snapshot);
		const final = stripTerminalSequences(view.render(80).join("\n"));
		expect(final                                     ).toContain      ("REPORT · 단계별 소요 시간") ;
		expect(final                                     ).toContain      ("DECIDE  3s"               ) ;
		expect(final.indexOf("REPORT · 단계별 소요 시간")).toBeGreaterThan(final.indexOf("OUTPUT 1-1")) ;
		view.dispose();
	});

	test("observe INTENT supplies the following tool summary without a Thought row", () => {
		const snapshot = wwwFixture("working")                                                                                                                                                                                                                                                                ;
		const thought  = { ...snapshot.activities[4]!, id: "observe-intent", kind: "message" as const, payload: { role: "assistant", text: '[www-runtime]{"requestId":"observe-request","checkpoint":"INTENT","summary":"요청 범위를 이해했습니다.","goal":"PLAN 복구","plan":["원인 확인","화면 검증"]}' } } ;
		snapshot.activities = [...snapshot.activities.slice(0, 4), thought, ...snapshot.activities.slice(4)];
		snapshot.requestRuntime = [{
			schemaVersion: 1, protocolVersion: 1, requestId: "observe-request", threadId: snapshot.threadId, turnId: snapshot.activeTurnId,
			objective: "PLAN 복구", status: "running", attempt: 1, previousAttempts: [], deliveries: [], requiredDeliveries: [],
			events: [{ id: "understood", type: "stage.completed", requestId: "observe-request", stage: "UNDERSTAND", activityId: thought.id, at: thought.recordedAt, reason: null }],
			startedAt: thought.recordedAt, completedAt: null, issues: [], actions: [], stages: [],
		}];
		const view   = new WwwTranscriptView(snapshot)                    ;
		const output = stripTerminalSequences(view.render(80).join("\n")) ;
		expect(output                                     ).not.toContain   ("Thought"                   ) ;
		expect(output                                     )    .toContain   ("1건"                       ) ;
		expect(output                                     ).not.toContain   ("1. 원인 확인"              ) ;
		expect(output.indexOf("요청 범위를 이해했습니다."))    .toBeLessThan(output.indexOf("OUTPUT 1-1")) ;
		expect(output                                     ).not.toContain   ("DECOMPOSE"                 ) ;
		snapshot.requestRuntime = [{ ...snapshot.requestRuntime[0]!, events: [] }];
		view.update(snapshot);
		expect(stripTerminalSequences(view.render(80).join("\n"))).not.toContain("요청 범위를 이해했습니다.");
		view.dispose();
	});
	test("shrinks the composer beside the visible execution sidebar", () => {
		const snapshot = wwwFixture("ready") ;
		let bodyRows   = 17                  ;
		const workspace = new WwwWorkspace(
			() => snapshot,
			() => [],
			() => bodyRows,
			Date.now,
			false,
			null,
			new HelpView(),
			null,
			undefined,
			undefined,
			undefined,
			undefined,
			() => ({}) as never,
		);
		const widths: number[] = []   ;
		let workbenchMode      = true ;
		const composer = workspace.composeInput({
			invalidate: () => undefined,
			render: width => { widths.push(width); return ["INPUT", "", ""]; },
		}, () => workbenchMode);

		renderLayoutFrame(composer, 120, 4, () => undefined);
		expect(widths.at(-1)).toBe(120);

		bodyRows = 18;
		const inputFrame = renderLayoutFrame(composer, 120, 4, () => undefined).lines;
		expect(widths.at(-1)).toBe(65);
		expect(inputFrame.slice(0, 3).every(row => stripTerminalSequences(sliceByColumn(row, 65, 1)) === "│")).toBe(true);
		const bodyFrame = renderLayoutFrame(workspace.component, 120, 18, () => undefined).lines;
		expect(bodyFrame.every(row => stripTerminalSequences(sliceByColumn(row, 65, 1)) === "│")).toBe(true);

		workbenchMode = false;
		renderLayoutFrame(composer, 120, 4, () => undefined);
		expect(widths.at(-1)).toBe(120);

		workbenchMode = true;
		workspace.toggleSidebar();
		renderLayoutFrame(composer, 120, 4, () => undefined);
		expect(widths.at(-1)).toBe(120);
	});

	test("detailed monitor retains its STATUS label", () => {
		const snapshot = wwwFixture("working")                                                                                                    ;
		const view     = new WwwMonitorView(() => projectRuntimeMonitor(snapshot), Date.now, false, () => snapshot, true, null, () => "ko", true) ;
		const text     = stripTerminalSequences(view.render(54).join("\n"))                                                                       ;
		expect(text).toContain("STATUS");
		expect(text).not.toContain("REPORT");
	});

	test("execution sidebar shows PLAN PROGRESS TEST without a STATUS panel", () => {
		const snapshot     = wwwFixture("working") ;
		let inputRows      = 3                     ;
		let inputVisible   = true                  ;
		let viewportHeight = 32                    ;
		const workspace = new WwwWorkspace(
			() => snapshot, () => [], height => height - 5, Date.now, false,
			null, new HelpView(), null, undefined, undefined, undefined,
			undefined, () => projectRuntimeMonitor(snapshot), () => "ko",
			() => ({ width: 120, height: viewportHeight }),
		);
		const composer = workspace.composeInput({ invalidate: () => undefined, render: () => Array.from({ length: inputRows }, () => "INPUT") }, () => inputVisible);
		const root = new VStack([
			{ component: workspace.component, basis: 0, grow: 1, minSize: 1 },
			{ component: composer, basis: "auto", minSize: 3 },
		]);
		const frame    = () => renderLayoutFrame(root, 120, viewportHeight, () => undefined).lines.map(stripTerminalSequences) ;
		const first    = frame()                                                                                               ;
		const plan     = first.findIndex(row => row.includes("PLAN"))                                                          ;
		const progress = first.findIndex(row => row.includes("PROGRESS"))                                                      ;
		const test     = first.findIndex(row => row.includes("TEST"))                                                          ;
		expect([plan < progress, progress < test]                 ).toEqual            ([true, true]) ;
		expect(first.some(row => row.includes("STATUS"))          ).toBe               (false       ) ;
		expect(Math.abs((progress - plan) * 2 - (test - progress))).toBeLessThanOrEqual(2           ) ;
		inputRows = 5;
		const second = frame();
		expect(second.some(row => row.includes("STATUS"))).toBe(false);
		for (const rows of [first, second]) {
			for (const label of ["PLAN", "PROGRESS", "TEST"]) expect(rows.filter(row => row.includes(label))).toHaveLength(1);
		}
		expect(first.every(row => sliceByColumn(row, 65, 1) === "│")).toBe(true);
		expect(second.every(row => sliceByColumn(row, 65, 1) === "│")).toBe(true);
		inputVisible = false;
		const hiddenInput = frame();
		expect(hiddenInput.join("\n")).not.toContain("현재 질문의 로컬 관측");
		viewportHeight = 52;
		const tall         = frame()                                         ;
		const tallPlan     = tall.findIndex(row => row.includes("PLAN"))     ;
		const tallProgress = tall.findIndex(row => row.includes("PROGRESS")) ;
		const tallTest     = tall.findIndex(row => row.includes("TEST"))     ;
		expect(tallProgress - tallPlan                                            ).toBeGreaterThan    (progress - plan) ;
		expect(Math.abs((tallProgress - tallPlan) * 2 - (tallTest - tallProgress))).toBeLessThanOrEqual(2              ) ;
		expect(tall.some(row => row.includes("STATUS"))                           ).toBe               (false          ) ;
	});

	test("keeps the latest tool input card visible without navigation hints", () => {
		const s         = wwwFixture("ready")                                                                  ;
		const workspace = new WwwWorkspace(() => s, () => [], () => 20, Date.now, false, null, new HelpView()) ;
		const root = new VStack([
			{ component: new WwwHeader(() => s, () => "execution", "/test/www"), basis: 2, minSize: 2 },
			{ component: workspace.component, basis: 0, grow: 1, minSize: 1 },
		]);
		const lines        = renderLayoutFrame(root, 120, 24, () => undefined).lines.map(stripTerminalSequences) ;
		expect(lines.join("\n"))    .toContain("Git Bash"     ) ;
		expect(lines.join("\n")).not.toContain("Ctrl+G 화면"  ) ;
		expect(lines.join("\n")).not.toContain("Ctrl+G 2 Plan") ;
	});

	test("상단 GOAL 배지를 항상 보이고 이해가 끝나면 확정 목표로 바꾼다", () => {
		const level = chalk.level; chalk.level = 3;
		try {
			const s           = wwwFixture("ready")                                                                  ;
			const withoutGoal = new WwwHeader(() => s, () => "Chat", "/repo/99_www", () => 0).render(100).join("\n") ;
			expect(stripTerminalSequences(withoutGoal)).toContain("GOAL  목표 확인 중");
			expect(stripTerminalSequences(withoutGoal)).toContain("LANGUAGE KOREA");
			const englishHeader = stripTerminalSequences(new WwwHeader(() => s, () => "Chat", "/repo/99_www", () => 0, true, () => "en").render(100).join("\n"));
			expect(englishHeader).toContain("LANGUAGE ENGLISH");
			s.sessionGoal = { text: "사용자가 설정한 장기 목표", sourceActivityId: "goal", updatedAt: "2026-09-22" };
			const header = stripTerminalSequences(new WwwHeader(() => s, () => "Chat", "/repo/99_www", () => 0).render(100).join("\n"));
			expect(header).toContain("사용자가 설정한 장기 목표");
			const goalBarEmpty = stripTerminalSequences(new WwwGoalBar(() => ({ ...s, sessionGoal: null })).render(100).join("\n"));
			expect(goalBarEmpty).toContain("GOAL");
			expect(goalBarEmpty).toContain("목표 확인 중");
			const renderedGoalBar = new WwwGoalBar(() => s).render(100).join("\n") ;
			const goalBar         = stripTerminalSequences(renderedGoalBar)        ;
			expect(goalBar                                                           )    .toContain      ("GOAL"                       ) ;
			expect(goalBar                                                           )    .toContain      ("사용자가 설정한 장기 목표"  ) ;
			expect(new Set(renderedGoalBar.match(/\u001B\[38;2;\d+;\d+;\d+m/gu)).size)    .toBeGreaterThan(2                            ) ;
			const narrow = stripTerminalSequences(new WwwGoalBar(() => s).render(24).join("\n"));
			expect(narrow).toContain("GOAL");
			const side = stripTerminalSequences(new WwwPlanView(() => s).render(80).join("\n"));
			expect(side).not.toContain("사용자가 설정한 장기 목표");
		} finally { chalk.level = level; }
	});

	test("shows the existing WWW welcome wordmark on the first empty loading screen", () => {
		const s = wwwFixture("loading");
		s.chat       = []                                              ;
		s.activities = []                                              ;
		s.workFlow   = { ...s.workFlow, steps: [], completedCount: 0 } ;
		const view = new WwwTranscriptView(s);
		view.playWelcomeIntro(() => undefined);
		const output = stripTerminalSequences(view.render(80).join("\n"));
		expect(output)    .toContain("██╗"                               ) ;
		expect(output).not.toContain("ORBITING PAIR"                     ) ;
		expect(output).not.toContain("GUARDIAN"                          ) ;
		expect(output)    .toContain("Wooni · Native Project Workbench"  ) ;
		expect(output).not.toContain("실행을 맡기고"                     ) ;
		view.dispose();
	});

	test("Request status uses bounded motion and settles after completion", () => {
		const level = chalk.level; chalk.level = 3;
		try {
			const runningA = requestStatusGradient("running", "running", 0) ;
			const runningB = requestStatusGradient("running", "running", 4) ;
			expect(stripTerminalSequences(runningA)                                                                       )    .toBe("running") ;
			expect(stripTerminalSequences(runningB)                                                                       )    .toBe("running") ;
			expect(runningA                                                                                               ).not.toBe(runningB ) ;
			expect(requestRuntimeMotionActive({ status: "pending", completedAt: null }, 10_000)                           )    .toBe(true     ) ;
			expect(requestRuntimeMotionActive({ status: "running", completedAt: null }, 10_000)                           )    .toBe(true     ) ;
			expect(requestRuntimeMotionActive({ status: "completed", completedAt: new Date(9_500).toISOString() }, 10_000))    .toBe(true     ) ;
			expect(requestRuntimeMotionActive({ status: "completed", completedAt: new Date(8_000).toISOString() }, 10_000))    .toBe(false    ) ;
			expect(requestRuntimeMotionActive({ status: "failed", completedAt: new Date(9_500).toISOString() }, 10_000)   )    .toBe(false    ) ;
		} finally { chalk.level = level; }
	});
	test("Now waits for interpreted activity instead of exposing a Native event", () => {
		expect(wwwNowLabel(wwwFixture())).toBeNull();
		expect(wwwNowLabel(wwwFixture("ready"))).toBeNull();
	});
	test("the Plan rail shows plan progress without individual tool activity", () => {
		const output = stripTerminalSequences(new WwwPlanView(() => wwwFixture()).render(100).join("\n"));
		const stage = output.indexOf("STAGE"), plan = output.indexOf("PLAN"), activity = output.indexOf("PROGRESS");
		expect(stage   )    .toBe                  (-1                        ) ;
		expect(plan    )    .toBeGreaterThanOrEqual(0                         ) ;
		expect(activity)    .toBeGreaterThan       (plan                      ) ;
		expect(output  ).not.toContain             ("NEXT"                    ) ;
		expect(output  ).not.toContain             ("Todo"                    ) ;
		expect(output  ).not.toContain             ("Verify"                  ) ;
		expect(output  ).not.toContain             ("PROPOSAL"                ) ;
		expect(output  ).not.toContain             ("Proposal"                ) ;
		const progress = output.slice(activity);
		expect(progress)    .toContain("정리된 세부 작업이 도착하면 이곳에 표시합니다.") ;
		expect(progress).not.toContain("중복 이벤트 재현 및 경계 수정"                 ) ;
		expect(progress).not.toContain("재개 시나리오를 테스트하는 중"                 ) ;
		expect(progress).not.toContain("Trace"                                         ) ;
	});
	test("an empty plan waits for plan events even while tools are active", () => {
		const s = wwwFixture();
		s.workFlow = { ...s.workFlow, steps: [], source: null, completedCount: 0, currentStepNumber: null };
		const snapshot = { ...s, planActivities: [{ id: "early-progress", turnId: s.activeTurnId!, stepId: "early", stepTitle: "조사", summary: "계획보다 먼저 도착한 경과", status: "running" as const, sequence: 1 }] } ;
		const output   = stripTerminalSequences(new WwwPlanView(() => snapshot).render(100).join("\n"))                                                                                                                   ;
		expect(output)    .toContain("현재 요청에서 전달받은 계획이 없습니다."       ) ;
		expect(output)    .toContain("계획보다 먼저 도착한 경과"                     ) ;
		expect(output).not.toContain("재개 시나리오를 테스트하는 중"                 ) ;
	});
	test("Plan cards show completion and failure while Progress waits for interpreted actions", () => {
		const s = wwwFixture();
		s.workFlow = { ...s.workFlow, steps: s.workFlow.steps.map(step => ({ ...step, status: "completed" as const })) };
		const view      = new WwwPlanView(() => s)                            ;
		const completed = stripTerminalSequences(view.render(100).join("\n")) ;
		expect(completed)    .toContain("3/3"                    ) ;
		expect(completed).not.toContain("╭ 완료"                 ) ;
		expect(completed)    .toContain("재개 시나리오 회귀 검증") ;
		s.workFlow = { ...s.workFlow, steps: s.workFlow.steps.map((step, index) => ({ ...step, status: index === 1 ? "failed" as const : step.status })) };
		const failed = stripTerminalSequences(view.render(100).join("\n"));
		expect(failed.slice(0, failed.indexOf("PROGRESS"))).toContain("! 중복 이벤트");
		expect(failed).not.toContain("재개 시나리오를 테스트하는 중");
	});
	test("the progress highlight moves without implying a percentage, and stops for approval", () => {
		const level = chalk.level; chalk.level = 3;
		try {
			expect(wwwPulse(4)).not.toBe(wwwPulse(8)); expect(visibleWidth(wwwPulse(8))).toBe(12);
			const s = wwwFixture(); let now = Date.parse("2026-09-11T09:42:10.000Z");
			const heading = new WwwExecutionHeading(() => s, () => null, () => now);
			const initial = heading.render(80); now += 240;
			expect(initial[0]).toContain("\u001b[38;2;");
			expect(heading.render(80)[0]).not.toBe(initial[0]); expect(stripTerminalSequences(initial[0]!)).toContain("WORKING");
			expect(stripTerminalSequences(initial[0]!)).toMatch(/1 termina/u); expect(stripTerminalSequences(initial[0]!)).not.toContain("⟦esc 중단⟧");
			expect(stripTerminalSequences(initial[0]!)).not.toContain("%");
			s.pendingApproval = { requestId: 1, callbackId: null, kind: "command", params: {}, refs: {}, availableDecisions: ["accept", "decline"] };
			expect(wwwExecutionIsLive(s)).toBe(false); expect(heading.render(80)).toHaveLength(1);
			s.pendingApproval = null; s.phase = "ready";
			s.activities = [...s.activities,
				{ ...s.activities[1]!, id: "turn-complete", sequence: 99, recordedAt: "2026-09-11T09:42:12.000Z", phase: "completed", payload: { method: "turn/completed" } },
				{ ...s.activities[1]!, id: "child-start", sequence: 100, recordedAt: "2026-09-11T09:42:20.000Z", nativeRefs: { threadId: "child-thread", turnId: "child-turn" }, payload: { method: "turn/started" } },
				{ ...s.activities[1]!, id: "child-complete", sequence: 101, recordedAt: "2026-09-11T09:42:50.000Z", phase: "completed", nativeRefs: { threadId: "child-thread", turnId: "child-turn" }, payload: { method: "turn/completed" } },
			];
			expect(wwwExecutionIsLive(s)).toBe(false);
			const completed = stripTerminalSequences(heading.render(80)[0]!);
			expect(completed).toContain("처리 11s"); expect(completed).not.toContain("⟦esc 중단⟧");
			s.activities = s.activities.map(activity => activity.id === "turn-complete" ? { ...activity, phase: "failed" as const, payload: { method: "turn/failed" } } : activity);
			const failed = stripTerminalSequences(heading.render(80)[0]!);
			expect(failed).toContain("! 실패까지 11s"); expect(failed).not.toContain("✓");
			s.activities = s.activities.map(activity => activity.id === "turn-complete" ? { ...activity, phase: "cancelled" as const, payload: { method: "turn/interrupted" } } : activity);
			const interrupted = stripTerminalSequences(heading.render(80)[0]!);
			expect(interrupted).toContain("− 중단까지 11s"); expect(interrupted).not.toContain("✓");
			s.phase = "working"; s.activeTurnId = null; s.activities = s.activities.filter(activity => activity.id !== "turn-complete" && activity.id !== "child-complete");
			const resumed = stripTerminalSequences(heading.render(80)[0]!);
			expect(resumed).toContain("WORKING (9s ·"); expect(resumed).toMatch(/1 termina/u); expect(resumed).not.toContain("⟦esc 중단⟧"); expect(resumed).not.toContain("시간 관측 대기");
		} finally { chalk.level = level; }
	});
	test("Working states name the current task without a separate interruption row", () => {
		const s       = wwwFixture()                                                                               ;
		const heading = new WwwExecutionHeading(() => s, () => null, () => Date.parse("2026-09-11T09:42:10.000Z")) ;
		const rows    = heading.render(120).map(stripTerminalSequences)                                            ;
		expect(rows.join("\n")).not.toContain("UNDERSTAND · WORK · RESULT 관측"    ) ;
		expect(rows.join("\n")).not.toContain("재개 시나리오를 테스트하는 중"      ) ;
		expect(rows[0]        )    .toContain("WORKING"                            ) ;
		expect(rows.join("\n")).not.toContain("⟦esc 중단⟧"                         ) ;
	});
	test("execution status follows the observed request checkpoint", () => {
		const snapshot = wwwFixture("working")                                                                             ;
		const heading  = new WwwExecutionHeading(() => snapshot, () => null, () => Date.parse("2026-09-11T09:42:10.000Z")) ;
		snapshot.workFlow = { ...snapshot.workFlow, steps: [], source: null };
		snapshot.requestRuntime = [{
			schemaVersion: 1, protocolVersion: 4, requestId: "request", threadId: snapshot.threadId, turnId: snapshot.activeTurnId,
			objective: "상태 확인", status: "running", stages: [], attempt: 1, previousAttempts: [], deliveries: [], requiredDeliveries: [],
			events: [], startedAt: "2026-09-11T09:42:01.000Z", completedAt: null, issues: [], actions: [],
			checkpoints: [{ id: "UNDERSTAND", status: "running", summary: "요청 확인", activityIds: [], observedAt: null }],
		}];
		expect(stripTerminalSequences(heading.render(100)[0]!)).toContain("UNDERSTANDING");
		snapshot.requestRuntime[0]!.checkpoints![0] = { id: "WORK", status: "running", summary: "작업 진행", activityIds: [], observedAt: null };
		expect(stripTerminalSequences(heading.render(100)[0]!)).toContain("WORKING");
		snapshot.requestRuntime[0]!.checkpoints![0] = { id: "RESULT", status: "running", summary: "결과 작성", activityIds: [], observedAt: null };
		expect(stripTerminalSequences(heading.render(100)[0]!)).toContain("REPORTING");
		snapshot.requestRuntime[0]!.checkpoints![0] = { id: "RESULT", status: "observed", summary: "결과 전달", activityIds: [], observedAt: "2026-09-11T09:42:09.000Z" };
		expect(stripTerminalSequences(heading.render(100)[0]!)).toContain("REPORTING");
		expect(stripTerminalSequences(heading.render(100).join("\n"))).not.toContain("⟦esc 중단⟧");
	});
	test("durations use whole h m s units without milliseconds", () => {
		expect(duration(240      )).toBe("0s"      ) ;
		expect(duration(12_900   )).toBe("12s"     ) ;
		expect(duration(65_900   )).toBe("1m 5s"   ) ;
		expect(duration(3_665_900)).toBe("1h 1m 5s") ;
		for (const value of [duration(240), duration(12_900), duration(65_900), duration(3_665_900)]) expect(value).not.toMatch(/\.|ms/u);
	});
	test("the actual editor keeps its text coordinates and bottom boundary on focus changes", () => {
		const tui = new TuiAltScreen(new ProcessTerminal()), editor = new Editor(tui, wwwEditorTheme, { paddingX: 2 });
		editor.setText("보존할 입력"); editor.focused = true;
		const snapshot = wwwFixture("ready")                             ;
		const composer = new WwwComposer(editor, editor, () => snapshot) ;
		const focused  = composer.render(80)                             ;
		expect(stripTerminalSequences(focused[0]!       ))    .toMatch  (/^╭─ .*─╮$/u                        ) ;
		expect(stripTerminalSequences(focused[1]!       ))    .toMatch  (/^│.*│$/u                           ) ;
		expect(stripTerminalSequences(focused.at(-1)!   ))    .toMatch  (/^╰─+╯$/u                           ) ;
		expect(stripTerminalSequences(focused.join("\n")))    .toContain("보존할 입력"                       ) ;
		expect(stripTerminalSequences(focused[0]!       ))    .toContain("› GPT-5.6-Sol · High · manual mode") ;
		expect(stripTerminalSequences(focused[0]!       )).not.toContain("여기에 작성한다."                  ) ;
		expect(stripTerminalSequences(focused[0]!       ))    .toContain("GPT-5.6-Sol · High"                ) ;
		expect(stripTerminalSequences(focused.at(-1)!   ))    .toMatch  (/─{20}/u                            ) ;
		editor.focused = false; expect(stripTerminalSequences(composer.render(80)[0]!)).toContain("· GPT-5.6-Sol · High · manual mode");
		expect(stripTerminalSequences(composer.render(80)[0]!)          ).not.toContain("여기에 작성한다."  ) ;
		expect(stripTerminalSequences(composer.render(80)[0]!)          )    .toContain("GPT-5.6-Sol · High") ;
		expect(composer.render(40).every(row => visibleWidth(row) <= 40))    .toBe     (true                ) ;
		snapshot.collaborationMode = "plan";
		expect(stripTerminalSequences(composer.render(80)[0]!)).toContain("GPT-5.6-Sol · High · plan mode");
		snapshot.permissionMode = "all";
		expect(stripTerminalSequences(composer.render(80)[0]!)).toContain("GPT-5.6-Sol · High · bypass mode");
		snapshot.model = "claude-sonnet-4-5";
		expect(stripTerminalSequences(composer.render(40)[0]!)).toContain("· High · bypass mode");
	});
	test("shows Queue delivery as an input placeholder while a turn is working", () => {
		const tui = new TuiAltScreen(new ProcessTerminal()), editor = new Editor(tui, wwwEditorTheme, { paddingX: 2 });
		editor.focused = true;
		const output = stripTerminalSequences(new WwwComposer(editor, editor, () => wwwFixture("working")).render(80).join("\n"));
		expect(output).toContain("Queue · Esc 전송");
		expect(output).not.toContain("여기에 작성한다.");
	});
	test("places one live status row immediately above the composer and hides cancel outside a cancellable turn", () => {
		const tui       = new TuiAltScreen(new ProcessTerminal())                                                          ;
		const editor    = new Editor(tui, wwwEditorTheme, { paddingX: 2 })                                                 ;
		const snapshot  = wwwFixture("working")                                                                            ;
		const status    = new WwwExecutionHeading(() => snapshot, undefined, () => Date.parse("2026-09-11T09:42:10.000Z")) ;
		const composer  = new WwwComposer(editor, editor, () => snapshot, () => true, status)                              ;
		const live      = composer.render(80).map(stripTerminalSequences)                                                  ;
		const statusRow = live.findIndex(row => row.includes("WORKING"))                                                   ;
		const inputRow  = live.findIndex(row => row.includes("GPT-5.6-Sol"))                                               ;
		expect(statusRow      )    .toBe     (inputRow - 1               ) ;
		expect(live[statusRow])    .toMatch  (/^[ ][⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏] WORKING/u) ;
		expect(live[statusRow]).not.toContain("⟦esc 중단⟧"               ) ;
		snapshot.phase = "ready";
		snapshot.activeTurnId = null;
		expect(stripTerminalSequences(composer.render(80).join("\n"))).not.toContain("⟦esc 중단⟧");
	});
	test("running Terminal shows bounded live output; finished commands fold and failed output stays open", () => {
		const source = wwwFixture().activities.find(x => x.id === "tool-2")!                                                                                                                  ;
		const live   = { ...source, payload: { params: { item: { command: "git status\nprintf test", aggregatedOutput: Array.from({ length: 20 }, (_, i) => `output-${i}`).join("\n") } } } } ;
		const rows = wwwToolRows(live, 40, false), plain = stripTerminalSequences(rows.join("\n"));
		expect(plain).toContain("▣ Git Bash"); expect(plain).toContain("실행 중"); expect(plain).toContain("$ git status");
		for (let index = 15; index < 20; index += 1) expect(plain).toContain(`output-${index}`);
		expect(plain).not.toContain("output-14"); expect(plain).toContain("최신 5줄"); expect(plain).toContain("Ctrl+E 전체"); expect(rows.every(row => visibleWidth(row) <= 40)).toBe(true);
		const finished = { ...live, phase: "completed" as const };
		expect(wwwToolRows(finished, 40, false)).toHaveLength(1);
		expect(wwwToolRows(finished, 40, true).join("\n")).toContain("output-0");
		const failed      = { ...live, phase: "failed" as const }                             ;
		const failedPlain = stripTerminalSequences(wwwToolRows(failed, 40, false).join("\n")) ;
		expect(failedPlain                                                     )    .toContain("output-19") ;
		expect(failedPlain                                                     ).not.toContain("output-14") ;
		expect(stripTerminalSequences(wwwToolRows(failed, 40, true).join("\n")))    .toContain("output-0" ) ;
	});
	test("scrolled multiline drafts retain focus rails, hidden-line counts and autocomplete coordinates", () => {
		class FixedTerminal extends ProcessTerminal { override get rows(): number { return 24; } }
		const editor = new Editor(new TuiAltScreen(new FixedTerminal()), wwwEditorTheme, { paddingX: 2 });
		editor.setText(Array.from({ length: 40 }, (_, i) => `line ${i}`).join("\n")); editor.focused = true;
		const child = { invalidate: () => editor.invalidate(), render: (width: number) => [...editor.render(width), "AUTOCOMPLETE"] };
		const s = wwwFixture("ready"), composer = new WwwComposer(child, editor, () => s);
		const initial = composer.render(80);
		expect(stripTerminalSequences(initial[0]!)).toContain("› GPT-5.6-Sol · High · manual mode  ↑ 33 more");
		expect(initial.slice(1, -2).every(row => /^│.*│$/u.test(stripTerminalSequences(row)))).toBe(true); expect(initial.at(-1)).toBe("AUTOCOMPLETE");
		expect(stripTerminalSequences(initial.at(-2)!)).toMatch(/^╰─+╯$/u);
		for (let i = 0; i < 39; i++) editor.handleInput("\x1b[A");
		editor.focused = false;
		const top = composer.render(80);
		expect(stripTerminalSequences(top[0]!)                                           )    .toContain("· GPT-5.6-Sol · High") ;
		expect(stripTerminalSequences(top[0]!)                                           ).not.toContain("여기에 작성한다."    ) ;
		expect(stripTerminalSequences(top.at(-2)!)                                       )    .toContain("↓ 33 more"           ) ;
		expect(top.slice(1, -2).every(row => /^│.*│$/u.test(stripTerminalSequences(row))))    .toBe     (true                  ) ;
		expect(composer.render(40).every(row => visibleWidth(row) <= 40)                 )    .toBe     (true                  ) ;
	});
	test("Context dashboard follows the spectrometer layout at wide and compact widths without inventing token slices", () => {
		const s = wwwFixture();
		s.skillInventory = { count: 2, names: ["woo-entry", "woo-code-readability"], sourceRevision: "git:fixture", digest: "a".repeat(64) };
		const wide       = new WwwContextView(() => s).render(120).map(stripTerminalSequences) ;
		const wideOutput = wide.join("\n")                                                     ;
		expect(wideOutput).toContain("Context Dashboard");
		for (const label of ["TOTAL CAPACITY", "USED TOKENS", "FREE SPACE", "COMPRESSION", "LAST RETRIEV", "ACTIVE MODEL", "EFFORT CONFIG"]) expect(wideOutput).toContain(label);
		expect(wideOutput                                 ).toContain("CONTEXT ACCUMULATION SPECTROMETER"   ) ;
		expect(wideOutput                                 ).toContain("LOADED CAPABILITIES & SESSION INPUTS") ;
		expect(wideOutput                                 ).toContain("Skills  2"                           ) ;
		expect(wideOutput                                 ).toContain("woo-entry"                           ) ;
		expect(wideOutput                                 ).toContain("MCP"                                 ) ;
		expect(wideOutput                                 ).toContain("Memory"                              ) ;
		expect(wideOutput                                 ).toContain("token allocation unobserved"         ) ;
		expect(wide.every(row => visibleWidth(row) <= 120)).toBe     (true                                  ) ;
		const compact = new WwwContextView(() => s).render(60).map(stripTerminalSequences);
		expect(compact.join("\n")                           ).toContain("Context Dashboard") ;
		expect(compact.join("\n")                           ).toContain("Free Space"       ) ;
		expect(compact.every(row => visibleWidth(row) <= 60)).toBe     (true               ) ;
	});
	test("Context occupancy cells and label share the whole-window ratio even with stale snapshot percent", () => {
		const snapshot = wwwFixture();
		snapshot.contextUsage = { usedTokens: 100_000, contextWindow: 200_000, percent: 46.8 };
		for (const width of [60, 80, 120]) {
			const rows   = new WwwContextView(() => snapshot).render(width).map(stripTerminalSequences) ;
			const meter  = rows.find(row => row.includes("[■]"))!                                       ;
			const filled = meter.match(/\[■\]/gu)?.length ?? 0                                          ;
			const empty  = meter.match(/\[ \]/gu)?.length ?? 0                                          ;
			expect(Math.abs(filled - empty)                     ).toBeLessThanOrEqual(1                                 ) ;
			expect(rows.join("\n")                              ).toMatch            (/OVERALL CONTEXT OCCUPANCY\s+50%/u) ;
			expect(rows.every(row => visibleWidth(row) <= width)).toBe               (true                              ) ;
		}
	});
	test("Context preserves Figma lower analysis landmarks in an 80-column main pane with the rail visible", () => {
		const snapshot = wwwFixture();
		snapshot.skillInventory = { count: 2, names: ["woo-entry", "woo-code-readability"], sourceRevision: "git:fixture", digest: "b".repeat(64) };
		snapshot.mcpServers = [{ name: "figma", enabled: true, status: "connected", tools: ["get_design_context"] }];
		const mainRows = new WwwContextView(() => snapshot).render(80).map(stripTerminalSequences) ;
		const main     = mainRows.join("\n")                                                       ;
		for (const landmark of [
			"CONTEXT COMPOSITION BREAKDOWN",
			"CONTEXT CHANGE ACTIVITY",
			"CONTEXT DIAGNOSTICS EVENT GRID",
			"SYSTEM DEPENDENCY MAP",
			"CONTEXT INSIGHTS",
			"TOP ITEMS BY SIZE",
			"STATE CHANGE ALERTS",
		]) expect(main).toContain(landmark);
		expect(main                                          )    .toMatch  (/source token shares are not\s+reported/u     ) ;
		expect(main                                          )    .toContain("OVERALL CONTEXT OCCUPANCY"                   ) ;
		expect(main                                          )    .toContain("SOURCE TOKEN ALLOCATION"                     ) ;
		expect(main                                          )    .toContain("Source token allocation unavailable"         ) ;
		expect(main                                          ).not.toMatch  (/(?:SYS|CONV|SKILL|MCP|MEM|WORK|RUNT)[^\n]*░/u) ;
		expect(main                                          ).not.toMatch  (/MCP[^\n]*64%/u                               ) ;
		expect(main                                          )    .toContain("per-item context byte sizes for ranking"     ) ;
		expect(main                                          )    .toContain("No Native context-change event feed"         ) ;
		expect(mainRows.every(row => visibleWidth(row) <= 80))    .toBe     (true                                          ) ;

		const workspace = new WwwWorkspace(() => snapshot, () => []);
		workspace.show("context");
		const frame           = renderLayoutFrame(workspace.component, 120, 100, () => {}) ;
		const workspaceOutput = frame.lines.map(stripTerminalSequences).join("\n")         ;
		for (const railHeading of ["LOADED SKILLS", "MCP SERVERS", "STORAGE METRICS"]) expect(workspaceOutput).toContain(railHeading);
		expect(workspaceOutput                                   ).toContain("[2 UNITS]"                    ) ;
		expect(workspaceOutput                                   ).toContain("ACTIVE"                       ) ;
		expect(workspaceOutput                                   ).toContain("ONLINE"                       ) ;
		expect(workspaceOutput                                   ).toContain("CONTEXT COMPOSITION BREAKDOWN") ;
		expect(frame.lines.every(row => visibleWidth(row) <= 120)).toBe     (true                           ) ;
	});
	test("Cache dashboard renders logical byte distribution and live reuse diagnostics", () => {
		const telemetry = composeCacheTelemetry({
			collectedAt: "2026-09-22T00:00:00.000Z",
			observations: [{ id: "render", entries: 24, logicalBytes: 1024, hits: 9, misses: 1, evictions: 2, latencyMs: 1.5, lastAccessedAt: null }],
		});
		const output = stripTerminalSequences(new WwwCacheView(() => telemetry).render(60).join("\n"));
		expect(output).toContain("Cache Controller");
		expect(output).toContain("AGI Workbench 7 layers");
		for (const label of ["Transcript", "Render", "Context Projection", "Usage Snapshot", "Model Catalog", "Dashboard Data", "Session Read"]) expect(output).toContain(label);
		expect(output).toContain("1.0 KiB"   ) ;
		expect(output).toContain("90%"       ) ;
		expect(output).toContain("unobserved") ;
		for (const label of ["Logical byte distribution", "Hit / Miss & Eviction Trends", "Access Heatmap", "Miss Diagnostics", "Telemetry Flow"]) expect(output).toContain(label);
		expect(output)    .toContain("100% of observed bytes"                                      ) ;
		expect(output)    .toContain("Capacity limit unavailable"                                  ) ;
		expect(output).not.toContain("Occupancy"                                                   ) ;
		expect(output)    .toContain("Cycle trend unavailable"                                     ) ;
		expect(output)    .toContain("Access timestamp buckets are not collected."                 ) ;
		expect(output)    .toContain("TTL, cold-start, invalidation, and upstream causes are not"  ) ;
		expect(output)    .toContain("observed layers → cache telemetry snapshot → Cache dashboard") ;
		const wide = new WwwCacheView(() => telemetry).render(120).map(stripTerminalSequences);
		expect(wide.join("\n")                            ).toContain("CACHE SLICE") ;
		expect(wide.join("\n")                            ).toContain("LAST ACCESS") ;
		expect(wide.every(row => visibleWidth(row) <= 120)).toBe     (true         ) ;
		const compact = new WwwCacheView(() => telemetry).render(60).map(stripTerminalSequences);
		expect(compact.every(row => visibleWidth(row) <= 60)).toBe(true);
		const rail = stripTerminalSequences(new WwwCacheRail(() => telemetry).render(38).join("\n"));
		expect(rail).toContain("6 unobserved"        ) ;
		expect(rail).toContain("Force eviction purge") ;
		expect(rail).toContain("24-hour trend"       ) ;
	});
	test("Context quota details reject non-finite percentages and clamp out-of-range values", () => {
		const usage: UsageSnapshot[] = [{ provider: "openai-codex", state: "ready", fetchedAt: 1, limits: [NaN, Infinity, -5, 120].map((remainingPercent, i) => ({ label: `limit${i}`, remainingPercent, status: "unknown" })) }] ;
		const output                 = stripTerminalSequences(new WwwContextView(() => wwwFixture(), () => usage).render(80).join("\n"))                                                                                          ;
		expect(output).not.toMatch(/NaN|Infinity/u); expect(output).toContain("limit0  —"); expect(output).toContain("limit1  —");
		expect(output).toContain("limit2  0% 남음"); expect(output).toContain("limit3  100% 남음");
	});
	test.each([NaN, Infinity, -5, 120])("Context never exposes invalid percentages: %s", percent => {
		const s = wwwFixture(); s.contextUsage = { ...s.contextUsage!, percent };
		const context = stripTerminalSequences(new WwwContextView(() => s).render(80).join("\n"));
		expect(context).not.toMatch(/NaN|Infinity|-5%|120%/u);
		expect(context).toMatch(/OVERALL CONTEXT OCCUPANCY\s+14%/u);
	});
	test("HUD는 Codex·Claude 잔여량과 Context만 한 줄에 표시한다", () => {
		const now = Date.now();
		const usage: UsageSnapshot[] = [
			{ provider : "openai-codex" , state : "ready" , fetchedAt : now , limits : [{ label: "7 days", remainingPercent: 22, resetsAt: now + 2 * 86_400_000 + 13 * 3_600_000, status: "ok" }] },
			{ provider : "anthropic"    , state : "ready" , fetchedAt : now , limits : [{ label: "7 days", remainingPercent: 32, resetsAt: now + 3 * 86_400_000 + 15 * 3_600_000, status: "ok" }] },
			{ provider : "google"       , state : "ready" , fetchedAt : now , limits : [{ label: "7 days", remainingPercent: 63, status: "ok" }]                                                  },
			{ provider : "zai"          , state : "ready" , fetchedAt : now , limits : [{ label: "7 days", remainingPercent: 74, status: "ok" }]                                                  },
		];
		const snapshot = wwwFixture();
		snapshot.contextUsage = { usedTokens: 62_000, contextWindow: 257_000, percent: 24 };
		const hud  = new WwwHud(() => snapshot, () => usage, false) ;
		const rows = hud.render(80).map(stripTerminalSequences)     ;
		expect(rows   )    .toHaveLength(1                                                                ) ;
		expect(rows[0])    .toContain   ("[ Codex 22% 2d 13h ]  [ Claude 32% 3d 15h ]  [ 24% 62k / 257k ]") ;
		expect(rows[0]).not.toMatch     (/Cache|manual mode|Antigravity|Gemini|Z\.AI/u                    ) ;
		for (const width of [20, 40, 60, 80, 120, 200]) {
			const rendered = hud.render(width);
			expect(rendered).toHaveLength(1);
			expect(visibleWidth(rendered[0]!)).toBeLessThanOrEqual(width);
			if (width === 40) expect(stripTerminalSequences(rendered[0]!)).toContain("Cx22%2d13h  Cl32%3d15h  24%62k/257k");
			if (width === 60) expect(stripTerminalSequences(rendered[0]!)).toContain("Cx22%2d13h  Cl32%3d15h");
		}
		snapshot.hud = { showUsage: false, showContext: true };
		expect(stripTerminalSequences(hud.render(80)[0]!)).toContain("[ 24% 62k / 257k ]");
		expect(stripTerminalSequences(hud.render(80)[0]!)).not.toContain("Codex");
		snapshot.hud = { showUsage: false, showContext: false };
		expect(stripTerminalSequences(hud.render(80)[0]!)).toBe("");
	});
	test("HUD는 주간 한도만 사용하고 5시간 한도는 제외한다", () => {
		const now = Date.now();
		const usage: UsageSnapshot[] = [{ provider: "openai-codex", state: "ready", fetchedAt: now, limits: [
			{ label: "7 days", remainingPercent: 88, resetsAt: now + 7_200_000, status: "ok" },
			{ label: "5 hours", remainingPercent: 42, resetsAt: now + 5_280_000, status: "ok" },
		] }];
		const hud  = new WwwHud(() => wwwFixture(), () => usage, false) ;
		const rows = hud.render(120).map(stripTerminalSequences)        ;
		expect(rows   )    .toHaveLength(1                     ) ;
		expect(rows[0])    .toContain   ("[ Codex 88% 2h 00m ]") ;
		expect(rows[0]).not.toContain   ("42%"                 ) ;
		expect(rows[0])    .toContain   ("[ 14% 28k / 200k ]"  ) ;
		const fiveHourOnly = new WwwHud(() => wwwFixture(), () => [{ ...usage[0]!, limits: [usage[0]!.limits[1]!] }], false);
		expect(stripTerminalSequences(fiveHourOnly.render(120)[0]!)).toContain("[ Codex — ]");
		const expired = new WwwHud(() => wwwFixture(), () => [{ ...usage[0]!, limits: [{ ...usage[0]!.limits[0]!, resetsAt: now - 1 }] }], false);
		expect(stripTerminalSequences(expired.render(120)[0]!)).toContain("[ Codex — ]");
	});
	test("HUD는 Cache와 실행 모드를 표시하지 않는다", () => {
		const snapshot = wwwFixture("ready")                         ;
		const hud      = new WwwHud(() => snapshot, () => [], false) ;
		for (const width of [64, 140]) {
			const rows = hud.render(width).map(stripTerminalSequences);
			expect(rows).toHaveLength(1);
			expect(rows[0]).not.toMatch(/Cache|manual mode|Monitor/u);
		}
	});

	test("HUD는 Render 지표를 표시하지 않는다", () => {
		const snapshot = wwwFixture("ready")                         ;
		const hud      = new WwwHud(() => snapshot, () => [], false) ;
		const rows     = hud.render(140).map(stripTerminalSequences) ;
		expect(rows   )    .toHaveLength(1                          ) ;
		expect(rows[0]).not.toMatch     (/Render|Cache|manual mode/u) ;
		expect(rows[0])    .toContain   ("[ 14% 28k / 200k ]"       ) ;
	});
	test("the live Working status keeps its core intact at narrow widths by dropping tail segments", () => {
		const s       = wwwFixture("working")                                                                      ;
		const heading = new WwwExecutionHeading(() => s, () => null, () => Date.parse("2026-09-11T09:42:10.000Z")) ;
		for (const width of [18, 30, 44, 60, 80, 120]) {
			const row = stripTerminalSequences(heading.render(width)[0]!);
			expect(row                                    )    .toContain          ("WORKING"             ) ;
			expect(row                                    ).not.toMatch            (/Wor…|Worki…|Workin…/u) ;
			expect(visibleWidth(heading.render(width)[0]!))    .toBeLessThanOrEqual(width                 ) ;
		}
	});
	test("Progress rail rows wrap with an explicit continuation marker and keep the body upright", () => {
		const level = chalk.level; chalk.level = 3;
		try {
			const raw  = compactStatusRows("가".repeat(120), "running", 24, 2) ;
			const rows = raw.map(stripTerminalSequences)                       ;
			expect(rows                                      )    .toHaveLength(2          ) ;
			expect(rows[1]!.trimEnd().endsWith("…")          )    .toBe        (true       ) ;
			expect(raw.join("")                              ).not.toContain   ("\u001b[3m") ;
			expect(rows.every(row => visibleWidth(row) <= 24))    .toBe        (true       ) ;
		} finally { chalk.level = level; }
	});
	test("Plan and Progress status rows use text color without status glyphs", () => {
		const level = chalk.level; chalk.level = 3;
		try {
			for (const [status, color] of [["completed", a.success], ["running", a.active], ["failed", a.failure], ["pending", a.muted]] as const) {
				const row = compactStatusRows("작업 항목", status, 24)[0]!;
				expect(row.startsWith(color("작업").split("작업")[0]!)).toBe(true);
				expect(stripTerminalSequences(row).trimEnd()).toBe("작업 항목");
			}
		} finally { chalk.level = level; }
	});
	test("repeated Progress sentences merge into the latest status instead of stacking duplicates", () => {
		const base   = wwwFixture()       ;
		const turnId = base.activeTurnId! ;
		const s: WorkbenchSnapshot = { ...base, planActivities: [
			{ id: "a", turnId, stepId: "step", stepTitle: "검증", summary: "같은 문장의 진행 요약", status: "running", sequence: 1 },
			{ id: "a", turnId, stepId: "step", stepTitle: "검증", summary: "같은 문장의 진행 요약", status: "completed", sequence: 2 },
			{ id: "b", turnId, stepId: "step", stepTitle: "검증", summary: "다음 문장의 진행 요약", status: "running", sequence: 3 },
		] };
		const text = stripTerminalSequences(new WwwPlanView(() => s).render(80).join("\n"));
		expect(text.match(/같은 문장의 진행 요약/gu))    .toHaveLength(1                        ) ;
		expect(text                                 )    .toContain   ("같은 문장의 진행 요약"  ) ;
		expect(text                                 ).not.toContain   ("✓ 같은 문장의 진행 요약") ;
	});
	test("Request and Response labels keep mirrored non-color markers", () => {
		const s          = wwwFixture("ready")                                                     ;
		const transcript = stripTerminalSequences(new WwwTranscriptView(s).render(100).join("\n")) ;
		expect(transcript).toContain("❯ INPUT 1");
		expect(transcript).toContain("❮ OUTPUT 1-1");
	});
	test("Claude와 Z.AI의 주간·5시간 한도를 넓은 HUD에서 모두 표시한다", () => {
		const usage: UsageSnapshot[] = [
			{ provider: "anthropic", state: "ready", fetchedAt: 1, limits: [
				{ label: "Claude 7 Day", remainingPercent: 84, resetsAt: Date.parse("2026-09-17T00:00:00Z"), status: "ok" },
				{ label: "Claude 5 Hour", remainingPercent: 12, resetsAt: Date.parse("2026-09-12T12:30:00Z"), status: "ok" },
			] },
			{ provider: "zai", state: "ready", fetchedAt: 1, limits: [
				{ label: "Z.AI Weekly Credit Quota", remainingPercent: 76, resetsAt: Date.parse("2026-09-17T00:00:00Z"), status: "ok" },
				{ label: "Z.AI 5 Hours Credit Quota", remainingPercent: 98, resetsAt: Date.parse("2026-09-12T12:30:00Z"), status: "ok" },
			] },
		];
		const row = stripTerminalSequences(wwwUsageLine(usage, 240, "gpt-5.6-sol", Date.parse("2026-09-12T09:00:00Z")));
		expect(row)    .toContain("Claude"                       ) ;
		expect(row)    .toContain("7d · 84% · 4d 15h"            ) ;
		expect(row)    .toContain("5h · 12% · 3h 30m"            ) ;
		expect(row)    .toContain("Z.AI"                         ) ;
		expect(row)    .toContain("7d · 76% · 4d 15h"            ) ;
		expect(row)    .toContain("5h · 98% · 3h 30m"            ) ;
		expect(row).not.toMatch  (/구독 잔여|\bleft\b|\breset\b/u) ;
	});
	test("role headings and every provider have stable, distinct visual identities", () => {
		const level = chalk.level; chalk.level = 3;
		try {
			expect(a.caption("보조 정보")).toContain("\x1b[3m");
			const s = wwwFixture("ready");
			s.tnotes     = [{ id: "color-note", title: "요약", summary: "질문 요약 본문", updatedAt: "2026-09-12T00:00:00Z", sourceActivityIds: ["request"] }] ;
			s.activities = [...s.activities, { ...s.activities[0]!, id: "system-info", sequence: 102, payload: { role: "system", text: "시스템 안내" } }]      ;
			s.chat       = [...s.chat, { id: "system-message", activityId: "system-info", role: "system", content: "시스템 안내", status: "completed" }]       ;
			const transcript = new WwwTranscriptView(s).render(80).join("\n");
		for (const label of ["INPUT 1", "OUTPUT 1-1", "Notice", "질문 요약"]) expect(transcript).toContain(label);
		expect(transcript).not.toContain("▰");
		expect(new WwwPlanView(() => s).render(80).join("\n")).toContain("PLAN");
		const answerRow = transcript.split("\n").find(row => stripTerminalSequences(row).includes("기존 이벤트와 재개 이벤트가 같은 경로로 합쳐집니다."));
		expect(answerRow).toContain("\x1b[37m");
		expect(new Set([wwwPalette.request, wwwPalette.response, wwwPalette.tool, wwwPalette.plan, wwwPalette.note, wwwPalette.info]).size).toBe(6);
			const usage = wwwUsageLine([], 80);
			for (const provider of [wwwPalette.codex, wwwPalette.claude, wwwPalette.gemini, wwwPalette.zai]) expect(provider).not.toBe(wwwPalette.secondary);
			expect(usage).toContain("\x1b[");
		for (const name of ["Codex", "Claude", "Antigravity", "Z.AI"]) expect(stripTerminalSequences(wwwUsageLine([], 120))).toContain(name);
		const allReady: UsageSnapshot[] = [
			["openai-codex", 62], ["anthropic", 9], ["google", 83], ["zai", 91],
		].map(([provider, remainingPercent]) => ({ provider: provider as UsageSnapshot["provider"], state: "ready", fetchedAt: 1, limits: [{ label: "7 days", remainingPercent: Number(remainingPercent), status: "ok" }] }));
		const compactUsage = wwwUsageLine(allReady, 120);
		for (const name of ["Codex", "Claude", "Antigravity", "Z.AI"]) expect(stripTerminalSequences(compactUsage)).toContain(name);
		expect(compactUsage).toContain(a.success("62%"));
		expect(compactUsage).toContain(a.failure("9%"));
		} finally { chalk.level = level; }
	});
	test("numbers each assistant response within its preceding Request", () => {
		const s       = wwwFixture("ready")                                                                                                                                                                     ;
		const tail    = s.activities.at(-1)!                                                                                                                                                                    ;
		const message = (id: string, sequence: number, role: "user" | "assistant", text: string) => ({ ...tail, id, sequence, kind: "message" as const, phase: "completed" as const, payload: { role, text } }) ;
		s.activities = [...s.activities, message("answer-followup", 7, "assistant", "첫 요청의 두 번째 응답"), message("request-2", 8, "user", "두 번째 요청"), message("answer-2", 9, "assistant", "두 번째 요청의 응답")];
		s.chat = [...s.chat,
			{ id: "m3", activityId: "answer-followup", role: "assistant", content: "첫 요청의 두 번째 응답", status: "completed" },
			{ id: "m4", activityId: "request-2", role: "user", content: "두 번째 요청", status: "completed" },
			{ id: "m5", activityId: "answer-2", role: "assistant", content: "두 번째 요청의 응답", status: "completed" },
		];
		expect([...wwwConversationLabels(s.chat).values()]).toEqual(["INPUT 1", "OUTPUT 1-1", "OUTPUT 1-2", "INPUT 2", "OUTPUT 2-1"]);
		const transcript = stripTerminalSequences(new WwwTranscriptView(s).render(100).join("\n"));
		for (const label of ["INPUT 1", "OUTPUT 1-1", "OUTPUT 1-2", "INPUT 2", "OUTPUT 2-1"]) expect(transcript).toContain(label);
	});
	test("Plan shows Goal, Native steps, and Progress without a Next layer", () => {
		const s          = wwwFixture("ready")  ;
		const tracedStep = s.workFlow.steps[1]! ;
		s.workFlow = {
			...s.workFlow,
			steps: s.workFlow.steps.map((step, index) => index === 1 ? {
				...step,
				activityIds: ["tool-1"],
				observationCount: 1,
				association: {
					attribution            : "inferred" as const,
					activityIds            : ["tool-1"],
					observationActivityIds : ["answer"],
					sources                : [{ turnId: "preview-turn", startSequence: 3, endSequence: null, activityIds: ["tool-1"], observationActivityIds: ["answer"] }],
				},
			} : step),
			observationCount: s.workFlow.observationCount + 1,
		};
		const planRevision  = { sourceRevisionKeyDigest: "a".repeat(64), activityId: "plan", sequence: 3, sourceDigest: `sha256:${"b".repeat(64)}` } ;
		const rootExecution = { provider: "openai-codex", model: "gpt-5.6-sol", agentId: null, threadId: "preview-thread", runId: "preview-turn" }   ;
		s.todo = {
			version: 1, revision: 1, ownerSessionId: "preview-thread", storyId: null, title: "동기화 Todo", updatedAt: "2026-09-12T00:00:00.000Z",
			source: { kind: "native-plan", threadKeyDigest: "c".repeat(64), turnId: "preview-turn", input: null, planRevision, rootExecution },
			items: s.workFlow.steps.map((step, index) => ({ id: `step-${index}`, content: step.title, status: step.status === "running" ? "in_progress" as const : step.status === "completed" ? "completed" as const : "pending" as const, evidenceIds: [], details: [] })),
		};
		s.requestRuntime = [];
		const projected = stripTerminalSequences(new WwwPlanView(() => s).render(100).join("\n"));
		expect(projected)    .toContain("PLAN"               ) ;
		expect(projected)    .toContain("PROGRESS"           ) ;
		expect(projected).not.toMatch  (/^GOAL(?:\s|$)/mu    ) ;
		expect(projected).not.toContain("NEXT"               ) ;
		expect(projected).not.toContain("Proposal"           ) ;
		expect(projected).not.toContain("Plan 세부"          ) ;
		expect(projected).not.toContain("Todo"               ) ;
		expect(projected).not.toContain("RUNTIME_PLAN"       ) ;
		expect(projected).not.toContain("/trace"             ) ;
		expect(projected).not.toContain("세부 Plan 관측 없음") ;
		s.todo = { ...s.todo, items: [{ id: "manual", content: "수동으로 추가한 후속 작업", status: "pending", evidenceIds: [], details: [] }] };
		s.chatQueue = [{ id: "queued", content: "다음 입력으로 오류 로그도 확인해줘", queuedAt: "2026-09-12T00:00:01.000Z" }];
		const manual = stripTerminalSequences(new WwwPlanView(() => s).render(100).join("\n"));
		expect(manual).not.toContain("다음 입력으로 오류 로그도 확인해줘");
		expect(manual).not.toContain("수동으로 추가한 후속 작업");
	});
	test("the real Plan presentation never substitutes a previous request for the current plan", () => {
		const s = wwwFixture();
		const oldRequest: NonNullable<WorkbenchSnapshot["requestRuntime"]>[number] = {
			schemaVersion: 1, protocolVersion: 2, requestId: "old-request", threadId: s.threadId, turnId: "old-turn",
			objective: "이전 요청", status: "completed", attempt: 1, previousAttempts: [], completedAt: "2026-09-20T01:00:00Z", startedAt: "2026-09-20T00:00:00Z",
			requiredDeliveries: [], deliveries: [], actions: [], issues: [], events: [],
			stages: [{ id: "EXECUTE", status: "completed", goal: "이전 요청 계획", input: [], owner: "orchestrator", model: null, agents: [], tools: [], output: null, evidence: [], decision: null, skipReason: null, startedAt: null, completedAt: null, next: null, evidenceAfterSequence: 0, tasks: [] }],
		};
		s.requestRuntime = [oldRequest];
		const presentation = { motionActive: requestRuntimeMotionActive, rows: requestRuntimeRows };
		for (const compact of [false, true]) for (const width of [24, 100]) {
			const view  = new WwwPlanView(() => s, compact, Date.now, false, presentation) ;
			const rows  = view.render(width)                                               ;
			const plain = stripTerminalSequences(rows.join("\n"))                          ;
			expect(rows.every(row => visibleWidth(row) <= width))    .toBe     (true                           ) ;
			expect(plain                                        )    .toContain("1/3"                          ) ;
			expect(plain                                        ).not.toContain("계획 단계 처리가 끝났습니다." ) ;
			expect(plain                                        ).not.toContain("재개 시나리오를 테스트하는 중") ;
		}
		s.workFlow = { ...s.workFlow, source: null, steps: [] };
		expect(stripTerminalSequences(new WwwPlanView(() => s, false, Date.now, false, presentation).render(100).join("\n"))).toContain("현재 요청에서 전달받은 계획이 없습니다.");
		s.requestRuntime = [{ ...oldRequest, turnId: s.activeTurnId, status: "running", completedAt: null, stages: oldRequest.stages.map(stage => ({ ...stage, status: "running", goal: "현재 계획 단계" })) }];
		const current = stripTerminalSequences(new WwwPlanView(() => s, true, Date.now, false, presentation).render(100).join("\n"));
		expect(current)    .toContain("현재 계획 단계"               ) ;
		expect(current).not.toContain("╭ 진행 중"                    ) ;
		expect(current).not.toContain("재개 시나리오를 테스트하는 중") ;
	});
	test("Runtime Plan 단계가 Native Plan보다 최신이면 완료 진행을 우선 표시한다", () => {
		const s = wwwFixture("ready");
		s.requestRuntime = [{
			requestId: "request-4", protocolVersion: 2, turnId: "preview-turn", status: "completed", attempt: 1, previousAttempts: [], completedAt: null,
			stages: ["understand", "decompose", "ground", "deliver"].map((id, index) => ({ id, status: index < 3 ? "completed" : "running", tasks: [], goal: "", output: null, skipReason: null })),
			requiredDeliveries: [], deliveries: [], actions: [], issues: [],
		}] as unknown as NonNullable<WorkbenchSnapshot["requestRuntime"]>;
		const runtimePresentation = { motionActive: () => false, rows: () => ["RUNTIME_PLAN 3/4"], nowLabel: () => null }                                ;
		const projected           = stripTerminalSequences(new WwwPlanView(() => s, false, Date.now, false, runtimePresentation).render(100).join("\n")) ;
		expect(projected)    .toContain("RUNTIME_PLAN 3/4") ;
		expect(projected).not.toContain("Plan 세부"       ) ;
		expect(projected).not.toContain("/trace"          ) ;
	});
	test("all screen shortcuts work as a prefix sequence without function keys", () => {
		const chosen: string[] = [];
		for (const [key, command] of WWW_VIEWS) { const menu = new WwwViewSwitcher(c => chosen.push(c), () => {}, () => {}); menu.handleInput(key); expect(chosen.at(-1)).toBe(command); }
		let closed = false; const menu = new WwwViewSwitcher(c => chosen.push(c), () => { closed = true; }, () => {});
		menu.handleInput("\x1b"); expect(closed).toBe(true); expect(chosen).toHaveLength(WWW_VIEWS.length);
	});
	test("Workflow 화면은 실제 Request 단계와 Subagent 관측을 표시한다", () => {
		const s = wwwFixture("ready");
		s.requestRuntime = [{ schemaVersion: 1, protocolVersion: 2, requestId: "request-1", threadId: s.threadId, turnId: s.activeTurnId, objective: "Workflow 화면을 만든다", status: "running", attempt: 1, previousAttempts: [], deliveries: [], requiredDeliveries: [], events: [], startedAt: "2026-09-20T00:00:00Z", completedAt: null, issues: [], actions: [], stages: [{ id: "EXECUTE", status: "running", goal: "실제 배선을 연결한다", input: [], owner: "orchestrator", model: null, agents: ["agent-1"], tools: [], output: null, evidence: [], decision: null, skipReason: null, startedAt: null, completedAt: null, next: "VERIFY", evidenceAfterSequence: 0, tasks: [] }] }];
		s.delegation = [{ sourceThreadId: s.threadId ?? "thread", turnId: s.activeTurnId ?? "turn", activityIds: ["agent-activity"], itemIds: ["agent-item"], tasks: [{ ref: "agent-ref", id: "agent-1", attempt: 1, parentId: s.threadId, parentRef: null, role: "reviewer", status: "running", task: "Workflow 결과를 검토한다", model: "gpt-5.6-sol", reasoningEffort: "high", activities: [], result: null }] }];
		const output = stripTerminalSequences(new WwwWorkflowView(() => s).render(100).join("\n"));
		for (const value of ["Workflow", "Workflow 화면을 만든다", "EXECUTE · running", "Subagents", "reviewer", "Workflow 결과를 검토한다"]) expect(output).toContain(value);
	});
	test("Workflow는 넓은 카드와 좁은 행에서 현재 Turn의 7단계와 실제 위임만 투영한다", () => {
		const s = wwwFixture("ready");
		s.activeTurnId = "live-turn";
		const statuses = ["completed", "completed", "completed", "running", "pending", "pending", "pending"] as const;
		s.requestRuntime = [{
			schemaVersion: 1, protocolVersion: 2, requestId: "current-request", threadId: s.threadId, turnId: s.activeTurnId,
			objective: "현재 Request의 실제 실행", status: "running", attempt: 2, previousAttempts: [], deliveries: [], requiredDeliveries: [], events: [], startedAt: "2026-09-22T00:00:00Z", completedAt: null, issues: [], actions: [],
			stages: ["UNDERSTAND", "DECOMPOSE", "GROUND", "DECIDE", "EXECUTE", "VERIFY", "DELIVER"].map((id, index) => ({ id, status: statuses[index]!, goal: `${id} 근거`, input: [], owner: "orchestrator", model: null, agents: [], tools: [], output: null, evidence: [], decision: null, skipReason: null, startedAt: null, completedAt: null, next: null, evidenceAfterSequence: 0, tasks: [] })),
		}] as unknown as NonNullable<WorkbenchSnapshot["requestRuntime"]>;
		s.delegation = [{ sourceThreadId: s.threadId ?? "thread", turnId: s.activeTurnId ?? "turn", activityIds: ["a"], itemIds: ["i"], tasks: [{ ref: "worker-ref", id: "worker-1", attempt: 1, parentId: s.threadId, parentRef: null, role: "verifier", status: "running", task: "실제 검증 실행", model: "gpt-5.6-sol", reasoningEffort: "high", activities: [], result: null }] }];
		const view      = new WwwWorkflowView(() => s) ;
		const wide      = view.render(120)             ;
		const compact   = view.render(52)              ;
		const railWidth = view.render(80)              ;
		for (const rows of [wide, compact]) expect(rows.every(row => visibleWidth(row) <= (rows === wide ? 120 : 52))).toBe(true);
		const wideText    = stripTerminalSequences(wide.join("\n")   ) ;
		const compactText = stripTerminalSequences(compact.join("\n")) ;
		for (const text of [wideText, compactText]) for (const value of ["UNDERSTAND · completed", "DELIVER · pending", "verifier", "실제 검증 실행"]) expect(text).toContain(value);
		expect(wideText).toContain("7-STAGE REQUEST");
		expect(compactText).toContain("Goal");
		const railText = stripTerminalSequences(railWidth.join("\n"));
		for (const landmark of ["Subagents · delegation relationship tree", "Parallel execution pipeline", "Active work queue & retry counts", "Subagent state matrix", "State change event log"]) expect(railText).toContain(landmark);
		expect(railText).toContain("unavailable");
		expect(railWidth.every(row => visibleWidth(row) <= 80)).toBe(true);

		const workspace = new WwwWorkspace(() => s, () => []);
		workspace.show("workflow");
		const workspaceFrame = renderLayoutFrame(workspace.component, 120, 100, () => {}).lines ;
		const workspaceText  = stripTerminalSequences(workspaceFrame.join("\n"))                ;
		expect(workspaceText                                        ).toContain("Workflow overview") ;
		expect(workspaceText                                        ).toContain("Active process"   ) ;
		expect(workspaceFrame.every(row => visibleWidth(row) <= 120)).toBe     (true               ) ;

		s.requestRuntime = [{ ...s.requestRuntime![0]!, turnId: "previous-turn", objective: "이전 Request를 보이면 안 된다" }];
		const stale = stripTerminalSequences(view.render(100).join("\n"));
		expect(stale).toContain("현재 Turn에 연결된 Request 관측이 없습니다.");
		expect(stale).not.toContain("이전 Request를 보이면 안 된다");
	});
	test("question summaries live inside ZChat rather than a separate slash screen", () => {
		const summary = [
			"REPORT: request-report-v3\n제목:\n대시보드 표시 문제 해결",
			"요청 목적·접근:\n시작 경로와 요구의 충돌을 확인하고 표시 경계를 정리했습니다.",
			"주요 작업:\n시작 화면 조립과 회귀 테스트를 변경했습니다.",
			"장시간·차단 작업:\n초기 렌더 경로가 나뉘어 원인 확인에 시간이 걸렸습니다.",
			"잘된 점:\n표시 계약과 검증을 함께 갱신했습니다.",
			"모델·토큰:\ngpt-5.6-sol · 관측 토큰 12,000",
			"업무 자체평가:\n요청 범위를 충족했고 실패한 검증 한 건은 명확히 남겼습니다.",
			"다음 유사 요청:\n렌더 진입점과 fixture를 먼저 대조해 조사 범위를 줄입니다.",
			"변경 상태:\n코드와 문서를 동기화했고 GitHub와 Linear는 변경하지 않았습니다.",
			"Commit·Evidence:\nCommit 관측 없음 · Evidence request",
		].join("\n\n") + "\nTest:\nTotal 1/2\n01. bun test test/www-ui.test.ts : 1.2s · passed\n02. bun test test/project-workbench.test.ts : 0.8s · failed";
		const s = wwwFixture("ready"); s.tnotes = [{ id: "n1", title: "대시보드 표시 문제 해결", summary, updatedAt: "2026-09-11T00:00:00Z", sourceActivityIds: ["request"] }];
		const workspace = new WwwWorkspace(() => s, () => [])            ;
		const full      = new WwwTranscriptView(s).render(80).join("\n") ;
		const markdown  = wwwTNoteMarkdown(s.tnotes[0]!)                 ;
		expect(markdown).toContain("## 대시보드 표시 문제 해결"); expect(markdown).not.toContain("### 질문"); expect(markdown).toContain("### 장시간·차단 작업"); expect(markdown).toContain("### 모델·토큰"); expect(markdown).toContain("### 업무 자체평가"); expect(markdown).toContain("### Commit·Evidence");
		expect(full).toContain("대시보드 표시 문제 해결"); expect(full).not.toContain("질문"); expect(full).not.toContain("Expected outcome"); expect(full).not.toContain("PROPOSAL"); expect(full).toContain("REPORT"); expect(full).not.toContain("NEXT ACTION"); expect(full).toContain("PARTIAL · TEST 1/2"); expect(full).toContain("요청 목적·접근"); expect(full).toContain("주요 작업"); expect(full).toContain("업무 자체평가"); expect(full).toContain("Test"); expect(full).toContain("Total 1/2"); expect(full).toContain("Evidence 1"); expect(full).toContain("/source request");
		const plan = stripTerminalSequences(new WwwPlanView(() => s).render(80).join("\n"));
		expect(plan).toContain("PLAN"); expect(plan).not.toContain("PROPOSAL"); expect(plan).not.toContain("시작 화면에 로고를 함께 표시하는 방향을 선택했습니다.");
		const plainRows  = stripTerminalSequences(full).split("\n")                   ;
		const report     = plainRows.findIndex(row => row.includes("REPORT"))         ;
		const assessment = plainRows.findIndex(row => row.includes("업무 자체평가"))  ;
		const purpose    = plainRows.findIndex(row => row.includes("요청 목적·접근")) ;
		const footer     = plainRows.findIndex(row => row.includes("Evidence 1"))     ;
		expect(report).toBeGreaterThanOrEqual(0); expect(purpose).toBeGreaterThan(report); expect(assessment).toBeGreaterThan(purpose); expect(footer).toBeGreaterThan(assessment);
		for (const width of [1, 3, 4, 20, 40, 80]) {
			const minimal = { ...s, chat: [], activities: [] };
			for (const row of new WwwTranscriptView(minimal).render(width)) expect(visibleWidth(row)).toBeLessThanOrEqual(width);
		}
		const level = chalk.level; chalk.level = 3;
		try {
			const colored    = new WwwTranscriptView(s).render(80)                                          ;
			const purposeRow = colored.find(row => stripTerminalSequences(row).includes("요청 목적·접근"))! ;
			const changeRow  = colored.find(row => stripTerminalSequences(row).includes("변경 상태"))!      ;
			expect(purposeRow).toContain(a.secondary("요청 목적·접근"));
			expect(changeRow).toContain(a.secondary("변경 상태"));
			for (const label of ["요청 목적·접근", "주요 작업", "업무 자체평가", "변경 상태", "Test"] as const) {
				const row = colored.find(row => stripTerminalSequences(row).includes(label!))!;
				expect(row).toContain(label);
				expect(row).not.toMatch(/\x1b\[(?:3[1-6]|9[0-6])m/u);
			}
		} finally { chalk.level = level; }
		expect(WWW_VIEWS.flat()                                       ).not.toContain("/tnotes") ;
		expect(WWW_COMMANDS.some(command => command.name === "tnotes"))    .toBe     (false    ) ;
		expect(WWW_COMMANDS.some(command => command.name === "output"))    .toBe     (true     ) ;
		expect(WWW_COMMANDS.some(command => command.name === "tnote") )    .toBe     (false    ) ;
	});
	test("legacy three-field Notes remain readable after the report migration", () => {
		const legacy = { id: "legacy", title: "기존 질문", summary: "질문: 기존 질문\n왜: 기존 이유입니다.\n결과: 기존 결과입니다.", updatedAt: "2026-09-01T00:00:00Z", sourceActivityIds: [] };
		expect(wwwTNoteMarkdown(legacy)).toBe("## 기존 질문\n\n## 원인\n\n기존 이유입니다.\n\n## 결과\n\n기존 결과입니다.");
	});
	test("Report remains one Note group after its source Response", () => {
		const s = wwwFixture("ready");
		s.tnotes = [{
			id: "linked-report",
			title: "연결 상태를 확인한다",
			summary: "질문: 연결 상태를 확인한다\nPlan: 연결 경계를 대조했습니다. 원래 관계를 복원합니다.\n과정: Projection을 수정했습니다.\n결론: 같은 종료 보고서로 표시됩니다.\nTest:\nTotal 1/1\n01. bun test : 1s · passed",
			updatedAt: "2026-09-13T00:00:00Z",
			sourceActivityIds: ["request", "answer"],
		}];
		const rendered = new WwwTranscriptView(s).render(100)                                                                       ;
		const rows     = rendered.map(stripTerminalSequences)                                                                       ;
		const response = rows.findIndex(row => row.includes("OUTPUT 1-1"))                                                          ;
		const report   = rows.findIndex(row => row.includes("REPORT"))                                                              ;
		const evidence = rows.findIndex(row => row.startsWith("│") && row.includes("Evidence 2") && row.includes("/source answer")) ;
		const closing  = rows.findIndex((row, index) => index > report && row.trim() === "")                                        ;
		expect([response < report, report < evidence, evidence < closing]                            ).toEqual([true, true, true]) ;
		expect(rows.some(row => row.includes("PROPOSAL"))                                            ).toBe   (false             ) ;
		expect(rows.slice(report, closing).some(row => row.startsWith("├─") || row.startsWith("└─ "))).toBe   (false             ) ;
		const coloredEvidence = rendered[evidence]!;
		expect(coloredEvidence).toContain(a.secondary("Evidence 2"));
		expect(coloredEvidence).toContain(a.active("/source answer"));
	});
	test("Report stays in the execution transcript and an old proposal does not become live Plan", () => {
		const s = wwwFixture("ready");
		s.tnotes = [{
			id: "separated-proposal-report",
			title: "연결 상태를 확인한다",
			summary: "질문: 연결 상태를 확인한다\nPlan: 연결 경계를 대조했습니다. 원래 관계를 복원합니다.\n과정: Projection을 수정했습니다.\n결론: 같은 종료 보고서로 표시됩니다.\nTest:\nTotal 1/1\n01. bun test : 1s · passed",
			updatedAt: "2026-09-13T00:00:00Z",
			sourceActivityIds: ["request", "answer"],
		}];
		const transcript = stripTerminalSequences(new WwwTranscriptView(s).render(100).join("\n")) ;
		const plan       = stripTerminalSequences(new WwwPlanView(() => s).render(100).join("\n")) ;
		expect(transcript).not.toContain("PROPOSAL"               ) ;
		expect(transcript)    .toContain("REPORT"                 ) ;
		expect(plan      )    .toContain("PLAN"                   ) ;
		expect(plan      ).not.toContain("PROPOSAL"               ) ;
		expect(plan      ).not.toContain("원래 관계를 복원합니다.") ;
	});
	test("Report keeps semantic state, long fields, and full source commands readable at every width", () => {
		const source = "source-12345678-1234-1234-1234-123456789abc";
		const report = (id: string, test: string) => ({
			id                : `tnote-12345678-1234-1234-1234-123456789${id}`,
			title             : "긴 실행 결과",
			summary           : `질문: 긴 실행 결과\nPlan: ${"재현한 원인과 관측을 분리해 계획했습니다. ".repeat(6).trim()}\n과정: ${"기존 경로를 확인하고 회귀 테스트와 렌더링 폭을 반복 검증했습니다. ".repeat(6).trim()}\n결론: ${"핵심 결론은 기본 foreground로 유지하며 상태는 헤더에서만 나타냅니다. ".repeat(6).trim()}\nTest:\n${test}`,
			updatedAt         : "2026-09-13T00:00:00Z",
			sourceActivityIds : [source],
		});
		const states = [
			["done", "Total 2/2\n01. bun test : 1s · passed\n02. bun test : 1s · passed", "DONE · TEST 2/2"],
			["partial", "Total 1/2\n01. bun test : 1s · passed\n02. bun test : 1s · failed", "PARTIAL · TEST 1/2"],
			["failed", "Total 0/2\n01. bun test : 1s · failed\n02. bun test : 1s · failed", "FAILED · TEST 0/2"],
			["none", "Total 0/0\n테스트 실행 관측 없음", "NO TEST"],
		] as const;
		for (const [id, test, label] of states) {
			const snapshot = { ...wwwFixture("ready"), activities: [], chat: [], tnotes: [report(id, test)] } ;
			const wide     = stripTerminalSequences(new WwwTranscriptView(snapshot).render(220).join("\n"))   ;
			expect(wide).toContain(label);
			expect(wide).toContain(source);
			for (const width of [20, 40, 80, 120, 220]) {
				const rows = new WwwTranscriptView(snapshot).render(width);
				expect(rows.every(row => visibleWidth(row) <= width)).toBe(true);
			}
		}
	});
	test("activity ticks do not invalidate Www's durable transcript", () => {
		const view     = new WwwTranscriptView(wwwFixture("working")) ;
		const rendered = view.render(80)                              ;
		const before   = view.cacheMetrics()                          ;
		view.syncActivity(null, () => {});
		expect(view.render(80)).toEqual(rendered);
		expect(view.cacheMetrics().exactCountBuilds).toBe(before.exactCountBuilds);
	});
	test("snapshot-only telemetry updates reuse Www's visible transcript", () => {
		const snapshot = wwwFixture("working")           ;
		const view     = new WwwTranscriptView(snapshot) ;
		const rendered = view.render(80)                 ;
		const before   = view.cacheMetrics()             ;
		view.update(projectChatFeature({ ...snapshot, revision: snapshot.revision + 1, contextUsage: { usedTokens: 30_000, contextWindow: 200_000, percent: 15 } }));
		expect(view.render(80)).toEqual(rendered);
		expect(view.cacheMetrics().exactCountBuilds).toBe(before.exactCountBuilds);
	});
	test("copied durable arrays do not rebuild the visible transcript", () => {
		const snapshot = wwwFixture("working")           ;
		const view     = new WwwTranscriptView(snapshot) ;
		const rendered = view.render(80)                 ;
		const before   = view.cacheMetrics()             ;
		view.update(projectChatFeature({
			...snapshot,
			revision   : snapshot.revision + 1,
			activities : [...snapshot.activities],
			chat       : [...snapshot.chat],
			tnotes     : [...snapshot.tnotes],
		}));
		expect(view.render(80)).toEqual(rendered);
		expect(view.cacheMetrics().exactCountBuilds).toBe(before.exactCountBuilds);
	});
	test("native startup telemetry does not leave an empty execution screen", () => {
		const s = wwwFixture("ready");
		s.chat = []; s.activities = s.activities.filter(x => x.kind === "progress");
		expect(new WwwTranscriptView(s).render(80).join("\n")).toContain("실행을 맡기고");
	});
	test("idle Chat and Context stay local without external project metadata", () => {
		const s = wwwFixture("ready"); s.chat = []; s.activities = [];
		const output = new WwwTranscriptView(s).render(80).join("\n");
		expect(output).not.toContain("Linear");
		const context = new WwwContextView(() => s).render(80).join("\n");
		expect(context).toContain("Session");
		expect(context).not.toContain("Project Update");
	});
	test.each([[80, 24], [112, 32], [160, 48], [60, 18], [80, 10]])("keeps execution and controls readable at %i×%i", (width, height) => {
		const s         = wwwFixture()                        ;
		const workspace = new WwwWorkspace(() => s, () => []) ;
		const root = new VStack([
			{ component : new WwwHeader(() => s, () => "execution", "/repo/www") , basis : 2 , minSize : 2               },
			{ component : new WwwExecutionHeading(() => s)                       , basis : 2 , minSize : 2               },
			{ component : workspace.component                                    , basis : 0 , grow    : 1 , minSize : 1 },
			{ component : new WwwHud(() => s)                                    , basis : 2 , minSize : 1 , maxSize : 2 },
		]);
		const frame = renderLayoutFrame(root, width, height, () => {})   ;
		const plain = frame.lines.map(stripTerminalSequences).join("\n") ;
		expect(frame.lines).toHaveLength(height);
		expect(frame.lines.every(row => visibleWidth(row) <= width)).toBe(true);
		expect(plain).toContain("WORKING"); expect(plain).not.toContain("Esc 중단"); expect(plain).not.toMatch(/구독 잔여|\bleft\b|\breset\b/u);
		if (width >= 112) expect(plain).toContain("세션과 이벤트 결합 지점 확인");
		workspace.show("plan");
		const plan = renderLayoutFrame(workspace.component, width, height, () => {}).lines.join("\n");
		expect(plan).toContain("PLAN"); expect(plan).toContain("중복 이벤트");
	});
	test("Cache keeps lower analysis landmarks in the actual 120-column workspace and hides its rail compactly", () => {
		const snapshot  = wwwFixture()                               ;
		const workspace = new WwwWorkspace(() => snapshot, () => []) ;
		workspace.show("cache");
		const frame     = renderLayoutFrame(workspace.component, 120, 60, () => {}) ;
		const cacheWide = stripTerminalSequences(frame.lines.join("\n"))            ;
		expect(cacheWide).toContain("CACHE SLICE"  ) ;
		expect(cacheWide).toContain("LAST AC"      ) ;
		expect(cacheWide).toContain("Cache health" ) ;
		expect(cacheWide).toContain("Cache actions") ;
		const railLine = frame.lines.map(stripTerminalSequences).find(line => line.includes("Cache health"));
		expect(railLine?.indexOf("Cache health")).toBeGreaterThanOrEqual(80);
		expect(frame.lines.every(row => visibleWidth(row) <= 120)).toBe(true);
		workspace.scrolls.cache.scrollBy(200);
		const lowerFrame = renderLayoutFrame(workspace.component, 120, 60, () => {}) ;
		const lower      = stripTerminalSequences(lowerFrame.lines.join("\n"))       ;
		for (const label of ["Logical byte distribution", "Hit / Miss & Eviction Trends", "Access Heatmap", "Miss Diagnostics", "Telemetry Flow"]) expect(lower).toContain(label);
		const compactFrame = renderLayoutFrame(workspace.component, 80, 24, () => {}) ;
		const compact      = stripTerminalSequences(compactFrame.lines.join("\n"))    ;
		expect(compact).not.toContain("Cache health");
		expect(compactFrame.lines.every(row => visibleWidth(row) <= 80)).toBe(true);
	});
	test("Usage shows model use and observation limits in the actual workspace", () => {
		const snapshot = wwwFixture();
		snapshot.sessionUsage = {
			totalTokens         : 1_500,
			observedTotalTokens : 1_500,
			unattributedTokens  : 100,
			models              : [{ model: "gpt-5.6-sol", effort: "high", interactiveRootTurns: 2, interactiveTokens: 1_200, detachedInvocations: 1, detachedTokens: 300, totalTokens: 1_500 }],
			observationCoverage : { interactive: true, detached: true },
		};
		const usage: UsageSnapshot[] = [{ provider: "openai-codex", state: "ready", fetchedAt: 1, limits: [{ label: "7 days", remainingPercent: 62, status: "ok" }] }] ;
		const workspace              = new WwwWorkspace(() => snapshot, () => usage)                                                                                   ;
		workspace.show("usage");
		const frame = renderLayoutFrame(workspace.component, 120, 60, () => {}) ;
		const wide  = stripTerminalSequences(frame.lines.join("\n"))            ;
		for (const label of ["구독 잔여 한도", "62% 남음", "관측 범위"]) expect(wide).toContain(label);
		expect(frame.lines.every(row => visibleWidth(row) <= 120)).toBe(true);
		workspace.scrolls.usage.scrollBy(200);
		const lowerFrame = renderLayoutFrame(workspace.component, 120, 60, () => {}) ;
		const lower      = stripTerminalSequences(lowerFrame.lines.join("\n"))       ;
		// 구독 한도는 첫 화면에, 모델별 사용 내역은 아래 스크롤 영역에 있다.
		expect(lower).toContain("모델별 사용 내역");
		for (const label of ["Provider Load Ratio", "Performance Trend"]) expect(lower).not.toContain(label);
		const compactFrame = renderLayoutFrame(workspace.component, 80, 24, () => {}) ;
		const compact      = stripTerminalSequences(compactFrame.lines.join("\n"))    ;
		expect(compact).toContain("관측 범위");
		expect(compactFrame.lines.every(row => visibleWidth(row) <= 80)).toBe(true);
	});
	test("Dashboard keeps summary, router, proportion, and heatmap panels in the actual 120-column workspace rail split", () => {
		const snapshot = wwwFixture("working");
		const workspace = new WwwWorkspace(
			() => snapshot,
			() => [],
			height => height,
			Date.now,
			false,
			null,
			new WwwDashboardView(() => snapshot),
		);
		workspace.show("dashboard");
		const frame  = renderLayoutFrame(workspace.component, 120, 60, () => {}) ;
		const output = stripTerminalSequences(frame.lines.join("\n"))            ;
		for (const landmark of ["SESSION", "EVENTS", "TOKENS", "CONTEXT", "HEALTH", "SYSTEM MODULE ROUTER", "TOKEN ALLOCATION / PROPORTION", "INPUT / OUTPUT / CACHE", "ACTIVITY HEATMAP", "Session context"]) expect(output).toContain(landmark);
		expect(frame.lines.every(row => visibleWidth(row) <= 120)).toBe(true);
	});
	test("keeps newlines, code, draft and the latest tool visible without raw reasoning", () => {
		const s = { ...wwwFixture(), draft: "검증 결과:\n\n```ts\nconst seen = new Set();\n```", reasoningDraft: "PRIVATE_REASONING_SENTINEL" };
		const view = new WwwTranscriptView(s); view.expanded = true;
		const output = stripTerminalSequences(view.render(80).join("\n"));
		expect(output).toContain("const seen = new Set();"); expect(output).toContain("bun test"); expect(output).toContain("새 이벤트 한 번만 표시");
		expect(output).not.toContain("PRIVATE_REASONING_SENTINEL");
	});
	test("summarizes consecutive tool calls and retains their source cards", () => {
		const snapshot = wwwFixture("ready")                                             ;
		const tool     = snapshot.activities.find(activity => activity.id === "tool-2")! ;
		const additional = ["rg -n narrator src", "sed -n '1,90p' src/core/narrator.ts"].map((command, index) => ({
			...tool, id: `investigate-${index}`, sequence: tool.sequence + index + 1,
			nativeRefs: { ...tool.nativeRefs, itemId: `investigate-${index}` },
			payload: { method: "item/completed", params: { item: { type: "commandExecution", command, exitCode: 0 } } },
		}));
		snapshot.activities = [...snapshot.activities, ...additional];
		const view   = new WwwTranscriptView({ ...snapshot, toolActions: additional.map((item, index) => ({ id: `${item.nativeRefs.turnId}:${item.nativeRefs.itemId}`, turnId: item.nativeRefs.turnId!, stepId: "chat-tool-action", stepTitle: "Chat 도구 행동", summary: index === 0 ? "narrator 관련 정의를 확인합니다." : "narrator 구현의 앞부분을 읽습니다.", status: "completed" as const, sequence: item.sequence })) }) ;
		const folded = stripTerminalSequences(view.render(100).join("\n"))                                                                                                                                                                                                                                                                                                                                                      ;
		expect(folded)    .toContain("sequence를 기준으로 중복을 확인하고, 연결 경계") ;
		expect(folded)    .toContain("를 좁히겠습니다."                              ) ;
		expect(folded).not.toContain("도구 작업\n3건"                                ) ;
		expect(folded)    .toContain("✓ narrator 관련 정의를 확인합니다."            ) ;
		expect(folded)    .toContain("✓ narrator 구현의 앞부분을 읽습니다."          ) ;
		expect(folded)    .toContain("rg -n narrator src"                            ) ;
		expect(folded)    .toContain("Git Bash"                                      ) ;
		expect(folded)    .toContain("sed -n '1,90p' src/core/narrator.ts"           ) ;
		expect(folded)    .toContain("경로 · src/core/narrator.ts"                   ) ;
		expect(folded).not.toContain("exit 0"                                        ) ;
		view.expanded = true;
		const open = stripTerminalSequences(view.render(100).join("\n"));
		expect(open)    .toContain("rg -n narrator src"                 ) ;
		expect(open)    .toContain("sed -n '1,90p' src/core/narrator.ts") ;
		expect(open).not.toContain(`/source ${additional[0]!.id}`       ) ;
	});

	test("Git Bash 명령과 관측 출력은 한 카드 안에 보이고 source 행은 숨긴다", () => {
		const level = chalk.level;
		chalk.level = 3;
		try {
			const snapshot = wwwFixture("ready")                                             ;
			const source   = snapshot.activities.find(activity => activity.id === "tool-2")! ;
			const completed = { ...source, id: "green-command", phase: "completed" as const,
				payload: { method: "item/completed", params: { item: { type: "commandExecution", command: "git status", exitCode: 0, aggregatedOutput: "clean tree" } } } };
			snapshot.activities = [...snapshot.activities, completed];
			const rendered = new WwwTranscriptView(snapshot).render(100).join("\n") ;
			const plain    = stripTerminalSequences(rendered)                       ;
			expect(plain   )    .toContain("Git Bash"                                                                     ) ;
			expect(plain   )    .toContain("$ git status"                                                                 ) ;
			expect(plain   )    .toContain("├─── Output"                                                                  ) ;
			expect(plain   )    .toContain("clean tree"                                                                   ) ;
			expect(plain   )    .toMatch  (/┌─── ▣ Git Bash[^\n]*\n(?:[^└]*\n)*?├─── Output[^\n]*\n│ clean tree[^\n]*\n└/u) ;
			expect(plain   ).not.toContain("/source green-command"                                                        ) ;
			expect(rendered)    .toContain(a.tool("┌─── ▣ Git Bash").replace(/\x1b\[39m$/u, "")                           ) ;
		} finally { chalk.level = level; }
	});
	test("recognized Git Bash command receives an immediate description above its input card", () => {
		const snapshot = wwwFixture("ready")                                             ;
		const source   = snapshot.activities.find(activity => activity.id === "tool-2")! ;
		snapshot.activities = [...snapshot.activities, { ...source, id: "status-command", sequence: source.sequence + 1, nativeRefs: { ...source.nativeRefs, itemId: "status-command" }, payload: { method: "item/completed", params: { item: { type: "commandExecution", command: "git status", exitCode: 0 } } } }];
		const output = stripTerminalSequences(new WwwTranscriptView(snapshot).render(100).join("\n"));
		expect(output.indexOf("텍스트·파일 검색: -n 'resume|sequence' src/core")).toBeLessThan(output.indexOf("$ rg -n 'resume|sequence' src/core"));
		expect(output.indexOf("Git 명령 실행: status")).toBeLessThan(output.indexOf("$ git status"));
	});
	test("shows a command label without inventing purpose from tool action summaries", () => {
		const snapshot = wwwFixture("ready")                                 ;
		const view     = new WwwTranscriptView(snapshot)                     ;
		const before   = stripTerminalSequences(view.render(100).join("\n")) ;
		expect(before)    .toContain("텍스트·파일 검색: -n 'resume|sequence' src/core") ;
		expect(before).not.toContain("파일 내용 검색"                                 ) ;
		expect(before)    .toContain("Git Bash"                                       ) ;
		expect(before).not.toContain("파일 내용 검색"                                 ) ;
		const source = snapshot.activities.find(activity => activity.id === "tool-2")!;
		view.update({ ...snapshot, toolActions: [{ id: `${source.nativeRefs.turnId}:${source.nativeRefs.itemId}`, turnId: source.nativeRefs.turnId!, stepId: "chat-tool-action", stepTitle: "Chat 도구 행동", summary: "AI가 테스트 명령의 대상을 설명합니다.", status: "completed", sequence: source.sequence }] });
		expect(stripTerminalSequences(view.render(100).join("\n"))).not.toContain("AI가 테스트 명령의 대상을 설명합니다.");
	});
	test("keeps a failed call visible inside a collapsed tool group", () => {
		const snapshot = wwwFixture("ready")                                             ;
		const source   = snapshot.activities.find(activity => activity.id === "tool-2")! ;
		snapshot.activities = [...snapshot.activities, {
			...source, id: "failed-check", phase: "failed", sequence: source.sequence + 1,
			nativeRefs: { ...source.nativeRefs, itemId: "failed-check" },
			payload: { method: "item/completed", params: { item: { type: "commandExecution", command: "bun test failing", exitCode: 1, aggregatedOutput: "BROKEN_CASE" } } },
		}];
		const withActions = { ...snapshot, toolActions: snapshot.activities.filter(activity => activity.kind === "tool").map(activity => ({ id: `${activity.nativeRefs.turnId}:${activity.nativeRefs.itemId}`, turnId: activity.nativeRefs.turnId!, stepId: "chat-tool-action", stepTitle: "Chat 도구 행동", summary: "입력 처리 테스트를 실행합니다.", status: activity.phase === "failed" ? "failed" as const : "completed" as const, sequence: activity.sequence })) } ;
		const output      = stripTerminalSequences(new WwwTranscriptView(withActions).render(100).join("\n"))                                                                                                                                                                                                                                                                                                                                                             ;
		expect(output)    .toContain("2건 · 실패 1건"                  ) ;
		expect(output)    .toContain("✓ 입력 처리 테스트를 실행합니다.") ;
		expect(output)    .toContain("! 입력 처리 테스트를 실행합니다.") ;
		expect(output)    .toContain("bun test failing"                ) ;
		expect(output).not.toContain("exit 0"                          ) ;
		expect(output)    .toContain("BROKEN_CASE"                     ) ;
		const expanded = new WwwTranscriptView(withActions); expanded.expanded = true;
		expect(stripTerminalSequences(expanded.render(100).join("\n"))).toContain("BROKEN_CASE");
	});

	test("summarizes every zsh command while retaining completed Terminal cards", () => {
		const snapshot = wwwFixture("ready")                                             ;
		const source   = snapshot.activities.find(activity => activity.id === "tool-2")! ;
		const commands = [
			{ command: '/bin/zsh -lcr "pwd"', exitCode: 0 },
			{ command: '/bin/zsh -lcr "rg -n missing src"', exitCode: 1 },
		];
		snapshot.activities = [...snapshot.activities, ...commands.map((item, index) => ({
			...source, id: `zsh-${index}`, sequence: source.sequence + index + 1,
			nativeRefs: { ...source.nativeRefs, itemId: `zsh-${index}` },
			payload: { method: "item/completed", params: { item: { type: "commandExecution", ...item } } },
		}))];
		const withActions = { ...snapshot, toolActions: commands.map((item, index) => ({ id: `${source.nativeRefs.turnId}:zsh-${index}`, turnId: source.nativeRefs.turnId!, stepId: "chat-tool-action", stepTitle: "Chat 도구 행동", summary: index === 0 ? "현재 디렉터리를 확인합니다." : "src에서 누락된 정의를 검색합니다.", status: item.exitCode === 0 ? "completed" as const : "failed" as const, sequence: source.sequence + index + 1 })) } ;
		const output      = stripTerminalSequences(new WwwTranscriptView(withActions).render(100).join("\n"))                                                                                                                                                                                                                                                                                                                                        ;
		expect(output)    .toContain("✓ 현재 디렉터리를 확인합니다."      ) ;
		expect(output)    .toContain("! src에서 누락된 정의를 검색합니다.") ;
		expect(output)    .toContain("rg -n missing src"                  ) ;
		expect(output)    .toContain('/bin/zsh -lcr "pwd"'                ) ;
		expect(output).not.toContain("exit 0"                             ) ;
	});

	test("shows a file listing as one Korean tool summary", () => {
		const snapshot = wwwFixture("ready")                                             ;
		const source   = snapshot.activities.find(activity => activity.id === "tool-2")! ;
		snapshot.activities = [...snapshot.activities, {
			...source, id: "file-list", sequence: source.sequence + 1,
			nativeRefs: { ...source.nativeRefs, itemId: "file-list" },
			payload: { method: "item/completed", params: { item: { type: "commandExecution", command: "rg --files .www/evidence/2026-09-28-slash-command-palette", exitCode: 0 } } },
		}];
		const withActions = { ...snapshot, toolActions: [{ id: `${source.nativeRefs.turnId}:file-list`, turnId: source.nativeRefs.turnId!, stepId: "chat-tool-action", stepTitle: "Chat 도구 행동", summary: "증거 폴더의 파일을 나열합니다.", status: "completed" as const, sequence: source.sequence + 1 }] } ;
		const previous    = chalk.level                                                                                                                                                                                                                                                                         ;
		chalk.level = 3;
		try {
			const output = new WwwTranscriptView(withActions).render(100).join("\n");
			expect(stripTerminalSequences(output)).toContain("✓ 증거 폴더의 파일을 나열합니다."                       ) ;
			expect(stripTerminalSequences(output)).toContain("rg --files"                                             ) ;
			expect(output                        ).toMatch  (/\x1b\[38;2;\d+;\d+;\d+m✓ 증거 폴더의 파일을 나열합니다/u) ;
		} finally { chalk.level = previous; }
	});

	test("keeps tool summaries in durable order around the draft response", () => {
		const snapshot = { ...wwwFixture("working"), draft: "지금 확인 중입니다.", draftAnchorSequence: 5 } ;
		const output   = stripTerminalSequences(new WwwTranscriptView(snapshot).render(100).join("\n"))     ;
		const draft    = output.indexOf("OUTPUT 1-2 작성 중")                                               ;
		expect(draft                          ).toBeGreaterThan(-1   ) ;
		expect(output.indexOf("도구 작업")    ).toBeLessThan   (draft) ;
		expect(output.lastIndexOf("도구 작업")).toBeGreaterThan(draft) ;
		expect(output.match(/도구 작업/gu)    ).toHaveLength   (2    ) ;
	});
	test("does not add a separate Thought row for a public reasoning summary", () => {
		const s      = { ...wwwFixture(), reasoningSummaryDraft: "공개 판단 요약", reasoningDraft: "PRIVATE_REASONING_SENTINEL", draft: "" } ;
		const rows   = new WwwTranscriptView(s).render(80)                                                                                   ;
		const output = stripTerminalSequences(rows.join("\n"))                                                                               ;

		expect(output                                    )    .not.toContain("◉ Thought"                 ) ;
		expect(output                                    ).not    .toContain("공개 판단 요약"            ) ;
		expect(output                                    ).not    .toContain("PRIVATE_REASONING_SENTINEL") ;
		expect(rows.every(row => visibleWidth(row) <= 80))        .toBe     (true                        ) ;
	});
	test("preserves reading position across streaming and resize, then follows on End", () => {
		let s = wwwFixture();
		s = { ...s, chat: Array.from({ length: 40 }, (_, i) => ({ ...s.chat[0]!, id: `m${i}`, activityId: `a${i}`, content: `request ${i}\n두 번째 행`, role: "user" })) };
		s.activities = [...s.activities, ...s.chat.map((message, i) => ({ ...s.activities[0]!, id: message.activityId, sequence: 100 + i, payload: { role: "user", text: message.content } }))];
		const workspace = new WwwWorkspace(() => s, () => []), scroll = workspace.scrolls.execution;
		renderLayoutFrame(workspace.component, 120, 20, () => {});
		scroll.scrollBy(-15); const previous = scroll.scrollTop;
		s = { ...s, draft: "new streaming response" }; workspace.transcript.update(s);
		renderLayoutFrame(workspace.component, 120, 20, () => {});
		expect(scroll.scrollTop).toBe(previous); expect(scroll.isFollowingEnd).toBe(false);
		renderLayoutFrame(workspace.component, 80, 18, () => {}); expect(scroll.isFollowingEnd).toBe(false);
		scroll.scrollToEnd(); expect(scroll.isFollowingEnd).toBe(true);
	});
	test("durable messages require activity order while optimistic user delivery remains visible", () => {
		const s = wwwFixture();
		s.chat = [...s.chat, { id: "orphan", activityId: "missing", role: "assistant", content: "UNORDERED_ASSISTANT", status: "completed" }, { id: "optimistic", activityId: "not-recorded", role: "user", content: "PENDING_REQUEST", status: "streaming" }];
		const output = new WwwTranscriptView(s).render(80).join("\n");
		expect(output).not.toContain("UNORDERED_ASSISTANT"); expect(output).toContain("PENDING_REQUEST");
	});
	test("approval outranks running state, and no unobserved metric becomes zero", () => {
		const s = wwwFixture(); s.pendingApproval = { requestId: 1, callbackId: null, kind: "command", params: { command: "git status" }, refs: {}, availableDecisions: ["accept", "decline"] };
		expect(executionHeading(s).state).toBe("승인 대기");
		const stats = new WwwStatsView(() => projectSessionStats(s), () => "session", () => null).render(80).join("\n");
		expect(stripTerminalSequences(stats)).toMatch(/관측 토큰\s+—/u);
	});
	test("a completed command with nonzero exit remains a visible failure even when output is collapsed", () => {
		const activity = wwwFixture().activities.find(x => x.id === "tool-1")!                                                                        ;
		const failed   = { ...activity, payload: { params: { item: { command: "bun test", exitCode: 1, aggregatedOutput: "REGRESSION_FAILURE" } } } } ;
		const output   = stripTerminalSequences(wwwToolRows(failed, 80, false).join("\n"))                                                            ;
		expect(output).toContain("▣ Git Bash"); expect(output).toContain("! bun test"); expect(output).toContain("exit 1"); expect(output).toContain("REGRESSION_FAILURE"); expect(output).toContain("Output"); expect(output).not.toContain("/source tool-1");
	});
	test("searching commands does not execute them and includes retained workflows", () => {
		for (const name of ["dashboard", "history", "usage"]) {
			expect(WWW_COMMANDS.some(command => command.name === name)).toBe(true);
		}
		expect(WWW_COMMANDS.some(command => command.name === "cache" || command.name === "context")).toBe(false);
		const chosen: string[] = []; const palette = new WwwCommandPalette(c => chosen.push(c), () => {}, () => {});
		palette.handleInput("workflow"); expect(chosen).toHaveLength(0);
		expect(palette.render(70).join("\n")).toContain("/workflow");
		palette.handleInput("\r"); expect(chosen).toEqual(["/workflow "]);
	});
	test("a small colourless palette follows the selected command rather than the search prompt", () => {
		const palette  = new WwwCommandPalette(() => {}, () => {}, () => {})                                                                                                                                ;
		const noColour = { invalidate: () => palette.invalidate(), handleInput: (data: string) => palette.handleInput(data), render: (width: number) => palette.render(width).map(stripTerminalSequences) } ;
		const sheet    = new WwwSheet(noColour, () => 11)                                                                                                                                                   ;
		sheet.render(68);
		for (let i = 0; i < 6; i++) { sheet.handleInput("\x1b[B"); sheet.render(68); }
		const output = stripTerminalSequences(sheet.render(68).join("\n"));
		expect(output).toContain("› /dashboard");
	});
	test("Www resume selection uses its own presentation without changing selected Native identity", () => {
		let chosen   = ""                                                                                                                                                         ;
		const picker = new NativeThreadPicker([{ id: "native-1", cwd: "/www", preview: "continue task", updatedAt: 1, status: "idle" }], id => { chosen = id; }, () => {}, "www") ;
		const rows   = picker.render(80)                                                                                                                                          ;
		expect(stripTerminalSequences(rows.join("\n"))).toContain("www / resume");
		expect(rows.every(row => visibleWidth(row) <= 80)).toBe(true);
		picker.handleInput("\r"); expect(chosen).toBe("native-1");
	});
	test("long approval sheets expose choices through paging without deciding on Escape", () => {
		let resolved = false, closed = false;
		const overlay = new ApprovalOverlay({ requestId: 3, callbackId: null, kind: "command", params: { command: "printf test", reason: "긴 설명 ".repeat(100) }, refs: {}, availableDecisions: ["accept", "decline"] }, () => {}, () => { resolved = true; }, () => { closed = true; }, wwwColors) ;
		const sheet   = new WwwSheet(overlay, () => 15)                                                                                                                                                                                                                                              ;
		for (let i = 0; i < 10; i++) { sheet.render(60); sheet.handleInput("\u001b[6~"); }
		expect(stripTerminalSequences(sheet.render(60).join("\n"))).toContain("거절");
		sheet.handleInput("\u001b"); expect(closed).toBe(true); expect(resolved).toBe(false);
	});
	test("moving approval selection reveals the action without hiding details on initial open", () => {
		const overlay = new ApprovalOverlay({ requestId: 3, callbackId: null, kind: "command", params: { command: "printf test", reason: "긴 설명 ".repeat(100) }, refs: {}, availableDecisions: ["accept", "decline"] }, () => {}, () => {}, () => {}, wwwColors) ;
		const sheet   = new WwwSheet(overlay, () => 15)                                                                                                                                                                                                            ;
		const first   = stripTerminalSequences(sheet.render(60).join("\n"))                                                                                                                                                                                        ;
		expect(first).toContain("printf test"); expect(first).toContain("▸ 1. 승인"); expect(first).toContain("2. 거절");
		sheet.handleInput("\x1b[B");
		expect(stripTerminalSequences(sheet.render(60).join("\n"))).toContain("▸ 2. 거절");
	});
	test("pinned controls never skip candidate lines during paging", () => {
		const body = Array.from({ length: 60 }, (_, i) => `candidate-${i}`), actions = ["▸ 1. 승인", "  2. 거절", "Enter 결정 / Esc 보류"];
		const sheet = new WwwSheet({ invalidate() {}, render: () => [...body, ...actions], renderActions: () => actions }, () => 19) ;
		const seen  = new Set<string>()                                                                                              ;
		for (let page = 0; page < 20; page++) {
			const rows = sheet.render(72); expect(rows.length).toBeLessThanOrEqual(19);
			const output = stripTerminalSequences(rows.join("\n")); expect(output).toContain("▸ 1. 승인");
			for (const match of output.matchAll(/candidate-\d+/gu)) seen.add(match[0]);
			sheet.handleInput("\x1b[6~");
		}
		expect(seen.size).toBe(60);
	});
	test("an active auth prompt is revealed without preventing manual paging back to its explanation", () => {
		const sheet = new WwwSheet({ invalidate() {}, render: () => ["explanation-start", ...Array(25).fill("OAuth instructions"), "> 입력 중…"] }, () => 19, { followPrompt: true });
		expect(stripTerminalSequences(sheet.render(72).join("\n"))).toContain("> 입력 중…");
		for (let i = 0; i < 5; i++) sheet.handleInput("\x1b[5~");
		expect(sheet.render(72).join("\n")).toContain("explanation-start");
	});
	test("one turn finishing never claims the long-term goal is complete", () => {
		const s = wwwFixture("ready");
		s.sessionGoal  = { text: "장기 리팩터링 목표", sourceActivityId: "goal", updatedAt: "2026-09-11" }                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              ;
		s.executionRun = { runId: "run", threadId: "preview-thread", turnId: "preview-turn", phase: "completed", waitReason: null, objective: "한 단계", tasks: [], activeActivity: null, evidence: [], activities: [], lastSequence: 9, checkpoint: { runId: "run", sequence: 9, digest: "checkpoint" }, rejectedEventIds: [], receipt: { receiptId: "receipt", receiptDigest: "digest", checkpointDigest: "checkpoint", runId: "run", threadId: "preview-thread", turnId: "preview-turn", status: "completed", objective: "실행한 한 단계", changed: [], verification: [{ command: "bun test", status: "failed", result: "실패", evidenceRefs: [] }], evidenceRefs: [], remaining: [{ summary: "회귀 수정", blocking: true }], completedAt: "2026-09-11", terminalSource: { id: "terminal", sequence: 9, sourceDigest: "digest" } } } ;
		s.performance  = projectPerformance({ activities: s.activities, run: s.executionRun, flow: s.workFlow })                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        ;
		const heading = executionHeading(s);
		expect(heading.state).toBe("검토 필요"); expect(heading.attention).toBe(true); expect(heading.title).toBe("실행한 한 단계"); expect(heading.detail).toContain("검증 실패"); expect(heading.detail).toContain("필수 잔여 1개");
	});
	test("an accepted but unloaded source keeps its exact identity instead of reporting no selection", () => {
		const s = wwwFixture(); s.selectedActivityId = "unloaded-agent-activity";
		const output = new WwwContextView(() => s, () => [], true).render(80).join("\n");
		expect(output).toContain("unloaded-agent-activity"); expect(output).toContain("기록 미포함"); expect(output).toContain("대체하지 않았습니다");
	});
	test("history keeps every keyboard selection in the first 11 lines at 80×24", () => {
		const sessions = Array.from({ length: 12 }, (_, i) => ({ sessionId: `session-${i}`, projectId: "www", result: "completed" as const, boundary: "observed" as const, startedAt: null, endedAt: null, failures: 0, retries: 0, usage: null })) ;
		const d        = projectObservabilityDashboard(sessions, { state: "observed", streamsRead: 12, skippedStreams: 0, observedFrom: null, observedUntil: null })                                                                                ;
		for (let index = 0; index < 12; index++) {
			const text = stripTerminalSequences(new WwwHistoryView(() => d, () => index).render(80).slice(0, 11).join("\n"));
			expect(text).toContain(d.recentSessions[index]!.sessionId);
			expect(text).toContain("›");
		}
	});
	test("source renderer keeps exact identity and filters secret envelopes", () => {
		const s = wwwFixture(); s.selectedActivityId = "tool-1";
		s.activities = s.activities.map(x => x.id === "tool-1" ? { ...x, payload: { ...x.payload, apiKey: "SECRET_SENTINEL", reasoning: "PRIVATE_SENTINEL" } } : x);
		const output = new WwwContextView(() => s, () => [], true).render(80).join("\n");
		expect(output).toContain("tool-1"); expect(output).not.toContain("SECRET_SENTINEL"); expect(output).not.toContain("PRIVATE_SENTINEL");
	});
});

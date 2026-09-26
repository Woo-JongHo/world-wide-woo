import { describe, expect, test }               from "bun:test";
import chalk                                    from "chalk";
import { stripTerminalSequences, visibleWidth } from "@earendil-works/pi-tui";
import { getScrollViewsAt, renderLayoutFrame }  from "@earendil-works/pi-tui/dist/layout.js";
import { wwwFixture }                           from "./fixtures/www-snapshot";
import { WwwPlanView }                          from "../src/adapters/inbound/tui/features/plan/view/www-plan-view";
import { wwwNowLabel, executionHeading }        from "../src/adapters/inbound/tui/features/chat/view/www-execution";
import {
	requestRuntimeMotionActive,
	requestRuntimeRows,
} from "../src/adapters/inbound/tui/features/monitoring/view/request-runtime-view";
import { statusCardRows }                       from "../src/adapters/inbound/tui/foundation/components/status-card";
import { REQUEST_STAGES }                       from "../src/core/domain/execution/request-runtime";
import { WwwWorkspace }                         from "../src/adapters/inbound/tui/shell/www-surface";
import type { PlanFeatureProjection }           from "../src/core/application/orchestration/workbench-feature-reads";
import type { PlanActivity, WorkbenchSnapshot } from "../src/core/domain/work/workbench";
import { projectWorkFlow }                      from "../src/core/domain/work/workflow-projection";

function activity(index: number): PlanActivity {
	return { id: `activity-${index}`, turnId: "preview-turn", stepId: "step", stepTitle: "회귀 검증", summary: `검사 ${index}의 표시 동작을 확인합니다.`, status: "completed", sequence: index };
}

describe("interpreted Plan activity and cards", () => {
	test("renders from a standalone Plan read contract without a Workbench Snapshot", () => {
		const projection: PlanFeatureProjection = {
			activeTurnId : null,
			chatQueue    : [],
			workFlow     : projectWorkFlow([]),
		};

		const output = stripTerminalSequences(new WwwPlanView(() => projection).render(80).join("\n"));
		expect(output).toContain("현재 요청에서 전달받은 계획이 없습니다.");
		expect(output).toContain("다음 입력 제안이 없습니다.");
	});

	test("shows the newest five interpretations in chronological order, ignoring raw event noise", () => {
		const snapshot: WorkbenchSnapshot = { ...wwwFixture(),
			planActivities: [activity(6), activity(2), activity(7), activity(1), activity(4), activity(3), activity(5), { ...activity(99), turnId: "previous-turn" }],
			planActivityStatus: "ready",
		};
		snapshot.liveActivity = { kind: "tool", method: "item/started", text: "item/started", nativeRefs: { turnId: "preview-turn" } };
		for (const compact of [true, false]) {
			const view = new WwwPlanView(() => snapshot, compact)                   ;
			const text = stripTerminalSequences(view.render(80).join("\n"))         ;
			const feed = text.slice(text.indexOf("Progress"), text.indexOf("Next")) ;
			expect(feed).toContain("✓ 검사");
			expect(feed).not.toContain("╭");
			expect(feed).toContain("최근 5개");
			expect(feed).not.toContain("검사 1의");
			expect(feed).not.toContain("검사 2의");
			expect(feed).not.toContain("검사 99의");
			for (let index = 3; index < 7; index++) expect(feed.indexOf(`검사 ${index}의`)).toBeLessThan(feed.indexOf(`검사 ${index + 1}의`));
			expect(feed).not.toContain("item/started");
		}
		expect(wwwNowLabel(snapshot)).toBe("검사 7의 표시 동작을 확인합니다.");
		expect(executionHeading(snapshot).detail).not.toContain("item/started");
	});

	test("renders the interpreted feed through the real runtime presentation too", () => {
		const snapshot: WorkbenchSnapshot = { ...wwwFixture(), planActivities: [activity(1)], planActivityStatus: "pending" };
		snapshot.requestRuntime = [{
			schemaVersion: 1, protocolVersion: 2, requestId: "request", threadId: snapshot.threadId, turnId: snapshot.activeTurnId,
			objective: "표시 동작 확인", status: "running", attempt: 1, previousAttempts: [], completedAt: null, startedAt: "2026-09-22T00:00:00Z",
			requiredDeliveries: [], deliveries: [], actions: [], issues: [], events: [],
			stages: REQUEST_STAGES.map((id, index) => ({ id, status: index < 4 ? "completed" as const : index === 4 ? "running" as const : "pending" as const, goal: index === 4 ? "회귀 테스트와 독립 검토" : `${id} 작업`, input: [], owner: "orchestrator" as const, model: null, agents: [], tools: [], output: index === 4 ? "item/started" : null, evidence: [], decision: null, skipReason: null, startedAt: null, completedAt: null, next: REQUEST_STAGES[index + 1] ?? null, evidenceAfterSequence: 0, tasks: [] })),
		}];
		const presentation = { motionActive: requestRuntimeMotionActive, rows: requestRuntimeRows }          ;
		const rows         = new WwwPlanView(() => snapshot, true, Date.now, false, presentation).render(40) ;
		const text         = stripTerminalSequences(rows.join("\n"))                                         ;
		expect(text).not.toContain("진행 중");
		expect(text).not.toContain("Goal");
		expect(text).not.toContain("표시 동작 확인");
		expect(text).toContain("Stages");
		expect(text).toContain("4/7");
		for (const stage of REQUEST_STAGES) expect(text).toContain(stage);
		expect(text).toContain("회귀 테스트와 독립 검토");
		expect(text).toContain("검사 1의 표시 동작을 확인합니다.");
		expect(text).toContain("새 작업 내용을 정리하는 중");
		expect(text).not.toContain("item/started");
		expect(executionHeading(snapshot).detail).not.toContain("item/started");
		expect(rows.every(row => visibleWidth(row) <= 40)).toBe(true);
		const page = stripTerminalSequences(new WwwPlanView(() => snapshot, false, Date.now, false, presentation).render(80).join("\n"));
		for (const stage of REQUEST_STAGES) expect(page).toContain(stage);
		expect(page).toContain("✓ 검사 1의");
		expect(text).toContain("✓ 검사 1의");

		const workspace = new WwwWorkspace(() => snapshot, () => [], height => height, () => 2400, false, presentation)                                        ;
		const layout    = (width: number, height: number) => renderLayoutFrame(workspace.component, width, height, () => {}).lines.map(stripTerminalSequences) ;
		const tall      = layout(120, 56)                                                                                                                      ;
		for (const stage of REQUEST_STAGES) expect(tall.join("\n")).toContain(stage);
		expect(tall.join("\n")).not.toContain("Three Body");
		const short = layout(120, 20).join("\n");
		expect(short).toContain("Stages");
		expect(short).not.toContain("Three Body");
		const narrow = layout(80, 56).join("\n");
		expect(narrow).not.toContain("Stages");
		expect(narrow).not.toContain("Three Body");
		workspace.show("plan");
		const fullPlan = layout(80, 56).join("\n");
		for (const stage of REQUEST_STAGES) expect(fullPlan).toContain(stage);
		expect(fullPlan).toContain("검사 1의 표시 동작을 확인합니다.");
		expect(fullPlan).not.toContain("Three Body");
	});

	test("pending Plan cards keep their titles without a waiting status label", () => {
		const snapshot = wwwFixture();
		snapshot.requestRuntime = [];
		snapshot.workFlow = { ...snapshot.workFlow, steps: snapshot.workFlow.steps.map(step => ({ ...step, title: "다음 작업 확인", status: "pending" })) };
		for (const compact of [false, true]) {
			const output = stripTerminalSequences(new WwwPlanView(() => snapshot, compact).render(36).join("\n"));
			expect(output).toContain("다음 작업 확인");
			expect(output).not.toContain("대기");
			expect(output).not.toContain("pending");
		}
		for (const width of [5, 36]) {
			const pending = stripTerminalSequences(statusCardRows("후속 검사", "pending", width).join("\n"));
			expect(pending).not.toContain("대기");
			expect(stripTerminalSequences(statusCardRows("회귀 확인", "failed", width).join("\n"))).toContain("실패");
		}
	});

	test("the execution sidebar omits Three Body on empty and active entries", () => {
		let snapshot = wwwFixture("ready");
		snapshot.chat            = []   ;
		snapshot.activities      = []   ;
		snapshot.actionResult    = null ;
		snapshot.pendingApproval = null ;
		snapshot.executionRun    = null ;
		delete snapshot.reasoningSummaryDraft;
		snapshot.reasoningDraft = ""                                  ;
		snapshot.draft          = ""                                  ;
		snapshot.error          = null                                ;
		snapshot.requestRuntime = []                                  ;
		snapshot.workFlow       = { ...snapshot.workFlow, steps: [] } ;
		const workspace = new WwwWorkspace(() => snapshot, () => [], height => height, () => 0, true) ;
		const frame     = () => renderLayoutFrame(workspace.component, 120, 32, () => {})            ;
		expect(stripTerminalSequences(frame().lines.join("\n"))).not.toContain("Three Body");
		snapshot = { ...snapshot, chat: [{ id: "started", activityId: "request", role: "user", content: "작업 시작", status: "completed" }], planActivities: Array.from({ length: 5 }, (_, index) => ({ ...activity(index), summary: "카드의 세부 내용이 길어져도 끝까지 읽을 수 있어야 합니다. ".repeat(4) })) };
		snapshot.chatQueue = [{ id: "last", content: "스크롤 끝의 후속 제안", queuedAt: "2026-09-22T00:00:00Z" }];
		const crowded = frame();
		expect(crowded.lines.join("\n")).not.toContain("Three Body");
		const sidebar = getScrollViewsAt(crowded, 115, 10)[0];
		expect(sidebar).toBeDefined();
		sidebar!.scrollToEnd();
		expect(stripTerminalSequences(frame().lines.join("\n"))).toContain("스크롤 끝의 후속 제안");
		workspace.toggleSidebar();
		expect(frame().lines.join("\n")).not.toContain("스크롤 끝의 후속 제안");
		workspace.transcript.dispose();
	});

	test("waits without raw fallbacks and replaces one interpreted action on completion", () => {
		let snapshot: WorkbenchSnapshot = { ...wwwFixture(), planActivityStatus: "pending" };
		const view = new WwwPlanView(() => snapshot);
		expect(stripTerminalSequences(view.render(100).join("\n"))).toContain("작업 내용을 정리하는 중");
		snapshot = { ...snapshot, planActivities: [{ ...activity(1), status: "running" }] };
		const running = stripTerminalSequences(view.render(100).join("\n"));
		expect(running.slice(running.indexOf("Progress"))).not.toContain("진행 중");
		expect(running).toContain("› 검사 1의");
		snapshot = { ...snapshot, planActivities: [activity(1)], planActivityStatus: "ready" };
		const complete = stripTerminalSequences(view.render(100).join("\n"));
		expect(complete.slice(complete.indexOf("Progress"))).not.toContain("완료");
		expect(complete).toContain("✓ 검사 1의");
		expect(complete.match(/검사 1의/gu)).toHaveLength(1);
		snapshot = { ...snapshot, planActivities: [], planActivityStatus: "unavailable" };
		expect(stripTerminalSequences(view.render(100).join("\n"))).toContain("작업 내용을 아직 정리하지 못했습니다.");
	});

	test("cards wrap Korean titles without numbering and fill only completed states", () => {
		const oldLevel = chalk.level;
		chalk.level = 3;
		try {
			for (const status of ["pending", "running", "completed", "failed", "skipped"]) for (const width of [1, 5, 16, 36, 80]) {
				const rows = statusCardRows("회귀 테스트와 독립 검토로 표시 동작 확인", status, width);
				expect(rows.every(row => visibleWidth(row) <= width)).toBe(true);
				const text = rows.join("\n");
				if (width >= 6) expect(text.includes("\x1b[48;2;")).toBe(status === "completed");
				expect(stripTerminalSequences(text)).not.toMatch(/\b[123]\./u);
			}
			const plain = statusCardRows("표시 확인", "completed", 36).map(stripTerminalSequences);
			expect(plain[0]).toMatch(/^╭─+╮$/u);
			expect(plain[1]).toContain("│표시 확인");
		} finally { chalk.level = oldLevel; }
	});

	test("keeps Plan and Progress items within two compact rail rows and deeper page rows", () => {
		const source = wwwFixture();
		const snapshot: WorkbenchSnapshot = {
			...source,
			workFlow: {
				...source.workFlow,
				steps: source.workFlow.steps.map(step => ({ ...step, title: "하나의 계획 항목이 좁은 화면에서도 세 번째 줄로 늘어나지 않도록 간결하게 표시합니다. ".repeat(3) })),
			},
			planActivities: [{ ...activity(1), summary: "하나의 Progress 문장이 좁은 화면에서도 원문을 변경하지 않고 레일에서는 두 줄, Plan 페이지에서는 여섯 줄까지 보입니다. ".repeat(3) }],
		};
		const itemRows = (rows: readonly string[]): number => rows.filter(row => row.trim() && /^[✓›!·− ] /u.test(row)).length;
		for (const [compact, progressLimit] of [[true, 2], [false, 6]] as const) {
			const output        = new WwwPlanView(() => snapshot, compact).render(24).map(stripTerminalSequences) ;
			const planStart     = output.findIndex(row => row.includes("Plan"))                                   ;
			const progressStart = output.findIndex(row => row.includes("Progress"))                               ;
			expect(itemRows(output.slice(planStart, progressStart))).toBeLessThanOrEqual(snapshot.workFlow.steps.length * 2);
			expect(itemRows(output.slice(progressStart))).toBeLessThanOrEqual(progressLimit);
			expect(output.join("\n")).toContain("…");
		}
	});
});

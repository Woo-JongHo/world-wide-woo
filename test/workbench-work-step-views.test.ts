import { describe, expect, test }               from "bun:test";
import { renderLayoutFrame }                    from "@earendil-works/pi-tui/dist/layout.js";
import type { LayoutBox }                       from "@earendil-works/pi-tui/dist/layout.js";
import { stripTerminalSequences, visibleWidth } from "@earendil-works/pi-tui";
import chalk                                    from "chalk";
import type { WorkbenchSnapshot }               from "../src/core/domain/work/workbench";
import { createDashboardLayout }                from "../src/adapters/inbound/tui/foundation/layout/dashboard-layout";
import {
	StatusLine,
	WorkspaceTodoView,
} from "../src/adapters/inbound/tui/features/dashboard/view/shared-dashboard-views";
import { WorkbenchChatView }                    from "../src/adapters/inbound/tui/features/chat/view/workbench-views";
import { EntryDashboardView }                   from "../src/adapters/inbound/tui/features/dashboard/view/entry-dashboard-view";
import { TNotesSourceView }                     from "../src/adapters/inbound/tui/features/tnote/view/t-notes-source-view";
import { WorkbenchMonitorView }                 from "../src/adapters/inbound/tui/features/monitoring/view/workbench-monitor-view";
import { WorkbenchTracerView }                  from "../src/adapters/inbound/tui/features/trace/view/workbench-tracer-view";
import { boundedPublicProjection }              from "../src/adapters/inbound/tui/features/chat/view-model/bounded-public-projection";
import {
	approvalCardRows,
	projectApprovalBackgroundState,
} from "../src/adapters/inbound/tui/features/approval/view/approval-presentation";
import { projectWorkFlow }                      from "../src/core/domain/work";
import type { DplanHash }                       from "../src/core/domain/work";

import {
	allScrollContent,
	approvalPresentation,
	fixtureWorkFlow,
	hash,
	renderChatWithDashboard,
	snapshot,
} from "./workbench-views.fixtures";

describe("workbench plan, Todo, and work-step views", () => {
	test("renders model-interpreted what and why on the shared Step card", () => {
		const activities: WorkbenchSnapshot["activities"] = [{
			...snapshot.activities[0]!,
			id: "semantic-change",
			sequence: 1,
			kind: "file-change",
			phase: "completed",
			nativeRefs: { threadId: "thread-1", turnId: "turn-1", itemId: "change-1" },
			payload: {
				method: "item/completed",
				params: { item: { type: "fileChange", changes: [{ path: "src/domain/work-steps.ts", kind: "update" }] } },
			},
		}];
		const workFlow = fixtureWorkFlow(activities);
		const output = stripTerminalSequences(new WorkbenchChatView({
			...snapshot,
			activities,
			chat: [],
			workFlow,
		}).render(76).join("\n"));

		expect(output).toContain("변경 결과 검증");
		expect(output).not.toContain("무엇을 하고 있는지:");
		expect(output).not.toContain("왜 하는지:");
		expect(output).not.toContain("의미 Step 집계 Module 추가");
		expect(output).not.toContain("작업 입력 해석 중");
	});

	test("hides empty Todo and Note counters", () => {
		const emptySnapshot = { ...snapshot, tnotes: [], todo: null }                                                 ;
		const tnotesOutput  = stripTerminalSequences(new TNotesSourceView(() => emptySnapshot).render(80).join("\n")) ;
		const todoOutput    = stripTerminalSequences(new WorkspaceTodoView(() => null).render(80).join("\n"))         ;

		expect(tnotesOutput).not.toContain("T-NOTES 0");
		expect(todoOutput).not.toContain("TODO 0/0");
		expect(tnotesOutput).toBe("");
		expect(todoOutput).toBe("TODO · 현재 계획 없음");
	});

	test("keeps active goal, progress, queue, Todo, and source details out of Notes", () => {
		const output = stripTerminalSequences(new TNotesSourceView(() => ({
			...snapshot,
			tnotes: [],
			sessionGoal: {
				text             : "프로젝트별 WWW 작업 공간을 실제 사용 가능한 상태로 만든다.",
				sourceActivityId : "activity-goal",
				updatedAt        : "2026-09-01T00:00:00.000Z",
			},
			draft: "현재 응답을 작성 중입니다.",
			chatQueue: [{ id: "queued", content: "다음 요청", queuedAt: "2026-09-01T00:00:01.000Z" }],
			todo: {
				version: 1, revision: 1, ownerSessionId: "workbench", storyId: null, title: "현재 Todo",
				updatedAt: "2026-09-01T00:00:00.000Z", items: [],
			},
		})).render(80).join("\n"));

		expect(output).toBe("");
		expect(output).not.toContain("SESSION GOAL");
		expect(output).not.toContain("프로젝트별 WWW 작업 공간");
		expect(output).not.toContain("현재 응답을 작성 중입니다.");
		expect(output).not.toContain("다음 요청");
		expect(output).not.toContain("현재 Todo");
	});

	test("bounds append-only Notes while preserving omission and visible-count evidence", () => {
		const tnotes = Array.from({ length: 23 }, (_, index) => ({
			id: `note-${index + 1}`,
			title: `질문 ${index + 1}`,
			summary: index === 22
				? `질문: 질문 23\n왜: ${"긴 요약 ".repeat(800)}\n결과: 끝`
				: `질문: 질문 ${index + 1}\n왜: 완료된 이유입니다.\n결과: 요약 ${index + 1}`,
			sourceActivityIds: [],
			updatedAt: `2026-09-01T00:00:${String(index).padStart(2, "0")}.000Z`,
		}));
		const output = stripTerminalSequences(new TNotesSourceView(() => ({ ...snapshot, tnotes })).render(80).join("\n"));

		expect(output).toContain("이전 완료 질문 3개 생략 · 최근 20개 표시");
		expect(output).not.toContain("질문 1 · note-1");
		expect(output).toContain("질문 4 · note-4");
		expect(output).toContain("질문 23 · note-23");
		expect(output).toContain("긴 Report 일부 생략 · 최대 2,048자 · 24줄");

		const customOutput = stripTerminalSequences(new TNotesSourceView(() => ({
			...snapshot,
			tnotes,
			tnoteSummaryMaxChars: 512,
			tnoteSummaryMaxLines: 8,
		})).render(80).join("\n"));
		expect(customOutput).toContain("긴 Report 일부 생략 · 최대 512자 · 8줄");
	});

	test("renders Todo status icons and hanging wraps inside the pane width", () => {
		const view = new WorkspaceTodoView(() => ({
			version        : 1,
			revision       : 2,
			ownerSessionId : "workbench",
			storyId        : "ST-001",
			title          : "현재 구현 진행 상황",
			updatedAt      : "2026-09-01T00:00:00.000Z",
			items: [
				{ id: "todo-1", content: "아주 긴 완료 항목이 패널 바깥으로 넘어가지 않게 줄바꿈합니다", status: "completed", evidenceIds: [], details: [] },
				{ id: "todo-2", content: "현재 진행 항목", status: "in_progress", evidenceIds: [], details: [] },
			],
		}));
		const lines = view.render(48);
		const output = stripTerminalSequences(lines.join("\n"));

		expect(lines.every((line) => visibleWidth(line) <= 48)).toBe(true);
		expect(output).toContain("✓");
		expect(output).toContain("▶");
		expect(output).not.toContain("[x]");
		expect(lines.length).toBeGreaterThanOrEqual(4);
	});

	test("hides lifecycle progress payloads from Chat cards", () => {
		const startup: WorkbenchSnapshot = {
			...snapshot,
			activities: [{
				...snapshot.activities[0]!,
				id: "startup-1",
				kind: "progress",
				payload: { method: "mcpServer/startupStatus/updated", rawStartup: { noisy: true } },
			}],
			chat: [],
			selectedActivityId: null,
		};
		const output = stripTerminalSequences(new WorkbenchChatView(startup).render(70).join("\n"));
		expect(output).not.toContain("mcpServer");
		expect(output).not.toContain("rawStartup");
		expect(output).not.toContain("native-tool");
	});

	test("shows only a content-free state while native reasoning is streaming", () => {
		const reasoning: WorkbenchSnapshot = {
			...snapshot,
			reasoningDraft: "비공개 추론 원문: 사용자의 의도를 분석한다",
		};
		const output = stripTerminalSequences(new WorkbenchChatView(reasoning).render(70).join("\n"));
		expect(output).toContain("작업 계획을 정리하는 중");
		expect(output).not.toContain("비공개 추론 원문");
		expect(output).not.toContain("사용자의 의도를 분석한다");
	});

	test("shows only the App Server public reasoning summary text", () => {
		const reasoning: WorkbenchSnapshot = {
			...snapshot,
			reasoningDraft: "raw chain of thought must stay hidden",
			reasoningSummaryDraft: "Planning semantic color token adjustments",
		};
		const output = stripTerminalSequences(new WorkbenchChatView(reasoning).render(70).join("\n"));
		expect(output).toContain("Planning semantic color token adjustments");
		expect(output).not.toContain("raw chain of thought");
	});

	test("explains a pending approval and tells the user how to respond", () => {
		const pending: WorkbenchSnapshot = {
			...snapshot,
			pendingApproval: {
				requestId          : 17,
				callbackId         : null,
				kind               : "command",
				refs               : { threadId: "thread-1", turnId: "turn-1", itemId: "item-1" },
				availableDecisions : ["accept", "acceptForSession", "decline"],
				params: {
					reason  : "변경이 동작하는지 테스트해야 합니다.",
					command : "bun test test/workbench-views.test.ts",
					cwd     : "/workspace/sample-project",
				},
			},
			chatQueue: [{
				id: "queued-1",
				content: "테스트 결과를 설명해줘",
				queuedAt: "2026-09-01T00:00:03.000Z",
			}],
		};
		const output = stripTerminalSequences(new WorkbenchChatView(pending, null, approvalPresentation).render(100).join("\n"));

		expect(output).toContain("승인 필요 · 명령");
		expect(output).toContain("명령 · bun test test/workbench-views.test.ts");
		expect(output).toContain("이유 · 변경이 동작하는지 테스트해야 합니다.");
		expect(output).toContain("경로 · /workspace/sample-project");
		expect(output).toContain("승인 선택 화면 · ↑↓ 또는 숫자로 선택 · Enter 결정");
		expect(output).toContain("승인할까요? 현재 턴은 Input 답변을 기다립니다.");
		expect(output).toContain("백그라운드 작업 · unknown");
		expect(output).toContain("대기 메시지 1개 · 승인 후 순서대로 전송");
	});

	test("renders authoritative approval background states and compact queued delivery", () => {
		const approval = {
			requestId          : 17,
			callbackId         : null,
			kind               : "command" as const,
			refs               : { threadId: "thread-1", turnId: "turn-1" },
			availableDecisions : ["accept", "decline"] as const,
			params             : {},
		};
		const lifecycle = (status: string, agentsStates: Record<string, unknown>) => ({
			...snapshot.activities[0]!,
			id      : `lifecycle-${status}`,
			kind    : "progress" as const,
			payload : { params: { item: { id: "spawn-1", tool: "spawnAgent", status, receiverThreadIds: ["child-1"], agentsStates } } },
		});
		for (const [expected, activities] of [
			["none", [lifecycle("completed", { "child-1": { status: "completed" } })]],
			["active", [lifecycle("in_progress", {})]],
			["unknown", [lifecycle("completed", {})]],
		] as const) {
			const output = stripTerminalSequences(new WorkbenchChatView({
				...snapshot,
				pendingApproval: approval,
				activities,
				chatQueue: [
					{ id: "queued-1", content: "첫 번째 대기 메시지", queuedAt: "2026-09-01T00:00:02.000Z" },
					{ id: "queued-2", content: "두 번째 대기 메시지", queuedAt: "2026-09-01T00:00:03.000Z" },
				],
			}, null, approvalPresentation).render(36).join("\n"));
			expect(output).toContain(`백그라운드 작업 · ${expected}`);
			expect(output).toContain("대기 메시지 2개");
			for (const line of output.split("\n")) expect(visibleWidth(line)).toBeLessThanOrEqual(36);
		}
	});

	test("shows persisted completed-question records after active work without source payloads", () => {
		const active: WorkbenchSnapshot = {
			...snapshot,
			tnotes: [],
			activities: [{
				...snapshot.activities[0]!,
				id: "reasoning-completed",
				kind: "progress",
				payload: {
					method: "item/completed",
					params: { item: { type: "reasoning", text: "비공개 reasoning 원문", summary: "비공개 요약" } },
				},
			}],
			selectedActivityId : "reasoning-completed",
			chat               : [],
			draft              : "실행 중인 다음 단계",
		};
		const activeOutput = stripTerminalSequences(new TNotesSourceView(() => active).render(80).join("\n"));
		expect(activeOutput).not.toContain('"classification": "reasoning"');
		expect(activeOutput).not.toContain("비공개 reasoning 원문");
		expect(activeOutput).not.toContain("실행 중인 다음 단계");

		const completedOutput = stripTerminalSequences(new TNotesSourceView(() => ({
			...active,
			tnotes: [{
				id: "resumed-note",
				title: "완료된 질문",
				summary: "질문: 완료된 질문\n왜: 재개 뒤에도 완료된 질문 기록만 유지합니다.\n결과: 검증을 마쳤습니다.",
				sourceActivityIds: ["reasoning-completed"],
				updatedAt: "2026-09-01T00:00:02.000Z",
			}],
		})).render(80).join("\n"));
		expect(completedOutput).toContain("완료된 질문 · resumed-note");
		expect(completedOutput).toContain("질문: 완료된 질문");
		expect(completedOutput).toContain("결과: 검증을 마쳤습니다.");
	});

	test("renders a completed native command as a bounded public step card", () => {
		const command: WorkbenchSnapshot = {
			...snapshot,
			journalSequence: 4,
			activities: [{
				...snapshot.activities[0]!,
				id: "command-activity",
				sequence: 4,
				kind: "tool",
				phase: "completed",
				nativeRefs: { threadId: "thread-secret", turnId: "turn-secret", itemId: "command-1" },
				payload: {
					eventType: "notification",
					method: "item/completed",
					params: {
						item: {
							type             : "commandExecution",
							command          : "bun test test/workbench-views.test.ts",
							cwd              : "/workspace/sample",
							aggregatedOutput : Array.from({ length: 20 }, (_, index) => `result-${String(index + 1).padStart(2, "0")}`).join("\n"),
							exitCode         : 0,
							hiddenReasoning  : "사용자에게 보여서는 안 되는 추론",
						},
						rawEnvelope: { noisy: true },
					},
				},
			}],
			chat: [],
			selectedActivityId: null,
		};
		const output = stripTerminalSequences(new WorkbenchChatView({
			...command,
			workFlow: fixtureWorkFlow(command.activities),
		}).render(70).join("\n"));
		expect(output).toContain("단계 1 · PASSED");
		expect(output).toContain("변경 결과 검증");
		expect(output).toContain("Trace source · activityId command-activity · /trace command-activity");
		expect(output).toContain("$ bun test test/workbench-views.test.ts");
		expect(output).not.toContain("왜 하는지:");
		expect(output).toContain("┌─── ✔ Bash");
		expect(output).not.toContain("/workspace/sample");
		expect(output).toContain("├─── Output");
		expect(output).toContain("result-20");
		expect(output).toContain("earlier lines, showing 5 of 20");
		expect(output).not.toContain("result-15");
		expect(output).not.toContain("rawEnvelope");
		expect(output).not.toContain("thread-secret");
		expect(output).not.toContain("hiddenReasoning");
		expect(output).not.toContain("사용자에게 보여서는 안 되는 추론");
	});

	test("keeps an unplanned command as a detailed Bash action instead of a generic sentence", () => {
		const activities: WorkbenchSnapshot["activities"] = [
			{
				...snapshot.activities[0]!,
				id: "unplanned-user",
				sequence: 1,
				kind: "message",
				nativeRefs: { threadId: "thread-1", turnId: "turn-unplanned", itemId: "unplanned-user" },
				payload: { direction: "outbound", role: "user", text: "Git 변경을 준비해줘" },
			},
			{
				...snapshot.activities[0]!,
				id: "unplanned-command",
				sequence: 2,
				kind: "tool",
				phase: "completed",
				nativeRefs: { threadId: "thread-1", turnId: "turn-unplanned", itemId: "unplanned-command" },
				payload: { method: "item/completed", params: { item: {
					type             : "commandExecution",
					command          : "git add src/app.ts",
					aggregatedOutput : "staged src/app.ts",
					exitCode         : 0,
					durationMs       : 18,
				} } },
			},
		];
		const output = stripTerminalSequences(new WorkbenchChatView({
			...snapshot,
			activities,
			chat: [{
				id: "unplanned-user",
				role: "user",
				content: "Git 변경을 준비해줘",
				activityId: "unplanned-user",
				status: "completed",
			}],
			workFlow: projectWorkFlow([]),
		}).render(72).join("\n"));

		expect(output).toContain("✔ Bash · PASSED");
		expect(output).toContain("┌─── ✔ Bash");
		expect(output).toContain("$ git add src/app.ts");
		expect(output).toContain("staged src/app.ts");
		expect(output).toContain("⟦Exit: 0⟧");
		expect(output).toContain("⟦Duration: 18ms⟧");
		expect(output).not.toContain("명령을 실행했습니다");
	});

	test("keeps every planned action once and labels intermediate actions with their parent step", () => {
		const activities: WorkbenchSnapshot["activities"] = [
			{
				...snapshot.activities[0]!,
				id: "multi-plan-start",
				kind: "progress",
				phase: "updated",
				nativeRefs: { threadId: "thread-1", turnId: "turn-multi" },
				payload: { method: "turn/plan/updated", params: { plan: [
					{ step: "Chat UX 구현과 검증", status: "inProgress" },
				] } },
			},
			{
				...snapshot.activities[0]!,
				id: "multi-edit",
				kind: "tool",
				nativeRefs: { threadId: "thread-1", turnId: "turn-multi", itemId: "multi-edit" },
				payload: { method: "item/completed", params: { item: {
					type             : "commandExecution",
					command          : "git add src/app.ts",
					aggregatedOutput : "staged src/app.ts",
					exitCode         : 0,
				} } },
			},
			{
				...snapshot.activities[0]!,
				id: "multi-test",
				kind: "file-change",
				nativeRefs: { threadId: "thread-1", turnId: "turn-multi", itemId: "multi-test" },
				payload: { method: "item/completed", params: { item: {
					type: "fileChange",
					changes: [{ path: "src/app.ts", diff: "+ changed" }],
				} } },
			},
			{
				...snapshot.activities[0]!,
				id: "multi-plan-complete",
				kind: "progress",
				phase: "updated",
				nativeRefs: { threadId: "thread-1", turnId: "turn-multi" },
				payload: { method: "turn/plan/updated", params: { plan: [
					{ step: "Chat UX 구현과 검증", status: "completed" },
				] } },
			},
		];
		const output = stripTerminalSequences(new WorkbenchChatView({
			...snapshot,
			activities,
			chat: [],
			workFlow: fixtureWorkFlow(activities),
		}).render(72).join("\n"));

		expect(output).toContain("✔ 단계 1 › Bash · PASSED");
		expect(output).toContain("단계 1 · PASSED");
		expect(output.match(/\$ git add src\/app\.ts/gu)).toHaveLength(1);
		expect(output.match(/\+ changed/gu)).toHaveLength(1);
	});

	test("keeps a native command output delta on the same running step", () => {
		const running: WorkbenchSnapshot = {
			...snapshot,
			journalSequence: 2,
			activities: [{
				...snapshot.activities[0]!,
				id: "command-started",
				sequence: 2,
				kind: "tool",
				phase: "started",
				nativeRefs: { threadId: "thread-1", turnId: "turn-1", itemId: "command-2" },
				payload: {
					method: "item/started",
					params: { item: { type: "commandExecution", command: "bun test", cwd: "/workspace/sample" } },
				},
			}],
			chat: [],
			selectedActivityId: null,
			liveActivity: {
				method     : "item/commandExecution/outputDelta",
				kind       : "tool",
				text       : "12 pass\n1 fail\n",
				nativeRefs : { threadId: "thread-1", turnId: "turn-1", itemId: "command-2" },
			},
		};
		const output = stripTerminalSequences(new WorkbenchChatView({
			...running,
			workFlow: fixtureWorkFlow(running.activities),
		}).render(62).join("\n"));
		expect(output).toContain("단계 1 · RUNNING");
		expect(output).toContain("변경 결과 검증");
		expect(output).not.toContain("왜 하는지:");
		expect(output).toContain("12 pass");
		expect(output).toContain("1 fail");
		expect(output).not.toContain("outputDelta");
		expect(output.match(/단계 1/gu)).toHaveLength(1);
	});

	test("keeps completed command observations out of Native-plan step numbering", () => {
		const steps: WorkbenchSnapshot = {
			...snapshot,
			journalSequence: 9,
			activities: [
				{
					...snapshot.activities[0]!,
					id: "hidden-progress",
					sequence: 2,
					kind: "progress",
					nativeRefs: { threadId: "fixture-thread", turnId: "hidden-turn" },
					payload: { method: "item/started" },
				},
				{
					...snapshot.activities[0]!,
					id: "visible-command",
					sequence: 4,
					kind: "tool",
					nativeRefs: { threadId: "fixture-thread", turnId: "fixture-turn", itemId: "command-visible" },
					payload: { method: "item/completed", params: { item: { type: "commandExecution", command: "bun test" } } },
				},
				{
					...snapshot.activities[0]!,
					id: "visible-file-change",
					sequence: 9,
					kind: "file-change",
					nativeRefs: { threadId: "fixture-thread", turnId: "fixture-turn", itemId: "file-visible" },
					payload: {
						method: "item/completed",
						params: { item: { type: "fileChange", changes: [{ path: "src/app.ts", diff: "+ change" }] } },
					},
				},
			],
			chat: [],
			selectedActivityId: null,
		};
		const output = stripTerminalSequences(new WorkbenchChatView({
			...steps,
			workFlow: fixtureWorkFlow(steps.activities),
		}).render(70).join("\n"));
		expect(output).toContain("Observe · PASSED");
		expect(output).toContain("단계 1 · PASSED");
		expect(output).not.toContain("단계 2");
		expect(output).not.toContain("단계 4");
		expect(output).not.toContain("단계 9");
	});

	test("shows follow-up inputs immediately as ordinary user messages", () => {
		const queued: WorkbenchSnapshot = {
			...snapshot,
			chatQueue: [
				{ id: "queue-secret-1", content: "첫 번째 후속 요청", queuedAt: "2026-09-01T00:00:02.000Z" },
				{ id: "queue-secret-2", content: "두 번째 후속 요청", queuedAt: "2026-09-01T00:00:03.000Z" },
			],
		};
		const output = stripTerminalSequences(new WorkbenchChatView(queued).render(62).join("\n"));
		expect(output).not.toContain("대기 1");
		expect(output).toContain("첫 번째 후속 요청");
		expect(output).not.toContain("대기 2");
		expect(output).toContain("두 번째 후속 요청");
		expect(output.indexOf("첫 번째 후속 요청")).toBeLessThan(output.indexOf("두 번째 후속 요청"));
		expect(output).not.toContain("queue-secret");
		expect(output).not.toContain("2026-09-01T00:00");
	});

	test("keeps an uncertain delivery warning and its recovery command visible", () => {
		const uncertain: WorkbenchSnapshot = {
			...snapshot,
			phase             : "error",
			deliveryUncertain : true,
			error             : "Native turn/start 요청의 수신 여부가 불명확합니다. accessToken=source-token-secret",
		};
		const output = stripTerminalSequences(new WorkbenchChatView(uncertain).render(70).join("\n"));
		expect(output).toContain("확인이 필요한 상태");
		expect(output).toContain("수신 여부가 불명확합니다");
		expect(output).toContain("/cancel로 서버 상태를 확인합니다");
		expect(output).not.toContain("source-token-secret");
	});

	test("omits the /cancel recovery line for a failure it cannot reconcile", () => {
		const internal: WorkbenchSnapshot = {
			...snapshot,
			phase: "error",
			error: "활동 기록은 Native thread에 묶인 뒤에만 추가할 수 있습니다.",
		};
		const output = stripTerminalSequences(new WorkbenchChatView(internal).render(70).join("\n"));
		expect(output).toContain("확인이 필요한 상태");
		expect(output).toContain("Native thread에 묶인 뒤에만");
		expect(output).not.toContain("/cancel");
	});

	test.each([
		["failed", "전송 실패"],
		["streaming", "전송 준비 중"],
	] as const)("shows the %s delivery state on an outbound user bubble", (status, label) => {
		const outbound: WorkbenchSnapshot = {
			...snapshot,
			chat: [{
				...snapshot.chat[0]!,
				role: "user",
				content: "전달 상태를 확인할 요청",
				status,
			}],
		};
		const output = stripTerminalSequences(new WorkbenchChatView(outbound).render(70).join("\n"));
		expect(output).toContain(`👤 USER · ${label}`);
		expect(output).toContain("전달 상태를 확인할 요청");
	});

	test("renders the first outbound user message before native thread activity exists", () => {
		const outbound: WorkbenchSnapshot = {
			...snapshot,
			threadId           : null,
			activities         : [],
			selectedActivityId : null,
			chat: [{
				id: "local-first-message",
				role: "user",
				content: "Native Thread가 열리기 전에도 보여야 하는 요청",
				activityId: "local-first-message",
				status: "streaming",
			}, {
				id: "orphan-assistant-message",
				role: "assistant",
				content: "activity 순서가 없는 응답",
				activityId: "orphan-assistant-message",
				status: "completed",
			}],
		};
		const output = stripTerminalSequences(new WorkbenchChatView(outbound).render(70).join("\n"));
		expect(output).toContain("👤 USER · 전송 준비 중");
		expect(output).toContain("Native Thread가 열리기 전에도 보여야 하는 요청");
		expect(output).not.toContain("activity 순서가 없는 응답");
	});

	test("uses the public MCP item status, arguments, and error without exposing reasoning", () => {
		const failedTool: WorkbenchSnapshot = {
			...snapshot,
			journalSequence: 5,
			activities: [{
				...snapshot.activities[0]!,
				id: "mcp-completed",
				sequence: 5,
				kind: "tool",
				phase: "completed",
				nativeRefs: { threadId: "fixture-thread", turnId: "fixture-turn", itemId: "mcp-1" },
				payload: {
					method: "item/completed",
					params: {
						item: {
							type      : "mcpToolCall",
							server    : "github",
							tool      : "create_issue",
							arguments : { title: "native workbench" },
							status    : "failed",
							error     : { message: "rate limited", hiddenReasoning: "비공개 판단" },
						},
					},
				},
			}],
			chat: [],
			selectedActivityId: null,
		};
		const output = stripTerminalSequences(new WorkbenchChatView({
			...failedTool,
			workFlow: fixtureWorkFlow(failedTool.activities),
		}).render(70).join("\n"));
		expect(output).toContain("단계 1 · FAILED");
		expect(output).toContain("create_issue 입력 해석 중");
		expect(output).toContain("args: {\"title\":\"native workbench\"}");
		expect(output).toContain("error: {\"message\":\"rate limited\"}");
		expect(output).not.toContain("hiddenReasoning");
		expect(output).not.toContain("비공개 판단");
	});

	test("preserves completed Markdown while bounding only the live draft", () => {
		const completed = Array.from({ length: 200 }, (_, index) => `completed-line-${String(index + 1).padStart(3, "0")}`).join("\n");
		const draft = Array.from({ length: 200 }, (_, index) => `draft-line-${String(index + 1).padStart(3, "0")}`).join("\n");
		const large: WorkbenchSnapshot = {
			...snapshot,
			chat: [{ ...snapshot.chat[0]!, content: completed }],
			draft,
		};
		const output = stripTerminalSequences(new WorkbenchChatView(large).render(100).join("\n"));
		expect(output).toContain("completed-line-001");
		expect(output).toContain("completed-line-200");
		expect(output).toContain("completed-line-100");
		expect(output).toContain("draft-line-001");
		expect(output).toContain("draft-line-200");
		expect(output).not.toContain("draft-line-100");
		expect(output.match(/응답 일부 생략/gu)).toHaveLength(1);
		expect(large.chat[0]?.content).toBe(completed);
		expect(large.draft).toBe(draft);
	});

	test("keeps a structured native answer in its original Markdown order", () => {
		const structured = [
			"### autoresearch",
			"특정 목표에 대한 조사 임무를 수행합니다.",
			"```text",
			"/skill:autoresearch Codex App Server 조사",
			"```",
			"적합한 상황:",
			"- 공식 문서와 코드 근거",
			"- 기술 선택지 비교",
			"---",
			"### 스킬과 서브에이전트의 차이",
			"둘은 완전히 다른 개념입니다.",
		].join("\n");
		const view = new WorkbenchChatView({
			...snapshot,
			chat: [{ ...snapshot.chat[0]!, content: structured }],
		});
		const output = stripTerminalSequences(view.render(80).join("\n"));
		const landmarks = [
			"autoresearch",
			"특정 목표에 대한 조사 임무",
			"/skill:autoresearch Codex App Server 조사",
			"적합한 상황:",
			"공식 문서와 코드 근거",
			"기술 선택지 비교",
			"스킬과 서브에이전트의 차이",
			"둘은 완전히 다른 개념입니다.",
		];
		let previous = -1;
		for (const landmark of landmarks) {
			const index = output.indexOf(landmark);
			expect(index).toBeGreaterThan(previous);
			previous = index;
		}
		expect(output).not.toContain("응답 일부 생략");
	});

	test("keeps the full current native session transcript visible", () => {
		const activities = Array.from({ length: 180 }, (_, index) => ({
			...snapshot.activities[0]!,
			id         : `activity-${index + 1}`,
			sequence   : index + 1,
			nativeRefs : { itemId: `message-${index + 1}` },
			payload    : { text: `assistant-message-${String(index + 1).padStart(3, "0")}` },
		}));
		const chat = activities.map((activity, index) => ({
			id         : `message-${index + 1}`,
			role       : "assistant" as const,
			content    : `assistant-message-${String(index + 1).padStart(3, "0")}`,
			activityId : activity.id,
			status     : "completed" as const,
		}));
		const longSession: WorkbenchSnapshot = {
			...snapshot,
			journalSequence: 180,
			activities,
			chat,
			selectedActivityId: activities.at(-1)?.id ?? null,
		};

		const view = new WorkbenchChatView(longSession);
		const output = stripTerminalSequences(view.render(80).join("\n"));
		expect(output).not.toContain("이전 활동");
		expect(output).toContain("assistant-message-001");
		expect(output).toContain("assistant-message-100");
		expect(output).toContain("assistant-message-101");
		expect(output).toContain("assistant-message-180");

		view.update({ ...longSession, draft: "새 응답" });
		const updated = stripTerminalSequences(view.render(80).join("\n"));
		expect(updated).toContain("assistant-message-001");
		expect(updated).toContain("assistant-message-180");
		expect(updated).toContain("새 응답");
	});
});

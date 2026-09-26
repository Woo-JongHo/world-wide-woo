/** @linear WOO-692 */
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

describe("workbench dashboard views", () => {
	test("shows the linked Linear project while the entry dashboard is connecting", () => {
		const output = renderChatWithDashboard({
			...snapshot,
			chat: [],
			linearDashboard: {
				state       : "loading",
				projectName : "World Wide Woo",
				fetchedAt   : null,
				issues      : [],
				update      : null,
				comments    : [],
				milestones  : [],
				error       : null,
			},
		});
		expect(output).toContain("DASHBOARD · World Wide Woo");
		expect(output).toContain("연결 중");
		expect(output).toContain("열린 이슈·최신 Update·Comment·마일스톤");
	});

	test("projects linked Linear issues into the empty Chat dashboard", () => {
		const output = renderChatWithDashboard({
			...snapshot,
			chat: [],
			linearDashboard: {
				state       : "ready",
				projectName : "World Wide Woo",
				fetchedAt   : "2026-09-09T00:00:00.000Z",
				issues      : [{ id: "WOO-999", title: "Linear 대시보드", status: "In Progress", dueDate: null }],
				update      : null,
				comments    : [],
				milestones  : [],
				error       : null,
			},
		});
		expect(output).toContain("DASHBOARD · World Wide Woo");
		expect(output).toContain("NOW");
		expect(output).toContain("WOO-999");
		expect(output).toContain("Linear 대시보드");
		expect(output).toContain("In Progress");
	});

	test("keeps a failed Linear entry Dashboard visible with a recovery action", () => {
		const output = renderChatWithDashboard({
			...snapshot,
			chat       : [],
			activities : [],
			workFlow   : projectWorkFlow([]),
			linearDashboard: {
				state       : "unavailable",
				projectName : "World Wide Woo",
				fetchedAt   : null,
				issues      : [],
				update      : null,
				comments    : [],
				milestones  : [],
				error       : "Linear MCP 인증이 필요합니다.",
			},
		});
		expect(output).toContain("DASHBOARD · World Wide Woo");
		expect(output).toContain("Linear Dashboard unavailable");
		expect(output).toContain("Linear MCP 인증이 필요합니다.");
		expect(output).toContain("조치 · .www/workbench.yaml");
		expect(output).not.toContain("프로젝트 Workbench");
	});

	test("replaces the entry Dashboard with ordinary Chat after the first user message", () => {
		const active: WorkbenchSnapshot = {
			...snapshot,
			chat: [{ ...snapshot.chat[0]!, role: "user", content: "첫 요청" }],
			linearDashboard: {
				state       : "ready",
				projectName : "World Wide Woo",
				fetchedAt   : "2026-09-09T00:00:00.000Z",
				issues      : [{ id: "WOO-999", title: "숨겨질 요약", status: "Todo", dueDate: null }],
				update      : null,
				comments    : [],
				milestones  : [],
				error       : null,
			},
		};
		const output = stripTerminalSequences(new WorkbenchChatView(active).render(100).join("\n"));
		expect(output).toContain("첫 요청");
		expect(output).not.toContain("입장 Dashboard");
		expect(output).not.toContain("WOO-999");

		const todo = stripTerminalSequences(new WorkspaceTodoView(
			() => null,
			() => ({ activeTurnId: null, activities: active.activities, workFlow: projectWorkFlow([]), hasConversation: true }),
			() => active.linearDashboard,
		).render(60).join("\n"));
		expect(todo).toBe("TODO · 현재 계획 없음");
		expect(todo).not.toContain("Update · World Wide Woo");

		const tracer = stripTerminalSequences(new WorkbenchTracerView(() => ({
			...active,
			workFlow: projectWorkFlow([]),
		})).render(60).join("\n"));
		expect(tracer).toBe("");
		expect(tracer).not.toContain("일정 · World Wide Woo");
	});

	test("reuses the complete chat projection for scroll-only frames", () => {
		const count = 5_000;
		const activities = Array.from({ length: count }, (_, index) => ({
			...snapshot.activities[0]!,
			id         : `perf-${index}`,
			sequence   : index + 1,
			nativeRefs : { threadId: "thread-perf", itemId: `message-${index}` },
		}));
		const chat = activities.map((activity, index) => ({
			id         : `message-${index}`,
			role       : "assistant" as const,
			content    : `Result ${index} with stable markdown content`,
			activityId : activity.id,
			status     : "completed" as const,
		}));
		const view    = new WorkbenchChatView({ ...snapshot, activities, chat, tnotes: [], selectedActivityId: null }) ;
		const first   = view.render(100)                                                                               ;
		const started = performance.now()                                                                              ;
		for (let index = 0; index < 600; index += 1) expect(view.render(100)).toBe(first);
		const elapsed = performance.now() - started;
		expect(elapsed / 600).toBeLessThan(0.25);
	});
	test("shows a Note failure without assigning a completion number to an unstored note", () => {
		const failed = {
			...snapshot,
			activities: [
				{ ...snapshot.activities[0]!, nativeRefs: { threadId: "thread-1", turnId: "turn-1", itemId: "message-1" } },
				{
					...snapshot.activities[0]!,
					id: "turn-1-completed",
					sequence: 2,
					nativeRefs: { threadId: "thread-1", turnId: "turn-1" },
					payload: { method: "turn/completed" },
				},
			],
			tnotes: [],
			actionResult: {
				kind      : "tnote" as const,
				title     : "부가 기록 실패 · 요청 실행 계속",
				body      : "Note 저장에 실패했습니다.",
				createdAt : "2026-09-03T00:00:00.000Z",
			},
		};
		const output = stripTerminalSequences(new WorkbenchChatView(failed).render(100).join("\n"));
		expect(output).not.toMatch(/^🐙 Wooni\s+#1$/mu);
		expect(output).toContain("부가 기록 실패 · 요청 실행 계속");
		expect(output).not.toContain("질문 요약 자동 생성 보류");
		expect(output).toContain("Note 저장에 실패했습니다.");
	});

	test("keeps completed Notes in Dashboard and selected execution Source in Monitor", () => {
		const notes = stripTerminalSequences(new TNotesSourceView(() => snapshot).render(100).join("\n"));
		const monitor = stripTerminalSequences(new WorkbenchMonitorView(() => snapshot).render(100).join("\n"));
		expect(notes).toContain("결정 요약");
		 expect(notes).not.toContain("Trace·Source");
		 expect(monitor).toContain("Trace·Source · activity-1");
		 expect(monitor).not.toContain("thread-1");
		 expect(monitor).not.toContain("결정 요약");
	});

	test("renders the dashboard Tracer from Plan-linked public activities rather than Note summaries", () => {
		const command = {
			...snapshot.activities[0]!,
			id         : "dashboard-trace-command",
			kind       : "tool" as const,
			nativeRefs : { threadId: "thread-1", turnId: "turn-1", itemId: "command-1" },
			payload    : { method: "item/completed", params: { item: { type: "commandExecution", command: "bun test" } } },
		};
		const output = stripTerminalSequences(new WorkbenchTracerView(() => ({
			...snapshot,
			activities: [command],
			workFlow: fixtureWorkFlow([command]),
		})).render(100).join("\n"));
		expect(output).toContain("FLOW");
		expect(output).toContain("NOW");
		expect(output).toContain("bun test");
		expect(output).not.toContain("결정 요약");
	});

	test("shows each inferred Plan activity with an exact Trace address and readable public Source", () => {
		const command = {
			...snapshot.activities[0]!,
			id         : "trace-command",
			kind       : "tool" as const,
			nativeRefs : { threadId: "thread-1", turnId: "turn-1", itemId: "command-1" },
			payload: {
				method: "item/completed",
				params: { item: { type: "commandExecution", command: "bun test", aggregatedOutput: "3 pass", secretToken: "never-show" } },
			},
		};
		const traced: WorkbenchSnapshot = {
			...snapshot,
			activities         : [command],
			selectedActivityId : command.id,
			workFlow           : fixtureWorkFlow([command]),
		};
		const output = stripTerminalSequences(new WorkbenchMonitorView(() => traced).render(100).join("\n"));

		expect(output).toContain("Tracer · Native Plan과 관측 실행");
		expect(output).not.toContain("1/1 단계를 완료했습니다.");
		expect(output).toContain("Trace · inferred · 1개");
		expect(output).toContain("├─ 도구 commandExecution · completed");
		expect(output).toContain("trace-command · /trace trace-command");
		expect(output).toContain("공개 내용 · 보존된 관측 projection");
		expect(output).toContain('"command": "bun test"');
		expect(output).toContain('"aggregatedOutput": "3 pass"');
		expect(output).not.toContain("Native 참조");
		expect(output).not.toContain("never-show");
		for (const width of [40, 80, 120]) {
			const rows = new WorkbenchMonitorView(() => traced).render(width);
			expect(rows.every((row) => visibleWidth(row) <= width)).toBe(true);
		}
	});

	test("distinguishes an unavailable selected Source from a partial resumed journal", () => {
		const resumed: WorkbenchSnapshot = {
			...snapshot,
			activities: [],
			selectedActivityId: "activity-before-resume",
			resumeCoverage: {
				mode                         : "partial-local-journal",
				processAttachedAt            : "2026-09-07T00:00:00.000Z",
				priorProviderHistoryHydrated : false,
			},
		};
		const output = stripTerminalSequences(new WorkbenchMonitorView(() => resumed).render(80).join("\n"));

		expect(output).toContain("현재 요청에서 공개 Plan Source가 관측되지 않았습니다.");
		expect(output).toContain("선택한 Activity의 원본 부재");
		expect(output).toContain("다른 실행으로 대신하지 않았습니다.");
		expect(output).toContain("재개 뒤 이 프로세스가 수집한 Activity만 표시합니다.");
	});

	test("keeps resumed assistant output free of the selected Note recap", () => {
		const secondAssistant = {
			...snapshot.activities[0]!,
			id         : "assistant-second",
			sequence   : 5,
			nativeRefs : { threadId: "thread-1", turnId: "turn-second", itemId: "assistant-second" },
			payload    : { text: "두 번째 답변" },
		};
		const completed = [
			{ ...secondAssistant, id: "turn-second-completed", sequence: 6, kind: "progress" as const, payload: { method: "turn/completed" }, nativeRefs: { threadId: "thread-1", turnId: "turn-second" } },
		];
		const indexed: WorkbenchSnapshot = {
			...snapshot,
			activities: [completed[0]!, secondAssistant],
			chat: [
				{ id: "assistant-second", role: "assistant", content: "두 번째 답변", activityId: "assistant-second", status: "completed" },
			],
			selectedActivityId: "assistant-second",
			tnotes: [{
				id                : "note-second",
				title             : "두 번째 질문",
				summary           : "질문: 두 번째 질문\n왜: 선택한 완료 기록을 확인합니다.\n결과: source를 표시합니다.",
				sourceActivityIds : ["assistant-second", "turn-second-completed"],
				updatedAt         : "2026-09-01T00:00:02.000Z",
				completion: {
					threadId           : "thread-1",
					turnId             : "turn-second",
					number             : 2,
					terminalActivityId : "turn-second-completed",
				},
			} as WorkbenchSnapshot["tnotes"][number] & {
				completion: { threadId: string; turnId: string; number: number; terminalActivityId: string };
			}],
		};

		const output = stripTerminalSequences(new WorkbenchChatView(indexed).render(100).join("\n"));
		expect(output).toContain("두 번째 답변");
		expect(output).not.toContain("Note · 두 번째 질문");
		expect(output).not.toContain("sourceActivityIds · assistant-second, turn-second-completed");
	});

	test("keeps the live chat, streaming projection, and Todo while switching to the monitor projection", () => {
		const live: WorkbenchSnapshot = {
			...snapshot,
			activities: [
				...snapshot.activities,
				{
					...snapshot.activities[0]!,
					id         : "assistant-stream-activity",
					sequence   : 2,
					phase      : "updated" as const,
					nativeRefs : { threadId: "thread-1", turnId: "turn-1", itemId: "assistant-stream" },
					payload    : { text: "streaming response" },
				},
			],
			chat: [
				...snapshot.chat,
				{
					id         : "assistant-stream",
					role       : "assistant" as const,
					content    : "streaming response",
					activityId : "assistant-stream-activity",
					status     : "streaming" as const,
				},
			],
			draft: "partial response",
			todo: {
				version        : 1,
				revision       : 1,
				ownerSessionId : "workbench",
				storyId        : null,
				title          : "현재 Todo",
				updatedAt      : "2026-09-01T00:00:00.000Z",
				items: [{
					id: "todo-1",
					content: "전환 상태 보존",
					status: "in_progress",
					evidenceIds: [],
					details: [],
				}],
			},
			liveActivity: {
				method     : "item/commandExecution/outputDelta",
				kind       : "tool" as const,
				text       : "bun test",
				nativeRefs : { threadId: "thread-1", turnId: "turn-1", itemId: "tool-1" },
			},
		};
		let current   = live                                      ;
		const chat    = new WorkbenchChatView(current)            ;
		const monitor = new WorkbenchMonitorView(() => current)   ;
		const todo    = new WorkspaceTodoView(() => current.todo) ;

		const dashboardOutput = stripTerminalSequences(chat.render(80).join("\n"))    ;
		const monitorOutput   = stripTerminalSequences(monitor.render(80).join("\n")) ;
		const todoOutput      = stripTerminalSequences(todo.render(80).join("\n"))    ;

		expect(dashboardOutput).toContain("streaming response");
		expect(dashboardOutput).toContain("partial response");
		expect(monitorOutput).toContain("Monitor · 실행 관측");
		expect(monitorOutput).toContain("bun test");
		expect(todoOutput).toContain("전환 상태 보존");
		chat.update(current);
		expect(stripTerminalSequences(chat.render(80).join("\n"))).toContain("streaming response");
	});

	test("keeps public Native plan, compaction, collaboration, and reasoning summaries in transcript order", () => {
		const activities: WorkbenchSnapshot["activities"] = [
			{
				...snapshot.activities[0]!, id: "plan", sequence: 1, kind: "progress", phase: "updated",
				payload: { method: "turn/plan/updated", params: { plan: [
					{ step: "공용 컴포넌트 검증", status: "completed" },
					{ step: "화면 반영", status: "inProgress" },
				] } },
			},
			{
				...snapshot.activities[0]!, id: "compaction", sequence: 2, kind: "progress", phase: "completed",
				payload: { method: "item/completed", params: { item: { type: "contextCompaction" } } },
			},
			{
				...snapshot.activities[0]!, id: "collab", sequence: 3, kind: "tool", phase: "started",
				payload: { method: "item/started", params: { item: {
					type: "collabToolCall", tool: "spawn_agent", status: "inProgress", prompt: "Shared visual QA",
				} } },
			},
			{
				...snapshot.activities[0]!, id: "reasoning", sequence: 4, kind: "progress", phase: "completed",
				payload: { method: "item/completed", classification: "reasoning", redacted: true, publicSummary: "Planning semantic color token adjustments" },
			},
		];
		const output = stripTerminalSequences(new WorkbenchChatView({
			...snapshot,
			activities,
			chat: [],
			workFlow: fixtureWorkFlow(activities),
		}).render(88).join("\n"));

		expect(output).toContain("Plan updated");
		expect(output).toContain("✓ 공용 컴포넌트 검증");
		expect(output).toContain("▸ 화면 반영");
		expect(output).toContain("컨텍스트가 자동으로 압축됨");
		expect(output).toContain("Shared visual QA 작업 시작됨");
		expect(output).toContain("판단 · Planning semantic color token adjustments");
		expect(output.indexOf("Plan updated")).toBeLessThan(output.indexOf("컨텍스트가 자동으로 압축됨"));
	});
});

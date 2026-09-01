import { describe, expect, test } from "bun:test";
import { renderLayoutFrame } from "@earendil-works/pi-tui/dist/layout.js";
import type { LayoutBox } from "@earendil-works/pi-tui/dist/layout.js";
import { stripTerminalSequences } from "@earendil-works/pi-tui";
import type { WorkbenchSnapshot } from "../src/domain/workbench";
import { createDashboardLayout } from "../src/presentation/tui/dashboard-layout";
import {
	StatusLine,
	WorkspaceTodoView,
} from "../src/presentation/tui/shared-dashboard-views";
import { TNotesSourceView, WorkbenchChatView } from "../src/presentation/tui/workbench-views";
import { WORKBENCH_STATUS_NOTICE } from "../src/presentation/tui/workbench-shell";
import { boundedPublicProjection } from "../src/presentation/tui/bounded-public-projection";
import { projectWorkFlow } from "../src/domain/work-steps";

const snapshot: WorkbenchSnapshot = {
	projectId: "sample-project",
	revision: 3,
	journalSequence: 1,
	phase: "ready",
	threadId: "thread-1",
	activeTurnId: null,
	activities: [{
		schemaVersion: 1,
		id: "activity-1",
		projectId: "sample-project",
		sequence: 1,
		recordedAt: "2026-09-01T00:00:00.000Z",
		kind: "message",
		phase: "completed",
		provider: "openai-codex",
		nativeRefs: { threadId: "thread-1", itemId: "message-1" },
		sourceDigest: `sha256:${"a".repeat(64)}`,
		payload: { text: "완료했습니다." },
	}],
	selectedActivityId: "activity-1",
	pendingApproval: null,
	chat: [{
		id: "message-1",
		role: "assistant",
		content: "완료했습니다.",
		activityId: "activity-1",
		status: "completed",
	}],
	chatQueue: [],
	draft: "",
	reasoningDraft: "",
	liveActivity: null,
	workFlow: projectWorkFlow([]),
	tnotes: [{
		id: "note-1",
		title: "결정 요약",
		summary: "Native 응답을 정리했다.",
		sourceActivityIds: ["activity-1"],
		updatedAt: "2026-09-01T00:00:01.000Z",
	}],
	todo: null,
	actionResult: null,
	error: null,
};

function allScrollContent(box: LayoutBox): string[] {
	return [...(box.scrollContentLines ?? []), ...box.children.flatMap(allScrollContent)];
}

describe("workbench dashboard views", () => {
	test("does not revive an older turn when the latest turn is still preparing its plan", () => {
		const activities: WorkbenchSnapshot["activities"] = [
			{
				...snapshot.activities[0]!,
				id: "old-user",
				sequence: 1,
				kind: "message",
				phase: "completed",
				nativeRefs: { threadId: "thread-1", itemId: "old-user" },
				payload: { direction: "outbound", role: "user", text: "이전 요청" },
			},
			{
				...snapshot.activities[0]!,
				id: "old-turn-start",
				sequence: 2,
				kind: "progress",
				phase: "started",
				nativeRefs: { threadId: "thread-1", turnId: "turn-old" },
				payload: { method: "turn/started" },
			},
			{
				...snapshot.activities[0]!,
				id: "old-command",
				sequence: 3,
				kind: "tool",
				phase: "completed",
				nativeRefs: { threadId: "thread-1", turnId: "turn-old", itemId: "old-command" },
				payload: {
					method: "item/completed",
					params: { item: { type: "commandExecution", command: "bun test stale-old-turn" } },
				},
			},
			{
				...snapshot.activities[0]!,
				id: "current-user",
				sequence: 4,
				kind: "message",
				phase: "completed",
				nativeRefs: { threadId: "thread-1", itemId: "current-user" },
				payload: { direction: "outbound", role: "user", text: "현재 요청" },
			},
			{
				...snapshot.activities[0]!,
				id: "current-turn-start",
				sequence: 5,
				kind: "progress",
				phase: "started",
				nativeRefs: { threadId: "thread-1", turnId: "turn-current" },
				payload: { method: "turn/started" },
			},
		];
		const workFlow = projectWorkFlow(activities);
		const output = stripTerminalSequences(new WorkbenchChatView({
			...snapshot,
			activities,
			chat: [],
			workFlow,
		}).render(72).join("\n"));

		expect(workFlow.goal).toBe("현재 요청");
		expect(workFlow.steps).toEqual([]);
		expect(output).not.toContain("stale-old-turn");
		expect(output).not.toContain("단계 1");
	});

	test("keeps plan-only steps out of Chat while showing compact observation work", () => {
		const activities: WorkbenchSnapshot["activities"] = [
			{
				...snapshot.activities[0]!,
				id: "goal-message",
				sequence: 1,
				kind: "message",
				phase: "started",
				payload: { direction: "outbound", role: "user", text: "Executor 흐름과 Live T-notes를 구현한다" },
			},
			{
				...snapshot.activities[0]!,
				id: "plan-update",
				sequence: 2,
				kind: "progress",
				phase: "updated",
				nativeRefs: { threadId: "thread-1", turnId: "turn-1" },
				payload: {
					method: "turn/plan/updated",
					params: {
						plan: [
							{ step: "의미 Step 경계 구현", status: "completed" },
							{ step: "Live T-notes 흐름 연결", status: "inProgress" },
						],
					},
				},
			},
			{
				...snapshot.activities[0]!,
				id: "read-command",
				sequence: 3,
				kind: "tool",
				phase: "completed",
				nativeRefs: { threadId: "thread-1", turnId: "turn-1", itemId: "read-1" },
				payload: {
					method: "item/completed",
					params: {
						item: {
							type: "commandExecution",
							command: "sed -n '1,120p' src/app.ts",
							aggregatedOutput: "src/app.ts: application bootstrap",
							exitCode: 0,
						},
					},
				},
			},
		];
		const workFlow = projectWorkFlow(activities);
		const live = { ...snapshot, activities, chat: [], workFlow };
		const chat = stripTerminalSequences(new WorkbenchChatView(live).render(72).join("\n"));
		const notes = stripTerminalSequences(new TNotesSourceView(() => live).render(52).join("\n"));

		expect(chat).not.toContain("단계 1");
		expect(chat).not.toContain("단계 2");
		expect(chat).toContain("Read");
		expect(chat).toContain("sed -n");
		expect(chat).toContain("application bootstrap");
		expect(notes).not.toContain("T-NOTES · LIVE");
		expect(notes).not.toContain("Executor 흐름과 Live T-notes를 구현한다");
		expect(notes).not.toContain("Live T-notes 흐름 연결");
		expect(notes).toContain("SESSION SUMMARY 1");
		expect(notes).toContain("Native 응답을 정리했다.");
	});

	test("adds only the plan step that has a real-time execution activity to Chat", () => {
		const activities: WorkbenchSnapshot["activities"] = [
			{
				...snapshot.activities[0]!,
				id: "plan-update",
				sequence: 1,
				kind: "progress",
				phase: "updated",
				nativeRefs: { threadId: "thread-1", turnId: "turn-1" },
				payload: {
					method: "turn/plan/updated",
					params: {
						plan: [
							{ step: "현재 구현", status: "inProgress" },
							{ step: "후속 검증", status: "pending" },
						],
					},
				},
			},
			{
				...snapshot.activities[0]!,
				id: "current-change",
				sequence: 2,
				kind: "file-change",
				phase: "started",
				nativeRefs: { threadId: "thread-1", turnId: "turn-1", itemId: "change-1" },
				payload: {
					method: "item/started",
					params: { item: { type: "fileChange", changes: [{ path: "src/current.ts", kind: "update" }] } },
				},
			},
		];
		const workFlow = projectWorkFlow(activities);
		const output = stripTerminalSequences(new WorkbenchChatView({
			...snapshot,
			activities,
			chat: [],
			workFlow,
		}).render(72).join("\n"));

		expect(output).toContain("단계 1 · RUNNING");
		expect(output).toContain("현재 구현");
		expect(output).not.toContain("단계 2");
		expect(output).not.toContain("후속 검증");
	});

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
		const initial = projectWorkFlow(activities);
		const workFlow = projectWorkFlow(activities, new Map([[initial.steps[0]!.id, {
			what: "Native 이벤트를 의미 있는 작업 단계로 묶습니다.",
			why: "Read 기록과 사용자에게 보여줄 실행 흐름을 분리하기 위해서입니다.",
			inputSummary: ["의미 Step 집계 Module 추가"],
			source: "model" as const,
		}]]));
		const output = stripTerminalSequences(new WorkbenchChatView({
			...snapshot,
			activities,
			chat: [],
			workFlow,
		}).render(76).join("\n"));

		expect(output).toContain("Native 이벤트를 의미 있는 작업 단계로 묶습니다.");
		expect(output).not.toContain("무엇을 하고 있는지:");
		expect(output).toContain("왜 하는지: Read 기록과 사용자에게 보여줄 실행 흐름을 분리하기 위해서");
		expect(output).toContain("의미 Step 집계 Module 추가");
		expect(output).not.toContain("작업 입력 해석 중");
	});

	test("hides empty Todo and T-note counters", () => {
		const emptySnapshot = { ...snapshot, tnotes: [], todo: null };
		const tnotesOutput = stripTerminalSequences(new TNotesSourceView(() => emptySnapshot).render(80).join("\n"));
		const todoOutput = stripTerminalSequences(new WorkspaceTodoView(() => null).render(80).join("\n"));

		expect(tnotesOutput).not.toContain("T-NOTES 0");
		expect(todoOutput).not.toContain("TODO 0/0");
		expect(tnotesOutput).toContain("충분한 작업이 완료되면 세션 요약을 자동으로 정리합니다");
		expect(todoOutput).toContain("진행 중인 작업 없음");
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

	test("explains a pending approval and tells the user how to respond", () => {
		const pending: WorkbenchSnapshot = {
			...snapshot,
			pendingApproval: {
				requestId: 17,
				callbackId: null,
				kind: "command",
				refs: { threadId: "thread-1", turnId: "turn-1", itemId: "item-1" },
				availableDecisions: ["accept", "acceptForSession", "decline"],
				params: {
					reason: "변경이 동작하는지 테스트해야 합니다.",
					command: "bun test test/workbench-views.test.ts",
					cwd: "/workspace/sample-project",
				},
			},
			chatQueue: [{
				id: "queued-1",
				content: "테스트 결과를 설명해줘",
				queuedAt: "2026-09-01T00:00:03.000Z",
			}],
		};
		const output = stripTerminalSequences(new WorkbenchChatView(pending).render(100).join("\n"));

		expect(output).toContain("승인 필요 · 명령");
		expect(output).toContain("명령 · bun test test/workbench-views.test.ts");
		expect(output).toContain("이유 · 변경이 동작하는지 테스트해야 합니다.");
		expect(output).toContain("경로 · /workspace/sample-project");
		expect(output).toContain("승인 /approve · 세션 /approve-session · 거절 /decline");
		expect(output).toContain("대기 메시지 1개");
	});

	test("redacts a historical completed reasoning envelope from Source", () => {
		const reasoning: WorkbenchSnapshot = {
			...snapshot,
			activities: [{
				...snapshot.activities[0]!,
				id: "reasoning-completed",
				kind: "progress",
				payload: {
					method: "item/completed",
					params: { item: { type: "reasoning", text: "비공개 reasoning 원문", summary: "비공개 요약" } },
				},
			}],
			selectedActivityId: "reasoning-completed",
			chat: [],
		};
		const output = stripTerminalSequences(new TNotesSourceView(() => reasoning).render(80).join("\n"));
		expect(output).toContain('"classification": "reasoning"');
		expect(output).toContain("비공개 내용 생략");
		expect(output).not.toContain("비공개 reasoning 원문");
		expect(output).not.toContain("비공개 요약");
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
							type: "commandExecution",
							command: "bun test test/workbench-views.test.ts",
							cwd: "/workspace/sample",
							aggregatedOutput: Array.from({ length: 20 }, (_, index) => `result-${String(index + 1).padStart(2, "0")}`).join("\n"),
							exitCode: 0,
							hiddenReasoning: "사용자에게 보여서는 안 되는 추론",
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
			workFlow: projectWorkFlow(command.activities),
		}).render(70).join("\n"));
		expect(output).toContain("단계 1 · PASSED");
		expect(output).toContain("변경 결과 검증");
		expect(output).toContain("command: bun test [redacted:local-path]");
		expect(output).not.toContain("왜 하는지:");
		expect(output).toContain("입력 요약");
		expect(output).not.toContain("/workspace/sample");
		expect(output).toContain("출력 요약");
		expect(output).toContain("result-20");
		expect(output).toContain("이전 출력");
		expect(output).not.toContain("result-01");
		expect(output).not.toContain("rawEnvelope");
		expect(output).not.toContain("thread-secret");
		expect(output).not.toContain("hiddenReasoning");
		expect(output).not.toContain("사용자에게 보여서는 안 되는 추론");
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
				method: "item/commandExecution/outputDelta",
				kind: "tool",
				text: "12 pass\n1 fail\n",
				nativeRefs: { threadId: "thread-1", turnId: "turn-1", itemId: "command-2" },
			},
		};
		const output = stripTerminalSequences(new WorkbenchChatView({
			...running,
			workFlow: projectWorkFlow(running.activities),
		}).render(62).join("\n"));
		expect(output).toContain("단계 1 · RUNNING");
		expect(output).toContain("변경 결과 검증");
		expect(output).not.toContain("왜 하는지:");
		expect(output).toContain("12 pass");
		expect(output).toContain("1 fail");
		expect(output).not.toContain("outputDelta");
		expect(output.match(/단계 1/gu)).toHaveLength(1);
	});

	test("numbers only visible work steps consecutively", () => {
		const steps: WorkbenchSnapshot = {
			...snapshot,
			journalSequence: 9,
			activities: [
				{
					...snapshot.activities[0]!,
					id: "hidden-progress",
					sequence: 2,
					kind: "progress",
					payload: { method: "turn/started" },
				},
				{
					...snapshot.activities[0]!,
					id: "visible-command",
					sequence: 4,
					kind: "tool",
					nativeRefs: { itemId: "command-visible" },
					payload: { method: "item/completed", params: { item: { type: "commandExecution", command: "bun test" } } },
				},
				{
					...snapshot.activities[0]!,
					id: "visible-file-change",
					sequence: 9,
					kind: "file-change",
					nativeRefs: { itemId: "file-visible" },
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
			workFlow: projectWorkFlow(steps.activities),
		}).render(70).join("\n"));
		expect(output).toContain("단계 1 · PASSED");
		expect(output).toContain("단계 2 · PASSED");
		expect(output.indexOf("단계 1")).toBeLessThan(output.indexOf("단계 2"));
		expect(output).not.toContain("단계 4");
		expect(output).not.toContain("단계 9");
	});

	test("shows queued user inputs in their delivery order", () => {
		const queued: WorkbenchSnapshot = {
			...snapshot,
			chatQueue: [
				{ id: "queue-secret-1", content: "첫 번째 후속 요청", queuedAt: "2026-09-01T00:00:02.000Z" },
				{ id: "queue-secret-2", content: "두 번째 후속 요청", queuedAt: "2026-09-01T00:00:03.000Z" },
			],
		};
		const output = stripTerminalSequences(new WorkbenchChatView(queued).render(62).join("\n"));
		expect(output).toContain("user · 대기 1");
		expect(output).toContain("첫 번째 후속 요청");
		expect(output).toContain("user · 대기 2");
		expect(output).toContain("두 번째 후속 요청");
		expect(output.indexOf("첫 번째 후속 요청")).toBeLessThan(output.indexOf("두 번째 후속 요청"));
		expect(output).not.toContain("queue-secret");
		expect(output).not.toContain("2026-09-01T00:00");
	});

	test("keeps an uncertain delivery warning and its recovery command visible", () => {
		const uncertain: WorkbenchSnapshot = {
			...snapshot,
			phase: "error",
			error: "Native turn/start 요청의 수신 여부가 불명확합니다. accessToken=source-token-secret",
		};
		const output = stripTerminalSequences(new WorkbenchChatView(uncertain).render(70).join("\n"));
		expect(output).toContain("확인이 필요한 상태");
		expect(output).toContain("수신 여부가 불명확합니다");
		expect(output).toContain("/cancel로 서버 상태를 확인합니다");
		expect(output).not.toContain("source-token-secret");
	});

	test.each([
		["failed", "전송 실패"],
		["streaming", "전송 중"],
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
		expect(output).toContain(`user · ${label}`);
		expect(output).toContain("전달 상태를 확인할 요청");
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
				nativeRefs: { itemId: "mcp-1" },
				payload: {
					method: "item/completed",
					params: {
						item: {
							type: "mcpToolCall",
							server: "github",
							tool: "create_issue",
							arguments: { title: "native workbench" },
							status: "failed",
							error: { message: "rate limited", hiddenReasoning: "비공개 판단" },
						},
					},
				},
			}],
			chat: [],
			selectedActivityId: null,
		};
		const output = stripTerminalSequences(new WorkbenchChatView({
			...failedTool,
			workFlow: projectWorkFlow(failedTool.activities),
		}).render(70).join("\n"));
		expect(output).toContain("단계 1 · FAILED");
		expect(output).toContain("create_issue 입력 해석 중");
		expect(output).toContain("args: {\"title\":\"native workbench\"}");
		expect(output).toContain("error: {\"message\":\"rate limited\"}");
		expect(output).not.toContain("hiddenReasoning");
		expect(output).not.toContain("비공개 판단");
	});

	test("bounds completed and draft Markdown with head and tail while preserving snapshot content", () => {
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
		expect(output).not.toContain("completed-line-100");
		expect(output).toContain("draft-line-001");
		expect(output).toContain("draft-line-200");
		expect(output).not.toContain("draft-line-100");
		expect(output.match(/응답 일부 생략/gu)).toHaveLength(2);
		expect(large.chat[0]?.content).toBe(completed);
		expect(large.draft).toBe(draft);
	});

	test("bounds a long native transcript to recent activities and marks omitted history", () => {
		const activities = Array.from({ length: 180 }, (_, index) => ({
			...snapshot.activities[0]!,
			id: `activity-${index + 1}`,
			sequence: index + 1,
			nativeRefs: { itemId: `message-${index + 1}` },
			payload: { text: `assistant-message-${String(index + 1).padStart(3, "0")}` },
		}));
		const chat = activities.map((activity, index) => ({
			id: `message-${index + 1}`,
			role: "assistant" as const,
			content: `assistant-message-${String(index + 1).padStart(3, "0")}`,
			activityId: activity.id,
			status: "completed" as const,
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
		expect(output).toContain("이전 활동 100개 생략");
		expect(output).not.toContain("assistant-message-001");
		expect(output).not.toContain("assistant-message-100");
		expect(output).toContain("assistant-message-101");
		expect(output).toContain("assistant-message-180");

		view.update({ ...longSession, draft: "새 응답" });
		const updated = stripTerminalSequences(view.render(80).join("\n"));
		expect(updated).toContain("이전 활동 100개 생략");
		expect(updated).toContain("assistant-message-180");
		expect(updated).toContain("새 응답");
	});

	test("advertises only commands and exit keys supported by the native shell", () => {
		const output = stripTerminalSequences(new StatusLine(WORKBENCH_STATUS_NOTICE).render(240).join("\n"));
		expect(output).toContain("/source");
		expect(output).toContain("/approve-session");
		expect(output).toContain("Esc 중단");
		expect(output).toContain("Ctrl+C 두 번 종료");
		expect(output).toContain("Ctrl+D(빈 입력) 종료");
		expect(output).not.toContain("! 터미널");
		expect(output).not.toContain("/model");
		expect(output).not.toContain("/usage");
	});

	test("shows note identifiers and the complete immutable action result", () => {
		const withAction = {
			...snapshot,
			actionResult: {
				kind: "promotion",
				title: "T-note promotion preview",
				body: "--- Todo.md\n+++ Todo.md\n@@\n- old\n+ new\ncurrentSource: # current\npending: # pending",
				digest: "a".repeat(64),
				createdAt: "2026-09-01T00:00:02.000Z",
			},
		} as WorkbenchSnapshot;
		const output = stripTerminalSequences(new TNotesSourceView(() => withAction).render(100).join("\n"));
		expect(output).toContain("note-1");
		expect(output).toContain("ACTION · promotion · T-note promotion preview");
		expect(output).toContain("- old");
		expect(output).toContain("+ new");
		expect(output).toContain("currentSource: # current");
		expect(output).toContain("pending: # pending");
	});

	test("shows only public activity metadata and a filtered payload in Source", () => {
		const selected: WorkbenchSnapshot = {
			...snapshot,
			journalSequence: 7,
			activities: [{
				...snapshot.activities[0]!,
				id: "activity-public-7",
				sequence: 7,
				kind: "tool",
				phase: "completed",
				provider: "openai-codex",
				nativeRefs: { threadId: "thread-secret", turnId: "turn-secret", itemId: "item-secret" },
				sourceDigest: `sha256:${"b".repeat(64)}`,
				payload: {
					method: "item/completed",
					params: {
						item: {
							id: "native-item-secret",
							type: "commandExecution",
							command: "bun test",
							aggregatedOutput: "12 pass",
							hiddenReasoning: "비공개 판단",
							accessToken: "source-token-secret",
						},
						rawEnvelope: { requestId: "rpc-secret", noisy: true },
					},
				},
			}],
			selectedActivityId: "activity-public-7",
			chat: [],
		};
		const output = stripTerminalSequences(new TNotesSourceView(() => selected).render(100).join("\n"));
		expect(output).toContain('"activityId": "activity-public-7"');
		expect(output).toContain('"sequence": 7');
		expect(output).toContain('"kind": "tool"');
		expect(output).toContain('"phase": "completed"');
		expect(output).toContain('"provider": "openai-codex"');
		expect(output).toContain('"command": "bun test"');
		expect(output).toContain('"aggregatedOutput": "12 pass"');
		expect(output).not.toContain("nativeRefs");
		expect(output).not.toContain("sourceDigest");
		expect(output).not.toContain("thread-secret");
		expect(output).not.toContain("native-item-secret");
		expect(output).not.toContain("rawEnvelope");
		expect(output).not.toContain("hiddenReasoning");
		expect(output).not.toContain("accessToken");
		expect(output).not.toContain("source-token-secret");
		expect(output).not.toContain("rpc-secret");
	});

	test("bounds public Source strings and total projection before JSON rendering", () => {
		const hugeOutput = `output-start AWS_SECRET_ACCESS_KEY=very-secret-value \u001b]0;front-osc-secret\u0007 https://user:password@example.com ${"x".repeat(5 * 1024 * 1024)} \u001b]2;tail-osc-secret\u0007 tail_token=tail-secret-value AKIA1234567890ABCDEF output-end`;
		const hugePayload = {
			method: "item/completed",
			params: {
				item: {
					type: "commandExecution",
					command: "large-output-command",
					aggregatedOutput: hugeOutput,
					accessToken: "source-token-secret",
					hiddenReasoning: "비공개 판단",
				},
				many: Object.fromEntries(Array.from({ length: 2_000 }, (_, index) => [`field-${index}`, "v".repeat(200)])),
			},
		};
		const startedAt = performance.now();
		const projection = boundedPublicProjection(hugePayload);
		const serialized = JSON.stringify(projection.value);
		expect(projection.omitted).toBe(true);
		expect(serialized.length).toBeLessThan(20_000);
		expect(serialized).toContain("output-start");
		expect(serialized).toContain("output-end");
		expect(serialized).not.toContain("source-token-secret");
		expect(serialized).not.toContain("비공개 판단");
		expect(serialized).not.toContain("very-secret-value");
		expect(serialized).not.toContain("front-osc-secret");
		expect(serialized).not.toContain("tail-osc-secret");
		expect(serialized).not.toContain("tail-secret-value");
		expect(serialized).not.toContain("user:password");
		expect(serialized).not.toContain("AKIA1234567890ABCDEF");

		const selected: WorkbenchSnapshot = {
			...snapshot,
			activities: [{ ...snapshot.activities[0]!, payload: hugePayload }],
			selectedActivityId: "activity-1",
		};
		const sourceView = new TNotesSourceView(() => selected);
		const output = stripTerminalSequences(sourceView.render(100).join("\n"));
		const repeated = stripTerminalSequences(sourceView.render(100).join("\n"));
		expect(performance.now() - startedAt).toBeLessThan(500);
		expect(output).toContain("공개 Source 일부 생략");
		expect(output).toContain("large-output-command");
		expect(output).toContain("output-start");
		expect(output).toContain("output-end");
		expect(output).not.toContain("source-token-secret");
		expect(output).not.toContain("비공개 판단");
		expect(output).not.toContain("very-secret-value");
		expect(output).not.toContain("front-osc-secret");
		expect(output).not.toContain("tail-osc-secret");
		expect(output).not.toContain("tail-secret-value");
		expect(repeated).toBe(output);
		expect(hugePayload.params.item.aggregatedOutput).toBe(hugeOutput);
	});

	test("bounds large work-step output without leaking edge credentials", () => {
		const outputText = `step-start password=front-password ${"x".repeat(3 * 1024 * 1024)} token=tail-token step-end`;
		const command: WorkbenchSnapshot = {
			...snapshot,
			activities: [{
				...snapshot.activities[0]!,
				id: "bounded-command",
				kind: "tool",
				payload: {
					method: "item/completed",
					params: { item: { type: "commandExecution", command: "large-command", aggregatedOutput: outputText } },
				},
			}],
			chat: [],
			selectedActivityId: null,
		};
		const output = stripTerminalSequences(new WorkbenchChatView({
			...command,
			workFlow: projectWorkFlow(command.activities),
		}).render(100).join("\n"));
		expect(output).toContain("step-end");
		expect(output).not.toContain("front-password");
		expect(output).not.toContain("tail-token");
		expect(output.length).toBeLessThan(8_000);
	});

	test("bounds action result body by characters and lines before rendering Source", () => {
		const actionOnly: WorkbenchSnapshot = {
			...snapshot,
			activities: [],
			chat: [],
			selectedActivityId: null,
			actionResult: {
				kind: "promotion",
				title: "large preview",
				body: [
					`action-start password=front-password ${"x".repeat(3 * 1024 * 1024)}`,
					...Array.from({ length: 220 }, (_, index) => `line-${String(index).padStart(3, "0")}`),
					"action-end token=tail-token",
				].join("\n"),
				digest: undefined,
				createdAt: "2026-09-01T00:00:02.000Z",
			},
		};
		const output = stripTerminalSequences(new TNotesSourceView(() => actionOnly).render(100).join("\n"));
		expect(output).toContain("action-start password=[redacted]");
		expect(output).toContain("action-end token=[redacted]");
		expect(output).toContain("ACTION 일부 생략");
		expect(output).not.toContain("front-password");
		expect(output).not.toContain("tail-token");
		expect(output.length).toBeLessThan(16_000);
		expect(output.split("\n").length).toBeLessThanOrEqual(90);
	});

	test.each([[120, 30], [70, 24]])("keeps titleless Chat, T-notes source, and Todo reachable at %ix%i", (width, height) => {
		const layout = createDashboardLayout(
			() => "WWW · sample-project",
			{ color: text => text, component: new WorkbenchChatView(snapshot) },
			{ title: "T-notes · 세션 요약", color: text => text, component: new TNotesSourceView(() => snapshot) },
			{ title: "Todo.md · 현재 작업", color: text => text, component: new WorkspaceTodoView(() => snapshot.todo) },
		);
		const frame = renderLayoutFrame(layout.component, width, height, () => undefined);
		const output = stripTerminalSequences([
			...frame.lines,
			...allScrollContent(frame.root),
		].join("\n"));
		expect(output).not.toContain("Chat · Native");
		expect(output).toContain("T-notes · 세션 요약");
		expect(output).toContain("Todo.md · 현재 작업");
		expect(output).toContain("결정 요약");
		expect(output).toContain("SOURCE");
	});
});

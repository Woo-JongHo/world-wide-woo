import { describe, expect, test } from "bun:test";
import { renderLayoutFrame } from "@earendil-works/pi-tui/dist/layout.js";
import type { LayoutBox } from "@earendil-works/pi-tui/dist/layout.js";
import { stripTerminalSequences, visibleWidth } from "@earendil-works/pi-tui";
import chalk from "chalk";
import type { WorkbenchSnapshot } from "../src/domain/workbench";
import { createDashboardLayout } from "../src/presentation/tui/dashboard-layout";
import {
	StatusLine,
	WorkspaceTodoView,
} from "../src/presentation/tui/shared-dashboard-views";
import { TNotesSourceView, WorkbenchChatView, WorkbenchMonitorView } from "../src/presentation/tui/workbench-views";
import { WORKBENCH_STATUS_NOTICE } from "../src/presentation/tui/workbench-shell";
import { boundedPublicProjection } from "../src/presentation/tui/bounded-public-projection";
import { projectWorkFlow, type DplanHash } from "../src/domain/work-steps";

const hash: DplanHash = {
	sha256Hex: (input) => new Bun.CryptoHasher("sha256").update(input).digest("hex"),
};

function fixtureWorkFlow(activities: WorkbenchSnapshot["activities"]) {
	const source = [...activities].reverse().find(activity =>
		(activity.payload.method === "turn/start" || activity.payload.method === "turn/started")
		&& activity.nativeRefs.threadId && activity.nativeRefs.turnId,
	) ?? [...activities].reverse().find(activity => activity.nativeRefs.threadId && activity.nativeRefs.turnId);
	const threadId = source?.nativeRefs.threadId
		?? activities.find(activity => activity.nativeRefs.threadId)?.nativeRefs.threadId
		?? "fixture-thread";
	const turnId = source?.nativeRefs.turnId ?? "fixture-turn";
	const hasPlan = activities.some(activity => activity.payload.method === "turn/plan/updated");
	const hasTurnStart = activities.some(activity =>
		activity.payload.method === "turn/start" || activity.payload.method === "turn/started",
	);
	const normalized = activities.map((activity, index) => ({
		...activity,
		sequence: index + (hasPlan ? 2 : 3),
		kind: !hasPlan && activity.kind === "tool" ? "file-change" as const : activity.kind,
		nativeRefs: {
			...activity.nativeRefs,
			threadId: activity.nativeRefs.threadId ?? threadId,
			turnId: activity.nativeRefs.turnId ?? turnId,
		},
	}));
	const sourceItem = activities.find(activity => activity.kind === "tool")?.payload.params as { item?: { tool?: string; status?: string } } | undefined;
	const title = sourceItem?.item?.tool ? `${sourceItem.item.tool} 입력 해석 중` : "변경 결과 검증";
	const status = sourceItem?.item?.status === "failed" ? "failed" : normalized.some(activity => activity.phase === "started") ? "inProgress" : "completed";
	const plan = hasPlan || hasTurnStart ? [] : [{
		...normalized[0]!,
		id: "fixture-plan",
		sequence: 2,
		kind: "progress" as const,
		phase: "updated" as const,
		nativeRefs: { threadId, turnId },
		payload: { method: "turn/plan/updated", params: { plan: [{ step: title, status: "inProgress" }] } },
	}];
	const finalPlan = hasPlan || hasTurnStart ? [] : [{
		...plan[0]!,
		id: "fixture-plan-final",
		sequence: normalized.length + 3,
		payload: { method: "turn/plan/updated", params: { plan: [{ step: title, status }] } },
	}];
	return projectWorkFlow([{
		...normalized[0]!,
		id: "fixture-turn-start",
		sequence: 1,
		kind: "progress",
		phase: "started",
		nativeRefs: { threadId, turnId },
		payload: { method: "turn/started" },
	}, ...plan, ...normalized, ...finalPlan], new Map(), { expectedThreadKey: threadId, selectedTurnId: turnId, hash });
}

const snapshot: WorkbenchSnapshot = {
	projectId: "sample-project",
	revision: 3,
	journalSequence: 1,
	phase: "ready",
	mcpServers: [],
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
		summary: "질문: 결정 요약\n왜: 완료된 질문의 이유를 남깁니다.\n결과: Native 응답을 정리했습니다.",
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
	test("keeps the live chat, streaming projection, and Todo while switching to the monitor projection", () => {
		const live: WorkbenchSnapshot = {
			...snapshot,
			activities: [
				...snapshot.activities,
				{
					...snapshot.activities[0]!,
					id: "assistant-stream-activity",
					sequence: 2,
					phase: "updated" as const,
					nativeRefs: { threadId: "thread-1", turnId: "turn-1", itemId: "assistant-stream" },
					payload: { text: "streaming response" },
				},
			],
			chat: [
				...snapshot.chat,
				{
					id: "assistant-stream",
					role: "assistant" as const,
					content: "streaming response",
					activityId: "assistant-stream-activity",
					status: "streaming" as const,
				},
			],
			draft: "partial response",
			todo: {
				version: 1,
				revision: 1,
				ownerSessionId: "workbench",
				storyId: null,
				title: "현재 Todo",
				updatedAt: "2026-09-01T00:00:00.000Z",
				items: [{
					id: "todo-1",
					content: "전환 상태 보존",
					status: "in_progress",
					evidenceIds: [],
					details: [],
				}],
			},
			liveActivity: {
				method: "item/commandExecution/outputDelta",
				kind: "tool" as const,
				text: "bun test",
				nativeRefs: { threadId: "thread-1", turnId: "turn-1", itemId: "tool-1" },
			},
		};
		let current = live;
		const chat = new WorkbenchChatView(current);
		const monitor = new WorkbenchMonitorView(() => current);
		const todo = new WorkspaceTodoView(() => current.todo);

		const dashboardOutput = stripTerminalSequences(chat.render(80).join("\n"));
		const monitorOutput = stripTerminalSequences(monitor.render(80).join("\n"));
		const todoOutput = stripTerminalSequences(todo.render(80).join("\n"));

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

	test("uses one filled user surface and an open assistant transcript", () => {
		const activities: WorkbenchSnapshot["activities"] = [
			{
				...snapshot.activities[0]!,
				id: "user-surface",
				sequence: 1,
				nativeRefs: { threadId: "thread-1", turnId: "turn-surface", itemId: "user-surface" },
				payload: { role: "user", text: "배경을 가진 질문" },
			},
			{
				...snapshot.activities[0]!,
				id: "assistant-transcript",
				sequence: 2,
				nativeRefs: { threadId: "thread-1", turnId: "turn-surface", itemId: "assistant-transcript" },
				payload: { role: "assistant", text: "열린 답변" },
			},
		];
		const view = new WorkbenchChatView({
			...snapshot,
			activities,
			chat: [
				{ id: "user-surface", role: "user", content: "배경을 가진 질문", activityId: "user-surface", status: "completed" },
				{ id: "assistant-transcript", role: "assistant", content: "열린 답변", activityId: "assistant-transcript", status: "completed" },
			],
			workFlow: projectWorkFlow([]),
		});
		const rows = view.render(48);
		const plain = rows.map((line) => stripTerminalSequences(line));
		const userLabel = plain.findIndex((line) => line.trimEnd() === "user");
		const assistantLabel = plain.findIndex((line) => line === "bori");

		expect(userLabel).toBeGreaterThanOrEqual(0);
		expect(assistantLabel).toBeGreaterThan(userLabel);
		expect(visibleWidth(rows[userLabel]!)).toBe(48);
		expect(visibleWidth(rows[assistantLabel]!)).toBeLessThan(48);
		expect(plain.join("\n")).toContain("배경을 가진 질문");
		expect(plain.join("\n")).toContain("열린 답변");
	});

	test("renders the live action and its Esc hint as separate rows", () => {
		const view = new WorkbenchChatView(snapshot);
		view.syncActivity({
			message: "단계 2/3 · 입출력 UX 정리",
			hint: "Esc 중단",
			frames: ["⠹"],
			intervalMs: 1_000,
		}, () => undefined);
		const rows = view.render(60).map((line) => stripTerminalSequences(line));
		view.dispose();
		const activityRow = rows.findIndex((line) => line.includes("단계 2/3 · 입출력 UX 정리"));

		expect(activityRow).toBeGreaterThanOrEqual(0);
		expect(rows[activityRow]).not.toContain("Esc");
		expect(rows[activityRow + 1]?.trim()).toBe("Esc 중단");
	});

	test("keeps activity emphasis on every wrapped row at narrow widths", () => {
		const previousLevel = chalk.level;
		chalk.level = 3;
		const view = new WorkbenchChatView(snapshot);
		view.syncActivity({
			message: "분석 · 공개된 판단 근거를 바탕으로 입력과 출력의 시각적 위계를 다시 조정하는 중",
			hint: "Esc 중단",
			frames: ["⠹"],
			intervalMs: 1_000,
		}, () => undefined);
		try {
			const rows = view.render(36);
			const plain = rows.map((line) => stripTerminalSequences(line));
			const first = plain.findIndex((line) => line.startsWith("⠹ "));
			const hint = plain.findIndex((line) => line.trim() === "Esc 중단");
			const wrappedActivity = rows.slice(first, hint);

			expect(wrappedActivity.length).toBeGreaterThan(1);
			expect(wrappedActivity.every((line) => line.includes("\u001B[3m"))).toBe(true);
			expect(wrappedActivity.every((line) => visibleWidth(line) <= 36)).toBe(true);
		} finally {
			view.dispose();
			chalk.level = previousLevel;
		}
	});

	test("restarts the activity timer when the cadence changes", () => {
		const originalSetInterval = globalThis.setInterval;
		const originalClearInterval = globalThis.clearInterval;
		const scheduled: Array<{ delay: number; handle: ReturnType<typeof setInterval> }> = [];
		const cleared: Array<ReturnType<typeof setInterval>> = [];
		let nextHandle = 0;
		globalThis.setInterval = ((_callback: (...args: unknown[]) => void, delay?: number) => {
			const handle = { id: ++nextHandle, unref: () => undefined } as unknown as ReturnType<typeof setInterval>;
			scheduled.push({ delay: delay ?? 0, handle });
			return handle;
		}) as typeof setInterval;
		globalThis.clearInterval = ((handle: ReturnType<typeof setInterval>) => {
			cleared.push(handle);
		}) as typeof clearInterval;
		const view = new WorkbenchChatView(snapshot);
		try {
			view.syncActivity({ message: "분석", frames: ["⠹"], intervalMs: 80 }, () => undefined);
			view.syncActivity({ message: "승인 대기", frames: ["⏸"], intervalMs: 1_000 }, () => undefined);

			expect(scheduled.map((timer) => timer.delay)).toEqual([80, 1_000]);
			expect(cleared).toEqual([scheduled[0]!.handle]);
		} finally {
			view.dispose();
			globalThis.setInterval = originalSetInterval;
			globalThis.clearInterval = originalClearInterval;
		}
	});

	test("attaches a durable #1 #2 #3 recap to the completed assistant turn", () => {
		const activities: WorkbenchSnapshot["activities"] = [
			{
				...snapshot.activities[0]!,
				id: "recap-plan",
				sequence: 1,
				kind: "progress",
				phase: "updated",
				nativeRefs: { threadId: "thread-1", turnId: "turn-recap" },
				payload: { method: "turn/plan/updated", params: { plan: [
					{ step: "현재 UX 확인", status: "completed" },
					{ step: "Chat 표현 개선", status: "completed" },
					{ step: "회귀 테스트", status: "completed" },
				] } },
			},
			{
				...snapshot.activities[0]!,
				id: "recap-answer",
				sequence: 2,
				kind: "message",
				phase: "completed",
				nativeRefs: { threadId: "thread-1", turnId: "turn-recap", itemId: "recap-answer" },
				payload: { role: "assistant", text: "요청한 UX 개선을 마쳤습니다." },
			},
			{
				...snapshot.activities[0]!,
				id: "recap-turn-completed",
				sequence: 3,
				kind: "progress",
				phase: "completed",
				nativeRefs: { threadId: "thread-1", turnId: "turn-recap" },
				payload: { method: "turn/completed" },
			},
		];
		const output = stripTerminalSequences(new WorkbenchChatView({
			...snapshot,
			activities,
			chat: [{
				id: "recap-answer",
				role: "assistant",
				content: "요청한 UX 개선을 마쳤습니다.",
				activityId: "recap-answer",
				status: "completed",
			}],
			// The selected workflow may already belong to the next turn; the completed recap must persist.
			workFlow: projectWorkFlow([]),
		}).render(72).join("\n"));

		expect(output).toContain("이번 요청에서 한 일");
		expect(output).toContain("#1 현재 UX 확인");
		expect(output).toContain("#2 Chat 표현 개선");
		expect(output).toContain("#3 회귀 테스트");
		expect(output).toContain("Native Plan · 3/3 단계 완료");
		expect(output.indexOf("요청한 UX 개선을 마쳤습니다.")).toBeLessThan(output.indexOf("이번 요청에서 한 일"));
	});

	test("builds a #1 #2 #3 recap from actual work when Native Plan is absent", () => {
		const activities: WorkbenchSnapshot["activities"] = [
			{
				...snapshot.activities[0]!,
				id: "fallback-read-start",
				sequence: 1,
				kind: "tool",
				phase: "started",
				nativeRefs: { threadId: "thread-1", turnId: "turn-fallback", itemId: "fallback-read" },
				payload: { method: "item/started", params: { item: {
					type: "commandExecution",
					command: "rg -n 'CompletionSummary' src/presentation/tui",
				} } },
			},
			{
				...snapshot.activities[0]!,
				id: "fallback-read",
				sequence: 2,
				kind: "tool",
				phase: "completed",
				nativeRefs: { threadId: "thread-1", turnId: "turn-fallback", itemId: "fallback-read" },
				payload: { method: "item/completed", params: { item: {
					type: "commandExecution",
					command: "rg -n 'CompletionSummary' src/presentation/tui",
					exitCode: 0,
				} } },
			},
			{
				...snapshot.activities[0]!,
				id: "fallback-edit",
				sequence: 3,
				kind: "file-change",
				phase: "completed",
				nativeRefs: { threadId: "thread-1", turnId: "turn-fallback", itemId: "fallback-edit" },
				payload: { method: "item/completed", params: { item: {
					type: "fileChange",
					changes: [
						{ path: "src/presentation/tui/workbench-views.ts", kind: "update" },
						{ path: "/Users/private/hidden-note.txt", kind: "update" },
					],
				} } },
			},
			{
				...snapshot.activities[0]!,
				id: "fallback-test",
				sequence: 4,
				kind: "tool",
				phase: "completed",
				nativeRefs: { threadId: "thread-1", turnId: "turn-fallback", itemId: "fallback-test" },
				payload: { method: "item/completed", params: { item: {
					type: "commandExecution",
					command: "bun test test/workbench-views.test.ts",
					exitCode: 0,
				} } },
			},
			{
				...snapshot.activities[0]!,
				id: "fallback-answer",
				sequence: 5,
				kind: "message",
				phase: "completed",
				nativeRefs: { threadId: "thread-1", turnId: "turn-fallback", itemId: "fallback-answer" },
				payload: { role: "assistant", text: "Plan 없이도 작업을 마쳤습니다." },
			},
			{
				...snapshot.activities[0]!,
				id: "fallback-turn-completed",
				sequence: 6,
				kind: "progress",
				phase: "completed",
				nativeRefs: { threadId: "thread-1", turnId: "turn-fallback" },
				payload: { method: "turn/completed" },
			},
		];
		const output = stripTerminalSequences(new WorkbenchChatView({
			...snapshot,
			activities,
			chat: [{
				id: "fallback-answer",
				role: "assistant",
				content: "Plan 없이도 작업을 마쳤습니다.",
				activityId: "fallback-answer",
				status: "completed",
			}],
			workFlow: projectWorkFlow([]),
		}).render(72).join("\n"));
		const recap = output.slice(output.indexOf("이번 요청에서 한 일"));

		expect(recap).toContain("#1 대상과 기준 확인");
		expect(recap).toContain("#2 변경과 실행");
		expect(recap).toContain("#3 결과 검증");
		expect(recap).toContain("$ rg -n 'CompletionSummary' src/presentation/tui · 완료");
		expect(recap.match(/\$ rg -n 'CompletionSummary' src\/presentation\/tui/gu)).toHaveLength(1);
		expect(recap).toContain("파일 변경 · src/presentation/tui/workbench-views.ts, [로컬 경로");
		expect(recap).toContain("숨김] · 완료");
		expect(recap).not.toContain("/Users/private");
		expect(recap).toContain("$ bun test test/workbench-views.test.ts · 완료");
		expect(recap).toContain("Native Turn · 완료 확인 · 실행 기록 3개");
	});

	test("still closes an answer-only Native turn with a structured recap", () => {
		const activities: WorkbenchSnapshot["activities"] = [
			{
				...snapshot.activities[0]!,
				id: "answer-only",
				sequence: 1,
				kind: "message",
				phase: "completed",
				nativeRefs: { threadId: "thread-1", turnId: "turn-answer-only", itemId: "answer-only" },
				payload: { role: "assistant", text: "간단한 답변입니다." },
			},
			{
				...snapshot.activities[0]!,
				id: "answer-only-completed",
				sequence: 2,
				kind: "progress",
				phase: "completed",
				nativeRefs: { threadId: "thread-1", turnId: "turn-answer-only" },
				payload: { method: "turn/completed" },
			},
		];
		const output = stripTerminalSequences(new WorkbenchChatView({
			...snapshot,
			activities,
			chat: [{
				id: "answer-only",
				role: "assistant",
				content: "간단한 답변입니다.",
				activityId: "answer-only",
				status: "completed",
			}],
			workFlow: projectWorkFlow([]),
		}).render(48).join("\n"));

		expect(output).toContain("이번 요청에서 한 일");
		expect(output).toContain("#1 응답 제공");
		expect(output).toContain("상태 · 완료");
		expect(output).toContain("Native Turn · 완료 확인 · 실행 기록 0개");
	});

	test("does not claim a completion recap before the same Native turn completes", () => {
		const activities: WorkbenchSnapshot["activities"] = [
			{
				...snapshot.activities[0]!,
				id: "unfinished-plan",
				sequence: 1,
				kind: "progress",
				phase: "updated",
				nativeRefs: { threadId: "thread-1", turnId: "turn-unfinished" },
				payload: { method: "turn/plan/updated", params: { plan: [
					{ step: "표면 정리", status: "completed" },
				] } },
			},
			{
				...snapshot.activities[0]!,
				id: "unfinished-answer",
				sequence: 2,
				nativeRefs: { threadId: "thread-1", turnId: "turn-unfinished", itemId: "unfinished-answer" },
				payload: { role: "assistant", text: "중간 응답" },
			},
		];
		const output = stripTerminalSequences(new WorkbenchChatView({
			...snapshot,
			activities,
			chat: [{
				id: "unfinished-answer",
				role: "assistant",
				content: "중간 응답",
				activityId: "unfinished-answer",
				status: "completed",
			}],
			workFlow: fixtureWorkFlow(activities),
		}).render(72).join("\n"));

		expect(output).not.toContain("이번 요청에서 한 일");
		expect(output).not.toContain("#1 표면 정리");
	});

	test("never promotes a completed child-thread plan into the root completion recap", () => {
		const activities: WorkbenchSnapshot["activities"] = [
			{
				...snapshot.activities[0]!,
				id: "child-plan",
				sequence: 1,
				kind: "progress",
				phase: "updated",
				nativeRefs: { threadId: "thread-child", turnId: "turn-child" },
				payload: { method: "turn/plan/updated", params: { plan: [
					{ step: "자식 전용 작업", status: "completed" },
				] } },
			},
			{
				...snapshot.activities[0]!,
				id: "child-answer",
				sequence: 2,
				nativeRefs: { threadId: "thread-child", turnId: "turn-child", itemId: "child-answer" },
				payload: { role: "assistant", text: "자식 작업 완료" },
			},
			{
				...snapshot.activities[0]!,
				id: "child-turn-completed",
				sequence: 3,
				kind: "progress",
				nativeRefs: { threadId: "thread-child", turnId: "turn-child" },
				payload: { method: "turn/completed" },
			},
		];
		const output = stripTerminalSequences(new WorkbenchChatView({
			...snapshot,
			activities,
			chat: [{
				id: "child-answer",
				role: "assistant",
				content: "자식 작업 완료",
				activityId: "child-answer",
				status: "completed",
			}],
			workFlow: projectWorkFlow([]),
		}).render(72).join("\n"));

		expect(output).not.toContain("이번 요청에서 한 일");
		expect(output).not.toContain("#1 자식 전용 작업");
	});

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
		const workFlow = fixtureWorkFlow(activities);
		const output = stripTerminalSequences(new WorkbenchChatView({
			...snapshot,
			activities,
			chat: [],
			workFlow,
		}).render(72).join("\n"));

		expect(workFlow.goal).toBe("현재 요청을 처리합니다.");
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
		const workFlow = fixtureWorkFlow(activities);
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
		expect(notes).not.toContain("TRACE · SOURCE");
		expect(notes).toContain("Native 응답을 정리했습니다.");
	});

	test("shows the public Native plan while adding only its executing step card", () => {
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
		const workFlow = fixtureWorkFlow(activities);
		const output = stripTerminalSequences(new WorkbenchChatView({
			...snapshot,
			activities,
			chat: [],
			workFlow,
		}).render(72).join("\n"));

		expect(output).toContain("단계 1 · RUNNING");
		expect(output).toContain("현재 구현");
		expect(output).not.toContain("단계 2");
		expect(output).toContain("· 후속 검증");
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

	test("hides empty Todo and T-note counters", () => {
		const emptySnapshot = { ...snapshot, tnotes: [], todo: null };
		const tnotesOutput = stripTerminalSequences(new TNotesSourceView(() => emptySnapshot).render(80).join("\n"));
		const todoOutput = stripTerminalSequences(new WorkspaceTodoView(() => null).render(80).join("\n"));

		expect(tnotesOutput).not.toContain("T-NOTES 0");
		expect(todoOutput).not.toContain("TODO 0/0");
		expect(tnotesOutput).toBe("");
		expect(todoOutput).toBe("");
	});

	test("keeps active goal, progress, queue, Todo, and source details out of T-notes", () => {
		const output = stripTerminalSequences(new TNotesSourceView(() => ({
			...snapshot,
			tnotes: [],
			sessionGoal: {
				text: "프로젝트별 WWW 작업 공간을 실제 사용 가능한 상태로 만든다.",
				sourceActivityId: "activity-goal",
				updatedAt: "2026-09-01T00:00:00.000Z",
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

	test("bounds append-only T-notes while preserving omission and visible-count evidence", () => {
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

		expect(output).toContain("이전 T-note 3개 생략 · 최근 20개 표시");
		expect(output).not.toContain("질문 1 · note-1");
		expect(output).toContain("질문 4 · note-4");
		expect(output).toContain("질문 23 · note-23");
		expect(output).toContain("T-note 요약 일부 생략");
	});

	test("renders Todo status icons and hanging wraps inside the pane width", () => {
		const view = new WorkspaceTodoView(() => ({
			version: 1,
			revision: 2,
			ownerSessionId: "workbench",
			storyId: "ST-001",
			title: "현재 구현 진행 상황",
			updatedAt: "2026-09-01T00:00:00.000Z",
			items: [
				{ id: "todo-1", content: "아주 긴 완료 항목이 패널 바깥으로 넘어가지 않게 줄바꿈합니다", status: "completed", evidenceIds: [], details: [] },
				{ id: "todo-2", content: "현재 진행 항목", status: "in_progress", evidenceIds: [], details: [] },
			],
		}));
		const lines = view.render(48);
		const output = stripTerminalSequences(lines.join("\n"));

		expect(lines.every((line) => visibleWidth(line) <= 48)).toBe(true);
		expect(output).toContain("✓");
		expect(output).toContain("◉");
		expect(output).not.toContain("[x]");
		expect(lines.length).toBeGreaterThan(4);
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
		expect(output).toContain("현재 턴 일시중지 · 승인 결정을 기다립니다.");
		expect(output).toContain("백그라운드 작업 · unknown");
		expect(output).toContain("대기 메시지 1개 · 승인 후 순서대로 전송");
	});

	test("renders authoritative approval background states and compact queued delivery", () => {
		const approval = {
			requestId: 17,
			callbackId: null,
			kind: "command" as const,
			refs: { threadId: "thread-1", turnId: "turn-1" },
			availableDecisions: ["accept", "decline"] as const,
			params: {},
		};
		const lifecycle = (status: string, agentsStates: Record<string, unknown>) => ({
			...snapshot.activities[0]!,
			id: `lifecycle-${status}`,
			kind: "progress" as const,
			payload: { params: { item: { id: "spawn-1", tool: "spawnAgent", status, receiverThreadIds: ["child-1"], agentsStates } } },
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
			}).render(36).join("\n"));
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
			selectedActivityId: "reasoning-completed",
			chat: [],
			draft: "실행 중인 다음 단계",
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
			workFlow: fixtureWorkFlow(command.activities),
		}).render(70).join("\n"));
		expect(output).toContain("단계 1 · PASSED");
		expect(output).toContain("변경 결과 검증");
		expect(output).toContain("$ bun test test/workbench-views.test.ts");
		expect(output).not.toContain("왜 하는지:");
		expect(output).toContain("┌─── ✔ Bash");
		expect(output).not.toContain("/workspace/sample");
		expect(output).toContain("├─── Output");
		expect(output).toContain("result-20");
		expect(output).toContain("earlier lines, showing 10 of 20");
		expect(output).not.toContain("result-01");
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
					type: "commandExecution",
					command: "git add src/app.ts",
					aggregatedOutput: "staged src/app.ts",
					exitCode: 0,
					durationMs: 18,
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
					type: "commandExecution",
					command: "git add src/app.ts",
					aggregatedOutput: "staged src/app.ts",
					exitCode: 0,
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
				method: "item/commandExecution/outputDelta",
				kind: "tool",
				text: "12 pass\n1 fail\n",
				nativeRefs: { threadId: "thread-1", turnId: "turn-1", itemId: "command-2" },
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
			deliveryUncertain: true,
			error: "Native turn/start 요청의 수신 여부가 불명확합니다. accessToken=source-token-secret",
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
		expect(output).toContain(`user · ${label}`);
		expect(output).toContain("전달 상태를 확인할 요청");
	});

	test("renders the first outbound user message before native thread activity exists", () => {
		const outbound: WorkbenchSnapshot = {
			...snapshot,
			threadId: null,
			activities: [],
			selectedActivityId: null,
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
		expect(output).toContain("user · 전송 준비 중");
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

	test("leaves the resting status line blank instead of advertising commands", () => {
		const output = stripTerminalSequences(new StatusLine(WORKBENCH_STATUS_NOTICE).render(240).join("\n"));
		expect(output.trim()).toBe("");
		expect(output).not.toContain("/model");
		expect(output).not.toContain("/woo-entry");
	});

	test("keeps immutable action results out of completed-question notes", () => {
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
		expect(output).not.toContain("ACTION");
		expect(output).not.toContain("T-note promotion preview");
		expect(output).not.toContain("currentSource");
	});

	test("keeps selected activity payloads out of completed-question notes", () => {
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
		expect(output).not.toContain("activity-public-7");
		expect(output).not.toContain("bun test");
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
		expect(output).not.toContain("SOURCE");
		expect(output).not.toContain("large-output-command");
		expect(output).not.toContain("output-start");
		expect(output).not.toContain("output-end");
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
			workFlow: fixtureWorkFlow(command.activities),
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
		expect(output).not.toContain("action-start");
		expect(output).not.toContain("action-end");
		expect(output).not.toContain("ACTION");
	});

	test.each([[120, 30], [70, 24]])("keeps titleless Chat, T-notes, and Todo content reachable at %ix%i", (width, height) => {
		const layout = createDashboardLayout(
			() => "WWW · sample-project",
			{ color: text => text, component: new WorkbenchChatView(snapshot) },
			{ color: text => text, component: new TNotesSourceView(() => snapshot) },
			{ color: text => text, component: new WorkspaceTodoView(() => snapshot.todo) },
		);
		const frame = renderLayoutFrame(layout.component, width, height, () => undefined);
		const output = stripTerminalSequences([
			...frame.lines,
			...allScrollContent(frame.root),
		].join("\n"));
		expect(output).not.toContain("Chat · Native");
		expect(output).not.toContain("T-notes · 질문별 요약");
		expect(output).not.toContain("T-notes · 세션 요약");
		expect(output).not.toContain("Todo.md · 현재 작업");
		expect(output).toContain("결정 요약");
		expect(output).not.toContain("SOURCE");
	});

	test("keeps following the newest user message when repeated delivery states extend Chat", () => {
		const failedConversation = (count: number): WorkbenchSnapshot => {
			const activities = Array.from({ length: count }, (_, index) => ({
				...snapshot.activities[0]!,
				id: `failed-activity-${index + 1}`,
				sequence: index + 1,
				kind: "message" as const,
				phase: "failed" as const,
				nativeRefs: { threadId: "thread-1", itemId: `failed-message-${index + 1}` },
				payload: { direction: "outbound", role: "user", text: `반복 요청 ${index + 1}` },
			}));
			return {
				...snapshot,
				revision: count,
				journalSequence: count,
				activities,
				chat: activities.map((activity, index) => ({
					id: activity.nativeRefs.itemId!,
					role: "user" as const,
					content: `반복 요청 ${index + 1}`,
					activityId: activity.id,
					status: "failed" as const,
				})),
				workFlow: projectWorkFlow([]),
			};
		};
		const initial = failedConversation(6);
		const chat = new WorkbenchChatView(initial);
		const layout = createDashboardLayout(
			() => "WWW · sample-project",
			{ color: text => text, component: chat },
			{ color: text => text, component: new TNotesSourceView(() => initial) },
			{ color: text => text, component: new WorkspaceTodoView(() => null) },
		);
		renderLayoutFrame(layout.component, 120, 14, () => undefined);
		const previousScrollTop = layout.leftScroll.scrollTop;

		chat.update(failedConversation(7));
		const frame = renderLayoutFrame(layout.component, 120, 14, () => undefined);
		const output = stripTerminalSequences(frame.lines.join("\n"));

		expect(layout.leftScroll.isFollowingEnd).toBe(true);
		expect(layout.leftScroll.scrollTop).toBeGreaterThan(previousScrollTop);
		expect(output).toContain("반복 요청 7");
	});

	test("does not restore chat auto-follow while wheel scrolling concurrent streaming output", () => {
		const conversation = (count: number): WorkbenchSnapshot => {
			const activities = Array.from({ length: count }, (_, index) => ({
				...snapshot.activities[0]!,
				id: `activity-${index}`,
				sequence: index + 1,
				nativeRefs: { threadId: "thread-1", itemId: `message-${index}` },
				payload: { role: "assistant", text: `streaming message ${index}\n${"detail\n".repeat(3)}` },
			}));
			return {
				...snapshot,
				revision: count,
				journalSequence: count,
				activities,
				chat: activities.map((activity, index) => ({
					id: `message-${index}`,
					activityId: activity.id,
					role: "assistant" as const,
					content: `streaming message ${index}\n${"detail\n".repeat(3)}`,
					status: "completed" as const,
				})),
			};
		};
		const chat = new WorkbenchChatView(conversation(12));
		const layout = createDashboardLayout(
			() => "WWW · sample-project",
			{ color: text => text, component: chat },
			{ color: text => text, component: new TNotesSourceView(() => snapshot) },
			{ color: text => text, component: new WorkspaceTodoView(() => null) },
		);
		renderLayoutFrame(layout.component, 120, 14, () => undefined);
		const offsets: number[] = [];

		for (const count of [13, 14, 15]) {
			chat.update(conversation(count));
			layout.leftScroll.scrollBy(-2);
			renderLayoutFrame(layout.component, 120, 14, () => undefined);
			offsets.push(layout.leftScroll.scrollTop);
		}

		expect(offsets[1]).toBeLessThan(offsets[0]!);
		expect(offsets[2]).toBeLessThan(offsets[1]!);
		expect(layout.leftScroll.isFollowingEnd).toBe(false);
		layout.leftScroll.scrollToEnd();
		expect(layout.leftScroll.isFollowingEnd).toBe(true);
	});
});

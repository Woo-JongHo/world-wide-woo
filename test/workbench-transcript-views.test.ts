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

describe("workbench transcript and animation views", () => {
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
		const rows           = view.render(48)                                        ;
		const plain          = rows.map((line) => stripTerminalSequences(line))       ;
		const userLabel      = plain.findIndex((line) => line.trimEnd() === "👤 USER") ;
		const assistantLabel = plain.findIndex((line) => line === "🐙 Wooni")          ;

		expect(userLabel).toBeGreaterThanOrEqual(0);
		expect(assistantLabel).toBeGreaterThan(userLabel);
		expect(visibleWidth(rows[userLabel]!)).toBe(48);
		expect(visibleWidth(rows[assistantLabel]!)).toBeLessThan(48);
		expect(plain.join("\n")).toContain("배경을 가진 질문");
		expect(plain.join("\n")).toContain("열린 답변");
	});

	test("renders only the public answer from a completed assistant envelope", () => {
		const output = stripTerminalSequences(new WorkbenchChatView({
			...snapshot,
			chat: [{
				...snapshot.chat[0]!,
				content: [
					"<analysis>비공개 추론</analysis>",
					"<results>내부 결과</results>",
					"<files>내부 파일 목록</files>",
					"<answer>",
					"## 공개 답변",
					"정상 **Markdown**과 <kbd>Esc</kbd>는 유지합니다.",
					"```xml",
					"<analysis>코드 예시 태그</analysis>",
					"```",
					"</answer>",
					"<next_steps>내부 다음 단계</next_steps>",
				].join("\n"),
			}],
		}).render(100).join("\n"));

		expect(output).toContain("공개 답변");
		expect(output).toContain("정상 Markdown과 <kbd>Esc</kbd>는 유지합니다.");
		expect(output).toContain("<analysis>코드 예시 태그</analysis>");
		expect(output).not.toContain("비공개 추론");
		expect(output).not.toContain("내부 결과");
		expect(output).not.toContain("내부 파일 목록");
		expect(output).not.toContain("내부 다음 단계");
	});

	test("reprojects unchanged envelope text when streaming becomes completed", () => {
		const message = {
			...snapshot.chat[0]!,
			status: "streaming" as const,
			content: "<analysis>내부</analysis>\n<answer>공개</answer>",
		};
		const view = new WorkbenchChatView({ ...snapshot, chat: [message] });
		expect(stripTerminalSequences(view.render(80).join("\n"))).not.toContain("<analysis>내부</analysis>");
		view.update({ ...snapshot, chat: [{ ...message, status: "completed" }] });
		const completed = stripTerminalSequences(view.render(80).join("\n"));
		expect(completed).toContain("공개");
		expect(completed).not.toContain("내부");
	});

	test.each([40, 80, 120])("renders a preserved incomplete answer and final-observation notice within %i columns", (width) => {
		const activity = {
			...snapshot.activities[0]!,
			id: "partial-answer",
			nativeRefs: { threadId: "thread-1", turnId: "turn-partial", itemId: "partial-answer" },
			payload: {
				role             : "assistant",
				text             : "보존한 부분 답변",
				partial          : true,
				finalObservation : "missing",
			},
		};
		const rows = new WorkbenchChatView({
			...snapshot,
			activities: [activity, {
				...snapshot.activities[0]!,
				id         : "partial-turn-completed",
				sequence   : 2,
				kind       : "progress",
				nativeRefs : { threadId: "thread-1", turnId: "turn-partial" },
				payload    : { method: "turn/completed" },
			}],
			chat: [{
				id: "partial-answer",
				role: "assistant",
				content: "보존한 부분 답변",
				activityId: "partial-answer",
				status: "incomplete" as const,
				partial: true,
			}],
			tnotes: [],
		}).render(width);
		const output = stripTerminalSequences(rows.join("\n"));

		expect(output).toContain("보존한 부분 답변");
		expect(output).toContain("부분 응답 · 최종 본문 미수신");
		expect(output).not.toContain("이번 요청에서 한 일");
		expect(rows.every((row) => visibleWidth(row) <= width)).toBe(true);
	});

	test("reprojects unchanged partial text when streaming becomes incomplete", () => {
		const message = {
			...snapshot.chat[0]!,
			status: "streaming" as const,
			content: "<analysis>내부</analysis>\n<answer>보존된 공개 부분</answer>",
		};
		const view = new WorkbenchChatView({ ...snapshot, chat: [message] });
		expect(stripTerminalSequences(view.render(80).join("\n"))).not.toContain("<analysis>내부</analysis>");

		view.update({ ...snapshot, chat: [{ ...message, status: "incomplete" as const, partial: true }] });
		const incomplete = stripTerminalSequences(view.render(80).join("\n"));
		expect(incomplete).toContain("보존된 공개 부분");
		expect(incomplete).toContain("부분 응답 · 최종 본문 미수신");
		expect(incomplete).not.toContain("내부");
	});

	test("reprojects unchanged failed text when its observation becomes partial", () => {
		const message = {
			...snapshot.chat[0]!,
			status: "failed" as const,
			content: "<analysis>내부</analysis>\n<answer>공개된 실패 전 부분</answer>",
		};
		const view = new WorkbenchChatView({ ...snapshot, chat: [message] });
		expect(stripTerminalSequences(view.render(80).join("\n"))).not.toContain("내부");

		view.update({ ...snapshot, chat: [{ ...message, partial: true }] });
		const partial = stripTerminalSequences(view.render(80).join("\n"));
		expect(partial).toContain("공개된 실패 전 부분");
		expect(partial).not.toContain("내부");
	});

	test("distinguishes an empty missing-final response from a preserved partial answer", () => {
		const output = stripTerminalSequences(new WorkbenchChatView({
			...snapshot,
			chat: [{
				...snapshot.chat[0]!,
				content: "최종 답변 본문을 받지 못했습니다.",
				status: "incomplete",
				partial: false,
			}],
		}).render(48).join("\n"));

		expect(output).toContain("최종 본문 미수신");
		expect(output).toContain("최종 답변 본문을 받지 못했습니다.");
		expect(output).not.toContain("부분 응답");
	});

	test.each([
		["failed", "실패"],
		["cancelled", "중단됨"],
	] as const)("sanitizes preserved answer text beside the %s terminal label", (status, label) => {
		const output = stripTerminalSequences(new WorkbenchChatView({
			...snapshot,
			chat: [{
				...snapshot.chat[0]!,
				content: "<analysis>내부 추론</analysis>\n<answer>종료 전에 받은 부분 답변</answer>",
				status,
				partial: true,
			}],
		}).render(48).join("\n"));

		expect(output).toContain("종료 전에 받은 부분 답변");
		expect(output).toContain(label);
		expect(output).not.toContain("내부 추론");
	});

	test.each([
		["incomplete", "부분 응답 · 최종 본문 미수신"],
		["failed", "실패"],
		["cancelled", "중단됨"],
	] as const)("fails closed for an unfinished analysis envelope on a %s partial", (status, label) => {
		const output = stripTerminalSequences(new WorkbenchChatView({
			...snapshot,
			chat: [{
				...snapshot.chat[0]!,
				content: "<analysis>\n화면에 나오면 안 되는 중간 추론",
				status,
				partial: true,
			}],
		}).render(80).join("\n"));

		expect(output).toContain(label);
		expect(output).not.toContain("화면에 나오면 안 되는 중간 추론");
		expect(output).not.toContain("<analysis>");
	});

	test("preserves partial tags, surrounding text, and fenced tag examples", () => {
		for (const content of [
			"prefix <answer>content</answer> suffix",
			"인라인 코드 `<analysis>`는 설명입니다.",
			"```xml\n<analysis>\n코드\n</analysis>\n```",
			"```xml\n<analysis>example</analysis>\n```\n<answer>literal HTML example</answer>",
		]) {
			const output = stripTerminalSequences(new WorkbenchChatView({
				...snapshot,
				chat: [{ ...snapshot.chat[0]!, content }],
			}).render(100).join("\n"));
			for (const token of content.match(/(?:prefix|content|suffix|인라인 코드|<analysis>|설명입니다|코드)/gu) ?? []) {
				expect(output).toContain(token);
			}
		}
	});

	test("renders the live action without a separate interruption row", () => {
		const view = new WorkbenchChatView(snapshot);
		view.syncActivity({
			message    : "단계 2/3 · 입출력 UX 정리",
			hint       : "Esc 중단",
			frames     : ["⠹"],
			intervalMs : 1_000,
		}, () => undefined);
		const rows = view.render(60).map((line) => stripTerminalSequences(line));
		view.dispose();
		const activityRow = rows.findIndex((line) => line.includes("단계 2/3 · 입출력 UX 정리"));

		expect(activityRow).toBeGreaterThanOrEqual(0);
		expect(rows[activityRow]).not.toContain("Esc");
		expect(rows.join("\n")).not.toContain("Esc 중단");
	});

	test("keeps activity emphasis on every wrapped row at narrow widths", () => {
		const previousLevel = chalk.level;
		chalk.level = 3;
		const view = new WorkbenchChatView(snapshot);
		view.syncActivity({
			message    : "분석 · 공개된 판단 근거를 바탕으로 입력과 출력의 시각적 위계를 다시 조정하는 중",
			hint       : "Esc 중단",
			frames     : ["⠹"],
			intervalMs : 1_000,
		}, () => undefined);
		try {
			const rows            = view.render(36)                                                       ;
			const plain           = rows.map((line) => stripTerminalSequences(line))                      ;
			const first           = plain.findIndex((line) => line.startsWith("⠹ "))                      ;
			const end             = plain.findIndex((line, index) => index > first && line.trim() === "") ;
			const wrappedActivity = rows.slice(first, end < 0 ? rows.length : end)                        ;

			expect(wrappedActivity.length).toBeGreaterThan(1);
			expect(wrappedActivity.every((line) => line.includes("\u001B[3m"))).toBe(true);
			expect(wrappedActivity.every((line) => visibleWidth(line) <= 36)).toBe(true);
		} finally {
			view.dispose();
			chalk.level = previousLevel;
		}
	});

	test("advances the spinner and activity gradient on the configured timer", () => {
		const originalSetInterval                                                          = globalThis.setInterval   ;
		const originalClearInterval                                                        = globalThis.clearInterval ;
		const scheduled : Array<{ delay: number; handle: ReturnType<typeof setInterval> }> = []                       ;
		const cleared   : Array<ReturnType<typeof setInterval>>                            = []                       ;
		let nextHandle                                                                     = 0                        ;
		const callbacks : Array<() => void>                                                = []                       ;
		globalThis.setInterval = ((callback: (...args: unknown[]) => void, delay?: number) => {
			const handle = { id: ++nextHandle, unref: () => undefined } as unknown as ReturnType<typeof setInterval>;
			scheduled.push({ delay: delay ?? 0, handle });
			callbacks.push(() => callback());
			return handle;
		}) as typeof setInterval;
		globalThis.clearInterval = ((handle: ReturnType<typeof setInterval>) => {
			cleared.push(handle);
		}) as typeof clearInterval;
		const view = new WorkbenchChatView(snapshot);
		try {
			let renders = 0;
			view.syncActivity({ message: "분석", frames: ["⠋", "⠙"], intervalMs: 80 }, () => { renders += 1; });
			const first = view.render(80).join("\n");
			callbacks[0]?.();
			const second = view.render(80).join("\n");
			view.syncActivity({ message: "승인 대기", frames: ["⏸"], intervalMs: 1_000 }, () => undefined);

			expect(scheduled.map(({ delay }) => delay)).toEqual([80]);
			expect(cleared).toContain(scheduled[0]!.handle);
			expect(stripTerminalSequences(first)).toContain("⠋ 분석");
			expect(stripTerminalSequences(second)).toContain("⠙ 분석");
			expect(second).not.toBe(first);
			expect(renders).toBeGreaterThan(0);
			expect(stripTerminalSequences(view.render(80).join("\n"))).toContain("승인 대기");
		} finally {
			view.dispose();
			globalThis.setInterval = originalSetInterval;
			globalThis.clearInterval = originalClearInterval;
		}
	});

	test("reuses Chat rows when only the activity spinner frame changes", () => {
		const originalSetInterval          = globalThis.setInterval   ;
		const originalClearInterval        = globalThis.clearInterval ;
		const callbacks: Array<() => void> = []                       ;
		globalThis.setInterval = ((callback: (...args: unknown[]) => void) => {
			callbacks.push(() => callback());
			return { unref: () => undefined } as unknown as ReturnType<typeof setInterval>;
		}) as typeof setInterval;
		globalThis.clearInterval = (() => undefined) as typeof clearInterval;
		const view                  = new WorkbenchChatView(snapshot)                                        ;
		const instrumented          = view as unknown as { renderMessage: (...args: unknown[]) => string[] } ;
		const originalRenderMessage = instrumented.renderMessage.bind(view)                                  ;
		let messageProjectionCalls  = 0                                                                      ;
		instrumented.renderMessage = (...args: unknown[]) => {
			messageProjectionCalls += 1;
			return originalRenderMessage(...args);
		};
		try {
			view.syncActivity({ message: "분석", frames: ["⠋", "⠙"], intervalMs: 80 }, () => undefined);
			const first = view.render(80).join("\n");
			const initialProjectionCalls = messageProjectionCalls;

			callbacks[0]?.();
			const second = view.render(80).join("\n");

			expect(initialProjectionCalls).toBeGreaterThan(0);
			expect(messageProjectionCalls).toBe(initialProjectionCalls);
			expect(stripTerminalSequences(first)).toContain("⠋ 분석");
			expect(stripTerminalSequences(second)).toContain("⠙ 분석");
		} finally {
			view.dispose();
			globalThis.setInterval = originalSetInterval;
			globalThis.clearInterval = originalClearInterval;
		}
	});

	test("stops activity motion when the selected execution run is terminal", () => {
		const originalSetInterval = globalThis.setInterval;
		let scheduled = 0;
		globalThis.setInterval = (() => { scheduled += 1; return { unref: () => undefined } as unknown as ReturnType<typeof setInterval>; }) as unknown as typeof setInterval;
		const view = new WorkbenchChatView({
			...snapshot,
			executionRun: {
				runId: "thread-1:turn-1", threadId: "thread-1", turnId: "turn-1", phase: "completed", waitReason: null,
				objective: "완료", tasks: [], activeActivity: null, evidence: [], activities: [], lastSequence: 1,
				checkpoint: { runId: "thread-1:turn-1", sequence: 1, digest: "checkpoint" },
				receipt: null, rejectedEventIds: [],
			},
		});
		try {
			view.syncActivity({ message: "실행 중", frames: ["⠋", "⠙"], intervalMs: 80 }, () => undefined);
			expect(scheduled).toBe(0);
		} finally {
			view.dispose();
			globalThis.setInterval = originalSetInterval;
		}
	});

	test("shows interrupted runtime state without expanding receipt internals into Chat", () => {
		const output = stripTerminalSequences(new WorkbenchChatView({
			...snapshot,
			chat: [],
			executionRun: {
				runId: "thread-1:turn-1", threadId: "thread-1", turnId: "turn-1", phase: "interrupted", waitReason: null,
				objective: "중단된 요청", tasks: [], activeActivity: null, evidence: [], activities: [], lastSequence: 1,
				checkpoint: { runId: "thread-1:turn-1", sequence: 1, digest: "checkpoint" },
				rejectedEventIds: [],
				receipt: {
					receiptId: "receipt-1", receiptDigest: "receipt-digest", checkpointDigest: "checkpoint",
					runId: "thread-1:turn-1", threadId: "thread-1", turnId: "turn-1", status: "interrupted",
					objective: "중단된 요청", changed: [], verification: [], evidenceRefs: [], remaining: [],
					completedAt: "2026-09-01T00:00:00.000Z",
					terminalSource: { id: "terminal-1", sequence: 1, sourceDigest: "source" },
				},
			},
		}).render(72).join("\n"));
		expect(output).toContain("실행이 중단되었습니다.");
		expect(output).not.toContain("남은 작업");
		expect(output).not.toContain("terminal-1");
	});

	test("keeps command receipt details in Tracer instead of expanding them into Chat", () => {
		const output = stripTerminalSequences(new WorkbenchChatView({
			...snapshot,
			chat: [],
			executionRun: {
				runId: "thread-1:turn-1", threadId: "thread-1", turnId: "turn-1", phase: "interrupted", waitReason: null,
				objective: "중단된 요청", tasks: [], activeActivity: null, evidence: [], activities: [], lastSequence: 1,
				checkpoint: { runId: "thread-1:turn-1", sequence: 1, digest: "checkpoint" },
				rejectedEventIds: [],
				receipt: {
					receiptId: "receipt-1", receiptDigest: "receipt-digest", checkpointDigest: "checkpoint",
					runId: "thread-1:turn-1", threadId: "thread-1", turnId: "turn-1", status: "interrupted",
					objective: "중단된 요청", changed: [], verification: [], evidenceRefs: [], remaining: [],
					commandResults : [{ command: "bun test", exitCode: 1, status: "failed", output: "1 fail", evidenceRefs: ["cmd-1"] }],
					completedAt    : "2026-09-01T00:00:00.000Z",
					terminalSource : { id: "terminal-1", sequence: 1, sourceDigest: "source" },
				},
			},
		}).render(72).join("\n"));
		expect(output).toContain("세부 실행 근거는 Tracer에서 확인합니다.");
		expect(output).not.toContain("명령 실행 결과");
		expect(output).not.toContain("bun test");
		expect(output).not.toContain("1 fail");
	});

	test("explains the selected run waiting reason and operator action", () => {
		const output = stripTerminalSequences(new WorkbenchChatView({
			...snapshot,
			executionRun: {
				runId: "thread-1:turn-1", threadId: "thread-1", turnId: "turn-1", phase: "waiting", waitReason: "approval",
				objective: "승인 대기", tasks: [], activeActivity: null, evidence: [], activities: [], lastSequence: 1,
				checkpoint: { runId: "thread-1:turn-1", sequence: 1, digest: "checkpoint" },
				receipt: null, rejectedEventIds: [],
			},
		}).render(72).join("\n"));
		expect(output).toContain("실행 대기");
		expect(output).toContain("승인을 기다리고 있습니다.");
		expect(output).toContain("조치");
	});

	test("keeps the native final answer without attaching a second plan recap", () => {
		const activities: WorkbenchSnapshot["activities"] = [
			{
				...snapshot.activities[0]!,
				id: "recap-plan",
				sequence: 1,
				kind: "progress",
				phase: "updated",
				nativeRefs: { threadId: "thread-1", turnId: "turn-recap" },
				payload: { method: "turn/plan/updated", params: { plan: [
					{ step : "현재 UX 확인"   , status : "completed" },
					{ step : "Chat 표현 개선" , status : "completed" },
					{ step : "회귀 테스트"    , status : "completed" },
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

		expect(output).toContain("요청한 UX 개선을 마쳤습니다.");
		expect(output).not.toContain("이번 요청에서 한 일");
		expect(output).not.toContain("#1 현재 UX 확인");
		expect(output).not.toContain("Native Plan · 3/3 단계 완료");
	});

	test("keeps the native final answer when Native Plan is absent", () => {
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
					type     : "commandExecution",
					command  : "rg -n 'CompletionSummary' src/presentation/tui",
					exitCode : 0,
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
					type     : "commandExecution",
					command  : "bun test test/workbench-views.test.ts",
					exitCode : 0,
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
		const afterAnswer = output.slice(output.indexOf("Plan 없이도 작업을 마쳤습니다."));
		expect(output).toContain("Plan 없이도 작업을 마쳤습니다.");
		expect(afterAnswer).not.toContain("이번 요청에서 한 일");
		expect(afterAnswer).not.toContain("관련 코드와 설정을 검색");
		expect(afterAnswer).not.toContain("bun test");
		expect(afterAnswer).not.toContain("/Users/private");
	});

	test("keeps an answer-only Native turn unchanged", () => {
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

		expect(output).toContain("간단한 답변입니다.");
		expect(output).not.toContain("이번 요청에서 한 일");
		expect(output).not.toContain("Native Turn · 완료 확인");
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
				payload: { direction: "outbound", role: "user", text: "Executor 흐름과 Live Notes를 구현한다" },
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
							{ step: "Live Notes 흐름 연결", status: "inProgress" },
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
							type             : "commandExecution",
							command          : "sed -n '1,120p' src/app.ts",
							aggregatedOutput : "src/app.ts: application bootstrap",
							exitCode         : 0,
						},
					},
				},
			},
		];
		const workFlow = fixtureWorkFlow(activities)                                                    ;
		const live     = { ...snapshot, activities, chat: [], workFlow }                                ;
		const chat     = stripTerminalSequences(new WorkbenchChatView(live).render(72).join("\n"))      ;
		const notes    = stripTerminalSequences(new TNotesSourceView(() => live).render(52).join("\n")) ;

		expect(chat).not.toContain("단계 1");
		expect(chat).not.toContain("단계 2");
		expect(chat).toContain("Read");
		expect(chat).toContain("sed -n");
		expect(chat).toContain("application bootstrap");
		expect(notes).not.toContain("T-NOTES · LIVE");
		expect(notes).not.toContain("Executor 흐름과 Live Notes를 구현한다");
		expect(notes).not.toContain("Live Notes 흐름 연결");
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
});

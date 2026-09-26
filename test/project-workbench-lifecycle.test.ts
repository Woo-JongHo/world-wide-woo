import legacyJournal                                          from "./fixtures/legacy-execution-receipt.json";
import type { RuntimeToolHandler, RuntimeToolDefinition }     from "../src/core/ports/execution/runtime-tool-port";
import { REQUEST_STAGES }                                     from "../src/core/domain/execution/request-runtime";
import type { RequestRuntimeRecord }                          from "../src/core/domain/execution/request-runtime";
import { projectRequestTodo }                                 from "../src/core/domain/work/request-projections";
import { describe, expect, test }                             from "bun:test";
import type { ExecutorPort }                                  from "../src/core/ports/execution/executor-port";
import type {
	ActivityNarrationRequest,
	ActivityNarrator,
} from "../src/core/application/orchestration/activity-narrator";
import { ProjectWorkbench }                                   from "../src/core/application/orchestration/project-workbench";
import type {
	WorkbenchActivityJournal,
	WorkbenchTNoteSource,
	WorkbenchTodoSource,
} from "../src/core/application/orchestration/project-workbench";
import type {
	NativeApprovalResolution,
	NativeHarnessEvent,
	NativeThreadRead,
	NativeThreadList,
	NativeThreadResume,
	NativeThreadSnapshot,
	NativeThreadStart,
	NativeThreadSummary,
	NativeTurnInterrupt,
	NativeTurnSnapshot,
	NativeTurnStart,
	NativeTurnSteer,
	NativeTurnSteerResult,
} from "../src/core/domain/execution/native-session";
import type {
	ProjectActivity,
	ProjectActivityAppendResult,
	ProjectActivityInput,
} from "../src/core/domain/execution/project-activity";
import { CanonicalPromotionService, digestCanonicalDocument } from "../src/core/application/work/canonical-promotion";
import { ReviewService }                                      from "../src/core/application/review/review-service";
import { SessionModelUsageAccumulator }                       from "../src/core/application/session/session-model-usage";
import { TodoWriteConflictError }                             from "../src/core/application/work/todo-ledger";
import { WooEntry }                                           from "../src/core/application/orchestration/woo-entry";
import type { WooEntryCollection }                            from "../src/core/application/orchestration/woo-entry";
import type { TodoDocument }                                  from "../src/core/domain/work/todos";
import type { WorkFlowProjection }                            from "../src/core/domain/work";
import type { WorkbenchSnapshot }                             from "../src/core/domain/work/workbench";
import { ProviderReviewAdapter, sha256ReviewDigest }          from "../src/adapters/outbound/review/review-adapters";
import { TNoteService }                                       from "../src/core/application/work/t-note-service";
import type { DetachedTextGenerator }                         from "../src/core/application/orchestration/detached-text-generator";
import { FileTNoteStore }                                     from "../src/adapters/outbound/persistence/t-note-store";
import { projectTNoteCompletionIndex, sanitizeTNoteText }     from "../src/core/domain/work/t-notes";
import { mkdtemp, rm, writeFile, readFile, realpath }         from "node:fs/promises";
import { createHash }                                         from "node:crypto";
import { pinnedFileCapabilities }                             from "../src/adapters/outbound/workspace/pinned-file-capabilities";
import { tmpdir }                                             from "node:os";
import { join }                                               from "node:path";

import {
	ApprovalPreparationGateJournal,
	FakeActivityNarrator,
	FakeNativeHarness,
	MemoryJournal,
	MessageCompletionGateJournal,
	ToolObservationGateJournal,
	ready,
	todoDocument,
} from "./project-workbench.fixtures";

describe("ProjectWorkbench · delivery lifecycle and chat identity", () => {
	test("keeps the selected flow while exposing a pending turn goal", async () => {
		const native = new FakeNativeHarness();
		const workbench = new ProjectWorkbench(native, new MemoryJournal(), {
			projectId: "sample-project",
			cwd: "/workspace/sample",
		});
		await ready(workbench);
		await workbench.dispatch({ type: "chat.send", text: "이전 요청" });
		native.emit({
			type   : "notification",
			method : "turn/plan/updated",
			refs   : { threadId: "thread-1", turnId: "turn-1" },
			params : { plan: [{ step: "이전 단계", status: "inProgress" }] },
		});
		await Bun.sleep(10);
		expect(workbench.snapshot.workFlow.steps[0]?.title).toBe("이전 단계");
		native.emit({ type: "notification", method: "turn/completed", refs: { threadId: "thread-1", turnId: "turn-1" }, params: {} });
		await Bun.sleep(10);

		let releaseTurnStart!: () => void;
		native.startTurnGate = new Promise<void>((resolve) => { releaseTurnStart = resolve; });
		const submission = workbench.dispatch({ type: "chat.send", text: "현재 요청" });
		await Bun.sleep(0);
		const pending = workbench.snapshot;
		releaseTurnStart();
		await submission;

		expect(pending.workFlow.goal).toBe("현재 요청");
		expect(pending.workFlow.steps.map(step => step.title)).toEqual(["이전 단계"]);
		await workbench.close();
	});

	test("drains FIFO only for exact interrupted and failed turn lifecycle notifications", async () => {
		for (const method of ["turn/interrupted", "turn/failed"] as const) {
			const native = new FakeNativeHarness();
			const workbench = new ProjectWorkbench(native, new MemoryJournal(), { projectId: "sample-project", cwd: "/workspace/sample" });
			await ready(workbench);
			await workbench.dispatch({ type: "chat.send", text: "첫 요청" });
			await workbench.dispatch({ type: "chat.send", text: "다음 요청" });

			native.emit({ type: "notification", method, refs: { threadId: "thread-1", turnId: "turn-1" }, params: {} });
			await Bun.sleep(10);

			expect(native.startTurnInputs.map(input => input.text)).toEqual(["첫 요청", "다음 요청"]);
			expect(workbench.snapshot.chatQueue).toEqual([]);
			await workbench.close();
		}
	});

	test("keeps a normally started turn active when an item event arrives before its local start activity is journaled", async () => {
		const native = new FakeNativeHarness();
		const journal = new MessageCompletionGateJournal();
		const workbench = new ProjectWorkbench(native, journal, {
			projectId: "sample-project",
			cwd: "/workspace/sample",
		});
		await ready(workbench);

		const firstSend = workbench.dispatch({ type: "chat.send", text: "첫 요청" });
		await journal.messageCompletionReached;
		native.emit({
			type   : "notification",
			method : "item/started",
			refs   : { threadId: "thread-1", turnId: "turn-1", itemId: "early-tool" },
			params : { item: { type: "commandExecution", command: "pwd" } },
		});
		await Bun.sleep(10);
		journal.release();
		expect(await firstSend).toMatchObject({ state: "accepted" });
		expect(workbench.snapshot.activeTurnId).toBe("turn-1");

		await workbench.dispatch({ type: "chat.send", text: "두 번째 요청" });
		native.emit({
			type   : "notification",
			method : "turn/completed",
			refs   : { threadId: "thread-1", turnId: "turn-1" },
			params : {},
		});
		await Bun.sleep(10);

		expect(native.startTurnInputs.map((input) => input.text)).toEqual(["첫 요청", "두 번째 요청"]);
		expect(workbench.snapshot.activeTurnId).toBe("turn-2");
		expect(workbench.snapshot.chatQueue).toEqual([]);
		await workbench.close();
	});

	test("keeps follow-up messages on the root thread while sub-agent events are streaming", async () => {
		const native = new FakeNativeHarness();
		const workbench = new ProjectWorkbench(native, new MemoryJournal(), {
			projectId: "sample-project",
			cwd: "/workspace/sample",
		});
		await ready(workbench);
		await workbench.dispatch({ type: "chat.send", text: "루트 요청" });
		native.startTurnErrors.set(2, new Error("direct app-server input is not allowed for multi-agent v2 sub-agents"));

		native.emit({
			type   : "notification",
			method : "turn/started",
			refs   : { threadId: "child-thread", turnId: "child-turn" },
			params : {},
		});
		native.emit({
			type   : "notification",
			method : "item/started",
			refs   : { threadId: "child-thread", turnId: "child-turn", itemId: "child-message" },
			params : { item: { type: "agentMessage", id: "child-message", text: "자식 작업 중" } },
		});
		await Bun.sleep(10);

		const followUp = await workbench.dispatch({ type: "chat.send", text: "진행 중 추가 요청" });
		expect(followUp).toMatchObject({ state: "queued", position: 1 });
		expect(workbench.snapshot.threadId).toBe("thread-1");
		expect(workbench.snapshot.activeTurnId).toBe("turn-1");
		expect(workbench.snapshot.chat.some(message => message.status === "failed")).toBe(false);
		expect(native.startTurnInputs.map(input => input.threadId)).toEqual(["thread-1"]);
		await workbench.close();
	});

	test("shows the first optimistic request once while request journaling is pending", async () => {
		let release!: () => void;
		let reached!: () => void;
		const gate = new Promise<void>(resolve => { release = resolve; });
		const entered = new Promise<void>(resolve => { reached = resolve; });
		class SubmissionGateJournal extends MemoryJournal {
			override async append(input: ProjectActivityInput): Promise<ProjectActivityAppendResult> {
				if (input.payload.method === "request/submitted") {
					reached();
					await gate;
				}
				return super.append(input);
			}
		}
		const native = new FakeNativeHarness();
		const workbench = new ProjectWorkbench(native, new SubmissionGateJournal(), {
			projectId: "sample-project", cwd: "/workspace/sample",
		});
		await ready(workbench);
		const sending = workbench.dispatch({ type: "chat.send", text: "첫 요청 하나" });
		try {
			await entered;
			native.emit({ type: "notification", method: "thread/started", refs: { threadId: "thread-1" }, params: {} });
			await Bun.sleep(10);
			const users = workbench.snapshot.chat.filter(message => message.role === "user");
			expect(users.map(message => message.content)).toEqual(["첫 요청 하나"]);
			expect(workbench.snapshot.activities.some(activity => activity.id === users[0]?.activityId)).toBe(true);
		} finally {
			release();
			await sending;
			await workbench.close();
		}
	});

	test("observes first output without an item id without accepting an unowned draft", async () => {
		const native = new FakeNativeHarness();
		const workbench = new ProjectWorkbench(native, new MemoryJournal(), {
			projectId: "sample-project", cwd: "/workspace/sample",
		});
		await ready(workbench);
		await workbench.dispatch({ type: "chat.send", text: "요청" });
		const event: NativeHarnessEvent = {
			type: "notification", method: "item/agentMessage/delta",
			refs: { threadId: "thread-1", turnId: "turn-1" }, params: { delta: "첫 출력" },
		};
		native.emit(event);
		native.emit(event);
		await Bun.sleep(10);
		expect(workbench.snapshot.activities.filter(activity => activity.payload.method === "turn/first-output-observed")).toHaveLength(1);
		expect(workbench.snapshot.draft).toBe("");
		await workbench.close();
	});

	test("isolates root chat identity from child threads and repeated item ids across turns", async () => {
		const native = new FakeNativeHarness();
		const workbench = new ProjectWorkbench(native, new MemoryJournal(), {
			projectId: "sample-project",
			cwd: "/workspace/sample",
		});
		await ready(workbench);
		await workbench.dispatch({ type: "chat.send", text: "첫 요청" });

		native.emit({
			type   : "notification",
			method : "item/completed",
			refs   : { threadId: "thread-1", turnId: "turn-1", itemId: "same-item" },
			params : { item: { type: "agentMessage", text: "첫 root 답변" } },
		});
		native.emit({
			type   : "notification",
			method : "item/completed",
			refs   : { threadId: "child-thread", turnId: "child-turn", itemId: "same-item" },
			params : { item: { type: "agentMessage", text: "child 답변" } },
		});
		native.emit({
			type   : "notification",
			method : "turn/completed",
			refs   : { threadId: "thread-1", turnId: "turn-1" },
			params : {},
		});
		await Bun.sleep(10);
		await workbench.dispatch({ type: "chat.send", text: "두 번째 요청" });
		native.emit({
			type   : "notification",
			method : "item/completed",
			refs   : { threadId: "thread-1", turnId: "turn-2", itemId: "same-item" },
			params : { item: { type: "agentMessage", text: "두 번째 root 답변" } },
		});
		await Bun.sleep(10);

		const assistant = workbench.snapshot.chat.filter((message) => message.role === "assistant");
		expect(assistant.map((message) => message.content)).toEqual(["첫 root 답변", "두 번째 root 답변"]);
		expect(new Set(assistant.map((message) => message.id)).size).toBe(2);
		expect(workbench.snapshot.activities.some((activity) =>
			activity.nativeRefs.threadId === "child-thread" && activity.nativeRefs.itemId === "same-item",
		)).toBe(true);
		await workbench.close();
	});

	test("keeps a current turn draft separate from a repeated item id in another turn", async () => {
		const native = new FakeNativeHarness();
		const workbench = new ProjectWorkbench(native, new MemoryJournal(), {
			projectId: "sample-project",
			cwd: "/workspace/sample",
		});
		await ready(workbench);
		await workbench.dispatch({ type: "chat.send", text: "요청" });

		native.emit({
			type   : "notification",
			method : "item/agentMessage/delta",
			refs   : { threadId: "thread-1", turnId: "turn-1", itemId: "same-item" },
			params : { delta: "현재 turn" },
		});
		native.emit({
			type   : "notification",
			method : "item/agentMessage/delta",
			refs   : { threadId: "child-thread", turnId: "child-turn", itemId: "same-item" },
			params : { delta: "child turn" },
		});
		await Bun.sleep(10);
		expect(workbench.snapshot.draft).toBe("현재 turn");
		native.emit({
			type   : "notification",
			method : "item/agentMessage/delta",
			refs   : { threadId: "thread-1", turnId: "turn-other", itemId: "same-item" },
			params : { delta: "다른 turn" },
		});
		await Bun.sleep(10);
		expect(workbench.snapshot.draft).toBe("다른 turn");

		native.emit({
			type   : "notification",
			method : "item/completed",
			refs   : { threadId: "thread-1", turnId: "turn-1", itemId: "same-item" },
			params : { item: { type: "agentMessage", text: "현재 turn 완료" } },
		});
		await Bun.sleep(10);
		expect(workbench.snapshot.draft).toBe("다른 turn");
		await workbench.close();
	});

	test("settles one streaming response without an observable durable and volatile duplicate", async () => {
		let releaseFinalAppend : () => void = () => undefined                                                   ;
		let signalFinalAppend  : () => void = () => undefined                                                   ;
		const finalAppendReached            = new Promise<void>((resolve) => { signalFinalAppend = resolve; })  ;
		const finalAppendRelease            = new Promise<void>((resolve) => { releaseFinalAppend = resolve; }) ;
		let finalAppendArmed                = false                                                             ;
		class FinalMessageGateJournal extends MemoryJournal {
			override async append(input: ProjectActivityInput): Promise<ProjectActivityAppendResult> {
				if (finalAppendArmed && input.kind === "message" && input.payload.method === "item/completed") {
					signalFinalAppend();
					await finalAppendRelease;
				}
				return super.append(input);
			}
		}
		const native = new FakeNativeHarness();
		const journal = new FinalMessageGateJournal();
		const workbench = new ProjectWorkbench(native, journal, {
			projectId : "sample-project",
			cwd       : "/workspace/sample",
		});
		const snapshots: WorkbenchSnapshot[] = [];
		let unsubscribe: () => void = () => undefined;
		try {
			await ready(workbench);
			await workbench.dispatch({ type: "chat.send", text: "streaming 요청" });
			native.emit({
				type   : "notification",
				method : "item/agentMessage/delta",
				refs   : { threadId: "thread-1", turnId: "turn-1", itemId: "stream-message" },
				params : { delta: "작성 중 답변" },
			});
			await Bun.sleep(10);
			expect(workbench.snapshot.draft).toBe("작성 중 답변");

			unsubscribe = workbench.subscribe((snapshot) => { snapshots.push(snapshot); });
			finalAppendArmed = true;
			native.emit({
				type   : "notification",
				method : "item/completed",
				refs   : { threadId: "thread-1", turnId: "turn-1", itemId: "stream-message" },
				params : { item: { type: "agentMessage", text: "완성된 답변" } },
			});
			await finalAppendReached;
			await workbench.refreshModels();

			expect(workbench.snapshot.draft).toBe("작성 중 답변");
			expect(workbench.snapshot.chat.filter((message) => message.role === "assistant")).toEqual([]);

			releaseFinalAppend();
			await Bun.sleep(10);

			const assistant = workbench.snapshot.chat.filter((message) => message.role === "assistant");
			expect(assistant).toHaveLength(1);
			expect(assistant[0]).toMatchObject({ content: "완성된 답변", status: "completed" });
			expect(workbench.snapshot.draft).toBe("");
			expect(workbench.snapshot.activities.find((activity) => activity.id === assistant[0]?.activityId)?.nativeRefs)
				.toEqual({ threadId: "thread-1", turnId: "turn-1", itemId: "stream-message" });
			expect(snapshots.some((snapshot) => snapshot.draft.length > 0
				&& snapshot.chat.some((message) => message.id === assistant[0]?.id))).toBe(false);
		} finally {
			releaseFinalAppend();
			unsubscribe();
			await workbench.close();
		}
	});

	test("normalizes sparse root message refs only from an observed turn or item owner", async () => {
		const native = new FakeNativeHarness();
		const workbench = new ProjectWorkbench(native, new MemoryJournal(), {
			projectId: "sample-project",
			cwd: "/workspace/sample",
		});
		await ready(workbench);
		await workbench.dispatch({ type: "chat.send", text: "요청" });

		native.emit({
			type   : "notification",
			method : "item/agentMessage/delta",
			refs   : { turnId: "turn-1", itemId: "sparse-message" },
			params : { delta: "작성 중" },
		});
		native.emit({
			type   : "notification",
			method : "item/completed",
			refs   : { threadId: "thread-1", itemId: "sparse-message" },
			params : { item: { type: "agentMessage", text: "완료 답변" } },
		});
		native.emit({
			type   : "notification",
			method : "item/completed",
			refs   : { turnId: "turn-1", itemId: "threadless-final" },
			params : { item: { type: "agentMessage", text: "thread 없는 완료 답변" } },
		});
		await Bun.sleep(10);

		expect(workbench.snapshot.draft).toBe("");
		expect(workbench.snapshot.chat.filter((message) => message.role === "assistant").map((message) => message.content))
			.toEqual(["완료 답변", "thread 없는 완료 답변"]);
		const completed = workbench.snapshot.activities.find((activity) => activity.payload.params !== undefined
			&& activity.nativeRefs.itemId === "sparse-message");
		expect(completed?.nativeRefs).toEqual({ threadId: "thread-1", turnId: "turn-1", itemId: "sparse-message" });
		expect(workbench.snapshot.activities.find((activity) => activity.nativeRefs.itemId === "threadless-final")?.nativeRefs)
			.toEqual({ threadId: "thread-1", turnId: "turn-1", itemId: "threadless-final" });
		await workbench.close();
	});

	test("does not treat an ownerless item-only completion as a root message wildcard", async () => {
		const native = new FakeNativeHarness();
		const workbench = new ProjectWorkbench(native, new MemoryJournal(), {
			projectId: "sample-project",
			cwd: "/workspace/sample",
		});
		await ready(workbench);
		await workbench.dispatch({ type: "chat.send", text: "요청" });
		native.emit({
			type   : "notification",
			method : "item/agentMessage/delta",
			refs   : { threadId: "thread-1", turnId: "turn-1", itemId: "root-message" },
			params : { delta: "root draft" },
		});
		native.emit({
			type   : "notification",
			method : "item/completed",
			refs   : { itemId: "root-message" },
			params : { item: { type: "agentMessage", text: "소유권 없는 완료" } },
		});
		await Bun.sleep(10);

		expect(workbench.snapshot.draft).toBe("root draft");
		expect(workbench.snapshot.chat.some((message) => message.content === "소유권 없는 완료")).toBe(false);
		await workbench.close();
	});

	test("does not turn a Native userMessage completion into a missing assistant response", async () => {
		const native = new FakeNativeHarness();
		const journal = new MemoryJournal();
		const workbench = new ProjectWorkbench(native, journal, {
			projectId: "sample-project",
			cwd: "/workspace/sample",
		});
		await ready(workbench);
		await workbench.dispatch({ type: "chat.send", text: "실제 Native 질문" });

		native.emit({
			type   : "notification",
			method : "item/completed",
			refs   : { threadId: "thread-1", turnId: "turn-1", itemId: "native-user-message" },
			params : { item: { type: "userMessage", content: [{ type: "text", text: "실제 Native 질문" }] } },
		});
		native.emit({
			type   : "notification",
			method : "item/completed",
			refs   : { threadId: "thread-1", turnId: "turn-1", itemId: "native-agent-message" },
			params : { item: { type: "agentMessage", text: "실제 Native 답변" } },
		});
		native.emit({
			type   : "notification",
			method : "turn/completed",
			refs   : { threadId: "thread-1", turnId: "turn-1" },
			params : { turn: { id: "turn-1", status: "completed", error: null } },
		});
		await Bun.sleep(10);

		expect(workbench.snapshot.chat.map((message) => [message.role, message.content, message.status])).toEqual([
			["user", "실제 Native 질문", "completed"],
			["assistant", "실제 Native 답변", "completed"],
		]);
		expect(journal.records.filter((activity) => activity.payload.finalObservation === "missing")).toHaveLength(0);
		expect(journal.records.some((activity) =>
			activity.nativeRefs.itemId === "native-user-message" && activity.payload.role === "assistant",
		)).toBe(false);
		await workbench.close();
	});

	test("projects a nested interrupted turn/completed as a cancelled partial response", async () => {
		const native     = new FakeNativeHarness() ;
		const journal    = new MemoryJournal()     ;
		let tnoteCreates = 0                       ;
		const workbench = new ProjectWorkbench(native, journal, {
			projectId: "sample-project",
			cwd: "/workspace/sample",
			tnotes: {
				readAll: async () => [],
				create: async () => {
					tnoteCreates += 1;
					throw new Error("중단 turn은 자동 Note를 만들면 안 됩니다.");
				},
			},
		});
		await ready(workbench);
		await workbench.dispatch({ type: "chat.send", text: "중단할 요청" });
		native.emit({
			type   : "notification",
			method : "item/agentMessage/delta",
			refs   : { threadId: "thread-1", turnId: "turn-1", itemId: "interrupted-message" },
			params : { delta: "중단 전에 받은 부분" },
		});
		native.emit({
			type   : "notification",
			method : "turn/completed",
			refs   : { threadId: "thread-1", turnId: "turn-1" },
			params : { turn: { id: "turn-1", status: "interrupted", error: null } },
		});
		await Bun.sleep(10);

		expect(workbench.snapshot.chat.find((message) => message.role === "assistant")).toMatchObject({
			content : "중단 전에 받은 부분",
			status  : "cancelled",
			partial : true,
		});
		const preserved = journal.records.find((activity) => activity.payload.finalObservation === "missing");
		const terminal = journal.records.find((activity) => activity.payload.method === "turn/completed");
		expect(preserved).toMatchObject({ phase: "cancelled", payload: { terminalMethod: "turn/completed" } });
		expect(terminal).toMatchObject({ phase: "cancelled" });
		expect(tnoteCreates).toBe(0);
		expect(workbench.snapshot.draft).toBe("");
		await workbench.close();
	});

	test("renders an outputless interrupted turn as a terminal state notice", async () => {
		const native = new FakeNativeHarness();
		const journal = new MemoryJournal();
		const workbench = new ProjectWorkbench(native, journal, {
			projectId: "sample-project",
			cwd: "/workspace/sample",
		});
		await ready(workbench);
		await workbench.dispatch({ type: "chat.send", text: "바로 중단" });
		native.emit({
			type   : "notification",
			method : "item/agentMessage/delta",
			refs   : { threadId: "thread-1", turnId: "turn-1", itemId: "whitespace-message" },
			params : { delta: " \n\t" },
		});
		native.emit({
			type   : "notification",
			method : "turn/completed",
			refs   : { threadId: "thread-1", turnId: "turn-1" },
			params : { turn: { id: "turn-1", status: "interrupted", error: null } },
		});
		await Bun.sleep(10);

		expect(workbench.snapshot.chat.find((message) => message.role === "assistant")).toMatchObject({
			content : "답변 본문을 받기 전에 작업이 중단되었습니다.",
			status  : "cancelled",
			partial : false,
		});
		expect(journal.records.find((activity) => activity.payload.finalObservation === "missing")?.payload)
			.toMatchObject({ presentation: "terminal-status-notice", partial: false });
		await workbench.close();
	});

	test.each([
		["failed", "failed"],
		["cancelled", "cancelled"],
	] as const)("projects nested %s turn/completed status and skips the success checkpoint", async (nativeStatus, phase) => {
		const native     = new FakeNativeHarness() ;
		const journal    = new MemoryJournal()     ;
		let tnoteCreates = 0                       ;
		const workbench = new ProjectWorkbench(native, journal, {
			projectId: "sample-project",
			cwd: "/workspace/sample",
			tnotes: {
				readAll: async () => [],
				create: async () => {
					tnoteCreates += 1;
					throw new Error("비성공 turn은 자동 Note를 만들면 안 됩니다.");
				},
			},
		});
		await ready(workbench);
		await workbench.dispatch({ type: "chat.send", text: `${nativeStatus} 요청` });
		native.emit({
			type   : "notification",
			method : "item/agentMessage/delta",
			refs   : { threadId: "thread-1", turnId: "turn-1", itemId: `${nativeStatus}-message` },
			params : { delta: "종료 전 공개 부분" },
		});
		native.emit({
			type   : "notification",
			method : "turn/completed",
			refs   : { threadId: "thread-1", turnId: "turn-1" },
			params : { turn: { id: "turn-1", status: nativeStatus, error: null } },
		});
		await Bun.sleep(10);

		expect(workbench.snapshot.chat.find((message) => message.role === "assistant")).toMatchObject({
			content : "종료 전 공개 부분",
			status  : phase,
			partial : true,
		});
		expect(journal.records.find((activity) => activity.payload.method === "turn/completed")).toMatchObject({ phase });
		expect(tnoteCreates).toBe(0);
		await workbench.close();
	});

	test("uses nested completed turn status as a success Note checkpoint", async () => {
		const native     = new FakeNativeHarness() ;
		const journal    = new MemoryJournal()     ;
		let tnoteCreates = 0                       ;
		const workbench = new ProjectWorkbench(native, journal, {
			projectId: "sample-project",
			cwd: "/workspace/sample",
			tnotes: {
				readAll: async () => [],
				create: async () => {
					tnoteCreates += 1;
					throw new Error("checkpoint 관측용 종료");
				},
			},
		});
		await ready(workbench);
		await workbench.dispatch({ type: "chat.send", text: "정상 완료 요청" });
		native.emit({
			type   : "notification",
			method : "item/completed",
			refs   : { threadId: "thread-1", turnId: "turn-1", itemId: "completed-message" },
			params : { item: { type: "agentMessage", text: "정상 완료 답변" } },
		});
		native.emit({
			type   : "notification",
			method : "turn/completed",
			refs   : { threadId: "thread-1", turnId: "turn-1" },
			params : { turn: { id: "turn-1", status: "completed", error: null } },
		});
		await Bun.sleep(10);

		expect(journal.records.find((activity) => activity.payload.method === "turn/completed"))
			.toMatchObject({ phase: "completed" });
		expect(tnoteCreates).toBe(1);
		expect(workbench.snapshot.actionResult).toBeNull();
		native.emit({
			type   : "notification",
			method : "turn/completed",
			refs   : { threadId: "thread-1", turnId: "turn-1" },
			params : { turn: { id: "turn-1", status: "completed", error: null } },
		});
		await Bun.sleep(10);
		expect(tnoteCreates).toBe(1);
		await workbench.close();
	});

	test("preserves a partial answer and marks a completed turn with no final item as incomplete", async () => {
		const native = new FakeNativeHarness();
		const journal = new MemoryJournal();
		const workbench = new ProjectWorkbench(native, journal, {
			projectId: "sample-project",
			cwd: "/workspace/sample",
		});
		await ready(workbench);
		await workbench.dispatch({ type: "chat.send", text: "부분 답변 요청" });

		native.emit({
			type   : "notification",
			method : "item/agentMessage/delta",
			refs   : { threadId: "thread-1", turnId: "turn-1", itemId: "partial-message" },
			params : { delta: "받은 부분 답변" },
		});
		await Bun.sleep(10);
		expect(workbench.snapshot.draft).toBe("받은 부분 답변");

		native.emit({
			type   : "notification",
			method : "turn/completed",
			refs   : { threadId: "thread-1", turnId: "turn-1" },
			params : {},
		});
		await Bun.sleep(10);

		const assistant = workbench.snapshot.chat.filter((message) => message.role === "assistant");
		expect(assistant).toHaveLength(1);
		expect(assistant[0]).toMatchObject({ content: "받은 부분 답변", status: "incomplete", partial: true });
		expect(workbench.snapshot.activities.find((activity) => activity.id === assistant[0]?.activityId)?.nativeRefs)
			.toEqual({ threadId: "thread-1", turnId: "turn-1", itemId: "partial-message" });
		expect(workbench.snapshot.draft).toBe("");
		const partialIndex = journal.records.findIndex((activity) => activity.payload.finalObservation === "missing");
		const terminalIndex = journal.records.findIndex((activity) => activity.payload.method === "turn/completed");
		expect(partialIndex).toBeGreaterThanOrEqual(0);
		expect(partialIndex).toBeLessThan(terminalIndex);
		expect(journal.records[partialIndex]).toMatchObject({
			phase: "completed",
			nativeRefs: { threadId: "thread-1", turnId: "turn-1", itemId: "partial-message" },
			payload: {
				partial          : true,
				finalObservation : "missing",
				observationScope : "bounded-local-delta",
			},
		});

		native.emit({
			type   : "notification",
			method : "turn/completed",
			refs   : { threadId: "thread-1", turnId: "turn-1" },
			params : {},
		});
		native.emit({
			type   : "notification",
			method : "item/agentMessage/delta",
			refs   : { threadId: "thread-1", turnId: "turn-1", itemId: "partial-message" },
			params : { delta: "terminal 뒤 늦은 조각" },
		});
		await Bun.sleep(10);
		expect(workbench.snapshot.chat.filter((message) => message.role === "assistant")).toHaveLength(1);
		expect(workbench.snapshot.chat.find((message) => message.role === "assistant")?.content).toBe("받은 부분 답변");
		expect(workbench.snapshot.draft).toBe("");
		expect(journal.records.filter((activity) => activity.payload.finalObservation === "missing")).toHaveLength(1);
		await workbench.close();

		const resumed = new ProjectWorkbench(new FakeNativeHarness(), journal, {
			projectId      : "sample-project",
			cwd            : "/workspace/sample",
			resumeThreadId : "thread-1",
		});
		await ready(resumed);
		expect(resumed.snapshot.chat.find((message) => message.role === "assistant")).toMatchObject({
			content : "받은 부분 답변",
			status  : "incomplete",
			partial : true,
		});
		await resumed.close();
	});

	test.each([
		["turn/failed", "failed"],
		["turn/interrupted", "cancelled"],
		["turn/cancelled", "cancelled"],
	] as const)("preserves a partial answer when %s ends the turn", async (method, status) => {
		const native = new FakeNativeHarness();
		const workbench = new ProjectWorkbench(native, new MemoryJournal(), {
			projectId: "sample-project",
			cwd: "/workspace/sample",
		});
		await ready(workbench);
		await workbench.dispatch({ type: "chat.send", text: "종료 상태 요청" });
		native.emit({
			type   : "notification",
			method : "item/agentMessage/delta",
			refs   : { threadId: "thread-1", turnId: "turn-1", itemId: "partial-message" },
			params : { delta: "종료 전에 받은 답변" },
		});
		native.emit({
			type: "notification",
			method,
			refs: { threadId: "thread-1", turnId: "turn-1" },
			params: {},
		});
		await Bun.sleep(10);

		expect(workbench.snapshot.chat.find((message) => message.role === "assistant")).toMatchObject({
			content: "종료 전에 받은 답변",
			status,
		});
		expect(workbench.snapshot.draft).toBe("");
		await workbench.close();
	});

	test.each([
		["item/agentMessage/failed", "failed"],
		["item/agentMessage/cancelled", "cancelled"],
	] as const)("preserves a partial answer when %s is the only terminal observation", async (method, status) => {
		const native = new FakeNativeHarness();
		const workbench = new ProjectWorkbench(native, new MemoryJournal(), {
			projectId: "sample-project",
			cwd: "/workspace/sample",
		});
		await ready(workbench);
		await workbench.dispatch({ type: "chat.send", text: "item 종료 요청" });
		native.emit({
			type   : "notification",
			method : "item/agentMessage/delta",
			refs   : { threadId: "thread-1", turnId: "turn-1", itemId: "partial-message" },
			params : { delta: "item 종료 전에 받은 답변" },
		});
		native.emit({
			type: "notification",
			method,
			refs: { threadId: "thread-1", turnId: "turn-1", itemId: "partial-message" },
			params: {},
		});
		await Bun.sleep(10);

		expect(workbench.snapshot.chat.find((message) => message.role === "assistant")).toMatchObject({
			content: "item 종료 전에 받은 답변",
			status,
			partial: true,
		});
		expect(workbench.snapshot.draft).toBe("");
		await workbench.close();
	});

	test("shows an incomplete placeholder when a completed turn has no answer observation", async () => {
		const native = new FakeNativeHarness();
		const workbench = new ProjectWorkbench(native, new MemoryJournal(), {
			projectId: "sample-project",
			cwd: "/workspace/sample",
		});
		await ready(workbench);
		await workbench.dispatch({ type: "chat.send", text: "빈 응답 요청" });
		native.emit({
			type   : "notification",
			method : "turn/completed",
			refs   : { threadId: "thread-1", turnId: "turn-1" },
			params : {},
		});
		await Bun.sleep(10);

		expect(workbench.snapshot.chat.find((message) => message.role === "assistant")).toMatchObject({
			content : "최종 답변 본문을 받지 못했습니다.",
			status  : "incomplete",
			partial : false,
		});
		await workbench.close();
	});

	test("ignores duplicate completion and late delta only for the exact terminal item owner", async () => {
		const native = new FakeNativeHarness();
		const journal = new MemoryJournal();
		const workbench = new ProjectWorkbench(native, journal, {
			projectId: "sample-project",
			cwd: "/workspace/sample",
		});
		await ready(workbench);
		await workbench.dispatch({ type: "chat.send", text: "첫 요청" });
		native.emit({
			type   : "notification",
			method : "item/completed",
			refs   : { threadId: "thread-1", turnId: "turn-1", itemId: "same-item" },
			params : { item: { type: "agentMessage", text: "고정된 최종 답변" } },
		});
		native.emit({
			type   : "notification",
			method : "item/completed",
			refs   : { threadId: "thread-1", turnId: "turn-1", itemId: "same-item" },
			params : { item: { type: "agentMessage", text: "중복이 덮어쓴 답변" } },
		});
		native.emit({
			type   : "notification",
			method : "item/agentMessage/delta",
			refs   : { threadId: "thread-1", turnId: "turn-1", itemId: "same-item" },
			params : { delta: "늦게 온 조각" },
		});
		await Bun.sleep(10);

		expect(workbench.snapshot.chat.filter((message) => message.role === "assistant").map((message) => message.content))
			.toEqual(["고정된 최종 답변"]);
		expect(workbench.snapshot.draft).toBe("");
		expect(journal.records.filter((activity) => activity.nativeRefs.turnId === "turn-1" && activity.nativeRefs.itemId === "same-item"))
			.toHaveLength(1);

		native.emit({
			type   : "notification",
			method : "item/agentMessage/delta",
			refs   : { threadId: "thread-1", turnId: "turn-2", itemId: "same-item" },
			params : { delta: "다른 turn의 정상 조각" },
		});
		native.emit({
			type   : "notification",
			method : "item/agentMessage/delta",
			refs   : { threadId: "child-thread", turnId: "child-turn", itemId: "same-item" },
			params : { delta: "child 조각" },
		});
		await Bun.sleep(10);
		expect(workbench.snapshot.draft).toBe("다른 turn의 정상 조각");
		await workbench.close();
	});

	test("remembers a terminal message observation without relying on an item method prefix", async () => {
		const native = new FakeNativeHarness();
		const journal = new MemoryJournal();
		const workbench = new ProjectWorkbench(native, journal, {
			projectId: "sample-project",
			cwd: "/workspace/sample",
		});
		await ready(workbench);
		await workbench.dispatch({ type: "chat.send", text: "비표준 완료 통지" });
		native.emit({
			type   : "notification",
			method : "response/completed",
			refs   : { threadId: "thread-1", turnId: "turn-1", itemId: "response-message" },
			params : { item: { type: "agentMessage", text: "완전한 답변" } },
		});
		native.emit({
			type   : "notification",
			method : "response/completed",
			refs   : { threadId: "thread-1", turnId: "turn-1", itemId: "response-message" },
			params : { item: { type: "agentMessage", text: "중복 답변" } },
		});
		native.emit({
			type   : "notification",
			method : "item/agentMessage/delta",
			refs   : { threadId: "thread-1", turnId: "turn-1", itemId: "response-message" },
			params : { delta: "늦은 조각" },
		});
		native.emit({
			type   : "notification",
			method : "turn/completed",
			refs   : { threadId: "thread-1", turnId: "turn-1" },
			params : { turn: { id: "turn-1", status: "completed", error: null } },
		});
		await Bun.sleep(10);

		expect(workbench.snapshot.chat.filter((message) => message.role === "assistant").map((message) => ({
			content: message.content,
			status: message.status,
		}))).toEqual([{ content: "완전한 답변", status: "completed" }]);
		expect(workbench.snapshot.draft).toBe("");
		expect(journal.records.filter((activity) => activity.nativeRefs.itemId === "response-message")).toHaveLength(1);
		expect(journal.records.filter((activity) => activity.payload.finalObservation === "missing")).toHaveLength(0);
		await workbench.close();
	});

	test("does not accept a sparse assistant completion without a turn owner", async () => {
		const native = new FakeNativeHarness();
		const journal = new MemoryJournal();
		const workbench = new ProjectWorkbench(native, journal, {
			projectId: "sample-project",
			cwd: "/workspace/sample",
		});
		await ready(workbench);
		await workbench.dispatch({ type: "chat.send", text: "소유권 확인" });
		native.emit({
			type   : "notification",
			method : "item/completed",
			refs   : { threadId: "thread-1", itemId: "unowned-final" },
			params : { item: { type: "agentMessage", text: "turn 없는 완료" } },
		});
		native.emit({
			type   : "notification",
			method : "turn/completed",
			refs   : { threadId: "thread-1", turnId: "turn-1" },
			params : { turn: { id: "turn-1", status: "completed", error: null } },
		});
		await Bun.sleep(10);

		expect(workbench.snapshot.chat.some((message) => message.content === "turn 없는 완료")).toBe(false);
		expect(workbench.snapshot.chat.filter((message) => message.role === "assistant")).toEqual([
			expect.objectContaining({
				content : "최종 답변 본문을 받지 못했습니다.",
				status  : "incomplete",
				partial : false,
			}),
		]);
		expect(journal.records.some((activity) => activity.nativeRefs.itemId === "unowned-final")).toBe(false);
		await workbench.close();
	});

	test("preserves only the unfinished item when another item in the turn already completed", async () => {
		const native = new FakeNativeHarness();
		const workbench = new ProjectWorkbench(native, new MemoryJournal(), {
			projectId: "sample-project",
			cwd: "/workspace/sample",
		});
		await ready(workbench);
		await workbench.dispatch({ type: "chat.send", text: "여러 item 요청" });
		native.emit({
			type   : "notification",
			method : "item/agentMessage/delta",
			refs   : { threadId: "thread-1", turnId: "turn-1", itemId: "message-a" },
			params : { delta: "A 초안" },
		});
		native.emit({
			type   : "notification",
			method : "item/agentMessage/delta",
			refs   : { threadId: "thread-1", turnId: "turn-1", itemId: "message-b" },
			params : { delta: "B 부분 답변" },
		});
		native.emit({
			type   : "notification",
			method : "item/completed",
			refs   : { threadId: "thread-1", turnId: "turn-1", itemId: "message-a" },
			params : { item: { type: "agentMessage", text: "A 최종 답변" } },
		});
		native.emit({
			type   : "notification",
			method : "turn/completed",
			refs   : { threadId: "thread-1", turnId: "turn-1" },
			params : {},
		});
		await Bun.sleep(10);

		expect(workbench.snapshot.chat.filter((message) => message.role === "assistant").map((message) => ({
			content: message.content,
			status: message.status,
		}))).toEqual([
			{ content: "A 최종 답변", status: "completed" },
			{ content: "B 부분 답변", status: "incomplete" },
		]);
		expect(workbench.snapshot.draft).toBe("");
		await workbench.close();
	});

	test("does not clear a different turn draft when an older root turn terminates", async () => {
		const native = new FakeNativeHarness();
		const workbench = new ProjectWorkbench(native, new MemoryJournal(), {
			projectId: "sample-project",
			cwd: "/workspace/sample",
		});
		await ready(workbench);
		await workbench.dispatch({ type: "chat.send", text: "첫 요청" });
		native.emit({
			type   : "notification",
			method : "item/agentMessage/delta",
			refs   : { threadId: "thread-1", turnId: "turn-2", itemId: "same-item" },
			params : { delta: "다른 turn의 진행 중 답변" },
		});
		native.emit({
			type   : "notification",
			method : "turn/completed",
			refs   : { threadId: "thread-1", turnId: "turn-1" },
			params : {},
		});
		await Bun.sleep(10);

		expect(workbench.snapshot.draft).toBe("다른 turn의 진행 중 답변");
		expect(workbench.snapshot.chat.find((message) => message.role === "assistant")).toMatchObject({
			content: "최종 답변 본문을 받지 못했습니다.",
			status: "incomplete",
		});
		await workbench.close();
	});

	test("hydrates terminal item identity from the local journal before accepting resumed deltas", async () => {
		const native = new FakeNativeHarness();
		const journal = new MemoryJournal();
		await journal.append({
			projectId    : "sample-project",
			kind         : "message",
			phase        : "completed",
			provider     : "openai-codex",
			nativeRefs   : { threadId: "thread-1", turnId: "turn-resumed", itemId: "terminal-message" },
			sourceDigest : `sha256:${"b".repeat(64)}`,
			payload      : { method: "item/completed", role: "assistant", text: "재개 전 최종 답변" },
		});
		native.readValue = { status: { type: "active" }, turns: [{ id: "turn-resumed", status: "inProgress" }] };
		const workbench = new ProjectWorkbench(native, journal, {
			projectId      : "sample-project",
			cwd            : "/workspace/sample",
			resumeThreadId : "thread-1",
		});
		await ready(workbench);
		const before = journal.records.length;

		native.emit({
			type   : "notification",
			method : "item/agentMessage/delta",
			refs   : { threadId: "thread-1", turnId: "turn-resumed", itemId: "terminal-message" },
			params : { delta: "재개 뒤 늦은 조각" },
		});
		await Bun.sleep(10);

		expect(workbench.snapshot.draft).toBe("");
		expect(journal.records).toHaveLength(before);
		expect(workbench.snapshot.chat.filter((message) => message.role === "assistant").map((message) => message.content))
			.toEqual(["재개 전 최종 답변"]);
		await workbench.close();
	});

	test("ignores a late start for a terminal turn without replacing the active FIFO turn", async () => {
		const native = new FakeNativeHarness();
		const workbench = new ProjectWorkbench(native, new MemoryJournal(), {
			projectId: "sample-project",
			cwd: "/workspace/sample",
		});
		await ready(workbench);
		await workbench.dispatch({ type: "chat.send", text: "첫 요청" });
		await workbench.dispatch({ type: "chat.send", text: "두 번째 요청" });
		await workbench.dispatch({ type: "chat.send", text: "세 번째 요청" });

		native.emit({ type: "notification", method: "turn/completed", refs: { threadId: "thread-1", turnId: "turn-1" }, params: {} });
		await Bun.sleep(10);
		expect(workbench.snapshot.activeTurnId).toBe("turn-2");

		native.emit({ type: "notification", method: "turn/started", refs: { threadId: "thread-1", turnId: "turn-1" }, params: {} });
		await Bun.sleep(10);
		expect(workbench.snapshot.activeTurnId).toBe("turn-2");
		expect(workbench.snapshot.chatQueue.map((message) => message.content)).toEqual(["세 번째 요청"]);

		native.emit({ type: "notification", method: "turn/completed", refs: { threadId: "thread-1", turnId: "turn-2" }, params: {} });
		await Bun.sleep(10);
		expect(native.startTurnInputs.map((input) => input.text)).toEqual(["첫 요청", "두 번째 요청", "세 번째 요청"]);
		expect(workbench.snapshot.activeTurnId).toBe("turn-3");
		expect(workbench.snapshot.chatQueue).toEqual([]);
		await workbench.close();
	});

	test("records one failed bubble and recovers after a definite first-send failure", async () => {
		const native = new FakeNativeHarness();
		native.startTurnErrors.set(1, new Error("definite send failure"));
		const journal = new MemoryJournal();
		const workbench = new ProjectWorkbench(native, journal, { projectId: "sample-project", cwd: "/workspace/sample" });
		await ready(workbench);
		expect(await workbench.dispatch({ type: "chat.send", text: "실패할 요청" })).toMatchObject({ state: "rejected" });
		expect(workbench.snapshot.chat).toHaveLength(1);
		expect(workbench.snapshot.chat[0]).toMatchObject({ content: "실패할 요청", status: "failed" });
		const failedActivities = journal.records.filter(activity => activity.kind === "message");
		expect(failedActivities.map(activity => activity.phase)).toEqual(["started", "failed"]);
		expect(new Set(failedActivities.map(activity => activity.nativeRefs.itemId)).size).toBe(1);

		expect(await workbench.dispatch({ type: "chat.send", text: "회복 요청" })).toMatchObject({ state: "accepted" });
		expect(native.startTurnInputs.map(input => input.text)).toEqual(["실패할 요청", "회복 요청"]);
		await workbench.close();
	});

	test("continues FIFO after a definite queued-send failure without duplicate bubbles", async () => {
		const native = new FakeNativeHarness();
		native.startTurnErrors.set(2, new Error("definite queued failure"));
		const journal = new MemoryJournal();
		const workbench = new ProjectWorkbench(native, journal, { projectId: "sample-project", cwd: "/workspace/sample" });
		await ready(workbench);
		await workbench.dispatch({ type: "chat.send", text: "첫 요청" });
		await workbench.dispatch({ type: "chat.send", text: "실패할 큐 요청" });
		await workbench.dispatch({ type: "chat.send", text: "계속할 큐 요청" });

		native.emit({ type: "notification", method: "turn/completed", refs: { threadId: "thread-1", turnId: "turn-1" }, params: {} });
		await Bun.sleep(10);

		expect(native.startTurnInputs.map(input => input.text)).toEqual(["첫 요청", "실패할 큐 요청", "계속할 큐 요청"]);
		expect(workbench.snapshot.chatQueue).toEqual([]);
		expect(workbench.snapshot.chat.filter(message => message.content === "실패할 큐 요청")).toHaveLength(1);
		expect(workbench.snapshot.chat.find(message => message.content === "실패할 큐 요청")?.status).toBe("failed");
		await workbench.close();
	});

	test("reconciles an uncertain queued send from native lifecycle without duplicate delivery", async () => {
		const native = new FakeNativeHarness();
		native.startTurnErrors.set(2, {
			state      : "uncertain",
			resolution : "manual-reconcile",
			method     : "turn/start",
			requestId  : 8,
		});
		const workbench = new ProjectWorkbench(native, new MemoryJournal(), { projectId: "sample-project", cwd: "/workspace/sample" });
		await ready(workbench);
		await workbench.dispatch({ type: "chat.send", text: "첫 요청" });
		const uncertainQueued = await workbench.dispatch({ type: "chat.send", text: "수신 불명 요청" });
		const finalQueued = await workbench.dispatch({ type: "chat.send", text: "마지막 요청" });
		expect(uncertainQueued).toMatchObject({ state: "queued", position: 1 });
		expect(finalQueued).toMatchObject({ state: "queued", position: 2 });

		native.emit({ type: "notification", method: "turn/completed", refs: { threadId: "thread-1", turnId: "turn-1" }, params: {} });
		await Bun.sleep(10);
		expect(native.startTurnCalls).toBe(2);
		expect(workbench.snapshot.chatQueue.map(message => message.content)).toEqual(["마지막 요청"]);
		expect(workbench.snapshot.chat.filter(message => message.content === "수신 불명 요청")).toHaveLength(1);
		expect(workbench.snapshot.error).toContain("자동 재시도하지 않습니다");

		native.emit({ type: "notification", method: "turn/started", refs: { threadId: "thread-1", turnId: "turn-2" }, params: {} });
		await Bun.sleep(10);
		expect(workbench.snapshot.chatQueue.map(message => message.content)).toEqual(["마지막 요청"]);
		expect(workbench.snapshot.chat.find(message => message.content === "수신 불명 요청")?.status).toBe("completed");
		expect(workbench.snapshot.error).toBeNull();
		native.emit({ type: "notification", method: "turn/completed", refs: { threadId: "thread-1", turnId: "turn-2" }, params: {} });
		await Bun.sleep(10);

		expect(native.startTurnInputs.map(input => input.text)).toEqual(["첫 요청", "수신 불명 요청", "마지막 요청"]);
		expect(workbench.snapshot.chatQueue).toEqual([]);
		await workbench.close();
	});

	test("explicit cancel escapes an uncertain queued send without retrying it and preserves the remaining FIFO", async () => {
		const native = new FakeNativeHarness();
		native.startTurnErrors.set(2, {
			state      : "uncertain",
			resolution : "manual-reconcile",
			method     : "turn/start",
			requestId  : 9,
		});
		const workbench = new ProjectWorkbench(native, new MemoryJournal(), { projectId: "sample-project", cwd: "/workspace/sample" });
		await ready(workbench);
		await workbench.dispatch({ type: "chat.send", text: "첫 요청" });
		await workbench.dispatch({ type: "chat.send", text: "수신 불명 요청" });
		await workbench.dispatch({ type: "chat.send", text: "세 번째 요청" });
		await workbench.dispatch({ type: "chat.send", text: "네 번째 요청" });

		native.emit({ type: "notification", method: "turn/completed", refs: { threadId: "thread-1", turnId: "turn-1" }, params: {} });
		await Bun.sleep(10);
		expect(native.startTurnInputs.map(input => input.text)).toEqual(["첫 요청", "수신 불명 요청"]);
		expect(workbench.snapshot.chatQueue.map(message => message.content)).toEqual([
			"세 번째 요청",
			"네 번째 요청",
		]);
		expect(workbench.snapshot.chat.filter(message => message.content === "수신 불명 요청")).toHaveLength(1);

		const recovered = await workbench.dispatch({ type: "chat.cancel" });
		expect(recovered).toMatchObject({
			state: "accepted",
			message: "수신 여부가 불명확한 전송을 취소하고 대기열을 재개했습니다.",
		});
		expect(native.startTurnInputs.map(input => input.text)).toEqual([
			"첫 요청",
			"수신 불명 요청",
			"세 번째 요청",
		]);
		expect(workbench.snapshot.chat.find(message => message.content === "수신 불명 요청")?.status).toBe("cancelled");
		expect(workbench.snapshot.chatQueue.map(message => message.content)).toEqual(["네 번째 요청"]);
		expect(workbench.snapshot.error).toBeNull();

		native.emit({ type: "notification", method: "turn/completed", refs: { threadId: "thread-1", turnId: "turn-3" }, params: {} });
		await Bun.sleep(10);
		expect(native.startTurnInputs.map(input => input.text)).toEqual([
			"첫 요청",
			"수신 불명 요청",
			"세 번째 요청",
			"네 번째 요청",
		]);
		expect(native.startTurnInputs.filter(input => input.text === "수신 불명 요청")).toHaveLength(1);
		expect(workbench.snapshot.chatQueue).toEqual([]);
		await workbench.close();
	});

	test("explicit cancel reconciles and interrupts a server-received uncertain turn before draining FIFO", async () => {
		const native = new FakeNativeHarness();
		native.startTurnErrors.set(2, {
			state      : "uncertain",
			resolution : "manual-reconcile",
			method     : "turn/start",
			requestId  : 10,
		});
		native.readValue = {
			status: { type: "active" },
			turns: [
				{ id: "turn-1", status: "completed" },
				{ id: "turn-2", status: "inProgress" },
			],
		};
		const workbench = new ProjectWorkbench(native, new MemoryJournal(), { projectId: "sample-project", cwd: "/workspace/sample" });
		await ready(workbench);
		await workbench.dispatch({ type: "chat.send", text: "첫 요청" });
		await workbench.dispatch({ type: "chat.send", text: "서버가 받은 불확정 요청" });
		await workbench.dispatch({ type: "chat.send", text: "기다리는 요청" });
		native.emit({ type: "notification", method: "turn/completed", refs: { threadId: "thread-1", turnId: "turn-1" }, params: {} });
		await Bun.sleep(10);

		const recovered = await workbench.dispatch({ type: "chat.cancel" });
		expect(recovered).toMatchObject({
			state: "accepted",
			message: "서버가 수신한 불확정 전송을 중단했습니다. 종료 확인 뒤 대기열을 재개합니다.",
		});
		expect(native.readInputs.at(-1)).toEqual({ threadId: "thread-1", includeTurns: true });
		expect(native.interruptInputs).toEqual([{ threadId: "thread-1", turnId: "turn-2" }]);
		expect(native.startTurnInputs.map(input => input.text)).toEqual(["첫 요청", "서버가 받은 불확정 요청"]);
		expect(workbench.snapshot.activeTurnId).toBe("turn-2");
		expect(workbench.snapshot.workFlow.goal).toBe("서버가 받은 불확정 요청");
		expect(workbench.snapshot.chatQueue.map(message => message.content)).toEqual(["기다리는 요청"]);
		native.emit({
			type   : "notification",
			method : "item/started",
			refs   : { threadId: "thread-1", turnId: "turn-2", itemId: "tool-between-reconcile-and-terminal" },
			params : { item: { type: "commandExecution", command: "pwd" } },
		});
		await Bun.sleep(10);
		expect(workbench.snapshot.activeTurnId).toBe("turn-2");
		expect(workbench.snapshot.chatQueue.map(message => message.content)).toEqual(["기다리는 요청"]);

		native.emit({ type: "notification", method: "turn/interrupted", refs: { threadId: "thread-1", turnId: "turn-2" }, params: {} });
		await Bun.sleep(10);
		expect(native.startTurnInputs.map(input => input.text)).toEqual([
			"첫 요청",
			"서버가 받은 불확정 요청",
			"기다리는 요청",
		]);
		expect(native.startTurnInputs.filter(input => input.text === "서버가 받은 불확정 요청")).toHaveLength(1);
		expect(workbench.snapshot.chatQueue).toEqual([]);
		await workbench.close();
	});

	test("keeps an uncertain FIFO blocked when thread read shape is unknown", async () => {
		const native = new FakeNativeHarness();
		native.startTurnErrors.set(2, {
			state      : "uncertain",
			resolution : "manual-reconcile",
			method     : "turn/start",
			requestId  : 11,
		});
		native.readValue = {};
		const workbench = new ProjectWorkbench(native, new MemoryJournal(), { projectId: "sample-project", cwd: "/workspace/sample" });
		await ready(workbench);
		await workbench.dispatch({ type: "chat.send", text: "첫 요청" });
		await workbench.dispatch({ type: "chat.send", text: "불확정 요청" });
		await workbench.dispatch({ type: "chat.send", text: "보존할 요청" });
		native.emit({ type: "notification", method: "turn/completed", refs: { threadId: "thread-1", turnId: "turn-1" }, params: {} });
		await Bun.sleep(10);

		expect(await workbench.dispatch({ type: "chat.cancel" })).toMatchObject({ state: "rejected" });
		expect(native.startTurnInputs.map(input => input.text)).toEqual(["첫 요청", "불확정 요청"]);
		expect(native.interruptInputs).toEqual([]);
		expect(workbench.snapshot.chatQueue.map(message => message.content)).toEqual(["보존할 요청"]);
		expect(workbench.snapshot.chat.filter(message => message.content === "불확정 요청")).toHaveLength(1);
		await workbench.close();
	});

	test("does not drain queued chat after the workbench closes", async () => {
		const native = new FakeNativeHarness();
		const workbench = new ProjectWorkbench(native, new MemoryJournal(), { projectId: "sample-project", cwd: "/workspace/sample" });
		await ready(workbench);
		await workbench.dispatch({ type: "chat.send", text: "첫 요청" });
		await workbench.dispatch({ type: "chat.send", text: "닫힌 뒤 요청" });
		await workbench.close();

		native.emit({ type: "notification", method: "turn/completed", refs: { threadId: "thread-1", turnId: "turn-1" }, params: {} });
		await Bun.sleep(10);

		expect(native.startTurnCalls).toBe(1);
		expect(workbench.snapshot.phase).toBe("closed");
		expect(workbench.snapshot.chatQueue.map(message => message.content)).toEqual(["닫힌 뒤 요청"]);
	});

	test("keeps an active turn through item and hook completion until the turn lifecycle terminates", async () => {
		const native = new FakeNativeHarness();
		const workbench = new ProjectWorkbench(native, new MemoryJournal(), { projectId: "sample-project", cwd: "/workspace/sample" });
		await ready(workbench);
		await workbench.dispatch({ type: "chat.send", text: "진행" });
		expect(workbench.snapshot.activeTurnId).toBe("turn-1");
		for (const method of ["item/completed", "hook/completed", "turn/tool/completed"]) {
			native.emit({ type: "notification", method, refs: { threadId: "thread-1", turnId: "turn-1", itemId: `${method}-1` }, params: {} });
			await Bun.sleep(10);
			expect(workbench.snapshot.activeTurnId).toBe("turn-1");
			expect(native.startTurnCalls).toBe(1);
		}
		native.emit({ type: "notification", method: "turn/completed", refs: { threadId: "thread-1", turnId: "turn-1" }, params: {} });
		await Bun.sleep(10);
		expect(workbench.snapshot.activeTurnId).toBeNull();
		await workbench.close();
	});

	test("resolves a pending approval by request id when the resolution omits its thread ref", async () => {
		const native = new FakeNativeHarness();
		const workbench = new ProjectWorkbench(native, new MemoryJournal(), { projectId: "sample-project", cwd: "/workspace/sample" });
		await ready(workbench);
		native.emit({
			type: "approval-requested",
			approval: { requestId: 44, callbackId: null, kind: "command", refs: { threadId: "thread-1", approvalRequestId: 44 }, availableDecisions: ["decline"], params: {} },
		});
		await Bun.sleep(10);
		expect(workbench.snapshot.pendingApproval?.requestId).toBe(44);
		native.emit({ type: "approval-resolved", requestId: 44, approvalId: 44, refs: {} });
		await Bun.sleep(10);
		expect(workbench.snapshot.pendingApproval).toBeNull();
		await workbench.close();
	});

	test("persists approval response preparation before Native transmission", async () => {
		const native    = new FakeNativeHarness()                                                                          ;
		const journal   = new ApprovalPreparationGateJournal()                                                             ;
		const workbench = new ProjectWorkbench(native, journal, { projectId: "sample-project", cwd: "/workspace/sample" }) ;
		await ready(workbench);
		native.emit({
			type: "approval-requested",
			approval: { requestId: 47, callbackId: "callback-47", kind: "command", refs: { threadId: "thread-1", turnId: "turn-1" }, availableDecisions: ["decline"], params: {} },
		});
		await Bun.sleep(5);
		const dispatch = workbench.dispatch({ type: "approval.resolve", requestId: 47, response: { decision: "decline" } });
		await journal.preparationReached;
		expect(native.approvalResponses).toEqual([]);
		journal.release();
		expect(await dispatch).toMatchObject({ state: "accepted" });
		expect(journal.records.filter(entry => entry.payload.operation === "approval/response-prepared")).toHaveLength(1);
		expect(native.approvalResponses).toEqual([{ requestId: 47, response: { decision: "decline" } }]);
		await workbench.close();
	});

	test("does not resend another decision after approval delivery becomes uncertain", async () => {
		const native = new FakeNativeHarness();
		const journal = new MemoryJournal();
		native.approvalResponseError = new Error("transport failed after write");
		const workbench = new ProjectWorkbench(native, journal, { projectId: "sample-project", cwd: "/workspace/sample" });
		await ready(workbench);
		native.emit({
			type: "approval-requested",
			approval: { requestId: 48, callbackId: null, kind: "command", refs: { threadId: "thread-1", turnId: "turn-1" }, availableDecisions: ["accept", "decline"], params: {} },
		});
		await Bun.sleep(5);
		expect(await workbench.dispatch({ type: "approval.resolve", requestId: 48, response: { decision: "accept" } }))
			.toMatchObject({ state: "rejected", reason: expect.stringContaining("재전송하지 않고") });
		expect(await workbench.dispatch({ type: "approval.resolve", requestId: 48, response: { decision: "decline" } }))
			.toMatchObject({ state: "rejected" });
		expect(native.approvalResponses).toHaveLength(1);
		expect(journal.records.map(entry => entry.payload.operation).filter(Boolean)).toEqual([
			"approval/response-prepared",
			"approval/response-uncertain",
		]);
		await workbench.close();
	});

	test("restores an unresolved approval transmission interlock before resuming Native", async () => {
		const journal     = new MemoryJournal()                                                                                                                                                     ;
		const firstNative = new FakeNativeHarness()                                                                                                                                                 ;
		const approval    = { requestId: 49, callbackId: "cb-49", kind: "command" as const, refs: { threadId: "thread-1", turnId: "turn-1" }, availableDecisions: ["accept" as const], params: {} } ;
		const first       = new ProjectWorkbench(firstNative, journal, { projectId: "sample-project", cwd: "/workspace/sample" })                                                                   ;
		await ready(first);
		firstNative.emit({ type: "approval-requested", approval });
		await Bun.sleep(5);
		expect(await first.dispatch({ type: "approval.resolve", requestId: 49, response: { decision: "accept" } })).toMatchObject({ state: "accepted" });
		await first.close();
		const resumedNative = new FakeNativeHarness();
		const resumed = new ProjectWorkbench(resumedNative, journal, { projectId: "sample-project", cwd: "/workspace/sample", resumeThreadId: "thread-1" });
		await ready(resumed);
		resumedNative.emit({ type: "approval-requested", approval });
		await Bun.sleep(5);
		expect(await resumed.dispatch({ type: "approval.resolve", requestId: 49, response: { decision: "accept" } })).toMatchObject({ state: "rejected" });
		expect(resumedNative.approvalResponses).toHaveLength(0);
		await resumed.close();
	});

	test("ignores an approval from another thread instead of mixing it into the active root turn", async () => {
		const native = new FakeNativeHarness();
		const workbench = new ProjectWorkbench(native, new MemoryJournal(), {
			projectId: "sample-project",
			cwd: "/workspace/sample",
		});
		await ready(workbench);
		await workbench.dispatch({ type: "chat.send", text: "서브에이전트를 포함한 루트 요청" });

		native.emit({
			type: "approval-requested",
			approval: {
				requestId          : 46,
				callbackId         : null,
				kind               : "command",
				refs               : { threadId: "child-thread", turnId: "child-turn", approvalRequestId: 46 },
				availableDecisions : ["accept", "decline"],
				params             : {},
			},
		});
		await Bun.sleep(10);

		expect(workbench.snapshot.pendingApproval).toBeNull();
		expect(workbench.snapshot.threadId).toBe("thread-1");
		expect(workbench.snapshot.activeTurnId).toBe("turn-1");
		expect(await workbench.dispatch({ type: "chat.send", text: "루트 턴 뒤 처리할 요청" }))
			.toMatchObject({ state: "queued", position: 1 });
		expect(await workbench.dispatch({
			type      : "approval.resolve",
			requestId : 46,
			response  : { decision: "accept" },
		})).toMatchObject({ state: "rejected" });
		expect(native.approvalResponses).toEqual([]);
		expect(workbench.snapshot.threadId).toBe("thread-1");
		expect(workbench.snapshot.activeTurnId).toBe("turn-1");
		expect(native.startTurnInputs.map(input => input.threadId)).toEqual(["thread-1"]);
		await workbench.close();
	});

	test("holds multiple queued messages through approval and drains them only after resolution and turn completion", async () => {
		const native = new FakeNativeHarness();
		const workbench = new ProjectWorkbench(native, new MemoryJournal(), { projectId: "sample-project", cwd: "/workspace/sample" });
		await ready(workbench);
		await workbench.dispatch({ type: "chat.send", text: "승인이 필요한 요청" });
		native.emit({
			type: "approval-requested",
			approval: {
				requestId          : 45,
				callbackId         : null,
				kind               : "command",
				refs               : { threadId: "thread-1", turnId: "turn-1", approvalRequestId: 45 },
				availableDecisions : ["accept", "decline"],
				params             : {},
			},
		});
		await Bun.sleep(5);
		expect(workbench.snapshot.phase).toBe("working");
		await workbench.dispatch({ type: "chat.send", text: "승인 뒤 첫 요청" });
		await workbench.dispatch({ type: "chat.send", text: "승인 뒤 두 번째 요청" });
		expect(workbench.snapshot.chatQueue.map(item => item.content)).toEqual(["승인 뒤 첫 요청", "승인 뒤 두 번째 요청"]);
		expect(native.startTurnCalls).toBe(1);
		await workbench.dispatch({ type: "approval.resolve", requestId: 45, response: { decision: "accept" } });
		native.emit({ type: "approval-resolved", requestId: 45, approvalId: 45, refs: { threadId: "thread-1", turnId: "turn-1" } });
		await Bun.sleep(5);
		expect(workbench.snapshot.pendingApproval).toBeNull();
		expect(native.startTurnCalls).toBe(1);
		native.emit({ type: "notification", method: "turn/completed", refs: { threadId: "thread-1", turnId: "turn-1" }, params: {} });
		await Bun.sleep(5);
		expect(native.startTurnInputs.map(input => input.text)).toEqual(["승인이 필요한 요청", "승인 뒤 첫 요청"]);
		native.emit({ type: "notification", method: "turn/completed", refs: { threadId: "thread-1", turnId: "turn-2" }, params: {} });
		await Bun.sleep(5);
		expect(native.startTurnInputs.map(input => input.text)).toEqual(["승인이 필요한 요청", "승인 뒤 첫 요청", "승인 뒤 두 번째 요청"]);
		await workbench.close();
	});
});

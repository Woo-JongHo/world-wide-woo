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

function requestReport(title: string, conclusion = "요청 범위와 실제 결과를 연결했고 관측되지 않은 변경은 주장하지 않았습니다."): string {
	return [
		`REPORT: request-report-v3\n제목:\n${title}`,
		"요청 목적·접근:\n완료 요청의 목적과 판단 기준을 확인하고 관측된 실행을 요청 단위로 정리했습니다.",
		"주요 작업:\n선택 범위의 조사, 결정, 변경과 검증을 시간 순서로 확인했습니다.",
		"장시간·차단 작업:\n관측 없음",
		"잘된 점:\n실행 사실과 검증 결과를 분리해 기록했습니다.",
		"모델·토큰:\n관측 없음",
		`업무 자체평가:\n${conclusion}`,
		"다음 유사 요청:\n초기에 관측 범위와 검증 기준을 고정하고 변경과 근거를 함께 추적합니다.",
		"변경 상태:\n코드·문서·GitHub·Linear 변경 관측 없음",
		"Commit·Evidence:\n관측 없음",
	].join("\n\n");
}

describe("ProjectWorkbench · Todo, narration, and Notes", () => {
	test("preserves rewritten root-plan Trace while seven-stage Todo survives resume", async () => {
		const native      = new FakeNativeHarness()                                      ;
		const journal     = new MemoryJournal()                                          ;
		const mirrored    = { todo: null as TodoDocument | null }                        ;
		let revision      = 0                                                            ;
		const unsupported = async (): Promise<never> => { throw new Error("not used"); } ;
		const todos: WorkbenchTodoSource = {
			snapshot: null,
			subscribe: () => () => undefined,
			syncRequestRuntime: async (request) => {
				mirrored.todo = projectRequestTodo(request, "workbench", ++revision);
				return mirrored.todo;
			},
			create         : unsupported,
			add            : unsupported,
			addDetails     : unsupported,
			start          : unsupported,
			complete       : unsupported,
			block          : unsupported,
			reopen         : unsupported,
			recordEvidence : async () => null,
			importLegacy   : async () => null,
		};
		const workbench = new ProjectWorkbench(native, journal, {
			projectId: "sample-project",
			cwd: "/workspace/sample",
			todos,
		});
		await ready(workbench);
		await workbench.dispatch({ type: "chat.send", text: "계획을 끝까지 반영해줘" });

		native.emit({ type: "notification", method: "turn/started", refs: { threadId: "thread-1", turnId: "turn-1" }, params: {} });
		native.emit({
			type   : "notification",
			method : "turn/plan/updated",
			refs   : { threadId: "thread-1", turnId: "turn-1" },
			params : { plan: [{ step: "루트 계획", status: "inProgress" }] },
		});
		await Bun.sleep(10);
		native.emit({
			type   : "notification",
			method : "item/completed",
			refs   : { threadId: "child-thread", turnId: "child-turn", itemId: "child-write-1" },
			params : { item: { type: "commandExecution", command: "apply_patch child.md" } },
		});
		native.emit({
			type   : "notification",
			method : "item/completed",
			refs   : { threadId: "thread-1", turnId: "turn-1", itemId: "write-1" },
			params : { item: { type: "commandExecution", command: "apply_patch Todo.md" } },
		});
		native.emit({
			type   : "notification",
			method : "turn/plan/updated",
			refs   : { threadId: "thread-1", turnId: "turn-1" },
			params : { plan: [{ step: "루트 계획", status: "completed" }] },
		});
		await Bun.sleep(10);

		const finalFlow     = workbench.snapshot.workFlow                                                        ;
		const finalIdentity = finalFlow.steps[0]?.id                                                             ;
		const childActivity = journal.records.find((activity) => activity.nativeRefs.itemId === "child-write-1") ;
		const rootActivity  = journal.records.find((activity) => activity.nativeRefs.itemId === "write-1")       ;
		expect(finalFlow.source).toMatchObject({ turnId: "turn-1", algorithm: "dplan-v1" });
		expect(finalFlow.steps[0]).toMatchObject({ title: "루트 계획", status: "completed", activityIds: [rootActivity?.id] });
		expect(finalFlow.steps[0]?.activityIds).not.toContain(childActivity?.id);
		expect(finalFlow.orphans).toEqual(expect.arrayContaining([
			expect.objectContaining({ activityId: childActivity?.id, reason: "source_mismatch" }),
		]));
		const finalTodo = mirrored.todo;
		if (!finalTodo) throw new Error("Todo mirror was not invoked for the rewritten root plan.");
		expect(finalTodo.items.map(item => item.content)).toEqual([...REQUEST_STAGES]);
		expect(finalTodo.items[0]?.status).toBe("in_progress");

		native.emit({ type: "notification", method: "turn/completed", refs: { threadId: "thread-1", turnId: "turn-1" }, params: {} });
		await Bun.sleep(10);
		await workbench.close();

		const resumed = new ProjectWorkbench(new FakeNativeHarness(), journal, {
			projectId      : "sample-project",
			cwd            : "/workspace/sample",
			resumeThreadId : "thread-1",
		});
		await ready(resumed);
		expect(resumed.snapshot.workFlow.source).toMatchObject({ turnId: "turn-1", algorithm: "dplan-v1" });
		expect(resumed.snapshot.workFlow.steps[0]).toMatchObject({ id: finalIdentity, title: "루트 계획", status: "completed" });
		expect(resumed.snapshot.requestRuntime).toEqual(workbench.snapshot.requestRuntime);
		expect(resumed.snapshot.todo?.items.every(item => item.status === "blocked")).toBe(true);
		await resumed.close();
	});

	test("narrates reading and tests inside the runtime stage without inventing a Native plan", async () => {
		const native = new FakeNativeHarness();
		const narrator = new FakeActivityNarrator();
		const workbench = new ProjectWorkbench(native, new MemoryJournal(), {
			projectId: "sample-project",
			cwd: "/workspace/sample",
			narrator,
		});
		await ready(workbench);
		await workbench.dispatch({ type: "chat.send", text: "의미 Step과 Live Notes를 구현해줘" });

		native.emit({
			type   : "notification",
			method : "item/completed",
			refs   : { threadId: "thread-1", turnId: "turn-1", itemId: "read-1" },
			params : { item: { id: "read-1", type: "commandExecution", command: "rg -n 'workFlow' src" } },
		});
		await Bun.sleep(10);
		expect(narrator.calls).toHaveLength(1);
		expect(workbench.snapshot.workFlow.steps).toEqual([]);

		native.emit({
			type   : "notification",
			method : "item/completed",
			refs   : { threadId: "thread-1", turnId: "turn-1", itemId: "test-1" },
			params: {
				item: {
					id       : "test-1",
					type     : "commandExecution",
					command  : "bun test test/work-flow.test.ts",
					exitCode : 0,
				},
			},
		});
		await Bun.sleep(20);

		expect(narrator.calls).toHaveLength(2);
		expect(workbench.snapshot.planActivities).toHaveLength(2);
		expect(workbench.snapshot.workFlow.steps).toEqual([]);
		await workbench.close();
	});

	test("narrates a selected plan with sanitized goal and bounded action evidence", async () => {
		const native = new FakeNativeHarness();
		const narrator = new FakeActivityNarrator();
		const workbench = new ProjectWorkbench(native, new MemoryJournal(), {
			projectId          : "sample-project",
			cwd                : "/workspace/sample",
			requestRuntimeMode : "off",
			narrator,
		});
		await ready(workbench);
		await workbench.dispatch({ type: "chat.send", text: "검증 /private/selected-goal" });
		native.emit({
			type   : "notification",
			method : "turn/plan/updated",
			refs   : { threadId: "thread-1", turnId: "turn-1" },
			params : { plan: [{ step: "변경 검증", status: "inProgress" }] },
		});
		native.emit({
			type   : "notification",
			method : "item/completed",
			refs   : { threadId: "thread-1", turnId: "turn-1", itemId: "write-1" },
			params : { item: { id: "write-1", type: "commandExecution", command: "apply_patch /private/action-path" } },
		});
		await Bun.sleep(20);

		expect(narrator.calls).toHaveLength(1);
		expect(narrator.calls[0]).toMatchObject({ stepTitle: "변경 검증" });
		expect(narrator.calls[0]!.goal).toContain("[redacted:local-path]");
		expect(narrator.calls[0]!.inputSummary).toHaveLength(1);
		expect(narrator.calls[0]!.inputSummary.join(" ")).not.toContain("/private/");
		expect(workbench.snapshot.workFlow.steps[0]!.narration.inputSummary).toEqual(["work-flow 관련 테스트"]);
		await workbench.close();
	});

	test("steers a follow-up into the active Codex turn without creating a queued turn", async () => {
		const native = new FakeNativeHarness();
		native.enableSteering();
		const workbench = new ProjectWorkbench(native, new MemoryJournal(), { projectId: "sample-project", cwd: "/workspace/sample" });
		await ready(workbench);

		const first = await workbench.dispatch({ type: "chat.send", text: "첫 요청" });
		const followUp = await workbench.dispatch({ type: "chat.send", text: "방향을 이렇게 바꿔줘" });

		expect(first).toMatchObject({ state: "accepted" });
		expect(followUp).toMatchObject({ state: "accepted" });
		expect(native.startTurnCalls).toBe(1);
		expect(native.steerTurnInputs).toEqual([{
			threadId: "thread-1",
			expectedTurnId: "turn-1",
			clientUserMessageId: followUp.commandId,
			text: expect.stringContaining("방향을 이렇게 바꿔줘\n\n"),
		}]);
		expect(workbench.snapshot.chatQueue).toEqual([]);
		expect(workbench.snapshot.chat.map(message => message.content)).toEqual(["첫 요청", "방향을 이렇게 바꿔줘"]);
		await workbench.close();
	});

	test("honors an explicit Queue delivery even when the executor supports steering", async () => {
		const native = new FakeNativeHarness();
		native.enableSteering();
		const workbench = new ProjectWorkbench(native, new MemoryJournal(), { projectId: "sample-project", cwd: "/workspace/sample" });
		await ready(workbench);

		await workbench.dispatch({ type: "chat.send", text: "첫 요청" });
		const queued = await workbench.dispatch({ type: "chat.send", text: "다음 턴에 반영", delivery: "queue" });

		expect(queued).toMatchObject({ state: "queued", position: 1 });
		expect(native.steerTurnInputs).toEqual([]);
		expect(workbench.snapshot.chatQueue.map(message => message.content)).toEqual(["다음 턴에 반영"]);
		await workbench.close();
	});

	test("queues rapid chat submissions when the executor does not support steering", async () => {
		const native    = new FakeNativeHarness()                                                                          ;
		const journal   = new MemoryJournal()                                                                              ;
		const workbench = new ProjectWorkbench(native, journal, { projectId: "sample-project", cwd: "/workspace/sample" }) ;
		await ready(workbench);
		const [first, second] = await Promise.all([
			workbench.dispatch({ type: "chat.send", text: "첫 요청" }),
			workbench.dispatch({ type: "chat.send", text: "두 번째 요청" }),
		]);
		expect(first).toMatchObject({ state: "accepted" });
		expect(second).toMatchObject({ state: "queued", position: 1 });
		expect(native.startThreadCalls).toBe(1);
		expect(native.startTurnCalls).toBe(1);
		expect(workbench.snapshot.chat.map(message => message.content)).toEqual(["첫 요청"]);
		expect(workbench.snapshot.chatQueue.map(message => message.content)).toEqual(["두 번째 요청"]);
		expect(workbench.snapshot.chatQueue[0]).toMatchObject({ id: second.commandId, content: "두 번째 요청" });
		expect(workbench.snapshot.chatQueue[0]?.queuedAt).toEqual(expect.any(String));
		expect(Object.isFrozen(workbench.snapshot.chatQueue)).toBe(true);

		native.emit({ type: "notification", method: "turn/completed", refs: { threadId: "thread-1", turnId: "turn-1" }, params: {} });
		await Bun.sleep(10);

		expect(native.startTurnCalls).toBe(2);
		expect(native.startTurnInputs.map(input => input.text)).toEqual(["첫 요청", "두 번째 요청"]);
		expect(workbench.snapshot.chat.map(message => message.content)).toEqual([
			"첫 요청",
			"최종 답변 본문을 받지 못했습니다.",
			"두 번째 요청",
		]);
		expect(workbench.snapshot.chat.find((message) => message.role === "assistant")?.status).toBe("incomplete");
		expect(workbench.snapshot.chatQueue).toEqual([]);
		expect(journal.records.filter(activity => activity.payload.direction === "outbound" && activity.phase === "started").map(activity => ({
			text: activity.payload.text,
			threadId: activity.nativeRefs.threadId,
		}))).toEqual([
			{ text: "첫 요청", threadId: "thread-1" },
			{ text: "두 번째 요청", threadId: "thread-1" },
		]);
		expect(journal.records.find(activity => activity.payload.text === "첫 요청" && activity.phase === "completed")?.nativeRefs.threadId)
			.toBe("thread-1");
		expect(journal.records.findIndex(activity => activity.kind === "message" && activity.payload.text === "두 번째 요청"))
			.toBeGreaterThan(journal.records.findIndex(activity => activity.payload.method === "turn/completed"));
		expect(journal.records.filter(activity => activity.payload.method === "request/started")).toEqual([
			expect.objectContaining({ payload: expect.objectContaining({ requestId: first.commandId }), nativeRefs: expect.objectContaining({ turnId: "turn-1" }) }),
			expect.objectContaining({ payload: expect.objectContaining({ requestId: second.commandId }), nativeRefs: expect.objectContaining({ turnId: "turn-2" }) }),
		]);
		expect(journal.records.filter(activity => activity.payload.method === "request/queued"))
			.toEqual([expect.objectContaining({ payload: expect.objectContaining({ requestId: second.commandId }) })]);
		await workbench.close();
	});

	test("delivers cancel immediately while a native observation is still being journaled and preserves FIFO", async () => {
		const native    = new FakeNativeHarness()                                                                          ;
		const journal   = new ToolObservationGateJournal()                                                                 ;
		const workbench = new ProjectWorkbench(native, journal, { projectId: "sample-project", cwd: "/workspace/sample" }) ;
		await ready(workbench);
		await workbench.dispatch({ type: "chat.send", text: "장기 실행" });
		await workbench.dispatch({ type: "chat.send", text: "보존할 후속 요청" });
		native.emit({
			type   : "notification",
			method : "item/started",
			refs   : { threadId: "thread-1", turnId: "turn-1", itemId: "tool-1" },
			params : { item: { id: "tool-1", type: "commandExecution" } },
		});
		await journal.toolReached;

		const receipt = await Promise.race([
			workbench.dispatch({ type: "chat.cancel" }),
			Bun.sleep(50).then(() => ({ state: "timeout" as const })),
		]);
		expect(receipt).toMatchObject({ state: "accepted" });
		expect(native.interruptInputs).toEqual([{ threadId: "thread-1", turnId: "turn-1" }]);
		expect(workbench.snapshot.chatQueue.map(item => item.content)).toEqual(["보존할 후속 요청"]);

		journal.release();
		await Bun.sleep(5);
		await workbench.close();
	});

	test("records the first public output milestone once without journaling delta text or reasoning", async () => {
		const native    = new FakeNativeHarness()                                                                          ;
		const journal   = new MemoryJournal()                                                                              ;
		const workbench = new ProjectWorkbench(native, journal, { projectId: "sample-project", cwd: "/workspace/sample" }) ;
		await ready(workbench);
		await workbench.dispatch({ type: "chat.send", text: "출력 관찰" });
		native.emit({
			type   : "notification",
			method : "item/reasoning/delta",
			refs   : { threadId: "thread-1", turnId: "turn-1", itemId: "reasoning-1" },
			params : { delta: "비공개 추론" },
		});
		native.emit({
			type   : "notification",
			method : "item/agentMessage/delta",
			refs   : { threadId: "thread-1", turnId: "turn-1", itemId: "message-1" },
			params : { delta: "첫 공개 출력" },
		});
		native.emit({
			type   : "notification",
			method : "item/agentMessage/delta",
			refs   : { threadId: "thread-1", turnId: "turn-1", itemId: "message-1" },
			params : { delta: "두 번째 공개 출력" },
		});
		await Bun.sleep(10);
		const milestones = journal.records.filter(activity => activity.payload.method === "turn/first-output-observed");
		expect(milestones).toEqual([expect.objectContaining({
			nativeRefs: { threadId: "thread-1", turnId: "turn-1" },
			payload: { method: "turn/first-output-observed" },
		})]);
		expect(JSON.stringify(milestones)).not.toContain("공개 출력");
		expect(JSON.stringify(journal.records)).not.toContain("비공개 추론");
		await workbench.close();
	});

	test("publishes the accepted user message as preparing before native start settles", async () => {
		const native = new FakeNativeHarness();
		let releaseStart!: () => void;
		native.startThreadGate = new Promise<void>((resolve) => { releaseStart = resolve; });
		const workbench = new ProjectWorkbench(native, new MemoryJournal(), { projectId: "sample-project", cwd: "/workspace/sample" });
		await ready(workbench);
		const sent = workbench.dispatch({ type: "chat.send", text: "즉시 보여야 하는 요청" });
		await Bun.sleep(5);
		expect(workbench.snapshot.chat).toContainEqual(expect.objectContaining({
			content: "즉시 보여야 하는 요청",
			status: "streaming",
		}));
		releaseStart();
		await expect(sent).resolves.toMatchObject({ state: "accepted" });
		await workbench.close();
	});

	test("marks a first-submit thread start failure without leaving preparing progress", async () => {
		const native = new FakeNativeHarness();
		native.startThreadError = new Error("thread start failed");
		const workbench = new ProjectWorkbench(native, new MemoryJournal(), { projectId: "sample-project", cwd: "/workspace/sample" });
		await ready(workbench);
		await expect(workbench.dispatch({ type: "chat.send", text: "실패 요청" })).resolves.toMatchObject({ state: "rejected" });
		expect(workbench.snapshot.chat).toContainEqual(expect.objectContaining({ content: "실패 요청", status: "failed" }));
		expect(workbench.snapshot.activeTurnId).toBeNull();
		await workbench.close();
	});

	test("ignores Native events that arrive before the journal owns a thread", async () => {
		class UnboundJournal implements WorkbenchActivityJournal {
			appends = 0;
			hasBoundThread(): boolean { return false; }
			async append(_input: ProjectActivityInput): Promise<ProjectActivityAppendResult> {
				this.appends += 1;
				throw new Error("활동 기록은 Native thread에 묶인 뒤에만 추가할 수 있습니다.");
			}
			async readAll(): Promise<ProjectActivity[]> { return []; }
		}
		const native    = new FakeNativeHarness()                                                                          ;
		const journal   = new UnboundJournal()                                                                             ;
		const workbench = new ProjectWorkbench(native, journal, { projectId: "sample-project", cwd: "/workspace/sample" }) ;
		await ready(workbench);
		native.emit({
			type   : "notification",
			method : "turn/started",
			refs   : { threadId: "foreign-thread", turnId: "turn-9" },
			params : {},
		});
		await workbench.dispatch({ type: "activity.select", activityId: null });
		expect(journal.appends).toBe(0);
		expect(workbench.snapshot.error).toBeNull();
		expect(workbench.snapshot.phase).not.toBe("error");
		await workbench.close();
	});

	test("creates one plain-language question summary after turn completion without blocking queued chat", async () => {
		const native                                                       = new FakeNativeHarness() ;
		const journal                                                      = new MemoryJournal()     ;
		const createCalls: Parameters<WorkbenchTNoteSource["create"]>[0][] = []                      ;
		let releaseSummary!: () => void;
		const summaryGate = new Promise<void>((resolve) => { releaseSummary = resolve; });
		const tnotes: WorkbenchTNoteSource = {
			readAll: async () => [],
			create: async (input) => {
				createCalls.push(input);
				await summaryGate;
				return {
					schemaVersion : 1,
					id            : "automatic-session-summary-1",
					sequence      : 1,
					createdAt     : "2026-09-01T00:00:01.000Z",
					packet: {
						schemaVersion : 1,
						projectId     : input.projectId,
						range         : input.range,
						createdAt     : "2026-09-01T00:00:01.000Z",
						activities    : input.activities.map((activity) => ({ ...activity, nativeRefs: activity.nativeRefs ?? [] })),
						digest        : "c".repeat(64),
					},
					text: "질문: 이 세션의 구현과 검증을 진행해줘\n왜: 구현 위치를 찾고 실제 동작을 검증해야 했습니다.\n결과: 구현과 테스트가 끝났습니다.",
					provenance: { provider: "openai-codex", model: "gpt-5.6-luna", version: "test" },
				};
			},
		};
		const workbench = new ProjectWorkbench(native, journal, {
			projectId: "sample-project",
			cwd: "/workspace/sample",
			tnotes,
		});
		await ready(workbench);
		await workbench.dispatch({ type: "chat.send", text: "이 세션의 구현과 검증을 진행해줘" });
		await workbench.dispatch({ type: "chat.send", text: "끝나면 다음 요청도 이어서 처리해줘" });

		for (const [itemId, command] of [["read-1", "rg -n 'summary' src"], ["test-1", "bun test"]] as const) {
			native.emit({
				type   : "notification",
				method : "item/completed",
				refs   : { threadId: "thread-1", turnId: "turn-1", itemId },
				params : { item: { type: "commandExecution", command, exitCode: 0 } },
			});
		}
		native.emit({
			type   : "notification",
			method : "item/completed",
			refs   : { threadId: "thread-1", turnId: "turn-1", itemId: "assistant-1" },
			params : { item: { type: "agentMessage", text: "구현과 검증을 마쳤습니다." } },
		});
		await Bun.sleep(10);
		expect(createCalls).toEqual([]);

		native.emit({
			type   : "notification",
			method : "turn/completed",
			refs   : { threadId: "thread-1", turnId: "turn-1" },
			params : {},
		});
		await Bun.sleep(10);

		expect(createCalls).toHaveLength(1);
		expect(createCalls[0]?.range).toEqual({ startSequence: 4, endSequence: 12 });
		expect(createCalls[0]?.instruction).toContain("완료 요청: 이 세션의 구현과 검증을 진행해줘");
		expect(createCalls[0]?.instruction).toContain("요청 목적·접근:");
		expect(createCalls[0]?.instruction).toContain("장시간·차단 작업:");
		expect(createCalls[0]?.instruction).toContain("Commit·Evidence:");
		expect(createCalls[0]?.instruction).toContain("충분히 상세하게");
		expect(native.startTurnCalls).toBe(2);
		expect(workbench.snapshot.chatQueue).toEqual([]);
		expect(workbench.snapshot.tnotes).toEqual([]);
		expect(workbench.snapshot.actionResult).toMatchObject({
			kind  : "tnote",
			title : "완료 보고 작성 중",
			body  : expect.stringContaining("요청은 완료되었습니다."),
		});

		releaseSummary();
		await Bun.sleep(10);
		expect(workbench.snapshot.tnotes[0]).toMatchObject({
			id      : "automatic-session-summary-1",
			title   : "이 세션의 구현과 검증을 진행해줘",
			summary : "질문: 이 세션의 구현과 검증을 진행해줘\n왜: 구현 위치를 찾고 실제 동작을 검증해야 했습니다.\n결과: 구현과 테스트가 끝났습니다.",
		});
		expect(workbench.snapshot.actionResult).toMatchObject({
			kind  : "tnote",
			title : "완료 보고 #1",
			body  : expect.stringContaining("Chat 타임라인"),
		});
		await workbench.close();
	});

	test("keeps one immutable Note per completed question instead of replacing a cumulative summary", async () => {
		const native = new FakeNativeHarness();
		const createCalls: Parameters<WorkbenchTNoteSource["create"]>[0][] = [];
		const tnotes: WorkbenchTNoteSource = {
			readAll: async () => [],
			create: async (input) => {
				createCalls.push(input);
				const sequence = createCalls.length;
				return {
					schemaVersion: 1,
					id: `session-summary-${sequence}`,
					sequence,
					createdAt: `2026-09-01T00:00:0${sequence}.000Z`,
					packet: {
						schemaVersion : 1,
						projectId     : input.projectId,
						range         : input.range,
						createdAt     : `2026-09-01T00:00:0${sequence}.000Z`,
						activities    : input.activities.map(({ nativeRefs: _nativeRefs, ...activity }) => activity),
						...(input.activities.at(-1)?.completion ? { completion: input.activities.at(-1)!.completion } : {}),
						digest: "d".repeat(64),
					},
					text: sequence === 1
						? "질문: 첫 질문\n왜: 원인을 확인했습니다.\n결과: 첫 답을 냈습니다."
						: "질문: 두 번째 질문\n왜: 앞선 결과를 바탕으로 확인했습니다.\n결과: 두 번째 답을 냈습니다.",
					provenance: { provider: "openai-codex", model: "gpt-5.6-luna", version: "test" },
				};
			},
		};
		const workbench = new ProjectWorkbench(native, new MemoryJournal(), {
			projectId: "sample-project",
			cwd: "/workspace/sample",
			tnotes,
		});
		await ready(workbench);
		await workbench.dispatch({ type: "chat.send", text: "첫 질문" });
		native.emit({
			type   : "notification",
			method : "item/completed",
			refs   : { threadId: "thread-1", turnId: "turn-1", itemId: "assistant-1" },
			params : { item: { type: "agentMessage", text: "첫 답을 냈습니다." } },
		});
		native.emit({ type: "notification", method: "turn/completed", refs: { threadId: "thread-1", turnId: "turn-1" }, params: {} });
		await Bun.sleep(10);

		await workbench.dispatch({ type: "chat.send", text: "두 번째 질문" });
		native.emit({
			type   : "notification",
			method : "item/completed",
			refs   : { threadId: "thread-1", turnId: "turn-2", itemId: "assistant-2" },
			params : { item: { type: "agentMessage", text: "두 번째 답을 냈습니다." } },
		});
		native.emit({ type: "notification", method: "turn/completed", refs: { threadId: "thread-1", turnId: "turn-2" }, params: {} });
		await Bun.sleep(10);

		expect(createCalls).toHaveLength(2);
		expect(createCalls[0]?.instruction).toContain("완료 요청: 첫 질문");
		expect(createCalls[1]?.instruction).toContain("완료 요청: 두 번째 질문");
		expect(createCalls[1]?.instruction).not.toContain("첫 누적 요약");
		expect(workbench.snapshot.tnotes.map((note) => note.title)).toEqual(["첫 질문", "두 번째 질문"]);
		const resumedAndReordered = projectTNoteCompletionIndex(
			[...workbench.snapshot.activities]
				.filter((activity) => activity.nativeRefs.turnId === "turn-2")
				.reverse(),
			[workbench.snapshot.tnotes[1]!],
		);
		expect(resumedAndReordered).toEqual([
			expect.objectContaining({ turnId: "turn-2", number: 2, noteId: "session-summary-2" }),
		]);
		await workbench.dispatch({ type: "tnote.capture-session" });
		expect(createCalls).toHaveLength(2);
		await workbench.close();
	});

	test("projects a SessionGoal marker from a completed assistant message", async () => {
		const native = new FakeNativeHarness();
		const workbench = new ProjectWorkbench(native, new MemoryJournal(), {
			projectId: "sample-project",
			cwd: "/workspace/sample",
		});
		await ready(workbench);
		await workbench.dispatch({ type: "chat.send", text: "$session-goal 프로젝트별 작업 TUI를 완성한다" });
		native.emit({
			type   : "notification",
			method : "item/completed",
			refs   : { threadId: "thread-1", turnId: "turn-1", itemId: "assistant-goal" },
			params : { item: { type: "agentMessage", text: "SESSION_GOAL: 프로젝트별 작업 TUI를 완성하고 실제 사용으로 검증한다." } },
		});
		await Bun.sleep(10);

		expect(workbench.snapshot.sessionGoal).toMatchObject({
			text: "프로젝트별 작업 TUI를 완성하고 실제 사용으로 검증한다.",
			sourceActivityId: expect.any(String),
		});
		await workbench.close();
	});

	test("rejects SessionGoal spoof markers unless they are a sole bounded assistant line for a $session-goal turn", async () => {
		for (const [question, marker] of [
			["일반 질문", "SESSION_GOAL: unrelated"],
			["$session-goal 목표", "> SESSION_GOAL: quoted"],
			["$session-goal 목표", "앞말\nSESSION_GOAL: multiline"],
			["$session-goal 목표", "SESSION_GOAL: one\nSESSION_GOAL: duplicate"],
			["$session-goal 목표", `SESSION_GOAL: ${"x".repeat(161)}`],
		]) {
			const native = new FakeNativeHarness();
			const workbench = new ProjectWorkbench(native, new MemoryJournal(), { projectId: "sample-project", cwd: "/workspace/sample" });
			await ready(workbench);
			await workbench.dispatch({ type: "chat.send", text: question });
			native.emit({
				type   : "notification",
				method : "item/completed",
				refs   : { threadId: "thread-1", turnId: "turn-1", itemId: "assistant-goal" },
				params : { item: { type: "agentMessage", text: marker } },
			});
			await Bun.sleep(2);
			expect(workbench.snapshot.sessionGoal).toBeNull();
			await workbench.close();
		}
	});

	test("rejects generated Notes without exactly one canonical non-empty report field", async () => {
		const appends: unknown[] = [];
		const generator: DetachedTextGenerator = {
			async generate() {
				return {
					text       : "질문: 질문\nPlan: 이유 방향\n과정: 수행\n결론: 결과\n추가: 금지",
					provenance : { provider: "test", model: "test", version: "test" },
					isolation  : { appliedPolicy: { cwd: "", noTools: true, network: false, readOnly: true, ephemeral: true }, projectRootVisible: false, toolCalls: 0, networkCalls: 0, filesystemWrites: 0 },
				};
			},
		};
		const service = new TNoteService(generator, {
			async append(input) { appends.push(input); throw new Error("must not append"); },
			async readAll() { return []; },
		});
		await expect(service.create({
			projectId        : "project-1",
			range            : { startSequence: 1, endSequence: 1 },
			activities       : [{ id: "a", projectId: "project-1", sequence: 1, occurredAt: "2026-09-01T00:00:00.000Z", kind: "message", title: "message", body: "body" }],
			instruction      : "요약",
			expectedQuestion : "질문",
		})).rejects.toThrow("malformed");
		expect(appends).toEqual([]);
	});

	test("does not append question-mismatched or prohibited Note fields", async () => {
		for (const text of [
			"질문: 다른 질문\nPlan: 이유를 확인했습니다. 방향을 정했습니다.\n과정: 확인했습니다.\n결론: 결과를 저장했습니다.",
			"질문: 질문\nPlan: 이유를 확인했습니다. 방향을 정했습니다.\n과정: 확인했습니다.\n결론: 후속 작업을 처리할 예정입니다.",
			"질문: 질문\nPlan: 이유를 확인했습니다. 방향을 정했습니다.\n과정: 이후 배포합니다.\n결론: 결과를 저장했습니다.",
			"질문: 질문\nPlan: src/app.ts와 package.json을 확인했습니다. 방향을 정했습니다.\n과정: 확인했습니다.\n결론: 결과를 저장했습니다.",
			"질문: 질문\nPlan: 이유를 확인했습니다. 방향을 정했습니다.\n과정: README.md와 package.json을 수정했습니다.\n결론: 결과를 저장했습니다.",
			"질문: 질문\nPlan: stderr FAIL expected received 방향을 정했습니다.\n과정: 확인했습니다.\n결론: 결과를 저장했습니다.",
			"질문: 질문\nPlan: 이유를 확인했습니다. 방향을 정했습니다.\n과정: AssertionError: expected 2 to equal 1\n결론: 결과를 저장했습니다.",
			"질문: 질문\nPlan: 숨은 사고를 그대로 기록합니다. 방향을 정했습니다.\n과정: 확인했습니다.\n결론: 결과를 저장했습니다.",
		]) {
			let appendCount = 0;
			const service = new TNoteService({
				async generate() {
					return {
						text,
						provenance: { provider: "test", model: "test", version: "test" },
						isolation: { appliedPolicy: { cwd: "", noTools: true, network: false, readOnly: true, ephemeral: true }, projectRootVisible: false, toolCalls: 0, networkCalls: 0, filesystemWrites: 0 },
					};
				},
			}, {
				async append() { appendCount += 1; throw new Error("must not append"); },
				async readAll() { return []; },
			});
			await expect(service.create({
				projectId: "project-1", range: { startSequence: 1, endSequence: 1 },
				activities: [{ id: "a", projectId: "project-1", sequence: 1, occurredAt: "2026-09-01T00:00:00.000Z", kind: "message", title: "message", body: "body" }],
				instruction: "요약", expectedQuestion: "질문",
			})).rejects.toThrow();
			expect(appendCount).toBe(0);
		}
	});

	test("permits user-owned Git/Bun/error/path questions and normal explanatory fields", async () => {
		let appendCount = 0;
		const question = "Git과 Bun 오류, src/app.ts 경로를 확인해줘";
		const service = new TNoteService({
			async generate() {
				return {
					text       : requestReport(question),
					provenance : { provider: "test", model: "test", version: "test" },
					isolation  : { appliedPolicy: { cwd: "", noTools: true, network: false, readOnly: true, ephemeral: true }, projectRootVisible: false, toolCalls: 0, networkCalls: 0, filesystemWrites: 0 },
				};
			},
		}, {
			async append(input) {
				appendCount += 1;
				return { ...input, schemaVersion: 1 as const, sequence: 1 };
			},
			async readAll() { return []; },
		});
		await service.create({
			projectId: "project-1", range: { startSequence: 1, endSequence: 1 },
			activities: [{ id: "a", projectId: "project-1", sequence: 1, occurredAt: "2026-09-01T00:00:00.000Z", kind: "message", title: "message", body: "body" }],
			instruction: "요약", expectedQuestion: question,
		});
		expect(appendCount).toBe(1);
	});

	test("permits completed-state results that negatively mention 후속 or 추후", async () => {
		let appendCount = 0;
		const service = new TNoteService({
			async generate() {
				return {
					text       : requestReport("완료 상태 검증", "후속 작업이나 추후 조치는 필요하지 않습니다."),
					provenance : { provider: "test", model: "test", version: "test" },
					isolation  : { appliedPolicy: { cwd: "", noTools: true, network: false, readOnly: true, ephemeral: true }, projectRootVisible: false, toolCalls: 0, networkCalls: 0, filesystemWrites: 0 },
				};
			},
		}, {
			async append(input) { appendCount += 1; return { ...input, schemaVersion: 1 as const, sequence: 1 }; },
			async readAll() { return []; },
		});
		await service.create({
			projectId: "project-1", range: { startSequence: 1, endSequence: 1 },
			activities: [{ id: "a", projectId: "project-1", sequence: 1, occurredAt: "2026-09-01T00:00:00.000Z", kind: "message", title: "message", body: "body" }],
			instruction: "요약", expectedQuestion: "질문",
		});
		expect(appendCount).toBe(1);
	});

	test("persists an exactly once-sanitized completed question through FileTNoteStore", async () => {
		const directory        = await mkdtemp(join(tmpdir(), "workbench-tnote-"))                         ;
		const rawQuestion      = "Git으로 /Users/example/private를 확인하고 alice@example.com 오류를 봐줘" ;
		const expectedQuestion = sanitizeTNoteText(rawQuestion, 800)                                       ;
		const service = new TNoteService({
			async generate() {
				return {
					text       : requestReport(expectedQuestion),
					provenance : { provider: "test", model: "test", version: "test" },
					isolation  : { appliedPolicy: { cwd: "", noTools: true, network: false, readOnly: true, ephemeral: true }, projectRootVisible: false, toolCalls: 0, networkCalls: 0, filesystemWrites: 0 },
				};
			},
		}, new FileTNoteStore(directory));
		try {
			const note = await service.create({
				projectId: "project-1", range: { startSequence: 1, endSequence: 1 },
				activities: [{ id: "a", projectId: "project-1", sequence: 1, occurredAt: "2026-09-01T00:00:00.000Z", kind: "message", title: "message", body: "body" }],
				instruction: "요약", expectedQuestion,
			});
			expect(note.text).toContain(`제목:\n${expectedQuestion}`);
			expect((await service.readAll("project-1"))[0]?.text).toBe(note.text);
		} finally {
			await rm(directory, { recursive: true, force: true });
		}
	});

	test("validates a range capture through TNoteService with its canonical expected question", async () => {
		const journal = new MemoryJournal();
		await journal.append({
			projectId    : "sample-project",
			kind         : "message",
			phase        : "completed",
			provider     : "test",
			nativeRefs   : { threadId: "thread-1" },
			sourceDigest : `sha256:${"a".repeat(64)}`,
			payload      : { direction: "outbound", text: "범위 질문" },
		});
		await journal.append({
			projectId: "sample-project", kind: "progress", phase: "started", provider: "test",
			nativeRefs: { threadId: "thread-1", turnId: "turn-1" }, sourceDigest: `sha256:${"b".repeat(64)}`,
			payload: { method: "turn/start" },
		});
		await journal.append({
			projectId: "sample-project", kind: "progress", phase: "completed", provider: "test",
			nativeRefs: { threadId: "thread-1", turnId: "turn-1" }, sourceDigest: `sha256:${"c".repeat(64)}`,
			payload: { method: "turn/completed" },
		});
		const stored: import("../src/core/domain/work/t-notes").TNoteDraft[] = [];
		const service = new TNoteService({
			async generate() {
				return {
					text       : requestReport("선택 범위 보고"),
					provenance : { provider: "test", model: "test", version: "test" },
					isolation  : { appliedPolicy: { cwd: "", noTools: true, network: false, readOnly: true, ephemeral: true }, projectRootVisible: false, toolCalls: 0, networkCalls: 0, filesystemWrites: 0 },
				};
			},
		}, {
			async append(input) {
				const draft = { ...input, schemaVersion: 1 as const, sequence: stored.length + 1 };
				stored.push(draft);
				return draft;
			},
			async readAll() { return stored; },
		});
		const workbench = new ProjectWorkbench(new FakeNativeHarness(), journal, {
			projectId : "sample-project",
			cwd       : "/workspace/sample",
			tnotes    : service,
		});
		await ready(workbench);
		await expect(workbench.dispatch({ type: "tnote.capture-range", startSequence: 1, endSequence: 3 }))
			.resolves.toMatchObject({ state: "accepted" });
		expect(stored).toHaveLength(1);
		await workbench.close();
	});

	test("bounds activity count and aggregate bytes before creating an automatic Note", async () => {
		const journal = new MemoryJournal();
		const append = (
			kind: ProjectActivity["kind"],
			phase: ProjectActivity["phase"],
			nativeRefs: ProjectActivity["nativeRefs"],
			payload: ProjectActivity["payload"],
		) => journal.append({
			projectId: "sample-project",
			kind,
			phase,
			provider: "test",
			nativeRefs,
			sourceDigest: `sha256:${String(journal.records.length + 1).padStart(64, "0")}`,
			payload,
		});
		await append("message", "completed", { threadId: "thread-1" }, { direction: "outbound", text: "긴 작업을 요약해줘" });
		await append("progress", "started", { threadId: "thread-1", turnId: "turn-1" }, { method: "turn/start" });
		for (let index = 0; index < 97; index += 1) {
			await append("tool", "completed", { threadId: "thread-1", turnId: "turn-1", itemId: `tool-${index}` }, {
				method: "item/completed",
				params: { item: { type: "commandExecution", command: `step-${index}`, aggregatedOutput: "관측".repeat(6_000), exitCode: 0 } },
			});
		}
		await append("message", "completed", { threadId: "thread-1", turnId: "turn-1", itemId: "answer" }, { role: "assistant", text: "긴 작업을 마쳤습니다." });
		await append("progress", "completed", { threadId: "thread-1", turnId: "turn-1" }, { method: "turn/completed" });
		expect(journal.records).toHaveLength(101);
		const questionId      = journal.records[0]!.id     ;
		const turnStartId     = journal.records[1]!.id     ;
		const answerId        = journal.records.at(-2)!.id ;
		const turnCompletedId = journal.records.at(-1)!.id ;

		let generatedSourceIds: readonly string[] = [];
		const drafts: import("../src/core/domain/work/t-notes").TNoteDraft[] = [];
		const service = new TNoteService({
			async generate(request) {
				generatedSourceIds = request.packet.activities.map((activity) => activity.id);
				return {
					text       : requestReport("긴 실행 완료 보고"),
					provenance : { provider: "test", model: "test", version: "test" },
					isolation  : { appliedPolicy: { cwd: "", noTools: true, network: false, readOnly: true, ephemeral: true }, projectRootVisible: false, toolCalls: 0, networkCalls: 0, filesystemWrites: 0 },
				};
			},
		}, {
			async append(input) {
				const draft = { ...input, schemaVersion: 1 as const, sequence: drafts.length + 1 };
				drafts.push(draft);
				return draft;
			},
			async readAll() { return drafts; },
		});
		const workbench = new ProjectWorkbench(new FakeNativeHarness(), journal, {
			projectId      : "sample-project",
			cwd            : "/workspace/sample",
			resumeThreadId : "thread-1",
			tnotes         : service,
		});
		await ready(workbench);
		await Bun.sleep(10);

		expect(generatedSourceIds).toHaveLength(100);
		expect(generatedSourceIds).toContain(questionId);
		expect(generatedSourceIds).toContain(turnStartId);
		expect(generatedSourceIds).toContain(answerId);
		expect(generatedSourceIds).toContain(turnCompletedId);
		expect(workbench.snapshot.tnotes).toHaveLength(1);
		expect(workbench.snapshot.actionResult?.title).toBe("완료 보고 #1");
		await workbench.close();
	});

	test("rejects pre-completion and cross-turn manual Note ranges", async () => {
		const native = new FakeNativeHarness();
		const creates: unknown[] = [];
		const tnotes: WorkbenchTNoteSource = {
			async readAll() { return []; },
			async create(input) {
				creates.push(input);
				return {
					schemaVersion: 1, id: `note-${creates.length}`, sequence: creates.length,
					createdAt  : "2026-09-01T00:00:00.000Z",
					packet     : { schemaVersion: 1, projectId: input.projectId, range: input.range, createdAt: "2026-09-01T00:00:00.000Z", activities: input.activities, digest: "d".repeat(64) },
					text       : `질문: ${input.expectedQuestion}\n왜: 완료 범위를 확인했습니다.\n결과: 요약을 저장했습니다.`,
					provenance : { provider: "test", model: "test", version: "test" },
				};
			},
		};
		const workbench = new ProjectWorkbench(native, new MemoryJournal(), { projectId: "sample-project", cwd: "/workspace/sample", tnotes });
		await ready(workbench);
		await workbench.dispatch({ type: "chat.send", text: "첫 질문" });
		expect(await workbench.dispatch({ type: "tnote.capture-session" })).toMatchObject({ state: "rejected" });
		native.emit({ type: "notification", method: "turn/completed", refs: { threadId: "thread-1", turnId: "turn-1" }, params: {} });
		await Bun.sleep(5);
		await workbench.dispatch({ type: "chat.send", text: "둘째 질문" });
		native.emit({ type: "notification", method: "turn/completed", refs: { threadId: "thread-1", turnId: "turn-2" }, params: {} });
		await Bun.sleep(5);
		const createdBeforeCrossTurnAttempt = creates.length;
		expect(await workbench.dispatch({ type: "tnote.capture-range", startSequence: 3, endSequence: 8 })).toMatchObject({ state: "rejected" });
		expect(creates).toHaveLength(createdBeforeCrossTurnAttempt);
		await workbench.close();
	});

	test("reconciles a failed automatic Note after restart and appends it only after generation succeeds", async () => {
		const journal                                                           = new MemoryJournal() ;
		const persisted: import("../src/core/domain/work/t-notes").TNoteDraft[] = []                  ;
		let attempts                                                            = 0                   ;
		const tnotes: WorkbenchTNoteSource = {
			readAll: async () => persisted,
			create: async (input) => {
				attempts += 1;
				if (attempts === 1) throw new Error("temporary generator failure");
				const draft: import("../src/core/domain/work/t-notes").TNoteDraft = {
					schemaVersion : 1,
					id            : "reconciled-note",
					sequence      : 1,
					createdAt     : "2026-09-01T00:00:01.000Z",
					packet: {
						schemaVersion : 1,
						projectId     : input.projectId,
						range         : input.range,
						createdAt     : "2026-09-01T00:00:01.000Z",
						activities    : input.activities.map(({ nativeRefs: _, ...activity }) => activity),
						digest        : "e".repeat(64),
					},
					text: "질문: 복구 질문\n왜: 실패 뒤에도 완료 turn을 다시 확인했습니다.\n결과: 재시작 후 저장했습니다.",
					provenance: { provider: "test", model: "test", version: "test" },
				};
				persisted.push(draft);
				return draft;
			},
		};
		const firstNative = new FakeNativeHarness();
		const first = new ProjectWorkbench(firstNative, journal, { projectId: "sample-project", cwd: "/workspace/sample", tnotes });
		await ready(first);
		await first.dispatch({ type: "chat.send", text: "복구 질문" });
		firstNative.emit({ type: "notification", method: "turn/completed", refs: { threadId: "thread-1", turnId: "turn-1" }, params: {} });
		await Bun.sleep(10);
		expect(attempts).toBe(1);
		expect(persisted).toEqual([]);
		await first.close();

		const resumed = new ProjectWorkbench(new FakeNativeHarness(), journal, {
			projectId      : "sample-project",
			cwd            : "/workspace/sample",
			resumeThreadId : "thread-1",
			tnotes,
		});
		await ready(resumed);
		await Bun.sleep(10);
		expect(attempts).toBe(2);
		expect(resumed.snapshot.tnotes.map((note) => note.id)).toEqual(["reconciled-note"]);
		expect(persisted).toHaveLength(1);
		await resumed.close();
	});

	test("reconciles one sparse target-thread Note after interleaved foreign journal activity", async () => {
		const journal = new MemoryJournal();
		const append = (kind: ProjectActivity["kind"], phase: ProjectActivity["phase"], nativeRefs: ProjectActivity["nativeRefs"], payload: ProjectActivity["payload"]) =>
			journal.append({
				projectId: "sample-project",
				kind,
				phase,
				provider: "test",
				nativeRefs,
				sourceDigest: `sha256:${"a".repeat(64)}`,
				payload,
			});
		await append("message", "completed", { threadId: "thread-1" }, { direction: "outbound", text: "대상 thread 질문" });
		await append("progress", "started", { threadId: "thread-1", turnId: "turn-1" }, { method: "turn/start" });
		await append("message", "completed", { threadId: "thread-2", turnId: "turn-2" }, { text: "외부 thread 활동" });
		await append("progress", "completed", { threadId: "thread-1", turnId: "turn-1" }, { method: "turn/completed" });

		const persisted: import("../src/core/domain/work/t-notes").TNoteDraft[] = [];
		let attempts = 0;
		const tnotes: WorkbenchTNoteSource = {
			readAll: async () => persisted,
			create: async (input) => {
				attempts += 1;
				if (attempts === 1) throw new Error("temporary generation failure");
				const draft: import("../src/core/domain/work/t-notes").TNoteDraft = {
					schemaVersion : 1,
					id            : "sparse-target-note",
					sequence      : 1,
					createdAt     : "2026-09-01T00:00:01.000Z",
					packet: {
						schemaVersion : 1,
						projectId     : input.projectId,
						range         : input.range,
						createdAt     : "2026-09-01T00:00:01.000Z",
						activities    : input.activities.map(({ nativeRefs: _, ...activity }) => activity),
						digest        : "f".repeat(64),
					},
					text: "질문: 대상 thread 질문\n왜: 대상 turn만 다시 확인했습니다.\n결과: 재시작 뒤 요약을 저장했습니다.",
					provenance: { provider: "test", model: "test", version: "test" },
				};
				persisted.push(draft);
				return draft;
			},
		};
		const failed = new ProjectWorkbench(new FakeNativeHarness(), journal, {
			projectId: "sample-project", cwd: "/workspace/sample", resumeThreadId: "thread-1", tnotes,
		});
		await ready(failed);
		await Bun.sleep(10);
		expect(attempts).toBe(1);
		expect(persisted).toEqual([]);
		await failed.close();

		const resumed = new ProjectWorkbench(new FakeNativeHarness(), journal, {
			projectId: "sample-project", cwd: "/workspace/sample", resumeThreadId: "thread-1", tnotes,
		});
		await ready(resumed);
		await Bun.sleep(10);
		expect(attempts).toBe(2);
		expect(persisted).toHaveLength(1);
		expect(persisted[0]?.packet.range).toEqual({ startSequence: 1, endSequence: 4 });
		expect(persisted[0]?.packet.activities.map((activity) => activity.sequence)).toEqual([1, 2, 4]);
		expect(persisted[0]?.packet.activities.some((activity) => activity.id === journal.records[2]?.id)).toBe(false);
		expect(resumed.snapshot.tnotes.map((note) => note.id)).toEqual(["sparse-target-note"]);
		await resumed.close();
	});

	test("retries a target-thread note after a foreign outbound question interleaves before its turn", async () => {
		const directory = await mkdtemp(join(tmpdir(), "workbench-sparse-tnote-"));
		const journal = new MemoryJournal();
		const append = (nativeRefs: ProjectActivity["nativeRefs"], payload: ProjectActivity["payload"], kind: ProjectActivity["kind"] = "message", phase: ProjectActivity["phase"] = "completed") =>
			journal.append({
				projectId: "sample-project", kind, phase, provider: "test", nativeRefs,
				sourceDigest: `sha256:${"a".repeat(64)}`, payload,
			});
		await append({ threadId: "thread-1" }, { direction: "outbound", text: "대상 질문" });
		await append({ threadId: "thread-2" }, { direction: "outbound", text: "외부 질문" });
		await append({ threadId: "thread-1", turnId: "turn-1" }, { method: "turn/start" }, "progress", "started");
		await append({ threadId: "thread-1", turnId: "turn-1" }, { method: "turn/completed" }, "progress", "completed");
		let attempts = 0;
		const service = new TNoteService({
			async generate() {
				attempts += 1;
				if (attempts === 1) throw new Error("temporary generation failure");
				return {
					text       : requestReport("대상 Turn 복구 보고"),
					provenance : { provider: "test", model: "test", version: "test" },
					isolation  : { appliedPolicy: { cwd: "", noTools: true, network: false, readOnly: true, ephemeral: true }, projectRootVisible: false, toolCalls: 0, networkCalls: 0, filesystemWrites: 0 },
				};
			},
		}, new FileTNoteStore(directory));
		try {
			const failed = new ProjectWorkbench(new FakeNativeHarness(), journal, {
				projectId: "sample-project", cwd: "/workspace/sample", resumeThreadId: "thread-1", tnotes: service,
			});
			await ready(failed);
			await Bun.sleep(10);
			expect(attempts).toBe(1);
			await failed.close();

			const resumed = new ProjectWorkbench(new FakeNativeHarness(), journal, {
				projectId: "sample-project", cwd: "/workspace/sample", resumeThreadId: "thread-1", tnotes: service,
			});
			await ready(resumed);
			await Bun.sleep(10);
			const notes = await service.readAll("sample-project");
			expect(attempts).toBe(2);
			expect(notes).toHaveLength(1);
			expect(notes[0]?.packet.activities.map((activity) => activity.sequence)).toEqual([1, 3, 4]);
			expect(notes[0]?.packet.activities.some((activity) => activity.sequence === 2)).toBe(false);
			expect(resumed.snapshot.tnotes.map((note) => note.id)).toEqual([notes[0]?.id]);
			await resumed.close();
		} finally {
			await rm(directory, { recursive: true, force: true });
		}
	});

	test("publishes the first user message before a slow native thread start completes", async () => {
		const native = new FakeNativeHarness();
		let releaseThreadStart!: () => void;
		native.startThreadGate = new Promise<void>((resolve) => { releaseThreadStart = resolve; });
		const workbench = new ProjectWorkbench(native, new MemoryJournal(), {
			projectId: "sample-project",
			cwd: "/workspace/sample",
		});
		await ready(workbench);

		const submission = workbench.dispatch({ type: "chat.send", text: "첫 응답을 확인합니다" });
		await Bun.sleep(0);

		expect(native.startThreadCalls).toBe(1);
		expect(workbench.snapshot.chat).toEqual([
			expect.objectContaining({
				role    : "user",
				content : "첫 응답을 확인합니다",
				status  : "streaming",
			}),
		]);

		releaseThreadStart();
		expect(await submission).toMatchObject({ state: "accepted" });
		await workbench.close();
	});

	test("keeps active context separate from cumulative model usage and ignores a late auxiliary turn", async () => {
		const native = new FakeNativeHarness();
		const workbench = new ProjectWorkbench(native, new MemoryJournal(), {
			projectId : "sample-project",
			cwd       : "/workspace/sample",
			model     : "gpt-5.6-sol",
			effort    : "low",
		});
		await ready(workbench);
		await workbench.dispatch({ type: "chat.send", text: "상태를 확인해줘" });

		native.emit({
			type   : "notification",
			method : "thread/tokenUsage/updated",
			refs   : { threadId: "thread-1", turnId: "turn-1" },
			params: {
				tokenUsage: {
					last               : { totalTokens: 25_840 },
					total              : { totalTokens: 25_840 },
					modelContextWindow : 258_400,
				},
			},
		});
		await Bun.sleep(10);

		expect(native.startTurnInputs[0]).toMatchObject({ model: "gpt-5.6-sol", effort: "low" });
		expect(workbench.snapshot).toMatchObject({
			model        : "gpt-5.6-sol",
			effort       : "low",
			contextUsage : { usedTokens: 25_840, contextWindow: 258_400, percent: 10 },
			sessionUsage: {
				totalTokens        : 25_840,
				unattributedTokens : 0,
				models             : [{ model: "gpt-5.6-sol", effort: "low", interactiveRootTurns: 1, interactiveTokens: 25_840, detachedInvocations: 0, detachedTokens: 0, totalTokens: 25_840 }],
			},
		});

		const rootUsage = workbench.snapshot.sessionUsage;
		native.emit({
			type   : "notification",
			method : "thread/tokenUsage/updated",
			refs   : { threadId: "child-thread", turnId: "child-turn" },
			params: {
				tokenUsage: {
					last               : { totalTokens: 99_999 },
					total              : { totalTokens: 99_999 },
					modelContextWindow : 258_400,
				},
			},
		});
		await Bun.sleep(10);

		expect(workbench.snapshot.contextUsage).toEqual({
			usedTokens    : 25_840,
			contextWindow : 258_400,
			percent       : 10,
		});
		expect(workbench.snapshot.sessionUsage).toEqual(rootUsage);

		native.emit({
			type   : "notification",
			method : "thread/tokenUsage/updated",
			refs   : { threadId: "thread-1", turnId: "turn-aux" },
			params: {
				tokenUsage: {
					last               : { totalTokens: 2_000 },
					total              : { totalTokens: 38_760 },
					modelContextWindow : 258_400,
				},
			},
		});
		await Bun.sleep(10);

		expect(workbench.snapshot.contextUsage).toEqual({
			usedTokens    : 25_840,
			contextWindow : 258_400,
			percent       : 10,
		});
		expect(workbench.snapshot.sessionUsage).toEqual({
			totalTokens         : 38_760,
			observedTotalTokens : 38_760,
			unattributedTokens  : 12_920,
			observationCoverage : { interactive: true, detached: false },
			models              : [{ model: "gpt-5.6-sol", effort: "low", interactiveRootTurns: 1, interactiveTokens: 25_840, detachedInvocations: 0, detachedTokens: 0, totalTokens: 25_840 }],
		});
		await workbench.close();
	});

	test("merges detached Luna and Claude usage into the live WWW session totals", async () => {
		const native = new FakeNativeHarness();
		const auxiliaryUsage = new SessionModelUsageAccumulator();
		const workbench = new ProjectWorkbench(native, new MemoryJournal(), {
			projectId : "sample-project",
			cwd       : "/workspace/sample",
			model     : "gpt-5.6-sol",
			effort    : "ultra",
			auxiliaryUsage,
		});
		await ready(workbench);
		const revision = workbench.snapshot.revision;

		auxiliaryUsage.observe({ model: "gpt-5.6-luna", effort: null, totalTokens: 1_200 });
		auxiliaryUsage.observe({ model: "claude-opus-5", effort: null, totalTokens: 3_400 });

		expect(workbench.snapshot.revision).toBeGreaterThan(revision);
		expect(workbench.snapshot.sessionUsage).toEqual({
			totalTokens         : 4_600,
			observedTotalTokens : 4_600,
			unattributedTokens  : 0,
			observationCoverage : { interactive: false, detached: true },
			models: [
				{ model: "claude-opus-5", effort: null, interactiveRootTurns: 0, interactiveTokens: 0, detachedInvocations: 1, detachedTokens: 3_400, totalTokens: 3_400 },
				{ model: "gpt-5.6-luna", effort: null, interactiveRootTurns: 0, interactiveTokens: 0, detachedInvocations: 1, detachedTokens: 1_200, totalTokens: 1_200 },
			],
		});
		await workbench.close();
	});

	test("applies permission and collaboration controls to native thread and turn settings", async () => {
		const native = new FakeNativeHarness();
		const workbench = new ProjectWorkbench(native, new MemoryJournal(), {
			projectId : "sample-project",
			cwd       : "/workspace/sample",
			model     : "gpt-5.6-sol",
			effort    : "low",
		});
		await ready(workbench);

		expect(await workbench.dispatch({ type: "session.permission", mode: "all" })).toMatchObject({ state: "accepted" });
		expect(await workbench.dispatch({ type: "session.mode", mode: "plan" })).toMatchObject({ state: "accepted" });
		expect(workbench.snapshot).toMatchObject({ permissionMode: "all", collaborationMode: "plan" });
		await workbench.dispatch({ type: "chat.send", text: "계획을 세워줘" });

		expect(native.startThreadInputs[0]).toMatchObject({ approvalPolicy: "never", sandbox: "danger-full-access" });
		expect(native.startTurnInputs[0]).toMatchObject({
			approvalPolicy: "never",
			sandboxPolicy: { type: "dangerFullAccess" },
			collaborationMode: {
				mode: "plan",
				settings: { model: "gpt-5.6-sol", reasoning_effort: "low", developer_instructions: expect.stringContaining("update_plan") },
			},
		});
		await workbench.close();
	});

	test("persists an idle Codex selection and uses it for the next native turn", async () => {
		const native = new FakeNativeHarness();
		const persisted: Array<{ model: string; effort: string }> = [];
		const workbench = new ProjectWorkbench(native, new MemoryJournal(), {
			projectId             : "sample-project",
			cwd                   : "/workspace/sample",
			model                 : "gpt-5.6-sol",
			effort                : "ultra",
			persistModelSelection : async selection => { persisted.push(selection); },
		});
		await ready(workbench);
		await workbench.dispatch({ type: "chat.send", text: "기존 모델 요청" });
		native.emit({
			type   : "notification",
			method : "turn/completed",
			refs   : { threadId: "thread-1", turnId: "turn-1" },
			params : {},
		});
		await Bun.sleep(10);

		const receipt = await workbench.dispatch({
			type: "session.model",
			selection: { model: "gpt-5.6-terra", effort: "high" },
		});

		expect(receipt).toMatchObject({ state: "accepted", message: "모델 변경: gpt-5.6-terra · 추론 high" });
		expect(persisted).toEqual([{ model: "gpt-5.6-terra", effort: "high" }]);
		expect(workbench.snapshot).toMatchObject({ model: "gpt-5.6-terra", effort: "high" });

		await workbench.dispatch({ type: "chat.send", text: "새 모델로 답해줘" });
		expect(native.startThreadInputs[0]).toMatchObject({ model: "gpt-5.6-sol", effort: "ultra" });
		expect(native.startTurnInputs[0]).toMatchObject({ model: "gpt-5.6-sol", effort: "ultra" });
		expect(native.startTurnInputs[1]).toMatchObject({
			model: "gpt-5.6-terra",
			effort: "high",
			collaborationMode: {
				settings: { model: "gpt-5.6-terra", reasoning_effort: "high" },
			},
		});
		await workbench.close();
	});

	test("keeps the current model when persistence fails or a turn is active", async () => {
		const native = new FakeNativeHarness();
		let persistCalls = 0;
		const workbench = new ProjectWorkbench(native, new MemoryJournal(), {
			projectId : "sample-project",
			cwd       : "/workspace/sample",
			model     : "gpt-5.6-sol",
			effort    : "low",
			persistModelSelection: async () => {
				persistCalls += 1;
				throw new Error("설정 저장 실패");
			},
		});
		await ready(workbench);

		expect(await workbench.dispatch({
			type: "session.model",
			selection: { model: "gpt-5.6-terra", effort: "medium" },
		})).toMatchObject({ state: "rejected", reason: "설정 저장 실패" });
		expect(workbench.snapshot).toMatchObject({ model: "gpt-5.6-sol", effort: "low" });

		await workbench.dispatch({ type: "chat.send", text: "진행 중 요청" });
		expect(await workbench.dispatch({
			type: "session.model",
			selection: { model: "gpt-5.6-terra", effort: "medium" },
		})).toMatchObject({ state: "rejected", reason: expect.stringContaining("처리하는 중") });
		expect(persistCalls).toBe(1);
		await workbench.close();
	});
});

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

describe("ProjectWorkbench · Native bootstrap and planning", () => {
	test("host reconcile reads an uncertain action after Native termination through the Workbench command", async () => {
		class BrokerNative extends FakeNativeHarness {
			handler: RuntimeToolHandler | null = null;
			registerRuntimeTools(_definitions: readonly RuntimeToolDefinition[], handler: RuntimeToolHandler) { this.handler = handler; return () => { this.handler = null; }; }
		}
		let writes = 0, reads = 0;
		const native = new BrokerNative(), journal = new MemoryJournal();
		const workbench = new ProjectWorkbench(native, journal, { projectId: "p", cwd: "/tmp", requestCapabilities: [{ id: "fixture", effect: "workspace-change", authorize: async () => true, execute: async () => { writes++; throw new Error("lost receipt"); }, reconciliation: { prepare: () => ({ path: "fixture" }), readBack: async () => { reads++; return { confirmed: true, summary: "read back", source: { readBack: true } }; } } }] });
		await ready(workbench);
		const request = await workbench.dispatch({ type: "chat.send", text: "변경" })                                                                                                                                                                               ;
		let callId    = 0                                                                                                                                                                                                                                           ;
		const invoke  = async (tool: string, extra = {}) => JSON.parse((await native.handler!({ threadId: "thread-1", turnId: "turn-1", callId: `recover-${++callId}`, tool: `www_runtime_${tool}`, arguments: { requestId: request.commandId, ...extra } })).text) ;
		for (const stage of ["UNDERSTAND", "DECOMPOSE", "GROUND", "DECIDE", "EXECUTE"]) await invoke("propose", { expectedRevision: (await invoke("inspect")).revision, report: { requestId: request.commandId, stage, status: stage === "EXECUTE" ? "running" : "skipped", summary: "fixture 작업" } });
		await invoke("act", { expectedRevision: (await invoke("inspect")).revision, stage: "EXECUTE", operationId: "uncertain", capability: "fixture", arguments: {} });
		expect((await workbench.dispatch({ type: "runtime.reconcile", requestId: request.commandId, operationId: "uncertain" })).state).toBe("rejected");
		native.emit({ type: "notification", method: "turn/completed", refs: { threadId: "thread-1", turnId: "turn-1" }, params: { turn: { id: "turn-1", status: "completed" } } });
		const result = await workbench.dispatch({ type: "runtime.reconcile", requestId: request.commandId, operationId: "uncertain" });
		expect(result.state).toBe("accepted");
		expect(writes).toBe(1); expect(reads).toBe(1);
		expect(workbench.snapshot.requestRuntime?.[0]?.actions[0]?.status).toBe("reconciled");
		expect(workbench.snapshot.requestRuntime?.[0]?.status).not.toBe("completed");
		await workbench.close();
	});
	test("Runtime approval gates real files, stays cancellable, and never calls Native approval", async () => {
		class BrokerNative extends FakeNativeHarness {
			handler: RuntimeToolHandler | null = null;
			registerRuntimeTools(_definitions: readonly RuntimeToolDefinition[], handler: RuntimeToolHandler) { this.handler = handler; return () => { this.handler = null; }; }
			override async respondToApproval(_resolution: NativeApprovalResolution): Promise<void> { throw new Error("Runtime approval must not reach Native"); }
		}
		const dir = await realpath(await mkdtemp(join(tmpdir(), "www-runtime-approval-")));
		try {
			for (const decision of ["accept", "decline", "cancel-turn", "close"] as const) {
				const path = join(dir, `${decision}.txt`); await writeFile(path, "before");
				const native = new BrokerNative(), journal = new MemoryJournal();
				const workbench = new ProjectWorkbench(native, journal, { projectId: "p", cwd: dir, requestCapabilities: pinnedFileCapabilities([path]) });
				await ready(workbench);
				const request = await workbench.dispatch({ type: "chat.send", text: "파일 교체" })                                                                                                                                                                           ;
				let callId    = 0                                                                                                                                                                                                                                            ;
				const invoke  = async (tool: string, extra = {}) => JSON.parse((await native.handler!({ threadId: "thread-1", turnId: "turn-1", callId: `approval-${++callId}`, tool: `www_runtime_${tool}`, arguments: { requestId: request.commandId, ...extra } })).text) ;
				for (const stage of ["UNDERSTAND", "DECOMPOSE", "GROUND", "DECIDE", "EXECUTE"]) expect((await invoke("propose", { expectedRevision: (await invoke("inspect")).revision, report: { requestId: request.commandId, stage, status: stage === "EXECUTE" ? "running" : "skipped", summary: "단일 파일 변경" } })).state).toBe("accepted");
				const approved = new Promise<void>(resolve => { const unsub = workbench.subscribe(snapshot => { if (snapshot.pendingApproval) { unsub(); resolve(); } }); })                                                                                                                    ;
				const input    = { expectedRevision: (await invoke("inspect")).revision, operationId: "replace", stage: "EXECUTE", capability: "files.replace-approved", arguments: { path, content: "after", beforeDigest: `sha256:${createHash("sha256").update("before").digest("hex")}` } } ;
				const action   = invoke("act", input)                                                                                                                                                                                                                                           ;
				await approved;
				expect(await readFile(path, "utf8")).toBe("before");
				expect(workbench.snapshot.requestRuntime?.at(-1)?.stages[4]?.status).toBe("blocked");
				const approvalId = workbench.snapshot.pendingApproval!.requestId;
				expect((await workbench.dispatch({ type: "approval.resolve", requestId: approvalId, response: { decision: "acceptForSession" } })).state).toBe("rejected");
				if (decision === "cancel-turn") await workbench.dispatch({ type: "chat.cancel" });
				else if (decision === "close") await workbench.close();
				else expect((await workbench.dispatch({ type: "approval.resolve", requestId: approvalId, response: { decision } })).state).toBe("accepted");
				const result = await action;
				expect(result.state).toBe(decision === "accept" ? "accepted" : "rejected");
				expect(await readFile(path, "utf8")).toBe(decision === "accept" ? "after" : "before");
				expect(workbench.snapshot.pendingApproval).toBeNull();
				if (decision === "accept") {
					expect((await invoke("act", input)).reason).toBe("RECORDED_RESULT");
					expect(journal.records.filter(a => a.payload.method === "runtime/action-completed")).toHaveLength(1);
				}
				expect(journal.records.filter(a => a.payload.method === "runtime/approval-resolved")).toHaveLength(1);
				await workbench.close();
			}
		} finally { await rm(dir, { recursive: true, force: true }); }
	}, 10000);
	test("brokered tool requests drive the actual Workbench Runtime and return corrective responses", async () => {
		class BrokerNative extends FakeNativeHarness {
			handler: RuntimeToolHandler | null = null;
			definitions: readonly RuntimeToolDefinition[] = [];
			registerRuntimeTools(definitions: readonly RuntimeToolDefinition[], handler: RuntimeToolHandler) { this.definitions = definitions; this.handler = handler; return () => { this.handler = null; }; }
		}
		const native = new BrokerNative(), journal = new MemoryJournal();
		const workbench = new ProjectWorkbench(native, journal, { projectId: "p", cwd: "/tmp", requestCapabilities: [] });
		await ready(workbench);
		const request = await workbench.dispatch({ type: "chat.send", text: "단계별로 정리" })                                                                                                                                                                ;
		let callId    = 0                                                                                                                                                                                                                                     ;
		const invoke  = async (tool: string, extra = {}) => JSON.parse((await native.handler!({ threadId: "thread-1", turnId: "turn-1", callId: `c-${++callId}`, tool: `www_runtime_${tool}`, arguments: { requestId: request.commandId, ...extra } })).text) ;
		expect(native.definitions.map(d => d.name)).toEqual(["www_runtime_require_delivery", "www_runtime_replan", "www_runtime_reconcile", "www_runtime_inspect", "www_runtime_propose", "www_runtime_act"]);
		expect(native.startTurnInputs[0]?.additionalContext?.www_request_runtime?.value).toContain("www_runtime_propose");
		const snapshot = await invoke("inspect");
		expect(snapshot.request.protocolVersion).toBe(2);
		const result = await invoke("propose", { expectedRevision: snapshot.revision, report: { requestId: request.commandId, stage: "UNDERSTAND", status: "completed", summary: "목표를 확인했다" } });
		expect(result.state).toBe("accepted");
		expect(workbench.snapshot.todo?.items[0]?.status).toBe("completed");
		const rejected = await invoke("act", { expectedRevision: result.revision, operationId: "write", stage: "EXECUTE", capability: "shell", arguments: { command: "touch denied" } });
		expect(rejected.reason).toBe("CAPABILITY_UNAVAILABLE");
		expect(journal.records.filter(a => a.payload.method === "runtime/action-prepared")).toEqual([]);
		await workbench.close();
		expect(native.handler).toBeNull();
	});
	test("Www native passthrough sends the user request unchanged and projects Native state", async () => {
		const native = new FakeNativeHarness();
		const workbench = new ProjectWorkbench(native, new MemoryJournal(), {
			projectId          : "sample",
			cwd                : "/sample",
			requestRuntimeMode : "off",
		});
		await ready(workbench);
		await workbench.dispatch({ type: "chat.send", text: "구조를 파악해줘" });
		expect(native.startTurnInputs[0]?.text).toBe("구조를 파악해줘");
		expect(native.startTurnInputs[0]?.additionalContext?.www_request_runtime).toBeUndefined();
		expect(workbench.snapshot.requestRuntime).toEqual([]);
		expect(workbench.snapshot.todo).toBeNull();
		await workbench.close();
	});
	test("Www goal opts one request into the seven-stage Runtime protocol", async () => {
		const native = new FakeNativeHarness();
		const workbench = new ProjectWorkbench(native, new MemoryJournal(), {
			projectId          : "sample",
			cwd                : "/sample",
			requestRuntimeMode : "off",
		});
		await ready(workbench);
		await workbench.dispatch({ type: "goal.set", text: "구조를 리팩터링한다" });
		expect(native.startTurnInputs[0]?.text).toBe("구조를 리팩터링한다");
		expect(native.startTurnInputs[0]?.additionalContext?.www_request_runtime?.value).toContain("UNDERSTAND");
		expect(workbench.snapshot.requestRuntime).toHaveLength(1);
		expect(workbench.snapshot.todo?.items.map(item => item.content)).toEqual([...REQUEST_STAGES]);
		await workbench.close();
	});
	test("accepts Native stage reports into seven-stage Todo and hides transport messages from Chat", async () => {
		const native = new FakeNativeHarness(), journal = new MemoryJournal();
		const captured: RequestRuntimeRecord[] = [];
		const workbench = new ProjectWorkbench(native, journal, { projectId: "sample", cwd: "/sample", requestProjection: { capture: async record => { captured.push(record); } } });
		await ready(workbench);
		const request = await workbench.dispatch({ type: "chat.send", text: "설계만 정리해" });
		expect(native.startTurnInputs[0]?.additionalContext?.www_request_runtime?.value).toContain(request.commandId);
		let item = 0;
		const report = (stage: string, status: string, extra = {}) => native.emit({ type: "notification", method: "item/completed", refs: { threadId: "thread-1", turnId: "turn-1", itemId: `report-${++item}` }, params: { item: { type: "agentMessage", phase: "commentary", text: "[www-runtime]" + JSON.stringify({ requestId: request.commandId, stage, status, summary: "제공된 Context로 설계 정리", ...extra }) } } });
		report("UNDERSTAND", "completed");
		report("DECOMPOSE", "completed", { plan: [{ stage: "DECIDE", tasks: [{ id: "design", title: "설계 선택", status: "pending", dependsOn: [] }] }] });
		report("GROUND", "skipped");
		report("DECIDE", "completed", { plan: [{ stage: "DECIDE", tasks: [{ id: "design", title: "설계 선택", status: "completed", dependsOn: [] }] }], decision: { decision: "기존 계약 확장", rationale: "중복 방지", selectedApproach: "확장", rejectedAlternatives: [], executionPlan: [] } });
		report("EXECUTE", "skipped"); report("VERIFY", "skipped"); report("DELIVER", "running");
		native.emit({ type: "notification", method: "item/completed", refs: { threadId: "thread-1", turnId: "turn-1", itemId: "answer" }, params: { item: { type: "agentMessage", phase: "final", text: "기존 계약을 확장하는 설계입니다." } } });
		native.emit({ type: "notification", method: "turn/completed", refs: { threadId: "thread-1", turnId: "turn-1" }, params: {} });
		await Bun.sleep(20);
		await workbench.close();
		expect(workbench.snapshot.requestRuntime?.[0]?.status).toBe("completed");
		expect(workbench.snapshot.todo?.items).toHaveLength(7);
		expect(workbench.snapshot.todo?.items[3]?.details[0]?.content).toBe("설계 선택");
		expect(workbench.snapshot.chat.some(m => m.content.includes("[www-runtime]"))).toBe(false);
		expect(captured.at(-1)?.status).toBe("completed");
		const resumed = new ProjectWorkbench(new FakeNativeHarness(), journal, { projectId: "sample", cwd: "/sample", resumeThreadId: "thread-1" });
		await ready(resumed);
		expect(resumed.snapshot.requestRuntime).toEqual(workbench.snapshot.requestRuntime);
		await resumed.close();
	});
	test("turns a Goal into a Native Plan request and exposes it before Todo sync", async () => {
		const native = new FakeNativeHarness();
		const workbench = new ProjectWorkbench(native, new MemoryJournal(), {
			projectId: "sample-project",
			cwd: "/workspace/sample",
		});
		await ready(workbench);

		const receipt = await workbench.dispatch({ type: "goal.set", text: "첫 공개 릴리스를 검증 가능한 상태로 완성한다" });
		expect(receipt).toMatchObject({ state: "accepted", message: "Goal을 설정했습니다. Native Plan을 만들고 Todo에 연결합니다." });
		expect(workbench.snapshot.sessionGoal).toMatchObject({ text: "첫 공개 릴리스를 검증 가능한 상태로 완성한다" });
		expect(native.startTurnInputs[0]?.text).toBe("첫 공개 릴리스를 검증 가능한 상태로 완성한다");
		expect(native.startTurnInputs[0]?.collaborationMode?.settings.developer_instructions).toContain("사용자가 정한 Goal");
		native.emit({
			type   : "notification",
			method : "turn/completed",
			refs   : { threadId: "thread-1", turnId: "turn-1" },
			params : {},
		});
		await Bun.sleep(10);
		expect(workbench.snapshot.sessionGoal).toMatchObject({ text: "첫 공개 릴리스를 검증 가능한 상태로 완성한다" });

		await workbench.dispatch({ type: "goal.set", text: "다음 릴리스의 품질 기준을 확정한다" });
		expect(workbench.snapshot.sessionGoal).toMatchObject({ text: "다음 릴리스의 품질 기준을 확정한다" });
		await workbench.close();
	});

	test("publishes the entry Dashboard before its Linear refresh completes", async () => {
		const native = new FakeNativeHarness();
		let refreshedThreadId: string | undefined;
		let resolveDashboard: ((value: {
			state       : "ready" ;
			projectName : string  ;
			fetchedAt   : string  ;
			issues      : never[] ;
			update      : null    ;
			comments    : never[] ;
			milestones  : never[] ;
			error       : null    ;
		}) => void) | undefined;
		const dashboardResult = new Promise<{
			state       : "ready" ;
			projectName : string  ;
			fetchedAt   : string  ;
			issues      : never[] ;
			update      : null    ;
			comments    : never[] ;
			milestones  : never[] ;
			error       : null    ;
		}>((resolve) => { resolveDashboard = resolve; });
		const workbench = new ProjectWorkbench(native, new MemoryJournal(), {
			projectId: "sample-project",
			cwd: "/workspace/sample",
			linearDashboard: { refresh: (threadId) => {
				refreshedThreadId = threadId;
				return dashboardResult;
			} },
		});

		await workbench.waitUntilReady();
		expect(native.startThreadCalls).toBe(1);
		expect(refreshedThreadId).toBe("thread-1");
		expect(workbench.snapshot.phase).toBe("ready");
		expect(workbench.snapshot.linearDashboard?.state).toBe("loading");
		expect(workbench.snapshot.cacheObservations?.some(layer => layer.id === "dashboard-data")).toBe(false);

		resolveDashboard?.({
			state       : "ready",
			projectName : "World Wide Woo",
			fetchedAt   : "2026-09-09T00:00:00.000Z",
			issues      : [],
			update      : null,
			comments    : [],
			milestones  : [],
			error       : null,
		});
		await Bun.sleep(0);
		expect(workbench.snapshot.linearDashboard?.state).toBe("ready");
		expect(workbench.snapshot.linearDashboard?.projectName).toBe("World Wide Woo");
		expect(workbench.snapshot.cacheObservations?.find(layer => layer.id === "dashboard-data")).toMatchObject({ state: "ready", entries: 1 });
		await workbench.close();
	});

	test("keeps Linear Dashboard absent when the project has no dashboard connection", async () => {
		const workbench = new ProjectWorkbench(new FakeNativeHarness(), new MemoryJournal(), {
			projectId: "sample-project",
			cwd: "/workspace/sample",
		});
		await workbench.waitUntilReady();
		expect(workbench.snapshot.linearDashboard).toBeUndefined();
		expect(workbench.snapshot.cacheObservations?.find(layer => layer.id === "dashboard-data")).toBeUndefined();
		await workbench.close();
	});

	test("reports a connected Dashboard snapshot miss and subsequent reuse", async () => {
		let refreshCount = 0;
		const workbench = new ProjectWorkbench(new FakeNativeHarness(), new MemoryJournal(), {
			projectId: "sample-project",
			cwd: "/workspace/sample",
			linearDashboard: { refresh: async () => {
				refreshCount += 1;
				return {
					state       : "ready" as const,
					projectName : "World Wide Woo",
					fetchedAt   : "2026-09-22T00:00:00.000Z",
					issues: [], update: null, comments: [], milestones: [], error: null,
				};
			} },
		});
		await ready(workbench);
		await Bun.sleep(0);
		const before = workbench.snapshot.cacheObservations?.find(layer => layer.id === "dashboard-data");
		expect(before).toMatchObject({ state: "ready", entries: 1, misses: 1, evictions: 0 });

		await workbench.dispatch({ type: "session.mode", mode: "plan" });
		const after = workbench.snapshot.cacheObservations?.find(layer => layer.id === "dashboard-data");
		expect(refreshCount).toBe(1);
		expect(after?.hits).toBeGreaterThan(before?.hits ?? 0);
		expect(after?.misses).toBe(before?.misses);
		await workbench.close();
	});

	test("reports request and delegation projection cache reuse through the public snapshot", async () => {
		const workbench = new ProjectWorkbench(new FakeNativeHarness(), new MemoryJournal(), {
			projectId: "sample-project",
			cwd: "/workspace/sample",
		});
		await ready(workbench);
		const before = workbench.snapshot.cacheObservations?.find(layer => layer.id === "context-projection");
		expect(before).toMatchObject({ state: "ready", entries: 2 });

		await workbench.dispatch({ type: "session.mode", mode: "plan" });
		const after = workbench.snapshot.cacheObservations?.find(layer => layer.id === "context-projection");
		expect(after?.hits).toBeGreaterThan(before?.hits ?? 0);
		expect(after?.misses).toBe(before?.misses);
		expect(after?.evictions).toBe(before?.evictions);
		await workbench.close();
	});

	test("coalesces concurrent Native model catalog refreshes as one session-cache miss", async () => {
		const native = new FakeNativeHarness();
		const workbench = new ProjectWorkbench(native, new MemoryJournal(), {
			projectId: "sample-project",
			cwd: "/workspace/sample",
		});
		await ready(workbench);
		const listModelCallsBefore = native.listModelCalls;
		const before = workbench.snapshot.cacheObservations?.find(layer => layer.id === "model-catalog");
		expect(before).toMatchObject({ state: "ready" });
		await workbench.dispatch({ type: "session.mode", mode: "plan" });
		const afterUnrelatedPublish = workbench.snapshot.cacheObservations?.find(layer => layer.id === "model-catalog");
		expect(afterUnrelatedPublish?.hits).toBe(before?.hits);

		const first = workbench.refreshModels();
		const second = workbench.refreshModels();
		await Promise.all([first, second]);
		const after = workbench.snapshot.cacheObservations?.find(layer => layer.id === "model-catalog");
		expect(native.listModelCalls).toBe(listModelCallsBefore + 1);
		expect(after?.misses).toBe((before?.misses ?? 0) + 1);
		expect(after?.hits).toBeGreaterThan(before?.hits ?? 0);
		expect(after?.entries).toBe(2);
		await workbench.close();
	});

	test("keeps the last successful Linear snapshot stale after an unexpected refresh rejection", async () => {
		let refreshCount = 0;
		const workbench = new ProjectWorkbench(new FakeNativeHarness(), new MemoryJournal(), {
			projectId: "sample-project",
			cwd: "/workspace/sample",
			linearDashboard: { refresh: async () => {
				refreshCount += 1;
				if (refreshCount > 1) throw new Error("temporary Linear failure");
				return {
					state: "ready", projectName: "World Wide Woo", fetchedAt: "2026-09-09T00:00:00.000Z",
					issues: [{ id: "WOO-907", title: "입장 Dashboard", status: "Backlog", dueDate: null }],
					update: null, comments: [], milestones: [], error: null,
				};
			} },
		});
		await workbench.waitUntilReady();
		await Bun.sleep(0);
		(workbench as unknown as { refreshLinearDashboard(threadId: string): void }).refreshLinearDashboard("thread-1");
		await Bun.sleep(0);
		expect(workbench.snapshot.linearDashboard).toMatchObject({
			state     : "stale",
			fetchedAt : "2026-09-09T00:00:00.000Z",
			error     : "temporary Linear failure",
			issues    : [{ id: "WOO-907" }],
		});
		expect(workbench.snapshot.cacheObservations?.find(layer => layer.id === "dashboard-data")).toMatchObject({ state: "stale", entries: 1, evictions: 0 });
		await workbench.close();
	});

 test("does not project ordinary execution items as Todo before a Native Plan is observed", async () => {
  const native = new FakeNativeHarness();
  const workbench = new ProjectWorkbench(native, new MemoryJournal(), {
   projectId: "sample-project",
   cwd: "/workspace/sample",
  });
  await ready(workbench);

  await workbench.dispatch({ type: "chat.send", text: "계획 없이 바로 처리해" });
  native.emit({
   type   : "notification",
   method : "item/started",
   refs   : { threadId: "thread-1", turnId: "turn-1", itemId: "tool-1" },
   params : { item: { type: "commandExecution", command: "pwd" } },
  });
  await Bun.sleep(5);

  expect(workbench.snapshot.executionRun?.tasks).toEqual([]);
  expect(workbench.snapshot.executionRun).toMatchObject({
   phase: "executing",
   activeActivity: { kind: "tool", method: "item/started" },
  });
  expect(workbench.snapshot.executionRun?.activities.some(activity => activity.nativeRefs.itemId === "tool-1")).toBe(true);
  expect(workbench.snapshot.workFlow.source).toBeNull();
  expect(workbench.snapshot.todo?.items.map(item => item.content)).toEqual([...REQUEST_STAGES]);
  await workbench.close();
 });

	test("keeps a public plan document visible without promoting it to the Native Todo checklist", async () => {
		const native = new FakeNativeHarness();
		const workbench = new ProjectWorkbench(native, new MemoryJournal(), { projectId: "sample-project", cwd: "/workspace/sample" });
		await ready(workbench);
		await workbench.dispatch({ type: "session.mode", mode: "plan" });
		await workbench.dispatch({ type: "chat.send", text: "실행 계획을 제안해" });
		native.emit({
			type   : "notification",
			method : "item/completed",
			refs   : { threadId: "thread-1", turnId: "turn-1", itemId: "assistant-plan" },
			params : { item: { type: "agentMessage", text: "계획입니다.\n1. 계약을 확인한다\n2. 회귀 테스트를 실행한다" } },
		});
		native.emit({ type: "notification", method: "turn/completed", refs: { threadId: "thread-1", turnId: "turn-1" }, params: {} });
		await Bun.sleep(10);
		expect(workbench.snapshot.workFlow.source).toMatchObject({ authority: "public-plan-document" });
		expect(workbench.snapshot.workFlow.steps.map(step => step.title)).toEqual(["계약을 확인한다", "회귀 테스트를 실행한다"]);
		expect(workbench.snapshot.todo?.items.map(item => item.content)).toEqual([...REQUEST_STAGES]);
		await workbench.close();
	});

 test("development recording observes only newly durable activities and failure does not fail Native send", async () => {
  const native = new FakeNativeHarness();
  const journal = new MemoryJournal();
  await journal.append({ projectId: "sample-project", provider: "openai-codex", kind: "progress", phase: "completed", nativeRefs: {}, sourceDigest: "historical", payload: { method: "historical" } });
  const observed: string[] = [];
  const workbench = new ProjectWorkbench(native, journal, { projectId: "sample-project", cwd: "/workspace/sample", developmentObserver: { capture: activity => { observed.push(activity.id); throw new Error("recording disk unavailable"); } } });
  await ready(workbench);
  expect(observed).toEqual([]);
  const receipt = await workbench.dispatch({ type: "chat.send", text: "record this selected task" });
  expect(receipt.state).toBe("accepted");
  expect(native.startTurnCalls).toBe(1);
  expect(observed.length).toBeGreaterThan(0);
  expect(observed).not.toContain("activity-1");
  expect(workbench.snapshot.error).toBeNull();
  expect(workbench.snapshot.developmentRecordingError).toBe("recording disk unavailable");
  await workbench.close();
 });

	test("projects MCP management separately and sends enable, disable, and global reload requests", async () => {
		const native = new FakeNativeHarness();
		const workbench = new ProjectWorkbench(native, new MemoryJournal(), {
			projectId: "sample-project",
			cwd: "/workspace/sample",
		});
		await ready(workbench);
		expect(workbench.snapshot.mcpServers).toEqual([{
			name: "filesystem", enabled: true, status: "ready", tools: ["read_file"],
		}]);

		expect((await workbench.dispatch({ type: "mcp.disable", name: "filesystem" })).state).toBe("accepted");
		expect((await workbench.dispatch({ type: "mcp.enable", name: "filesystem" })).state).toBe("accepted");
		expect((await workbench.dispatch({ type: "mcp.reload" })).state).toBe("accepted");

		expect(native.mcpEnableInputs).toEqual([
			{ name: "filesystem", enabled: false },
			{ name: "filesystem", enabled: true },
		]);
		expect(native.mcpReloadCalls).toBe(1);
		expect(workbench.snapshot.mcpServers[0]).toMatchObject({ enabled: true, tools: ["read_file"] });
	});

	test("clears only the visible Chat projection and starts compaction on its current thread", async () => {
		const native = new FakeNativeHarness();
		const workbench = new ProjectWorkbench(native, new MemoryJournal(), { projectId: "sample-project", cwd: "/workspace/sample" });
		await ready(workbench);
		await workbench.dispatch({ type: "chat.send", text: "첫 요청" });
		native.emit({ type: "notification", method: "turn/completed", refs: { threadId: "thread-1", turnId: "turn-1" }, params: {} });
		await Bun.sleep(10);
		expect(workbench.snapshot.activities.length).toBeGreaterThan(0);
		const compacted = await workbench.dispatch({ type: "thread.compact" });
		expect(compacted).toMatchObject({ state: "accepted" });
		expect(compacted).not.toHaveProperty("message");
		expect(native.compactThreadIds).toEqual(["thread-1"]);
		expect(workbench.snapshot.actionResult).toMatchObject({
			kind  : "notice",
			title : "Context",
			body  : "Native thread 컨텍스트 압축을 시작했습니다.",
		});
		const receipt = await workbench.dispatch({ type: "chat.clear" });
		expect(receipt).toMatchObject({ state: "accepted", message: expect.stringContaining("기록과 Native thread") });
		expect(workbench.snapshot.activities).toEqual([]);
		await workbench.close();
	});

	test("derives conservative background work only from complete native collaboration lifecycle snapshots", async () => {
		const native = new FakeNativeHarness();
		const workbench = new ProjectWorkbench(native, new MemoryJournal(), {
			projectId: "sample-project",
			cwd: "/workspace/sample",
		});
		await ready(workbench);
		expect(workbench.backgroundWorkState).toBe("unknown");

		native.emit({
			type   : "notification",
			method : "item/updated",
			refs   : { threadId: "thread-1", turnId: "turn-1", itemId: "spawn-1" },
			params: { item: {
				type: "collabAgentToolCall", id: "spawn-1", tool: "spawnAgent", status: "inProgress",
				receiverThreadIds: ["child-1"], agentsStates: {},
			} },
		});
		await Bun.sleep(5);
		expect(workbench.backgroundWorkState).toBe("active");

		native.emit({
			type   : "notification",
			method : "item/updated",
			refs   : { threadId: "thread-1", turnId: "turn-1", itemId: "spawn-1" },
			params: { item: {
				type: "collabAgentToolCall", id: "spawn-1", tool: "spawnAgent", status: "completed",
				receiverThreadIds: ["child-1"], agentsStates: {},
			} },
		});
		await Bun.sleep(5);
		expect(workbench.backgroundWorkState).toBe("unknown");

		native.emit({
			type   : "notification",
			method : "item/updated",
			refs   : { threadId: "thread-1", turnId: "turn-1", itemId: "spawn-1" },
			params: { item: {
				type: "collabAgentToolCall", id: "spawn-1", tool: "spawnAgent", status: "completed",
				receiverThreadIds: ["child-1"], agentsStates: { "child-1": { status: "running" } },
			} },
		});
		await Bun.sleep(5);
		expect(workbench.backgroundWorkState).toBe("active");

		native.emit({
			type   : "notification",
			method : "item/updated",
			refs   : { threadId: "thread-1", turnId: "turn-1", itemId: "spawn-1" },
			params: { item: {
				type: "collabAgentToolCall", id: "spawn-1", tool: "spawnAgent", status: "completed",
				receiverThreadIds: ["child-1"], agentsStates: { "child-1": { status: "completed" } },
			} },
		});
		await Bun.sleep(5);
		expect(workbench.backgroundWorkState).toBe("none");
		await workbench.close();
	});

	test("selects only a root-owned delegated agent and links its exact snapshot detail", async () => {
		const native = new FakeNativeHarness();
		const workbench = new ProjectWorkbench(native, new MemoryJournal(), {
			projectId: "sample-project",
			cwd: "/workspace/sample",
		});
		await ready(workbench);
		native.emit({
			type   : "notification",
			method : "item/updated",
			refs   : { threadId: "thread-1", turnId: "turn-root", itemId: "spawn-owned" },
			params: { item: {
				type: "collabAgentToolCall", id: "spawn-owned", tool: "spawnAgent", status: "completed",
				senderThreadId: "thread-1", receiverThreadIds: ["child-owned"], prompt: "소유된 작업",
				agentsStates: { "child-owned": { status: "running" } },
			} },
		});
		native.emit({
			type   : "notification",
			method : "item/updated",
			refs   : { threadId: "foreign-root", turnId: "turn-foreign", itemId: "spawn-foreign" },
			params: { item: {
				type: "collabAgentToolCall", id: "spawn-foreign", tool: "spawnAgent", status: "completed",
				senderThreadId: "foreign-root", receiverThreadIds: ["child-foreign"], prompt: "다른 수행",
				agentsStates: { "child-foreign": { status: "running" } },
			} },
		});
		await Bun.sleep(10);
		const delegation = workbench.snapshot.delegation ?? [];
		const owned = delegation.flatMap(entry => entry.tasks).find(task => task.id === "child-owned");
		expect(owned).toBeDefined();
		expect(delegation.flatMap(entry => entry.tasks).some(task => task.id === "child-foreign")).toBe(false);
		expect(await workbench.dispatch({ type: "agent.select", agentRef: "child-foreign" })).toMatchObject({ state: "rejected" });
		expect(await workbench.dispatch({ type: "agent.select", agentRef: owned!.ref })).toMatchObject({ state: "accepted" });
		expect(workbench.snapshot.selectedAgentRef).toBe(owned!.ref);
		expect(workbench.snapshot.selectedAgentDetail).toMatchObject({ ref: owned!.ref, id: "child-owned", task: "소유된 작업", status: "running" });
		await workbench.close();
	});

	test("collects woo-entry before Chat and applies a refresh to the next queued turn", async () => {
		const native = new FakeNativeHarness();
		let collectionCount = 0;
		const collection = (branch: string): WooEntryCollection => ({
			source: { root: "/wes", runner: "hooks/wes_entry.py" },
			payload: {
				status      : { status: "bootstrap", branch },
				git         : { branch, head: branch === "first" ? "a".repeat(40) : "b".repeat(40) },
				authority   : { active_ledger: "planning/active/todo.md" },
				signals     : branch === "first" ? [] : [{ kind: "stale-revision", sources: ["TODO.md"] }],
				nextActions : [{ id: "TASK-1", label: branch, status: "in-progress" }],
			},
		});
		const wooEntry = new WooEntry({
			collect: async () => collection(++collectionCount === 1 ? "first" : "second"),
		});
		const workbench = new ProjectWorkbench(native, new MemoryJournal(), {
			projectId: "sample-project",
			cwd: "/workspace/sample",
			wooEntry,
		});

		await ready(workbench);
		expect(collectionCount).toBe(1);
		expect(workbench.snapshot.wooEntry).toMatchObject({ state: "ready", revision: 1 });
		await workbench.dispatch({ type: "chat.send", text: "첫 요청" });
		await workbench.dispatch({ type: "chat.send", text: "대기 요청" });
		const refresh = await workbench.dispatch({ type: "woo-entry.refresh" });
		expect(refresh).toMatchObject({ state: "accepted" });
		expect(collectionCount).toBe(2);
		expect(native.startTurnCalls).toBe(1);

		native.emit({ type: "notification", method: "turn/completed", refs: { threadId: "thread-1", turnId: "turn-1" }, params: {} });
		await Bun.sleep(10);

		expect(native.startTurnCalls).toBe(2);
		const contexts = native.startTurnInputs.map((input) => {
			const entry = input.additionalContext?.www_context_sources;
			expect(entry).toMatchObject({ kind: "untrusted" });
			return JSON.parse(entry!.value) as { sources: Array<{
				repository      : { id: string; root: string } ;
				revision        : string                       ;
				included        : boolean                      ;
				exclusionReason : string | null                ;
				payload         : { git?: { branch: string } } ;
			}> };
		});
		expect(contexts.map(({ sources }) => {
			const wes = sources.find((source) => source.repository.id === "WES")!;
			return [wes.revision, wes.payload.git?.branch];
		})).toEqual([
			["1", "first"],
			["2", "second"],
		]);
		for (const { sources } of contexts) {
			expect(sources).toEqual(expect.arrayContaining([
				expect.objectContaining({
					repository      : { id: "WES", root: "/wes" },
					included        : true,
					exclusionReason : null,
				}),
				expect.objectContaining({
					repository      : { id: "WWW", root: "/workspace/sample" },
					included        : true,
					exclusionReason : null,
					revision        : "turn-input-v1",
				}),
			]));
		}
		expect(native.startTurnInputs.every((input) => input.additionalContext?.www_context_policy?.kind === "application")).toBe(true);
		await workbench.close();
	});

	test("excludes a WES source that exceeds its bounded collection payload", async () => {
		const native = new FakeNativeHarness();
		const wooEntry = new WooEntry({
			collect: async () => ({
				source: { root: "/wes", runner: "hooks/wes_entry.py" },
				payload: {
					status      : { detail: "x".repeat(4_000) },
					git         : {},
					authority   : {},
					signals     : [],
					nextActions : [],
				},
			}),
		});
		const workbench = new ProjectWorkbench(native, new MemoryJournal(), {
			projectId: "sample-project",
			cwd: "/workspace/sample",
			wooEntry,
		});

		await ready(workbench);
		await workbench.dispatch({ type: "chat.send", text: "bounded context" });

		const context = JSON.parse(native.startTurnInputs[0]!.additionalContext!.www_context_sources!.value) as {
			sources: Array<{ repository: { id: string }; included: boolean; exclusionReason: string | null; payload: Record<string, unknown> }>;
		};
		const wes = context.sources.find((source) => source.repository.id === "WES");
		expect(wes).toMatchObject({
			included        : false,
			exclusionReason : "WES entry snapshot exceeds the chat context budget.",
			payload         : { state: "blocked" },
		});
		await workbench.close();
	});

	test("mirrors seven-stage Runtime to Todo without delaying Native activity projection", async () => {
		const native                                 = new FakeNativeHarness()                                        ;
		const syncCalls     : RequestRuntimeRecord[] = []                                                             ;
		let releasePlanSync : () => void             = () => undefined                                                ;
		const planSyncGate                           = new Promise<void>((resolve) => { releasePlanSync = resolve; }) ;
		const unsupported                            = async (): Promise<never> => { throw new Error("not used"); }   ;
		const todos: WorkbenchTodoSource = {
			snapshot: null,
			subscribe: () => () => undefined,
			syncRequestRuntime: async (request) => {
				syncCalls.push(request);
				await planSyncGate;
				return todoDocument();
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
		const workbench = new ProjectWorkbench(native, new MemoryJournal(), {
			projectId: "sample-project",
			cwd: "/workspace/sample",
			todos,
		});
		await ready(workbench);
		await workbench.dispatch({ type: "chat.send", text: "Native 계획을 Todo에 반영해줘" });

		native.emit({
			type: "notification",
			method: "turn/plan/updated",
			// The App Server adapter binds a plan-only payload to its known root thread.
			refs: { threadId: "thread-1", turnId: "turn-1" },
			params: { plan: [
				{ step: "계획 자동 동기화", status: "inProgress" },
				{ step: "결과 검증", status: "pending" },
			] },
		});
		await Bun.sleep(10);
		native.emit({
			type   : "notification",
			method : "item/completed",
			refs   : { threadId: "thread-1", turnId: "turn-1", itemId: "write-1" },
			params : { item: { type: "commandExecution", command: "apply_patch Todo.md" } },
		});
		await Bun.sleep(10);

		native.emit({
			type   : "notification",
			method : "turn/plan/updated",
			refs   : { threadId: "child-thread", turnId: "child-turn" },
			params : { plan: [{ step: "Foreign plan", status: "inProgress" }] },
		});
		await Bun.sleep(10);

		expect(syncCalls[0]?.stages.map(stage => stage.id)).toEqual([...REQUEST_STAGES]);
		const execution = workbench.snapshot.activities.find((activity) => activity.nativeRefs.itemId === "write-1");
		expect(execution).toBeDefined();
		expect(workbench.snapshot.activities.find((activity) => activity.payload.method === "turn/plan/updated")?.nativeRefs)
			.toMatchObject({ threadId: "thread-1", turnId: "turn-1" });
		expect(workbench.snapshot.workFlow.source).toMatchObject({ turnId: "turn-1", algorithm: "dplan-v1" });
		expect(workbench.snapshot.workFlow.steps.some(step => step.title === "계획 자동 동기화")).toBe(true);
		expect(workbench.snapshot.workFlow.steps.some(step => step.title === "Foreign plan")).toBe(false);
		expect(workbench.snapshot.todoSync).toMatchObject({ state: "syncing" });
		releasePlanSync();
		await workbench.close();
		expect(workbench.snapshot.todoSync).toEqual({
			state           : "confirmed",
			lastConfirmedAt : "2026-09-01T00:00:00.000Z",
			message         : null,
		});
		expect(syncCalls.at(-1)).toMatchObject({ requestId: expect.any(String), threadId: "thread-1", turnId: "turn-1" });
		expect(syncCalls.at(-1)?.stages[0]?.evidence.map(e => e.activityId)).toContain(execution!.id);
		expect(workbench.snapshot.todo?.items.map(item => item.content)).toEqual([...REQUEST_STAGES]);
	});

	test("keeps Chat usable while Todo sync is blocked and clears the warning after a later plan sync", async () => {
		const native      = new FakeNativeHarness()                                      ;
		let shouldFail    = true                                                         ;
		const unsupported = async (): Promise<never> => { throw new Error("not used"); } ;
		const todos: WorkbenchTodoSource = {
			snapshot: null,
			subscribe: () => () => undefined,
			syncRequestRuntime: async () => {
				if (shouldFail) throw new Error("disk unavailable");
				return todoDocument(1);
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
		const workbench = new ProjectWorkbench(native, new MemoryJournal(), {
			projectId: "sample-project",
			cwd: "/workspace/sample",
			todos,
		});
		await ready(workbench);
		await workbench.dispatch({ type: "chat.send", text: "실패해도 대화를 계속해" });
		native.emit({
			type   : "notification",
			method : "turn/plan/updated",
			refs   : { threadId: "thread-1", turnId: "turn-1" },
			params : { plan: [{ step: "첫 동기화", status: "inProgress" }] },
		});
		await Bun.sleep(15);

		expect(workbench.snapshot.todoSync).toMatchObject({
			state: "blocked",
			message: expect.stringContaining("대화는 계속"),
		});
		expect(workbench.snapshot.activeTurnId).toBe("turn-1");
		expect(workbench.snapshot.chat.some((message) => message.role === "user")).toBe(true);

		shouldFail = false;
		native.emit({
			type   : "notification",
			method : "turn/plan/updated",
			refs   : { threadId: "thread-1", turnId: "turn-1" },
			params: { plan: [
				{ step: "첫 동기화", status: "completed" },
				{ step: "복구 확인", status: "inProgress" },
			] },
		});
		await Bun.sleep(15);

		expect(workbench.snapshot.todoSync).toEqual({
			state           : "confirmed",
			lastConfirmedAt : "2026-09-01T00:00:00.000Z",
			message         : null,
		});
		await workbench.close();
	});

	test("keeps each published Snapshot stable across Native, catalog, Todo, and usage updates", async () => {
		let catalogRevision = 0;
		class RefreshingNativeHarness extends FakeNativeHarness {
			override async listModels() {
				this.listModelCalls += 1;
				return catalogRevision === 0
					? [{ model: "gpt-5.6-sol", displayName: "GPT-5.6 Sol", efforts: ["high"] as const, defaultEffort: "high" as const }]
					: [{ model: "gpt-5.6-terra", displayName: "GPT-5.6 Terra", efforts: ["medium", "high"] as const, defaultEffort: "medium" as const }];
			}
		}
		const native         = new RefreshingNativeHarness() ;
		const auxiliaryUsage = new SessionModelUsageAccumulator();
		const createdTodo: TodoDocument = {
			...todoDocument(2),
			title : "새 Todo",
			items : [{ id: "todo-2", content: "기록", status: "pending", evidenceIds: [], details: [] }],
		};
		const unsupported = async (): Promise<never> => { throw new Error("not used"); };
		const todos: WorkbenchTodoSource = {
			snapshot       : null,
			subscribe      : () => () => undefined,
			create         : async () => createdTodo,
			add            : unsupported,
			addDetails     : unsupported,
			start          : unsupported,
			complete       : unsupported,
			block          : unsupported,
			reopen         : unsupported,
			recordEvidence : async () => null,
			importLegacy   : async () => null,
		};
		const workbench = new ProjectWorkbench(native, new MemoryJournal(), {
			projectId          : "sample-project",
			cwd                : "/workspace/sample",
			requestRuntimeMode : "off",
			todos,
			auxiliaryUsage,
		});
		await ready(workbench);
		const snapshots: (typeof workbench.snapshot)[] = [];
		const unsubscribe = workbench.subscribe(snapshot => { snapshots.push(snapshot); });
		const latestSnapshot = () => {
			const snapshot = snapshots.at(-1);
			if (!snapshot) throw new Error("구독된 Workbench Snapshot이 없습니다.");
			return snapshot;
		};
		await workbench.dispatch({ type: "chat.send", text: "이전 Snapshot을 보존해줘" });
		const beforeDelta = latestSnapshot();
		const firstChat = beforeDelta.chat[0];
		if (!firstChat) throw new Error("제출한 사용자 Chat이 Snapshot에 없습니다.");

		expect(beforeDelta).toBe(workbench.snapshot);
		expect(beforeDelta.chat.map(message => message.content)).toEqual(["이전 Snapshot을 보존해줘"]);
		expect(beforeDelta.modelCatalog?.models.map(model => model.model)).toEqual(["gpt-5.6-sol"]);
		expect(Object.isFrozen(beforeDelta.chat)).toBe(true);
		expect(Object.isFrozen(firstChat)).toBe(true);
		expect(() => { firstChat.content = "외부 변조"; }).toThrow();

		native.emit({
			type   : "notification",
			method : "item/agentMessage/delta",
			refs   : { threadId: "thread-1", turnId: "turn-1", itemId: "snapshot-message" },
			params : { delta: "진행 중인 Native 출력" },
		});
		await Bun.sleep(10);
		const afterDelta = latestSnapshot();

		expect(afterDelta).toBe(workbench.snapshot);
		expect(afterDelta.revision).toBeGreaterThan(beforeDelta.revision);
		expect(afterDelta.draft).toBe("진행 중인 Native 출력");
		expect(beforeDelta.draft).toBe("");
		expect(beforeDelta.chat.map(message => message.content)).toEqual(["이전 Snapshot을 보존해줘"]);

		catalogRevision = 1;
		await workbench.refreshModels();
		const afterCatalogRefresh = latestSnapshot();

		expect(afterCatalogRefresh).toBe(workbench.snapshot);
		expect(afterCatalogRefresh.revision).toBeGreaterThan(afterDelta.revision);
		expect(afterCatalogRefresh.modelCatalog?.models.map(model => model.model)).toEqual(["gpt-5.6-terra"]);
		expect(afterDelta.modelCatalog?.models.map(model => model.model)).toEqual(["gpt-5.6-sol"]);
		expect(afterDelta.draft).toBe("진행 중인 Native 출력");

		const todoReceipt = await workbench.dispatch({ type: "todo.create", title: "새 Todo", items: ["기록"] });
		const afterTodo = latestSnapshot();

		expect(todoReceipt.state).toBe("accepted");
		expect(afterTodo).toBe(workbench.snapshot);
		expect(afterTodo.revision).toBeGreaterThan(afterCatalogRefresh.revision);
		expect(afterTodo.actionResult).toMatchObject({ kind: "todo", title: "Todo 생성" });
		expect(afterTodo.actionResult?.body).toContain("새 Todo");
		expect(afterCatalogRefresh.actionResult).toBeNull();
		expect(Object.isFrozen(afterTodo.actionResult)).toBe(true);

		auxiliaryUsage.observe({ model: "gpt-5.6-terra", effort: "medium", totalTokens: 400 });
		const afterUsage = latestSnapshot();

		expect(afterUsage).toBe(workbench.snapshot);
		expect(afterUsage.revision).toBeGreaterThan(afterTodo.revision);
		expect(afterUsage.sessionUsage?.models).toContainEqual(expect.objectContaining({ model: "gpt-5.6-terra", totalTokens: 400 }));
		expect(afterTodo.sessionUsage?.models).toEqual([]);
		expect(afterTodo.actionResult).toMatchObject({ kind: "todo", title: "Todo 생성" });
		expect(beforeDelta.chat.map(message => message.content)).toEqual(["이전 Snapshot을 보존해줘"]);
		expect(beforeDelta.modelCatalog?.models.map(model => model.model)).toEqual(["gpt-5.6-sol"]);
		expect(beforeDelta.sessionUsage?.models).toEqual([]);
		expect(beforeDelta.actionResult).toBeNull();
		unsubscribe();
		await workbench.close();
	});
});
/** @linear WOO-688 WOO-690 WOO-691 WOO-705 WOO-718 */

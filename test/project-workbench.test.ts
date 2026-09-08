import { describe, expect, test } from "bun:test";
import type { ExecutorPort } from "../src/core/ports/execution/executor-port";
import type {
	ActivityNarrationRequest,
	ActivityNarrator,
} from "../src/core/application/orchestration/activity-narrator";
import {
	ProjectWorkbench,
	type WorkbenchActivityJournal,
	type WorkbenchTNoteSource,
	type WorkbenchTodoSource,
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
import { ReviewService } from "../src/core/application/review/review-service";
import { SessionModelUsageAccumulator } from "../src/core/application/session/session-model-usage";
import { TodoWriteConflictError } from "../src/core/application/work/todo-ledger";
import { WooEntry, type WooEntryCollection } from "../src/core/application/orchestration/woo-entry";
import type { TodoDocument } from "../src/core/domain/work/todos";
import type { WorkFlowProjection } from "../src/core/domain/work";
import { ProviderReviewAdapter, sha256ReviewDigest } from "../src/adapters/outbound/review/review-adapters";
import { TNoteService } from "../src/core/application/work/t-note-service";
import type { DetachedTextGenerator } from "../src/core/application/orchestration/detached-text-generator";
import { FileTNoteStore } from "../src/adapters/outbound/persistence/t-note-store";
import { projectTNoteCompletionIndex, sanitizeTNoteText } from "../src/core/domain/work/t-notes";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

class MemoryJournal implements WorkbenchActivityJournal {
	readonly records: ProjectActivity[] = [];
	async append(input: ProjectActivityInput): Promise<ProjectActivityAppendResult> {
		const activity: ProjectActivity = {
			...input,
			schemaVersion: 1,
			id: `activity-${this.records.length + 1}`,
			sequence: this.records.length + 1,
			recordedAt: new Date(1_700_000_000_000 + this.records.length).toISOString(),
		};
		this.records.push(activity);
		return { activity, appended: true };
	}
	async readAll(): Promise<ProjectActivity[]> { return [...this.records]; }
}

class MessageCompletionGateJournal extends MemoryJournal {
	private releaseMessageCompletion: (() => void) | null = null;
	private signalMessageCompletion: (() => void) | null = null;
	readonly messageCompletionReached = new Promise<void>((resolve) => {
		this.signalMessageCompletion = resolve;
	});
	private readonly messageCompletionRelease = new Promise<void>((resolve) => {
		this.releaseMessageCompletion = resolve;
	});

	override async append(input: ProjectActivityInput): Promise<ProjectActivityAppendResult> {
		if (input.kind === "message" && input.phase === "completed") {
			this.signalMessageCompletion?.();
			await this.messageCompletionRelease;
		}
		return super.append(input);
	}

	release(): void {
		this.releaseMessageCompletion?.();
	}
}

class ToolObservationGateJournal extends MemoryJournal {
	private releaseTool: (() => void) | null = null;
	private signalTool: (() => void) | null = null;
	readonly toolReached = new Promise<void>((resolve) => { this.signalTool = resolve; });
	private readonly toolRelease = new Promise<void>((resolve) => { this.releaseTool = resolve; });

	override async append(input: ProjectActivityInput): Promise<ProjectActivityAppendResult> {
		if (input.kind === "tool" && input.phase === "started") {
			this.signalTool?.();
			await this.toolRelease;
		}
		return super.append(input);
	}

	release(): void { this.releaseTool?.(); }
}

class FakeNativeHarness implements ExecutorPort {
	private listener: ((event: NativeHarnessEvent) => void) | null = null;
	startTurnCalls = 0;
	startTurnInputs: NativeTurnStart[] = [];
	steerTurnInputs: NativeTurnSteer[] = [];
	steerTurn?: (input: NativeTurnSteer) => Promise<NativeTurnSteerResult>;
	startTurnErrors = new Map<number, unknown>();
	startThreadCalls = 0;
	startThreadInputs: NativeThreadStart[] = [];
	startThreadGate: Promise<void> | null = null;
	startThreadError: unknown = null;
	startTurnGate: Promise<void> | null = null;
	uncertain = false;
	approvalResponses: NativeApprovalResolution[] = [];
	resumeCalls = 0;
	resumeThreadId: string | null = null;
	readThreadId: string | null = null;
	readCalls = 0;
	resumeInputs: NativeThreadResume[] = [];
	readInputs: NativeThreadRead[] = [];
	readValue: Readonly<Record<string, unknown>> = { status: { type: "idle" }, turns: [] };
	interruptInputs: NativeTurnInterrupt[] = [];
	mcpServers = [{ name: "filesystem", enabled: true, status: "ready", tools: ["read_file"] }];
	mcpEnableInputs: Array<{ name: string; enabled: boolean }> = [];
	mcpReloadCalls = 0;
	async startThread(input: NativeThreadStart): Promise<NativeThreadSnapshot> {
		this.startThreadCalls += 1;
		this.startThreadInputs.push(input);
		if (this.startThreadGate) await this.startThreadGate;
		if (this.startThreadError) throw this.startThreadError;
		return { id: "thread-1", value: {} };
	}
	async resumeThread(input: NativeThreadResume): Promise<NativeThreadSnapshot> {
		this.resumeCalls += 1;
		this.resumeInputs.push(input);
		return { id: this.resumeThreadId ?? input.threadId, value: {} };
	}
	async readThread(input: NativeThreadRead): Promise<NativeThreadSnapshot> {
		this.readCalls += 1;
		this.readInputs.push(input);
		return { id: this.readThreadId ?? input.threadId, value: this.readValue };
	}
	async listThreads(_input: NativeThreadList): Promise<readonly NativeThreadSummary[]> { return []; }
	async startTurn(input: NativeTurnStart): Promise<NativeTurnSnapshot> {
		this.startTurnCalls += 1;
		this.startTurnInputs.push(input);
		if (this.startTurnGate) await this.startTurnGate;
		if (this.startTurnErrors.has(this.startTurnCalls)) throw this.startTurnErrors.get(this.startTurnCalls);
		if (this.uncertain) throw {
			state: "uncertain",
			resolution: "manual-reconcile",
			method: "turn/start",
			requestId: 7,
		};
		return { id: `turn-${this.startTurnCalls}`, threadId: "thread-1", value: {} };
	}
	enableSteering(): void {
		this.steerTurn = async (input) => {
			this.steerTurnInputs.push(input);
			return { turnId: input.expectedTurnId };
		};
	}
	async interruptTurn(input: NativeTurnInterrupt): Promise<void> { this.interruptInputs.push(input); }
	async listMcpServers() { return this.mcpServers; }
	async setMcpServerEnabled(name: string, enabled: boolean): Promise<void> {
		this.mcpEnableInputs.push({ name, enabled });
		this.mcpServers = this.mcpServers.map((server) => server.name === name ? { ...server, enabled } : server);
	}
	async reloadMcpServers(): Promise<void> { this.mcpReloadCalls += 1; }
	async respondToApproval(input: NativeApprovalResolution): Promise<void> { this.approvalResponses.push(input); }
	subscribe(listener: (event: NativeHarnessEvent) => void): () => void {
		this.listener = listener;
		return () => { this.listener = null; };
	}
	emit(event: NativeHarnessEvent): void { this.listener?.(event); }
	async close(): Promise<void> {}
}

class FakeActivityNarrator implements ActivityNarrator {
	readonly calls: ActivityNarrationRequest[] = [];
	async narrate(request: ActivityNarrationRequest) {
		this.calls.push(request);
		return {
			what: "의미 Step과 Live T-notes의 회귀 테스트를 실행합니다.",
			why: "Read 작업은 숨기고 실제 검증만 단계로 남는지 확인하기 위해서입니다.",
			inputSummary: ["work-flow 관련 테스트"],
		};
	}
}

function todoDocument(revision = 0): TodoDocument {
	return {
		version: 1,
		revision,
		ownerSessionId: "workbench",
		storyId: null,
		title: "작업",
		updatedAt: "2026-09-01T00:00:00.000Z",
		items: [{ id: "todo-1", content: "구현", status: "in_progress", evidenceIds: [], details: [] }],
	};
}

async function ready(workbench: ProjectWorkbench): Promise<void> {
	if (workbench.snapshot.phase !== "loading") return;
	await new Promise<void>((resolve) => {
		const unsubscribe = workbench.subscribe((snapshot) => {
			if (snapshot.phase === "loading") return;
			unsubscribe();
			resolve();
		});
	});
}

describe("ProjectWorkbench", () => {
 test("does not project ordinary execution items as Todo before a Native Plan is observed", async () => {
  const native = new FakeNativeHarness();
  const workbench = new ProjectWorkbench(native, new MemoryJournal(), {
   projectId: "sample-project",
   cwd: "/workspace/sample",
  });
  await ready(workbench);

  await workbench.dispatch({ type: "chat.send", text: "계획 없이 바로 처리해" });
  native.emit({
   type: "notification",
   method: "item/started",
   refs: { threadId: "thread-1", turnId: "turn-1", itemId: "tool-1" },
   params: { item: { type: "commandExecution", command: "pwd" } },
  });
  await Bun.sleep(5);

  expect(workbench.snapshot.executionRun?.tasks.length).toBeGreaterThan(0);
  expect(workbench.snapshot.workFlow.source).toBeNull();
  expect(workbench.snapshot.todo).toBeNull();
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

	test("derives conservative background work only from complete native collaboration lifecycle snapshots", async () => {
		const native = new FakeNativeHarness();
		const workbench = new ProjectWorkbench(native, new MemoryJournal(), {
			projectId: "sample-project",
			cwd: "/workspace/sample",
		});
		await ready(workbench);
		expect(workbench.backgroundWorkState).toBe("unknown");

		native.emit({
			type: "notification",
			method: "item/updated",
			refs: { threadId: "thread-1", turnId: "turn-1", itemId: "spawn-1" },
			params: { item: {
				type: "collabAgentToolCall", id: "spawn-1", tool: "spawnAgent", status: "inProgress",
				receiverThreadIds: ["child-1"], agentsStates: {},
			} },
		});
		await Bun.sleep(5);
		expect(workbench.backgroundWorkState).toBe("active");

		native.emit({
			type: "notification",
			method: "item/updated",
			refs: { threadId: "thread-1", turnId: "turn-1", itemId: "spawn-1" },
			params: { item: {
				type: "collabAgentToolCall", id: "spawn-1", tool: "spawnAgent", status: "completed",
				receiverThreadIds: ["child-1"], agentsStates: {},
			} },
		});
		await Bun.sleep(5);
		expect(workbench.backgroundWorkState).toBe("unknown");

		native.emit({
			type: "notification",
			method: "item/updated",
			refs: { threadId: "thread-1", turnId: "turn-1", itemId: "spawn-1" },
			params: { item: {
				type: "collabAgentToolCall", id: "spawn-1", tool: "spawnAgent", status: "completed",
				receiverThreadIds: ["child-1"], agentsStates: { "child-1": { status: "running" } },
			} },
		});
		await Bun.sleep(5);
		expect(workbench.backgroundWorkState).toBe("active");

		native.emit({
			type: "notification",
			method: "item/updated",
			refs: { threadId: "thread-1", turnId: "turn-1", itemId: "spawn-1" },
			params: { item: {
				type: "collabAgentToolCall", id: "spawn-1", tool: "spawnAgent", status: "completed",
				receiverThreadIds: ["child-1"], agentsStates: { "child-1": { status: "completed" } },
			} },
		});
		await Bun.sleep(5);
		expect(workbench.backgroundWorkState).toBe("none");
		await workbench.close();
	});

	test("collects woo-entry before Chat and applies a refresh to the next queued turn", async () => {
		const native = new FakeNativeHarness();
		let collectionCount = 0;
		const collection = (branch: string): WooEntryCollection => ({
			source: { root: "/wes", runner: "hooks/wes_entry.py" },
			payload: {
				status: { status: "bootstrap", branch },
				git: { branch, head: branch === "first" ? "a".repeat(40) : "b".repeat(40) },
				authority: { active_ledger: "planning/active/todo.md" },
				signals: branch === "first" ? [] : [{ kind: "stale-revision", sources: ["TODO.md"] }],
				nextActions: [{ id: "TASK-1", label: branch, status: "in-progress" }],
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
				repository: { id: string; root: string };
				revision: string;
				included: boolean;
				exclusionReason: string | null;
				payload: { git?: { branch: string } };
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
					repository: { id: "WES", root: "/wes" },
					included: true,
					exclusionReason: null,
				}),
				expect.objectContaining({
					repository: { id: "WWW", root: "/workspace/sample" },
					included: true,
					exclusionReason: null,
					revision: "turn-input-v1",
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
					status: { detail: "x".repeat(4_000) },
					git: {},
					authority: {},
					signals: [],
					nextActions: [],
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
			included: false,
			exclusionReason: "WES entry snapshot exceeds the chat context budget.",
			payload: { state: "blocked" },
		});
		await workbench.close();
	});

	test("mirrors Native plan activity to Todo without delaying real-time Chat projection", async () => {
		const native = new FakeNativeHarness();
		const syncCalls: Array<{ flow: WorkFlowProjection; binding: Parameters<NonNullable<WorkbenchTodoSource["syncNativePlan"]>>[1] }> = [];
		let releasePlanSync: () => void = () => undefined;
		const planSyncGate = new Promise<void>((resolve) => { releasePlanSync = resolve; });
		const unsupported = async (): Promise<never> => { throw new Error("not used"); };
		const todos: WorkbenchTodoSource = {
			snapshot: null,
			subscribe: () => () => undefined,
			syncNativePlan: async (flow, binding) => {
				syncCalls.push({ flow, binding });
				if (flow.steps.length > 0) await planSyncGate;
				return todoDocument();
			},
			create: unsupported,
			add: unsupported,
			addDetails: unsupported,
			start: unsupported,
			complete: unsupported,
			block: unsupported,
			reopen: unsupported,
			recordEvidence: async () => null,
			importLegacy: async () => null,
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
			type: "notification",
			method: "item/completed",
			refs: { threadId: "thread-1", turnId: "turn-1", itemId: "write-1" },
			params: { item: { type: "commandExecution", command: "apply_patch Todo.md" } },
		});
		await Bun.sleep(10);

		native.emit({
			type: "notification",
			method: "turn/plan/updated",
			refs: { threadId: "child-thread", turnId: "child-turn" },
			params: { plan: [{ step: "Foreign plan", status: "inProgress" }] },
		});
		await Bun.sleep(10);

		expect(syncCalls.some(({ flow }) => flow.steps.length === 2)).toBe(true);
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
			state: "confirmed",
			lastConfirmedAt: "2026-09-01T00:00:00.000Z",
			message: null,
		});
		expect(syncCalls.at(-1)).toMatchObject({
			flow: {
				source: { kind: "native-plan-derived", turnId: "turn-1", algorithm: "dplan-v1" },
				steps: [{ title: "계획 자동 동기화", status: "running" }, { title: "결과 검증", status: "pending" }],
			},
			binding: {
				input: { requestId: expect.any(String), activityId: expect.any(String), sourceDigest: expect.stringMatching(/^sha256:/u) },
				rootExecution: { provider: null, model: "codex", agentId: null, threadId: "thread-1", runId: "turn-1" },
			},
		});
	});

	test("keeps Chat usable while Todo sync is blocked and clears the warning after a later plan sync", async () => {
		const native = new FakeNativeHarness();
		let shouldFail = true;
		const unsupported = async (): Promise<never> => { throw new Error("not used"); };
		const todos: WorkbenchTodoSource = {
			snapshot: null,
			subscribe: () => () => undefined,
			syncNativePlan: async () => {
				if (shouldFail) throw new Error("disk unavailable");
				return todoDocument(1);
			},
			create: unsupported,
			add: unsupported,
			addDetails: unsupported,
			start: unsupported,
			complete: unsupported,
			block: unsupported,
			reopen: unsupported,
			recordEvidence: async () => null,
			importLegacy: async () => null,
		};
		const workbench = new ProjectWorkbench(native, new MemoryJournal(), {
			projectId: "sample-project",
			cwd: "/workspace/sample",
			todos,
		});
		await ready(workbench);
		await workbench.dispatch({ type: "chat.send", text: "실패해도 대화를 계속해" });
		native.emit({
			type: "notification",
			method: "turn/plan/updated",
			refs: { threadId: "thread-1", turnId: "turn-1" },
			params: { plan: [{ step: "첫 동기화", status: "inProgress" }] },
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
			type: "notification",
			method: "turn/plan/updated",
			refs: { threadId: "thread-1", turnId: "turn-1" },
			params: { plan: [
				{ step: "첫 동기화", status: "completed" },
				{ step: "복구 확인", status: "inProgress" },
			] },
		});
		await Bun.sleep(15);

		expect(workbench.snapshot.todoSync).toEqual({
			state: "confirmed",
			lastConfirmedAt: "2026-09-01T00:00:00.000Z",
			message: null,
		});
		await workbench.close();
	});

	test("preserves rewritten root-plan identity through Todo sync and resume", async () => {
		const native = new FakeNativeHarness();
		const journal = new MemoryJournal();
		const mirrored = { todo: null as TodoDocument | null };
		let revision = 0;
		const unsupported = async (): Promise<never> => { throw new Error("not used"); };
		const todos: WorkbenchTodoSource = {
			snapshot: null,
			subscribe: () => () => undefined,
			syncNativePlan: async (flow) => {
				mirrored.todo = {
					version: 1,
					revision: ++revision,
					ownerSessionId: "workbench",
					storyId: null,
					title: flow.goal,
					updatedAt: "2026-09-01T00:00:00.000Z",
					items: flow.steps.map((step) => ({
						id: step.id,
						content: step.title,
						status: step.status === "running" ? "in_progress" : step.status === "completed" ? "completed" : "pending",
						evidenceIds: [],
						details: [],
					})),
				};
				return mirrored.todo;
			},
			create: unsupported,
			add: unsupported,
			addDetails: unsupported,
			start: unsupported,
			complete: unsupported,
			block: unsupported,
			reopen: unsupported,
			recordEvidence: async () => null,
			importLegacy: async () => null,
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
			type: "notification",
			method: "turn/plan/updated",
			refs: { threadId: "thread-1", turnId: "turn-1" },
			params: { plan: [{ step: "루트 계획", status: "inProgress" }] },
		});
		await Bun.sleep(10);
		native.emit({
			type: "notification",
			method: "item/completed",
			refs: { threadId: "child-thread", turnId: "child-turn", itemId: "child-write-1" },
			params: { item: { type: "commandExecution", command: "apply_patch child.md" } },
		});
		native.emit({
			type: "notification",
			method: "item/completed",
			refs: { threadId: "thread-1", turnId: "turn-1", itemId: "write-1" },
			params: { item: { type: "commandExecution", command: "apply_patch Todo.md" } },
		});
		native.emit({
			type: "notification",
			method: "turn/plan/updated",
			refs: { threadId: "thread-1", turnId: "turn-1" },
			params: { plan: [{ step: "루트 계획", status: "completed" }] },
		});
		await Bun.sleep(10);

		const finalFlow = workbench.snapshot.workFlow;
		const finalIdentity = finalFlow.steps[0]?.id;
		const childActivity = journal.records.find((activity) => activity.nativeRefs.itemId === "child-write-1");
		const rootActivity = journal.records.find((activity) => activity.nativeRefs.itemId === "write-1");
		expect(finalFlow.source).toMatchObject({ turnId: "turn-1", algorithm: "dplan-v1" });
		expect(finalFlow.steps[0]).toMatchObject({ title: "루트 계획", status: "completed", activityIds: [rootActivity?.id] });
		expect(finalFlow.steps[0]?.activityIds).not.toContain(childActivity?.id);
		expect(finalFlow.orphans).toEqual(expect.arrayContaining([
			expect.objectContaining({ activityId: childActivity?.id, reason: "source_mismatch" }),
		]));
		const finalTodo = mirrored.todo;
		if (!finalTodo) throw new Error("Todo mirror was not invoked for the rewritten root plan.");
		expect(finalTodo.items).toEqual([expect.objectContaining({ id: finalIdentity, status: "completed" })]);

		native.emit({ type: "notification", method: "turn/completed", refs: { threadId: "thread-1", turnId: "turn-1" }, params: {} });
		await Bun.sleep(10);
		await workbench.close();

		const resumed = new ProjectWorkbench(new FakeNativeHarness(), journal, {
			projectId: "sample-project",
			cwd: "/workspace/sample",
			resumeThreadId: "thread-1",
		});
		await ready(resumed);
		expect(resumed.snapshot.workFlow.source).toMatchObject({ turnId: "turn-1", algorithm: "dplan-v1" });
		expect(resumed.snapshot.workFlow.steps[0]).toMatchObject({ id: finalIdentity, title: "루트 계획", status: "completed" });
		await resumed.close();
	});

	test("narrates meaningful actions asynchronously while excluding Read commands", async () => {
		const native = new FakeNativeHarness();
		const narrator = new FakeActivityNarrator();
		const workbench = new ProjectWorkbench(native, new MemoryJournal(), {
			projectId: "sample-project",
			cwd: "/workspace/sample",
			narrator,
		});
		await ready(workbench);
		await workbench.dispatch({ type: "chat.send", text: "의미 Step과 Live T-notes를 구현해줘" });

		native.emit({
			type: "notification",
			method: "item/completed",
			refs: { threadId: "thread-1", turnId: "turn-1", itemId: "read-1" },
			params: { item: { id: "read-1", type: "commandExecution", command: "rg -n 'workFlow' src" } },
		});
		await Bun.sleep(10);
		expect(narrator.calls).toEqual([]);
		expect(workbench.snapshot.workFlow.steps).toEqual([]);

		native.emit({
			type: "notification",
			method: "item/completed",
			refs: { threadId: "thread-1", turnId: "turn-1", itemId: "test-1" },
			params: {
				item: {
					id: "test-1",
					type: "commandExecution",
					command: "bun test test/work-flow.test.ts",
					exitCode: 0,
				},
			},
		});
		await Bun.sleep(20);

		expect(narrator.calls).toHaveLength(0);
		expect(workbench.snapshot.workFlow.steps).toEqual([]);
		await workbench.close();
	});

	test("narrates a selected plan with sanitized goal and bounded action evidence", async () => {
		const native = new FakeNativeHarness();
		const narrator = new FakeActivityNarrator();
		const workbench = new ProjectWorkbench(native, new MemoryJournal(), {
			projectId: "sample-project",
			cwd: "/workspace/sample",
			narrator,
		});
		await ready(workbench);
		await workbench.dispatch({ type: "chat.send", text: "검증 /private/selected-goal" });
		native.emit({
			type: "notification",
			method: "turn/plan/updated",
			refs: { threadId: "thread-1", turnId: "turn-1" },
			params: { plan: [{ step: "변경 검증", status: "inProgress" }] },
		});
		native.emit({
			type: "notification",
			method: "item/completed",
			refs: { threadId: "thread-1", turnId: "turn-1", itemId: "write-1" },
			params: { item: { id: "write-1", type: "commandExecution", command: "apply_patch /private/action-path" } },
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
			text: "방향을 이렇게 바꿔줘",
		}]);
		expect(workbench.snapshot.chatQueue).toEqual([]);
		expect(workbench.snapshot.chat.map(message => message.content)).toEqual(["첫 요청", "방향을 이렇게 바꿔줘"]);
		await workbench.close();
	});

	test("queues rapid chat submissions when the executor does not support steering", async () => {
		const native = new FakeNativeHarness();
		const journal = new MemoryJournal();
		const workbench = new ProjectWorkbench(native, journal, { projectId: "sample-project", cwd: "/workspace/sample" });
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
		expect(journal.records.findIndex(activity => activity.payload.text === "두 번째 요청"))
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
		const native = new FakeNativeHarness();
		const journal = new ToolObservationGateJournal();
		const workbench = new ProjectWorkbench(native, journal, { projectId: "sample-project", cwd: "/workspace/sample" });
		await ready(workbench);
		await workbench.dispatch({ type: "chat.send", text: "장기 실행" });
		await workbench.dispatch({ type: "chat.send", text: "보존할 후속 요청" });
		native.emit({
			type: "notification",
			method: "item/started",
			refs: { threadId: "thread-1", turnId: "turn-1", itemId: "tool-1" },
			params: { item: { id: "tool-1", type: "commandExecution" } },
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
		const native = new FakeNativeHarness();
		const journal = new MemoryJournal();
		const workbench = new ProjectWorkbench(native, journal, { projectId: "sample-project", cwd: "/workspace/sample" });
		await ready(workbench);
		await workbench.dispatch({ type: "chat.send", text: "출력 관찰" });
		native.emit({
			type: "notification",
			method: "item/reasoning/delta",
			refs: { threadId: "thread-1", turnId: "turn-1", itemId: "reasoning-1" },
			params: { delta: "비공개 추론" },
		});
		native.emit({
			type: "notification",
			method: "item/agentMessage/delta",
			refs: { threadId: "thread-1", turnId: "turn-1", itemId: "message-1" },
			params: { delta: "첫 공개 출력" },
		});
		native.emit({
			type: "notification",
			method: "item/agentMessage/delta",
			refs: { threadId: "thread-1", turnId: "turn-1", itemId: "message-1" },
			params: { delta: "두 번째 공개 출력" },
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
		const native = new FakeNativeHarness();
		const journal = new UnboundJournal();
		const workbench = new ProjectWorkbench(native, journal, { projectId: "sample-project", cwd: "/workspace/sample" });
		await ready(workbench);
		native.emit({
			type: "notification",
			method: "turn/started",
			refs: { threadId: "foreign-thread", turnId: "turn-9" },
			params: {},
		});
		await workbench.dispatch({ type: "activity.select", activityId: null });
		expect(journal.appends).toBe(0);
		expect(workbench.snapshot.error).toBeNull();
		expect(workbench.snapshot.phase).not.toBe("error");
		await workbench.close();
	});

	test("creates one plain-language question summary after turn completion without blocking queued chat", async () => {
		const native = new FakeNativeHarness();
		const journal = new MemoryJournal();
		const createCalls: Parameters<WorkbenchTNoteSource["create"]>[0][] = [];
		let releaseSummary!: () => void;
		const summaryGate = new Promise<void>((resolve) => { releaseSummary = resolve; });
		const tnotes: WorkbenchTNoteSource = {
			readAll: async () => [],
			create: async (input) => {
				createCalls.push(input);
				await summaryGate;
				return {
					schemaVersion: 1,
					id: "automatic-session-summary-1",
					sequence: 1,
					createdAt: "2026-09-01T00:00:01.000Z",
					packet: {
						schemaVersion: 1,
						projectId: input.projectId,
						range: input.range,
						createdAt: "2026-09-01T00:00:01.000Z",
						activities: input.activities.map((activity) => ({ ...activity, nativeRefs: activity.nativeRefs ?? [] })),
						digest: "c".repeat(64),
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
				type: "notification",
				method: "item/completed",
				refs: { threadId: "thread-1", turnId: "turn-1", itemId },
				params: { item: { type: "commandExecution", command, exitCode: 0 } },
			});
		}
		native.emit({
			type: "notification",
			method: "item/completed",
			refs: { threadId: "thread-1", turnId: "turn-1", itemId: "assistant-1" },
			params: { item: { type: "agentMessage", text: "구현과 검증을 마쳤습니다." } },
		});
		await Bun.sleep(10);
		expect(createCalls).toEqual([]);

		native.emit({
			type: "notification",
			method: "turn/completed",
			refs: { threadId: "thread-1", turnId: "turn-1" },
			params: {},
		});
		await Bun.sleep(10);

		expect(createCalls).toHaveLength(1);
		expect(createCalls[0]?.range).toEqual({ startSequence: 4, endSequence: 12 });
		expect(createCalls[0]?.instruction).toContain("질문: 이 세션의 구현과 검증을 진행해줘");
		expect(createCalls[0]?.instruction).toContain("왜:");
		expect(createCalls[0]?.instruction).toContain("결과:");
		expect(createCalls[0]?.instruction).toContain("처음 보는 사람");
		expect(native.startTurnCalls).toBe(2);
		expect(workbench.snapshot.chatQueue).toEqual([]);
		expect(workbench.snapshot.tnotes).toEqual([]);

		releaseSummary();
		await Bun.sleep(10);
		expect(workbench.snapshot.tnotes[0]).toMatchObject({
			id: "automatic-session-summary-1",
			title: "이 세션의 구현과 검증을 진행해줘",
			summary: "질문: 이 세션의 구현과 검증을 진행해줘\n왜: 구현 위치를 찾고 실제 동작을 검증해야 했습니다.\n결과: 구현과 테스트가 끝났습니다.",
		});
		await workbench.close();
	});

	test("keeps one immutable T-note per completed question instead of replacing a cumulative summary", async () => {
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
						schemaVersion: 1,
						projectId: input.projectId,
						range: input.range,
						createdAt: `2026-09-01T00:00:0${sequence}.000Z`,
						activities: input.activities.map((activity) => ({ ...activity, nativeRefs: undefined })),
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
			type: "notification",
			method: "item/completed",
			refs: { threadId: "thread-1", turnId: "turn-1", itemId: "assistant-1" },
			params: { item: { type: "agentMessage", text: "첫 답을 냈습니다." } },
		});
		native.emit({ type: "notification", method: "turn/completed", refs: { threadId: "thread-1", turnId: "turn-1" }, params: {} });
		await Bun.sleep(10);

		await workbench.dispatch({ type: "chat.send", text: "두 번째 질문" });
		native.emit({
			type: "notification",
			method: "item/completed",
			refs: { threadId: "thread-1", turnId: "turn-2", itemId: "assistant-2" },
			params: { item: { type: "agentMessage", text: "두 번째 답을 냈습니다." } },
		});
		native.emit({ type: "notification", method: "turn/completed", refs: { threadId: "thread-1", turnId: "turn-2" }, params: {} });
		await Bun.sleep(10);

		expect(createCalls).toHaveLength(2);
		expect(createCalls[0]?.instruction).toContain("질문: 첫 질문");
		expect(createCalls[1]?.instruction).toContain("질문: 두 번째 질문");
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
			type: "notification",
			method: "item/completed",
			refs: { threadId: "thread-1", turnId: "turn-1", itemId: "assistant-goal" },
			params: { item: { type: "agentMessage", text: "SESSION_GOAL: 프로젝트별 작업 TUI를 완성하고 실제 사용으로 검증한다." } },
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
				type: "notification",
				method: "item/completed",
				refs: { threadId: "thread-1", turnId: "turn-1", itemId: "assistant-goal" },
				params: { item: { type: "agentMessage", text: marker } },
			});
			await Bun.sleep(2);
			expect(workbench.snapshot.sessionGoal).toBeNull();
			await workbench.close();
		}
	});

	test("rejects generated T-notes without exactly one canonical non-empty question, why, and result", async () => {
		const appends: unknown[] = [];
		const generator: DetachedTextGenerator = {
			async generate() {
				return {
					text: "질문: 질문\n왜: 이유\n결과: 결과\n추가: 금지",
					provenance: { provider: "test", model: "test", version: "test" },
					isolation: { appliedPolicy: { cwd: "", noTools: true, network: false, readOnly: true, ephemeral: true }, projectRootVisible: false, toolCalls: 0, networkCalls: 0, filesystemWrites: 0 },
				};
			},
		};
		const service = new TNoteService(generator, {
			async append(input) { appends.push(input); throw new Error("must not append"); },
			async readAll() { return []; },
		});
		await expect(service.create({
			projectId: "project-1",
			range: { startSequence: 1, endSequence: 1 },
			activities: [{ id: "a", projectId: "project-1", sequence: 1, occurredAt: "2026-09-01T00:00:00.000Z", kind: "message", title: "message", body: "body" }],
			instruction: "요약",
			expectedQuestion: "질문",
		})).rejects.toThrow("malformed");
		expect(appends).toEqual([]);
	});

	test("does not append question-mismatched or prohibited T-note fields", async () => {
		for (const text of [
			"질문: 다른 질문\n왜: 이유를 확인했습니다.\n결과: 결과를 저장했습니다.",
			"질문: 질문\n왜: 이유를 확인했습니다.\n결과: 후속 작업을 처리할 예정입니다.",
			"질문: 질문\n왜: 이유를 확인했습니다.\n결과: 이후 배포합니다.",
			"질문: 질문\n왜: src/app.ts와 package.json을 확인했습니다.\n결과: 결과를 저장했습니다.",
			"질문: 질문\n왜: 이유를 확인했습니다.\n결과: README.md와 package.json을 수정했습니다.",
			"질문: 질문\n왜: stderr FAIL expected received\n결과: 결과를 저장했습니다.",
			"질문: 질문\n왜: AssertionError: expected 2 to equal 1\n결과: 결과를 저장했습니다.",
			"질문: 질문\n왜: 숨은 사고를 그대로 기록합니다.\n결과: 결과를 저장했습니다.",
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
					text: `질문: ${question}\n왜: 문제의 원인과 영향을 이해하려고 확인했습니다.\n결과: 오류 원인을 설명하고 해결 방법을 정리했습니다.`,
					provenance: { provider: "test", model: "test", version: "test" },
					isolation: { appliedPolicy: { cwd: "", noTools: true, network: false, readOnly: true, ephemeral: true }, projectRootVisible: false, toolCalls: 0, networkCalls: 0, filesystemWrites: 0 },
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
					text: "질문: 질문\n왜: 완료 상태를 확인했습니다.\n결과: 후속 작업이나 추후 조치는 필요하지 않습니다.",
					provenance: { provider: "test", model: "test", version: "test" },
					isolation: { appliedPolicy: { cwd: "", noTools: true, network: false, readOnly: true, ephemeral: true }, projectRootVisible: false, toolCalls: 0, networkCalls: 0, filesystemWrites: 0 },
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
		const directory = await mkdtemp(join(tmpdir(), "workbench-tnote-"));
		const rawQuestion = "Git으로 /Users/example/private를 확인하고 alice@example.com 오류를 봐줘";
		const expectedQuestion = sanitizeTNoteText(rawQuestion, 800);
		const service = new TNoteService({
			async generate() {
				return {
					text: `질문: ${expectedQuestion}\n왜: 문제의 영향을 이해하려고 확인했습니다.\n결과: 오류 원인을 설명했습니다.`,
					provenance: { provider: "test", model: "test", version: "test" },
					isolation: { appliedPolicy: { cwd: "", noTools: true, network: false, readOnly: true, ephemeral: true }, projectRootVisible: false, toolCalls: 0, networkCalls: 0, filesystemWrites: 0 },
				};
			},
		}, new FileTNoteStore(directory));
		try {
			const note = await service.create({
				projectId: "project-1", range: { startSequence: 1, endSequence: 1 },
				activities: [{ id: "a", projectId: "project-1", sequence: 1, occurredAt: "2026-09-01T00:00:00.000Z", kind: "message", title: "message", body: "body" }],
				instruction: "요약", expectedQuestion,
			});
			expect(note.text.split("\n")[0]).toBe(`질문: ${expectedQuestion}`);
			expect((await service.readAll("project-1"))[0]?.text).toBe(note.text);
		} finally {
			await rm(directory, { recursive: true, force: true });
		}
	});

	test("validates a range capture through TNoteService with its canonical expected question", async () => {
		const journal = new MemoryJournal();
		await journal.append({
			projectId: "sample-project",
			kind: "message",
			phase: "completed",
			provider: "test",
			nativeRefs: { threadId: "thread-1" },
			sourceDigest: `sha256:${"a".repeat(64)}`,
			payload: { direction: "outbound", text: "범위 질문" },
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
					text: "질문: 범위 질문\n왜: 선택 범위를 확인했습니다.\n결과: 범위 요약을 저장했습니다.",
					provenance: { provider: "test", model: "test", version: "test" },
					isolation: { appliedPolicy: { cwd: "", noTools: true, network: false, readOnly: true, ephemeral: true }, projectRootVisible: false, toolCalls: 0, networkCalls: 0, filesystemWrites: 0 },
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
			projectId: "sample-project",
			cwd: "/workspace/sample",
			tnotes: service,
		});
		await ready(workbench);
		await expect(workbench.dispatch({ type: "tnote.capture-range", startSequence: 1, endSequence: 3 }))
			.resolves.toMatchObject({ state: "accepted" });
		expect(stored).toHaveLength(1);
		await workbench.close();
	});

	test("rejects pre-completion and cross-turn manual T-note ranges", async () => {
		const native = new FakeNativeHarness();
		const creates: unknown[] = [];
		const tnotes: WorkbenchTNoteSource = {
			async readAll() { return []; },
			async create(input) {
				creates.push(input);
				return {
					schemaVersion: 1, id: `note-${creates.length}`, sequence: creates.length,
					createdAt: "2026-09-01T00:00:00.000Z",
					packet: { schemaVersion: 1, projectId: input.projectId, range: input.range, createdAt: "2026-09-01T00:00:00.000Z", activities: input.activities, digest: "d".repeat(64) },
					text: `질문: ${input.expectedQuestion}\n왜: 완료 범위를 확인했습니다.\n결과: 요약을 저장했습니다.`,
					provenance: { provider: "test", model: "test", version: "test" },
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

	test("reconciles a failed automatic T-note after restart and appends it only after generation succeeds", async () => {
		const journal = new MemoryJournal();
		const persisted: import("../src/core/domain/work/t-notes").TNoteDraft[] = [];
		let attempts = 0;
		const tnotes: WorkbenchTNoteSource = {
			readAll: async () => persisted,
			create: async (input) => {
				attempts += 1;
				if (attempts === 1) throw new Error("temporary generator failure");
				const draft: import("../src/core/domain/work/t-notes").TNoteDraft = {
					schemaVersion: 1,
					id: "reconciled-note",
					sequence: 1,
					createdAt: "2026-09-01T00:00:01.000Z",
					packet: {
						schemaVersion: 1,
						projectId: input.projectId,
						range: input.range,
						createdAt: "2026-09-01T00:00:01.000Z",
						activities: input.activities.map(({ nativeRefs: _, ...activity }) => activity),
						digest: "e".repeat(64),
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
			projectId: "sample-project",
			cwd: "/workspace/sample",
			resumeThreadId: "thread-1",
			tnotes,
		});
		await ready(resumed);
		await Bun.sleep(10);
		expect(attempts).toBe(2);
		expect(resumed.snapshot.tnotes.map((note) => note.id)).toEqual(["reconciled-note"]);
		expect(persisted).toHaveLength(1);
		await resumed.close();
	});

	test("reconciles one sparse target-thread T-note after interleaved foreign journal activity", async () => {
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
					schemaVersion: 1,
					id: "sparse-target-note",
					sequence: 1,
					createdAt: "2026-09-01T00:00:01.000Z",
					packet: {
						schemaVersion: 1,
						projectId: input.projectId,
						range: input.range,
						createdAt: "2026-09-01T00:00:01.000Z",
						activities: input.activities.map(({ nativeRefs: _, ...activity }) => activity),
						digest: "f".repeat(64),
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
					text: "질문: 대상 질문\n왜: 대상 turn만 다시 확인했습니다.\n결과: 재시작 뒤 요약을 저장했습니다.",
					provenance: { provider: "test", model: "test", version: "test" },
					isolation: { appliedPolicy: { cwd: "", noTools: true, network: false, readOnly: true, ephemeral: true }, projectRootVisible: false, toolCalls: 0, networkCalls: 0, filesystemWrites: 0 },
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
				role: "user",
				content: "첫 응답을 확인합니다",
				status: "streaming",
			}),
		]);

		releaseThreadStart();
		expect(await submission).toMatchObject({ state: "accepted" });
		await workbench.close();
	});

	test("keeps active context separate from cumulative model usage and ignores a late auxiliary turn", async () => {
		const native = new FakeNativeHarness();
		const workbench = new ProjectWorkbench(native, new MemoryJournal(), {
			projectId: "sample-project",
			cwd: "/workspace/sample",
			model: "gpt-5.6-sol",
			effort: "low",
		});
		await ready(workbench);
		await workbench.dispatch({ type: "chat.send", text: "상태를 확인해줘" });

		native.emit({
			type: "notification",
			method: "thread/tokenUsage/updated",
			refs: { threadId: "thread-1", turnId: "turn-1" },
			params: {
				tokenUsage: {
					last: { totalTokens: 25_840 },
					total: { totalTokens: 25_840 },
					modelContextWindow: 258_400,
				},
			},
		});
		await Bun.sleep(10);

		expect(native.startTurnInputs[0]).toMatchObject({ model: "gpt-5.6-sol", effort: "low" });
		expect(workbench.snapshot).toMatchObject({
			model: "gpt-5.6-sol",
			effort: "low",
			contextUsage: { usedTokens: 25_840, contextWindow: 258_400, percent: 5.6 },
			sessionUsage: {
				totalTokens: 25_840,
				unattributedTokens: 0,
				models: [{ model: "gpt-5.6-sol", effort: "low", interactiveRootTurns: 1, interactiveTokens: 25_840, detachedInvocations: 0, detachedTokens: 0, totalTokens: 25_840 }],
			},
		});

		const rootUsage = workbench.snapshot.sessionUsage;
		native.emit({
			type: "notification",
			method: "thread/tokenUsage/updated",
			refs: { threadId: "child-thread", turnId: "child-turn" },
			params: {
				tokenUsage: {
					last: { totalTokens: 99_999 },
					total: { totalTokens: 99_999 },
					modelContextWindow: 258_400,
				},
			},
		});
		await Bun.sleep(10);

		expect(workbench.snapshot.contextUsage).toEqual({
			usedTokens: 25_840,
			contextWindow: 258_400,
			percent: 5.6,
		});
		expect(workbench.snapshot.sessionUsage).toEqual(rootUsage);

		native.emit({
			type: "notification",
			method: "thread/tokenUsage/updated",
			refs: { threadId: "thread-1", turnId: "turn-aux" },
			params: {
				tokenUsage: {
					last: { totalTokens: 2_000 },
					total: { totalTokens: 38_760 },
					modelContextWindow: 258_400,
				},
			},
		});
		await Bun.sleep(10);

		expect(workbench.snapshot.contextUsage).toEqual({
			usedTokens: 25_840,
			contextWindow: 258_400,
			percent: 5.6,
		});
		expect(workbench.snapshot.sessionUsage).toEqual({
			totalTokens: 38_760,
			observedTotalTokens: 38_760,
			unattributedTokens: 12_920,
			observationCoverage: { interactive: true, detached: false },
			models: [{ model: "gpt-5.6-sol", effort: "low", interactiveRootTurns: 1, interactiveTokens: 25_840, detachedInvocations: 0, detachedTokens: 0, totalTokens: 25_840 }],
		});
		await workbench.close();
	});

	test("merges detached Luna and Claude usage into the live WWW session totals", async () => {
		const native = new FakeNativeHarness();
		const auxiliaryUsage = new SessionModelUsageAccumulator();
		const workbench = new ProjectWorkbench(native, new MemoryJournal(), {
			projectId: "sample-project",
			cwd: "/workspace/sample",
			model: "gpt-5.6-sol",
			effort: "ultra",
			auxiliaryUsage,
		});
		await ready(workbench);
		const revision = workbench.snapshot.revision;

		auxiliaryUsage.observe({ model: "gpt-5.6-luna", effort: null, totalTokens: 1_200 });
		auxiliaryUsage.observe({ model: "claude-opus-5", effort: null, totalTokens: 3_400 });

		expect(workbench.snapshot.revision).toBeGreaterThan(revision);
		expect(workbench.snapshot.sessionUsage).toEqual({
			totalTokens: 4_600,
			observedTotalTokens: 4_600,
			unattributedTokens: 0,
			observationCoverage: { interactive: false, detached: true },
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
			projectId: "sample-project",
			cwd: "/workspace/sample",
			model: "gpt-5.6-sol",
			effort: "low",
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
				settings: { model: "gpt-5.6-sol", reasoning_effort: "low", developer_instructions: null },
			},
		});
		await workbench.close();
	});

	test("persists an idle Codex selection and uses it for the next native turn", async () => {
		const native = new FakeNativeHarness();
		const persisted: Array<{ model: string; effort: string }> = [];
		const workbench = new ProjectWorkbench(native, new MemoryJournal(), {
			projectId: "sample-project",
			cwd: "/workspace/sample",
			model: "gpt-5.6-sol",
			effort: "ultra",
			persistModelSelection: async selection => { persisted.push(selection); },
		});
		await ready(workbench);
		await workbench.dispatch({ type: "chat.send", text: "기존 모델 요청" });
		native.emit({
			type: "notification",
			method: "turn/completed",
			refs: { threadId: "thread-1", turnId: "turn-1" },
			params: {},
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
			projectId: "sample-project",
			cwd: "/workspace/sample",
			model: "gpt-5.6-sol",
			effort: "low",
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

	test("keeps the selected flow while exposing a pending turn goal", async () => {
		const native = new FakeNativeHarness();
		const workbench = new ProjectWorkbench(native, new MemoryJournal(), {
			projectId: "sample-project",
			cwd: "/workspace/sample",
		});
		await ready(workbench);
		await workbench.dispatch({ type: "chat.send", text: "이전 요청" });
		native.emit({
			type: "notification",
			method: "turn/plan/updated",
			refs: { threadId: "thread-1", turnId: "turn-1" },
			params: { plan: [{ step: "이전 단계", status: "inProgress" }] },
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
			type: "notification",
			method: "item/started",
			refs: { threadId: "thread-1", turnId: "turn-1", itemId: "early-tool" },
			params: { item: { type: "commandExecution", command: "pwd" } },
		});
		await Bun.sleep(10);
		journal.release();
		expect(await firstSend).toMatchObject({ state: "accepted" });
		expect(workbench.snapshot.activeTurnId).toBe("turn-1");

		await workbench.dispatch({ type: "chat.send", text: "두 번째 요청" });
		native.emit({
			type: "notification",
			method: "turn/completed",
			refs: { threadId: "thread-1", turnId: "turn-1" },
			params: {},
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
			type: "notification",
			method: "turn/started",
			refs: { threadId: "child-thread", turnId: "child-turn" },
			params: {},
		});
		native.emit({
			type: "notification",
			method: "item/started",
			refs: { threadId: "child-thread", turnId: "child-turn", itemId: "child-message" },
			params: { item: { type: "agentMessage", id: "child-message", text: "자식 작업 중" } },
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

	// @linear WOO-690
	test("isolates root chat identity from child threads and repeated item ids across turns", async () => {
		const native = new FakeNativeHarness();
		const workbench = new ProjectWorkbench(native, new MemoryJournal(), {
			projectId: "sample-project",
			cwd: "/workspace/sample",
		});
		await ready(workbench);
		await workbench.dispatch({ type: "chat.send", text: "첫 요청" });

		native.emit({
			type: "notification",
			method: "item/completed",
			refs: { threadId: "thread-1", turnId: "turn-1", itemId: "same-item" },
			params: { item: { type: "agentMessage", text: "첫 root 답변" } },
		});
		native.emit({
			type: "notification",
			method: "item/completed",
			refs: { threadId: "child-thread", turnId: "child-turn", itemId: "same-item" },
			params: { item: { type: "agentMessage", text: "child 답변" } },
		});
		native.emit({
			type: "notification",
			method: "turn/completed",
			refs: { threadId: "thread-1", turnId: "turn-1" },
			params: {},
		});
		await Bun.sleep(10);
		await workbench.dispatch({ type: "chat.send", text: "두 번째 요청" });
		native.emit({
			type: "notification",
			method: "item/completed",
			refs: { threadId: "thread-1", turnId: "turn-2", itemId: "same-item" },
			params: { item: { type: "agentMessage", text: "두 번째 root 답변" } },
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
			type: "notification",
			method: "item/agentMessage/delta",
			refs: { threadId: "thread-1", turnId: "turn-1", itemId: "same-item" },
			params: { delta: "현재 turn" },
		});
		native.emit({
			type: "notification",
			method: "item/agentMessage/delta",
			refs: { threadId: "child-thread", turnId: "child-turn", itemId: "same-item" },
			params: { delta: "child turn" },
		});
		await Bun.sleep(10);
		expect(workbench.snapshot.draft).toBe("현재 turn");
		native.emit({
			type: "notification",
			method: "item/agentMessage/delta",
			refs: { threadId: "thread-1", turnId: "turn-other", itemId: "same-item" },
			params: { delta: "다른 turn" },
		});
		await Bun.sleep(10);
		expect(workbench.snapshot.draft).toBe("다른 turn");

		native.emit({
			type: "notification",
			method: "item/completed",
			refs: { threadId: "thread-1", turnId: "turn-1", itemId: "same-item" },
			params: { item: { type: "agentMessage", text: "현재 turn 완료" } },
		});
		await Bun.sleep(10);
		expect(workbench.snapshot.draft).toBe("다른 turn");
		await workbench.close();
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
			type: "notification",
			method: "item/agentMessage/delta",
			refs: { turnId: "turn-1", itemId: "sparse-message" },
			params: { delta: "작성 중" },
		});
		native.emit({
			type: "notification",
			method: "item/completed",
			refs: { threadId: "thread-1", itemId: "sparse-message" },
			params: { item: { type: "agentMessage", text: "완료 답변" } },
		});
		native.emit({
			type: "notification",
			method: "item/completed",
			refs: { turnId: "turn-1", itemId: "threadless-final" },
			params: { item: { type: "agentMessage", text: "thread 없는 완료 답변" } },
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
			type: "notification",
			method: "item/agentMessage/delta",
			refs: { threadId: "thread-1", turnId: "turn-1", itemId: "root-message" },
			params: { delta: "root draft" },
		});
		native.emit({
			type: "notification",
			method: "item/completed",
			refs: { itemId: "root-message" },
			params: { item: { type: "agentMessage", text: "소유권 없는 완료" } },
		});
		await Bun.sleep(10);

		expect(workbench.snapshot.draft).toBe("root draft");
		expect(workbench.snapshot.chat.some((message) => message.content === "소유권 없는 완료")).toBe(false);
		await workbench.close();
	});

	// @linear WOO-688
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
			type: "notification",
			method: "item/completed",
			refs: { threadId: "thread-1", turnId: "turn-1", itemId: "native-user-message" },
			params: { item: { type: "userMessage", content: [{ type: "text", text: "실제 Native 질문" }] } },
		});
		native.emit({
			type: "notification",
			method: "item/completed",
			refs: { threadId: "thread-1", turnId: "turn-1", itemId: "native-agent-message" },
			params: { item: { type: "agentMessage", text: "실제 Native 답변" } },
		});
		native.emit({
			type: "notification",
			method: "turn/completed",
			refs: { threadId: "thread-1", turnId: "turn-1" },
			params: { turn: { id: "turn-1", status: "completed", error: null } },
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
		const native = new FakeNativeHarness();
		const journal = new MemoryJournal();
		let tnoteCreates = 0;
		const workbench = new ProjectWorkbench(native, journal, {
			projectId: "sample-project",
			cwd: "/workspace/sample",
			tnotes: {
				readAll: async () => [],
				create: async () => {
					tnoteCreates += 1;
					throw new Error("중단 turn은 자동 T-note를 만들면 안 됩니다.");
				},
			},
		});
		await ready(workbench);
		await workbench.dispatch({ type: "chat.send", text: "중단할 요청" });
		native.emit({
			type: "notification",
			method: "item/agentMessage/delta",
			refs: { threadId: "thread-1", turnId: "turn-1", itemId: "interrupted-message" },
			params: { delta: "중단 전에 받은 부분" },
		});
		native.emit({
			type: "notification",
			method: "turn/completed",
			refs: { threadId: "thread-1", turnId: "turn-1" },
			params: { turn: { id: "turn-1", status: "interrupted", error: null } },
		});
		await Bun.sleep(10);

		expect(workbench.snapshot.chat.find((message) => message.role === "assistant")).toMatchObject({
			content: "중단 전에 받은 부분",
			status: "cancelled",
			partial: true,
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
			type: "notification",
			method: "item/agentMessage/delta",
			refs: { threadId: "thread-1", turnId: "turn-1", itemId: "whitespace-message" },
			params: { delta: " \n\t" },
		});
		native.emit({
			type: "notification",
			method: "turn/completed",
			refs: { threadId: "thread-1", turnId: "turn-1" },
			params: { turn: { id: "turn-1", status: "interrupted", error: null } },
		});
		await Bun.sleep(10);

		expect(workbench.snapshot.chat.find((message) => message.role === "assistant")).toMatchObject({
			content: "답변 본문을 받기 전에 작업이 중단되었습니다.",
			status: "cancelled",
			partial: false,
		});
		expect(journal.records.find((activity) => activity.payload.finalObservation === "missing")?.payload)
			.toMatchObject({ presentation: "terminal-status-notice", partial: false });
		await workbench.close();
	});

	test.each([
		["failed", "failed"],
		["cancelled", "cancelled"],
	] as const)("projects nested %s turn/completed status and skips the success checkpoint", async (nativeStatus, phase) => {
		const native = new FakeNativeHarness();
		const journal = new MemoryJournal();
		let tnoteCreates = 0;
		const workbench = new ProjectWorkbench(native, journal, {
			projectId: "sample-project",
			cwd: "/workspace/sample",
			tnotes: {
				readAll: async () => [],
				create: async () => {
					tnoteCreates += 1;
					throw new Error("비성공 turn은 자동 T-note를 만들면 안 됩니다.");
				},
			},
		});
		await ready(workbench);
		await workbench.dispatch({ type: "chat.send", text: `${nativeStatus} 요청` });
		native.emit({
			type: "notification",
			method: "item/agentMessage/delta",
			refs: { threadId: "thread-1", turnId: "turn-1", itemId: `${nativeStatus}-message` },
			params: { delta: "종료 전 공개 부분" },
		});
		native.emit({
			type: "notification",
			method: "turn/completed",
			refs: { threadId: "thread-1", turnId: "turn-1" },
			params: { turn: { id: "turn-1", status: nativeStatus, error: null } },
		});
		await Bun.sleep(10);

		expect(workbench.snapshot.chat.find((message) => message.role === "assistant")).toMatchObject({
			content: "종료 전 공개 부분",
			status: phase,
			partial: true,
		});
		expect(journal.records.find((activity) => activity.payload.method === "turn/completed")).toMatchObject({ phase });
		expect(tnoteCreates).toBe(0);
		await workbench.close();
	});

	test("uses nested completed turn status as a success T-note checkpoint", async () => {
		const native = new FakeNativeHarness();
		const journal = new MemoryJournal();
		let tnoteCreates = 0;
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
			type: "notification",
			method: "item/completed",
			refs: { threadId: "thread-1", turnId: "turn-1", itemId: "completed-message" },
			params: { item: { type: "agentMessage", text: "정상 완료 답변" } },
		});
		native.emit({
			type: "notification",
			method: "turn/completed",
			refs: { threadId: "thread-1", turnId: "turn-1" },
			params: { turn: { id: "turn-1", status: "completed", error: null } },
		});
		await Bun.sleep(10);

		expect(journal.records.find((activity) => activity.payload.method === "turn/completed"))
			.toMatchObject({ phase: "completed" });
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
			type: "notification",
			method: "item/agentMessage/delta",
			refs: { threadId: "thread-1", turnId: "turn-1", itemId: "partial-message" },
			params: { delta: "받은 부분 답변" },
		});
		await Bun.sleep(10);
		expect(workbench.snapshot.draft).toBe("받은 부분 답변");

		native.emit({
			type: "notification",
			method: "turn/completed",
			refs: { threadId: "thread-1", turnId: "turn-1" },
			params: {},
		});
		await Bun.sleep(10);

		const assistant = workbench.snapshot.chat.filter((message) => message.role === "assistant");
		expect(assistant).toHaveLength(1);
		expect(assistant[0]).toMatchObject({ content: "받은 부분 답변", status: "incomplete", partial: true });
		expect(workbench.snapshot.draft).toBe("");
		const partialIndex = journal.records.findIndex((activity) => activity.payload.finalObservation === "missing");
		const terminalIndex = journal.records.findIndex((activity) => activity.payload.method === "turn/completed");
		expect(partialIndex).toBeGreaterThanOrEqual(0);
		expect(partialIndex).toBeLessThan(terminalIndex);
		expect(journal.records[partialIndex]).toMatchObject({
			phase: "completed",
			nativeRefs: { threadId: "thread-1", turnId: "turn-1", itemId: "partial-message" },
			payload: {
				partial: true,
				finalObservation: "missing",
				observationScope: "bounded-local-delta",
			},
		});

		native.emit({
			type: "notification",
			method: "turn/completed",
			refs: { threadId: "thread-1", turnId: "turn-1" },
			params: {},
		});
		native.emit({
			type: "notification",
			method: "item/agentMessage/delta",
			refs: { threadId: "thread-1", turnId: "turn-1", itemId: "partial-message" },
			params: { delta: "terminal 뒤 늦은 조각" },
		});
		await Bun.sleep(10);
		expect(workbench.snapshot.chat.filter((message) => message.role === "assistant")).toHaveLength(1);
		expect(workbench.snapshot.chat.find((message) => message.role === "assistant")?.content).toBe("받은 부분 답변");
		expect(workbench.snapshot.draft).toBe("");
		expect(journal.records.filter((activity) => activity.payload.finalObservation === "missing")).toHaveLength(1);
		await workbench.close();

		const resumed = new ProjectWorkbench(new FakeNativeHarness(), journal, {
			projectId: "sample-project",
			cwd: "/workspace/sample",
			resumeThreadId: "thread-1",
		});
		await ready(resumed);
		expect(resumed.snapshot.chat.find((message) => message.role === "assistant")).toMatchObject({
			content: "받은 부분 답변",
			status: "incomplete",
			partial: true,
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
			type: "notification",
			method: "item/agentMessage/delta",
			refs: { threadId: "thread-1", turnId: "turn-1", itemId: "partial-message" },
			params: { delta: "종료 전에 받은 답변" },
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
			type: "notification",
			method: "item/agentMessage/delta",
			refs: { threadId: "thread-1", turnId: "turn-1", itemId: "partial-message" },
			params: { delta: "item 종료 전에 받은 답변" },
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
			type: "notification",
			method: "turn/completed",
			refs: { threadId: "thread-1", turnId: "turn-1" },
			params: {},
		});
		await Bun.sleep(10);

		expect(workbench.snapshot.chat.find((message) => message.role === "assistant")).toMatchObject({
			content: "최종 답변 본문을 받지 못했습니다.",
			status: "incomplete",
			partial: false,
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
			type: "notification",
			method: "item/completed",
			refs: { threadId: "thread-1", turnId: "turn-1", itemId: "same-item" },
			params: { item: { type: "agentMessage", text: "고정된 최종 답변" } },
		});
		native.emit({
			type: "notification",
			method: "item/completed",
			refs: { threadId: "thread-1", turnId: "turn-1", itemId: "same-item" },
			params: { item: { type: "agentMessage", text: "중복이 덮어쓴 답변" } },
		});
		native.emit({
			type: "notification",
			method: "item/agentMessage/delta",
			refs: { threadId: "thread-1", turnId: "turn-1", itemId: "same-item" },
			params: { delta: "늦게 온 조각" },
		});
		await Bun.sleep(10);

		expect(workbench.snapshot.chat.filter((message) => message.role === "assistant").map((message) => message.content))
			.toEqual(["고정된 최종 답변"]);
		expect(workbench.snapshot.draft).toBe("");
		expect(journal.records.filter((activity) => activity.nativeRefs.turnId === "turn-1" && activity.nativeRefs.itemId === "same-item"))
			.toHaveLength(1);

		native.emit({
			type: "notification",
			method: "item/agentMessage/delta",
			refs: { threadId: "thread-1", turnId: "turn-2", itemId: "same-item" },
			params: { delta: "다른 turn의 정상 조각" },
		});
		native.emit({
			type: "notification",
			method: "item/agentMessage/delta",
			refs: { threadId: "child-thread", turnId: "child-turn", itemId: "same-item" },
			params: { delta: "child 조각" },
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
			type: "notification",
			method: "response/completed",
			refs: { threadId: "thread-1", turnId: "turn-1", itemId: "response-message" },
			params: { item: { type: "agentMessage", text: "완전한 답변" } },
		});
		native.emit({
			type: "notification",
			method: "response/completed",
			refs: { threadId: "thread-1", turnId: "turn-1", itemId: "response-message" },
			params: { item: { type: "agentMessage", text: "중복 답변" } },
		});
		native.emit({
			type: "notification",
			method: "item/agentMessage/delta",
			refs: { threadId: "thread-1", turnId: "turn-1", itemId: "response-message" },
			params: { delta: "늦은 조각" },
		});
		native.emit({
			type: "notification",
			method: "turn/completed",
			refs: { threadId: "thread-1", turnId: "turn-1" },
			params: { turn: { id: "turn-1", status: "completed", error: null } },
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
			type: "notification",
			method: "item/completed",
			refs: { threadId: "thread-1", itemId: "unowned-final" },
			params: { item: { type: "agentMessage", text: "turn 없는 완료" } },
		});
		native.emit({
			type: "notification",
			method: "turn/completed",
			refs: { threadId: "thread-1", turnId: "turn-1" },
			params: { turn: { id: "turn-1", status: "completed", error: null } },
		});
		await Bun.sleep(10);

		expect(workbench.snapshot.chat.some((message) => message.content === "turn 없는 완료")).toBe(false);
		expect(workbench.snapshot.chat.filter((message) => message.role === "assistant")).toEqual([
			expect.objectContaining({
				content: "최종 답변 본문을 받지 못했습니다.",
				status: "incomplete",
				partial: false,
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
			type: "notification",
			method: "item/agentMessage/delta",
			refs: { threadId: "thread-1", turnId: "turn-1", itemId: "message-a" },
			params: { delta: "A 초안" },
		});
		native.emit({
			type: "notification",
			method: "item/agentMessage/delta",
			refs: { threadId: "thread-1", turnId: "turn-1", itemId: "message-b" },
			params: { delta: "B 부분 답변" },
		});
		native.emit({
			type: "notification",
			method: "item/completed",
			refs: { threadId: "thread-1", turnId: "turn-1", itemId: "message-a" },
			params: { item: { type: "agentMessage", text: "A 최종 답변" } },
		});
		native.emit({
			type: "notification",
			method: "turn/completed",
			refs: { threadId: "thread-1", turnId: "turn-1" },
			params: {},
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
			type: "notification",
			method: "item/agentMessage/delta",
			refs: { threadId: "thread-1", turnId: "turn-2", itemId: "same-item" },
			params: { delta: "다른 turn의 진행 중 답변" },
		});
		native.emit({
			type: "notification",
			method: "turn/completed",
			refs: { threadId: "thread-1", turnId: "turn-1" },
			params: {},
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
			projectId: "sample-project",
			kind: "message",
			phase: "completed",
			provider: "openai-codex",
			nativeRefs: { threadId: "thread-1", turnId: "turn-resumed", itemId: "terminal-message" },
			sourceDigest: `sha256:${"b".repeat(64)}`,
			payload: { method: "item/completed", role: "assistant", text: "재개 전 최종 답변" },
		});
		native.readValue = { status: { type: "active" }, turns: [{ id: "turn-resumed", status: "inProgress" }] };
		const workbench = new ProjectWorkbench(native, journal, {
			projectId: "sample-project",
			cwd: "/workspace/sample",
			resumeThreadId: "thread-1",
		});
		await ready(workbench);
		const before = journal.records.length;

		native.emit({
			type: "notification",
			method: "item/agentMessage/delta",
			refs: { threadId: "thread-1", turnId: "turn-resumed", itemId: "terminal-message" },
			params: { delta: "재개 뒤 늦은 조각" },
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
			state: "uncertain",
			resolution: "manual-reconcile",
			method: "turn/start",
			requestId: 8,
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
			state: "uncertain",
			resolution: "manual-reconcile",
			method: "turn/start",
			requestId: 9,
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
			state: "uncertain",
			resolution: "manual-reconcile",
			method: "turn/start",
			requestId: 10,
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
			type: "notification",
			method: "item/started",
			refs: { threadId: "thread-1", turnId: "turn-2", itemId: "tool-between-reconcile-and-terminal" },
			params: { item: { type: "commandExecution", command: "pwd" } },
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
			state: "uncertain",
			resolution: "manual-reconcile",
			method: "turn/start",
			requestId: 11,
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
				requestId: 46,
				callbackId: null,
				kind: "command",
				refs: { threadId: "child-thread", turnId: "child-turn", approvalRequestId: 46 },
				availableDecisions: ["accept", "decline"],
				params: {},
			},
		});
		await Bun.sleep(10);

		expect(workbench.snapshot.pendingApproval).toBeNull();
		expect(workbench.snapshot.threadId).toBe("thread-1");
		expect(workbench.snapshot.activeTurnId).toBe("turn-1");
		expect(await workbench.dispatch({ type: "chat.send", text: "루트 턴 뒤 처리할 요청" }))
			.toMatchObject({ state: "queued", position: 1 });
		expect(await workbench.dispatch({
			type: "approval.resolve",
			requestId: 46,
			response: { decision: "accept" },
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
				requestId: 45,
				callbackId: null,
				kind: "command",
				refs: { threadId: "thread-1", turnId: "turn-1", approvalRequestId: 45 },
				availableDecisions: ["accept", "decline"],
				params: {},
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

	test("keeps deltas ephemeral and durably appends completed native observations before publishing", async () => {
		const native = new FakeNativeHarness();
		const journal = new MemoryJournal();
		const workbench = new ProjectWorkbench(native, journal, {
			projectId: "sample-project",
			cwd: "/workspace/sample",
		});
		await ready(workbench);
		const observedJournalSizes: number[] = [];
		const unsubscribe = workbench.subscribe((snapshot) => {
			if (snapshot.activities.length > 0) observedJournalSizes.push(journal.records.length);
		});
		native.emit({
			type: "notification",
			method: "item/agentMessage/delta",
			refs: { threadId: "thread-1", turnId: "turn-1", itemId: "message-1" },
			params: { delta: "진행 중" },
		});
		await Bun.sleep(10);
		expect(journal.records).toHaveLength(0);
		expect(workbench.snapshot.journalSequence).toBe(0);
		expect(workbench.snapshot.draft).toBe("진행 중");
		native.emit({
			type: "notification",
			method: "item/completed",
			refs: { threadId: "thread-1", turnId: "turn-1", itemId: "message-1" },
			params: { item: { type: "agentMessage", text: "진행 완료" } },
		});
		await Bun.sleep(10);
		expect(journal.records).toHaveLength(1);
		expect(observedJournalSizes).toEqual([1]);
		expect(workbench.snapshot.journalSequence).toBe(1);
		expect(workbench.snapshot.chat[0]?.content).toBe("진행 완료");
		expect(workbench.snapshot.draft).toBe("");
		expect(Object.isFrozen(workbench.snapshot)).toBe(true);
		expect(Object.isFrozen(workbench.snapshot.activities)).toBe(true);
		expect(() => (workbench.snapshot.activities as ProjectActivity[]).push(journal.records[0]!)).toThrow();
		unsubscribe();
		await workbench.close();
	});

	test("shares frozen durable projections across deltas after a large activity history", async () => {
		const native = new FakeNativeHarness();
		const journal = new MemoryJournal();
		for (let index = 0; index < 100; index += 1) {
			await journal.append({
				projectId: "sample-project",
				kind: "message",
				phase: "completed",
				provider: "openai-codex",
				nativeRefs: { threadId: "thread-1", itemId: `history-${index}` },
				sourceDigest: `sha256:${String(index).padStart(64, "0")}`,
				payload: {
					role: "assistant",
					text: index === 99 ? `large:${"x".repeat(1024 * 1024)}` : `history-${index}`,
				},
			});
		}
		const workbench = new ProjectWorkbench(native, journal, {
			projectId: "sample-project",
			cwd: "/workspace/sample",
			resumeThreadId: "thread-1",
		});
		await ready(workbench);
		const before = workbench.snapshot;
		expect(before.activityCount).toBe(101);
		expect(before.activities).toHaveLength(101);
		const largeActivity = before.activities.find(activity => String(activity.payload.text).startsWith("large:"));
		const largeChat = before.chat.find(message => message.content.startsWith("large:"));
		expect(largeActivity).toBeDefined();
		expect(largeChat).toBeDefined();

		native.emit({
			type: "notification",
			method: "item/agentMessage/delta",
			refs: { threadId: "thread-1", turnId: "turn-1", itemId: "draft-1" },
			params: { delta: "첫 delta" },
		});
		await Bun.sleep(10);
		const afterFirstDelta = workbench.snapshot;
		native.emit({
			type: "notification",
			method: "item/agentMessage/delta",
			refs: { threadId: "thread-1", turnId: "turn-1", itemId: "draft-1" },
			params: { delta: " + 두 번째 delta" },
		});
		await Bun.sleep(10);
		const afterSecondDelta = workbench.snapshot;

		expect(afterFirstDelta.activities).toBe(before.activities);
		expect(afterSecondDelta.activities).toBe(before.activities);
		expect(afterSecondDelta.activities.find(activity => activity.id === largeActivity?.id)).toBe(largeActivity);
		expect(afterFirstDelta.chat).toBe(before.chat);
		expect(afterSecondDelta.chat).toBe(before.chat);
		expect(afterSecondDelta.journalSequence).toBe(before.journalSequence);
		expect(afterSecondDelta.revision).toBeGreaterThan(before.revision);
		expect(afterFirstDelta.draft).toBe("첫 delta");
		expect(afterSecondDelta.draft).toBe("첫 delta + 두 번째 delta");
		expect(Object.isFrozen(afterSecondDelta)).toBe(true);
		expect(Object.isFrozen(afterSecondDelta.activities)).toBe(true);
		expect(Object.isFrozen(largeActivity)).toBe(true);
		expect(Object.isFrozen(largeActivity?.payload)).toBe(true);
		expect(Object.isFrozen(afterSecondDelta.chat)).toBe(true);
		expect(Object.isFrozen(largeChat)).toBe(true);
		await workbench.close();
	});

	test("bounds live drafts and raw native envelopes while preserving the full safe completed assistant reply", async () => {
		const native = new FakeNativeHarness();
		const journal = new MemoryJournal();
		const workbench = new ProjectWorkbench(native, journal, {
			projectId: "sample-project",
			cwd: "/workspace/sample",
		});
		await ready(workbench);
		for (let index = 0; index < 80; index += 1) {
			native.emit({
				type: "notification",
				method: "item/agentMessage/delta",
				refs: { threadId: "thread-1", turnId: "turn-1", itemId: "large-message" },
				params: { delta: `${String(index).padStart(2, "0")}:${"a".repeat(1020)}` },
			});
			native.emit({
				type: "notification",
				method: "item/reasoning/delta",
				refs: { threadId: "thread-1", turnId: "turn-1", itemId: "large-reasoning" },
				params: { delta: `${String(index).padStart(2, "0")}:${"r".repeat(1020)}` },
			});
		}
		await Bun.sleep(10);

		expect(workbench.snapshot.draft.length).toBeLessThanOrEqual(32 * 1024);
		expect(workbench.snapshot.draft).toMatch(/^… 이전 출력 \d+자 생략\n/);
		expect(workbench.snapshot.draft).toEndWith(`79:${"a".repeat(1020)}`);
		expect(workbench.snapshot.reasoningDraft.length).toBeLessThanOrEqual(20 * 1024);
		expect(workbench.snapshot.reasoningDraft).toMatch(/^… 이전 출력 \d+자 생략\n/);
		expect(workbench.snapshot.reasoningDraft).toEndWith(`79:${"r".repeat(1020)}`);
		expect(journal.records).toHaveLength(0);

		const completedMessage = `complete password=message-secret\n${"m".repeat(40_000)}\nhttps://user:tail-secret@example.com/end`;
		const completedReasoning = `reasoning:${"q".repeat(30_000)}`;
		native.emit({
			type: "notification",
			method: "item/completed",
			refs: { threadId: "thread-1", turnId: "turn-1", itemId: "large-message" },
			params: { item: { type: "agentMessage", text: completedMessage } },
		});
		native.emit({
			type: "notification",
			method: "item/completed",
			refs: { threadId: "thread-1", turnId: "turn-1", itemId: "large-reasoning" },
			params: { item: { type: "reasoning", text: completedReasoning } },
		});
		await Bun.sleep(10);

		const storedMessage = ((journal.records[0]?.payload.params as { item?: { text?: string } })?.item?.text) ?? "";
		const publicMessage = String(journal.records[0]?.payload.text ?? "");
		expect(storedMessage.length).toBeLessThanOrEqual(32 * 1024);
		expect(storedMessage).toStartWith("complete password=[redacted]");
		expect(storedMessage).toContain("…[output truncated]");
		expect(storedMessage).toEndWith("https://[redacted]@example.com/end");
		expect(publicMessage.length).toBeGreaterThan(32 * 1024);
		expect(publicMessage).toStartWith("complete password=[redacted]");
		expect(publicMessage).not.toContain("…[output truncated]");
		expect(publicMessage).toEndWith("https://[redacted]@example.com/end");
		expect(journal.records[0]?.payload.observationTruncated).toBe(true);
		expect(journal.records[0]?.sourceDigest).toMatch(/^sha256:[a-f0-9]{64}$/u);
		expect(JSON.stringify(journal.records[0]?.payload)).not.toContain("message-secret");
		expect(JSON.stringify(journal.records[0]?.payload)).not.toContain("tail-secret");
		expect(journal.records[1]?.payload).toMatchObject({ classification: "reasoning", redacted: true });
		expect(JSON.stringify(journal.records[1]?.payload)).not.toContain(completedReasoning);
		expect(workbench.snapshot.draft).toBe("");
		expect(workbench.snapshot.reasoningDraft).toBe("");
		await workbench.close();
	});

	test("separates public reasoning summaries from raw reasoning content", async () => {
		const native = new FakeNativeHarness();
		const journal = new MemoryJournal();
		const workbench = new ProjectWorkbench(native, journal, {
			projectId: "sample-project",
			cwd: "/workspace/sample",
		});
		await ready(workbench);

		native.emit({
			type: "notification",
			method: "item/reasoning/summaryTextDelta",
			refs: { threadId: "thread-1", turnId: "turn-1", itemId: "reasoning-1" },
			params: { delta: "Planning semantic color token adjustments" },
		});
		native.emit({
			type: "notification",
			method: "item/reasoning/textDelta",
			refs: { threadId: "thread-1", turnId: "turn-1", itemId: "reasoning-1" },
			params: { delta: "raw chain of thought must stay hidden" },
		});
		await Bun.sleep(10);

		expect(workbench.snapshot.reasoningSummaryDraft).toBe("Planning semantic color token adjustments");
		expect(workbench.snapshot.reasoningSummaryDraft).not.toContain("raw chain of thought");

		native.emit({
			type: "notification",
			method: "item/completed",
			refs: { threadId: "thread-1", turnId: "turn-1", itemId: "reasoning-1" },
			params: { item: {
				type: "reasoning",
				summary: ["Planning semantic color token adjustments"],
				content: ["raw chain of thought must stay hidden"],
			} },
		});
		await Bun.sleep(10);

		expect(journal.records.at(-1)?.payload).toMatchObject({
			classification: "reasoning",
			redacted: true,
			publicSummary: "Planning semantic color token adjustments",
		});
		expect(JSON.stringify(journal.records.at(-1)?.payload)).not.toContain("raw chain of thought");
		expect(workbench.snapshot.reasoningSummaryDraft).toBe("");
		await workbench.close();
	});

	test("resumes without native turns and reconciles the opaque thread against local activity", async () => {
		const native = new FakeNativeHarness();
		const journal = new MemoryJournal();
		const workbench = new ProjectWorkbench(native, journal, {
			projectId: "sample-project",
			cwd: "/workspace/sample",
			resumeThreadId: "opaque-native-thread",
		});
		await ready(workbench);
		expect(native.resumeCalls).toBe(1);
		expect(native.readCalls).toBe(1);
		expect(native.resumeInputs).toEqual([{
			threadId: "opaque-native-thread",
			cwd: "/workspace/sample",
			model: undefined,
			effort: undefined,
			approvalPolicy: "on-request",
			sandbox: "workspace-write",
			excludeTurns: true,
		}]);
		expect(native.readInputs).toEqual([{ threadId: "opaque-native-thread", includeTurns: true }]);
		expect(workbench.snapshot.threadId).toBe("opaque-native-thread");
		expect(workbench.snapshot.resumeCoverage).toEqual({
			mode: "partial-local-journal",
			processAttachedAt: expect.any(String),
			priorProviderHistoryHydrated: false,
		});
		expect(workbench.snapshot.journalSequence).toBe(1);
		expect(journal.records[0]?.payload).toMatchObject({
			method: "thread/resume-local-reconciled",
			historyHydrated: false,
		});
		await workbench.close();
	});

	test("fails closed before reading or journaling when native resume returns another thread", async () => {
		const native = new FakeNativeHarness();
		native.resumeThreadId = "unexpected-thread";
		const journal = new MemoryJournal();
		const workbench = new ProjectWorkbench(native, journal, {
			projectId: "sample-project",
			cwd: "/workspace/sample",
			resumeThreadId: "requested-thread",
		});

		await expect(workbench.waitUntilReady()).rejects.toThrow("requested-thread");
		expect(native.readCalls).toBe(0);
		expect(journal.records).toEqual([]);
		await workbench.close();
	});

	test("fails closed before journaling when thread read returns another resumed thread", async () => {
		const native = new FakeNativeHarness();
		native.readThreadId = "unexpected-read-thread";
		const journal = new MemoryJournal();
		const workbench = new ProjectWorkbench(native, journal, {
			projectId: "sample-project",
			cwd: "/workspace/sample",
			resumeThreadId: "requested-thread",
		});

		await expect(workbench.waitUntilReady()).rejects.toThrow("unexpected-read-thread");
		expect(native.readInputs).toEqual([{ threadId: "requested-thread", includeTurns: true }]);
		expect(journal.records).toEqual([]);
		await workbench.close();
	});

	test("uses native idle state instead of reviving an unterminated historical turn on resume", async () => {
		const native = new FakeNativeHarness();
		native.readValue = {
			status: { type: "idle" },
			turns: [{ id: "turn-dead", status: "inProgress" }],
		};
		const journal = new MemoryJournal();
		journal.records.push({
			schemaVersion: 1,
			id: "stale-turn-start",
			projectId: "sample-project",
			sequence: 1,
			recordedAt: "2026-09-01T00:00:00.000Z",
			kind: "progress",
			phase: "started",
			provider: "openai-codex",
			nativeRefs: { threadId: "thread-1", turnId: "turn-dead" },
			sourceDigest: `sha256:${"e".repeat(64)}`,
			payload: { method: "turn/start" },
		});
		const workbench = new ProjectWorkbench(native, journal, {
			projectId: "sample-project",
			cwd: "/workspace/sample",
			resumeThreadId: "thread-1",
		});
		await ready(workbench);

		expect(workbench.snapshot.activeTurnId).toBeNull();
		expect(await workbench.dispatch({ type: "chat.send", text: "재개 후 새 요청" })).toMatchObject({ state: "accepted" });
		expect(native.startTurnInputs.map((input) => input.text)).toEqual(["재개 후 새 요청"]);
		await workbench.close();
	});

	test("queues behind the exact in-progress native turn discovered during resume", async () => {
		const native = new FakeNativeHarness();
		native.readValue = {
			status: { type: "active" },
			turns: [{ id: "turn-live", status: "inProgress" }],
		};
		const workbench = new ProjectWorkbench(native, new MemoryJournal(), {
			projectId: "sample-project",
			cwd: "/workspace/sample",
			resumeThreadId: "thread-1",
		});
		await ready(workbench);

		expect(workbench.snapshot.activeTurnId).toBe("turn-live");
		expect(await workbench.dispatch({ type: "chat.send", text: "재개 대기 요청" })).toMatchObject({ state: "queued", position: 1 });
		native.emit({
			type: "notification",
			method: "item/started",
			refs: { threadId: "thread-1", turnId: "turn-live", itemId: "live-tool" },
			params: { item: { type: "commandExecution", command: "pwd" } },
		});
		await Bun.sleep(10);
		expect(workbench.snapshot.activeTurnId).toBe("turn-live");

		native.emit({ type: "notification", method: "turn/completed", refs: { threadId: "thread-1", turnId: "turn-live" }, params: {} });
		await Bun.sleep(10);
		expect(native.startTurnInputs.map((input) => input.text)).toEqual(["재개 대기 요청"]);
		expect(workbench.snapshot.chatQueue).toEqual([]);
		await workbench.close();
	});

	test("projects command output deltas as ephemeral tool activity rather than assistant text", async () => {
		const native = new FakeNativeHarness();
		const journal = new MemoryJournal();
		const workbench = new ProjectWorkbench(native, journal, {
			projectId: "sample-project",
			cwd: "/workspace/sample",
		});
		await ready(workbench);
		native.emit({
			type: "notification",
			method: "item/commandExecution/outputDelta",
			refs: { threadId: "thread-1", turnId: "turn-1", itemId: "command-1" },
			params: { delta: "checking files\n" },
		});
		await Bun.sleep(10);
		expect(journal.records).toHaveLength(0);
		expect(workbench.snapshot.draft).toBe("");
		expect(workbench.snapshot.liveActivity).toMatchObject({
			method: "item/commandExecution/outputDelta",
			kind: "tool",
			text: "checking files\n",
		});
		await workbench.close();
	});

	test("does not clear live activity for the same item id completed by another turn", async () => {
		const native = new FakeNativeHarness();
		const workbench = new ProjectWorkbench(native, new MemoryJournal(), {
			projectId: "sample-project",
			cwd: "/workspace/sample",
		});
		await ready(workbench);
		native.emit({
			type: "notification",
			method: "item/commandExecution/outputDelta",
			refs: { threadId: "thread-1", turnId: "turn-current", itemId: "same-command" },
			params: { delta: "현재 실행" },
		});
		await Bun.sleep(10);

		native.emit({
			type: "notification",
			method: "item/completed",
			refs: { threadId: "thread-1", turnId: "turn-old", itemId: "same-command" },
			params: { item: { type: "commandExecution", command: "pwd" } },
		});
		await Bun.sleep(10);

		expect(workbench.snapshot.liveActivity).toMatchObject({
			text: "현재 실행",
			nativeRefs: { threadId: "thread-1", turnId: "turn-current", itemId: "same-command" },
		});
		await workbench.close();
	});

	test("keeps sparse live deltas on one observed owner and clears its sparse completion", async () => {
		const native = new FakeNativeHarness();
		const workbench = new ProjectWorkbench(native, new MemoryJournal(), {
			projectId: "sample-project",
			cwd: "/workspace/sample",
		});
		await ready(workbench);
		native.emit({
			type: "notification",
			method: "item/commandExecution/outputDelta",
			refs: { threadId: "thread-1", turnId: "turn-1", itemId: "sparse-command" },
			params: { delta: "first" },
		});
		native.emit({
			type: "notification",
			method: "item/commandExecution/outputDelta",
			refs: { turnId: "turn-1", itemId: "sparse-command" },
			params: { delta: " second" },
		});
		await Bun.sleep(10);
		expect(workbench.snapshot.liveActivity?.text).toBe("first second");

		native.emit({
			type: "notification",
			method: "item/completed",
			refs: { threadId: "thread-1", itemId: "sparse-command" },
			params: { item: { type: "commandExecution", command: "pwd" } },
		});
		await Bun.sleep(10);
		expect(workbench.snapshot.liveActivity).toBeNull();
		await workbench.close();
	});

	test("bounds repeated live tool deltas to a recent tail with cumulative omission metadata", async () => {
		const native = new FakeNativeHarness();
		const journal = new MemoryJournal();
		const workbench = new ProjectWorkbench(native, journal, {
			projectId: "sample-project",
			cwd: "/workspace/sample",
		});
		await ready(workbench);
		for (let index = 0; index < 80; index += 1) {
			native.emit({
				type: "notification",
				method: "item/commandExecution/outputDelta",
				refs: { threadId: "thread-1", turnId: "turn-1", itemId: "large-command" },
				params: { delta: `${String(index).padStart(2, "0")}:${"x".repeat(1020)}` },
			});
		}
		await Bun.sleep(10);

		const text = workbench.snapshot.liveActivity?.text ?? "";
		expect(text.length).toBeLessThanOrEqual(32 * 1024);
		expect(text).toStartWith("… 이전 출력 49200자 생략\n");
		expect(text).toEndWith(`79:${"x".repeat(1020)}`);
		expect(journal.records).toHaveLength(0);

		const completedOutput = `complete token=tool-secret\n${"z".repeat(40_000)}\ncommand-tail`;
		native.emit({
			type: "notification",
			method: "item/completed",
			refs: { threadId: "thread-1", turnId: "turn-1", itemId: "large-command" },
			params: { item: { type: "commandExecution", text: completedOutput } },
		});
		await Bun.sleep(10);
		const storedOutput = ((journal.records[0]?.payload.params as { item?: { text?: string } })?.item?.text) ?? "";
		expect(storedOutput.length).toBeLessThanOrEqual(32 * 1024);
		expect(storedOutput).toStartWith("complete token=[redacted]");
		expect(storedOutput).toContain("…[output truncated]");
		expect(storedOutput).toEndWith("command-tail");
		expect(journal.records[0]?.payload.observationTruncated).toBe(true);
		expect(JSON.stringify(journal.records[0]?.payload)).not.toContain("tool-secret");
		expect(workbench.snapshot.liveActivity).toBeNull();
		await workbench.close();
	});

	test("journals MCP startup status as hidden progress instead of a Chat tool card", async () => {
		const native = new FakeNativeHarness();
		const journal = new MemoryJournal();
		const workbench = new ProjectWorkbench(native, journal, {
			projectId: "sample-project",
			cwd: "/workspace/sample",
		});
		await ready(workbench);
		native.emit({
			type: "notification",
			method: "mcpServer/startupStatus/updated",
			refs: {},
			params: { server: "filesystem", status: "ready", rawStartup: { noisy: true } },
		});
		await Bun.sleep(10);
		expect(journal.records[0]?.kind).toBe("progress");
		expect(workbench.snapshot.chat).toEqual([]);
		await workbench.close();
	});

	test("never infers a native resume from historical local activities", async () => {
		const historicalApproval = {
			requestId: 91,
			callbackId: "old-callback",
			kind: "command" as const,
			refs: { threadId: "th-old", approvalRequestId: 91, approvalCallbackId: "old-callback" },
			availableDecisions: ["decline" as const],
			params: { command: "old" },
		};
		const journal = new MemoryJournal();
		journal.records.push({
			schemaVersion: 1,
			id: "old-approval",
			projectId: "sample-project",
			sequence: 1,
			recordedAt: "2026-09-01T00:00:00.000Z",
			kind: "approval",
			phase: "started",
			provider: "openai-codex",
			nativeRefs: historicalApproval.refs,
			sourceDigest: `sha256:${"d".repeat(64)}`,
			payload: { approval: historicalApproval },
		});
		journal.records.push({
			schemaVersion: 1,
			id: "old-message",
			projectId: "sample-project",
			sequence: 2,
			recordedAt: "2026-09-01T00:00:01.000Z",
			kind: "message",
			phase: "completed",
			provider: "openai-codex",
			nativeRefs: { threadId: "thread-1", itemId: "old-message" },
			sourceDigest: `sha256:${"e".repeat(64)}`,
			payload: { direction: "outbound", role: "user", text: "이전 세션 메시지" },
		});
		const native = new FakeNativeHarness();
		const fresh = new ProjectWorkbench(native, journal, {
			projectId: "sample-project",
			cwd: "/workspace/sample",
		});
		await ready(fresh);
		expect(fresh.snapshot.threadId).toBeNull();
		expect(fresh.snapshot.activities).toEqual([]);
		expect(fresh.snapshot.chat).toEqual([]);
		expect(fresh.snapshot.pendingApproval).toBeNull();
		expect(await fresh.dispatch({ type: "chat.send", text: "새 대화" })).toMatchObject({ state: "accepted" });
		expect(native.startThreadCalls).toBe(1);
		await fresh.close();

		const resumedNative = new FakeNativeHarness();
		const resumed = new ProjectWorkbench(resumedNative, journal, {
			projectId: "sample-project",
			cwd: "/workspace/sample",
			resumeThreadId: "thread-1",
		});
		await ready(resumed);
		expect(resumed.snapshot.threadId).toBe("thread-1");
		expect(resumed.snapshot.activities.every(activity => activity.nativeRefs.threadId === "thread-1")).toBe(true);
		expect(resumed.snapshot.chat.some(message => message.content === "이전 세션 메시지")).toBe(true);
		expect(resumed.snapshot.pendingApproval).toBeNull();
		await resumed.close();
	});

	test("returns uncertain without retrying an ambiguous native send", async () => {
		const native = new FakeNativeHarness();
		native.uncertain = true;
		const workbench = new ProjectWorkbench(native, new MemoryJournal(), {
			projectId: "sample-project",
			cwd: "/workspace/sample",
		});
		await ready(workbench);
		const receipt = await workbench.dispatch({ type: "chat.send", text: "/skills" });
		expect(receipt).toMatchObject({ state: "uncertain", resolution: "manual-reconcile" });
		expect(native.startTurnCalls).toBe(1);
		expect(workbench.snapshot.chat.at(-1)?.content).toBe("/skills");
		expect(workbench.snapshot.chat.at(-1)?.status).toBe("failed");
		expect(await workbench.dispatch({ type: "chat.send", text: "불명확한 전송 뒤 요청" }))
			.toMatchObject({ state: "queued", position: 1 });
		expect(native.startTurnCalls).toBe(1);
		await workbench.close();
	});

	test("rejects invalid local commands without touching native state", async () => {
		const native = new FakeNativeHarness();
		const workbench = new ProjectWorkbench(native, new MemoryJournal(), {
			projectId: "sample-project",
			cwd: "/workspace/sample",
		});
		await ready(workbench);
		expect(await workbench.dispatch({ type: "activity.select", activityId: "missing" }))
			.toMatchObject({
				state: "rejected",
				selection: { state: "failed", failure: { code: "activity_not_found" }, coverage: { mode: "fresh" } },
			});
		expect(await workbench.dispatch({ type: "trace.select", activityId: "missing" }))
			.toMatchObject({
				state: "rejected",
				selection: { state: "failed", failure: { code: "activity_not_found" }, coverage: { mode: "fresh" } },
			});
		expect(await workbench.dispatch({ type: "tnote.capture", activityIds: ["missing"] }))
			.toMatchObject({ state: "rejected" });
		expect(native.startTurnCalls).toBe(0);
		await workbench.close();
	});

	// @linear WOO-705 4738e3c5-c5b3-4cc2-9cea-ff9bf600367d
	test("selects Trace by exact activity across turns that reuse an item id", async () => {
		const native = new FakeNativeHarness();
		const journal = new MemoryJournal();
		const workbench = new ProjectWorkbench(native, journal, {
			projectId: "sample-project",
			cwd: "/workspace/sample",
		});
		await ready(workbench);
		await workbench.dispatch({ type: "chat.send", text: "첫 요청" });
		native.emit({
			type: "notification",
			method: "turn/plan/updated",
			refs: { threadId: "thread-1", turnId: "turn-1" },
			params: { plan: [{ step: "같은 제목", status: "inProgress" }] },
		});
		native.emit({
			type: "notification",
			method: "item/completed",
			refs: { threadId: "thread-1", turnId: "turn-1", itemId: "same-item" },
			params: { item: { id: "same-item", type: "commandExecution", command: "first" } },
		});
		await Bun.sleep(10);
		const first = journal.records.find((activity) => activity.nativeRefs.turnId === "turn-1" && activity.nativeRefs.itemId === "same-item");
		expect(first).toBeDefined();
		expect(await workbench.dispatch({ type: "trace.select", activityId: first!.id })).toMatchObject({
			state: "accepted",
			selection: {
				state: "selected",
				identity: { activityId: first!.id, threadId: "thread-1", turnId: "turn-1", itemId: "same-item" },
				attribution: { identity: "observed", planAssociation: "inferred" },
			},
		});

		native.emit({ type: "notification", method: "turn/completed", refs: { threadId: "thread-1", turnId: "turn-1" }, params: {} });
		await Bun.sleep(10);
		await workbench.dispatch({ type: "chat.send", text: "둘째 요청" });
		native.emit({
			type: "notification",
			method: "turn/plan/updated",
			refs: { threadId: "thread-1", turnId: "turn-2" },
			params: { plan: [{ step: "같은 제목", status: "inProgress" }] },
		});
		native.emit({
			type: "notification",
			method: "item/completed",
			refs: { threadId: "thread-1", turnId: "turn-2", itemId: "same-item" },
			params: { item: { id: "same-item", type: "commandExecution", command: "second" } },
		});
		await Bun.sleep(10);
		const second = journal.records.find((activity) => activity.nativeRefs.turnId === "turn-2" && activity.nativeRefs.itemId === "same-item");
		expect(second).toBeDefined();
		expect(await workbench.dispatch({ type: "trace.select", activityId: second!.id })).toMatchObject({
			state: "accepted",
			selection: { state: "selected", identity: { activityId: second!.id, turnId: "turn-2", itemId: "same-item" } },
		});
		expect(await workbench.dispatch({ type: "trace.select", activityId: first!.id })).toMatchObject({
			state: "rejected",
			selection: { state: "failed", failure: { code: "turn_mismatch", activityId: first!.id } },
		});
		expect(await workbench.dispatch({ type: "trace.select", activityId: "same-item" })).toMatchObject({
			state: "rejected",
			selection: { state: "failed", failure: { code: "activity_not_found", activityId: "same-item" } },
		});
		expect(workbench.snapshot.selectedActivityId).toBe(second!.id);
		await workbench.close();
	});

	test("routes native approval and detached T-note commands through their explicit ports", async () => {
		const native = new FakeNativeHarness();
		const journal = new MemoryJournal();
		const source: ProjectActivity = {
			schemaVersion: 1,
			id: "source-1",
			projectId: "sample-project",
			sequence: 1,
			recordedAt: "2026-09-01T00:00:00.000Z",
			kind: "message",
			phase: "completed",
			provider: "openai-codex",
			nativeRefs: { threadId: "thread-1", itemId: "item-1" },
			sourceDigest: `sha256:${"b".repeat(64)}`,
			payload: { text: "검토할 내용" },
		};
		journal.records.push(source);
		const tnotes = {
			async readAll() { return []; },
			async create(input: Parameters<NonNullable<ConstructorParameters<typeof ProjectWorkbench>[2]["tnotes"]>["create"]>[0]) {
				return {
					schemaVersion: 1 as const,
					id: "note-1",
					sequence: 1,
					createdAt: "2026-09-01T00:00:01.000Z",
					packet: {
						schemaVersion: 1 as const,
						projectId: input.projectId,
						range: input.range,
						createdAt: "2026-09-01T00:00:01.000Z",
						activities: input.activities.map((activity) => ({ ...activity, nativeRefs: activity.nativeRefs ?? [] })),
						digest: "c".repeat(64),
					},
					text: "질문: 선택한 활동\n왜: 선택한 활동을 확인했습니다.\n결과: 결정과 남은 위험을 요약했습니다.",
					provenance: { provider: "openai-codex", model: "gpt-5.6-sol", version: "test" },
				};
			},
		};
		const workbench = new ProjectWorkbench(native, journal, {
			projectId: "sample-project",
			cwd: "/workspace/sample",
			tnotes,
		});
		await ready(workbench);
		native.emit({
			type: "approval-requested",
			approval: {
				requestId: 9,
				callbackId: "callback-9",
				kind: "command",
				refs: { threadId: "thread-1", approvalRequestId: 9, approvalCallbackId: "callback-9" },
				availableDecisions: ["acceptForSession", "decline"],
				params: { command: "git status" },
			},
		});
		await Bun.sleep(10);
		expect(workbench.snapshot.pendingApproval?.requestId).toBe(9);
		expect(await workbench.dispatch({ type: "approval.resolve", requestId: 9, response: { decision: "accept" } }))
			.toMatchObject({ state: "rejected" });
		expect(await workbench.dispatch({ type: "approval.resolve", requestId: 9, response: { decision: "acceptForSession" } }))
			.toMatchObject({ state: "accepted" });
		expect(native.approvalResponses).toEqual([{ requestId: 9, response: { decision: "acceptForSession" } }]);
		expect(await workbench.dispatch({ type: "tnote.capture-range", startSequence: 1, endSequence: 1 }))
			.toMatchObject({ state: "rejected" });
		await workbench.close();
	});

	test("reaches Todo mutations and preserves both CAS conflict documents in the immutable action result", async () => {
		let snapshot = todoDocument();
		const calls: string[] = [];
		const todos = {
			get snapshot() { return snapshot; },
			subscribe() { return () => undefined; },
			async create() { calls.push("create"); return snapshot; },
			async add() { calls.push("add"); return snapshot; },
			async addDetails() { calls.push("details"); return snapshot; },
			async start() { calls.push("start"); return snapshot; },
			async complete() { calls.push("complete"); return snapshot; },
			async block() { calls.push("block"); return snapshot; },
			async reopen() { calls.push("reopen"); return snapshot; },
			async recordEvidence() { calls.push("evidence"); return snapshot; },
			async importLegacy() { calls.push("import"); return "/workspace/.www/vault/Todo.md"; },
		};
		const journal = new MemoryJournal();
		journal.records.push({ schemaVersion: 1, id: "evidence-1", projectId: "sample-project", sequence: 1, recordedAt: "2026-09-01T00:00:00.000Z", kind: "tool", phase: "completed", provider: "openai-codex", nativeRefs: {}, sourceDigest: `sha256:${"a".repeat(64)}`, payload: {} });
		const workbench = new ProjectWorkbench(new FakeNativeHarness(), journal, { projectId: "sample-project", cwd: "/workspace/sample", todos });
		await ready(workbench);
		await workbench.dispatch({ type: "todo.create", title: "작업", items: ["구현"] });
		await workbench.dispatch({ type: "todo.add", placement: "after", content: "검증" });
		await workbench.dispatch({ type: "todo.details", itemId: "todo-1", details: ["세부"] });
		for (const action of ["start", "complete", "block", "reopen"] as const) await workbench.dispatch({ type: "todo.transition", action, itemId: "todo-1" });
		await workbench.dispatch({ type: "todo.evidence", activityId: "evidence-1" });
		await workbench.dispatch({ type: "todo.import-legacy" });
		expect(calls).toEqual(["create", "add", "details", "start", "complete", "block", "reopen", "evidence", "import"]);
		expect(workbench.snapshot.actionResult).toMatchObject({ kind: "todo", title: "Legacy Todo 가져오기" });
		expect(Object.isFrozen(workbench.snapshot.actionResult)).toBe(true);

		const pending = todoDocument(1);
		todos.create = async () => { throw new TodoWriteConflictError("# current", pending, snapshot); };
		expect(await workbench.dispatch({ type: "todo.create", title: "충돌", items: ["대기"] })).toMatchObject({ state: "rejected" });
		expect(workbench.snapshot.actionResult?.body).toContain("# current");
		expect(workbench.snapshot.actionResult?.body).toContain('"revision":1');
		await workbench.close();
	});

	test("promotes a full T-note only after a one-time token and reviews only after exact digest approval", async () => {
		let canonicalBody = "";
		const promotions = new CanonicalPromotionService({
			read: async () => ({ body: canonicalBody, digest: digestCanonicalDocument(canonicalBody) }),
			writeAtomic: async (_target, expected, body) => {
				if (expected !== digestCanonicalDocument(canonicalBody)) return { status: "conflict" as const, document: { body: canonicalBody, digest: digestCanonicalDocument(canonicalBody) } };
				canonicalBody = body;
				return { status: "written" as const, document: { body, digest: digestCanonicalDocument(body) } };
			},
		});
		const reviewCalls: unknown[] = [];
		const adapter = new ProviderReviewAdapter("anthropic", "claude-opus-5", "test", { generate: async request => { reviewCalls.push(request); return "검토 완료"; } });
		const reviews = new ReviewService(new Map([["anthropic", adapter]]), sha256ReviewDigest);
		const note = {
			schemaVersion: 1 as const, id: "note-1", sequence: 1, createdAt: "2026-09-01T00:00:01.000Z",
			packet: { schemaVersion: 1 as const, projectId: "sample-project", range: { startSequence: 1, endSequence: 1 }, createdAt: "2026-09-01T00:00:01.000Z", activities: [{ id: "source-1", sequence: 1, occurredAt: "2026-09-01T00:00:00.000Z", kind: "message.completed", title: "message", body: "source", nativeRefs: [] }], digest: "c".repeat(64) },
			text: "전체 T-note 본문", provenance: { provider: "openai-codex", model: "gpt-5.6-sol", version: "test" },
		};
		const workbench = new ProjectWorkbench(new FakeNativeHarness(), new MemoryJournal(), {
			projectId: "sample-project", cwd: "/workspace/sample", promotions, reviews,
			tnotes: { readAll: async () => [note], create: async () => note },
		});
		await ready(workbench);
		const accepted = await workbench.dispatch({ type: "promotion.accept", noteId: "note-1", acceptedBy: "jongho" });
		expect(accepted).toMatchObject({ state: "accepted" });
		expect(canonicalBody).toBe("");
		const token = workbench.snapshot.actionResult?.body.match(/확인 토큰: (\S+)/u)?.[1];
		expect(token).toBeTruthy();
		expect(await workbench.dispatch({ type: "promotion.confirm", token: token! })).toMatchObject({ state: "accepted" });
		expect(canonicalBody).toContain("전체 T-note 본문");
		expect(await workbench.dispatch({ type: "promotion.confirm", token: token! })).toMatchObject({ state: "rejected" });

		await workbench.dispatch({ type: "review.preview", provider: "anthropic", noteId: "note-1", request: "위험 검토", confirmedPublic: true });
		const digest = workbench.snapshot.actionResult?.digest;
		expect(digest).toMatch(/^[a-f0-9]{64}$/u);
		expect(reviewCalls).toHaveLength(0);
		const wrongDigest = `${digest?.startsWith("0") ? "1" : "0"}${digest?.slice(1)}`;
		expect(await workbench.dispatch({ type: "review.send", digest: wrongDigest })).toMatchObject({ state: "rejected" });
		expect(reviewCalls).toHaveLength(0);
		expect(await workbench.dispatch({ type: "review.send", digest: digest! })).toMatchObject({ state: "accepted" });
		expect(reviewCalls).toHaveLength(1);
		expect(workbench.snapshot.actionResult).toMatchObject({ kind: "review", title: "anthropic/claude-opus-5 검토 결과" });
		expect(workbench.snapshot.actionResult?.body).toContain("provenance");
		await workbench.close();
	});
	// @linear WOO-688 WOO-691
	test("keeps clipped private envelopes out of the live and preserved public response", async () => {
		const native = new FakeNativeHarness();
		const journal = new MemoryJournal();
		const workbench = new ProjectWorkbench(native, journal, { projectId: "sample", cwd: "/sample" });
		await ready(workbench);
		await workbench.dispatch({ type: "chat.send", text: "긴 답변" });
		const refs = { threadId: "thread-1", turnId: "turn-1", itemId: "answer" };
		native.emit({ type: "notification", method: "item/agentMessage/delta", refs,
			params: { delta: "<analysis>\n" + "PRIVATE-SECRET\n".repeat(5000) } });
		await Bun.sleep(10);
		expect(workbench.snapshot.draft).not.toContain("PRIVATE-SECRET");
		native.emit({ type: "notification", method: "item/agentMessage/delta", refs,
			params: { delta: "MORE-PRIVATE\n</analysis>\n<answer>\n공개 답변" } });
		native.emit({ type: "notification", method: "turn/interrupted", refs: { threadId: "thread-1", turnId: "turn-1" }, params: {} });
		await Bun.sleep(10);
		const partial = workbench.snapshot.chat.find(message => message.role === "assistant");
		expect(partial?.status).toBe("cancelled");
		expect(partial?.content).toContain("표시를 보류");
		expect(JSON.stringify(journal.records)).not.toContain("PRIVATE-SECRET");
		expect(JSON.stringify(journal.records)).not.toContain("MORE-PRIVATE");
		await workbench.close();
	});

	// @linear WOO-691 WOO-718
	test("isolates unknown message roles and refuses a source from another thread", async () => {
		const native = new FakeNativeHarness();
		const journal = new MemoryJournal();
		const workbench = new ProjectWorkbench(native, journal, { projectId: "sample", cwd: "/sample" });
		await ready(workbench);
		await workbench.dispatch({ type: "chat.send", text: "질문" });
		for (const [itemId, threadId, item] of [
			["invalid", "thread-1", { type: "alienMessage", text: "SECRET-PAYLOAD" }],
			["foreign", "other-thread", { type: "agentMessage", text: "다른 대화" }],
			["valid", "thread-1", { type: "agentMessage", text: "정상 복구" }],
		] as const) native.emit({ type: "notification", method: "item/completed", refs: { threadId, turnId: "turn-1", itemId }, params: { item } });
		await Bun.sleep(10);
		expect(workbench.snapshot.chat.some(message => message.role === "system" && message.content.includes("형식을 확인"))).toBe(true);
		expect(workbench.snapshot.chat.some(message => message.content.includes("SECRET-PAYLOAD"))).toBe(false);
		expect(workbench.snapshot.chat.some(message => message.content === "정상 복구")).toBe(true);
		const foreign = journal.records.find(activity => activity.nativeRefs.threadId === "other-thread")!;
		expect(await workbench.dispatch({ type: "activity.select", activityId: foreign.id })).toMatchObject({ state: "rejected" });
		expect(workbench.snapshot.selectedActivityId).toBeNull();
		await workbench.close();
	});

	test("projects the selected run as failed exactly once and appends one durable receipt", async () => {
		const native = new FakeNativeHarness();
		const journal = new MemoryJournal();
		const workbench = new ProjectWorkbench(native, journal, { projectId: "sample", cwd: "/sample" });
		await ready(workbench);
		await workbench.dispatch({ type: "chat.send", text: "실패 경로" });
		const event = {
			type: "notification" as const,
			method: "turn/failed",
			refs: { threadId: "thread-1", turnId: "turn-1" },
			params: { turn: { id: "turn-1", status: "failed" } },
		};
		native.emit(event);
		native.emit(event);
		await Bun.sleep(10);
		expect(workbench.snapshot.executionRun?.phase).toBe("failed");
		expect(workbench.snapshot.executionRun?.receipt?.status).toBe("failed");
		expect(journal.records.filter(activity => activity.payload.method === "execution/completion-receipt")).toHaveLength(1);
		await workbench.close();
	});

	test("keeps a tool failure recoverable until the authoritative turn completion", async () => {
		const native = new FakeNativeHarness();
		const journal = new MemoryJournal();
		const workbench = new ProjectWorkbench(native, journal, { projectId: "sample", cwd: "/sample" });
		await ready(workbench);
		await workbench.dispatch({ type: "chat.send", text: "도구 복구 경로" });
		const refs = { threadId: "thread-1", turnId: "turn-1", itemId: "tool-1" };
		native.emit({
			type: "notification",
			method: "item/commandExecution/failed",
			refs,
			params: { item: { type: "commandExecution", command: "false" } },
		});
		await Bun.sleep(10);
		expect(workbench.snapshot.executionRun?.phase).toBe("blocked");
		expect(workbench.snapshot.executionRun?.receipt).toBeNull();
		expect(journal.records.filter(activity => activity.payload.method === "execution/completion-receipt")).toHaveLength(0);
		native.emit({
			type: "notification",
			method: "turn/completed",
			refs: { threadId: "thread-1", turnId: "turn-1" },
			params: { turn: { id: "turn-1", status: "completed" } },
		});
		await Bun.sleep(10);
		expect(workbench.snapshot.executionRun?.receipt?.status).toBe("completed");
		expect(journal.records.filter(activity => activity.payload.method === "execution/completion-receipt")).toHaveLength(1);
		await workbench.close();
	});

});

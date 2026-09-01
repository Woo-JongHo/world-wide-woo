import { describe, expect, test } from "bun:test";
import type { NativeHarnessPort } from "../src/application/native-harness";
import type {
	ActivityNarrationRequest,
	ActivityNarrator,
} from "../src/application/activity-narrator";
import {
	ProjectWorkbench,
	type WorkbenchActivityJournal,
	type WorkbenchTNoteSource,
	type WorkbenchTodoSource,
} from "../src/application/project-workbench";
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
} from "../src/domain/native-session";
import type {
	ProjectActivity,
	ProjectActivityAppendResult,
	ProjectActivityInput,
} from "../src/domain/project-activity";
import { CanonicalPromotionService, digestCanonicalDocument } from "../src/application/canonical-promotion";
import { ReviewService } from "../src/application/review-service";
import { TodoWriteConflictError } from "../src/application/todo-ledger";
import type { TodoDocument } from "../src/domain/todos";
import { ProviderReviewAdapter, sha256ReviewDigest } from "../src/infrastructure/review-adapters";

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

class FakeNativeHarness implements NativeHarnessPort {
	private listener: ((event: NativeHarnessEvent) => void) | null = null;
	startTurnCalls = 0;
	startTurnInputs: NativeTurnStart[] = [];
	startTurnErrors = new Map<number, unknown>();
	startThreadCalls = 0;
	startThreadGate: Promise<void> | null = null;
	startTurnGate: Promise<void> | null = null;
	uncertain = false;
	approvalResponses: NativeApprovalResolution[] = [];
	resumeCalls = 0;
	readCalls = 0;
	resumeInputs: NativeThreadResume[] = [];
	readInputs: NativeThreadRead[] = [];
	readValue: Readonly<Record<string, unknown>> = { status: { type: "idle" }, turns: [] };
	interruptInputs: NativeTurnInterrupt[] = [];
	async startThread(_input: NativeThreadStart): Promise<NativeThreadSnapshot> {
		this.startThreadCalls += 1;
		if (this.startThreadGate) await this.startThreadGate;
		return { id: "thread-1", value: {} };
	}
	async resumeThread(input: NativeThreadResume): Promise<NativeThreadSnapshot> {
		this.resumeCalls += 1;
		this.resumeInputs.push(input);
		return { id: "thread-1", value: {} };
	}
	async readThread(input: NativeThreadRead): Promise<NativeThreadSnapshot> {
		this.readCalls += 1;
		this.readInputs.push(input);
		return { id: input.threadId, value: this.readValue };
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
	async interruptTurn(input: NativeTurnInterrupt): Promise<void> { this.interruptInputs.push(input); }
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
	test("mirrors Native plan activity to Todo without delaying real-time Chat projection", async () => {
		const native = new FakeNativeHarness();
		const syncCalls: Array<{ turnId: string; flow: Parameters<NonNullable<WorkbenchTodoSource["syncNativePlan"]>>[1] }> = [];
		let releasePlanSync: () => void = () => undefined;
		const planSyncGate = new Promise<void>((resolve) => { releasePlanSync = resolve; });
		const unsupported = async (): Promise<never> => { throw new Error("not used"); };
		const todos: WorkbenchTodoSource = {
			snapshot: null,
			subscribe: () => () => undefined,
			syncNativePlan: async (turnId, flow) => {
				syncCalls.push({ turnId, flow });
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

		expect(syncCalls.some((call) => call.flow.steps.length === 2)).toBe(true);
		const execution = workbench.snapshot.activities.find((activity) => activity.nativeRefs.itemId === "write-1");
		expect(execution).toBeDefined();
		expect(workbench.snapshot.workFlow.steps[0]?.activityIds).toContain(execution!.id);
		expect(workbench.snapshot.workFlow.steps[0]?.narration.inputSummary).toEqual(["command: apply_patch Todo.md"]);
		releasePlanSync();
		await workbench.close();
		expect(syncCalls.at(-1)).toMatchObject({
			turnId: "turn-1",
			flow: { steps: [{ title: "계획 자동 동기화", status: "running" }, { title: "결과 검증", status: "pending" }] },
		});
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

		expect(narrator.calls).toHaveLength(1);
		expect(narrator.calls[0]).toMatchObject({
			goal: "의미 Step과 Live T-notes를 구현해줘",
			stepTitle: "변경 결과 검증",
		});
		expect(narrator.calls[0]?.inputSummary[0]).toContain("command: bun test");
		expect(narrator.calls[0]?.inputSummary[0]).toContain("[redacted:local-path]");
		expect(workbench.snapshot.workFlow.steps).toHaveLength(1);
		expect(workbench.snapshot.workFlow.steps[0]).toMatchObject({
			status: "completed",
			narration: {
				what: "의미 Step과 Live T-notes의 회귀 테스트를 실행합니다.",
				source: "model",
			},
		});
		await workbench.close();
	});

	test("queues rapid chat submissions and starts the next message after the active turn completes", async () => {
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
		expect(workbench.snapshot.chat.map(message => message.content)).toEqual(["첫 요청", "두 번째 요청"]);
		expect(workbench.snapshot.chatQueue).toEqual([]);
		expect(journal.records.filter(activity => activity.payload.direction === "outbound" && activity.phase === "started").map(activity => ({
			text: activity.payload.text,
			threadId: activity.nativeRefs.threadId,
		}))).toEqual([
			{ text: "첫 요청", threadId: undefined },
			{ text: "두 번째 요청", threadId: "thread-1" },
		]);
		expect(journal.records.find(activity => activity.payload.text === "첫 요청" && activity.phase === "completed")?.nativeRefs.threadId)
			.toBe("thread-1");
		expect(journal.records.findIndex(activity => activity.payload.text === "두 번째 요청"))
			.toBeGreaterThan(journal.records.findIndex(activity => activity.payload.method === "turn/completed"));
		await workbench.close();
	});

	test("creates a session-summary T-note only at a substantial completed-turn checkpoint without blocking queued chat", async () => {
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
					text: "목표와 결정, 검증 결과, 남은 위험을 정리한 세션 요약",
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
		expect(createCalls[0]?.range).toEqual({ startSequence: 1, endSequence: 8 });
		expect(createCalls[0]?.instruction).toContain("세션 요약");
		expect(native.startTurnCalls).toBe(2);
		expect(workbench.snapshot.chatQueue).toEqual([]);
		expect(workbench.snapshot.tnotes).toEqual([]);

		releaseSummary();
		await Bun.sleep(10);
		expect(workbench.snapshot.tnotes[0]).toMatchObject({
			id: "automatic-session-summary-1",
			title: "세션 요약 #1",
			summary: "목표와 결정, 검증 결과, 남은 위험을 정리한 세션 요약",
		});
		await workbench.close();
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

	test("projects the effective native model, effort, and latest context usage", async () => {
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
					modelContextWindow: 258_400,
				},
			},
		});
		await Bun.sleep(10);

		expect(native.startTurnInputs[0]).toMatchObject({ model: "gpt-5.6-sol", effort: "low" });
		expect(workbench.snapshot).toMatchObject({
			model: "gpt-5.6-sol",
			effort: "low",
			contextUsage: { usedTokens: 25_840, contextWindow: 258_400, percent: 10 },
		});
		await workbench.close();
	});

	test("hides the previous semantic flow while native turn start is pending", async () => {
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
		expect(pending.workFlow.steps).toEqual([]);
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
		expect(before.activities).toHaveLength(80);
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

	test("bounds assistant and reasoning drafts plus durable native observations while redacting completed reasoning", async () => {
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
		expect(storedMessage.length).toBeLessThanOrEqual(32 * 1024);
		expect(storedMessage).toStartWith("complete password=[redacted]");
		expect(storedMessage).toContain("…[output truncated]");
		expect(storedMessage).toEndWith("https://[redacted]@example.com/end");
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
			approvalPolicy: undefined,
			sandbox: undefined,
			excludeTurns: true,
		}]);
		expect(native.readInputs).toEqual([{ threadId: "thread-1", includeTurns: true }]);
		expect(workbench.snapshot.threadId).toBe("thread-1");
		expect(workbench.snapshot.journalSequence).toBe(1);
		expect(journal.records[0]?.payload).toMatchObject({
			method: "thread/resume-local-reconciled",
			historyHydrated: false,
		});
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
			.toMatchObject({ state: "rejected" });
		expect(await workbench.dispatch({ type: "tnote.capture", activityIds: ["missing"] }))
			.toMatchObject({ state: "rejected" });
		expect(native.startTurnCalls).toBe(0);
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
					text: "결정과 남은 위험을 요약함",
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
			.toMatchObject({ state: "accepted" });
		expect(workbench.snapshot.tnotes[0]).toMatchObject({ id: "note-1", summary: "결정과 남은 위험을 요약함" });
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
});

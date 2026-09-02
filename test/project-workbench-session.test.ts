import { describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { codexInteractiveModel } from "../src/app.js";
import type { NativeHarnessPort } from "../src/application/native-harness.js";
import { ProjectWorkbench, type ProjectWorkbenchOptions, type WorkbenchActivityJournal } from "../src/application/project-workbench.js";
import { WooEntry } from "../src/application/woo-entry.js";
import type { SessionRepository, TodoStore } from "../src/application/ports.js";
import { TodoLedger } from "../src/application/todo-ledger";
import { ReviewService } from "../src/application/review-service";

import type { NativeApprovalResolution, NativeHarnessEvent, NativeThreadList, NativeThreadRead, NativeThreadResume, NativeThreadSnapshot, NativeThreadStart, NativeThreadSummary, NativeTurnInterrupt, NativeTurnSnapshot, NativeTurnStart } from "../src/domain/native-session.js";
import type { ProjectActivity, ProjectActivityAppendResult, ProjectActivityInput } from "../src/domain/project-activity.js";
import { createProjectWorkbenchSession, scopedProjectId, scopedTodoSessionId, ThreadBoundActivityJournal, type ProjectWorkbenchSessionFactories } from "../src/infrastructure/project-workbench-session.js";
import type { ProjectWorkspace } from "../src/infrastructure/project-workspace.js";
import { nativeThreadJournalKey } from "../src/infrastructure/activity-journal-store.js";
import { sha256ReviewDigest } from "../src/infrastructure/review-adapters.js";

class MemoryTodoStore implements TodoStore {
	async read() { return null; }
	async compareAndSwap() { return "written" as const; }
}

class MemoryEvents implements SessionRepository {
	async append() { return { schemaVersion: 1 as const, id: "event", sessionId: "workbench", sequence: 1, timestamp: new Date(0).toISOString(), category: "todo" as const, type: "todo.updated" as const, status: "passed" as const, title: "todo", body: "todo", correlationId: null, turnId: null, itemId: null, metadata: {} }; }
	async readAll() { return []; }
}

class MemoryJournal implements WorkbenchActivityJournal {
	private sequence = 0;
	async append(input: ProjectActivityInput): Promise<ProjectActivityAppendResult> {
		this.sequence += 1;
		return { appended: true, activity: { ...input, schemaVersion: 1, id: `activity-${this.sequence}`, sequence: this.sequence, recordedAt: new Date(0).toISOString() } };
	}
	async readAll() { return []; }
}

class FakeNative implements NativeHarnessPort {
	private listener: ((event: NativeHarnessEvent) => void) | undefined;
	constructor(private readonly order: string[]) {}
	async startThread(_input: NativeThreadStart): Promise<NativeThreadSnapshot> { return { id: "thread", value: {} }; }
	async resumeThread(_input: NativeThreadResume): Promise<NativeThreadSnapshot> { return { id: "thread", value: {} }; }
	async readThread(input: NativeThreadRead): Promise<NativeThreadSnapshot> {
		return { id: input.threadId, value: { status: { type: "idle" }, turns: [] } };
	}
	async listThreads(_input: NativeThreadList): Promise<readonly NativeThreadSummary[]> { return []; }
	async startTurn(_input: NativeTurnStart): Promise<NativeTurnSnapshot> {
		setTimeout(() => {
			this.listener?.({
				type: "notification",
				method: "turn/plan/updated",
				refs: { threadId: "thread", turnId: "turn" },
				params: { plan: [{ step: "세션 Todo 시작", status: "inProgress" }] },
			});
		});
		return { id: "turn", threadId: "thread", value: {} };
	}
	async interruptTurn(_input: NativeTurnInterrupt): Promise<void> {}
	async respondToApproval(_input: NativeApprovalResolution): Promise<void> {}
	subscribe(listener: (event: NativeHarnessEvent) => void): () => void { this.listener = listener; return () => { this.listener = undefined; }; }
	emit(event: NativeHarnessEvent): void { this.listener?.(event); }
	async close(): Promise<void> { this.order.push("native.close"); }
}

const workspace: ProjectWorkspace = {
	name: "sample",
	root: "/workspace/sample",
	directory: "/workspace/sample/.www",
	sessionsDirectory: "/workspace/sample/.www/sessions",
	draftsDirectory: "/workspace/sample/.www/drafts",
	runtimeDirectory: "/workspace/sample/.www/runtime",
	todosDirectory: "/workspace/sample/.www/todos",
	vaultDirectory: "/workspace/sample/.www/vault",
	canonicalTodoPath: "/workspace/sample/.www/vault/Todo.md",
	legacyTodoPath: "/workspace/sample/.www/Todo.md",
	manifestPath: "/workspace/sample/.www/project.json",
};

function workspaceAt(root: string): ProjectWorkspace {
	const directory = join(root, ".www");
	return {
		...workspace,
		root,
		directory,
		sessionsDirectory: join(directory, "sessions"),
		draftsDirectory: join(directory, "drafts"),
		runtimeDirectory: join(directory, "runtime"),
		todosDirectory: join(directory, "todos"),
		vaultDirectory: join(directory, "vault"),
		canonicalTodoPath: join(directory, "vault", "Todo.md"),
		legacyTodoPath: join(directory, "Todo.md"),
		manifestPath: join(directory, "project.json"),
	};
}

function memoryWooEntry(): WooEntry {
	return new WooEntry({
		collect: async () => ({
			source: { root: "/wes", runner: "hooks/wes_entry.py" },
			payload: { status: {}, git: {}, authority: {}, signals: [], nextActions: [] },
		}),
	});
}

describe("createProjectWorkbenchSession", () => {
	test("requires an explicit thread bind before selecting a journal stream or appending activity", async () => {
		let reads = 0, appends = 0;
		const journal = new ThreadBoundActivityJournal({
			append: async () => {
				appends += 1;
				throw new Error("must not append");
			},
			readAll: async () => {
				reads += 1;
				return [];
			},
		});
		await expect(journal.append({
			projectId: "unbound",
			kind: "progress",
			phase: "completed",
			provider: "native",
			nativeRefs: { threadId: "forged-thread" },
			sourceDigest: `sha256:${"1".padStart(64, "0")}`,
			payload: { method: "thread/start" },
		})).rejects.toThrow("Native thread에 묶인 뒤에만");
		expect(appends).toBe(0);
		await expect(journal.readAll("unbound")).resolves.toEqual([]);
		expect(reads).toBe(0);
	});

	test("uses the configured Codex model only and falls back when a legacy router selected another provider", () => {
		expect(codexInteractiveModel({ provider: "openai-codex", model: "gpt-5.6-terra", effort: "high" })).toBe("gpt-5.6-terra");
		expect(codexInteractiveModel({ provider: "anthropic", model: "claude-opus-4-6", effort: "ultra" })).toBe("gpt-5.6-sol");
		expect(codexInteractiveModel({ provider: "google", model: "gemini-3.1-pro-preview", effort: "ultra" })).toBe("gpt-5.6-sol");
	});

	test("uses the production composer factory with its static class receiver intact", async () => {
		const root = await mkdtemp(join(tmpdir(), "www-workbench-composer-"));
		const temporaryWorkspace = workspaceAt(root);
		const order: string[] = [];
		try {
			const session = await createProjectWorkbenchSession(root, {}, {
				openWorkspace: async () => temporaryWorkspace,
				acquireWriterLease: async () => ({ release: async () => { order.push("lease.release"); } }),
				connectNative: async () => new FakeNative(order),
				createJournal: () => new MemoryJournal(),
				createTodoStore: () => new MemoryTodoStore(),
				createSessionEvents: () => new MemoryEvents(),
				createTNoteSource: () => ({ readAll: async () => [], create: async () => { throw new Error("not used"); } }),
				createReviewService: () => new ReviewService(new Map(), sha256ReviewDigest),
				createWooEntry: memoryWooEntry,
			});
			expect(session.composerDraft.initialText).toBe("");
			await session.close();
			expect(order).toEqual(["native.close", "lease.release"]);
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});

	test("uses distinct run-local leases and one shared unbound journal without pre-bind T-note I/O", async () => {
		const leaseIds: string[] = [];
		const journalPaths: string[] = [];
		let reads = 0;
		const factories: Partial<ProjectWorkbenchSessionFactories> = {
			openWorkspace: async () => workspace,
			acquireWriterLease: async (_workspace, id) => {
				leaseIds.push(id);
				return { release: async () => undefined };
			},
			connectNative: async () => new FakeNative([]),
			createJournal: (path) => {
				journalPaths.push(path);
				return new MemoryJournal();
			},
			createTodoStore: () => new MemoryTodoStore(),
			createSessionEvents: () => new MemoryEvents(),
			createTNoteSource: () => ({
				readAll: async () => { reads += 1; return []; },
				create: async () => { throw new Error("not used"); },
			}),
			createComposerDraft: async () => ({ initialText: "", save: async () => undefined, clear: async () => undefined }),
		};
		const first = await createProjectWorkbenchSession("/ignored", {}, factories);
		const second = await createProjectWorkbenchSession("/ignored", {}, factories);
		expect(leaseIds).toHaveLength(2);
		expect(new Set(leaseIds).size).toBe(2);
		expect(new Set(journalPaths).size).toBe(1);
		expect(reads).toBe(0);
		await first.close();
		await second.close();
	});

	test("refuses a concurrent writable resume and releases only its own thread lease", async () => {
		const active = new Set<string>();
		let resumes = 0;
		const factories: Partial<ProjectWorkbenchSessionFactories> = {
			openWorkspace: async () => workspace,
			acquireWriterLease: async (_workspace, id) => {
				if (id.startsWith("native-") && active.has(id)) throw new Error(`Session is already active: ${id}`);
				active.add(id);
				return { release: async () => { active.delete(id); } };
			},
			connectNative: async () => {
				const native = new FakeNative([]);
				const resume = native.resumeThread.bind(native);
				native.resumeThread = async (input) => { resumes += 1; return resume(input); };
				return native;
			},
			createJournal: () => new MemoryJournal(),
			createTodoStore: () => new MemoryTodoStore(),
			createSessionEvents: () => new MemoryEvents(),
			createTNoteSource: () => ({ readAll: async () => [], create: async () => { throw new Error("not used"); } }),
			createComposerDraft: async () => ({ initialText: "", save: async () => undefined, clear: async () => undefined }),
		};
		const first = await createProjectWorkbenchSession("/ignored", { resumeThreadId: "thread" }, factories);
		await first.workbench.dispatch({ type: "session.mode", mode: "manual" });
		await expect(createProjectWorkbenchSession("/ignored", { resumeThreadId: "thread" }, factories)).rejects.toThrow("already active");
		expect(resumes).toBe(1);
		await first.close();
		const reopened = await createProjectWorkbenchSession("/ignored", { resumeThreadId: "thread" }, factories);
		await reopened.close();
	});

	test("prebinds two close/reopen resume sessions to the same native journal before Native resume", async () => {
		const order: string[] = [];
		const streamReads: string[] = [];
		const resumeReconciliations: ProjectActivityInput[] = [];
		const activity = (sequence: number, method: string, refs: Record<string, string>, payload: Record<string, unknown> = {}) => ({
			schemaVersion: 1 as const, id: `a-${sequence}`, projectId: nativeThreadJournalKey("thread"), sequence,
			recordedAt: new Date(0).toISOString(), kind: method === "item/completed" ? "file-change" as const : "progress" as const,
			phase: "completed" as const, provider: "native", nativeRefs: refs,
			sourceDigest: `sha256:${String(sequence).padStart(64, "0")}`, payload: { method, ...payload },
		});
		const persisted = [
			activity(1, "turn/started", { threadId: "thread", turnId: "root-turn" }),
			activity(2, "turn/plan/updated", { threadId: "thread", turnId: "root-turn" }, { params: { plan: [{ step: "root plan", status: "inProgress" }] } }),
			activity(3, "turn/plan/updated", { threadId: "thread", turnId: "foreign-turn" }, { params: { plan: [{ step: "foreign plan", status: "inProgress" }] } }),
			activity(4, "item/completed", { threadId: "thread", turnId: "foreign-turn" }),
		];
		const shared: WorkbenchActivityJournal = {
			append: async (input) => {
				if (input.payload.method === "thread/resume-local-reconciled") resumeReconciliations.push(input);
				return { appended: false, activity: { ...input, schemaVersion: 1, id: crypto.randomUUID(), sequence: persisted.length + 1, recordedAt: new Date(0).toISOString() } };
			},
			readAll: async (projectId) => { streamReads.push(projectId); order.push("journal.read"); return persisted; },
		};
		const factories: Partial<ProjectWorkbenchSessionFactories> = {
			openWorkspace: async () => workspace,
			acquireWriterLease: async () => ({ release: async () => undefined }),
			connectNative: async () => {
				const native = new FakeNative(order);
				native.resumeThread = async (input) => { order.push("native.resume"); return { id: input.threadId, value: {} }; };
				return native;
			},
			createJournal: () => shared,
			createTodoStore: () => new MemoryTodoStore(),
			createSessionEvents: () => new MemoryEvents(),
			createTNoteSource: () => ({ readAll: async () => [], create: async () => { throw new Error("not used"); } }),
			createComposerDraft: async () => ({ initialText: "", save: async () => undefined, clear: async () => undefined }),
		};
		const first = await createProjectWorkbenchSession("/ignored", { resumeThreadId: "thread" }, factories);
		expect(first.workbench.snapshot.workFlow).toMatchObject({ source: { turnId: "root-turn" }, steps: [{ title: "root plan" }], rejections: [{ code: "source_turn_mismatch" }], orphans: [{ reason: "source_mismatch" }] });
		const identity = first.workbench.snapshot.workFlow.steps[0]!.id;
		await first.close();
		const second = await createProjectWorkbenchSession("/ignored", { resumeThreadId: "thread" }, factories);
		expect(second.workbench.snapshot.workFlow).toMatchObject({ source: { turnId: "root-turn" }, steps: [{ id: identity, title: "root plan" }], rejections: [{ code: "source_turn_mismatch" }], orphans: [{ reason: "source_mismatch" }] });
		expect(second.workbench.snapshot.workFlow.source).toEqual(first.workbench.snapshot.workFlow.source);
		await second.close();
		expect(streamReads).toEqual([nativeThreadJournalKey("thread"), nativeThreadJournalKey("thread")]);
		expect(order.filter((entry) => entry === "journal.read" || entry === "native.resume")).toEqual([
			"journal.read", "native.resume", "journal.read", "native.resume",
		]);
		expect(resumeReconciliations).toHaveLength(2);
		expect(resumeReconciliations).toEqual(expect.arrayContaining([
			expect.objectContaining({ payload: expect.objectContaining({ method: "thread/resume-local-reconciled", historyHydrated: false }) }),
		]));
	});

	test("resumes an in-progress root turn through repeated markers and applies its later Plan and action", async () => {
		const activity = (sequence: number, method: string, payload: Record<string, unknown> = {}) => ({
			schemaVersion: 1 as const, id: `resume-${sequence}`, projectId: nativeThreadJournalKey("thread"), sequence,
			recordedAt: new Date(0).toISOString(), kind: method === "item/completed" ? "file-change" as const : "progress" as const,
			phase: "completed" as const, provider: "native", nativeRefs: { threadId: "thread", turnId: "root-turn" },
			sourceDigest: `sha256:${String(sequence).padStart(64, "0")}`, payload: { method, ...payload },
		});
		const persisted = [
			activity(1, "turn/started"),
			activity(2, "turn/plan/updated", { params: { plan: [{ step: "root plan", status: "inProgress" }] } }),
		];
		let sequence = persisted.length;
		const journal: WorkbenchActivityJournal = {
			append: async (input) => ({ appended: true, activity: { ...input, schemaVersion: 1, id: crypto.randomUUID(), sequence: ++sequence, recordedAt: new Date(0).toISOString() } }),
			readAll: async () => persisted,
		};
		let native: FakeNative | undefined;
		const session = await createProjectWorkbenchSession("/ignored", { resumeThreadId: "thread" }, {
			openWorkspace: async () => workspace,
			acquireWriterLease: async () => ({ release: async () => undefined }),
			connectNative: async () => {
				native = new FakeNative([]);
				native.readThread = async (input) => ({ id: input.threadId, value: { status: { type: "inProgress" }, turns: [{ id: "root-turn", status: "inProgress" }] } });
				return native;
			},
			createJournal: () => journal,
			createTodoStore: () => new MemoryTodoStore(),
			createSessionEvents: () => new MemoryEvents(),
			createTNoteSource: () => ({ readAll: async () => [], create: async () => { throw new Error("not used"); } }),
			createComposerDraft: async () => ({ initialText: "", save: async () => undefined, clear: async () => undefined }),
		});
		const identity = session.workbench.snapshot.workFlow.steps[0]!.id;
		native!.emit({ type: "notification", method: "turn/started", refs: { threadId: "thread", turnId: "root-turn" }, params: {} });
		await Bun.sleep(5);
		native!.emit({ type: "notification", method: "turn/plan/updated", refs: { threadId: "thread", turnId: "root-turn" }, params: { plan: [{ step: "root plan", status: "inProgress" }] } });
		await Bun.sleep(5);
		native!.emit({ type: "notification", method: "item/completed", refs: { threadId: "thread", turnId: "root-turn", itemId: "write-1" }, params: { item: { id: "write-1", type: "commandExecution", command: "apply_patch file" } } });
		await Bun.sleep(20);
		expect(session.workbench.snapshot.workFlow).toMatchObject({
			source: { turnId: "root-turn" },
			steps: [{ id: identity, title: "root plan", activityIds: [expect.any(String)] }],
		});
		await session.close();
	});

	test("wires one native writer to thread-scoped Todo, private activity/drafts, and deterministic project identity", async () => {
		const order: string[] = [];
		const observed: { todoPath?: string; journalPath?: string; draftPath?: string; tnoteModel?: string; options?: ProjectWorkbenchOptions } = {};
		let ledger: TodoLedger | undefined;
		const factories: Partial<ProjectWorkbenchSessionFactories> = {
			openWorkspace: async () => workspace,
			acquireWriterLease: async (_workspace, id) => {
				expect(id).toMatch(/^(workbench-|native-)/u);
				return { release: async () => { order.push("lease.release"); } };
			},
			connectNative: async () => new FakeNative(order),
			createJournal: (path) => { observed.journalPath = path; return new MemoryJournal(); },
			createTodoStore: (path) => { observed.todoPath = path; return new MemoryTodoStore(); },
			createTodoLedger: (sessionId, store, events) => {
				ledger = new TodoLedger(sessionId, store, events);
				const dispose = ledger.dispose.bind(ledger);
				ledger.dispose = () => { order.push("todo.dispose"); dispose(); };
				return ledger;
			},
			createSessionEvents: () => new MemoryEvents(),
			createTNoteSource: (path, model) => {
				observed.draftPath = path;
				observed.tnoteModel = model;
				return { readAll: async () => [], create: async () => { throw new Error("not used"); } };
			},
			createWorkbench: (native, journal, options) => {
				observed.options = options;
				return new ProjectWorkbench(native, journal, options);
			},
			createComposerDraft: async () => ({ initialText: "", save: async () => undefined, clear: async () => undefined }),
			createWooEntry: memoryWooEntry,
		};
		const persistModelSelection = async () => undefined;

		const session = await createProjectWorkbenchSession("/ignored", {
			resumeThreadId: "opaque-native-id",
			model: "gpt-5.6-sol",
			effort: "low",
			persistModelSelection,
		}, factories);
		await session.workbench.dispatch({ type: "session.mode", mode: "manual" });

		expect(session.projectId).toBe(scopedProjectId(workspace.root));
		expect(observed.todoPath).toBe(join(workspace.todosDirectory, scopedTodoSessionId("thread"), "Todo.md"));
		expect(observed.journalPath).toBe(join(workspace.runtimeDirectory, "activity"));
		expect(observed.draftPath).toBe(workspace.draftsDirectory);
		expect(observed.tnoteModel).toBe("gpt-5.6-luna");
		expect(observed.options).toMatchObject({
			provider: "openai-codex",
			cwd: workspace.root,
			model: "gpt-5.6-sol",
			effort: "low",
			resumeThreadId: "opaque-native-id",
			approvalPolicy: "on-request",
			sandbox: "workspace-write",
		});
		expect(observed.options?.todos).toEqual(expect.objectContaining({
			syncNativePlan: expect.any(Function),
			create: expect.any(Function),
			add: expect.any(Function),
			addDetails: expect.any(Function),
			start: expect.any(Function),
			complete: expect.any(Function),
			block: expect.any(Function),
			reopen: expect.any(Function),
			recordEvidence: expect.any(Function),
			importLegacy: expect.any(Function),
		}));
		expect(observed.options?.promotions).toBeDefined();
		expect(observed.options?.reviews).toBeDefined();
		expect(observed.options?.narrator).toBeDefined();
		expect(observed.options?.wooEntry).toBeUndefined();
		expect(observed.options?.persistModelSelection).toBe(persistModelSelection);
		await session.close();
		expect(order).toEqual(["native.close", "todo.dispose", "lease.release", "lease.release"]);
	});

	test("isolates WES from default Chat and creates it only when explicitly enabled", async () => {
		const observed: ProjectWorkbenchOptions[] = [];
		let createdWooEntry = 0;
		const factories: Partial<ProjectWorkbenchSessionFactories> = {
			openWorkspace: async () => workspace,
			acquireWriterLease: async () => ({ release: async () => undefined }),
			connectNative: async () => new FakeNative([]),
			createJournal: () => new MemoryJournal(),
			createTodoStore: () => new MemoryTodoStore(),
			createSessionEvents: () => new MemoryEvents(),
			createTNoteSource: () => ({ readAll: async () => [], create: async () => { throw new Error("not used"); } }),
			createWorkbench: (native, journal, options) => {
				observed.push(options);
				return new ProjectWorkbench(native, journal, options);
			},
			createComposerDraft: async () => ({ initialText: "", save: async () => undefined, clear: async () => undefined }),
			createWooEntry: () => {
				createdWooEntry += 1;
				return memoryWooEntry();
			},
		};

		const defaultSession = await createProjectWorkbenchSession("/ignored", {}, factories);
		expect(observed[0]?.wooEntry).toBeUndefined();
		expect(createdWooEntry).toBe(0);
		expect(defaultSession.workbench.snapshot.wooEntry).toBeNull();
		await defaultSession.close();

		const wesSession = await createProjectWorkbenchSession("/ignored", { enableWooEntry: true }, factories);
		expect(observed[1]?.wooEntry).toBeDefined();
		expect(createdWooEntry).toBe(1);
		await wesSession.close();
	});

	test("binds a fresh workbench Todo before automatic Native-plan sync", async () => {
		const order: string[] = [];
		const todoPaths: string[] = [];
		let nativePlanSyncCalls = 0;
		const session = await createProjectWorkbenchSession("/ignored", {}, {
			openWorkspace: async () => workspace,
			acquireWriterLease: async () => ({ release: async () => { order.push("lease.release"); } }),
			connectNative: async () => new FakeNative(order),
			createJournal: () => new MemoryJournal(),
			createTodoStore: (path) => { todoPaths.push(path); return new MemoryTodoStore(); },
			createTodoLedger: (sessionId, store, events) => {
				const ledger = new TodoLedger(sessionId, store, events);
				const syncNativePlan = ledger.syncNativePlan.bind(ledger);
				ledger.syncNativePlan = async (...args) => {
					nativePlanSyncCalls += 1;
					return syncNativePlan(...args);
				};
				return ledger;
			},
			createSessionEvents: () => new MemoryEvents(),
			createTNoteSource: () => ({ readAll: async () => [], create: async () => { throw new Error("not used"); } }),
			createComposerDraft: async () => ({ initialText: "", save: async () => undefined, clear: async () => undefined }),
			createWooEntry: memoryWooEntry,
		});

		await session.workbench.dispatch({ type: "session.mode", mode: "manual" });
		expect(session.workbench.snapshot.todo).toBeNull();
		expect(todoPaths).toEqual([]);

		await session.workbench.dispatch({ type: "chat.send", text: "세션 Todo를 시작해" });
		expect(todoPaths).toEqual([join(workspace.todosDirectory, scopedTodoSessionId("thread"), "Todo.md")]);
		await Bun.sleep(10);
		await session.close();
		expect(nativePlanSyncCalls).toBeGreaterThan(0);
		expect(session.workbench.snapshot.actionResult).toBeNull();
	});
});

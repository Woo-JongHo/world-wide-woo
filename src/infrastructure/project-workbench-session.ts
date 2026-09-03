import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { ProjectWorkbench, type ProjectWorkbenchOptions, type WorkbenchActivityJournal, type WorkbenchTNoteSource, type WorkbenchTodoSource } from "../application/project-workbench.js";
import type { NativeHarnessPort } from "../application/native-harness.js";
import type { ComposerDraftController, SessionRepository, TodoStore, UsageMonitor } from "../application/ports.js";
import { TNoteService } from "../application/t-note-service.js";
import type { ActivityNarrator } from "../application/activity-narrator.js";
import { WooEntry } from "../application/woo-entry.js";
import { SessionModelUsageAccumulator, type SessionModelUsageObservation } from "../application/session-model-usage.js";
import { TodoLedger } from "../application/todo-ledger.js";
import type { TodoDocument } from "../domain/todos.js";
import type { TNoteDraft } from "../domain/t-notes.js";
import type { WorkbenchModelSelection } from "../domain/workbench.js";
import type { WorkFlowProjection } from "../domain/work-steps.js";
import type { ProjectActivity } from "../domain/project-activity.js";
import { CanonicalPromotionService } from "../application/canonical-promotion.js";
import { ReviewService } from "../application/review-service.js";
import { digestActivitySource, ActivityJournalStore, nativeThreadJournalKey } from "./activity-journal-store.js";
import { createNativeHarness, type ExecutionLane, type NativeHarnessSelection } from "./native-harness-factory.js";
import { FileComposerDraftController } from "./composer-draft-store.js";
import { PiDetachedCodexGenerator } from "./detached-codex-generator.js";
import { PiActivityNarrator } from "./pi-activity-narrator.js";
import { FileCredentialStore } from "./credential-store.js";
import { createModelRegistry } from "./model-router.js";
import { FileProjectWorkspace, type ProjectWorkspace, type SessionLease } from "./project-workspace.js";
import { SessionEventStore } from "./session-store.js";
import { FileTNoteStore } from "./t-note-store.js";
import { FileTodoStore, importLegacyTodo } from "./todo-store.js";
import { FileCanonicalDocumentStore } from "./canonical-document-store.js";
import { createProductionReviewAdapters, installedClaudeCliVersion, PiReviewGenerationClient, sha256ReviewDigest } from "./review-adapters.js";
import { FileReviewProvenanceStore } from "./review-store.js";
import { UsageService } from "./usage-service.js";
import { WesEntryCollector } from "./wes-entry-collector.js";

const WORKBENCH_RUN_PREFIX = "workbench";
export const DEFAULT_TNOTE_MODEL = "gpt-5.6-luna";

export interface ProjectWorkbenchSessionOptions {
	resumeThreadId?: string;
	executionLane?: ExecutionLane;
	provider?: string;
	/** WWW-owned instructions for the optional embedded Pi execution lane. */
	systemPrompt?: string;
	model?: string;
	effort?: string;
	/** Opt in to local WES policy collection and Chat context injection. */
	enableWooEntry?: boolean;
	persistModelSelection?: (selection: WorkbenchModelSelection) => Promise<void>;
}

export interface ProjectWorkbenchSession {
	workspace: ProjectWorkspace;
	projectId: string;
	workbench: ProjectWorkbench;
	composerDraft: ComposerDraftController;
	usage: UsageMonitor;
	/** Called by the TUI after it has closed the workbench. */
	releaseSessionLease(): Promise<void>;
	/** Safe for errors before the TUI owns shutdown. */
	close(): Promise<void>;
}

/**
 * Construction seams keep the production composition small and let its wiring
 * be tested without starting a Codex subprocess or a terminal UI.
 */
export interface ProjectWorkbenchSessionFactories {
	openWorkspace(cwd: string): Promise<ProjectWorkspace>;
	acquireWriterLease(workspace: ProjectWorkspace, id: string): Promise<SessionLease>;
	connectNative(input: NativeHarnessSelection): Promise<NativeHarnessPort>;
	createJournal(directory: string): WorkbenchActivityJournal;
	createTodoStore(path: string): TodoStore;
	createTodoLedger(sessionId: string, store: TodoStore, events: SessionRepository): TodoLedger;
	importLegacyTodo(legacyPath: string, targetPath: string): Promise<string | null>;
	createSessionEvents(directory: string): SessionRepository;
	createTNoteSource(directory: string, model: string, observeUsage?: (observation: SessionModelUsageObservation) => void): WorkbenchTNoteSource;
	createActivityNarrator(): ActivityNarrator;
	createPromotionService(root: string): CanonicalPromotionService;
	createReviewService(runtimeDirectory: string, observeUsage?: (observation: SessionModelUsageObservation) => void): ReviewService;
	createWorkbench(native: NativeHarnessPort, journal: WorkbenchActivityJournal, options: ProjectWorkbenchOptions): ProjectWorkbench;
	createComposerDraft(root: string, sessionId: string, directory: string): Promise<ComposerDraftController>;
	createUsageMonitor(): UsageMonitor;
	createWooEntry(): WooEntry;
}

const productionFactories: ProjectWorkbenchSessionFactories = {
	openWorkspace: FileProjectWorkspace.open,
	acquireWriterLease: FileProjectWorkspace.acquireSessionLease,
	connectNative: createNativeHarness,
	createJournal: (directory) => new ActivityJournalStore(directory),
	createTodoStore: (path) => new FileTodoStore(path),
	createTodoLedger: (sessionId, store, events) => new TodoLedger(sessionId, store, events),
	importLegacyTodo,
	createSessionEvents: (directory) => new SessionEventStore(directory),
	createTNoteSource: (directory, model, observeUsage) => {
		const store = new FileTNoteStore(directory);
		const generator = new PiDetachedCodexGenerator(createModelRegistry(new FileCredentialStore()), model, model, observeUsage);
		return new TNoteService(generator, store);
	},
	createActivityNarrator: () => new PiActivityNarrator(createModelRegistry(new FileCredentialStore())),
	createPromotionService: (root) => new CanonicalPromotionService(new FileCanonicalDocumentStore(root)),
	createReviewService: (runtimeDirectory, observeUsage) => {
		const registry = createModelRegistry(new FileCredentialStore());
		return new ReviewService(
			createProductionReviewAdapters(new PiReviewGenerationClient(registry, observeUsage), {
				claudeCliVersion: installedClaudeCliVersion(),
			}),
			sha256ReviewDigest,
			new FileReviewProvenanceStore(join(runtimeDirectory, "review-provenance.jsonl")),
		);
	},
	createWorkbench: (native, journal, options) => new ProjectWorkbench(native, journal, options),
	// Keep the class receiver: passing the static method itself loses `this`.
	createComposerDraft: (root, sessionId, directory) => FileComposerDraftController.create(root, sessionId, directory),
	createUsageMonitor: () => {
		const credentials = new FileCredentialStore();
		return new UsageService(credentials, createModelRegistry(credentials));
	},
	createWooEntry: () => new WooEntry(new WesEntryCollector()),
};

/**
 * Opens exactly one native workbench writer for a project. The native thread
 * identifier is deliberately separate from the local writer lease.
 */
export async function createProjectWorkbenchSession(
	cwd: string,
	options: ProjectWorkbenchSessionOptions = {},
	overrides: Partial<ProjectWorkbenchSessionFactories> = {},
): Promise<ProjectWorkbenchSession> {
	const factories = { ...productionFactories, ...overrides };
	const workspace = await factories.openWorkspace(cwd);
	const runId = `${WORKBENCH_RUN_PREFIX}-${randomUUID()}`;
	const lease = await factories.acquireWriterLease(workspace, runId);
	let threadLease: SessionLease | undefined;
	let native: NativeHarnessPort | undefined;
	let todos: ThreadScopedTodoSource | undefined;
	let workbench: ProjectWorkbench | undefined;
	let released = false;
	const release = async (): Promise<void> => {
		if (released) return;
		released = true;
		todos?.dispose();
		try {
			await threadLease?.release();
		} finally {
			await lease.release();
		}
	};
	try {
		const projectId = scopedProjectId(workspace.root);
		const journal = new ThreadBoundActivityJournal(factories.createJournal(join(workspace.runtimeDirectory, "activity")));
		if (options.resumeThreadId) await journal.bindThread(options.resumeThreadId);
		todos = new ThreadScopedTodoSource(workspace, factories);
		const auxiliaryUsage = new SessionModelUsageAccumulator();
		const observeAuxiliaryUsage = (observation: SessionModelUsageObservation): void => auxiliaryUsage.observe(observation);
		if (options.executionLane === "pi" && (!options.provider || !options.model || !options.effort)) {
			throw new Error("Pi execution lane requires explicit provider, model, and effort");
		}
		native = await factories.connectNative({
			executionLane: options.executionLane,
			provider: options.provider ?? "openai-codex",
			model: options.model ?? "gpt-5.6-sol",
			effort: options.effort ?? "medium",
			systemPrompt: options.systemPrompt,
		});
		const tnotes = new ThreadScopedTNoteSource(
			factories.createTNoteSource(workspace.draftsDirectory, DEFAULT_TNOTE_MODEL, observeAuxiliaryUsage),
		);
		const narrator = factories.createActivityNarrator();
		// WES is an optional local policy source. Ordinary Chat sessions must not
		// collect it or expose a WES loading/blocked state.
		const wooEntry = options.enableWooEntry ? factories.createWooEntry() : undefined;
		workbench = factories.createWorkbench(native, journal, {
			projectId,
			provider: options.provider ?? "openai-codex",
			cwd: workspace.root,
			model: options.model,
			effort: options.effort,
			activityJournalProjectId: runId,
			persistModelSelection: options.persistModelSelection,
			approvalPolicy: "on-request",
			sandbox: "workspace-write",
			resumeThreadId: options.resumeThreadId,
			acquireThreadLease: async (threadId) => {
				// Bind before the lease.  Native emits for the thread as soon as `thread/start`
				// resolves, so a bind placed after the lock I/O leaves a window in which an
				// arriving event has no stream to land in.  The bind also sits outside the
				// `threadLease` early return: a second thread must rebind the journal instead of
				// appending into the previous thread's stream.
				await journal.bindThread(threadId);
				if (threadLease) return;
				threadLease = await factories.acquireWriterLease(workspace, scopedTodoSessionId(threadId));
			},
			todos,
			tnotes,
			narrator,
			wooEntry,
			promotions: factories.createPromotionService(workspace.root),
			reviews: factories.createReviewService(workspace.runtimeDirectory, observeAuxiliaryUsage),
			auxiliaryUsage,
		});
		await workbench.waitUntilReady();
		const composerDraft = await factories.createComposerDraft(workspace.root, runId, workspace.draftsDirectory);
		const usage = factories.createUsageMonitor();
		return {
			workspace,
			projectId,
			workbench,
			composerDraft,
			usage,
			releaseSessionLease: release,
			close: async () => {
				try {
					await workbench?.close();
				} finally {
					await release();
				}
			},
		};
	} catch (error) {
		try {
			if (workbench) await workbench.close();
			else if (native) await native.close();
		} finally {
			await release();
		}
		throw error;
	}
}

export function scopedProjectId(projectRoot: string): string {
	return `project-${digestActivitySource(projectRoot).slice("sha256:".length, "sha256:".length + 24)}`;
}

export function scopedTodoSessionId(nativeThreadId: string): string {
	if (typeof nativeThreadId !== "string" || nativeThreadId.trim().length === 0) throw new Error("Todo에는 Native thread id가 필요합니다.");
	return `native-${digestActivitySource(nativeThreadId).slice("sha256:".length, "sha256:".length + 32)}`;
}

/**
 * The journal directory is shared by all workbench processes.  Its v1 stream
 * selection is exclusively derived from the native thread, never a run id.
 */
export class ThreadBoundActivityJournal implements WorkbenchActivityJournal {
	private streamId: string | null = null;

	public constructor(private readonly journal: WorkbenchActivityJournal) {}

	public async bindThread(threadId: string): Promise<void> {
		const streamId = nativeThreadJournalKey(threadId);
		if (this.streamId && this.streamId !== streamId) {
			throw new Error("활동 기록이 이미 다른 Native thread에 묶여 있습니다.");
		}
		this.streamId = streamId;
	}

	public hasBoundThread(): boolean {
		return this.streamId !== null;
	}

	public async append(input: Parameters<WorkbenchActivityJournal["append"]>[0]): ReturnType<WorkbenchActivityJournal["append"]> {
		return this.journal.append({ ...input, projectId: this.requireStreamId() });
	}

	public readAll(_projectId: string): Promise<ProjectActivity[]> {
		return this.streamId ? this.journal.readAll(this.streamId) : Promise.resolve([]);
	}

	private requireStreamId(): string {
		if (!this.streamId) throw new Error("활동 기록은 Native thread에 묶인 뒤에만 추가할 수 있습니다.");
		return this.streamId;
	}
}

class ThreadScopedTNoteSource implements WorkbenchTNoteSource {
	private projectId: string | null = null;

	public constructor(private readonly source: WorkbenchTNoteSource) {}

	public async bindThread(threadId: string): Promise<void> {
		const projectId = scopedTodoSessionId(threadId);
		if (this.projectId && this.projectId !== projectId) {
			throw new Error("T-note가 이미 다른 Native thread에 묶여 있습니다.");
		}
		this.projectId = projectId;
	}

	public readAll(_projectId: string): Promise<readonly TNoteDraft[]> {
		return this.source.readAll(this.requireProjectId());
	}

	public create(
		input: Parameters<WorkbenchTNoteSource["create"]>[0],
		signal?: AbortSignal,
	): ReturnType<WorkbenchTNoteSource["create"]> {
		return this.source.create({ ...input, projectId: this.requireProjectId() }, signal);
	}

	private requireProjectId(): string {
		if (!this.projectId) throw new Error("T-note는 Native 세션이 시작된 뒤 사용할 수 있습니다.");
		return this.projectId;
	}
}

class ThreadScopedTodoSource implements WorkbenchTodoSource {
	private ledger: TodoLedger | null = null;
	private sessionId: string | null = null;
	private todoPath: string | null = null;
	private ledgerSubscription: (() => void) | null = null;
	private readonly listeners = new Set<(snapshot: TodoDocument | null) => void>();
	private binding: Promise<void> = Promise.resolve();

	public constructor(
		private readonly workspace: ProjectWorkspace,
		private readonly factories: ProjectWorkbenchSessionFactories,
	) {}

	public get snapshot(): TodoDocument | null { return this.ledger?.snapshot ?? null; }

	public bindThread(threadId: string): Promise<void> {
		const sessionId = scopedTodoSessionId(threadId);
		const operation = this.binding.then(async () => {
			if (this.sessionId === sessionId) return;
			if (this.sessionId) throw new Error("Todo가 이미 다른 Native thread에 묶여 있습니다.");
			const todoPath = join(this.workspace.todosDirectory, sessionId, "Todo.md");
			const ledger = this.factories.createTodoLedger(
				sessionId,
				this.factories.createTodoStore(todoPath),
				this.factories.createSessionEvents(this.workspace.sessionsDirectory),
			);
			this.sessionId = sessionId;
			this.todoPath = todoPath;
			this.ledger = ledger;
			this.ledgerSubscription = ledger.subscribe((snapshot) => this.emit(snapshot));
			try {
				await ledger.initialize();
			} catch (error) {
				this.ledgerSubscription?.();
				ledger.dispose();
				this.ledgerSubscription = null;
				this.ledger = null;
				this.sessionId = null;
				this.todoPath = null;
				throw error;
			}
		});
		this.binding = operation.catch(() => undefined);
		return operation;
	}

	public subscribe(listener: (snapshot: TodoDocument | null) => void): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	public syncNativePlan(flow: WorkFlowProjection): Promise<TodoDocument> {
		if (!flow.source) throw new Error("Native plan source authority is required for Todo sync");
		return this.requireLedger().syncNativePlan(flow);
	}
	public create(title: string, items: readonly string[], storyId?: string): Promise<TodoDocument> { return this.requireLedger().create(title, items, storyId); }
	public add(content: string, placement: "now" | "after"): Promise<TodoDocument> { return this.requireLedger().add(content, placement); }
	public addDetails(itemId: string, details: readonly string[]): Promise<TodoDocument> { return this.requireLedger().addDetails(itemId, details); }
	public start(itemId: string): Promise<TodoDocument> { return this.requireLedger().start(itemId); }
	public complete(itemId: string): Promise<TodoDocument> { return this.requireLedger().complete(itemId); }
	public block(itemId: string): Promise<TodoDocument> { return this.requireLedger().block(itemId); }
	public reopen(itemId: string): Promise<TodoDocument> { return this.requireLedger().reopen(itemId); }
	public recordEvidence(evidenceId: string): Promise<TodoDocument | null> { return this.requireLedger().recordEvidence(evidenceId); }

	public async importLegacy(): Promise<string | null> {
		const ledger = this.requireLedger();
		const todoPath = this.todoPath!;
		const imported = await this.factories.importLegacyTodo(this.workspace.legacyTodoPath, todoPath);
		if (imported) await ledger.initialize();
		return imported;
	}

	public dispose(): void {
		this.ledgerSubscription?.();
		this.ledgerSubscription = null;
		this.ledger?.dispose();
		this.ledger = null;
		this.listeners.clear();
	}

	private requireLedger(): TodoLedger {
		if (!this.ledger) throw new Error("Todo는 첫 질문으로 Native 세션이 시작된 뒤 사용할 수 있습니다.");
		return this.ledger;
	}

	private emit(snapshot: TodoDocument | null): void {
		for (const listener of this.listeners) {
			try { listener(snapshot); } catch { /* A view cannot break Todo state. */ }
		}
	}
}

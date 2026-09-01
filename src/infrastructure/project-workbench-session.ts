import { join } from "node:path";
import { ProjectWorkbench, type ProjectWorkbenchOptions, type WorkbenchActivityJournal, type WorkbenchTNoteSource } from "../application/project-workbench.js";
import type { NativeHarnessPort } from "../application/native-harness.js";
import type { ComposerDraftController, SessionRepository, TodoStore } from "../application/ports.js";
import { TNoteService } from "../application/t-note-service.js";
import type { ActivityNarrator } from "../application/activity-narrator.js";
import { TodoLedger } from "../application/todo-ledger.js";
import { CanonicalPromotionService } from "../application/canonical-promotion.js";
import { ReviewService } from "../application/review-service.js";
import { DEFAULT_SETTINGS } from "../domain/model-settings.js";
import { digestActivitySource, ActivityJournalStore } from "./activity-journal-store.js";
import { CodexAppServer } from "./codex-app-server.js";
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
import { createReviewAdapters, PiReviewGenerationClient, sha256ReviewDigest } from "./review-adapters.js";
import { FileReviewProvenanceStore } from "./review-store.js";

const WORKBENCH_LEASE_ID = "workbench";

export interface ProjectWorkbenchSessionOptions {
	resumeThreadId?: string;
	model?: string;
}

export interface ProjectWorkbenchSession {
	workspace: ProjectWorkspace;
	projectId: string;
	workbench: ProjectWorkbench;
	composerDraft: ComposerDraftController;
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
	connectNative(): Promise<NativeHarnessPort>;
	createJournal(directory: string): WorkbenchActivityJournal;
	createTodoStore(path: string): TodoStore;
	createTodoLedger(sessionId: string, store: TodoStore, events: SessionRepository): TodoLedger;
	importLegacyTodo(legacyPath: string, canonicalPath: string): Promise<string | null>;
	createSessionEvents(directory: string): SessionRepository;
	createTNoteSource(directory: string, model: string): WorkbenchTNoteSource;
	createActivityNarrator(): ActivityNarrator;
	createPromotionService(root: string): CanonicalPromotionService;
	createReviewService(runtimeDirectory: string): ReviewService;
	createWorkbench(native: NativeHarnessPort, journal: WorkbenchActivityJournal, options: ProjectWorkbenchOptions): ProjectWorkbench;
	createComposerDraft(root: string, sessionId: string, directory: string): Promise<ComposerDraftController>;
}

const productionFactories: ProjectWorkbenchSessionFactories = {
	openWorkspace: FileProjectWorkspace.open,
	acquireWriterLease: FileProjectWorkspace.acquireSessionLease,
	connectNative: () => CodexAppServer.connect(),
	createJournal: (directory) => new ActivityJournalStore(directory),
	createTodoStore: (path) => new FileTodoStore(path),
	createTodoLedger: (sessionId, store, events) => new TodoLedger(sessionId, store, events),
	importLegacyTodo,
	createSessionEvents: (directory) => new SessionEventStore(directory),
	createTNoteSource: (directory, model) => {
		const store = new FileTNoteStore(directory);
		const generator = new PiDetachedCodexGenerator(createModelRegistry(new FileCredentialStore()), model);
		return new TNoteService(generator, store);
	},
	createActivityNarrator: () => new PiActivityNarrator(createModelRegistry(new FileCredentialStore())),
	createPromotionService: (root) => new CanonicalPromotionService(new FileCanonicalDocumentStore(root)),
	createReviewService: (runtimeDirectory) => {
		const registry = createModelRegistry(new FileCredentialStore());
		return new ReviewService(
			createReviewAdapters(new PiReviewGenerationClient(registry)),
			sha256ReviewDigest,
			new FileReviewProvenanceStore(join(runtimeDirectory, "review-provenance.jsonl")),
		);
	},
	createWorkbench: (native, journal, options) => new ProjectWorkbench(native, journal, options),
	// Keep the class receiver: passing the static method itself loses `this`.
	createComposerDraft: (root, sessionId, directory) => FileComposerDraftController.create(root, sessionId, directory),
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
	const lease = await factories.acquireWriterLease(workspace, WORKBENCH_LEASE_ID);
	let native: NativeHarnessPort | undefined;
	let ledger: TodoLedger | undefined;
	let workbench: ProjectWorkbench | undefined;
	let released = false;
	const release = async (): Promise<void> => {
		if (released) return;
		released = true;
		ledger?.dispose();
		await lease.release();
	};
	try {
		const projectId = scopedProjectId(workspace.root);
		const journal = factories.createJournal(join(workspace.runtimeDirectory, "activity"));
		const todoStore = factories.createTodoStore(workspace.canonicalTodoPath);
		ledger = factories.createTodoLedger(WORKBENCH_LEASE_ID, todoStore, factories.createSessionEvents(workspace.sessionsDirectory));
		await ledger.initialize();
		const todos = workbenchTodoSource(ledger, async () => {
			const imported = await factories.importLegacyTodo(workspace.legacyTodoPath, workspace.canonicalTodoPath);
			if (imported) await ledger!.initialize();
			return imported;
		});
		native = await factories.connectNative();
		const tnotes = factories.createTNoteSource(workspace.draftsDirectory, options.model ?? DEFAULT_SETTINGS.model);
		const narrator = factories.createActivityNarrator();
		workbench = factories.createWorkbench(native, journal, {
			projectId,
			provider: "openai-codex",
			cwd: workspace.root,
			model: options.model,
			approvalPolicy: "on-request",
			sandbox: "workspace-write",
			resumeThreadId: options.resumeThreadId,
			todos,
			tnotes,
			narrator,
			promotions: factories.createPromotionService(workspace.root),
			reviews: factories.createReviewService(workspace.runtimeDirectory),
		});
		const composerDraft = await factories.createComposerDraft(workspace.root, WORKBENCH_LEASE_ID, workspace.draftsDirectory);
		return {
			workspace,
			projectId,
			workbench,
			composerDraft,
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

function workbenchTodoSource(ledger: TodoLedger, importLegacy: () => Promise<string | null>) {
	return {
		get snapshot() { return ledger.snapshot; },
		subscribe: ledger.subscribe.bind(ledger),
		syncNativePlan: ledger.syncNativePlan.bind(ledger),
		create: ledger.create.bind(ledger),
		add: ledger.add.bind(ledger),
		addDetails: ledger.addDetails.bind(ledger),
		start: ledger.start.bind(ledger),
		complete: ledger.complete.bind(ledger),
		block: ledger.block.bind(ledger),
		reopen: ledger.reopen.bind(ledger),
		recordEvidence: ledger.recordEvidence.bind(ledger),
		importLegacy,
	};
}

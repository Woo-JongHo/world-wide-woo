import { createLocalWorkflow }                        from "@/adapters/outbound/development/local-workflow.js";
import type { DevelopmentService }                    from "@/core/application/development/development-service";
import { createDevelopmentService }                   from "@/adapters/outbound/development/development-cli";
import { randomUUID }                                 from "node:crypto";
import { join }                                       from "node:path";
import { stat }                                       from "node:fs/promises";
import { McpLinearProjectDashboard }                  from "@/adapters/outbound/workspace/linear-project-dashboard.js";
import { ProjectWorkbench }                           from "@/core/application/orchestration/project-workbench.js";
import type {
	ProjectWorkbenchOptions,
	WorkbenchActivityJournal,
	WorkbenchTNoteSource,
	WorkbenchTodoSource,
} from "@/core/application/orchestration/project-workbench.js";
import type { ExecutorPort }                          from "@/core/ports/execution/executor-port.js";
import type { UsageMonitor }                          from "@/core/ports/observability/usage-monitor-port";
import type { ComposerDraftController }               from "@/core/ports/persistence/composer-draft-port";
import type { SessionRepository }                     from "@/core/ports/persistence/session-repository";
import type { TodoStore }                             from "@/core/ports/persistence/todo-store";
import { TNoteService }                               from "@/core/application/work/t-note-service.js";
import type { ActivityNarrator }                      from "@/core/application/orchestration/activity-narrator.js";
import { WooEntry }                                   from "@/core/application/orchestration/woo-entry.js";
import { SessionModelUsageAccumulator }               from "@/core/application/session/session-model-usage.js";
import type { SessionModelUsageObservation }          from "@/core/application/session/session-model-usage.js";
import {
	ThreadScopedActivityJournal,
	ThreadScopedTNoteSource as CoreThreadScopedTNoteSource,
	ThreadScopedTodoSource,
} from "@/core/application/session/thread-scope-policy.js";
import type { NativeThreadScope }                     from "@/core/application/session/thread-scope-policy.js";
import { FileSkillRegistry }                          from "@/adapters/outbound/workspace/file-skill-registry.js";
import type { SkillRegistrySnapshot }                 from "@/core/skills/skill-registry.js";
import { TodoLedger }                                 from "@/core/application/work/todo-ledger.js";
import type { WorkbenchModelSelection }               from "@/core/domain/work/workbench.js";
import { CanonicalPromotionService }                  from "@/core/application/work/canonical-promotion.js";
import { ReviewService }                              from "@/core/application/review/review-service.js";
import {
	digestActivitySource,
	ActivityJournalStore,
	nativeThreadJournalKey,
} from "@/adapters/outbound/persistence/activity-journal-store.js";
import type { ActivityJournalCacheTelemetry }         from "@/adapters/outbound/persistence/activity-journal-store.js";
import { FileTraceStore }                             from "@/adapters/outbound/persistence/trace-store.js";
import { FileRequestProjectionStore }                 from "@/adapters/outbound/persistence/request-projection-store";
import { createNativeHarness }                        from "@/adapters/outbound/execution/factory.js";
import type { ExecutionLane, NativeHarnessSelection } from "@/adapters/outbound/execution/factory.js";
import { FileComposerDraftController }                from "@/adapters/outbound/persistence/composer-draft-store.js";
import { PiDetachedCodexGenerator }                   from "@/adapters/outbound/execution/detached-codex-generator.js";
import { PiActivityNarrator }                         from "@/adapters/outbound/execution/pi-activity-narrator.js";
import { FileCredentialStore }                        from "@/adapters/outbound/authentication/credential-store.js";
import { createModelRegistry }                        from "@/adapters/outbound/authentication/model-router.js";
import { FileProjectWorkspace }                       from "@/adapters/outbound/workspace/project-workspace.js";
import type { ProjectWorkspace, SessionLease }        from "@/adapters/outbound/workspace/project-workspace.js";
import { SessionEventStore }                          from "@/adapters/outbound/persistence/session-store.js";
import { FileTNoteStore }                             from "@/adapters/outbound/persistence/t-note-store.js";
import { FileTodoStore, importLegacyTodo }            from "@/adapters/outbound/persistence/todo-store.js";
import { FileCanonicalDocumentStore }                 from "@/adapters/outbound/persistence/canonical-document-store.js";
import {
	createProductionReviewAdapters,
	installedClaudeCliVersion,
	PiReviewGenerationClient,
	sha256ReviewDigest,
} from "@/adapters/outbound/review/review-adapters.js";
import { FileReviewProvenanceStore }                  from "@/adapters/outbound/review/review-store.js";
import { UsageService }                               from "@/adapters/outbound/observability/usage-service.js";
import { WesEntryCollector }                          from "@/adapters/outbound/execution/wes-entry-collector.js";
import { loadWorkbenchConfigWithSource }              from "@/adapters/outbound/workspace/workbench-config.js";
import { DEFAULT_WORKBENCH_CONFIG }                   from "@/core/domain/execution/workbench-config.js";
import type { WorkbenchConfig }                       from "@/core/domain/execution/workbench-config.js";
import type { RequestRuntimeMode }                    from "@/core/application/orchestration/request-runtime-mode.js";

const WORKBENCH_RUN_PREFIX = "workbench";
/** Compatibility export; the source of truth is the validated config default. */
export const DEFAULT_TNOTE_MODEL = DEFAULT_WORKBENCH_CONFIG.tnote.model;

export interface ProjectWorkbenchSessionOptions {
	/** Opt-in brokered tools; callers must provide explicit capability authority. Not strict isolation. */
	requestCapabilities?      : ProjectWorkbenchOptions["requestCapabilities"]                                                                       ;
	requestCapabilityFactory? : (native: ExecutorPort, threadId: () => string | null) => NonNullable<ProjectWorkbenchOptions["requestCapabilities"]> ;
	requestRuntimeMode?       : RequestRuntimeMode                                                                                                   ;
	resumeThreadId?           : string                                                                                                               ;
	executionLane?            : ExecutionLane                                                                                                        ;
	provider?                 : string                                                                                                               ;
	/** WWW-owned instructions for the optional embedded Pi execution lane. */
	systemPrompt? : string ;
	model?        : string ;
	effort?       : string ;
	/** Opt in to local WES policy collection and Chat context injection. */
	enableWooEntry?: boolean;
	/** Refined plan activity is enabled by default; explicit false disables auxiliary interpretation. */
	enableActivityNarrator?: boolean;
	persistModelSelection?: (selection: WorkbenchModelSelection, catalog: import("@/core/domain/execution/model-settings").NativeModelCatalog) => Promise<void>;
}

export interface ProjectWorkbenchSession {
	workspace     : ProjectWorkspace        ;
	projectId     : string                  ;
	workbench     : ProjectWorkbench        ;
	development?  : DevelopmentService      ;
	composerDraft : ComposerDraftController ;
	usage         : UsageMonitor            ;
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
	createLocalWorkflow?(root: string): NonNullable<ProjectWorkbenchOptions["localWorkflow"]>;
	openWorkspace     (cwd: string                            ): Promise<ProjectWorkspace>;
	acquireWriterLease(workspace: ProjectWorkspace, id: string): Promise<SessionLease>;
	connectNative     (input: NativeHarnessSelection          ): Promise<ExecutorPort>;
	createJournal     (directory: string                      ): WorkbenchActivityJournal;
	createRequestProjection?(directory: string): NonNullable<ProjectWorkbenchOptions["requestProjection"]>;
	createTodoStore    (path: string                                                                                        ): TodoStore;
	createTodoLedger   (sessionId: string, store: TodoStore, events: SessionRepository                                      ): TodoLedger;
	importLegacyTodo   (legacyPath: string, targetPath: string                                                              ): Promise<string | null>;
	createSessionEvents(directory: string                                                                                   ): SessionRepository;
	createTNoteSource  (directory: string, model: string, observeUsage?: (observation: SessionModelUsageObservation) => void): WorkbenchTNoteSource;
	createActivityNarrator?(model: string): ActivityNarrator;
	createPromotionService(root: string                                                                                                          ): CanonicalPromotionService;
	createReviewService   (runtimeDirectory: string, observeUsage?: (observation: SessionModelUsageObservation) => void, config?: WorkbenchConfig): ReviewService;
	createWorkbench       (native: ExecutorPort, journal: WorkbenchActivityJournal, options: ProjectWorkbenchOptions                             ): ProjectWorkbench;
	createComposerDraft   (root: string, sessionId: string, directory: string                                                                    ): Promise<ComposerDraftController>;
	createUsageMonitor    (native: ExecutorPort                                                                                                  ): UsageMonitor;
	createWooEntry        ()                                                                                                                      : WooEntry;
	loadSkillRegistry     (root: string                                                                                                          ): Promise<SkillRegistrySnapshot | undefined>;
	createDevelopment?(root: string, runId: string): DevelopmentService;
}

interface WorkbenchExecutionSelection {
	readonly provider : string ;
	readonly model    : string ;
	readonly effort   : string ;
}

function resolveExecutionSelection(
	options: ProjectWorkbenchSessionOptions,
	config: WorkbenchConfig,
): WorkbenchExecutionSelection {
	if (options.executionLane === "pi" && (!options.provider || !options.model || !options.effort)) {
		throw new Error("Pi execution lane requires explicit provider, model, and effort");
	}
	return {
		provider : options.provider ?? config.execution.provider,
		model    : options.model ?? config.execution.model,
		effort   : options.effort ?? config.execution.effort,
	};
}

function nativeHarnessSelection(
	options: ProjectWorkbenchSessionOptions,
	execution: WorkbenchExecutionSelection,
): NativeHarnessSelection {
	return {
		...execution,
		...(options.executionLane === undefined ? {} : { executionLane: options.executionLane }),
		...(options.systemPrompt === undefined ? {} : { systemPrompt: options.systemPrompt }),
	};
}

function reviewAdapterOptions(config: WorkbenchConfig): Parameters<typeof createProductionReviewAdapters>[1] {
	return {
		claudeCliVersion: installedClaudeCliVersion,
		// Claude is optional until its review transport is explicitly used.
		...(config.review.provider === "anthropic" ? { anthropic: { model: config.review.model } } : {}),
		...(config.review.provider === "google" ? { google: { model: config.review.model } } : {}),
	};
}

function nativeAccountUsageReader(
	native: ExecutorPort,
): (() => ReturnType<NonNullable<ExecutorPort["readAccountUsage"]>>) | undefined {
	const readAccountUsage = native.readAccountUsage;
	return readAccountUsage === undefined ? undefined : () => readAccountUsage.call(native);
}

function localWorkflowOptions(
	createLocalWorkflow: ProjectWorkbenchSessionFactories["createLocalWorkflow"],
	root: string,
): Pick<ProjectWorkbenchOptions, "localWorkflow"> {
	if (createLocalWorkflow === undefined) return {};
	let workflow: NonNullable<ProjectWorkbenchOptions["localWorkflow"]> | undefined;
	const getWorkflow = (): NonNullable<ProjectWorkbenchOptions["localWorkflow"]> => {
		workflow ??= createLocalWorkflow(root);
		return workflow;
	};
	return {
		localWorkflow: {
			run     : processId => getWorkflow().run(processId),
			resume  : runId => getWorkflow().resume(runId),
			inspect : runId => getWorkflow().inspect(runId),
		},
	};
}

const productionFactories: ProjectWorkbenchSessionFactories = {
	createLocalWorkflow,
	openWorkspace           : FileProjectWorkspace.open,
	acquireWriterLease      : FileProjectWorkspace.acquireSessionLease,
	connectNative           : createNativeHarness,
	createJournal           : (directory) => new ActivityJournalStore(directory),
	createRequestProjection : directory => new FileRequestProjectionStore(join(directory, "requests")),
	createTodoStore         : (path) => new FileTodoStore(path),
	createTodoLedger        : (sessionId, store, events) => new TodoLedger(sessionId, store, events),
	importLegacyTodo,
	createSessionEvents: (directory) => new SessionEventStore(directory),
	createTNoteSource: (directory, model, observeUsage) => {
		const store = new FileTNoteStore(directory);
		const generator = new PiDetachedCodexGenerator(createModelRegistry(new FileCredentialStore()), model, model, observeUsage);
		return new TNoteService(generator, store);
	},
	createActivityNarrator: (model) => new PiActivityNarrator(createModelRegistry(new FileCredentialStore()), model),
	createPromotionService: (root) => new CanonicalPromotionService(new FileCanonicalDocumentStore(root)),
	createReviewService: (runtimeDirectory, observeUsage, config = DEFAULT_WORKBENCH_CONFIG) => {
		const registry = createModelRegistry(new FileCredentialStore());
		return new ReviewService(
			createProductionReviewAdapters(
				new PiReviewGenerationClient(registry, observeUsage),
				reviewAdapterOptions(config),
			),
			sha256ReviewDigest,
			new FileReviewProvenanceStore(join(runtimeDirectory, "review-provenance.jsonl")),
		);
	},
	createWorkbench: (native, journal, options) => new ProjectWorkbench(native, journal, options),
	// Keep the class receiver: passing the static method itself loses `this`.
	createComposerDraft: (root, sessionId, directory) => FileComposerDraftController.create(root, sessionId, directory),
	createUsageMonitor: (native) => {
		const credentials = new FileCredentialStore();
		return new UsageService(
			credentials,
			createModelRegistry(credentials),
			fetch,
			Date.now,
			undefined,
			undefined,
			nativeAccountUsageReader(native),
		);
	},
	createWooEntry    : () => new WooEntry(new WesEntryCollector()),
	loadSkillRegistry : async (root) => await existingDirectory(join(root, ".agents/skills")) ? new FileSkillRegistry(root).load() : undefined,
	createDevelopment : (projectRoot, runId) => createDevelopmentService({ projectRoot, runId }),
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
	const factories = { ...productionFactories, ...overrides }             ;
	const workspace = await factories.openWorkspace(cwd)                   ;
	const runId     = `${WORKBENCH_RUN_PREFIX}-${randomUUID()}`            ;
	const lease     = await factories.acquireWriterLease(workspace, runId) ;
	let threadLease : SessionLease | undefined                             ;
	let native      : ExecutorPort | undefined                             ;
	let todos       : ThreadScopedTodoSource | undefined                   ;
	let workbench   : ProjectWorkbench | undefined                         ;
	let development : DevelopmentService | undefined                       ;
	let released    = false                                                ;
	const release = async (): Promise<void> => {
		if (released) return;
		released = true;
		todos?.dispose();
		try {
			await development?.close();
		} finally {
			try { await threadLease?.release(); } finally { await lease.release(); }
		}
	};
	try {
		const projectId    = scopedProjectId(workspace.root)                                                          ;
		const loadedConfig = await loadWorkbenchConfigWithSource(workspace.root)                                      ;
		const config       = loadedConfig.config                                                                      ;
		const traceRoot    = await existingDirectory(workspace.todosDirectory) ? workspace.todosDirectory : undefined ;
		const journal = new ThreadBoundActivityJournal(
			factories.createJournal(join(workspace.runtimeDirectory, "activity")),
			traceRoot,
			options.resumeThreadId ? undefined : `request-intake-${runId}`,
		);
		if (options.resumeThreadId) await journal.bindThread(options.resumeThreadId);
		const todoSource = new ThreadScopedTodoSource(resolveNativeThreadScope, scope => {
			const todoPath = join(workspace.todosDirectory, scope.workId, "Todo.md");
			const ledger   = factories.createTodoLedger(
				scope.workId,
				factories.createTodoStore(todoPath),
				factories.createSessionEvents(workspace.sessionsDirectory),
			);
			return {
				ledger,
				importLegacy: () => factories.importLegacyTodo(workspace.legacyTodoPath, todoPath),
			};
		});
		todos = todoSource;
		const auxiliaryUsage        = new SessionModelUsageAccumulator()                                                       ;
		const observeAuxiliaryUsage = (observation: SessionModelUsageObservation): void => auxiliaryUsage.observe(observation) ;
		const execution             = resolveExecutionSelection(options, config)                                               ;
		const connectedNative       = await factories.connectNative(nativeHarnessSelection(options, execution))                ;
		native = connectedNative;
		const tnotes = new ThreadScopedTNoteSource(
			factories.createTNoteSource(workspace.draftsDirectory, config.tnote.model, observeAuxiliaryUsage),
		);
		const narrator = options.enableActivityNarrator !== false ? factories.createActivityNarrator?.(config.narrator.model) : undefined;
		// WES is an optional local policy source. Ordinary Chat sessions must not
		// collect it or expose a WES loading/blocked state.
		const wooEntry        = options.enableWooEntry ? factories.createWooEntry() : undefined ;
		const skillRegistry   = await factories.loadSkillRegistry(workspace.root)               ;
		const linearDashboard = await createLinearDashboard(connectedNative, config.linear)     ;
		development = factories.createDevelopment?.(workspace.root, runId);
		const activeDevelopment = development;
		const localWorkflow = localWorkflowOptions(factories.createLocalWorkflow, workspace.root);
		const requestCapabilities = options.requestCapabilityFactory?.(
			connectedNative,
			() => workbench?.snapshot.threadId ?? null,
		) ?? options.requestCapabilities;
		const workbenchOptions: ProjectWorkbenchOptions = {
			projectId,
			provider                   : execution.provider,
			cwd                        : workspace.root,
			model                      : execution.model,
			effort                     : execution.effort,
			contextCharacterLimit      : config.limits.contextCharacters,
			delegationDetailActivities : config.delegation.detailActivities,
			evaluationRequired         : config.evaluation.requireVerification,
			configurationSource        : loadedConfig.source,
			tnoteVisibleLimit          : config.display.tnoteVisibleLimit,
			tnoteSummaryMaxChars       : config.display.tnoteSummaryMaxChars,
			tnoteSummaryMaxLines       : config.display.tnoteSummaryMaxLines,
			hud                        : config.hud,
			slash                      : config.slash,
			activityJournalProjectId   : runId,
			approvalPolicy             : config.execution.approvalPolicy,
			sandbox                    : config.execution.sandbox,
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
			todos: todoSource,
			tnotes,
			promotions: factories.createPromotionService(workspace.root),
			reviews: factories.createReviewService(workspace.runtimeDirectory, observeAuxiliaryUsage, config),
			auxiliaryUsage,
			...(requestCapabilities === undefined ? {} : { requestCapabilities }),
			...(options.requestRuntimeMode === undefined ? {} : { requestRuntimeMode: options.requestRuntimeMode }),
			...(factories.createRequestProjection === undefined
				? {}
				: { requestProjection: factories.createRequestProjection(workspace.runtimeDirectory) }),
			...localWorkflow,
			...(activeDevelopment === undefined
				? {}
				: { developmentObserver: { capture: activity => activeDevelopment.observe(activity) } }),
			...(options.persistModelSelection === undefined
				? {}
				: { persistModelSelection: options.persistModelSelection }),
			...(options.resumeThreadId === undefined ? {} : { resumeThreadId: options.resumeThreadId }),
			...(narrator === undefined ? {} : { narrator }),
			...(wooEntry === undefined ? {} : { wooEntry }),
			...(skillRegistry === undefined ? {} : { skillRegistry }),
			...(linearDashboard === undefined ? {} : { linearDashboard }),
		};
		const activeWorkbench = factories.createWorkbench(connectedNative, journal, workbenchOptions);
		workbench = activeWorkbench;
		await activeWorkbench.waitUntilReady();
		const composerDraft = await factories.createComposerDraft(workspace.root, runId, workspace.draftsDirectory);
		const usage = factories.createUsageMonitor(connectedNative);
		return {
			workspace,
			projectId,
			workbench: activeWorkbench,
			...(activeDevelopment === undefined ? {} : { development: activeDevelopment }),
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

async function createLinearDashboard(native: ExecutorPort, linear: WorkbenchConfig["linear"]) {
	const caller = native as Partial<{ callMcpTool(input: { server: string; threadId: string; tool: string; arguments?: unknown }): Promise<{ content: readonly unknown[]; structuredContent?: unknown; isError?: boolean | null }> }>;
	if (typeof caller.callMcpTool !== "function") return undefined;
	if (!linear) return undefined;
	const dashboard = new McpLinearProjectDashboard(caller as Required<typeof caller>, linear);
	return { refresh: (threadId: string) => dashboard.refresh(threadId) };
}

export function scopedProjectId(projectRoot: string): string {
	return `project-${digestActivitySource(projectRoot).slice("sha256:".length, "sha256:".length + 24)}`;
}

async function existingDirectory(path: string): Promise<boolean> {
	try { return (await stat(path)).isDirectory(); } catch { return false; }
}

export function scopedTodoSessionId(nativeThreadId: string): string {
	if (typeof nativeThreadId !== "string" || nativeThreadId.trim().length === 0) throw new Error("Todo에는 Native thread id가 필요합니다.");
	return `native-${digestActivitySource(nativeThreadId).slice("sha256:".length, "sha256:".length + 32)}`;
}

function resolveNativeThreadScope(threadId: string): NativeThreadScope {
	return {
		threadId,
		journalId : nativeThreadJournalKey(threadId),
		workId    : scopedTodoSessionId(threadId),
	};
}

/**
 * The journal directory is shared by all workbench processes.  Its v1 stream
 * selection is exclusively derived from the native thread, never a run id.
 */
export class ThreadBoundActivityJournal extends ThreadScopedActivityJournal {
	public constructor(
		journal: WorkbenchActivityJournal,
		traceRoot?: string,
		intakeStreamId?: string,
	) {
		const source = journal as WorkbenchActivityJournal & {
			cacheTelemetry?(projectId: string): ActivityJournalCacheTelemetry;
		};
		const cacheTelemetry = source.cacheTelemetry?.bind(source);
		super(journal, resolveNativeThreadScope, {
			...(intakeStreamId === undefined ? {} : { intakeStreamId }),
			...(traceRoot === undefined
				? {}
				: { createTrace: scope => new FileTraceStore(join(traceRoot, scope.workId, "Tracer.md")) }),
			...(cacheTelemetry === undefined
				? {}
				: { cacheTelemetry }),
		});
	}
}

/** @Unit Code-005 */
/** @codeId 0005 */
class ThreadScopedTNoteSource extends CoreThreadScopedTNoteSource {
	public constructor(source: WorkbenchTNoteSource) {
		super(source, resolveNativeThreadScope);
	}
}

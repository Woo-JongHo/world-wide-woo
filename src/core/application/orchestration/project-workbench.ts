/** @linear WOO-688 WOO-690 WOO-691 */
import { AsyncLocalStorage }                                          from "node:async_hooks";
import { createHash, randomUUID }                                     from "node:crypto";
import type { ExecutorPort }                                          from "@/core/ports/execution/executor-port.js";
import type { CanonicalPromotionService }                             from "@/core/application/work/canonical-promotion.js";
import type { ReviewService }                                         from "@/core/application/review/review-service.js";
import type { ActivityNarrator }                                      from "@/core/application/orchestration/activity-narrator.js";
import type { SessionModelUsageSource }                               from "@/core/application/session/session-model-usage.js";
import { TodoWriteConflictError }                                     from "@/core/application/work/todo-ledger.js";
import type { WooEntry }                                              from "@/core/application/orchestration/woo-entry.js";
import type { SkillRegistrySnapshot }                                 from "@/core/skills/skill-registry.js";
import { ContextComposer }                                            from "@/core/application/orchestration/context-composer.js";
import { requestProtocolContext }                                     from "@/core/application/orchestration/request-protocol";
import { RequestController, REQUEST_RUNTIME_TOOLS }                   from "@/core/application/orchestration/request-controller";
import type { RequestActionApproval, RequestActionCapability }        from "@/core/ports/execution/request-action-port";
import type { RuntimeToolCall }                                       from "@/core/ports/execution/runtime-tool-port";
import { RequestRuntimePolicy }                                       from "@/core/application/orchestration/request-runtime-mode.js";
import type { RequestRuntimeMode }                                    from "@/core/application/orchestration/request-runtime-mode.js";
import { REQUEST_REPORT_PREFIX }                                      from "@/core/domain/execution/request-runtime";
import type { RequestRuntimeRecord }                                  from "@/core/domain/execution/request-runtime";
import type { RequestProjectionPort }                                 from "@/core/ports/execution/request-projection-port";
import { ApprovalResponseDispatcher }                                 from "@/core/application/orchestration/approval-dispatch.js";
import { SessionUsageTracker }                                        from "@/core/application/session/session-usage-tracker.js";
import type {
	BackgroundWorkState,
	NativeApprovalPolicy,
	NativeApprovalRequest,
	NativeRefs,
	NativeSandboxMode,
	NativeThreadStart,
	NativeUncertainOperation,
} from "@/core/domain/execution/native-session.js";
import { projectBackgroundWorkState }                                 from "@/core/domain/execution/native-session.js";
import {
	fallbackNativeModelCatalog,
	nativeModelNames,
	nativeModelEfforts,
} from "@/core/domain/execution/model-settings.js";
import type { NativeModelCatalog }                                    from "@/core/domain/execution/model-settings.js";
import { isTerminalActivityPhase }                                    from "@/core/domain/execution/project-activity.js";
import type {
	ProjectActivity,
	ProjectActivityAppendResult,
	ProjectActivityInput,
	ProjectActivityKind,
	ProjectActivityPhase,
} from "@/core/domain/execution/project-activity.js";
import { sanitizeTerminalTextExcerpt, sanitizeTerminalTextUnbounded } from "@/core/domain/execution/terminal.js";
import type { TodoDocument, TodoNativePlanBinding }                   from "@/core/domain/work/todos.js";
import type { DplanHash, WorkFlowProjection }                         from "@/core/domain/work/index.js";
import { projectExecutionActivity }                                   from "@/core/runtime/execution-run.js";
import type { ExecutionRunState }                                     from "@/core/runtime/execution-run.js";
import type { TNoteActivitySource, TNoteDraft, TNoteSourceRange }     from "@/core/domain/work/t-notes.js";
import type {
	WorkbenchChatMessage,
	WorkbenchActionResult,
	WorkbenchCollaborationMode,
	WorkbenchCommand,
	WorkbenchCommandReceipt,
	WorkbenchListener,
	WorkbenchMcpServer,
	WorkbenchModelSelection,
	WorkbenchPermissionMode,
	WorkbenchSessionGoal,
	WorkbenchSnapshot,
} from "@/core/domain/work/workbench.js";
import { workbenchApprovalDecisions }                                 from "@/core/domain/work/workbench.js";
import { resolveActivitySelection, resolveTraceSelection }            from "@/core/domain/work/trace-selection.js";
import type { ActivitySelectionResult }                               from "@/core/domain/work/trace-selection.js";
import { EMPTY_LINEAR_PROJECT_DASHBOARD }                             from "@/core/domain/work/linear-dashboard.js";
import type { LinearProjectDashboard }                                from "@/core/domain/work/linear-dashboard.js";
import { projectPerformance }                                         from "@/core/domain/work/performance.js";
import { projectNativeEvidence }                                      from "@/core/application/orchestration/native-event-projection.js";
import type { CacheLayerObservation }                                 from "@/core/domain/observability/cache-telemetry.js";
import { LayerPerformanceRecorder }                                   from "@/core/domain/observability/layer-performance.js";
import type {
	PerformanceBoundary,
	PerformanceLayerId,
	PerformanceTrace,
	PerformanceWindow,
} from "@/core/domain/observability/layer-performance.js";
import {
	SESSION_GOAL_CHARACTER_LIMIT,
	projectSessionGoal,
	record,
	stableJson,
} from "@/core/application/orchestration/workbench-projections.js";
import { NativeStreamProjection }                                     from "@/core/application/orchestration/native-stream-projection.js";
import { WorkbenchDurableProjection }                                 from "@/core/application/orchestration/workbench-durable-projection.js";
import { NativeTurnCoordinator }                                      from "@/core/application/orchestration/native-turn-coordinator.js";
import type { BlockedChatDeliveryState }                              from "@/core/application/orchestration/native-turn-coordinator.js";
import { WorkbenchCommandHandlers }                                   from "@/core/application/orchestration/workbench-command-handlers.js";
import type { WorkbenchMcpManagement }                                from "@/core/application/orchestration/workbench-command-handlers.js";
import { NativeEventLifecycle }                                       from "@/core/application/orchestration/native-event-lifecycle.js";
import { WorkbenchCacheProjection }                                   from "@/core/application/orchestration/workbench-cache-projection.js";
import { WorkbenchWorkflowCoordinator }                               from "@/core/application/orchestration/workbench-workflow-coordinator.js";
import { WorkbenchJournalCoordinator }                                from "@/core/application/orchestration/workbench-journal-coordinator.js";
import { WorkbenchNoteNarration }                                     from "@/core/application/orchestration/workbench-note-narration.js";
import { WorkbenchThreadLifecycle }                                   from "@/core/application/orchestration/workbench-thread-lifecycle.js";

const dplanHash: DplanHash = {
	sha256Hex: (input) => createHash("sha256").update(input).digest("hex"),
};
const WORKBENCH_ACTION_RESULT_CHARACTER_LIMIT = 12 * 1024;

interface ThreadCompactionPort {
	compactThread(input: { threadId: string }): Promise<void>;
}

export interface WorkbenchActivityJournal {
	append(input: ProjectActivityInput): Promise<ProjectActivityAppendResult>;
	readAll(projectId: string): Promise<ProjectActivity[]>;
	/** Optional read-only observation supplied by a bound persistence adapter. */
	cacheObservation?(): CacheLayerObservation | null;
	/** True once the journal owns a Native thread stream; appends fail before that. */
	hasBoundThread?(): boolean;
	/** Allows only durable request intake events before a Native thread exists. */
	readonly supportsRequestIntake?: boolean;
}

export interface WorkbenchTodoSource {
	readonly snapshot: TodoDocument | null;
	subscribe(listener: (snapshot: TodoDocument | null) => void): () => void;
	/** Binds the live board to the provider-issued Native thread identity. */
	bindThread?(threadId: string): Promise<void>;
	/** Optional Native-plan mirror. It must never block the interactive Chat path. */
	syncNativePlan?(flow: WorkFlowProjection, binding: TodoNativePlanBinding): Promise<TodoDocument>;
	syncRequestRuntime?(request: RequestRuntimeRecord): Promise<TodoDocument>;
	create        (title: string, items: readonly string[], storyId?: string): Promise<TodoDocument>;
	add           (content: string, placement: "now" | "after"              ): Promise<TodoDocument>;
	addDetails    (itemId: string, details: readonly string[]               ): Promise<TodoDocument>;
	start         (itemId: string                                           ): Promise<TodoDocument>;
	complete      (itemId: string                                           ): Promise<TodoDocument>;
	block         (itemId: string                                           ): Promise<TodoDocument>;
	reopen        (itemId: string                                           ): Promise<TodoDocument>;
	recordEvidence(evidenceId: string                                       ): Promise<TodoDocument | null>;
	importLegacy  ()                                                         : Promise<string | null>;
}

export interface WorkbenchTNoteSource {
	/** Binds Note history to the provider-issued Native thread identity. */
	bindThread?(threadId: string): Promise<void>;
	readAll(projectId: string): Promise<readonly TNoteDraft[]>;
	/** The adapter/generator owns its isolated cwd; Workbench never supplies the project root. */
	create(input: {
		projectId        : string                         ;
		range            : TNoteSourceRange               ;
		activities       : readonly TNoteActivitySource[] ;
		instruction      : string                         ;
		expectedQuestion : string                         ;
	}, signal?: AbortSignal): Promise<TNoteDraft>;
}

export interface ProjectWorkbenchOptions {
	/** Explicitly scoped capabilities. No ambient shell or publication authority. */
	requestCapabilities?: readonly RequestActionCapability[];
	/** Explicit session default. A /goal request promotes off to observe for that request only. */
	requestRuntimeMode?: RequestRuntimeMode;
	requestProjection?: RequestProjectionPort;
	/** Local preflight only; the implementation owns its persisted state and receipts. */
	localWorkflow?: {
		run(processId: string): Promise<{ readonly summary: string }>;
		resume(runId: string): Promise<{ readonly summary: string }>;
		inspect(runId: string): Promise<{ readonly summary: string }>;
	};
	/** Receives newly persisted public observations; it never owns Native execution state. */
	developmentObserver?: { capture(activity: ProjectActivity): void | Promise<void> };
	projectId: string;
	/** Local, per-process journal namespace. Defaults to the project identity. */
	activityJournalProjectId? : string                              ;
	provider?                 : string                              ;
	cwd                       : string                              ;
	model?                    : NativeThreadStart["model"]          ;
	effort?                   : NativeThreadStart["effort"]         ;
	approvalPolicy?           : NativeThreadStart["approvalPolicy"] ;
	sandbox?                  : NativeThreadStart["sandbox"]        ;
	resumeThreadId?           : string                              ;
	/** Acquires the caller-owned writable lease before resuming a thread. */
	acquireThreadLease? : (threadId: string) => Promise<void> ;
	todos?              : WorkbenchTodoSource                 ;
	tnotes?             : WorkbenchTNoteSource                ;
	promotions?         : CanonicalPromotionService           ;
	reviews?            : ReviewService                       ;
	narrator?           : ActivityNarrator                    ;
	wooEntry?           : WooEntry                            ;
	/** Revision-bound local Skill inventory supplied to every Native turn. */
	skillRegistry?         : SkillRegistrySnapshot                                                              ;
	auxiliaryUsage?        : SessionModelUsageSource                                                            ;
	persistModelSelection? : (selection: WorkbenchModelSelection, catalog: NativeModelCatalog) => Promise<void> ;
	/** Read-only connected Linear project source, called only through the owned Native thread. */
	linearDashboard?            : { refresh(threadId: string): Promise<LinearProjectDashboard> }                ;
	contextCharacterLimit?      : number                                                                        ;
	delegationDetailActivities? : number                                                                        ;
	evaluationRequired?         : boolean                                                                       ;
	configurationSource?        : "project-yaml" | "defaults"                                                   ;
	tnoteVisibleLimit?          : number                                                                        ;
	tnoteSummaryMaxChars?       : number                                                                        ;
	tnoteSummaryMaxLines?       : number                                                                        ;
	hud?                        : { readonly showUsage: boolean; readonly showContext: boolean }                ;
	slash?                      : { readonly mcp: boolean; readonly clear: boolean; readonly compact: boolean } ;
}

/** @Unit Code-002 */
/**
 * Coordinates native conversation state behind one application-owned boundary.
 * Native observations become visible only after their durable journal append.
 */
/** @codeId 0002 */
export class ProjectWorkbench {
	private readonly layerPerformance                                       = new LayerPerformanceRecorder()          ;
	private readonly performanceTraceContext                                = new AsyncLocalStorage<string>()         ;
	private performanceTraceSequence                                        = 0                                       ;
	private readonly cacheProjection                                        = new WorkbenchCacheProjection()          ;
	private readonly contextComposer   : ContextComposer                                                              ;
	private readonly listeners                                              = new Set<WorkbenchListener>()            ;
	private readonly activities        : ProjectActivity[]                  = []                                      ;
	private readonly visibleActivities : ProjectActivity[]                  = []                                      ;
	private readonly preThreadChat                                          = new Map<string, WorkbenchChatMessage>() ;
	private selectedActivityId         : string | null                      = null                                    ;
	private selectedAgentRef           : string | null                      = null                                    ;
	private recordingReadOnly                                               = false                                   ;
	private pendingApproval            : NativeApprovalRequest | null       = null                                    ;
	private selectedModel              : NativeThreadStart["model"]                                                   ;
	private modelCatalog                                                    = fallbackNativeModelCatalog()            ;
	private modelRefresh               : Promise<NativeModelCatalog> | null = null                                    ;
	private selectedEffort             : NativeThreadStart["effort"]                                                  ;
	private effectiveModel             : string                                                                       ;
	private effectiveEffort            : string | null                                                                ;
	private permissionMode             : WorkbenchPermissionMode                                                      ;
	private collaborationMode          : WorkbenchCollaborationMode         = "manual"                                ;
	private approvalPolicy             : NativeApprovalPolicy                                                         ;
	private sandbox                    : NativeSandboxMode                                                            ;
	private sessionGoal                : WorkbenchSessionGoal | null        = null                                    ;
	private contextTurnId              : string | null                      = null                                    ;
	private readonly usageTracker      : SessionUsageTracker                                                          ;
	private readonly processAttachedAt                                      = new Date().toISOString()                ;
	private threadId                   : string | null                      = null                                    ;
	private activeTurnId               : string | null                      = null                                    ;
	/** Last explicitly selected root turn; remains plan authority after terminal completion. */
	private selectedPlanTurnId: string | null = null;
	/** A submitted root question can update the public goal before Native confirms its turn id. */
	private pendingPlanGoalActivityId          : string | null                                           = null                             ;
	private todo                               : TodoDocument | null                                                                        ;
	private error                              : string | null                                           = null                             ;
	private developmentRecordingError          : string | null                                           = null                             ;
	private readonly nativeStream                                                                        = new NativeStreamProjection()     ;
	private actionResult                       : WorkbenchActionResult | null                            = null                             ;
	private mcpServers                         : readonly WorkbenchMcpServer[]                           = Object.freeze([])                ;
	private linearDashboard                    : LinearProjectDashboard                                  = EMPTY_LINEAR_PROJECT_DASHBOARD   ;
	private readonly nativeTurn                                                                          = new NativeTurnCoordinator()      ;
	private readonly durableProjection                                                                   = new WorkbenchDurableProjection() ;
	private visibleThreadId                    : string | null                                           = null                             ;
	private visibleAfterSequence                                                                         = 0                                ;
	private closed                                                                                       = false                            ;
	private revision                                                                                     = 0                                ;
	private current                            : WorkbenchSnapshot                                                                          ;
	private eventQueue                         : Promise<void>                                           = Promise.resolve()                ;
	private commandQueue                       : Promise<void>                                           = Promise.resolve()                ;
	private readonly ready                     : Promise<void>                                                                              ;
	private readonly approvalDispatcher        : ApprovalResponseDispatcher                                                                 ;
	private readonly requestController         : RequestController                                                                          ;
	private readonly unregisterRuntimeTools    : () => void                                                                                 ;
	private runtimePendingApproval                                                                       = false                            ;
	private runtimeApproval                    : { id: string; resolve(accepted: boolean): void } | null = null                             ;
	private readonly requestRuntimePolicy      : RequestRuntimePolicy                                                                       ;
	private readonly workflow                  : WorkbenchWorkflowCoordinator                                                               ;
	private readonly activityJournal           : WorkbenchJournalCoordinator                                                                ;
	private readonly noteNarration             : WorkbenchNoteNarration                                                                     ;
	private readonly threadLifecycle           : WorkbenchThreadLifecycle                                                                   ;
	private readonly commandHandlers           : WorkbenchCommandHandlers                                                                   ;
	private readonly nativeEvents              : NativeEventLifecycle                                                                       ;
	private readonly unsubscribeNative         : () => void                                                                                 ;
	private readonly unsubscribeTodo           : () => void                                                                                 ;
	private readonly unsubscribeAuxiliaryUsage : () => void                                                                                 ;

	public constructor(
		private readonly native: ExecutorPort,
		private readonly journal: WorkbenchActivityJournal,
		private readonly options: ProjectWorkbenchOptions,
	) {
		if (options.requestCapabilities !== undefined && !native.registerRuntimeTools) throw new Error("선택한 실행기는 Runtime tool request/response를 지원하지 않습니다.");
		this.requestRuntimePolicy = new RequestRuntimePolicy({
			...(options.requestRuntimeMode === undefined ? {} : { mode: options.requestRuntimeMode }),
			capabilitiesConfigured: options.requestCapabilities !== undefined,
			resuming: options.resumeThreadId !== undefined,
		});
		this.contextComposer = new ContextComposer(options.contextCharacterLimit);
		this.requestController = new RequestController({
			activities: () => this.activities,
			digest: digestSource,
			...(options.requestCapabilities === undefined ? {} : { capabilities: options.requestCapabilities }),
			requestApproval : (call, approval, signal) => this.requestActionApproval(call, approval, signal),
			canAct          : call => this.canActOn(call),
			canRecover      : call => this.canRecoverFrom(call),
			append          : (call, kind, phase, payload) => this.appendActivity(kind, phase, { threadId: call.threadId, turnId: call.turnId, itemId: call.callId }, payload, true),
		});
		this.unregisterRuntimeTools = (this.requestRuntimePolicy.brokered ? native.registerRuntimeTools?.(REQUEST_RUNTIME_TOOLS, async call => {
			await this.ready;
			await this.commandQueue;
			const result = this.eventQueue.then(() => this.requestController.handle(call));
			this.eventQueue = result.then(() => undefined);
			return result;
		}) : undefined) ?? (() => undefined);
		this.approvalDispatcher = new ApprovalResponseDispatcher({
			serializeEvidence: projectNativeEvidence,
			digestSource,
			record: async (entry) => { await this.appendActivity(entry.kind, entry.phase, entry.nativeRefs, entry.payload, true, entry.sourceDigest); },
			respondToApproval: (resolution) => this.native.respondToApproval(resolution),
		});
		this.selectedModel   = options.model            ;
		this.selectedEffort  = options.effort           ;
		this.effectiveModel  = options.model ?? "codex" ;
		this.effectiveEffort = options.effort ?? null   ;
		this.linearDashboard = options.linearDashboard
			? { ...EMPTY_LINEAR_PROJECT_DASHBOARD, state: "loading", error: null }
			: EMPTY_LINEAR_PROJECT_DASHBOARD;
		this.usageTracker = new SessionUsageTracker(Boolean(options.resumeThreadId));
		this.nativeEvents = new NativeEventLifecycle({
			closed             : () => this.closed,
			recordingReadOnly  : () => this.recordingReadOnly,
			hasBoundThread     : () => this.journal.hasBoundThread?.(),
			pendingApproval    : () => this.pendingApproval,
			setPendingApproval : approval => { this.pendingApproval = approval; },
			confirmApproval    : approval => this.approvalDispatcher.confirmNativeResolved(approval),
			threadId           : () => this.threadId,
			setThreadId        : threadId => { this.threadId = threadId; },
			activeTurnId       : () => this.activeTurnId,
			contextTurnId      : () => this.contextTurnId,
			setActiveTurnId    : turnId => { this.activeTurnId = turnId; },
			selectPlanTurn     : turnId => { this.selectedPlanTurnId = turnId; },
			setContextTurn     : turnId => this.setContextTurn(turnId),
			collaborationMode  : () => this.collaborationMode,
			effectiveModel     : () => this.effectiveModel,
			effectiveEffort    : () => this.effectiveEffort,
			usageTracker       : this.usageTracker,
			nativeTurn         : this.nativeTurn,
			nativeStream       : this.nativeStream,
			activities         : () => this.activities,
			visibleActivities  : () => this.visibleActivities,
			appendActivity     : (kind, phase, refs, payload, publish, sourceDigest) => this.appendActivity(kind, phase, refs, payload, publish, sourceDigest),
			setSessionGoal     : goal => { this.sessionGoal = goal; },
			clearError         : () => { this.error = null; },
			publish            : () => this.publish(),
			scheduleTNote      : turnId => this.noteNarration.scheduleAutomatic(turnId),
			drainChatQueue     : () => this.drainChatQueue(),
		});
		this.permissionMode = options.approvalPolicy === "never" && options.sandbox === "danger-full-access" ? "all" : "manual" ;
		this.approvalPolicy = options.approvalPolicy ?? "on-request"                                                            ;
		this.sandbox        = options.sandbox ?? "workspace-write"                                                              ;
		this.todo           = immutable(options.todos?.snapshot ?? null)                                                        ;
		this.activityJournal = new WorkbenchJournalCoordinator({
			projectId: options.projectId,
			...(options.activityJournalProjectId === undefined ? {} : { activityJournalProjectId: options.activityJournalProjectId }),
			...(options.provider === undefined ? {} : { provider: options.provider }),
			...(options.developmentObserver === undefined ? {} : { developmentObserver: options.developmentObserver }),
			journal,
			activities           : this.activities,
			visibleActivities    : this.visibleActivities,
			visibleThreadId      : () => this.visibleThreadId,
			visibleAfterSequence : () => this.visibleAfterSequence,
			selectedTurn         : () => ({ threadId: this.threadId, turnId: this.activeTurnId ?? this.selectedPlanTurnId }),
			onAdded: activity => {
				this.workflow.invalidateFlow();
				this.noteNarration.scheduleNarrations();
				if (this.isActivityVisible(activity)) this.workflow.scheduleNativeTodoSync(activity);
			},
			onDurable                    : activity => this.nativeEvents.observeDurableActivity(activity),
			setDevelopmentRecordingError : message => { this.developmentRecordingError = message; },
			publish                      : () => this.publish(),
		});
		this.workflow = new WorkbenchWorkflowCoordinator({
			hash: dplanHash,
			...(options.requestProjection === undefined ? {} : { requestProjection: options.requestProjection }),
			...(options.todos === undefined ? {} : { todos: options.todos }),
			cache                     : this.cacheProjection,
			activities                : () => this.activities,
			threadId                  : () => this.threadId,
			activeTurnId              : () => this.activeTurnId,
			selectedPlanTurnId        : () => this.selectedPlanTurnId,
			pendingPlanGoalActivityId : () => this.pendingPlanGoalActivityId,
			selectedExecutionRun      : () => this.selectedExecutionRun(),
			stepNarrations            : () => this.noteNarration.stepNarrations,
			narrationRevision         : () => this.noteNarration.revision,
			todo                      : () => this.todo,
			setTodo                   : todo => { this.todo = todo; },
			setError                  : message => { this.error = message; },
			setActionResult           : result => { this.actionResult = result; },
			publish                   : () => this.publish(),
			processAttachedAt         : this.processAttachedAt,
		});
		this.noteNarration = new WorkbenchNoteNarration({
			projectId: options.projectId,
			...(options.tnotes === undefined ? {} : { source: options.tnotes }),
			...(options.narrator === undefined ? {} : { narrator: options.narrator }),
			activities                : () => this.activities,
			visibleActivities         : () => this.visibleActivities,
			threadId                  : () => this.threadId,
			activeTurnId              : () => this.activeTurnId,
			selectedPlanTurnId        : () => this.selectedPlanTurnId,
			pendingPlanGoalActivityId : () => this.pendingPlanGoalActivityId,
			requestRecords            : () => this.workflow.records(),
			currentFlow               : () => this.workflow.currentFlow(),
			invalidateFlow            : () => this.workflow.invalidateFlow(),
			scheduleNarratedTodoSync  : () => this.workflow.scheduleNarratedTodoSync(),
			bindTodoThread            : threadId => this.bindTodoThread(threadId),
			closed                    : () => this.closed,
			actionResult              : () => this.actionResult,
			clearActionResult         : () => { this.actionResult = null; },
			setActionResult           : (kind, title, body, digest) => this.setActionResult(kind, title, body, digest),
			publish                   : () => this.publish(),
		});
		this.threadLifecycle = new WorkbenchThreadLifecycle(native, this.nativeTurn, {
			cwd            : options.cwd,
			model          : () => this.selectedModel,
			effort         : () => this.selectedEffort,
			approvalPolicy : () => this.approvalPolicy,
			sandbox        : () => this.sandbox,
			acquireLease   : threadId => options.acquireThreadLease?.(threadId) ?? Promise.resolve(),
			bindSources    : threadId => this.noteNarration.bindThread(threadId),
			closed         : () => this.closed,
		});
		this.commandHandlers = new WorkbenchCommandHandlers({
			projectId: options.projectId,
			mcp: () => this.mcpManagement(),
			...(options.wooEntry === undefined ? {} : { wooEntry: options.wooEntry }),
			...(options.todos === undefined ? {} : { todos: options.todos }),
			...(options.promotions === undefined ? {} : { promotions: options.promotions }),
			...(options.reviews === undefined ? {} : { reviews: options.reviews }),
			note               : noteId => this.noteNarration.note(noteId),
			activities         : () => this.activities,
			hasRuntimeRequests : () => this.workflow.records().length > 0,
			setMcpServers      : servers => { this.mcpServers = immutable(servers); },
			setActionResult    : (kind, title, body, digest) => this.setActionResult(kind, title, body, digest),
			publish            : () => this.publish(),
		});
		this.workflow.confirmTodo(this.todo);
		this.current = this.makeSnapshot("loading");
		this.ready = this.initialize();
		this.unsubscribeNative = native.subscribe((event) => {
			const traceScope = event.type === "notification"
				? event.refs.turnId ?? event.refs.threadId ?? event.refs.itemId ?? `native-${this.revision}`
				: event.type === "approval-requested"
					? event.approval.refs.turnId ?? event.approval.refs.threadId ?? `approval-${event.approval.requestId}`
					: event.refs.turnId ?? event.refs.threadId ?? `approval-${event.requestId}`;
			const traceId = `${traceScope}:event-${++this.performanceTraceSequence}`;
			const receivedAt = performance.now();
			this.observeLayerPerformance(traceId, "native-receive", "queued", receivedAt);
			this.observeLayerPerformance(traceId, "native-receive", "started", receivedAt);
			if (event.type === "approval-requested" && event.approval.refs.threadId === this.threadId) { this.runtimePendingApproval = true; this.requestController.interrupt(); }
			if (event.type === "notification"
				&& event.refs.threadId === this.threadId
				&& event.refs.turnId === this.activeTurnId
				&& /^turn\/(completed|failed|interrupted|cancelled|canceled)$/u.test(event.method)) this.requestController.interrupt(event.refs.threadId, event.refs.turnId);
			this.observeLayerPerformance(traceId, "native-receive", "completed", performance.now());
			this.observeLayerPerformance(traceId, "event-queue", "queued", receivedAt);
			this.eventQueue = this.eventQueue
				.then(() => this.ready)
				.then(() => this.performanceTraceContext.run(traceId, () => {
					this.observeLayerPerformance(traceId, "event-queue", "started");
					return this.nativeEvents.record(event);
				}))
				.then(() => this.observeLayerPerformance(traceId, "event-queue", "completed"))
				.then(() => { this.runtimePendingApproval = !!this.pendingApproval; })
				.catch((error) => { this.observeLayerPerformance(traceId, "event-queue", "failed"); this.fail(error); });
		});
		this.unsubscribeTodo = options.todos?.subscribe((todo) => {
			this.todo = immutable(todo);
			this.workflow.confirmTodo(todo);
			this.publish();
		}) ?? (() => undefined);
		this.unsubscribeAuxiliaryUsage = options.auxiliaryUsage?.subscribe(() => this.publish()) ?? (() => undefined);
		void this.ready.catch((error) => this.fail(error));
	}

	public get snapshot(): WorkbenchSnapshot {
		return this.current;
	}

	public observeLayerPerformance(traceId: string, layerId: PerformanceLayerId, boundary: PerformanceBoundary, atMs = performance.now()): void {
		this.layerPerformance.observe({ traceId, layerId, boundary, atMs });
	}

	public currentPerformanceTraceId(): string | null {
		return this.performanceTraceContext.getStore() ?? null;
	}

	public layerPerformanceSnapshot(): { readonly current: PerformanceTrace | null; readonly window: PerformanceWindow } {
		return Object.freeze({ current: this.layerPerformance.latest(), window: this.layerPerformance.window() });
	}

	/** Refresh at startup and whenever the user opens model selection. Coalesce concurrent reads. */
	public refreshModels(): Promise<NativeModelCatalog> {
		if (this.modelRefresh) {
			this.cacheProjection.hit("model");
			return this.modelRefresh;
		}
		this.modelRefresh = (async () => {
			const startedAt = performance.now();
			try {
				if (!this.native.listModels) throw new Error("이 실행기는 Native 모델 조회를 지원하지 않습니다.");
				const models = await this.native.listModels();
				if (!models.length) throw new Error("Native 모델 목록이 비어 있습니다.");
				const replacedNativeCatalog = this.modelCatalog.source === "native";
				this.modelCatalog = { models: immutable(models), source: "native", checkedAt: new Date().toISOString(), error: null };
				this.cacheProjection.miss("model", performance.now() - startedAt, replacedNativeCatalog);
			} catch (error) {
				this.modelCatalog = { ...this.modelCatalog, error: errorMessage(error) };
				this.cacheProjection.miss("model", performance.now() - startedAt, false);
			}
			if (!this.closed) this.publish(this.current?.phase ?? "loading");
			return this.modelCatalog;
		})().finally(() => { this.modelRefresh = null; });
		return this.modelRefresh;
	}

	/** Conservative native-only background state for consumers that need it. */
	public get backgroundWorkState(): BackgroundWorkState {
		return projectBackgroundWorkState(this.visibleActivities.flatMap((activity) => {
			const item = record(record(activity.payload.params)?.item);
			return item ? [item] : [];
		}));
	}

	/** Allows composition to fail before exposing a session with unusable state. */
	public waitUntilReady(): Promise<void> {
		return this.ready;
	}

	public subscribe(listener: WorkbenchListener, afterSequence?: number): () => void {
		if (afterSequence === undefined || this.current.journalSequence > afterSequence) listener(this.current);
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	public dispatch(command: WorkbenchCommand): Promise<WorkbenchCommandReceipt> {
		// Cancellation is an out-of-band control signal. It must not wait behind a
		// journal write or another serialized command while the active turn is stuck.
		if (command.type === "chat.cancel") return this.dispatchCancellation();
		// The tool awaiting this decision owns eventQueue. Never queue its resolver behind it.
		if (command.type === "approval.resolve" && typeof command.requestId === "string" && command.requestId.startsWith("runtime-")) {
			const commandId = randomUUID();
			if (this.closed
				|| !this.runtimeApproval
				|| command.requestId !== this.runtimeApproval.id
				|| !("decision" in command.response)
				|| !["accept", "decline", "cancel"].includes(command.response.decision as string)) return Promise.resolve({ state: "rejected", commandId, reason: "현재 Runtime 단일 작업 승인과 일치하지 않습니다." });
			this.runtimeApproval.resolve(command.response.decision === "accept");
			return Promise.resolve({ state: "accepted", commandId });
		}
		const operation = this.commandQueue
			.catch(() => undefined)
			.then(() => this.dispatchSerialized(command));
		this.commandQueue = operation.then(() => undefined, () => undefined);
		return operation;
	}

	private canActOn(call: RuntimeToolCall): boolean {
		return (
			!this.closed &&
			!this.recordingReadOnly &&
			!this.runtimePendingApproval &&
			!this.pendingApproval &&
			!this.nativeTurn.deliveryBlocked &&
			this.threadId === call.threadId &&
			this.activeTurnId === call.turnId
		);
	}

	private canRecoverFrom(call: RuntimeToolCall): boolean {
		return (
			!this.closed &&
			!this.recordingReadOnly &&
			!this.runtimePendingApproval &&
			!this.pendingApproval &&
			!this.activeTurnId &&
			!this.nativeTurn.deliveryBlocked &&
			this.threadId === call.threadId
		);
	}

	private requestActionApproval(call: RuntimeToolCall, approval: RequestActionApproval, signal: AbortSignal): Promise<boolean> {
		if (signal.aborted
			|| this.closed
			|| this.pendingApproval
			|| this.runtimeApproval
			|| this.threadId !== call.threadId
			|| this.activeTurnId !== call.turnId) return Promise.resolve(false);
		return new Promise(resolve => {
			let done = false;
			const finish = (accepted: boolean) => {
				if (done) return;
				done = true;
				clearTimeout(timer);
				signal.removeEventListener("abort", abort);
				this.runtimeApproval = null;
				if (this.pendingApproval?.requestId === approval.id) this.pendingApproval = null;
				this.publish();
				resolve(accepted && !signal.aborted && !this.closed && Date.now() < approval.expiresAt);
			};
			const abort = () => finish(false);
			const timer = setTimeout(abort, Math.max(0, approval.expiresAt - Date.now()));
			this.runtimeApproval = { id: approval.id, resolve: finish };
			this.pendingApproval = immutable({
				requestId: approval.id, callbackId: null, kind: approval.intent.stage === "EXECUTE" ? "file-change" : "mcp-tool",
				refs: { threadId: call.threadId, turnId: call.turnId }, availableDecisions: ["decline", "accept", "cancel"],
				params: { authority: "runtime", command: sanitizeTerminalTextUnbounded(approval.summary), reason: sanitizeTerminalTextUnbounded(approval.detail), cwd: this.options.cwd, expiresAt: approval.expiresAt },
			});
			signal.addEventListener("abort", abort, { once: true });
			this.publish();
		});
	}

	private async dispatchCancellation(): Promise<WorkbenchCommandReceipt> {
		const commandId = randomUUID();
		if (this.closed) return { state: "rejected", commandId, reason: "Workbench가 종료되었습니다." };
		try {
			await this.ready;
			if (this.recordingReadOnly) return { state: "rejected", commandId, reason: "읽기 전용 기록 진단에서는 실행을 변경할 수 없습니다." };
			return await this.cancelChat(commandId);
		} catch (error) {
			return { state: "rejected", commandId, reason: errorMessage(error) };
		}
	}

	private async dispatchSerialized(command: WorkbenchCommand): Promise<WorkbenchCommandReceipt> {
		const commandId = randomUUID();
		if (this.closed) return { state: "rejected", commandId, reason: "Workbench가 종료되었습니다." };
		try {
			await this.ready;
			await this.eventQueue;
			if (this.recordingReadOnly && !["activity.select", "trace.select", "agent.select"].includes(command.type)) {
				return { state: "rejected", commandId, reason: "기록 무결성 문제로 읽기 전용 진단 중입니다. 실행·수정은 허용되지 않습니다." };
			}
			const handled = await this.commandHandlers.dispatch(commandId, command);
			if (handled) return handled;
			switch (command.type) {
				case "workflow.check"       :
				case "workflow.resume"      :
				case "workflow.show"        : return await this.runLocalWorkflow            (commandId, command);
				case "activity.select"      : return this.selectActivity                    (commandId, command.activityId);
				case "trace.select"         : return this.selectTraceActivity               (commandId, command.activityId);
				case "agent.select"         : return this.selectAgent                       (commandId, command.agentRef);
				case "session.permission"   : return this.configurePermission               (commandId, command.mode);
				case "session.mode"         : return this.configureCollaboration            (commandId, command.mode);
				case "session.model"        : return await this.configureModel              (commandId, command.selection);
				case "goal.set"             : return await this.setGoal                     (commandId, command.text);
				case "tnote.capture-session": return await this.noteNarration.captureSession(commandId);
				case "tnote.capture"        : return await this.noteNarration.capture       (commandId, command.activityIds);
				case "tnote.capture-range"  : return await this.noteNarration.captureRange  (commandId, command.startSequence, command.endSequence);
				case "chat.send"            : return await this.sendChat                    (commandId, command.text, false, command.delivery);
				case "chat.cancel"          : return await this.cancelChat                  (commandId);
				case "chat.clear"           : return this.clearChatProjection               (commandId);
				case "thread.compact"       : return await this.compactThread               (commandId);
				case "approval.resolve"     : return await this.resolveApproval             (commandId, command);
				case "runtime.reconcile": {
					const request = this.workflow.records().find(r => r.requestId === command.requestId);
					if (!this.requestRuntimePolicy.brokered
						|| !request?.threadId
						|| !request.turnId
						|| this.activeTurnId) return { state: "rejected", commandId, reason: "Runtime 정산은 연결된 요청의 turn이 종료된 뒤에만 가능합니다." };
					const result = await this.requestController.recover({ tool: "www_runtime_reconcile", threadId: request.threadId, turnId: request.turnId, callId: commandId, arguments: { requestId: request.requestId, operationId: command.operationId } });
					if (result.success) await this.drainChatQueue();
					return result.success ? { state: "accepted", commandId, message: "기록된 대상의 현재 상태를 확인했습니다. 원래 동작은 재실행하지 않았습니다." } : { state: "rejected", commandId, reason: result.text };
				}
			}
			throw new Error("지원하지 않는 Workbench 명령입니다.");
		} catch (error) {
			if (error instanceof TodoWriteConflictError) {
				this.setActionResult("todo", "Todo 동시 편집 충돌", stableJson({ currentSource: error.currentSource, pending: error.pending }));
				return { state: "rejected", commandId, reason: error.message };
			}
			if (isUncertain(error)) {
				return {
					state: "uncertain",
					commandId,
					reason: `Native ${error.method} 요청의 수신 여부를 확인할 수 없습니다.`,
					resolution: "manual-reconcile",
				};
			}
			return { state: "rejected", commandId, reason: errorMessage(error) };
		}
	}

	public async close(): Promise<void> {
		if (this.closed) return;
		this.closed = true;
		this.requestController.interrupt();
		this.unregisterRuntimeTools();
		this.noteNarration.close();
		this.unsubscribeNative();
		this.unsubscribeTodo();
		this.unsubscribeAuxiliaryUsage();
		await this.commandQueue.catch(() => undefined);
		await this.eventQueue.catch(() => undefined);
		await this.workflow.wait();
		await this.noteNarration.wait();
		await this.native.close();
		this.publish("closed");
		this.listeners.clear();
	}

	private async initialize(): Promise<void> {
		const [activities] = await Promise.all([
			this.journal.readAll(this.activityJournal.projectId),
			this.refreshModels(),
			this.options.wooEntry?.refresh() ?? Promise.resolve(null),
			this.commandHandlers.loadMcpServers(),
		]);
		for (const activity of activities) {
			const durableActivity = immutable(activity);
			this.activities.push(durableActivity);
			this.activityJournal.observe(durableActivity);
			this.nativeEvents.restore(durableActivity);
		}
		const recordingIssues = this.activityJournal.restore(this.activities);
		if (recordingIssues.length) {
			this.recordingReadOnly = true                                         ;
			this.threadId          = this.options.resumeThreadId ?? this.threadId ;
			this.visibleThreadId   = this.threadId                                ;
			this.visibleActivities.push(...this.activities.filter(activity => !this.threadId || activity.nativeRefs.threadId === this.threadId));
			this.selectedPlanTurnId = [...this.visibleActivities].reverse().find(activity => activity.nativeRefs.turnId)?.nativeRefs.turnId ?? null;
			this.error = `읽기 전용 기록 진단: ${recordingIssues.join("\n")}`;
			this.publish("error");
			return;
		}
		this.approvalDispatcher.restoreInterlocks(this.activities);
		// A crash can leave a durable terminal observation without its derived
		// receipt. Rebuild before repairing it; receipt identity makes replay safe.
		for (const run of this.activityJournal.values()) {
			if (run.receipt && !this.activityJournal.hasCompletionReceipt(run)) await this.activityJournal.appendCompletionReceipt(run);
		}
		this.visibleAfterSequence = this.activities.at(-1)?.sequence ?? 0;
		// Historical events cannot safely inherit the currently selected stage.
		this.noteNarration.setObservedSequence(this.visibleAfterSequence);
		if (this.options.tnotes && !this.options.tnotes.bindThread) await this.noteNarration.loadBoundNotes();
		if (this.options.resumeThreadId) {
			const { resumed, read, delivery } = await this.threadLifecycle.resume(this.options.resumeThreadId);
			this.applyThreadSettings(resumed);
			this.visibleThreadId = resumed.id;
			this.visibleActivities.push(...this.activities.filter(activity => activity.nativeRefs.threadId === resumed.id));
			this.selectedPlanTurnId = [...this.activities].reverse().find((activity) =>
				activity.nativeRefs.threadId === resumed.id
				&& (activity.payload.method === "turn/start" || activity.payload.method === "turn/started")
				&& typeof activity.nativeRefs.turnId === "string",
			)?.nativeRefs.turnId ?? null;
			this.workflow.invalidateFlow();
			this.noteNarration.scheduleNarrations();
			this.threadId = read.id;
			const resumedTodoFlow = this.workflow.currentFlow();
			const syncResumedTodo = this.workflow.records().length ? undefined : this.options.todos?.syncNativePlan?.bind(this.options.todos);
			if (
				syncResumedTodo
				&& (!this.todo || this.todo.items.length === 0 || this.todo.source !== undefined)
				&& resumedTodoFlow.source
				&& resumedTodoFlow.steps.length > 0
			) {
				this.workflow.enqueueNativeTodoSync(syncResumedTodo, resumedTodoFlow);
			}
			await this.appendActivity("progress", "completed", { threadId: read.id }, {
				method          : "thread/resume-local-reconciled",
				historyHydrated : false,
				nativeState     : delivery.state,
			}, false);
			if (delivery.state === "in-progress") {
				this.activeTurnId = delivery.turnId;
				this.nativeEvents.rememberNativeRefs({ threadId: read.id, turnId: delivery.turnId });
				this.selectedPlanTurnId = delivery.turnId;
				this.setContextTurn(delivery.turnId);
				this.usageTracker.bindTurn(delivery.turnId, this.effectiveModel, this.effectiveEffort);
				await this.appendActivity("progress", "started", {
					threadId: read.id,
					turnId: delivery.turnId,
				}, {
					method: "turn/started",
					reconciledFrom: "thread/read",
				}, false);
			}
		}
		// Dashboard reads are provider-attributed MCP calls, so establish one idle
		// Native thread before rendering the entry screen rather than inventing a
		// thread id or delaying the first Linear summary until Chat is sent.
		if (this.options.linearDashboard && !this.threadId) {
			const thread = await this.threadLifecycle.startForDashboard();
			if (!thread) return;
			this.threadId = thread.id;
			this.applyThreadSettings(thread);
		}
		if (this.options.linearDashboard && this.threadId) this.refreshLinearDashboard(this.threadId);
		if (this.closed) return;
		this.sessionGoal = projectSessionGoal(this.visibleActivities);
		this.noteNarration.reconcileAutomatic();
		this.publish("ready");
	}

	private refreshLinearDashboard(threadId: string): void {
		const dashboard = this.options.linearDashboard;
		if (!dashboard) return;
		const startedAt = performance.now();
		void dashboard.refresh(threadId).then((snapshot) => {
			if (this.closed || this.threadId !== threadId) return;
			this.cacheProjection.miss("dashboard", performance.now() - startedAt, this.linearDashboard.fetchedAt !== null);
			this.linearDashboard = snapshot;
			this.publish();
		}).catch((error) => {
			if (this.closed || this.threadId !== threadId) return;
			this.cacheProjection.miss("dashboard", performance.now() - startedAt, false);
			this.linearDashboard = this.linearDashboard.fetchedAt
				? { ...this.linearDashboard, state: "stale", error: errorMessage(error) }
				: { ...EMPTY_LINEAR_PROJECT_DASHBOARD, projectName: this.linearDashboard.projectName, error: errorMessage(error) };
			this.publish();
		});
	}

	private async sendChat(commandId: string, rawText: string, goal = false, delivery: "queue" | "steer" = "steer"): Promise<WorkbenchCommandReceipt> {
		const text = sanitizeTerminalTextUnbounded(rawText).trim();
		if (!text) return { state: "rejected", commandId, reason: "보낼 메시지가 비어 있습니다." };
		if (this.requestRuntimePolicy.brokered && !this.activeTurnId) {
			const unresolved = this.workflow.records().find(r => r.actions.some(a => a.status === "unconfirmed"));
			const action = unresolved?.actions.find(a => a.status === "unconfirmed");
			if (unresolved && action) return { state: "rejected", commandId, reason: `이전 실행 결과를 먼저 정산하세요: /reconcile ${unresolved.requestId} ${action.operationId}` };
		}
		if (delivery !== "queue"
			&& this.requestProtocolVersion() !== 2
			&& this.activeTurnId
			&& this.threadId
			&& !this.nativeTurn.deliveryBlocked
			&& this.native.steerTurn) {
			const sent = await this.steerChatTurn(text, commandId, this.threadId, this.activeTurnId, goal);
			return { state: "accepted", commandId, activitySequence: sent.sequence };
		}
		if (this.activeTurnId
			|| this.pendingApproval
			|| this.nativeTurn.queue.length > 0
			|| this.nativeTurn.deliveryBlocked) {
			if (this.requestRuntimePolicy.manages(goal)) {
				await this.appendRequestObservation("request/submitted", commandId, this.threadId ?? undefined, text);
				await this.appendRequestObservation("request/queued", commandId, this.threadId ?? undefined, text);
			}
			const position = this.nativeTurn.enqueue({ id: commandId, content: text, queuedAt: new Date().toISOString(), ...(goal ? { goal: true } : {}) });
			this.publish();
			return { state: "queued", commandId, position };
		}
		const sent = await this.startChatTurn(text, commandId, false, goal);
		return { state: "accepted", commandId, activitySequence: sent.sequence };
	}

	private async setGoal(commandId: string, rawText: string): Promise<WorkbenchCommandReceipt> {
		const text = sanitizeTerminalTextUnbounded(rawText).trim();
		if (!text) return { state: "rejected", commandId, reason: "Goal이 비어 있습니다." };
		if (Array.from(text).length > SESSION_GOAL_CHARACTER_LIMIT) {
			return { state: "rejected", commandId, reason: `Goal은 ${SESSION_GOAL_CHARACTER_LIMIT}자 이내로 작성하세요.` };
		}
		const receipt = await this.sendChat(commandId, text, true);
		if (receipt.state === "accepted") return { ...receipt, message: "Goal을 설정했습니다. Native Plan을 만들고 Todo에 연결합니다." };
		if (receipt.state === "queued") return { ...receipt, message: `Goal을 저장했습니다. 현재 작업이 끝나면 Native Plan을 만들고 Todo에 연결합니다. 대기 ${receipt.position}번` };
		return receipt;
	}

	private async steerChatTurn(
		text: string,
		localMessageId: string,
		threadId: string,
		turnId: string,
		goal = false,
	): Promise<ProjectActivity> {
		const steerTurn = this.native.steerTurn;
		if (!steerTurn) throw new Error("이 실행기는 진행 중인 Native turn 조향을 지원하지 않습니다.");
		const managedRequest       = this.requestRuntimePolicy.manages(goal)                                                                   ;
		const messagePayload       = { direction: "outbound", role: "user", text, ...(goal ? { goal: true } : {}) } as const                   ;
		const messageRefs          = { threadId, turnId, itemId: localMessageId }                                                              ;
		const outboundSourceDigest = digestSource(stableJson(messagePayload))                                                                  ;
		const sent                 = await this.appendActivity("message", "started", messageRefs, messagePayload, false, outboundSourceDigest) ;
		if (managedRequest) await this.appendRequestObservation("request/submitted", localMessageId, threadId, text, outboundSourceDigest, turnId);
		this.publish();
		try {
			await steerTurn(this.nativeTurn.steerInput({
				threadId,
				turnId,
				messageId: localMessageId,
				text: managedRequest ? `${text}\n\n${requestProtocolContext(localMessageId, this.requestProtocolVersion()).value}` : text,
			}));
		} catch (error) {
			if (managedRequest) await this.appendRequestObservation(
				isUncertain(error) ? "request/uncertain" : "request/failed",
				localMessageId,
				threadId,
				text,
				outboundSourceDigest,
				turnId,
			);
			await this.appendActivity("message", "failed", messageRefs, {
				...messagePayload,
				error: isUncertain(error)
					? "Native가 후속 메시지를 수신했는지 확인할 수 없습니다. 자동 재시도하거나 큐에 넣지 않습니다."
					: errorMessage(error),
			}, false);
			this.publish();
			throw error;
		}
		const completed = await this.appendActivity("message", "completed", messageRefs, messagePayload, false, outboundSourceDigest);
		if (goal) this.sessionGoal = { text, sourceActivityId: completed.id, updatedAt: completed.recordedAt };
		if (managedRequest) await this.appendRequestObservation("request/started", localMessageId, threadId, text, outboundSourceDigest, turnId, {
			model: this.effectiveModel,
			effort: this.effectiveEffort,
		});
		this.publish();
		return sent;
	}

	private async startChatTurn(text: string, localMessageId: string, queued = false, goal = false): Promise<ProjectActivity> {
		const managedRequest = this.requestRuntimePolicy.manages(goal);
		const intake = managedRequest && !this.threadId && this.journal.supportsRequestIntake === true;
		if (intake) await this.appendRequestObservation("request/submitted", localMessageId, undefined, text);
		const messagePayload = {
			direction: "outbound",
			role: "user",
			text,
			...(goal ? { goal: true } : {}),
		} as const;
		if (!this.threadId) {
			this.preThreadChat.set(localMessageId, {
				id         : localMessageId,
				role       : "user",
				content    : text,
				activityId : localMessageId,
				status     : "streaming",
			});
			this.publish();
			let thread: Awaited<ReturnType<ExecutorPort["startThread"]>>;
			try {
				thread = await this.native.startThread(this.nativeTurn.threadInput({
					cwd            : this.options.cwd,
					model          : this.selectedModel,
					effort         : this.selectedEffort,
					approvalPolicy : this.approvalPolicy,
					sandbox        : this.sandbox,
				}));
			} catch (error) {
				if (intake) await this.appendRequestObservation(isUncertain(error) ? "request/uncertain" : "request/failed", localMessageId, undefined, text);
				const pendingMessage = this.preThreadChat.get(localMessageId);
				if (pendingMessage) this.preThreadChat.set(localMessageId, { ...pendingMessage, status: "failed" });
				if (queued) this.nativeTurn.shiftHeadIf(localMessageId);
				this.publish();
				throw error;
			}
			this.threadId = thread.id;
			await this.options.acquireThreadLease?.(thread.id);
			if (intake) {
				// The thread journal adopts intake receipts with new sequence/identity and provenance.
				const adopted   = await this.journal.readAll(this.activityJournal.projectId)                                                                                                       ;
				const sourceIds = new Set(adopted.map(a => a.payload.intakeActivityId))                                                                                                            ;
				const merged    = [...new Map([...this.activities.filter(a => !sourceIds.has(a.id)), ...adopted].map(a => [a.id, immutable(a)])).values()].sort((a, b) => a.sequence - b.sequence) ;
				this.activities.splice(0, this.activities.length, ...merged);
				this.workflow.invalidateRequests();
			}
			await this.noteNarration.bindThread(thread.id);
			this.applyThreadSettings(thread);
			await this.appendActivity("progress", "completed", { threadId: thread.id }, {
				method: "thread/start",
				thread: thread.value,
			});
		}
		const messageRefs          = { threadId: this.threadId, itemId: localMessageId }                                                       ;
		const outboundSourceDigest = digestSource(stableJson(messagePayload))                                                                  ;
		const sent                 = await this.appendActivity("message", "started", messageRefs, messagePayload, false, outboundSourceDigest) ;
		if (managedRequest && !queued && !intake) await this.appendRequestObservation("request/submitted", localMessageId, this.threadId, text, outboundSourceDigest);
		this.preThreadChat.delete(localMessageId);
		this.pendingPlanGoalActivityId = sent.id;
		this.workflow.invalidateFlow();
		this.publish();
		let turn: Awaited<ReturnType<ExecutorPort["startTurn"]>>;
		try {
			const turnInput = this.nativeTurn.turnInput({
				threadId: this.threadId,
				text,
				cwd               : this.options.cwd,
				model             : this.selectedModel,
				effort            : this.selectedEffort,
				approvalPolicy    : this.approvalPolicy,
				sandboxPolicy     : this.nativeTurn.sandboxPolicy(this.permissionMode, this.options.cwd),
				collaborationMode : this.nativeTurn.collaboration(this.collaborationMode, this.effectiveModel, this.effectiveEffort, goal),
			});
			turn = await this.native.startTurn(this.contextComposer.compose(
				managedRequest
					? { ...turnInput, additionalContext: { www_request_runtime: requestProtocolContext(localMessageId, this.requestProtocolVersion()) } }
					: turnInput,
				this.options.wooEntry?.snapshot,
				this.options.skillRegistry,
			));
		} catch (error) {
			this.pendingPlanGoalActivityId = null;
			this.workflow.invalidateFlow();
			if (isUncertain(error)) {
				this.nativeTurn.markUncertain({ id: localMessageId, content: text });
				if (managedRequest) await this.appendRequestObservation("request/uncertain", localMessageId, this.threadId, text, outboundSourceDigest);
				await this.appendActivity("message", "failed", messageRefs, {
					...messagePayload,
					error: "Native가 메시지를 수신했는지 확인할 수 없습니다. 자동 재시도하지 않습니다.",
				});
				if (queued) this.nativeTurn.shiftHeadIf(localMessageId);
				throw error;
			}
			if (managedRequest) await this.appendRequestObservation("request/failed", localMessageId, this.threadId, text, outboundSourceDigest);
			await this.appendActivity("message", "failed", messageRefs, {
				...messagePayload,
				error: errorMessage(error),
			}, false);
			if (queued) this.nativeTurn.shiftHeadIf(localMessageId);
			this.publish();
			throw error;
		}
		this.usageTracker.bindTurn(turn.id, this.effectiveModel, this.effectiveEffort);
		this.nativeEvents.rememberNativeRefs({ threadId: this.threadId, turnId: turn.id });
		this.setContextTurn(turn.id);
		this.activeTurnId = turn.id;
		this.selectedPlanTurnId = turn.id;
		this.nativeEvents.rememberTurnCollaboration(turn.id, this.collaborationMode);
		this.pendingPlanGoalActivityId = null;
		this.workflow.invalidateFlow();
		this.nativeTurn.clearUncertain();
		if (queued) this.nativeTurn.shiftHeadIf(localMessageId);
		const completed = await this.appendActivity("message", "completed", messageRefs, messagePayload);
		if (goal) this.sessionGoal = { text, sourceActivityId: completed.id, updatedAt: completed.recordedAt };
		if (managedRequest) await this.appendRequestObservation("request/started", localMessageId, this.threadId, text, outboundSourceDigest, turn.id, {
			model: this.effectiveModel,
			effort: this.effectiveEffort,
		});
		await this.appendActivity("progress", "started", { threadId: this.threadId, turnId: turn.id }, {
			method: "turn/start",
			turn: turn.value,
		});
		return sent;
	}

	private async appendRequestObservation(
		method: "request/submitted" | "request/queued" | "request/started" | "request/failed" | "request/uncertain",
		requestId: string,
		threadId: string | undefined,
		text: string,
		sourceDigest = digestSource(stableJson({ direction: "outbound", role: "user", text })),
		turnId?: string,
		model?: { readonly model: string; readonly effort: string | null },
	): Promise<ProjectActivity> {
		return this.appendActivity("progress", method === "request/failed" || method === "request/uncertain" ? "failed" : "started", {
			...(threadId === undefined ? {} : { threadId }),
			itemId: requestId,
			...(turnId ? { turnId } : {}),
		}, { method, requestId, text, protocolVersion: this.requestProtocolVersion(), ...(model ?? {}) }, false, sourceDigest);
	}

	private requestProtocolVersion(): 1 | 2 {
		return this.requestRuntimePolicy.protocolVersion(
			this.activities.some(a => a.payload.method === "request/submitted" && a.payload.protocolVersion === 2),
		);
	}

	private async drainChatQueue(): Promise<void> {
		while (!this.closed && !this.activeTurnId && !this.pendingApproval && !this.nativeTurn.deliveryBlocked && !(this.requestRuntimePolicy.brokered && this.workflow.records().some(r => r.actions.some(a => a.status === "unconfirmed")) )) {
			const next = this.nativeTurn.head;
			if (!next) return;
			try {
				await this.startChatTurn(next.content, next.id, true, next.goal === true);
				return;
			} catch (error) {
				if (isUncertain(error) || this.nativeTurn.head?.id === next.id) throw error;
			}
		}
	}

	private async cancelChat(commandId: string): Promise<WorkbenchCommandReceipt> {
		this.requestController.interrupt(this.threadId ?? undefined, this.activeTurnId ?? undefined);
		if (this.nativeTurn.deliveryBlocked && this.nativeTurn.blockedChat) {
			const abandoned = this.nativeTurn.blockedChat;
			if (!this.threadId) {
				return { state: "rejected", commandId, reason: "불확정 전송을 정합할 native thread가 없습니다." };
			}
			let delivery: BlockedChatDeliveryState;
			try {
				const thread = await this.native.readThread({ threadId: this.threadId, includeTurns: true });
				delivery = this.nativeTurn.deliveryState(thread.value);
			} catch (error) {
				return {
					state: "rejected",
					commandId,
					reason: `불확정 전송의 서버 상태를 확인하지 못했습니다. 대기열을 유지했으며 /cancel로 다시 확인할 수 있습니다: ${errorMessage(error)}`,
				};
			}
			if (delivery.state === "unknown") {
				return {
					state: "rejected",
					commandId,
					reason: "Native thread 상태를 안전하게 판독할 수 없습니다. 대기열을 유지했으며 /cancel로 다시 확인할 수 있습니다.",
				};
			}
			this.nativeTurn.clearUncertain();
			this.error = null;
			this.nativeTurn.shiftHeadIf(abandoned.id);
			if (delivery.state === "in-progress") {
				this.activeTurnId = delivery.turnId;
				this.selectedPlanTurnId = delivery.turnId;
				this.setContextTurn(delivery.turnId);
				this.usageTracker.bindTurn(delivery.turnId, this.effectiveModel, this.effectiveEffort);
				await this.appendActivity("progress", "started", {
					threadId: this.threadId,
					turnId: delivery.turnId,
				}, {
					method: "turn/started",
					reconciledFrom: "thread/read",
				}, false);
				await this.appendActivity("message", "completed", {
					threadId: this.threadId,
					itemId: abandoned.id,
				}, {
					direction : "outbound",
					role      : "user",
					text      : abandoned.content,
				}, false);
				this.publish();
				await this.native.interruptTurn({ threadId: this.threadId, turnId: delivery.turnId });
				return {
					state: "accepted",
					commandId,
					message: "서버가 수신한 불확정 전송을 중단했습니다. 종료 확인 뒤 대기열을 재개합니다.",
				};
			}
			await this.appendActivity("message", "cancelled", {
				threadId: this.threadId ?? undefined,
				itemId: abandoned.id,
			}, {
				direction : "outbound",
				role      : "user",
				text      : abandoned.content,
				reason    : "사용자가 수신 여부 불명확 전송을 포기했습니다.",
			}, false);
			this.publish();
			await this.drainChatQueue();
			return {
				state: "accepted",
				commandId,
				message: "수신 여부가 불명확한 전송을 취소하고 대기열을 재개했습니다.",
			};
		}
		if (!this.threadId || !this.activeTurnId) {
			return { state: "rejected", commandId, reason: "중단할 응답이 없습니다." };
		}
		await this.native.interruptTurn({ threadId: this.threadId, turnId: this.activeTurnId });
		return { state: "accepted", commandId };
	}

	/** Clears the screen projection only; append-only records and provider history stay intact. */
	private clearChatProjection(commandId: string): WorkbenchCommandReceipt {
		if (this.activeTurnId || this.pendingApproval || this.nativeTurn.deliveryBlocked) {
			return { state: "rejected", commandId, reason: "실행·승인·수신 대조 중에는 Chat을 비울 수 없습니다." };
		}
		this.visibleActivities.splice(0);
		this.visibleThreadId      = null                                  ;
		this.visibleAfterSequence = this.activities.at(-1)?.sequence ?? 0 ;
		this.selectedActivityId   = null                                  ;
		this.sessionGoal          = null                                  ;
		this.publish();
		return { state: "accepted", commandId, message: "Chat 화면을 비웠습니다. 기록과 Native thread는 유지됩니다." };
	}

	private async compactThread(commandId: string): Promise<WorkbenchCommandReceipt> {
		if (!this.threadId) return { state: "rejected", commandId, reason: "압축할 Native thread가 없습니다." };
		if (this.activeTurnId || this.pendingApproval || this.nativeTurn.deliveryBlocked) {
			return { state: "rejected", commandId, reason: "실행·승인·수신 대조가 끝난 뒤 컨텍스트를 압축할 수 있습니다." };
		}
		const candidate = this.native as Partial<ThreadCompactionPort>;
		if (typeof candidate.compactThread !== "function") {
			return { state: "rejected", commandId, reason: "연결된 App Server는 수동 컨텍스트 압축을 지원하지 않습니다." };
		}
		await candidate.compactThread({ threadId: this.threadId });
		this.actionResult = immutable({
			kind      : "notice",
			title     : "Context",
			body      : "Native thread 컨텍스트 압축을 시작했습니다.",
			createdAt : new Date().toISOString(),
		});
		this.publish();
		return { state: "accepted", commandId };
	}

	private async resolveApproval(
		commandId: string,
		command: Extract<WorkbenchCommand, { type: "approval.resolve" }>,
	): Promise<WorkbenchCommandReceipt> {
		if (!this.pendingApproval || this.pendingApproval.requestId !== command.requestId) {
			return { state: "rejected", commandId, reason: "해당 승인 요청은 더 이상 대기 중이 아닙니다." };
		}
		if ("decision" in command.response && !workbenchApprovalDecisions(this.pendingApproval).includes(command.response.decision)) {
			return { state: "rejected", commandId, reason: "이 승인 요청이 제공하지 않는 결정입니다." };
		}
		const result = await this.approvalDispatcher.dispatch({ commandId, request: this.pendingApproval, response: command.response });
		if (result.state === "uncertain") return { state: "rejected", commandId, reason: `승인 전달 불확실 · 재전송하지 않고 Native 상태 확인이 필요합니다: ${result.reason}` };
		return { state: "accepted", commandId };
	}

	private selectAgent(commandId: string, agentRef: string | null): WorkbenchCommandReceipt {
		if (agentRef !== null) {
			const matches = this.cacheProjection.delegation(this.activities, this.threadId).flatMap(entry => entry.tasks)
				.filter(task => task.ref === agentRef || task.id === agentRef);
			if (matches.length !== 1) return { state: "rejected", commandId, reason: "현재 수행에 속한 에이전트의 고유 Ref를 선택하세요." };
			const match = matches[0];
			if (!match) return { state: "rejected", commandId, reason: "현재 수행에 속한 에이전트를 확인할 수 없습니다." };
			this.selectedAgentRef = match.ref;
		} else this.selectedAgentRef = null;
		this.publish();
		return { state: "accepted", commandId };
	}

	/** @linear WOO-718 */
	private selectActivity(commandId: string, activityId: string | null): WorkbenchCommandReceipt {
		if (!activityId) {
			this.selectedActivityId = null;
			this.publish();
			return { state: "accepted", commandId };
		}
		const selection = resolveActivitySelection({
			activityId,
			activities      : this.activities,
			currentThreadId : this.threadId,
			resumeCoverage  : this.nativeTurn.resumeCoverage(Boolean(this.options.resumeThreadId), this.processAttachedAt),
		});
		if (selection.state === "failed") return this.rejectedSelection(commandId, selection);
		this.selectedActivityId = activityId;
		this.publish();
		return { state: "accepted", commandId, selection };
	}

	private selectTraceActivity(commandId: string, activityId: string): WorkbenchCommandReceipt {
		const selection = resolveTraceSelection({
			activityId,
			activities      : this.activities,
			currentThreadId : this.threadId,
			workFlow        : this.workflow.currentFlow(),
			resumeCoverage  : this.nativeTurn.resumeCoverage(Boolean(this.options.resumeThreadId), this.processAttachedAt),
		});
		if (selection.state === "failed") return this.rejectedSelection(commandId, selection);
		this.selectedActivityId = selection.identity.activityId;
		this.publish();
		return { state: "accepted", commandId, selection };
	}

	private rejectedSelection(
		commandId: string,
		selection: Extract<ActivitySelectionResult, { state: "failed" }>,
	): WorkbenchCommandReceipt {
		return {
			state: "rejected",
			commandId,
			reason: `Activity 선택 실패 (${selection.failure.code}): ${selection.failure.activityId}`,
			selection,
		};
	}

	private configurePermission(commandId: string, mode: WorkbenchPermissionMode): WorkbenchCommandReceipt {
		this.permissionMode = mode                                                      ;
		this.approvalPolicy = mode === "all" ? "never" : "on-request"                   ;
		this.sandbox        = mode === "all" ? "danger-full-access" : "workspace-write" ;
		this.publish();
		return {
			state: "accepted",
			commandId,
			message: mode === "all"
				? "bypass mode: 다음 요청부터 승인 없이 전체 로컬 권한을 사용합니다."
				: "manual mode: 다음 요청부터 workspace 범위와 수동 승인을 사용합니다.",
		};
	}

	private configureCollaboration(commandId: string, mode: WorkbenchCollaborationMode): WorkbenchCommandReceipt {
		this.collaborationMode = mode;
		this.publish();
		return {
			state: "accepted",
			commandId,
			message: mode === "plan"
				? "plan mode: 다음 요청부터 계획 중심으로 응답합니다."
				: "manual mode: 다음 요청부터 기본 실행 모드로 응답합니다.",
		};
	}

	private async configureModel(
		commandId: string,
		selection: WorkbenchModelSelection,
	): Promise<WorkbenchCommandReceipt> {
		const supportedModels = nativeModelNames(this.modelCatalog);
		if (!supportedModels.includes(selection.model) || !nativeModelEfforts(selection.model, this.modelCatalog).includes(selection.effort)) {
			return { state: "rejected", commandId, reason: "지원하지 않는 Codex 모델 설정입니다." };
		}
		if (selection.model === this.selectedModel && selection.effort === this.selectedEffort) {
			return { state: "accepted", commandId, message: `이미 ${selection.model} · 추론 ${selection.effort}을 사용 중입니다.` };
		}
		if (this.activeTurnId || this.nativeTurn.queue.length > 0 || this.nativeTurn.deliveryBlocked) {
			return { state: "rejected", commandId, reason: "응답 또는 대기 메시지를 처리하는 중에는 모델을 변경할 수 없습니다." };
		}
		await this.options.persistModelSelection?.(selection, this.modelCatalog);
		this.selectedModel   = selection.model  ;
		this.selectedEffort  = selection.effort ;
		this.effectiveModel  = selection.model  ;
		this.effectiveEffort = selection.effort ;
		this.publish();
		return {
			state: "accepted",
			commandId,
			message: `모델 변경: ${selection.model} · 추론 ${selection.effort}`,
		};
	}

	private mcpManagement(): WorkbenchMcpManagement | null {
		const candidate = this.native as Partial<WorkbenchMcpManagement>;
		return typeof candidate.listMcpServers === "function"
			&& typeof candidate.setMcpServerEnabled === "function"
			&& typeof candidate.reloadMcpServers === "function"
			? candidate as WorkbenchMcpManagement
			: null;
	}

	private async bindTodoThread(threadId: string): Promise<void> {
		const todos = this.options.todos;
		if (!todos?.bindThread) return;
		await todos.bindThread(threadId);
		this.todo = immutable(todos.snapshot);
	}

	private async runLocalWorkflow(commandId: string, command: Extract<WorkbenchCommand, { type: "workflow.check" | "workflow.resume" | "workflow.show" }>): Promise<WorkbenchCommandReceipt> {
		const service = this.options.localWorkflow;
		if (!service) return { state: "rejected", commandId, reason: "로컬 Workflow 검사가 연결되지 않았습니다." };
		if (command.type !== "workflow.show" && (this.activeTurnId || this.pendingApproval || this.nativeTurn.deliveryBlocked)) {
			return { state: "rejected", commandId, reason: "Native 실행이 종료되고 전송 상태가 확인된 뒤 로컬 Workflow를 실행하세요." };
		}
		const result = command.type === "workflow.check" ? await service.run(command.processId)
			: command.type === "workflow.resume" ? await service.resume(command.runId) : await service.inspect(command.runId);
		this.setActionResult("workflow", "로컬 Workflow 사전 검사", result.summary);
		return { state: "accepted", commandId, message: "로컬 Workflow 결과를 확인하세요. 원격 정합은 미검증입니다." };
	}

	private setActionResult(kind: WorkbenchActionResult["kind"], title: string, body: string, digest?: string): void {
		this.actionResult = immutable({
			kind,
			title,
			body: sanitizeTerminalTextExcerpt(body, WORKBENCH_ACTION_RESULT_CHARACTER_LIMIT, "head-tail"),
			...(digest ? { digest } : {}),
			createdAt: new Date().toISOString(),
		});
		this.publish();
	}

	private async appendActivity(
		kind: ProjectActivityKind,
		phase: ProjectActivityPhase,
		nativeRefs: NativeRefs,
		payload: Readonly<Record<string, unknown>>,
		publish = true,
		sourceDigest?: string,
	): Promise<ProjectActivity> {
		return this.activityJournal.append(kind, phase, nativeRefs, payload, publish, sourceDigest);
	}

	private selectedExecutionRun(): ExecutionRunState | null {
		return this.activityJournal.selected();
	}

	private applyThreadSettings(thread: { model?: string; effort?: string | null }): void {
		if (thread.model) this.effectiveModel = thread.model;
		if (thread.effort !== undefined) this.effectiveEffort = thread.effort;
	}

	private setContextTurn(turnId: string | null): void {
		if (this.contextTurnId !== turnId) this.usageTracker.invalidateContext();
		this.contextTurnId = turnId;
	}

	private isActivityVisible(activity: ProjectActivity): boolean {
		return this.visibleThreadId
			? activity.nativeRefs.threadId === this.visibleThreadId
			: activity.sequence > this.visibleAfterSequence;
	}

	private fail(error: unknown): void {
		this.error = errorMessage(error);
		this.publish("error");
	}

	private publish(phase?: WorkbenchSnapshot["phase"]): void {
		const traceId = this.performanceTraceContext.getStore() ?? null;
		if (traceId) {
			this.observeLayerPerformance(traceId, "state-projection", "queued");
			this.observeLayerPerformance(traceId, "state-projection", "started");
		}
		if (phase !== "loading") this.revision += 1;
		try {
			this.current = this.makeSnapshot(phase ?? (this.error ? "error" : this.activeTurnId || this.pendingApproval ? "working" : "ready"));
		} catch (error) {
			if (traceId) this.observeLayerPerformance(traceId, "state-projection", "failed");
			throw error;
		}
		if (traceId) {
			this.observeLayerPerformance(traceId, "state-projection", "completed");
			this.observeLayerPerformance(traceId, "snapshot-publish", "queued");
			this.observeLayerPerformance(traceId, "snapshot-publish", "started");
		}
		for (const listener of this.listeners) {
			try { listener(this.current); } catch { /* observers cannot corrupt durable state */ }
		}
		if (traceId) this.observeLayerPerformance(traceId, "snapshot-publish", "completed");
	}

	private makeSnapshot(phase: WorkbenchSnapshot["phase"]): WorkbenchSnapshot {
		this.noteNarration.scheduleNarrations();
		const stream            = this.nativeStream.snapshot                                               ;
		const durable           = this.durableProjection.activities(this.visibleActivities, this.threadId) ;
		const executionRun      = this.selectedExecutionRun()                                              ;
		const executionActivity = executionRun ? projectExecutionActivity(executionRun) : null             ;
		const workFlow          = this.workflow.currentFlow()                                              ;
		const delegation        = this.cacheProjection.delegation(this.activities, this.threadId)          ;
		// New requests always use the seven-stage template. Legacy sessions retain
		// their Native Plan projection; stages are never inferred retroactively.
		const allRequestRuntime = this.workflow.records();
		const selectedRequestTurnId = this.activeTurnId ?? this.selectedPlanTurnId;
		const requestRuntime = this.requestRuntimePolicy.mode !== "off"
			? allRequestRuntime
			: allRequestRuntime.filter(request => request.turnId === selectedRequestTurnId);
		const request         = [...requestRuntime].reverse().find(r => r.turnId === (this.activeTurnId ?? this.selectedPlanTurnId)) ?? requestRuntime.at(-1) ;
		const todo            = this.workflow.projectedTodo(executionRun, workFlow)                                                                           ;
		const modelCatalog    = this.modelCatalog                                                                                                             ;
		const linearDashboard = this.options.linearDashboard ? this.linearDashboard : undefined                                                               ;
		if (linearDashboard) this.cacheProjection.hit("dashboard");
		const cacheObservations = this.cacheProjection.observations({
			requestCached      : this.workflow.requestCached,
			modelEntries       : this.modelCatalog.models.length,
			modelStale         : Boolean(this.modelCatalog.error),
			dashboardConnected : Boolean(this.options.linearDashboard),
			dashboardReady     : this.linearDashboard.state === "ready",
			dashboardFetched   : this.linearDashboard.fetchedAt !== null,
			journal            : this.journal.cacheObservation?.() ?? null,
		});
		return deepFreeze({
			...this.noteNarration.planSnapshot(),
			requestRuntime,
			cacheObservations,
			modelCatalog,
			projectId       : this.options.projectId,
			revision        : this.revision,
			journalSequence : this.activities.at(-1)?.sequence ?? 0,
			phase,
			model: this.effectiveModel,
			// A model switch takes effect on the next turn, so the running turn keeps the model it
			// was started with.  Reporting the selection here would name a model that is not
			// producing the output on screen.
			activeModel       : (this.activeTurnId ? this.usageTracker.modelFor(this.activeTurnId) : undefined) ?? this.effectiveModel,
			effort            : this.effectiveEffort,
			contextUsage      : this.usageTracker.contextUsage,
			sessionUsage      : this.usageTracker.snapshot(this.options.auxiliaryUsage),
			resumeCoverage    : this.nativeTurn.resumeCoverage(Boolean(this.options.resumeThreadId), this.processAttachedAt),
			sessionGoal       : this.sessionGoal,
			permissionMode    : this.permissionMode,
			collaborationMode : this.collaborationMode,
			mcpServers        : this.mcpServers,
			...(this.options.skillRegistry ? { skillInventory: {
				count          : this.options.skillRegistry.skills.length,
				names          : this.options.skillRegistry.skills.map(skill => skill.name),
				sourceRevision : this.options.skillRegistry.sourceRevision,
				digest         : this.options.skillRegistry.digest,
			} } : {}),
			...(linearDashboard === undefined ? {} : { linearDashboard }),
			wooEntry: this.options.wooEntry?.snapshot ?? null,
			threadId: this.threadId,
			activeTurnId: this.activeTurnId && executionRun && !["completed", "failed", "interrupted"].includes(executionRun.phase)
				? executionRun.turnId
				: null,
			executionRun      : executionRun ? immutable(executionRun) : null,
			performance       : projectPerformance({ activities: this.activities, run: executionRun, flow: workFlow }),
			recordingReadOnly : this.recordingReadOnly,
			delegation,
			selectedAgentRef: this.selectedAgentRef,
			selectedAgentDetail: delegation.flatMap(entry => entry.tasks).find(task => task.ref === this.selectedAgentRef) ?? null,
			...(this.options.delegationDetailActivities === undefined ? {} : { delegationDetailActivities: this.options.delegationDetailActivities }),
			...(this.options.evaluationRequired === undefined ? {} : { evaluationRequired: this.options.evaluationRequired }),
			...(this.options.configurationSource === undefined ? {} : { configurationSource: this.options.configurationSource }),
			...(this.options.tnoteVisibleLimit === undefined ? {} : { tnoteVisibleLimit: this.options.tnoteVisibleLimit }),
			...(this.options.tnoteSummaryMaxChars === undefined ? {} : { tnoteSummaryMaxChars: this.options.tnoteSummaryMaxChars }),
			...(this.options.tnoteSummaryMaxLines === undefined ? {} : { tnoteSummaryMaxLines: this.options.tnoteSummaryMaxLines }),
			...(this.options.hud === undefined ? {} : { hud: this.options.hud }),
			...(this.options.slash === undefined ? {} : { slash: this.options.slash }),
			activityCount         : durable.activityCount,
			activities            : durable.activities,
			selectedActivityId    : this.selectedActivityId,
			pendingApproval       : this.pendingApproval,
			chat                  : this.durableProjection.chat(durable.chat, this.preThreadChat, this.threadId),
			chatQueue             : immutable(this.nativeTurn.queue),
			draft                 : stream.draft.startsWith(REQUEST_REPORT_PREFIX) ? "" : stream.draft,
			reasoningDraft        : stream.reasoningDraft,
			reasoningSummaryDraft : stream.reasoningSummaryDraft,
			liveActivity: immutable(executionActivity && executionRun ? {
				method     : executionActivity.method,
				kind       : executionActivity.kind,
				text       : executionActivity.text,
				nativeRefs : { threadId: executionRun.threadId, turnId: executionRun.turnId, itemId: executionActivity.id },
			} : stream.liveActivity),
			workFlow,
			tnotes: this.durableProjection.notes(this.noteNarration.notes, this.visibleActivities),
			todo,
			todoSync                  : this.workflow.todoSync,
			actionResult              : this.actionResult,
			deliveryUncertain         : this.nativeTurn.deliveryBlocked,
			error                     : this.error,
			developmentRecordingError : this.developmentRecordingError,
		});
	}

}

function digestSource(source: string): string {
	return `sha256:${createHash("sha256").update(source).digest("hex")}`;
}

function immutable<T>(value: T): T {
	return deepFreezeFresh(structuredClone(value));
}

function deepFreezeFresh<T>(value: T): T {
	if (!value || typeof value !== "object") return value;
	for (const child of Object.values(value as Record<string, unknown>)) deepFreezeFresh(child);
	if (!Object.isFrozen(value)) Object.freeze(value);
	return value;
}

function deepFreeze<T>(value: T): T {
	if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
	Object.freeze(value);
	for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
	return value;
}

function isUncertain(error: unknown): error is NativeUncertainOperation {
	if (!error || typeof error !== "object" || Array.isArray(error)) return false;
	const value = error as Partial<NativeUncertainOperation>;
	return value.state === "uncertain" && value.resolution === "manual-reconcile" &&
		typeof value.method === "string" && (typeof value.requestId === "string" || typeof value.requestId === "number");
}

function errorMessage(error: unknown): string {
	if (isUncertain(error)) return `Native ${error.method} 요청의 수신 여부가 불명확합니다. 수동 정합 전에는 자동 재시도하지 않습니다.`;
	return error instanceof Error ? error.message : String(error);
}

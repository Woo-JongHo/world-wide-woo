import { createHash, randomUUID } from "node:crypto";
import type { NativeHarnessPort } from "./native-harness.js";
import { createCanonicalDocumentDraft, type CanonicalPromotionService } from "./canonical-promotion.js";
import type { ReviewService } from "./review-service.js";
import type { ActivityNarrator } from "./activity-narrator.js";
import type { SessionModelUsageSource } from "./session-model-usage.js";
import { TodoWriteConflictError } from "./todo-ledger.js";
import type { WooEntry } from "./woo-entry.js";
import { ContextComposer } from "./context-composer.js";
import type {
	BackgroundWorkState,
	NativeApprovalPolicy,
	NativeApprovalRequest,
	NativeCollaborationMode,
	NativeHarnessEvent,
	NativeRefs,
	NativeSandboxMode,
	NativeSandboxPolicy,
	NativeThreadStart,
	NativeUncertainOperation,
} from "../domain/native-session.js";
import { projectBackgroundWorkState } from "../domain/native-session.js";
import { EFFORTS, MODELS } from "../domain/model-settings.js";
import {
	isReasoningActivityPayload,
	type ProjectActivity,
	type ProjectActivityAppendResult,
	type ProjectActivityInput,
	type ProjectActivityKind,
	type ProjectActivityPhase,
} from "../domain/project-activity.js";
import { sanitizeTerminalTextExcerpt, sanitizeTerminalTextUnbounded } from "../domain/terminal.js";
import type { TodoDocument } from "../domain/todos.js";
import type { CanonicalDocumentDraft } from "../domain/canonical-document.js";
import type { ReviewPacket, ReviewProvider } from "../domain/review.js";
import {
	projectWorkFlow,
	type DplanHash,
	type WorkFlowProjectionInput,
	type WorkFlowProjection,
	type WorkStepNarration,
} from "../domain/work-steps.js";
import {
	projectTNoteCompletionIndex,
	projectActivityToTNoteSource,
	sanitizeTNoteText,
	type TNoteActivitySource,
	type TNoteDraft,
	type TNoteSourceRange,
} from "../domain/t-notes.js";
import { validateCanonicalTNote } from "./t-note-service.js";
import type {
	WorkbenchChatMessage,
	WorkbenchChatQueueItem,
	WorkbenchActionResult,
	WorkbenchCollaborationMode,
	WorkbenchCommand,
	WorkbenchCommandReceipt,
	WorkbenchContextUsage,
	WorkbenchListener,
	WorkbenchLiveActivity,
	WorkbenchMcpServer,
	WorkbenchModelSelection,
	WorkbenchPermissionMode,
	WorkbenchSessionGoal,
	WorkbenchSessionUsage,
	WorkbenchSnapshot,
	WorkbenchTNote,
} from "../domain/workbench.js";
import { workbenchApprovalDecisions } from "../domain/workbench.js";

const LIVE_ACTIVITY_TAIL_CHARACTER_LIMIT = 32 * 1024 - 128;
const contextComposer = new ContextComposer();
const ASSISTANT_DRAFT_TAIL_CHARACTER_LIMIT = 28 * 1024 - 128;
const REASONING_DRAFT_TAIL_CHARACTER_LIMIT = 16 * 1024 - 128;
const JOURNAL_NATIVE_TEXT_CHARACTER_LIMIT = 32 * 1024;
const JOURNAL_NATIVE_MAX_DEPTH = 8;
const dplanHash: DplanHash = {
	sha256Hex: (input) => createHash("sha256").update(input).digest("hex"),
};
const JOURNAL_NATIVE_MAX_ITEMS = 128;
const JOURNAL_NATIVE_MAX_COLLECTION_ITEMS = 64;
const JOURNAL_NATIVE_OMISSION = "[journal observation omitted]";
const WORKBENCH_ACTION_RESULT_CHARACTER_LIMIT = 12 * 1024;
const NATIVE_CONTEXT_BASELINE_TOKENS = 12_000;

const SESSION_GOAL_MARKER = /^SESSION_GOAL:[ \t]*(\S(?:[^\r\n]*\S)?)$/u;
const SESSION_GOAL_CHARACTER_LIMIT = 160;

interface McpManagementPort {
	listMcpServers(): Promise<readonly WorkbenchMcpServer[]>;
	setMcpServerEnabled(name: string, enabled: boolean): Promise<void>;
	reloadMcpServers(): Promise<void>;
}

interface BoundedTextProjection {
	readonly tail: string;
	readonly omittedCharacters: number;
}

interface DurableActivityProjection {
	readonly sourceLength: number;
	readonly activityCount: number;
	readonly activities: readonly ProjectActivity[];
	readonly chat: readonly WorkbenchChatMessage[];
}

interface DurableNoteProjection {
	readonly sourceLength: number;
	readonly activitySourceLength: number;
	readonly notes: readonly WorkbenchTNote[];
}

interface JournalNativeProjectionState {
	remainingCharacters: number;
	remainingItems: number;
	omitted: boolean;
}

export interface WorkbenchActivityJournal {
	append(input: ProjectActivityInput): Promise<ProjectActivityAppendResult>;
	readAll(projectId: string): Promise<ProjectActivity[]>;
	/** True once the journal owns a Native thread stream; appends fail before that. */
	hasBoundThread?(): boolean;
}

export interface WorkbenchTodoSource {
	readonly snapshot: TodoDocument | null;
	subscribe(listener: (snapshot: TodoDocument | null) => void): () => void;
	/** Binds the live board to the provider-issued Native thread identity. */
	bindThread?(threadId: string): Promise<void>;
	/** Optional Native-plan mirror. It must never block the interactive Chat path. */
	syncNativePlan?(flow: WorkFlowProjection): Promise<TodoDocument>;
	create(title: string, items: readonly string[], storyId?: string): Promise<TodoDocument>;
	add(content: string, placement: "now" | "after"): Promise<TodoDocument>;
	addDetails(itemId: string, details: readonly string[]): Promise<TodoDocument>;
	start(itemId: string): Promise<TodoDocument>;
	complete(itemId: string): Promise<TodoDocument>;
	block(itemId: string): Promise<TodoDocument>;
	reopen(itemId: string): Promise<TodoDocument>;
	recordEvidence(evidenceId: string): Promise<TodoDocument | null>;
	importLegacy(): Promise<string | null>;
}

export interface WorkbenchTNoteSource {
	/** Binds T-note history to the provider-issued Native thread identity. */
	bindThread?(threadId: string): Promise<void>;
	readAll(projectId: string): Promise<readonly TNoteDraft[]>;
	/** The adapter/generator owns its isolated cwd; Workbench never supplies the project root. */
	create(input: {
		projectId: string;
		range: TNoteSourceRange;
		activities: readonly TNoteActivitySource[];
		instruction: string;
		expectedQuestion: string;
	}, signal?: AbortSignal): Promise<TNoteDraft>;
}

export interface ProjectWorkbenchOptions {
	projectId: string;
	/** Local, per-process journal namespace. Defaults to the project identity. */
	activityJournalProjectId?: string;
	provider?: string;
	cwd: string;
	model?: NativeThreadStart["model"];
	effort?: NativeThreadStart["effort"];
	approvalPolicy?: NativeThreadStart["approvalPolicy"];
	sandbox?: NativeThreadStart["sandbox"];
	resumeThreadId?: string;
	/** Acquires the caller-owned writable lease before resuming a thread. */
	acquireThreadLease?: (threadId: string) => Promise<void>;
	todos?: WorkbenchTodoSource;
	tnotes?: WorkbenchTNoteSource;
	promotions?: CanonicalPromotionService;
	reviews?: ReviewService;
	narrator?: ActivityNarrator;
	wooEntry?: WooEntry;
	auxiliaryUsage?: SessionModelUsageSource;
	persistModelSelection?: (selection: WorkbenchModelSelection) => Promise<void>;
}

/**
 * Coordinates native conversation state behind one application-owned boundary.
 * Native observations become visible only after their durable journal append.
 */
export class ProjectWorkbench {
	private readonly listeners = new Set<WorkbenchListener>();
	private readonly activities: ProjectActivity[] = [];
	private readonly visibleActivities: ProjectActivity[] = [];
	private readonly preThreadChat = new Map<string, WorkbenchChatMessage>();
	private readonly notes: WorkbenchTNote[] = [];
	private readonly terminalTurns = new Set<string>();
	private readonly noteDrafts = new Map<string, TNoteDraft>();
	private readonly completionOrdinals = new Map<string, number>();
	private readonly promotionDrafts = new Map<string, CanonicalDocumentDraft>();
	private readonly reviewPreviews = new Map<string, { provider: ReviewProvider; packet: ReviewPacket }>();
	private readonly stepNarrations = new Map<string, WorkStepNarration>();
	private readonly narrationRequestKeys = new Map<string, string>();
	private readonly narrationAbort = new AbortController();
	private narrationRevision = 0;
	private workFlowProjection: {
		sourceLength: number;
		narrationRevision: number;
		authorityKey: string | null;
		value: WorkFlowProjection;
	} = {
		sourceLength: -1,
		narrationRevision: -1,
		authorityKey: null,
		value: projectWorkFlow([]),
	};
	private selectedActivityId: string | null = null;
	private pendingApproval: NativeApprovalRequest | null = null;
	private selectedModel: NativeThreadStart["model"];
	private selectedEffort: NativeThreadStart["effort"];
	private effectiveModel: string;
	private effectiveEffort: string | null;
	private permissionMode: WorkbenchPermissionMode;
	private collaborationMode: WorkbenchCollaborationMode = "manual";
	private approvalPolicy: NativeApprovalPolicy;
	private sandbox: NativeSandboxMode;
	private contextUsage: WorkbenchContextUsage | null = null;
	private sessionGoal: WorkbenchSessionGoal | null = null;
	private contextTurnId: string | null = null;
	private observedThreadTotalTokens: number | null;
	private readonly turnUsageModels = new Map<string, { model: string; effort: string | null }>();
	private readonly usageTurns = new Set<string>();
	private readonly modelUsage = new Map<string, {
		model: string;
		effort: string | null;
		interactiveRootTurns: number;
		interactiveTokens: number;
		detachedInvocations: 0;
		detachedTokens: 0;
		totalTokens: number;
	}>();
	private readonly pendingUsageByTurn = new Map<string, number>();
	private readonly firstOutputObservedTurns = new Set<string>();
	private readonly processAttachedAt = new Date().toISOString();
	private unattributedUsageTokens = 0;
	private threadId: string | null = null;
	private activeTurnId: string | null = null;
	/** Last explicitly selected root turn; remains plan authority after terminal completion. */
	private selectedPlanTurnId: string | null = null;
	/** A submitted root question can update the public goal before Native confirms its turn id. */
	private pendingPlanGoalActivityId: string | null = null;
	private todo: TodoDocument | null;
	private error: string | null = null;
	private draft = "";
	private reasoningDraft = "";
	private reasoningSummaryDraft = "";
	private draftItemId: string | null = null;
	private reasoningItemId: string | null = null;
	private reasoningSummaryItemId: string | null = null;
	private draftProjection = emptyBoundedTextProjection();
	private reasoningProjection = emptyBoundedTextProjection();
	private reasoningSummaryProjection = emptyBoundedTextProjection();
	private liveActivity: WorkbenchLiveActivity | null = null;
	private liveActivityProjection = emptyBoundedTextProjection();
	private actionResult: WorkbenchActionResult | null = null;
	private mcpServers: readonly WorkbenchMcpServer[] = Object.freeze([]);
	private readonly chatQueue: WorkbenchChatQueueItem[] = [];
	private durableActivityProjection: DurableActivityProjection = {
		sourceLength: -1,
		activityCount: 0,
		activities: Object.freeze([]),
		chat: Object.freeze([]),
	};
	private visibleThreadId: string | null = null;
	private visibleAfterSequence = 0;
	private readonly automaticTNoteTurns = new Set<string>();
	private readonly tnoteInFlight = new Map<string, Promise<TNoteDraft>>();
	private durableNoteProjection: DurableNoteProjection = {
		sourceLength: -1,
		activitySourceLength: -1,
		notes: Object.freeze([]),
	};
	private chatDeliveryBlocked = false;
	private blockedChat: { id: string; content: string } | null = null;
	private closed = false;
	private revision = 0;
	private current: WorkbenchSnapshot;
	private eventQueue: Promise<void> = Promise.resolve();
	private commandQueue: Promise<void> = Promise.resolve();
	private todoSyncQueue: Promise<void> = Promise.resolve();
	private tnoteQueue: Promise<void> = Promise.resolve();
	private readonly ready: Promise<void>;
	private readonly unsubscribeNative: () => void;
	private readonly unsubscribeTodo: () => void;
	private readonly unsubscribeAuxiliaryUsage: () => void;

	public constructor(
		private readonly native: NativeHarnessPort,
		private readonly journal: WorkbenchActivityJournal,
		private readonly options: ProjectWorkbenchOptions,
	) {
		this.selectedModel = options.model;
		this.selectedEffort = options.effort;
		this.effectiveModel = options.model ?? "codex";
		this.effectiveEffort = options.effort ?? null;
		this.observedThreadTotalTokens = options.resumeThreadId ? null : 0;
		this.permissionMode = options.approvalPolicy === "never" && options.sandbox === "danger-full-access" ? "all" : "manual";
		this.approvalPolicy = options.approvalPolicy ?? "on-request";
		this.sandbox = options.sandbox ?? "workspace-write";
		this.todo = immutable(options.todos?.snapshot ?? null);
		this.current = this.makeSnapshot("loading");
		this.ready = this.initialize();
		this.unsubscribeNative = native.subscribe((event) => {
			this.eventQueue = this.eventQueue
				.then(() => this.ready)
				.then(() => this.recordNativeEvent(event))
				.catch((error) => this.fail(error));
		});
		this.unsubscribeTodo = options.todos?.subscribe((todo) => {
			this.todo = immutable(todo);
			this.publish();
		}) ?? (() => undefined);
		this.unsubscribeAuxiliaryUsage = options.auxiliaryUsage?.subscribe(() => this.publish()) ?? (() => undefined);
		void this.ready.catch((error) => this.fail(error));
	}

	public get snapshot(): WorkbenchSnapshot {
		return this.current;
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
		const operation = this.commandQueue
			.catch(() => undefined)
			.then(() => this.dispatchSerialized(command));
		this.commandQueue = operation.then(() => undefined, () => undefined);
		return operation;
	}

	private async dispatchSerialized(command: WorkbenchCommand): Promise<WorkbenchCommandReceipt> {
		const commandId = randomUUID();
		if (this.closed) return { state: "rejected", commandId, reason: "Workbench가 종료되었습니다." };
		try {
			await this.ready;
			await this.eventQueue;
				switch (command.type) {
				case "activity.select": return this.selectActivity(commandId, command.activityId);
				case "session.permission": return this.configurePermission(commandId, command.mode);
				case "session.mode": return this.configureCollaboration(commandId, command.mode);
				case "session.model": return await this.configureModel(commandId, command.selection);
				case "mcp.refresh": return await this.refreshMcpServers(commandId);
				case "mcp.enable": return await this.setMcpServerEnabled(commandId, command.name, true);
				case "mcp.disable": return await this.setMcpServerEnabled(commandId, command.name, false);
				case "mcp.reload": return await this.reloadMcpServers(commandId);
				case "woo-entry.refresh": return await this.refreshWooEntry(commandId);
				case "tnote.capture-session": return await this.captureSessionNote(commandId);
				case "tnote.capture": return await this.captureNote(commandId, command.activityIds);
				case "tnote.capture-range": return await this.captureNoteRange(commandId, command.startSequence, command.endSequence);
				case "chat.send": return await this.sendChat(commandId, command.text);
				case "chat.cancel": return await this.cancelChat(commandId);
				case "approval.resolve": return await this.resolveApproval(commandId, command);
				case "todo.create": return await this.mutateTodo(commandId, "Todo 생성", () => this.requireTodos().create(command.title, command.items, command.storyId));
				case "todo.add": return await this.mutateTodo(commandId, "Todo 항목 추가", () => this.requireTodos().add(command.content, command.placement));
				case "todo.details": return await this.mutateTodo(commandId, "Todo 세부 항목 추가", () => this.requireTodos().addDetails(command.itemId, command.details));
				case "todo.transition": return await this.transitionTodo(commandId, command.action, command.itemId);
				case "todo.evidence": return await this.recordTodoEvidence(commandId, command.activityId);
				case "todo.import-legacy": return await this.importLegacyTodo(commandId);
				case "promotion.accept": return await this.acceptPromotion(commandId, command.noteId, command.acceptedBy);
				case "promotion.confirm": return await this.confirmPromotion(commandId, command.token);
				case "review.preview": return await this.previewReview(commandId, command.provider, command.noteId, command.request, command.confirmedPublic);
				case "review.send": return await this.sendReview(commandId, command.digest);
			}
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
		this.narrationAbort.abort();
		this.unsubscribeNative();
		this.unsubscribeTodo();
		this.unsubscribeAuxiliaryUsage();
		await this.commandQueue.catch(() => undefined);
		await this.eventQueue.catch(() => undefined);
		await this.todoSyncQueue.catch(() => undefined);
		await this.tnoteQueue.catch(() => undefined);
		await this.native.close();
		this.publish("closed");
		this.listeners.clear();
	}

	private async initialize(): Promise<void> {
		const [activities] = await Promise.all([
			this.journal.readAll(this.activityJournalProjectId()),
			this.options.wooEntry?.refresh() ?? Promise.resolve(null),
			this.mcpManagement()?.listMcpServers().then((servers) => { this.mcpServers = immutable(servers); }) ?? Promise.resolve(),
		]);
		for (const activity of activities) {
			const durableActivity = immutable(activity);
			this.activities.push(durableActivity);
			this.rememberTerminalTurn(durableActivity);
			if (durableActivity.payload.method === "turn/first-output-observed" && durableActivity.nativeRefs.turnId) {
				this.firstOutputObservedTurns.add(durableActivity.nativeRefs.turnId);
			}
		}
		this.visibleAfterSequence = this.activities.at(-1)?.sequence ?? 0;
		if (this.options.tnotes && !this.options.tnotes.bindThread) await this.loadBoundTNotes();
		if (this.options.resumeThreadId) {
			await this.options.acquireThreadLease?.(this.options.resumeThreadId);
			const resumed = await this.native.resumeThread({
				threadId: this.options.resumeThreadId,
				cwd: this.options.cwd,
				model: this.selectedModel,
				effort: this.selectedEffort ?? undefined,
				approvalPolicy: this.approvalPolicy,
				sandbox: this.sandbox,
				excludeTurns: true,
			});
			await this.bindThreadSources(resumed.id);
			this.applyThreadSettings(resumed);
			this.visibleThreadId = resumed.id;
			this.visibleActivities.push(...this.activities.filter(activity => activity.nativeRefs.threadId === resumed.id));
			this.selectedPlanTurnId = [...this.activities].reverse().find((activity) =>
				activity.nativeRefs.threadId === resumed.id
				&& (activity.payload.method === "turn/start" || activity.payload.method === "turn/started")
				&& typeof activity.nativeRefs.turnId === "string",
			)?.nativeRefs.turnId ?? null;
			this.invalidateWorkFlow();
			this.scheduleNarrations();
			const read = await this.native.readThread({ threadId: resumed.id, includeTurns: true });
			const delivery = blockedChatDeliveryState(read.value);
			if (delivery.state === "unknown") {
				throw new Error("재개한 native thread의 현재 turn 상태를 안전하게 판독할 수 없습니다.");
			}
			this.threadId = read.id;
			const resumedTodoFlow = this.projectCurrentWorkFlow();
			const syncResumedTodo = this.options.todos?.syncNativePlan?.bind(this.options.todos);
			if (
				syncResumedTodo
				&& (!this.todo || this.todo.items.length === 0)
				&& resumedTodoFlow.source
				&& resumedTodoFlow.steps.length > 0
			) {
				this.enqueueNativeTodoSync(syncResumedTodo, resumedTodoFlow);
			}
			await this.appendActivity("progress", "completed", { threadId: read.id }, {
				method: "thread/resume-local-reconciled",
				historyHydrated: false,
				nativeState: delivery.state,
			}, false);
			if (delivery.state === "in-progress") {
				this.activeTurnId = delivery.turnId;
				this.selectedPlanTurnId = delivery.turnId;
				this.contextTurnId = delivery.turnId;
				this.bindTurnUsage(delivery.turnId, this.effectiveModel, this.effectiveEffort);
				await this.appendActivity("progress", "started", {
					threadId: read.id,
					turnId: delivery.turnId,
				}, {
					method: "turn/started",
					reconciledFrom: "thread/read",
				}, false);
			}
		}
		this.sessionGoal = projectSessionGoal(this.visibleActivities);
		this.reconcileAutomaticTNotes();
		this.publish("ready");
	}

	private async sendChat(commandId: string, rawText: string): Promise<WorkbenchCommandReceipt> {
		const text = sanitizeTerminalTextUnbounded(rawText).trim();
		if (!text) return { state: "rejected", commandId, reason: "보낼 메시지가 비어 있습니다." };
		if (this.activeTurnId || this.pendingApproval || this.chatQueue.length > 0 || this.chatDeliveryBlocked) {
			await this.appendRequestObservation("request/submitted", commandId, this.threadId ?? undefined, text);
			await this.appendRequestObservation("request/queued", commandId, this.threadId ?? undefined, text);
			this.chatQueue.push({ id: commandId, content: text, queuedAt: new Date().toISOString() });
			this.publish();
			return { state: "queued", commandId, position: this.chatQueue.length };
		}
		const sent = await this.startChatTurn(text, commandId);
		return { state: "accepted", commandId, activitySequence: sent.sequence };
	}

	private async startChatTurn(text: string, localMessageId: string, queued = false): Promise<ProjectActivity> {
		const messagePayload = {
			direction: "outbound",
			role: "user",
			text,
		} as const;
		if (!this.threadId) {
			this.preThreadChat.set(localMessageId, {
				id: localMessageId,
				role: "user",
				content: text,
				activityId: localMessageId,
				status: "streaming",
			});
			this.publish();
			let thread: Awaited<ReturnType<NativeHarnessPort["startThread"]>>;
			try {
				thread = await this.native.startThread({
					cwd: this.options.cwd,
					model: this.selectedModel,
					effort: this.selectedEffort ?? undefined,
					approvalPolicy: this.approvalPolicy,
					sandbox: this.sandbox,
				});
			} catch (error) {
				this.preThreadChat.set(localMessageId, {
					...this.preThreadChat.get(localMessageId)!,
					status: "failed",
				});
				if (queued && this.chatQueue[0]?.id === localMessageId) this.chatQueue.shift();
				this.publish();
				throw error;
			}
			this.threadId = thread.id;
			await this.options.acquireThreadLease?.(thread.id);
			await this.bindThreadSources(thread.id);
			this.applyThreadSettings(thread);
			await this.appendActivity("progress", "completed", { threadId: thread.id }, {
				method: "thread/start",
				thread: thread.value,
			});
		}
		const messageRefs = { threadId: this.threadId, itemId: localMessageId };
		const outboundSourceDigest = digestSource(stableJson(messagePayload));
		const sent = await this.appendActivity("message", "started", messageRefs, messagePayload, false, outboundSourceDigest);
		if (!queued) await this.appendRequestObservation("request/submitted", localMessageId, this.threadId, text, outboundSourceDigest);
		this.preThreadChat.delete(localMessageId);
		this.pendingPlanGoalActivityId = sent.id;
		this.invalidateWorkFlow();
		this.publish();
		let turn: Awaited<ReturnType<NativeHarnessPort["startTurn"]>>;
		try {
			const turnInput = {
				threadId: this.threadId,
				text,
				cwd: this.options.cwd,
				model: this.selectedModel,
				effort: this.selectedEffort ?? undefined,
				approvalPolicy: this.approvalPolicy,
				sandboxPolicy: this.currentSandboxPolicy(),
				collaborationMode: this.currentNativeCollaborationMode(),
			};
			turn = await this.native.startTurn(contextComposer.compose(turnInput, this.options.wooEntry?.snapshot));
		} catch (error) {
			this.pendingPlanGoalActivityId = null;
			this.invalidateWorkFlow();
			if (isUncertain(error)) {
				this.chatDeliveryBlocked = true;
				this.blockedChat = { id: localMessageId, content: text };
				await this.appendRequestObservation("request/uncertain", localMessageId, this.threadId, text, outboundSourceDigest);
				await this.appendActivity("message", "failed", messageRefs, {
					...messagePayload,
					error: "Native가 메시지를 수신했는지 확인할 수 없습니다. 자동 재시도하지 않습니다.",
				});
				if (queued && this.chatQueue[0]?.id === localMessageId) this.chatQueue.shift();
				throw error;
			}
			await this.appendRequestObservation("request/failed", localMessageId, this.threadId, text, outboundSourceDigest);
			await this.appendActivity("message", "failed", messageRefs, {
				...messagePayload,
				error: errorMessage(error),
			}, false);
			if (queued && this.chatQueue[0]?.id === localMessageId) this.chatQueue.shift();
			this.publish();
			throw error;
		}
		this.bindTurnUsage(turn.id, this.effectiveModel, this.effectiveEffort);
		this.contextTurnId = turn.id;
		this.activeTurnId = turn.id;
		this.selectedPlanTurnId = turn.id;
		this.pendingPlanGoalActivityId = null;
		this.invalidateWorkFlow();
		this.chatDeliveryBlocked = false;
		this.blockedChat = null;
		if (queued && this.chatQueue[0]?.id === localMessageId) this.chatQueue.shift();
		await this.appendActivity("message", "completed", messageRefs, messagePayload);
		await this.appendRequestObservation("request/started", localMessageId, this.threadId, text, outboundSourceDigest, turn.id, {
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
			threadId,
			itemId: requestId,
			...(turnId ? { turnId } : {}),
		}, { method, requestId, ...(model ?? {}) }, false, sourceDigest);
	}

	private async drainChatQueue(): Promise<void> {
		while (!this.closed && !this.activeTurnId && !this.pendingApproval && !this.chatDeliveryBlocked) {
			const next = this.chatQueue[0];
			if (!next) return;
			try {
				await this.startChatTurn(next.content, next.id, true);
				return;
			} catch (error) {
				if (isUncertain(error) || this.chatQueue[0]?.id === next.id) throw error;
			}
		}
	}

	private async cancelChat(commandId: string): Promise<WorkbenchCommandReceipt> {
		if (this.chatDeliveryBlocked && this.blockedChat) {
			const abandoned = this.blockedChat;
			if (!this.threadId) {
				return { state: "rejected", commandId, reason: "불확정 전송을 정합할 native thread가 없습니다." };
			}
			let delivery: BlockedChatDeliveryState;
			try {
				const thread = await this.native.readThread({ threadId: this.threadId, includeTurns: true });
				delivery = blockedChatDeliveryState(thread.value);
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
			this.chatDeliveryBlocked = false;
			this.blockedChat = null;
			this.error = null;
			if (this.chatQueue[0]?.id === abandoned.id) this.chatQueue.shift();
			if (delivery.state === "in-progress") {
				this.activeTurnId = delivery.turnId;
				this.selectedPlanTurnId = delivery.turnId;
				this.contextTurnId = delivery.turnId;
				this.bindTurnUsage(delivery.turnId, this.effectiveModel, this.effectiveEffort);
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
					direction: "outbound",
					role: "user",
					text: abandoned.content,
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
				direction: "outbound",
				role: "user",
				text: abandoned.content,
				reason: "사용자가 수신 여부 불명확 전송을 포기했습니다.",
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
		await this.native.respondToApproval({ requestId: command.requestId, response: command.response });
		return { state: "accepted", commandId };
	}

	private selectActivity(commandId: string, activityId: string | null): WorkbenchCommandReceipt {
		if (activityId && !this.activities.some((activity) => activity.id === activityId)) {
			return { state: "rejected", commandId, reason: `Activity를 찾을 수 없습니다: ${activityId}` };
		}
		this.selectedActivityId = activityId;
		this.publish();
		return { state: "accepted", commandId };
	}

	private configurePermission(commandId: string, mode: WorkbenchPermissionMode): WorkbenchCommandReceipt {
		this.permissionMode = mode;
		this.approvalPolicy = mode === "all" ? "never" : "on-request";
		this.sandbox = mode === "all" ? "danger-full-access" : "workspace-write";
		this.publish();
		return {
			state: "accepted",
			commandId,
			message: mode === "all"
				? "Permission all: 다음 요청부터 승인 없이 전체 로컬 권한을 사용합니다."
				: "Permission manual: 다음 요청부터 workspace 범위와 수동 승인을 사용합니다.",
		};
	}

	private configureCollaboration(commandId: string, mode: WorkbenchCollaborationMode): WorkbenchCommandReceipt {
		this.collaborationMode = mode;
		this.publish();
		return {
			state: "accepted",
			commandId,
			message: mode === "plan"
				? "Plan 모드: 다음 요청부터 계획 중심으로 응답합니다."
				: "Manual 모드: 다음 요청부터 기본 실행 모드로 응답합니다.",
		};
	}

	private async configureModel(
		commandId: string,
		selection: WorkbenchModelSelection,
	): Promise<WorkbenchCommandReceipt> {
		const supportedModels = MODELS["openai-codex"] as readonly string[];
		if (!supportedModels.includes(selection.model) || !EFFORTS.includes(selection.effort)) {
			return { state: "rejected", commandId, reason: "지원하지 않는 Codex 모델 설정입니다." };
		}
		if (selection.model === this.selectedModel && selection.effort === this.selectedEffort) {
			return { state: "accepted", commandId, message: `이미 ${selection.model} · 추론 ${selection.effort}을 사용 중입니다.` };
		}
		if (this.activeTurnId || this.chatQueue.length > 0 || this.chatDeliveryBlocked) {
			return { state: "rejected", commandId, reason: "응답 또는 대기 메시지를 처리하는 중에는 모델을 변경할 수 없습니다." };
		}
		await this.options.persistModelSelection?.(selection);
		this.selectedModel = selection.model;
		this.selectedEffort = selection.effort;
		this.effectiveModel = selection.model;
		this.effectiveEffort = selection.effort;
		this.publish();
		return {
			state: "accepted",
			commandId,
			message: `모델 변경: ${selection.model} · 추론 ${selection.effort}`,
		};
	}

	private mcpManagement(): McpManagementPort | null {
		const candidate = this.native as Partial<McpManagementPort>;
		return typeof candidate.listMcpServers === "function"
			&& typeof candidate.setMcpServerEnabled === "function"
			&& typeof candidate.reloadMcpServers === "function"
			? candidate as McpManagementPort
			: null;
	}

	private requireMcpManagement(): McpManagementPort {
		const management = this.mcpManagement();
		if (!management) throw new Error("연결된 App Server는 MCP 서버 관리를 지원하지 않습니다.");
		return management;
	}

	private async refreshMcpServers(commandId: string): Promise<WorkbenchCommandReceipt> {
		this.mcpServers = immutable(await this.requireMcpManagement().listMcpServers());
		this.publish();
		return { state: "accepted", commandId };
	}

	private async setMcpServerEnabled(commandId: string, name: string, enabled: boolean): Promise<WorkbenchCommandReceipt> {
		const management = this.requireMcpManagement();
		await management.setMcpServerEnabled(name, enabled);
		this.mcpServers = immutable(await management.listMcpServers());
		this.publish();
		return { state: "accepted", commandId };
	}

	private async reloadMcpServers(commandId: string): Promise<WorkbenchCommandReceipt> {
		const management = this.requireMcpManagement();
		await management.reloadMcpServers();
		this.mcpServers = immutable(await management.listMcpServers());
		this.publish();
		return { state: "accepted", commandId };
	}

	private observeTokenUsage(event: Extract<NativeHarnessEvent, { type: "notification" }>): void {
		if (event.refs.threadId && this.threadId && event.refs.threadId !== this.threadId) return;
		const totalTokens = projectThreadTotalTokens(event.params);
		if (totalTokens !== null) {
			let delta = 0;
			if (this.observedThreadTotalTokens === null) {
				// A resumed thread already contains historical usage. The first
				// snapshot establishes this WWW process's baseline.
				this.observedThreadTotalTokens = totalTokens;
			} else if (totalTokens >= this.observedThreadTotalTokens) {
				delta = totalTokens - this.observedThreadTotalTokens;
				this.observedThreadTotalTokens = totalTokens;
			}
			if (delta > 0) this.attributeUsageDelta(event.refs.turnId, delta);
		}
		if (event.refs.turnId && event.refs.turnId === this.contextTurnId) {
			this.contextUsage = projectContextUsage(event.params);
		}
	}

	private bindTurnUsage(turnId: string, model: string, effort: string | null): void {
		this.turnUsageModels.set(turnId, { model, effort });
		const pending = this.pendingUsageByTurn.get(turnId);
		if (!pending) return;
		this.pendingUsageByTurn.delete(turnId);
		this.unattributedUsageTokens = Math.max(0, this.unattributedUsageTokens - pending);
		this.addModelUsage(turnId, model, effort, pending);
	}

	private attributeUsageDelta(turnId: string | undefined, delta: number): void {
		const binding = turnId ? this.turnUsageModels.get(turnId) : undefined;
		if (turnId && binding) {
			this.addModelUsage(turnId, binding.model, binding.effort, delta);
			return;
		}
		this.unattributedUsageTokens += delta;
		if (turnId) this.pendingUsageByTurn.set(turnId, (this.pendingUsageByTurn.get(turnId) ?? 0) + delta);
	}

	private addModelUsage(turnId: string, model: string, effort: string | null, delta: number): void {
		const key = `${model}\u0000${effort ?? ""}`;
		const current = this.modelUsage.get(key) ?? {
			model,
			effort,
			interactiveRootTurns: 0,
			interactiveTokens: 0,
			detachedInvocations: 0,
			detachedTokens: 0,
			totalTokens: 0,
		};
		const firstUsageForTurn = !this.usageTurns.has(turnId);
		if (firstUsageForTurn) this.usageTurns.add(turnId);
		this.modelUsage.set(key, {
			...current,
			interactiveRootTurns: current.interactiveRootTurns + (firstUsageForTurn ? 1 : 0),
			interactiveTokens: current.interactiveTokens + delta,
			totalTokens: current.totalTokens + delta,
		});
	}

	private projectSessionUsage(): WorkbenchSessionUsage {
		const merged = new Map<string, {
			model: string;
			effort: string | null;
			interactiveRootTurns: number;
			interactiveTokens: number;
			detachedInvocations: number;
			detachedTokens: number;
			totalTokens: number;
		}>();
		for (const usage of [...this.modelUsage.values(), ...(this.options.auxiliaryUsage?.snapshot ?? [])]) {
			const key = `${usage.model}\u0000${usage.effort ?? ""}`;
			const current = merged.get(key);
			merged.set(key, {
				model: usage.model,
				effort: usage.effort,
				interactiveRootTurns: (current?.interactiveRootTurns ?? 0) + usage.interactiveRootTurns,
				interactiveTokens: (current?.interactiveTokens ?? 0) + usage.interactiveTokens,
				detachedInvocations: (current?.detachedInvocations ?? 0) + (usage.detachedInvocations ?? 0),
				detachedTokens: (current?.detachedTokens ?? 0) + usage.detachedTokens,
				totalTokens: (current?.totalTokens ?? 0) + usage.totalTokens,
			});
		}
		const models = [...merged.values()]
			.sort((left, right) => right.totalTokens - left.totalTokens || left.model.localeCompare(right.model))
			.map((usage) => ({ ...usage }));
		const attributedTokens = models.reduce((total, usage) => total + usage.totalTokens, 0);
		return {
			totalTokens: attributedTokens + this.unattributedUsageTokens,
			unattributedTokens: this.unattributedUsageTokens,
			models,
		};
	}

	private async refreshWooEntry(commandId: string): Promise<WorkbenchCommandReceipt> {
		const entry = this.options.wooEntry;
		if (!entry) return { state: "rejected", commandId, reason: "woo-entry가 이 세션에 연결되지 않았습니다." };
		const snapshot = await entry.refresh();
		this.publish();
		if (snapshot.state === "blocked") {
			return { state: "rejected", commandId, reason: `woo-entry BLOCKED: ${snapshot.reason}` };
		}
		if (snapshot.state === "loading") {
			return { state: "rejected", commandId, reason: "woo-entry 수집이 아직 끝나지 않았습니다." };
		}
		const signalCount = snapshot.payload.signals.length;
		return {
			state: "accepted",
			commandId,
			message: signalCount > 0
				? `woo-entry를 갱신했습니다 · signal ${signalCount}개`
				: "woo-entry를 갱신했습니다.",
		};
	}

	private currentSandboxPolicy(): NativeSandboxPolicy {
		if (this.permissionMode === "all") return { type: "dangerFullAccess" };
		return {
			type: "workspaceWrite",
			writableRoots: [this.options.cwd],
			networkAccess: true,
			excludeTmpdirEnvVar: false,
			excludeSlashTmp: false,
		};
	}

	private currentNativeCollaborationMode(): NativeCollaborationMode {
		return {
			mode: this.collaborationMode === "plan" ? "plan" : "default",
			settings: {
				model: this.effectiveModel,
				reasoning_effort: this.effectiveEffort,
				developer_instructions: null,
			},
		};
	}

	private async captureNote(
		commandId: string,
		activityIds: readonly string[],
	): Promise<WorkbenchCommandReceipt> {
		if (!this.options.tnotes) return { state: "rejected", commandId, reason: "T-notes 저장소가 연결되지 않았습니다." };
		const uniqueIds = [...new Set(activityIds)];
		if (uniqueIds.length === 0 || uniqueIds.some((id) => !this.activities.some((activity) => activity.id === id))) {
			return { state: "rejected", commandId, reason: "T-note의 source activity를 확인할 수 없습니다." };
		}
		const selected = this.activities.filter((activity) => uniqueIds.includes(activity.id))
			.sort((left, right) => left.sequence - right.sequence);
		const scope = fullCompletedTurnScope(selected);
		if (!scope) return { state: "rejected", commandId, reason: "T-note는 완료된 질문 하나의 전체 turn 범위여야 합니다." };
		const request = this.tnoteRequest(scope.activities);
		let existing = request.turnId ? this.noteForTurn(request.turnId) : undefined;
		if (existing) return { state: "accepted", commandId, message: `T-note #${existing.sequence}을 사용합니다.` };
		if (request.turnId && this.automaticTNoteTurns.has(request.turnId)) {
			await this.tnoteQueue;
			existing = this.noteForTurn(request.turnId);
			if (existing) return { state: "accepted", commandId, message: `T-note #${existing.sequence}을 사용합니다.` };
		}
		const draft = await this.createTNote(request, request.turnId);
		if (!validateCanonicalTNote(draft.text, request.input.expectedQuestion).valid) {
			return { state: "rejected", commandId, reason: "T-note 생성 결과 형식이 올바르지 않습니다." };
		}
		this.noteDrafts.set(draft.id, draft);
		this.notes.push(immutable(projectTNote(draft)));
		this.setActionResult("tnote", `T-note #${draft.sequence}`, draft.text, draft.packet.digest);
		return { state: "accepted", commandId, message: `T-note #${draft.sequence}을 만들었습니다.` };
	}

	private async captureSessionNote(commandId: string): Promise<WorkbenchCommandReceipt> {
		const scope = latestCompletedTurnNoteScope(this.visibleActivities);
		if (!scope) return { state: "rejected", commandId, reason: "요약할 완료된 질문이 없습니다." };
		return this.captureNote(
			commandId,
			scope.activities.map((activity) => activity.id),
		);
	}

	private async captureNoteRange(
		commandId: string,
		startSequence: number,
		endSequence: number,
	): Promise<WorkbenchCommandReceipt> {
		if (!Number.isSafeInteger(startSequence) || !Number.isSafeInteger(endSequence) || startSequence < 1 || endSequence < startSequence) {
			return { state: "rejected", commandId, reason: "T-note sequence 범위가 올바르지 않습니다." };
		}
		const selected = this.activities.filter((activity) => activity.sequence >= startSequence && activity.sequence <= endSequence);
		if (selected.length !== endSequence - startSequence + 1 || selected[0]?.sequence !== startSequence || selected.at(-1)?.sequence !== endSequence) {
			return { state: "rejected", commandId, reason: "요청한 T-note sequence 범위가 activity journal에서 연속되지 않습니다." };
		}
		return this.captureNote(commandId, selected.map((activity) => activity.id));
	}

	private tnoteRequest(selected: readonly ProjectActivity[]): {
		readonly turnId: string;
		readonly input: Parameters<WorkbenchTNoteSource["create"]>[0];
	} {
		const turnId = selected.at(-1)!.nativeRefs.turnId!;
		const scope = completedTurnNoteScope(selected, turnId)!;
		const question = scope.question;
		const terminalActivity = selected.at(-1)!;
		const threadId = terminalActivity.nativeRefs.threadId!;
		const number = this.completionOrdinal(threadId, turnId);
		return {
			turnId,
			input: {
				projectId: this.options.projectId,
				range: { startSequence: selected[0]!.sequence, endSequence: selected.at(-1)!.sequence },
				activities: selected.map((activity) => ({
					...projectActivityToTNoteSource(activity),
					...(activity.id === terminalActivity.id ? {
						completion: { threadId, turnId, number, terminalActivityId: terminalActivity.id },
					} : {}),
				})),
				instruction: turnTNoteInstruction(question),
				expectedQuestion: question,
			},
		};
	}

	private completionOrdinal(threadId: string, turnId: string): number {
		const key = `${threadId}:${turnId}`;
		const reserved = this.completionOrdinals.get(key);
		if (reserved) return reserved;
		const durableMaximum = [...this.noteDrafts.values()]
			.map((note) => note.packet.completion)
			.filter((completion): completion is NonNullable<typeof completion> => completion?.threadId === threadId)
			.reduce((maximum, completion) => Math.max(maximum, completion.number), 0);
		const visibleMaximum = projectTNoteCompletionIndex(
			this.visibleActivities,
			[...this.noteDrafts.values()].map((note) => ({
				id: note.id,
				sourceActivityIds: note.packet.activities.map((activity) => activity.id),
				completion: note.packet.completion,
			})),
		).filter((completion) => completion.threadId === threadId && completion.turnId !== turnId)
			.reduce((maximum, completion) => Math.max(maximum, completion.number), 0);
		const number = Math.max(durableMaximum, visibleMaximum) + 1;
		this.completionOrdinals.set(key, number);
		return number;
	}

	private async createTNote(
		request: ReturnType<ProjectWorkbench["tnoteRequest"]>,
		turnId?: string,
	): Promise<TNoteDraft> {
		if (!this.options.tnotes) throw new Error("T-notes 저장소가 연결되지 않았습니다.");
		if (turnId) {
			const inFlight = this.tnoteInFlight.get(turnId);
			if (inFlight) return inFlight;
			this.automaticTNoteTurns.add(turnId);
			const pending = this.options.tnotes.create(request.input, this.narrationAbort.signal);
			this.tnoteInFlight.set(turnId, pending);
			try { return await pending; } finally {
				this.tnoteInFlight.delete(turnId);
				this.automaticTNoteTurns.delete(turnId);
			}
		}
		return this.options.tnotes.create(request.input, this.narrationAbort.signal);
	}

	private noteForTurn(turnId: string): TNoteDraft | undefined {
		const scope = completedTurnNoteScope(this.visibleActivities, turnId);
		const terminalActivityId = scope?.activities.at(-1)?.id;
		return terminalActivityId
			? [...this.noteDrafts.values()].find((note) => note.packet.activities.some((activity) => activity.id === terminalActivityId))
			: undefined;
	}

	private async mutateTodo(
		commandId: string,
		title: string,
		operation: () => Promise<TodoDocument>,
	): Promise<WorkbenchCommandReceipt> {
		const document = await operation();
		this.setActionResult("todo", title, todoResultBody(document));
		return { state: "accepted", commandId, message: title };
	}

	private async transitionTodo(
		commandId: string,
		action: "start" | "complete" | "block" | "reopen",
		itemId: string,
	): Promise<WorkbenchCommandReceipt> {
		const todos = this.requireTodos();
		return this.mutateTodo(commandId, `Todo ${action}: ${itemId}`, () => todos[action](itemId));
	}

	private async recordTodoEvidence(commandId: string, activityId: string): Promise<WorkbenchCommandReceipt> {
		if (!this.activities.some((activity) => activity.id === activityId)) {
			return { state: "rejected", commandId, reason: `Evidence activity를 찾을 수 없습니다: ${activityId}` };
		}
		const document = await this.requireTodos().recordEvidence(activityId);
		if (!document) return { state: "rejected", commandId, reason: "증거를 연결할 진행 중 Todo가 없습니다." };
		this.setActionResult("todo", "Todo 증거 연결", todoResultBody(document));
		return { state: "accepted", commandId, message: `${activityId} 증거를 연결했습니다.` };
	}

	private async importLegacyTodo(commandId: string): Promise<WorkbenchCommandReceipt> {
		const imported = await this.requireTodos().importLegacy();
		if (!imported) return { state: "rejected", commandId, reason: "가져올 legacy Todo가 없거나 정본 Todo가 이미 존재합니다." };
		this.setActionResult("todo", "Legacy Todo 가져오기", imported);
		return { state: "accepted", commandId, message: "Legacy Todo를 비파괴 방식으로 가져왔습니다." };
	}

	private async acceptPromotion(commandId: string, noteId: string, acceptedBy: string): Promise<WorkbenchCommandReceipt> {
		const promotions = this.options.promotions;
		if (!promotions) return { state: "rejected", commandId, reason: "정본 승격 서비스가 연결되지 않았습니다." };
		const note = this.noteDrafts.get(noteId);
		if (!note) return { state: "rejected", commandId, reason: `T-note를 찾을 수 없습니다: ${noteId}` };
		const draft = canonicalTNoteDraft(note, this.options.projectId);
		const accepted = await promotions.accept(draft, acceptedBy);
		this.promotionDrafts.set(accepted.token, draft);
		this.setActionResult(
			"promotion",
			`승격 승인 대기: ${accepted.target}`,
			`${accepted.diff}\n\n확인 토큰: ${accepted.token}`,
			accepted.afterDigest,
		);
		return { state: "accepted", commandId, message: "diff를 확인한 뒤 one-time token으로 승격을 확정하세요." };
	}

	private async confirmPromotion(commandId: string, token: string): Promise<WorkbenchCommandReceipt> {
		const promotions = this.options.promotions;
		if (!promotions) return { state: "rejected", commandId, reason: "정본 승격 서비스가 연결되지 않았습니다." };
		const draft = this.promotionDrafts.get(token);
		if (!draft) return { state: "rejected", commandId, reason: "알 수 없거나 이미 사용한 승격 토큰입니다." };
		const promoted = await promotions.promote(draft, token);
		if (promoted.status === "promoted") this.promotionDrafts.delete(token);
		this.setActionResult(
			"promotion",
			promoted.status === "promoted" ? `정본 승격 완료: ${promoted.target}` : `승격 재승인 필요: ${promoted.reason}`,
			promoted.diff,
			promoted.afterDigest,
		);
		if (promoted.status !== "promoted") return { state: "rejected", commandId, reason: `승격 초안이 오래되었습니다: ${promoted.reason}` };
		return { state: "accepted", commandId, message: "정본 파일에 기록했습니다. Git 상태는 uncommitted입니다." };
	}

	private async previewReview(
		commandId: string,
		provider: ReviewProvider,
		noteId: string,
		request: string,
		confirmedPublic: true,
	): Promise<WorkbenchCommandReceipt> {
		const reviews = this.options.reviews;
		if (!reviews) return { state: "rejected", commandId, reason: "외부 리뷰 서비스가 연결되지 않았습니다." };
		if (confirmedPublic !== true) return { state: "rejected", commandId, reason: "T-note를 public으로 명시 확인해야 합니다." };
		const note = this.noteDrafts.get(noteId);
		if (!note) return { state: "rejected", commandId, reason: `T-note를 찾을 수 없습니다: ${noteId}` };
		const preview = reviews.preview({
			purpose: { value: `T-note ${note.id} 독립 검토`, sensitivity: "public" },
			request: { value: request, sensitivity: "public" },
			context: { value: note.text, sensitivity: "public" },
		});
		this.reviewPreviews.set(preview.packet.digest, { provider, packet: preview.packet });
		this.setActionResult("review", `${provider} 전송 미리보기`, stableJson(preview.packet), preview.packet.digest);
		return { state: "accepted", commandId, message: "표시된 exact digest를 승인해 전송하세요." };
	}

	private async sendReview(commandId: string, digest: string): Promise<WorkbenchCommandReceipt> {
		const reviews = this.options.reviews;
		if (!reviews) return { state: "rejected", commandId, reason: "외부 리뷰 서비스가 연결되지 않았습니다." };
		const preview = this.reviewPreviews.get(digest);
		if (!preview) return { state: "rejected", commandId, reason: "승인할 리뷰 preview digest를 찾을 수 없습니다." };
		const delivery = await reviews.send({ packet: preview.packet, acceptedDigest: digest, provider: preview.provider });
		this.reviewPreviews.delete(digest);
		this.setActionResult(
			"review",
			`${delivery.provider}/${delivery.model} 검토 결과`,
			`${delivery.result}\n\nprovenance: ${stableJson({ packetDigest: delivery.packetDigest, resultDigest: delivery.resultDigest, version: delivery.version, sentAt: delivery.sentAt, receivedAt: delivery.receivedAt })}`,
			delivery.resultDigest,
		);
		return { state: "accepted", commandId, message: "독립 리뷰 결과와 provenance를 저장했습니다." };
	}

	private requireTodos(): WorkbenchTodoSource {
		if (!this.options.todos) throw new Error("Todo 저장소가 연결되지 않았습니다.");
		return this.options.todos;
	}

	private async bindThreadSources(threadId: string): Promise<void> {
		await this.options.tnotes?.bindThread?.(threadId);
		await this.loadBoundTNotes();
		await this.bindTodoThread(threadId);
	}

	private async loadBoundTNotes(): Promise<void> {
		if (!this.options.tnotes) return;
		const notes = await this.options.tnotes.readAll(this.options.projectId);
		for (const note of notes) {
			this.noteDrafts.set(note.id, note);
			if (note.packet.completion) {
				this.completionOrdinals.set(
					`${note.packet.completion.threadId}:${note.packet.completion.turnId}`,
					note.packet.completion.number,
				);
			}
			this.notes.push(immutable(projectTNote(note)));
		}
	}

	private async bindTodoThread(threadId: string): Promise<void> {
		const todos = this.options.todos;
		if (!todos?.bindThread) return;
		await todos.bindThread(threadId);
		this.todo = immutable(todos.snapshot);
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

	private async recordNativeEvent(event: NativeHarnessEvent): Promise<void> {
		if (this.closed) return;
		// A shared App Server can emit for threads this workbench does not own, and the journal
		// stays unbound until this session adopts its own thread.  Such an event has no stream to
		// land in; journaling it would fail the whole session on an internal invariant.
		if (this.journal.hasBoundThread?.() === false) return;
		const eventBelongsToRootThread = event.type !== "notification"
			|| this.isRootThreadEvent(event.refs.threadId);
		if (eventBelongsToRootThread && event.type === "notification" && event.method === "thread/tokenUsage/updated") {
			this.observeTokenUsage(event);
		}
		if (event.type === "notification" && isDeltaNotification(event.method)) {
			if (eventBelongsToRootThread) await this.applyDelta(event);
			return;
		}
		const lifecycle = event.type === "notification" ? turnLifecycle(event.method) : null;
		const completedActiveTurn = eventBelongsToRootThread && lifecycle === "terminal" && event.type === "notification" &&
			event.refs.turnId === this.activeTurnId;
		const completedSummaryCheckpoint = completedActiveTurn && event.type === "notification" &&
			event.method.toLowerCase() === "turn/completed";
		const sourceDigest = digestSource(stableJson(event));
		const observation = nativeObservation(event);
		await this.appendActivity(
			observation.kind,
			observation.phase,
			observation.refs,
			observation.payload,
			false,
			sourceDigest,
		);
		const projectedGoal = projectSessionGoal(this.visibleActivities);
		if (projectedGoal) this.sessionGoal = projectedGoal;
		if (event.type === "approval-requested") this.pendingApproval = immutable(event.approval);
		const approvalResolved = event.type === "approval-resolved" && this.pendingApproval?.requestId === event.requestId;
		if (approvalResolved) this.pendingApproval = null;
		if (event.type === "notification") {
			const lateStartForTerminalTurn = lifecycle === "started" && event.refs.turnId
				? this.hasTerminalTurn(event.refs.threadId ?? this.threadId ?? undefined, event.refs.turnId)
				: false;
			if (eventBelongsToRootThread && lifecycle === "started" && event.refs.turnId && !lateStartForTerminalTurn) {
				const reconciledChat = this.blockedChat;
				this.activeTurnId = event.refs.turnId;
				this.selectedPlanTurnId = event.refs.turnId;
				this.contextTurnId = event.refs.turnId;
				if (!this.turnUsageModels.has(event.refs.turnId)) {
					this.bindTurnUsage(event.refs.turnId, this.effectiveModel, this.effectiveEffort);
				}
				this.chatDeliveryBlocked = false;
				if (reconciledChat) this.error = null;
				if (reconciledChat && this.chatQueue[0]?.id === reconciledChat.id) this.chatQueue.shift();
				this.blockedChat = null;
				if (reconciledChat) {
					await this.appendActivity("message", "completed", {
						threadId: event.refs.threadId ?? this.threadId ?? undefined,
						itemId: reconciledChat.id,
					}, {
						direction: "outbound",
						role: "user",
						text: reconciledChat.content,
					}, false);
				}
			}
			if (eventBelongsToRootThread && lifecycle === "terminal" && event.refs.turnId === this.activeTurnId) this.activeTurnId = null;
		}
		if (eventBelongsToRootThread && event.type === "notification" && activityPhase(event.method) === "completed") {
			if (!event.refs.itemId || event.refs.itemId === this.draftItemId) {
				this.draft = "";
				this.draftItemId = null;
				this.draftProjection = emptyBoundedTextProjection();
			}
			if (!event.refs.itemId || event.refs.itemId === this.reasoningItemId) {
				this.reasoningDraft = "";
				this.reasoningItemId = null;
				this.reasoningProjection = emptyBoundedTextProjection();
			}
			if (!event.refs.itemId || event.refs.itemId === this.reasoningSummaryItemId) {
				this.reasoningSummaryDraft = "";
				this.reasoningSummaryItemId = null;
				this.reasoningSummaryProjection = emptyBoundedTextProjection();
			}
			if (!event.refs.itemId || event.refs.itemId === this.liveActivity?.nativeRefs.itemId) {
				this.liveActivity = null;
				this.liveActivityProjection = emptyBoundedTextProjection();
			}
		}
		const refs = event.type === "approval-requested" ? event.approval.refs : event.refs;
		this.reconcileNativeState(refs.threadId ?? this.threadId ?? undefined);
		this.publish();
		if (completedSummaryCheckpoint && event.type === "notification" && event.refs.turnId) {
			this.scheduleAutomaticTNote(event.refs.turnId);
		}
		if (completedActiveTurn || approvalResolved) await this.drainChatQueue();
	}

	/**
	 * T-notes describe one completed user question at a time. Generation stays
	 * on a detached queue so it cannot delay the next native Chat turn.
	 */
	private scheduleAutomaticTNote(turnId: string): void {
		if (!this.options.tnotes || this.closed || this.narrationAbort.signal.aborted || this.automaticTNoteTurns.has(turnId)) return;
		const scope = completedTurnNoteScope(this.visibleActivities, turnId);
		if (!scope || this.hasTNoteFor(scope.activities)) return;
		this.automaticTNoteTurns.add(turnId);
		const request = this.tnoteRequest(scope.activities);
		this.tnoteQueue = this.tnoteQueue
			.catch(() => undefined)
			.then(async () => {
				try {
					const draft = await this.createTNote(request, turnId);
					if (this.closed || this.narrationAbort.signal.aborted) return;
					if (!validateCanonicalTNote(draft.text, request.input.expectedQuestion).valid) {
						throw new Error("T-note 생성 결과 형식이 올바르지 않습니다.");
					}
					this.noteDrafts.set(draft.id, draft);
					this.notes.push(immutable(projectTNote(draft)));
					this.publish();
				} catch (error) {
					if (this.closed || this.narrationAbort.signal.aborted) return;
					this.actionResult = immutable({
						kind: "tnote",
						title: "질문 요약 자동 생성 보류",
						body: sanitizeTerminalTextExcerpt(errorMessage(error), WORKBENCH_ACTION_RESULT_CHARACTER_LIMIT, "head-tail"),
						createdAt: new Date().toISOString(),
					});
					this.publish();
				} finally {
					this.automaticTNoteTurns.delete(turnId);
				}
			});
	}

	private reconcileAutomaticTNotes(): void {
		const turnIds = new Set<string>();
		for (const activity of this.visibleActivities) {
			if (activity.payload.method === "turn/completed" && activity.nativeRefs.turnId) turnIds.add(activity.nativeRefs.turnId);
		}
		for (const turnId of turnIds) this.scheduleAutomaticTNote(turnId);
	}

	private hasTNoteFor(activities: readonly ProjectActivity[]): boolean {
		const terminalActivityId = activities.at(-1)?.id;
		return Boolean(terminalActivityId && [...this.noteDrafts.values()]
			.some((note) => note.packet.activities.some((activity) => activity.id === terminalActivityId)));
	}

	private async applyDelta(event: Extract<NativeHarnessEvent, { type: "notification" }>): Promise<void> {
		if (event.refs.threadId) this.threadId = event.refs.threadId;
		const delta = activityText({ params: event.params });
		const method = event.method.toLowerCase();
		const reasoning = method.includes("reasoning");
		const publicReasoningSummary = method.includes("reasoning/summarytextdelta");
		if (!reasoning && activityKind(event.method, event.params) === "message" && delta.trim().length > 0 && event.refs.turnId &&
			this.turnUsageModels.has(event.refs.turnId) &&
			!this.firstOutputObservedTurns.has(event.refs.turnId)) {
			await this.appendActivity("progress", "completed", {
				threadId: event.refs.threadId ?? this.threadId ?? undefined,
				turnId: event.refs.turnId,
			}, { method: "turn/first-output-observed" }, false, digestSource(stableJson({
				method: "turn/first-output-observed",
				refs: { threadId: event.refs.threadId, turnId: event.refs.turnId },
			})));
			this.firstOutputObservedTurns.add(event.refs.turnId);
		}
		if (publicReasoningSummary) {
			if (event.refs.itemId && this.reasoningSummaryItemId && event.refs.itemId !== this.reasoningSummaryItemId) {
				this.reasoningSummaryProjection = emptyBoundedTextProjection();
			}
			this.reasoningSummaryItemId = event.refs.itemId ?? this.reasoningSummaryItemId;
			const projection = appendBoundedText(
				this.reasoningSummaryProjection,
				delta,
				REASONING_DRAFT_TAIL_CHARACTER_LIMIT,
			);
			this.reasoningSummaryProjection = projection.state;
			this.reasoningSummaryDraft = projection.text;
		} else if (reasoning) {
			if (event.refs.itemId && this.reasoningItemId && event.refs.itemId !== this.reasoningItemId) {
				this.reasoningProjection = emptyBoundedTextProjection();
			}
			this.reasoningItemId = event.refs.itemId ?? this.reasoningItemId;
			const projection = appendBoundedText(
				this.reasoningProjection,
				delta,
				REASONING_DRAFT_TAIL_CHARACTER_LIMIT,
			);
			this.reasoningProjection = projection.state;
			this.reasoningDraft = projection.text;
		} else if (activityKind(event.method, event.params) === "message") {
			if (event.refs.itemId && this.draftItemId && event.refs.itemId !== this.draftItemId) {
				this.draftProjection = emptyBoundedTextProjection();
			}
			this.draftItemId = event.refs.itemId ?? this.draftItemId;
			const projection = appendBoundedText(
				this.draftProjection,
				delta,
				ASSISTANT_DRAFT_TAIL_CHARACTER_LIMIT,
			);
			this.draftProjection = projection.state;
			this.draft = projection.text;
		} else {
			const kind = activityKind(event.method, event.params);
			const continuesSameActivity = this.liveActivity?.method === event.method &&
				this.liveActivity.nativeRefs.itemId === event.refs.itemId &&
				this.liveActivity.nativeRefs.turnId === event.refs.turnId;
			if (!continuesSameActivity) {
				this.liveActivityProjection = emptyBoundedTextProjection();
			}
			const projection = appendBoundedText(
				this.liveActivityProjection,
				delta,
				LIVE_ACTIVITY_TAIL_CHARACTER_LIMIT,
			);
			this.liveActivityProjection = projection.state;
			this.liveActivity = {
				method: event.method,
				kind: kind === "message" ? "progress" : kind,
				text: projection.text,
				nativeRefs: event.refs,
			};
		}
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
		const digest = sourceDigest ?? digestSource(stableJson({ kind, phase, nativeRefs, payload }));
		const result = await this.journal.append({
			projectId: this.activityJournalProjectId(),
			kind,
			phase,
			provider: this.options.provider ?? "openai-codex",
			nativeRefs,
			sourceDigest: digest,
			payload,
		});
		const durableActivity = immutable(result.activity);
		const added = result.appended || !this.activities.some((activity) => activity.id === result.activity.id);
		if (added) {
			this.activities.push(durableActivity);
			const visible = this.isActivityVisible(durableActivity);
			if (visible) this.visibleActivities.push(durableActivity);
			this.invalidateWorkFlow();
			this.scheduleNarrations();
			if (visible) this.scheduleNativeTodoSync(durableActivity);
		}
		this.rememberTerminalTurn(durableActivity);
		if (publish) this.publish();
		return durableActivity;
	}

	private activityJournalProjectId(): string {
		return this.options.activityJournalProjectId ?? this.options.projectId;
	}

	private reconcileNativeState(threadId: string | undefined): void {
		if (!threadId) return;
		if (this.threadId && this.threadId !== threadId) return;
		const currentActiveTurnId = this.threadId === threadId ? this.activeTurnId : null;
		this.threadId = threadId;
		this.activeTurnId = currentActiveTurnId && !this.hasTerminalTurn(threadId, currentActiveTurnId)
			? currentActiveTurnId
			: null;
	}

	private isRootThreadEvent(threadId: string | undefined): boolean {
		return !threadId || !this.threadId || threadId === this.threadId;
	}

	private applyThreadSettings(thread: { model?: string; effort?: string | null }): void {
		if (thread.model) this.effectiveModel = thread.model;
		if (thread.effort !== undefined) this.effectiveEffort = thread.effort;
	}

	private hasTerminalTurn(threadId: string | undefined, turnId: string): boolean {
		if (!threadId) return false;
		return this.terminalTurns.has(turnKey(threadId, turnId));
	}

	private rememberTerminalTurn(activity: ProjectActivity): void {
		const method = typeof activity.payload.method === "string" ? activity.payload.method : "";
		if (turnLifecycle(method) !== "terminal") return;
		const { threadId, turnId } = activity.nativeRefs;
		if (threadId && turnId) this.terminalTurns.add(turnKey(threadId, turnId));
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
		if (phase !== "loading") this.revision += 1;
		this.current = this.makeSnapshot(phase ?? (this.error ? "error" : this.activeTurnId || this.pendingApproval ? "working" : "ready"));
		for (const listener of this.listeners) {
			try { listener(this.current); } catch { /* observers cannot corrupt durable state */ }
		}
	}

	private makeSnapshot(phase: WorkbenchSnapshot["phase"]): WorkbenchSnapshot {
		const durable = this.projectDurableActivities();
		return deepFreeze({
			projectId: this.options.projectId,
			revision: this.revision,
			journalSequence: this.activities.at(-1)?.sequence ?? 0,
			phase,
			model: this.effectiveModel,
			// A model switch takes effect on the next turn, so the running turn keeps the model it
			// was started with.  Reporting the selection here would name a model that is not
			// producing the output on screen.
			activeModel: (this.activeTurnId ? this.turnUsageModels.get(this.activeTurnId)?.model : undefined) ?? this.effectiveModel,
			effort: this.effectiveEffort,
			contextUsage: this.contextUsage,
			sessionUsage: this.projectSessionUsage(),
			resumeCoverage: {
				mode: this.options.resumeThreadId ? "partial-local-journal" : "fresh",
				processAttachedAt: this.processAttachedAt,
				priorProviderHistoryHydrated: false,
			},
			sessionGoal: this.sessionGoal,
			permissionMode: this.permissionMode,
			collaborationMode: this.collaborationMode,
			mcpServers: this.mcpServers,
			wooEntry: this.options.wooEntry?.snapshot ?? null,
			threadId: this.threadId,
			activeTurnId: this.activeTurnId,
			activityCount: durable.activityCount,
			activities: durable.activities,
			selectedActivityId: this.selectedActivityId,
			pendingApproval: this.pendingApproval,
			chat: this.projectChat(durable.chat),
			chatQueue: immutable(this.chatQueue),
			draft: this.draft,
			reasoningDraft: this.reasoningDraft,
			reasoningSummaryDraft: this.reasoningSummaryDraft,
			liveActivity: immutable(this.liveActivity),
			workFlow: this.projectCurrentWorkFlow(),
			tnotes: this.projectDurableNotes(),
			todo: this.todo,
			actionResult: this.actionResult,
			deliveryUncertain: this.chatDeliveryBlocked && this.blockedChat !== null,
			error: this.error,
		});
	}

	private projectDurableActivities(): DurableActivityProjection {
		if (this.durableActivityProjection.sourceLength === this.visibleActivities.length) {
			return this.durableActivityProjection;
		}
		const activities = Object.freeze([...this.visibleActivities]);
		this.durableActivityProjection = {
			sourceLength: this.visibleActivities.length,
			activityCount: this.visibleActivities.length,
			activities,
			chat: deepFreeze(projectChat(activities)),
		};
		return this.durableActivityProjection;
	}

	private projectChat(durable: readonly WorkbenchChatMessage[]): readonly WorkbenchChatMessage[] {
		if (this.preThreadChat.size === 0) return durable;
		const messages = new Map(durable.map(message => [message.id, message]));
		for (const message of this.preThreadChat.values()) messages.set(message.id, message);
		return Object.freeze([...messages.values()]);
	}

	private projectDurableNotes(): readonly WorkbenchTNote[] {
		if (this.durableNoteProjection.sourceLength === this.notes.length
			&& this.durableNoteProjection.activitySourceLength === this.visibleActivities.length) {
			return this.durableNoteProjection.notes;
		}
		const current = this.currentSessionNotes();
		this.durableNoteProjection = {
			sourceLength: this.notes.length,
			activitySourceLength: this.visibleActivities.length,
			notes: Object.freeze([...current]),
		};
		return this.durableNoteProjection.notes;
	}

	private currentSessionNotes(): readonly WorkbenchTNote[] {
		const activityIds = new Set(this.visibleActivities.map((activity) => activity.id));
		const notes = this.notes.filter((note) => note.sourceActivityIds.some((id) => activityIds.has(id)));
		const completionOrder = new Map(projectTNoteCompletionIndex(this.visibleActivities, notes)
			.flatMap((completion) => completion.noteId ? [[completion.noteId, completion.number] as const] : []));
		return [...notes].sort((left, right) =>
			(completionOrder.get(left.id) ?? Number.MAX_SAFE_INTEGER) - (completionOrder.get(right.id) ?? Number.MAX_SAFE_INTEGER)
			|| left.id.localeCompare(right.id));
	}

	private projectCurrentWorkFlow(): WorkFlowProjection {
		const input = this.currentPlanProjectionInput();
		const authorityKey = input
			? stableJson([
				"kind" in input ? "pending-goal" : "selected-root-turn",
				input.expectedThreadKey,
				!("kind" in input) ? input.selectedTurnId : null,
				this.pendingPlanGoalActivityId,
			])
			: null;
		if (this.workFlowProjection.sourceLength === this.activities.length
			&& this.workFlowProjection.narrationRevision === this.narrationRevision
			&& this.workFlowProjection.authorityKey === authorityKey) {
			return this.workFlowProjection.value;
		}
		// Dplan validates the complete append-only journal for sequence integrity.
		// Keep child activity out of the visible transcript, but retain it here so a
		// root action after a child event does not look like a forged sequence gap.
		const source = this.activities;
		const projection = projectWorkFlow(source, this.stepNarrations, input);
		const pendingGoal = this.pendingPlanGoalActivityId && this.threadId && input && !("kind" in input)
			? projectWorkFlow(source, new Map(), { kind: "pending-goal", expectedThreadKey: this.threadId, hash: dplanHash }).goal
			: null;
		this.workFlowProjection = {
			sourceLength: this.activities.length,
			narrationRevision: this.narrationRevision,
			authorityKey,
			value: pendingGoal ? { ...projection, goal: pendingGoal } : projection,
		};
		return this.workFlowProjection.value;
	}

	private currentPlanProjectionInput(): WorkFlowProjectionInput | undefined {
		if (!this.threadId) return undefined;
		if (!this.selectedPlanTurnId) return { kind: "pending-goal", expectedThreadKey: this.threadId, hash: dplanHash };
		return { expectedThreadKey: this.threadId, selectedTurnId: this.selectedPlanTurnId, hash: dplanHash };
	}

	private invalidateWorkFlow(): void {
		this.workFlowProjection.sourceLength = -1;
	}

	private scheduleNativeTodoSync(activity: ProjectActivity): void {
		const todos = this.options.todos;
		const sync = todos?.syncNativePlan?.bind(todos);
		if (!sync) return;
		const flow = this.projectCurrentWorkFlow();
		const source = flow.source;
		if (!source || source.turnId !== this.activeTurnId) return;
		if (activity.nativeRefs.threadId !== this.threadId || activity.nativeRefs.turnId !== source.turnId) return;
		const method = typeof activity.payload.method === "string" ? activity.payload.method : "";
		const updatesPlan = method === "turn/plan/updated";
		const contributesExecution = flow.steps.some((step) => step.activityIds.includes(activity.id));
		if (!updatesPlan && !contributesExecution) return;
		this.enqueueNativeTodoSync(sync, flow);
	}

	private scheduleNarratedTodoSync(): void {
		const todos = this.options.todos;
		const sync = todos?.syncNativePlan?.bind(todos);
		if (!sync) return;
		const flow = this.projectCurrentWorkFlow();
		if (!flow.source || flow.source.turnId !== this.activeTurnId || flow.steps.length === 0) return;
		this.enqueueNativeTodoSync(sync, flow);
	}

	private enqueueNativeTodoSync(
		sync: NonNullable<WorkbenchTodoSource["syncNativePlan"]>,
		flow: WorkFlowProjection,
	): void {
		this.todoSyncQueue = this.todoSyncQueue
			.catch(() => undefined)
			.then(async () => {
				try {
					await sync(flow);
				} catch (error) {
					const body = error instanceof TodoWriteConflictError
						? stableJson({ currentSource: error.currentSource, pending: error.pending })
						: errorMessage(error);
					this.actionResult = immutable({
						kind: "todo",
						title: "Todo 자동 동기화 보류",
						body: sanitizeTerminalTextExcerpt(body, WORKBENCH_ACTION_RESULT_CHARACTER_LIMIT, "head-tail"),
						createdAt: new Date().toISOString(),
					});
					this.publish();
				}
			});
	}

	private scheduleNarrations(): void {
		const narrator = this.options.narrator;
		if (!narrator || this.closed || this.narrationAbort.signal.aborted) return;
		const source = this.activities;
		const baseFlow = projectWorkFlow(source, new Map(), this.currentPlanProjectionInput());
		for (const step of baseFlow.steps) {
			if (step.narration.inputSummary.length === 0) continue;
			const request = {
				goal: baseFlow.goal,
				stepTitle: step.title,
				inputSummary: step.narration.inputSummary,
			};
			const requestKey = digestSource(stableJson(request));
			if (this.narrationRequestKeys.get(step.id) === requestKey) continue;
			this.narrationRequestKeys.set(step.id, requestKey);
			if (this.stepNarrations.delete(step.id)) this.narrationRevision += 1;
			void narrator.narrate(request, this.narrationAbort.signal).then((result) => {
				if (this.closed || this.narrationAbort.signal.aborted || this.narrationRequestKeys.get(step.id) !== requestKey) return;
				this.stepNarrations.set(step.id, immutable({
					what: result.what,
					...(result.why ? { why: result.why } : {}),
					inputSummary: result.inputSummary,
					source: "model" as const,
				}));
				this.narrationRevision += 1;
				this.invalidateWorkFlow();
				this.scheduleNarratedTodoSync();
				this.publish();
			}).catch(() => {
				// Narration is non-authoritative; the deterministic projection remains visible.
			});
		}
	}
}

function nativeObservation(event: NativeHarnessEvent): {
	kind: ProjectActivityKind;
	phase: ProjectActivityPhase;
	refs: NativeRefs;
	payload: Readonly<Record<string, unknown>>;
} {
	if (event.type === "approval-requested") {
		const params = boundedJournalNativeValue(event.approval.params);
		return {
			kind: "approval",
			phase: "started",
			refs: event.approval.refs,
			payload: {
				eventType: event.type,
				approval: {
					...event.approval,
					params: params.value,
				},
				...(params.omitted ? { observationTruncated: true } : {}),
			},
		};
	}
	if (event.type === "approval-resolved") return {
		kind: "approval",
		phase: "completed",
		refs: { ...event.refs, approvalRequestId: event.requestId },
		payload: { eventType: event.type, requestId: event.requestId },
	};
	const rawPayload = { eventType: event.type, method: event.method, params: event.params };
	if (isReasoningActivityPayload(rawPayload)) {
		const publicSummary = nativeReasoningSummary(event.params);
		return {
			kind: activityKind(event.method, event.params),
			phase: activityPhase(event.method),
			refs: event.refs,
			payload: {
				eventType: event.type,
				method: event.method,
				classification: "reasoning",
				redacted: true,
				...(publicSummary ? { publicSummary } : {}),
			},
		};
	}
	const kind = activityKind(event.method, event.params);
	const publicMessage = kind === "message" ? activityText({ params: event.params }) : "";
	const params = boundedJournalNativeValue(event.params);
	const payload = {
		eventType: event.type,
		method: event.method,
		params: params.value,
		...(publicMessage ? { text: sanitizeTerminalTextUnbounded(publicMessage) } : {}),
		...(params.omitted ? { observationTruncated: true } : {}),
	};
	return {
		kind,
		phase: activityPhase(event.method),
		refs: event.refs,
		payload,
	};
}

function nativeReasoningSummary(params: Readonly<Record<string, unknown>>): string {
	const item = record(params.item);
	if (String(item?.type ?? "").toLowerCase() !== "reasoning") return "";
	const summary = item?.summary;
	const text = typeof summary === "string"
		? summary
		: Array.isArray(summary) && summary.every((part) => typeof part === "string")
			? summary.join("\n")
			: "";
	return text
		? sanitizeTerminalTextExcerpt(text, REASONING_DRAFT_TAIL_CHARACTER_LIMIT, "head-tail").trim()
		: "";
}

function projectContextUsage(params: Readonly<Record<string, unknown>>): WorkbenchContextUsage | null {
	const tokenUsage = record(params.tokenUsage);
	const last = record(tokenUsage?.last);
	const usedTokens = last?.totalTokens;
	const contextWindow = tokenUsage?.modelContextWindow;
	if (typeof usedTokens !== "number" || !Number.isFinite(usedTokens) || usedTokens < 0) return null;
	if (typeof contextWindow !== "number" || !Number.isFinite(contextWindow) || contextWindow <= 0) return null;
	const effectiveWindow = Math.max(1, contextWindow - NATIVE_CONTEXT_BASELINE_TOKENS);
	const effectiveUsed = Math.max(0, usedTokens - NATIVE_CONTEXT_BASELINE_TOKENS);
	return Object.freeze({
		usedTokens,
		contextWindow,
		percent: Math.min(100, Math.round((effectiveUsed / effectiveWindow) * 1_000) / 10),
	});
}

function projectThreadTotalTokens(params: Readonly<Record<string, unknown>>): number | null {
	const tokenUsage = record(params.tokenUsage);
	const total = record(tokenUsage?.total);
	const totalTokens = total?.totalTokens;
	return typeof totalTokens === "number" && Number.isFinite(totalTokens) && totalTokens >= 0 ? totalTokens : null;
}

function boundedJournalNativeValue(value: unknown): { value: unknown; omitted: boolean } {
	const state: JournalNativeProjectionState = {
		remainingCharacters: JOURNAL_NATIVE_TEXT_CHARACTER_LIMIT,
		remainingItems: JOURNAL_NATIVE_MAX_ITEMS,
		omitted: false,
	};
	return { value: projectJournalNativeValue(value, state, 0), omitted: state.omitted };
}

function projectJournalNativeValue(value: unknown, state: JournalNativeProjectionState, depth: number): unknown {
	if (value === null || typeof value === "boolean" || typeof value === "number") return value;
	if (typeof value === "string") {
		const available = Math.max(0, state.remainingCharacters);
		if (available === 0) {
			state.omitted = true;
			return JOURNAL_NATIVE_OMISSION;
		}
		const projected = sanitizeTerminalTextExcerpt(value, available, "head-tail");
		state.remainingCharacters = Math.max(0, state.remainingCharacters - projected.length);
		if (value.length > available) state.omitted = true;
		return projected;
	}
	if (depth >= JOURNAL_NATIVE_MAX_DEPTH || state.remainingItems <= 0) {
		state.omitted = true;
		return JOURNAL_NATIVE_OMISSION;
	}
	if (Array.isArray(value)) {
		const projected: unknown[] = [];
		for (const item of value.slice(0, JOURNAL_NATIVE_MAX_COLLECTION_ITEMS)) {
			if (state.remainingItems <= 0) break;
			state.remainingItems -= 1;
			projected.push(projectJournalNativeValue(item, state, depth + 1));
		}
		if (projected.length < value.length) state.omitted = true;
		return projected;
	}
	const source = record(value);
	if (!source) return sanitizeTerminalTextExcerpt(String(value), Math.max(0, state.remainingCharacters), "head-tail");
	const entries = Object.entries(source)
		.sort(([left], [right]) => journalNativeFieldPriority(left) - journalNativeFieldPriority(right));
	const projected: Record<string, unknown> = {};
	let accepted = 0;
	for (const [key, item] of entries) {
		if (key.length > 200) {
			state.omitted = true;
			continue;
		}
		if (accepted >= JOURNAL_NATIVE_MAX_COLLECTION_ITEMS || state.remainingItems <= 0) {
			state.omitted = true;
			break;
		}
		state.remainingItems -= 1;
		state.remainingCharacters = Math.max(0, state.remainingCharacters - key.length);
		projected[key] = projectJournalNativeValue(item, state, depth + 1);
		accepted += 1;
	}
	return projected;
}

function journalNativeFieldPriority(key: string): number {
	const normalized = key.replace(/[-_]/gu, "").toLowerCase();
	return ["text", "content", "output", "aggregatedoutput", "stdout", "stderr", "result", "diff", "delta", "message"]
		.includes(normalized) ? 1 : 0;
}

function completedTurnNoteScope(
	activities: readonly ProjectActivity[],
	turnId: string,
): { readonly question: string; readonly activities: readonly ProjectActivity[] } | null {
	let terminalIndex = -1;
	let startIndex = -1;
	for (const [index, activity] of activities.entries()) {
		if (activity.nativeRefs.turnId !== turnId) continue;
		if (activity.payload.method === "turn/start" || activity.payload.method === "turn/started") startIndex = index;
		if (activity.payload.method === "turn/completed") terminalIndex = index;
	}
	if (startIndex < 0 || terminalIndex < startIndex) return null;
	const questionIndex = questionIndexForTurn(activities, startIndex, activities[startIndex]!.nativeRefs.threadId);
	if (questionIndex < 0) return null;
	const threadId = activities[startIndex]!.nativeRefs.threadId;
	if (!threadId || activities[questionIndex]!.nativeRefs.threadId !== threadId) return null;
	const question = normalizedQuestion(activityText(activities[questionIndex]!.payload));
	if (!question) return null;
	const selected = activities.filter((activity, index) =>
		index === questionIndex || (index >= startIndex && index <= terminalIndex &&
			activity.nativeRefs.threadId === threadId && activity.nativeRefs.turnId === turnId));
	if (!selected.some((activity) => activity.payload.method === "turn/completed")) return null;
	const sequences = selected.map((activity) => activity.sequence);
	if (sequences.some((sequence, index) => index > 0 && sequence <= sequences[index - 1]!)) return null;
	return { question, activities: selected };
}

function questionForTurn(activities: readonly ProjectActivity[], turnId: string, knownStartIndex?: number): string | null {
	let startIndex = knownStartIndex ?? -1;
	if (startIndex < 0) {
		for (const [index, activity] of activities.entries()) {
			if (activity.nativeRefs.turnId === turnId &&
				(activity.payload.method === "turn/start" || activity.payload.method === "turn/started")) startIndex = index;
		}
	}
	if (startIndex < 0) return null;
	const questionIndex = questionIndexForTurn(activities, startIndex, activities[startIndex]!.nativeRefs.threadId);
	if (questionIndex < 0) return null;
	const question = normalizedQuestion(activityText(activities[questionIndex]!.payload));
	return question || null;
}

function questionIndexForTurn(activities: readonly ProjectActivity[], startIndex: number, threadId?: string): number {
	if (!threadId) return -1;
	let questionIndex = -1;
	for (let index = startIndex - 1; index >= 0; index -= 1) {
		const activity = activities[index]!;
		if (activity.kind === "message" && activity.phase === "completed" &&
			activity.payload.direction === "outbound" && activity.nativeRefs.threadId === threadId) {
			questionIndex = index;
			break;
		}
	}
	return questionIndex;
}

function latestCompletedTurnNoteScope(
	activities: readonly ProjectActivity[],
): { readonly question: string; readonly activities: readonly ProjectActivity[] } | null {
	for (let index = activities.length - 1; index >= 0; index -= 1) {
		const activity = activities[index]!;
		if (activity.payload.method !== "turn/completed" || !activity.nativeRefs.turnId) continue;
		const scope = completedTurnNoteScope(activities, activity.nativeRefs.turnId);
		if (scope) return scope;
	}
	return null;
}

function fullCompletedTurnScope(
	selected: readonly ProjectActivity[],
): { readonly question: string; readonly activities: readonly ProjectActivity[] } | null {
	const turnId = selected.at(-1)?.nativeRefs.turnId;
	if (!turnId) return null;
	const scope = completedTurnNoteScope([...selected].sort((left, right) => left.sequence - right.sequence), turnId);
	if (!scope || scope.activities.length !== selected.length ||
		scope.activities.some((activity, index) => activity.id !== selected[index]?.id)) return null;
	return scope;
}

function turnTNoteInstruction(question: string): string {
	return [
		"완료된 질문 하나를 T-note로 정리하세요.",
		`질문: ${question}`,
		"관찰 가능한 대화와 실행만 근거로 삼고 숨은 사고과정은 추측하지 마세요.",
		"처음 보는 사람도 이해하도록 전문용어를 풀고, 각 항목은 한두 문장으로 짧게 쓰세요.",
		"파일 목록·원시 로그·다음 할 일은 넣지 마세요. 미완료나 실패는 결과에 그대로 밝히세요.",
		"출력은 다음 세 줄 형식을 정확히 지키세요:",
		`질문: ${question}`,
		"왜: 이 답에 도달하려고 어떤 확인이나 작업을 왜 거쳤는지 설명",
		"결과: 실제로 나온 답, 변경, 검증 또는 남은 문제",
	].join("\n");
}

function normalizedQuestion(text: string): string {
	const excerpt = sanitizeTerminalTextExcerpt(text, 800, "head-tail").trim().replace(/\s+/gu, " ");
	return sanitizeTNoteText(excerpt, 800);
}

function projectSessionGoal(activities: readonly ProjectActivity[]): WorkbenchSessionGoal | null {
	for (let index = activities.length - 1; index >= 0; index -= 1) {
		const activity = activities[index]!;
		if (activity.kind !== "message" || activity.phase !== "completed" || activity.payload.direction === "outbound") continue;
		const text = sessionGoalMarker(activityText(activity.payload));
		if (!text || !activity.nativeRefs.turnId) continue;
		const question = questionForTurn(activities, activity.nativeRefs.turnId);
		if (!question || !isSessionGoalRequest(question)) continue;
		return { text, sourceActivityId: activity.id, updatedAt: activity.recordedAt };
	}
	return null;
}

function isSessionGoalRequest(question: string): boolean {
	return /^\$session-goal(?:[ \t]+|$)/u.test(question);
}

function sessionGoalMarker(text: string): string | null {
	const match = SESSION_GOAL_MARKER.exec(text);
	const goal = match?.[1];
	if (!goal || goal.length > SESSION_GOAL_CHARACTER_LIMIT) return null;
	return goal;
}

function projectTNote(draft: TNoteDraft): WorkbenchTNote {
	const question = /^질문:\s*(.+)$/imu.exec(draft.text)?.[1]?.trim();
	const note = {
		id: draft.id,
		title: question
			? sanitizeTerminalTextExcerpt(question, 160, "head-tail")
			: "현재 세션 대화 요약",
		summary: draft.text,
		sourceActivityIds: draft.packet.activities.map((activity) => activity.id),
		...(draft.packet.completion ? { completion: draft.packet.completion } : {}),
		updatedAt: draft.createdAt,
	};
	return note;
}

function canonicalTNoteDraft(draft: TNoteDraft, sessionId: string): CanonicalDocumentDraft {
	const source = stableJson(draft);
	return createCanonicalDocumentDraft({
		kind: "tnote",
		body: `# 질문 요약 #${draft.sequence}\n\n${draft.text}`,
		source: { id: draft.id, body: source },
		provenance: { sessionId, capturedAt: draft.createdAt },
	});
}

function todoResultBody(document: TodoDocument): string {
	return stableJson({ revision: document.revision, title: document.title, items: document.items });
}

function activityKind(method: string, params: Readonly<Record<string, unknown>>): ProjectActivityKind {
	const normalized = method.toLowerCase();
	const itemType = String(record(params.item)?.type ?? "").toLowerCase();
	const itemScoped = normalized.startsWith("item/");
	if (itemType.includes("message") || itemScoped && normalized.includes("message")) return "message";
	if (itemType.includes("command") || itemType.includes("tool") || itemType.includes("mcp") ||
		itemScoped && (normalized.includes("command") || normalized.includes("tool") || normalized.includes("mcp"))) return "tool";
	if (itemType.includes("file") || itemScoped && normalized.includes("file")) return "file-change";
	if (normalized.includes("approval")) return "approval";
	return "progress";
}

function activityPhase(method: string): ProjectActivityPhase {
	const normalized = method.toLowerCase();
	if (normalized.includes("failed") || normalized.includes("error")) return "failed";
	if (normalized.includes("cancelled") || normalized.includes("canceled") || normalized.includes("interrupted")) return "cancelled";
	if (normalized.includes("completed") || normalized.includes("finished")) return "completed";
	if (normalized.includes("started")) return "started";
	return "updated";
}

function isDeltaNotification(method: string): boolean {
	return method.toLowerCase().includes("delta");
}

function turnLifecycle(method: string): "started" | "terminal" | null {
	const normalized = method.toLowerCase();
	if (normalized === "turn/start" || normalized === "turn/started") return "started";
	if (normalized === "turn/completed" || normalized === "turn/interrupted" || normalized === "turn/failed" ||
		normalized === "turn/cancelled" || normalized === "turn/canceled") return "terminal";
	return null;
}

function projectChat(activities: readonly ProjectActivity[]): WorkbenchChatMessage[] {
	const messages = new Map<string, WorkbenchChatMessage>();
	for (const activity of activities) {
		if (activity.kind !== "message") continue;
		const text = activityText(activity.payload);
		if (!text) continue;
		const key = activity.nativeRefs.itemId ?? activity.id;
		const previous = messages.get(key);
		const role = activity.payload.role === "user" || activity.payload.direction === "outbound" ? "user" : "assistant";
		const status = activity.phase === "failed" ? "failed"
			: activity.phase === "cancelled" ? "cancelled"
				: activity.phase === "completed" ? "completed" : "streaming";
		messages.set(key, {
			id: key,
			role,
			content: previous && status === "streaming" ? `${previous.content}${text}` : text,
			activityId: activity.id,
			status,
		});
	}
	return [...messages.values()];
}

function activityText(payload: Readonly<Record<string, unknown>>): string {
	for (const candidate of [payload.text, payload.message, payload.delta]) {
		if (typeof candidate === "string") return candidate;
	}
	const params = record(payload.params);
	const item = record(params?.item);
	for (const candidate of [params?.text, params?.message, params?.delta, item?.text, item?.content]) {
		if (typeof candidate === "string") return candidate;
	}
	return "";
}

function stableJson(value: unknown): string {
	if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
	if (value && typeof value === "object") {
		return `{${Object.entries(value as Record<string, unknown>)
			.sort(([left], [right]) => left.localeCompare(right))
			.map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`).join(",")}}`;
	}
	return JSON.stringify(value) ?? "null";
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

function record(value: unknown): Record<string, unknown> | null {
	return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function isUncertain(error: unknown): error is NativeUncertainOperation {
	if (!error || typeof error !== "object" || Array.isArray(error)) return false;
	const value = error as Partial<NativeUncertainOperation>;
	return value.state === "uncertain" && value.resolution === "manual-reconcile" &&
		typeof value.method === "string" && (typeof value.requestId === "string" || typeof value.requestId === "number");
}

type BlockedChatDeliveryState =
	| { readonly state: "in-progress"; readonly turnId: string }
	| { readonly state: "idle" }
	| { readonly state: "unknown" };

function blockedChatDeliveryState(value: Readonly<Record<string, unknown>>): BlockedChatDeliveryState {
	const status = record(value.status);
	const turns = value.turns;
	if (!status || typeof status.type !== "string" || !Array.isArray(turns)) return { state: "unknown" };
	if (status.type === "idle") return { state: "idle" };
	for (let index = turns.length - 1; index >= 0; index -= 1) {
		const turn = record(turns[index]);
		if (!turn) continue;
		const turnStatus = typeof turn.status === "string" ? turn.status : record(turn.status)?.type;
		if (turnStatus !== "inProgress") continue;
		return typeof turn.id === "string" && turn.id ? { state: "in-progress", turnId: turn.id } : { state: "unknown" };
	}
	return { state: "unknown" };
}

function turnKey(threadId: string, turnId: string): string {
	return `${threadId}\u0000${turnId}`;
}

function errorMessage(error: unknown): string {
	if (isUncertain(error)) return `Native ${error.method} 요청의 수신 여부가 불명확합니다. 수동 정합 전에는 자동 재시도하지 않습니다.`;
	return error instanceof Error ? error.message : String(error);
}

function emptyBoundedTextProjection(): BoundedTextProjection {
	return { tail: "", omittedCharacters: 0 };
}

function appendBoundedText(
	current: BoundedTextProjection,
	delta: string,
	tailCharacterLimit: number,
): { state: BoundedTextProjection; text: string } {
	let tail = `${current.tail}${delta}`;
	let omittedCharacters = current.omittedCharacters;
	if (tail.length > tailCharacterLimit) {
		omittedCharacters += tail.length - tailCharacterLimit;
		tail = tail.slice(-tailCharacterLimit);
	}
	return {
		state: { tail, omittedCharacters },
		text: omittedCharacters > 0 ? `… 이전 출력 ${omittedCharacters}자 생략\n${tail}` : tail,
	};
}

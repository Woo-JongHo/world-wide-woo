import { createHash, randomUUID } from "node:crypto";
import type { NativeHarnessPort } from "./native-harness.js";
import { createCanonicalDocumentDraft, type CanonicalPromotionService } from "./canonical-promotion.js";
import type { ReviewService } from "./review-service.js";
import type { ActivityNarrator } from "./activity-narrator.js";
import { TodoWriteConflictError } from "./todo-ledger.js";
import type {
	NativeApprovalRequest,
	NativeHarnessEvent,
	NativeRefs,
	NativeThreadStart,
	NativeUncertainOperation,
} from "../domain/native-session.js";
import {
	isReasoningActivityPayload,
	type ProjectActivity,
	type ProjectActivityAppendResult,
	type ProjectActivityInput,
	type ProjectActivityKind,
	type ProjectActivityPhase,
} from "../domain/project-activity.js";
import { sanitizeTerminalTextExcerpt } from "../domain/terminal.js";
import type { TodoDocument } from "../domain/todos.js";
import type { CanonicalDocumentDraft } from "../domain/canonical-document.js";
import type { ReviewPacket, ReviewProvider } from "../domain/review.js";
import {
	projectWorkFlow,
	type WorkFlowProjection,
	type WorkStepNarration,
} from "../domain/work-steps.js";
import {
	projectActivityToTNoteSource,
	type TNoteActivitySource,
	type TNoteDraft,
	type TNoteSourceRange,
} from "../domain/t-notes.js";
import type {
	WorkbenchChatMessage,
	WorkbenchChatQueueItem,
	WorkbenchActionResult,
	WorkbenchCommand,
	WorkbenchCommandReceipt,
	WorkbenchContextUsage,
	WorkbenchListener,
	WorkbenchLiveActivity,
	WorkbenchSnapshot,
	WorkbenchTNote,
} from "../domain/workbench.js";
import { workbenchApprovalDecisions } from "../domain/workbench.js";

const LIVE_ACTIVITY_TAIL_CHARACTER_LIMIT = 32 * 1024 - 128;
const ASSISTANT_DRAFT_TAIL_CHARACTER_LIMIT = 28 * 1024 - 128;
const REASONING_DRAFT_TAIL_CHARACTER_LIMIT = 16 * 1024 - 128;
const JOURNAL_NATIVE_TEXT_CHARACTER_LIMIT = 32 * 1024;
const JOURNAL_NATIVE_MAX_DEPTH = 8;
const JOURNAL_NATIVE_MAX_ITEMS = 128;
const JOURNAL_NATIVE_MAX_COLLECTION_ITEMS = 64;
const JOURNAL_NATIVE_OMISSION = "[journal observation omitted]";
const WORKBENCH_SNAPSHOT_ACTIVITY_LIMIT = 80;
const WORKBENCH_FLOW_ACTIVITY_LIMIT = 400;
const WORKBENCH_ACTION_RESULT_CHARACTER_LIMIT = 12 * 1024;
const AUTOMATIC_TNOTE_ACTIVITY_THRESHOLD = 8;
const AUTOMATIC_TNOTE_ACTIVITY_LIMIT = 100;
const AUTOMATIC_TNOTE_INSTRUCTION = "이 완료된 세션 구간을 세션 요약으로 정리하세요. 사용자의 목표, 중요한 결정, 변경 및 실행 결과, 검증 결과, 남은 작업과 위험을 간결한 항목으로 작성하고 raw activity를 시간순으로 나열하지 마세요.";

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
}

export interface WorkbenchTodoSource {
	readonly snapshot: TodoDocument | null;
	subscribe(listener: (snapshot: TodoDocument | null) => void): () => void;
	/** Optional Native-plan mirror. It must never block the interactive Chat path. */
	syncNativePlan?(turnId: string, flow: WorkFlowProjection): Promise<TodoDocument>;
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
	readAll(projectId: string): Promise<readonly TNoteDraft[]>;
	/** The adapter/generator owns its isolated cwd; Workbench never supplies the project root. */
	create(input: {
		projectId: string;
		range: TNoteSourceRange;
		activities: readonly TNoteActivitySource[];
		instruction: string;
	}, signal?: AbortSignal): Promise<TNoteDraft>;
}

export interface ProjectWorkbenchOptions {
	projectId: string;
	provider?: string;
	cwd: string;
	model?: NativeThreadStart["model"];
	effort?: NativeThreadStart["effort"];
	approvalPolicy?: NativeThreadStart["approvalPolicy"];
	sandbox?: NativeThreadStart["sandbox"];
	resumeThreadId?: string;
	todos?: WorkbenchTodoSource;
	tnotes?: WorkbenchTNoteSource;
	promotions?: CanonicalPromotionService;
	reviews?: ReviewService;
	narrator?: ActivityNarrator;
}

/**
 * Coordinates native conversation state behind one application-owned boundary.
 * Native observations become visible only after their durable journal append.
 */
export class ProjectWorkbench {
	private readonly listeners = new Set<WorkbenchListener>();
	private readonly activities: ProjectActivity[] = [];
	private readonly visibleActivities: ProjectActivity[] = [];
	private readonly notes: WorkbenchTNote[] = [];
	private readonly terminalTurns = new Set<string>();
	private readonly noteDrafts = new Map<string, TNoteDraft>();
	private readonly promotionDrafts = new Map<string, CanonicalDocumentDraft>();
	private readonly reviewPreviews = new Map<string, { provider: ReviewProvider; packet: ReviewPacket }>();
	private readonly stepNarrations = new Map<string, WorkStepNarration>();
	private readonly narrationRequestKeys = new Map<string, string>();
	private readonly narrationAbort = new AbortController();
	private narrationRevision = 0;
	private workFlowProjection: {
		sourceLength: number;
		narrationRevision: number;
		value: WorkFlowProjection;
	} = {
		sourceLength: -1,
		narrationRevision: -1,
		value: projectWorkFlow([]),
	};
	private selectedActivityId: string | null = null;
	private pendingApproval: NativeApprovalRequest | null = null;
	private effectiveModel: string;
	private effectiveEffort: string | null;
	private contextUsage: WorkbenchContextUsage | null = null;
	private threadId: string | null = null;
	private activeTurnId: string | null = null;
	private todo: TodoDocument | null;
	private error: string | null = null;
	private draft = "";
	private reasoningDraft = "";
	private draftItemId: string | null = null;
	private reasoningItemId: string | null = null;
	private draftProjection = emptyBoundedTextProjection();
	private reasoningProjection = emptyBoundedTextProjection();
	private liveActivity: WorkbenchLiveActivity | null = null;
	private liveActivityProjection = emptyBoundedTextProjection();
	private actionResult: WorkbenchActionResult | null = null;
	private readonly chatQueue: WorkbenchChatQueueItem[] = [];
	private durableActivityProjection: DurableActivityProjection = {
		sourceLength: -1,
		activityCount: 0,
		activities: Object.freeze([]),
		chat: Object.freeze([]),
	};
	private visibleThreadId: string | null = null;
	private visibleAfterSequence = 0;
	private automaticTNoteCoveredThrough = 0;
	private automaticTNotePending = false;
	private durableNoteProjection: DurableNoteProjection = {
		sourceLength: -1,
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

	public constructor(
		private readonly native: NativeHarnessPort,
		private readonly journal: WorkbenchActivityJournal,
		private readonly options: ProjectWorkbenchOptions,
	) {
		this.effectiveModel = options.model ?? "codex";
		this.effectiveEffort = options.effort ?? null;
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
		void this.ready.catch((error) => this.fail(error));
	}

	public get snapshot(): WorkbenchSnapshot {
		return this.current;
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
				case "tnote.capture": return await this.captureNote(commandId, command.activityIds, command.title);
				case "tnote.capture-range": return await this.captureNoteRange(commandId, command.startSequence, command.endSequence, command.title);
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
		await this.commandQueue.catch(() => undefined);
		await this.eventQueue.catch(() => undefined);
		await this.todoSyncQueue.catch(() => undefined);
		await this.tnoteQueue.catch(() => undefined);
		await this.native.close();
		this.publish("closed");
		this.listeners.clear();
	}

	private async initialize(): Promise<void> {
		const [activities, notes] = await Promise.all([
			this.journal.readAll(this.options.projectId),
			this.options.tnotes?.readAll(this.options.projectId) ?? Promise.resolve([]),
		]);
		for (const activity of activities) {
			const durableActivity = immutable(activity);
			this.activities.push(durableActivity);
			this.rememberTerminalTurn(durableActivity);
		}
		this.visibleAfterSequence = this.activities.at(-1)?.sequence ?? 0;
		this.automaticTNoteCoveredThrough = this.visibleAfterSequence;
		for (const note of notes) {
			this.noteDrafts.set(note.id, note);
			this.notes.push(immutable(projectTNote(note)));
		}
		if (this.options.resumeThreadId) {
			const resumed = await this.native.resumeThread({
				threadId: this.options.resumeThreadId,
				cwd: this.options.cwd,
				model: this.options.model,
				effort: this.options.effort,
				approvalPolicy: this.options.approvalPolicy,
				sandbox: this.options.sandbox,
				excludeTurns: true,
			});
			this.applyThreadSettings(resumed);
			this.visibleThreadId = resumed.id;
			this.visibleActivities.push(...this.activities.filter(activity => activity.nativeRefs.threadId === resumed.id));
			this.invalidateWorkFlow();
			this.scheduleNarrations();
			const read = await this.native.readThread({ threadId: resumed.id, includeTurns: true });
			const delivery = blockedChatDeliveryState(read.value);
			if (delivery.state === "unknown") {
				throw new Error("재개한 native thread의 현재 turn 상태를 안전하게 판독할 수 없습니다.");
			}
			this.threadId = read.id;
			await this.appendActivity("progress", "completed", { threadId: read.id }, {
				method: "thread/resume-local-reconciled",
				historyHydrated: false,
				nativeState: delivery.state,
			}, false);
			if (delivery.state === "in-progress") {
				this.activeTurnId = delivery.turnId;
				await this.appendActivity("progress", "started", {
					threadId: read.id,
					turnId: delivery.turnId,
				}, {
					method: "turn/started",
					reconciledFrom: "thread/read",
				}, false);
			}
		}
		this.publish("ready");
	}

	private async sendChat(commandId: string, rawText: string): Promise<WorkbenchCommandReceipt> {
		const text = rawText.trim();
		if (!text) return { state: "rejected", commandId, reason: "보낼 메시지가 비어 있습니다." };
		if (this.activeTurnId || this.chatQueue.length > 0 || this.chatDeliveryBlocked) {
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
		const initialMessageRefs: NativeRefs = {
			...(this.threadId ? { threadId: this.threadId } : {}),
			itemId: localMessageId,
		};
		const sent = await this.appendActivity("message", "started", initialMessageRefs, messagePayload);
		if (!this.threadId) {
			let thread: Awaited<ReturnType<NativeHarnessPort["startThread"]>>;
			try {
				thread = await this.native.startThread({
					cwd: this.options.cwd,
					model: this.options.model,
					effort: this.options.effort,
					approvalPolicy: this.options.approvalPolicy,
					sandbox: this.options.sandbox,
				});
			} catch (error) {
				await this.appendActivity("message", "failed", initialMessageRefs, {
					...messagePayload,
					error: errorMessage(error),
				}, false);
				if (queued && this.chatQueue[0]?.id === localMessageId) this.chatQueue.shift();
				this.publish();
				throw error;
			}
			this.applyThreadSettings(thread);
			this.threadId = thread.id;
			await this.appendActivity("progress", "completed", { threadId: thread.id }, {
				method: "thread/start",
				thread: thread.value,
			});
		}
		const messageRefs = { threadId: this.threadId, itemId: localMessageId };
		let turn: Awaited<ReturnType<NativeHarnessPort["startTurn"]>>;
		try {
			turn = await this.native.startTurn({
				threadId: this.threadId,
				text,
				cwd: this.options.cwd,
				model: this.options.model,
				effort: this.options.effort,
				approvalPolicy: this.options.approvalPolicy,
			});
		} catch (error) {
			if (isUncertain(error)) {
				this.chatDeliveryBlocked = true;
				this.blockedChat = { id: localMessageId, content: text };
				if (queued && this.chatQueue[0]?.id === localMessageId) this.chatQueue.shift();
				throw error;
			}
			await this.appendActivity("message", "failed", messageRefs, {
				...messagePayload,
				error: errorMessage(error),
			}, false);
			if (queued && this.chatQueue[0]?.id === localMessageId) this.chatQueue.shift();
			this.publish();
			throw error;
		}
		this.activeTurnId = turn.id;
		this.chatDeliveryBlocked = false;
		this.blockedChat = null;
		if (queued && this.chatQueue[0]?.id === localMessageId) this.chatQueue.shift();
		await this.appendActivity("message", "completed", messageRefs, messagePayload);
		await this.appendActivity("progress", "started", { threadId: this.threadId, turnId: turn.id }, {
			method: "turn/start",
			turn: turn.value,
		});
		return sent;
	}

	private async drainChatQueue(): Promise<void> {
		while (!this.closed && !this.activeTurnId && !this.chatDeliveryBlocked) {
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

	private async captureNote(
		commandId: string,
		activityIds: readonly string[],
		title?: string,
	): Promise<WorkbenchCommandReceipt> {
		if (!this.options.tnotes) return { state: "rejected", commandId, reason: "T-notes 저장소가 연결되지 않았습니다." };
		const uniqueIds = [...new Set(activityIds)];
		if (uniqueIds.length === 0 || uniqueIds.some((id) => !this.activities.some((activity) => activity.id === id))) {
			return { state: "rejected", commandId, reason: "T-note의 source activity를 확인할 수 없습니다." };
		}
		const selected = this.activities.filter((activity) => uniqueIds.includes(activity.id))
			.sort((left, right) => left.sequence - right.sequence);
		const startSequence = selected[0]!.sequence;
		const endSequence = selected.at(-1)!.sequence;
		if (endSequence - startSequence + 1 !== selected.length) {
			return { state: "rejected", commandId, reason: "T-note source는 연속된 activity 범위여야 합니다." };
		}
		const draft = await this.options.tnotes.create({
			projectId: this.options.projectId,
			range: { startSequence, endSequence },
			activities: selected.map(projectActivityToTNoteSource),
			instruction: title?.trim() || "선택한 세션 활동에서 목표, 결정, 작업 및 검증 결과, 남은 위험을 간결하게 요약하세요.",
		}, this.narrationAbort.signal);
		this.noteDrafts.set(draft.id, draft);
		this.notes.push(immutable(projectTNote(draft)));
		if (startSequence <= this.automaticTNoteCoveredThrough + 1) {
			this.automaticTNoteCoveredThrough = Math.max(this.automaticTNoteCoveredThrough, endSequence);
		}
		this.setActionResult("tnote", `세션 요약 #${draft.sequence}`, draft.text, draft.packet.digest);
		return { state: "accepted", commandId, message: `세션 요약 #${draft.sequence}을 만들었습니다.` };
	}

	private async captureNoteRange(
		commandId: string,
		startSequence: number,
		endSequence: number,
		title?: string,
	): Promise<WorkbenchCommandReceipt> {
		if (!Number.isSafeInteger(startSequence) || !Number.isSafeInteger(endSequence) || startSequence < 1 || endSequence < startSequence) {
			return { state: "rejected", commandId, reason: "T-note sequence 범위가 올바르지 않습니다." };
		}
		const selected = this.activities.filter((activity) => activity.sequence >= startSequence && activity.sequence <= endSequence);
		if (selected.length !== endSequence - startSequence + 1 || selected[0]?.sequence !== startSequence || selected.at(-1)?.sequence !== endSequence) {
			return { state: "rejected", commandId, reason: "요청한 T-note sequence 범위가 activity journal에서 연속되지 않습니다." };
		}
		return this.captureNote(commandId, selected.map((activity) => activity.id), title);
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
		if (event.type === "notification" && event.method === "thread/tokenUsage/updated") {
			this.contextUsage = projectContextUsage(event.params);
		}
		if (event.type === "notification" && isDeltaNotification(event.method)) {
			this.applyDelta(event);
			return;
		}
		const lifecycle = event.type === "notification" ? turnLifecycle(event.method) : null;
		const completedActiveTurn = lifecycle === "terminal" && event.type === "notification" &&
			event.refs.turnId === this.activeTurnId;
		const completedSummaryCheckpoint = completedActiveTurn && event.type === "notification" &&
			event.method.toLowerCase() === "turn/completed";
		const sourceDigest = digestSource(stableJson(event));
		const observation = nativeObservation(event);
		await this.appendActivity(observation.kind, observation.phase, observation.refs, observation.payload, false, sourceDigest);
		if (event.type === "approval-requested") this.pendingApproval = immutable(event.approval);
		if (event.type === "approval-resolved" && this.pendingApproval?.requestId === event.requestId) this.pendingApproval = null;
		if (event.type === "notification") {
			const lateStartForTerminalTurn = lifecycle === "started" && event.refs.turnId
				? this.hasTerminalTurn(event.refs.threadId ?? this.threadId ?? undefined, event.refs.turnId)
				: false;
			if (lifecycle === "started" && event.refs.turnId && !lateStartForTerminalTurn) {
				const reconciledChat = this.blockedChat;
				this.activeTurnId = event.refs.turnId;
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
			if (lifecycle === "terminal" && event.refs.turnId === this.activeTurnId) this.activeTurnId = null;
		}
		if (event.type === "notification" && activityPhase(event.method) === "completed") {
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
			if (!event.refs.itemId || event.refs.itemId === this.liveActivity?.nativeRefs.itemId) {
				this.liveActivity = null;
				this.liveActivityProjection = emptyBoundedTextProjection();
			}
		}
		const refs = event.type === "approval-requested" ? event.approval.refs : event.refs;
		this.reconcileNativeState(refs.threadId ?? this.threadId ?? undefined);
		this.publish();
		if (completedSummaryCheckpoint) this.scheduleAutomaticTNote();
		if (completedActiveTurn) await this.drainChatQueue();
	}

	/**
	 * T-notes are completed-session summaries, never a live activity mirror.
	 * Generation runs behind its own queue so the next Chat turn can start while
	 * the detached summary model works from an immutable, bounded packet.
	 */
	private scheduleAutomaticTNote(): void {
		const source = this.options.tnotes;
		if (!source || this.closed || this.automaticTNotePending || this.narrationAbort.signal.aborted) return;
		const pending = this.activities.filter((activity) => activity.sequence > this.automaticTNoteCoveredThrough);
		if (pending.length < AUTOMATIC_TNOTE_ACTIVITY_THRESHOLD) return;
		const selected = pending.slice(-AUTOMATIC_TNOTE_ACTIVITY_LIMIT);
		const startSequence = selected[0]?.sequence;
		const endSequence = selected.at(-1)?.sequence;
		if (!startSequence || !endSequence || endSequence - startSequence + 1 !== selected.length) return;

		this.automaticTNotePending = true;
		this.tnoteQueue = this.tnoteQueue
			.catch(() => undefined)
			.then(async () => {
				try {
					const draft = await source.create({
						projectId: this.options.projectId,
						range: { startSequence, endSequence },
						activities: selected.map(projectActivityToTNoteSource),
						instruction: AUTOMATIC_TNOTE_INSTRUCTION,
					}, this.narrationAbort.signal);
					if (this.closed || this.narrationAbort.signal.aborted) return;
					this.automaticTNoteCoveredThrough = Math.max(this.automaticTNoteCoveredThrough, endSequence);
					this.noteDrafts.set(draft.id, draft);
					this.notes.push(immutable(projectTNote(draft)));
					this.publish();
				} catch (error) {
					if (this.closed || this.narrationAbort.signal.aborted) return;
					this.actionResult = immutable({
						kind: "tnote",
						title: "세션 요약 자동 생성 보류",
						body: sanitizeTerminalTextExcerpt(errorMessage(error), WORKBENCH_ACTION_RESULT_CHARACTER_LIMIT, "head-tail"),
						createdAt: new Date().toISOString(),
					});
					this.publish();
				} finally {
					this.automaticTNotePending = false;
				}
			});
	}

	private applyDelta(event: Extract<NativeHarnessEvent, { type: "notification" }>): void {
		if (event.refs.threadId) this.threadId = event.refs.threadId;
		const delta = activityText({ params: event.params });
		const method = event.method.toLowerCase();
		const reasoning = method.includes("reasoning");
		if (reasoning) {
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
			projectId: this.options.projectId,
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

	private reconcileNativeState(threadId: string | undefined): void {
		if (!threadId) return;
		const currentActiveTurnId = this.threadId === threadId ? this.activeTurnId : null;
		this.threadId = threadId;
		this.activeTurnId = currentActiveTurnId && !this.hasTerminalTurn(threadId, currentActiveTurnId)
			? currentActiveTurnId
			: null;
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
		this.current = this.makeSnapshot(phase ?? (this.error ? "error" : this.activeTurnId ? "working" : "ready"));
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
			effort: this.effectiveEffort,
			contextUsage: this.contextUsage,
			threadId: this.threadId,
			activeTurnId: this.activeTurnId,
			activityCount: durable.activityCount,
			activities: durable.activities,
			selectedActivityId: this.selectedActivityId,
			pendingApproval: this.pendingApproval,
			chat: durable.chat,
			chatQueue: immutable(this.chatQueue),
			draft: this.draft,
			reasoningDraft: this.reasoningDraft,
			liveActivity: immutable(this.liveActivity),
			workFlow: this.projectCurrentWorkFlow(),
			tnotes: this.projectDurableNotes(),
			todo: this.todo,
			actionResult: this.actionResult,
			error: this.error,
		});
	}

	private projectDurableActivities(): DurableActivityProjection {
		if (this.durableActivityProjection.sourceLength === this.visibleActivities.length) {
			return this.durableActivityProjection;
		}
		const activities = Object.freeze(this.visibleActivities.slice(-WORKBENCH_SNAPSHOT_ACTIVITY_LIMIT));
		this.durableActivityProjection = {
			sourceLength: this.visibleActivities.length,
			activityCount: this.visibleActivities.length,
			activities,
			chat: deepFreeze(projectChat(activities)),
		};
		return this.durableActivityProjection;
	}

	private projectDurableNotes(): readonly WorkbenchTNote[] {
		if (this.durableNoteProjection.sourceLength === this.notes.length) return this.durableNoteProjection.notes;
		this.durableNoteProjection = {
			sourceLength: this.notes.length,
			notes: Object.freeze([...this.notes]),
		};
		return this.durableNoteProjection.notes;
	}

	private projectCurrentWorkFlow(): WorkFlowProjection {
		if (this.workFlowProjection.sourceLength === this.visibleActivities.length
			&& this.workFlowProjection.narrationRevision === this.narrationRevision) {
			return this.workFlowProjection.value;
		}
		const source = this.visibleActivities.slice(-WORKBENCH_FLOW_ACTIVITY_LIMIT);
		this.workFlowProjection = {
			sourceLength: this.visibleActivities.length,
			narrationRevision: this.narrationRevision,
			value: projectWorkFlow(source, this.stepNarrations),
		};
		return this.workFlowProjection.value;
	}

	private invalidateWorkFlow(): void {
		this.workFlowProjection.sourceLength = -1;
	}

	private scheduleNativeTodoSync(activity: ProjectActivity): void {
		const sync = this.options.todos?.syncNativePlan;
		const turnId = activity.nativeRefs.turnId;
		if (!sync || !turnId) return;
		const flow = this.projectCurrentWorkFlow();
		const method = typeof activity.payload.method === "string" ? activity.payload.method : "";
		const startsTurn = method === "turn/start" || method === "turn/started";
		const updatesPlan = method === "turn/plan/updated";
		const contributesExecution = flow.steps.some((step) => step.activityIds.includes(activity.id));
		const belongsToNativePlan = flow.steps.some((step) => step.id.startsWith(`plan:${turnId}:`));
		if (!startsTurn && (!belongsToNativePlan || !updatesPlan && !contributesExecution)) return;
		this.enqueueNativeTodoSync(sync, turnId, flow);
	}

	private scheduleNarratedTodoSync(): void {
		const sync = this.options.todos?.syncNativePlan;
		if (!sync) return;
		const flow = this.projectCurrentWorkFlow();
		const planStep = flow.steps.find((step) => /^plan:.+:\d+$/u.test(step.id));
		if (!planStep) return;
		const turnId = planStep.id.replace(/^plan:/u, "").replace(/:\d+$/u, "");
		if (!turnId) return;
		this.enqueueNativeTodoSync(sync, turnId, flow);
	}

	private enqueueNativeTodoSync(
		sync: NonNullable<WorkbenchTodoSource["syncNativePlan"]>,
		turnId: string,
		flow: WorkFlowProjection,
	): void {
		this.todoSyncQueue = this.todoSyncQueue
			.catch(() => undefined)
			.then(async () => {
				try {
					await sync(turnId, flow);
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
		const source = this.visibleActivities.slice(-WORKBENCH_FLOW_ACTIVITY_LIMIT);
		const baseFlow = projectWorkFlow(source);
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
	if (isReasoningActivityPayload(rawPayload)) return {
		kind: activityKind(event.method, event.params),
		phase: activityPhase(event.method),
		refs: event.refs,
		payload: { eventType: event.type, method: event.method, classification: "reasoning", redacted: true },
	};
	const params = boundedJournalNativeValue(event.params);
	const payload = {
		eventType: event.type,
		method: event.method,
		params: params.value,
		...(params.omitted ? { observationTruncated: true } : {}),
	};
	return {
		kind: activityKind(event.method, event.params),
		phase: activityPhase(event.method),
		refs: event.refs,
		payload,
	};
}

function projectContextUsage(params: Readonly<Record<string, unknown>>): WorkbenchContextUsage | null {
	const tokenUsage = record(params.tokenUsage);
	const last = record(tokenUsage?.last);
	const usedTokens = last?.totalTokens;
	const contextWindow = tokenUsage?.modelContextWindow;
	if (typeof usedTokens !== "number" || !Number.isFinite(usedTokens) || usedTokens < 0) return null;
	if (typeof contextWindow !== "number" || !Number.isFinite(contextWindow) || contextWindow <= 0) return null;
	return Object.freeze({
		usedTokens,
		contextWindow,
		percent: Math.round((usedTokens / contextWindow) * 1_000) / 10,
	});
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

function projectTNote(draft: TNoteDraft): WorkbenchTNote {
	return {
		id: draft.id,
		title: `세션 요약 #${draft.sequence}`,
		summary: draft.text,
		sourceActivityIds: draft.packet.activities.map((activity) => activity.id),
		updatedAt: draft.createdAt,
	};
}

function canonicalTNoteDraft(draft: TNoteDraft, sessionId: string): CanonicalDocumentDraft {
	const source = stableJson(draft);
	return createCanonicalDocumentDraft({
		kind: "tnote",
		body: `# 세션 요약 #${draft.sequence}\n\n${draft.text}`,
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

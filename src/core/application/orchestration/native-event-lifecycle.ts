import { createHash }                                                 from "node:crypto";
import type { SessionUsageTracker }                                   from "@/core/application/session/session-usage-tracker.js";
import type { NativeApprovalRequest, NativeHarnessEvent, NativeRefs } from "@/core/domain/execution/native-session.js";
import { isTerminalActivityPhase }                                    from "@/core/domain/execution/project-activity.js";
import type {
	ProjectActivity,
	ProjectActivityKind,
	ProjectActivityPhase,
} from "@/core/domain/execution/project-activity.js";
import type { WorkbenchCollaborationMode, WorkbenchSessionGoal }      from "@/core/domain/work/workbench.js";
import { nativeTurnLifecycle, projectNativeEvent }                    from "@/core/application/orchestration/native-event-projection.js";
import type { NativeEventDeltaProjection }                            from "@/core/application/orchestration/native-event-projection.js";
import {
	activityText,
	isAssistantMessageActivity,
	isPublicPlanFallbackActivity,
	isStructuredPlanActivity,
	missingAssistantResponseNotice,
	nativeItemIdentity,
	projectSessionGoal,
	publicNumberedPlanEntries,
	sameTurnOwner,
	stableJson,
	threadItemKey,
} from "@/core/application/orchestration/workbench-projections.js";
import type { NativeStreamProjection }                                from "@/core/application/orchestration/native-stream-projection.js";
import type { NativeTurnCoordinator }                                 from "@/core/application/orchestration/native-turn-coordinator.js";

interface NativeEventLifecycleDependencies {
	readonly closed             : () => boolean                                    ;
	readonly recordingReadOnly  : () => boolean                                    ;
	readonly hasBoundThread     : () => boolean | undefined                        ;
	readonly pendingApproval    : () => NativeApprovalRequest | null               ;
	readonly setPendingApproval : (approval: NativeApprovalRequest | null) => void ;
	readonly confirmApproval    : (approval: NativeApprovalRequest) => void        ;
	readonly threadId           : () => string | null                              ;
	readonly setThreadId        : (threadId: string) => void                       ;
	readonly activeTurnId       : () => string | null                              ;
	readonly contextTurnId      : () => string | null                              ;
	readonly setActiveTurnId    : (turnId: string | null) => void                  ;
	readonly selectPlanTurn     : (turnId: string) => void                         ;
	readonly setContextTurn     : (turnId: string) => void                         ;
	readonly collaborationMode  : () => WorkbenchCollaborationMode                 ;
	readonly effectiveModel     : () => string                                     ;
	readonly effectiveEffort    : () => string | null                              ;
	readonly usageTracker       : SessionUsageTracker                              ;
	readonly nativeTurn         : NativeTurnCoordinator                            ;
	readonly nativeStream       : NativeStreamProjection                           ;
	readonly activities         : () => readonly ProjectActivity[]                 ;
	readonly visibleActivities  : () => readonly ProjectActivity[]                 ;
	readonly appendActivity      : (
		kind: ProjectActivityKind,
		phase: ProjectActivityPhase,
		refs: NativeRefs,
		payload: Readonly<Record<string, unknown>>,
		publish?: boolean,
		sourceDigest?: string,
	) => Promise<ProjectActivity>;
	readonly setSessionGoal : (goal: WorkbenchSessionGoal) => void ;
	readonly clearError     : () => void                           ;
	readonly publish        : () => void                           ;
	readonly scheduleTNote  : (turnId: string) => void             ;
	readonly drainChatQueue : () => Promise<void>                  ;
}

/** Owns Native event identity, terminal state, and root-turn lifecycle reduction. */
export class NativeEventLifecycle {
	private readonly terminalTurns            = new Set<string>()                             ;
	private readonly terminalItems            = new Set<string>()                             ;
	private readonly threadOwnersByTurnId     = new Map<string, Set<string>>()                ;
	private readonly turnOwnersByThreadItemId = new Map<string, Set<string>>()                ;
	private readonly firstOutputObservedTurns = new Set<string>()                             ;
	private readonly collaborationByTurnId    = new Map<string, WorkbenchCollaborationMode>() ;

	public constructor(private readonly dependencies: NativeEventLifecycleDependencies) {}

	public rememberTurnCollaboration(turnId: string, mode: WorkbenchCollaborationMode): void {
		this.collaborationByTurnId.set(turnId, mode);
	}

	public restore(activity: ProjectActivity): void {
		this.rememberNativeRefs(activity.nativeRefs);
		if (activity.payload.method === "turn/first-output-observed" && activity.nativeRefs.turnId) {
			this.firstOutputObservedTurns.add(activity.nativeRefs.turnId);
		}
		this.observeDurableActivity(activity);
	}

	public rememberNativeRefs(refs: NativeRefs): void {
		if (!refs.threadId || !refs.turnId) return;
		addOwner(this.threadOwnersByTurnId, refs.turnId, refs.threadId);
		if (refs.itemId) addOwner(this.turnOwnersByThreadItemId, threadItemKey(refs.threadId, refs.itemId), refs.turnId);
	}

	public observeDurableActivity(activity: ProjectActivity): void {
		const method = typeof activity.payload.method === "string" ? activity.payload.method : "";
		if (nativeTurnLifecycle(method) === "terminal") {
			const { threadId, turnId } = activity.nativeRefs;
			if (threadId && turnId) this.terminalTurns.add(turnKey(threadId, turnId));
		}
		if (isTerminalActivityPhase(activity.phase)) {
			const identity = nativeItemIdentity(activity.nativeRefs);
			if (identity) this.terminalItems.add(identity);
		}
	}

	/** Native 실행 이벤트를 Workbench 상태 전이로 투영한다. */
	public async record(event: NativeHarnessEvent): Promise<void> {
		const dependencies = this.dependencies;
		if (dependencies.closed() || dependencies.recordingReadOnly()) return;
		if (dependencies.hasBoundThread() === false) return;
		const approval = dependencies.pendingApproval();
		if (event.type === "approval-resolved" && approval?.requestId === event.requestId
			&& (!event.refs.threadId || event.refs.threadId === approval.refs.threadId)) {
			event = { ...event, refs: { ...approval.refs, ...event.refs, approvalCallbackId: approval.callbackId } };
		}
		if (event.type === "notification") {
			const refs = this.normalizeNativeRefs(event.refs);
			if (refs !== event.refs) event = { ...event, refs };
			this.rememberNativeRefs(event.refs);
		}
		const projection = projectNativeEvent(event);
		const rootEvent = event.type !== "notification" || this.isRootThreadEvent(event.refs.threadId);
		if (rootEvent && event.type === "notification" && event.method === "thread/tokenUsage/updated") {
			dependencies.usageTracker.observe(event, dependencies.threadId(), dependencies.contextTurnId());
		}
		if (projection.type === "delta") {
			if (rootEvent) await this.applyDelta(projection);
			return;
		}
		const { lifecycle, observation } = projection;
		const sourceDigest = digestSource(stableJson(event));
		const terminalItemCandidate = event.type === "notification" && Boolean(event.refs.itemId)
			&& isTerminalActivityPhase(observation.phase);
		if (terminalItemCandidate && event.type === "notification" && projection.assistantMessage
			&& !nativeItemIdentity(event.refs)) return;
		const terminalItemObservation = terminalItemCandidate && Boolean(nativeItemIdentity(observation.refs));
		if (terminalItemObservation && event.type === "notification" && this.hasTerminalItem(event.refs)) return;
		const completedActiveTurn = rootEvent && lifecycle === "terminal" && event.type === "notification"
			&& event.refs.turnId === dependencies.activeTurnId();
		const completedSummaryCheckpoint = completedActiveTurn && event.type === "notification"
			&& event.method.toLowerCase() === "turn/completed" && observation.phase === "completed";
		const terminalItemMissingMessage = event.type === "notification" && rootEvent && terminalItemObservation
			&& projection.assistantMessage && activityText(observation.payload).trim().length === 0;
		if (terminalItemMissingMessage && event.type === "notification") await this.preserveUnfinalizedAssistantResponse(event, observation.phase);
		if (completedActiveTurn && event.type === "notification") await this.preserveUnfinalizedAssistantResponse(event, observation.phase);
		await dependencies.appendActivity(observation.kind, observation.phase, observation.refs, observation.payload, false, sourceDigest);
		if (completedSummaryCheckpoint
			&& event.type === "notification"
			&& event.refs.threadId
			&& event.refs.turnId) {
			await this.projectPublicPlanFallback(event.refs.threadId, event.refs.turnId);
		}
		const projectedGoal = projectSessionGoal(dependencies.visibleActivities());
		if (projectedGoal) dependencies.setSessionGoal(projectedGoal);
		if (event.type === "approval-requested" && this.isRootThreadEvent(event.approval.refs.threadId)) {
			dependencies.setPendingApproval(immutable(event.approval));
		}
		const currentApproval = dependencies.pendingApproval();
		const approvalResolved = event.type === "approval-resolved" && currentApproval?.requestId === event.requestId
			&& event.refs.threadId === currentApproval.refs.threadId;
		if (approvalResolved && currentApproval) {
			dependencies.confirmApproval(currentApproval);
			dependencies.setPendingApproval(null);
		}
		if (event.type === "notification") {
			const lateStart = lifecycle === "started" && event.refs.turnId
				? this.hasTerminalTurn(event.refs.threadId ?? dependencies.threadId() ?? undefined, event.refs.turnId)
				: false;
			if (rootEvent
				&& lifecycle === "started"
				&& event.refs.turnId
				&& !lateStart) {
				await this.startObservedTurn(event, event.refs.turnId);
			}
			if (rootEvent && lifecycle === "terminal" && event.refs.turnId === dependencies.activeTurnId()) {
				dependencies.setActiveTurnId(null);
			}
		}
		const eventPhase = event.type === "notification" ? observation.phase : null;
		const clearsTerminalProjection = eventPhase === "completed" || lifecycle === "terminal"
			|| Boolean(event.type === "notification" && event.refs.itemId && eventPhase && isTerminalActivityPhase(eventPhase));
		if (rootEvent && event.type === "notification" && clearsTerminalProjection) {
			dependencies.nativeStream.clearTerminal({
				itemScoped        : Boolean(event.refs.itemId),
				completedIdentity : nativeItemIdentity(event.refs),
				terminalTurn      : lifecycle === "terminal",
				refs              : event.refs,
			});
		}
		const refs = event.type === "approval-requested" ? event.approval.refs : event.refs;
		this.reconcileNativeState(refs.threadId ?? dependencies.threadId() ?? undefined);
		dependencies.publish();
		if (completedSummaryCheckpoint && event.type === "notification" && event.refs.turnId) dependencies.scheduleTNote(event.refs.turnId);
		if (completedActiveTurn || approvalResolved) await dependencies.drainChatQueue();
	}

	private async startObservedTurn(event: Extract<NativeHarnessEvent, { type: "notification" }>, turnId: string): Promise<void> {
		const dependencies = this.dependencies;
		const reconciledChat = dependencies.nativeTurn.blockedChat;
		dependencies.setActiveTurnId(turnId);
		dependencies.selectPlanTurn(turnId);
		dependencies.setContextTurn(turnId);
		if (!this.collaborationByTurnId.has(turnId)) this.collaborationByTurnId.set(turnId, dependencies.collaborationMode());
		if (!dependencies.usageTracker.hasTurn(turnId)) {
			dependencies.usageTracker.bindTurn(turnId, dependencies.effectiveModel(), dependencies.effectiveEffort());
		}
		dependencies.nativeTurn.clearUncertain();
		if (reconciledChat) dependencies.clearError();
		if (reconciledChat) dependencies.nativeTurn.shiftHeadIf(reconciledChat.id);
		if (!reconciledChat) return;
		const threadId = event.refs.threadId ?? dependencies.threadId();
		await dependencies.appendActivity("message", "completed", {
			...(threadId ? { threadId } : {}),
			itemId: reconciledChat.id,
		}, { direction: "outbound", role: "user", text: reconciledChat.content }, false);
	}

	private async projectPublicPlanFallback(threadId: string, turnId: string): Promise<void> {
		if (this.collaborationByTurnId.get(turnId) !== "plan") return;
		const activities = this.dependencies.activities();
		const sameTurn = activities.filter((activity) => activity.nativeRefs.threadId === threadId && activity.nativeRefs.turnId === turnId);
		if (sameTurn.some(isStructuredPlanActivity) || sameTurn.some(isPublicPlanFallbackActivity)) return;
		const assistants = sameTurn.slice().reverse().filter((activity) => activity.kind === "message"
			&& activity.phase === "completed" && isAssistantMessageActivity(activity)
			&& activity.payload.finalObservation !== "missing" && activityText(activity.payload).trim().length > 0);
		const request = sameTurn.find((activity) => activity.payload.method === "request/started");
		const requestId = typeof request?.payload.requestId === "string" ? request.payload.requestId : null;
		const outbound = requestId ? activities.slice().reverse().find((activity) => activity.nativeRefs.threadId === threadId
			&& activity.nativeRefs.itemId === requestId && activity.payload.direction === "outbound"
			&& typeof activity.payload.text === "string") : undefined;
		const requestText = typeof outbound?.payload.text === "string" ? outbound.payload.text : "";
		const candidate = assistants.map((assistant) => ({
			assistant,
			entries: publicNumberedPlanEntries(activityText(assistant.payload), requestText),
		})).find((value) => value.entries !== null);
		if (!candidate?.entries) return;
		const refs = { threadId, turnId, itemId: `public-plan-fallback:${turnId}` };
		const payload = {
			method           : "turn/plan/public-fallback",
			source           : "public-assistant-response",
			sourceActivityId : candidate.assistant.id,
			sourceItemId     : candidate.assistant.nativeRefs.itemId ?? null,
			params           : { plan: candidate.entries },
		};
		await this.dependencies.appendActivity("progress", "completed", refs, payload, false, digestSource(stableJson({ refs, payload })));
	}

	private async applyDelta(event: NativeEventDeltaProjection): Promise<void> {
		const dependencies = this.dependencies;
		if (event.refs.threadId) dependencies.setThreadId(event.refs.threadId);
		if (event.refs.turnId && (this.hasTerminalTurn(event.refs.threadId, event.refs.turnId) || this.hasTerminalItem(event.refs))) return;
		if (event.channel === "assistant" && event.text.trim().length > 0 && event.refs.turnId
			&& dependencies.usageTracker.hasTurn(event.refs.turnId) && !this.firstOutputObservedTurns.has(event.refs.turnId)) {
			const threadId = event.refs.threadId ?? dependencies.threadId();
			await dependencies.appendActivity("progress", "completed", {
				...(threadId ? { threadId } : {}), turnId: event.refs.turnId,
			}, { method: "turn/first-output-observed" }, false, digestSource(stableJson({
				method: "turn/first-output-observed", refs: { threadId: event.refs.threadId, turnId: event.refs.turnId },
			})));
			this.firstOutputObservedTurns.add(event.refs.turnId);
		}
		dependencies.nativeStream.apply(event);
		dependencies.publish();
	}

	private reconcileNativeState(threadId: string | undefined): void {
		if (!threadId) return;
		const dependencies = this.dependencies;
		if (dependencies.threadId() && dependencies.threadId() !== threadId) return;
		const activeTurnId = dependencies.threadId() === threadId ? dependencies.activeTurnId() : null;
		dependencies.setThreadId(threadId);
		dependencies.setActiveTurnId(activeTurnId && !this.hasTerminalTurn(threadId, activeTurnId) ? activeTurnId : null);
	}

	private isRootThreadEvent(threadId: string | undefined): boolean {
		return Boolean(threadId && (!this.dependencies.threadId() || threadId === this.dependencies.threadId()));
	}

	private normalizeNativeRefs(refs: NativeRefs): NativeRefs {
		let threadId = refs.threadId;
		let turnId = refs.turnId;
		if (!threadId && turnId) threadId = soleValue(this.threadOwnersByTurnId.get(turnId));
		if (threadId && !turnId && refs.itemId) turnId = soleValue(this.turnOwnersByThreadItemId.get(threadItemKey(threadId, refs.itemId)));
		if (threadId === refs.threadId && turnId === refs.turnId) return refs;
		return { ...refs, ...(threadId ? { threadId } : {}), ...(turnId ? { turnId } : {}) };
	}

	private hasTerminalTurn(threadId: string | undefined, turnId: string): boolean {
		return Boolean(threadId && this.terminalTurns.has(turnKey(threadId, turnId)));
	}

	private hasTerminalItem(refs: NativeRefs): boolean {
		const identity = nativeItemIdentity(refs);
		return Boolean(identity && this.terminalItems.has(identity));
	}

	private async preserveUnfinalizedAssistantResponse(
		event: Extract<NativeHarnessEvent, { type: "notification" }>,
		phase: ProjectActivityPhase,
	): Promise<void> {
		const { threadId, turnId } = event.refs;
		if (!threadId || !turnId || this.hasTerminalTurn(threadId, turnId)) return;
		const stream         = this.dependencies.nativeStream.snapshot                                             ;
		const matchingDraft  = stream.draft.trim().length > 0 && sameTurnOwner(stream.draftNativeRefs, event.refs) ;
		const targetRefs     = matchingDraft && stream.draftNativeRefs ? stream.draftNativeRefs : event.refs       ;
		const targetIdentity = nativeItemIdentity(targetRefs)                                                      ;
		const hasTerminalMessage = this.dependencies.visibleActivities().some((activity) => activity.kind === "message"
			&& activity.nativeRefs.threadId === threadId && activity.nativeRefs.turnId === turnId
			&& isAssistantMessageActivity(activity) && isTerminalActivityPhase(activity.phase)
			&& activityText(activity.payload).trim().length > 0
			&& (targetIdentity ? nativeItemIdentity(activity.nativeRefs) === targetIdentity : true));
		if (hasTerminalMessage) return;
		const text = matchingDraft ? stream.draft : missingAssistantResponseNotice(phase);
		const itemId = matchingDraft && stream.draftNativeRefs?.itemId
			? stream.draftNativeRefs.itemId : event.refs.itemId ?? `local-missing-final:${turnId}`;
		const refs = { threadId, turnId, itemId };
		const payload = {
			method: "turn/final-message-observation-missing", role: "assistant", text, partial: matchingDraft,
			finalObservation: "missing", observationScope: matchingDraft ? "bounded-local-delta" : "local-lifecycle",
			presentation: matchingDraft ? "partial-response" : "terminal-status-notice", terminalMethod: event.method,
		};
		await this.dependencies.appendActivity("message", phase, refs, payload, false, digestSource(stableJson({ refs, payload })));
	}
}

function addOwner(owners: Map<string, Set<string>>, key: string, owner: string): void {
	const values = owners.get(key) ?? new Set<string>();
	values.add(owner);
	owners.set(key, values);
}

function soleValue(values: ReadonlySet<string> | undefined): string | undefined {
	return values?.size === 1 ? values.values().next().value : undefined;
}

function turnKey(threadId: string, turnId: string): string {
	return `${threadId}\u0000${turnId}`;
}

function digestSource(source: string): string {
	return `sha256:${createHash("sha256").update(source).digest("hex")}`;
}

function immutable<T>(value: T): T {
	return deepFreeze(structuredClone(value));
}

function deepFreeze<T>(value: T): T {
	if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
	Object.freeze(value);
	for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
	return value;
}

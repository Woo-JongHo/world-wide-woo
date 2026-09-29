import type { ExecutionRunState }                               from "@/core/domain/execution/execution-run-contract.js";
import type { NativeApprovalRequest }                           from "@/core/domain/execution/native-session.js";
import type { RequestRuntimeRecord }                            from "@/core/domain/execution/request-runtime.js";
import type { ProjectActivity }                                 from "@/core/domain/execution/project-activity.js";
import type { NativeDelegatedTask, NativeDelegationProjection } from "@/core/domain/work/delegation.js";
import type { LinearProjectDashboard }                          from "@/core/domain/work/linear-dashboard.js";
import type { PerformanceProjection }                           from "@/core/domain/work/performance.js";
import type { WorkFlowProjection }                              from "@/core/domain/work/workflow-projection.js";
import type {
	PlanActivity,
	WorkbenchActionResult,
	WorkbenchChatMessage,
	WorkbenchChatQueueItem,
	WorkbenchLiveActivity,
	WorkbenchPhase,
	WorkbenchSessionGoal,
	WorkbenchSnapshot,
	WorkbenchTNote,
	WorkbenchTNoteReadState,
} from "@/core/domain/work/workbench.js";

/** Semantic state read by Chat; terminal width, color, focus, scrolling, and render caches remain TUI concerns. */
export interface ChatFeatureProjection {
	readonly actionResult               : WorkbenchActionResult | null                     ;
	readonly activeTurnId               : string | null                                    ;
	readonly activities                 : readonly ProjectActivity[]                       ;
	readonly chat                       : readonly WorkbenchChatMessage[]                  ;
	readonly chatQueue                  : readonly WorkbenchChatQueueItem[]                ;
	readonly deliveryUncertain?         : boolean                                          ;
	readonly delegation?                : readonly NativeDelegationProjection[]            ;
	readonly developmentRecordingError? : string | null                                    ;
	readonly draft                      : string                                           ;
	readonly draftAnchorSequence?       : number | null                                    ;
	readonly error                      : string | null                                    ;
	readonly executionRun?              : ExecutionRunState | null                         ;
	readonly journalSequence            : number                                           ;
	readonly linearDashboard?           : LinearProjectDashboard                           ;
	readonly liveActivity               : WorkbenchLiveActivity | null                     ;
	readonly pendingApproval            : NativeApprovalRequest | null                     ;
	readonly performance?               : PerformanceProjection                            ;
	readonly phase                      : WorkbenchPhase                                   ;
	readonly planActivities?            : readonly PlanActivity[]                          ;
	readonly toolActions?               : readonly PlanActivity[]                          ;
	readonly planActivityStatus?        : "disabled" | "pending" | "ready" | "unavailable" ;
	readonly projectId                  : string                                           ;
	readonly reasoningDraft             : string                                           ;
	readonly reasoningSummaryDraft?     : string                                           ;
	readonly requestRuntime?            : readonly RequestRuntimeRecord[]                  ;
	readonly selectedActivityId         : string | null                                    ;
	readonly sessionGoal?               : WorkbenchSessionGoal | null                      ;
	readonly threadId                   : string | null                                    ;
	readonly tnotes                     : readonly WorkbenchTNote[]                        ;
	readonly workFlow                   : WorkFlowProjection                               ;
}

/** Semantic state read by Plan; terminal layout and animation remain TUI concerns. */
export interface PlanFeatureProjection {
	readonly activeTurnId        : string | null                                    ;
	readonly planActivities?     : readonly PlanActivity[]                          ;
	readonly planActivityStatus? : "disabled" | "pending" | "ready" | "unavailable" ;
	readonly requestRuntime?     : readonly RequestRuntimeRecord[]                  ;
	readonly sessionGoal?        : WorkbenchSessionGoal | null                      ;
	readonly workFlow            : WorkFlowProjection                               ;
}

/** Semantic state read by Tracer; terminal layout, colors, and focus remain TUI concerns. */
export interface TracerFeatureProjection {
	readonly actionResult                : WorkbenchActionResult | null          ;
	readonly activeTurnId                : string | null                         ;
	readonly activities                  : readonly ProjectActivity[]            ;
	readonly chat                        : readonly WorkbenchChatMessage[]       ;
	readonly configurationSource?        : "project-yaml" | "defaults"           ;
	readonly delegation?                 : readonly NativeDelegationProjection[] ;
	readonly delegationDetailActivities? : number                                ;
	readonly evaluationRequired?         : boolean                               ;
	readonly linearDashboard?            : LinearProjectDashboard                ;
	readonly liveActivity                : WorkbenchLiveActivity | null          ;
	readonly performance?                : PerformanceProjection                 ;
	readonly recordingReadOnly?          : boolean                               ;
	readonly selectedAgentDetail?        : NativeDelegatedTask | null            ;
	readonly workFlow                    : WorkFlowProjection                    ;
}

/** Stored Summary/Note read model. Generation and append remain separate commands and failure boundaries. */
export interface NoteFeatureProjection {
	readonly projectId : string                    ;
	readonly threadId  : string | null             ;
	readonly notes     : readonly WorkbenchTNote[] ;
	readonly read      : WorkbenchTNoteReadState   ;
	readonly runtime?         : {
		readonly turnId       : string | null                                                                                         ;
		readonly primaryModel : string | null                                                                                         ;
		readonly effort       : string | null                                                                                         ;
		readonly durationMs   : number | null                                                                                         ;
		readonly totalTokens  : number | null                                                                                         ;
		readonly files        : readonly { readonly kind: string; readonly ref: string; readonly summary: string }[]                  ;
		readonly receipt      : { readonly id: string; readonly digest: string; readonly status: string } | null                      ;
		readonly verification : readonly { readonly command: string; readonly status: "passed" | "failed" | "skipped" | "unknown" }[] ;
	} ;
	readonly visibleLimit?    : number ;
	readonly summaryMaxChars? : number ;
	readonly summaryMaxLines? : number ;
}

/** Selects Chat's read interface without creating a second state owner or copying durable identities. */
export function projectChatFeature(snapshot: WorkbenchSnapshot): ChatFeatureProjection {
	return Object.freeze({
		actionResult       : snapshot.actionResult,
		activeTurnId       : snapshot.activeTurnId,
		activities         : snapshot.activities,
		chat               : snapshot.chat,
		chatQueue          : snapshot.chatQueue,
		draft              : snapshot.draft,
		draftAnchorSequence: snapshot.draftAnchorSequence ?? null,
		error              : snapshot.error,
		journalSequence    : snapshot.journalSequence,
		liveActivity       : snapshot.liveActivity,
		pendingApproval    : snapshot.pendingApproval,
		phase              : snapshot.phase,
		projectId          : snapshot.projectId,
		reasoningDraft     : snapshot.reasoningDraft,
		selectedActivityId : snapshot.selectedActivityId,
		threadId           : snapshot.threadId,
		tnotes             : snapshot.tnotes,
		workFlow           : snapshot.workFlow,
		...(snapshot.deliveryUncertain === undefined ? {} : { deliveryUncertain: snapshot.deliveryUncertain }),
		...(snapshot.delegation === undefined ? {} : { delegation: snapshot.delegation }),
		...(snapshot.developmentRecordingError === undefined ? {} : { developmentRecordingError: snapshot.developmentRecordingError }),
		...(snapshot.executionRun === undefined ? {} : { executionRun: snapshot.executionRun }),
		...(snapshot.linearDashboard === undefined ? {} : { linearDashboard: snapshot.linearDashboard }),
		...(snapshot.performance === undefined ? {} : { performance: snapshot.performance }),
		...(snapshot.planActivities === undefined ? {} : { planActivities: snapshot.planActivities }),
		...(snapshot.toolActions === undefined ? {} : { toolActions: snapshot.toolActions }),
		...(snapshot.planActivityStatus === undefined ? {} : { planActivityStatus: snapshot.planActivityStatus }),
		...(snapshot.reasoningSummaryDraft === undefined ? {} : { reasoningSummaryDraft: snapshot.reasoningSummaryDraft }),
		...(snapshot.requestRuntime === undefined ? {} : { requestRuntime: snapshot.requestRuntime }),
		sessionGoal : snapshot.sessionGoal ?? null,
	});
}

/** Selects Plan's read interface without creating a second state owner. */
export function projectPlanFeature(snapshot: WorkbenchSnapshot): PlanFeatureProjection {
	return Object.freeze({
		activeTurnId : snapshot.activeTurnId,
		workFlow     : snapshot.workFlow,
		...(snapshot.planActivities === undefined ? {} : { planActivities: snapshot.planActivities }),
		...(snapshot.planActivityStatus === undefined ? {} : { planActivityStatus: snapshot.planActivityStatus }),
		...(snapshot.requestRuntime === undefined ? {} : { requestRuntime: snapshot.requestRuntime }),
		sessionGoal : snapshot.sessionGoal ?? null,
	});
}

/** Selects Tracer's read interface without creating a second state owner. */
export function projectTracerFeature(snapshot: WorkbenchSnapshot): TracerFeatureProjection {
	return Object.freeze({
		actionResult : snapshot.actionResult,
		activeTurnId : snapshot.activeTurnId,
		activities   : snapshot.activities,
		chat         : snapshot.chat,
		liveActivity : snapshot.liveActivity,
		workFlow     : snapshot.workFlow,
		...(snapshot.configurationSource === undefined ? {} : { configurationSource: snapshot.configurationSource }),
		...(snapshot.delegation === undefined ? {} : { delegation: snapshot.delegation }),
		...(snapshot.delegationDetailActivities === undefined ? {} : { delegationDetailActivities: snapshot.delegationDetailActivities }),
		...(snapshot.evaluationRequired === undefined ? {} : { evaluationRequired: snapshot.evaluationRequired }),
		...(snapshot.linearDashboard === undefined ? {} : { linearDashboard: snapshot.linearDashboard }),
		...(snapshot.performance === undefined ? {} : { performance: snapshot.performance }),
		...(snapshot.recordingReadOnly === undefined ? {} : { recordingReadOnly: snapshot.recordingReadOnly }),
		...(snapshot.selectedAgentDetail === undefined ? {} : { selectedAgentDetail: snapshot.selectedAgentDetail }),
	});
}

/** Selects Note reading state without exposing composer, execution controls, or terminal presentation. */
export function projectNoteFeature(snapshot: WorkbenchSnapshot): NoteFeatureProjection {
	const activityTimes = snapshot.executionRun?.activities
		.map(activity => Date.parse(activity.recordedAt))
		.filter(Number.isFinite) ?? [];
	const durationMs = activityTimes.length > 1
		? Math.max(...activityTimes) - Math.min(...activityTimes)
		: null;
	const runModel  = lastObservedString(snapshot.executionRun?.activities ?? [], "model")                      ;
	const runEffort = lastObservedString(snapshot.executionRun?.activities ?? [], "effort")                     ;
	const activeRun = snapshot.activeTurnId !== null && snapshot.activeTurnId === snapshot.executionRun?.turnId ;
	return Object.freeze({
		projectId : snapshot.projectId,
		threadId  : snapshot.threadId,
		notes     : snapshot.tnotes,
		read      : snapshot.tnoteRead ?? Object.freeze({ status: "ready", error: null }),
		runtime: Object.freeze({
			turnId       : snapshot.executionRun?.turnId ?? snapshot.activeTurnId ?? null,
			primaryModel : activeRun ? snapshot.activeModel ?? runModel : runModel,
			effort       : activeRun ? snapshot.effort ?? runEffort : runEffort,
			durationMs,
			// Session usage is cumulative and cannot truthfully be assigned to one completed request.
			totalTokens  : null,
			files        : snapshot.executionRun?.receipt?.changed ?? [],
			receipt      : snapshot.executionRun?.receipt
				? { id: snapshot.executionRun.receipt.receiptId, digest: snapshot.executionRun.receipt.receiptDigest, status: snapshot.executionRun.receipt.status }
				: null,
			verification : snapshot.executionRun?.receipt?.verification ?? [],
		}),
		...(snapshot.tnoteVisibleLimit === undefined ? {} : { visibleLimit: snapshot.tnoteVisibleLimit }),
		...(snapshot.tnoteSummaryMaxChars === undefined ? {} : { summaryMaxChars: snapshot.tnoteSummaryMaxChars }),
		...(snapshot.tnoteSummaryMaxLines === undefined ? {} : { summaryMaxLines: snapshot.tnoteSummaryMaxLines }),
	});
}

function lastObservedString(activities: readonly ProjectActivity[], key: string): string | null {
	for (let index = activities.length - 1; index >= 0; index -= 1) {
		const value = activities[index]?.payload[key];
		if (typeof value === "string" && value.trim()) return value;
	}
	return null;
}

import type { NativeApprovalRequest, NativeApprovalResponse, NativeRefs } from "./native-session.js";
import type { Effort } from "./model-settings.js";
import type { ProjectActivity } from "./project-activity.js";
import type { TodoDocument } from "./todos.js";
import type { ReviewProvider } from "./review.js";
import type { WorkFlowProjection } from "./work-steps.js";

export type WorkbenchPhase = "loading" | "ready" | "working" | "error" | "closed";
export type WorkbenchPermissionMode = "manual" | "all";
export type WorkbenchCollaborationMode = "manual" | "plan";

export interface WorkbenchChatMessage {
	id: string;
	role: "user" | "assistant" | "system";
	content: string;
	activityId: string;
	status: "streaming" | "completed" | "failed" | "cancelled";
}

export interface WorkbenchChatQueueItem {
	readonly id: string;
	readonly content: string;
	readonly queuedAt: string;
}

export interface WorkbenchTNote {
	id: string;
	title: string;
	summary: string;
	sourceActivityIds: readonly string[];
	updatedAt: string;
}

export interface WorkbenchLiveActivity {
	method: string;
	kind: "tool" | "progress" | "file-change" | "approval";
	text: string;
	nativeRefs: NativeRefs;
}

export interface WorkbenchContextUsage {
	readonly usedTokens: number;
	readonly contextWindow: number;
	readonly percent: number;
}

export interface WorkbenchModelUsage {
	readonly model: string;
	readonly effort: string | null;
	readonly turns: number;
	readonly totalTokens: number;
}

/** Tokens observed after this WWW process attached; this is not subscription quota. */
export interface WorkbenchSessionUsage {
	readonly totalTokens: number;
	readonly unattributedTokens: number;
	readonly models: readonly WorkbenchModelUsage[];
}

export interface WorkbenchSessionGoal {
	readonly text: string;
	readonly sourceActivityId: string;
	readonly updatedAt: string;
}

export interface WorkbenchWooEntrySnapshot {
	readonly state: "loading" | "ready" | "blocked";
	readonly revision: number;
	readonly collectedAt: string | null;
}

export interface WorkbenchModelSelection {
	readonly model: string;
	readonly effort: Effort;
}

export interface WorkbenchActionResult {
	readonly kind: "todo" | "tnote" | "promotion" | "review";
	readonly title: string;
	readonly body: string;
	readonly digest?: string;
	readonly createdAt: string;
}

export interface WorkbenchSnapshot {
	projectId: string;
	/** Monotonic for every in-process UI projection change, including deltas. */
	revision: number;
	/** Last durable ProjectActivity sequence; deltas never advance it. */
	journalSequence: number;
	phase: WorkbenchPhase;
	/** Effective Native thread settings and latest context telemetry. */
	model?: string;
	effort?: string | null;
	contextUsage?: WorkbenchContextUsage | null;
	sessionUsage?: WorkbenchSessionUsage;
	sessionGoal?: WorkbenchSessionGoal | null;
	permissionMode?: WorkbenchPermissionMode;
	collaborationMode?: WorkbenchCollaborationMode;
	wooEntry?: WorkbenchWooEntrySnapshot | null;
	threadId: string | null;
	activeTurnId: string | null;
	/** Total durable activities in the current Native session. */
	activityCount?: number;
	activities: readonly ProjectActivity[];
	selectedActivityId: string | null;
	pendingApproval: NativeApprovalRequest | null;
	chat: readonly WorkbenchChatMessage[];
	chatQueue: readonly WorkbenchChatQueueItem[];
	draft: string;
	reasoningDraft: string;
	/** Public App Server reasoning summary; raw reasoningDraft is never rendered. */
	reasoningSummaryDraft?: string;
	liveActivity: WorkbenchLiveActivity | null;
	/** Derived live execution brief; Native activities and plan status remain authoritative. */
	workFlow: WorkFlowProjection;
	tnotes: readonly WorkbenchTNote[];
	todo: TodoDocument | null;
	actionResult: WorkbenchActionResult | null;
	error: string | null;
}

export type WorkbenchCommand =
	| { type: "chat.send"; text: string }
	| { type: "chat.cancel" }
	| { type: "approval.resolve"; requestId: string | number; response: NativeApprovalResponse }
	| { type: "activity.select"; activityId: string | null }
	| { type: "session.permission"; mode: WorkbenchPermissionMode }
	| { type: "session.mode"; mode: WorkbenchCollaborationMode }
	| { type: "session.model"; selection: WorkbenchModelSelection }
	| { type: "woo-entry.refresh" }
	| { type: "tnote.capture-session" }
	| { type: "tnote.capture"; activityIds: readonly string[]; title?: string }
	| { type: "tnote.capture-range"; startSequence: number; endSequence: number; title?: string }
	| { type: "todo.create"; title: string; items: readonly string[]; storyId?: string }
	| { type: "todo.add"; placement: "now" | "after"; content: string }
	| { type: "todo.details"; itemId: string; details: readonly string[] }
	| { type: "todo.transition"; action: "start" | "complete" | "block" | "reopen"; itemId: string }
	| { type: "todo.evidence"; activityId: string }
	| { type: "todo.import-legacy" }
	| { type: "promotion.accept"; noteId: string; acceptedBy: string }
	| { type: "promotion.confirm"; token: string }
	| { type: "review.preview"; provider: ReviewProvider; noteId: string; request: string; confirmedPublic: true }
	| { type: "review.send"; digest: string };

export type WorkbenchCommandReceipt =
	| { state: "accepted"; commandId: string; activitySequence?: number; message?: string }
	| { state: "queued"; commandId: string; position: number }
	| { state: "rejected"; commandId: string; reason: string }
	| { state: "uncertain"; commandId: string; reason: string; resolution: "manual-reconcile" };

export type WorkbenchListener = (snapshot: WorkbenchSnapshot) => void;

export type WorkbenchApprovalDecision = "accept" | "acceptForSession" | "decline" | "cancel";

/** Preserves adapter-advertised choices; legacy requests get the safe v0.1 set. */
export function workbenchApprovalDecisions(request: NativeApprovalRequest): readonly WorkbenchApprovalDecision[] {
	const direct = (request as NativeApprovalRequest & { availableDecisions?: unknown }).availableDecisions;
	const nested = request.params.availableDecisions;
	const value = Array.isArray(direct) ? direct : Array.isArray(nested) ? nested : null;
	if (!value) return request.kind === "permissions" ? ["decline"] : ["accept", "acceptForSession", "decline"];
	return value.filter((decision): decision is WorkbenchApprovalDecision =>
		decision === "accept" || decision === "acceptForSession" || decision === "decline" || decision === "cancel");
}

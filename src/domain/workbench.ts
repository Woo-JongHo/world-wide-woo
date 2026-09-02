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

/** MCP configuration state reported by the native App Server, separate from tool activity. */
export interface WorkbenchMcpServer {
	readonly name: string;
	readonly enabled: boolean;
	readonly status: string;
	readonly tools: readonly string[];
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
	/** Model the in-flight turn actually runs on; falls back to the selected model when idle. */
	activeModel?: string;
	effort?: string | null;
	contextUsage?: WorkbenchContextUsage | null;
	sessionUsage?: WorkbenchSessionUsage;
	sessionGoal?: WorkbenchSessionGoal | null;
	permissionMode?: WorkbenchPermissionMode;
	collaborationMode?: WorkbenchCollaborationMode;
	mcpServers: readonly WorkbenchMcpServer[];
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
	/** True only while a chat send is unconfirmed and `/cancel` can still reconcile it. */
	deliveryUncertain?: boolean;
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
	| { type: "mcp.refresh" }
	| { type: "mcp.enable"; name: string }
	| { type: "mcp.disable"; name: string }
	| { type: "mcp.reload" }
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

export type WorkbenchExternalMutationKind = "commit" | "push" | "issue";

/**
 * A complete, immutable description of a pending external mutation. The identity is
 * derived from every displayed and executable field, so a decision cannot be reused
 * after any part of the candidate changes.
 */
export interface WorkbenchExternalMutationCandidate {
	readonly identity: string;
	readonly kind: WorkbenchExternalMutationKind;
	readonly target: string;
	readonly content: string;
	readonly currentState: string;
	readonly scope: string;
	readonly status: string;
	readonly payload: Readonly<Record<string, unknown>>;
}

export function workbenchExternalMutationCandidates(request: NativeApprovalRequest): readonly WorkbenchExternalMutationCandidate[] {
	const raw = request.params.externalMutationCandidates;
	if (!Array.isArray(raw)) return [];
	return Object.freeze(raw.flatMap((value, index) => {
		if (!value || typeof value !== "object" || Array.isArray(value)) return [];
		const candidate = value as Readonly<Record<string, unknown>>;
		const kind = candidate.kind;
		const target = candidate.target;
		const content = candidate.content;
		const currentState = candidate.currentState;
		const scope = candidate.scope;
		const status = candidate.status;
		const payload = candidate.payload;
		if ((kind !== "commit" && kind !== "push" && kind !== "issue")
			|| typeof target !== "string" || typeof content !== "string" || typeof currentState !== "string"
			|| typeof scope !== "string" || typeof status !== "string"
			|| !payload || typeof payload !== "object" || Array.isArray(payload)) return [];
		const exactPayload = immutableMutationPayload(payload as Record<string, unknown>);
		const identity = mutationIdentity({ kind, target, content, currentState, scope, status, payload: exactPayload });
		return [Object.freeze({ identity: typeof candidate.identity === "string" && candidate.identity === identity ? candidate.identity : identity, kind, target, content, currentState, scope, status, payload: exactPayload })];
	}));
}

/** Identity of the complete approval payload, including each mutation candidate. */
export function workbenchApprovalIdentity(request: NativeApprovalRequest): string {
	return mutationIdentity({
		requestId: request.requestId,
		callbackId: request.callbackId,
		kind: request.kind,
		params: request.params,
		candidates: workbenchExternalMutationCandidates(request).map(candidate => candidate.identity),
	});
}

function mutationIdentity(value: unknown): string {
	const text = JSON.stringify(canonicalMutationValue(value));
	let hash = 0x811c9dc5;
	for (const character of text) {
		hash ^= character.charCodeAt(0);
		hash = Math.imul(hash, 0x01000193);
	}
	return `mutation:${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function canonicalMutationValue(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(canonicalMutationValue);
	if (!value || typeof value !== "object") return value;
	return Object.fromEntries(Object.keys(value as Record<string, unknown>).sort().map(key =>
		[key, canonicalMutationValue((value as Record<string, unknown>)[key])],
	));
}

function immutableMutationPayload(value: Readonly<Record<string, unknown>>): Readonly<Record<string, unknown>> {
	return Object.freeze(Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, immutableMutationValue(entry)])));
}

function immutableMutationValue(value: unknown): unknown {
	if (Array.isArray(value)) return Object.freeze(value.map(immutableMutationValue));
	if (value && typeof value === "object") return immutableMutationPayload(value as Record<string, unknown>);
	return value;
}

/** Preserves adapter-advertised choices; legacy requests get the safe v0.1 set. */
export function workbenchApprovalDecisions(request: NativeApprovalRequest): readonly WorkbenchApprovalDecision[] {
	const direct = (request as NativeApprovalRequest & { availableDecisions?: unknown }).availableDecisions;
	const nested = request.params.availableDecisions;
	const value = Array.isArray(direct) ? direct : Array.isArray(nested) ? nested : null;
	if (!value) return request.kind === "permissions" ? ["decline"] : ["accept", "acceptForSession", "decline"];
	return value.filter((decision): decision is WorkbenchApprovalDecision =>
		decision === "accept" || decision === "acceptForSession" || decision === "decline" || decision === "cancel");
}

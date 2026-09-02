export type NativeRequestId = string | number;

/**
 * Conservative summary of App Server collaboration work. `none` is emitted
 * only after every announced child has a terminal lifecycle state.
 */
export type BackgroundWorkState = "none" | "active" | "unknown";

export interface NativeCollaborationLifecycle {
	readonly id?: unknown;
	readonly tool?: unknown;
	readonly status?: unknown;
	readonly receiverThreadIds?: unknown;
	readonly agentsStates?: unknown;
}

/**
 * Derives background work strictly from authoritative collaboration lifecycle
 * snapshots. Missing or malformed snapshots remain unknown; they are never
 * treated as proof that no work exists.
 */
export function projectBackgroundWorkState(
	lifecycles: readonly NativeCollaborationLifecycle[],
): BackgroundWorkState {
	const children = new Set<string>();
	const states = new Map<string, string>();
	let sawLifecycle = false;
	const latest = new Map<string, NativeCollaborationLifecycle>();
	for (const [index, lifecycle] of lifecycles.entries()) {
		const id = typeof lifecycle.id === "string" && lifecycle.id.trim() ? lifecycle.id : `anonymous:${index}`;
		latest.set(id, lifecycle);
	}
	for (const lifecycle of latest.values()) {
		if (normalizeNativeLifecycleName(lifecycle.tool) !== "spawnagent") continue;
		sawLifecycle = true;
		for (const child of nativeLifecycleIds(lifecycle.receiverThreadIds)) children.add(child);
		const status = normalizeNativeLifecycleName(lifecycle.status);
		if (status === "inprogress" || status === "pending" || status === "queued" || !terminalLifecycleStatus(status)) {
			return "active";
		}
		const snapshot = nativeLifecycleRecord(lifecycle.agentsStates);
		for (const [child, value] of Object.entries(snapshot ?? {})) {
			const childStatus = normalizeNativeLifecycleName(nativeLifecycleRecord(value)?.status);
			if (childStatus) states.set(child, childStatus);
		}
	}
	if (!sawLifecycle) return "unknown";
	for (const child of children) {
		const status = states.get(child);
		if (!status) return "unknown";
		if (!terminalLifecycleStatus(status)) return "active";
	}
	return "none";
}

function nativeLifecycleRecord(value: unknown): Readonly<Record<string, unknown>> | null {
	return value && typeof value === "object" && !Array.isArray(value)
		? value as Readonly<Record<string, unknown>>
		: null;
}

function nativeLifecycleIds(value: unknown): readonly string[] {
	return Array.isArray(value)
		? value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
		: [];
}

function normalizeNativeLifecycleName(value: unknown): string {
	return typeof value === "string" ? value.replace(/[^a-z]/giu, "").toLowerCase() : "";
}

function terminalLifecycleStatus(status: string): boolean {
	return status === "completed" || status === "failed" || status === "errored"
		|| status === "interrupted" || status === "cancelled" || status === "shutdown"
		|| status === "notfound";
}

export interface NativeRefs {
	threadId?: string;
	turnId?: string;
	itemId?: string;
	approvalRequestId?: NativeRequestId;
	approvalCallbackId?: string | null;
	/** @deprecated JSON-RPC approval request id; use approvalRequestId. */
	approvalId?: NativeRequestId;
}

export type NativeApprovalPolicy =
	| "untrusted"
	| "on-request"
	| "never"
	| {
		granular: {
			sandbox_approval: boolean;
			rules: boolean;
			skill_approval: boolean;
			request_permissions: boolean;
			mcp_elicitations: boolean;
		};
	};

export type NativeSandboxMode = "read-only" | "workspace-write" | "danger-full-access";

export type NativeSandboxPolicy =
	| { readonly type: "dangerFullAccess" }
	| {
		readonly type: "workspaceWrite";
		readonly writableRoots: readonly string[];
		readonly networkAccess: boolean;
		readonly excludeTmpdirEnvVar: boolean;
		readonly excludeSlashTmp: boolean;
	};

export interface NativeCollaborationMode {
	readonly mode: "plan" | "default";
	readonly settings: {
		readonly model: string;
		readonly reasoning_effort: string | null;
		readonly developer_instructions: null;
	};
}

export type NativeAdditionalContextKind = "application" | "untrusted";

export interface NativeAdditionalContextEntry {
	readonly value: string;
	readonly kind: NativeAdditionalContextKind;
}

export type NativeAdditionalContext = Readonly<Record<string, NativeAdditionalContextEntry>>;

export interface NativeThreadSnapshot {
	id: string;
	value: Readonly<Record<string, unknown>>;
	/** Effective values confirmed by thread/start or thread/resume. */
	model?: string;
	effort?: string | null;
}

export interface NativeTurnSnapshot {
	id: string;
	threadId: string;
	value: Readonly<Record<string, unknown>>;
}

export interface NativeThreadStart {
	cwd: string;
	model?: string;
	effort?: string;
	approvalPolicy?: NativeApprovalPolicy;
	sandbox?: NativeSandboxMode;
	ephemeral?: boolean;
}

export interface NativeThreadResume {
	threadId: string;
	cwd?: string;
	model?: string;
	effort?: string;
	approvalPolicy?: NativeApprovalPolicy;
	sandbox?: NativeSandboxMode;
	excludeTurns?: boolean;
}

export interface NativeThreadRead {
	threadId: string;
	includeTurns?: boolean;
}

export interface NativeThreadList {
	cwd: string;
	limit?: number;
}

export type NativeThreadStatus = "notLoaded" | "idle" | "systemError" | "active";

export interface NativeThreadSummary {
	id: string;
	/** Unix timestamp in seconds, as owned by Codex App Server. */
	updatedAt: number;
	cwd: string;
	preview: string;
	status: NativeThreadStatus;
}

export interface NativeTurnStart {
	threadId: string;
	text: string;
	cwd?: string;
	model?: string;
	effort?: string;
	approvalPolicy?: NativeApprovalPolicy;
	sandboxPolicy?: NativeSandboxPolicy;
	collaborationMode?: NativeCollaborationMode;
	additionalContext?: NativeAdditionalContext;
}

export interface NativeTurnInterrupt {
	threadId: string;
	turnId: string;
}

export type NativeApprovalKind = "command" | "file-change" | "permissions";
export type NativeApprovalDecision = "accept" | "acceptForSession" | "decline" | "cancel" | Readonly<Record<string, unknown>>;

export interface NativeApprovalRequest {
	requestId: NativeRequestId;
	/** @deprecated JSON-RPC request id alias retained for existing consumers. */
	id?: NativeRequestId;
	callbackId: string | null;
	kind: NativeApprovalKind;
	refs: NativeRefs;
	availableDecisions: readonly NativeApprovalDecision[];
	params: Readonly<Record<string, unknown>>;
}

export type NativeApprovalResponse =
	| { decision: "accept" | "acceptForSession" | "decline" | "cancel" }
	| {
		permissions: Readonly<Record<string, unknown>>;
		scope: "turn" | "session";
		strictAutoReview?: boolean;
	};

export type NativeApprovalResolution =
	| { requestId: NativeRequestId; approvalId?: NativeRequestId; response: NativeApprovalResponse }
	| { requestId?: NativeRequestId; approvalId: NativeRequestId; response: NativeApprovalResponse };

export type NativeHarnessEvent =
	| { type: "notification"; method: string; refs: NativeRefs; params: Readonly<Record<string, unknown>> }
	| { type: "approval-requested"; approval: NativeApprovalRequest }
	| { type: "approval-resolved"; requestId: NativeRequestId; approvalId: NativeRequestId; refs: NativeRefs };

export interface NativeUncertainOperation {
	state: "uncertain";
	resolution: "manual-reconcile";
	method: string;
	requestId: NativeRequestId;
}

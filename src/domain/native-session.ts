export type NativeRequestId = string | number;

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

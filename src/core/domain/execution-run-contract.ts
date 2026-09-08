import type { ProjectActivity } from "./project-activity.js";

export type ExecutionRunId = string;
export type RuntimeEventKind = "activity" | "request" | "plan" | "task" | "tool" | "verification" | "terminal" | "interrupt" | "receipt";
export type RuntimeEventDurability = "durable" | "ephemeral";
export type ExecutionRunPhase = "requested" | "understanding" | "planning" | "executing" | "verifying" | "completing" | "waiting" | "blocked" | "reconciling" | "completed" | "failed" | "interrupted" | "unknown";
export type CompletionReceiptStatus = "completed" | "cancelled" | "interrupted" | "failed";
export type WaitReason = "approval" | "gap" | "ambiguous_task" | "unknown";

export interface ExecutionHash {
	sha256Hex(input: Uint8Array): string;
}

export interface RuntimeEvent {
	readonly kind: RuntimeEventKind;
	readonly durability: RuntimeEventDurability;
	readonly runId: ExecutionRunId;
	readonly threadId: string;
	readonly turnId: string;
	readonly activity?: ProjectActivity;
	readonly id: string;
	readonly sequence?: number;
	readonly runSequence?: number;
	readonly sourceDigest?: string;
	readonly payload?: Readonly<Record<string, unknown>>;
}

export interface ExecutionEvidence {
	readonly activityId: string;
	readonly sequence: number;
	readonly sourceDigest: string;
	readonly kind: "change" | "tool" | "verification" | "terminal" | "message";
	readonly status: "passed" | "failed" | "interrupted" | "observed";
	readonly summary: string;
}

export interface ExecutionTask {
	readonly id: string;
	readonly title: string;
	readonly status: "pending" | "running" | "completed" | "failed" | "cancelled";
	readonly activityIds: readonly string[];
}

export interface ExecutionActivity {
	readonly id: string;
	readonly sequence: number;
	readonly method: string;
	readonly text: string;
	readonly kind: "tool" | "progress" | "file-change" | "approval";
}

export interface CompletionReceipt {
	readonly receiptId: string;
	readonly receiptDigest: string;
	readonly checkpointDigest: string;
	readonly runId: ExecutionRunId;
	readonly threadId: string;
	readonly turnId: string;
	readonly status: CompletionReceiptStatus;
	readonly objective: string;
	readonly changed: readonly CompletionChange[];
	readonly verification: readonly CompletionVerification[];
	readonly evidenceRefs: readonly ExecutionEvidence[];
	readonly remaining: readonly CompletionRemaining[];
	readonly completedAt: string;
	readonly terminalSource: { readonly id: string; readonly sequence: number; readonly sourceDigest: string };
}

export interface CompletionChange {
	readonly kind: string;
	readonly ref: string;
	readonly summary: string;
}

export interface CompletionVerification {
	readonly command: string;
	readonly status: "passed" | "failed" | "skipped" | "unknown";
	readonly result: string;
	readonly evidenceRefs: readonly string[];
}

export interface CompletionRemaining {
	readonly summary: string;
	readonly blocking: boolean;
}

export interface ExecutionCheckpoint {
	readonly runId: ExecutionRunId;
	readonly sequence: number;
	readonly digest: string;
}

export interface ExecutionRunState {
	readonly runId: ExecutionRunId;
	readonly threadId: string;
	readonly turnId: string;
	readonly phase: ExecutionRunPhase;
	readonly waitReason: WaitReason | null;
	readonly objective: string;
	readonly tasks: readonly ExecutionTask[];
	readonly activeActivity: ExecutionActivity | null;
	readonly evidence: readonly ExecutionEvidence[];
	readonly activities: readonly ProjectActivity[];
	readonly lastSequence: number | null;
	readonly lastRunSequence?: number | null;
	readonly checkpoint: ExecutionCheckpoint;
	readonly receipt: CompletionReceipt | null;
	readonly rejectedEventIds: readonly string[];
}

export interface ExecutionRunReduction {
	readonly state: ExecutionRunState;
	readonly accepted: boolean;
	readonly reason: "applied" | "duplicate" | "late" | "foreign" | "gap" | "invalid";
}


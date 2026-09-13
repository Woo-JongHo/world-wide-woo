import type { RequestStageId } from "../../domain/execution/request-runtime";

export interface RequestActionIntent {
	readonly requestId: string;
	readonly operationId: string;
	readonly stage: RequestStageId;
	readonly capability: string;
	readonly arguments: Readonly<Record<string, unknown>>;
	readonly expectedRevision: number;
}

/** Host-only grant, never accepted from Native tool arguments. */
export interface RequestActionGrant { readonly intent: RequestActionIntent }
export interface RequestActionApproval {
	readonly id: string;
	readonly intent: RequestActionIntent;
	readonly attempt: number;
	readonly expiresAt: number;
	readonly summary: string;
	readonly detail: string;
}

/** Concrete capabilities define their own immutable scope, validation and actual effect. */
export interface RequestActionCapability {
	readonly id: string;
	readonly effect: "read" | "workspace-change" | "verify" | "publish";
	readonly description?: string;
	readonly inputSchema?: Readonly<Record<string, unknown>>;
	/** No side effects. Includes exact target/argument/revision-bound authorization for writes. */
	authorize(intent: RequestActionIntent): Promise<boolean>;
	/** Only explicitly grantable scope may expose a preview. Null means hard denial. */
	approvalPreview?(intent: RequestActionIntent): Promise<{ summary: string; detail: string } | null>;
	/** Safe, durable read-back locator. No credentials or raw replacement content. No effects. */
	reconciliation?: {
		prepare(intent: RequestActionIntent): Readonly<Record<string, unknown>>;
		/** Read-only. Confirms the desired state now, not historical causality. Never retries a mutation. */
		readBack(descriptor: Readonly<Record<string, unknown>>, signal: AbortSignal): Promise<{
			confirmed: boolean;
			summary: string;
			source: Readonly<Record<string, unknown>>;
			delivery?: { readonly target: string; readonly artifact: string };
		}>;
	};
	execute(intent: RequestActionIntent, signal: AbortSignal, grant?: RequestActionGrant): Promise<{
		readonly summary: string;
		readonly source: Readonly<Record<string, unknown>>;
		readonly outcome: "passed" | "failed";
		/** Required on successful publish, attested by the Adapter's read-back. */
		readonly delivery?: { readonly target: string; readonly artifact: string };
	}>;
}

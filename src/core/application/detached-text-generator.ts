import type { TNoteModelProvenance, TNotePacket } from "../domain/t-notes.js";

/** Required isolation contract for a detached summary request. */
export interface DetachedGenerationPolicy {
	/** The adapter creates an empty temporary cwd; callers can never supply a project path. */
	readonly cwd: "";
	readonly noTools: true;
	readonly network: false;
	readonly readOnly: true;
	readonly ephemeral: true;
}

export interface DetachedTextGenerationRequest {
	readonly packet: TNotePacket;
	readonly instruction: string;
	readonly policy: DetachedGenerationPolicy;
}

/**
 * A provider adapter for summaries that cannot see or mutate the active chat.
 * The adapter returns instrumented isolation observations; callers reject a
 * missing or weakened observation instead of treating the adapter as trusted.
 */
export interface DetachedTextGenerator {
	generate(request: DetachedTextGenerationRequest, signal?: AbortSignal): Promise<{
		readonly text: string;
		readonly provenance: TNoteModelProvenance;
		/** Instrumented adapter observation, not an unverified echo of the request. */
		readonly isolation: {
			readonly appliedPolicy: DetachedGenerationPolicy;
			readonly projectRootVisible: false;
			readonly toolCalls: 0;
			readonly networkCalls: 0;
			readonly filesystemWrites: 0;
		};
	}>;
}

export function assertDetachedPolicy(required: DetachedGenerationPolicy, isolation: Awaited<ReturnType<DetachedTextGenerator["generate"]>>["isolation"] | undefined): void {
	const applied = isolation?.appliedPolicy;
	if (!applied || applied.cwd !== required.cwd || applied.noTools !== true || applied.network !== false || applied.readOnly !== true || applied.ephemeral !== true
		|| isolation.projectRootVisible !== false || isolation.toolCalls !== 0 || isolation.networkCalls !== 0 || isolation.filesystemWrites !== 0) {
		throw new Error("Detached generator did not confirm the required isolation policy");
	}
}

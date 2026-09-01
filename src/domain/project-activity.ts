export const PROJECT_ACTIVITY_KINDS = ["message", "tool", "approval", "progress", "file-change"] as const;
export const PROJECT_ACTIVITY_PHASES = ["started", "updated", "completed", "failed", "cancelled"] as const;

export type ProjectActivityKind = (typeof PROJECT_ACTIVITY_KINDS)[number];
export type ProjectActivityPhase = (typeof PROJECT_ACTIVITY_PHASES)[number];

export interface ProjectActivityNativeRefs {
	threadId?: string;
	turnId?: string;
	itemId?: string;
	approvalRequestId?: string | number;
	approvalCallbackId?: string | null;
	/** @deprecated JSON-RPC approval request id; use approvalRequestId. */
	approvalId?: string | number;
}

/**
 * A ProjectActivity is a derived, replayable observation for the www UI. It is
 * deliberately not a replacement source of truth for the provider's raw native
 * session and must not be used to reconstruct provider state.
 */
export interface ProjectActivity {
	schemaVersion: 1;
	id: string;
	projectId: string;
	sequence: number;
	recordedAt: string;
	kind: ProjectActivityKind;
	phase: ProjectActivityPhase;
	provider: string;
	nativeRefs: ProjectActivityNativeRefs;
	sourceDigest: string;
	payload: Readonly<Record<string, unknown>>;
}

export type ProjectActivityInput = Omit<ProjectActivity, "schemaVersion" | "id" | "sequence" | "recordedAt">;

export interface ProjectActivityAppendResult {
	activity: ProjectActivity;
	appended: boolean;
}

const MAX_REASONING_ENVELOPE_DEPTH = 8;
const MAX_REASONING_ENVELOPE_NODES = 512;
const MAX_REASONING_ENVELOPE_ENTRIES = 64;

export function isTerminalActivityPhase(phase: ProjectActivityPhase): boolean {
	return phase === "completed" || phase === "failed" || phase === "cancelled";
}

/** Recognizes provider reasoning envelopes whose content must stay outside public projections. */
export function isReasoningActivityPayload(value: unknown): boolean {
	const seen = new Set<object>();
	let remainingNodes = MAX_REASONING_ENVELOPE_NODES;
	return containsReasoningEnvelope(value, 0, seen, () => remainingNodes-- > 0);
}

function containsReasoningEnvelope(
	value: unknown,
	depth: number,
	seen: Set<object>,
	consumeNode: () => boolean,
): boolean {
	if (depth > MAX_REASONING_ENVELOPE_DEPTH || !value || typeof value !== "object") return false;
	if (seen.has(value)) return false;
	seen.add(value);
	if (!consumeNode()) return false;
	if (Array.isArray(value)) {
		for (let index = 0; index < Math.min(value.length, MAX_REASONING_ENVELOPE_ENTRIES); index += 1) {
			if (containsReasoningEnvelope(value[index], depth + 1, seen, consumeNode)) return true;
		}
		return false;
	}

	const record = value as Readonly<Record<string, unknown>>;
	for (const key of ["method", "type", "classification"]) {
		const candidate = record[key];
		if (typeof candidate === "string" && /reasoning|thought|analysis/iu.test(candidate)) return true;
	}
	let entries = 0;
	for (const key in record) {
		if (!Object.prototype.hasOwnProperty.call(record, key)) continue;
		if (entries >= MAX_REASONING_ENVELOPE_ENTRIES) break;
		entries += 1;
		if (containsReasoningEnvelope(record[key], depth + 1, seen, consumeNode)) return true;
	}
	return false;
}

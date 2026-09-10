import type {
	NativeApprovalRequest,
	NativeApprovalResolution,
	NativeApprovalResponse,
	NativeRefs,
} from "../../domain/execution/native-session.js";
import type { ProjectActivityPhase } from "../../domain/execution/project-activity.js";

export type ApprovalResponseMethod =
	| "governance/decision-prepared"
	| "governance/decision-dispatched"
	| "governance/decision-uncertain";

export type ApprovalResponseOperation =
	| "approval/response-prepared"
	| "approval/response-delivered"
	| "approval/response-uncertain";

export interface ApprovalEvidenceProjection {
	readonly value: unknown;
	readonly omitted: boolean;
}

export interface ApprovalResponseObservation {
	readonly kind: "progress";
	readonly phase: ProjectActivityPhase;
	readonly nativeRefs: NativeRefs;
	readonly sourceDigest: string;
	readonly payload: Readonly<Record<string, unknown>>;
}

export interface ApprovalDispatchDependencies {
	/** Produces a bounded, sanitized journal projection. It must not mutate its input. */
	readonly serializeEvidence: (value: unknown) => ApprovalEvidenceProjection;
	/** Digests the complete canonical source, before evidence bounding or redaction. */
	readonly digestSource: (source: string) => string;
	readonly record: (observation: ApprovalResponseObservation) => Promise<void>;
	readonly respondToApproval: (resolution: NativeApprovalResolution) => Promise<void>;
}

export type ApprovalDispatchResult =
	| { readonly state: "delivered"; readonly responseDigest: string }
	| { readonly state: "uncertain"; readonly responseDigest: string; readonly reason: string };

export class ApprovalDeliveryUncertainError extends Error {
	public readonly result: Extract<ApprovalDispatchResult, { state: "uncertain" }>;

	public constructor(result: Extract<ApprovalDispatchResult, { state: "uncertain" }>, cause?: unknown) {
		super(`Native 승인 응답 전달 결과를 확정할 수 없습니다: ${result.reason}`, { cause });
		this.name = "ApprovalDeliveryUncertainError";
		this.result = result;
	}
}

export class ApprovalResponseDispatcher {
	private readonly interlocked = new Set<string>();
	private readonly scopes = new Map<string, string>();

	public constructor(private readonly dependencies: ApprovalDispatchDependencies) {}

	public async dispatch(input: {
		readonly commandId: string;
		readonly request: NativeApprovalRequest;
		readonly response: NativeApprovalResponse;
	}): Promise<ApprovalDispatchResult> {
		const key = requestIdentity(input.request);
		if (this.interlocked.has(key)) {
			throw new ApprovalDeliveryUncertainError({
				state: "uncertain",
				responseDigest: this.dependencies.digestSource(canonicalJson(input.response)),
				reason: "이 승인 요청에는 이미 전달 시도가 있어 Native resolved 확인 전 재전송할 수 없습니다.",
			});
		}
		this.interlocked.add(key);
		this.scopes.set(key, requestScope(input.request.refs, input.request.requestId));
		try {
			const result = await dispatchApprovalResponse(input, this.dependencies);
			return result;
		} catch (error) {
			// Only a failure before the write-ahead record/send boundary is retryable.
			if (!(error instanceof ApprovalDeliveryUncertainError)) {
				this.interlocked.delete(key);
				this.scopes.delete(key);
			}
			throw error;
		}
	}

	/** Conservatively restores prepared/sent interlocks from durable journal observations. */
	public restoreInterlocks(observations: readonly Readonly<{
		readonly nativeRefs: NativeRefs;
		readonly payload: Readonly<Record<string, unknown>>;
	}>[]): void {
		const resolvedScopes = new Set<string>();
		for (const observation of observations) {
			const requestId = observation.nativeRefs.approvalRequestId ?? observation.nativeRefs.approvalId;
			if (requestId === undefined) continue;
			if (observation.payload.eventType === "approval-resolved") {
				resolvedScopes.add(requestScope(observation.nativeRefs, requestId));
				continue;
			}
			if (!String(observation.payload.operation ?? "").startsWith("approval/response-")) continue;
			const key = requestIdentityFromRefs(observation.nativeRefs, requestId);
			this.interlocked.add(key);
			this.scopes.set(key, requestScope(observation.nativeRefs, requestId));
		}
		// Native may resolve synchronously before respondToApproval returns, so a
		// dispatched audit can legitimately follow the authoritative resolution.
		for (const scope of resolvedScopes) this.clearScope(scope);
	}

	/** Clears a resend block only after an authoritative Native approval-resolved observation. */
	public confirmNativeResolved(request: NativeApprovalRequest): void {
		this.clearResolvedScope(request.refs, request.requestId);
	}

	private clearResolvedScope(refs: NativeRefs, requestId: string | number): void {
		this.clearScope(requestScope(refs, requestId));
	}

	private clearScope(scope: string): void {
		for (const [key, candidate] of this.scopes) {
			if (candidate !== scope) continue;
			this.interlocked.delete(key);
			this.scopes.delete(key);
		}
	}
}

/**
 * Durably prepares an exact Native approval response before transmitting it.
 * The caller must serialize dispatches; after an uncertain result it must reconcile
 * provider state instead of resending the response.
 */
export async function dispatchApprovalResponse(
	input: {
		readonly commandId: string;
		readonly request: NativeApprovalRequest;
		readonly response: NativeApprovalResponse;
	},
	dependencies: ApprovalDispatchDependencies,
): Promise<ApprovalDispatchResult> {
	const request = immutable(input.request);
	const response = immutable(input.response);
	const requestSource = canonicalJson(request);
	const responseSource = canonicalJson(response);
	const requestDigest = dependencies.digestSource(requestSource);
	const responseDigest = dependencies.digestSource(responseSource);
	const responseEvidence = immutable(dependencies.serializeEvidence(response));
	const refs = immutable({
		...request.refs,
		approvalRequestId: request.requestId,
		approvalCallbackId: request.callbackId,
	});
	const basePayload = immutable({
		commandId: input.commandId,
		requestDigest,
		responseDigest,
		response: responseEvidence.value,
		responseEvidenceOmitted: responseEvidence.omitted,
	});

	// This append is the write-ahead boundary. A failure here deliberately prevents send.
	await dependencies.record(observation("governance/decision-prepared", "approval/response-prepared", "started", refs, basePayload, dependencies.digestSource));

	try {
		// Keep the signed protocol value exact; only the journal evidence is projected.
		await dependencies.respondToApproval({ requestId: request.requestId, response });
	} catch (error) {
		const reason = boundedErrorReason(error, dependencies.serializeEvidence);
		const result = immutable({ state: "uncertain" as const, responseDigest, reason });
		try {
			await dependencies.record(observation("governance/decision-uncertain", "approval/response-uncertain", "failed", refs, {
				...basePayload,
				reason,
				delivery: "uncertain",
			}, dependencies.digestSource));
		} catch (auditError) {
			throw new ApprovalDeliveryUncertainError(
				{ ...result, reason: `${reason}; 불확실 기록 실패: ${boundedErrorReason(auditError, dependencies.serializeEvidence)}` },
				error,
			);
		}
		return result;
	}

	try {
		await dependencies.record(observation("governance/decision-dispatched", "approval/response-delivered", "completed", refs, {
			...basePayload,
			delivery: "delivered",
		}, dependencies.digestSource));
		return immutable({ state: "delivered", responseDigest });
	} catch (error) {
		// Native may already have emitted approval-resolved. Missing delivery audit is still uncertain.
		throw new ApprovalDeliveryUncertainError({
			state: "uncertain",
			responseDigest,
			reason: `전달 후 감사 기록 실패: ${boundedErrorReason(error, dependencies.serializeEvidence)}`,
		}, error);
	}
}

function observation(
	method: ApprovalResponseMethod,
	operation: ApprovalResponseOperation,
	phase: ProjectActivityPhase,
	nativeRefs: NativeRefs,
	payload: Readonly<Record<string, unknown>>,
	digestSource: ApprovalDispatchDependencies["digestSource"],
): ApprovalResponseObservation {
	const unsigned = { kind: "progress" as const, phase, nativeRefs, payload: { method, operation, ...payload } };
	return immutable({ ...unsigned, sourceDigest: digestSource(canonicalJson(unsigned)) });
}

function requestIdentity(request: NativeApprovalRequest): string {
	return requestIdentityFromRefs(request.refs, request.requestId, request.callbackId);
}

function requestIdentityFromRefs(nativeRefs: NativeRefs, requestId: string | number, callbackId = nativeRefs.approvalCallbackId ?? null): string {
	return canonicalJson({ threadId: nativeRefs.threadId ?? null, turnId: nativeRefs.turnId ?? null, requestId, callbackId });
}

function requestScope(nativeRefs: NativeRefs, requestId: string | number): string {
	return canonicalJson({ threadId: nativeRefs.threadId ?? null, turnId: nativeRefs.turnId ?? null, requestId });
}

function boundedErrorReason(error: unknown, serializeEvidence: ApprovalDispatchDependencies["serializeEvidence"]): string {
	const raw = error instanceof Error && error.message.trim()
		? error.message
		: typeof error === "string" && error.trim()
			? error
			: "알 수 없는 Native 승인 응답 오류";
	const projected = serializeEvidence(raw).value;
	if (typeof projected === "string") return projected;
	return canonicalJson(projected);
}

function canonicalJson(value: unknown): string {
	if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
	if (value && typeof value === "object") {
		return `{${Object.entries(value as Record<string, unknown>)
			.sort(([left], [right]) => left.localeCompare(right))
			.map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(",")}}`;
	}
	return JSON.stringify(value) ?? "null";
}

function immutable<T>(value: T): T {
	return deepFreeze(structuredClone(value));
}

function deepFreeze<T>(value: T): T {
	if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
	for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
	return Object.freeze(value);
}

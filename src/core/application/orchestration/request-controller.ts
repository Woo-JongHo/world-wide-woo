import type { ProjectActivity } from "../../domain/execution/project-activity";
import { parseRequestStageReport, REQUEST_REPORT_PREFIX, REQUEST_STAGES, type RequestRuntimeRecord } from "../../domain/execution/request-runtime";
import { projectRequestRuntime } from "../../runtime/request-runtime";
import type { RequestActionApproval, RequestActionCapability, RequestActionGrant, RequestActionIntent } from "../../ports/execution/request-action-port";
import type { RuntimeToolCall, RuntimeToolDefinition, RuntimeToolResult } from "../../ports/execution/runtime-tool-port";

const obj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const identity = (v: unknown): v is string => typeof v === "string" && /^[A-Za-z0-9_-]{1,80}$/u.test(v);
const validDelivery = (v: unknown): v is { target: string; artifact: string } => obj(v) && typeof v.target === "string" && !!v.target.trim() && v.target.length <= 400 && typeof v.artifact === "string" && !!v.artifact.trim() && v.artifact.length <= 4000;
const baseSchema = { type: "object", properties: { requestId: { type: "string" }, expectedRevision: { type: "integer", minimum: 0 } }, required: ["requestId", "expectedRevision"] };
export const REQUEST_RUNTIME_TOOLS: readonly RuntimeToolDefinition[] = [
	{ name: "www_runtime_require_delivery", description: "Register a required external delivery identity. This obligation cannot be removed by skipping or replanning. Registration does not authorize publication.", inputSchema: { ...baseSchema, properties: { ...baseSchema.properties, target: { type: "string" }, artifact: { type: "string" } }, required: [...baseSchema.required, "target", "artifact"], additionalProperties: false } },
	{ name: "www_runtime_replan", description: "Return to a previously started stage with a public reason. Archives the attempt, resets downstream work, and requires fresh execution/verification evidence. Does not roll back real effects.", inputSchema: { ...baseSchema, properties: { ...baseSchema.properties, stage: { type: "string", enum: [...REQUEST_STAGES] }, reason: { type: "string", minLength: 1, maxLength: 4000 } }, required: [...baseSchema.required, "stage", "reason"], additionalProperties: false } },
	{ name: "www_runtime_reconcile", description: "Read back an uncertain action using its recorded target. Never re-executes it. Only a confirmed desired state resolves the blocker.", inputSchema: { ...baseSchema, properties: { ...baseSchema.properties, operationId: { type: "string" } }, required: [...baseSchema.required, "operationId"], additionalProperties: false } },
	{ name: "www_runtime_inspect", description: "Read WWW request stages, current revision, capability IDs and blockers. No private reasoning.", inputSchema: { type: "object", properties: { requestId: { type: "string" } }, required: ["requestId"], additionalProperties: false } },
	{ name: "www_runtime_propose", description: "Propose a public stage result or stage Todo plan; returns accepted or corrective rejection. Never include chain of thought.", inputSchema: { ...baseSchema, properties: { ...baseSchema.properties, report: { type: "object" } }, required: [...baseSchema.required, "report"], additionalProperties: false } },
	{ name: "www_runtime_act", description: "Request an authorized capability action in the current stage. Unknown/unapproved capabilities cannot execute. Reuse operationId only for exactly the same request.", inputSchema: { ...baseSchema, properties: { ...baseSchema.properties, operationId: { type: "string" }, stage: { type: "string", enum: [...REQUEST_STAGES] }, capability: { type: "string" }, arguments: { type: "object" } }, required: [...baseSchema.required, "operationId", "stage", "capability", "arguments"], additionalProperties: false } },
];

export interface RequestControllerDependencies {
	activities(): readonly ProjectActivity[];
	/** Must persist before resolving. Only this application boundary creates trusted control events. */
	append(call: RuntimeToolCall, kind: ProjectActivity["kind"], phase: ProjectActivity["phase"], payload: Record<string, unknown>): Promise<ProjectActivity>;
	canAct(call: RuntimeToolCall): boolean;
	/** Host-only, idle-session read-back authority. Never enables execution. */
	canRecover?(call: RuntimeToolCall): boolean;
	digest(value: string): string;
	capabilities?: readonly RequestActionCapability[];
	/** Out-of-band host interaction; must settle on abort. No Native approval callback. */
	requestApproval?(call: RuntimeToolCall, approval: RequestActionApproval, signal: AbortSignal): Promise<boolean>;
}

/** Serialized control loop, not a model loop. Native retains planning and reasoning. */
export class RequestController {
	private queue: Promise<unknown> = Promise.resolve();
	private abort = new AbortController();
	private revokedTurns = new Set<string>();
	constructor(private readonly deps: RequestControllerDependencies) {
		const ids = deps.capabilities?.map(c => c.id) ?? [];
		if (new Set(ids).size !== ids.length) throw new Error("Duplicate Runtime capability");
	}
	interrupt(threadId?: string, turnId?: string): void { this.abort.abort(); if (threadId && turnId) this.revokedTurns.add(JSON.stringify([threadId, turnId])); }
	async settled(): Promise<void> { await this.queue; }
	/** Not registered as a Native tool. Reconciles only an existing write-ahead receipt. */
	recover(call: RuntimeToolCall): Promise<RuntimeToolResult> {
		call = structuredClone(call);
		if (call.tool !== "www_runtime_reconcile" || !obj(call.arguments)) return Promise.resolve(this.response(call, false, "INVALID_RECONCILIATION"));
		call = { ...call, arguments: { ...call.arguments, expectedRevision: this.revision(call) } };
		return this.enqueue(call, true);
	}
	handle(call: RuntimeToolCall): Promise<RuntimeToolResult> {
		return this.enqueue(call, false);
	}
	private enqueue(call: RuntimeToolCall, hostRecovery: boolean): Promise<RuntimeToolResult> {
		call = structuredClone(call);
		const signal = this.abort.signal;
		if (signal.aborted) this.abort = new AbortController();
		const activeSignal = signal.aborted ? this.abort.signal : signal;
		const result = this.queue.then(() => this.run(call, activeSignal, hostRecovery));
		this.queue = result.catch(() => undefined);
		return result.catch(() => this.response(call, false, "RUNTIME_RECORDING_FAILED"));
	}
	private current(call: RuntimeToolCall): RequestRuntimeRecord | undefined {
		return projectRequestRuntime(this.deps.activities(), call.threadId).find(r => obj(call.arguments) && r.requestId === call.arguments.requestId && r.turnId === call.turnId);
	}
	private revision(call: RuntimeToolCall): number {
		return this.deps.activities().filter(a => a.nativeRefs.threadId === call.threadId && a.nativeRefs.turnId === call.turnId && (String(a.payload.method).startsWith("runtime/") || String(a.payload.method).startsWith("request/") || a.kind === "approval" || String(a.payload.method).startsWith("turn/"))).at(-1)?.sequence ?? 0;
	}
	private response(call: RuntimeToolCall, success: boolean, reason: string, extra = {}): RuntimeToolResult {
		return { success, text: JSON.stringify({ state: success ? "accepted" : "rejected", reason, revision: this.revision(call), ...extra }) };
	}
	private async appendRuntimeTransition(
		call: RuntimeToolCall,
		payload: Readonly<Record<string, unknown>>,
		acceptedReason: string,
	): Promise<RuntimeToolResult> {
		const activity = await this.deps.append(call, "progress", "completed", payload);
		const request = this.current(call)!;
		const rejected = request.events.find(event => event.activityId === activity.id && event.type === "protocol.rejected");
		return this.response(call, !rejected, rejected?.reason ?? acceptedReason, { request });
	}
	private async run(call: RuntimeToolCall, signal: AbortSignal, hostRecovery = false): Promise<RuntimeToolResult> {
		const input = call.arguments;
		if (!obj(input) || typeof input.requestId !== "string" || JSON.stringify(input).length > 32000) return this.response(call, false, "INVALID_INPUT");
		const request = this.current(call);
		if (!request || request.protocolVersion !== 2) return this.response(call, false, "REQUEST_NOT_BOUND");
		if (call.tool === "www_runtime_inspect") return this.response(call, true, "SNAPSHOT", { request, capabilities: (this.deps.capabilities ?? []).map(c => ({ id: c.id, effect: c.effect, description: c.description, inputSchema: c.inputSchema })), enforcement: "brokered-not-isolated" });
		const active = () => hostRecovery ? call.tool === "www_runtime_reconcile" && this.deps.canRecover?.(call) === true : !request.completedAt && this.deps.canAct(call) && !this.revokedTurns.has(JSON.stringify([call.threadId, call.turnId]));
		if (!active() || signal.aborted) return this.response(call, false, "REQUEST_NOT_ACTIVE");
		if (call.tool !== "www_runtime_reconcile") {
			const previous = projectRequestRuntime(this.deps.activities(), call.threadId).find(r => r.requestId !== request.requestId && r.actions.some(a => a.status === "unconfirmed"));
			if (previous) return this.response(call, false, "PREVIOUS_REQUEST_UNCERTAIN", { blockedByRequestId: previous.requestId });
		}
		if (call.tool === "www_runtime_act" && identity(input.operationId)) {
			const prior = this.deps.activities().filter(a => a.payload.requestId === input.requestId && a.nativeRefs.threadId === call.threadId && a.payload.operationId === input.operationId);
			if (prior.length) {
				if (prior[0]!.payload.intentDigest !== this.deps.digest(JSON.stringify(input))) return this.response(call, false, "OPERATION_ID_CONFLICT");
				const completed = prior.find(a => a.payload.method === "runtime/action-completed");
				return this.response(call, !!completed && completed.phase === "completed", completed ? "RECORDED_RESULT" : "ACTION_UNCERTAIN_RECONCILE_REQUIRED", { receipt: completed ?? prior[0] });
			}
		}
		const requestActions = this.deps.activities().filter(a => a.payload.requestId === request.requestId && a.nativeRefs.threadId === call.threadId);
		if (call.tool === "www_runtime_reconcile") {
			if (!identity(input.operationId) || Object.keys(input).some(k => !["requestId", "expectedRevision", "operationId"].includes(k))) return this.response(call, false, "INVALID_RECONCILIATION");
			if (input.expectedRevision !== this.revision(call)) return this.response(call, false, "STALE_REVISION");
			const prepared = requestActions.find(a => a.payload.method === "runtime/action-prepared" && a.payload.authority === "runtime" && a.payload.operationId === input.operationId && a.nativeRefs.turnId === call.turnId);
			if (!prepared) return this.response(call, false, "ACTION_NOT_FOUND");
			const completed = requestActions.find(a => a.payload.method === "runtime/action-completed" && a.payload.preparedActivityId === prepared.id);
			if (completed) return this.response(call, completed.phase === "completed", "RECORDED_RESULT", { receipt: completed });
			const capability = this.deps.capabilities?.find(c => c.id === prepared.payload.capability);
			if (!capability?.reconciliation || !obj(prepared.payload.reconciliation)) return this.response(call, false, "RECONCILIATION_UNAVAILABLE");
			if (prepared.payload.effect !== undefined && prepared.payload.effect !== capability.effect) return this.response(call, false, "CAPABILITY_CHANGED");
			try {
				const result = await capability.reconciliation.readBack(structuredClone(prepared.payload.reconciliation), signal);
				if (result.confirmed && capability.effect === "publish" && !validDelivery(result.delivery)) return this.response(call, false, "DELIVERY_RECEIPT_MISSING");
				if (signal.aborted || !active() || this.revision(call) !== input.expectedRevision) return this.response(call, false, "RECONCILIATION_STALE");
				const receipt = await this.deps.append(call, "tool", result.confirmed ? "completed" : "failed", {
					method: result.confirmed ? "runtime/action-completed" : "runtime/action-reconciliation",
					authority: "runtime", requestId: request.requestId, operationId: input.operationId,
					stage: prepared.payload.stage, capability: capability.id, effect: capability.effect, intentDigest: prepared.payload.intentDigest,
					preparedActivityId: prepared.id, reconciliation: true, ...(hostRecovery ? { hostRecovery: true } : {}), summary: result.summary, source: result.source, ...(capability.effect === "publish" && result.confirmed ? { delivery: result.delivery } : {}),
					params: { item: { exitCode: result.confirmed ? 0 : 1 } },
				});
				return this.response(call, result.confirmed, result.confirmed ? "ACTION_RECONCILED" : "ACTION_STILL_UNCERTAIN", { receipt });
			} catch { return this.response(call, false, "RECONCILIATION_FAILED"); }
		}
		if (requestActions.some(a => a.payload.method === "runtime/action-prepared" && !requestActions.some(done => done.payload.method === "runtime/action-completed" && done.payload.operationId === a.payload.operationId))) return this.response(call, false, "ACTION_UNCERTAIN_RECONCILE_REQUIRED");
		if (!Number.isSafeInteger(input.expectedRevision) || input.expectedRevision !== this.revision(call)) return this.response(call, false, "STALE_REVISION");
		if (call.tool === "www_runtime_require_delivery") {
			if (!validDelivery(input) || input.target === "chat" || Object.keys(input).some(k => !["requestId", "expectedRevision", "target", "artifact"].includes(k))) return this.response(call, false, "INVALID_DELIVERY_REQUIREMENT");
			return this.appendRuntimeTransition(call, { method: "runtime/delivery-required", authority: "runtime", requestId: request.requestId, target: input.target, artifact: input.artifact }, "DELIVERY_REQUIRED");
		}
		if (call.tool === "www_runtime_replan") {
			if (Object.keys(input).some(k => !["requestId", "expectedRevision", "stage", "reason"].includes(k)) || !REQUEST_STAGES.includes(input.stage as never) || typeof input.reason !== "string" || !input.reason.trim() || input.reason.length > 4000) return this.response(call, false, "INVALID_REPLAN");
			return this.appendRuntimeTransition(call, { method: "runtime/replan", authority: "runtime", requestId: request.requestId, stage: input.stage, reason: input.reason }, "REPLAN_ACCEPTED");
		}
		if (call.tool === "www_runtime_propose") {
			const report = parseRequestStageReport(REQUEST_REPORT_PREFIX + JSON.stringify(input.report));
			if (!report || report.requestId !== request.requestId) return this.response(call, false, "INVALID_REPORT");
			return this.appendRuntimeTransition(call, { method: "runtime/stage-report", authority: "runtime", requestId: request.requestId, report }, "STAGE_ACCEPTED");
		}
		if (call.tool !== "www_runtime_act" || Object.keys(input).some(k => !["requestId", "operationId", "stage", "capability", "arguments", "expectedRevision"].includes(k)) || !identity(input.operationId) || typeof input.capability !== "string" || !obj(input.arguments) || !REQUEST_STAGES.includes(input.stage as never)) return this.response(call, false, "INVALID_ACTION");
		const capability = this.deps.capabilities?.find(c => c.id === input.capability);
		if (!capability) return this.response(call, false, "CAPABILITY_UNAVAILABLE");
		const stage = request.stages.find(s => s.id === input.stage);
		if (stage?.status !== "running" || request.status !== "running") return this.response(call, false, "STAGE_NOT_RUNNING");
		if (capability.effect === "workspace-change" && stage.id !== "EXECUTE" || capability.effect === "verify" && stage.id !== "VERIFY" || capability.effect === "publish" && stage.id !== "DELIVER") return this.response(call, false, "STAGE_EFFECT_DENIED");
		const intent = structuredClone(input) as unknown as RequestActionIntent;
		let authorized = false;
		try { authorized = await capability.authorize(intent); } catch { return this.response(call, false, "AUTHORIZATION_FAILED"); }
		let grant: RequestActionGrant | undefined;
		let authorizedRevision = input.expectedRevision;
		if (!authorized && capability.approvalPreview && this.deps.requestApproval) {
			const preview = await capability.approvalPreview(structuredClone(intent));
			if (preview && preview.summary.trim() && preview.summary.length <= 4000 && preview.detail.length <= 32000) {
				if (signal.aborted || !this.deps.canAct(call) || this.revision(call) !== input.expectedRevision) return this.response(call, false, "AUTHORIZATION_STALE");
				const id = `runtime-${call.callId}-${this.revision(call)}`;
				const expiresAt = Date.now() + 5 * 60_000;
				const started = await this.deps.append(call, "approval", "started", { method: "runtime/approval-requested", authority: "runtime", requestId: request.requestId, approval: { requestId: id }, intentDigest: this.deps.digest(JSON.stringify(input)), stage: stage.id, attempt: request.attempt, expiresAt, summary: preview.summary });
				try { authorized = !signal.aborted && await this.deps.requestApproval(call, { id, intent: structuredClone(intent), attempt: request.attempt, expiresAt, ...preview }, signal); } catch { authorized = false; }
				authorized = authorized && !signal.aborted && Date.now() < expiresAt && this.revision(call) === started.sequence;
				const receipt = await this.deps.append(call, "approval", "completed", { method: "runtime/approval-resolved", authority: "runtime", requestId: id, runtimeRequestId: request.requestId, intentDigest: this.deps.digest(JSON.stringify(input)), decision: authorized ? "accept" : "decline", requestedActivityId: started.id });
				authorizedRevision = receipt.sequence;
				if (authorized) grant = { intent: structuredClone(intent) };
			}
		}
		if (!authorized) return this.response(call, false, "ACTION_NOT_AUTHORIZED");
		if (signal.aborted || !this.deps.canAct(call) || this.revision(call) !== authorizedRevision || this.current(call)?.attempt !== request.attempt || this.current(call)?.stages.find(s => s.id === stage.id)?.status !== "running") return this.response(call, false, "AUTHORIZATION_STALE");
		const intentDigest = this.deps.digest(JSON.stringify(input));
		let reconciliation: Readonly<Record<string, unknown>> | undefined;
		try { reconciliation = capability.reconciliation?.prepare(intent); } catch { return this.response(call, false, "RECONCILIATION_PREPARE_FAILED"); }
		const prepared = await this.deps.append(call, "progress", "started", { method: "runtime/action-prepared", authority: "runtime", requestId: request.requestId, operationId: intent.operationId, stage: stage.id, capability: capability.id, effect: capability.effect, intentDigest, ...(reconciliation ? { reconciliation } : {}) });
		// No automatic retry beyond this write-ahead boundary, even when the process dies.
		if (signal.aborted || !this.deps.canAct(call) || this.revision(call) !== prepared.sequence) return this.response(call, false, "ACTION_UNCERTAIN_RECONCILE_REQUIRED");
		try {
			const result = await capability.execute(intent, signal, grant);
			if (result.outcome === "passed" && capability.effect === "publish" && !validDelivery(result.delivery)) return this.response(call, false, "DELIVERY_RECEIPT_MISSING", { preparedActivityId: prepared.id });
			const receipt = await this.deps.append(call, capability.effect === "workspace-change" ? "file-change" : "tool", result.outcome === "passed" ? "completed" : "failed", { method: "runtime/action-completed", authority: "runtime", requestId: request.requestId, operationId: intent.operationId, stage: stage.id, capability: capability.id, effect: capability.effect, intentDigest, preparedActivityId: prepared.id, summary: result.summary, source: result.source, ...(capability.effect === "publish" && result.outcome === "passed" ? { delivery: result.delivery } : {}), params: { item: { exitCode: result.outcome === "passed" ? 0 : 1 } } });
			return this.response(call, result.outcome === "passed", "ACTION_RECORDED", { receipt });
		} catch {
			return this.response(call, false, "ACTION_UNCERTAIN_RECONCILE_REQUIRED", { preparedActivityId: prepared.id });
		}
	}
}

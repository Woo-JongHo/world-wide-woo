import type { ProjectActivity } from "@/core/domain/execution/project-activity";

export const REQUEST_STAGES = ["UNDERSTAND", "DECOMPOSE", "GROUND", "DECIDE", "EXECUTE", "VERIFY", "DELIVER"] as const;
export type RequestStageId = typeof REQUEST_STAGES[number];
export type RequestStageStatus = "pending" | "running" | "completed" | "skipped" | "failed" | "blocked";
export const REQUEST_TEST_KINDS = ["black-box", "integration", "regression", "unit", "static-analysis", "read-back", "manual", "unclassified"] as const;
export type RequestTestKind = typeof REQUEST_TEST_KINDS[number];
export interface RequestDecision {
	decision             : string            ;
	rationale            : string            ;
	selectedApproach     : string            ;
	rejectedAlternatives : readonly string[] ;
	executionPlan        : readonly string[] ;
}
export interface RequestEvidence {
	activityId   : string                           ;
	sequence     : number                           ;
	sourceDigest : string                           ;
	itemId       : string | null                    ;
	kind         : ProjectActivity["kind"]          ;
	status       : "observed" | "passed" | "failed" ;
}
export interface RequestDelivery {
	target   : string                     ;
	artifact : string                     ;
	evidence : readonly RequestEvidence[] ;
}
/** Public work results only. Never accepts an opaque model reasoning object. */
export interface RequestStage {
	id          : RequestStageId             ;
	status      : RequestStageStatus         ;
	goal        : string                     ;
	input       : readonly string[]          ;
	owner       : "orchestrator"             ;
	model       : string | null              ;
	agents      : readonly string[]          ;
	tools       : readonly string[]          ;
	output      : string | null              ;
	evidence    : readonly RequestEvidence[] ;
	decision    : RequestDecision | null     ;
	skipReason  : string | null              ;
	startedAt   : string | null              ;
	completedAt : string | null              ;
	next        : RequestStageId | null      ;
	/** Results before this reset cannot verify the current execution. */
	evidenceAfterSequence: number;
	/** Native owns the work breakdown inside the fixed stage template. */
	tasks: readonly { id: string; title: string; status: "pending" | "running" | "completed" | "blocked"; dependsOn: readonly string[]; verification?: { kind: RequestTestKind; purpose: string } }[];
}
export interface RequestLifecycleEvent {
	id         : string                                                                                                                                                                                                                                                                                                                                                                                                                                                                            ;
	type       : "request.started" | "request.completed" | "request.failed" | "request.blocked" | "request.replanned" | "stage.started" | "stage.completed" | "stage.skipped" | "stage.failed" | "stage.blocked" | "decision.created" | "execution.started" | "execution.completed" | "verification.completed" | "delivery.recorded" | "delivery.required" | "protocol.rejected" | "action.prepared" | "action.completed" | "action.failed" | "action.reconciled" | "action.reconciliation-failed" ;
	requestId  : string                                                                                                                                                                                                                                                                                                                                                                                                                                                                            ;
	stage      : RequestStageId | null                                                                                                                                                                                                                                                                                                                                                                                                                                                             ;
	activityId : string                                                                                                                                                                                                                                                                                                                                                                                                                                                                            ;
	at         : string                                                                                                                                                                                                                                                                                                                                                                                                                                                                            ;
	reason     : string | null                                                                                                                                                                                                                                                                                                                                                                                                                                                                     ;
}
export interface RequestRuntimeRecord {
	schemaVersion   : 1                       ;
	protocolVersion : 1 | 2                   ;
	requestId       : string                  ;
	threadId        : string | null           ;
	turnId          : string | null           ;
	objective       : string                  ;
	status          : RequestStageStatus      ;
	stages          : readonly RequestStage[] ;
	attempt         : number                  ;
	/** Immutable public snapshots; old evidence remains inspectable, never current acceptance. */
	previousAttempts: readonly {
		attempt    : number                     ;
		fromStage  : RequestStageId             ;
		reason     : string                     ;
		activityId : string                     ;
		stages     : readonly RequestStage[]    ;
		deliveries : readonly RequestDelivery[] ;
	}[];
	deliveries         : readonly RequestDelivery[]                      ;
	requiredDeliveries : readonly { target: string; artifact: string }[] ;
	events             : readonly RequestLifecycleEvent[]                ;
	startedAt          : string                                          ;
	completedAt        : string | null                                   ;
	/** Protocol failures are distinct from a successful Native turn. */
	issues: readonly string[];
	actions: readonly {
		operationId        : string                                                ;
		stage              : RequestStageId                                        ;
		capability         : string                                                ;
		status             : "unconfirmed" | "completed" | "failed" | "reconciled" ;
		preparedActivityId : string                                                ;
		receiptActivityId  : string | null                                         ;
	}[];
}

export interface RequestStageReport {
	requestId   : string                                                                       ;
	stage       : RequestStageId                                                               ;
	status      : Exclude<RequestStageStatus, "pending">                                       ;
	summary     : string                                                                       ;
	input?      : readonly string[]                                                            ;
	agents?     : readonly string[]                                                            ;
	tools?      : readonly string[]                                                            ;
	evidence?   : readonly string[]                                                            ;
	decision?   : RequestDecision                                                              ;
	plan?       : readonly { stage: RequestStageId; tasks: RequestStage["tasks"] }[]           ;
	deliveries? : readonly { target: string; artifact: string; evidence: readonly string[] }[] ;
}

export const REQUEST_REPORT_PREFIX = "[www-runtime]"                                                                                 ;
const object                       = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v) ;
const text                         = (v: unknown): v is string => typeof v === "string" && !!v.trim() && v.length <= 4000            ;
const strings                      = (v: unknown): v is string[] => Array.isArray(v) && v.length <= 64 && v.every(text)              ;
const only                         = (v: Record<string, unknown>, keys: string[]) => Object.keys(v).every(key => keys.includes(key)) ;

/** Whole, completed public message required; quoted snippets/tool output cannot become commands. */
export function parseRequestStageReport(message: string): RequestStageReport | null {
	if (!message.startsWith(REQUEST_REPORT_PREFIX) || message.length > 24000) return null;
	try {
		const v: unknown = JSON.parse(message.slice(REQUEST_REPORT_PREFIX.length));
		if (!object(v) || !only(v, ["requestId", "stage", "status", "summary", "input", "agents", "tools", "evidence", "decision", "deliveries", "plan"])) return null;
		if (!text(v.requestId)
			|| !REQUEST_STAGES.includes(v.stage as RequestStageId)
			|| !["running", "completed", "skipped", "pass", "failed", "blocked"].includes(String(v.status))
			|| !text(v.summary)) return null;
		for (const key of ["input", "agents", "tools", "evidence"]) if (v[key] !== undefined && !strings(v[key])) return null;
		if (v.plan !== undefined) {
			if (!Array.isArray(v.plan) || v.plan.length > 7) return null;
			const stages = new Set(), ids = new Set();
			for (const p of v.plan) {
				if (!object(p)
					|| !only(p, ["stage", "tasks"])
					|| !REQUEST_STAGES.includes(p.stage as RequestStageId)
					|| stages.has(p.stage)
					|| !Array.isArray(p.tasks)
					|| p.tasks.length > 8) return null;
				stages.add(p.stage);
				for (const t of p.tasks) {
				if (
					!object(t) ||
					!only(t, ["id", "title", "status", "dependsOn", "verification"]) ||
					!text(t.id) ||
					!/^[a-zA-Z0-9_-]{1,40}$/u.test(t.id) ||
					ids.has(t.id) ||
					!text(t.title) ||
					!["pending", "running", "completed", "blocked"].includes(String(t.status)) ||
					!strings(t.dependsOn)
				) return null;
				if (t.verification !== undefined && (!object(t.verification) || !only(t.verification, ["kind", "purpose"]) || !REQUEST_TEST_KINDS.includes(t.verification.kind as RequestTestKind) || !text(t.verification.purpose) || p.stage !== "VERIFY")) return null;
					ids.add(t.id);
				}
			}
		}
		if (v.decision !== undefined) {
			const d = v.decision;
			if (
				!object(d) ||
				!only(d, ["decision", "rationale", "selectedApproach", "rejectedAlternatives", "executionPlan"]) ||
				!text(d.decision) ||
				!text(d.rationale) ||
				!text(d.selectedApproach) ||
				!strings(d.rejectedAlternatives) ||
				!strings(d.executionPlan)
			) return null;
		}
		if (
			v.deliveries !== undefined &&
			(
				!Array.isArray(v.deliveries) ||
				v.deliveries.length > 32 ||
				v.deliveries.some(delivery =>
					!object(delivery) ||
					!only(delivery, ["target", "artifact", "evidence"]) ||
					!text(delivery.target) ||
					!text(delivery.artifact) ||
					!strings(delivery.evidence)
				)
			)
		) return null;
		return { ...v, status: v.status === "pass" ? "skipped" : v.status } as unknown as RequestStageReport;
	} catch { return null; }
}

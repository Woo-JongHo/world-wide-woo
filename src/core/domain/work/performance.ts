import { isReasoningActivityPayload, type ProjectActivity } from "../execution/project-activity.js";
import type { ExecutionRunState } from "../execution/execution-run-contract.js";
import { sanitizeTerminalTextExcerpt } from "../execution/terminal.js";
import type { WorkFlowProjection } from "./workflow-projection.js";

/** A goal belongs to an observed request, never implicitly to every turn in a session. */
export interface AssignedWorkContext {
	readonly goal: string;
	readonly goalActivityId: string;
	readonly threadId: string;
	readonly turnId: string;
}

export interface PerformanceProjection {
	readonly execution: { readonly threadId: string; readonly turnId: string; readonly runId: string } | null;
	readonly workContext: AssignedWorkContext | null;
	readonly request: { readonly text: string; readonly activityId: string } | null;
	readonly state: ExecutionRunState["phase"] | "idle";
	readonly verification: "not-verified" | "passed" | "failed" | "uncertain";
	readonly planProgress: { readonly completed: number; readonly total: number } | null;
	readonly lastObservation: { readonly activityId: string; readonly recordedAt: string; readonly label: string; readonly phase: ProjectActivity["phase"] } | null;
	readonly health: { readonly observedRetries: number; readonly observedFailures: number; readonly unassociatedActivities: number };
}

/** The common read model for standalone and assigned work. It does not create tasks. */
export function projectPerformance(input: {
	readonly activities: readonly ProjectActivity[];
	readonly run: ExecutionRunState | null;
	readonly flow: WorkFlowProjection;
}): PerformanceProjection {
	const { run, flow } = input;
	const activities = run ? input.activities.filter(activity => activity.nativeRefs.threadId === run.threadId && activity.nativeRefs.turnId === run.turnId) : [];
	const starts = activities.filter(activity => activity.payload.method === "request/started");
	const requests = starts.flatMap(start => input.activities.filter(activity =>
		activity.nativeRefs.threadId === run!.threadId && activity.nativeRefs.itemId === start.nativeRefs.itemId &&
		activity.sequence <= start.sequence && activity.kind === "message" && activity.phase === "completed" &&
		activity.payload.direction === "outbound" && typeof activity.payload.text === "string" &&
		(!activity.nativeRefs.turnId || activity.nativeRefs.turnId === run!.turnId)));
	const request = requests.at(-1);
	const goal = requests.findLast(activity => activity.payload.goal === true);
	const visible = activities.filter(activity => !isReasoningActivityPayload(activity.payload) &&
		activity.payload.method !== "execution/completion-receipt" && !String(activity.payload.method ?? "").startsWith("governance/"));
	const last = visible.at(-1);
	const verification = run?.receipt?.verification ?? [];
	return {
		execution: run ? { threadId: run.threadId, turnId: run.turnId, runId: run.runId } : null,
		workContext: run && goal ? { goal: publicText(String(goal.payload.text)), goalActivityId: goal.id, threadId: run.threadId, turnId: run.turnId } : null,
		request: request ? { text: publicText(String(request.payload.text)), activityId: request.id } : null,
		state: run?.phase ?? "idle",
		verification: verification.some(check => check.status === "failed") ? "failed"
			: verification.length === 0 ? "not-verified"
				: verification.every(check => check.status === "passed") ? "passed" : "uncertain",
		planProgress: flow.source?.authority === "native-checklist" ? { completed: flow.completedCount, total: flow.steps.length } : null,
		lastObservation: last ? { activityId: last.id, recordedAt: last.recordedAt, label: observationLabel(last), phase: last.phase } : null,
		health: {
			observedRetries: activities.filter(activity => /(?:^|\/)retry(?:\/|$)/u.test(String(activity.payload.method ?? "")) || record(activity.payload.params)?.retryOf !== undefined).length,
			observedFailures: activities.filter(isExecutionFailure).length,
			unassociatedActivities: flow.orphans.length,
		},
	};
}

function record(value: unknown): Readonly<Record<string, unknown>> | null {
	return value && typeof value === "object" && !Array.isArray(value) ? value as Readonly<Record<string, unknown>> : null;
}
function isExecutionFailure(activity: ProjectActivity): boolean {
	const method = String(activity.payload.method ?? "");
	// Governance delivery and request uncertainty are control-plane observations,
	// not evidence that the represented execution failed.
	if (method.startsWith("governance/") || method.startsWith("request/")) return false;
	return activity.phase === "failed" || nonzeroExit(activity);
}
function nonzeroExit(activity: ProjectActivity): boolean {
	const item = record(record(activity.payload.params)?.item);
	const exit = item?.exitCode ?? activity.payload.exitCode;
	return typeof exit === "number" && exit !== 0;
}
function publicText(value: string): string { return sanitizeTerminalTextExcerpt(value, 1200, "head-tail"); }
function observationLabel(activity: ProjectActivity): string {
	const item = record(record(activity.payload.params)?.item);
	const type = typeof item?.type === "string" ? item.type : activity.kind;
	// Raw output and reasoning are not a summary. Details own their bounded public display.
	return publicText(`${type} · ${activity.phase}`);
}

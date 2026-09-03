import type { ProjectActivity } from "./project-activity.js";
import type { WorkbenchSnapshot } from "./workbench.js";

const EVENT_LIMIT = 12;
const LABEL_LIMIT = 160;

export type RuntimeMonitorState = "idle" | "running" | "waiting" | "blocked" | "failed" | "completed";
export type RuntimeMonitorEventKind = "REQUEST" | "MODEL" | "AGENT" | "TOOL" | "OUTPUT" | "APPROVAL" | "WAIT" | "RETRY" | "FAILURE" | "COMPACTION";

export interface RuntimeMonitorElapsed {
	readonly startedAt: string;
	/** Present only when both endpoints were observed in the journal. */
	readonly elapsedMs: number | null;
}

export interface RuntimeMonitorEvent {
	readonly kind: RuntimeMonitorEventKind;
	readonly activityId: string;
	readonly recordedAt: string;
	readonly label: string;
}

export interface RuntimeMonitorProjection {
	readonly state: RuntimeMonitorState;
	readonly activeRequest: { readonly label: string; readonly sourceActivityId: string; readonly elapsed: RuntimeMonitorElapsed } | null;
	readonly model: string | null;
	readonly agent: string | null;
	readonly currentTool: { readonly label: string; readonly sourceActivityId: string; readonly elapsed: RuntimeMonitorElapsed } | null;
	readonly approval: { readonly pending: boolean; readonly sourceActivityId: string | null; readonly elapsed: RuntimeMonitorElapsed | null } | null;
	readonly retryCount: number;
	readonly failureCount: number;
	readonly sourceActivityIds: readonly string[];
	readonly recentEvents: readonly RuntimeMonitorEvent[];
}

/**
 * Projects only facts already observed by the current snapshot and journal. It deliberately
 * does not use wall-clock time, timers, subscriptions, progress estimates, or raw payloads.
 */
export function projectRuntimeMonitor(snapshot: WorkbenchSnapshot, activities: readonly ProjectActivity[] = snapshot.activities): RuntimeMonitorProjection {
	const ordered = [...activities].sort((left, right) => left.sequence - right.sequence || left.id.localeCompare(right.id));
	const request = latestActive(ordered, isRequestStart, isRequestTerminal, activity => requestIdentity(activity));
	const tool = latestActive(ordered, isToolStart, isToolTerminal, activity => itemIdentity(activity));
	const agent = latestActive(ordered, isAgentStart, isAgentTerminal, activity => itemIdentity(activity));
	const execution = latestActive(ordered, isExecutionStart, isExecutionTerminal, activity => activity.nativeRefs.turnId ?? activity.id);
	const approvalActivity = latest(ordered.filter(isApproval));
	const waitActivity = latestActive(ordered, isWaitStart, isWaitTerminal, activity => itemIdentity(activity));
	const failures = ordered.filter(isFailure);
	const lastFailure = latest(failures);
	const lastCompleted = latest(ordered.filter(isCompletion));
	const hasCurrentFailure = snapshot.error !== null || (lastFailure !== undefined && (lastCompleted === undefined || later(lastFailure, lastCompleted)));
	const approvalPending = snapshot.pendingApproval !== null || (approvalActivity !== undefined && !approvalResolvedAfter(ordered, approvalActivity));
	const state: RuntimeMonitorState = hasCurrentFailure ? "failed"
		: approvalPending ? (snapshot.pendingApproval ? "blocked" : "waiting")
		: tool ? "running"
		: agent || execution || request || waitActivity ? "running"
		: lastCompleted ? "completed"
		: "idle";
	const sourceActivityIds = unique([
		request?.id, tool?.id, agent?.id, execution?.id, waitActivity?.id, approvalActivity?.id, lastFailure?.id, lastCompleted?.id,
	]);
	return Object.freeze({
		state,
		activeRequest: request ? Object.freeze({ label: requestLabel(request), sourceActivityId: request.id, elapsed: elapsedFrom(request) }) : null,
		model: modelFor(snapshot, execution, request),
		agent: agentFor(agent ?? execution),
		currentTool: tool ? Object.freeze({ label: toolLabel(tool), sourceActivityId: tool.id, elapsed: elapsedFrom(tool) }) : null,
		approval: approvalPending ? Object.freeze({ pending: snapshot.pendingApproval !== null, sourceActivityId: approvalActivity?.id ?? null, elapsed: approvalActivity ? elapsedFrom(approvalActivity) : null }) : null,
		retryCount: ordered.filter(isRetry).length,
		failureCount: failures.length + (snapshot.error !== null && failures.length === 0 ? 1 : 0),
		sourceActivityIds: Object.freeze(sourceActivityIds),
		recentEvents: Object.freeze(ordered.flatMap(semanticEvent).slice(-EVENT_LIMIT)),
	});
}

function semanticEvent(activity: ProjectActivity): RuntimeMonitorEvent[] {
	const kind = eventKind(activity);
	return kind ? [Object.freeze({ kind, activityId: activity.id, recordedAt: activity.recordedAt, label: eventLabel(kind, activity) })] : [];
}
function eventKind(activity: ProjectActivity): RuntimeMonitorEventKind | null {
	if (isFailure(activity)) return "FAILURE";
	if (isCompaction(activity)) return "COMPACTION";
	if (isRetry(activity)) return "RETRY";
	if (isApproval(activity)) return activity.phase === "completed" ? "WAIT" : "APPROVAL";
	if (isWait(activity)) return "WAIT";
	if (isAgent(activity)) return "AGENT";
	if (isTool(activity)) return "TOOL";
	if (isOutput(activity)) return "OUTPUT";
	if (isRequest(activity)) return "REQUEST";
	if (isExecution(activity)) return activity.payload.model || item(activity)?.agent ? "MODEL" : "AGENT";
	return null;
}
function eventLabel(kind: RuntimeMonitorEventKind, activity: ProjectActivity): string {
	if (kind === "REQUEST") return requestLabel(activity);
	if (kind === "TOOL") return toolLabel(activity);
	if (kind === "MODEL") return line(stringValue(activity.payload.model) ?? "Model execution");
	if (kind === "AGENT") return line(stringValue(item(activity)?.agent) ?? "Agent execution");
	return ({ OUTPUT: "Public output observed", APPROVAL: "Approval requested", WAIT: "Waiting", RETRY: "Retry observed", FAILURE: "Failure observed", COMPACTION: "Context compacted" } as const)[kind] ?? "Observed";
}
function latestActive(activities: readonly ProjectActivity[], start: (a: ProjectActivity) => boolean, terminal: (a: ProjectActivity) => boolean, identity: (a: ProjectActivity) => string): ProjectActivity | undefined {
	const active = new Map<string, ProjectActivity>();
	for (const activity of activities) {
		const key = identity(activity);
		if (start(activity)) active.set(key, activity);
		if (terminal(activity)) active.delete(key);
	}
	return latest([...active.values()]);
}
function latest<T extends ProjectActivity>(activities: readonly T[]): T | undefined { return activities.at(-1); }
function later(left: ProjectActivity, right: ProjectActivity): boolean { return left.sequence > right.sequence || (left.sequence === right.sequence && left.id > right.id); }
function method(activity: ProjectActivity): string { return stringValue(activity.payload.method) ?? ""; }
function item(activity: ProjectActivity): Readonly<Record<string, unknown>> | null { return record(record(activity.payload.params)?.item); }
function record(value: unknown): Readonly<Record<string, unknown>> | null { return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Readonly<Record<string, unknown>> : null; }
function stringValue(value: unknown): string | null { return typeof value === "string" && value.trim() ? value : null; }
function itemIdentity(activity: ProjectActivity): string { return activity.nativeRefs.itemId ?? stringValue(item(activity)?.id) ?? activity.id; }
function requestIdentity(activity: ProjectActivity): string { return stringValue(activity.payload.requestId) ?? activity.nativeRefs.itemId ?? activity.nativeRefs.turnId ?? activity.id; }
function isRequest(activity: ProjectActivity): boolean { return method(activity).startsWith("request/"); }
function isRequestStart(activity: ProjectActivity): boolean { return isRequest(activity) && (activity.phase === "started" || method(activity) === "request/started"); }
function isRequestTerminal(activity: ProjectActivity): boolean { return isRequest(activity) && /\/(?:completed|failed|cancelled|canceled|uncertain)$/u.test(method(activity)); }
function isExecution(activity: ProjectActivity): boolean { return /^(?:turn\/(?:start|started|completed|failed|cancelled|canceled|interrupted)|turn\/first-output-observed)$/u.test(method(activity)); }
function isExecutionStart(activity: ProjectActivity): boolean { return method(activity) === "turn/start" || method(activity) === "turn/started"; }
function isExecutionTerminal(activity: ProjectActivity): boolean { return /turn\/(?:completed|failed|cancelled|canceled|interrupted)$/u.test(method(activity)); }
function isCompletion(activity: ProjectActivity): boolean { return /(?:turn|request)\/completed$/u.test(method(activity)); }
function isAgent(activity: ProjectActivity): boolean { const type = stringValue(item(activity)?.type)?.toLowerCase() ?? ""; return type.includes("agent"); }
function isAgentStart(activity: ProjectActivity): boolean { return isAgent(activity) && (activity.phase === "started" || /item\/started$/u.test(method(activity))); }
function isAgentTerminal(activity: ProjectActivity): boolean { return isAgent(activity) && (activity.phase === "completed" || activity.phase === "failed" || activity.phase === "cancelled"); }
function isTool(activity: ProjectActivity): boolean { return !isAgent(activity) && (activity.kind === "tool" || Boolean(stringValue(item(activity)?.tool))); }
function isToolStart(activity: ProjectActivity): boolean { return isTool(activity) && (activity.phase === "started" || /item\/started$/u.test(method(activity))); }
function isToolTerminal(activity: ProjectActivity): boolean { return isTool(activity) && (activity.phase === "completed" || activity.phase === "failed" || activity.phase === "cancelled"); }
function isApproval(activity: ProjectActivity): boolean { return activity.kind === "approval" || /approval/u.test(method(activity)) || activity.payload.eventType === "approval-requested" || activity.payload.eventType === "approval-resolved"; }
function isWait(activity: ProjectActivity): boolean { return stringValue(item(activity)?.tool)?.toLowerCase() === "wait" || /(?:^|\/)wait(?:\/|$)/u.test(method(activity)); }
function isWaitStart(activity: ProjectActivity): boolean { return isWait(activity) && activity.phase === "started"; }
function isWaitTerminal(activity: ProjectActivity): boolean { return isWait(activity) && (activity.phase === "completed" || activity.phase === "failed" || activity.phase === "cancelled"); }
function isRetry(activity: ProjectActivity): boolean { return /retry/u.test(method(activity)) || record(activity.payload.params)?.retryOf !== undefined; }
function isCompaction(activity: ProjectActivity): boolean { return /compact/u.test(method(activity)); }
function isOutput(activity: ProjectActivity): boolean { return method(activity) === "turn/first-output-observed" || (activity.kind === "message" && activity.payload.role === "assistant"); }
function isFailure(activity: ProjectActivity): boolean { const params = record(activity.payload.params); const status = stringValue(activity.payload.status) ?? stringValue(params?.status) ?? stringValue(item(activity)?.status); const exitCode = activity.payload.exitCode ?? params?.exitCode ?? item(activity)?.exitCode; return activity.phase === "failed" || status === "failed" || status === "error" || activity.payload.error != null || params?.error != null || item(activity)?.error != null || (typeof exitCode === "number" && exitCode !== 0); }
function approvalResolvedAfter(activities: readonly ProjectActivity[], approval: ProjectActivity): boolean { return activities.some(activity => later(activity, approval) && (activity.payload.eventType === "approval-resolved" || (isApproval(activity) && activity.phase === "completed"))); }
function requestLabel(activity: ProjectActivity): string { return line(stringValue(activity.payload.label) ?? stringValue(activity.payload.title) ?? "Request"); }
function toolLabel(activity: ProjectActivity): string { return line(stringValue(item(activity)?.tool) ?? stringValue(item(activity)?.type) ?? stringValue(activity.payload.tool) ?? "Tool"); }
function line(value: string): string { const oneLine = value.replace(/[\r\n\t]+/gu, " ").replace(/\s+/gu, " ").trim(); return oneLine.length > LABEL_LIMIT ? `${oneLine.slice(0, LABEL_LIMIT - 1)}…` : oneLine; }
function elapsedFrom(activity: ProjectActivity): RuntimeMonitorElapsed { return Object.freeze({ startedAt: activity.recordedAt, elapsedMs: null }); }
function modelFor(snapshot: WorkbenchSnapshot, execution: ProjectActivity | undefined, request: ProjectActivity | undefined): string | null { return stringValue(execution?.payload.model) ?? stringValue(request?.payload.model) ?? snapshot.activeModel ?? snapshot.model ?? null; }
function agentFor(execution: ProjectActivity | undefined): string | null { return execution ? stringValue(item(execution)?.agent) ?? stringValue(execution.payload.agent) ?? null : null; }
function unique(values: readonly (string | undefined)[]): string[] { return [...new Set(values.filter((value): value is string => value !== undefined))]; }

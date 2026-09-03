import type { ProjectActivity } from "./project-activity.js";
import type { WorkbenchSnapshot } from "./workbench.js";

const RECENT_LIMIT = 12;
export type SessionStatsAuthority = "www-observed" | "session-goal" | "t-note" | "since-process-attach" | "unknown";

export interface SessionStatsClaim {
	readonly text: string;
	readonly authority: SessionStatsAuthority;
	readonly sourceActivityIds: readonly string[];
}

export interface SessionStatsTurn {
	readonly id: string;
	readonly number: number;
	readonly startedAt: string;
	readonly endedAt: string;
	readonly durationMs: number | null;
	readonly firstOutputMs: number | null;
	readonly firstOutputAuthority: "www-observed" | "unknown";
	readonly agents: number;
	readonly tools: number;
	readonly approvals: number;
	readonly compactions: number;
	readonly retries: number;
	readonly waits: number;
	readonly failures: number;
	readonly activityIds: readonly string[];
}

export interface SessionStatsFailure {
	readonly activityId: string;
	readonly turnId: string | null;
	readonly recordedAt: string;
	readonly method: string;
	readonly summary: string;
	readonly recovered: boolean;
	readonly recoveryActivityId: string | null;
}

export interface SessionStatsActivity {
	readonly id: string;
	readonly turnId: string | null;
	readonly itemId: string | null;
	readonly recordedAt: string;
	readonly category: "message" | "agent" | "tool" | "approval" | "compaction" | "retry" | "other";
	readonly phase: ProjectActivity["phase"];
	readonly method: string;
	readonly observedDurationMs: number | null;
	readonly sourceActivityId: string;
}

export interface SessionStatsSnapshot {
	readonly session: { readonly threadId: string | null; readonly startedAt: string | null; readonly endedAt: string | null; readonly durationMs: number | null; readonly timeAuthority: "www-observed" | "unknown"; readonly turns: number; readonly completedTurns: number; readonly failedActivities: number; readonly cancelledActivities: number; readonly agentOperations: number; readonly toolOperations: number; readonly approvals: number; readonly compactions: number; readonly retries: number; readonly waits: number; readonly activityIds: readonly string[] };
	readonly speed: { readonly averageTurnMs: number | null; readonly averageToolMs: number | null; readonly averageFirstOutputMs: number | null; readonly averageApprovalWaitMs: number | null; readonly activitiesPerMinute: number | null; readonly generationTokensPerSecond: null };
	readonly usage: { readonly totalTokens: number | null; readonly unattributedTokens: number | null; readonly authority: "since-process-attach" | "unknown"; readonly limitation: string; readonly models: readonly { model: string; effort: string | null; turns: number; totalTokens: number }[] };
	readonly summary: { readonly purpose: SessionStatsClaim; readonly actions: SessionStatsClaim; readonly result: SessionStatsClaim };
	readonly turns: readonly SessionStatsTurn[];
	readonly activities: readonly SessionStatsActivity[];
	readonly failures: readonly SessionStatsFailure[];
	readonly unavailable: readonly string[];
}

export function projectSessionStats(snapshot: WorkbenchSnapshot): SessionStatsSnapshot {
	const activities = [...snapshot.activities].sort((a, b) => a.sequence - b.sequence);
	const rootActivities = activities.filter(activity => !snapshot.threadId || activity.nativeRefs.threadId === snapshot.threadId);
	const turns = [...groupByTurn(rootActivities).entries()].map(([id, group], index) => projectTurn(id, index + 1, group));
	const failures = activities.filter(isFailure).map(activity => projectFailure(activity, activities));
	const tools = operations(activities, "tool");
	const agents = operations(activities, "agent");
	const approvals = approvalRequests(activities);
	const startedAt = activities[0]?.recordedAt ?? null;
	const endedAt = activities.at(-1)?.recordedAt ?? null;
	const durationMs = elapsed(startedAt, endedAt);
	const goal = snapshot.sessionGoal;
	const notes = snapshot.tnotes.slice(-RECENT_LIMIT);
	const purpose: SessionStatsClaim = goal ? claim(goal.text, "session-goal", [goal.sourceActivityId]) : claim("unknown", "unknown", []);
	const actionIds = recentIds(activities);
	const actions = claim(`Turn ${turns.length}개 · Agent ${agents.size}개 · Tool ${tools.size}개 · 승인 ${approvals.length}개`, actionIds.length ? "www-observed" : "unknown", actionIds);
	const result = notes.length
		? claim(notes.map(note => noteResult(note.title, note.summary)).join(" · "), "t-note", notes.flatMap(note => note.sourceActivityIds))
		: claim("unknown", "unknown", []);
	const usage = snapshot.sessionUsage;
	const projectedActivities = activities.map((activity, index) => projectActivity(activity, activities.slice(index + 1)));
	return Object.freeze({
		session: Object.freeze({ threadId: snapshot.threadId, startedAt, endedAt, durationMs, timeAuthority: startedAt && endedAt ? "www-observed" : "unknown", turns: turns.length, completedTurns: rootActivities.filter(a => methodOf(a) === "turn/completed").length, failedActivities: failures.length, cancelledActivities: activities.filter(a => a.phase === "cancelled").length, agentOperations: agents.size, toolOperations: tools.size, approvals: approvals.length, compactions: activities.filter(isCompaction).length, retries: activities.filter(isRetry).length, waits: operationKeys(activities.filter(isWait)).size, activityIds: Object.freeze(actionIds) }),
		speed: Object.freeze({ averageTurnMs: average(turns.flatMap(t => t.durationMs === null ? [] : [t.durationMs])), averageToolMs: average(operationDurations(activities, a => classify(a) === "tool")), averageFirstOutputMs: average(turns.flatMap(t => t.firstOutputMs === null ? [] : [t.firstOutputMs])), averageApprovalWaitMs: average(approvalDurations(activities)), activitiesPerMinute: durationMs && durationMs > 0 ? round(activities.length / (durationMs / 60_000)) : null, generationTokensPerSecond: null }),
		usage: Object.freeze({ totalTokens: usage?.totalTokens ?? null, unattributedTokens: usage?.unattributedTokens ?? null, authority: usage ? "since-process-attach" : "unknown", limitation: usage ? "since process attach; prior/resumed session usage is unknown" : "unknown", models: Object.freeze((usage?.models ?? []).map(model => Object.freeze({ ...model }))) }),
		summary: Object.freeze({ purpose, actions, result }),
		turns: Object.freeze(turns),
		activities: Object.freeze(projectedActivities),
		failures: Object.freeze(failures),
		unavailable: Object.freeze(["provider generation speed", "provider prefill duration", "provider reasoning duration", "provider queue duration"]),
	});
}

function projectActivity(activity: ProjectActivity, later: readonly ProjectActivity[]): SessionStatsActivity {
	const terminal = activity.phase === "started" && activity.nativeRefs.itemId
		? later.find(candidate => candidate.nativeRefs.itemId === activity.nativeRefs.itemId
			&& (candidate.phase === "completed" || candidate.phase === "failed" || candidate.phase === "cancelled" || isFailure(candidate)))
		: undefined;
	return Object.freeze({
		id: activity.id,
		turnId: activity.nativeRefs.turnId ?? null,
		itemId: activity.nativeRefs.itemId ?? null,
		recordedAt: activity.recordedAt,
		category: activityCategory(activity),
		phase: isFailure(activity) ? "failed" : activity.phase,
		method: methodOf(activity),
		observedDurationMs: terminal ? elapsed(activity.recordedAt, terminal.recordedAt) : null,
		sourceActivityId: activity.id,
	});
}

function activityCategory(activity: ProjectActivity): SessionStatsActivity["category"] {
	if (activity.payload.eventType === "approval-requested" || activity.payload.eventType === "approval-resolved") return "approval";
	if (isCompaction(activity)) return "compaction";
	if (isRetry(activity)) return "retry";
	const operation = classify(activity);
	if (operation) return operation;
	if (activity.kind === "message") return "message";
	return "other";
}

function projectTurn(id: string, number: number, activities: readonly ProjectActivity[]): SessionStatsTurn {
	const startedAt = activities[0]!.recordedAt;
	const endedAt = activities.at(-1)!.recordedAt;
	const start = activities.find(a => /turn\/(start|started)/iu.test(methodOf(a)))?.recordedAt ?? startedAt;
	const firstDelta = activities.find(isTextDelta);
	return Object.freeze({ id, number, startedAt, endedAt, durationMs: elapsed(start, endedAt), firstOutputMs: firstDelta ? elapsed(start, firstDelta.recordedAt) : null, firstOutputAuthority: firstDelta ? "www-observed" : "unknown", agents: operations(activities, "agent").size, tools: operations(activities, "tool").size, approvals: approvalRequests(activities).length, compactions: activities.filter(isCompaction).length, retries: activities.filter(isRetry).length, waits: operationKeys(activities.filter(isWait)).size, failures: activities.filter(isFailure).length, activityIds: Object.freeze(recentIds(activities)) });
}

function projectFailure(activity: ProjectActivity, activities: readonly ProjectActivity[]): SessionStatsFailure {
	const position = activities.findIndex(candidate => candidate.id === activity.id);
	const recovery = activities.slice(position + 1).find(candidate => explicitRecovery(activity, candidate));
	return Object.freeze({ activityId: activity.id, turnId: activity.nativeRefs.turnId ?? null, recordedAt: activity.recordedAt, method: methodOf(activity), summary: failureSummary(activity), recovered: Boolean(recovery), recoveryActivityId: recovery?.id ?? null });
}

function explicitRecovery(failure: ProjectActivity, candidate: ProjectActivity): boolean {
	if (!isExplicitSuccess(candidate) || failure.nativeRefs.turnId !== candidate.nativeRefs.turnId) return false;
	const failedItem = failure.nativeRefs.itemId;
	if (failedItem && candidate.nativeRefs.itemId === failedItem) return true;
	const params = record(candidate.payload.params);
	return params?.retryOf === failure.nativeRefs.itemId || params?.retryOf === failure.id || params?.previousItemId === failedItem;
}
function isExplicitSuccess(activity: ProjectActivity): boolean { return activity.phase === "completed" && !isFailure(activity) && !/turn\/completed/iu.test(methodOf(activity)); }
function groupByTurn(activities: readonly ProjectActivity[]): Map<string, ProjectActivity[]> { const groups = new Map<string, ProjectActivity[]>(); for (const a of activities) { if (!a.nativeRefs.turnId) continue; const group = groups.get(a.nativeRefs.turnId) ?? []; group.push(a); groups.set(a.nativeRefs.turnId, group); } return groups; }
function operations(activities: readonly ProjectActivity[], kind: "agent" | "tool"): Set<string> { return new Set(activities.filter(a => classify(a) === kind).map(a => a.nativeRefs.itemId ?? a.id)); }
function operationKeys(activities: readonly ProjectActivity[]): Set<string> { return new Set(activities.map(a => a.nativeRefs.itemId ?? a.id)); }
function classify(activity: ProjectActivity): "agent" | "tool" | null { const method = methodOf(activity).toLowerCase(); const item = record(record(activity.payload.params)?.item); const type = String(item?.type ?? "").toLowerCase(); if (type.includes("collabagenttoolcall") || type.includes("subagentactivity") || method.includes("collabagent") || method.includes("subagent")) return "agent"; return activity.kind === "tool" || type.includes("command") || type.includes("tool") || type.includes("mcp") ? "tool" : null; }
function approvalRequests(activities: readonly ProjectActivity[]): ProjectActivity[] { return activities.filter(a => a.kind === "approval" && a.payload.eventType === "approval-requested" && approvalId(a) !== null); }
function operationDurations(activities: readonly ProjectActivity[], include: (a: ProjectActivity) => boolean): number[] { const starts = new Map<string, string>(); const values: number[] = []; for (const a of activities.filter(include)) { const key = a.nativeRefs.itemId ?? a.id; if (a.phase === "started") starts.set(key, a.recordedAt); if ((a.phase === "completed" || isFailure(a) || a.phase === "cancelled") && starts.has(key)) { const value = elapsed(starts.get(key)!, a.recordedAt); if (value !== null) values.push(value); } } return values; }
function approvalDurations(activities: readonly ProjectActivity[]): number[] { const starts = new Map<string | number, string>(); const values: number[] = []; for (const a of activities) { const id = approvalId(a); if (a.payload.eventType === "approval-requested" && id !== null) starts.set(id, a.recordedAt); if (a.payload.eventType === "approval-resolved" && id !== null && starts.has(id)) { const value = elapsed(starts.get(id)!, a.recordedAt); if (value !== null) values.push(value); } } return values; }
function approvalId(activity: ProjectActivity): string | number | null { const envelope = record(activity.payload.approval); const id = activity.nativeRefs.approvalRequestId ?? envelope?.requestId ?? activity.payload.requestId; return typeof id === "string" || typeof id === "number" ? id : null; }
function isFailure(a: ProjectActivity): boolean { const p = a.payload; const params = record(p.params); const item = record(params?.item); const status = String(p.status ?? params?.status ?? item?.status ?? "").toLowerCase(); const error = p.error ?? params?.error ?? item?.error; const exitCode = p.exitCode ?? params?.exitCode ?? item?.exitCode; return a.phase === "failed" || status === "failed" || status === "error" || error !== undefined || (typeof exitCode === "number" && exitCode !== 0); }
function isTextDelta(a: ProjectActivity): boolean { return a.kind === "message" && /delta/iu.test(methodOf(a)) && Boolean(textValue(a.payload)); }
function isCompaction(a: ProjectActivity): boolean { return /compact/iu.test(methodOf(a)); }
function isRetry(a: ProjectActivity): boolean { const p = record(a.payload.params); return /retry/iu.test(methodOf(a)) || p?.retryOf !== undefined || p?.previousItemId !== undefined; }
function isWait(a: ProjectActivity): boolean {
	const params = record(a.payload.params);
	const item = record(params?.item);
	return String(item?.tool ?? "").toLowerCase() === "wait" || /(?:^|\/)wait(?:\/|$)/iu.test(methodOf(a));
}
function methodOf(a: ProjectActivity): string { return typeof a.payload.method === "string" ? a.payload.method : "unknown"; }
function failureSummary(a: ProjectActivity): string { const p = a.payload; const params = record(p.params); const item = record(params?.item); for (const value of [p.error, params?.error, item?.error, p.message, params?.message, item?.message, p.exitCode, params?.exitCode, item?.exitCode]) { if (typeof value === "string" && value.trim()) return bound(value.trim(), 240); if (typeof value === "number" && value !== 0) return `exit ${value}`; } return `${methodOf(a)} failed`; }
function textValue(payload: Readonly<Record<string, unknown>>): string { const params = record(payload.params); const item = record(params?.item); for (const value of [payload.text, params?.text, item?.text, item?.delta, item?.content]) if (typeof value === "string") return value; return ""; }
function noteResult(title: string, summary: string): string { const line = summary.split(/\r?\n/u).find(v => /^\s*결과\s*:/u.test(v)); return bound(line?.replace(/^\s*결과\s*:\s*/u, "").trim() || title, 240); }
function claim(text: string, authority: SessionStatsAuthority, ids: readonly string[]): SessionStatsClaim { return Object.freeze({ text: bound(text, 480), authority, sourceActivityIds: Object.freeze(recentIdsFrom(ids)) }); }
function recentIds(activities: readonly ProjectActivity[]): string[] { return recentIdsFrom(activities.map(a => a.id)); }
function recentIdsFrom(ids: readonly string[]): string[] { const distinct = [...new Set(ids)]; return distinct.length > RECENT_LIMIT ? [...distinct.slice(-RECENT_LIMIT), `… ${distinct.length - RECENT_LIMIT} omitted`] : distinct; }
function bound(value: string, limit: number): string { return value.length > limit ? `${value.slice(-limit)} … omitted` : value; }
function record(value: unknown): Readonly<Record<string, unknown>> | null { return value && typeof value === "object" && !Array.isArray(value) ? value as Readonly<Record<string, unknown>> : null; }
function elapsed(start: string | null, end: string | null): number | null { if (!start || !end) return null; const value = Date.parse(end) - Date.parse(start); return Number.isFinite(value) && value >= 0 ? value : null; }
function average(values: readonly number[]): number | null { return values.length ? Math.round(values.reduce((a, b) => a + b, 0) / values.length) : null; }
function round(value: number): number { return Math.round(value * 10) / 10; }

import type { ProjectActivity } from "./project-activity.js";
import type { WorkbenchSnapshot } from "./workbench.js";
import { observedCompletionPercent, observedElapsedMs as elapsed } from "./observability-metrics.js";

const DETAIL_LIMIT = 1000;
const SHORTLIST_LIMIT = 8;

export type SessionReviewState = "empty" | "observed";
export type ObservationCoverage = "fresh" | "partial-local-journal" | "unknown";
export type ClaimAuthority = "journal" | "session-goal" | "t-note" | "unknown";
export type ModelUsageNamespace = "interactive" | "detached";
export type RequestLifecycle = "submitted" | "queued" | "running" | "completed" | "failed" | "cancelled" | "uncertain";

export interface Claim {
	readonly text: string;
	readonly authority: ClaimAuthority;
	readonly sourceActivityIds: readonly string[];
	readonly independentlyVerified: boolean;
}

export interface LifecycleSummary {
	readonly threadId: string | null;
	readonly startedAt: string | null;
	readonly endedAt: string | null;
	readonly journalSpanMs: number | null;
	readonly rootTurns: number;
	readonly completedRootTurns: number;
	readonly failedRootTurns: number;
	readonly cancelledRootTurns: number;
	readonly activeRootTurns: number;
}

export interface Performance {
	readonly journalSpanMs: number | null;
	readonly rootTurnCompletionPercent: number | null;
	readonly averageCompletedRootTurnMs: number | null;
	readonly pairedToolTimeMs: number | null;
	readonly averageApprovalWaitMs: number | null;
	readonly totalApprovalWaitMs: number | null;
	readonly averageFirstOutputMs: number | null;
	readonly interactiveTokensPerCompletedRootTurn: number | null;
}

export interface ModelUsageRow {
	readonly namespace: ModelUsageNamespace;
	readonly model: string;
	readonly effort: string | null;
	readonly interactiveRootTurns: number;
	readonly detachedInvocations: number;
	readonly totalTokens: number;
}

export interface RequestReview {
	readonly ordinal: number;
	readonly requestId: string;
	readonly turnId: string | null;
	readonly excerpt: string | null;
	readonly excerptSourceActivityId: string | null;
	readonly lifecycle: RequestLifecycle;
	readonly observedElapsedMs: number | null;
	readonly models: readonly string[];
	readonly sourceActivityIds: readonly string[];
}

export interface Issue {
	readonly kind: "failure" | "approval-wait" | "unattributed-usage";
	readonly activityId: string | null;
	readonly turnId: string | null;
	readonly recordedAt: string;
	readonly method: string;
	readonly summary: string;
	readonly recovered: boolean;
	readonly recoveryActivityId: string | null;
}

export interface Diagnostics {
	readonly activityCounts: Readonly<Record<string, number>>;
	readonly retryCount: number;
	readonly waitCount: number;
	readonly compactionCount: number;
	readonly providerMetricsUnavailable: readonly string[];
	readonly warnings: readonly string[];
}

export interface SessionStatsSnapshot {
	readonly state: SessionReviewState;
	readonly coverage: ObservationCoverage;
	readonly activeModel: string | null;
	readonly lifecycle: LifecycleSummary;
	readonly performance: Performance;
	readonly modelUsage: readonly ModelUsageRow[];
	readonly unattributedUsage: { readonly totalTokens: number; readonly warning: string } | null;
	readonly claims: {
		readonly purpose: Claim;
		readonly actions: Claim;
		readonly result: Claim;
	};
	readonly requests: {
		readonly submitted: number;
		readonly shortlist: readonly RequestReview[];
		readonly details: readonly RequestReview[];
		readonly omittedCount: number;
	};
	readonly issues: readonly Issue[];
	readonly diagnostics: Diagnostics;
}

export function projectSessionStats(snapshot: WorkbenchSnapshot): SessionStatsSnapshot {
	const activities = [...snapshot.activities].sort((left, right) => left.sequence - right.sequence);
	const rootActivities = activities.filter(activity => activity.nativeRefs.threadId === snapshot.threadId);
	const rootTurns = projectRootTurns(rootActivities);
	const requests = projectRequests(activities, rootTurns);
	const failureIssues = activities
		.filter(activity => !method(activity).startsWith("request/") && isFailure(activity))
		.map(activity => projectIssue(activity, activities));
	const usage = projectUsage(snapshot);
	const span = elapsed(activities.at(0)?.recordedAt ?? null, activities.at(-1)?.recordedAt ?? null);
	const firstOutput = rootTurns.flatMap(turn => turn.firstOutputMs === null ? [] : [turn.firstOutputMs]);
	const completed = rootTurns.filter(turn => turn.status === "completed");
	const toolDurations = pairedDurations(rootActivities, isTool);
	const approvalDurations = pairedApprovalDurations(rootActivities);
	const totalApprovalWaitMs = sum(approvalDurations);
	const latestNote = snapshot.tnotes.at(-1) ?? null;
	const requestShortlist = shortlist(requests);
	const requestDetails = retainedRequestDetails(requests, requestShortlist);
	const coverage = snapshot.resumeCoverage?.mode === "partial-local-journal"
		? "partial-local-journal"
		: activities.length > 0 ? "fresh" : "unknown";

	return Object.freeze({
		state: activities.length === 0 ? "empty" : "observed",
		coverage,
		activeModel: snapshot.activeModel ?? snapshot.model ?? null,
		lifecycle: Object.freeze({
			threadId: snapshot.threadId,
			startedAt: activities.at(0)?.recordedAt ?? null,
			endedAt: rootTurns.some(turn => turn.status === "running") ? null : activities.at(-1)?.recordedAt ?? null,
			journalSpanMs: span,
			rootTurns: rootTurns.length,
			completedRootTurns: completed.length,
			failedRootTurns: rootTurns.filter(turn => turn.status === "failed").length,
			cancelledRootTurns: rootTurns.filter(turn => turn.status === "cancelled").length,
			activeRootTurns: rootTurns.filter(turn => turn.status === "running").length,
		}),
		performance: Object.freeze({
			journalSpanMs: span,
			rootTurnCompletionPercent: observedCompletionPercent(completed.length, rootTurns.length),
			averageCompletedRootTurnMs: average(completed.map(turn => turn.elapsedMs!)),
			pairedToolTimeMs: sum(toolDurations),
			averageApprovalWaitMs: average(approvalDurations),
			totalApprovalWaitMs,
			averageFirstOutputMs: average(firstOutput),
			interactiveTokensPerCompletedRootTurn: completed.length > 0 && snapshot.sessionUsage
				? Math.round(snapshot.sessionUsage.models.reduce((total, model) => total + model.interactiveTokens, 0) / completed.length)
				: null,
		}),
		modelUsage: usage.rows,
		unattributedUsage: usage.unattributed,
		claims: Object.freeze({
			purpose: snapshot.sessionGoal
				? claim(snapshot.sessionGoal.text, "session-goal", [snapshot.sessionGoal.sourceActivityId])
				: claim("unknown", "unknown", []),
			actions: claim(`${activities.length} journal activities observed`, "journal", activities.map(activity => activity.id)),
			result: latestNote
				? claim(noteResult(latestNote.title, latestNote.summary), "t-note", latestNote.sourceActivityIds)
				: claim("unknown", "unknown", []),
		}),
		requests: Object.freeze({
			submitted: requests.length,
			shortlist: Object.freeze(requestShortlist),
			details: Object.freeze(requestDetails),
			omittedCount: Math.max(0, requests.length - requestDetails.length),
		}),
		issues: Object.freeze([
			...failureIssues,
			...(totalApprovalWaitMs !== null && totalApprovalWaitMs >= 30_000
				? [Object.freeze({
					kind: "approval-wait" as const,
					activityId: null,
					turnId: null,
					recordedAt: activities.at(-1)?.recordedAt ?? "",
					method: "approval/wait",
					summary: `${totalApprovalWaitMs}ms observed approval wait`,
					recovered: true,
					recoveryActivityId: null,
				})]
				: []),
			...(usage.unattributed
				? [Object.freeze({
					kind: "unattributed-usage" as const,
					activityId: null,
					turnId: null,
					recordedAt: activities.at(-1)?.recordedAt ?? "",
					method: "token/attribution",
					summary: usage.unattributed.warning,
					recovered: false,
					recoveryActivityId: null,
				})]
				: []),
		]),
		diagnostics: Object.freeze({
			activityCounts: Object.freeze(countActivities(activities)),
			retryCount: activities.filter(isRetry).length,
			waitCount: countOperationIds(activities.filter(isWait)),
			compactionCount: activities.filter(isCompaction).length,
			providerMetricsUnavailable: Object.freeze(["generation tokens per second", "provider retry timing", "provider wait timing"]),
			warnings: Object.freeze(usage.warning ? [usage.warning] : []),
		}),
	});
}

interface RootTurn {
	readonly id: string;
	readonly startedAt: string;
	readonly endedAt: string | null;
	readonly elapsedMs: number | null;
	readonly firstOutputMs: number | null;
	readonly status: "running" | "completed" | "failed" | "cancelled";
	readonly sourceActivityIds: readonly string[];
}

function projectRootTurns(activities: readonly ProjectActivity[]): RootTurn[] {
	const groups = new Map<string, ProjectActivity[]>();
	for (const activity of activities) {
		if (!activity.nativeRefs.turnId) continue;
		const group = groups.get(activity.nativeRefs.turnId) ?? [];
		group.push(activity);
		groups.set(activity.nativeRefs.turnId, group);
	}
	return [...groups.entries()].map(([id, group]) => {
		const startedAt = group.find(isTurnStarted)?.recordedAt ?? group[0]!.recordedAt;
		const terminal = group.find(isTurnTerminal);
		const endedAt = terminal?.recordedAt ?? null;
		const first = group.find(activity => method(activity) === "turn/first-output-observed");
		const terminalMethod = terminal ? method(terminal) : "";
		const status = terminalMethod === "turn/completed" ? "completed"
			: terminalMethod.includes("failed") ? "failed"
			: terminal ? "cancelled"
			: "running";
		return {
			id,
			startedAt,
			endedAt,
			elapsedMs: elapsed(startedAt, endedAt),
			firstOutputMs: first ? elapsed(startedAt, first.recordedAt) : null,
			status,
			sourceActivityIds: Object.freeze(group.map(activity => activity.id)),
		};
	});
}

function projectRequests(activities: readonly ProjectActivity[], turns: readonly RootTurn[]): RequestReview[] {
	const groups = new Map<string, ProjectActivity[]>();
	for (const activity of activities) {
		const id = requestId(activity);
		if (!id) continue;
		const group = groups.get(id) ?? [];
		group.push(activity);
		groups.set(id, group);
	}
	return [...groups.entries()]
		.filter(([, group]) => group.some(activity => method(activity) === "request/submitted"))
		.map(([requestId, group], index) => {
			const submitted = group.find(activity => method(activity) === "request/submitted")!;
			const started = group.find(activity => method(activity) === "request/started");
			const terminal = group.find(activity => isRequestTerminal(method(activity)));
			const turnId = started?.nativeRefs.turnId ?? submitted.nativeRefs.turnId ?? null;
			const rootTurn = turnId ? turns.find(turn => turn.id === turnId) : undefined;
			const lifecycle = terminal ? requestLifecycle(method(terminal)) : started ? rootTurn?.endedAt ? "completed" : "running" : group.some(activity => method(activity) === "request/queued") ? "queued" : "submitted";
			const outbound = activities.find(activity =>
				activity.kind === "message"
				&& activity.nativeRefs.itemId === requestId
				&& activity.payload.direction === "outbound");
			const excerpt = outbound ? textValue(outbound.payload) : "";
			const model = typeof started?.payload.model === "string" ? started.payload.model : null;
			return Object.freeze({
				ordinal: index + 1,
				requestId,
				turnId,
				excerpt: excerpt ? bound(excerpt, 240) : null,
				excerptSourceActivityId: excerpt ? submitted.id : null,
				lifecycle,
				observedElapsedMs: terminal
					? elapsed(submitted.recordedAt, terminal.recordedAt)
					: rootTurn?.endedAt ? elapsed(submitted.recordedAt, rootTurn.endedAt) : null,
				models: Object.freeze(model ? [model] : []),
				sourceActivityIds: Object.freeze([
					...group.map(activity => activity.id),
					...(outbound ? [outbound.id] : []),
					...(rootTurn?.sourceActivityIds ?? []),
				]),
			});
		});
}

function shortlist(requests: readonly RequestReview[]): RequestReview[] {
	const selected: RequestReview[] = [];
	const add = (request: RequestReview): void => {
		if (selected.length < SHORTLIST_LIMIT && !selected.some(row => row.requestId === request.requestId)) selected.push(request);
	};
	requests.filter(request => request.lifecycle === "failed" || request.lifecycle === "cancelled" || request.lifecycle === "uncertain").forEach(add);
	[...requests].sort((left, right) => (right.observedElapsedMs ?? -1) - (left.observedElapsedMs ?? -1)).forEach(add);
	[...requests].reverse().forEach(add);
	return selected.sort((left, right) => left.ordinal - right.ordinal);
}

function retainedRequestDetails(
	requests: readonly RequestReview[],
	requestShortlist: readonly RequestReview[],
): RequestReview[] {
	const retained = new Map(requestShortlist.map(request => [request.requestId, request]));
	for (const request of requests.slice(-(DETAIL_LIMIT - retained.size))) retained.set(request.requestId, request);
	return [...retained.values()].sort((left, right) => left.ordinal - right.ordinal);
}

function projectIssue(activity: ProjectActivity, all: readonly ProjectActivity[]): Issue {
	const recovery = activity.nativeRefs.itemId
		? all.slice(all.indexOf(activity) + 1).find(candidate => candidate.nativeRefs.itemId === activity.nativeRefs.itemId && candidate.phase === "completed" && !isFailure(candidate))
		: undefined;
	return Object.freeze({ kind: "failure", activityId: activity.id, turnId: activity.nativeRefs.turnId ?? null, recordedAt: activity.recordedAt, method: method(activity), summary: failureSummary(activity), recovered: recovery !== undefined, recoveryActivityId: recovery?.id ?? null });
}

function projectUsage(snapshot: WorkbenchSnapshot): { rows: readonly ModelUsageRow[]; unattributed: { readonly totalTokens: number; readonly warning: string } | null; warning: string | null } {
	const usage = snapshot.sessionUsage;
	if (!usage) return { rows: Object.freeze([]), unattributed: null, warning: null };
	const rows: ModelUsageRow[] = [];
	for (const model of usage.models) {
		if (model.interactiveRootTurns > 0 || model.interactiveTokens > 0) {
			rows.push(Object.freeze({
				namespace: "interactive",
				model: model.model,
				effort: model.effort,
				interactiveRootTurns: model.interactiveRootTurns,
				detachedInvocations: 0,
				totalTokens: model.interactiveTokens,
			}));
		}
		if (model.detachedInvocations > 0 || model.detachedTokens > 0) {
			rows.push(Object.freeze({
				namespace: "detached",
				model: model.model,
				effort: model.effort,
				interactiveRootTurns: 0,
				detachedInvocations: model.detachedInvocations,
				totalTokens: model.detachedTokens,
			}));
		}
	}
	const warning = usage.unattributedTokens > 0 ? "Some observed tokens cannot be attributed to a model or namespace." : null;
	return { rows: Object.freeze(rows), unattributed: warning ? Object.freeze({ totalTokens: usage.unattributedTokens, warning }) : null, warning };
}

function pairedDurations(activities: readonly ProjectActivity[], predicate: (activity: ProjectActivity) => boolean): number[] {
	const started = new Map<string, string>();
	const durations: number[] = [];
	for (const activity of activities.filter(predicate)) {
		const id = activity.nativeRefs.itemId;
		if (!id) continue;
		if (activity.phase === "started") started.set(id, activity.recordedAt);
		if ((activity.phase === "completed" || activity.phase === "failed" || activity.phase === "cancelled") && started.has(id)) {
			const duration = elapsed(started.get(id)!, activity.recordedAt);
			if (duration !== null) durations.push(duration);
		}
	}
	return durations;
}

function pairedApprovalDurations(activities: readonly ProjectActivity[]): number[] {
	const started = new Map<string | number, string>();
	const durations: number[] = [];
	for (const activity of activities) {
		const id = activity.nativeRefs.approvalRequestId ?? record(activity.payload.approval)?.requestId;
		if (activity.payload.eventType === "approval-requested" && (typeof id === "string" || typeof id === "number")) started.set(id, activity.recordedAt);
		if (activity.payload.eventType === "approval-resolved" && (typeof id === "string" || typeof id === "number") && started.has(id)) {
			const duration = elapsed(started.get(id)!, activity.recordedAt);
			if (duration !== null) durations.push(duration);
		}
	}
	return durations;
}

function method(activity: ProjectActivity): string {
	return typeof activity.payload.method === "string" ? activity.payload.method : "unknown";
}

function requestId(activity: ProjectActivity): string | null {
	const id = activity.payload.requestId ?? activity.nativeRefs.itemId;
	return method(activity).startsWith("request/") && typeof id === "string" ? id : null;
}

function isTurnStarted(activity: ProjectActivity): boolean {
	return method(activity) === "turn/started" || method(activity) === "turn/start";
}

function isTurnTerminal(activity: ProjectActivity): boolean {
	return ["turn/completed", "turn/failed", "turn/cancelled", "turn/canceled", "turn/interrupted"].includes(method(activity));
}

function isRequestTerminal(value: string): boolean {
	return ["request/completed", "request/failed", "request/cancelled", "request/uncertain"].includes(value);
}

function requestLifecycle(value: string): RequestLifecycle {
	return value.slice("request/".length) as RequestLifecycle;
}

function isTool(activity: ProjectActivity): boolean {
	const item = record(record(activity.payload.params)?.item);
	const type = String(item?.type ?? "").toLowerCase();
	return activity.kind === "tool" && !type.includes("collabagent") && !method(activity).toLowerCase().includes("subagent");
}

function isRetry(activity: ProjectActivity): boolean {
	return /retry/u.test(method(activity)) || record(activity.payload.params)?.retryOf !== undefined;
}

function isWait(activity: ProjectActivity): boolean {
	const item = record(record(activity.payload.params)?.item);
	return String(item?.tool ?? "").toLowerCase() === "wait" || /(?:^|\/)wait(?:\/|$)/u.test(method(activity));
}

function isCompaction(activity: ProjectActivity): boolean {
	return /compact/u.test(method(activity));
}
function isFailure(activity: ProjectActivity): boolean { const params = record(activity.payload.params); const item = record(params?.item); const status = String(activity.payload.status ?? params?.status ?? item?.status ?? "").toLowerCase(); const error = activity.payload.error ?? params?.error ?? item?.error; const exitCode = activity.payload.exitCode ?? params?.exitCode ?? item?.exitCode; return activity.phase === "failed" || status === "failed" || status === "error" || (error !== undefined && error !== null) || (typeof exitCode === "number" && exitCode !== 0); }
function textValue(payload: Readonly<Record<string, unknown>>): string { const params = record(payload.params); const item = record(params?.item); for (const value of [payload.text, payload.content, params?.text, item?.text, item?.content]) if (typeof value === "string") return value; return ""; }
function failureSummary(activity: ProjectActivity): string { return textValue(activity.payload) || `${method(activity)} failed`; }
function noteResult(title: string, summary: string): string { return summary.split(/\r?\n/u).find(line => /^\s*결과\s*:/u.test(line))?.replace(/^\s*결과\s*:\s*/u, "") || title; }
function claim(text: string, authority: ClaimAuthority, sourceActivityIds: readonly string[]): Claim { return Object.freeze({ text: bound(text, 480), authority, sourceActivityIds: Object.freeze([...new Set(sourceActivityIds)]), independentlyVerified: false }); }
function bound(value: string, limit: number): string { return value.length > limit ? `${value.slice(0, limit)}…` : value; }
function record(value: unknown): Readonly<Record<string, unknown>> | null { return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Readonly<Record<string, unknown>> : null; }
function average(values: readonly number[]): number | null { return values.length === 0 ? null : Math.round(values.reduce((total, value) => total + value, 0) / values.length); }
function sum(values: readonly number[]): number | null { return values.length === 0 ? null : values.reduce((total, value) => total + value, 0); }
function round(value: number): number { return Math.round(value * 10) / 10; }
function countOperationIds(activities: readonly ProjectActivity[]): number { return new Set(activities.map(activity => activity.nativeRefs.itemId ?? activity.id)).size; }
function countActivities(activities: readonly ProjectActivity[]): Record<string, number> { return activities.reduce<Record<string, number>>((counts, activity) => { counts[activity.kind] = (counts[activity.kind] ?? 0) + 1; return counts; }, {}); }

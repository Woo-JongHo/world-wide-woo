import type { ProjectActivity } from "./project-activity.js";
import type { WorkbenchSessionUsage } from "./workbench.js";
import { observedCompletionPercent, sumAttributedTokens } from "./observability-metrics.js";

export const OBSERVABILITY_RECENT_SESSION_LIMIT = 12;
export const OBSERVABILITY_TREND_BUCKET_LIMIT = 3;

export type ObservabilityCoverageState = "observed" | "partial-local-journal" | "unknown";
export type ObservabilitySessionBoundary = "observed" | "unknown";
export type ObservabilitySessionResult = "completed" | "failed" | "cancelled" | "active" | "unknown";

export interface ObservabilityCoverage {
	readonly state: ObservabilityCoverageState;
	readonly observedFrom: string | null;
	readonly observedUntil: string | null;
	readonly streamsRead: number;
	readonly skippedStreams: number;
}

/** One immutable activity stream from the append-only journal. */
export interface ObservabilityActivityStream {
	readonly streamId: string;
	readonly activities: readonly ProjectActivity[];
	readonly malformedLines?: number;
}

export interface ObservabilitySessionSummary {
	readonly sessionId: string;
	readonly projectId: string | null;
	readonly boundary: ObservabilitySessionBoundary;
	readonly startedAt: string | null;
	readonly endedAt: string | null;
	readonly result: ObservabilitySessionResult;
	readonly failures: number | null;
	readonly retries: number | null;
	readonly usage: WorkbenchSessionUsage | null;
}

export interface ObservabilityModelUsage {
	readonly model: string;
	readonly effort: string | null;
	readonly totalTokens: number;
	readonly interactiveRootTurns: number;
	readonly detachedInvocations: number;
}

export interface ObservabilityTrendBucket {
	readonly date: string;
	readonly completedSessions: number;
	readonly failedSessions: number;
}

export interface ObservabilityDashboard {
	readonly coverage: ObservabilityCoverage;
	readonly sessions: { readonly active: number | null; readonly completed: number | null; readonly failures: number | null };
	readonly usage: { readonly totalTokens: number | null; readonly models: readonly ObservabilityModelUsage[] };
	readonly health: { readonly completionPercent: number | null; readonly retries: number | null; readonly failures: number | null };
	readonly trend: { readonly available: boolean; readonly buckets: readonly ObservabilityTrendBucket[] };
	readonly attention: readonly string[];
	readonly recentSessions: readonly ObservabilitySessionSummary[];
}

export function summarizeObservabilityStreams(streams: readonly ObservabilityActivityStream[]): readonly ObservabilitySessionSummary[] {
	return streams.map(stream => summarizeStream(stream));
}

/** Pure historical aggregate. It consumes only supplied journal and usage facts. */
export function projectObservabilityDashboard(
	sessions: readonly ObservabilitySessionSummary[],
	coverage: ObservabilityCoverage,
): ObservabilityDashboard {
	const ordered = [...sessions].sort((left, right) => timestamp(right.startedAt ?? right.endedAt) - timestamp(left.startedAt ?? left.endedAt) || left.sessionId.localeCompare(right.sessionId));
	const known = sessions.filter(session => session.boundary === "observed");
	const completed = known.filter(session => session.result === "completed");
	const failures = known.filter(session => session.result === "failed");
	const active = known.filter(session => session.result === "active");
	const usageSessions = sessions.filter((session): session is ObservabilitySessionSummary & { usage: WorkbenchSessionUsage } => session.usage !== null);
	const totalTokens = sumAttributedTokens(usageSessions.map(session => session.usage.totalTokens));
	const retries = known.every(session => session.retries !== null) ? known.reduce((total, session) => total + session.retries!, 0) : null;
	const failureCount = known.every(session => session.failures !== null) ? known.reduce((total, session) => total + session.failures!, 0) : null;
	const trend = projectTrend(known);
	const attention = [
		...(sessions.some(session => session.boundary === "unknown") ? ["Session boundary normalization required"] : []),
		...(failureCount !== null && failureCount > 0 ? ["Observed session failures require attention"] : []),
	];

	return Object.freeze({
		coverage: Object.freeze({ ...coverage }),
		sessions: Object.freeze({ active: known.length === 0 ? null : active.length, completed: known.length === 0 ? null : completed.length, failures: failureCount }),
		usage: Object.freeze({ totalTokens, models: Object.freeze(aggregateUsage(usageSessions)) }),
		health: Object.freeze({ completionPercent: observedCompletionPercent(completed.length, completed.length + failures.length), retries, failures: failureCount }),
		trend,
		attention: Object.freeze(attention),
		recentSessions: Object.freeze(ordered.slice(0, OBSERVABILITY_RECENT_SESSION_LIMIT)),
	});
}

function summarizeStream(stream: ObservabilityActivityStream): ObservabilitySessionSummary {
	const activities = [...stream.activities].sort((left, right) => left.sequence - right.sequence || left.recordedAt.localeCompare(right.recordedAt));
	const threadIds = new Set(activities.map(activity => activity.nativeRefs.threadId).filter((id): id is string => !!id));
	const boundary = threadIds.size === 1 && activities.length > 0 ? "observed" : "unknown";
	const terminal = [...activities].reverse().find(activity => method(activity) === "turn/completed" || method(activity).includes("failed") || method(activity).includes("cancelled"));
	const started = [...activities].reverse().find(activity => method(activity) === "turn/started" || method(activity) === "turn/start");
	const active = started !== undefined && (terminal === undefined || started.sequence > terminal.sequence);
	const result: ObservabilitySessionResult = boundary === "unknown" ? "unknown"
		: active ? "active"
		: terminal && method(terminal) === "turn/completed" ? "completed"
		: terminal && method(terminal).includes("failed") ? "failed"
		: terminal ? "cancelled" : "unknown";
	return Object.freeze({
		sessionId: threadIds.values().next().value ?? stream.streamId,
		projectId: activities[0]?.projectId ?? null,
		boundary,
		startedAt: boundary === "observed" ? activities[0]?.recordedAt ?? null : null,
		endedAt: boundary === "observed" && terminal ? terminal.recordedAt : null,
		result,
		failures: boundary === "observed" ? activities.filter(activity => method(activity).includes("failed")).length : null,
		retries: boundary === "observed" ? activities.filter(activity => method(activity).includes("retry")).length : null,
		usage: null,
	});
}

function aggregateUsage(sessions: readonly (ObservabilitySessionSummary & { usage: WorkbenchSessionUsage })[]): ObservabilityModelUsage[] {
	const rows = new Map<string, ObservabilityModelUsage>();
	for (const session of sessions) for (const usage of session.usage.models) {
		const key = `${usage.model}\u0000${usage.effort ?? ""}`;
		const current = rows.get(key);
		rows.set(key, Object.freeze({ model: usage.model, effort: usage.effort, totalTokens: (current?.totalTokens ?? 0) + usage.totalTokens, interactiveRootTurns: (current?.interactiveRootTurns ?? 0) + usage.interactiveRootTurns, detachedInvocations: (current?.detachedInvocations ?? 0) + usage.detachedInvocations }));
	}
	return [...rows.values()].sort((left, right) => right.totalTokens - left.totalTokens || left.model.localeCompare(right.model));
}

function projectTrend(sessions: readonly ObservabilitySessionSummary[]): { readonly available: boolean; readonly buckets: readonly ObservabilityTrendBucket[] } {
	const buckets = new Map<string, { completedSessions: number; failedSessions: number }>();
	for (const session of sessions) {
		if (!session.endedAt || (session.result !== "completed" && session.result !== "failed")) continue;
		const date = session.endedAt.slice(0, 10);
		const current = buckets.get(date) ?? { completedSessions: 0, failedSessions: 0 };
		if (session.result === "completed") current.completedSessions += 1;
		else current.failedSessions += 1;
		buckets.set(date, current);
	}
	const rows = [...buckets.entries()].sort(([left], [right]) => right.localeCompare(left)).slice(0, OBSERVABILITY_TREND_BUCKET_LIMIT).reverse().map(([date, value]) => Object.freeze({ date, ...value }));
	return Object.freeze({ available: rows.length >= 2, buckets: Object.freeze(rows.length >= 2 ? rows : []) });
}

function method(activity: ProjectActivity): string { return typeof activity.payload.method === "string" ? activity.payload.method : ""; }
function timestamp(value: string | null): number { const parsed = value ? Date.parse(value) : Number.NEGATIVE_INFINITY; return Number.isFinite(parsed) ? parsed : Number.NEGATIVE_INFINITY; }
function round(value: number): number { return Math.round(value * 100) / 100; }

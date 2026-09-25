import type { CacheLayerId, CacheLayerObservation } from "@/core/domain/observability/cache-telemetry.js";
import type { ProjectActivity }                     from "@/core/domain/execution/project-activity.js";
import { projectNativeDelegation }                  from "@/core/domain/work/delegation.js";

type CacheKind = "context" | "model" | "dashboard";

interface CacheAccessTelemetry {
	hits               : number        ;
	misses             : number        ;
	evictions          : number        ;
	totalMissLatencyMs : number        ;
	lastAccessedAt     : string | null ;
}

interface CacheObservationInput {
	readonly requestCached      : boolean                      ;
	readonly modelEntries       : number                       ;
	readonly modelStale         : boolean                      ;
	readonly dashboardConnected : boolean                      ;
	readonly dashboardReady     : boolean                      ;
	readonly dashboardFetched   : boolean                      ;
	readonly journal            : CacheLayerObservation | null ;
}

/** Owns Workbench projection caches and their access telemetry. */
export class WorkbenchCacheProjection {
	private readonly telemetry = {
		context   : emptyTelemetry(),
		model     : emptyTelemetry(),
		dashboard : emptyTelemetry(),
	};
	private delegationCache: {
		length   : number                                     ;
		threadId : string | null                              ;
		value    : ReturnType<typeof projectNativeDelegation> ;
	} | null = null;

	public hit(kind: CacheKind): void {
		const telemetry = this.telemetry[kind];
		telemetry.hits += 1;
		telemetry.lastAccessedAt = new Date().toISOString();
	}

	public miss(kind: CacheKind, latencyMs: number, evicted: boolean): void {
		const telemetry = this.telemetry[kind];
		telemetry.misses += 1;
		telemetry.totalMissLatencyMs += latencyMs;
		if (evicted) telemetry.evictions += 1;
		telemetry.lastAccessedAt = new Date().toISOString();
	}

	public delegation(activities: readonly ProjectActivity[], threadId: string | null): ReturnType<typeof projectNativeDelegation> {
		if (this.delegationCache?.length === activities.length && this.delegationCache.threadId === threadId) {
			this.hit("context");
			return this.delegationCache.value;
		}
		const startedAt = performance.now();
		const value = threadId ? projectNativeDelegation(activities, threadId) : [];
		this.miss("context", performance.now() - startedAt, this.delegationCache !== null);
		this.delegationCache = { length: activities.length, threadId, value };
		return value;
	}

	public observations(input: CacheObservationInput): readonly CacheLayerObservation[] {
		const observations: CacheLayerObservation[] = [
			observation("context-projection", Number(input.requestCached) + Number(this.delegationCache !== null), this.telemetry.context),
			observation("model-catalog", input.modelEntries, this.telemetry.model, input.modelStale ? "stale" : "ready"),
		];
		if (input.dashboardConnected && input.dashboardFetched) {
			observations.push(observation("dashboard-data", 1, this.telemetry.dashboard, input.dashboardReady ? "ready" : "stale"));
		}
		if (input.journal) observations.push(input.journal);
		return observations;
	}
}

function emptyTelemetry(): CacheAccessTelemetry {
	return { hits: 0, misses: 0, evictions: 0, totalMissLatencyMs: 0, lastAccessedAt: null };
}

function observation(
	id: CacheLayerId,
	entries: number,
	telemetry: CacheAccessTelemetry,
	state: "ready" | "stale" = "ready",
): CacheLayerObservation {
	return {
		id,
		state,
		entries,
		logicalBytes   : null,
		hits           : telemetry.hits,
		misses         : telemetry.misses,
		evictions      : telemetry.evictions,
		latencyMs      : telemetry.misses > 0 ? telemetry.totalMissLatencyMs / telemetry.misses : null,
		lastAccessedAt : telemetry.lastAccessedAt,
	};
}

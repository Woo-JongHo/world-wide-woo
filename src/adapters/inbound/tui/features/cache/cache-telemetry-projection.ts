import { composeCacheTelemetry }          from "@/core/domain/observability/cache-telemetry";
import type {
	CacheLayerObservation,
	CacheTelemetrySnapshot,
	TranscriptCacheMetrics,
} from "@/core/domain/observability/cache-telemetry";
import type { UsageSnapshotCacheMetrics } from "@/core/ports";

function average(total: number, count: number): number | null {
	return count > 0 ? total / count : null;
}

function transcriptObservation(metrics: TranscriptCacheMetrics): CacheLayerObservation {
	return {
		id             : "transcript",
		entries        : metrics.durableBlockCount + metrics.volatileBlockCount,
		logicalBytes   : null,
		hits           : metrics.durableCountReusedBlocks + metrics.durableGenerationNoopReuses,
		misses         : metrics.durableGraphBuilds,
		evictions      : null,
		latencyMs      : average(metrics.durableGraphBuildMs, metrics.durableGraphBuilds),
		lastAccessedAt : null,
	};
}

function renderObservation(metrics: TranscriptCacheMetrics): CacheLayerObservation {
	return {
		id             : "render",
		entries        : metrics.rowEntries + metrics.markdownEntries + metrics.widthStates,
		logicalBytes   : metrics.rowLogicalBytes + metrics.widthMetadataLogicalBytes,
		hits           : metrics.rowCacheHits + metrics.widthCacheHits,
		misses         : metrics.rowCacheMisses + metrics.widthCacheMisses,
		evictions      : metrics.rowCacheEvictions,
		latencyMs      : average(metrics.requestedMaterializationMs, metrics.requestedRows),
		lastAccessedAt : null,
	};
}

export function projectWorkbenchCacheTelemetry(input: {
	readonly transcript    : TranscriptCacheMetrics           ;
	readonly observations? : readonly CacheLayerObservation[] ;
	readonly usage?        : UsageSnapshotCacheMetrics        ;
	readonly collectedAt   : string                           ;
}): CacheTelemetrySnapshot {
	const observations: CacheLayerObservation[] = [
		transcriptObservation(input.transcript),
		renderObservation(input.transcript),
		...(input.observations ?? []),
	];
	if (input.usage && (input.usage.entries > 0 || input.usage.hits > 0 || input.usage.misses > 0 || input.usage.evictions > 0 || input.usage.lastAccessedAt !== null)) observations.push({
		id             : "usage-snapshot",
		entries        : input.usage.entries,
		logicalBytes   : null,
		hits           : input.usage.hits,
		misses         : input.usage.misses,
		evictions      : input.usage.evictions,
		latencyMs      : null,
		lastAccessedAt : input.usage.lastAccessedAt,
	});
	return composeCacheTelemetry({ collectedAt: input.collectedAt, observations });
}

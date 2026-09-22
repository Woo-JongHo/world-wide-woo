export const CACHE_LAYER_IDS = [
	"transcript",
	"render",
	"context-projection",
	"usage-snapshot",
	"model-catalog",
	"dashboard-data",
	"session-read",
] as const;

export type CacheLayerId = typeof CACHE_LAYER_IDS[number];
export type CacheLayerState = "ready" | "stale" | "unobserved";

export interface TranscriptCacheMetrics {
	readonly durableBlockCount: number;
	readonly volatileBlockCount: number;
	readonly markdownEntries: number;
	readonly rowEntries: number;
	readonly rowLogicalBytes: number;
	readonly widthStates: number;
	readonly widthMetadataLogicalBytes: number;
	readonly exactCountBuilds: number;
	readonly exactCountBuildMs: number;
	readonly requestedRows: number;
	readonly requestedMaterializationMs: number;
	readonly renderedBlocks: number;
	readonly durableGraphBuilds: number;
	readonly durableGraphBuildMs: number;
	readonly durableGenerationNoopReuses: number;
	readonly durableCountReusedBlocks: number;
	readonly durableCountRenderedBlocks: number;
	readonly rowCacheHits: number;
	readonly rowCacheMisses: number;
	readonly rowCacheEvictions: number;
	readonly widthCacheHits: number;
	readonly widthCacheMisses: number;
}

export interface CacheLayerObservation {
	readonly id: CacheLayerId;
	readonly state?: Exclude<CacheLayerState, "unobserved">;
	readonly entries: number | null;
	readonly logicalBytes: number | null;
	readonly hits: number | null;
	readonly misses: number | null;
	readonly evictions: number | null;
	readonly latencyMs: number | null;
	readonly lastAccessedAt: string | null;
}

export interface CacheLayerTelemetry extends Omit<CacheLayerObservation, "state"> {
	readonly label: string;
	readonly state: CacheLayerState;
}

export interface CacheTelemetrySnapshot {
	readonly collectedAt: string;
	readonly layers: readonly CacheLayerTelemetry[];
	readonly totals: {
		readonly entries: number | null;
		readonly logicalBytes: number | null;
		readonly hits: number | null;
		readonly misses: number | null;
		readonly evictions: number | null;
	};
}

const LABELS: Readonly<Record<CacheLayerId, string>> = {
	transcript: "Transcript",
	render: "Render",
	"context-projection": "Context Projection",
	"usage-snapshot": "Usage Snapshot",
	"model-catalog": "Model Catalog",
	"dashboard-data": "Dashboard Data",
	"session-read": "Session Read",
};

const UNOBSERVED: Omit<CacheLayerTelemetry, "id" | "label"> = {
	state: "unobserved",
	entries: null,
	logicalBytes: null,
	hits: null,
	misses: null,
	evictions: null,
	latencyMs: null,
	lastAccessedAt: null,
};

export function composeCacheTelemetry(input: {
	readonly collectedAt: string;
	readonly observations: readonly CacheLayerObservation[];
}): CacheTelemetrySnapshot {
	const observed = new Map<CacheLayerId, CacheLayerObservation>();
	for (const observation of input.observations) {
		if (observed.has(observation.id)) throw new Error(`Duplicate cache layer observation: ${observation.id}`);
		observed.set(observation.id, observation);
	}
	const layers = CACHE_LAYER_IDS.map(id => {
		const observation = observed.get(id);
		return observation
			? { ...observation, label: LABELS[id], state: observation.state ?? "ready" }
			: { id, label: LABELS[id], ...UNOBSERVED };
	});
	const sum = (key: "entries" | "logicalBytes" | "hits" | "misses" | "evictions") => {
		const values = layers.flatMap(layer => layer[key] ?? []);
		return values.length ? values.reduce((total, value) => total + value, 0) : null;
	};
	return {
		collectedAt: input.collectedAt,
		layers,
		totals: {
			entries: sum("entries"),
			logicalBytes: sum("logicalBytes"),
			hits: sum("hits"),
			misses: sum("misses"),
			evictions: sum("evictions"),
		},
	};
}

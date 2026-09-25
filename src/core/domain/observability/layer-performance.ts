export const PERFORMANCE_LAYER_IDS = [
	"native-receive",
	"event-queue",
	"state-projection",
	"snapshot-publish",
	"render-schedule",
	"layout-materialize",
	"terminal-write",
] as const;

export type PerformanceLayerId = typeof PERFORMANCE_LAYER_IDS[number];
export type PerformanceBoundary = "queued" | "started" | "completed" | "failed";

export interface PerformanceObservation {
	readonly traceId  : string              ;
	readonly layerId  : PerformanceLayerId  ;
	readonly boundary : PerformanceBoundary ;
	readonly atMs     : number              ;
}

export interface PerformanceLayerSample {
	readonly layerId : PerformanceLayerId ;
	readonly waitMs  : number | null      ;
	readonly workMs  : number | null      ;
	readonly failed  : boolean            ;
}

export interface PerformanceTrace {
	readonly traceId : string                                ;
	readonly state   : "collecting" | "complete" | "partial" ;
	readonly totalMs : number | null                         ;
	readonly layers  : readonly PerformanceLayerSample[]     ;
}

export interface PerformancePercentiles {
	readonly count : number        ;
	readonly p50   : number | null ;
	readonly p95   : number | null ;
	readonly p99   : number | null ;
}

export interface PerformanceWindow {
	readonly traceCount: number;
	readonly errorCount: number;
	readonly layers    : Readonly<Record<PerformanceLayerId, {
		readonly wait: PerformancePercentiles;
		readonly work: PerformancePercentiles;
	}>>;
}

interface LayerBoundaries {
	queued?    : number ;
	started?   : number ;
	completed? : number ;
	failed?    : number ;
}

/** Bounded, monotonic trace recorder. Invalid or duplicate boundaries are rejected. */
export class LayerPerformanceRecorder {
	private readonly traces = new Map<string, Map<PerformanceLayerId, LayerBoundaries>>();
	private readonly order: string[] = [];

	public constructor(private readonly capacity = 128) {
		if (!Number.isInteger(capacity) || capacity < 1) throw new Error("Layer telemetry capacity must be a positive integer.");
	}

	public observe(observation: PerformanceObservation): void {
		if (!Number.isFinite(observation.atMs) || observation.atMs < 0) throw new Error("Layer telemetry requires a finite monotonic timestamp.");
		const layers = this.trace(observation.traceId);
		const current = layers.get(observation.layerId) ?? {};
		if (current[observation.boundary] !== undefined) return;
		const previous = latestBoundary(current);
		if (previous !== null && observation.atMs < previous) throw new Error("Layer telemetry timestamp moved backwards.");
		layers.set(observation.layerId, { ...current, [observation.boundary]: observation.atMs });
	}

	public project(traceId: string): PerformanceTrace | null {
		const trace = this.traces.get(traceId);
		if (!trace) return null;
		const layers   = PERFORMANCE_LAYER_IDS.map(layerId => sample(layerId, trace.get(layerId)))              ;
		const complete = layers.every(layer => layer.waitMs !== null && layer.workMs !== null && !layer.failed) ;
		const terminal = trace.get("terminal-write")                                                            ;
		const ended    = terminal?.completed ?? terminal?.failed                                                ;
		const started  = trace.get("native-receive")?.started                                                   ;
		return Object.freeze({
			traceId,
			state   : complete ? "complete" : ended === undefined ? "collecting" : "partial",
			totalMs : started !== undefined && ended !== undefined && ended >= started ? ended - started : null,
			layers  : Object.freeze(layers),
		});
	}

	public latest(): PerformanceTrace | null {
		const traceId = this.order.at(-1);
		return traceId ? this.project(traceId) : null;
	}

	public window(): PerformanceWindow {
		const projected = this.order.flatMap(traceId => {
			const trace = this.project(traceId);
			return trace ? [trace] : [];
		});
		const layers = Object.fromEntries(PERFORMANCE_LAYER_IDS.map(layerId => {
			const samples = projected.flatMap(trace => {
				const layer = trace.layers.find(candidate => candidate.layerId === layerId);
				return layer ? [layer] : [];
			});
			const wait = samples.flatMap(layer => layer.waitMs === null ? [] : [layer.waitMs]);
			const work = samples.flatMap(layer => layer.workMs === null ? [] : [layer.workMs]);
			return [layerId, Object.freeze({ wait: percentiles(wait), work: percentiles(work) })];
		})) as PerformanceWindow["layers"];
		return Object.freeze({
			traceCount : projected.length,
			errorCount : projected.filter(trace => trace.layers.some(layer => layer.failed)).length,
			layers     : Object.freeze(layers),
		});
	}

	private trace(traceId: string): Map<PerformanceLayerId, LayerBoundaries> {
		if (!traceId.trim()) throw new Error("Layer telemetry requires a trace identity.");
		const existing = this.traces.get(traceId);
		if (existing) return existing;
		const created = new Map<PerformanceLayerId, LayerBoundaries>();
		this.traces.set(traceId, created);
		this.order.push(traceId);
		while (this.order.length > this.capacity) {
			const oldest = this.order.shift();
			if (oldest) this.traces.delete(oldest);
		}
		return created;
	}
}

function percentiles(values: readonly number[]): PerformancePercentiles {
	const sorted = [...values].sort((left, right) => left - right);
	return Object.freeze({ count: sorted.length, p50: percentile(sorted, 0.50), p95: percentile(sorted, 0.95), p99: percentile(sorted, 0.99) });
}

function percentile(sorted: readonly number[], ratio: number): number | null {
	if (!sorted.length) return null;
	return sorted[Math.ceil(sorted.length * ratio) - 1] ?? null;
}

function latestBoundary(value: LayerBoundaries): number | null {
	const observed = [value.queued, value.started, value.completed, value.failed].filter((item): item is number => item !== undefined);
	return observed.length ? Math.max(...observed) : null;
}

function sample(layerId: PerformanceLayerId, value: LayerBoundaries | undefined): PerformanceLayerSample {
	const ended = value?.completed ?? value?.failed;
	return Object.freeze({
		layerId,
		waitMs : value?.queued !== undefined && value.started !== undefined ? value.started - value.queued : null,
		workMs : value?.started !== undefined && ended !== undefined ? ended - value.started : null,
		failed : value?.failed !== undefined,
	});
}

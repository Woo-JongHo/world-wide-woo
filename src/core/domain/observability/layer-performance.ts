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

export const SLOW_RENDER_THRESHOLD_MS = 100;

export interface PerformanceObservation {
	readonly traceId  : string              ;
	readonly layerId  : PerformanceLayerId  ;
	/** For terminal-write, completed means Terminal.write returned synchronously; it does not mean OS flush. */
	readonly boundary : PerformanceBoundary ;
	readonly atMs     : number              ;
	/** Shared by every event trace whose visible changes materialize in one terminal frame. */
	readonly frameId? : string              ;
}

export interface PerformanceLayerSample {
	readonly layerId : PerformanceLayerId ;
	readonly waitMs  : number | null      ;
	readonly workMs  : number | null      ;
	readonly failed  : boolean            ;
	readonly frameId : string | null      ;
}

export interface PerformanceTrace {
	readonly traceId    : string                                              ;
	readonly state      : "collecting" | "complete" | "partial" | "no-render" ;
	readonly totalMs    : number | null                                       ;
	readonly renderMs   : number | null                                       ;
	readonly slowRender : boolean                                             ;
	readonly layers     : readonly PerformanceLayerSample[]                   ;
}

export interface PerformancePercentiles {
	readonly count : number        ;
	readonly p50   : number | null ;
	readonly p95   : number | null ;
	readonly p99   : number | null ;
}

export interface PerformanceWindow {
	readonly traceCount      : number ;
	readonly completeCount   : number ;
	readonly noRenderCount   : number ;
	readonly incompleteCount : number ;
	readonly errorCount      : number ;
	readonly render          : {
		readonly thresholdMs  : number                 ;
		readonly frameCount   : number                 ;
		readonly slowCount    : number                 ;
		readonly slowRate     : number                 ;
		readonly latency      : PerformancePercentiles ;
		readonly worstMs      : number | null          ;
		readonly worstFrameId : string | null          ;
	};
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
	frameId?   : string ;
}

/** Bounded, monotonic trace recorder. Invalid or duplicate boundaries are rejected. */
export class LayerPerformanceRecorder {
	private readonly traces          = new Map<string, Map<PerformanceLayerId, LayerBoundaries>>() ;
	private readonly noRender        = new Set<string>()                                           ;
	private readonly order: string[] = []                                                          ;

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
		if (observation.frameId && current.frameId && observation.frameId !== current.frameId) throw new Error("Layer telemetry changed terminal frame identity.");
		layers.set(observation.layerId, {
			...current,
			[observation.boundary] : observation.atMs,
			...(observation.frameId ? { frameId: observation.frameId } : {}),
		});
	}

	/** Marks a Native event that intentionally produced no Snapshot and therefore no terminal frame. */
	public markNoRender(traceId: string): void {
		if (!this.traces.has(traceId)) throw new Error("Layer telemetry cannot suppress an unknown trace.");
		this.noRender.add(traceId);
	}

	public project(traceId: string): PerformanceTrace | null {
		const trace = this.traces.get(traceId);
		if (!trace) return null;
		const layers        = PERFORMANCE_LAYER_IDS.map(layerId => sample(layerId, trace.get(layerId)))                                                     ;
		const complete      = layers.every(layer => layer.waitMs !== null && layer.workMs !== null && !layer.failed)                                        ;
		const terminal      = trace.get("terminal-write")                                                                                                   ;
		const ended         = terminal?.completed ?? terminal?.failed                                                                                       ;
		const started       = trace.get("native-receive")?.started                                                                                          ;
		const renderStarted = trace.get("render-schedule")?.queued                                                                                          ;
		const renderEnded   = terminal?.completed                                                                                                           ;
		const renderMs      = renderStarted !== undefined && renderEnded !== undefined && renderEnded >= renderStarted ? renderEnded - renderStarted : null ;
		return Object.freeze({
			traceId,
			state   : complete ? "complete" : this.noRender.has(traceId) ? "no-render" : ended === undefined ? "collecting" : "partial",
			totalMs : started !== undefined && ended !== undefined && ended >= started ? ended - started : null,
			renderMs,
			slowRender : renderMs !== null && renderMs > SLOW_RENDER_THRESHOLD_MS,
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
		const frames     = renderFrames(projected)                                                ;
		const slowFrames = frames.filter(frame => frame.latencyMs > SLOW_RENDER_THRESHOLD_MS)     ;
		const worst      = [...frames].sort((left, right) => right.latencyMs - left.latencyMs)[0] ;
		return Object.freeze({
			traceCount      : projected.length,
			completeCount   : projected.filter(trace => trace.state === "complete").length,
			noRenderCount   : projected.filter(trace => trace.state === "no-render").length,
			incompleteCount : projected.filter(trace => trace.state === "collecting" || trace.state === "partial").length,
			errorCount      : projected.filter(trace => trace.layers.some(layer => layer.failed)).length,
			render          : Object.freeze({
				thresholdMs  : SLOW_RENDER_THRESHOLD_MS,
				frameCount   : frames.length,
				slowCount    : slowFrames.length,
				slowRate     : frames.length ? Math.round(slowFrames.length / frames.length * 1_000) / 10 : 0,
				latency      : percentiles(frames.map(frame => frame.latencyMs)),
				worstMs      : worst?.latencyMs ?? null,
				worstFrameId : worst?.frameId ?? null,
			}),
			layers          : Object.freeze(layers),
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
			if (oldest) {
				this.traces.delete(oldest);
				this.noRender.delete(oldest);
			}
		}
		return created;
	}
}

interface RenderFrameSample {
	readonly frameId   : string ;
	readonly latencyMs : number ;
}

function renderFrames(traces: readonly PerformanceTrace[]): RenderFrameSample[] {
	const frames = new Map<string, number>();
	for (const trace of traces) {
		if (trace.renderMs === null) continue;
		const frameId = trace.layers.find(layer => layer.layerId === "terminal-write")?.frameId ?? trace.traceId;
		frames.set(frameId, Math.max(frames.get(frameId) ?? 0, trace.renderMs));
	}
	return [...frames].map(([frameId, latencyMs]) => Object.freeze({ frameId, latencyMs }));
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
		waitMs  : value?.queued !== undefined && value.started !== undefined ? value.started - value.queued : null,
		workMs  : value?.started !== undefined && ended !== undefined ? ended - value.started : null,
		failed  : value?.failed !== undefined,
		frameId : value?.frameId ?? null,
	});
}

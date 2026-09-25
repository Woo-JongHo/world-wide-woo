import { describe, expect, test }                          from "bun:test";
import { LayerPerformanceRecorder, PERFORMANCE_LAYER_IDS } from "../src/core/domain/observability/layer-performance";

describe("LayerPerformanceRecorder", () => {
	test("projects seven observed wait/work stages without summing them as end-to-end", () => {
		const recorder = new LayerPerformanceRecorder();
		let at = 10;
		for (const layerId of PERFORMANCE_LAYER_IDS) {
			recorder.observe({ traceId: "turn-1", layerId, boundary: "queued", atMs: at });
			recorder.observe({ traceId: "turn-1", layerId, boundary: "started", atMs: at + 2 });
			recorder.observe({ traceId: "turn-1", layerId, boundary: "completed", atMs: at + 5 });
			at += 7;
		}
		const trace = recorder.project("turn-1")!;
		expect(trace.state).toBe("complete");
		expect(trace.totalMs).toBe(45);
		expect(trace.layers).toHaveLength(7);
		expect(trace.layers.every(layer => layer.waitMs === 2 && layer.workMs === 3)).toBe(true);
	});

	test("keeps missing boundaries unknown and a terminal trace partial", () => {
		const recorder = new LayerPerformanceRecorder();
		recorder.observe({ traceId: "turn-2", layerId: "native-receive", boundary: "started", atMs: 1 });
		recorder.observe({ traceId: "turn-2", layerId: "terminal-write", boundary: "failed", atMs: 8 });
		const trace = recorder.latest()!;
		expect(trace.state).toBe("partial");
		expect(trace.layers[0]?.waitMs).toBeNull();
		expect(trace.layers.at(-1)?.failed).toBe(true);
	});

	test("ignores duplicate boundaries, rejects backwards clocks and bounds retained traces", () => {
		const recorder = new LayerPerformanceRecorder(1);
		recorder.observe({ traceId: "old", layerId: "event-queue", boundary: "started", atMs: 5 });
		recorder.observe({ traceId: "old", layerId: "event-queue", boundary: "started", atMs: 6 });
		expect(recorder.project("old")?.layers[1]?.workMs).toBeNull();
		expect(() => recorder.observe({ traceId: "old", layerId: "event-queue", boundary: "completed", atMs: 4 })).toThrow("backwards");
		recorder.observe({ traceId: "new", layerId: "native-receive", boundary: "started", atMs: 9 });
		expect(recorder.project("old")).toBeNull();
	});

	test("summarizes observed samples without inventing missing percentiles", () => {
		const recorder = new LayerPerformanceRecorder();
		for (const [traceId, queued, started, completed] of [["a", 0, 1, 11], ["b", 15, 20, 50]] as const) {
			recorder.observe({ traceId, layerId: "state-projection", boundary: "queued", atMs: queued });
			recorder.observe({ traceId, layerId: "state-projection", boundary: "started", atMs: started });
			recorder.observe({ traceId, layerId: "state-projection", boundary: "completed", atMs: completed });
		}
		const window = recorder.window();
		expect(window.traceCount).toBe(2);
		expect(window.layers["state-projection"]).toEqual({
			wait: { count: 2, p50: 1, p95: 5, p99: 5 },
			work: { count: 2, p50: 10, p95: 30, p99: 30 },
		});
		expect(window.layers["terminal-write"]).toEqual({
			wait: { count: 0, p50: null, p95: null, p99: null },
			work: { count: 0, p50: null, p95: null, p99: null },
		});
	});
});

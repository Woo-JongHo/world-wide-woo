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
		expect(trace.state                                                          ).toBe        ("complete") ;
		expect(trace.totalMs                                                        ).toBe        (45        ) ;
		expect(trace.layers                                                         ).toHaveLength(7         ) ;
		expect(trace.layers.every(layer => layer.waitMs === 2 && layer.workMs === 3)).toBe        (true      ) ;
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

	test("attributes layout and synchronous terminal write failures to different layers", () => {
		const recorder = new LayerPerformanceRecorder();
		recorder.observe({ traceId: "layout-failure", layerId: "layout-materialize", boundary: "started", atMs: 1, frameId: "frame-1" });
		recorder.observe({ traceId: "layout-failure", layerId: "layout-materialize", boundary: "failed", atMs: 2, frameId: "frame-1" });
		recorder.observe({ traceId: "write-failure", layerId: "terminal-write", boundary: "started", atMs: 3, frameId: "frame-2" });
		recorder.observe({ traceId: "write-failure", layerId: "terminal-write", boundary: "failed", atMs: 4, frameId: "frame-2" });

		const layout = recorder.project("layout-failure")!;
		const write  = recorder.project("write-failure")!  ;
		expect(layout.layers.find(layer => layer.layerId === "layout-materialize")?.failed).toBe(true ) ;
		expect(layout.layers.find(layer => layer.layerId === "terminal-write")?.failed    ).toBe(false) ;
		expect(write.layers.find(layer => layer.layerId === "layout-materialize")?.failed ).toBe(false) ;
		expect(write.layers.find(layer => layer.layerId === "terminal-write")?.failed     ).toBe(true ) ;
	});

	test("distinguishes an intentional no-render event from missing render instrumentation", () => {
		const recorder = new LayerPerformanceRecorder();
		recorder.observe({ traceId: "ignored", layerId: "native-receive", boundary: "started", atMs: 1 });
		recorder.observe({ traceId: "ignored", layerId: "native-receive", boundary: "completed", atMs: 2 });
		recorder.markNoRender("ignored");

		recorder.observe({ traceId: "unwired", layerId: "native-receive", boundary: "started", atMs: 3 });
		recorder.observe({ traceId: "unwired", layerId: "native-receive", boundary: "completed", atMs: 4 });

		expect(recorder.project("ignored")?.state).toBe         ("no-render"                                                                             ) ;
		expect(recorder.project("unwired")?.state).toBe         ("collecting"                                                                            ) ;
		expect(recorder.window()                 ).toMatchObject({ traceCount: 2, completeCount: 0, noRenderCount: 1, incompleteCount: 1, errorCount: 0 }) ;
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

	test("groups coalesced traces by terminal frame and detects slow render latency", () => {
		const recorder = new LayerPerformanceRecorder();
		const render = (traceId: string, frameId: string, queuedAt: number, completedAt: number): void => {
			recorder.observe({ traceId, layerId: "render-schedule", boundary: "queued", atMs: queuedAt });
			recorder.observe({ traceId, layerId: "render-schedule", boundary: "started", atMs: queuedAt + 1 });
			recorder.observe({ traceId, layerId: "render-schedule", boundary: "completed", atMs: queuedAt + 2 });
			recorder.observe({ traceId, layerId: "layout-materialize", boundary: "started", atMs: queuedAt + 3, frameId });
			recorder.observe({ traceId, layerId: "layout-materialize", boundary: "completed", atMs: queuedAt + 4, frameId });
			recorder.observe({ traceId, layerId: "terminal-write", boundary: "started", atMs: completedAt - 1, frameId });
			recorder.observe({ traceId, layerId: "terminal-write", boundary: "completed", atMs: completedAt, frameId });
		};
		render("coalesced-old", "frame-1", 0, 150);
		render("coalesced-new", "frame-1", 20, 150);
		render("fast", "frame-2", 200, 240);

		expect(recorder.window().render).toEqual({
			thresholdMs  : 100,
			frameCount   : 2,
			slowCount    : 1,
			slowRate     : 50,
			latency      : { count: 2, p50: 40, p95: 150, p99: 150 },
			worstMs      : 150,
			worstFrameId : "frame-1",
		});
	});

	test("keeps failed terminal writes out of render health latency samples", () => {
		const recorder = new LayerPerformanceRecorder();
		recorder.observe({ traceId: "failed", layerId: "render-schedule", boundary: "queued", atMs: 0 });
		recorder.observe({ traceId: "failed", layerId: "terminal-write", boundary: "started", atMs: 1, frameId: "frame-failed" });
		recorder.observe({ traceId: "failed", layerId: "terminal-write", boundary: "failed", atMs: 500, frameId: "frame-failed" });

		expect(recorder.project("failed")).toMatchObject({ state: "partial", renderMs: null, slowRender: false });
		expect(recorder.window()).toMatchObject({ errorCount: 1, render: { frameCount: 0, slowCount: 0, worstMs: null } });
	});
});

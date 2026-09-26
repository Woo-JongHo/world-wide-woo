import { describe, expect, test }                          from "bun:test";
import { stripTerminalSequences }                          from "@earendil-works/pi-tui";
import { LayerPerformanceRecorder, PERFORMANCE_LAYER_IDS } from "../src/core/domain/observability/layer-performance";
import type { PerformanceObservation }                     from "../src/core/domain/observability/layer-performance";
import { projectRuntimeMonitor }                           from "../src/core/domain/observability/runtime-monitor";
import { duration, telemetryDuration }                     from "../src/adapters/inbound/tui/foundation/theme/www-theme";
import { WwwMonitorView }                                  from "../src/adapters/inbound/tui/features/monitoring/view/www-monitor-view";
import { WwwDashboardView }                                from "../src/adapters/inbound/tui/features/dashboard/view/entry-dashboard-view";
import { wwwFixture }                                      from "./fixtures/www-snapshot";

/** A production-shaped complete trace; every boundary lands below one second, as in real frames. */
function recordCompleteSubSecondTrace(): LayerPerformanceRecorder {
	const recorder = new LayerPerformanceRecorder() ;
	const traceId  = "turn-diag:event-1"            ;
	let at         = 1000                           ;
	const observe = (layerId: PerformanceObservation["layerId"], boundary: PerformanceObservation["boundary"]): void => {
		recorder.observe({ traceId, layerId, boundary, atMs: (at += 0.3) });
	};
	observe("native-receive", "queued");
	observe("native-receive", "started");
	observe("native-receive", "completed");
	observe("event-queue", "queued");
	observe("event-queue", "started");
	observe("state-projection", "queued");
	observe("state-projection", "started");
	observe("state-projection", "completed");
	observe("snapshot-publish", "queued");
	observe("snapshot-publish", "started");
	observe("snapshot-publish", "completed");
	observe("event-queue", "completed");
	observe("render-schedule", "queued");
	observe("render-schedule", "started");
	observe("render-schedule", "completed");
	observe("layout-materialize", "queued");
	observe("terminal-write", "queued");
	observe("layout-materialize", "started");
	observe("layout-materialize", "completed");
	observe("terminal-write", "started");
	observe("terminal-write", "completed");
	return recorder;
}

describe("telemetry duration formatting", () => {
	test("request duration keeps second flooring for elapsed labels", () => {
		expect(duration(0.4)).toBe("0s");
		expect(duration(950)).toBe("0s");
		expect(duration(1_234)).toBe("1s");
	});

	test("telemetry duration preserves sub-second milliseconds", () => {
		expect(telemetryDuration(null)).toBe("—");
		expect(telemetryDuration(0.02)).toBe("0.02ms");
		expect(telemetryDuration(3.3)).toBe("3.3ms");
		expect(telemetryDuration(42)).toBe("42ms");
		expect(telemetryDuration(1_234)).toBe("1s");
	});

	test("Monitor renders complete sub-second traces with millisecond layer values, never all-zero seconds", () => {
		const recorder  = recordCompleteSubSecondTrace();
		const current   = recorder.latest();
		if (!current) throw new Error("expected a projected trace");
		expect(current.state).toBe("complete");
		const snapshot   = { ...wwwFixture("ready"), layerPerformance: { current, window: recorder.window() } } as const     ;
		const projection = projectRuntimeMonitor(snapshot as never, snapshot.activities, snapshot.layerPerformance as never) ;
		const rows       = new WwwMonitorView(() => projection).render(96).map(stripTerminalSequences)                       ;
		const layerRows  = rows.filter(row => PERFORMANCE_LAYER_IDS.some(layerId => row.includes(layerId)))                  ;
		expect(layerRows.length).toBe(PERFORMANCE_LAYER_IDS.length);
		expect(layerRows.some(row => /wait 0s · work 0s/u.test(row))).toBe(false);
		expect(layerRows.some(row => /\d+(?:\.\d+)?ms/u.test(row))).toBe(true);
	});

	test("Dashboard slowest P95 reports milliseconds below one second", () => {
		const recorder = recordCompleteSubSecondTrace()                                                                                   ;
		const snapshot = { ...wwwFixture("ready"), layerPerformance: { current: recorder.latest(), window: recorder.window() } } as const ;
		const rows     = new WwwDashboardView(() => snapshot as never).render(96).map(stripTerminalSequences)                             ;
		const p95      = rows.find(row => row.includes("SLOWEST P95"))                                                                    ;
		if (!p95) throw new Error("expected a SLOWEST P95 row");
		expect(p95).toContain("ms");
		expect(p95).not.toContain("0s");
	});
});

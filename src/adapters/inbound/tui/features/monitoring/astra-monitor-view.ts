import type { Component }                         from "@earendil-works/pi-tui";
import type { RuntimeMonitorProjection }          from "@/core/domain/observability/runtime-monitor";
import { a, duration, fit, prose, safe, section } from "@/adapters/inbound/tui/foundation/theme/astra-theme";
import {
	requestRuntimeMotionActive,
	requestRuntimeRows,
} from "@/adapters/inbound/tui/features/monitoring/request-runtime-view";

function document(rows: string[], width: number): string[] { return rows.flatMap(row => prose(row, width)); }
function kv(label: string, value: unknown): string { return `${a.muted(fit(label, 20))} ${a.text(safe(value ?? "—"))}`; }
function monitorAge(value: { readonly startedAt: string; readonly elapsedMs: number | null } | null | undefined): string {
	if (!value) return "미관측";
	return value.elapsedMs === null ? `${duration(Math.max(0, Date.now() - Date.parse(value.startedAt)))} / 종료 미관측` : duration(value.elapsedMs);
}

export class AstraMonitorView implements Component {
	constructor(private readonly get: () => RuntimeMonitorProjection, private readonly clock = Date.now, private readonly motion = true) {}
	invalidate(): void {}
	render(width: number): string[] {
		const m = this.get();
		const rows = section("Activity", width, m.state);
		if (m.requestRuntime) {
			const now = this.clock();
			const frame = this.motion && requestRuntimeMotionActive(m.requestRuntime, now) ? Math.floor(now / 120) : 8;
			rows.push(...requestRuntimeRows(m.requestRuntime, width, false, frame));
		}
		rows.push(kv("현재 요청", m.activeRequest?.label), kv("모델", m.model), kv("Agent", m.agent), kv("도구", m.currentTool?.label), kv("승인", m.approval?.pending ? "결정 필요" : "대기 요청 없음"), kv("재시도 / 실패", `${m.retryCount} / ${m.failureCount}`));
		if (m.activeRequest) rows.push(kv("요청 관측 경과", monitorAge(m.activeRequest.elapsed)));
		if (m.currentTool) rows.push(kv("도구 관측 경과", monitorAge(m.currentTool.elapsed)));
		if (m.approval?.pending) rows.push(kv("승인 관측 경과", monitorAge(m.approval.elapsed)));
		if (m.skillRun) rows.push(...section("Skill 실행", width), ...prose(a.muted(safe(JSON.stringify(m.skillRun, null, 2), 10_000)), width));
		if (m.layerPerformance?.current) {
			const trace = m.layerPerformance.current;
			rows.push(...section("Layer Performance", width, `${trace.state} · ${trace.totalMs === null ? "total 미관측" : duration(trace.totalMs)}`));
			for (const layer of trace.layers) {
				const wait = layer.waitMs === null ? "미관측" : duration(layer.waitMs);
				const work = layer.workMs === null ? "미관측" : duration(layer.workMs);
				rows.push(kv(layer.layerId, `wait ${wait} · work ${work}${layer.failed ? " · 실패" : ""}`));
			}
			const window = m.layerPerformance.window;
			rows.push(kv("Window", `${window.traceCount} traces · ${window.errorCount} trace failures`));
		}
		rows.push(...section("최근 이벤트", width, `${m.recentEvents.length}개`));
		for (const event of m.recentEvents) rows.push(`${a.muted(safe(event.recordedAt.slice(11, 19)))}  ${a.active(safe(event.kind.toLowerCase()))}`, `  ${safe(event.label)}`, a.muted(`  /source ${safe(event.activityId)}`), "");
		if (!m.recentEvents.length) rows.push(a.muted("실행 이벤트가 아직 관측되지 않았습니다."));
		return document(rows, width);
	}
}

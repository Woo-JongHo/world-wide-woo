import type { Component }                      from "@earendil-works/pi-tui";
import type { RuntimeMonitorProjection }       from "@/core/domain/observability/runtime-monitor";
import type { RequestRuntimeRecord }           from "@/core/domain/execution/request-runtime";
import type { ProjectActivity }                from "@/core/domain/execution/project-activity";
import type { WorkbenchSnapshot }              from "@/core/domain/work/workbench";
import {
	a,
	duration,
	fit,
	pair,
	prose,
	safe,
	section,
	telemetryDuration,
	wwwTitle,
} from "@/adapters/inbound/tui/foundation/theme/www-theme";

function document(rows: string[], width: number): string[] { return rows.flatMap(row => prose(row, width)); }
function kv(label: string, value: unknown): string { return `${a.muted(fit(label, 20))} ${a.text(safe(value ?? "—"))}`; }
function monitorAge(value: { readonly startedAt: string; readonly elapsedMs: number | null } | null | undefined): string {
	if (!value) return "미관측";
	return value.elapsedMs === null ? `${duration(Math.max(0, Date.now() - Date.parse(value.startedAt)))} / 종료 미관측` : duration(value.elapsedMs);
}
function stageMark(status: string): string {
	if (status === "completed" || status === "skipped") return "✓";
	if (status === "running") return "●";
	if (status === "failed") return "×";
	if (status === "blocked") return "Ⅱ";
	return "○";
}
function stageInk(status: string): (text: string) => string {
	if (status === "completed") return a.success;
	if (status === "running") return a.active;
	if (status === "failed" || status === "blocked") return a.failure;
	return a.muted;
}
function elapsedSince(startedAtMs: number, now: number): string { return duration(Math.max(0, now - startedAtMs)); }
function offsetClock(offsetMs: number): string {
	const totalSeconds = Math.max(0, Math.floor(offsetMs / 1000))  ;
	const minutes      = Math.floor(totalSeconds / 60)             ;
	const seconds      = totalSeconds % 60                         ;
	return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

/** Figma Monitor(142:3891): 요청 요약 스트립, 워터폴, 트레이스 트리, 결정 타임라인, 실패 테이블.
 *  모든 행은 실측 데이터(requestRuntime 이벤트·스테이지 시각·활동 저널)에서만 만들고,
 *  관측되지 않은 값은 미관측으로 표시한다. */
export class WwwMonitorView implements Component {
	constructor(
		private readonly get         : () => RuntimeMonitorProjection  ,
		private readonly clock       = Date.now                        ,
		private readonly motion      = true                            ,
		private readonly getSnapshot : (() => WorkbenchSnapshot) | null = null,
	) {}
	invalidate(): void {}

	render(width: number): string[] {
		const m        = this.get()                             ;
		const snapshot = this.getSnapshot?.() ?? null           ;
		const rows     = this.summaryStrip(m, snapshot, width)  ;
		const request  = m.requestRuntime ?? null               ;
		if (request) {
			rows.push(...this.waterfall(request, snapshot, width));
			rows.push(...this.traceTree(request, snapshot, width));
		}
		rows.push(...this.decisionsSection(request, width));
		rows.push(...this.failuresSection(request, m, width));
		rows.push(...this.layerSection(m, width));
		rows.push(...this.recentEventsSection(m, width));
		return document(rows, width);
	}

	/** run-summary-strip: RUN 번호·상태·경과와 MODEL/TOOL/FAILURE/RETRY/TOKENS/CONTEXT 카운터. */
	private summaryStrip(m: RuntimeMonitorProjection, snapshot: WorkbenchSnapshot | null, width: number): string[] {
		const request   = m.requestRuntime                                                                                                       ;
		const startedAt = request?.startedAt ? Date.parse(request.startedAt) : null                                                              ;
		const running   = request?.status === "running"                                                                                          ;
		const elapsed   = startedAt !== null ? elapsedSince(startedAt, this.clock()) : duration(null)                                            ;
		const stateInk  = running ? a.active : request?.status === "completed" ? a.success : request?.status === "failed" ? a.failure : a.muted  ;
		const stateText = request?.status === "running" ? `● RUNNING ${elapsed}`
			: request?.status === "completed" ? `✓ COMPLETED ${elapsed}`
			: request?.status === "failed" ? `✕ FAILED ${elapsed}`
			: request ? `○ ${request.status.toUpperCase()} ${elapsed}`
			: "○ IDLE";
		const tokens    = snapshot?.sessionUsage?.totalTokens ;
		const context   = snapshot?.contextUsage?.percent     ;
		const counters  = [
			`MODEL ${m.model ?? "—"}`,
			`TOOL ${m.currentTool?.label ?? "—"}`,
			`FAILURE ${m.failureCount}`,
			`RETRY ${m.retryCount}`,
			`TOKENS ${tokens === undefined ? "—" : safe(String(tokens))}`,
			`CONTEXT ${context === undefined ? "—" : `${context}%`}`,
		].join(a.muted(" │ "));
		return [
			pair(`${a.strong(`RUN #${snapshot?.journalSequence ?? 0}`)}  ${stateInk(stateText)}`, a.muted(`Agent ${m.agent ?? "—"}`), width),
			a.muted(counters),
		];
	}

	/** RUN TRACE WATERFALL: 요청 시작 기준 오프셋에 스테이지·도구 활동을 누적 배치한다. */
	private waterfall(request: RequestRuntimeRecord, snapshot: WorkbenchSnapshot | null, width: number): string[] {
		const rows = [pair(wwwTitle("RUN TRACE WATERFALL", a.plan), a.muted(`attempt ${request.attempt}`), width)];
		const start = request.startedAt ? Date.parse(request.startedAt) : null;
		if (start === null) return [...rows, a.muted("요청 시작 시각이 관측되지 않았습니다.")];
		const end       = request.completedAt ? Date.parse(request.completedAt) : this.clock()         ;
		const windowMs  = Math.max(1, end - start)                                                     ;
		const plotWidth = Math.max(10, width - 20)                                                     ;
		const toCell    = (offsetMs: number): number => Math.round((offsetMs / windowMs) * plotWidth)  ;

		const axisMarks: string[] = [];
		const axisCells = Math.max(1, plotWidth);
		for (let cell = 0; cell <= axisCells; cell += 1) {
			const at = start + (cell / axisCells) * windowMs;
			axisMarks.push(at % 60_000 < windowMs / axisCells ? "┊" : " ");
		}
		rows.push(a.muted(`  ${axisMarks.join("")}`));

		const toolRows: { offset: number; label: string; failed: boolean }[] = [];
		for (const activity of snapshot?.activities ?? []) {
			if (activity.kind !== "tool") continue;
			const offset = Date.parse(activity.recordedAt) - start;
			if (offset < 0 || offset > windowMs) continue;
			toolRows.push({ offset, label: safe(toolLabel(activity.payload)), failed: activity.phase === "failed" });
		}
		toolRows.sort((left, right) => left.offset - right.offset);

		const span = (label: string, offsetMs: number, durationMs: number | null, ink: (text: string) => string, indent = ""): string => {
			const startCell = toCell(offsetMs)                                                                  ;
			const length    = durationMs === null ? 1 : Math.max(1, toCell(offsetMs + durationMs) - startCell)  ;
			const bar       = ink("█".repeat(Math.max(1, length)))                                              ;
			return `${a.muted(`${indent}${label}`.slice(0, 16).padEnd(16))}${" ".repeat(Math.max(0, startCell))}${bar}`;
		};

		rows.push(span("REQUEST", 0, windowMs, a.muted));
		for (const stage of request.stages) {
			const stageStart = stage.startedAt ? Date.parse(stage.startedAt) - start : null;
			if (stageStart === null || Number.isNaN(stageStart)) continue;
			const stageEnd = stage.completedAt ? Date.parse(stage.completedAt) : this.clock();
			rows.push(span(stage.id, Math.max(0, stageStart), Math.max(1000, stageEnd - stageStart), stageInk(stage.status)));
		}
		for (const tool of toolRows.slice(0, 8)) {
			rows.push(`${a.muted("  ↳ ".padEnd(18))}${" ".repeat(Math.max(0, toCell(tool.offset)))}${tool.failed ? a.failure("✕") : a.success("◆")} ${a.muted(fit(tool.label, Math.max(4, plotWidth - toCell(tool.offset) - 4)))}`);
		}
		return rows;
	}

	/** TRACE TREE: 스테이지와 그 시간 창에 속한 도구 활동을 트리 행으로 나열한다. */
	private traceTree(request: RequestRuntimeRecord, snapshot: WorkbenchSnapshot | null, width: number): string[] {
		const rows = [pair(`${a.active(`● ${request.objective || `RUN #${snapshot?.journalSequence ?? 0}`}`)}`, a.muted(snapshot?.model ?? "모델 미관측"), width)];
		const tools = (snapshot?.activities ?? [])
			.filter(activity => activity.kind === "tool")
			.slice(-6)
			.reverse();
		for (const stage of request.stages) {
			rows.push(fit(`${stageInk(stage.status)(stageMark(stage.status))} ${stageInk(stage.status)(stage.id)}${stage.completedAt && stage.startedAt ? a.muted(` ${duration(Math.max(0, Date.parse(stage.completedAt) - Date.parse(stage.startedAt)))}`) : ""}`, width));
			const stageTools = tools.filter(tool => stage.startedAt && stage.completedAt
				? tool.recordedAt >= stage.startedAt && tool.recordedAt <= stage.completedAt
				: false);
			for (const tool of stageTools) {
				rows.push(fit(`  ${stageInk(stage.status)(stageMark(stage.status))} ${a.text(safe(toolLabel(tool.payload)))}`, width));
			}
		}
		if (rows.length === 1) rows.push(a.muted("관측된 활동이 없습니다."));
		return rows;
	}

	/** DECISIONS TIMELINE: decision.created 이벤트를 요청 시작 기준 오프셋 시각으로 나열한다. */
	private decisionsSection(request: RequestRuntimeRecord | null, width: number): string[] {
		const rows  = [pair(wwwTitle("DECISIONS TIMELINE", a.plan), "", width)]       ;
		const start = request?.startedAt ? Date.parse(request.startedAt) : null       ;
		const decisions = (request?.events ?? [])
			.filter(event => event.type === "decision.created")
			.map(event => ({ at: Date.parse(event.at), stage: event.stage ?? "—", text: safe(event.reason ?? "") }))
			.filter(entry => !Number.isNaN(entry.at));
		if (!decisions.length) return [...rows, a.muted("아직 결정이 관측되지 않았습니다.")];
		const first = start ?? Math.min(...decisions.map(entry => entry.at));
		for (const entry of decisions) {
			const offset = entry.at - first;
			rows.push(pair(`${a.muted(offsetClock(offset))}  ${a.attention(fit(entry.text, Math.max(8, width - 22)))}`, a.muted(entry.stage), width));
		}
		return rows;
	}

	/** ACTIVE FAILURES & RETRIES: 실패·차단 이벤트를 시각·대상·사유 테이블로 나열한다. */
	private failuresSection(request: RequestRuntimeRecord | null, m: RuntimeMonitorProjection, width: number): string[] {
		const rows = [pair(wwwTitle("ACTIVE FAILURES & RETRIES", a.failure), a.muted(`실패 ${m.failureCount} · 재시도 ${m.retryCount}`), width)];
		const failures = (request?.events ?? [])
			.filter(event => ["stage.failed", "stage.blocked", "action.failed", "request.failed"].includes(event.type))
			.map(event => ({ at: Date.parse(event.at), stage: event.stage ?? "—", reason: safe(event.reason ?? event.type) }))
			.filter(entry => !Number.isNaN(entry.at))
			.slice(-6);
		if (!failures.length) return [...rows, a.success("관측된 실패가 없습니다.")];
		for (const failure of failures) rows.push(pair(`${a.failure(`✕ ${failure.stage}`)} ${a.muted(failure.reason.slice(0, Math.max(8, width - 24)))}`, a.muted(offsetClock(failure.at - (request?.startedAt ? Date.parse(request.startedAt) : failure.at))), width));
		return rows;
	}

	private layerSection(m: RuntimeMonitorProjection, width: number): string[] {
		if (!m.layerPerformance?.current) return [];
		const rows: string[] = []                                ;
		const trace          = m.layerPerformance.current        ;
		const render         = m.layerPerformance.window.render  ;
		rows.push(...section("Render Health", width, render.slowCount ? "slow" : "healthy"));
		rows.push(
			kv("Current trace render", trace.renderMs === null ? "미관측" : `${telemetryDuration(trace.renderMs)}${trace.slowRender ? " · SLOW" : ""}`),
			kv("Slow frames", `${render.slowCount} / ${render.frameCount} (${render.slowRate}%) · > ${telemetryDuration(render.thresholdMs)}`),
			kv("Frame latency", `p50 ${telemetryDuration(render.latency.p50)} · p95 ${telemetryDuration(render.latency.p95)} · p99 ${telemetryDuration(render.latency.p99)}`),
			kv("Worst frame", render.worstFrameId && render.worstMs !== null ? `${render.worstFrameId} · ${telemetryDuration(render.worstMs)}` : "미관측"),
		);
		rows.push(...section("Layer Performance", width, `${trace.state} · ${trace.totalMs === null ? "total 미관측" : telemetryDuration(trace.totalMs)}`));
		for (const layer of trace.layers) {
			const wait = layer.waitMs === null ? "미관측" : telemetryDuration(layer.waitMs);
			const work = layer.workMs === null ? "미관측" : telemetryDuration(layer.workMs);
			rows.push(kv(layer.layerId, `wait ${wait} · work ${work}${layer.failed ? " · 실패" : ""}`));
		}
		const window = m.layerPerformance.window;
		rows.push(kv("Window", `${window.traceCount} traces · ${window.errorCount} trace failures`));
		return rows;
	}

	private recentEventsSection(m: RuntimeMonitorProjection, width: number): string[] {
		const rows = section("최근 이벤트", width, `${m.recentEvents.length}개`);
		for (const event of m.recentEvents) rows.push(`${a.muted(safe(event.recordedAt.slice(11, 19)))}  ${a.active(safe(event.kind.toLowerCase()))}`, `  ${safe(event.label)}`, a.muted(`  /source ${safe(event.activityId)}`), "");
		if (!m.recentEvents.length) rows.push(a.muted("실행 이벤트가 아직 관측되지 않았습니다."));
		return rows;
	}
}

function toolLabel(payload: Readonly<Record<string, unknown>>): string {
	const text = payload.text;
	if (typeof text === "string" && text.trim()) return text;
	const method = payload.method;
	return typeof method === "string" ? method : "tool";
}

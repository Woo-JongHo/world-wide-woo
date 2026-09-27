import type { Component }                 from "@earendil-works/pi-tui";
import type { RuntimeMonitorProjection }  from "@/core/domain/observability/runtime-monitor";
import type { ProjectActivity }           from "@/core/domain/execution/project-activity";
import type { PlanActivity, WorkbenchSnapshot } from "@/core/domain/work/workbench";
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
import {
	requestRuntimeMotionActive,
	requestRuntimeRows,
	stageInk,
	stageMark,
} from "@/adapters/inbound/tui/features/monitoring/view/request-runtime-view";

function activityLabel(activity: ProjectActivity): string {
	const text = activity.payload.text;
	if (typeof text === "string" && text.trim()) return text;
	const method = activity.payload.method;
	return typeof method === "string" ? method : activity.kind;
}

function document(rows: string[], width: number): string[] { return rows.flatMap(row => prose(row, width)); }
function kv(label: string, value: unknown): string { return `${a.muted(fit(label, 20))} ${a.text(safe(value ?? "—"))}`; }
function monitorAge(value: { readonly startedAt: string; readonly elapsedMs: number | null } | null | undefined): string {
	if (!value) return "미관측";
	return value.elapsedMs === null ? `${duration(Math.max(0, Date.now() - Date.parse(value.startedAt)))} / 종료 미관측` : duration(value.elapsedMs);
}
function stageHeaderMeta(stages: readonly { readonly status: string }[]): string {
	const done = stages.filter(stage => stage.status === "completed" || stage.status === "skipped").length;
	return stages.length ? `${done} / ${stages.length}` : "미관측";
}

export class WwwMonitorView implements Component {
	constructor(
		private readonly get         : () => RuntimeMonitorProjection  ,
		private readonly clock       = Date.now                        ,
		private readonly motion      = true                            ,
		private readonly getSnapshot : (() => WorkbenchSnapshot) | null = null,
	) {}
	invalidate(): void {}

	render(width: number): string[] {
		const m        = this.get()          ;
		const snapshot = this.getSnapshot?.() ;
		const rows = this.runSection(m, width);
		rows.push(...this.pipelineSection(m, width));
		if (snapshot) rows.push(...this.planSection(snapshot.planActivities ?? [], width));
		if (snapshot) rows.push(...this.activitySection(snapshot.activities, width));
		rows.push(...this.inspectSection(m, width));
		rows.push(...this.renderHealthSection(m, width));
		rows.push(...this.recentEventsSection(m, width));
		return document(rows, width);
	}

	/** Figma RUN: 진행 단계와 요청 경과, 모델을 한 헤더 블록으로 요약한다. */
	private runSection(m: RuntimeMonitorProjection, width: number): string[] {
		const stages    = m.requestRuntime?.stages ?? []             ;
		const running   = stages.find(stage => stage.status === "running");
		const lastStage = running?.id ?? stages.at(-1)?.id ?? "—"    ;
		const elapsed   = m.activeRequest?.elapsed.elapsedMs !== null && m.activeRequest?.elapsed.elapsedMs !== undefined
			? duration(m.activeRequest.elapsed.elapsedMs)
			: undefined                                                             ;
		const rows = [
			pair(wwwTitle("RUN", a.plan), a.muted(stageHeaderMeta(stages)), width)                                                  ,
			pair(`${a.active(`● ${lastStage}`)}`, elapsed ? a.active(elapsed) : "", width)                                          ,
			a.muted(m.model ? `${m.model}${m.agent ? ` · ${m.agent}` : ""}` : "모델·Agent 미관측")                                    ,
		];
		if (m.approval?.pending) rows.push(a.attention("승인 결정 필요 — /approval"));
		return rows;
	}

	/** Figma PIPELINE: 7단계 프로토콜을 세로 행과 연결선으로 나열한다. */
	private pipelineSection(m: RuntimeMonitorProjection, width: number): string[] {
		const stages = m.requestRuntime?.stages ?? []                                                                     ;
		const rows   = [pair(wwwTitle("PIPELINE", a.plan), a.muted(stageHeaderMeta(stages)), width)]                      ;
		if (!stages.length) return [...rows, a.muted("요청 런타임이 아직 관측되지 않았습니다.")];
		stages.forEach((stage, index) => {
			rows.push(fit(`${stageInk(stage.status)(stageMark(stage.status))} ${stageInk(stage.status)(stage.id)}`, width));
			if (index < stages.length - 1) rows.push(a.muted("  ┊"));
		});
		return rows;
	}

	/** Figma CURRENT PLAN: Plan 활동을 최신 순으로, 실행 중은 NOW 배지를 붙인다. */
	private planSection(plans: readonly PlanActivity[], width: number): string[] {
		const rows = [pair(wwwTitle("CURRENT PLAN", a.plan), a.muted(plans.length ? `${plans.length}개` : "미관측"), width)];
		if (!plans.length) return [...rows, a.muted("아직 Plan 활동이 관측되지 않았습니다.")];
		for (const plan of [...plans].slice(-3).reverse()) {
			const icon  = plan.status === "running" ? a.active("›") : plan.status === "completed" ? a.success("✓") : a.failure("✕")   ;
			const badge = plan.status === "running" ? a.success("NOW") : plan.status === "failed" ? a.failure("실패") : ""             ;
			rows.push(pair(`${icon} ${a.text(fit(plan.stepTitle, Math.max(8, width - 12)))}`, badge, width));
		}
		return rows;
	}

	/** Figma ACTIVITY: 최근 작업 활동을 상태 아이콘과 관측 시각으로 나열한다. */
	private activitySection(activities: readonly ProjectActivity[], width: number): string[] {
		const rows   = [pair(wwwTitle("ACTIVITY", a.plan), a.muted("최근 4개"), width)]                                    ;
		const recent = activities.filter(activity => activity.kind === "progress" || activity.kind === "tool").slice(-4).reverse();
		if (!recent.length) return [...rows, a.muted("실행 활동이 아직 관측되지 않았습니다.")];
		for (const activity of recent) {
			const icon = activity.phase === "completed" ? a.success("✓")
				: activity.phase === "failed" ? a.failure("✕")
				: activity.phase === "started" || activity.phase === "updated" ? a.active("●")
				: a.muted("○");
			const label = safe(activityLabel(activity))  ;
			rows.push(pair(`${icon} ${a.text(fit(label, Math.max(8, width - 14)))}`, a.muted(activity.recordedAt.slice(11, 19)), width));
		}
		return rows;
	}

	/** Figma INSPECT: 관측된 사실만 key-value로 나열한다. */
	private inspectSection(m: RuntimeMonitorProjection, width: number): string[] {
		const rows = [pair(wwwTitle("INSPECT", a.plan), "", width)]                            ;
		const runningStage = m.requestRuntime?.stages.find(stage => stage.status === "running");
		rows.push(
			kv("Stage", runningStage?.id ?? (m.requestRuntime ? m.requestRuntime.stages.at(-1)?.id : null))  ,
			kv("현재 요청", m.activeRequest?.label)                                                           ,
			kv("Agent", m.agent)                                                                              ,
			kv("Model", m.model)                                                                              ,
			kv("도구", m.currentTool?.label)                                                                   ,
			kv("승인", m.approval?.pending ? "결정 필요" : "대기 요청 없음")                                     ,
			kv("재시도 / 실패", `${m.retryCount} / ${m.failureCount}`)                                          ,
		);
		if (m.activeRequest) rows.push(kv("요청 관측 경과", monitorAge(m.activeRequest.elapsed)));
		if (m.currentTool) rows.push(kv("도구 관측 경과", monitorAge(m.currentTool.elapsed)));
		return rows;
	}

	/** 렌더·계층 관측은 Figma 섹션 뒤에 유지해 관측 가치를 잃지 않는다. */
	private renderHealthSection(m: RuntimeMonitorProjection, width: number): string[] {
		if (!m.layerPerformance?.current) return [];
		const rows: string[] = [];
		const trace  = m.layerPerformance.current ;
		const render = m.layerPerformance.window.render;
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

import { truncateToWidth, visibleWidth, wrapTextWithAnsi, type Component } from "@earendil-works/pi-tui";
import type { ProjectActivity } from "../../../../core/domain/execution/project-activity";
import type { SemanticWorkStep } from "../../../../core/domain/work/workflow-projection";
import type { WorkbenchSnapshot } from "../../../../core/domain/work/workbench";
import { colors } from "../shell/theme";
import { DASHBOARD_PANEL_SYSTEM } from "./dashboard-panel-system";
import { renderDelegationSummary, renderDelegationDetail } from "./delegation-tree-view";

function stepMarker(status: SemanticWorkStep["status"]): string {
	if (status === "completed") return colors.success("✓");
	if (status === "running") return colors.accent("▶");
	if (status === "failed") return colors.error("×");
	if (status === "cancelled") return colors.muted("–");
	return colors.muted("○");
}

function duration(milliseconds: number | null): string {
	if (milliseconds === null || milliseconds < 0) return "—";
	if (milliseconds < 60_000) return `${Math.round(milliseconds / 100) / 10}s`;
	return `${Math.floor(milliseconds / 60_000)}m${String(Math.round(milliseconds % 60_000 / 1_000)).padStart(2, "0")}s`;
}

function stepElapsed(step: SemanticWorkStep, activities: ReadonlyMap<string, ProjectActivity>): string {
	const observedAt = step.activityIds
		.map(id => activities.get(id)?.recordedAt)
		.filter((value): value is string => Boolean(value))
		.map(value => Date.parse(value))
		.filter(value => Number.isFinite(value))
		.sort((left, right) => left - right);
	return observedAt.length >= 2 ? duration(observedAt.at(-1)! - observedAt[0]!) : "—";
}

function alignedStep(step: SemanticWorkStep, elapsed: string, width: number): string {
	const prefix = `${stepMarker(step.status)} `;
	const tail = ` ${colors.muted(elapsed)}`;
	const titleWidth = Math.max(1, width - visibleWidth(prefix) - visibleWidth(tail));
	const title = truncateToWidth(step.title, titleWidth);
	return `${prefix}${title}${" ".repeat(Math.max(0, width - visibleWidth(prefix) - visibleWidth(title) - visibleWidth(tail)))}${tail}`;
}

function activitySummary(activity: ProjectActivity | undefined): string | null {
	if (!activity) return null;
	const item = activity.payload.params && typeof activity.payload.params === "object" && !Array.isArray(activity.payload.params)
		? (activity.payload.params as Readonly<Record<string, unknown>>).item
		: null;
	if (!item || typeof item !== "object" || Array.isArray(item)) return `${activity.kind} · ${activity.phase}`;
	const record = item as Readonly<Record<string, unknown>>;
	for (const key of ["path", "command", "title", "name", "type"] as const) {
		if (typeof record[key] === "string" && record[key].trim()) return record[key].trim();
	}
	return `${activity.kind} · ${activity.phase}`;
}

/**
 * Current execution instrument. FLOW reports Plan state, NOW one public
 * source, and HEALTH only observed failures or unresolved associations.
 */
/** @linear WOO-681 WOO-717 */
export class WorkbenchTracerView implements Component {
	public constructor(private readonly getSnapshot: () => WorkbenchSnapshot) {}
	public invalidate(): void {}

	public render(width: number): string[] {
		const snapshot = this.getSnapshot();
		const contentWidth = Math.max(1, width);
		const workflow = snapshot.workFlow;
		const showEntryDashboard = snapshot.chat.length === 0 && snapshot.activities.length === 0
			&& !snapshot.activeTurnId && !snapshot.actionResult && !workflow.source;
		if (showEntryDashboard && snapshot.linearDashboard?.state === "loading") return [
			...wrapTextWithAnsi(colors.secondary(`일정 · ${snapshot.linearDashboard.projectName}`), contentWidth),
			...wrapTextWithAnsi(colors.muted("Linear 마일스톤과 기한을 가져오는 중입니다."), contentWidth),
		];
		if (showEntryDashboard && (snapshot.linearDashboard?.state === "ready" || snapshot.linearDashboard?.state === "stale")) {
			const dashboard = snapshot.linearDashboard;
			return [
				...wrapTextWithAnsi(colors.secondary(`일정 · ${dashboard.projectName}`), contentWidth),
				...(dashboard.state === "stale" ? wrapTextWithAnsi(colors.warning("갱신 실패 · 마지막 성공 값"), contentWidth) : []),
				...(dashboard.milestones.length ? dashboard.milestones.flatMap(item => wrapTextWithAnsi(`• ${item.targetDate ?? "일정 미정"} · ${item.name}`, contentWidth)) : wrapTextWithAnsi("관측 가능한 마일스톤·기한이 없습니다.", contentWidth)),
			];
		}
		if (showEntryDashboard && snapshot.linearDashboard?.state === "unavailable") return [
			...wrapTextWithAnsi(colors.secondary(`일정 · ${snapshot.linearDashboard.projectName}`), contentWidth),
			...wrapTextWithAnsi(colors.warning("Linear 일정 정보를 불러오지 못했습니다."), contentWidth),
		];
		const performance = snapshot.performance;
		if (!workflow.source) {
			if (!performance?.execution && !snapshot.liveActivity) return [];
			const state = performance?.state ?? "executing";
			const labels: Record<string, string> = { idle: "대기", requested: "요청됨", understanding: "확인 중", planning: "계획 중", executing: "수행 중", verifying: "검증 중", completing: "마무리 중", waiting: "대기", blocked: "차단", reconciling: "상태 대조 중", completed: "수행 종료", failed: "실패", interrupted: "중단", unknown: "확인 불가" };
			const rows = [colors.warm(performance?.workContext ? `맡긴 일 · ${performance.workContext.goal}` : "독립 수행"),
				colors.accent(`현재 · ${labels[state] ?? state}`)];
			if (performance?.request) rows.push(colors.secondary(performance.request.text));
			if (snapshot.liveActivity) rows.push(colors.muted(snapshot.liveActivity.text || snapshot.liveActivity.method));
			else if (performance?.lastObservation) rows.push(colors.muted(`최근 관측 · ${performance.lastObservation.label}`));
			rows.push(colors.muted("실행 계획 없음 · 수행 관찰은 계속됩니다."));
			rows.push(...performanceHealthRows(snapshot));
			return [...rows.flatMap(row => wrapTextWithAnsi(row, contentWidth)), ...delegationRows(snapshot, contentWidth)];
		}

		const activities = new Map(snapshot.activities.map(activity => [activity.id, activity]));
		const active = workflow.steps.find(step => step.status === "running") ?? null;
		const focus = active ?? workflow.steps.at(-1) ?? null;
		const rows: string[] = [
			...(performance ? [colors.secondary(performance.workContext ? `맡긴 일 · ${performance.workContext.goal}` : "독립 수행")] : []),
			colors.warm(`${DASHBOARD_PANEL_SYSTEM.tracer.flow} · ${(active?.title ?? workflow.goal) || "공개 실행"}`),
			...workflow.steps.map(step => alignedStep(step, stepElapsed(step, activities), contentWidth)),
			colors.border("─".repeat(contentWidth)),
			colors.accent(DASHBOARD_PANEL_SYSTEM.tracer.now),
		];
		if (focus) {
			rows.push(colors.highlight(`${focus.status === "completed" ? "✓" : "▶"} ${focus.title}`));
			const source = [...focus.activityIds].reverse().map(id => activitySummary(activities.get(id))).find((value): value is string => value !== null);
			if (source) rows.push(colors.muted(`  ${source}`));
			rows.push(colors.muted(`  관측 ${focus.observationCount} · 수행 활동 ${focus.activityIds.length}`));
		} else rows.push(colors.muted("대기 중인 실행이 없습니다."));
		rows.push(colors.border("─".repeat(contentWidth)));
		rows.push(colors.muted(DASHBOARD_PANEL_SYSTEM.tracer.health));
		rows.push(...performanceHealthRows(snapshot));
		return [...rows.flatMap(row => wrapTextWithAnsi(row, contentWidth)), ...delegationRows(snapshot, contentWidth)];
	}
}

function delegationRows(snapshot: WorkbenchSnapshot, width: number): string[] {
	if (!snapshot.delegation?.length) return [];
	return [colors.border("─".repeat(width)),
		...renderDelegationSummary(snapshot.delegation.flatMap(entry => entry.tasks), snapshot.performance?.workContext?.goal ?? snapshot.performance?.request?.text ?? "", width),
		...renderDelegationDetail(snapshot.selectedAgentDetail ?? null, width, snapshot.delegationDetailActivities)];
}

function performanceHealthRows(snapshot: WorkbenchSnapshot): string[] {
	const performance = snapshot.performance;
	const verification = performance?.verification ?? "not-verified";
	const labels = { "not-verified": "미검증", passed: "통과", failed: "실패", uncertain: "불확실" };
	return [
		...(snapshot.configurationSource ? [colors.muted(`정책 · ${snapshot.configurationSource === "project-yaml" ? ".www/workbench.yaml" : "기본값(fallback)"}`)] : []),
		colors.muted(`검증 · ${labels[verification]}${snapshot.evaluationRequired && verification === "not-verified" ? " · 검증 필요" : ""}${snapshot.recordingReadOnly ? " · 기록 진단 전용" : ""}`),
		colors.muted(performance ? `관측된 재시도 ${performance.health.observedRetries} · 실패 ${performance.health.observedFailures} · 미연결 ${performance.health.unassociatedActivities}`
			: `미연결 활동 ${snapshot.workFlow.orphans.length} · 재시도 관측 미확인`),
	];
}

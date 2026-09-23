import type { Component } from "@earendil-works/pi-tui";
import type { RequestRuntimeRecord, RequestStageStatus } from "../../../../../core/domain/execution/request-runtime";
import type { NativeDelegatedTask, NativeDelegationProjection } from "../../../../../core/domain/work";
import type { WorkbenchSnapshot } from "../../../../../core/domain/work/workbench";
import { monitoringCard, monitoringColumns, monitoringCompactPanel, monitoringMeter, monitoringPanel, monitoringUnavailablePanel, monitoringWidths } from "../../foundation/layout/astra-monitoring-layout";
import { a, fit, mark, number, oneLine, pair, prose, railSection, safe, section } from "../../foundation/theme/astra-theme";
import { workflowDemoRail, workflowDemoRows } from "./astra-workflow-catalog";

type ObservedStatus = RequestStageStatus | NativeDelegatedTask["status"];

function statusInk(status: ObservedStatus): (text: string) => string {
	if (status === "failed" || status === "blocked") return a.failure;
	if (status === "running") return a.active;
	if (status === "completed") return a.success;
	if (status === "cancelled" || status === "unknown") return a.muted;
	return a.cream;
}

function currentRequest(snapshot: WorkbenchSnapshot): RequestRuntimeRecord | undefined {
	const requests = snapshot.requestRuntime ?? [];
	if (snapshot.activeTurnId) return [...requests].reverse().find(request => request.turnId === snapshot.activeTurnId);
	return requests.at(-1);
}

function currentDelegations(snapshot: WorkbenchSnapshot, request: RequestRuntimeRecord | undefined): readonly NativeDelegationProjection[] {
	const projections = snapshot.delegation ?? [];
	if (request?.turnId) return projections.filter(projection => projection.turnId === request.turnId);
	if (snapshot.activeTurnId) return projections.filter(projection => projection.turnId === snapshot.activeTurnId);
	return projections.at(-1) ? [projections.at(-1)!] : [];
}

function settledStageCount(request: RequestRuntimeRecord | undefined): number {
	return request?.stages.filter(stage => stage.status === "completed" || stage.status === "skipped").length ?? 0;
}

function taskTotals(projections: readonly NativeDelegationProjection[]): { total: number; active: number; failed: number } {
	const tasks = projections.flatMap(projection => projection.tasks);
	return {
		total: tasks.length,
		active: tasks.filter(task => task.status === "running").length,
		failed: tasks.filter(task => task.status === "failed").length,
	};
}

function workflowPanel(title: string, meta: string, ink: typeof a.tool, rows: readonly string[], width: number): string[] {
	return monitoringPanel({ title, meta, ink }, rows.map(row => fit(row, Math.max(1, width - 2))), width);
}

function summaryRows(request: RequestRuntimeRecord | undefined, projections: readonly NativeDelegationProjection[], width: number): string[] {
	const totals = taskTotals(projections);
	const stageTotal = request?.stages.length ?? 0;
	const stageDone = settledStageCount(request);
	if (width < 72) return [
		...railSection("Workflow overview", width, request?.status ?? "미관측", a.active),
		pair("Goal", request ? oneLine(request.objective, 320) : "미관측", width),
		pair("Stages", request ? `${stageDone}/${stageTotal}` : "미관측", width),
		pair("Subagents", totals.total ? `${totals.active} active / ${totals.total}` : "미관측", width),
		pair("Failed", totals.total ? number(totals.failed) : "미관측", width),
	];
	const cards = [
		{ title: "Active goal", value: request ? oneLine(request.objective, 90) : "미관측", detail: request ? `${mark(request.status)} ${request.status}` : "request 없음" },
		{ title: "7-stage request", value: request ? `${stageDone}/${stageTotal} settled` : "미관측", detail: request ? `${mark(request.status)} ${request.status}` : "관측 없음" },
		{ title: "Delegated agents", value: totals.total ? `${totals.active} active / ${totals.total}` : "미관측", detail: totals.total ? `${totals.failed} failed` : "위임 없음" },
		{ title: "Attempt", value: request ? `#${request.attempt}` : "미관측", detail: request?.requestId ? safe(request.requestId, 56) : "request 없음" },
	];
	const widths = monitoringWidths(width, cards.length, 1);
	return [
		...railSection("Workflow overview", width, request?.status ?? "미관측", a.active),
		...monitoringColumns(cards.map((card, index) => monitoringCard({ ...card, value: a.cream(card.value) }, widths[index]!)), widths),
	];
}

function requestPipelineRows(request: RequestRuntimeRecord | undefined, width: number): string[] {
	const rows = section("7-stage request pipeline", width, request ? `${settledStageCount(request)}/${request.stages.length}` : "미관측", a.active);
	if (!request) return [...rows, ...prose(a.muted("현재 Turn에 연결된 Request 관측이 없습니다."), width)];
	const meterWidth = Math.max(4, Math.min(28, width - 29));
	rows.push(pair("Progress", monitoringMeter(settledStageCount(request), request.stages.length, meterWidth, a.active), width), "");
	for (const stage of request.stages) {
		const headline = `${mark(stage.status)} ${safe(stage.id, 48)} · ${stage.status}`;
		rows.push(...prose(statusInk(stage.status)(headline), width));
		const observed = stage.output || stage.goal || stage.skipReason;
		if (observed) rows.push(...prose(a.muted(safe(observed, 720)), width, 2));
		if (stage.tasks.length) rows.push(...prose(a.caption(`${stage.tasks.length} native task${stage.tasks.length === 1 ? "" : "s"}`), width, 2));
	}
	return rows;
}

function compactWorkflowRows(request: RequestRuntimeRecord | undefined, projections: readonly NativeDelegationProjection[], width: number): string[] {
	if (width < 96) return [];
	const widths = monitoringWidths(width, 2, 1);
	const pipelineWidth = widths[0]!;
	const agentsWidth = widths[1]!;
	const pipeline = request
		? workflowPanel("7-stage pipeline", `${settledStageCount(request)}/${request.stages.length}`, a.active, request.stages.map(stage =>
			pair(safe(stage.id, 24), statusInk(stage.status)(`${mark(stage.status)} ${stage.status}`), Math.max(1, pipelineWidth - 2))), pipelineWidth)
		: workflowPanel("7-stage pipeline", "unavailable", a.active, [a.muted("현재 Turn의 Request가 없습니다.")], pipelineWidth);
	const tasks = projections.flatMap(projection => projection.tasks);
	const visibleTasks = tasks.slice(0, 7);
	const agentRows = visibleTasks.flatMap(task => {
		const latest = [...task.activities].reverse().find(activity => activity.message)?.message ?? task.result;
		const detail = [task.model, task.reasoningEffort, task.task, latest].filter(Boolean).join(" · ");
		return [
			pair(statusInk(task.status)(safe(task.role ?? task.id, 28)), statusInk(task.status)(`${mark(task.status)} ${task.status}`), Math.max(1, agentsWidth - 2)),
			a.muted(fit(oneLine(detail || "detail unavailable", 1200), Math.max(1, agentsWidth - 4))),
		];
	});
	if (tasks.length > visibleTasks.length) agentRows.push(a.muted(`… ${tasks.length - visibleTasks.length} delegated tasks hidden`));
	const agents = tasks.length
		? workflowPanel("Role status comparison", `${tasks.length} delegated`, a.active, agentRows, agentsWidth)
		: workflowPanel("Role status comparison", "unavailable", a.active, [a.muted("관측된 Native Subagent가 없습니다.")], agentsWidth);
	return [
		...monitoringColumns([pipeline, agents], widths),
		pair(a.info("Telemetry availability"), a.muted("queue unavailable · state matrix unavailable"), width),
	];
}

function agentDetails(task: NativeDelegatedTask, width: number, indent = 0): string[] {
	const title = task.role ?? task.id;
	const details = [task.model, task.reasoningEffort].filter(Boolean).join(" · ");
	const rows = prose(statusInk(task.status)(`${mark(task.status)} ${safe(title)} · ${task.status}`), width, indent);
	if (task.task) rows.push(...prose(a.cream(safe(task.task, 1200)), width, indent + 2));
	if (details) rows.push(...prose(a.muted(details), width, indent + 2));
	const latest = [...task.activities].reverse().find(activity => activity.message)?.message ?? task.result;
	if (latest) rows.push(...prose(a.muted(safe(latest, 500)), width, indent + 2));
	return rows;
}

function nodeGraphRows(projections: readonly NativeDelegationProjection[], width: number): string[] {
	const totals = taskTotals(projections);
	const rows: string[] = [];
	if (!totals.total) return workflowPanel("Subagents · delegation relationship tree", "미관측", a.tool, [a.muted("현재 Request에 연결된 Subagent 위임이 없습니다.")], width);
	for (const projection of projections) {
		rows.push(...prose(a.tool(`■ COORDINATOR  ${oneLine(projection.sourceThreadId, 72)}`), width));
		rows.push(...prose(a.caption(`Turn ${oneLine(projection.turnId, 72)}`), width));
		for (const task of projection.tasks) {
			const parent = task.parentId ?? projection.sourceThreadId;
			rows.push(...prose(a.rule(`${safe(parent, 44)} └─› ${safe(task.id, 56)}`), width));
			rows.push(...agentDetails(task, width, 2));
		}
		rows.push("");
	}
	return workflowPanel("Subagents · delegation relationship tree", `${totals.active} active / ${totals.total}`, a.tool, rows, width);
}

function laneRows(projections: readonly NativeDelegationProjection[], width: number): string[] {
	const tasks = projections.flatMap(projection => projection.tasks);
	const totals = taskTotals(projections);
	const rows: string[] = [];
	if (!tasks.length) return monitoringUnavailablePanel("Parallel execution pipeline", "관측된 Native Subagent lane이 없습니다.", width);
	for (const [index, task] of tasks.entries()) {
		const lane = `LANE_${String(index + 1).padStart(2, "0")}`;
		const title = safe(task.role ?? task.id, 220);
		rows.push(pair(`${lane}  ${title}`, statusInk(task.status)(`${mark(task.status)} ${task.status}`), width));
		const detail = [task.model, task.reasoningEffort].filter(Boolean).join(" · ");
		if (detail) rows.push(...prose(a.caption(detail), width, 2));
	}
	return workflowPanel("Parallel execution pipeline", `${totals.active} active / ${tasks.length}`, a.active, rows, width);
}

function queueRows(width: number): string[] {
	return monitoringUnavailablePanel("Active work queue & retry counts", "Native queue order와 retry count는 현재 projection에 노출되지 않습니다.", width);
}

function stateRows(projections: readonly NativeDelegationProjection[], width: number): string[] {
	const activities = projections.flatMap(projection => projection.tasks.flatMap(task => task.activities
		.filter(activity => activity.message)
		.map(activity => ({ task: task.id, kind: activity.kind, message: activity.message! }))));
	const matrix = monitoringUnavailablePanel("Subagent state matrix", "Native state matrix 차원과 갱신 시각은 현재 projection에 노출되지 않습니다.", width);
	const log = activities.length
		? activities.slice(-8).flatMap(activity => prose(a.muted(`${safe(activity.task, 72)} · ${safe(activity.kind, 48)} · ${safe(activity.message, 480)}`), width))
		: [a.muted("관측된 Subagent state-change event가 없습니다.")];
	return [...matrix, ...workflowPanel("State change event log", activities.length ? `${activities.length} observed` : "unavailable", a.tool, log, width)];
}

/** Read-only projection of seven-stage Request protocol and observed native delegation. */
export class AstraWorkflowView implements Component {
	constructor(private readonly get: () => WorkbenchSnapshot, private readonly isDemo: () => boolean = () => false) {}
	invalidate(): void {}
	render(width: number): string[] {
		const snapshot = this.get();
		const request = currentRequest(snapshot);
		const projections = currentDelegations(snapshot, request);
		if (this.isDemo()) {
			const stages = request?.stages.map(stage => statusInk(stage.status)(`${mark(stage.status)} ${stage.id}`)).join("  ");
			const pipeline = monitoringCompactPanel("7-stage request pipeline", prose(stages ?? a.muted("미관측"), Math.max(1, width - 2)), width);
			return [...pipeline, ...workflowDemoRows(width)];
		}
		return [
			...summaryRows(request, projections, width),
			...compactWorkflowRows(request, projections, width),
			...nodeGraphRows(projections, width),
			...requestPipelineRows(request, width),
			...laneRows(projections, width),
			...queueRows(width),
			...stateRows(projections, width),
		].map(row => fit(row, width));
	}
}

export class AstraWorkflowRail implements Component {
	constructor(private readonly get: () => WorkbenchSnapshot, private readonly isDemo: () => boolean = () => false) {}
	invalidate(): void {}
	render(width: number): string[] {
		if (this.isDemo()) return workflowDemoRail(width);
		const snapshot = this.get();
		const requests = snapshot.requestRuntime ?? [];
		const current = currentRequest(snapshot);
		const projections = currentDelegations(snapshot, current);
		const totals = taskTotals(projections);
		const tasks = projections.flatMap(projection => projection.tasks);
		const rows = [
			...railSection("Active process", width, current?.status ?? "미관측", a.active),
			pair("Requests", number(requests.length), width),
			pair("Stages", current ? `${settledStageCount(current)}/${current.stages.length}` : "미관측", width),
			pair("Agents", totals.total ? number(totals.total) : "미관측", width),
			pair("Active", totals.total ? a.active(number(totals.active)) : a.muted("미관측"), width),
			pair("Failed", totals.total ? totals.failed ? a.failure(number(totals.failed)) : a.success("0") : a.muted("미관측"), width),
			...(current?.stages.map(stage => pair(statusInk(stage.status)(mark(stage.status)), safe(stage.id, 28), width)) ?? [a.muted("7-stage request unavailable")]),
			...railSection("Agents", width, totals.total ? `${totals.active} active` : "unavailable", a.active),
			...tasks.slice(0, 3).map(task => pair(statusInk(task.status)(safe(task.role ?? task.id, 22)), statusInk(task.status)(task.status), width)),
			...railSection("Goal", width, "", a.active),
			snapshot.sessionGoal ? safe(snapshot.sessionGoal.text, 600) : a.muted("Goal이 아직 없습니다."),
			...railSection("Navigate", width, "", a.active),
			a.muted("/todo      Plan"),
			a.muted("/context   실행 근거"),
			a.muted("/dashboard 세션 개요"),
		];
		return rows.flatMap(row => prose(fit(row, width), width));
	}
}

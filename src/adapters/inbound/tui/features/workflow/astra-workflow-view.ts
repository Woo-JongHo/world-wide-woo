import type { Component } from "@earendil-works/pi-tui";
import type { RequestStageStatus } from "../../../../../core/domain/execution/request-runtime";
import type { NativeDelegatedTask } from "../../../../../core/domain/work";
import type { WorkbenchSnapshot } from "../../../../../core/domain/work/workbench";
import { a, fit, mark, oneLine, prose, safe, section } from "../../foundation/theme/astra-theme";

function statusInk(status: RequestStageStatus | NativeDelegatedTask["status"]): (text: string) => string {
	if (status === "failed" || status === "blocked") return a.failure;
	if (status === "running") return a.active;
	if (status === "completed") return a.success;
	if (status === "cancelled") return a.muted;
	return a.text;
}

function agentRows(task: NativeDelegatedTask, width: number): string[] {
	const title = task.role ?? task.id;
	const details = [task.model, task.reasoningEffort].filter(Boolean).join(" · ");
	const rows = prose(statusInk(task.status)(`${mark(task.status)} ${safe(title)} · ${task.status}`), width);
	if (task.task) rows.push(...prose(a.text(safe(task.task, 1200)), width, 2));
	if (details) rows.push(...prose(a.muted(details), width, 2));
	const latest = [...task.activities].reverse().find(activity => activity.message)?.message;
	if (latest) rows.push(...prose(a.muted(safe(latest, 500)), width, 2));
	return rows;
}

/** Read-only projection of the request protocol and observed native delegation. */
export class AstraWorkflowView implements Component {
	constructor(private readonly get: () => WorkbenchSnapshot) {}
	invalidate(): void {}
	render(width: number): string[] {
		const snapshot = this.get();
		const request = [...(snapshot.requestRuntime ?? [])].reverse().find(candidate => candidate.turnId === snapshot.activeTurnId && candidate.turnId !== null)
			?? snapshot.requestRuntime?.at(-1);
		const projections = [...(snapshot.delegation ?? [])].reverse();
		const taskCount = projections.reduce((count, projection) => count + projection.tasks.length, 0);
		const rows = section("Workflow", width, request?.status ?? "미관측", a.plan);
		if (!request) rows.push(...prose(a.muted("관측된 Request가 없습니다."), width));
		else {
			rows.push(...prose(a.strong(safe(request.objective || request.requestId, 1200)), width));
			rows.push(...prose(a.caption(`${safe(request.requestId)} · 시도 ${request.attempt}`), width), "");
			for (const stage of request.stages) {
				const label = `${mark(stage.status)} ${stage.id} · ${stage.status}`;
				rows.push(...prose(statusInk(stage.status)(label), width));
				if (stage.goal) rows.push(...prose(a.muted(safe(stage.goal, 600)), width, 2));
			}
		}

		rows.push(...section("Subagents", width, taskCount ? `${taskCount}개 관측` : "미관측", a.tool));
		if (!taskCount) rows.push(...prose(a.muted("관측된 Subagent 위임이 없습니다."), width));
		for (const projection of projections) {
			rows.push(a.caption(`Turn ${oneLine(projection.turnId, 80)}`));
			for (const task of projection.tasks) rows.push(...agentRows(task, width));
			rows.push("");
		}
		return rows.map(row => fit(row, width));
	}
}

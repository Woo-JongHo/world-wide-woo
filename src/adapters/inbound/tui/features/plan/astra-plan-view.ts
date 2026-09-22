import type { Component } from "@earendil-works/pi-tui";
import type { RequestRuntimeRecord } from "../../../../../core/domain/execution/request-runtime";
import type { WorkbenchSnapshot } from "../../../../../core/domain/work/workbench";
import { a, fit, prose, safe, section } from "../../foundation/theme/astra-theme";
import { statusCardRows } from "../../foundation/components/status-card";

export interface PlanRuntimePresentation {
	readonly motionActive: (request: Pick<RequestRuntimeRecord, "status" | "completedAt">, now: number) => boolean;
	readonly rows: (request: RequestRuntimeRecord, width: number, compact: boolean, motionFrame: number, nextRequests?: readonly string[], activityRows?: readonly string[]) => string[];
}

function planRows(snapshot: WorkbenchSnapshot, width: number, compact: boolean): string[] {
	const steps = snapshot.workFlow.steps;
	const rows = [...section("Plan", width, steps.length ? `${steps.filter(x => x.status === "completed").length}/${steps.length}` : "미관측", a.plan)];
	if (!steps.length) {
		const message = snapshot.workFlow.rejections.length
			? "전달받은 계획을 확인하지 못했습니다."
			: "현재 요청에서 전달받은 계획이 없습니다.";
		return [...rows, ...prose(a.muted(message), width)];
	}
	for (const step of steps) {
		rows.push(...statusCardRows(step.title, step.status, width));
	}
	return rows;
}

function activityRows(snapshot: WorkbenchSnapshot, width: number, compact = false): string[] {
	const turnId = snapshot.activeTurnId ?? snapshot.workFlow.source?.turnId ?? snapshot.requestRuntime?.at(-1)?.turnId;
	const entries = [...(snapshot.planActivities ?? [])].filter(item => item.turnId === turnId).sort((left, right) => left.sequence - right.sequence).slice(-5);
	const rows = [...section("Activity", width, entries.length ? `최근 ${entries.length}개` : "", a.info)];
	for (const item of entries) rows.push(...statusCardRows(safe(item.summary, 600), item.status, width));
	if (!entries.length) {
		const message = snapshot.planActivityStatus === "pending" ? "현재 단계의 작업 내용을 정리하는 중입니다."
			: snapshot.planActivityStatus === "unavailable" ? "작업 내용을 아직 정리하지 못했습니다."
			: snapshot.planActivityStatus === "disabled" ? "작업 내용 요약이 꺼져 있습니다."
			: "정리된 세부 작업이 도착하면 이곳에 표시합니다.";
		rows.push(...prose(a.muted(message), width));
	} else if (snapshot.planActivityStatus === "pending") rows.push(...prose(a.caption("새 작업 내용을 정리하는 중…"), width));
	return rows;
}

function proposalRows(snapshot: WorkbenchSnapshot, width: number): string[] {
	const proposals = snapshot.chatQueue;
	const rows = [...section("Next", width, proposals.length ? `${proposals.length}개` : "없음", a.request)];
	for (const proposal of proposals) rows.push(...statusCardRows(safe(proposal.content, 3000), "pending", width));
	if (!proposals.length) rows.push(...prose(a.muted("다음 입력 제안이 없습니다."), width));
	return rows;
}

export class AstraPlanView implements Component {
	constructor(
		private readonly get: () => WorkbenchSnapshot,
		private readonly compact = false,
		private readonly clock = Date.now,
		private readonly motion = true,
		private readonly runtimePresentation: PlanRuntimePresentation | null = null,
	) {}
	invalidate(): void {}
	render(width: number): string[] {
		const s = this.get();
		const turnId = s.activeTurnId ?? s.workFlow.source?.turnId;
		const request = turnId ? [...(s.requestRuntime ?? [])].reverse().find(r => r.turnId === turnId) : s.requestRuntime?.at(-1);
		if (request && this.runtimePresentation && Array.isArray(request.stages) && request.stages.length > 0) {
			const now = this.clock();
			const frame = this.motion && this.runtimePresentation.motionActive(request, now) ? Math.floor(now / 120) : 8;
			const rows = this.runtimePresentation.rows(request, width, this.compact, frame, s.chatQueue.map(item => item.content), activityRows(s, width, this.compact));
			return (this.compact && rows[0] === "" ? rows.slice(1) : rows).map(row => fit(row, width));
		}
		const rows = [...planRows(s, width, this.compact), ...activityRows(s, width, this.compact), ...proposalRows(s, width)];
		return (this.compact && rows[0] === "" ? rows.slice(1) : rows).map(row => fit(row, width));
	}
}

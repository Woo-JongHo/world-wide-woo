import type { Component } from "@earendil-works/pi-tui";
import type { RequestRuntimeRecord } from "../../../../../core/domain/execution/request-runtime";
import type { WorkbenchSnapshot } from "../../../../../core/domain/work/workbench";
import { a, fit, mark, prose, safe, section } from "../../foundation/theme/astra-theme";

export interface PlanRuntimePresentation {
	readonly motionActive: (request: Pick<RequestRuntimeRecord, "status" | "completedAt">, now: number) => boolean;
	readonly rows: (request: RequestRuntimeRecord, width: number, compact: boolean, motionFrame: number, nowObservation: string | null) => string[];
	readonly nowLabel: (snapshot: WorkbenchSnapshot) => string | null;
}

function verificationLabel(value: WorkbenchSnapshot["performance"]): string {
	return ({ "not-verified": "검증 미실행", passed: "검증 통과", failed: "검증 실패", uncertain: "검증 결과 미확정" })[value?.verification ?? "not-verified"];
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
		const request = [...(s.requestRuntime ?? [])].reverse().find(r => r.turnId === s.activeTurnId && r.turnId !== null) ?? s.requestRuntime?.at(-1);
		if (request && this.runtimePresentation) {
			const now = this.clock();
			const frame = this.motion && this.runtimePresentation.motionActive(request, now) ? Math.floor(now / 120) : 8;
			const rows = this.runtimePresentation.rows(request, width, this.compact, frame, this.runtimePresentation.nowLabel(s));
			if (s.todoSync?.state === "blocked") rows.push(...prose(a.attention(`Todo 기록: ${safe(s.todoSync.message)}`), width));
			if (s.chatQueue.length) rows.push(...section("다음 요청", width), ...s.chatQueue.flatMap(q => prose(safe(q.content), width)));
			if (this.compact) rows.push(a.muted("Ctrl+G 2 전체 계획 / Todo"));
			return rows.map(row => fit(row, width));
		}
		const steps = s.workFlow.steps;
		const authority = s.workFlow.source?.authority;
		const rows = section(authority === "public-plan-document" ? "공개 계획" : "계획", width, steps.length ? `${steps.filter(x => x.status === "completed").length}/${steps.length}` : "미관측", a.plan);
		if (!this.compact && authority) rows.push(a.caption(authority === "native-checklist" ? "Native checklist / 실행 상태는 관측 기준" : "공개 계획 문서 / 단계 완료는 업무 수락을 뜻하지 않음"), "");
		if (s.sessionGoal?.text) rows.push(...prose(a.text(safe(s.sessionGoal.text)), width), "");
		if (!steps.length) rows.push(...prose(a.muted("Native 계획이 아직 없습니다."), width));
		for (const step of steps) {
			const ink = step.status === "running" ? a.strong : step.status === "completed" ? a.muted : a.text;
			const wrapped = prose(ink(safe(step.title)), Math.max(1, width - 2));
			rows.push(...wrapped.map((row, i) => `${i === 0 ? mark(step.status) : " "} ${row}`), "");
			if (!this.compact && step.narration.why) rows.push(...prose(a.muted(safe(step.narration.why)), width, 2));
			if (!this.compact) for (const id of step.activityIds) rows.push(...prose(a.muted(`/trace ${safe(id)}`), width, 2));
		}
		const items = (s.todo?.items ?? []).filter(item => !steps.length || item.source?.kind !== "native-plan-item");
		if (items.length || !steps.length) {
			rows.push(...section("Todo", width, items.length ? `${items.filter(x => x.status === "completed").length}/${items.length}` : "없음", a.plan));
			for (const item of items) {
				rows.push(...prose(`${mark(item.status)} ${safe(item.content)}`, width));
				for (const detail of item.details) rows.push(...prose(`${mark(detail.status)} ${safe(detail.content)}`, width, 2));
			}
		}
		if (s.todoSync?.state === "blocked") rows.push("", ...prose(a.attention(`! Todo 기록: ${safe(s.todoSync.message)}`), width));
		if (s.chatQueue.length) {
			rows.push(...section("다음 요청", width, String(s.chatQueue.length), a.request));
			for (const [index, queued] of s.chatQueue.entries()) rows.push(...prose(`${index + 1}. ${safe(queued.content, 3000)}`, width));
		}
		rows.push(...section("검증", width, "", a.tool), ...prose((s.performance?.verification === "failed" ? a.failure : a.muted)(verificationLabel(s.performance)), width));
		if (!this.compact && s.executionRun?.receipt) {
			const receipt = s.executionRun.receipt;
			for (const check of receipt.verification) rows.push(...prose(`${mark(check.status)} ${safe(check.command)}`, width), ...prose(a.muted(safe(check.result)), width, 2), ...check.evidenceRefs.map(id => a.muted(`/source ${safe(id)}`)));
			if (receipt.changed.length) rows.push(...section("변경 결과", width, "", a.response));
			for (const change of receipt.changed) rows.push(...prose(`${safe(change.kind)} ${safe(change.ref)}`, width), ...prose(a.muted(safe(change.summary)), width, 2));
			if (receipt.remaining.length) rows.push(...section("남은 작업", width, "", a.attention));
			for (const remaining of receipt.remaining) rows.push(...prose(`${remaining.blocking ? a.attention("!") : a.muted("·")} ${safe(remaining.summary)}`, width));
		}
		if (this.compact) rows.push("", a.muted("Ctrl+G 2 전체 계획 / Todo"));
		return rows.map(row => fit(row, width));
	}
}

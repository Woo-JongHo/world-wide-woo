import type { Component } from "@earendil-works/pi-tui";
import type { RequestRuntimeRecord } from "../../../../../core/domain/execution/request-runtime";
import type { WorkbenchSnapshot } from "../../../../../core/domain/work/workbench";
import { parseCanonicalTNoteReport } from "../../../../../core/application/work/t-note-service";
import { a, fit, mark, prose, safe, section } from "../../foundation/theme/astra-theme";

export interface PlanRuntimePresentation {
	readonly motionActive: (request: Pick<RequestRuntimeRecord, "status" | "completedAt">, now: number) => boolean;
	readonly rows: (request: RequestRuntimeRecord, width: number, compact: boolean, motionFrame: number, nowObservation: string | null) => string[];
	readonly nowLabel: (snapshot: WorkbenchSnapshot) => string | null;
}

function verificationLabel(value: WorkbenchSnapshot["performance"]): string {
	return ({ "not-verified": "검증 미실행", passed: "검증 통과", failed: "검증 실패", uncertain: "검증 결과 미확정" })[value?.verification ?? "not-verified"];
}

function traceObservation(snapshot: WorkbenchSnapshot, activityId: string): string[] {
	const message = snapshot.chat.find(candidate => candidate.activityId === activityId);
	const role = message?.role === "assistant" ? "Response" : message?.role === "user" ? "Request" : "Observation";
	const summary = message?.content.replace(/\s+/gu, " ").trim();
	return [
		`관측 · ${role} · /trace ${safe(activityId)}`,
		...(summary ? [a.muted(safe(summary, 240))] : []),
	];
}

function workflowTracerRows(snapshot: WorkbenchSnapshot, width: number): string[] {
	const tracedSteps = snapshot.workFlow.steps.filter(step => step.association && (step.association.activityIds.length || step.association.observationActivityIds.length));
	if (!tracedSteps.length) return [];
	const observationCount = tracedSteps.reduce((count, step) => count + step.association!.activityIds.length + step.association!.observationActivityIds.length, 0);
	const rows = section("Tracer", width, `${observationCount}개 관측`, a.secondary);
	for (const step of tracedSteps) {
		rows.push(...prose(`${mark(step.status)} ${safe(step.title)}`, width));
		for (const id of step.association!.activityIds) rows.push(...prose(`실행 · /trace ${safe(id)}`, width, 2));
		for (const id of step.association!.observationActivityIds) {
			const [label, ...summary] = traceObservation(snapshot, id);
			rows.push(...prose(label!, width, 2), ...summary.flatMap(line => prose(line, width, 4)));
		}
	}
	return rows;
}

function proposalRows(snapshot: WorkbenchSnapshot, width: number): string[] {
	for (const note of [...snapshot.tnotes].reverse()) {
		const report = parseCanonicalTNoteReport(note.summary);
		if (!report?.proposal) continue;
		return [
			...section("PROPOSAL", width, "NEXT ACTION", a.plan),
			...prose(a.text(safe(report.proposal, 4000)), width),
			"",
		];
	}
	return [];
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
		const proposal = proposalRows(s, width);
		const request = [...(s.requestRuntime ?? [])].reverse().find(r => r.turnId === s.activeTurnId && r.turnId !== null) ?? s.requestRuntime?.at(-1);
		if (request && this.runtimePresentation && Array.isArray(request.stages) && request.stages.length > 0) {
			const now = this.clock();
			const frame = this.motion && this.runtimePresentation.motionActive(request, now) ? Math.floor(now / 120) : 8;
			const rows = [...proposal, ...this.runtimePresentation.rows(request, width, this.compact, frame, this.runtimePresentation.nowLabel(s))];
			rows.push(...workflowTracerRows(s, width));
			if (s.todoSync?.state === "blocked") rows.push(...prose(a.attention(`Todo 기록: ${safe(s.todoSync.message)}`), width));
			if (s.chatQueue.length) rows.push(...section("다음 요청", width), ...s.chatQueue.flatMap(q => prose(safe(q.content), width)));
			if (this.compact) rows.push(a.muted("Ctrl+G 2 Plan · Todo · Verify"));
			return rows.map(row => fit(row, width));
		}
		const steps = s.workFlow.steps;
		const authority = s.workFlow.source?.authority;
		const rows = [...proposal, ...section(`Plan · ${authority === "public-plan-document" ? "공개 계획" : "계획"}`, width, steps.length ? `${steps.filter(x => x.status === "completed").length}/${steps.length}` : "미관측", a.plan)];
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
		const planTitles = new Set(steps.map(step => step.title.trim().replace(/\s+/gu, " ")));
		const todoItems = s.todo?.items ?? [];
		const items = todoItems.filter(item => {
			if (!steps.length) return true;
			const title = item.content.trim().replace(/\s+/gu, " ");
			return item.source?.kind !== "native-plan-item" && !planTitles.has(title);
		});
		if (items.length || !steps.length) {
			rows.push(...section("Todo", width, items.length ? `${items.filter(x => x.status === "completed").length}/${items.length}` : "없음", a.plan));
			for (const item of items) {
				rows.push(...prose(`${mark(item.status)} ${safe(item.content)}`, width));
				for (const detail of item.details) rows.push(...prose(`${mark(detail.status)} ${safe(detail.content)}`, width, 2));
			}
		}
		rows.push(...workflowTracerRows(s, width));
		if (s.todoSync?.state === "blocked") rows.push("", ...prose(a.attention(`! Todo 기록: ${safe(s.todoSync.message)}`), width));
		if (s.chatQueue.length) {
			rows.push(...section("다음 요청", width, String(s.chatQueue.length), a.request));
			for (const [index, queued] of s.chatQueue.entries()) rows.push(...prose(`${index + 1}. ${safe(queued.content, 3000)}`, width));
		}
		rows.push(...section("Verify", width, "", a.tool), ...prose((s.performance?.verification === "failed" ? a.failure : a.muted)(verificationLabel(s.performance)), width));
		if (!this.compact && s.executionRun?.receipt) {
			const receipt = s.executionRun.receipt;
			for (const check of receipt.verification) rows.push(...prose(`${mark(check.status)} ${safe(check.command)}`, width), ...prose(a.muted(safe(check.result)), width, 2), ...check.evidenceRefs.map(id => a.muted(`/source ${safe(id)}`)));
			if (receipt.changed.length) rows.push(...section("변경 결과", width, "", a.response));
			for (const change of receipt.changed) rows.push(...prose(`${safe(change.kind)} ${safe(change.ref)}`, width), ...prose(a.muted(safe(change.summary)), width, 2));
			if (receipt.remaining.length) rows.push(...section("남은 작업", width, "", a.attention));
			for (const remaining of receipt.remaining) rows.push(...prose(`${remaining.blocking ? a.attention("!") : a.muted("·")} ${safe(remaining.summary)}`, width));
		}
		if (this.compact) rows.push("", a.muted("Ctrl+G 2 Plan · Todo · Verify"));
		return rows.map(row => fit(row, width));
	}
}

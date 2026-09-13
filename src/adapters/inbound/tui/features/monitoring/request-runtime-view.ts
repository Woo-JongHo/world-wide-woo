import chalk from "chalk";
import type { RequestRuntimeRecord } from "../../../../../core/domain/execution/request-runtime";
import { a, fit, prose, safe, section } from "../../foundation/theme/astra-theme";

const symbols = { pending: "○", running: "●", completed: "✓", skipped: "−", blocked: "!", failed: "×" };
const stageStatus = { pending: "대기", running: "진행", completed: "완료", skipped: "PASS", blocked: "차단", failed: "실패" } as const;

const statusGradient = {
	pending: { base: [72, 75, 92], peak: [170, 174, 196] },
	running: { base: [67, 72, 122], peak: [168, 177, 255] },
	completed: { base: [43, 91, 75], peak: [119, 191, 163] },
} as const;

export function requestStatusGradient(status: RequestRuntimeRecord["status"], text: string, frame = 8): string {
	const palette = statusGradient[status as keyof typeof statusGradient];
	if (!palette) return (status === "failed" ? a.failure : status === "blocked" ? a.attention : a.muted)(text);
	const characters = Array.from(text);
	return characters.map((character, column) => {
		const light = Math.max(0, 1 - Math.abs(column - frame % (characters.length + 6) + 3) / 4);
		const rgb = palette.base.map((channel, index) => Math.round(channel + (palette.peak[index]! - channel) * light));
		return chalk.rgb(rgb[0]!, rgb[1]!, rgb[2]!)(character);
	}).join("");
}

export function requestRuntimeMotionActive(request: Pick<RequestRuntimeRecord, "status" | "completedAt">, now: number, settleMs = 960): boolean {
	if (request.status === "pending" || request.status === "running") return true;
	if (request.status !== "completed" || !request.completedAt) return false;
	const elapsed = now - Date.parse(request.completedAt);
	return Number.isFinite(elapsed) && elapsed >= 0 && elapsed < settleMs;
}

export function requestRuntimeRows(request: RequestRuntimeRecord, width: number, compact = false, motionFrame = 8, nowObservation: string | null = null): string[] {
	const rows = section("REQUEST", width, request.status, a.plan, text => requestStatusGradient(request.status, text, motionFrame));
	if (request.attempt > 1) rows.push(...prose(a.muted(`시도 ${request.attempt} · 이전 ${request.previousAttempts.length}회 기록 보존`), width));
	for (const stage of request.stages) {
		const ink = stage.status === "running" ? a.strong : stage.status === "failed" ? a.failure : stage.status === "blocked" ? a.attention : a.muted;
		rows.push(ink(`${symbols[stage.status]} ${stage.id.padEnd(11)} ${stageStatus[stage.status]}`));
		if (stage.skipReason) rows.push(...prose(a.muted(`PASS 사유: ${safe(stage.skipReason)}`), width, 2));
	}
	const current = request.stages.find(s => s.status === "running" || s.status === "blocked" || s.status === "failed");
	const planned = request.stages.filter(stage => stage.tasks.length);
	const taskCount = planned.reduce((count, stage) => count + stage.tasks.length, 0);
	rows.push(...section("TODO", width, current?.id ?? (taskCount ? `${taskCount}개` : "미관측"), a.plan));
	if (!planned.length) rows.push(...prose(a.muted("현재 공개된 세부 계획이 없습니다."), width));
	for (const stage of planned) {
		rows.push(a.muted(stage.id));
		for (const task of stage.tasks) {
			const ink = task.status === "running" ? a.strong : task.status === "blocked" ? a.attention : task.status === "completed" ? a.muted : a.text;
			rows.push(...prose(ink(`${symbols[task.status]} ${safe(task.title)}`), width, 2));
			if (!compact && task.dependsOn.length) rows.push(...prose(a.muted(`${safe(task.id)} ← ${task.dependsOn.map(x => safe(x)).join(", ")}`), width, 4));
		}
	}
	for (const required of request.requiredDeliveries) {
		const done = request.deliveries.some(d => d.target === required.target && d.artifact === required.artifact);
		if (!done) rows.push(...prose(a.attention(`○ 필수 전달 · ${safe(required.target)} → ${safe(required.artifact)}`), width));
	}
	for (const action of request.actions.filter(action => action.status === "unconfirmed")) {
		rows.push(...prose(a.attention(`! 결과 미확인 · ${safe(action.operationId)} · ${safe(action.capability)}`), width));
		rows.push(...prose(a.attention("재실행 금지 · Runtime read-back 확인 필요"), width, 2));
		if (request.completedAt) rows.push(...prose(a.muted(`/reconcile ${safe(request.requestId)} ${safe(action.operationId)}`), width, 2));
	}
	rows.push(...section("NOW", width, current?.id ?? request.status, a.active));
	if (nowObservation) rows.push(...prose(`${a.active("›")} ${a.text(safe(nowObservation))}`, width));
	else if (current && ["blocked", "failed"].includes(current.status)) rows.push(...prose((current.status === "failed" ? a.failure : a.attention)(safe(current.output ?? "진행이 멈췄습니다.")), width));
	else if (request.status === "completed") rows.push(...prose(a.success("요청 처리가 완료되었습니다."), width));
	else rows.push(...prose(a.muted("실제 실행 관측을 기다리는 중입니다."), width));
	for (const issue of compact ? request.issues.slice(-1) : request.issues) rows.push(...prose(a.attention(safe(issue)), width));
	return rows.map(row => fit(row, width));
}

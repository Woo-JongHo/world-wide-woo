import chalk                                            from "chalk";
import { visibleWidth }                                 from "@earendil-works/pi-tui";
import type { RequestRuntimeRecord }                    from "@/core/domain/execution/request-runtime";
import { a, fit, joinedSections, prose, safe, section } from "@/adapters/inbound/tui/foundation/theme/www-theme";
import { compactStatusRows }                            from "@/adapters/inbound/tui/foundation/components/status-card";

type StatusGradient = { readonly base: readonly [number, number, number]; readonly peak: readonly [number, number, number] };
const statusGradient: Partial<Record<RequestRuntimeRecord["status"], StatusGradient>> = {
	pending   : { base: [72, 75, 92], peak: [170, 174, 196] },
	running   : { base: [67, 72, 122], peak: [168, 177, 255] },
	completed : { base: [43, 91, 75], peak: [119, 191, 163] },
};

export function requestStatusGradient(status: RequestRuntimeRecord["status"], text: string, frame = 8): string {
	const palette = statusGradient[status];
	if (!palette) return (status === "failed" ? a.failure : status === "blocked" ? a.attention : a.muted)(text);
	const characters = Array.from(text);
	return characters.map((character, column) => {
		const light = Math.max(0, 1 - Math.abs(column - frame % (characters.length + 6) + 3) / 4);
		const rgb = palette.base.map((channel, index) => Math.round(channel + (palette.peak[index] - channel) * light));
		return chalk.rgb(rgb[0], rgb[1], rgb[2])(character);
	}).join("");
}

export function requestRuntimeMotionActive(request: Pick<RequestRuntimeRecord, "status" | "completedAt">, now: number, settleMs = 960): boolean {
	if (request.status === "pending" || request.status === "running") return true;
	if (request.status !== "completed" || !request.completedAt) return false;
	const elapsed = now - Date.parse(request.completedAt);
	return Number.isFinite(elapsed) && elapsed >= 0 && elapsed < settleMs;
}

function stageInk(status: RequestRuntimeRecord["stages"][number]["status"]): (text: string) => string {
	if (status === "completed") return a.success;
	if (status === "running") return a.active;
	if (status === "failed" || status === "blocked") return a.failure;
	return a.muted;
}

function stageMark(status: RequestRuntimeRecord["stages"][number]["status"]): string {
	if (status === "completed" || status === "skipped") return "✓";
	if (status === "running") return "›";
	if (status === "failed") return "×";
	if (status === "blocked") return "Ⅱ";
	return "○";
}

function stageRailRows(request: RequestRuntimeRecord, width: number): string[] {
	const rows: string[] = [];
	let current = "";
	for (const stage of request.stages) {
		const item = stageInk(stage.status)(`${stageMark(stage.status)} ${stage.id}`);
		const candidate = current ? `${current}  ${item}` : item;
		if (current && visibleWidth(candidate) > width) {
			rows.push(fit(current, width));
			current = item;
		} else current = candidate;
	}
	if (current) rows.push(fit(current, width));
	return rows;
}

function planTaskRows(request: RequestRuntimeRecord, width: number): string[] {
	const tasks = request.stages.flatMap(stage => stage.tasks.map(task => ({ ...task, stage: stage.id }))) ;
	const rows  = [...section("PLAN", width, tasks.length ? `${tasks.filter(task => task.status === "completed").length}/${tasks.length}` : "미관측", a.plan)] ;
	if (!tasks.length) return [...rows, ...prose(a.muted("DECOMPOSE·DECIDE에서 작업과 의존성을 정리합니다."), width)];
	const rootsByStage = new Map<string, number>();
	for (const task of tasks) if (!task.dependsOn.length) rootsByStage.set(task.stage, (rootsByStage.get(task.stage) ?? 0) + 1);
	for (const task of tasks) {
		const meta = task.dependsOn.length
			? `${task.dependsOn.join(", ")} 이후`
			: (rootsByStage.get(task.stage) ?? 0) > 1 ? "병렬 가능" : "독립 실행";
		rows.push(...prose(`${stageInk(task.status)(stageMark(task.status))} ${a.text(safe(task.title))}  ${a.muted(`· ${task.stage} · ${meta}`)}`, width));
	}
	return rows;
}

export function requestRuntimeRows(
	request: RequestRuntimeRecord,
	width: number,
	compact = false,
	_motionFrame = 8,
	_goal: string | null = null,
	activityRows?: readonly string[],
): string[] {
	const completed = request.stages.filter(stage => stage.status === "completed" || stage.status === "skipped").length                                                                                 ;
	const plan      = planTaskRows(request, width)                                                                                                                                    ;
	const stages    = section("STAGE", width, `${completed}/${request.stages.length}`, a.plan)                                                                                                         ;
	stages.push(...stageRailRows(request, width));
	if (request.attempt > 1) stages.push(...prose(a.muted(`시도 ${request.attempt} · 이전 ${request.previousAttempts.length}회 기록 보존`), width));
	const activeStage = request.stages.find(stage => stage.status === "running")
		?? request.stages.find(stage => stage.status === "failed" || stage.status === "blocked")
		?? request.stages.find(stage => stage.status === "pending")
		?? request.stages.at(-1);
	if (activeStage?.goal) stages.push(...compactStatusRows(activeStage.goal, activeStage.status, width, compact ? 1 : 2));
	for (const stage of request.stages.filter(stage => stage.skipReason)) {
		stages.push(...prose(a.muted(`${stage.id} · ${safe(stage.skipReason)}`), width, 2));
	}
	const progress  = activityRows ?? [...section("PROGRESS", width, "", a.info), ...prose(a.muted("정리된 세부 작업이 도착하면 이곳에 표시합니다."), width)] ;
	const issues = (compact ? request.issues.slice(-1) : request.issues).flatMap(issue => prose(a.attention(safe(issue)), width)) ;
	return joinedSections([stages, plan, progress, issues]).map(row => fit(row, width));
}

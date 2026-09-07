import {
	truncateToWidth,
	visibleWidth,
	wrapTextWithAnsi,
	type Component,
} from "@earendil-works/pi-tui";
import type { ProjectActivity } from "../../system/public";
import { todoDetailProgress, todoProgress, type TodoDocument, type TodoItem } from "../../system/public";
import { projectNativeDelegation, type WorkFlowProjection } from "../../system/public";
import type { WorkbenchTodoSyncState } from "../../system/public";
import { colors } from "../theme/theme";

function fit(text: string, width: number): string {
	if (width <= 0) return "";
	const clipped = truncateToWidth(text, width);
	return clipped + " ".repeat(Math.max(0, width - visibleWidth(clipped)));
}

export class StatusLine implements Component {
	private notice: string;
	constructor(initialNotice: string) {
		this.notice = initialNotice;
	}
	get hasNotice(): boolean {
		return this.notice.length > 0;
	}
	setNotice(notice: string): void {
		this.notice = notice;
	}
	invalidate(): void {}
	render(width: number): string[] {
		return [colors.muted(fit(this.notice, width))];
	}
}

export interface WorkspaceTodoLiveContext {
	readonly activeTurnId: string | null;
	readonly activities: readonly ProjectActivity[];
	readonly workFlow: WorkFlowProjection;
	readonly sync?: WorkbenchTodoSyncState;
}

/** @linear WOO-682 */
/** @linear WOO-700 WOO-701 WOO-703 */
export class WorkspaceTodoView implements Component {
	constructor(
		private readonly todo: () => TodoDocument | null,
		private readonly live: () => WorkspaceTodoLiveContext = () => ({
			activeTurnId: null,
			activities: [],
			workFlow: emptyWorkFlow(),
		}),
	) {}
	invalidate(): void {}
	render(width: number): string[] {
		return this.renderTodo(Math.max(1, width));
	}

	private renderTodo(width: number): string[] {
		const document = this.todo();
		const live = this.live();
		if (!document || document.items.length === 0) {
			const label = live.activeTurnId ? "TODO · 공개 계획을 기다리는 중" : "TODO · 현재 계획 없음";
			return [
				...wrapTextWithAnsi(colors.secondary(label), width),
				...syncRows(live.sync, width),
			];
		}

		const progress = todoProgress(document);
		const detailProgress = todoDetailProgress(document);
		const progressLabel = detailProgress.total > 0
			? `TODO ${progress.completed}/${progress.total} · 세부 ${detailProgress.completed}/${detailProgress.total}`
			: `TODO ${progress.completed}/${progress.total}`;
		const items = width < 42
			? [document.items.find(item => item.status === "in_progress")
				?? document.items.find(item => item.status === "pending")
				?? document.items.find(item => item.status === "blocked")].filter(
				(item): item is TodoItem => item !== undefined,
			)
			: document.items.slice(0, 12);
		const rows = [
			...wrapTextWithAnsi(`${todoProgressRail(progress.completed, progress.total, width)} ${colors.secondary(progressLabel)}`, width),
			...wrapTextWithAnsi(colors.highlight(`  ${document.storyId ? `${document.storyId} · ` : ""}${document.title}`), width),
			...todoSourceRows(document, width),
			...syncRows(live.sync, width),
		];
		const delegation = document.source
			? projectNativeDelegation(live.activities).find((entry) => entry.turnId === document.source?.turnId)
			: undefined;
		const shownTaskIds = new Set<string>();
		for (const item of items) {
			const parentDetailProgress = item.details.length > 0
				? ` (${item.details.filter(detail => detail.status === "completed").length}/${item.details.length})`
				: "";
			rows.push(...todoItemRows(item.status, item.content, parentDetailProgress, width, "  "));
			const details = width < 42
				? [item.details.find(detail => detail.status === "in_progress")
					?? item.details.find(detail => detail.status === "pending")
					?? item.details.find(detail => detail.status === "blocked")].filter(
					(detail): detail is TodoItem["details"][number] => detail !== undefined,
				)
				: item.details;
			for (const [index, detail] of details.entries()) {
				const branch = index === details.length - 1 ? "└" : "├";
				rows.push(...todoItemRows(detail.status, detail.content, "", width, `    ${colors.muted(branch)} `));
			}
			const step = item.source
				? live.workFlow.steps.find((candidate) => candidate.identity.value === item.source?.identity)
				: undefined;
			for (const task of delegation?.tasks ?? []) {
				const taskActivityIds = observedTaskActivityIds(task.id, live.activities, document.source?.turnId ?? null);
				if (!step || !taskActivityIds.some((activityId) => step.activityIds.includes(activityId))) continue;
				shownTaskIds.add(task.id);
				rows.push(...executionRows(task, width));
			}
		}
		const unboundCount = (delegation?.tasks ?? []).filter((task) => !shownTaskIds.has(task.id)).length;
		if (unboundCount > 0) {
			rows.push(...wrapTextWithAnsi(colors.warning(`  실행 연결 미확정 ${unboundCount}개 · 전체 실행은 Monitor에서 확인`), width));
		}
		if (width < 42) {
			const hidden = Math.max(0, document.items.length - items.length);
			if (hidden > 0) rows.push(...wrapTextWithAnsi(colors.muted(`  … ${hidden}개 숨김 · 넓은 화면에서 전체 표시`), width));
		}
		return rows;
	}
}

function todoSourceRows(document: TodoDocument, width: number): string[] {
	if (!document.source) return wrapTextWithAnsi(colors.warning("  실행 연결 · 확인 불가"), width);
	const execution = document.source.rootExecution;
	const model = execution.model ?? "모델 미확인";
	const agent = execution.agentId ?? "root";
	return wrapTextWithAnsi(colors.muted(`  주 실행 · ${model} · ${agent} · run ${shortRef(execution.runId)}`), width);
}

function syncRows(sync: WorkbenchTodoSyncState | undefined, width: number): string[] {
	if (!sync || sync.state === "idle") return [];
	if (sync.state === "syncing") return wrapTextWithAnsi(colors.accent("  저장 동기화 중 · 대화는 계속됩니다"), width);
	if (sync.state === "blocked") {
		return wrapTextWithAnsi(colors.warning(`  저장 보류 · ${sync.message ?? "다음 계획 관측 때 다시 확인합니다."}`), width);
	}
	return wrapTextWithAnsi(colors.muted(`  저장 확인 · ${sync.lastConfirmedAt ?? "시각 미확인"}`), width);
}

function executionRows(
	task: ReturnType<typeof projectNativeDelegation>[number]["tasks"][number],
	width: number,
): string[] {
	const state = task.status === "running" ? "진행 중"
		: task.status === "completed" ? "완료"
			: task.status === "failed" ? "실패" : "대기";
	const color = task.status === "running" ? colors.accent
		: task.status === "completed" ? colors.success
			: task.status === "failed" ? colors.error : colors.muted;
	const model = task.model ?? "모델 미확인";
	const label = `    ↳ ${model} · agent ${shortRef(task.id)} · ${state}${task.task ? ` · ${task.task}` : ""}`;
	return wrapTextWithAnsi(color(label), width);
}

function observedTaskActivityIds(
	taskId: string,
	activities: readonly ProjectActivity[],
	turnId: string | null,
): string[] {
	return activities.flatMap((activity) => {
		if (!turnId || activity.nativeRefs.turnId !== turnId) return [];
		const params = objectRecord(activity.payload.params);
		const item = objectRecord(params?.item);
		const receivers = Array.isArray(item?.receiverThreadIds)
			? item.receiverThreadIds.filter((value): value is string => typeof value === "string")
			: [];
		return receivers.includes(taskId) || item?.agentThreadId === taskId ? [activity.id] : [];
	});
}

function objectRecord(value: unknown): Readonly<Record<string, unknown>> | null {
	return value && typeof value === "object" && !Array.isArray(value)
		? value as Readonly<Record<string, unknown>>
		: null;
}

function shortRef(value: string | null): string {
	if (!value) return "미확인";
	return value.length <= 12 ? value : `${value.slice(0, 8)}…`;
}

function emptyWorkFlow(): WorkFlowProjection {
	return {
		source: null,
		retirements: [],
		orphans: [],
		rejections: [],
		goal: "",
		steps: [],
		completedCount: 0,
		currentStepNumber: null,
		observationCount: 0,
		summary: "",
	};
}

function todoMarker(status: TodoItem["status"]): string {
	if (status === "in_progress") return colors.highlight("◉");
	if (status === "completed") return colors.success("✓");
	if (status === "blocked") return colors.error("◆");
	return colors.muted("○");
}

function todoItemRows(
	status: TodoItem["status"],
	content: string,
	suffix: string,
	width: number,
	indent: string,
): string[] {
	const marker = todoMarker(status);
	const firstPrefix = `${indent}${marker} `;
	const continuationPrefix = " ".repeat(visibleWidth(firstPrefix));
	const available = Math.max(1, width - visibleWidth(firstPrefix));
	const color = status === "in_progress" ? colors.highlight
		: status === "completed" ? colors.success
			: status === "blocked" ? colors.error : colors.text;
	const wrapped = wrapTextWithAnsi(color(`${content}${suffix}`), available);
	return wrapped.map((line, index) => `${index === 0 ? firstPrefix : continuationPrefix}${line}`);
}

function todoProgressRail(completed: number, total: number, width: number): string {
	const cells = Math.max(3, Math.min(10, width < 42 ? 5 : 10));
	const filled = total > 0 ? Math.round((completed / total) * cells) : 0;
	const active = completed < total ? 1 : 0;
	return `${colors.success("━".repeat(filled))}${colors.accent("━".repeat(Math.min(active, cells - filled)))}${colors.muted("─".repeat(Math.max(0, cells - filled - active)))}`;
}

import {
	truncateToWidth,
	visibleWidth,
	wrapTextWithAnsi,
	type Component,
} from "@earendil-works/pi-tui";
import chalk from "chalk";
import type { ProjectActivity } from "../../../../core/domain/execution/project-activity";
import { todoProgress, type TodoDocument, type TodoItem } from "../../../../core/domain/work/todos";
import type { WorkFlowProjection } from "../../../../core/domain/work";
import type { WorkbenchTodoSyncState } from "../../../../core/domain/work/workbench";
import type { LinearProjectDashboard } from "../../../../core/domain/work/linear-dashboard";
import { colors } from "../shell/theme";
import { DASHBOARD_PANEL_SYSTEM, dashboardProgressCells } from "./dashboard-panel-system";

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
	readonly hasConversation?: boolean;
	/** Session Goal is shown until a Native Plan becomes the Todo source. */
	readonly goal?: string | null;
	readonly sync?: WorkbenchTodoSyncState;
}

/** Human time for the Todo heading; malformed or absent revisions stay quiet. */
export function todoPanelTimestamp(updatedAt: string | undefined): string {
	if (!updatedAt) return "";
	const date = new Date(updatedAt);
	if (Number.isNaN(date.getTime())) return "";
	return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
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
		private readonly linearDashboard: () => LinearProjectDashboard | undefined = () => undefined,
	) {}
	invalidate(): void {}
	render(width: number): string[] {
		return this.renderTodo(Math.max(1, width));
	}

	private renderTodo(width: number): string[] {
		const document = this.todo();
		const live = this.live();
		if (!document || document.items.length === 0) {
			const dashboard = this.linearDashboard();
			const showEntryDashboard = !live.hasConversation && !live.activeTurnId && !live.workFlow.source;
			const goalRows = live.goal
				? wrapTextWithAnsi(colors.highlight(`Goal · ${live.goal}`), width)
				: [];
			if (showEntryDashboard && dashboard?.state === "loading") return [
				...goalRows,
				...wrapTextWithAnsi(colors.secondary(`Update · ${dashboard.projectName}`), width),
				...wrapTextWithAnsi(colors.muted("Linear Project Update를 가져오는 중입니다."), width),
			];
			if (showEntryDashboard && (dashboard?.state === "ready" || dashboard?.state === "stale")) return [
				...goalRows,
				...wrapTextWithAnsi(colors.secondary(`Update · ${dashboard.projectName}`), width),
				...(dashboard.state === "stale" ? wrapTextWithAnsi(colors.warning("갱신 실패 · 마지막 성공 값"), width) : []),
				...wrapTextWithAnsi(dashboard.update?.body || "게시된 Project Update가 없습니다.", width),
				...(dashboard.update?.createdAt ? wrapTextWithAnsi(colors.muted(`갱신 · ${dashboard.update.createdAt}`), width) : []),
			];
			if (showEntryDashboard && dashboard?.state === "unavailable") return [
				...goalRows,
				...wrapTextWithAnsi(colors.secondary(`Update · ${dashboard.projectName}`), width),
				...wrapTextWithAnsi(colors.warning("Linear Project Update를 불러오지 못했습니다."), width),
			];
			return [
				...goalRows,
				...wrapTextWithAnsi(colors.secondary(live.activeTurnId ? "TODO · 공개 계획을 기다리는 중" : "TODO · 현재 계획 없음"), width),
				...syncRows(live.sync, width),
			];
		}

		const progress = todoProgress(document);
		const progressLabel = `${progress.completed} / ${progress.total}`;
		const items = width < 42
			? [document.items.find(item => item.status === "in_progress")
				?? document.items.find(item => item.status === "pending")
				?? document.items.find(item => item.status === "blocked")].filter(
				(item): item is TodoItem => item !== undefined,
			)
			: document.items.slice(0, 12);
		const rows = [
			...wrapTextWithAnsi(`${todoProgressRail(progress.completed, progress.total, width)} ${colors.secondary(progressLabel)}`, width),
			...wrapTextWithAnsi(colors.highlight(`Goal · ${document.title}`), width),
			...syncRows(live.sync, width),
		];
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
		}
		if (width < 42) {
			const hidden = Math.max(0, document.items.length - items.length);
			if (hidden > 0) rows.push(...wrapTextWithAnsi(colors.muted(`  … ${hidden}개 숨김 · 넓은 화면에서 전체 표시`), width));
		}
		return rows;
	}
}

function syncRows(sync: WorkbenchTodoSyncState | undefined, width: number): string[] {
	if (!sync || sync.state === "idle") return [];
	if (sync.state === "syncing") return wrapTextWithAnsi(colors.accent("  저장 동기화 중 · 대화는 계속됩니다"), width);
	if (sync.state === "blocked") {
		return wrapTextWithAnsi(colors.warning(`  저장 보류 · ${sync.message ?? "다음 계획 관측 때 다시 확인합니다."}`), width);
	}
	return wrapTextWithAnsi(colors.muted(`  저장 확인 · ${sync.lastConfirmedAt ?? "시각 미확인"}`), width);
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
	if (status === "in_progress") return colors.accent(DASHBOARD_PANEL_SYSTEM.todo.active);
	if (status === "completed") return colors.success(DASHBOARD_PANEL_SYSTEM.todo.completed);
	if (status === "blocked") return colors.error(DASHBOARD_PANEL_SYSTEM.todo.blocked);
	return colors.muted(DASHBOARD_PANEL_SYSTEM.todo.pending);
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
	const cells = dashboardProgressCells(width);
	const filled = total > 0 ? Math.round((completed / total) * cells) : 0;
	const empty = Math.max(0, cells - filled);
	return chalk.bgHex("#11d6e8")(" ".repeat(filled)) + chalk.bgHex("#173039")(" ".repeat(empty));
}

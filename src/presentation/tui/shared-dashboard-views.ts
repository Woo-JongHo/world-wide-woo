import {
	truncateToWidth,
	visibleWidth,
	wrapTextWithAnsi,
	type Component,
} from "@earendil-works/pi-tui";
import { todoDetailProgress, todoProgress, type TodoDocument, type TodoItem } from "../../domain/todos";
import { colors } from "./theme";

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
	setNotice(notice: string): void {
		this.notice = notice;
	}
	invalidate(): void {}
	render(width: number): string[] {
		return [colors.muted(fit(this.notice, width))];
	}
}

export class WorkspaceTodoView implements Component {
	constructor(private readonly todo: () => TodoDocument | null) {}
	invalidate(): void {}
	render(width: number): string[] {
		return this.renderTodo(Math.max(1, width));
	}

	private renderTodo(width: number): string[] {
		const document = this.todo();
		if (!document || document.items.length === 0) return [
			colors.muted("  ○ 진행 중인 작업 없음"),
		];

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
		return rows;
	}
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

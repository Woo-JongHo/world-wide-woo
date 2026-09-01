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
		return this.renderTodo(width).flatMap((row) => wrapTextWithAnsi(row, Math.max(1, width)));
	}

	private renderTodo(width: number): string[] {
		const document = this.todo();
		if (!document || document.items.length === 0) return [
			"  진행 중인 작업 없음",
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
			colors.secondary(progressLabel),
			colors.highlight(`  ${document.storyId ? `${document.storyId} · ` : ""}${document.title}`),
		];
		for (const item of items) {
			const parentDetailProgress = item.details.length > 0
				? ` (${item.details.filter(detail => detail.status === "completed").length}/${item.details.length})`
				: "";
			rows.push(`  ${todoMarker(item.status)} ${item.content}${parentDetailProgress}`);
			const details = width < 42
				? [item.details.find(detail => detail.status === "in_progress")
					?? item.details.find(detail => detail.status === "pending")
					?? item.details.find(detail => detail.status === "blocked")].filter(
					(detail): detail is TodoItem["details"][number] => detail !== undefined,
				)
				: item.details;
			for (const [index, detail] of details.entries()) {
				const branch = index === details.length - 1 ? "└" : "├";
				rows.push(`      ${branch} ${todoMarker(detail.status)} ${detail.content}`);
			}
		}
		return rows;
	}
}

function todoMarker(status: TodoItem["status"]): string {
	if (status === "in_progress") return "[•]";
	if (status === "completed") return "[x]";
	if (status === "blocked") return "[!]";
	return "[ ]";
}

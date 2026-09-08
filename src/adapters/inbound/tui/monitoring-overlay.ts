import { Key, matchesKey, truncateToWidth, wrapTextWithAnsi, type Component } from "@earendil-works/pi-tui";
import type { MonitoringSource } from "../../../core/application/session/session-monitor";
import type { MonitoringSnapshot, MonitoringTool } from "../../../core/domain/observability/monitoring";
import { colors, semantic } from "./theme";

type ObservedStatus = "RUNNING" | "COMPLETED" | "FAILED" | "CANCELLED" | "UNKNOWN";

function elapsed(milliseconds: number): string {
	const seconds = Math.max(0, Math.floor(milliseconds / 1_000));
	const minutes = Math.floor(seconds / 60);
	return minutes > 0 ? `${minutes}m ${seconds % 60}s` : `${seconds}s`;
}

function rowsWrapped(rows: readonly string[], width: number): string[] {
	return rows.flatMap(row => row ? wrapTextWithAnsi(row, Math.max(1, width)) : [""]);
}

function sessionStatus(snapshot: MonitoringSnapshot): ObservedStatus {
	if (snapshot.phase === "error") return "FAILED";
	if (snapshot.phase === "streaming" || snapshot.tools.running > 0) return "RUNNING";
	if (snapshot.phase === "ready" && (snapshot.turns.user > 0 || snapshot.turns.assistant > 0)) return "COMPLETED";
	return "UNKNOWN";
}

function toolStatus(tool: MonitoringTool | null): ObservedStatus {
	if (!tool) return "UNKNOWN";
	if (tool.status === "running") return "RUNNING";
	if (tool.status === "passed") return "COMPLETED";
	if (tool.status === "failed") return "FAILED";
	return "CANCELLED";
}

function todoStatus(snapshot: MonitoringSnapshot): ObservedStatus {
	if (snapshot.todo.activeContent) return "RUNNING";
	if (snapshot.todo.total > 0 && snapshot.todo.completed >= snapshot.todo.total) return "COMPLETED";
	return "UNKNOWN";
}

function statusText(status: ObservedStatus): string {
	if (status === "RUNNING") return semantic.toolRunning(status);
	if (status === "COMPLETED") return semantic.toolPassed(status);
	if (status === "FAILED") return semantic.toolFailed(status);
	if (status === "CANCELLED") return semantic.toolCancelled(status);
	return colors.warning(status);
}

export class MonitoringOverlay implements Component {
	private snapshot: MonitoringSnapshot;
	private unsubscribe: (() => void) | null = null;

	constructor(
		private readonly monitor: MonitoringSource,
		private readonly onUpdate: () => void,
		private readonly onClose: () => void,
		private readonly now: () => number = Date.now,
	) {
		this.snapshot = monitor.snapshot;
	}

	start(): void {
		if (this.unsubscribe) return;
		this.unsubscribe = this.monitor.subscribe(snapshot => {
			this.snapshot = snapshot;
			this.onUpdate();
		});
	}

	stop(): void {
		this.unsubscribe?.();
		this.unsubscribe = null;
	}

	invalidate(): void {}

	render(width: number): string[] {
		const snapshot = this.snapshot;
		const age = Math.max(0, this.now() - snapshot.updatedAt);
		const latestStatus = toolStatus(snapshot.tools.latest);
		const active = snapshot.tools.active
			? `${snapshot.tools.active.name} · ${statusText("RUNNING")}`
			: colors.muted("관측된 실행 없음");
		const latest = snapshot.tools.latest
			? `${snapshot.tools.latest.name} · ${statusText(latestStatus)}`
			: statusText("UNKNOWN");
		const compact = width < 48;
		const rows = [
			colors.accent("Monitoring · Live snapshot"),
			`${statusText(sessionStatus(snapshot))} · 갱신 ${elapsed(age)} 전`,
			colors.muted("현재 프로세스 메모리 관측 · 이전 이력은 부분적일 수 있음"),
			"",
			colors.secondary("Session"),
			`  ${snapshot.projectName} · ${snapshot.sessionId.slice(0, compact ? 8 : 12)}`,
			`  ${snapshot.provider}/${snapshot.model} · ${snapshot.effort}`,
			`  ${snapshot.phase} · ${snapshot.activityLabel ?? "activity 미관측"} · ${elapsed(snapshot.elapsedMs)}`,
			"",
			colors.secondary("Turn"),
			`  ${statusText(sessionStatus(snapshot))} · user ${snapshot.turns.user} · 🐙 Wooni ${snapshot.turns.assistant} · 중단 ${snapshot.turns.cancelled}`,
			"",
			colors.secondary("Tool"),
			`  현재 ${active}`,
			`  최근 ${latest}`,
			`  실행 ${snapshot.tools.running} · 성공 ${snapshot.tools.passed} · 실패 ${snapshot.tools.failed} · 취소 ${snapshot.tools.cancelled}`,
			"",
			colors.secondary("Todo"),
			`  ${statusText(todoStatus(snapshot))} · ${snapshot.todo.completed}/${snapshot.todo.total}${
				snapshot.todo.detailTotal > 0 ? ` · 세부 ${snapshot.todo.detailCompleted}/${snapshot.todo.detailTotal}` : ""
			}`,
			snapshot.todo.activeContent ? `  ${truncateToWidth(snapshot.todo.activeContent, Math.max(1, width - 2))}` : colors.muted("  활성 Todo 미관측"),
			"",
			colors.muted("Esc 닫기"),
		];
		return rowsWrapped(rows, width);
	}

	handleInput(data: string): void {
		if (!matchesKey(data, Key.escape)) return;
		this.stop();
		this.onClose();
	}
}

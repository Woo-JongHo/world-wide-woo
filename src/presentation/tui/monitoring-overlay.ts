import { Key, matchesKey, wrapTextWithAnsi, type Component } from "@earendil-works/pi-tui";
import type { MonitoringSource } from "../../application/session-monitor";
import type { MonitoringSnapshot } from "../../domain/monitoring";
import { colors, semantic } from "./theme";

function elapsed(milliseconds: number): string {
	const seconds = Math.max(0, Math.floor(milliseconds / 1_000));
	const minutes = Math.floor(seconds / 60);
	return minutes > 0 ? `${minutes}m ${seconds % 60}s` : `${seconds}s`;
}

function rowsWrapped(rows: readonly string[], width: number): string[] {
	return rows.flatMap(row => row ? wrapTextWithAnsi(row, Math.max(1, width)) : [""]);
}

export class MonitoringOverlay implements Component {
	private snapshot: MonitoringSnapshot;
	private unsubscribe: (() => void) | null = null;

	constructor(
		private readonly monitor: MonitoringSource,
		private readonly onUpdate: () => void,
		private readonly onClose: () => void,
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
		const liveElapsed = Date.now() - snapshot.startedAt;
		const latest = snapshot.tools.latest
			? `${snapshot.tools.latest.name} · ${snapshot.tools.latest.status}`
			: "도구 실행 없음";
		const active = snapshot.tools.active
			? semantic.toolRunning(`${snapshot.tools.active.name} 실행 중`)
			: colors.muted("대기");
		const rows = [
			colors.accent("Monitoring · Dashboard"),
			colors.muted("read-only projection · Esc 닫기"),
			"",
			colors.secondary("Session"),
			`  ${snapshot.projectName} · ${snapshot.sessionId.slice(0, 12)}`,
			`  ${snapshot.provider}/${snapshot.model} · ${snapshot.effort}`,
			`  ${snapshot.phase} · ${snapshot.activityLabel ?? "activity 없음"} · ${elapsed(liveElapsed)}`,
			"",
			colors.secondary("Turn"),
			`  user ${snapshot.turns.user} · bori ${snapshot.turns.assistant} · 중단 ${snapshot.turns.cancelled}`,
			"",
			colors.secondary("Tool"),
			`  실행 ${snapshot.tools.running} · 성공 ${snapshot.tools.passed} · 실패 ${snapshot.tools.failed} · 취소 ${snapshot.tools.cancelled}`,
			`  현재 ${active}`,
			`  최근 ${latest}`,
			"",
			colors.secondary("Todo"),
			`  ${snapshot.todo.completed}/${snapshot.todo.total}${
				snapshot.todo.detailTotal > 0 ? ` · 세부 ${snapshot.todo.detailCompleted}/${snapshot.todo.detailTotal}` : ""
			}${snapshot.todo.activeContent ? ` · ${snapshot.todo.activeContent}` : ""}`,
		];
		return rowsWrapped(rows, width);
	}

	handleInput(data: string): void {
		if (!matchesKey(data, Key.escape)) return;
		this.stop();
		this.onClose();
	}
}

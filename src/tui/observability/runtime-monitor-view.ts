import { truncateToWidth, visibleWidth, type Component } from "@earendil-works/pi-tui";
import type { RuntimeMonitorProjection, RuntimeMonitorState } from "../../system/public.js";
import { colors } from "../theme/theme.js";

const MAX_VIEW_WIDTH = 156;

/** @linear WOO-675 */
export class RuntimeMonitorView implements Component {
	public constructor(
		private readonly getMonitor: () => RuntimeMonitorProjection,
		private readonly now: () => number = Date.now,
	) {}
	public invalidate(): void {}

	public render(width: number): string[] {
		const size = Math.max(1, Math.min(MAX_VIEW_WIDTH, width));
		const data = this.getMonitor();
		const rows: string[] = [colors.accent("WORLD WIDE WOO · LIVE MONITOR"), stateLine(data), rule(size)];

		if (hasNoObservation(data)) {
			rows.push(colors.warning("Observation unknown · no runtime event is available."));
		} else if (data.state === "idle") {
			rows.push(colors.muted("No active execution observed."));
		} else {
			section(rows, "CURRENT", size);
			rows.push(`Request  ${data.activeRequest?.label ?? "not observed"}`);
			if (data.activeRequest) rows.push(`Elapsed  ${elapsedAt(data.activeRequest.elapsed, this.now())}`);
			rows.push(`Model    ${data.model ?? "unknown"}`);
			rows.push(`Agent    ${data.agent ?? "unknown"}`);
			if (data.currentTool) {
				rows.push(`Tool     ${data.currentTool.label}`);
				rows.push(`Tool age ${elapsedAt(data.currentTool.elapsed, this.now())}`);
			}
			if (data.approval?.pending) {
				rows.push(colors.warning(`Approval WAITING · ${data.approval.elapsed ? elapsedAt(data.approval.elapsed, this.now()) : "time unknown"}`));
			}
		}

		section(rows, "STATUS", size);
		rows.push(`Retry ${data.retryCount} · Failure ${data.failureCount} · Approval ${data.approval?.pending ? "waiting" : "none observed"}`);
		rows.push(colors.muted(`Coverage journal projection · ${data.recentEvents.length} recent event(s), up to 12`));

		if (size >= 56) {
			section(rows, "ACTIVITY", size);
			for (const event of data.recentEvents) {
				rows.push(`${event.recordedAt.slice(11, 19)}  ${pad(event.kind, 10)}  ${truncateToWidth(event.label, Math.max(1, size - 22))}`);
			}
			if (!data.recentEvents.length) rows.push(colors.muted("No recent activity observed."));
		}

		rows.push(rule(size), colors.muted(size < 56 ? "[3 Monitor] · Esc back" : "r next · R prev · 1 Stats · 2 Dashboard · [3 Monitor] · Esc back"));
		const offset = Math.max(0, Math.floor((width - size) / 2));
		return rows.map(row => `${" ".repeat(offset)}${truncateToWidth(row, size)}`);
	}
}

function hasNoObservation(data: RuntimeMonitorProjection): boolean {
	return data.state === "idle"
		&& data.sourceActivityIds.length === 0
		&& data.recentEvents.length === 0
		&& data.activeRequest === null
		&& data.currentTool === null;
}

function stateLine(data: RuntimeMonitorProjection): string {
	if (hasNoObservation(data)) return colors.warning("? UNKNOWN · observation unavailable or empty");
	return renderState(data.state);
}

function renderState(state: RuntimeMonitorState): string {
	if (state === "running") return colors.accent("● RUNNING");
	if (state === "waiting") return colors.warning("◐ WAITING");
	if (state === "blocked") return colors.warning("! BLOCKED");
	if (state === "failed") return colors.error("✕ FAILED");
	if (state === "completed") return colors.success("✓ COMPLETED");
	return colors.muted("○ IDLE");
}

function section(rows: string[], title: string, width: number): void {
	const label = ` ${title} `;
	rows.push(colors.border(`${label}${"─".repeat(Math.max(0, width - visibleWidth(label)))}`));
}

function rule(width: number): string {
	return colors.border("─".repeat(width));
}

function pad(value: string, width: number): string {
	const text = truncateToWidth(value, width);
	return text + " ".repeat(Math.max(0, width - visibleWidth(text)));
}

function elapsed(value: number | null): string {
	if (value === null) return "observed, end unknown";
	return value < 60_000
		? `${Math.round(value / 100) / 10}s`
		: `${Math.floor(value / 60_000)}m${String(Math.round(value % 60_000 / 1_000)).padStart(2, "0")}s`;
}

function elapsedAt(value: { readonly startedAt: string; readonly elapsedMs: number | null }, now: number): string {
	return value.elapsedMs === null
		? `${elapsed(Math.max(0, now - Date.parse(value.startedAt)))} running/partial`
		: elapsed(value.elapsedMs);
}

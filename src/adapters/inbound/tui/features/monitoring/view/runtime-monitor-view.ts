import { truncateToWidth, visibleWidth }                      from "@earendil-works/pi-tui";
import type { Component }                                     from "@earendil-works/pi-tui";
import type { RuntimeMonitorProjection, RuntimeMonitorState } from "@/core/domain/observability/runtime-monitor.js";
import { colors }                                             from "@/adapters/inbound/tui/foundation/theme/theme.js";

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
		const rows = [
			colors.accent("WORLD WIDE WOO · LIVE MONITOR"),
			stateLine(data),
			rule(size),
			...requestRows(data),
			...currentRows(data, size, () => this.now()),
			...statusRows(data, size),
			...activityRows(data, size),
			rule(size),
			colors.muted(size < 56 ? "[3 Monitor] · Esc back" : "r next · R prev · 1 Stats · 2 Dashboard · [3 Monitor] · Esc back"),
		];
		const offset = Math.max(0, Math.floor((width - size) / 2));
		return rows.map(row => `${" ".repeat(offset)}${truncateToWidth(row, size)}`);
	}
}

function requestRows(data: RuntimeMonitorProjection): string[] {
	if (!data.requestRuntime) return [];
	return [
		`REQUEST ${data.requestRuntime.requestId}`,
		...(data.requestRuntime.checkpoints ?? []).map(checkpoint => `${checkpoint.id.padEnd(11)} ${checkpoint.status} · ${checkpoint.summary ?? "unobserved"}`),
	];
}

function currentRows(data: RuntimeMonitorProjection, width: number, now: () => number): string[] {
	if (hasNoObservation(data)) return [colors.warning("Observation unknown · no runtime event is available.")];
	if (data.state === "idle") return [colors.muted("No active execution observed.")];
	const rows = [
		sectionLine("CURRENT", width),
		`Request  ${data.activeRequest?.label ?? "not observed"}`,
		...(data.activeRequest ? [`Elapsed  ${elapsedAt(data.activeRequest.elapsed, now())}`] : []),
		`Model    ${data.model ?? "unknown"}`,
		`Agent    ${data.agent ?? "unknown"}`,
		...(data.currentTool ? [`Tool     ${data.currentTool.label}`, `Tool age ${elapsedAt(data.currentTool.elapsed, now())}`] : []),
		...(data.approval?.pending ? [colors.warning(`Approval WAITING · ${data.approval.elapsed ? elapsedAt(data.approval.elapsed, now()) : "time unknown"}`)] : []),
		...skillRows(data, width),
	];
	return rows;
}

function skillRows(data: RuntimeMonitorProjection, width: number): string[] {
	if (!data.skillRun) return [];
	return [
		sectionLine("SKILL RUN", width),
		`Run      ${data.skillRun.runId}`,
		`Skill    ${data.skillRun.skill ?? "none"} · ${data.skillRun.stage}`,
		`Work     ${[data.skillRun.processId, data.skillRun.taskId].filter(Boolean).join(" / ") || "unbound"}`,
		...(data.skillRun.candidateId ? [`Candidate ${data.skillRun.candidateId}`] : []),
		...(data.skillRun.receiptId ? [`Receipt   ${data.skillRun.receiptId}`] : []),
	];
}

function statusRows(data: RuntimeMonitorProjection, width: number): string[] {
	return [
		sectionLine("STATUS", width),
		`Retry ${data.retryCount} · Failure ${data.failureCount} · Approval ${data.approval?.pending ? "waiting" : "none observed"}`,
		colors.muted(`Coverage journal projection · ${data.recentEvents.length} recent event(s), up to 12`),
	];
}

function activityRows(data: RuntimeMonitorProjection, width: number): string[] {
	if (width < 56) return [];
	return [
		sectionLine("ACTIVITY", width),
		...(data.recentEvents.length
			? data.recentEvents.map(event => `${event.recordedAt.slice(11, 19)}  ${pad(event.kind, 10)}  ${truncateToWidth(event.label, Math.max(1, width - 22))}`)
			: [colors.muted("No recent activity observed.")]),
	];
}

function hasNoObservation(data: RuntimeMonitorProjection): boolean {
	return data.state === "idle"
		&& data.sourceActivityIds.length === 0
		&& data.recentEvents.length === 0
		&& data.activeRequest === null
		&& data.currentTool === null
		&& data.skillRun === null;
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

function sectionLine(title: string, width: number): string {
	const label = ` ${title} `;
	return colors.border(`${label}${"─".repeat(Math.max(0, width - visibleWidth(label)))}`);
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

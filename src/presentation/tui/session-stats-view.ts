import { truncateToWidth, visibleWidth, wrapTextWithAnsi, type Component } from "@earendil-works/pi-tui";
import type { Claim, RequestReview, SessionStatsSnapshot } from "../../domain/session-stats.js";
import { colors } from "./theme.js";

type StatsTarget = "session" | "diagnostics" | "latest" | number;
type LineWriter = (value?: string) => void;

/** Read-only review of the public session statistics projection. */
export class SessionStatsView implements Component {
	public constructor(
		private readonly getStats: () => SessionStatsSnapshot,
		private readonly getTarget: () => StatsTarget = () => "session",
	) {}
	public invalidate(): void {}
	public render(width: number): string[] {
		const viewportWidth = Math.max(1, width);
		const safeWidth = Math.min(132, viewportWidth);
		const stats = this.getStats();
		const target = this.getTarget();
		const rows: string[] = [];
		const line: LineWriter = (value = "") => rows.push(...wrapTextWithAnsi(value, safeWidth));
		const section = (title: string): void => { line(""); line(colors.secondary(title)); };

		if (target === "diagnostics") this.renderDiagnostics(line, stats, safeWidth);
		else if (target === "latest" || typeof target === "number") this.renderRequest(line, stats, target, safeWidth);
		else this.renderSession(line, stats, safeWidth, viewportWidth >= 150, section);
		const offset = Math.max(0, Math.floor((viewportWidth - safeWidth) / 2));
		return rows.map(row => `${" ".repeat(offset)}${truncateToWidth(row, safeWidth)}`);
	}

	private renderSession(line: LineWriter, stats: SessionStatsSnapshot, width: number, wide: boolean, section: (title: string) => void): void {
		this.header(line, stats, width);
		if (stats.state === "empty") {
			line("");
			line("No activity observed yet.");
			line(colors.muted(`Coverage · ${stats.coverage}`));
			if (stats.activeModel) line(colors.muted(`Active model · ${stats.activeModel}`));
			line("");
			line(colors.muted("Waiting for the first request…"));
			return;
		}
		if (wide) {
			const left = this.sessionSummary(stats, Math.floor((Math.min(width, 132) - 3) / 2));
			const right = this.usageAndRequests(stats, Math.ceil((Math.min(width, 132) - 3) / 2));
			for (const row of joinColumns(left, right, Math.min(width, 132))) line(row);
		} else {
			for (const row of this.sessionSummary(stats, width)) line(row);
			for (const row of this.usageAndRequests(stats, width)) line(row);
		}
		if (stats.issues.length > 0) section("ISSUES");
		for (const issue of stats.issues.slice(-8)) {
			const state = issue.recovered ? colors.warning("RECOVERED") : colors.error("OPEN");
			line(`${state}  ${issue.method}`);
			line(`  ${issue.summary}`);
		}
		line("");
		line(colors.muted("/stats diagnostics · /stats latest · /stats #n"));
	}

	private header(line: LineWriter, stats: SessionStatsSnapshot, width: number): void {
		const heading = "SESSION REVIEW";
		line(center(colors.accent(heading), width));
		const coverage = stats.coverage === "fresh"
			? "WWW local journal · current process observation"
			: stats.coverage === "partial-local-journal"
				? "PARTIAL · local journal only · prior provider history unavailable"
				: "WWW observation coverage unavailable";
		line(center(colors.muted(coverage), width));
		const model = stats.activeModel;
		if (model) line(center(colors.muted(`active model · ${model}`), width));
		line(colors.border("─".repeat(width)));
	}

	private sessionSummary(stats: SessionStatsSnapshot, width: number): string[] {
		const rows: string[] = [];
		const add = (value = "") => rows.push(...wrapTextWithAnsi(value, width));
		const section = (title: string) => { add(""); add(colors.secondary(title)); };
		section("PURPOSE");
		claim(add, stats.claims.purpose, width);
		section("RESULT NARRATIVE");
		claim(add, stats.claims.result, width, "UNVERIFIED");
		section("PERFORMANCE");
		metric(add, "Journal span", duration(stats.performance.journalSpanMs), width);
		metric(add, "Root turn completion", percent(stats.performance.rootTurnCompletionPercent), width);
		metric(add, "Completed turn average", duration(stats.performance.averageCompletedRootTurnMs), width);
		metric(add, "Paired tool time", duration(stats.performance.pairedToolTimeMs), width);
		metric(add, "Approval wait average", duration(stats.performance.averageApprovalWaitMs), width);
		metric(add, "Approval wait total", duration(stats.performance.totalApprovalWaitMs), width);
		metric(add, "First output average", duration(stats.performance.averageFirstOutputMs), width);
		metric(add, "Interactive tokens / completed turn", stats.performance.interactiveTokensPerCompletedRootTurn === null ? "—" : number(stats.performance.interactiveTokensPerCompletedRootTurn), width);
		return rows;
	}

	private usageAndRequests(stats: SessionStatsSnapshot, width: number): string[] {
		const rows: string[] = [];
		const add = (value = "") => rows.push(...wrapTextWithAnsi(value, width));
		const section = (title: string) => { add(""); add(colors.secondary(title)); };
		section("MODEL USAGE");
		const observedTotal = stats.modelUsage.reduce((total, row) => total + row.totalTokens, 0) + (stats.unattributedUsage?.totalTokens ?? 0);
		if (stats.modelUsage.length === 0) add(colors.muted("No observed model usage."));
		for (const usage of stats.modelUsage) {
			const namespace = usage.namespace === "interactive" ? "interactive turns" : "detached calls";
			const count = usage.namespace === "interactive" ? usage.interactiveRootTurns : usage.detachedInvocations;
			const share = observedTotal > 0 ? `${Math.round((usage.totalTokens / observedTotal) * 100)}%` : "—";
			add(`${usage.model}${usage.effort ? ` · ${usage.effort}` : ""}`);
			metric(add, namespace, String(count), width);
			metric(add, "Tokens", `${number(usage.totalTokens)} · ${share} observed`, width);
		}
		if (stats.unattributedUsage) add(colors.warning(`Unattributed usage · ${number(stats.unattributedUsage.totalTokens)} tokens · ${stats.unattributedUsage.warning}`));
		section(`REQUESTS · ${stats.requests.submitted} submitted`);
		if (stats.requests.shortlist.length === 0) add(colors.muted("No observed requests."));
		for (const request of stats.requests.shortlist.slice(0, 8)) requestRow(add, request, width);
		if (stats.requests.submitted > stats.requests.shortlist.length) add(colors.muted(`${stats.requests.submitted - stats.requests.shortlist.length} requests not shown.`));
		return rows;
	}

	private renderRequest(line: LineWriter, stats: SessionStatsSnapshot, target: "latest" | number, width: number): void {
		const request = target === "latest" ? stats.requests.details.at(-1) : stats.requests.details.find(item => item.ordinal === target);
		line(center(colors.accent("REQUEST INVESTIGATION"), width));
		line(center(colors.muted("WWW local-journal observation · provider internals unavailable"), width));
		line(colors.border("─".repeat(width)));
		if (!request) { line(colors.warning("Requested request is unavailable.")); return; }
		line(colors.secondary(`#${request.ordinal} · ${request.excerpt ?? "excerpt unavailable"}`));
		metric(line, "Lifecycle", request.lifecycle, width);
		metric(line, "Observed elapsed", duration(request.observedElapsedMs), width);
		metric(line, "Models", request.models.join(", ") || "—", width);
		line("");
		line(colors.secondary("REQUEST EXCERPT SOURCE"));
		line(request.excerptSourceActivityId ? `/source ${request.excerptSourceActivityId}  ${colors.muted("opens Monitor source")}` : colors.muted("No excerpt source observed."));
		line("");
		line(colors.secondary("RELATED ACTIVITIES"));
		if (request.sourceActivityIds.length === 0) line(colors.muted("No source activities observed."));
		for (const id of request.sourceActivityIds.filter(id => id !== request.excerptSourceActivityId)) line(`/source ${id}  ${colors.muted("opens Monitor source")}`);
	}

	private renderDiagnostics(line: LineWriter, stats: SessionStatsSnapshot, width: number): void {
		line(center(colors.accent("SESSION DIAGNOSTICS"), width));
		line(colors.border("─".repeat(width)));
		for (const [kind, count] of Object.entries(stats.diagnostics.activityCounts)) metric(line, kind, String(count), width);
		metric(line, "Retries", String(stats.diagnostics.retryCount), width);
		metric(line, "Waits", String(stats.diagnostics.waitCount), width);
		metric(line, "Compactions", String(stats.diagnostics.compactionCount), width);
		for (const warning of stats.diagnostics.warnings) line(colors.warning(warning));
		for (const unavailable of stats.diagnostics.providerMetricsUnavailable) line(colors.muted(`${unavailable} · unavailable`));
	}
}

function claim(line: LineWriter, value: Claim, width: number, badge?: string): void {
	line(`${badge ? `${colors.warning(`[${badge}] `)}` : ""}${value.text || "unknown"}`);
	line(colors.muted(`Source authority · ${value.authority}`));
	if (width >= 100 && value.sourceActivityIds.length) line(colors.muted(`Sources · ${value.sourceActivityIds.join(", ")}`));
}
function requestRow(line: LineWriter, request: RequestReview, width: number): void {
	const excerpt = request.excerpt ? ` [${request.excerpt}]` : " [excerpt unavailable]";
	line(`#${request.ordinal}${excerpt}`);
	const details = `${request.lifecycle} · ${request.models.at(0) ?? "model unavailable"} · ${duration(request.observedElapsedMs)}`;
	line(colors.muted(width < 60 ? truncateToWidth(details, width) : details));
}
function metric(line: LineWriter, label: string, current: string, width: number): void {
	const available = Math.max(0, width - visibleWidth(label) - visibleWidth(current) - 2);
	if (available >= 1) line(`${label}${" ".repeat(available)}${current}`);
	else line(`${label} ${current}`);
}
function joinColumns(left: readonly string[], right: readonly string[], width: number): string[] {
	const leftWidth = Math.floor((width - 3) / 2);
	const rightWidth = width - leftWidth - 3;
	return Array.from({ length: Math.max(left.length, right.length) }, (_, index) => `${pad(left[index] ?? "", leftWidth)} ${colors.muted("│")} ${pad(right[index] ?? "", rightWidth)}`);
}
function center(value: string, width: number): string { return `${" ".repeat(Math.max(0, Math.floor((width - visibleWidth(value)) / 2)))}${value}`; }
function pad(value: string, width: number): string { return `${truncateToWidth(value, width)}${" ".repeat(Math.max(0, width - visibleWidth(value)))}`; }
function duration(value: number | null): string { if (value === null) return "—"; if (value < 1000) return `${value}ms`; if (value < 60_000) return `${Math.round(value / 100) / 10}s`; return `${Math.floor(value / 60_000)}m${String(Math.round((value % 60_000) / 1000)).padStart(2, "0")}s`; }
function percent(value: number | null): string { return value === null ? "—" : `${value}%`; }
function number(value: number): string { return value.toLocaleString("en-US"); }

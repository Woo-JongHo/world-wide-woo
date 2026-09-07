import { truncateToWidth, visibleWidth, wrapTextWithAnsi, type Component } from "@earendil-works/pi-tui";
import type { RequestReview, SessionStatsSnapshot } from "../../system/public.js";
import type { ObservabilitySessionSummary } from "../../system/public.js";
import { colors } from "../theme/theme.js";

type StatsTarget = "session" | "diagnostics" | "latest" | number;
type LineWriter = (value?: string) => void;

/** Read-only dashboard of the public session statistics projection. @linear WOO-714 */
export class SessionStatsView implements Component {
	public constructor(
		private readonly getStats: () => SessionStatsSnapshot,
		private readonly getTarget: () => StatsTarget = () => "session",
		private readonly getHistoricalSession: () => ObservabilitySessionSummary | null = () => null,
		private readonly getSelectedRequestOrdinal: () => number | null = () => null,
	) {}
	public invalidate(): void {}
	public render(width: number): string[] {
		const viewportWidth = Math.max(1, width);
		const safeWidth = Math.min(156, viewportWidth);
		const stats = this.getStats();
		const target = this.getTarget();
		const rows: string[] = [];
		const line: LineWriter = (value = "") => rows.push(...wrapTextWithAnsi(value, safeWidth));
		const historical = this.getHistoricalSession();
		if (target === "session" && historical) this.renderHistorical(line, historical, safeWidth);
		else if (target === "diagnostics") this.renderDiagnostics(line, stats, safeWidth);
		else if (target === "latest" || typeof target === "number") this.renderRequest(line, stats, target, safeWidth);
		else this.renderDashboard(line, stats, safeWidth);
		const offset = Math.max(0, Math.floor((viewportWidth - safeWidth) / 2));
		return rows.map(row => `${" ".repeat(offset)}${truncateToWidth(row, safeWidth)}`);
	}

	private renderHistorical(line: LineWriter, session: ObservabilitySessionSummary, width: number): void {
		line(colors.accent("WORLD WIDE WOO · SESSION STATS"));
		line(`${session.sessionId} · ${session.result.toUpperCase()} · historical observation`);
		line(rule(width));
		line(`PROJECT      ${session.projectId ?? "—"}`);
		line(`ELAPSED      ${session.startedAt && session.endedAt ? duration(Date.parse(session.endedAt) - Date.parse(session.startedAt)) : "—"}`);
		line(`TOKENS       ${session.usage ? compactNumber(session.usage.totalTokens) : "—"}`);
		line(`FAILURES     ${session.failures ?? "—"}    RETRIES ${session.retries ?? "—"}`);
		line(colors.muted("Request details and live execution are unavailable for this historical coverage."));
		line(colors.muted("r next · R prev · [1 Stats] · 2 Dashboard · 3 Monitor · Esc back"));
	}

	private renderDashboard(line: LineWriter, stats: SessionStatsSnapshot, width: number): void {
		line(colors.accent("WORLD WIDE WOO · SESSION STATS"));
		line(oneLine(`${stats.lifecycle.threadId ?? "local session"} · ${stateText(stats)} · coverage ${coverageText(stats.coverage)}   Purpose ${compactClaim(stats.claims.purpose.text)}`, width));
		line(colors.muted(rootOutcomesText(stats)));
		line(rule(width));
		if (stats.state === "empty") {
			line(colors.muted(`No activity observed · ${stats.activeModel ?? "model unavailable"}`));
			line(colors.muted(stats.observedTotalTokens === null ? "Token usage unobserved." : `${compactNumber(stats.observedTotalTokens)} observed tokens.`));
			line(colors.muted("Waiting for the first request…"));
			return;
		}

		const totalTokens = stats.observedTotalTokens;
		const kpis = [
			["ROOT COMPLETION", percent(stats.performance.rootTurnCompletionPercent), `${stats.lifecycle.completedRootTurns}/${stats.lifecycle.rootTurns} root turns`],
			["JOURNAL SPAN", duration(stats.performance.journalSpanMs), "observed activity range"],
			["TOKENS", totalTokens === null ? "—" : compactNumber(totalTokens), totalTokens === null ? "usage unobserved" : "observed namespaces"],
			["REQUESTS", String(stats.requests.submitted), "submitted requests"],
			["FIRST OUTPUT AVG", duration(stats.performance.averageFirstOutputMs), `${stats.performance.firstOutputObservations}/${stats.lifecycle.rootTurns} root turns`],
		] as const;
		for (const row of metricCells(kpis, width, width < 110 ? 2 : 5)) line(row);

		section(line, "MODEL USAGE", width);
		line(colors.muted(`Coverage · interactive ${observedLabel(stats.usageObservationCoverage.interactive)} · detached ${observedLabel(stats.usageObservationCoverage.detached)}`));
		if (totalTokens === null) line(colors.muted("Token usage unobserved."));
		else if (totalTokens === 0) line(colors.muted(stats.modelUsage.length === 0
			? "0 observed tokens · no attributed model or namespace usage."
			: "0 observed tokens across recorded model namespaces."));
		else if (stats.modelUsage.length === 0) line(colors.muted("No model-attributed usage rows observed."));
		for (const usage of stats.modelUsage) {
			const share = totalTokens !== null && totalTokens > 0 ? Math.round((usage.totalTokens / totalTokens) * 100) : null;
			const count = usage.namespace === "interactive" ? usage.interactiveRootTurns : usage.detachedInvocations;
			const unit = usage.namespace === "interactive" ? "turns" : "calls";
			const labelWidth = width < 70 ? 10 : 20;
			const suffix = `${share === null ? "—" : `${share}%`}  ${compactNumber(usage.totalTokens)}  ${count} ${unit}`;
			const barWidth = Math.max(6, width - labelWidth - visibleWidth(suffix) - 4);
			line(`${pad(modelLabel(usage.model), labelWidth)} ${usageBar(share, barWidth)}  ${colors.accent(suffix)}`);
		}
		if (stats.unattributedUsage) line(colors.warning(`! Unattributed · ${compactNumber(stats.unattributedUsage.totalTokens)}`));

		section(line, "PERFORMANCE", width);
		const performance = [
			["ROOT TURN AVG", duration(stats.performance.averageCompletedRootTurnMs), `${stats.performance.completedRootTurnDurationObservations}/${stats.lifecycle.completedRootTurns} completed pairs`],
			["PAIRED TOOL TIME", duration(stats.performance.pairedToolTimeMs), `${stats.performance.pairedToolObservations} paired calls`],
			["FIRST OUTPUT AVG", duration(stats.performance.averageFirstOutputMs), `${stats.performance.firstOutputObservations}/${stats.lifecycle.rootTurns} root turns`],
			["TOKENS / ROOT TURN", stats.performance.interactiveTokensPerCompletedRootTurn === null ? "—" : compactNumber(stats.performance.interactiveTokensPerCompletedRootTurn), stats.usageObservationCoverage.interactive ? `interactive tokens ÷ ${stats.lifecycle.completedRootTurns} completed root turns` : "interactive usage unobserved"],
			["APPROVAL WAIT", duration(stats.performance.totalApprovalWaitMs), `${stats.performance.pairedApprovalWaitObservations} paired approvals`],
			["ROOT COMPLETION", percent(stats.performance.rootTurnCompletionPercent), `${stats.lifecycle.completedRootTurns}/${stats.lifecycle.rootTurns} root turns`],
		] as const;
		for (const row of metricCells(performance, width, width < 110 ? 2 : 3)) line(row);
		line(colors.muted("Elapsed pairs use local journal start → terminal only; partial coverage may omit earlier runtime."));
		line(colors.muted("Paired tool durations are summed and may overlap."));

		section(line, `REQUESTS · ${stats.requests.submitted}`, width);
		for (const row of requestHeader(width)) line(colors.muted(row));
		const selectedOrdinal = this.getSelectedRequestOrdinal();
		for (const request of stats.requests.shortlist.slice(0, 10)) line(requestTableRow(request, width, request.ordinal === selectedOrdinal));
		if (stats.requests.submitted > stats.requests.shortlist.length) line(colors.muted(`… ${stats.requests.submitted - stats.requests.shortlist.length} more requests`));

		line(rule(width));
		if (stats.issues.length === 0) line(colors.success("✓ No orchestration issues observed"));
		else for (const issue of stats.issues.slice(-5)) line(oneLine(`${issue.recovered ? colors.warning("!") : colors.error("!")} ${issue.turnId ?? "session"}  ${issue.method} · ${issue.summary}`, width));
		line(colors.muted("Execution observations only · root-turn completion is not task acceptance · Cost unavailable."));
		line(colors.muted("Enter / /stats #n · request detail    /source · evidence    Esc · back"));
	}

	private renderRequest(line: LineWriter, stats: SessionStatsSnapshot, target: "latest" | number, width: number): void {
		const request = target === "latest" ? stats.requests.details.at(-1) : stats.requests.details.find(item => item.ordinal === target);
		line(colors.accent("REQUEST INVESTIGATION")); line(rule(width));
		if (!request) { line(colors.warning("Requested request is unavailable.")); return; }
		line(colors.secondary(`#${String(request.ordinal).padStart(2, "0")} · ${request.excerpt ?? "excerpt unavailable"}`));
		line(`Lifecycle ${request.lifecycle} · Elapsed ${duration(request.observedElapsedMs)} · Models ${request.models.join(", ") || "—"}`);
		line(""); line(colors.secondary("SOURCE"));
		for (const id of request.sourceActivityIds) line(`/source ${id}`);
	}

	private renderDiagnostics(line: LineWriter, stats: SessionStatsSnapshot, width: number): void {
		line(colors.accent("SESSION DIAGNOSTICS")); line(rule(width));
		for (const [kind, count] of Object.entries(stats.diagnostics.activityCounts)) line(`${kind}  ${count}`);
		line(`Retries  ${stats.diagnostics.retryCount} · Waits  ${stats.diagnostics.waitCount} · Compactions  ${stats.diagnostics.compactionCount}`);
		for (const warning of stats.diagnostics.warnings) line(colors.warning(warning));
		for (const unavailable of stats.diagnostics.providerMetricsUnavailable) line(colors.muted(`${unavailable} · unavailable`));
	}
}

function rootOutcomesText(stats: SessionStatsSnapshot): string {
	return `ROOT OUTCOMES · completed ${stats.lifecycle.completedRootTurns} · failed ${stats.lifecycle.failedRootTurns} · cancelled ${stats.lifecycle.cancelledRootTurns} · active ${stats.lifecycle.activeRootTurns} · boundary-only ${stats.lifecycle.boundaryOnlyRootTurns}`;
}
function stateText(stats: SessionStatsSnapshot): string {
	switch (stats.state) {
		case "empty": return colors.muted("EMPTY");
		case "active": return colors.warning("ACTIVE");
		case "failed": return colors.error("FAILED");
		case "cancelled": return colors.warning("CANCELLED");
		case "completed": return colors.success("OBSERVED COMPLETED");
		case "observed": return colors.muted("OBSERVED");
	}
}
function coverageText(coverage: SessionStatsSnapshot["coverage"]): string { return coverage.replaceAll("-", " "); }
function observedLabel(observed: boolean): string { return observed ? "observed" : "unobserved"; }
function compactClaim(value: string): string { return !value || value === "unknown" ? "—" : oneLine(value, 44); }
function section(line: LineWriter, title: string, width: number): void { line(ruleTitle(title, width)); }
function rule(width: number): string { return colors.border("─".repeat(width)); }
function ruleTitle(title: string, width: number): string { const label = ` ${title} `; return colors.border(`${label}${"─".repeat(Math.max(0, width - visibleWidth(label)))}`); }
function metricCells(items: readonly (readonly [string, string, string])[], width: number, columns: number): string[] {
	const cellWidth = Math.max(1, Math.floor((width - (columns - 1) * 2) / columns));
	const rows: string[] = [];
	for (let index = 0; index < items.length; index += columns) {
		const group = items.slice(index, index + columns);
		rows.push(group.map(item => pad(colors.muted(item[0]), cellWidth)).join("  "));
		rows.push(group.map(item => pad(colors.accent(item[1]), cellWidth)).join("  "));
		if (group.some(item => item[2])) rows.push(group.map(item => pad(colors.muted(item[2]), cellWidth)).join("  "));
	}
	return rows;
}
function requestHeader(width: number): string[] { return [width < 110 ? "#   REQUEST                         STATUS      TIME" : "#   REQUEST                                      STATUS       MODEL             TIME"]; }
function requestTableRow(request: RequestReview, width: number, selected = false): string {
	const status = request.lifecycle === "completed" ? colors.success("✓ done") : request.lifecycle === "failed" ? colors.error("✗ fail") : colors.warning(request.lifecycle);
	const ordinal = String(request.ordinal).padStart(2, "0");
	const marker = selected ? colors.accent("▶") : " ";
	if (width < 110) return `${marker}${ordinal}  ${pad(requestLabel(request), 29)}  ${pad(status, 10)}  ${pad(duration(request.observedElapsedMs), 8)}`;
	return `${marker}${ordinal}  ${pad(requestLabel(request), 43)}  ${pad(status, 11)}  ${pad(modelLabel(request.models.at(0) ?? "—"), 14)}  ${pad(duration(request.observedElapsedMs), 8)}`;
}
function requestLabel(request: RequestReview): string { return oneLine(request.excerpt ?? "Request label unavailable", 44); }
function modelLabel(model: string): string { return model.replace(/^gpt-[\d.]+-/u, "").replace(/^claude-/u, "").replace(/^gemini-/u, ""); }
function usageBar(share: number | null, width: number): string { const filled = share === null ? 0 : Math.round(width * share / 100); return `${colors.accent("█".repeat(filled))}${colors.muted("░".repeat(width - filled))}`; }
function oneLine(value: string, width: number): string { return truncateToWidth(value.replace(/\s+/gu, " ").trim(), width); }
function pad(value: string, width: number): string { return `${truncateToWidth(value, width)}${" ".repeat(Math.max(0, width - visibleWidth(value)))}`; }
function duration(value: number | null): string { if (value === null) return "—"; if (value < 1000) return `${value}ms`; if (value < 60_000) return `${Math.round(value / 100) / 10}s`; return `${Math.floor(value / 60_000)}m${String(Math.round((value % 60_000) / 1000)).padStart(2, "0")}s`; }
function percent(value: number | null): string { return value === null ? "—" : `${value}%`; }
function compactNumber(value: number): string { if (value >= 1_000_000) return `${Math.round(value / 10_000) / 100}M`; if (value >= 1_000) return `${Math.round(value / 100) / 10}k`; return String(value); }

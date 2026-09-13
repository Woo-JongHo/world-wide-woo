import type { Component } from "@earendil-works/pi-tui";
import type { ObservabilityDashboard } from "../../../../../core/domain/observability/observability-dashboard";
import { a, fit, number, pair, prose, safe, section } from "../../foundation/theme/astra-theme";
import { dashboardSessionWindow } from "./dashboard-session-window";

function document(rows: string[], width: number): string[] { return rows.flatMap(row => prose(row, width)); }
function kv(label: string, value: unknown): string { return `${a.muted(fit(label, 20))} ${a.text(safe(value ?? "—"))}`; }

export class AstraHistoryView implements Component {
	constructor(private readonly get: () => ObservabilityDashboard, private readonly selected: () => number, private readonly bodyHeight: () => number = () => 12) {}
	invalidate(): void {}
	render(width: number): string[] {
		const d = this.get();
		const window = dashboardSessionWindow(d.recentSessions.length, this.selected(), Math.max(1, Math.min(8, this.bodyHeight() - 7)));
		const rows = [pair(a.strong("세션 기록"), a.muted(d.coverage.state), width), "", `${number(d.sessions.active)} 실행    ${number(d.sessions.completed)} 완료    ${number(d.sessions.failures)} 실패`, a.muted(`↑↓ 선택 / Enter 세션 검토   ${window.start + (d.recentSessions.length ? 1 : 0)}–${window.end}/${d.recentSessions.length}`), ""];
		for (let index = window.start; index < window.end; index++) {
			const session = d.recentSessions[index]!;
			const row = fit(`${index === window.selectedIndex ? "›" : " "} ${fit(session.result, 10)} ${safe(session.sessionId)}`, width);
			rows.push(index === window.selectedIndex ? a.selected(row) : a.text(row));
		}
		const selected = d.recentSessions[window.selectedIndex];
		if (selected) rows.push("", a.muted(fit(`${safe(selected.projectId || "Project 미관측")} / ${safe(selected.startedAt || "시작 미관측")}`, width)));
		if (!d.recentSessions.length) rows.push(a.muted("관측된 이전 세션이 없습니다."));
		rows.push(a.muted(`${d.coverage.streamsRead} streams / ${d.coverage.skippedStreams} skipped`));
		rows.push(...section("추이", width));
		if (!d.trend.available) rows.push(a.muted("관측 일자가 부족해 추이를 표시하지 않습니다."));
		for (const b of d.trend.buckets) rows.push(`${safe(b.date)}   ${b.completedSessions} 완료 / ${b.failedSessions} 실패`);
		rows.push(...section("사용량", width), kv("관측 토큰", number(d.usage.totalTokens)), kv("재시도", number(d.health.retries)), kv("완료율", d.health.completionPercent === null ? "—" : `${d.health.completionPercent}%`));
		for (const m of d.usage.models) rows.push(kv(safe(m.model), `${number(m.totalTokens)} / ${m.effort ?? "—"}`));
		for (const alert of d.attention) rows.push(a.attention(`! ${safe(alert)}`));
		return document(rows, width);
	}
}

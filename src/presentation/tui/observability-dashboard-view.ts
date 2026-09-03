import { truncateToWidth, visibleWidth, type Component } from "@earendil-works/pi-tui";
import type { ObservabilityDashboard, ObservabilitySessionSummary } from "../../domain/observability-dashboard.js";
import { colors } from "./theme.js";

export class ObservabilityDashboardView implements Component {
	public constructor(
		private readonly getDashboard: () => ObservabilityDashboard,
		private readonly getSelectedIndex: () => number = () => 0,
	) {}
	public invalidate(): void {}
	public render(width: number): string[] {
		const size = Math.max(1, Math.min(156, width));
		const data = this.getDashboard();
		const rows: string[] = [colors.accent("WORLD WIDE WOO · DASHBOARD"), colors.muted(coverage(data)), rule(size)];
		rows.push(...cells([
			["ACTIVE", metric(data.sessions.active)], ["COMPLETED", metric(data.sessions.completed)],
			["TOKENS", compact(data.usage.totalTokens)], ["FAILURES", metric(data.sessions.failures)],
		], size, size < 110 ? 2 : 4));
		section(rows, "MODEL USAGE", size);
		if (!data.usage.models.length) rows.push(colors.muted("Aggregate model usage unavailable"));
		for (const model of data.usage.models) {
			const share = data.usage.totalTokens ? Math.round(model.totalTokens / data.usage.totalTokens * 100) : 0;
			const suffix = `${share}%  ${compact(model.totalTokens)}`;
			const barWidth = Math.max(6, size - 30 - visibleWidth(suffix));
			rows.push(`${pad(model.model, 20)} ${bar(share, barWidth)}  ${suffix}`);
		}
		section(rows, "HEALTH / TREND", size);
		rows.push(`Completion ${percent(data.health.completionPercent)}   Retry ${metric(data.health.retries)}   Failure ${metric(data.health.failures)}`);
		rows.push(data.trend.available ? `Sessions  ${spark(data.trend.buckets.map(row => row.completedSessions))}` : colors.muted("Trend unavailable · insufficient observed buckets"));
		section(rows, "ATTENTION", size);
		if (!data.attention.length) rows.push(colors.success("✓ No sessions need attention"));
		else for (const item of data.attention.slice(0, 5)) rows.push(colors.warning(`! ${truncateToWidth(item, size - 2)}`));
		section(rows, "RECENT SESSIONS", size);
		rows.push(colors.muted(size < 110 ? "SESSION       RESULT      MODEL      TIME" : "SESSION               PROJECT       RESULT      MODEL          TIME      TOKENS"));
		for (const [index, session] of data.recentSessions.slice(0, 10).entries()) rows.push(`${index === this.getSelectedIndex() ? colors.accent(">") : " "} ${sessionRow(session, size - 2)}`);
		if (!data.recentSessions.length) rows.push(colors.muted("No observed sessions."));
		rows.push(rule(size), colors.muted("r next · R prev · 1 Stats · [2 Dashboard] · 3 Monitor · Esc back"));
		const offset = Math.max(0, Math.floor((width - size) / 2));
		return rows.map(row => `${" ".repeat(offset)}${truncateToWidth(row, size)}`);
	}
}
function coverage(data: ObservabilityDashboard): string { const { state, observedFrom, observedUntil } = data.coverage; return `${state.toUpperCase()} · ${date(observedFrom)} — ${date(observedUntil)}`; }
function sessionRow(row: ObservabilitySessionSummary, width: number): string { const result = row.result === "completed" ? "✓ done" : row.result === "failed" ? "✕ failed" : row.result === "active" ? "● active" : row.result; const model = row.usage?.models.at(0)?.model ?? "—"; const elapsed = row.startedAt && row.endedAt ? duration(Date.parse(row.endedAt) - Date.parse(row.startedAt)) : "—"; if (width < 110) return `${pad(row.sessionId, 12)}  ${pad(result, 10)}  ${pad(model, 10)}  ${elapsed}`; return `${pad(row.sessionId, 20)}  ${pad(row.projectId ?? "—", 12)}  ${pad(result, 10)}  ${pad(model, 13)}  ${pad(elapsed, 8)}  ${compact(row.usage?.totalTokens ?? null)}`; }
function cells(items: readonly (readonly [string,string])[], width: number, columns: number): string[] { const w = Math.floor((width - columns * 2 + 2) / columns); const rows:string[]=[]; for(let i=0;i<items.length;i+=columns){const group=items.slice(i,i+columns);rows.push(group.map(x=>pad(colors.muted(x[0]),w)).join("  "));rows.push(group.map(x=>pad(colors.accent(x[1]),w)).join("  "));}return rows; }
function section(rows:string[], title:string, width:number):void { const label=` ${title} `; rows.push(colors.border(`${label}${"─".repeat(Math.max(0,width-visibleWidth(label)))}`)); }
function rule(width:number):string{return colors.border("─".repeat(width));}
function bar(value:number,width:number):string{const n=Math.round(width*value/100);return `${colors.accent("█".repeat(n))}${colors.muted("░".repeat(width-n))}`;}
function spark(values:readonly number[]):string{const glyphs="▁▂▃▄▅▆▇█";const max=Math.max(1,...values);return values.map(v=>glyphs[Math.round(v/max*7)]).join("");}
function pad(value:string,width:number):string{const text=truncateToWidth(value,width);return text+" ".repeat(Math.max(0,width-visibleWidth(text)));}
function metric(value:number|null):string{return value===null?"—":String(value);}
function percent(value:number|null):string{return value===null?"—":`${value}%`;}
function compact(value:number|null):string{if(value===null)return "—";if(value>=1_000_000)return `${Math.round(value/10_000)/100}M`;if(value>=1_000)return `${Math.round(value/100)/10}k`;return String(value);}
function duration(value:number):string{if(value<60_000)return `${Math.round(value/100)/10}s`;return `${Math.floor(value/60_000)}m${String(Math.round(value%60_000/1000)).padStart(2,"0")}s`;}
function date(value:string|null):string{return value?value.replace("T"," ").slice(0,16):"—";}

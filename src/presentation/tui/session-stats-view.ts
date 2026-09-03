import { truncateToWidth, wrapTextWithAnsi, type Component } from "@earendil-works/pi-tui";
import type { SessionStatsClaim, SessionStatsSnapshot } from "../../domain/session-stats.js";
import { colors } from "./theme.js";

const RECENT_LIMIT = 12;

export class SessionStatsView implements Component {
	public constructor(private readonly getStats: () => SessionStatsSnapshot, private readonly getTurn: () => "session" | "latest" | number = () => "session") {}
	public invalidate(): void {}
	public render(width: number): string[] {
		const stats = this.getStats(); const requested = this.getTurn(); const focused = requested === "latest" ? stats.turns.at(-1) : typeof requested === "number" ? stats.turns.find(turn => turn.number === requested) : undefined;
		const safeWidth = Math.max(1, width); const rows: string[] = []; const line = (value = ""): void => { rows.push(...wrapTextWithAnsi(value, safeWidth)); }; const heading = (value: string): void => { line(""); line(colors.accent(value)); };
		line(colors.accent(" WORLD WIDE WOO / SESSION STATS")); line(colors.muted(` thread ${stats.session.threadId ?? "unknown"} · read-only www observation`)); line(colors.border("─".repeat(safeWidth)));
		heading("PURPOSE · ACTION · RESULT"); claimLine(line, "목적", stats.summary.purpose); claimLine(line, "행동", stats.summary.actions); claimLine(line, "결과", stats.summary.result);
		if (requested !== "session") { heading("REQUEST DETAIL"); if (focused) { line(`#${focused.number} · ${focused.id} · ${duration(focused.durationMs)} · first output ${duration(focused.firstOutputMs)} (${focused.firstOutputAuthority})`); line(`Agent ${focused.agents} · Tool ${focused.tools} · Approval ${focused.approvals} · compact ${focused.compactions} · retry ${focused.retries} · wait ${focused.waits} · Failure ${focused.failures}`); line(`Source ${focused.activityIds.join(", ") || "unknown"}`); } else line(colors.warning("요청한 Turn을 찾을 수 없습니다.")); }
		heading("SESSION"); line(`wall clock  ${duration(stats.session.durationMs)} (${stats.session.timeAuthority})    turns  ${stats.session.turns}    completed  ${stats.session.completedTurns}`); line(`agents      ${stats.session.agentOperations}    tools  ${stats.session.toolOperations}    approvals  ${stats.session.approvals}    compact ${stats.session.compactions}    retry ${stats.session.retries}    wait ${stats.session.waits}`); line(`Source ${stats.session.activityIds.join(", ") || "unknown"}`);
		heading("SPEED"); line(`avg turn       ${duration(stats.speed.averageTurnMs)}    first output  ${duration(stats.speed.averageFirstOutputMs)} (www-observed only)`); line(`avg tool       ${duration(stats.speed.averageToolMs)}    approval wait ${duration(stats.speed.averageApprovalWaitMs)}`); line(`activity/min   ${stats.speed.activitiesPerMinute ?? "unknown"}    generation   unknown`);
		heading("USAGE"); line(`total tokens   ${number(stats.usage.totalTokens)}    unattributed ${number(stats.usage.unattributedTokens)} (${stats.usage.authority})`); line(colors.muted(stats.usage.limitation)); for (const model of stats.usage.models.slice(-RECENT_LIMIT)) line(`${model.model} ${model.effort ?? "default"} · ${number(model.totalTokens)} · ${model.turns} turns`);
		heading("ACTIVITY"); for (const turn of stats.turns.slice(-RECENT_LIMIT)) { const state = turn.failures ? colors.warning("FAIL") : colors.success("PASS"); line(`#${turn.number} ${bar(turn, 20)} ${duration(turn.durationMs)} · agent ${turn.agents} · tool ${turn.tools} · approval ${turn.approvals} · ${state}`); } if (!stats.turns.length) line(colors.muted("관측된 Turn 없음")); else if (stats.turns.length > RECENT_LIMIT) line(colors.muted(`… ${stats.turns.length - RECENT_LIMIT} earlier turns omitted`));
		for (const activity of stats.activities.slice(-RECENT_LIMIT)) line(`  ${activity.recordedAt} · ${activity.category} · ${activity.phase} · ${duration(activity.observedDurationMs)} · Source ${activity.sourceActivityId}`);
		if (stats.activities.length > RECENT_LIMIT) line(colors.muted(`… ${stats.activities.length - RECENT_LIMIT} earlier activities omitted`));
		heading("FAILURE ZONES"); for (const failure of stats.failures.slice(-8)) { line(`${failure.recordedAt} · ${failure.recovered ? colors.success("RECOVERED") : colors.error("ACTIVE")} · ${failure.method}`); line(`  ${failure.summary}`); line(`  Source ${failure.activityId}${failure.recoveryActivityId ? ` → ${failure.recoveryActivityId}` : ""}`); } if (!stats.failures.length) line(colors.success("관측된 실패 없음"));
		heading("BOTTLENECKS"); line(`wait ${stats.session.waits} · retry ${stats.session.retries} · approval ${stats.session.approvals} · failure ${stats.session.failedActivities}`); line(colors.muted("시간은 provider 내부 시간이 아닌 WWW journal 수신 기준입니다."));
		heading("UNAVAILABLE PROVIDER METRICS"); line(`${stats.unavailable.join(" · ")} · unknown`); line(""); line(colors.muted("Esc 돌아가기 · /stats latest · /stats #n · /source <activity-id>")); return rows.map(row => truncateToWidth(row, safeWidth));
	}
}
function claimLine(line: (value: string) => void, label: string, claim: SessionStatsClaim): void { line(`${colors.secondary(label)}  ${claim.text} (${claim.authority})`); line(`${colors.secondary("Source")} ${claim.sourceActivityIds.join(", ") || "unknown"}`); }
function duration(value: number | null): string { if (value === null) return "unknown"; if (value < 1000) return `${value}ms`; const seconds = value / 1000; if (seconds < 60) return `${Math.round(seconds * 10) / 10}s`; return `${Math.floor(seconds / 60)}m${String(Math.round(seconds % 60)).padStart(2, "0")}s`; }
function number(value: number | null): string { return value === null ? "unknown" : value.toLocaleString("en-US"); }
function bar(turn: SessionStatsSnapshot["turns"][number], width: number): string { const work = Math.max(1, Math.min(width, turn.agents + turn.tools + turn.approvals + 1)); return `${"█".repeat(work)}${"░".repeat(width - work)}`; }

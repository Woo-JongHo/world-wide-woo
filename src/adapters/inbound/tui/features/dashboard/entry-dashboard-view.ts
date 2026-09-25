import { truncateToWidth, visibleWidth, wrapTextWithAnsi }             from "@earendil-works/pi-tui";
import type { Component }                                              from "@earendil-works/pi-tui";
import type { ProjectActivity }                                        from "@/core/domain/execution/project-activity";
import type {
	LinearDashboardComment,
	LinearDashboardIssue,
	LinearProjectDashboard,
} from "@/core/domain/work/linear-dashboard";
import type { WorkbenchSnapshot }                                      from "@/core/domain/work/workbench";
import {
	monitoringCard,
	monitoringColumns,
	monitoringMeter,
	monitoringPanel,
	monitoringWidths,
} from "@/adapters/inbound/tui/foundation/layout/astra-monitoring-layout";
import {
	a,
	duration,
	number,
	pair,
	prose,
	railSection,
	section as astraSection,
} from "@/adapters/inbound/tui/foundation/theme/astra-theme";
import { runtimeModeLabel, workbenchEffortLabel, workbenchModelLabel } from "@/adapters/inbound/tui/foundation/labels";
import { colors }                                                      from "@/adapters/inbound/tui/foundation/theme/theme";
import {
	syntheticDashboardRail,
	syntheticDashboardRows,
} from "@/adapters/inbound/tui/features/dashboard/astra-dashboard-catalog";

function fit(text: string, width: number): string {
	if (width <= 0) return "";
	const clipped = truncateToWidth(text, width);
	return clipped + " ".repeat(Math.max(0, width - visibleWidth(clipped)));
}

function relativeAge(value: string | null | undefined, now: Date): string {
	if (!value) return "—";
	const timestamp = Date.parse(value);
	if (!Number.isFinite(timestamp)) return "—";
	const minutes = Math.max(0, Math.floor((now.getTime() - timestamp) / 60_000));
	if (minutes < 60) return `${minutes}m ago`;
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return `${hours}h ago`;
	return `${Math.floor(hours / 24)}d ago`;
}

function clock(value: string | null | undefined): string {
	if (!value) return "—";
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return "—";
	return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function isInProgress(issue: LinearDashboardIssue): boolean {
	return issue.statusType === "started"
		|| /(?:progress|started|running|doing|작업|진행)/iu.test(issue.status);
}

function section(title: string): string {
	return colors.warm(title);
}

function issueRows(issue: LinearDashboardIssue, marker: string, width: number, now: Date): string[] {
	const rows = [colors.accent(`${marker} ${issue.id}`)];
	rows.push(...wrapTextWithAnsi(`  ${issue.title}`, width));
	rows.push(colors.muted(`  ${issue.status} · ${relativeAge(issue.updatedAt, now)}`));
	return rows;
}

function updateRows(dashboard: LinearProjectDashboard, width: number): string[] {
	const update = dashboard.update;
	if (!update) return [colors.muted("  Project Update가 없습니다.")];
	const body = update.body.split(/\r?\n/u).map(line => line.trim()).filter(Boolean).slice(0, 8);
	const rows: string[] = [];
	for (const line of body) {
		const cleaned = line.replace(/^#{1,3}\s*/u, "");
		rows.push(...wrapTextWithAnsi(`  ${cleaned}`, width));
	}
	if (update.createdAt) rows.push(colors.muted(`  ${clock(update.createdAt)}`));
	return rows.length > 0 ? rows : [colors.muted("  Project Update가 없습니다.")];
}

function commentSummary(comment: LinearDashboardComment): string {
	const line = comment.body.split(/\r?\n/u).map(value => value.trim()).filter(value => value && !/^#{1,6}\s*/u.test(value)).map(value => value.replace(/^[-*]\s*/u, "")).find(Boolean);
	return line || "내용 없는 Comment";
}

function commentRows(dashboard: LinearProjectDashboard, width: number, now: Date): string[] {
	const comments = dashboard.comments.slice(0, 3);
	if (comments.length === 0) return [colors.muted("  최근 Comment가 없습니다.")];
	return comments.flatMap(comment => [
		colors.muted(`  ${comment.author ?? "Linear"} · ${relativeAge(comment.createdAt, now)}`),
		...wrapTextWithAnsi(`  ${commentSummary(comment)}`, width),
	]);
}

function snapshotText(value: string | null | undefined, fallback: string): string {
	const text = (value ?? "").replace(/[\x00-\x1f\x7f-\x9f]/gu, " ").replace(/\s+/gu, " ").trim();
	return text || fallback;
}

function snapshotPhase(phase: WorkbenchSnapshot["phase"]): string {
	return ({ loading: "초기화 중", ready: "준비됨", working: "작업 진행 중", error: "오류", closed: "종료됨" })[phase];
}

function dashboardHealth(snapshot: WorkbenchSnapshot, blockedTodos: number): string {
	if (snapshot.error) return "ERROR";
	if (blockedTodos > 0) return "BLOCKED";
	if (snapshot.phase === "loading") return "LOADING";
	if (snapshot.phase === "closed") return "CLOSED";
	return "NOMINAL";
}

function cacheSummary(snapshot: WorkbenchSnapshot): { readonly value: string; readonly detail: string } {
	const layers = snapshot.cacheObservations ?? [];
	const totals = layers.reduce((accumulator, layer) => ({
		hits     : accumulator.hits + (layer.hits ?? 0),
		misses   : accumulator.misses + (layer.misses ?? 0),
		observed : accumulator.observed + (layer.hits !== null || layer.misses !== null ? 1 : 0),
	}), { hits: 0, misses: 0, observed: 0 });
	const requests = totals.hits + totals.misses;
	if (totals.observed === 0 || requests === 0) return { value: "미관측", detail: totals.observed ? "accesses not observed" : "no observed layers" };
	return { value: `${Math.round(totals.hits / requests * 100)}% hit`, detail: `${number(totals.hits)}/${number(requests)} accesses` };
}

type ActivityBucket = "message" | "tool" | "flow";

function activityBucket(activity: ProjectActivity): ActivityBucket {
	if (activity.kind === "message") return "message";
	if (activity.kind === "tool") return "tool";
	return "flow";
}

/** Twelve two-hour cells ending at the latest durable activity, never a synthetic timeline. */
function observedActivityMatrix(activities: readonly ProjectActivity[]): Readonly<Record<ActivityBucket, readonly number[]>> | null {
	const dated = activities.flatMap(activity => {
		const timestamp = Date.parse(activity.recordedAt);
		return Number.isFinite(timestamp) ? [{ activity, timestamp }] : [];
	});
	if (dated.length === 0) return null;
	const columns    = 12                                               ;
	const intervalMs = 2 * 60 * 60 * 1_000                              ;
	const latest     = Math.max(...dated.map(entry => entry.timestamp)) ;
	const start      = latest - columns * intervalMs                    ;
	const matrix: Record<ActivityBucket, number[]> = {
		message : Array.from({ length: columns }, () => 0),
		tool    : Array.from({ length: columns }, () => 0),
		flow    : Array.from({ length: columns }, () => 0),
	};
	for (const entry of dated) {
		if (entry.timestamp < start || entry.timestamp > latest) continue;
		const column = Math.min(columns - 1, Math.max(0, Math.floor((entry.timestamp - start) / intervalMs)));
		matrix[activityBucket(entry.activity)][column] += 1;
	}
	return matrix;
}

function activityPanelRows(activities: readonly ProjectActivity[]): { readonly meta: string; readonly rows: readonly string[] } {
	const matrix = observedActivityMatrix(activities);
	if (!matrix) return { meta: "unavailable", rows: [a.muted("recordedAt unavailable"), a.muted("time distribution unavailable")] };
	const cell = (value: number): string => value >= 3 ? a.active("■") : value === 2 ? a.attention("■") : value === 1 ? a.response("■") : a.rule("·");
	return {
		meta: "last 24h · observed",
		rows: [
		...(["message", "tool", "flow"] as const).map(kind => a.muted(`${kind.padEnd(7, " ")} `) + matrix[kind].map(cell).join("")),
		a.muted("T-24h      T-12h        latest activity"),
		],
	};
}

function monitoringSplitWidths(width: number): readonly [number, number] {
	const gap = 1;
	const right = Math.max(24, Math.floor((width - gap) * 0.38));
	return [Math.max(1, width - gap - right), right];
}

function layerPerformanceRows(snapshot: WorkbenchSnapshot, width: number): string[] {
	const telemetry = snapshot.layerPerformance;
	if (!telemetry || telemetry.window.traceCount === 0) return [pair("LAYER PERFORMANCE", "미관측", width)];
	const observed = Object.entries(telemetry.window.layers).flatMap(([layerId, value]) => [
		...(value.wait.p95 === null ? [] : [{ layerId, phase: "wait", p95: value.wait.p95 }]),
		...(value.work.p95 === null ? [] : [{ layerId, phase: "work", p95: value.work.p95 }]),
	]);
	const slowest = observed.sort((left, right) => right.p95 - left.p95)[0];
	return [
		pair("OBSERVED TRACES", `${telemetry.window.traceCount} traces · ${telemetry.window.errorCount} trace failures`, width),
		pair("SLOWEST P95", slowest ? `${slowest.layerId} ${slowest.phase} · ${duration(slowest.p95)}` : "미관측", width),
	];
}

/** First Astra screen. Every operational value comes from the current Workbench snapshot. */
export class WwwDashboardView implements Component {
	public constructor(
		private readonly getSnapshot: () => WorkbenchSnapshot,
		private readonly showSyntheticCatalog: () => boolean = () => false,
	) {}

	public invalidate(): void {}

	public render(width: number): string[] {
		const snapshot = this.getSnapshot();
		if (this.showSyntheticCatalog()) return syntheticDashboardRows(snapshot, width);
		const workflow       = snapshot.workFlow                                                                                ;
		const todo           = snapshot.todo                                                                                    ;
		const todoCompleted  = todo?.items.filter(item => item.status === "completed").length ?? 0                              ;
		const todoBlocked    = todo?.items.filter(item => item.status === "blocked").length ?? 0                                ;
		const live           = snapshot.liveActivity ? snapshotText(snapshot.liveActivity.text, "관측된 현재 작업 없음") : null ;
		const project        = snapshot.linearDashboard                                                                         ;
		const context        = snapshot.contextUsage                                                                            ;
		const sessionTokens  = snapshot.sessionUsage?.observedTotalTokens                                                       ;
		const contextPercent = context ? Math.round(Math.max(0, Math.min(100, context.percent))) : null                         ;
		const health         = dashboardHealth(snapshot, todoBlocked)                                                           ;
		const cache          = cacheSummary(snapshot)                                                                           ;
		const compactSummary = width < 92                                                                                       ;
		const summary = [
			[compactSummary ? "Session" : "Active session", snapshotText(snapshot.threadId, "새 세션"), `revision ${snapshot.revision}`],
			[compactSummary ? "Events" : "Activity events", number(snapshot.activities.length), live ? "working" : snapshotPhase(snapshot.phase)],
			[compactSummary ? "Tokens" : "Session tokens", sessionTokens == null ? "미관측" : number(sessionTokens), "observed total"],
			[compactSummary ? "Context" : "Context space", contextPercent == null ? "미관측" : `${contextPercent}%`, context ? `${number(context.usedTokens)} / ${number(context.contextWindow)}` : "연결 대기"],
			[compactSummary ? "Health" : "System health", health, snapshot.error ? "error observed" : todoBlocked ? `${todoBlocked} blocked` : "no blocking signal"],
		] as const;
		if (width < 58) {
			const boundedLive = live ? truncateToWidth(live, Math.max(12, width - 10)) : "현재 실행 중인 작업이 없습니다.";
			return [
				...astraSection("Session Overview", width, snapshotPhase(snapshot.phase), a.active),
				...summary.map(([title, value, detail]) => pair(title, `${value} · ${detail}`, width)),
				...astraSection("Now", width, live ? "working" : "idle", live ? a.active : a.muted),
				live ? a.active(boundedLive) : a.muted(boundedLive),
				snapshot.sessionGoal ? a.text(`Goal · ${snapshotText(snapshot.sessionGoal.text, "목표 없음")}`) : a.muted("Goal이 아직 없습니다."),
				pair("ACTIVITY EVENTS", number(snapshot.activities.length), width),
			].flatMap(row => prose(row, width));
		}

		const summaryWidths = monitoringWidths(width, 5)                                                                         ;
		const routerWidths  = monitoringWidths(width, 4)                                                                         ;
		const contextValue  = contextPercent == null ? "미관측" : `${contextPercent}%`                                           ;
		const contextDetail = context ? `${number(context.usedTokens)} / ${number(context.contextWindow)}` : "usage unavailable" ;
		const usageValue    = sessionTokens == null ? "미관측" : number(sessionTokens)                                           ;
		const routerCards = [
			monitoringCard({ title: "/context", value: contextValue, detail: contextDetail }, routerWidths[0]),
			monitoringCard({ title: "/cache", value: cache.value, detail: cache.detail }, routerWidths[1]),
			monitoringCard({ title: "/usage", value: usageValue, detail: "observed session tokens" }, routerWidths[2]),
			monitoringCard({ title: "/workflow", value: `${workflow.completedCount}/${workflow.steps.length}`, detail: workflow.steps.length ? "tracked steps" : "no steps" }, routerWidths[3]),
		];
		const goal = snapshot.sessionGoal ? snapshotText(snapshot.sessionGoal.text, "목표 없음") : "Goal이 아직 없습니다.";
		const liveSummary = live ? truncateToWidth(live, Math.max(16, width - 14)) : "현재 실행 중인 작업이 없습니다.";
		const [tokenPanelWidth, activityPanelWidth] = monitoringSplitWidths(width);
		const tokenInnerWidth = Math.max(1, tokenPanelWidth - 2)                                                           ;
		const activity        = activityPanelRows(snapshot.activities)                                                     ;
		const messageCount    = snapshot.activities.filter(item => item.kind === "message").length                         ;
		const toolCount       = snapshot.activities.filter(item => item.kind === "tool").length                            ;
		const flowCount       = snapshot.activities.filter(item => item.kind !== "message" && item.kind !== "tool").length ;
		const tokenPanel = monitoringPanel({
			title: "TOKEN ALLOCATION / PROPORTION",
			meta: contextPercent == null ? "unavailable" : `context ${contextPercent}%`,
			rows: [
				pair("CONTEXT WINDOW", context ? `${number(context.usedTokens)} / ${number(context.contextWindow)}` : "unavailable", tokenInnerWidth),
				context ? monitoringMeter(context.usedTokens, context.contextWindow, Math.max(4, tokenInnerWidth), a.response) : a.muted("context meter unavailable"),
				pair("SESSION TOKENS", sessionTokens == null ? "unavailable" : `${number(sessionTokens)} observed`, tokenInnerWidth),
				a.muted("INPUT / OUTPUT / CACHE · unavailable"),
			],
		}, tokenPanelWidth);
		const activityPanel = monitoringPanel({
			title: "ACTIVITY HEATMAP",
			meta: activity.meta,
			rows: [
				...activity.rows,
				pair("EVENTS", `message ${messageCount} · tool ${toolCount} · flow ${flowCount}`, Math.max(1, activityPanelWidth - 2)),
			],
		}, activityPanelWidth);
		return [
			pair(a.strong("SESSION OVERVIEW"), `${snapshot.projectId} · ${snapshotText(snapshot.threadId, "새 세션")}`, width),
			...monitoringColumns(summary.map(([title, value, detail], index) => monitoringCard({ title, value, detail }, summaryWidths[index])), summaryWidths),
			"",
			pair(a.active("SYSTEM MODULE ROUTER"), runtimeModeLabel(snapshot.permissionMode, snapshot.collaborationMode), width),
			...monitoringColumns(routerCards, routerWidths),
			"",
			pair("NOW", liveSummary, width),
			pair("GOAL", goal, width),
			...layerPerformanceRows(snapshot, width),
			...monitoringColumns([tokenPanel, activityPanel], [tokenPanelWidth, activityPanelWidth]),
			pair("LINEAR", project ? `${snapshotText(project.projectName, "연결된 프로젝트")} · ${project.state}` : "미연결", width),
		].map(row => fit(row, width));
	}
}

export class AstraDashboardRail implements Component {
	public constructor(
		private readonly getSnapshot: () => WorkbenchSnapshot,
		private readonly showSyntheticCatalog: () => boolean = () => false,
	) {}
	public invalidate(): void {}
	public render(width: number): string[] {
		const snapshot = this.getSnapshot();
		if (this.showSyntheticCatalog()) return syntheticDashboardRail(snapshot, width);
		const context = snapshot.contextUsage;
		const enabledMcp = snapshot.mcpServers.filter(server => server.enabled).length;
		const rows = [
			...railSection("Session context", width, snapshotPhase(snapshot.phase), a.response),
			pair("Project", snapshot.projectId, width),
			pair("Thread", snapshotText(snapshot.threadId, "새 세션"), width),
			pair("Model", workbenchModelLabel(snapshot.activeModel ?? snapshot.model), width),
			pair("Effort", workbenchEffortLabel(snapshot.effort), width),
			pair("Context", context ? `${number(context.usedTokens)} / ${number(context.contextWindow)}` : "미관측", width),
			pair("Skills", snapshot.skillInventory ? number(snapshot.skillInventory.count) : "미관측", width),
			pair("MCP", `${enabledMcp}/${snapshot.mcpServers.length}`, width),
			...railSection("Session state", width),
			pair("Queue", snapshot.chatQueue.length ? a.active(number(snapshot.chatQueue.length)) : a.muted("0"), width),
			pair("Approvals", snapshot.pendingApproval ? a.attention("1 waiting") : a.success("none"), width),
			pair("Recording", snapshot.recordingReadOnly ? a.attention("read-only") : a.success("writable"), width),
			...(context ? [a.caption("Context occupancy"), monitoringMeter(context.usedTokens, context.contextWindow, Math.max(8, width - 2), a.response)] : [a.muted("Context occupancy · 미관측")]),
			...railSection("Navigate", width),
			a.muted("/context  컨텍스트"),
			a.muted("/cache    캐시"),
			a.muted("/usage    사용량"),
			a.muted("/workflow 워크플로"),
		];
		return rows.flatMap(row => prose(row, width));
	}
}

/** First-screen project pulse. It is intentionally read-only and snapshot-backed. */
export class EntryDashboardView implements Component {
	public constructor(
		private readonly getDashboard: () => LinearProjectDashboard | undefined,
		private readonly now: () => Date = () => new Date(),
	) {}

	public invalidate(): void {}

	public render(width: number): string[] {
		const contentWidth    = Math.max(1, width)                               ;
		const dashboard       = this.getDashboard()                              ;
		const projectName     = dashboard?.projectName ?? "Linear 프로젝트"      ;
		const rows : string[] = [colors.secondary(`DASHBOARD · ${projectName}`)] ;
		if (!dashboard || dashboard.state === "loading") {
			rows.push(section("NOW"), colors.accent("연결 중"));
			rows.push(...wrapTextWithAnsi("열린 이슈·최신 Update·Comment·마일스톤을 가져오는 중입니다.", contentWidth));
			return rows;
		}
		if (dashboard.state === "unavailable") {
			rows.push(section("HEALTH"), colors.warning("! Linear Dashboard unavailable"));
			if (dashboard.error) rows.push(...wrapTextWithAnsi(`  ${dashboard.error}`, contentWidth));
			rows.push(...wrapTextWithAnsi(colors.muted("  조치 · .www/workbench.yaml의 연결과 Linear MCP 인증을 확인하세요."), contentWidth));
			return rows;
		}

		const issues  = dashboard.issues                                      ;
		const current = issues.find(isInProgress) ?? issues[0]                ;
		const next    = issues.filter(issue => issue !== current).slice(0, 3) ;
		if (dashboard.state === "stale") {
			rows.push(colors.warning("갱신 실패 · 마지막 성공 값"));
			if (dashboard.error) rows.push(...wrapTextWithAnsi(`  실패 이유 · ${dashboard.error}`, contentWidth));
		}
		rows.push(section("NOW"));
		if (current) rows.push(...issueRows(current, "▶", contentWidth, this.now()));
		else rows.push(colors.muted("  현재 진행 중인 이슈가 없습니다."));

		rows.push(section("NEXT"));
		if (next.length > 0) {
			for (const issue of next) rows.push(...issueRows(issue, "○", contentWidth, this.now()));
		} else rows.push(colors.muted("  다음 작업이 없습니다."));

		rows.push(section("UPDATE"), ...updateRows(dashboard, contentWidth));
		rows.push(section("ACTIVITY"), ...commentRows(dashboard, contentWidth, this.now()));
		rows.push(section("RECENT"));
		const recent = [...issues]
			.filter((issue): issue is LinearDashboardIssue & { updatedAt: string } => Boolean(issue.updatedAt))
			.sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt))
			.slice(0, 4);
		if (recent.length > 0) {
			for (const issue of recent) rows.push(...wrapTextWithAnsi(`${clock(issue.updatedAt)}  ${issue.id}  ${issue.title}`, contentWidth));
		} else rows.push(colors.muted("  최근 갱신 이슈가 없습니다."));

		rows.push(section("HEALTH"));
		const blocked = issues.filter(issue => /blocked|차단/iu.test(issue.status)).length      ;
		const stale   = dashboard.state === "stale" ? 1 : 0                                     ;
		const marker  = blocked > 0 || stale > 0 ? colors.warning("!") : colors.success("✓")    ;
		const summary = colors.muted(`blocked ${blocked > 0 ? blocked : "—"} · stale ${stale}`) ;
		rows.push(`${marker} ${summary}`);
		rows.push(colors.muted(`synced ${clock(dashboard.fetchedAt)}`));
		return rows.flatMap(row => wrapTextWithAnsi(fit(row, contentWidth), contentWidth));
	}
}

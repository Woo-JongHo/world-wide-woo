import { Markdown, type Component } from "@earendil-works/pi-tui";
import type { RequestRuntimeRecord } from "../../../../../core/domain/execution/request-runtime";
import type { WorkbenchSnapshot } from "../../../../../core/domain/work/workbench";
import type { UsageSnapshot } from "../../../../../core/ports";
import { monitoringCard, monitoringColumns, monitoringMeter, monitoringWidths } from "../../foundation/layout/astra-monitoring-layout";
import { a, astraMarkdownTheme, astraMeter, fit, mark, number, pair, prose, railSection, safe, section } from "../../foundation/theme/astra-theme";
import { runtimeModeLabel, workbenchEffortLabel, workbenchModelLabel } from "../../foundation/labels";

function document(rows: string[], width: number): string[] { return rows.flatMap(row => prose(row, width)); }
function kv(label: string, value: unknown): string { return `${a.muted(fit(label, 20))} ${a.text(safe(value ?? "—"))}`; }
function hiddenKey(key: string): boolean {
	const normalized = key.replace(/[-_]/gu, "").toLowerCase();
	return normalized.includes("reasoning") || normalized.includes("thought") || normalized.includes("analysis")
		|| normalized.startsWith("raw") || normalized.endsWith("token") || normalized.endsWith("secret")
		|| normalized.endsWith("password") || normalized.endsWith("credential")
		|| normalized.endsWith("authorization") || normalized.endsWith("apikey");
}
function json(value: unknown, width: number): string[] {
	const text = JSON.stringify(value, (key, item) => hiddenKey(key) ? undefined : item, 2);
	return prose(a.muted(safe(text, 10_000)), width);
}
function usagePercent(percent: number | undefined): string {
	if (typeof percent !== "number" || !Number.isFinite(percent)) return " –";
	const value = Math.round(Math.max(0, Math.min(100, percent)));
	return `${String(value).padStart(2, " ")}%`;
}

function contextMetrics(snapshot: WorkbenchSnapshot): {
	readonly used: number | null;
	readonly total: number | null;
	readonly free: number | null;
	readonly percent: number | null;
} {
	const usage = snapshot.contextUsage;
	if (!usage || !Number.isFinite(usage.usedTokens) || !Number.isFinite(usage.contextWindow) || usage.usedTokens < 0 || usage.contextWindow <= 0) {
		return { used: null, total: null, free: null, percent: null };
	}
	const used = Math.min(usage.usedTokens, usage.contextWindow);
	const percent = Math.round(used / usage.contextWindow * 100);
	return {
		used,
		total: usage.contextWindow,
		free: Math.max(0, usage.contextWindow - used),
		percent,
	};
}

function contextInputRows(snapshot: WorkbenchSnapshot, width: number): string[] {
	const skills = snapshot.skillInventory;
	const enabledMcp = snapshot.mcpServers.filter(server => server.enabled).length;
	const workflowSteps = snapshot.workFlow.steps.length;
	const runtime = snapshot.liveActivity ? "1 observed" : "미관측";
	const inputs: readonly [string, string, string][] = [
		["SYS", "System", "token allocation 미관측"],
		["CONV", "Conversation", `${snapshot.chat.length} messages`],
		["SKILL", "Skills", skills ? `${skills.count} loaded` : "미관측"],
		["MCP", "MCP", `${enabledMcp}/${snapshot.mcpServers.length} enabled`],
		["MEM", "Notes", `${snapshot.tnotes.length} notes`],
		["WORK", "Workflow", `${workflowSteps} steps`],
		["RUNT", "Runtime", runtime],
	];
	return inputs.map(([code, label, detail], index) => {
		const ink = [a.info, a.text, a.success, a.response, a.attention, a.request, a.active][index]!;
		return pair(`${ink("■")} ${a.strong(code)}  ${label}`, a.muted(detail), width);
	});
}

function contextSummaryRows(snapshot: WorkbenchSnapshot, width: number): string[] {
	const metrics = contextMetrics(snapshot);
	const model = workbenchModelLabel(snapshot.activeModel ?? snapshot.model);
	const cards = [
		{ title: "Total Capacity", value: metrics.total == null ? "미관측" : `${number(metrics.total)} tokens`, detail: metrics.total == null ? "native telemetry" : "context window" },
		{ title: "Used Tokens", value: metrics.used == null ? "미관측" : `${number(metrics.used)} tokens`, detail: metrics.percent == null ? "– occupancy" : `${metrics.percent}% occupied` },
		{ title: "Free Space", value: metrics.free == null ? "미관측" : `${number(metrics.free)} tokens`, detail: metrics.percent == null ? "– available" : `${100 - metrics.percent}% available` },
		{ title: "Compression", value: "미관측", detail: "no native metric" },
		{ title: "Last Retrieval", value: "미관측", detail: "timestamp unavailable" },
		{ title: "Active Model", value: model, detail: snapshot.activeModel ? "in-flight turn" : "selected model" },
		{ title: "Effort Config", value: workbenchEffortLabel(snapshot.effort), detail: snapshot.effort ? "session setting" : "미관측" },
	] as const;
	if (width >= 108) {
		const widths = monitoringWidths(width, cards.length);
		return monitoringColumns(cards.map((card, index) => monitoringCard(card, widths[index]!)), widths);
	}
	return cards.map(card => pair(card.title, `${card.value} · ${card.detail}`, width));
}

function contextSpectrometerRows(snapshot: WorkbenchSnapshot, width: number): string[] {
	const metrics = contextMetrics(snapshot);
	const meterWidth = Math.max(10, width - 2);
	const status = metrics.used == null || metrics.total == null
		? "Context token telemetry unavailable"
		: `Total Used: ${number(metrics.used)} / ${number(metrics.total)} tokens`;
	return [
		...section("CONTEXT ACCUMULATION SPECTROMETER", width, status, a.response),
		metrics.used == null || metrics.total == null
			? a.rule("░".repeat(meterWidth))
			: monitoringMeter(metrics.used, metrics.total, meterWidth, a.active),
		pair("OVERALL CONTEXT OCCUPANCY", metrics.percent == null ? "unavailable" : `${metrics.percent}%`, width),
		a.caption("Whole native context window · includes system tokens"),
		"",
		...section("LOADED CAPABILITIES & SESSION INPUTS", width, "counts only · token allocation unobserved", a.info),
		a.caption("Enabled MCP servers and loaded Skills are counts, not token shares."),
		...contextInputRows(snapshot, width),
	];
}

/** The Figma composition panel has no Native per-source token telemetry yet. */
function contextCompositionRows(snapshot: WorkbenchSnapshot, width: number): string[] {
	const metrics = contextMetrics(snapshot);
	const status = metrics.used == null ? "unavailable" : "overall observed · sources unobserved";
	return [
		...section("CONTEXT COMPOSITION BREAKDOWN", width, status, a.response),
		a.strong("Source token allocation unavailable"),
		metrics.used == null
			? a.muted("Native context token telemetry is unavailable.")
			: a.muted("Native reports overall context occupancy only; source token shares are not reported."),
		a.caption("SOURCE TOKEN ALLOCATION · unavailable does not mean zero"),
	];
}

function contextActivityRows(snapshot: WorkbenchSnapshot, width: number): string[] {
	const activities = snapshot.activities.slice(-8).reverse();
	const rows = section("CONTEXT CHANGE ACTIVITY", width, activities.length ? `last ${activities.length} observed` : "unavailable", a.tool);
	if (!activities.length) return [...rows, a.muted("No durable activity records are available for this session.")];
	for (const activity of activities) {
		const identity = `#${activity.sequence}  ${safe(activity.kind)}`;
		const detail = `${safe(activity.phase)} · ${safe(activity.recordedAt)}`;
		rows.push(pair(identity, detail, width));
	}
	return rows;
}

function contextDiagnosticsRows(snapshot: WorkbenchSnapshot, width: number): string[] {
	const metrics = contextMetrics(snapshot);
	const tasks = (snapshot.delegation ?? []).flatMap(group => group.tasks);
	const enabledMcp = snapshot.mcpServers.filter(server => server.enabled).length;
	const cards = [
		{ title: "Context", value: metrics.used == null ? "UNAVAILABLE" : "OBSERVED", detail: metrics.used == null || metrics.total == null ? "native telemetry" : `${number(metrics.used)}/${number(metrics.total)}` },
		{ title: "Activities", value: `${snapshot.activities.length}`, detail: "durable observed" },
		{ title: "Skills", value: snapshot.skillInventory ? `${snapshot.skillInventory.count}` : "UNAVAILABLE", detail: snapshot.skillInventory ? "inventory loaded" : "inventory absent" },
		{ title: "MCP / Agents", value: `${enabledMcp}/${snapshot.mcpServers.length}`, detail: `${tasks.length} agent tasks` },
	] as const;
	const rows = section("CONTEXT DIAGNOSTICS EVENT GRID", width, "current snapshot", a.attention);
	if (width >= 72) {
		const widths = monitoringWidths(width, cards.length);
		rows.push(...monitoringColumns(cards.map((card, index) => monitoringCard(card, widths[index]!)), widths));
		return rows;
	}
	for (const card of cards) rows.push(pair(card.title, `${card.value} · ${card.detail}`, width));
	return rows;
}

function contextDependencyRows(snapshot: WorkbenchSnapshot, width: number): string[] {
	const skills = snapshot.skillInventory;
	const tasks = (snapshot.delegation ?? []).flatMap(group => group.tasks);
	const metrics = contextMetrics(snapshot);
	const rows = section("SYSTEM DEPENDENCY MAP", width, "observed graph", a.info);
	rows.push(a.strong("ASTRA CORE"));
	rows.push(pair("├─ Skills", skills ? `${skills.count} loaded` : "unavailable", width));
	if (skills?.names.length) for (const name of skills.names.slice(0, 4)) rows.push(a.muted(`│  • ${safe(name)}`));
	if (skills && skills.names.length > 4) rows.push(a.muted(`│  +${skills.names.length - 4} more`));
	rows.push(pair("├─ Subagents", snapshot.delegation ? `${tasks.length} observed` : "unavailable", width));
	for (const task of tasks.slice(0, 3)) rows.push(a.muted(`│  • ${safe(task.role ?? task.id)} · ${safe(task.status)}`));
	if (tasks.length > 3) rows.push(a.muted(`│  +${tasks.length - 3} more`));
	rows.push(pair("├─ MCP servers", `${snapshot.mcpServers.length} configured`, width));
	for (const server of snapshot.mcpServers.slice(0, 3)) rows.push(a.muted(`│  • ${safe(server.name)} · ${server.enabled ? "ON" : "OFF"} · ${safe(server.status)}`));
	if (snapshot.mcpServers.length > 3) rows.push(a.muted(`│  +${snapshot.mcpServers.length - 3} more`));
	rows.push(pair("└─ Context occupancy", metrics.percent == null ? "unavailable" : `${metrics.percent}%`, width));
	return rows;
}

function contextInsightRows(snapshot: WorkbenchSnapshot, width: number): string[] {
	const metrics = contextMetrics(snapshot);
	const latest = snapshot.activities.at(-1);
	return [
		...section("CONTEXT INSIGHTS", width, "current snapshot", a.attention),
		pair("Free context", metrics.free == null ? "unavailable" : `${number(metrics.free)} tokens`, width),
		pair("Latest activity", latest ? `#${latest.sequence} ${safe(latest.kind)} · ${safe(latest.phase)}` : "unavailable", width),
		...section("TOP ITEMS BY SIZE", width, "unavailable"),
		a.muted("Native does not expose per-item context byte sizes for ranking."),
		...section("STATE CHANGE ALERTS", width, "unavailable"),
		a.muted("No Native context-change event feed is available; no alert is inferred."),
	];
}

function contextAnalysisRows(snapshot: WorkbenchSnapshot, width: number): string[] {
	return [
		...contextCompositionRows(snapshot, width),
		...contextActivityRows(snapshot, width),
		...contextDiagnosticsRows(snapshot, width),
		...contextDependencyRows(snapshot, width),
		...contextInsightRows(snapshot, width),
	];
}
function compactList(values: readonly string[], limit = 8): string {
	if (!values.length) return "미적재";
	const visible = values.slice(0, limit).join("  ·  ");
	return values.length > limit ? `${visible}  +${values.length - limit}` : visible;
}
function requestRuntimeRows(request: RequestRuntimeRecord, width: number): string[] {
	const rows = [...section(`Request · ${safe(request.objective)}`, width, request.status)];
	for (const stage of request.stages) rows.push(`${mark(stage.status)} ${safe(stage.id)}  ${safe(stage.output || stage.goal || stage.skipReason || "미관측")}`);
	return document(rows, width);
}

export class AstraContextView implements Component {
	constructor(private readonly get: () => WorkbenchSnapshot, private readonly usage: () => readonly UsageSnapshot[] = () => [], private readonly source = false) {}
	invalidate(): void {}
	render(width: number): string[] {
		const s = this.get();
		const selected = s.activities.find(x => x.id === s.selectedActivityId);
		if (this.source) {
			const rows = section("실행 근거", width, selected?.kind ?? (s.selectedActivityId ? "기록 미포함" : "미선택"));
			if (selected) rows.push(kv("Activity", selected.id), kv("Sequence", selected.sequence), kv("Thread", selected.nativeRefs.threadId), kv("Turn", selected.nativeRefs.turnId), kv("Item", selected.nativeRefs.itemId), kv("상태", selected.phase), kv("시각", selected.recordedAt), ...section("공개 원본", width), ...json(selected.payload, width), ...section("연결된 단계", width), ...s.workFlow.steps.filter(step => step.activityIds.includes(selected.id)).map(step => `${step.number}. ${safe(step.title)}`));
			else if (s.selectedActivityId) rows.push(kv("선택한 Activity", s.selectedActivityId), a.attention("선택은 유지되지만 현재 관측 범위에 원본 기록이 없습니다."), a.muted("다른 기록으로 대체하지 않았습니다."));
			else rows.push(a.muted("/source latest 또는 /source <activity-id>로 관측을 선택하세요."));
			return document(rows, width);
		}
		const metrics = contextMetrics(s);
		const skills = s.skillInventory;
		const enabledMcp = s.mcpServers.filter(server => server.enabled).length;
		const memoryItems = s.chat.length + s.activities.length + s.tnotes.length;
		const rows = [
			...section("Context Dashboard", width, s.phase, a.active),
			pair(`${a.strong(workbenchModelLabel(s.activeModel ?? s.model))}  ${a.active(workbenchEffortLabel(s.effort))}`, `${runtimeModeLabel(s.permissionMode, s.collaborationMode)}  ·  ${s.threadId ? "thread 연결" : "thread 대기"}`, width),
			...contextSummaryRows(s, width),
			...contextSpectrometerRows(s, width),
			...contextAnalysisRows(s, width),
			...section("Context Ledger", width, metrics.percent == null ? "– used" : `${metrics.percent}% used`),
			pair(`Skills  ${skills?.count ?? "미관측"}`, `MCP  ${enabledMcp}/${s.mcpServers.length}`, width),
			pair(`Memory  ${number(memoryItems)} items`, `Chat ${s.chat.length}  ·  Activity ${s.activities.length}  ·  Note ${s.tnotes.length}`, width),
			...section("Session", width),
			kv("프로젝트", s.projectId), kv("Thread", s.threadId), kv("현재 Turn", s.activeTurnId),
			kv("권한", s.permissionMode === "all" ? "전체 로컬 권한 / 승인 없음" : "workspace / 수동 승인"),
			kv("관측 범위", s.resumeCoverage?.mode ?? "unknown"), kv("설정 원본", s.configurationSource),
			kv("기록", s.recordingReadOnly ? "읽기 전용" : "쓰기 가능"),
			...section("Skills", width, skills ? `${skills.count} loaded` : "미관측"),
			a.text(compactList(skills?.names ?? [])),
		];
		if (skills) rows.push(a.muted(`revision ${safe(skills.sourceRevision)}  ·  digest ${safe(skills.digest.slice(0, 12))}`));
		for (const request of [...(s.requestRuntime ?? [])].reverse()) rows.push(...requestRuntimeRows(request, width));
		const dashboard = s.linearDashboard;
		if (dashboard) {
			rows.push(...section(safe(dashboard.projectName), width, dashboard.state), kv("갱신 시각", dashboard.fetchedAt));
			if (dashboard.error) rows.push(a.attention(safe(dashboard.error)));
			if (dashboard.update) rows.push(...section("Project Update", width, safe(dashboard.update.createdAt)), ...new Markdown(safe(dashboard.update.body, 24_000), 0, 0, astraMarkdownTheme).render(width));
			for (const milestone of dashboard.milestones) rows.push(kv(safe(milestone.targetDate || "일정 미정"), milestone.name));
			if (dashboard.issues.length) rows.push(...section("연결된 이슈", width));
			for (const issue of dashboard.issues) rows.push(`${safe(issue.id)} ${safe(issue.title)}`, a.muted(`  ${safe(issue.status)} / ${safe(issue.dueDate || "기한 미정")}`));
		}
		if (s.hud?.showUsage !== false) {
			rows.push(...section("Provider 사용량", width));
			for (const u of this.usage()) {
				rows.push(kv(u.provider, `${u.state}${u.stale ? " / stale" : ""}`));
				for (const l of u.limits) {
					const reset = l.resetsAt ? new Date(l.resetsAt) : null;
					const percent = typeof l.remainingPercent === "number" && Number.isFinite(l.remainingPercent) ? `${Math.round(Math.max(0, Math.min(100, l.remainingPercent)))}% 남음` : "—";
					rows.push(a.muted(`  ${safe(l.label)}  ${percent}${reset && Number.isFinite(reset.getTime()) ? ` / reset ${reset.toISOString()}` : ""}`));
				}
			}
		}
		rows.push(...section("MCP 서버", width));
		for (const server of s.mcpServers) rows.push(`${server.enabled ? "✓" : "−"} ${safe(server.name)}  ${safe(server.status)}  ${server.tools.length} tools`, a.muted(`  /mcp ${server.enabled ? "disable" : "enable"} ${safe(server.name)}`));
		rows.push(...section("위임 작업", width));
		for (const group of s.delegation ?? []) for (const task of group.tasks) rows.push(`${mark(task.status)} ${safe(task.task || task.role || task.id)}`, a.muted(`  ${safe(task.model || "모델 미관측")} / ${safe(task.status)}`), a.muted(`  /agents ${safe(task.ref)}`));
		if (s.selectedAgentDetail) { const task = s.selectedAgentDetail; rows.push(...section("선택한 Agent", width), safe(task.task), safe(task.result)); for (const event of task.activities) rows.push(safe(event.message || event.kind), a.muted(`/source ${safe(event.activityId)}`)); }
		rows.push(...section("계획 연결 근거", width), ...json({ source: s.workFlow.source, orphans: s.workFlow.orphans, rejections: s.workFlow.rejections, retirements: s.workFlow.retirements }, width));
		if (s.executionRun?.receipt) rows.push(...section("실행 Receipt", width), ...json(s.executionRun.receipt, width));
		return document(rows, width);
	}
}

export class AstraContextRail implements Component {
	constructor(private readonly get: () => WorkbenchSnapshot) {}
	invalidate(): void {}
	render(width: number): string[] {
		const snapshot = this.get();
		const enabled = snapshot.mcpServers.filter(server => server.enabled);
		const skills = snapshot.skillInventory;
		const metrics = contextMetrics(snapshot);
		const cacheBytes = (snapshot.cacheObservations ?? []).reduce((total, item) => total + (item.logicalBytes ?? 0), 0);
		const rows = [...railSection("■ LOADED SKILLS", width, skills ? `[${skills.count} UNITS]` : "미관측", a.active)];
		if (!skills?.names.length) rows.push(a.muted("Loaded skill inventory unavailable"));
		for (const name of skills?.names.slice(0, 6) ?? []) rows.push(pair(a.text(safe(name)), a.success("✓ ACTIVE"), width));
		if (skills && skills.names.length > 6) rows.push(a.muted(`+${skills.names.length - 6} more`));
		rows.push(...railSection("■ MCP SERVERS", width, `${enabled.length}/${snapshot.mcpServers.length}`, a.active));
		if (!snapshot.mcpServers.length) rows.push(a.muted("연결된 서버가 없습니다."));
		for (const [index, server] of snapshot.mcpServers.slice(0, 4).entries()) {
			const ink = [a.info, a.active, a.response][index] ?? a.text;
			rows.push(pair(ink(safe(server.name)), server.enabled && server.status === "connected" ? a.success("ONLINE") : a.attention("OFFLINE"), width));
			rows.push(a.muted(`  ${server.tools.length} tools · ${safe(server.status)}`));
		}
		if (snapshot.mcpServers.length > 4) rows.push(a.muted(`+${snapshot.mcpServers.length - 4} more`));
		rows.push(...railSection("■ STORAGE METRICS", width, "observed", a.active));
		rows.push(pair("CONTEXT WINDOW", metrics.used == null || metrics.total == null ? "미관측" : `${number(metrics.used)}/${number(metrics.total)}`, width));
		rows.push(metrics.used == null || metrics.total == null ? a.rule("━".repeat(Math.max(4, width - 2))) : astraMeter(metrics.used, metrics.total, Math.max(4, width - 2), a.active));
		rows.push(pair("PERSISTENT CACHE", `${number(cacheBytes)} bytes`, width));
		rows.push(pair("ACTIVITY JOURNAL", `${snapshot.activities.length} records`, width));
		rows.push(pair("RECORDING", snapshot.recordingReadOnly ? "READ-ONLY" : "WRITABLE", width));
		return document(rows, width);
	}
}

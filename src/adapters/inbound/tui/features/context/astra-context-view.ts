import { Markdown, type Component } from "@earendil-works/pi-tui";
import type { RequestRuntimeRecord } from "../../../../../core/domain/execution/request-runtime";
import type { WorkbenchSnapshot } from "../../../../../core/domain/work/workbench";
import type { UsageSnapshot } from "../../../../../core/ports";
import { a, astraMarkdownTheme, fit, mark, number, pair, prose, safe, section } from "../../foundation/theme/astra-theme";
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
function meter(value: number, total: number, width = 18): string {
	const ratio = total > 0 ? Math.max(0, Math.min(1, value / total)) : 0;
	const filled = Math.round(width * ratio);
	return `${a.active("━".repeat(filled))}${a.rule("━".repeat(width - filled))}`;
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
		const context = s.contextUsage;
		const used = context?.usedTokens ?? 0;
		const total = context?.contextWindow ?? 0;
		const free = Math.max(0, total - used);
		const skills = s.skillInventory;
		const enabledMcp = s.mcpServers.filter(server => server.enabled).length;
		const memoryItems = s.chat.length + s.activities.length + s.tnotes.length;
		const rows = [
			...section("Context Dashboard", width, s.phase),
			pair(`${a.strong(workbenchModelLabel(s.activeModel ?? s.model))}  ${a.active(workbenchEffortLabel(s.effort))}`, `${runtimeModeLabel(s.permissionMode, s.collaborationMode)}  ·  ${s.threadId ? "thread 연결" : "thread 대기"}`, width),
			"",
			pair(`Free Space  ${context ? `${number(free)} tokens` : "미관측"}`, context ? `${usagePercent(context.percent).trim()} used` : "telemetry 없음", width),
			context ? meter(used, total, Math.max(8, Math.min(30, width - 2))) : a.rule("━".repeat(Math.max(8, Math.min(30, width - 2)))),
			pair(`Skills  ${skills?.count ?? 0}`, `MCP  ${enabledMcp}/${s.mcpServers.length}`, width),
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

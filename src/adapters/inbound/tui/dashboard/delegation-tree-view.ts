import { truncateToWidth, type Component } from "@earendil-works/pi-tui";
import type { ProjectActivity } from "../../../../core/domain/execution/project-activity";
import { sanitizeTerminalTextExcerpt } from "../../../../core/domain/execution/terminal";
import { projectNativeDelegation, type NativeDelegatedTask, type NativeDelegationProjection, type NativeDelegationStatus } from "../../../../core/domain/work";
import { colors } from "../shell/theme";

const LIMIT = 360;
export interface WorkbenchDelegationSection { readonly anchorActivityId: string; readonly activityIds: readonly string[]; readonly attribution: "observed"; readonly source: { readonly turnId: string; readonly itemIds: readonly string[] }; readonly rows: readonly string[]; }

/** Compatibility adapter; snapshots should pass their already-computed projection to renderDelegationSections. */
export function projectWorkbenchDelegationSections(activities: readonly ProjectActivity[], goal: string, rootThreadId: string | null, width: number): readonly WorkbenchDelegationSection[] {
	return renderDelegationSections(projectNativeDelegation(activities, rootThreadId), goal, width);
}

export function renderDelegationSections(projections: readonly NativeDelegationProjection[], goal: string, width: number): readonly WorkbenchDelegationSection[] {
	return Object.freeze(projections.map((projection) => ({
		anchorActivityId: projection.activityIds.at(-1)!, activityIds: projection.activityIds, attribution: "observed" as const,
		source: { turnId: projection.turnId, itemIds: projection.itemIds }, rows: Object.freeze(summaryRows(projection.tasks, goal, width)),
	})));
}

/** Selected-agent detail contains only observed public fields; raw reasoning is intentionally absent. */
export function renderDelegationDetail(task: NativeDelegatedTask | null, width: number, activityLimit = 8): readonly string[] {
	if (!task) return Object.freeze([clip(colors.muted("메인 수행 관찰 · 에이전트를 선택하면 맡긴 일 상세를 봅니다."), width)]);
	const label = safe(task.role) ?? safe(task.id) ?? "상세 관측 미지원/미수신";
	const rows = [`${present(task.status).glyph} ${label} · ${present(task.status).label}`, `Ref: ${safe(task.ref) ?? "상세 관측 미지원/미수신"}`, `Attempt: ${safe(String(task.attempt))}`];
	rows.push(`Parent: ${safe(task.parentId) ?? "상세 관측 미지원/미수신"}`);
	rows.push(`Task: ${safe(task.task) ?? "상세 관측 미지원/미수신"}`);
	rows.push(`Model: ${[safe(task.model), safe(task.reasoningEffort)].filter(Boolean).join(" · ") || "상세 관측 미지원/미수신"}`);
	rows.push(`Result: ${safe(task.result) ?? "상세 관측 미지원/미수신"}`);
	rows.push("Public activities:");
	if (task.activities.length === 0) rows.push("  상세 관측 미지원/미수신");
	else {
		const recent = Math.max(0, Math.min(32, Math.floor(activityLimit)));
		for (const activity of recent > 0 ? task.activities.slice(-recent) : []) rows.push(`  ${safe(activity.kind) ?? "activity"} · ${safe(activity.message) ?? "상세 관측 미지원/미수신"}`);
	}
	return Object.freeze(rows.map((row) => clip(row, width)));
}

export class DelegationTreeView implements Component {
	public constructor(private readonly getActivities: () => readonly ProjectActivity[], private readonly getGoal: () => string, private readonly getRootThreadId: () => string | null) {}
	public invalidate(): void {}
	public render(width: number): string[] { return projectWorkbenchDelegationSections(this.getActivities(), this.getGoal(), this.getRootThreadId(), width).flatMap((section, index) => index ? ["", ...section.rows] : section.rows); }
}

export function renderDelegationSummary(tasks: readonly NativeDelegatedTask[], goal: string, width: number): readonly string[] {
	return Object.freeze(summaryRows(tasks, goal, width));
}

function summaryRows(tasks: readonly NativeDelegatedTask[], goal: string, width: number): string[] {
	const rows = ["Planning executor delegation structure", "Source: observed native turn/item references", `Task: executor`, "├─ Context", `│  ${safe(goal) ?? "현재 요청을 처리합니다."}`, `└─ Tasks: ${tasks.length} ${tasks.length === 1 ? "agent" : "agents"}`];
	for (const { task, prefix, last, ordinal } of depthFirstTasks(tasks)) {
		const branch = `${prefix}${last ? "└─" : "├─"}`, pad = `${prefix}${last ? "   " : "│  "}`, p = present(task.status);
		rows.push(`   ${branch} ${p.glyph} ${safe(task.role) ?? `Agent ${ordinal}`} · ${p.label}`);
		rows.push(`   ${pad}Ref: ${safe(task.ref) ?? "상세 관측 미지원/미수신"}`);
		rows.push(`   ${pad}ID: ${safe(task.id) ?? "상세 관측 미지원/미수신"}`);
		const model = [safe(task.model), safe(task.reasoningEffort)].filter(Boolean).join(" · "); if (model) rows.push(`   ${pad}Model: ${model}`);
		if (task.task) rows.push(`   ${pad}Description: ${safe(task.task)}`);
		const latest = [...task.activities].reverse().find((a) => a.message && a.message !== task.task && !["sendMessage", "followupTask", "sendInput"].includes(a.kind))?.message; if (latest) rows.push(`   ${pad}└─ ${safe(latest)}`);
	}
	const byId = new Map(tasks.map((task, index) => [task.id, task.role ?? `Agent ${index + 1}`]));
	const messages = new Map<string, NativeDelegatedTask["activities"][number]>();
	for (const task of tasks) for (const activity of task.activities) if (["sendMessage", "followupTask", "sendInput"].includes(activity.kind)) messages.set(activity.activityId, activity);
	for (const activity of messages.values()) {
		const sender = activity.senderId === tasks[0]?.parentId ? "you" : byId.get(activity.senderId ?? "") ?? "agent";
		const receivers = activity.receiverIds.map((id) => id === tasks[0]?.parentId ? "you" : byId.get(id) ?? "agent").join(", ") || "team";
		rows.push(`[IRC] ${safe(sender)} → ${safe(receivers)}`); if (activity.message) rows.push(`  ${safe(activity.message)}`);
	}
	const active = tasks.filter((task) => task.status === "pending" || task.status === "running" || task.status === "unknown").length;
	rows.push(active ? `ⓘ Subagent: awaiting ${active} of ${tasks.length}` : `ⓘ Subagent: ${tasks.length} of ${tasks.length} finished`);
	return rows.map((row) => clip(row, width));
}
function present(status: NativeDelegationStatus): { glyph: string; label: string } { if (status === "completed") return { glyph: "✓", label: "completed" }; if (status === "failed") return { glyph: "✗", label: "errored" }; if (status === "cancelled") return { glyph: "■", label: "interrupted" }; if (status === "pending") return { glyph: "⏳", label: "pending" }; if (status === "unknown") return { glyph: "?", label: "unknown" }; return { glyph: "⣾", label: "running" }; }
function depthFirstTasks(tasks: readonly NativeDelegatedTask[]): readonly { task: NativeDelegatedTask; prefix: string; last: boolean; ordinal: number }[] {
	const refs = new Set(tasks.map((task) => task.ref));
	const children = new Map<string, NativeDelegatedTask[]>();
	for (const task of tasks) if (task.parentRef && refs.has(task.parentRef)) { const list = children.get(task.parentRef) ?? []; list.push(task); children.set(task.parentRef, list); }
	const roots = tasks.filter((task) => !task.parentRef || !refs.has(task.parentRef));
	const rows: { task: NativeDelegatedTask; prefix: string; last: boolean; ordinal: number }[] = [], visited = new Set<string>();
	let ordinal = 0;
	const visit = (task: NativeDelegatedTask, prefix: string, last: boolean): void => { if (visited.has(task.ref)) return; visited.add(task.ref); rows.push({ task, prefix, last, ordinal: ++ordinal }); const owned = children.get(task.ref) ?? []; owned.forEach((child, index) => visit(child, `${prefix}${last ? "   " : "│  "}`, index === owned.length - 1)); };
	roots.forEach((task, index) => visit(task, "", index === roots.length - 1));
	for (const task of tasks) if (!visited.has(task.ref)) visit(task, "", true);
	return rows;
}
function safe(value: string | null): string | null { return value ? sanitizeTerminalTextExcerpt(value, LIMIT, "head-tail").replace(/\s+/gu, " ").trim() : null; }
function clip(value: string, width: number): string { return truncateToWidth(value, Math.max(0, width)); }

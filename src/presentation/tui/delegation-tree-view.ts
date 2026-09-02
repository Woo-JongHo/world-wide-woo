import { truncateToWidth, type Component } from "@earendil-works/pi-tui";
import type { ProjectActivity } from "../../domain/project-activity";
import { sanitizeTerminalTextExcerpt } from "../../domain/terminal";
import { colors } from "./theme";

const DELEGATION_TEXT_LIMIT = 360;

type AgentStatus = "pendingInit" | "running" | "interrupted" | "completed" | "errored" | "shutdown" | "notFound";

interface CollabCall {
	readonly activity: ProjectActivity;
	readonly item: Readonly<Record<string, unknown>>;
}

interface DelegationGroup {
	readonly calls: CollabCall[];
	readonly subAgents: CollabCall[];
}

interface AgentProjection {
	readonly id: string;
	readonly label: string;
	readonly status: AgentStatus;
	readonly description: string | null;
	readonly model: string | null;
	readonly effort: string | null;
	readonly message: string | null;
}

export interface WorkbenchDelegationSection {
	readonly anchorActivityId: string;
	readonly activityIds: readonly string[];
	readonly rows: readonly string[];
}

/**
 * Projects public App Server collaboration items into Gajae-style executor
 * trees. The journal stays authoritative; this module only groups a turn's
 * latest public lifecycle values for display.
 */
export function projectWorkbenchDelegationSections(
	activities: readonly ProjectActivity[],
	goal: string,
	rootThreadId: string | null,
	width: number,
): readonly WorkbenchDelegationSection[] {
	const ordered = [...activities].sort((left, right) => left.sequence - right.sequence);
	const groups = new Map<string, DelegationGroup>();

	for (const activity of ordered) {
		const item = activityItem(activity);
		const type = normalized(item?.type);
		if (!item || type !== "subagentactivity" && !isCollabItemType(type)) continue;
		const key = activity.nativeRefs.turnId ?? activity.nativeRefs.threadId ?? `activity:${activity.id}`;
		const group = groups.get(key) ?? { calls: [], subAgents: [] };
		if (type === "subagentactivity") group.subAgents.push({ activity, item });
		else group.calls.push({ activity, item });
		groups.set(key, group);
	}

	return Object.freeze([...groups.values()].flatMap((group) => {
		const { calls, subAgents } = group;
		if (calls.length === 0) return [];
		const agentPaths = new Map<string, string>();
		const subAgentStates = new Map<string, { status: AgentStatus; message: string | null; sequence: number }>();
		for (const { activity, item } of subAgents) {
			const agentId = text(item.agentThreadId);
			const path = text(item.agentPath);
			if (agentId && path) agentPaths.set(agentId, shortAgentPath(path));
			if (!agentId) continue;
			const status = subAgentStatus(item.kind);
			if (status) subAgentStates.set(agentId, { status, message: null, sequence: activity.sequence });
		}
		const latestCalls = latestCallsByItem(calls);
		const spawnCalls = latestCalls.filter((call) => normalized(call.item.tool) === "spawnagent");
		const inferredRootThreadId = rootThreadId ?? text(spawnCalls[0]?.item.senderThreadId);
		const agentIds = unique(spawnCalls.flatMap((call) => stringArray(call.item.receiverThreadIds)))
			.filter((id) => id !== inferredRootThreadId);
		for (const call of latestCalls) {
			for (const agentId of Object.keys(record(call.item.agentsStates) ?? {})) {
				if (agentId !== inferredRootThreadId && !agentIds.includes(agentId)) agentIds.push(agentId);
			}
		}
		if (agentIds.length === 0) return [];

		const labels = new Map(agentIds.map((id, index) => [id, agentPaths.get(id) ?? `Agent ${index + 1}`]));
		const agents = agentIds.map((id) => projectAgent(id, labels.get(id)!, spawnCalls, latestCalls, subAgentStates));
		const sectionActivities = [...calls, ...subAgents].sort((left, right) => left.activity.sequence - right.activity.sequence);
		const sectionGoal = goalAtSequence(ordered, sectionActivities[0]!.activity.sequence) ?? goal;
		const rows = delegationRows(latestCalls, agents, labels, sectionGoal, inferredRootThreadId, width);
		const anchor = sectionActivities.at(-1)!.activity.id;
		return [{
			anchorActivityId: anchor,
			activityIds: Object.freeze(sectionActivities.map((entry) => entry.activity.id)),
			rows: Object.freeze(rows),
		}];
	}));
}

/** Small adapter useful when the projection is embedded outside WorkbenchChatView. */
export class DelegationTreeView implements Component {
	public constructor(
		private readonly getActivities: () => readonly ProjectActivity[],
		private readonly getGoal: () => string,
		private readonly getRootThreadId: () => string | null,
	) {}

	public invalidate(): void {}

	public render(width: number): string[] {
		return projectWorkbenchDelegationSections(
			this.getActivities(),
			this.getGoal(),
			this.getRootThreadId(),
			width,
		).flatMap((section, index) => index === 0 ? section.rows : ["", ...section.rows]);
	}
}

function projectAgent(
	id: string,
	label: string,
	spawnCalls: readonly CollabCall[],
	allCalls: readonly CollabCall[],
	subAgentStates: ReadonlyMap<string, { status: AgentStatus; message: string | null; sequence: number }>,
): AgentProjection {
	const spawn = spawnCalls.find((call) => stringArray(call.item.receiverThreadIds).includes(id));
	let latestState = subAgentStates.get(id) ?? null;
	for (const call of allCalls) {
		const state = record(record(call.item.agentsStates)?.[id]);
		const status = agentStatus(state?.status);
		if (!status || call.activity.sequence < (latestState?.sequence ?? -1)) continue;
		latestState = { status, message: publicLine(state?.message), sequence: call.activity.sequence };
	}
	const status = latestState?.status ?? spawnStatus(spawn?.item.status);
	return {
		id,
		label,
		status,
		description: publicLine(spawn?.item.prompt),
		model: firstText(spawn?.item.model, record(spawn?.item.settings)?.model),
		effort: firstText(spawn?.item.reasoningEffort, spawn?.item.reasoning_effort, record(spawn?.item.settings)?.reasoning_effort),
		message: latestState?.message ?? null,
	};
}

function delegationRows(
	calls: readonly CollabCall[],
	agents: readonly AgentProjection[],
	labels: ReadonlyMap<string, string>,
	goal: string,
	rootThreadId: string | null,
	width: number,
): string[] {
	const activeCount = agents.filter((agent) => agent.status === "pendingInit" || agent.status === "running").length;
	const status = groupStatus(agents);
	const statusStyle = statusPresentation(status);
	const rows = [
		clip(colors.secondary("Planning executor delegation structure"), width),
		clip(`${statusStyle.color(status === "running" ? "⏳" : statusStyle.glyph)} ${colors.text("Task: executor")}`, width),
		clip(colors.muted("├─ Context"), width),
		clip(`│  ${publicLine(goal) ?? "현재 요청을 처리합니다."}`, width),
		clip(colors.muted(`└─ Tasks: ${agents.length} ${agents.length === 1 ? "agent" : "agents"}`), width),
	];

	for (const [index, agent] of agents.entries()) {
		const last = index === agents.length - 1;
		const branch = last ? "   └─" : "   ├─";
		const continuation = last ? "      " : "   │  ";
		const presentation = statusPresentation(agent.status);
		rows.push(clip(`${colors.muted(branch)} ${presentation.color(presentation.glyph)} ${colors.highlight(agent.label)} · ${presentation.color(presentation.label)}`, width));
		const model = [agent.model, agent.effort].filter((value): value is string => Boolean(value)).join(" · ");
		if (model) rows.push(clip(`${colors.muted(continuation)}${colors.muted("Model:")} ${model}`, width));
		if (agent.description) rows.push(clip(`${colors.muted(continuation)}${colors.muted("Description:")} ${agent.description}`, width));
		if (agent.message && agent.message !== agent.description) rows.push(clip(`${colors.muted(`${continuation}└─`)} ${agent.message}`, width));
	}

	const terminalCount = agents.length - activeCount;
	rows.push(clip(colors.muted(activeCount > 0
		? `ⓘ Subagent: awaiting ${activeCount} of ${agents.length}`
		: `ⓘ Subagent: ${terminalCount} of ${agents.length} finished`), width));

	for (const call of calls) {
		const tool = normalized(call.item.tool);
		if (tool !== "sendmessage" && tool !== "followuptask" && tool !== "sendinput") continue;
		const message = publicLine(firstText(call.item.prompt, call.item.message, call.item.input));
		if (!message) continue;
		const senderId = text(call.item.senderThreadId);
		const receiverIds = stringArray(call.item.receiverThreadIds);
		const sender = actorLabel(senderId, rootThreadId, labels);
		const receivers = receiverIds.length > 0
			? receiverIds.map((id) => actorLabel(id, rootThreadId, labels)).join(", ")
			: "team";
		const at = timeLabel(call.activity.recordedAt);
		rows.push(clip(`${colors.accent("[IRC]")} ${sender} → ${receivers}${at ? colors.muted(` · ${at}`) : ""}`, width));
		rows.push(clip(`  ${message}`, width));
	}
	return rows;
}

function latestCallsByItem(calls: readonly CollabCall[]): CollabCall[] {
	const latest = new Map<string, CollabCall>();
	for (const call of calls) latest.set(text(call.item.id) ?? call.activity.nativeRefs.itemId ?? call.activity.id, call);
	return [...latest.values()].sort((left, right) => left.activity.sequence - right.activity.sequence);
}

function activityItem(activity: ProjectActivity): Readonly<Record<string, unknown>> | null {
	return record(record(activity.payload.params)?.item);
}

function record(value: unknown): Readonly<Record<string, unknown>> | null {
	return value && typeof value === "object" && !Array.isArray(value)
		? value as Readonly<Record<string, unknown>>
		: null;
}

function text(value: unknown): string | null {
	return typeof value === "string" && value.trim() ? value.trim() : null;
}

function firstText(...values: unknown[]): string | null {
	for (const value of values) {
		const result = text(value);
		if (result) return result;
	}
	return null;
}

function publicLine(value: unknown): string | null {
	const source = text(value);
	if (!source) return null;
	return sanitizeTerminalTextExcerpt(source, DELEGATION_TEXT_LIMIT, "head-tail").replace(/\s+/gu, " ").trim();
}

function goalAtSequence(activities: readonly ProjectActivity[], sequence: number): string | null {
	for (let index = activities.length - 1; index >= 0; index -= 1) {
		const activity = activities[index]!;
		if (activity.sequence > sequence || activity.kind !== "message") continue;
		if (activity.payload.direction !== "outbound" || activity.payload.role !== "user") continue;
		return publicLine(activity.payload.text);
	}
	return null;
}

function stringArray(value: unknown): string[] {
	return Array.isArray(value) ? value.flatMap((entry) => text(entry) ?? []) : [];
}

function unique(values: readonly string[]): string[] {
	return [...new Set(values)];
}

function normalized(value: unknown): string {
	return (text(value) ?? "").replace(/[^a-z]/giu, "").toLowerCase();
}

function isCollabItemType(type: string): boolean {
	return type === "collabagenttoolcall" || type === "collabtoolcall";
}

function shortAgentPath(path: string): string {
	return path.split("/").filter(Boolean).at(-1) ?? path;
}

function agentStatus(value: unknown): AgentStatus | null {
	if (value === "queued") return "pendingInit";
	if (value === "failed") return "errored";
	if (value === "cancelled" || value === "canceled") return "interrupted";
	if (value === "pendingInit" || value === "running" || value === "interrupted" || value === "completed"
		|| value === "errored" || value === "shutdown" || value === "notFound") return value;
	return null;
}

function subAgentStatus(value: unknown): AgentStatus | null {
	if (value === "started" || value === "interacted") return "running";
	if (value === "interrupted") return "interrupted";
	if (value === "completed") return "completed";
	return null;
}

function spawnStatus(value: unknown): AgentStatus {
	if (value === "failed") return "errored";
	if (value === "interrupted" || value === "cancelled" || value === "canceled") return "interrupted";
	if (value === "queued" || value === "pending") return "pendingInit";
	return "running";
}

function groupStatus(agents: readonly AgentProjection[]): AgentStatus {
	if (agents.some((agent) => agent.status === "errored")) return "errored";
	if (agents.some((agent) => agent.status === "interrupted")) return "interrupted";
	if (agents.some((agent) => agent.status === "pendingInit" || agent.status === "running")) return "running";
	return "completed";
}

function statusPresentation(status: AgentStatus): { glyph: string; label: string; color: (text: string) => string } {
	if (status === "pendingInit") return { glyph: "⏳", label: "pending", color: colors.warning };
	if (status === "running") return { glyph: "⣾", label: "running", color: colors.accent };
	if (status === "interrupted") return { glyph: "■", label: "interrupted", color: colors.warning };
	if (status === "errored") return { glyph: "✗", label: "errored", color: colors.error };
	if (status === "notFound") return { glyph: "?", label: "not found", color: colors.error };
	if (status === "shutdown") return { glyph: "○", label: "shutdown", color: colors.muted };
	return { glyph: "✓", label: "completed", color: colors.success };
}

function actorLabel(id: string | null, rootThreadId: string | null, labels: ReadonlyMap<string, string>): string {
	if (id && rootThreadId && id === rootThreadId) return "you";
	if (id && labels.has(id)) return labels.get(id)!;
	return id ? "agent" : "you";
}

function timeLabel(recordedAt: string): string {
	return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/u.test(recordedAt) ? recordedAt.slice(11, 16) : "";
}

function clip(text: string, width: number): string {
	return truncateToWidth(text, Math.max(0, width));
}

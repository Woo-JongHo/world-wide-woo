import type { NativeRefs }                                 from "@/core/domain/execution/native-session.js";
import type { ProjectActivity, ProjectActivityPhase }      from "@/core/domain/execution/project-activity.js";
import { REQUEST_REPORT_PREFIX }                           from "@/core/domain/execution/request-runtime.js";
import { sanitizeTerminalTextUnbounded }                   from "@/core/domain/execution/terminal.js";
import type { WorkbenchChatMessage, WorkbenchSessionGoal } from "@/core/domain/work/workbench.js";
import { questionForTurn }                                 from "@/core/application/work/completed-turn-note-scope.js";

const SESSION_GOAL_MARKER = /^SESSION_GOAL:[ \t]*(\S(?:[^\r\n]*\S)?)$/u;

export const SESSION_GOAL_CHARACTER_LIMIT = 160;

export function projectSessionGoal(activities: readonly ProjectActivity[]): WorkbenchSessionGoal | null {
	for (let index = activities.length - 1; index >= 0; index -= 1) {
		const activity = activities[index];
		if (!activity
			|| activity.kind !== "message"
			|| activity.phase !== "completed"
			|| activity.payload.direction === "outbound") continue;
		const text = sessionGoalMarker(activityText(activity.payload));
		if (!text || !activity.nativeRefs.turnId) continue;
		const question = questionForTurn(activities, activity.nativeRefs.turnId);
		if (!question || !/^\$session-goal(?:[ \t]+|$)/u.test(question)) continue;
		return { text, sourceActivityId: activity.id, updatedAt: activity.recordedAt };
	}
	for (let index = activities.length - 1; index >= 0; index -= 1) {
		const activity = activities[index];
		if (!activity
			|| activity.kind !== "message"
			|| activity.phase !== "completed"
			|| activity.payload.goal !== true) continue;
		const text = activityText(activity.payload).trim();
		if (!text || text.length > SESSION_GOAL_CHARACTER_LIMIT) continue;
		return { text, sourceActivityId: activity.id, updatedAt: activity.recordedAt };
	}
	return null;
}

export function isAssistantMessageActivity(activity: ProjectActivity): boolean {
	if (activity.payload.role === "assistant") return true;
	if (activity.payload.role === "user" || activity.payload.direction === "outbound") return false;
	const params   = record(activity.payload.params)                                                          ;
	const itemType = String(record(params?.item)?.type ?? "").replace(/[-_]/gu, "").toLowerCase()             ;
	const method   = typeof activity.payload.method === "string" ? activity.payload.method.toLowerCase() : "" ;
	return itemType === "agentmessage" || method.startsWith("item/agentmessage/");
}

export function isStructuredPlanActivity(activity: ProjectActivity): boolean {
	if (activity.payload.method === "turn/plan/updated") return true;
	if (activity.payload.method !== "item/completed") return false;
	const item = record(record(activity.payload.params)?.item);
	return typeof item?.type === "string" && item.type.toLowerCase() === "plan";
}

export function isPublicPlanFallbackActivity(activity: ProjectActivity): boolean {
	return activity.payload.method === "turn/plan/public-fallback"
		&& activity.payload.source === "public-assistant-response";
}

export function publicNumberedPlanEntries(
	text: string,
	requestText: string,
): ReadonlyArray<{ readonly step: string; readonly status: "inProgress" | "pending" }> | null {
	const publicText = sanitizeTerminalTextUnbounded(text).replace(/\r\n?/gu, "\n").trim();
	if (!publicText || [...publicText].length > 12_000 || /```/u.test(publicText)) return null;
	const preamble = publicText.split("\n").find(line => line.trim() && !/^\s*\d+[.)]\s+/u.test(line)) ?? "";
	if (!/(?:계획|단계|순서|절차|진행|실행|작업|plan|steps?|procedure|workflow)/iu.test(`${requestText}\n${preamble}`)) return null;
	const entries : Array<{ step: string; status: "inProgress" | "pending" }> = []    ;
	let started                                                               = false ;
	let ended                                                                 = false ;
	let introLines                                                            = 0     ;
	for (const line of publicText.split("\n")) {
		if (!line.trim()) continue;
		const numbered = /^\s*(\d+)[.)]\s+(.+?)\s*$/u.exec(line);
		if (!numbered) {
			if (!started && introLines < 4 && !/^\s*[-*+]\s+/u.test(line)) {
				introLines += 1;
				continue;
			}
			if (started) {
				ended = true;
				continue;
			}
			return null;
		}
		if (ended) return null;
		started = true;
		const ordinal = Number(numbered[1]);
		const step = numbered[2]?.trim().replace(/^\*\*(.+)\*\*$/u, "$1").trim();
		if (ordinal !== entries.length + 1
			|| !step
			|| [...step].length > 240
			|| entries.length >= 12) return null;
		entries.push({ step, status: entries.length === 0 ? "inProgress" : "pending" });
	}
	return entries.length >= 2 ? entries : null;
}

export function missingAssistantResponseNotice(phase: ProjectActivityPhase): string {
	if (phase === "cancelled") return "답변 본문을 받기 전에 작업이 중단되었습니다.";
	if (phase === "failed") return "답변 본문을 받기 전에 작업이 실패했습니다.";
	return "최종 답변 본문을 받지 못했습니다.";
}

/** Projects durable root-thread messages without exposing Runtime transport reports. */
export function projectChat(activities: readonly ProjectActivity[], rootThreadId: string | null): WorkbenchChatMessage[] {
	const messages = new Map<string, WorkbenchChatMessage>();
	for (const activity of activities) {
		if (activity.kind !== "message") continue;
		if (rootThreadId && activity.nativeRefs.threadId !== rootThreadId) continue;
		const payload = record(activity.payload)                  ;
		const role    = payload ? chatMessageRole(payload) : null ;
		const status  = chatMessageStatus(activity, payload)      ;
		const text    = payload ? activityText(payload) : ""      ;
		if (role && !text) continue;
		if (!role || !status || !text) {
			const key = `invalid-message:${activity.id}`;
			messages.set(key, {
				id         : key,
				role       : "system",
				content    : "이 메시지 기록은 형식을 확인할 수 없어 표시하지 않았습니다.",
				activityId : activity.id,
				status     : "failed",
			});
			continue;
		}
		const key = role === "user" && activity.nativeRefs.threadId && activity.nativeRefs.itemId
			? threadItemKey(activity.nativeRefs.threadId, activity.nativeRefs.itemId)
			: nativeItemIdentity(activity.nativeRefs) ?? `activity:${activity.id}`;
		const previous = messages.get(key);
		messages.set(key, {
			id: key,
			role,
			content: previous && status === "streaming" ? `${previous.content}${text}` : text,
			activityId: activity.id,
			status,
			...(activity.payload.finalObservation === "missing" ? { partial: activity.payload.partial === true } : {}),
		});
	}
	return [...messages.values()].filter(message => message.role !== "assistant" || !message.content.startsWith(REQUEST_REPORT_PREFIX));
}

export function nativeItemIdentity(refs: NativeRefs): string | null {
	if (!refs.threadId || !refs.turnId || !refs.itemId) return null;
	return stableJson({ threadId: refs.threadId, turnId: refs.turnId, itemId: refs.itemId });
}

export function sameTurnOwner(left: NativeRefs | null, right: NativeRefs): boolean {
	return Boolean(left?.threadId && left.turnId && right.threadId && right.turnId
		&& left.threadId === right.threadId && left.turnId === right.turnId);
}

export function threadItemKey(threadId: string, itemId: string): string {
	return stableJson({ threadId, itemId });
}

export function activityText(payload: Readonly<Record<string, unknown>>): string {
	for (const candidate of [payload.text, payload.message, payload.delta]) {
		if (typeof candidate === "string") return candidate;
	}
	const params = record(payload.params);
	const item = record(params?.item);
	for (const candidate of [params?.text, params?.message, params?.delta, item?.text, item?.content]) {
		if (typeof candidate === "string") return candidate;
	}
	return "";
}

export function stableJson(value: unknown): string {
	if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
	if (value && typeof value === "object") {
		return `{${Object.entries(value as Record<string, unknown>)
			.sort(([left], [right]) => left.localeCompare(right))
			.map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`).join(",")}}`;
	}
	return JSON.stringify(value) ?? "null";
}

export function record(value: unknown): Record<string, unknown> | null {
	return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function sessionGoalMarker(text: string): string | null {
	const match = SESSION_GOAL_MARKER.exec(text);
	const goal = match?.[1];
	if (!goal || goal.length > SESSION_GOAL_CHARACTER_LIMIT) return null;
	return goal;
}

function chatMessageRole(payload: Readonly<Record<string, unknown>>): WorkbenchChatMessage["role"] | null {
	if (payload.role === "user" || payload.direction === "outbound") return "user";
	if (payload.role === "assistant") return "assistant";
	if (payload.role !== undefined || payload.direction !== undefined) return null;
	const params = record(payload.params);
	const itemType = String(record(params?.item)?.type ?? "").replace(/[-_]/gu, "").toLowerCase();
	if (itemType === "usermessage") return "user";
	const method = typeof payload.method === "string" ? payload.method.replace(/[-_]/gu, "").toLowerCase() : "";
	if (itemType === "agentmessage" || method.startsWith("item/agentmessage/")) return "assistant";
	return null;
}

function chatMessageStatus(
	activity: ProjectActivity,
	payload: Readonly<Record<string, unknown>> | null,
): WorkbenchChatMessage["status"] | null {
	if (!payload) return null;
	if (activity.phase === "completed" && payload.finalObservation === "missing") return "incomplete";
	if (activity.phase === "failed") return "failed";
	if (activity.phase === "cancelled") return "cancelled";
	if (activity.phase === "completed") return "completed";
	if (activity.phase === "started" || activity.phase === "updated") return "streaming";
	return null;
}

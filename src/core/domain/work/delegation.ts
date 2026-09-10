import { isReasoningActivityPayload, type ProjectActivity } from "../execution/project-activity.js";

export type NativeDelegationStatus = "pending" | "running" | "completed" | "failed" | "cancelled" | "unknown";
export interface NativeDelegationActivity { readonly activityId: string; readonly itemId: string; readonly kind: string; readonly message: string | null; readonly senderId: string | null; readonly receiverIds: readonly string[]; readonly attribution: "observed"; readonly source: { readonly turnId: string; readonly itemId: string }; }
export interface NativeDelegatedTask { readonly ref: string; readonly id: string; readonly attempt: number; readonly parentId: string | null; readonly parentRef: string | null; readonly role: string | null; readonly status: NativeDelegationStatus; readonly task: string | null; readonly model: string | null; readonly reasoningEffort: string | null; readonly activities: readonly NativeDelegationActivity[]; readonly result: string | null; }
export interface NativeDelegationProjection { readonly sourceThreadId: string; readonly turnId: string; readonly activityIds: readonly string[]; readonly itemIds: readonly string[]; readonly tasks: readonly NativeDelegatedTask[]; }
interface MutableTask { ref: string; id: string; attempt: number; born: number; projectionKey: string; spawnItemId: string | null; parentId: string | null; role: string | null; status: NativeDelegationStatus; task: string | null; model: string | null; reasoningEffort: string | null; activities: NativeDelegationActivity[]; result: string | null; }

/** Builds ownership over the full journal, then projects only root-owned descendants. */
export function projectNativeDelegation(activities: readonly ProjectActivity[], rootThreadId?: string | null): readonly NativeDelegationProjection[] {
	const ordered = [...activities].sort((a, b) => a.sequence - b.sequence);
	const tasks: MutableTask[] = [], latest = new Map<string, MutableTask>(), attempts = new Map<string, number>(), spawned = new Map<string, MutableTask[]>();
	const projectionActivities = new Map<string, ProjectActivity[]>();
	const create = (id: string, activity: ProjectActivity, spawnItemId: string | null) => {
		const attempt = (attempts.get(id) ?? 0) + 1;
		const source = rootThreadId ?? activity.nativeRefs.threadId ?? "unknown", turn = activity.nativeRefs.turnId ?? "unknown", projectionKey = `${source}\u0000${turn}`;
		const task: MutableTask = { ref: `${source}:${turn}:${id}:${attempt}`, id, attempt, born: activity.sequence, projectionKey, spawnItemId, parentId: null, role: null, status: "unknown", task: null, model: null, reasoningEffort: null, activities: [], result: null };
		tasks.push(task); latest.set(id, task); attempts.set(id, attempt); return task;
	};
	for (const activity of ordered) {
		const item = rec(rec(activity.payload.params)?.item);
		if (!item || !["collabagenttoolcall", "subagentactivity"].includes(norm(item.type)) || !activity.nativeRefs.turnId || !activity.nativeRefs.itemId) continue;
		const projectionKey = `${rootThreadId ?? activity.nativeRefs.threadId ?? "unknown"}\u0000${activity.nativeRefs.turnId}`;
		const group = projectionActivities.get(projectionKey) ?? []; group.push(activity); projectionActivities.set(projectionKey, group);
		if (norm(item.type) === "subagentactivity") {
			const id = txt(item.agentThreadId); if (!id) continue;
			const task = latest.get(id) ?? create(id, activity, null); task.role ??= role(txt(item.agentPath));
			const status = lifecycle(item.kind); if (status !== "unknown") task.status = status;
			const message = first(item.message, item.text, item.result); task.activities.push(observation(activity, item, message)); if (task.status === "completed" && message) task.result = message;
			continue;
		}
		const tool = norm(item.tool), itemId = txt(item.id) ?? activity.nativeRefs.itemId;
		if (tool === "spawnagent") {
			const spawnKey = `${activity.nativeRefs.threadId ?? "unknown"}\u0000${activity.nativeRefs.turnId}\u0000${itemId}`;
			let affected = spawned.get(spawnKey);
			const receivers = strings(item.receiverThreadIds);
			if (!affected || affected.length === 0 && receivers.length) {
				affected = receivers.map((id) => { const provisional = latest.get(id); if (provisional?.spawnItemId === null) { provisional.spawnItemId = itemId; provisional.projectionKey = projectionKey; return provisional; } return create(id, activity, itemId); });
				spawned.set(spawnKey, affected);
			}
			for (const task of affected) enrichSpawn(task, activity, item);
			continue;
		}
		for (const [id, stateValue] of Object.entries(rec(item.agentsStates) ?? {})) updateState(latest.get(id), activity, item, rec(stateValue));
		if (["sendmessage", "followuptask", "sendinput"].includes(tool)) for (const id of receiversFor(item)) { const task = latest.get(id); const message = first(item.prompt, item.message, item.input); if (task && message) task.activities.push(observation(activity, item, message)); }
	}

	// Child-native work is attributed by stable native turn binding. Recognized reasoning envelopes are excluded.
	const attemptByChildTurn = new Map<string, MutableTask>();
	for (const activity of ordered) {
		const threadId = activity.nativeRefs.threadId, turnId = activity.nativeRefs.turnId, itemId = activity.nativeRefs.itemId;
		if (!threadId || !turnId || !itemId || isReasoningActivityPayload(activity.payload)) continue;
		const item = rec(rec(activity.payload.params)?.item);
		if (item && ["collabagenttoolcall", "subagentactivity"].includes(norm(item.type))) continue;
		if (activity.kind !== "tool" && activity.kind !== "message" && activity.kind !== "file-change") continue;
		const childTurnKey = `${threadId}\u0000${turnId}`;
		let attempt = attemptByChildTurn.get(childTurnKey);
		if (!attempt) {
			const candidates = tasks.filter((task) => task.id === threadId && task.born <= activity.sequence);
			if (candidates.length !== 1) continue;
			attempt = candidates[0]!;
			attemptByChildTurn.set(childTurnKey, attempt);
		}
		if (!attempt) continue;
		attempt.activities.push(publicChildObservation(activity, item));
	}

	return Object.freeze([...projectionActivities.entries()].flatMap(([key, entries]) => {
		const visible = tasks.filter((task) => task.projectionKey === key && (!rootThreadId || descendant(task, tasks, rootThreadId)));
		if (!visible.length) return [];
		const [sourceThreadId, turnId] = key.split("\u0000") as [string, string];
		return [{ sourceThreadId, turnId, activityIds: Object.freeze(entries.map((e) => e.id)), itemIds: Object.freeze([...new Set(entries.map((e) => e.nativeRefs.itemId!))]), tasks: Object.freeze(visible.map((task) => Object.freeze({ ...task, parentRef: parentRef(task, tasks), activities: Object.freeze([...task.activities].sort((a, b) => activitySequence(a.activityId, ordered) - activitySequence(b.activityId, ordered))) }))) }];
	}));
}

function enrichSpawn(task: MutableTask, activity: ProjectActivity, item: Readonly<Record<string, unknown>>): void { task.parentId ??= txt(item.senderThreadId); task.task ??= txt(item.prompt); task.model ??= first(item.model, rec(item.settings)?.model); task.reasoningEffort ??= first(item.reasoningEffort, item.reasoning_effort, rec(item.settings)?.reasoning_effort); updateState(task, activity, item, rec(rec(item.agentsStates)?.[task.id])); }
function updateState(task: MutableTask | undefined, activity: ProjectActivity, item: Readonly<Record<string, unknown>>, state: Readonly<Record<string, unknown>> | undefined): void { if (!task) return; const status = lifecycle(state?.status); if (status !== "unknown") task.status = status; const message = first(state?.message, item.message); if (message) task.activities.push(observation(activity, item, message)); if (task.status === "completed" && message) task.result = message; }
function descendant(task: MutableTask, tasks: readonly MutableTask[], root: string): boolean { let parent = task.parentId; const seen = new Set<string>(); while (parent && !seen.has(parent)) { if (parent === root) return true; seen.add(parent); parent = [...tasks].reverse().find((candidate) => candidate.id === parent && candidate.born <= task.born)?.parentId ?? null; } return false; }
function parentRef(task: MutableTask, tasks: readonly MutableTask[]): string | null { return task.parentId ? [...tasks].reverse().find((candidate) => candidate.id === task.parentId && candidate.born <= task.born)?.ref ?? null : null; }
function publicChildObservation(activity: ProjectActivity, item?: Readonly<Record<string, unknown>>): NativeDelegationActivity { const payload = activity.payload, params = rec(payload.params); const message = first(payload.text, payload.content, params?.text, item?.text, item?.content, item?.message, item?.output, item?.result); const kind = first(item?.tool, item?.command, payload.method, activity.kind) ?? activity.kind; return { activityId: activity.id, itemId: activity.nativeRefs.itemId!, kind, message, senderId: activity.nativeRefs.threadId ?? null, receiverIds: Object.freeze([]), attribution: "observed", source: { turnId: activity.nativeRefs.turnId!, itemId: activity.nativeRefs.itemId! } }; }
function observation(activity: ProjectActivity, item: Readonly<Record<string, unknown>>, message: string | null): NativeDelegationActivity { return { activityId: activity.id, itemId: activity.nativeRefs.itemId!, kind: first(item.kind, item.tool) ?? "activity", message, senderId: txt(item.senderThreadId), receiverIds: Object.freeze(strings(item.receiverThreadIds)), attribution: "observed", source: { turnId: activity.nativeRefs.turnId!, itemId: activity.nativeRefs.itemId! } }; }
function lifecycle(value: unknown): NativeDelegationStatus { const v = norm(value); if (v === "completed") return "completed"; if (["failed", "errored", "error"].includes(v)) return "failed"; if (["cancelled", "canceled", "interrupted", "shutdown"].includes(v)) return "cancelled"; if (["running", "started", "interacted", "inprogress"].includes(v)) return "running"; if (["queued", "pending", "pendinginit"].includes(v)) return "pending"; return "unknown"; }
function activitySequence(id: string, activities: readonly ProjectActivity[]): number { return activities.find((activity) => activity.id === id)?.sequence ?? Number.MAX_SAFE_INTEGER; }
function role(path: string | null): string | null { return path?.split("/").filter(Boolean).at(-1) ?? null; }
function receiversFor(item: Readonly<Record<string, unknown>>): string[] { return strings(item.receiverThreadIds); }
function norm(value: unknown): string { return (txt(value) ?? "").replace(/[^a-z]/giu, "").toLowerCase(); }
function txt(value: unknown): string | null { return typeof value === "string" && value.trim() ? value.trim() : null; }
function first(...values: unknown[]): string | null { for (const value of values) { const result = txt(value); if (result) return result; } return null; }
function strings(value: unknown): string[] { return Array.isArray(value) ? value.flatMap((entry) => txt(entry) ?? []) : []; }
function rec(value: unknown): Readonly<Record<string, unknown>> | undefined { return value && typeof value === "object" && !Array.isArray(value) ? value as Readonly<Record<string, unknown>> : undefined; }

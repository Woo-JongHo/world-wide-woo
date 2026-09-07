import type { ProjectActivity } from "../project-activity.js";

export type NativeDelegationStatus = "pending" | "running" | "completed" | "failed";

export interface NativeDelegationActivity {
	readonly activityId: string;
	readonly itemId: string;
	readonly kind: string;
	readonly message: string | null;
	readonly attribution: "observed";
	readonly source: {
		readonly turnId: string;
		readonly itemId: string;
	};
}

export interface NativeDelegatedTask {
	readonly id: string;
	readonly parentId: string | null;
	readonly status: NativeDelegationStatus;
	readonly task: string | null;
	readonly model: string | null;
	readonly reasoningEffort: string | null;
	readonly activities: readonly NativeDelegationActivity[];
}

export interface NativeDelegationProjection {
	readonly turnId: string;
	readonly tasks: readonly NativeDelegatedTask[];
}

/**
 * A display-neutral projection of observed native collaboration items.
 * It does not select executors, direct agents, or infer unobserved relations.
 */
export function projectNativeDelegation(
	activities: readonly ProjectActivity[],
): readonly NativeDelegationProjection[] {
	const byTurn = new Map<string, ProjectActivity[]>();
	for (const activity of activities) {
		const item = record(record(activity.payload.params)?.item);
		const type = (delegationText(item?.type) ?? "").replace(/[^a-z]/giu, "").toLowerCase();
		if (type !== "collabagenttoolcall" && type !== "subagentactivity") continue;
		if (!activity.nativeRefs.turnId || !activity.nativeRefs.itemId) continue;
		const turnId = activity.nativeRefs.turnId;
		const entries = byTurn.get(turnId) ?? [];
		entries.push(activity);
		byTurn.set(turnId, entries);
	}
	return Object.freeze([...byTurn.entries()].map(([turnId, entries]) => {
		const tasks = new Map<string, {
			parentId: string | null; status: NativeDelegationStatus; task: string | null;
			model: string | null; reasoningEffort: string | null; activities: NativeDelegationActivity[];
		}>();
		const ensure = (id: string, parentId: string | null) => {
			const existing = tasks.get(id);
			if (existing) return existing;
			const created = { parentId, status: "pending" as NativeDelegationStatus, task: null, model: null, reasoningEffort: null, activities: [] };
			tasks.set(id, created);
			return created;
		};
		for (const activity of entries.sort((left, right) => left.sequence - right.sequence)) {
			const item = record(record(activity.payload.params)?.item)!;
			const type = (delegationText(item.type) ?? "").replace(/[^a-z]/giu, "").toLowerCase();
			if (type === "collabagenttoolcall") {
				const parentId = delegationText(item.senderThreadId);
				const receivers = Array.isArray(item.receiverThreadIds)
					? item.receiverThreadIds.flatMap((value) => delegationText(value) ?? [])
					: [];
				for (const id of receivers) {
					const task = ensure(id, parentId);
					task.task ??= delegationText(item.prompt);
					task.model ??= delegationText(item.model) ?? delegationText(record(item.settings)?.model);
					task.reasoningEffort ??= delegationText(item.reasoningEffort) ??
						delegationText(item.reasoning_effort) ?? delegationText(record(item.settings)?.reasoning_effort);
					const state = record(record(item.agentsStates)?.[id]);
					task.status = delegationStatus(state?.status ?? item.status);
					const message = delegationText(state?.message) ??
						delegationText(item.message) ?? delegationText(item.input);
					if (message) task.activities.push(delegationActivity(activity, item, message));
				}
				continue;
			}
			const id = delegationText(item.agentThreadId);
			if (!id) continue;
			const task = ensure(id, null);
			task.status = delegationStatus(item.kind);
			const message = delegationText(item.message) ?? delegationText(item.text);
			task.activities.push(delegationActivity(activity, item, message));
		}
		return {
			turnId,
			tasks: Object.freeze([...tasks.entries()].map(([id, task]) => ({
				id, ...task, activities: Object.freeze(task.activities),
			}))),
		};
	}));
}

function delegationActivity(
	activity: ProjectActivity,
	item: Readonly<Record<string, unknown>>,
	message: string | null,
): NativeDelegationActivity {
	const turnId = activity.nativeRefs.turnId;
	const itemId = activity.nativeRefs.itemId;
	if (!turnId || !itemId) throw new Error("native delegation activity requires turn and item references");
	return {
		activityId: activity.id,
		itemId,
		kind: delegationText(item.kind) ?? delegationText(item.tool) ?? "activity",
		message,
		attribution: "observed",
		source: { turnId, itemId },
	};
}

function delegationText(value: unknown): string | null {
	return typeof value === "string" && value.trim() ? value.trim() : null;
}

function delegationStatus(value: unknown): NativeDelegationStatus {
	if (value === "completed") return "completed";
	if (value === "failed" || value === "errored" || value === "interrupted" || value === "cancelled" || value === "canceled") return "failed";
	if (value === "running" || value === "started" || value === "interacted" || value === "inProgress") return "running";
	return "pending";
}

function record(value: unknown): Readonly<Record<string, unknown>> | undefined {
	return value && typeof value === "object" && !Array.isArray(value)
		? value as Readonly<Record<string, unknown>>
		: undefined;
}

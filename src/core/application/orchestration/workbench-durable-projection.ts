import type { ProjectActivity }                      from "@/core/domain/execution/project-activity.js";
import { projectTNoteCompletionIndex }               from "@/core/domain/work/t-notes.js";
import type { WorkbenchChatMessage, WorkbenchTNote } from "@/core/domain/work/workbench.js";
import { projectChat, threadItemKey }                from "@/core/application/orchestration/workbench-projections.js";

export interface DurableActivityProjection {
	readonly sourceLength  : number                          ;
	readonly rootThreadId  : string | null                   ;
	readonly activityCount : number                          ;
	readonly activities    : readonly ProjectActivity[]      ;
	readonly chat          : readonly WorkbenchChatMessage[] ;
}

interface DurableNoteProjection {
	readonly sourceLength         : number                    ;
	readonly activitySourceLength : number                    ;
	readonly notes                : readonly WorkbenchTNote[] ;
}

/** Owns cached durable read models used to assemble a Workbench snapshot. */
export class WorkbenchDurableProjection {
	private activityCache: DurableActivityProjection = {
		sourceLength  : -1,
		rootThreadId  : null,
		activityCount : 0,
		activities    : Object.freeze([]),
		chat          : Object.freeze([]),
	};

	private noteCache: DurableNoteProjection = {
		sourceLength         : -1,
		activitySourceLength : -1,
		notes                : Object.freeze([]),
	};

	public activities(visibleActivities: readonly ProjectActivity[], rootThreadId: string | null): DurableActivityProjection {
		if (this.activityCache.sourceLength === visibleActivities.length
			&& this.activityCache.rootThreadId === rootThreadId) {
			return this.activityCache;
		}
		const activities = Object.freeze([...visibleActivities]);
		this.activityCache = {
			sourceLength  : visibleActivities.length,
			rootThreadId  : rootThreadId,
			activityCount : visibleActivities.length,
			activities    : activities,
			chat          : deepFreeze(projectChat(activities, rootThreadId)),
		};
		return this.activityCache;
	}

	public chat(
		durable: readonly WorkbenchChatMessage[],
		optimistic: ReadonlyMap<string, WorkbenchChatMessage>,
		threadId: string | null,
	): readonly WorkbenchChatMessage[] {
		if (optimistic.size === 0) return durable;
		const messages = new Map(durable.map(message => [message.id, message]));
		for (const message of optimistic.values()) {
			// Durable acceptance owns the row even while the request observation is still being written.
			if (threadId && messages.has(threadItemKey(threadId, message.id))) continue;
			messages.set(message.id, message);
		}
		return Object.freeze([...messages.values()]);
	}

	public notes(notes: readonly WorkbenchTNote[], visibleActivities: readonly ProjectActivity[]): readonly WorkbenchTNote[] {
		if (this.noteCache.sourceLength === notes.length
			&& this.noteCache.activitySourceLength === visibleActivities.length) {
			return this.noteCache.notes;
		}
		const current = currentSessionNotes(notes, visibleActivities);
		this.noteCache = {
			sourceLength         : notes.length,
			activitySourceLength : visibleActivities.length,
			notes                : Object.freeze([...current]),
		};
		return this.noteCache.notes;
	}
}

function currentSessionNotes(
	notes: readonly WorkbenchTNote[],
	visibleActivities: readonly ProjectActivity[],
): readonly WorkbenchTNote[] {
	const activityIds     = new Set(visibleActivities.map(activity => activity.id))                      ;
	const current         = notes.filter(note => note.sourceActivityIds.some(id => activityIds.has(id))) ;
	const completionOrder = new Map<string, number>()                                                    ;
	for (const completion of projectTNoteCompletionIndex(visibleActivities, current)) {
		if (completion.noteId) completionOrder.set(completion.noteId, completion.number);
	}
	return [...current].sort((left, right) =>
		(completionOrder.get(left.id) ?? Number.MAX_SAFE_INTEGER) - (completionOrder.get(right.id) ?? Number.MAX_SAFE_INTEGER)
		|| left.id.localeCompare(right.id));
}

function deepFreeze<T>(value: T): T {
	if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
	for (const key of Reflect.ownKeys(value)) deepFreeze(Reflect.get(value, key));
	Object.freeze(value);
	return value;
}

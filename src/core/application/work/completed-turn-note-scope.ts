import type { ProjectActivity } from "../../domain/execution/project-activity.js";
import { sanitizeTerminalTextExcerpt } from "../../domain/execution/terminal.js";
import { sanitizeTNoteText } from "../../domain/work/t-notes.js";

export type CompletedTurnSelector =
	| { readonly type: "turn"; readonly turnId: string }
	| { readonly type: "latest" }
	| { readonly type: "exact-selection" };

export interface CompletedTurnNoteScope {
	readonly question: string;
	readonly activities: readonly ProjectActivity[];
}

export function resolveCompletedTurnNoteScope(
	activities: readonly ProjectActivity[],
	selector: CompletedTurnSelector,
): CompletedTurnNoteScope | null {
	if (selector.type === "turn") return completedTurnNoteScope(activities, selector.turnId);
	if (selector.type === "latest") return latestCompletedTurnNoteScope(activities);
	return exactCompletedTurnNoteScope(activities);
}

export function questionForTurn(activities: readonly ProjectActivity[], turnId: string): string | null {
	const startIndex = turnStartIndex(activities, turnId);
	if (startIndex < 0) return null;
	const questionIndex = questionIndexForTurn(activities, startIndex, activities[startIndex]!.nativeRefs.threadId);
	if (questionIndex < 0) return null;
	const question = normalizedQuestion(activityText(activities[questionIndex]!.payload));
	return question || null;
}

function completedTurnNoteScope(
	activities: readonly ProjectActivity[],
	turnId: string,
): CompletedTurnNoteScope | null {
	let terminalIndex = -1;
	let startIndex = -1;
	for (const [index, activity] of activities.entries()) {
		if (activity.nativeRefs.turnId !== turnId) continue;
		if (activity.payload.method === "turn/start" || activity.payload.method === "turn/started") startIndex = index;
		if (activity.payload.method === "turn/completed" && activity.phase === "completed") terminalIndex = index;
	}
	if (startIndex < 0 || terminalIndex < startIndex) return null;
	const questionIndex = questionIndexForTurn(activities, startIndex, activities[startIndex]!.nativeRefs.threadId);
	if (questionIndex < 0) return null;
	const threadId = activities[startIndex]!.nativeRefs.threadId;
	if (!threadId || activities[questionIndex]!.nativeRefs.threadId !== threadId) return null;
	const question = normalizedQuestion(activityText(activities[questionIndex]!.payload));
	if (!question) return null;
	const selected = activities.filter((activity, index) =>
		index === questionIndex || (index >= startIndex && index <= terminalIndex &&
			activity.nativeRefs.threadId === threadId && activity.nativeRefs.turnId === turnId));
	if (!selected.some((activity) => activity.payload.method === "turn/completed" && activity.phase === "completed")) return null;
	const sequences = selected.map((activity) => activity.sequence);
	if (sequences.some((sequence, index) => index > 0 && sequence <= sequences[index - 1]!)) return null;
	return { question, activities: selected };
}

function latestCompletedTurnNoteScope(activities: readonly ProjectActivity[]): CompletedTurnNoteScope | null {
	for (let index = activities.length - 1; index >= 0; index -= 1) {
		const activity = activities[index]!;
		if (activity.payload.method !== "turn/completed" || activity.phase !== "completed" || !activity.nativeRefs.turnId) continue;
		const scope = completedTurnNoteScope(activities, activity.nativeRefs.turnId);
		if (scope) return scope;
	}
	return null;
}

function exactCompletedTurnNoteScope(selected: readonly ProjectActivity[]): CompletedTurnNoteScope | null {
	const turnId = selected.at(-1)?.nativeRefs.turnId;
	if (!turnId) return null;
	const scope = completedTurnNoteScope([...selected].sort((left, right) => left.sequence - right.sequence), turnId);
	if (!scope || scope.activities.length !== selected.length ||
		scope.activities.some((activity, index) => activity.id !== selected[index]?.id)) return null;
	return scope;
}

function turnStartIndex(activities: readonly ProjectActivity[], turnId: string): number {
	let startIndex = -1;
	for (const [index, activity] of activities.entries()) {
		if (activity.nativeRefs.turnId === turnId &&
			(activity.payload.method === "turn/start" || activity.payload.method === "turn/started")) startIndex = index;
	}
	return startIndex;
}

function questionIndexForTurn(activities: readonly ProjectActivity[], startIndex: number, threadId?: string): number {
	if (!threadId) return -1;
	for (let index = startIndex - 1; index >= 0; index -= 1) {
		const activity = activities[index]!;
		if (activity.kind === "message" && activity.phase === "completed" &&
			activity.payload.direction === "outbound" && activity.nativeRefs.threadId === threadId) return index;
	}
	return -1;
}

function normalizedQuestion(text: string): string {
	const excerpt = sanitizeTerminalTextExcerpt(text, 800, "head-tail").trim().replace(/\s+/gu, " ");
	return sanitizeTNoteText(excerpt, 800);
}

function activityText(payload: Readonly<Record<string, unknown>>): string {
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

function record(value: unknown): Record<string, unknown> | null {
	return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

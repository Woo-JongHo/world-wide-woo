import { sanitizeTerminalTextExcerpt } from "../../domain/terminal";
import { isReasoningActivityPayload } from "../../domain/project-activity";

const MAX_TOTAL_TEXT_CHARS = 10_000;
const MAX_STRING_CHARS = 2_400;
const MAX_DEPTH = 5;
const MAX_COLLECTION_ITEMS = 40;
const MAX_TOTAL_ITEMS = 100;

export const PUBLIC_SOURCE_OMISSION = "… 공개 Source 일부 생략 …";

export interface BoundedPublicProjection {
	value: unknown;
	omitted: boolean;
}

interface ProjectionState {
	remainingChars: number;
	remainingItems: number;
	omitted: boolean;
}

function hiddenKey(key: string): boolean {
	const normalized = key.replace(/[-_]/gu, "").toLowerCase();
	return normalized.includes("reasoning")
		|| normalized.includes("thought")
		|| normalized.includes("analysis")
		|| normalized.startsWith("raw")
		|| normalized === "nativerefs"
		|| [
			"id",
			"threadid",
			"turnid",
			"itemid",
			"requestid",
			"approvalid",
			"callbackid",
			"processid",
			"commandid",
			"sessionid",
			"pluginid",
		].includes(normalized)
		|| normalized === "sourcedigest"
		|| normalized.endsWith("token")
		|| normalized.endsWith("secret")
		|| normalized.endsWith("password")
		|| normalized.endsWith("credential")
		|| normalized.endsWith("authorization")
		|| normalized.endsWith("apikey");
}

function cleanPublicText(value: string): string {
	return sanitizeTerminalTextExcerpt(value, MAX_STRING_CHARS, "head-tail").replace(/\t/gu, "    ");
}

function removeCutTokenFragments(head: string, tail: string): [string, string] {
	return [
		head.replace(/[A-Za-z0-9_+/=-]{12,}$/u, ""),
		tail.replace(/^[A-Za-z0-9_+/=-]{12,}/u, ""),
	];
}

function boundedString(value: string, state: ProjectionState): string {
	const available = Math.max(0, Math.min(MAX_STRING_CHARS, state.remainingChars));
	if (available === 0) {
		state.omitted = true;
		return "";
	}
	const safeValue = cleanPublicText(value);
	if (value.length > MAX_STRING_CHARS) state.omitted = true;
	let candidate: string;
	if (safeValue.length <= available) {
		candidate = safeValue;
	} else {
		state.omitted = true;
		const contentBudget = Math.max(0, available - PUBLIC_SOURCE_OMISSION.length - 2);
		const headLength = Math.ceil(contentBudget / 2);
		const tailLength = contentBudget - headLength;
		const [head, tail] = removeCutTokenFragments(
			safeValue.slice(0, headLength),
			tailLength > 0 ? safeValue.slice(-tailLength) : "",
		);
		candidate = `${head}\n${PUBLIC_SOURCE_OMISSION}\n${tail}`;
	}
	const cleaned = candidate.slice(0, available);
	state.remainingChars -= cleaned.length;
	return cleaned;
}

function project(value: unknown, state: ProjectionState, depth: number): unknown {
	if (value === null || typeof value === "boolean" || typeof value === "number") return value;
	if (typeof value === "string") return boundedString(value, state);
	if (depth >= MAX_DEPTH) {
		state.omitted = true;
		return "[요약 제한]";
	}
	if (state.remainingItems <= 0 || state.remainingChars <= 0) {
		state.omitted = true;
		return "[요약 제한]";
	}
	if (Array.isArray(value)) {
		const result: unknown[] = [];
		for (const item of value.slice(0, MAX_COLLECTION_ITEMS)) {
			if (state.remainingItems <= 0 || state.remainingChars <= 0) break;
			state.remainingItems -= 1;
			result.push(project(item, state, depth + 1));
		}
		if (result.length < value.length) state.omitted = true;
		return result;
	}
	if (!value || typeof value !== "object") return boundedString(String(value), state);
	if (isReasoningActivityPayload(value)) {
		state.omitted = true;
		return { classification: "reasoning", content: "[비공개 내용 생략]" };
	}

	const result: Record<string, unknown> = {};
	const entries = Object.entries(value as Readonly<Record<string, unknown>>);
	let accepted = 0;
	let visitedAll = true;
	for (const [key, item] of entries) {
		if (key.length > 120) {
			state.omitted = true;
			continue;
		}
		if (hiddenKey(key)) continue;
		if (accepted >= MAX_COLLECTION_ITEMS || state.remainingItems <= 0 || state.remainingChars <= 0) {
			state.omitted = true;
			visitedAll = false;
			break;
		}
		const boundedKey = key;
		state.remainingChars = Math.max(0, state.remainingChars - key.length);
		state.remainingItems -= 1;
		result[boundedKey] = project(item, state, depth + 1);
		accepted += 1;
	}
	if (!visitedAll) state.omitted = true;
	return result;
}

/**
 * Produces a secret-filtered, size-bounded UI projection before JSON serialization.
 * The input object is never mutated; durable journal payloads remain intact.
 */
export function boundedPublicProjection(value: unknown): BoundedPublicProjection {
	const state: ProjectionState = {
		remainingChars: MAX_TOTAL_TEXT_CHARS,
		remainingItems: MAX_TOTAL_ITEMS,
		omitted: false,
	};
	return { value: project(value, state, 0), omitted: state.omitted };
}

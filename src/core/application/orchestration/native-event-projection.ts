import type {
	NativeHarnessEvent,
	NativeRefs,
} from "../../domain/execution/native-session.js";
import {
	isReasoningActivityPayload,
	type ProjectActivityKind,
	type ProjectActivityPhase,
} from "../../domain/execution/project-activity.js";
import { sanitizeTerminalTextExcerpt, sanitizeTerminalTextUnbounded } from "../../domain/execution/terminal.js";

const JOURNAL_NATIVE_TEXT_CHARACTER_LIMIT = 32 * 1024;
const JOURNAL_NATIVE_MAX_DEPTH = 8;
const JOURNAL_NATIVE_MAX_ITEMS = 128;
const JOURNAL_NATIVE_MAX_COLLECTION_ITEMS = 64;
const JOURNAL_NATIVE_OMISSION = "[journal observation omitted]";
const REASONING_SUMMARY_CHARACTER_LIMIT = 16 * 1024 - 128;

interface JournalNativeProjectionState {
	remainingCharacters: number;
	remainingItems: number;
	omitted: boolean;
}

export type NativeEventDeltaProjection = {
	readonly type: "delta";
	readonly method: string;
	readonly refs: NativeRefs;
	readonly text: string;
	readonly channel: "assistant" | "reasoning" | "reasoning-summary" | "activity";
	readonly activityKind: ProjectActivityKind;
};

export type NativeEventProjection =
	| NativeEventDeltaProjection
	| {
		readonly type: "durable";
		readonly observation: {
			readonly kind: ProjectActivityKind;
			readonly phase: ProjectActivityPhase;
			readonly refs: NativeRefs;
			readonly payload: Readonly<Record<string, unknown>>;
		};
		readonly lifecycle: "started" | "terminal" | null;
		readonly assistantMessage: boolean;
	};

export function projectNativeEvent(event: NativeHarnessEvent): NativeEventProjection {
	if (event.type === "notification" && event.method.toLowerCase().includes("delta")) {
		const activityKind = nativeActivityKind(event.method, event.params);
		return {
			type: "delta",
			method: event.method,
			refs: event.refs,
			text: nativeEventText(event.params),
			channel: nativeDeltaChannel(event.method, activityKind),
			activityKind,
		};
	}

	const observation = nativeObservation(event);
	return {
		type: "durable",
		observation,
		lifecycle: event.type === "notification" ? nativeTurnLifecycle(event.method) : null,
		assistantMessage: event.type === "notification" && isAssistantMessageObservation(event, observation.kind),
	};
}

export function projectNativeEvidence(value: unknown): { readonly value: unknown; readonly omitted: boolean } {
	const state: JournalNativeProjectionState = {
		remainingCharacters: JOURNAL_NATIVE_TEXT_CHARACTER_LIMIT,
		remainingItems: JOURNAL_NATIVE_MAX_ITEMS,
		omitted: false,
	};
	return { value: projectJournalNativeValue(value, state, 0), omitted: state.omitted };
}

export function nativeTurnLifecycle(method: string): "started" | "terminal" | null {
	const normalized = method.toLowerCase();
	if (normalized === "turn/start" || normalized === "turn/started") return "started";
	if (normalized === "turn/completed" || normalized === "turn/interrupted" || normalized === "turn/failed" ||
		normalized === "turn/cancelled" || normalized === "turn/canceled") return "terminal";
	return null;
}

function nativeObservation(event: NativeHarnessEvent): Extract<NativeEventProjection, { type: "durable" }>["observation"] {
	if (event.type === "approval-requested") {
		const params = projectNativeEvidence(event.approval.params);
		return {
			kind: "approval",
			phase: "started",
			refs: event.approval.refs,
			payload: {
				eventType: event.type,
				approval: { ...event.approval, params: params.value },
				...(params.omitted ? { observationTruncated: true } : {}),
			},
		};
	}
	if (event.type === "approval-resolved") {
		return {
			kind: "approval",
			phase: "completed",
			refs: { ...event.refs, approvalRequestId: event.requestId },
			payload: { eventType: event.type, requestId: event.requestId },
		};
	}

	const rawPayload = { eventType: event.type, method: event.method, params: event.params };
	if (isReasoningActivityPayload(rawPayload)) {
		const publicSummary = nativeReasoningSummary(event.params);
		return {
			kind: nativeActivityKind(event.method, event.params),
			phase: nativeActivityPhase(event.method, event.params),
			refs: event.refs,
			payload: {
				eventType: event.type,
				method: event.method,
				classification: "reasoning",
				redacted: true,
				...(publicSummary ? { publicSummary } : {}),
			},
		};
	}

	const kind = nativeActivityKind(event.method, event.params);
	const publicMessage = kind === "message" ? nativeEventText(event.params) : "";
	const params = projectNativeEvidence(event.params);
	return {
		kind,
		phase: nativeActivityPhase(event.method, event.params),
		refs: event.refs,
		payload: {
			eventType: event.type,
			method: event.method,
			params: params.value,
			...(publicMessage ? { text: sanitizeTerminalTextUnbounded(publicMessage) } : {}),
			...(params.omitted ? { observationTruncated: true } : {}),
		},
	};
}

function nativeReasoningSummary(params: Readonly<Record<string, unknown>>): string {
	const item = record(params.item);
	if (String(item?.type ?? "").toLowerCase() !== "reasoning") return "";
	const summary = item?.summary;
	const text = typeof summary === "string"
		? summary
		: Array.isArray(summary) && summary.every((part) => typeof part === "string")
			? summary.join("\n")
			: "";
	return text
		? sanitizeTerminalTextExcerpt(text, REASONING_SUMMARY_CHARACTER_LIMIT, "head-tail").trim()
		: "";
}

function nativeDeltaChannel(
	method: string,
	activityKind: ProjectActivityKind,
): NativeEventDeltaProjection["channel"] {
	const normalized = method.toLowerCase();
	if (normalized.includes("reasoning/summarytextdelta")) return "reasoning-summary";
	if (normalized.includes("reasoning")) return "reasoning";
	return activityKind === "message" ? "assistant" : "activity";
}

function nativeActivityKind(method: string, params: Readonly<Record<string, unknown>>): ProjectActivityKind {
	const normalized = method.toLowerCase();
	const itemType = String(record(params.item)?.type ?? "").toLowerCase();
	const itemScoped = normalized.startsWith("item/");
	if (itemType.includes("message") || itemScoped && normalized.includes("message")) return "message";
	if (itemType.includes("command") || itemType.includes("tool") || itemType.includes("mcp") ||
		itemScoped && (normalized.includes("command") || normalized.includes("tool") || normalized.includes("mcp"))) return "tool";
	if (itemType.includes("file") || itemScoped && normalized.includes("file")) return "file-change";
	if (normalized.includes("approval")) return "approval";
	return "progress";
}

function nativeActivityPhase(method: string, params?: Readonly<Record<string, unknown>>): ProjectActivityPhase {
	const normalized = method.toLowerCase();
	if (normalized === "turn/completed") {
		const turn = record(params?.turn);
		const status = typeof turn?.status === "string" ? turn.status : record(turn?.status)?.type;
		const nativeStatus = typeof status === "string" ? status.replace(/[-_]/gu, "").toLowerCase() : "";
		if (nativeStatus === "failed" || nativeStatus === "errored" || nativeStatus === "error") return "failed";
		if (nativeStatus === "cancelled" || nativeStatus === "canceled" || nativeStatus === "interrupted") return "cancelled";
	}
	if (normalized === "item/completed") {
		const item = record(params?.item);
		const status = String(item?.status ?? "").toLowerCase();
		if (["failed", "error", "errored"].includes(status)
			|| item?.type === "commandExecution" && typeof item.exitCode === "number" && item.exitCode !== 0) return "failed";
		if (["cancelled", "canceled", "interrupted"].includes(status)) return "cancelled";
	}
	if (normalized.includes("failed") || normalized.includes("error")) return "failed";
	if (normalized.includes("cancelled") || normalized.includes("canceled") || normalized.includes("interrupted")) return "cancelled";
	if (normalized.includes("completed") || normalized.includes("finished")) return "completed";
	if (normalized.includes("started")) return "started";
	return "updated";
}

function isAssistantMessageObservation(
	event: Extract<NativeHarnessEvent, { type: "notification" }>,
	kind: ProjectActivityKind,
): boolean {
	if (kind !== "message") return false;
	const itemType = String(record(event.params.item)?.type ?? "").replace(/[-_]/gu, "").toLowerCase();
	return itemType === "agentmessage" || event.method.toLowerCase().startsWith("item/agentmessage/");
}

function nativeEventText(params: Readonly<Record<string, unknown>>): string {
	const item = record(params.item);
	for (const candidate of [params.text, params.message, params.delta, item?.text, item?.content]) {
		if (typeof candidate === "string") return candidate;
	}
	return "";
}

function projectJournalNativeValue(value: unknown, state: JournalNativeProjectionState, depth: number): unknown {
	if (value === null || typeof value === "boolean" || typeof value === "number") return value;
	if (typeof value === "string") {
		const available = Math.max(0, state.remainingCharacters);
		if (available === 0) {
			state.omitted = true;
			return JOURNAL_NATIVE_OMISSION;
		}
		const projected = sanitizeTerminalTextExcerpt(value, available, "head-tail");
		state.remainingCharacters = Math.max(0, state.remainingCharacters - projected.length);
		if (value.length > available) state.omitted = true;
		return projected;
	}
	if (depth >= JOURNAL_NATIVE_MAX_DEPTH || state.remainingItems <= 0) {
		state.omitted = true;
		return JOURNAL_NATIVE_OMISSION;
	}
	if (Array.isArray(value)) {
		const projected: unknown[] = [];
		for (const item of value.slice(0, JOURNAL_NATIVE_MAX_COLLECTION_ITEMS)) {
			if (state.remainingItems <= 0) break;
			state.remainingItems -= 1;
			projected.push(projectJournalNativeValue(item, state, depth + 1));
		}
		if (projected.length < value.length) state.omitted = true;
		return projected;
	}
	const source = record(value);
	if (!source) return sanitizeTerminalTextExcerpt(String(value), Math.max(0, state.remainingCharacters), "head-tail");
	const entries = Object.entries(source)
		.sort(([left], [right]) => journalNativeFieldPriority(left) - journalNativeFieldPriority(right));
	const projected: Record<string, unknown> = {};
	let accepted = 0;
	for (const [key, item] of entries) {
		if (key.length > 200) {
			state.omitted = true;
			continue;
		}
		if (accepted >= JOURNAL_NATIVE_MAX_COLLECTION_ITEMS || state.remainingItems <= 0) {
			state.omitted = true;
			break;
		}
		state.remainingItems -= 1;
		state.remainingCharacters = Math.max(0, state.remainingCharacters - key.length);
		projected[key] = projectJournalNativeValue(item, state, depth + 1);
		accepted += 1;
	}
	return projected;
}

function journalNativeFieldPriority(key: string): number {
	const normalized = key.replace(/[-_]/gu, "").toLowerCase();
	return ["text", "content", "output", "aggregatedoutput", "stdout", "stderr", "result", "diff", "delta", "message"]
		.includes(normalized) ? 1 : 0;
}

function record(value: unknown): Record<string, unknown> | null {
	return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

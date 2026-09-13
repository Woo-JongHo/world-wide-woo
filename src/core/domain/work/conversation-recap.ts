import { sanitizeTerminalTextUnbounded } from "../execution/terminal.js";
import { sanitizePartialAssistantResponse } from "../review/redaction.js";
import type { WorkbenchChatMessage } from "./workbench.js";

export const CONVERSATION_RECAP_MAX_ENTRIES = 6;
export const CONVERSATION_RECAP_MAX_ENTRY_CODE_POINTS = 280;
export const CONVERSATION_RECAP_MAX_TOTAL_CODE_POINTS = 1_400;

export interface ConversationRecapEntry {
	readonly role: "user" | "assistant";
	readonly text: string;
}

export interface ConversationRecap {
	readonly entries: readonly ConversationRecapEntry[];
	readonly sourceMessageCount: number;
	readonly omittedMessageCount: number;
	readonly truncated: boolean;
}

interface PublicMessage {
	readonly role: "user" | "assistant";
	readonly text: string;
}

/**
 * Builds an ephemeral, extractive recap from the native public chat projection.
 * It cannot inspect activities, reasoning, tool payloads, or provider history.
 */
export function projectConversationRecap(
	messages: readonly WorkbenchChatMessage[],
): ConversationRecap {
	const publicMessages = messages.flatMap(publicMessage);
	const selected = publicMessages.length <= CONVERSATION_RECAP_MAX_ENTRIES
		? publicMessages
		: [publicMessages[0]!, ...publicMessages.slice(-(CONVERSATION_RECAP_MAX_ENTRIES - 1))];
	const entries: ConversationRecapEntry[] = [];
	let remaining = CONVERSATION_RECAP_MAX_TOTAL_CODE_POINTS;
	let clipped = false;
	for (const [index, message] of selected.entries()) {
		if (remaining <= 0) break;
		const messagesLeft = selected.length - index;
		const fairShare = Math.floor(remaining / messagesLeft);
		const limit = Math.min(CONVERSATION_RECAP_MAX_ENTRY_CODE_POINTS, fairShare);
		const excerpt = takeCodePoints(message.text, limit);
		if (codePointLength(message.text) > limit) clipped = true;
		if (!excerpt) continue;
		entries.push(Object.freeze({ role: message.role, text: excerpt }));
		remaining -= codePointLength(excerpt);
	}
	const omittedMessageCount = publicMessages.length - entries.length;
	return Object.freeze({
		entries: Object.freeze(entries),
		sourceMessageCount: publicMessages.length,
		omittedMessageCount,
		truncated: clipped || omittedMessageCount > 0,
	});
}

function publicMessage(message: WorkbenchChatMessage): readonly PublicMessage[] {
	if (message.role !== "user" && message.role !== "assistant") return [];
	if (typeof message.content !== "string") return [];
	const publicContent = message.role === "assistant"
		? sanitizePartialAssistantResponse(message.content)
		: message.content;
	const text = sanitizeTerminalTextUnbounded(publicContent).replace(/\s+/gu, " ").trim();
	return text ? [{ role: message.role, text }] : [];
}

function codePointLength(value: string): number {
	return Array.from(value).length;
}

function takeCodePoints(value: string, maximum: number): string {
	const points = Array.from(value);
	if (points.length <= maximum) return value;
	if (maximum <= 1) return "…".slice(0, maximum);
	return `${points.slice(0, maximum - 1).join("")}…`;
}

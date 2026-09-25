import type { AssistantMessage, Context, ToolCall } from "@earendil-works/pi-ai";
import type { SessionEvent }                        from "@/core/domain/execution/session-events";
import type { ToolResultSnapshot }                  from "@/core/domain/execution/output";
import type { WorkNarration }                       from "@/core/domain/work/narration";
import type { ConversationTurn }                    from "@/core/application/session/session-contracts";
import {
	assistantMessageText,
	storedAssistantMessage,
	storedNarration,
	storedToolResult,
	storedToolSnapshot,
} from "@/core/application/session/session-event-codec";

export interface ReplayedSession {
	turns               : ConversationTurn[]   ;
	messages            : Context["messages"]  ;
	toolExecutions      : ToolResultSnapshot[] ;
	narrations          : WorkNarration[]      ;
	narratedToolCallIds : Set<string>          ;
	error               : string | null        ;
}

export function replaySessionEvents(sessionId: string, events: readonly SessionEvent[]): ReplayedSession {
	const turns          : ConversationTurn[]                                      = []                ;
	const messages       : Context["messages"]                                     = []                ;
	const toolExecutions : ToolResultSnapshot[]                                    = []                ;
	const narrations     : WorkNarration[]                                         = []                ;
	const narratedToolCallIds                                                      = new Set<string>() ;
	const openTurns                                                                = new Set<string>() ;
	const toolGroups     : Array<{ message: AssistantMessage; callIds: string[] }> = []                ;
	const completedToolCalls                                                       = new Set<string>() ;
	const narratedSteps                                                            = new Set<number>() ;

	for (const event of events) {
		if (event.type === "narration.recorded") {
			const narration = storedNarration(event, narrations.length + 1);
			if (narratedToolCallIds.has(narration.toolCallId)) { throw new Error(`세션 ${sessionId}에 중복된 도구 호출 작업 설명이 있습니다: ${narration.toolCallId}`);}
			if (narratedSteps.has(narration.step)) 			   { throw new Error(`세션 ${sessionId}에 중복된 작업 설명 단계가 있습니다: ${narration.step}`);  		  }
			if (narration.step !== narrations.length + 1)      { throw new Error(`세션 ${sessionId}의 작업 설명 단계 순서가 올바르지 않습니다: ${narration.step}`);     }
			narratedToolCallIds.add (narration.toolCallId);
			narratedSteps.add		(narration.step);
			narrations.push			(narration);
		}
		if (event.type === "turn.started" && event.turnId) openTurns.add(event.turnId);
		if (event.type === "turn.completed" && event.turnId) openTurns.delete(event.turnId);
		if (event.type === "message.user") {
			const timestamp = Date.parse(event.timestamp);
			turns.push({ id: event.itemId ?? event.id, role: "user", content: event.body, timestamp });
			if (event.metadata.source !== "terminal") messages.push({ role: "user", content: event.body, timestamp });
		}
		if (event.type === "message.assistant.completed") {
			const message = storedAssistantMessage(event);
			if (!message) throw new Error(`세션 ${sessionId}의 ${event.sequence}번 응답을 복원할 수 없습니다.`);
			messages.push(message);
			const callIds = message.content
				.filter((item): item is ToolCall => item.type === "toolCall")
				.map(call => call.id);
			if (callIds.length > 0) toolGroups.push({ message, callIds });
			const content = assistantMessageText(message);
			if (content.trim()) {
				turns.push({
					id: event.itemId ?? event.id,
					role: "assistant",
					content,
					timestamp: message.timestamp,
					outcome: "completed",
				});
			}
		}
		if (event.type === "command.completed") {
			const snapshot = storedToolSnapshot(event);
			const message = storedToolResult(event);
			if (snapshot) toolExecutions.push(snapshot);
			if (message) {
				completedToolCalls.add(message.toolCallId);
				messages.push(message);
			}
		}
		if (event.type === "message.assistant.cancelled" && event.body.trim()) {
			turns.push({
				id        : event.itemId ?? event.id,
				role      : "assistant",
				content   : event.body,
				timestamp : Date.parse(event.timestamp),
				outcome   : "cancelled",
			});
		}
	}

	const invalidGroups   = toolGroups.filter(group => group.callIds.some(id => !completedToolCalls.has(id))) ;
	const invalidCalls    = new Set(invalidGroups.flatMap(group => group.callIds))                            ;
	const invalidMessages = new Set(invalidGroups.map(group => group.message))                                ;
	if (invalidCalls.size > 0) {
		const retainedMessages = messages.filter(message =>
			message.role === "assistant" ? !invalidMessages.has(message) :
				message.role !== "toolResult" || !invalidCalls.has(message.toolCallId),
		);
		messages.splice(0, messages.length, ...retainedMessages);
		const retainedSnapshots = toolExecutions.filter(snapshot => !invalidCalls.has(snapshot.id));
		toolExecutions.splice(0, toolExecutions.length, ...retainedSnapshots);
	}

	return {
		turns,
		messages,
		toolExecutions,
		narrations,
		narratedToolCallIds,
		error: openTurns.size > 0
			? "이전 실행에서 완료되지 않은 턴이 있습니다. 기록은 보존되었으며 새 메시지로 계속할 수 있습니다."
			: null,
	};
}

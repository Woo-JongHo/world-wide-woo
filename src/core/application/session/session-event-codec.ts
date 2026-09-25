import type { AssistantMessage, ToolCall, ToolResultMessage } from "@earendil-works/pi-ai";
import type { SessionEvent }                                  from "@/core/domain/execution/session-events";
import type {
	CommandResultSnapshot,
	GenericToolResultSnapshot,
	ToolResultSnapshot,
} from "@/core/domain/execution/output";
import { isPublicNarrationText }                              from "@/core/domain/work/narration";
import type { WorkNarration }                                 from "@/core/domain/work/narration";

export function assistantMessageText(message: AssistantMessage): string {
	return message.content
		.filter((block) => block.type === "text")
		.map((block) => block.text)
		.join("");
}

export function storedAssistantMessage(event: SessionEvent): AssistantMessage | null {
	const message = event.metadata.message;
	if (!message || typeof message !== "object" || (message as { role?: unknown }).role !== "assistant") return null;
	const content = (message as { content?: unknown }).content;
	return Array.isArray(content) ? message as AssistantMessage : null;
}

export function sessionErrorMessage(error: unknown): string {
	const raw = error instanceof Error ? error.message : String(error);
	const unconfigured = /^Provider is not configured: (.+)$/u.exec(raw);
	if (!unconfigured) return raw;
	const provider = unconfigured[1] ?? "선택한";
	const variable = { openai: "OPENAI_API_KEY", anthropic: "ANTHROPIC_API_KEY", google: "GEMINI_API_KEY" }[provider];
	return variable
		? `${provider} 인증이 설정되지 않았습니다. ${variable} 환경 변수 또는 WWW 인증 저장소를 설정하세요.`
		: `${provider} 공급자 인증이 설정되지 않았습니다.`;
}

export function displaySafe(value: unknown): string {
	let text: string;
	try {
		text = typeof value === "string" ? value : JSON.stringify(value);
	} catch {
		text = "[표시할 수 없는 입력]";
	}
	return text
		.replace(/\u001B(?:\[[0-?]*[ -/]*[@-~]|\][^\u0007]*(?:\u0007|\u001B\\))/gu, "")
		.replace(/[\u0000-\u0008\u000B-\u001F\u007F-\u009F]/gu, "")
		.replace(/\bsk-[A-Za-z0-9_-]{8,}\b/gu, "[REDACTED]")
		.replace(/\b(?:ghp_|gho_|github_pat_)[A-Za-z0-9_]{8,}\b/gu, "[REDACTED]")
		.replace(/("?(?:authorization|api[_-]?key|token|password)"?\s*[:=]\s*"?)[^"\s,}\]]+/giu, "$1[REDACTED]");
}

export function runningToolSnapshot(toolCall: ToolCall, cwd: string, startedAt: number): ToolResultSnapshot {
	if (toolCall.name === "bash") {
		const command = typeof toolCall.arguments.command === "string" ? toolCall.arguments.command : "bash";
		const args = Array.isArray(toolCall.arguments.args)
			? toolCall.arguments.args.filter((value): value is string => typeof value === "string")
			: [];
		return {
			id      : toolCall.id,
			shell   : "bash",
			command : [command, ...args].map(displaySafe).join(" "),
			cwd,
			status : "running",
			stdout : "",
			stderr : "",
			startedAt,
			durationMs: undefined,
			exitCode: undefined,
		};
	}
	return {
		id       : toolCall.id,
		toolName : toolCall.name,
		status   : "running",
		input    : displaySafe(toolCall.arguments),
		output   : "",
		startedAt,
		durationMs: undefined,
		error: undefined,
	};
}

export function storedToolResult(event: SessionEvent): ToolResultMessage | null {
	const value = event.metadata.message;
	if (!value || typeof value !== "object" || Array.isArray(value)) return null;
	const message = value as Partial<ToolResultMessage>;
	return message.role === "toolResult" &&
		typeof message.toolCallId === "string" &&
		typeof message.toolName === "string" &&
		Array.isArray(message.content) &&
		typeof message.isError === "boolean" &&
		typeof message.timestamp === "number"
		? message as ToolResultMessage
		: null;
}

export function storedToolSnapshot(event: SessionEvent): ToolResultSnapshot | null {
	const value = event.metadata.snapshot;
	if (!value || typeof value !== "object" || Array.isArray(value)) return null;
	const snapshot = value as Partial<ToolResultSnapshot>;
	if (typeof snapshot.id !== "string" || typeof snapshot.status !== "string") return null;
	if ("shell" in snapshot && snapshot.shell === "bash") return snapshot as CommandResultSnapshot;
	if ("toolName" in snapshot && typeof snapshot.toolName === "string") return snapshot as GenericToolResultSnapshot;
	return null;
}

export function storedNarration(event: SessionEvent, legacyStep: number): WorkNarration {
	const value = event.metadata.narration;
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		throw new Error(`세션 ${event.sessionId}의 ${event.sequence}번 작업 설명을 복원할 수 없습니다.`);
	}
	const narration   = value as Partial<WorkNarration>                           ;
	const keys        = Object.keys(narration).sort()                             ;
	const legacyKeys  = "id,label,timestamp,toolCallId,turnId"                    ;
	const currentKeys = "action,id,label,reason,step,timestamp,toolCallId,turnId" ;
	const validBase = typeof narration.id === "string" && !!narration.id &&
		typeof narration.turnId === "string" && !!narration.turnId &&
		typeof narration.toolCallId === "string" && !!narration.toolCallId &&
		typeof narration.timestamp === "string" && !Number.isNaN(Date.parse(narration.timestamp)) &&
		typeof narration.label === "string" &&
		event.turnId === narration.turnId &&
		event.itemId === narration.toolCallId;
	if (
		Object.keys(event.metadata).length !== 1 ||
		!("narration" in event.metadata) ||
		!validBase ||
		(keys.join(",") !== legacyKeys && (
			keys.join(",") !== currentKeys ||
			typeof narration.step !== "number" || !Number.isSafeInteger(narration.step) || narration.step < 1 ||
			typeof narration.action !== "string" || !narration.action || !isPublicNarrationText(narration.action, 100) ||
			typeof narration.reason !== "string" || !narration.reason || !isPublicNarrationText(narration.reason, 160)
		))
	) {
		throw new Error(`세션 ${event.sessionId}의 ${event.sequence}번 작업 설명 메타데이터가 올바르지 않습니다.`);
	}
	if (keys.join(",") === legacyKeys) {
		return {
			...narration,
			step   : legacyStep,
			action : narration.label,
			reason : "요청된 도구 실행",
		} as WorkNarration;
	}
	return narration as WorkNarration;
}

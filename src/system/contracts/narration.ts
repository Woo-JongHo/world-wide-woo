export interface WorkNarration {
	id: string;
	turnId: string;
	toolCallId: string;
	timestamp: string;
	label: string;
	step: number;
	action: string;
	reason: string;
}

const CONTROL_OR_ANSI = /\u001B(?:\[[0-?]*[ -/]*[@-~]|\][\s\S]*?(?:\u0007|\u001B\\))|[\u0000-\u0008\u000B-\u001F\u007F-\u009F]/gu;
const SECRET_VALUE = /((?:--)?(?:authorization|api[_-]?key|token|password|secret)\s*(?:=|:)\s*|(?:--)?(?:authorization|api[_-]?key|token|password|secret)\s+)(?:Bearer\s+)?(?:"[^"]*"|'[^']*'|[^\s,;"']+)/giu;
const JSON_SECRET = /("(?:authorization|api[_-]?key|token|password|secret)"\s*:\s*)("[^"]*"|'[^']*'|[^,}\]\s]+)/giu;

function value(arguments_: Record<string, unknown>, key: string): string {
	const candidate = arguments_[key];
	return typeof candidate === "string" ? candidate : "";
}

function safe(value_: string, limit = 100): string {
	const sanitized = value_
		.replace(CONTROL_OR_ANSI, "")
		.replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/giu, "Bearer [REDACTED]")
		.replace(/\bsk-[A-Za-z0-9_-]{8,}\b/gu, "[REDACTED]")
		.replace(/\b(?:ghp_|gho_|github_pat_)[A-Za-z0-9_]{8,}\b/gu, "[REDACTED]")
		.replace(/\bAIza[A-Za-z0-9_-]{20,}\b/gu, "[REDACTED]")
		.replace(/\bAKIA[A-Z0-9]{16}\b/gu, "[REDACTED]")
		.replace(JSON_SECRET, "$1[REDACTED]")
		.replace(SECRET_VALUE, "$1[REDACTED]");
	return Array.from(sanitized).slice(0, limit).join("");
}

export function isPublicNarrationText(value_: string, limit: number): boolean {
	return value_ === safe(value_, limit);
}

export function workNarrationLabel(name: string, arguments_: Record<string, unknown>): string {
	let label: string;
	switch (name) {
		case "read":
			label = `파일 확인 · ${value(arguments_, "path")}`;
			break;
		case "search":
			label = `코드 검색 · ${value(arguments_, "pattern")}`;
			break;
		case "bash": {
			const command = value(arguments_, "command");
			const args = Array.isArray(arguments_.args)
				? arguments_.args.filter((argument): argument is string => typeof argument === "string")
				: [];
			label = `명령 실행 · ${[command, ...args].filter(Boolean).join(" ")}`;
			break;
		}
		case "ssh_config":
			label = `SSH 설정 확인 · ${value(arguments_, "host")}`;
			break;
		case "todo_write":
			label = `Todo 갱신 · ${value(arguments_, "operation")}`;
			break;
		default:
			label = `${name} 실행`;
	}
	return safe(label);
}

export function workNarrationReason(name: string, arguments_: Record<string, unknown>): string {
	const explicit = value(arguments_, "reason");
	if (explicit) return safe(explicit, 160);
	switch (name) {
		case "read":
			return "필요한 파일 내용을 확인";
		case "search":
			return "관련 구현 위치 탐색";
		case "bash":
			return "실제 상태 확인";
		case "ssh_config":
			return "연결 설정 확인";
		case "todo_write":
			return "실행 계획과 상태 일치";
		default:
			return "요청된 도구 실행";
	}
}

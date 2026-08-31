export interface WorkNarration {
	id: string;
	turnId: string;
	toolCallId: string;
	timestamp: string;
	label: string;
}

const CONTROL_OR_ANSI = /\u001B(?:\[[0-?]*[ -/]*[@-~]|\][\s\S]*?(?:\u0007|\u001B\\))|[\u0000-\u0008\u000B-\u001F\u007F-\u009F]/gu;
const SECRET_VALUE = /((?:--)?(?:authorization|api[_-]?key|token|password|secret)\s*(?:=|:)\s*|(?:--)?(?:authorization|api[_-]?key|token|password|secret)\s+)(?:Bearer\s+)?(?:"[^"]*"|'[^']*'|\S+)/giu;
const JSON_SECRET = /("(?:authorization|api[_-]?key|token|password|secret)"\s*:\s*)("[^"]*"|'[^']*'|[^,}\]\s]+)/giu;

function value(arguments_: Record<string, unknown>, key: string): string {
	const candidate = arguments_[key];
	return typeof candidate === "string" ? candidate : "";
}

function safe(value_: string): string {
	const sanitized = value_
		.replace(CONTROL_OR_ANSI, "")
		.replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/giu, "Bearer [REDACTED]")
		.replace(/\bsk-[A-Za-z0-9_-]{8,}\b/gu, "[REDACTED]")
		.replace(/\b(?:ghp_|gho_|github_pat_)[A-Za-z0-9_]{8,}\b/gu, "[REDACTED]")
		.replace(/\bAIza[A-Za-z0-9_-]{20,}\b/gu, "[REDACTED]")
		.replace(/\bAKIA[A-Z0-9]{16}\b/gu, "[REDACTED]")
		.replace(JSON_SECRET, "$1[REDACTED]")
		.replace(SECRET_VALUE, "$1[REDACTED]");
	return Array.from(sanitized).slice(0, 100).join("");
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

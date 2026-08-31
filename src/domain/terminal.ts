export interface TerminalCommandUpdate {
	stdout: string;
	stderr: string;
}

export interface TerminalCommandResult extends TerminalCommandUpdate {
	exitCode: number | null;
	durationMs: number;
	cancelled: boolean;
	timedOut: boolean;
}

const TRUNCATION_MARKER = "…[output truncated]\n";

function redactTerminalSecrets(value: string): string {
	return value
		.replace(/-----BEGIN [^-]*(?:PRIVATE KEY|OPENSSH PRIVATE KEY)-----[\s\S]*?-----END [^-]*(?:PRIVATE KEY|OPENSSH PRIVATE KEY)-----/giu, "[private key redacted]")
		.replace(/\b([a-z][a-z0-9+.-]*:\/\/)[^/\s:@]+:[^@\s/]+@/giu, "$1[redacted]@")
		.replace(/\b(authorization)\s*[:=]\s*(?:bearer\s+)?(?:"[^"]*"|'[^']*'|[^\s,;"']+)/giu, "$1: [redacted]")
		.replace(/\bbearer\s+(?:"[^"]*"|'[^']*'|[^\s,;"']+)/giu, "Bearer [redacted]")
		.replace(/\b([A-Za-z0-9_]*(?:token|password|secret|credential|api[ _-]?key)[A-Za-z0-9_]*)\s*[:=]\s*(?:"[^"]*"|'[^']*'|[^\s,;"']+)/giu, "$1=[redacted]")
		.replace(/\bsk-[A-Za-z0-9_-]+\b/gu, "[redacted]")
		.replace(/\b(?:gh[pousr]_[A-Za-z0-9_]+|github_pat_[A-Za-z0-9_]+)\b/giu, "[redacted]")
		.replace(/\bAIza[0-9A-Za-z_-]{20,}\b/gu, "[redacted]")
		.replace(/\bAKIA[0-9A-Z]{16}\b/gu, "[redacted]")
		.replace(/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/gu, "[redacted]");
}

/** Removes terminal control sequences and credentials while retaining readable whitespace. */
export function sanitizeTerminalText(value: string, maxCodePoints: number): string {
	const withoutControls = value
		.replace(/\x1b\][\s\S]*?(?:\x07|\x1b\\)/gu, "")
		.replace(/\x1b\[[0-?]*[ -/]*[@-~]/gu, "")
		.replace(/\x1b[()][0-2AB]/gu, "")
		.replace(/\x1b./gu, "")
		.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/gu, "");
	const redacted = redactTerminalSecrets(withoutControls);
	const characters = Array.from(redacted);
	if (characters.length <= maxCodePoints) return redacted;
	const marker = Array.from(TRUNCATION_MARKER);
	if (maxCodePoints <= marker.length) return marker.slice(0, Math.max(0, maxCodePoints)).join("");
	return `${TRUNCATION_MARKER}${characters.slice(-(maxCodePoints - marker.length)).join("")}`;
}

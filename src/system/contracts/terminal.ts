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
const BOUNDARY_CONTEXT_CODE_POINTS = 512;

export type TerminalTextExcerptMode = "head" | "tail" | "head-tail";

function codePointLength(value: string): number {
	let count = 0;
	for (let index = 0; index < value.length; count += 1) {
		const codePoint = value.codePointAt(index);
		index += codePoint && codePoint > 0xffff ? 2 : 1;
	}
	return count;
}

function takeHeadCodePoints(value: string, maximum: number): string {
	if (maximum <= 0 || value.length === 0) return "";
	let index = 0;
	let count = 0;
	while (index < value.length && count < maximum) {
		const codePoint = value.codePointAt(index);
		index += codePoint && codePoint > 0xffff ? 2 : 1;
		count += 1;
	}
	return value.slice(0, index);
}

function takeTailCodePoints(value: string, maximum: number): string {
	if (maximum <= 0 || value.length === 0) return "";
	let index = value.length;
	let count = 0;
	while (index > 0 && count < maximum) {
		index -= 1;
		if (index > 0) {
			const codeUnit = value.charCodeAt(index);
			const previous = value.charCodeAt(index - 1);
			if (codeUnit >= 0xdc00 && codeUnit <= 0xdfff && previous >= 0xd800 && previous <= 0xdbff) index -= 1;
		}
		count += 1;
	}
	return value.slice(index);
}

function discardCutTailToken(value: string): string {
	return value.replace(/^\S+/u, "");
}

function redactTerminalSecrets(value: string): string {
	return value
		.replace(/-----BEGIN [^-]*(?:PRIVATE KEY|OPENSSH PRIVATE KEY)-----[\s\S]*?(?:-----END [^-]*(?:PRIVATE KEY|OPENSSH PRIVATE KEY)-----|$)/giu, "[private key redacted]")
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

/** Removes terminal control sequences and credentials without changing content length policy. */
export function sanitizeTerminalTextUnbounded(value: string): string {
	const withoutControls = value
		.replace(/\x1b\][\s\S]*?(?:\x07|\x1b\\|$)/gu, "")
		.replace(/\x1b\[[0-?]*[ -/]*[@-~]/gu, "")
		.replace(/\x1b\[[0-?]*[ -/]*$/gu, "")
		.replace(/\x1b[()][0-2AB]/gu, "")
		.replace(/\x1b./gu, "")
		.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/gu, "");
	return redactTerminalSecrets(withoutControls);
}

/**
 * Sanitizes only a small excerpt of untrusted terminal text. The bounded context on
 * each retained edge keeps an escape or credential that crosses an excerpt boundary
 * from being rendered as plain text. Callers that need their own omission marker can
 * use this and apply their final layout bound afterwards.
 */
export function sanitizeTerminalTextExcerpt(
	value: string,
	maxCodePoints: number,
	mode: TerminalTextExcerptMode = "tail",
): string {
	if (maxCodePoints <= 0) return "";
	if (value.length <= maxCodePoints && codePointLength(value) <= maxCodePoints) {
		return sanitizeTerminalTextUnbounded(value);
	}
	const markerLength = codePointLength(TRUNCATION_MARKER);
	if (maxCodePoints <= markerLength) return takeHeadCodePoints(TRUNCATION_MARKER, maxCodePoints);
	const contentBudget = maxCodePoints - markerLength;
	if (mode === "head") {
		const safeHead = sanitizeTerminalTextUnbounded(takeHeadCodePoints(value, contentBudget + BOUNDARY_CONTEXT_CODE_POINTS));
		return `${takeHeadCodePoints(safeHead, contentBudget)}${TRUNCATION_MARKER}`;
	}
	if (mode === "tail") {
		const rawTail = takeTailCodePoints(value, contentBudget + BOUNDARY_CONTEXT_CODE_POINTS);
		const tailWasCut = rawTail.length < value.length;
		const safeTail = sanitizeTerminalTextUnbounded(rawTail);
		const visibleTail = tailWasCut ? discardCutTailToken(safeTail) : safeTail;
		return `${TRUNCATION_MARKER}${takeTailCodePoints(visibleTail, contentBudget)}`;
	}
	const headBudget = Math.ceil(contentBudget / 2);
	const tailBudget = contentBudget - headBudget;
	const safeHead = sanitizeTerminalTextUnbounded(takeHeadCodePoints(value, headBudget + BOUNDARY_CONTEXT_CODE_POINTS));
	const rawTail = takeTailCodePoints(value, tailBudget + BOUNDARY_CONTEXT_CODE_POINTS);
	const tailWasCut = rawTail.length < value.length;
	const safeTail = sanitizeTerminalTextUnbounded(rawTail);
	const visibleTail = tailWasCut ? discardCutTailToken(safeTail) : safeTail;
	return `${takeHeadCodePoints(safeHead, headBudget)}${TRUNCATION_MARKER}${takeTailCodePoints(visibleTail, tailBudget)}`;
}

/** Removes terminal control sequences and credentials while retaining readable whitespace. */
export function sanitizeTerminalText(value: string, maxCodePoints: number): string {
	return sanitizeTerminalTextExcerpt(value, maxCodePoints, "tail");
}

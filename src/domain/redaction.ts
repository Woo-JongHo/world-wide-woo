export type ReviewSensitiveKind = "secret" | "credential" | "local-path" | "customer-identifier";

export interface ReviewRedactionFinding {
	readonly kind: ReviewSensitiveKind;
	readonly replacement: string;
}

export interface ReviewRedactionResult {
	readonly text: string;
	readonly findings: readonly ReviewRedactionFinding[];
}

const SECRET_PATTERNS: readonly RegExp[] = [
	/-----BEGIN [^-]*(?:PRIVATE KEY|OPENSSH PRIVATE KEY)-----[\s\S]*?-----END [^-]*(?:PRIVATE KEY|OPENSSH PRIVATE KEY)-----/giu,
	/\b(?:authorization)\s*[:=]\s*(?:bearer\s+)?(?:"[^"]*"|'[^']*'|[^\s,;"']+)/giu,
	/\bbearer\s+(?:"[^"]*"|'[^']*'|[^\s,;"']+)/giu,
	/\b([A-Za-z0-9_]*(?:token|password|secret|credential|api[ _-]?key)[A-Za-z0-9_]*)\s*[:=]\s*(?:"[^"]*"|'[^']*'|[^\s,;"']+)/giu,
	/\b(?:sk-[A-Za-z0-9_-]+|gh[pousr]_[A-Za-z0-9_]+|github_pat_[A-Za-z0-9_]+|AIza[0-9A-Za-z_-]{20,}|AKIA[0-9A-Z]{16})\b/gu,
	/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/gu,
];

const LOCAL_PATH_PATTERNS: readonly RegExp[] = [
	/(?:file:\/\/\/|~\/|\.\.?\/|\/[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._@ -]+)+|[A-Za-z]:\\(?:[^\\\r\n]+\\)*[^\\\r\n]*)/gu,
	/(?<![:/])\b(?:[A-Za-z0-9._-]+\/)+(?:[A-Za-z0-9._@ -]*[A-Za-z0-9_@-])/gu,
];

const CUSTOMER_IDENTIFIER_PATTERNS: readonly RegExp[] = [
	/\b(?:customer|client|tenant|account|organization|company)[ _-]?(?:id|name|number)?\s*[:=#]\s*(?:"[^"]+"|'[^']+'|[^\s,;]+)/giu,
	/\b(?:customer|client|tenant|account)[_-][A-Za-z0-9_-]+\b/giu,
	/(?:고객(?:사)?|클라이언트|테넌트|거래처)\s*(?:ID|아이디|명|이름|번호)?\s*[:=#]\s*(?:"[^"]+"|'[^']+'|[^\s,;]+)/giu,
	/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/giu,
	// A separator is required here: an unlabelled 10-digit Unix timestamp is not a phone number.
	/(?<!\d)(?:\+?\d{1,3}[-. ]+)?\d{2,4}(?:[-. ]+\d{3,4}){1,2}(?!\d)/gu,
	/\b(?:phone|tel|telephone|mobile|연락처|전화(?:번호)?)\b\s*[:=#]?\s*\+?\d{8,15}\b/giu,
];

const COMPLETION_ENVELOPE_LINE = /^\s*<(\/?)(analysis|results|files|answer|next_steps)\s*>\s*$/iu;
const COMPLETION_ENVELOPE_SECTION = /^\s*<(analysis|results|files|answer|next_steps)\s*>(.*?)<\/\1\s*>\s*$/iu;
const FENCE_OPEN = /^ {0,3}(`{3,}|~{3,})/u;

/**
 * Keeps only the public answer from a completed Assistant response envelope.
 * Responses without an envelope, including ordinary HTML-like content and
 * fenced code, are returned unchanged.
 */
export function sanitizeCompletedAssistantResponse(value: string): string {
	if (typeof value !== "string") throw new Error("Assistant response must be a string");
	let activeSection: string | null = null;
	let fence: { marker: string; length: number } | null = null;
	let answerCount = 0;
	let sawEnvelope = false;
	const answer: string[] = [];
	for (const line of value.split(/\r?\n/u)) {
		if (fence) {
			if (new RegExp(`^ {0,3}${fence.marker}{${fence.length},}\\s*$`, "u").test(line)) fence = null;
			if (activeSection === "answer") answer.push(line);
			continue;
		}
		const openedFence = line.match(FENCE_OPEN)?.[1];
		if (openedFence) {
			if (!activeSection) return value;
			fence = { marker: openedFence[0]!, length: openedFence.length };
			if (activeSection === "answer") answer.push(line);
			continue;
		}
		const section = line.match(COMPLETION_ENVELOPE_SECTION);
		if (section) {
			if (activeSection) return value;
			sawEnvelope = true;
			if (section[1]!.toLowerCase() === "answer") {
				answerCount += 1;
				answer.push(section[2]!);
			}
			continue;
		}
		const tag = line.match(COMPLETION_ENVELOPE_LINE);
		if (tag) {
			sawEnvelope = true;
			const name = tag[2]!.toLowerCase();
			if (tag[1] === "/") {
				if (activeSection !== name) return value;
				activeSection = null;
			} else {
				if (activeSection) return value;
				activeSection = name;
				if (name === "answer") answerCount += 1;
			}
			continue;
		}
		if (activeSection === "answer") answer.push(line);
		else if (!activeSection && line.trim()) return value;
	}
	return sawEnvelope && !activeSection && answerCount === 1 ? answer.join("\n").trim() : value;
}

/**
 * Produces the only text allowed into a cross-provider review packet. Every
 * known sensitive class is replaced, and callers receive findings for the
 * user-visible preview. Adapters receive only this redacted projection.
 */
export function redactForExternalReview(value: string): ReviewRedactionResult {
	if (typeof value !== "string") throw new Error("Review text must be a string");
	let text = stripControls(value);
	const findings: ReviewRedactionFinding[] = [];
	text = redact(text, SECRET_PATTERNS, "secret", findings);
	text = redact(text, LOCAL_PATH_PATTERNS, "local-path", findings);
	text = redact(text, CUSTOMER_IDENTIFIER_PATTERNS, "customer-identifier", findings);
	return Object.freeze({
		text,
		findings: Object.freeze(findings.map(finding => Object.freeze({ ...finding }))),
	});
}

/** Rejects a packet if an unredacted sensitive value remains in any text field. */
export function assertExternalReviewSafe(value: string): void {
	const result = redactForExternalReview(value);
	if (result.findings.length > 0) throw new Error("External review packet contains sensitive data");
}

function redact(
	value: string,
	patterns: readonly RegExp[],
	kind: ReviewSensitiveKind,
	findings: ReviewRedactionFinding[],
): string {
	let result = value;
	for (const pattern of patterns) {
		result = result.replace(pattern, () => {
			const replacement = `[redacted:${kind}]`;
			findings.push({ kind, replacement });
			return replacement;
		});
	}
	return result;
}

function stripControls(value: string): string {
	return value
		.replace(/\x1B(?:\[[0-?]*[ -/]*[@-~]|\][\s\S]*?(?:\x07|\x1B\\))/g, "")
		.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/g, "");
}

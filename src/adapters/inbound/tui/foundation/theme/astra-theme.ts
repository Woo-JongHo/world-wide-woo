import chalk from "chalk";
import { truncateToWidth, visibleWidth, wrapTextWithAnsi, type EditorTheme, type MarkdownTheme } from "@earendil-works/pi-tui";

/** Astra inks: semantic state, transcript roles, and provider identity. */
export const astraPalette = {
	text: "#FFFFFF", muted: "#8D91A5", rule: "#3A3D51",
	active: "#A8B1FF", attention: "#E6BC87", failure: "#E18F9A",
	request: "#6FBF8A", response: "#C49AE8", tool: "#6E9FD5", plan: "#D6B979", note: "#D97975", info: "#9BA8CD",
	codex: "#6E87C7", claude: "#D69A78", gemini: "#75B9D6", zai: "#B89AD9", success: "#77BFA3",
} as const;
export const a = {
	text: chalk.hex(astraPalette.text), muted: chalk.hex(astraPalette.muted), rule: chalk.hex(astraPalette.rule),
	caption: chalk.hex(astraPalette.muted).italic,
	active: chalk.hex(astraPalette.active), attention: chalk.hex(astraPalette.attention), failure: chalk.hex(astraPalette.failure),
	request: chalk.hex(astraPalette.request), response: chalk.hex(astraPalette.response), tool: chalk.hex(astraPalette.tool),
	plan: chalk.hex(astraPalette.plan), note: chalk.hex(astraPalette.note), info: chalk.hex(astraPalette.info), success: chalk.hex(astraPalette.success),
	codex: chalk.hex(astraPalette.codex), claude: chalk.hex(astraPalette.claude), gemini: chalk.hex(astraPalette.gemini), zai: chalk.hex(astraPalette.zai),
	strong: chalk.hex(astraPalette.text).bold,
	selected: chalk.bgHex(astraPalette.rule).hex(astraPalette.text).bold,
};
export type AstraInk = (text: string) => string;

const TRUNCATION_MARKER = "…[output truncated]\n";
const BOUNDARY_CONTEXT_CODE_POINTS = 512;

function takeHead(value: string, maximum: number): string {
	return Array.from(value).slice(0, Math.max(0, maximum)).join("");
}

function takeTail(value: string, maximum: number): string {
	if (maximum <= 0) return "";
	return Array.from(value).slice(-maximum).join("");
}

function sanitizeTerminalText(value: string): string {
	return value
		.replace(/\x1b\][\s\S]*?(?:\x07|\x1b\\|$)/gu, "")
		.replace(/\x1b\[[0-?]*[ -/]*[@-~]/gu, "")
		.replace(/\x1b\[[0-?]*[ -/]*$/gu, "")
		.replace(/\x1b[()][0-2AB]/gu, "")
		.replace(/\x1b./gu, "")
		.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/gu, "")
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

function boundedTerminalText(value: string, maximum: number): string {
	if (maximum <= 0) return "";
	if (Array.from(value).length <= maximum) return sanitizeTerminalText(value);
	const markerLength = Array.from(TRUNCATION_MARKER).length;
	if (maximum <= markerLength) return takeHead(TRUNCATION_MARKER, maximum);
	const contentBudget = maximum - markerLength;
	const headBudget = Math.ceil(contentBudget / 2);
	const tailBudget = contentBudget - headBudget;
	const head = sanitizeTerminalText(takeHead(value, headBudget + BOUNDARY_CONTEXT_CODE_POINTS));
	const rawTail = takeTail(value, tailBudget + BOUNDARY_CONTEXT_CODE_POINTS);
	const tail = sanitizeTerminalText(rawTail).replace(/^\S+/u, "");
	return `${takeHead(head, headBudget)}${TRUNCATION_MARKER}${takeTail(tail, tailBudget)}`;
}
/** A compact typographic landmark; color belongs to the label, not the body. */
export function astraTitle(label: string, ink: AstraInk = a.text): string { return `${ink("▰")} ${chalk.bold(ink(label))}`; }
/** An indeterminate highlight, not a fabricated completion percentage. */
export function astraPulse(frame: number, width = 12): string {
	const base = [58, 61, 81], peak = [168, 177, 255];
	return Array.from({ length: width }, (_, column) => {
		const light = Math.max(0, 1 - Math.abs(column - frame % (width + 6) + 3) / 4);
		const rgb = base.map((channel, i) => Math.round(channel + (peak[i]! - channel) * light));
		return chalk.rgb(rgb[0]!, rgb[1]!, rgb[2]!)("━");
	}).join("");
}
/** Compatible semantic roles for the existing authentication/model state machines. */
export const astraColors = {
	text: a.text, muted: a.muted, border: a.rule, accent: a.active, secondary: a.muted,
	highlight: a.strong, warm: a.note, selected: a.selected, success: a.success, warning: a.attention, error: a.failure,
};
export const astraEditorTheme: EditorTheme = {
	borderColor: a.rule,
	selectList: { selectedPrefix: a.active, selectedText: a.selected, description: a.muted, scrollInfo: a.muted, noMatch: a.attention },
};
export const astraMarkdownTheme: MarkdownTheme = {
	heading: a.strong, link: a.active, linkUrl: a.muted, code: a.active, codeBlock: a.text,
	codeBlockBorder: a.rule, quote: a.muted, quoteBorder: a.rule, hr: a.rule, listBullet: a.muted,
	bold: chalk.bold, italic: chalk.italic, strikethrough: chalk.strikethrough, underline: chalk.underline,
	codeBlockIndent: "  ",
	highlightCode: code => code.split("\n").map(line => line.startsWith("+") ? a.active(line) : line.startsWith("-") ? a.failure(line) : a.text(line)),
};
export function safe(value: unknown, limit = 8000): string {
	return boundedTerminalText(typeof value === "string" ? value : String(value ?? ""), limit).replace(/\t/gu, "    ");
}
export function oneLine(value: unknown, limit = 240): string { return safe(value, limit).replace(/\s+/gu, " ").trim(); }
export function fit(value: string, width: number): string {
	if (width <= 0) return "";
	const clipped = truncateToWidth(value, width, "…");
	return clipped + " ".repeat(Math.max(0, width - visibleWidth(clipped)));
}
export function pair(left: string, right: string, width: number): string {
	const room = width - visibleWidth(right) - 3;
	return room < 12 ? fit(left, width) : fit(left, room) + "   " + right;
}
export function prose(text: string, width: number, indent = 0): string[] {
	return wrapTextWithAnsi(text, Math.max(1, width - indent)).map(row => fit(" ".repeat(indent) + row, width));
}
export function section(label: string, width: number, meta = "", ink: AstraInk = a.text, metaInk: AstraInk = a.muted): string[] {
	return ["", pair(astraTitle(label, ink), metaInk(meta), width), a.rule("─".repeat(Math.min(20, Math.max(0, width)))), ""];
}
export function mark(state: string): string {
	if (["failed", "error", "blocked"].includes(state)) return a.failure("!");
	if (["running", "working", "in_progress", "executing", "started", "updated"].includes(state)) return a.active("›");
	if (["completed", "passed", "accepted", "confirmed"].includes(state)) return a.success("✓");
	if (["cancelled", "interrupted"].includes(state)) return a.muted("−");
	return a.muted("·");
}
export function number(value: number | null | undefined): string {
	if (value == null || !Number.isFinite(value)) return "—";
	return Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}
export function duration(ms: number | null | undefined): string {
	if (ms == null || !Number.isFinite(ms)) return "—";
	const totalSeconds = Math.max(0, Math.floor(ms / 1000));
	const hours = Math.floor(totalSeconds / 3600);
	const minutes = Math.floor(totalSeconds % 3600 / 60);
	const seconds = totalSeconds % 60;
	return [hours ? `${hours}h` : "", hours || minutes ? `${minutes}m` : "", `${seconds}s`].filter(Boolean).join(" ");
}

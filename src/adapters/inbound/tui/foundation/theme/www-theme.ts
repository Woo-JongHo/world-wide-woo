import chalk                                               from "chalk";
import { truncateToWidth, visibleWidth, wrapTextWithAnsi } from "@earendil-works/pi-tui";
import type { EditorTheme, MarkdownTheme }                 from "@earendil-works/pi-tui";
import { getActiveTuiTheme, palette }                      from "@/adapters/inbound/tui/foundation/theme/theme";

/** Figma reference inks for the default Gruvbox and the Tokyo Night theme. */
export const wwwPalette = {
	get text() { return palette.foreground; },
	get cream() { return getActiveTuiTheme() === "gruvbox" ? "#fbf1c7" : palette.foreground; },
	get secondary() { return palette.steel; },
	get muted() { return palette.muted; },
	get rule() { return palette.border; },
	get active() { return palette.orange; },
	get attention() { return palette.amber; },
	get failure() { return palette.red; },
	get request() { return palette.success; },
	get response() { return getActiveTuiTheme() === "tokyo-night" ? palette.steel : "#D3869B"; },
	get tool() { return palette.teal; },
	get plan() { return palette.amber; },
	get note() { return palette.orange; },
	get info() { return getActiveTuiTheme() === "tokyo-night" ? palette.blue : "#8EC07C"; },
	get codex() { return palette.foreground; },
	get claude() { return palette.orange; },
	get gemini() { return palette.teal; },
	get zai() { return getActiveTuiTheme() === "tokyo-night" ? palette.steel : "#D3869B"; },
	get success() { return palette.success; },
} as const;
type WwwPaletteKey = keyof typeof wwwPalette;
const wwwInk = (key: WwwPaletteKey): WwwInk => text => chalk.hex(wwwPalette[key])(text);
export const a = {
	text: wwwInk("text"), cream: wwwInk("cream"), answer: chalk.white, secondary: wwwInk("secondary"), muted: wwwInk("muted"), rule: wwwInk("rule"),
	caption: (text: string) => chalk.italic(wwwInk("muted")(text)),
	active: wwwInk("active"), attention: wwwInk("attention"), failure: wwwInk("failure"),
	request: wwwInk("request"), response: wwwInk("response"), tool: wwwInk("tool"),
	plan: wwwInk("plan"), note: wwwInk("note"), info: wwwInk("info"), success: wwwInk("success"),
	codex: wwwInk("codex"), claude: wwwInk("claude"), gemini: wwwInk("gemini"), zai: wwwInk("zai"),
	strong: (text: string) => chalk.bold(wwwInk("text")(text)),
	selected: (text: string) => chalk.bgHex(wwwPalette.rule).hex(wwwPalette.text).bold(text),
};
export type WwwInk = (text: string) => string;

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
	const contentBudget = maximum - markerLength                                                           ;
	const headBudget    = Math.ceil(contentBudget / 2)                                                     ;
	const tailBudget    = contentBudget - headBudget                                                       ;
	const head          = sanitizeTerminalText(takeHead(value, headBudget + BOUNDARY_CONTEXT_CODE_POINTS)) ;
	const rawTail       = takeTail(value, tailBudget + BOUNDARY_CONTEXT_CODE_POINTS)                       ;
	const tail          = sanitizeTerminalText(rawTail).replace(/^\S+/u, "")                               ;
	return `${takeHead(head, headBudget)}${TRUNCATION_MARKER}${takeTail(tail, tailBudget)}`;
}
/** A compact typographic landmark; color belongs to the label, not the body. */
export function wwwTitle(label: string, ink: WwwInk = a.text): string { return chalk.bold(ink(label)); }
/** An indeterminate highlight, not a fabricated completion percentage. */
export function wwwPulse(frame: number, width = 12): string {
	const base = [60, 56, 54], peak = [254, 128, 25];
	return Array.from({ length: width }, (_, column) => {
		const light = Math.max(0, 1 - Math.abs(column - frame % (width + 6) + 3) / 4);
		const rgb = base.map((channel, i) => Math.round(channel + (peak[i] - channel) * light));
		return chalk.rgb(rgb[0], rgb[1], rgb[2])("━");
	}).join("");
}
/** A restrained moving gradient for persistent, user-authored header context. */
export function wwwFlowText(text: string, frame = 0): string {
	const characters = Array.from(text);
	const start = [254, 128, 25], end = [211, 134, 155];
	return characters.map((character, index) => {
		const wave = (Math.sin((index + frame) / 4) + 1) / 2;
		const rgb = start.map((channel, channelIndex) => Math.round(channel + (end[channelIndex] - channel) * wave));
		return chalk.rgb(rgb[0], rgb[1], rgb[2])(character);
	}).join("");
}
/** Compatible semantic roles for the existing authentication/model state machines. */
export const wwwColors = {
	text: a.text, muted: a.muted, border: a.rule, accent: a.active, secondary: a.secondary,
	highlight: a.strong, warm: a.note, selected: a.selected, success: a.success, warning: a.attention, error: a.failure,
};
export const wwwEditorTheme: EditorTheme = {
	borderColor: a.rule,
	selectList: { selectedPrefix: a.active, selectedText: a.selected, description: a.muted, scrollInfo: a.muted, noMatch: a.attention },
};
export const wwwMarkdownTheme: MarkdownTheme = {
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
	return truncateToWidth(value, width, "…", true);
}
export function pair(left: string, right: string, width: number): string {
	const room = width - visibleWidth(right) - 3;
	return room < 12 ? fit(left, width) : fit(left, room) + "   " + right;
}
export function prose(text: string, width: number, indent = 0): string[] {
	return wrapTextWithAnsi(text, Math.max(1, width - indent)).map(row => fit(" ".repeat(indent) + row, width));
}
export function section(label: string, width: number, meta = "", ink: WwwInk = a.text, metaInk: WwwInk = a.muted): string[] {
	return ["", pair(wwwTitle(label, ink), metaInk(meta), width), a.rule("─".repeat(Math.min(20, Math.max(0, width)))), ""];
}
/** One blank row between sidebar blocks so wide and short viewports share the same rhythm.
 * The first block keeps its leading blank as the top margin; inner edges are normalized. */
export function joinedSections(blocks: readonly (readonly string[])[]): string[] {
	const trimmed = blocks.map(block => block.slice(block[0] === "" && block.length > 1 ? 1 : 0, block.at(-1) === "" && block.length > 1 ? -1 : block.length));
	return trimmed.filter(block => block.length).flatMap((block, index) => index === 0 ? [...block] : ["", ...block]);
}
/** A compact sidebar landmark; rails do not spend vertical space on blank gutters. */
export function railSection(label: string, width: number, meta = "", ink: WwwInk = a.text): string[] {
	return [pair(wwwTitle(label, ink), a.muted(meta), width), a.rule("─".repeat(Math.min(16, Math.max(0, width))))];
}
/** A bounded, cell-based gauge for observed ratios. */
export function wwwMeter(value: number, total: number, width = 18, ink: WwwInk = a.active): string {
	const cells = Math.max(0, Math.floor(width));
	const ratio = total > 0 && Number.isFinite(value) && Number.isFinite(total)
		? Math.max(0, Math.min(1, value / total))
		: 0;
	const filled = Math.round(cells * ratio);
	return `${ink("━".repeat(filled))}${a.rule("━".repeat(cells - filled))}`;
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
	const totalSeconds = Math.max(0, Math.floor(ms / 1000))   ;
	const hours        = Math.floor(totalSeconds / 3600)      ;
	const minutes      = Math.floor(totalSeconds % 3600 / 60) ;
	const seconds      = totalSeconds % 60                    ;
	return [hours ? `${hours}h` : "", hours || minutes ? `${minutes}m` : "", `${seconds}s`].filter(Boolean).join(" ");
}
/** Layer telemetry lives below one second; second flooring would render every sample as "0s". */
export function telemetryDuration(ms: number | null | undefined): string {
	if (ms == null || !Number.isFinite(ms)) return "—";
	if (ms < 1) return `${ms.toFixed(2)}ms`;
	if (ms < 100) return `${ms.toFixed(1).replace(/\.0$/u, "")}ms`;
	if (ms < 1_000) return `${Math.round(ms)}ms`;
	return duration(ms);
}

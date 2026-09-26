import { stripTerminalSequences, truncateToWidth, visibleWidth, wrapTextWithAnsi } from "@earendil-works/pi-tui";
import { parseAllDocuments, stringify, visit }                                     from "yaml";
import type { CommandStatus }                                                      from "@/core/domain/execution/output";
import { sanitizeTerminalTextExcerpt }                                             from "@/core/domain/execution/terminal";
import { colors, semantic, syntaxHighlightPlugin }                                 from "@/adapters/inbound/tui/foundation/theme/theme";
import {
	CHAT_PUBLIC_OUTPUT_MAX_CHARS,
	CHAT_STRUCTURED_DISPLAY_MAX_BYTES,
	CHAT_STRUCTURED_DISPLAY_MAX_LINES,
	CHAT_TERMINAL_OUTPUT_CHUNK_LINES,
	workStepStatusPresentation,
	workStepStatusSymbol,
} from "@/adapters/inbound/tui/features/chat/view/chat-output-policy";
import type { WorkStepStatusPresentation }                                         from "@/adapters/inbound/tui/features/chat/view/chat-output-policy";

export { workStepStatusPresentation, type WorkStepStatusPresentation } from "@/adapters/inbound/tui/features/chat/view/chat-output-policy";

const BASH_OUTPUT_MAX_LINES = CHAT_TERMINAL_OUTPUT_CHUNK_LINES;
const BASH_SPINNER = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"] as const;

export type ExecutionLineTone =
	| "command" | "meta" | "output" | "success" | "warning" | "error"
	| "diff-added" | "diff-removed" | "diff-header" | "git-modified" | "git-untracked";

export type StructuredLanguage = "bash" | "json" | "yaml" | "markdown";

interface BashExecutionProjection {
	what        : string            ;
	why         : string            ;
	command?    : string            ;
	exitCode?   : number            ;
	durationMs? : number            ;
	output      : readonly string[] ;
}

function clean(value: string): string {
	return sanitizeTerminalTextExcerpt(value, CHAT_PUBLIC_OUTPUT_MAX_CHARS, "head-tail").replace(/\t/gu, "    ");
}

export function fitExecutionText(text: string, width: number): string {
	const clipped = truncateToWidth(text, Math.max(0, width));
	return clipped + " ".repeat(Math.max(0, width - visibleWidth(clipped)));
}

export function highlightStructured(source: string, language: StructuredLanguage): string[] {
	try {
		const lines = syntaxHighlightPlugin.highlight(source, language);
		return stripTerminalSequences(lines.join("\n")) === source ? lines : source.split("\n");
	} catch {
		return source.split("\n");
	}
}

function isWithinStructuredDisplayBudget(value: string): boolean {
	return Buffer.byteLength(value, "utf8") <= CHAT_STRUCTURED_DISPLAY_MAX_BYTES
		&& value.split("\n").length <= CHAT_STRUCTURED_DISPLAY_MAX_LINES;
}

function prettyJson(value: string): string | undefined {
	if (!isWithinStructuredDisplayBudget(value)) return undefined;
	try {
		return JSON.stringify(JSON.parse(value), null, 2);
	} catch {
		return undefined;
	}
}

function prettyYaml(value: string): string | undefined {
	if (!isWithinStructuredDisplayBudget(value)) return undefined;
	try {
		const documents = parseAllDocuments(value);
		if (documents.length !== 1 || documents[0].errors.length > 0) return undefined;
		let hasAlias = false;
		visit(documents[0], { Alias: () => { hasAlias = true; } });
		return hasAlias ? undefined : stringify(documents[0].toJS());
	} catch {
		return undefined;
	}
}

/** Prettifies safe structured tool output within a bounded parsing budget. */
export function structuredOutput(input: string, output: string): { value: string; language?: StructuredLanguage } {
	let path: unknown;
	try {
		path = JSON.parse(input).path;
	} catch {
		path = input.trim();
	}
	const normalizedPath = typeof path === "string" ? path.toLowerCase() : "";
	if (normalizedPath.endsWith(".yaml") || normalizedPath.endsWith(".yml")) {
		const value = prettyYaml(output);
		return value === undefined ? { value: output } : { value, language: "yaml" };
	}
	if (normalizedPath.endsWith(".md") || normalizedPath.endsWith(".markdown")) {
		return isWithinStructuredDisplayBudget(output) ? { value: output, language: "markdown" } : { value: output };
	}
	const value = prettyJson(output);
	return value === undefined ? { value: output } : { value, language: "json" };
}

/** Semantic tone for executor lines. Kept independent from ANSI rendering so the visual rule is testable. */
export function executionLineTone(line: string, section: "input" | "output"): ExecutionLineTone {
	const value = line.trim();
	if (section === "input") {
		if (/^command\s*:/iu.test(value)) return "command";
		if (/^(?:args|cwd|path|query)\s*:/iu.test(value)) return "meta";
		return "output";
	}
	if (/^(?:stderr|error)\s*:/iu.test(value)) return "error";
	if (/^exit\s*:\s*(?!0(?:\D|$))\d+/iu.test(value)) return "error";
	if (/^exit\s*:\s*0(?:\D|$)/iu.test(value)) return "success";
	const gitStatus = /^([ MADRCU?!]{2})\s+.+$/u.exec(line);
	if (gitStatus?.[1] === "??") return "git-untracked";
	if (gitStatus?.[1]?.includes("A")) return "diff-added";
	if (gitStatus?.[1]?.includes("D")) return "diff-removed";
	if (gitStatus) return "git-modified";
	if (/^(?:diff --git\b|index\s+[\da-f]+\.\.[\da-f]+\b|@@\s)/iu.test(value)) return "diff-header";
	if (/^\+\+\+\s/u.test(value)) return "diff-added";
	if (/^---\s/u.test(value)) return "diff-removed";
	if (/^\+(?!\+\+)/u.test(value)) return "diff-added";
	if (/^-(?!---)/u.test(value)) return "diff-removed";
	if (/^(?:warn(?:ing)?s?\b|\d+\s+warn(?:ing)?s?\b)/iu.test(value)) return "warning";
	if (/^(?:fail(?:ed|ure|ures)?\b|error(?:s)?\b|\d+\s+(?:fail(?:ed|ure|ures)?|error(?:s)?)\b)/iu.test(value)) return "error";
	if (/^(?:pass(?:ed)?\b|success(?:es|ful)?\b|ok\b|\d+\s+(?:pass(?:ed)?|success(?:es)?|ok)\b)/iu.test(value)) return "success";
	if (/^(?:output|result|stdout)\s*:?$/iu.test(value)) return "meta";
	return "output";
}

function highlightedSource(source: string, language: "bash" | "json"): string {
	return highlightStructured(source, language).join("\n");
}

export function renderExecutionLine(line: string, section: "input" | "output"): string {
	if (line.startsWith("… ")) return line;
	const tone = executionLineTone(line, section);
	if (tone === "command") {
		const match = /^(command\s*:\s*)(.*)$/iu.exec(line);
		return match ? `${colors.muted(match[1])}${highlightedSource(match[2], "bash")}` : semantic.executionCommand(line);
	}
	if (section === "input" && tone === "meta") {
		const match = /^([^:]+:\s*)(.*)$/u.exec(line);
		if (!match) return colors.muted(line);
		const value = match[2];
		const renderedValue = match[1].trimStart().startsWith("args:") && /^[{[]/u.test(value.trimStart())
			? highlightedSource(value, "json")
			: colors.text(value);
		return `${colors.muted(match[1])}${renderedValue}`;
	}
	const color = tone === "success" ? colors.success
		: tone === "warning" ? colors.warning
			: tone === "error" ? colors.error
				: tone === "diff-added" ? semantic.diffAdded
					: tone === "diff-removed" ? semantic.diffRemoved
						: tone === "diff-header" ? colors.accent
							: tone === "git-modified" ? colors.warning
								: tone === "git-untracked" ? colors.secondary : semantic.executionOutput;
	return color(line);
}

export function boundedExecutionRows(
	lines: readonly string[],
	width: number,
	maximumLines: number,
	maximumChars: number,
	preserveTail: boolean,
	label: "입력" | "출력",
): string[] {
	const raw = lines.join("\n");
	const plain = stripTerminalSequences(raw);
	// Compare and truncate only plain text. Cutting highlighted bytes can leave an
	// unterminated escape sequence in the terminal stream.
	const clippedByChars = plain.length > maximumChars;
	const clipped = clippedByChars
		? preserveTail ? clean(plain).slice(-maximumChars) : clean(plain).slice(0, maximumChars)
		: raw;
	const wrapped = clipped.split(/\r?\n/gu).flatMap((line) => wrapTextWithAnsi(line, Math.max(1, width)));
	const omittedLines = Math.max(0, wrapped.length - maximumLines + 1);
	if (!clippedByChars && wrapped.length <= maximumLines) return wrapped;
	const marker = colors.muted(`… ${preserveTail ? "이전 " : "나머지 "}${label} ${Math.max(1, omittedLines)}줄 생략`);
	if (maximumLines <= 1) return [marker];
	return preserveTail
		? [marker, ...wrapped.slice(-(maximumLines - 1))]
		: [...wrapped.slice(0, maximumLines - 1), marker];
}

function bashStatusSymbol(status: CommandStatus): string {
	if (status === "running") return BASH_SPINNER[Math.floor(Date.now() / 80) % BASH_SPINNER.length] ?? "⠋";
	return workStepStatusSymbol(status);
}

function bashBar(left: "┌" | "├", right: "┐" | "┤", label: string, width: number, border: (text: string) => string): string {
	const leftPart      = border(`${left}───`)                                                                                ;
	const rightPart     = border(right)                                                                                       ;
	const available     = Math.max(0, width - visibleWidth(leftPart) - visibleWidth(rightPart))                               ;
	const renderedLabel = truncateToWidth(` ${label} `, available)                                                            ;
	const fill          = Math.max(0, width - visibleWidth(leftPart) - visibleWidth(renderedLabel) - visibleWidth(rightPart)) ;
	return `${leftPart}${renderedLabel}${border("─".repeat(fill))}${rightPart}`;
}

function bashContent(line: string, width: number, border: (text: string) => string): string {
	if (width < 4) return fitExecutionText(line, width);
	return `${border("│")} ${fitExecutionText(line, width - 4)} ${border("│")}`;
}

function bashOutputLines(projected: BashExecutionProjection, width: number): string[] {
	const contentWidth = Math.max(1, width - 4);
	const logical = projected.output.flatMap((line) => {
		if (/^(?:output|stdout|result)$/iu.test(line.trim()) || /^exit\s*:/iu.test(line.trim())) return [];
		return [line.replace(/^(?:output|stdout|result)\s*:\s*/iu, "")];
	});
	const visual = logical.flatMap((line) => wrapTextWithAnsi(line, contentWidth));
	if (visual.length <= BASH_OUTPUT_MAX_LINES) return visual;
	const shown = visual.slice(-BASH_OUTPUT_MAX_LINES);
	return [colors.muted(`… (${visual.length - shown.length} earlier lines, showing ${shown.length} of ${visual.length})`), ...shown];
}

/** Renders a bounded Bash command and its public output as one terminal frame. */
export function renderBashExecutionBlock(projected: BashExecutionProjection, status: CommandStatus, width: number): string[] {
	if (!projected.command || width < 12) {
		return [
			fitExecutionText(colors.success(projected.what), width),
			...(projected.why ? [fitExecutionText(colors.warm(`왜 하는지: ${projected.why}`), width)] : []),
			fitExecutionText(projected.command ? `$ ${projected.command}` : "Bash", width),
		];
	}
	const border = status === "running" || status === "pending" ? colors.accent
		: status === "failed" ? colors.error
			: status === "cancelled" ? colors.warning : colors.muted;
	const presentation        = workStepStatusPresentation(status)                                                                  ;
	const surface             = presentation.surface                                                                                ;
	const statusSymbol        = status === "running" ? presentation.border(bashStatusSymbol(status)) : presentation.symbol          ;
	const header              = `${statusSymbol} ${colors.secondary("Bash")}`                                                       ;
	const commandRows         = wrapTextWithAnsi(`${colors.muted("$")} ${highlightedSource(projected.command, "bash")}`, width - 4) ;
	const outputRows          = bashOutputLines(projected, width).map((line) => renderExecutionLine(line, "output"))                ;
	const metadata : string[] = []                                                                                                  ;
	if (projected.exitCode !== undefined) metadata.push(`Exit: ${projected.exitCode}`);
	if (projected.durationMs !== undefined) metadata.push(`Duration: ${Math.max(0, Math.round(projected.durationMs))}ms`);
	const rows = [
		fitExecutionText(colors.success(projected.what), width),
		...(projected.why ? [fitExecutionText(colors.warm(`왜 하는지: ${projected.why}`), width)] : []),
		bashBar("┌", "┐", header, width, border),
		...commandRows.map((line) => bashContent(line, width, border)),
		bashBar("├", "┤", colors.secondary("Output"), width, border),
		...outputRows.map((line) => bashContent(line, width, border)),
		...metadata.map((value) => bashContent(colors.muted(`⟦${value}⟧`), width, border)),
		`${border("└───")}${border("─".repeat(Math.max(0, width - 5)))}${border("┘")}`,
	];
	return rows.map((row) => surface(fitExecutionText(row, width)));
}

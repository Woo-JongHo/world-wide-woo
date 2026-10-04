import      {
              stripTerminalSequences       ,
              truncateToWidth              ,
              visibleWidth                 ,
              wrapTextWithAnsi             ,
                                             } from "@earendil-works/pi-tui"                                       ;
import type { Component                      } from "@earendil-works/pi-tui"                                       ;
import type {
              CommandResultSnapshot        ,
              CommandStatus                ,
              CompletionReport             ,
              DiffResultSnapshot           ,
              GenericToolResultSnapshot    ,
                                             } from "@/core/domain/execution/output"                               ;
import      { sanitizeTerminalTextExcerpt    } from "@/core/domain/execution/terminal"                             ;
import      { colors, semantic               } from "@/adapters/inbound/tui/foundation/theme/theme"                ;
import      {
              highlightStructured          ,
              projectNativePathText        ,
              renderExecutionLine          ,
              structuredOutput             ,
                                             } from "@/adapters/inbound/tui/features/chat/view/work-step-card"     ;
import      {
              CHAT_PUBLIC_OUTPUT_MAX_CHARS ,
              workStepStatusPresentation   ,
                                             } from "@/adapters/inbound/tui/features/chat/view/chat-output-policy" ;

interface OutputLine {
	stream: "stdout" | "stderr";
	text: string;
}

/** Terminal presentation of an observed bash result; it never executes the command. */
export class BashResultCard implements Component {
	constructor(
		private readonly snapshot: CommandResultSnapshot,
		private readonly maxOutputLines = 12,
	) {}

	invalidate(): void {}

	render(width: number): string[] {
		const contentWidth = Math.max(1, width - 4);
		return card(width, [
			...bashHeaderRows(this.snapshot, contentWidth),
			...bashOutputRows(outputLines(this.snapshot, Math.max(0, this.maxOutputLines)), contentWidth),
			...detailRows(bashDetails(this.snapshot)),
		]);
	}
}

/** Terminal presentation of an observed generic tool result; it never invokes the tool. */
export class GenericToolResultCard implements Component {
	constructor(
		private readonly snapshot: GenericToolResultSnapshot,
		private readonly maxOutputLines = 12,
	) {}

	invalidate(): void {}

	render(width: number): string[] {
		const contentWidth = Math.max(1, width - 4)                                                                 ;
		const inputRows    = toolInputRows(this.snapshot, contentWidth)                                             ;
		const display      = structuredOutput(clean(this.snapshot.input), clean(this.snapshot.output))              ;
		const output       = boundedDisplayLines(display.value, display.language, Math.max(0, this.maxOutputLines)) ;
		return card(width, [
			...inputRows,
			...toolOutputRows(output, contentWidth),
			...detailRows(resultDetails(this.snapshot.durationMs, this.snapshot.error)),
		]);
	}
}

/** Terminal presentation of an observed textual diff; it never applies the diff. */
export class DiffResultCard implements Component {
	constructor(
		private readonly snapshot: DiffResultSnapshot,
		private readonly maxDiffLines = 12,
	) {}

	invalidate(): void {}

	render(width: number): string[] {
		const contentWidth = Math.max(1, width - 4);
		return card(width, [
			`${semantic.assistantLabel(clean(this.snapshot.title) || "Diff")} · ${statusLabel(this.snapshot.status)}`,
			...diffRows(boundedLines(this.snapshot.diff, Math.max(0, this.maxDiffLines)), contentWidth),
			...detailRows(resultDetails(this.snapshot.durationMs, this.snapshot.error)),
		]);
	}
}

/** Terminal presentation of a structured completion report. */
export class CompletionSummaryCard implements Component {
	constructor(private readonly report: CompletionReport) {}

	invalidate(): void {}

	render(width: number): string[] {
		const contentWidth = Math.max(1, width - 4)                   ;
		const rows         = wrapped(this.report.title, contentWidth) ;
		for (const [index, section] of this.report.sections.entries()) {
			rows.push("");
			rows.push(...wrapped(`#${index + 1} ${section.title}`, contentWidth).map((line) => colors.secondary(line)));
			for (const bullet of section.bullets) rows.push(...wrapped(`  • ${bullet}`, contentWidth));
		}
		if (this.report.verification.length > 0) {
			rows.push("", colors.success("검증"));
			for (const item of this.report.verification) rows.push(...wrapped(`  • ${item}`, contentWidth));
		}
		return card(width, rows);
	}
}

function clean(value: string): string {
	return stripTerminalSequences(value)
		.replace(/[\u0000-\u0008\u000B-\u001F\u007F-\u009F]/gu, "")
		.replace(/\bsk-[A-Za-z0-9_-]{16,}\b/gu, "[REDACTED]")
		.replace(/\b(?:ghp_|gho_|github_pat_)[A-Za-z0-9_]{16,}\b/gu, "[REDACTED]")
		.replace(
			/(("?(?:authorization|api[_-]?key|access[_-]?token|refresh[_-]?token|client[_-]?secret|password)"?\s*[:=]\s*"?(?:bearer\s+)?))[^"\s,}\]]+/giu,
			"$1[REDACTED]",
		)
		.replace(/\t/gu, "    ");
}

function fit(text: string, width: number): string {
	const clipped = truncateToWidth(text, Math.max(0, width));
	return clipped + " ".repeat(Math.max(0, width - visibleWidth(clipped)));
}

function wrapped(text: string, width: number): string[] {
	return clean(text).split("\n").flatMap((line) => wrapTextWithAnsi(line, Math.max(1, width)));
}

function wrappedHighlighted(text: string, width: number): string[] {
	return text.split("\n").flatMap((line) => wrapTextWithAnsi(line, Math.max(1, width)));
}

function card(width: number, rows: readonly string[]): string[] {
	if (width < 4) return rows.map((row) => fit(row, width));
	const contentWidth = width - 4;
	return [
		colors.border(`╭${"─".repeat(width - 2)}╮`),
		...rows.map((row) => `${colors.border("│")} ${fit(row, contentWidth)} ${colors.border("│")}`),
		colors.border(`╰${"─".repeat(width - 2)}╯`),
	];
}

function outputLines(snapshot: CommandResultSnapshot, maximum: number): { lines: OutputLine[]; omitted: number } {
	const lines: OutputLine[] = [];
	for (const [stream, output] of [["stdout", snapshot.stdout], ["stderr", snapshot.stderr]] as const) {
		for (const text of projectNativePathText(clean(output), snapshot.cwd).split("\n")) {
			if (text || output.length > 0) lines.push({ stream, text });
		}
	}
	return { lines: maximum > 0 ? lines.slice(-maximum) : [], omitted: Math.max(0, lines.length - maximum) };
}

function boundedLines(output: string, maximum: number): { lines: string[]; omitted: number } {
	const lines = clean(output).split("\n");
	return { lines: maximum > 0 ? lines.slice(-maximum) : [], omitted: Math.max(0, lines.length - maximum) };
}

function boundedDisplayLines(output: string, language: string | undefined, maximum: number): { lines: string[]; omitted: number } {
	const plain    = clean(output)                                          ;
	const allLines = plain.split("\n")                                      ;
	const selected = maximum > 0 ? allLines.slice(-maximum).join("\n") : "" ;
	// Bound unstyled text first: highlighter ANSI bytes must never consume the display budget.
	const bounded = clean(sanitizeTerminalTextExcerpt(selected, CHAT_PUBLIC_OUTPUT_MAX_CHARS, "tail"));
	const lines = language
		? highlightStructured(bounded, language as "json" | "yaml" | "markdown")
		: bounded.split("\n");
	return { lines, omitted: Math.max(0, allLines.length - maximum) };
}

function statusLabel(status: CommandStatus): string {
	return workStepStatusPresentation(status).text;
}

function resultDetails(durationMs: number | undefined, error: string | undefined): string[] {
	const details: string[] = [];
	if (durationMs !== undefined) details.push(`${durationMs}ms`);
	if (error !== undefined) details.push(`오류: ${clean(error)}`);
	return details;
}

function bashHeaderRows(snapshot: CommandResultSnapshot, contentWidth: number): string[] {
	const command = highlightStructured(projectNativePathText(clean(snapshot.command), snapshot.cwd), "bash");
	return [
		`${semantic.assistantLabel("Bash")} · ${statusLabel(snapshot.status)}`,
		...command.flatMap((line, index) => wrappedHighlighted(`${colors.muted(index === 0 ? "$" : ">")} ${line}`, contentWidth)),
		...wrapped(`${colors.muted("cwd:")} ${projectNativePathText(clean(snapshot.cwd), snapshot.cwd)}`, contentWidth),
	];
}

/** Output rows with a stream label whenever stdout and stderr alternate. */
function bashOutputRows(output: { lines: OutputLine[]; omitted: number }, contentWidth: number): string[] {
	const rows         : string[]                         = omittedRows(output.omitted) ;
	let   activeStream : OutputLine["stream"] | undefined                               ;
	for (const line of output.lines) {
		if (line.stream !== activeStream) {
			activeStream = line.stream;
			rows.push(line.stream === "stdout" ? colors.muted("stdout") : colors.error("stderr"));
		}
		const rendered = line.stream === "stderr" ? colors.error(line.text) : renderExecutionLine(line.text, "output");
		rows.push(...wrappedHighlighted(`  ${rendered}`, contentWidth));
	}
	return rows;
}

function bashDetails(snapshot: CommandResultSnapshot): string[] {
	const details: string[] = [];
	if (snapshot.exitCode !== undefined) details.push(`exit ${snapshot.exitCode}`);
	if (snapshot.durationMs !== undefined) details.push(`${snapshot.durationMs}ms`);
	return details;
}

function toolInputRows(snapshot: GenericToolResultSnapshot, contentWidth: number): string[] {
	const structuredInput = structuredOutput("", clean(snapshot.input))                                                  ;
	const input           = structuredInput.value                                                                        ;
	const inputLines      = structuredInput.language === "json" ? highlightStructured(input, "json") : input.split("\n") ;
	return [
		`${semantic.assistantLabel(clean(snapshot.toolName) || "Tool")} · ${statusLabel(snapshot.status)}`,
		semantic.userLabel("입력:"),
		...inputLines.flatMap((line) => wrappedHighlighted(`  ${line}`, contentWidth)),
	];
}

function toolOutputRows(output: { lines: string[]; omitted: number }, contentWidth: number): string[] {
	if (!output.lines.length) return omittedRows(output.omitted);
	return [
		...omittedRows(output.omitted),
		semantic.assistantLabel("출력"),
		...output.lines.flatMap((line) => wrappedHighlighted(`  ${line}`, contentWidth)),
	];
}

function diffRows(diff: { lines: string[]; omitted: number }, contentWidth: number): string[] {
	return [...omittedRows(diff.omitted), ...diff.lines.flatMap((line) => diffLineRows(clean(line), contentWidth))];
}

function diffLineRows(cleanLine: string, contentWidth: number): string[] {
	const color    = cleanLine.startsWith("+") ? semantic.diffAdded : cleanLine.startsWith("-") ? semantic.diffRemoved : semantic.diffContext ;
	const prefixed = cleanLine.startsWith("+") || cleanLine.startsWith("-") ? cleanLine : `  ${cleanLine}`                                    ;
	return wrapped(prefixed, contentWidth).map((line) => color(line));
}

function omittedRows(omitted: number): string[] {
	return omitted > 0 ? [colors.muted(`… ${omitted} earlier lines omitted`)] : [];
}

function detailRows(details: readonly string[]): string[] {
	return details.length > 0 ? [colors.muted(details.join(" · "))] : [];
}

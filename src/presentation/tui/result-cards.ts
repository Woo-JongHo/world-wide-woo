import {
	stripTerminalSequences,
	truncateToWidth,
	visibleWidth,
	wrapTextWithAnsi,
	type Component,
} from "@earendil-works/pi-tui";
import type {
	CommandResultSnapshot,
	CommandStatus,
	CompletionReport,
	DiffResultSnapshot,
	GenericToolResultSnapshot,
} from "../../domain/output";
import { colors, semantic } from "./theme";

const STATUS_LABEL: Record<CommandStatus, string> = {
	pending: "PENDING",
	running: "RUNNING",
	passed: "PASSED",
	failed: "FAILED",
	cancelled: "CANCELLED",
};

const STATUS_COLOR: Record<CommandStatus, (text: string) => string> = {
	pending: semantic.toolPending,
	running: semantic.toolRunning,
	passed: semantic.toolPassed,
	failed: semantic.toolFailed,
	cancelled: semantic.toolCancelled,
};

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

function card(width: number, rows: readonly string[]): string[] {
	if (width < 4) return rows.map((row) => fit(row, width));
	const contentWidth = width - 4;
	return [
		colors.border(`╭${"─".repeat(width - 2)}╮`),
		...rows.map((row) => `${colors.border("│")} ${fit(row, contentWidth)} ${colors.border("│")}`),
		colors.border(`╰${"─".repeat(width - 2)}╯`),
	];
}

interface OutputLine {
	stream: "stdout" | "stderr";
	text: string;
}

function outputLines(snapshot: CommandResultSnapshot, maximum: number): { lines: OutputLine[]; omitted: number } {
	const lines: OutputLine[] = [];
	for (const [stream, output] of [["stdout", snapshot.stdout], ["stderr", snapshot.stderr]] as const) {
		for (const text of clean(output).split("\n")) {
			if (text || output.length > 0) lines.push({ stream, text });
		}
	}
	return { lines: maximum > 0 ? lines.slice(-maximum) : [], omitted: Math.max(0, lines.length - maximum) };
}

function boundedLines(output: string, maximum: number): { lines: string[]; omitted: number } {
	const lines = clean(output).split("\n");
	return { lines: maximum > 0 ? lines.slice(-maximum) : [], omitted: Math.max(0, lines.length - maximum) };
}

function statusLabel(status: CommandStatus): string {
	return STATUS_COLOR[status](STATUS_LABEL[status]);
}

function resultDetails(durationMs: number | undefined, error: string | undefined): string[] {
	const details: string[] = [];
	if (durationMs !== undefined) details.push(`${durationMs}ms`);
	if (error !== undefined) details.push(`오류: ${clean(error)}`);
	return details;
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
		const rows = [
			`${semantic.assistantLabel("Bash")} · ${statusLabel(this.snapshot.status)}`,
			...wrapped(`${colors.muted("$")} ${clean(this.snapshot.command)}`, contentWidth),
			...wrapped(`${colors.muted("cwd:")} ${clean(this.snapshot.cwd)}`, contentWidth),
		];
		const output = outputLines(this.snapshot, Math.max(0, this.maxOutputLines));
		if (output.omitted > 0) rows.push(colors.muted(`… ${output.omitted} earlier lines omitted`));
		let activeStream: OutputLine["stream"] | undefined;
		for (const line of output.lines) {
			if (line.stream !== activeStream) {
				activeStream = line.stream;
				rows.push(line.stream === "stdout" ? colors.muted("stdout") : colors.error("stderr"));
			}
			rows.push(...wrapped(`  ${line.text}`, contentWidth));
		}
		const details: string[] = [];
		if (this.snapshot.exitCode !== undefined) details.push(`exit ${this.snapshot.exitCode}`);
		if (this.snapshot.durationMs !== undefined) details.push(`${this.snapshot.durationMs}ms`);
		if (details.length > 0) rows.push(colors.muted(details.join(" · ")));
		return card(width, rows);
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
		const contentWidth = Math.max(1, width - 4);
		const rows = [
			`${semantic.assistantLabel(clean(this.snapshot.toolName) || "Tool")} · ${statusLabel(this.snapshot.status)}`,
			semantic.userLabel("입력:"),
			...wrapped(`  ${this.snapshot.input}`, contentWidth),
		];
		const output = boundedLines(this.snapshot.output, Math.max(0, this.maxOutputLines));
		if (output.omitted > 0) rows.push(colors.muted(`… ${output.omitted} earlier lines omitted`));
		if (output.lines.length > 0) {
			rows.push(semantic.assistantLabel("출력"));
			for (const line of output.lines) rows.push(...wrapped(`  ${line}`, contentWidth));
		}
		const details = resultDetails(this.snapshot.durationMs, this.snapshot.error);
		if (details.length > 0) rows.push(colors.muted(details.join(" · ")));
		return card(width, rows);
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
		const rows = [`${semantic.assistantLabel(clean(this.snapshot.title) || "Diff")} · ${statusLabel(this.snapshot.status)}`];
		const diff = boundedLines(this.snapshot.diff, Math.max(0, this.maxDiffLines));
		if (diff.omitted > 0) rows.push(colors.muted(`… ${diff.omitted} earlier lines omitted`));
		for (const line of diff.lines) {
			const cleanLine = clean(line);
			const color = cleanLine.startsWith("+")
				? semantic.diffAdded
				: cleanLine.startsWith("-")
					? semantic.diffRemoved
					: semantic.diffContext;
			const prefixed = cleanLine.startsWith("+") || cleanLine.startsWith("-") ? cleanLine : `  ${cleanLine}`;
			rows.push(...wrapped(prefixed, contentWidth).map(color));
		}
		const details = resultDetails(this.snapshot.durationMs, this.snapshot.error);
		if (details.length > 0) rows.push(colors.muted(details.join(" · ")));
		return card(width, rows);
	}
}

/** Terminal presentation of a structured completion report. */
export class CompletionSummaryCard implements Component {
	constructor(private readonly report: CompletionReport) {}

	invalidate(): void {}

	render(width: number): string[] {
		const contentWidth = Math.max(1, width - 4);
		const rows = wrapped(this.report.title, contentWidth);
		for (const [index, section] of this.report.sections.entries()) {
			rows.push("");
			rows.push(...wrapped(`${index + 1}. ${section.title}`, contentWidth).map(colors.secondary));
			for (const bullet of section.bullets) rows.push(...wrapped(`  • ${bullet}`, contentWidth));
		}
		if (this.report.verification.length > 0) {
			rows.push("", colors.success("검증"));
			for (const item of this.report.verification) rows.push(...wrapped(`  • ${item}`, contentWidth));
		}
		return card(width, rows);
	}
}

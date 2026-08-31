import {
	stripTerminalSequences,
	truncateToWidth,
	visibleWidth,
	wrapTextWithAnsi,
	type Component,
} from "@earendil-works/pi-tui";
import type { CommandResultSnapshot, CommandStatus, CompletionReport } from "../../domain/output";
import { colors } from "./theme";

const STATUS_LABEL: Record<CommandStatus, string> = {
	pending: "PENDING",
	running: "RUNNING",
	passed: "PASSED",
	failed: "FAILED",
	cancelled: "CANCELLED",
};

const STATUS_COLOR: Record<CommandStatus, (text: string) => string> = {
	pending: colors.muted,
	running: colors.highlight,
	passed: colors.success,
	failed: colors.error,
	cancelled: colors.warning,
};

function clean(value: string): string {
	return stripTerminalSequences(value)
		.replace(/[\u0000-\u0008\u000B-\u001F\u007F-\u009F]/gu, "")
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

/** Terminal presentation of an observed bash result; it never executes the command. */
export class BashResultCard implements Component {
	constructor(
		private readonly snapshot: CommandResultSnapshot,
		private readonly maxOutputLines = 12,
	) {}

	invalidate(): void {}

	render(width: number): string[] {
		const contentWidth = Math.max(1, width - 4);
		const status = STATUS_COLOR[this.snapshot.status](STATUS_LABEL[this.snapshot.status]);
		const rows = [
			`${colors.secondary("Bash")} · ${status}`,
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

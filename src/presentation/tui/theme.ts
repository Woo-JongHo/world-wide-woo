import chalk from "chalk";
import type { EditorTheme, MarkdownTheme, SelectListTheme } from "@earendil-works/pi-tui";
import { createNativeSyntaxHighlightPlugin } from "./syntax-highlighter";

/** WWW instrument-panel palette: graphite, telemetry teal, steel, and signal amber. */
export const palette = {
	foreground: "#dce6e8",
	muted: "#839199",
	border: "#34464f",
	teal: "#55aeb6",
	blue: "#78a7c6",
	steel: "#a3b4bd",
	amber: "#d0a15f",
	success: "#72ad8f",
	red: "#d06c70",
	orange: "#c9865e",
	userSurface: "#14242b",
	assistantSurface: "#1a2228",
	executionSurface: "#151c20",
} as const;

export const colors = {
	text: chalk.hex(palette.foreground),
	accent: chalk.hex(palette.teal),
	secondary: chalk.hex(palette.steel),
	highlight: chalk.hex(palette.blue),
	warm: chalk.hex(palette.orange),
	border: chalk.hex(palette.border),
	muted: chalk.hex(palette.muted),
	selected: chalk.bgHex(palette.blue).hex("#0d151a"),
	success: chalk.hex(palette.success),
	warning: chalk.hex(palette.amber),
	error: chalk.hex(palette.red),
};

/** Semantic colors for transcript and result renderers. */
export const semantic = {
	userLabel: colors.highlight,
	assistantLabel: colors.secondary,
	userSurface: chalk.bgHex(palette.userSurface).hex(palette.foreground),
	assistantSurface: chalk.bgHex(palette.assistantSurface).hex(palette.foreground),
	executionSurface: chalk.bgHex(palette.executionSurface).hex(palette.foreground),
	executionCommand: (text: string) => chalk.bold(colors.accent(text)),
	executionOutput: colors.muted,
	narration: colors.accent,
	toolPending: colors.muted,
	toolRunning: colors.highlight,
	toolPassed: colors.success,
	toolFailed: colors.error,
	toolCancelled: colors.warning,
	diffAdded: colors.success,
	diffRemoved: colors.error,
	diffContext: colors.muted,
	effortLow: colors.muted,
	effortMedium: colors.accent,
	effortHigh: colors.highlight,
	effortUltra: colors.warm,
} as const;

export const selectListTheme: SelectListTheme = {
	selectedPrefix: colors.accent,
	selectedText: (text) => chalk.bold(colors.text(text)),
	description: colors.muted,
	scrollInfo: colors.muted,
	noMatch: colors.warning,
};

export const editorTheme: EditorTheme = {
	borderColor: colors.border,
	selectList: selectListTheme,
};

export const syntaxHighlightPlugin = createNativeSyntaxHighlightPlugin({
	comment: palette.muted,
	keyword: palette.blue,
	function: palette.teal,
	variable: palette.foreground,
	string: palette.amber,
	number: palette.orange,
	type: palette.steel,
	operator: palette.amber,
	punctuation: palette.muted,
	inserted: palette.success,
	deleted: palette.red,
});

export const markdownTheme: MarkdownTheme = {
	heading: (text) => colors.accent(chalk.bold(text)),
	link: chalk.underline.hex(palette.teal),
	linkUrl: colors.muted,
	code: (text) => chalk.bgHex("#20292d").hex(palette.amber)(` ${text} `),
	codeBlock: chalk.hex(palette.foreground),
	codeBlockBorder: colors.warm,
	quote: chalk.italic.hex(palette.foreground),
	quoteBorder: colors.secondary,
	hr: colors.border,
	listBullet: colors.accent,
	bold: chalk.bold,
	italic: chalk.italic,
	strikethrough: chalk.strikethrough,
	underline: chalk.underline,
	highlightCode: (code, language) => syntaxHighlightPlugin.highlight(code, language),
	codeBlockIndent: "  ",
};

/** Telemetry teal → steel blue → signal amber stops for the WWW landmark glyph. */
const GRADIENT_STOPS: ReadonlyArray<readonly [number, number, number]> = [
	[85, 174, 182],
	[120, 167, 198],
	[208, 161, 95],
];

function gradientColorAt(position: number): (text: string) => string {
	const clamped = Math.min(1, Math.max(0, position));
	const segment = clamped * (GRADIENT_STOPS.length - 1);
	const index = Math.min(GRADIENT_STOPS.length - 2, Math.floor(segment));
	const fraction = segment - index;
	const [redStart, greenStart, blueStart] = GRADIENT_STOPS[index];
	const [redEnd, greenEnd, blueEnd] = GRADIENT_STOPS[index + 1];
	return chalk.rgb(
		Math.round(redStart + (redEnd - redStart) * fraction),
		Math.round(greenStart + (greenEnd - greenStart) * fraction),
		Math.round(blueStart + (blueEnd - blueStart) * fraction),
	);
}

/** Diagonal telemetry gradient applied without changing visible width. */
export function gradientLines(lines: readonly string[]): string[] {
	const rows = lines.length;
	const columns = Math.max(1, ...lines.map((line) => Array.from(line).length));
	const span = Math.max(1, columns + rows - 1);
	return lines.map((line, row) =>
		Array.from(line).map((character, column) =>
			character === " "
				? character
				: gradientColorAt((column + (rows - 1 - row)) / span)(character)
		).join("")
	);
}

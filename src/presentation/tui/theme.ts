import chalk from "chalk";
import type { EditorTheme, MarkdownTheme, SelectListTheme } from "@earendil-works/pi-tui";
import { createNativeSyntaxHighlightPlugin } from "./syntax-highlighter";

/** Claude-derived clay, parchment, blue, moss, and ochre terminal palette. */
export const palette = {
	foreground: "#e8e6df",
	muted: "#8a8780",
	border: "#4a4742",
	blue: "#6a9bcc",
	cyan: "#83b5c9",
	violet: "#9b87c6",
	green: "#788c5d",
	yellow: "#cba36d",
	red: "#c76060",
	warm: "#d97757",
} as const;

export const colors = {
	text: chalk.hex(palette.foreground),
	accent: chalk.hex(palette.cyan),
	secondary: chalk.hex(palette.violet),
	highlight: chalk.hex(palette.blue),
	warm: chalk.hex(palette.warm),
	border: chalk.hex(palette.border),
	muted: chalk.hex(palette.muted),
	selected: chalk.bgHex(palette.blue).hex("#16161e"),
	success: chalk.hex(palette.green),
	warning: chalk.hex(palette.yellow),
	error: chalk.hex(palette.red),
};

/** Semantic colors for transcript and result renderers. */
export const semantic = {
	userLabel: colors.highlight,
	assistantLabel: colors.secondary,
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
	effortHigh: colors.secondary,
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
	keyword: palette.violet,
	function: palette.blue,
	variable: palette.foreground,
	string: palette.green,
	number: palette.warm,
	type: palette.cyan,
	operator: palette.yellow,
	punctuation: palette.muted,
	inserted: palette.green,
	deleted: palette.red,
});

export const markdownTheme: MarkdownTheme = {
	heading: (text) => colors.accent(chalk.bold(text)),
	link: chalk.underline.hex(palette.cyan),
	linkUrl: colors.muted,
	code: (text) => chalk.bgHex("#252422").hex(palette.yellow)(` ${text} `),
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

/** Claude blue → lavender → clay stops for the WWW landmark glyph. */
const GRADIENT_STOPS: ReadonlyArray<readonly [number, number, number]> = [
	[106, 155, 188],
	[155, 135, 198],
	[217, 119, 87],
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

/** Diagonal Claude gradient applied without changing visible width. */
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

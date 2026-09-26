import chalk                                                from "chalk";
import type { EditorTheme, MarkdownTheme, SelectListTheme } from "@earendil-works/pi-tui";
import { createNativeSyntaxHighlightPlugin }                from "@/adapters/inbound/tui/foundation/theme/syntax-highlighter";

export type TuiThemeName = "gruvbox" | "tokyo-night";

export interface TuiPalette {
	readonly foreground         : string ;
	readonly background         : string ;
	readonly panel              : string ;
	readonly muted              : string ;
	readonly border             : string ;
	readonly teal               : string ;
	readonly blue               : string ;
	readonly steel              : string ;
	readonly amber              : string ;
	readonly success            : string ;
	readonly red                : string ;
	readonly orange             : string ;
	readonly userSurface        : string ;
	readonly assistantSurface   : string ;
	readonly toolPendingSurface : string ;
	readonly toolSuccessSurface : string ;
	readonly toolErrorSurface   : string ;
	readonly toolWarningSurface : string ;
}

const THEME_PALETTES: Record<TuiThemeName, TuiPalette> = {
	gruvbox: {
	foreground         : "#ffffff",
	background         : "#1d2021",
	panel              : "#282828",
	muted              : "#928374",
	border             : "#3c3836",
	teal               : "#83a598",
	blue               : "#83a598",
	steel              : "#d5c4a1",
	amber              : "#fabd2f",
	success            : "#b8bb26",
	red                : "#fb4934",
	orange             : "#fe8019",
	userSurface        : "#3c3836",
	assistantSurface   : "#282828",
	toolPendingSurface : "#1d2021",
	toolSuccessSurface : "#282828",
	toolErrorSurface   : "#3c3836",
	toolWarningSurface : "#3c3836",
	},
	"tokyo-night": {
		foreground         : "#ffffff",
		background         : "#1a1b26",
		panel              : "#16161e",
		muted              : "#565f89",
		border             : "#24283b",
		teal               : "#73daca",
		blue               : "#7aa2f7",
		steel              : "#bb9af7",
		amber              : "#e0af68",
		success            : "#9ece6a",
		red                : "#f7768e",
		orange             : "#7dcfff",
		userSurface        : "#24283b",
		assistantSurface   : "#1a1b26",
		toolPendingSurface : "#16161e",
		toolSuccessSurface : "#1a1b26",
		toolErrorSurface   : "#24283b",
		toolWarningSurface : "#24283b",
	},
};

export const TUI_THEME_OPTIONS = [
	{ name: "gruvbox", label: "Gruvbox WWW" },
	{ name: "tokyo-night", label: "Tokyo Night" },
] as const satisfies readonly { name: TuiThemeName; label: string }[];

let activeTheme: TuiThemeName = "gruvbox";

export function getActiveTuiTheme(): TuiThemeName {
	return activeTheme;
}

export function setActiveTuiTheme(theme: TuiThemeName): void {
	activeTheme = theme;
}

export function nextTuiTheme(theme = activeTheme): TuiThemeName {
	const index = TUI_THEME_OPTIONS.findIndex(option => option.name === theme);
	return TUI_THEME_OPTIONS[(index + 1) % TUI_THEME_OPTIONS.length]!.name;
}

/** Applies the active palette to the terminal canvas while the Www UI owns the screen. */
export function tuiBackgroundSequence(theme = activeTheme): string {
	return `\u001B]11;${THEME_PALETTES[theme].background}\u0007`;
}

/** Restores the terminal profile background after the TUI releases the alternate screen. */
export function tuiBackgroundResetSequence(): string {
	return "\u001B]111\u0007";
}

function currentPalette(): TuiPalette {
	return THEME_PALETTES[activeTheme];
}

/** Mutable through accessors so long-lived TUI components follow /theme immediately. */
export const palette = new Proxy({} as TuiPalette, {
	get: (_target, property: string | symbol) => currentPalette()[property as keyof TuiPalette],
});

function foreground(key: keyof TuiPalette): (text: string) => string {
	return text => chalk.hex(currentPalette()[key])(text);
}

function background(key: keyof TuiPalette, foregroundKey: keyof TuiPalette = "foreground"): (text: string) => string {
	return text => chalk.bgHex(currentPalette()[key]).hex(currentPalette()[foregroundKey])(text);
}

/** WWW instrument-panel palette aligned to the Figma Gruvbox and Tokyo Night references. */
export const colors = {
	text      : foreground("foreground"),
	accent    : foreground("teal"),
	secondary : foreground("steel"),
	highlight : foreground("blue"),
	warm      : foreground("orange"),
	border    : foreground("border"),
	muted     : foreground("muted"),
	selected  : (text: string) => background("orange", "background")(text),
	success   : foreground("success"),
	warning   : foreground("amber"),
	error     : foreground("red"),
};
export type TuiColors = { [K in keyof typeof colors]: (text: string) => string };

/** Semantic colors for transcript and result renderers. */
export const semantic = {
	userLabel      : (text: string) => chalk.bold(colors.highlight(text)),
	assistantLabel : (text: string) => chalk.bold(colors.secondary(text)),
	userSurface    : background("userSurface"),
	/** Assistant prose stays on the terminal canvas; only user input owns a transcript surface. */
	assistantSurface: foreground("foreground"),
	/** Operational notices remain bounded surfaces and are not mistaken for assistant prose. */
	noticeSurface             : background("assistantSurface"),
	reasoning                 : (text: string) => chalk.italic(colors.muted(text)),
	activity                  : (text: string) => chalk.italic(colors.secondary(text)),
	executionSurface          : background("toolPendingSurface"),
	executionSurfacePending   : background("toolPendingSurface"),
	executionSurfacePassed    : background("toolSuccessSurface"),
	executionSurfaceFailed    : background("toolErrorSurface"),
	executionSurfaceCancelled : background("toolWarningSurface"),
	executionCommand          : (text: string) => chalk.bold(colors.accent(text)),
	executionOutput           : colors.muted,
	narration                 : colors.accent,
	toolPending               : colors.muted,
	toolRunning               : colors.highlight,
	toolPassed                : colors.success,
	toolFailed                : colors.error,
	toolCancelled             : colors.warning,
	diffAdded                 : colors.success,
	diffRemoved               : colors.error,
	diffContext               : colors.muted,
	effortLow                 : colors.muted,
	effortMedium              : colors.accent,
	effortHigh                : colors.highlight,
	effortUltra               : colors.warm,
} as const;

export const selectListTheme: SelectListTheme = {
	selectedPrefix : colors.accent,
	selectedText   : (text) => chalk.bold(colors.text(text)),
	description    : colors.muted,
	scrollInfo     : colors.muted,
	noMatch        : colors.warning,
};

export const editorTheme: EditorTheme = {
	borderColor: colors.border,
	selectList: selectListTheme,
};

let syntaxTheme: TuiThemeName | undefined;
let syntaxPlugin: ReturnType<typeof createNativeSyntaxHighlightPlugin> | undefined;
function currentSyntaxPlugin(): ReturnType<typeof createNativeSyntaxHighlightPlugin> {
	const theme = getActiveTuiTheme();
	if (!syntaxPlugin || syntaxTheme !== theme) {
		syntaxTheme = theme;
		syntaxPlugin = createNativeSyntaxHighlightPlugin({
			comment     : palette.muted,
			keyword     : palette.blue,
			function    : palette.teal,
			variable    : palette.foreground,
			string      : palette.amber,
			number      : palette.orange,
			type        : palette.steel,
			operator    : palette.amber,
			punctuation : palette.muted,
			inserted    : palette.success,
			deleted     : palette.red,
		});
	}
	return syntaxPlugin;
}

export const syntaxHighlightPlugin = {
	name      : "gajae-native-tree-sitter",
	supports  : (language: string) => currentSyntaxPlugin().supports(language),
	highlight : (code: string, language?: string) => currentSyntaxPlugin().highlight(code, language),
};

export const markdownTheme: MarkdownTheme = {
	heading         : (text) => colors.accent(chalk.bold(text)),
	link            : text => chalk.underline(colors.accent(text)),
	linkUrl         : colors.muted,
	code            : (text) => background("panel", "amber")(` ${text} `),
	codeBlock       : colors.text,
	codeBlockBorder : colors.warm,
	quote           : text => chalk.italic(colors.text(text)),
	quoteBorder     : colors.secondary,
	hr              : colors.border,
	listBullet      : colors.accent,
	bold            : chalk.bold,
	italic          : chalk.italic,
	strikethrough   : chalk.strikethrough,
	underline       : chalk.underline,
	highlightCode   : (code, language) => syntaxHighlightPlugin.highlight(code, language),
	codeBlockIndent : "  ",
};

/** Gruvbox orange → aqua → yellow stops for the WWW landmark glyph. */
const GRADIENT_STOPS: ReadonlyArray<readonly [number, number, number]> = [
	[254, 128, 25],
	[131, 165, 152],
	[250, 189, 47],
];

function gradientColorAt(position: number): (text: string) => string {
	const clamped  = Math.min(1, Math.max(0, position))                       ;
	const segment  = clamped * (GRADIENT_STOPS.length - 1)                    ;
	const index    = Math.min(GRADIENT_STOPS.length - 2, Math.floor(segment)) ;
	const fraction = segment - index                                          ;
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
	const rows    = lines.length                                                 ;
	const columns = Math.max(1, ...lines.map((line) => Array.from(line).length)) ;
	const span    = Math.max(1, columns + rows - 1)                              ;
	return lines.map((line, row) =>
		Array.from(line).map((character, column) =>
			character === " "
				? character
				: gradientColorAt((column + (rows - 1 - row)) / span)(character)
		).join("")
	);
}

/** Moving teal-to-amber highlight for live activity text; visible cells stay stable. */
export function activityGradientFrame(text: string, frame: number): string {
	const characters = Array.from(text);
	const span = Math.max(1, characters.length);
	return characters.map((character, column) => {
		if (character === " ") return character;
		const position = ((column - frame) % span + span) % span / span;
		return gradientColorAt(position)(character);
	}).join("");
}

/** Animated Composer focus border; callers advance the frame on their render clock. */
export function composerBorderColor(frame: number): (text: string) => string {
	return chalk.hex(composerBorderHex(frame));
}

function mixHex(start: string, end: string, amount: number): string {
	const clamped = Math.min(1, Math.max(0, amount));
	const channel = (value: string, offset: number): number => Number.parseInt(value.slice(offset, offset + 2), 16);
	const mixed = [1, 3, 5].map((offset) =>
		Math.round(channel(start, offset) + (channel(end, offset) - channel(start, offset)) * clamped)
			.toString(16)
			.padStart(2, "0")
	);
	return `#${mixed.join("")}`;
}

export function composerBorderHex(frame: number): string {
	const position = (frame % 24) / 23;
	if (position <= 0.5) return mixHex(palette.orange, palette.teal, position * 2);
	return mixHex(palette.teal, palette.amber, (position - 0.5) * 2);
}

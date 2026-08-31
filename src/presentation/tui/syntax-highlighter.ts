import {
	highlightCode as nativeHighlightCode,
	supportsLanguage as nativeSupportsLanguage,
	type HighlightColors,
} from "@gajae-code/natives";

const MAX_HIGHLIGHT_BYTES = 200_000;
const MAX_HIGHLIGHT_LINES = 2_000;

export interface SyntaxPalette {
	comment: string;
	keyword: string;
	function: string;
	variable: string;
	string: string;
	number: string;
	type: string;
	operator: string;
	punctuation: string;
	inserted: string;
	deleted: string;
}

/** Replaceable Markdown syntax-coloring boundary; it never owns transcript data. */
export interface SyntaxHighlightPlugin {
	readonly name: string;
	supports(language: string): boolean;
	highlight(code: string, language?: string): string[];
}

function foregroundAnsi(hex: string): string {
	const match = /^#([\da-f]{2})([\da-f]{2})([\da-f]{2})$/iu.exec(hex);
	if (!match) throw new Error(`유효하지 않은 syntax 색상입니다: ${hex}`);
	return `\u001b[38;2;${Number.parseInt(match[1], 16)};${Number.parseInt(match[2], 16)};${Number.parseInt(match[3], 16)}m`;
}

function nativeColors(palette: SyntaxPalette): HighlightColors {
	return {
		comment: foregroundAnsi(palette.comment),
		keyword: foregroundAnsi(palette.keyword),
		function: foregroundAnsi(palette.function),
		variable: foregroundAnsi(palette.variable),
		string: foregroundAnsi(palette.string),
		number: foregroundAnsi(palette.number),
		type: foregroundAnsi(palette.type),
		operator: foregroundAnsi(palette.operator),
		punctuation: foregroundAnsi(palette.punctuation),
		inserted: foregroundAnsi(palette.inserted),
		deleted: foregroundAnsi(palette.deleted),
	};
}

function exceedsHighlightBudget(code: string): boolean {
	if (Buffer.byteLength(code, "utf8") > MAX_HIGHLIGHT_BYTES) return true;
	let lines = 1;
	for (const character of code) {
		if (character === "\n" && ++lines > MAX_HIGHLIGHT_LINES) return true;
	}
	return false;
}

export function createNativeSyntaxHighlightPlugin(palette: SyntaxPalette): SyntaxHighlightPlugin {
	const colors = nativeColors(palette);
	const plainColor = foregroundAnsi(palette.variable);
	const plain = (code: string) => code.split("\n").map((line) => `${plainColor}${line}\u001b[39m`);
	return {
		name: "gajae-native-tree-sitter",
		supports: nativeSupportsLanguage,
		highlight(code, language) {
			if (exceedsHighlightBudget(code)) return plain(code);
			const supportedLanguage = language && nativeSupportsLanguage(language) ? language : undefined;
			try {
				return nativeHighlightCode(code, supportedLanguage, colors).split("\n");
			} catch {
				return plain(code);
			}
		},
	};
}

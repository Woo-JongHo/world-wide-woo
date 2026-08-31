import { describe, expect, test } from "bun:test";
import { stripTerminalSequences, visibleWidth } from "@earendil-works/pi-tui";
import { syntaxHighlightPlugin } from "../src/presentation/tui/theme";

describe("native syntax highlight plugin", () => {
	test("colors supported Python tokens without changing terminal width", () => {
		const source = "def generate_lotto():\n    return \"행운\"";
		const lines = syntaxHighlightPlugin.highlight(source, "python");
		expect(syntaxHighlightPlugin.name).toBe("gajae-native-tree-sitter");
		expect(syntaxHighlightPlugin.supports("python")).toBe(true);
		expect(lines.join("\n")).toContain("\u001b[38;2;");
		expect(stripTerminalSequences(lines.join("\n"))).toBe(source);
		expect(lines.map(visibleWidth)).toEqual(source.split("\n").map(visibleWidth));
	});

	test("renders an unknown language safely", () => {
		const source = "alpha < beta";
		const lines = syntaxHighlightPlugin.highlight(source, "www-unknown-language");
		expect(stripTerminalSequences(lines.join("\n"))).toBe(source);
	});
});

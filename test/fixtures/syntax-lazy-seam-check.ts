import { mock } from "bun:test";

let moduleLoads = 0;
let supportsCalls = 0;
let highlightCalls = 0;
const highlightLanguages: Array<string | undefined> = [];

mock.module("@gajae-code/natives", () => {
	moduleLoads++;
	return {
		supportsLanguage(language: string) {
			supportsCalls++;
			return language === "typescript";
		},
		highlightCode(code: string, language: string | undefined, colors: { keyword: string }) {
			highlightCalls++;
			highlightLanguages.push(language);
			if (code === "throw") throw new Error("synthetic native failure");
			return `${colors.keyword}${code}\u001b[39m`;
		},
	};
});

function plain(value: string): string {
	return value.replace(/\u001b\[[0-9;]*m/gu, "");
}

function assert(condition: unknown, message: string): asserts condition {
	if (!condition) throw new Error(message);
}

function assertCount(actual: number, expected: number, message: string): void {
	if (actual !== expected) throw new Error(`${message}: expected ${expected}, received ${actual}`);
}

try {
	const { createNativeSyntaxHighlightPlugin } = await import(
		"../../src/adapters/inbound/tui/foundation/theme/syntax-highlighter.js"
	);
	assertCount(moduleLoads, 0, "module import loaded the native adapter");

	const plugin = createNativeSyntaxHighlightPlugin({
		comment: "#111111",
		keyword: "#222222",
		function: "#333333",
		variable: "#444444",
		string: "#555555",
		number: "#666666",
		type: "#777777",
		operator: "#888888",
		punctuation: "#999999",
		inserted: "#aaaaaa",
		deleted: "#bbbbbb",
	});
	assertCount(moduleLoads, 0, "plugin creation loaded the native adapter");

	const oversized = "x".repeat(200_001);
	assert(plain(plugin.highlight(oversized, "typescript").join("\n")) === oversized, "oversized fallback changed content");
	assertCount(moduleLoads, 0, "oversized fallback loaded the native adapter");
	assertCount(highlightCalls, 0, "oversized fallback called native highlight");

	assert(plugin.supports("typescript"), "supported language was rejected");
	assertCount(moduleLoads, 1, "supports did not load the native adapter exactly once");
	assertCount(supportsCalls, 1, "supports call count changed");

	assert(plain(plugin.highlight("const answer = 42", "typescript").join("\n")) === "const answer = 42", "highlight changed content");
	assertCount(moduleLoads, 1, "highlight reloaded the native adapter");
	assertCount(highlightCalls, 1, "highlight call count changed");

	assert(plain(plugin.highlight("alpha", "unknown").join("\n")) === "alpha", "unknown-language fallback changed content");
	assert(highlightLanguages.at(-1) === undefined, "unknown language reached native highlight as supported");

	assert(plain(plugin.highlight("throw", "typescript").join("\n")) === "throw", "exception fallback changed content");
	assertCount(moduleLoads, 1, "exception fallback reloaded the native adapter");

	console.log(JSON.stringify({ moduleLoads, supportsCalls, highlightCalls, highlightLanguages }));
} finally {
	mock.restore();
}

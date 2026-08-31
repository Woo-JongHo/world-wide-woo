import { describe, expect, test } from "bun:test";
import { stripTerminalSequences, visibleWidth } from "@earendil-works/pi-tui";
import type { CommandResultSnapshot, DiffResultSnapshot, GenericToolResultSnapshot } from "../src/domain/output";
import { BashResultCard, CompletionSummaryCard, DiffResultCard, GenericToolResultCard } from "../src/presentation/tui/result-cards";
import { semantic } from "../src/presentation/tui/theme";

function snapshot(overrides: Partial<CommandResultSnapshot> = {}): CommandResultSnapshot {
	return {
		id: "command-1",
		shell: "bash",
		command: "printf hello",
		cwd: "/workspace",
		status: "passed",
		stdout: "hello",
		stderr: "",
		startedAt: 1,
		durationMs: 12,
		exitCode: 0,
		...overrides,
	};
}

describe("BashResultCard", () => {
	test("renders every lifecycle status with its themed label", () => {
		const expected = {
			pending: semantic.toolPending("PENDING"),
			running: semantic.toolRunning("RUNNING"),
			passed: semantic.toolPassed("PASSED"),
			failed: semantic.toolFailed("FAILED"),
			cancelled: semantic.toolCancelled("CANCELLED"),
		};
		for (const status of ["pending", "running", "passed", "failed", "cancelled"] as const) {
			const lines = new BashResultCard(snapshot({ status })).render(100);
			expect(lines.join("\n")).toContain(expected[status]);
		}
	});

	test("groups stdout and stderr and shows failed exit details", () => {
		const lines = new BashResultCard(snapshot({
			status: "failed",
			stdout: "normal output",
			stderr: "failure output",
			exitCode: 17,
			durationMs: 320,
		})).render(100);
		const text = stripTerminalSequences(lines.join("\n"));
		expect(text).toContain("stdout");
		expect(text).toContain("normal output");
		expect(text).toContain("stderr");
		expect(text).toContain("failure output");
		expect(text).toContain("exit 17 · 320ms");
	});

	test("limits output lines and removes terminal controls", () => {
		const lines = new BashResultCard(snapshot({
			command: "echo \u001b[31munsafe\u001b[0m\u0007",
			cwd: "/tmp/\u001b]8;;https://example.test\u0007bad\u001b]8;;\u0007",
			stdout: "one\ntwo\nthree",
			stderr: "four",
		}), 2).render(100);
		const text = stripTerminalSequences(lines.join("\n"));
		expect(text).toContain("… 2 earlier lines omitted");
		expect(text).toContain("three");
		expect(text).toContain("four");
		expect(text).not.toContain("\u001b");
		expect(text).not.toContain("\u0007");
	});

	test("preserves Korean visible width in a 40-column card", () => {
		const lines = new BashResultCard(snapshot({ command: "printf 안녕하세요 세계", stdout: "한글 출력입니다" })).render(40);
		expect(lines.every((line) => visibleWidth(line) === 40)).toBe(true);
	});
});

function generic(overrides: Partial<GenericToolResultSnapshot> = {}): GenericToolResultSnapshot {
	return {
		id: "tool-1",
		toolName: "unknown-tool",
		status: "passed",
		input: "{\"query\":\"안녕하세요\"}",
		output: "one\ntwo\nthree",
		startedAt: 1,
		durationMs: 24,
		error: undefined,
		...overrides,
	};
}

describe("GenericToolResultCard", () => {
	test("renders lifecycle labels and display-safe values", () => {
		for (const status of ["pending", "running", "passed", "failed", "cancelled"] as const) {
			const text = stripTerminalSequences(new GenericToolResultCard(generic({
				status,
				input: "unsafe=\u001b[31mnope\u001b[0m\u0007 {\"api_key\":\"supersecretvalue\"}",
				output: "bad\u0007output sk-proj-abcdefghijklmnopqrstuvwxyz",
				error: status === "failed" ? "실패" : undefined,
			})).render(100).join("\n"));
			expect(text).toContain(status.toUpperCase());
			expect(text).toContain("입력:");
			expect(text).toContain("[REDACTED]");
			expect(text).not.toContain("supersecretvalue");
			expect(text).not.toContain("sk-proj-abcdefghijklmnopqrstuvwxyz");
			expect(text).not.toContain("\u001b");
			expect(text).not.toContain("\u0007");
		}
	});

	test("bounds output and preserves visible width at narrow and wide widths", () => {
		for (const width of [40, 100]) {
			const lines = new GenericToolResultCard(generic(), 2).render(width);
			const text = stripTerminalSequences(lines.join("\n"));
			expect(text).toContain("… 1 earlier lines omitted");
			expect(lines.every((line) => visibleWidth(line) === width)).toBe(true);
		}
	});
});

describe("DiffResultCard", () => {
	test("distinguishes added, removed, and context lines without color", () => {
		const snapshot: DiffResultSnapshot = {
			id: "diff-1",
			title: "변경사항",
			status: "passed",
			diff: "\u001b[32m+ added\u001b[0m\n- removed\u0007\n context",
			startedAt: 1,
			durationMs: undefined,
			error: undefined,
		};
		for (const width of [40, 100]) {
			const lines = new DiffResultCard(snapshot).render(width);
			const text = stripTerminalSequences(lines.join("\n"));
			expect(text).toContain("+ added");
			expect(text).toContain("- removed");
			expect(text).toContain("  context");
			expect(text).not.toContain("\u001b");
			expect(text).not.toContain("\u0007");
			expect(lines.every((line) => visibleWidth(line) === width)).toBe(true);
		}
	});
});

describe("CompletionSummaryCard", () => {
	test("normalizes numbered sections, bullets, and verification", () => {
		const lines = new CompletionSummaryCard({
			title: "완료 요약",
			sections: [{ title: "구현", bullets: ["카드를 추가했습니다"] }],
			verification: ["bun test test/result-cards.test.ts"],
		}).render(100);
		const text = stripTerminalSequences(lines.join("\n"));
		expect(text).toContain("1. 구현");
		expect(text).toContain("• 카드를 추가했습니다");
		expect(text).toContain("검증");
		expect(text).toContain("• bun test test/result-cards.test.ts");
	});
});

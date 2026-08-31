import { describe, expect, test } from "bun:test";
import { stripTerminalSequences, visibleWidth } from "@earendil-works/pi-tui";
import type { CommandResultSnapshot } from "../src/domain/output";
import { BashResultCard, CompletionSummaryCard } from "../src/presentation/tui/result-cards";
import { colors } from "../src/presentation/tui/theme";

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
			pending: colors.muted("PENDING"),
			running: colors.highlight("RUNNING"),
			passed: colors.success("PASSED"),
			failed: colors.error("FAILED"),
			cancelled: colors.warning("CANCELLED"),
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

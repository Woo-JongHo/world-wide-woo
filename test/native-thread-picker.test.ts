import { describe, expect, test } from "bun:test";
import { stripTerminalSequences } from "@earendil-works/pi-tui";
import type { NativeThreadSummary } from "../src/domain/native-session";
import { NativeThreadPicker } from "../src/presentation/tui/native-thread-picker";

const threads: readonly NativeThreadSummary[] = [{
	id: "0199-thread-one",
	updatedAt: 1_788_000_100,
	cwd: "/workspace/sample",
	preview: "승인 화면 개선",
	status: "idle",
}, {
	id: "0199-thread-two",
	updatedAt: 1_788_000_000,
	cwd: "/workspace/sample",
	preview: "큐 처리 구현",
	status: "active",
}];

describe("native thread resume picker", () => {
	test("shows project threads and returns the selected native id", () => {
		const selected: string[] = [];
		const picker = new NativeThreadPicker(threads, id => { selected.push(id); }, () => undefined);
		const output = stripTerminalSequences(picker.render(100).join("\n"));
		expect(output).toContain("재개할 Codex 세션 선택");
		expect(output).toContain("승인 화면 개선");
		expect(output).toContain("큐 처리 구현");
		expect(output).toContain("idle");
		expect(output).toContain("active");

		picker.handleInput("\x1b[B");
		picker.handleInput("\r");
		expect(selected).toEqual(["0199-thread-two"]);
	});
});

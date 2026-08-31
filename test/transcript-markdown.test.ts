import { describe, expect, test } from "bun:test";
import { stripTerminalSequences, visibleWidth } from "@earendil-works/pi-tui";
import type { SessionSnapshot } from "../src/application/session-runtime";
import { TranscriptView } from "../src/presentation/tui/dashboard-views";

function snapshot(overrides: Partial<SessionSnapshot> = {}): SessionSnapshot {
	return {
		id: "markdown-test",
		phase: "ready",
		turns: [],
		draft: "",
		error: null,
		auth: { configured: true, source: "OAuth", type: "oauth" },
		settings: { provider: "anthropic", model: "claude-opus-4-6", effort: "high" },
		cwd: "/workspace/project",
		activity: null,
		...overrides,
	};
}

const PYTHON = "```python\ndef generate_lotto():\n    return [3, 12, 41]\n```";

describe("TranscriptView Markdown", () => {
	test("syntax-highlights completed fenced code", () => {
		const view = new TranscriptView(snapshot({
			turns: [{ id: "assistant-1", role: "assistant", content: PYTHON, timestamp: 1 }],
		}));
		const lines = view.render(100);
		const output = lines.join("\n");
		expect(output).toContain("\u001b[38;2;");
		expect(stripTerminalSequences(output)).toContain("def generate_lotto():");
		expect(lines.every((line) => visibleWidth(line) <= 100)).toBe(true);
	});

	test("keeps partial streaming code colored and width-safe", () => {
		const view = new TranscriptView(snapshot({
			phase: "streaming",
			turns: [{ id: "user-1", role: "user", content: "코드를 작성해줘", timestamp: 1 }],
			draft: PYTHON.slice(0, -3),
			activity: { kind: "thinking", label: "모델 추론 중" },
		}));
		const lines = view.render(40);
		const output = lines.join("\n");
		expect(output).toContain("\u001b[38;2;");
		expect(stripTerminalSequences(output)).toContain("모델 추론 중");
		expect(stripTerminalSequences(output)).toContain("return [3, 12, 41]");
		expect(lines.every((line) => visibleWidth(line) <= 100)).toBe(true);
	});

	test("labels a persisted partial assistant response as cancelled", () => {
		const view = new TranscriptView(snapshot({
			turns: [{
				id: "assistant-cancelled",
				role: "assistant",
				content: "여기까지 생성됨",
				timestamp: 1,
				outcome: "cancelled",
			}],
		}));
		expect(stripTerminalSequences(view.render(100).join("\n"))).toContain("WWW  중단됨");
	});
});

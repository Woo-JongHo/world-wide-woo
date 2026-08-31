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
		projectName: "project",
		projectRoot: "/workspace/project",
		activity: null,
		tools: [],
		narrations: [],
		...overrides,
	};
}

const PYTHON = "```python\ndef generate_lotto():\n    return [3, 12, 41]\n```";

describe("TranscriptView Markdown", () => {
	test("left-aligns role labels and message bodies at the conversation edge", () => {
		const view = new TranscriptView(snapshot({
			turns: [
				{ id: "user-left", role: "user", content: "지금 모델 뭔데?", timestamp: 1 },
				{ id: "assistant-left", role: "assistant", content: "openai-codex/gpt-5.6-sol", timestamp: 2 },
			],
		}));
		const lines = view.render(80).map(line => stripTerminalSequences(line).trimEnd());
		expect(lines[0]).toBe("사용자");
		expect(lines[1]).toBe("지금 모델 뭔데?");
		expect(lines[3]).toBe("WWW");
		expect(lines[4]).toBe("openai-codex/gpt-5.6-sol");
	});

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

	test("renders actual tool observations as boxed transcript items", () => {
		const view = new TranscriptView(snapshot({
			turns: [{ id: "user-tool", role: "user", content: "파일을 읽어", timestamp: 1 }],
			tools: [{
				id: "tool-read",
				toolName: "read",
				status: "passed",
				input: "{\"path\":\"src/app.ts\"}",
				output: "export async function main() {}",
				startedAt: 2,
				durationMs: 3,
				error: undefined,
			}],
		}));
		const output = stripTerminalSequences(view.render(80).join("\n"));
		expect(output).toContain("╭");
		expect(output).toContain("read · PASSED");
		expect(output).toContain("src/app.ts");
		expect(output).toContain("╰");
	});

	test("renders truthful work narration before the corresponding tool card", () => {
		const view = new TranscriptView(snapshot({
			narrations: [{
				id: "narration-1",
				turnId: "turn-1",
				toolCallId: "tool-read",
				timestamp: new Date(2).toISOString(),
				label: "파일 확인 · src/app.ts",
			}],
			tools: [{
				id: "tool-read",
				toolName: "read",
				status: "passed",
				input: "{\"path\":\"src/app.ts\"}",
				output: "ok",
				startedAt: 3,
				durationMs: 1,
				error: undefined,
			}],
		}));
		const output = stripTerminalSequences(view.render(80).join("\n"));
		expect(output.indexOf("파일 확인 · src/app.ts")).toBeLessThan(output.indexOf("read · PASSED"));
	});
});

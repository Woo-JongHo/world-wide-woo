import { describe, expect, test } from "bun:test";
import { stripTerminalSequences, visibleWidth } from "@earendil-works/pi-tui";
import type { WorkbenchSnapshot } from "../src/domain/workbench";
import { projectWorkFlow } from "../src/domain/work-steps";
import { WorkbenchChatView } from "../src/presentation/tui/workbench-views";

function activity(id: string, sequence: number, turnId: string, itemId = id) {
	return {
		schemaVersion: 1 as const, id, projectId: "acceptance", sequence,
		recordedAt: "2026-09-07T00:00:00.000Z", kind: "message" as const, phase: "completed" as const,
		provider: "openai-codex", nativeRefs: { threadId: "thread", turnId, itemId },
		sourceDigest: `sha256:${"a".repeat(64)}`, payload: { role: "assistant", text: id },
	};
}

function fixture(overrides: Partial<WorkbenchSnapshot> = {}): WorkbenchSnapshot {
	const first = activity("first", 1, "turn-1");
	return {
		projectId: "acceptance", revision: 1, journalSequence: 1, phase: "ready", mcpServers: [],
		threadId: "thread", activeTurnId: null, activities: [first], selectedActivityId: null,
		pendingApproval: null,
		chat: [{ id: "first", role: "assistant", content: "첫 답변", activityId: "first", status: "completed" }],
		chatQueue: [], draft: "", reasoningDraft: "", liveActivity: null, workFlow: projectWorkFlow([]),
		tnotes: [], todo: null, actionResult: null, error: null, ...overrides,
	};
}

describe("Chat renderer completion", () => {
	// @linear WOO-686 WOO-689
	test.each([40, 80, 120])("renders readable Markdown, plain unsupported code, and ANSI-safe rows at %i columns", (width) => {
		const content = [
			"## 제목",
			"",
			"- 항목 **강조**",
			"",
			"```unsupported-language",
			`const value = "safe";${String.fromCharCode(27)}[31m`,
			"```",
		].join("\n");
		const snapshot = fixture({ chat: [{ id: "first", role: "assistant", content, activityId: "first", status: "completed" }] });
		const rows = new WorkbenchChatView(snapshot).render(width);
		const plain = stripTerminalSequences(rows.join("\n"));
		expect(plain).toContain("제목");
		expect(plain).toContain("항목 강조");
		expect(plain).toContain("const value");
		expect(plain).not.toContain("[31m");
		expect(rows.every((row) => visibleWidth(row) <= width)).toBe(true);
	});

	// @linear WOO-687 WOO-691
	test("shows malformed roles and statuses explicitly while preserving safe text and later messages", () => {
		const activities = [activity("bad-role", 1, "turn-1"), activity("bad-status", 2, "turn-2"), activity("after", 3, "turn-3")];
		const snapshot = fixture({
			activities,
			chat: [
				{ id: "bad-role", role: "alien", content: "<analysis>PRIVATE</analysis>\n<answer>역할 오류 본문</answer>", activityId: "bad-role", status: "completed" },
				{ id: "bad-status", role: "assistant", content: "상태 오류 본문", activityId: "bad-status", status: "mystery" },
				{ id: "after", role: "assistant", content: "다음 메시지 보존", activityId: "after", status: "completed" },
			] as unknown as WorkbenchSnapshot["chat"],
		});
		const output = stripTerminalSequences(new WorkbenchChatView(snapshot).render(80).join("\n"));
		expect(output).toContain("알 수 없는 메시지 역할 · alien");
		expect(output).toContain("역할 오류 본문");
		expect(output).not.toContain("PRIVATE");
		expect(output).toContain("알 수 없는 상태 · mystery");
		expect(output).toContain("상태 오류 본문");
		expect(output).toContain("다음 메시지 보존");
	});

	// @linear WOO-691
	test("isolates a Markdown renderer failure to one message", () => {
		const activities = [activity("broken", 1, "turn-1"), activity("after", 2, "turn-2")];
		const snapshot = fixture({ activities, chat: [
			{ id: "broken", role: "assistant", content: "<analysis>PRIVATE</analysis>\n<answer>안전한 원문</answer>", activityId: "broken", status: "completed" },
			{ id: "after", role: "assistant", content: "뒤 메시지", activityId: "after", status: "completed" },
		] });
		const view = new WorkbenchChatView(snapshot);
		const markdown = (view as unknown as { markdown: Map<string, { render(width: number): string[] }> }).markdown;
		markdown.set("broken", { render: () => { throw new Error("malformed markdown"); } });
		const output = stripTerminalSequences(view.render(80).join("\n"));
		expect(output).toContain("안전한 원문");
		expect(output).not.toContain("PRIVATE");
		expect(output).toContain("뒤 메시지");
	});

	// @linear WOO-718
	test("keeps execution cards with the same item id in separate turns and chronological order", () => {
		const first = { ...activity("tool-a", 1, "turn-a", "shared"), kind: "tool" as const, payload: { command: "first-command" } };
		const second = { ...activity("tool-b", 2, "turn-b", "shared"), kind: "tool" as const, payload: { command: "second-command" } };
		const snapshot = fixture({
			activities: [first, second],
			chat: [{ id: "optimistic", role: "user", content: "실행", activityId: "pending", status: "streaming" }],
			workFlow: projectWorkFlow([]),
		});
		const output = stripTerminalSequences(new WorkbenchChatView(snapshot).render(80).join("\n"));
		expect(output).toContain("first-command");
		expect(output).toContain("second-command");
		expect(output).toContain("/source tool-a");
		expect(output).toContain("/source tool-b");
		expect(output.indexOf("first-command")).toBeLessThan(output.indexOf("second-command"));
	});
	// @linear WOO-691
	test.each(["failed", "cancelled", "streaming"] as const)("sanitizes body-bearing %s messages without partial metadata", status => {
		const snapshot = fixture({ chat: [{ id: "first", role: "assistant", content: "<analysis>PRIVATE</analysis>\n<answer>공개</answer>", activityId: "first", status }] });
		const output = stripTerminalSequences(new WorkbenchChatView(snapshot).render(80).join("\n"));
		expect(output).not.toContain("PRIVATE");
		expect(output).toContain("공개");
	});

});

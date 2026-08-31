import { describe, expect, test } from "bun:test";
import { parseTodoMarkdown, renderTodoMarkdown, todoProgress, validateTodoDocument } from "../src/domain/todos.js";

const document = {
	version: 1 as const,
	revision: 4,
	ownerSessionId: "session_1",
	storyId: "story_1",
	title: "Release work",
	items: [
		{ id: "one", content: "Ship this", status: "completed" as const, evidenceIds: ["evt_1"] },
		{ id: "two", content: "Review this", status: "in_progress" as const, evidenceIds: [] },
		{ id: "three", content: "Wait on input", status: "blocked" as const, evidenceIds: [] },
	],
	updatedAt: "2026-08-31T07:55:00.000Z",
};

describe("todo domain", () => {
	test("round trips strict markdown with visible status prefixes", () => {
		const markdown = renderTodoMarkdown(document);
		expect(markdown).toContain("- [x] Ship this");
		expect(markdown).toContain("- [ ] 진행 중: Review this");
		expect(markdown).toContain("- [ ] 막힘: Wait on input");
		expect(parseTodoMarkdown(markdown)).toEqual(document);
	});

	test("reports progress and rejects a second active item", () => {
		expect(todoProgress(validateTodoDocument(document))).toEqual({ total: 3, completed: 1, active: 1, pending: 0, blocked: 1 });
		expect(() => validateTodoDocument({ ...document, items: [...document.items, { id: "four", content: "Also active", status: "in_progress", evidenceIds: [] }] })).toThrow("at most one");
	});

	test("strips controls and redacts credential material before display", () => {
		const safe = validateTodoDocument({ ...document, items: [{ id: "one", content: "\u001b[31mapi_key: 'super-secret' token=plain-secret sk-abcdefghijklmnopqrstuvwxyz github_pat_abcdefghijklmnopqrstuvwxyz\nDone", status: "pending", evidenceIds: [] }] });
		expect(safe.items[0]?.content).toBe("api_key: [REDACTED] token: [REDACTED] [REDACTED] [REDACTED] Done");
	});

	test("removes terminal and HTML-comment injection while preserving round trips", () => {
		const safe = validateTodoDocument({
			...document,
			items: [{
				id: "one",
				content: "\u001b]8;;https://example.test\u0007linked\u001b]8;;\u0007 <!-- forged -->",
				status: "pending",
				evidenceIds: [],
			}],
		});
		expect(safe.items[0]?.content).toBe("linked forged");
		expect(parseTodoMarkdown(renderTodoMarkdown(safe))).toEqual(safe);
	});

	test("round trips content that begins with visible status words", () => {
		const safe = validateTodoDocument({
			...document,
			items: [
				{ id: "one", content: "진행 중: 리뷰", status: "pending", evidenceIds: [] },
				{ id: "two", content: "막힘: 원인 기록", status: "in_progress", evidenceIds: [] },
			],
		});
		expect(parseTodoMarkdown(renderTodoMarkdown(safe))).toEqual(safe);
	});

	test("fails closed for malformed metadata, unknown versions, duplicate ids, and invalid states", () => {
		const markdown = renderTodoMarkdown(document);
		expect(() => parseTodoMarkdown(markdown.replace('"version":1', '"version":2'))).toThrow();
		expect(() => parseTodoMarkdown(markdown.replace('"id":"two"', '"id":"one"'))).toThrow("duplicate");
		expect(() => parseTodoMarkdown(markdown.replace('"status":"blocked"', '"status":"unknown"'))).toThrow();
		expect(() => parseTodoMarkdown(markdown.replace("- [x] Ship this", "- [ ] Ship this"))).toThrow("checkbox");
		expect(() => validateTodoDocument({
			...document,
			items: [{ id: "one", content: "Too much evidence", status: "pending", evidenceIds: Array.from({ length: 9 }, (_, index) => `evt_${index}`) }],
		})).toThrow("evidence");
	});
});

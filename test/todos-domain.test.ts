import { describe, expect, test } from "bun:test";
import { parseTodoMarkdown, patchTodoMarkdown, renderTodoMarkdown, todoDetailProgress, todoProgress, validateTodoDocument } from "../src/domain/todos.js";

const document = {
	version: 1 as const,
	revision: 4,
	ownerSessionId: "session_1",
	storyId: "story_1",
	title: "Release work",
	items: [
		{ id: "one", content: "Ship this", status: "completed" as const, evidenceIds: ["evt_1"], details: [] },
		{ id: "two", content: "Review this", status: "in_progress" as const, evidenceIds: [], details: [{ id: "two_detail", content: "Check release notes", status: "in_progress" as const, evidenceIds: ["evt_2"] }] },
		{ id: "three", content: "Wait on input", status: "blocked" as const, evidenceIds: [], details: [] },
	],
	updatedAt: "2026-08-31T07:55:00.000Z",
};

describe("todo domain", () => {
	test("round trips strict markdown with visible status prefixes", () => {
		const markdown = renderTodoMarkdown(document);
		expect(markdown).toContain("- [x] Ship this");
		expect(markdown).toContain("- [ ] 진행 중: Review this");
		expect(markdown).toContain("  - [ ] 진행 중: Check release notes");
		expect(markdown).toContain("- [ ] 막힘: Wait on input");
		const parsed = parseTodoMarkdown(markdown);
		expect(parsed).toEqual(document);
		expect(Object.isFrozen(parsed.items)).toBe(true);
		expect(Object.isFrozen(parsed.items[1]?.details)).toBe(true);
	});

	test("patches managed CRLF ranges without changing unknown Markdown", () => {
		const source = renderTodoMarkdown(document)
			.replace("\n\n", "\n\n> Obsidian note\n\n- [ ] human checkbox\n")
			.replaceAll("\n", "\r\n");
		const next = validateTodoDocument({
			...document,
			revision: 5,
			title: "Release work updated",
			items: document.items.map(item => item.id === "three" ? { ...item, content: "Wait for approval" } : item),
		});
		const patched = patchTodoMarkdown(source, next);
		expect(patched).toContain("> Obsidian note\r\n\r\n- [ ] human checkbox\r\n");
		expect(patched).toContain("Wait for approval");
		expect(patched.replaceAll("\r\n", "")).not.toContain("\n");
		expect(parseTodoMarkdown(patched)).toEqual(next);
	});

	test("preserves each unowned Markdown line ending in a mixed LF and CRLF document", () => {
		const source = renderTodoMarkdown(document)
			.replace("\n\n", "\r\n> keep CRLF\n- [ ] human checkbox\r\n");
		const next = validateTodoDocument({
			...document,
			revision: 5,
			title: "Release work updated",
			items: document.items.map(item => item.id === "three" ? { ...item, content: "Wait for approval" } : item),
		});
		const patched = patchTodoMarkdown(source, next);
		expect(source).toContain("> keep CRLF\n- [ ] human checkbox\r\n");
		expect(patched).toContain("> keep CRLF\n- [ ] human checkbox\r\n");
		expect(patched).toContain("Wait for approval");
		expect(parseTodoMarkdown(patched)).toEqual(next);
	});

	test("reports progress and rejects a second active item", () => {
		const validated = validateTodoDocument(document);
		expect(todoProgress(validated)).toEqual({ total: 3, completed: 1, active: 1, pending: 0, blocked: 1 });
		expect(todoDetailProgress(validated)).toEqual({ total: 1, completed: 0, active: 1, pending: 0, blocked: 0 });
		expect(() => validateTodoDocument({ ...document, items: [...document.items, { id: "four", content: "Also active", status: "in_progress", evidenceIds: [], details: [] }] })).toThrow("at most one");
	});

	test("strips controls and redacts credential material before display", () => {
		const safe = validateTodoDocument({ ...document, items: [{ id: "one", content: "\u001b[31mapi_key: 'super-secret' token=plain-secret sk-abcdefghijklmnopqrstuvwxyz github_pat_abcdefghijklmnopqrstuvwxyz\nDone", status: "pending", evidenceIds: [], details: [{ id: "detail", content: "password=secret\u0007", status: "pending", evidenceIds: [] }] }] });
		expect(safe.items[0]?.content).toBe("api_key: [REDACTED] token: [REDACTED] [REDACTED] [REDACTED] Done");
		expect(safe.items[0]?.details[0]?.content).toBe("password: [REDACTED]");
	});

	test("removes terminal and HTML-comment injection while preserving round trips", () => {
		const safe = validateTodoDocument({
			...document,
			items: [{
				id: "one",
				content: "\u001b]8;;https://example.test\u0007linked\u001b]8;;\u0007 <!-- forged -->",
				status: "pending",
				evidenceIds: [],
				details: [],
			}],
		});
		expect(safe.items[0]?.content).toBe("linked forged");
		expect(parseTodoMarkdown(renderTodoMarkdown(safe))).toEqual(safe);
	});

	test("round trips content that begins with visible status words", () => {
		const safe = validateTodoDocument({
			...document,
			items: [
				{ id: "one", content: "진행 중: 리뷰", status: "pending", evidenceIds: [], details: [] },
				{ id: "two", content: "막힘: 원인 기록", status: "in_progress", evidenceIds: [], details: [] },
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
			items: [{ id: "one", content: "Too much evidence", status: "pending", evidenceIds: Array.from({ length: 9 }, (_, index) => `evt_${index}`), details: [] }],
		})).toThrow("evidence");
	});

	test("normalizes legacy flat documents and rejects orphan, nested, and invalid detail states", () => {
		const legacy = validateTodoDocument({ ...document, items: [{ id: "one", content: "Legacy", status: "pending", evidenceIds: [] }] });
		expect(legacy.items[0]?.details).toEqual([]);
		const markdown = renderTodoMarkdown(document);
		expect(() => parseTodoMarkdown(markdown.replace("  - [ ]", "   - [ ]"))).toThrow("indentation");
		expect(() => parseTodoMarkdown(markdown.replace("- [x] Ship this", "  - [x] Ship this"))).toThrow("orphan");
		expect(() => validateTodoDocument({ ...document, items: [{ id: "parent", content: "Done", status: "completed", evidenceIds: [], details: [{ id: "detail", content: "Not done", status: "pending", evidenceIds: [] }] }] })).toThrow("completed");
		expect(() => validateTodoDocument({ ...document, items: [{ id: "parent", content: "Pending", status: "pending", evidenceIds: [], details: [{ id: "detail", content: "Active", status: "in_progress", evidenceIds: [] }] }] })).toThrow("active");
		expect(() => validateTodoDocument({ ...document, items: [{ id: "parent", content: "Work", status: "in_progress", evidenceIds: [], details: [{ id: "parent", content: "Duplicate", status: "pending", evidenceIds: [] }] }] })).toThrow("duplicate");
		expect(() => validateTodoDocument({ ...document, items: [{ id: "parent", content: "Work", status: "in_progress", evidenceIds: [], details: Array.from({ length: 9 }, (_, index) => ({ id: `detail_${index}`, content: "Detail", status: "pending" as const, evidenceIds: [] })) }] })).toThrow("detail count");
	});
});

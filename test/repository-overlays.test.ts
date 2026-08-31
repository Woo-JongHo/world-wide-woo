import { describe, expect, test } from "bun:test";
import { stripTerminalSequences, visibleWidth } from "@earendil-works/pi-tui";
import type { RepositoryInsights } from "../src/application/ports";
import { OverlaySheet } from "../src/presentation/tui/overlay-sheet";
import { IssueListOverlay, RepositoryActivityOverlay } from "../src/presentation/tui/repository-overlays";

const repository: RepositoryInsights = {
	snapshot: async () => ({
		root: "/workspace/www",
		branch: "main",
		upstream: "origin/main",
		ahead: 1,
		behind: 0,
		changedFiles: [{ path: "src/한글.ts", kind: "modified", staged: false, unstaged: true, untracked: false }],
		head: { id: "a".repeat(40), shortId: "abc1234", subject: "fix: current", author: "Woo", authoredAt: "2026-08-31T00:00:00Z" },
	}),
	recentCommits: async () => [
		{ id: "a".repeat(40), shortId: "abc1234", subject: "fix: current", author: "Woo", authoredAt: "2026-08-31T00:00:00Z" },
	],
	issues: async () => [
		{ number: 7, title: "TUI 입력 개선", state: "open", labels: ["enhancement"], updatedAt: "2026-08-31T00:00:00Z", url: "https://example.test/7" },
	],
};

const settle = () => new Promise(resolve => setTimeout(resolve, 0));

describe("repository overlays", () => {
	test("renders real commit status inside a width-safe sheet", async () => {
		let updates = 0;
		const panel = new RepositoryActivityOverlay(repository, () => { updates++; }, () => undefined);
		panel.start();
		await settle();
		const lines = new OverlaySheet(panel).render(72);
		const text = stripTerminalSequences(lines.join("\n"));
		expect(text).toContain("Commit · 작업 트리");
		expect(text).toContain("main");
		expect(text).toContain("src/한글.ts");
		expect(text).toContain("abc1234 fix: current");
		expect(lines.every(line => visibleWidth(line) === 72)).toBe(true);
		expect(updates).toBeGreaterThanOrEqual(2);
	});

	test("renders open GitHub issues and closes with Escape", async () => {
		let closed = false;
		const panel = new IssueListOverlay(repository, () => undefined, () => { closed = true; });
		panel.start();
		await settle();
		const text = stripTerminalSequences(panel.render(60).join("\n"));
		expect(text).toContain("GitHub Issues · Open");
		expect(text).toContain("#7 TUI 입력 개선 [enhancement]");
		panel.handleInput("\u001b");
		expect(closed).toBe(true);
	});
});

import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";

function ids(markdown: string, pattern: RegExp): string[] {
	return [...markdown.matchAll(pattern)].map(match => match[1]!).filter(Boolean);
}

describe("project planning documents", () => {
	test("keeps durable Epics and Stories as separate append-oriented catalogs", async () => {
		const [epics, stories] = await Promise.all([
			readFile(".www/Epics.md", "utf8"),
			readFile(".www/Stories.md", "utf8"),
		]);
		const epicIds = ids(epics, /^## (EP-\d{3})\b/gmu);
		const storyIds = ids(stories, /^- \[[ x]\] (ST-\d{3}-\d{2})\b/gmu);
		expect(epicIds.length).toBeGreaterThan(0);
		expect(new Set(epicIds).size).toBe(epicIds.length);
		expect(storyIds.length).toBeGreaterThan(epicIds.length);
		expect(new Set(storyIds).size).toBe(storyIds.length);
		for (const storyId of storyIds) expect(epicIds).toContain(`EP-${storyId.slice(3, 6)}`);
		expect(epics).toContain("새 Epic은 파일 끝에 추가");
		expect(stories).toContain("새 Story는 부모 Epic 구역의 끝에 추가");
		expect(epics).not.toMatch(/^- \[[ x]\] ST-/mu);
	});
});

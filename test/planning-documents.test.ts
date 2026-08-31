import { describe, expect, test } from "bun:test";
import { access, readFile } from "node:fs/promises";
import { join } from "node:path";

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

	test("links the v1 Initiative, catalog, immutable artifacts, and current Map", async () => {
		const root = ".www/planning/001-planning-package-v1";
		const [map, contract, manifestRaw, catalog, epics, stories] = await Promise.all([
			readFile(".www/Map.md", "utf8"),
			readFile(".www/planning/README.md", "utf8"),
			readFile(join(root, "INITIATIVE.json"), "utf8"),
			readFile(".www/planning/catalog.jsonl", "utf8"),
			readFile(".www/Epics.md", "utf8"),
			readFile(".www/Stories.md", "utf8"),
		]);
		const manifest = JSON.parse(manifestRaw) as { id: string; artifacts: Array<{ id: string; path: string }> };
		expect(manifest.id).toBe("INIT-001");
		expect(contract).toContain("Why");
		expect(contract).toContain("How");
		expect(contract).toContain("Outcome");
		expect(contract).toContain("Work");
		expect(map).toContain("Planning navigation");
		for (const artifact of manifest.artifacts) await access(join(root, artifact.path));
		const records = catalog.trim().split("\n").map(line => JSON.parse(line) as { revision: number; artifact: { id: string } });
		expect(records.map(record => record.revision)).toEqual(records.map((_, index) => index + 1));
		expect(new Set(records.map(record => record.artifact.id)).size).toBe(records.length);
		expect(epics).toContain("EP-010 | Project-local Planning Package v1");
		for (const id of ["ST-010-01", "ST-010-02", "ST-010-03", "ST-010-04", "ST-010-05"]) expect(stories).toContain(id);
	});
});

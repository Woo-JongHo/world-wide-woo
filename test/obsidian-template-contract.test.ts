import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (path: string) => readFileSync(resolve(import.meta.dir, "..", path), "utf8");
const template = read("docs/planning/linear-development/OBSIDIAN_TEMPLATE.md");
const contract = read("docs/planning/linear-development/OBSIDIAN_CANONICAL_CONTRACT.md");
const skill = read(".agents/skills/development-traceability/SKILL.md");

describe("Obsidian schema v2 documentation contract", () => {
	test("defines a human-readable filename and Properties as the relationship authority", () => {
		expect(template).toContain("<도메인>/<기능명> — <사람이 읽는 제목>.md");
		expect(template).toContain("document_id: <uuid-v4>");
		expect(template).toContain("schema_version: 2");
		expect(template).toContain("parent: \"[[상위 문서 제목]]\"");
		expect(template).toContain("related: []");
		expect(template).toContain("본문 `## 연결` 절이나 ID 목록을 만들지 않는다.");
	});

	test("requires all canonical sections, acceptance, verification, gaps, and evidence", () => {
		for (const heading of [
			"## 1. Intent", "## 2. Scope", "## 3. Desired Behavior", "## 4. Domain Contract",
			"## 5. State Model", "## 6. Data & Runtime Flow", "## 7. Identity & Persistence Contract",
			"## 8. Integration Contract", "## 9. Failure & Recovery Contract", "## 10. Acceptance Contract",
			"## 11. Verification Strategy", "## 12. Implementation Map", "## 13. Current State & Gaps",
			"## 14. Decisions & Evidence", "## Change Log",
		]) expect(template).toContain(heading);
		expect(template).toContain("| AC-ID | Acceptance Criterion | Test-ID | Evidence | Status |");
		expect(template).toContain("| Test-ID | 검증 대상 | 방법 | 연결 계약 |");
		expect(template).toContain("| ID | Failure | Detection | User-visible State | Recovery | Preserve |");
	});

	test("makes draft placeholders and non-data examples explicit", () => {
		expect(template).toContain("`draft` 외 상태에는 `<...>` 자리표시를 남길 수 없다.");
		expect(template).toContain("**표현 예시 — 실제 데이터가 아님**");
		expect(template).toContain("`active` 문서에는 남길 수 없다");
	});

	test("assigns source ownership and defines preview/apply drift gates", () => {
		for (const phrase of [
			"Obsidian | WHY, behavior contract, decision, scenario, state ownership, exception·recovery, verification strategy",
			"Linear | WHAT, NOW, DONE", "Git | 실제 code·test code·CI 결과·snapshot·log·evidence artifact",
			"SQLite | ledger와 정본에서 다시 만드는 검색 graph projection", "`obsidian:check`", "`obsidian:sync preview/apply`", "`note-migration-preview/apply`", "`traceability:check`",
		]) expect(contract).toContain(phrase);
	});

	test("keeps the skill on the contract, preview, and evidence path", () => {
		for (const phrase of [
			"Obsidian 상세 정본 계약", "**Snapshot**", "**Resolve identity**", "**Prepare owned changes**",
			"**Publish by owner**", "bun run obsidian:check", "bun run traceability:check",
		]) expect(skill).toContain(phrase);
	});
});

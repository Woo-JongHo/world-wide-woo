import { afterEach, describe, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { stringify } from "yaml";
import { OBSIDIAN_SECTIONS, validateObsidianDocument } from "../src/core/domain/development/obsidian-contract.js";
import { applyObsidianSyncPreview, compareObsidianSnapshots, createObsidianSyncPreview, inspectObsidianVault } from "../src/adapters/outbound/development/obsidian-contract.js";
import { runObsidianContractCli } from "../src/adapters/outbound/development/obsidian-contract-cli.js";

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

const properties = (overrides: Record<string, unknown> = {}) => ({
	document_id: "4d194c50-d2ba-4cee-a74a-b9fb1db10e18",
	linear: "WOO-682",
	record_type: "detailed-canonical",
	schema_version: 2,
	status: "draft",
	acceptance: "not-tested",
	domain: "Workbench",
	capability: "Todo",
	parent: null,
	related: [],
	spec_ids: ["TODO-001"],
	code_ids: ["Code-011"],
	test_ids: ["TEST-031"],
	exception_ids: ["EXC-014"],
	decision_ids: ["DEC-001"],
	tags: ["www/spec", "domain/workbench", "capability/todo"],
	updated_at: "2026-09-08T12:00:00+09:00",
	source_revision: `worktree:${"a".repeat(40)}:dirty`,
	...overrides,
});

const body = (capability = "Todo", title = "AI 계획을 세션별로 확인한다", sections: readonly string[] = OBSIDIAN_SECTIONS) => [
	`# ${capability} — ${title}`,
	"",
	...sections.flatMap(section => [`## ${section}`, "", `${section} 계약 내용`, ""]),
].join("\n");

const markdown = (overrides: Record<string, unknown> = {}, title?: string) => `---\n${stringify(properties(overrides)).trim()}\n---\n${body(String(overrides.capability ?? "Todo"), title)}\n`;

function vault(): string { const root = mkdtempSync(join(tmpdir(), "obsidian-contract-")); roots.push(root); return root; }
function put(root: string, path: string, value: string): void { const target = join(root, path); mkdirSync(join(target, ".."), { recursive: true }); writeFileSync(target, value); }

describe("Obsidian detailed-canonical schema v2", () => {
	test("accepts stable Properties, human-readable path, and the exact 14 sections plus Change Log", () => {
		const result = validateObsidianDocument({ relativePath: "Workbench/Todo — AI 계획을 세션별로 확인한다.md", properties: properties(), body: body() });
		expect(result.issues).toEqual([]);
		expect(result.documentId).toBe("4d194c50-d2ba-4cee-a74a-b9fb1db10e18");
		expect(result.targetPath).toBe("Workbench/Todo — AI 계획을 세션별로 확인한다.md");
	});

	test("blocks invalid IDs, inline relationship text, section drift, and machine-oriented filenames", () => {
		const result = validateObsidianDocument({
			relativePath: "WOO-682.md",
			properties: properties({ document_id: "WOO-682", parent: "Workbench parent", code_ids: ["011"] }),
			body: body("Message", "WOO-999 구현", OBSIDIAN_SECTIONS.slice(0, -1)),
		});
		expect(result.issues.map(item => item.code)).toContain("PROPERTY_INVALID");
		expect(result.issues.map(item => item.code)).toContain("HEADING_INVALID");
		expect(result.issues.map(item => item.code)).toContain("SECTION_ORDER_INVALID");
		expect(result.issues.map(item => item.code)).toContain("PATH_DRIFT");
	});

	test("blocks every Linear identifier from the H1 even when it differs from the linked issue", () => {
		const result = validateObsidianDocument({ relativePath: "Workbench/Todo — WOO-999 구현.md", properties: properties(), body: body("Todo", "WOO-999 구현") });
		expect(result.issues.map(item => item.code)).toContain("HEADING_INVALID");
	});

	test("blocks IDs, numeric prefixes, and bracket labels from human-readable titles", () => {
		for (const title of ["Code-011 바인딩", "TEST-TODO-001 검증", "01 계획 표시", "[draft] 계획 표시"]) {
			const result = validateObsidianDocument({ relativePath: `Workbench/Todo — ${title}.md`, properties: properties(), body: body("Todo", title) });
			expect(result.issues.map(item => item.code)).toContain("HEADING_INVALID");
		}
	});

	test("blocks incomplete markers only for active contracts without treating the Todo feature name as TODO work", () => {
		const active = properties({ status: "active" });
		for (const incomplete of ["<작성 필요>", "<domain>", "TODO: 계약 작성", "계약은 TODO다.", "    - TODO: 중첩 계약 작성", "| Acceptance | TODO |", "| Plan | |"])
			expect(validateObsidianDocument({ relativePath: "Workbench/Todo — AI 계획을 세션별로 확인한다.md", properties: active, body: `${body()}\n${incomplete}\n` }).issues.map(item => item.code)).toContain("INCOMPLETE_MARKER");
		expect(validateObsidianDocument({ relativePath: "Workbench/Todo — AI 계획을 세션별로 확인한다.md", properties: active, body: `${body()}\nTodo 기능은 세션 계획을 표시한다.\n` }).issues).toEqual([]);
		expect(validateObsidianDocument({ relativePath: "Workbench/Todo — AI 계획을 세션별로 확인한다.md", properties: active, body: `${body()}\n- TODO-001\n- TEST-TODO-001\n` }).issues).toEqual([]);
		expect(validateObsidianDocument({ relativePath: "Workbench/Todo — AI 계획을 세션별로 확인한다.md", properties: active, body: `${body()}\n\`<domain>\`과 \`\`<capability>\`\`는 예시 문법이다.\n\n\`\`\`text\nTODO: 코드 예시\n## 코드 안 제목\n| A | |\n\`\`\`\n` }).issues).toEqual([]);
		expect(validateObsidianDocument({ relativePath: "Workbench/Todo — AI 계획을 세션별로 확인한다.md", properties: properties(), body: `${body()}\nTODO: 초안 작성 중\n` }).issues).toEqual([]);
	});
});

describe("Obsidian vault drift and exact-digest sync", () => {
	test("previews a canonical rename and applies only the exact unchanged digest", () => {
		const root = vault(); put(root, "Legacy/WOO-682.md", markdown());
		const preview = createObsidianSyncPreview(root);
		expect(preview.actions).toEqual([expect.objectContaining({ from: "Legacy/WOO-682.md", to: "Workbench/Todo — AI 계획을 세션별로 확인한다.md" })]);
		expect(preview.issues.map(item => item.code)).toEqual(["PATH_DRIFT"]);
		const snapshot = applyObsidianSyncPreview(root, preview, preview.digest);
		expect(snapshot.documents[0]?.path).toBe("Workbench/Todo — AI 계획을 세션별로 확인한다.md");
		expect(readFileSync(join(root, snapshot.documents[0]!.path), "utf8")).toContain("document_id:");
		expect(inspectObsidianVault(root).issues).toEqual([]);
	});

	test("rejects changed sources and an approval for a different preview", () => {
		const root = vault(); put(root, "Legacy/WOO-682.md", markdown());
		const preview = createObsidianSyncPreview(root);
		expect(() => applyObsidianSyncPreview(root, preview, "0".repeat(64))).toThrow("PREVIEW_DIGEST_MISMATCH");
		writeFileSync(join(root, "Legacy/WOO-682.md"), `${markdown()}\nchanged\n`);
		expect(() => applyObsidianSyncPreview(root, preview, preview.digest)).toThrow("SOURCE_CHANGED");
	});

	test("preflights every target before moving the first document", () => {
		const root = vault();
		put(root, "Legacy/one.md", markdown());
		put(root, "Legacy/two.md", markdown({ document_id: "0e83482d-0c91-4965-a23c-d38193482fb3", linear: "WOO-683", domain: "Chat", capability: "Message" }, "대화를 읽는다"));
		mkdirSync(join(root, "Chat/Message — 대화를 읽는다.md"), { recursive: true });
		const preview = createObsidianSyncPreview(root);
		expect(() => applyObsidianSyncPreview(root, preview, preview.digest)).toThrow("TARGET_COLLISION");
		expect(readFileSync(join(root, "Legacy/one.md"), "utf8")).toContain("WOO-682");
	});

	test("tracks a stable document across rename and content changes", () => {
		const root = vault(); const original = "Workbench/Todo — AI 계획을 세션별로 확인한다.md"; put(root, original, markdown());
		const before = inspectObsidianVault(root).snapshot;
		const changed = "Workbench/Todo — 수정된 위치.md"; renameSync(join(root, original), join(root, changed)); writeFileSync(join(root, changed), `${markdown()}\nchange\n`);
		const after = inspectObsidianVault(root).snapshot;
		expect(compareObsidianSnapshots(before, after).map(drift => drift.kind)).toEqual(["renamed", "content-changed"]);
	});

	test("blocks duplicate identity and broken wiki-links before filesystem mutation", () => {
		const root = vault(); put(root, "Workbench/Todo — AI 계획을 세션별로 확인한다.md", markdown({ related: ["[[Missing — Contract]]"] }));
		put(root, "Chat/Message — 대화를 읽는다.md", markdown({ linear: "WOO-683", domain: "Chat", capability: "Message" }, "대화를 읽는다"));
		const result = inspectObsidianVault(root);
		expect(result.issues.map(item => item.code)).toContain("DOCUMENT_ID_DUPLICATE");
		expect(result.issues.map(item => item.code)).toContain("WIKILINK_BROKEN");
		expect(() => applyObsidianSyncPreview(root, createObsidianSyncPreview(root), createObsidianSyncPreview(root).digest)).toThrow("OBSIDIAN_CONTRACT_BLOCKED");
	});

	test("exposes fixture-safe check and preview CLI commands", () => {
		const root = vault(); put(root, "Workbench/Todo — AI 계획을 세션별로 확인한다.md", markdown());
		expect((runObsidianContractCli(["check", "--vault", root]) as { documents: unknown[] }).documents).toHaveLength(1);
		expect((runObsidianContractCli(["preview", "--vault", root]) as { actions: unknown[] }).actions).toEqual([]);
	});

	test("accepts the documented bun run check and sync preview command shapes", () => {
		const root = vault(); put(root, "Workbench/Todo — AI 계획을 세션별로 확인한다.md", markdown());
		const renameRoot = vault(); put(renameRoot, "Legacy/WOO-682.md", markdown());
		const cwd = join(import.meta.dir, "..");
		const previewPath = join(renameRoot, "preview.json");
		const checked = JSON.parse(execFileSync("bun", ["run", "obsidian:check", "--", "--vault", root], { cwd, encoding: "utf8" }));
		const previewed = JSON.parse(execFileSync("bun", ["run", "obsidian:sync", "--", "preview", "--vault", renameRoot, "--out", previewPath], { cwd, encoding: "utf8" }));
		const applied = JSON.parse(execFileSync("bun", ["run", "obsidian:sync", "--", "apply", "--vault", renameRoot, "--preview", previewPath, "--digest", previewed.digest], { cwd, encoding: "utf8" }));
		expect(checked.documents).toHaveLength(1);
		expect(previewed.actions).toHaveLength(1);
		expect(applied.documents[0]?.path).toBe("Workbench/Todo — AI 계획을 세션별로 확인한다.md");
		expect(readFileSync(join(renameRoot, "Workbench/Todo — AI 계획을 세션별로 확인한다.md"), "utf8")).toContain("document_id:");
	});

	test("ignores ordinary vault notes under a configured root while validating every canonical marker candidate", () => {
		const root = vault();
		put(root, "Todo.md", "# Session Todo\n\n- [ ] 실제 작업\n");
		put(root, "Workbench — 대화와 계획을 통제한다.md", "# Workbench index\n");
		put(root, "Workbench/Todo — AI 계획을 세션별로 확인한다.md", markdown({ parent: "[[Workbench — 대화와 계획을 통제한다]]", test_ids: ["TEST-TODO-001"], exception_ids: ["EXC-TODO-001"], decision_ids: ["DEC-TODO-001"] }));
		expect(inspectObsidianVault(root).documents).toHaveLength(1);
		expect(inspectObsidianVault(root, { specRoot: "Workbench" }).issues).toEqual([]);
		put(root, "Workbench/Index.md", "# ordinary index\n");
		expect(inspectObsidianVault(root, { specRoot: "Workbench" }).issues).toEqual([]);
		put(root, "Workbench/Broken.md", "---\nrecord_type: detailed-canonical\nschema_version: 2\n---\n# malformed canonical document\n");
		expect(inspectObsidianVault(root, { specRoot: "Workbench" }).issues.map(item => item.code)).toContain("PROPERTY_MISSING");
	});

	test("recognizes quoted YAML markers and rejects missing CLI option values", () => {
		const root = vault(); put(root, "Workbench/Todo — AI 계획을 세션별로 확인한다.md", markdown().replace("record_type: detailed-canonical", 'record_type: "detailed-canonical"'));
		expect(inspectObsidianVault(root).documents).toHaveLength(1);
		expect(() => runObsidianContractCli(["check", "--vault", "--spec-root", "Workbench"])).toThrow("--vault 값이 필요합니다");
		expect(() => runObsidianContractCli(["check", "--vault", root, "--spec-rot", "Workbench"])).toThrow("지원하지 않는 옵션");
	});

	test("requires explicit Linear identities whenever a CLI inspection is scoped", () => {
		const root = vault();
		put(root, "Workbench/Todo — AI 계획을 세션별로 확인한다.md", markdown());
		expect(() => runObsidianContractCli(["check", "--vault", root, "--spec-root", "Workbench"])).toThrow("--linear-ids");
		expect(runObsidianContractCli(["check", "--vault", root, "--spec-root", "Workbench", "--linear-ids", "WOO-682"])).toEqual(expect.objectContaining({ schemaVersion: 2 }));
	});

	test("keeps canonical targets inside a spec root that differs from the domain", () => {
		const root = vault(); put(root, "Specs/Workbench/Todo — AI 계획을 세션별로 확인한다.md", markdown());
		const inspected = inspectObsidianVault(root, { specRoot: "Specs" });
		expect(inspected.issues).toEqual([]);
		expect(inspected.documents[0]?.targetPath).toBe("Specs/Workbench/Todo — AI 계획을 세션별로 확인한다.md");
	});

	test("reports malformed YAML when the raw document declares the canonical marker", () => {
		const root = vault(); put(root, "Workbench/Broken.md", "---\nrecord_type: detailed-canonical\ntags: [broken\n---\n# Todo — broken\n");
		expect(inspectObsidianVault(root).issues.map(item => item.code)).toContain("FRONTMATTER_INVALID");
	});

	test("does not promote a normal note when canonical marker text appears only in the body", () => {
		const root = vault(); put(root, "Guide.md", "---\nrecord_type: guide\n---\n# Guide\n\nrecord_type: detailed-canonical\n");
		expect(inspectObsidianVault(root).documents).toEqual([]);
	});
});

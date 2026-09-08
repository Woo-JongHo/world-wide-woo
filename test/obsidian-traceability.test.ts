import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import YAML from "yaml";
import type { ObsidianCanonicalProperties } from "../src/core/domain/development/obsidian-contract.js";
import type { TraceabilityLedgerV3, TraceabilityRef } from "../src/core/domain/development/development-traceability.js";
import { DevelopmentStore } from "../src/adapters/outbound/development/development-store.js";
import { canonicalDigest, sha256, validateRegistryEnvelope } from "../src/adapters/outbound/development/development-traceability-contract.js";
import { inspectObsidianTraceability } from "../src/adapters/outbound/development/traceability-validator.js";
import { applyObsidianLedgerMigrationPreview, createObsidianLedgerMigrationPreview } from "../src/adapters/outbound/development/obsidian-ledger-migration.js";
import { runTraceability, validateVaultExportCoverage } from "../scripts/traceability.js";

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

const sections = [
	"1. Intent", "2. Scope", "3. Desired Behavior", "4. Domain Contract", "5. State Model",
	"6. Data & Runtime Flow", "7. Identity & Persistence Contract", "8. Integration Contract",
	"9. Failure & Recovery Contract", "10. Acceptance Contract", "11. Verification Strategy",
	"12. Implementation Map", "13. Current State & Gaps", "14. Decisions & Evidence", "Change Log",
];

interface NoteInput { id: string; linear: string; capability: string; title: string; parent?: string; related?: string[]; specIds?: string[]; codeIds?: string[]; testIds?: string[]; exceptionIds?: string[]; decisionIds?: string[] }
function note(input: NoteInput): { path: string; content: string } {
	const properties: ObsidianCanonicalProperties = {
		document_id: input.id, linear: input.linear, record_type: "detailed-canonical", schema_version: 2,
		status: "active", acceptance: "not-tested", domain: "Workbench", capability: input.capability,
		parent: input.parent ?? null, related: input.related ?? [], spec_ids: input.specIds ?? [], code_ids: input.codeIds ?? [], test_ids: input.testIds ?? [],
		exception_ids: input.exceptionIds ?? [], decision_ids: input.decisionIds ?? [], tags: ["www/spec", `capability/${input.capability.toLowerCase()}`],
		updated_at: "2026-09-08T00:00:00.000Z", source_revision: `git:${"a".repeat(40)}`,
	};
	const path = `Workbench/${input.capability} — ${input.title}.md`;
	const body = [`# ${input.capability} — ${input.title}`, "", ...sections.flatMap(section => [`## ${section}`, "", `${section} 계약`, ""])].join("\n");
	return { path, content: `---\n${YAML.stringify(properties)}---\n${body}\n` };
}

function writeNote(root: string, value: { path: string; content: string }): void {
	const path = join(root, value.path); mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, value.content);
}

function fixture() {
	const root = mkdtempSync(join(tmpdir(), "www-obsidian-traceability-")); roots.push(root);
	const projectRoot = join(root, "project"), vaultRoot = join(root, "vault"), dataRoot = join(root, "data");
	mkdirSync(join(projectRoot, ".www/control-ledger"), { recursive: true }); mkdirSync(vaultRoot, { recursive: true });
	const todo = note({ id: "11111111-1111-4111-8111-111111111111", linear: "WOO-682", capability: "Todo", title: "AI 계획을 실시간으로 확인한다", related: ["[[Tracer — 내부 실행을 실시간으로 확인한다]]"] });
	const tracer = note({ id: "22222222-2222-4222-8222-222222222222", linear: "WOO-681", capability: "Tracer", title: "내부 실행을 실시간으로 확인한다", parent: "[[Todo — AI 계획을 실시간으로 확인한다]]" });
	writeNote(vaultRoot, todo); writeNote(vaultRoot, tracer);
	const ledger: TraceabilityLedgerV3 = {
		schemaVersion: 3, projectId: "00000000-0000-4000-8000-000000000002", tombstones: [], migrations: [], payloadDigest: "",
		entities: [
			{ ref: "issue:WOO-682", kind: "issue", id: "WOO-682" },
			{ ref: "issue:WOO-681", kind: "issue", id: "WOO-681" },
			{ ref: `note:${todoId()}`, kind: "note", id: todoId(), source: { path: todo.path, digest: sha256(todo.content) } },
			{ ref: `note:${tracerId()}`, kind: "note", id: tracerId(), source: { path: tracer.path, digest: sha256(tracer.content) } },
		],
		edges: [
			{ from: "issue:WOO-682", relation: "detailed-by", to: `note:${todoId()}` },
			{ from: "issue:WOO-681", relation: "detailed-by", to: `note:${tracerId()}` },
			{ from: `note:${todoId()}`, relation: "related-to", to: `note:${tracerId()}` },
			{ from: `note:${todoId()}`, relation: "parent-of", to: `note:${tracerId()}` },
		],
	};
	const { payloadDigest: _, ...body } = ledger; ledger.payloadDigest = canonicalDigest(body);
	writeFileSync(join(projectRoot, ".www/control-ledger/traceability-v3.json"), `${JSON.stringify(ledger, null, 2)}\n`);
	return { root, projectRoot, vaultRoot, dataRoot, ledger, todo, tracer };
}
const todoId = () => "11111111-1111-4111-8111-111111111111";
const tracerId = () => "22222222-2222-4222-8222-222222222222";

describe("Obsidian authoring source traceability", () => {
	test("documents the explicit Vault root required by rebuild and drift", async () => {
		const help = await runTraceability(["--help"]);
		expect(help).toContain("--vault-root <path>");
		expect(help).toContain("Obsidian authoring-source root");
		expect(help).toContain("--spec-root <path>");
	});

	test("previews legacy replacement and a missing WOO-674 note before digest-bound apply", async () => {
		const value = fixture();
		const workbenchId = "33333333-3333-4333-8333-333333333333";
		const workbench = note({ id: workbenchId, linear: "WOO-674", capability: "Workbench", title: "대화와 계획을 통제한다" });
		writeNote(value.vaultRoot, workbench);
		const legacy = JSON.parse(JSON.stringify(value.ledger)) as TraceabilityLedgerV3;
		// Binary SQLite ordering puts the legacy uppercase note before the
		// lowercase UUID. localeCompare does the opposite on macOS.
		legacy.entities.push(
			{ ref: "note:WOO-999", kind: "note", id: "WOO-999" },
			{ ref: "note:a53bc69a-ae43-4350-bdc1-ca1e0b08fc45", kind: "note", id: "a53bc69a-ae43-4350-bdc1-ca1e0b08fc45" },
		);
		const replacements = new Map([[`note:${todoId()}`, "note:WOO-682"], [`note:${tracerId()}`, "note:WOO-681"]]);
		legacy.entities = legacy.entities.map(entity => replacements.has(entity.ref)
			? { ref: replacements.get(entity.ref)! as `note:${string}`, kind: "note", id: replacements.get(entity.ref)!.slice(5) }
			: entity);
		legacy.edges = legacy.edges
			.filter(edge => edge.relation !== "parent-of" && edge.relation !== "related-to")
			.map(edge => ({ ...edge, from: (replacements.get(edge.from) ?? edge.from) as typeof edge.from, to: (replacements.get(edge.to) ?? edge.to) as typeof edge.to }));
		const { payloadDigest: _, ...legacyBody } = legacy; legacy.payloadDigest = canonicalDigest(legacyBody);
		const ledgerPath = join(value.projectRoot, ".www/control-ledger/traceability-v3.json");
		const legacyBytes = `${JSON.stringify(legacy, null, 2)}\n`; writeFileSync(ledgerPath, legacyBytes);
		const preview = createObsidianLedgerMigrationPreview(legacyBytes, value.vaultRoot);
		expect(preview.workflow).toEqual({ vaultRename: "separate-preview-required", ledgerMigration: "previewed", sqliteRebuild: "pending-after-ledger-apply", linearUriUpdate: "separate-draft-readback-required" });
		expect(preview.actions.map(action => [action.linearId, action.kind, action.createsIssue])).toEqual([
			["WOO-674", "create", true], ["WOO-681", "replace", false], ["WOO-682", "replace", false],
		]);
		expect(preview.candidate.entities).toContainEqual({ ref: "issue:WOO-674", kind: "issue", id: "WOO-674" });
		expect(preview.candidate.entities.map(entity => entity.ref)).toContain(`note:${workbenchId}`);
		expect(preview.candidate.edges).toContainEqual({ from: "issue:WOO-674", relation: "detailed-by", to: `note:${workbenchId}` });
		expect(preview.candidate.tombstones).toEqual(expect.arrayContaining(["note:WOO-681", "note:WOO-682"]));
		expect(preview.candidate.migrations).toContainEqual(expect.objectContaining({ from: "note:WOO-681", to: `note:${tracerId()}` }));
		const cliPreview = JSON.parse(await runTraceability(["note-migration-preview", "--project-root", value.projectRoot, "--vault-root", value.vaultRoot, "--out", ".www/note-migration-preview.json"]));
		expect(cliPreview.digest).toBe(preview.digest);
		expect(JSON.parse(readFileSync(join(value.projectRoot, ".www/note-migration-preview.json"), "utf8")).digest).toBe(preview.digest);
		expect(() => applyObsidianLedgerMigrationPreview({ ledgerPath, vaultRoot: value.vaultRoot, preview, acceptedDigest: "wrong" })).toThrow("PREVIEW_DIGEST_MISMATCH");
		const applied = JSON.parse(await runTraceability(["note-migration-apply", "--project-root", value.projectRoot, "--vault-root", value.vaultRoot, "--preview", ".www/note-migration-preview.json", "--digest", preview.digest]));
		expect(applied).toEqual({ operation: "ledger-migration-apply", ledger: { status: "applied", payloadDigest: preview.candidate.payloadDigest }, vaultRename: { status: "unchanged-separate-operation" }, sqliteRebuild: { status: "pending" }, linearUriUpdate: { status: "pending-separate-draft-readback" } });
		expect((JSON.parse(readFileSync(ledgerPath, "utf8")) as TraceabilityLedgerV3).entities.some(entity => entity.ref === "note:WOO-681")).toBe(false);
		const rebuilt = new DevelopmentStore({ projectRoot: value.projectRoot, dataRoot: value.dataRoot, vaultRoot: value.vaultRoot, vaultSpecRoot: "Workbench" });
		expect(rebuilt.rebuildTraceability().logicalDigest).toBe(preview.candidate.payloadDigest);
		rebuilt.close();
	});

	test("projects declared Properties through immutable registries and blocks missing IDs", () => {
		const value = fixture();
		const declaredTodo = note({ id: todoId(), linear: "WOO-682", capability: "Todo", title: "AI 계획을 실시간으로 확인한다", specIds: ["TODO-001"], codeIds: ["Code-011"], testIds: ["TEST-TODO-001"], exceptionIds: ["EXC-TODO-001"], decisionIds: ["DEC-TODO-001"] });
		writeNote(value.vaultRoot, declaredTodo);
		value.ledger.entities.push({ ref: "unit:Code-011", kind: "unit", id: "Code-011" });
		const { payloadDigest: _, ...body } = value.ledger; value.ledger.payloadDigest = canonicalDigest(body);
		const preview = createObsidianLedgerMigrationPreview(`${JSON.stringify(value.ledger)}\n`, value.vaultRoot, { projectRoot: resolve(import.meta.dir, "..") });
		const noteRef = `note:${todoId()}`;
		for (const target of ["spec:TODO-001@v1", "unit:Code-011", "test-contract:TEST-TODO-001@v1", "exception:EXC-TODO-001@v1", "decision:DEC-TODO-001@v1"]) {
			expect(preview.candidate.edges).toContainEqual({ from: noteRef as TraceabilityRef, relation: "references", to: target as TraceabilityRef });
		}
		expect(inspectObsidianTraceability({ vaultRoot: value.vaultRoot, ledger: preview.candidate, specRoot: "Workbench" }).errors).toEqual([]);
		const missing = JSON.parse(JSON.stringify(preview.candidate)) as TraceabilityLedgerV3;
		missing.entities = missing.entities.filter(entity => entity.id !== "TEST-TODO-001");
		missing.edges = missing.edges.filter(edge => !edge.from.includes("TEST-TODO-001") && !edge.to.includes("TEST-TODO-001"));
		expect(inspectObsidianTraceability({ vaultRoot: value.vaultRoot, ledger: missing, specRoot: "Workbench" }).errors).toContain(`${"OBSIDIAN_PROPERTY_ENTITY_MISSING"}:${noteRef}:test-contract:TEST-TODO-001`);
	});

	test("requires exactly one canonical detailed note for selected Linear issues", () => {
		const value = fixture();
		const snapshot = [{ id: "WOO-682" }, { id: "WOO-681" }, { id: "WOO-999" }];
		const full = inspectObsidianTraceability({ vaultRoot: value.vaultRoot, ledger: value.ledger, linearSnapshot: snapshot });
		expect(full.errors).toContain("LINEAR_DETAILED_BY_EXACTLY_ONE_REQUIRED:WOO-999:0");
		const scoped = inspectObsidianTraceability({ vaultRoot: value.vaultRoot, ledger: value.ledger, specRoot: "Workbench", linearSnapshot: snapshot });
		expect(scoped.errors.some(error => error.includes("WOO-999"))).toBe(false);
		const explicitlyScoped = inspectObsidianTraceability({ vaultRoot: value.vaultRoot, ledger: value.ledger, specRoot: "Workbench", linearSnapshot: snapshot, requiredLinearIds: ["WOO-682", "WOO-681", "WOO-999"] });
		expect(explicitlyScoped.errors).toContain("LINEAR_DETAILED_BY_EXACTLY_ONE_REQUIRED:WOO-999:0");
		expect(explicitlyScoped.errors.some(error => error === "OBSIDIAN_CONTRACT_INVALID:LINEAR_CANONICAL_COUNT_INVALID:Workbench")).toBe(true);
		value.ledger.edges.push({ from: "issue:WOO-682", relation: "detailed-by", to: `note:${tracerId()}` });
		expect(inspectObsidianTraceability({ vaultRoot: value.vaultRoot, ledger: value.ledger, specRoot: "Workbench", linearSnapshot: snapshot }).errors).toContain("LINEAR_DETAILED_BY_EXACTLY_ONE_REQUIRED:WOO-682:2");
	});

	test("orders canonical note UUIDs with SQLite binary collation", () => {
		const value = fixture();
		const upperId = "B0000000-0000-4000-8000-000000000001";
		const lowerId = "a0000000-0000-4000-8000-000000000002";
		const upper = note({ id: upperId, linear: "WOO-900", capability: "Upper", title: "대문자 UUID 정렬을 확인한다" });
		const lower = note({ id: lowerId, linear: "WOO-901", capability: "Lower", title: "소문자 UUID 정렬을 확인한다" });
		writeNote(value.vaultRoot, upper); writeNote(value.vaultRoot, lower);
		value.ledger.entities.push(
			{ ref: "issue:WOO-900", kind: "issue", id: "WOO-900" },
			{ ref: "issue:WOO-901", kind: "issue", id: "WOO-901" },
			{ ref: `note:${upperId}`, kind: "note", id: upperId, source: { path: upper.path, digest: sha256(upper.content) } },
			{ ref: `note:${lowerId}`, kind: "note", id: lowerId, source: { path: lower.path, digest: sha256(lower.content) } },
		);
		value.ledger.edges.push(
			{ from: "issue:WOO-900", relation: "detailed-by", to: `note:${upperId}` },
			{ from: "issue:WOO-901", relation: "detailed-by", to: `note:${lowerId}` },
		);
		const { payloadDigest: _, ...body } = value.ledger; value.ledger.payloadDigest = canonicalDigest(body);
		const inspected = inspectObsidianTraceability({ vaultRoot: value.vaultRoot, ledger: value.ledger });
		expect(inspected.errors).toEqual([]);
		expect(inspected.notes.map(item => item.documentId)).toEqual([todoId(), tracerId(), upperId, lowerId]);
	});

	test("uses schema v2 document IDs for full and scoped Vault export coverage", () => {
		const value = fixture();
		expect(validateVaultExportCoverage(value.ledger, [todoId()], new Set([todoId()]))).toEqual([]);
		expect(validateVaultExportCoverage(value.ledger, [todoId()], new Set(["WOO-682"]))).toEqual([`VAULT_EXPORT_NOTE_COVERAGE_MISMATCH:${todoId()}`]);
		expect(validateVaultExportCoverage(value.ledger, ["33333333-3333-4333-8333-333333333333"], new Set(["33333333-3333-4333-8333-333333333333"]))).toEqual(["VAULT_EXPORT_LEDGER_NOTE_MISSING:33333333-3333-4333-8333-333333333333"]);
	});

	test("keeps every Pilot registry immutable and digest-valid, including body-grounded gaps", () => {
		const registryRoot = resolve(import.meta.dir, "../.www/control-ledger/registry");
		for (const path of [
			"specs/TODO-001.json", "specs/TRACER-001.json",
			...Array.from({ length: 4 }, (_, index) => `tests/TEST-TODO-00${index + 1}.json`),
			...Array.from({ length: 3 }, (_, index) => `tests/TEST-TRACER-00${index + 1}.json`),
			...Array.from({ length: 4 }, (_, index) => `tests/TEST-WORKBENCH-00${index + 1}.json`),
			...Array.from({ length: 3 }, (_, index) => `exceptions/EXC-TODO-00${index + 1}.json`),
			...Array.from({ length: 3 }, (_, index) => `exceptions/EXC-TRACER-00${index + 1}.json`),
			...Array.from({ length: 3 }, (_, index) => `exceptions/EXC-WORKBENCH-00${index + 1}.json`),
			"decisions/DEC-TODO-001.json", "decisions/DEC-TRACER-001.json", "decisions/DEC-WORKBENCH-001.json",
		]) expect(validateRegistryEnvelope(JSON.parse(readFileSync(join(registryRoot, path), "utf8")))).toEqual([]);
	});

	test("detects rename/content drift and stale Linear Obsidian URIs by stable document_id", () => {
		const value = fixture();
		value.ledger.entities.find(entity => entity.id === todoId())!.source!.path = "Workbench/Todo — 이전 제목.md";
		value.ledger.entities.find(entity => entity.id === todoId())!.source!.digest = "0".repeat(64);
		const result = inspectObsidianTraceability({
			vaultRoot: value.vaultRoot, ledger: value.ledger,
			linearSnapshot: [
				{ id: "WOO-682", description: "- Obsidian: [상세](obsidian://open?vault=www&file=Workbench%2FTodo%20%E2%80%94%20%EC%9D%B4%EC%A0%84%20%EC%A0%9C%EB%AA%A9)" },
				{ id: "WOO-681", description: `- Obsidian: [상세](obsidian://open?vault=www&file=${encodeURIComponent(value.tracer.path.replace(/\.md$/, ""))})` },
			],
		});
		expect(result.notes.find(item => item.documentId === todoId())?.status).toBe("renamed-and-content-changed");
		expect(result.errors).toContain(`LINEAR_OBSIDIAN_URI_STALE:WOO-682:${todoId()}`);
		expect(result.errors.some(error => error.startsWith("LINEAR_OBSIDIAN_URI_STALE:WOO-681"))).toBe(false);
	});

	test("blocks duplicate document IDs and missing related wiki targets", () => {
		const value = fixture();
		const duplicate = note({ id: todoId(), linear: "WOO-999", capability: "Other", title: "중복 문서", related: ["[[Missing — 존재하지 않는다]]"] });
		writeNote(value.vaultRoot, duplicate);
		const result = inspectObsidianTraceability({ vaultRoot: value.vaultRoot, ledger: value.ledger });
		expect(result.errors.some(error => error.includes("DOCUMENT_ID_DUPLICATE"))).toBe(true);
		expect(result.errors.some(error => error.includes("WIKILINK_BROKEN"))).toBe(true);
	});

	test("rebuilds the disposable SQLite note projection with identical digests after deletion", async () => {
		const value = fixture();
		value.ledger.entities.push(
			{ ref: "issue:WOO-999", kind: "issue", id: "WOO-999" },
			{ ref: "note:44444444-4444-4444-8444-444444444444", kind: "note", id: "44444444-4444-4444-8444-444444444444", source: { path: "Other/Ghost — 범위 밖 문서.md", digest: "4".repeat(64) } },
		);
		value.ledger.edges.push({ from: "issue:WOO-999", relation: "detailed-by", to: "note:44444444-4444-4444-8444-444444444444" });
		const { payloadDigest: _, ...scopedBody } = value.ledger; value.ledger.payloadDigest = canonicalDigest(scopedBody);
		writeFileSync(join(value.projectRoot, ".www/control-ledger/traceability-v3.json"), `${JSON.stringify(value.ledger, null, 2)}\n`);
		const firstStore = new DevelopmentStore({ projectRoot: value.projectRoot, dataRoot: value.dataRoot, vaultRoot: value.vaultRoot });
		expect(() => firstStore.rebuildTraceability()).toThrow("OBSIDIAN_NOTE_DOCUMENT_MISSING");
		firstStore.close();
		const scopedStore = new DevelopmentStore({ projectRoot: value.projectRoot, dataRoot: value.dataRoot, vaultRoot: value.vaultRoot, vaultSpecRoot: "Workbench" });
		const first = scopedStore.rebuildTraceability();
		const drift = scopedStore.traceabilityDrift();
		expect(drift.notes).toEqual([]);
		expect(drift.logicalDigest).toBe(first.logicalDigest);
		const indexPath = scopedStore.indexPath; scopedStore.close();
		for (const suffix of ["", "-wal", "-shm"]) rmSync(`${indexPath}${suffix}`, { force: true });
		const secondStore = new DevelopmentStore({ projectRoot: value.projectRoot, dataRoot: value.dataRoot, vaultRoot: value.vaultRoot, vaultSpecRoot: "Workbench" });
		const second = secondStore.rebuildTraceability();
		expect(second).toEqual(first);
		expect(readFileSync(join(value.projectRoot, ".www/control-ledger/traceability-v3.json"), "utf8")).toContain(todoId());
		secondStore.close();
		const cli = JSON.parse(await runTraceability(["rebuild", "--project-root", value.projectRoot, "--data-root", join(value.root, "cli-data"), "--vault-root", value.vaultRoot, "--spec-root", "Workbench"]));
		expect(cli.logicalDigest).toBe(first.logicalDigest);
		expect(cli.rowDigest).toBe(first.rowDigest);
	});
});

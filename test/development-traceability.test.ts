import { afterEach, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { createHash, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { TraceabilityLedger } from "../src/system/contracts/development-traceability";
import { nextUnitKey, validateLedger } from "../src/system/contracts/development-traceability";
import { parseWorkTraceabilityManifest } from "../src/system/contracts/work/traceability";
import { buildDevelopmentMap, issuesForWorkReference } from "../src/workflows/tui-development/adapters/development-map-builder";
import { digestLedger } from "../src/workflows/tui-development/adapters/traceability-digest";
import { DevelopmentStore } from "../src/workflows/tui-development/adapters/development-store";
import { validateTraceability } from "../src/workflows/tui-development/adapters/traceability-validator";
import { assertRepositoryReferencesExist } from "../src/system/adapters/work-reference-validator";
import { runTraceability } from "../scripts/traceability";

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

function fixture(): { root: string; vault: string; ledger: TraceabilityLedger; snapshot: any[] } {
	const root = mkdtempSync(join(tmpdir(), "www-trace-v2-")); roots.push(root);
	execFileSync("git", ["init", "--quiet"], { cwd: root });
	const vault = join(root, "vault");
	mkdirSync(join(root, ".www/control-ledger"), { recursive: true });
	mkdirSync(join(root, "docs/planning/linear-development"), { recursive: true });
	mkdirSync(join(root, "src"), { recursive: true });
	mkdirSync(join(vault, "notes"), { recursive: true });
	writeFileSync(join(root, "tsconfig.json"), JSON.stringify({ compilerOptions: { noEmit: true }, include: ["src/**/*.ts"] }));
	writeFileSync(join(root, "docs/planning/linear-development/ISSUE_CONTRACT.yaml"), `hierarchy:\n  workbench: { root: WOO-P, features: {} }\n  traceability: { parent: WOO-P, milestone: v0.2.0, issues: [WOO-1] }\ntitles: {}\nbodies:\n  traceability: [연결]\nconnections:\n  codeIdPattern: '^- Code-ID: Code-\\d{3}$'\n  githubPattern: '^- GitHub: .+$'\n  obsidianPattern: '^- Obsidian: \\[.+\\]\\(obsidian://.+\\)$'\nprotectedMetadata: []\n`);
	writeFileSync(join(root, "src/unit.ts"), "/** @Unit Code-001 */\nexport class Unit {}\nconst fake = `/** @Unit Code-999 */ class Fake {}`;\n");
	const sourceRevision = "worktree:1111111111111111111111111111111111111111:dirty";
	writeFileSync(join(vault, "notes/issue.md"), `---\nlinear_id: WOO-1\nlinear_uuid: 11111111-1111-4111-8111-111111111111\nunit_id: Code-001\nunit_uuid: 22222222-2222-4222-8222-222222222222\nrecord_type: requirement\nsource_revision: ${sourceRevision}\nupdated_at: 2026-09-07T00:00:00Z\n---\n\n# detail\n`);
	const base = {
		schemaVersion: 2 as const,
		projectId: "33333333-3333-4333-8333-333333333333",
		vault: { id: "vault", relativeRoot: "notes" },
		units: [{ uuid: "22222222-2222-4222-8222-222222222222", key: "Code-001", name: "Unit", lifecycle: "active" as const, aliases: ["0001"], locations: [{ path: "src/unit.ts", symbol: "Unit" }] }],
		issues: [{ id: "WOO-1", uuid: "11111111-1111-4111-8111-111111111111", url: "https://linear.app/woo/issue/WOO-1/example", milestone: "v0.2.0" }],
		notes: [{ id: "detail", relativePath: "issue.md", uri: "obsidian://open?vault=vault&file=notes/issue.md", recordType: "requirement" as const, sourceRevision }],
		pullRequests: [{ id: "46", url: "https://github.com/example/repo/pull/46", scope: "chat-v0.1-code-evidence" as const }],
		runs: [{ id: "validation-1", purpose: "traceability-validation" as const, status: "passed" as const, evidencePath: "evidence.json", sourceState: "dirty-worktree" as const, sourceRevision }],
		edges: [
			{ from: "issue:WOO-1" as const, relation: "implemented-by" as const, to: "unit:Code-001" as const },
			{ from: "issue:WOO-1" as const, relation: "detailed-by" as const, to: "note:detail" as const },
			{ from: "issue:WOO-1" as const, relation: "code-evidenced-by" as const, to: "pr:46" as const },
			{ from: "run:validation-1" as const, relation: "verifies" as const, to: "issue:WOO-1" as const },
			{ from: "run:validation-1" as const, relation: "verifies" as const, to: "unit:Code-001" as const },
			{ from: "run:validation-1" as const, relation: "recorded-in" as const, to: "note:detail" as const },
		],
		tombstones: [] as string[], migrations: [{ from: "0001", to: "Code-001", reason: "migration" }],
	};
	const ledger = { ...base, payloadDigest: digestLedger(base as any) } as TraceabilityLedger;
	writeFileSync(join(root, ".www/control-ledger/traceability-v2.json"), JSON.stringify(ledger, null, 2));
	writeFileSync(join(root, ".www/control-ledger/traceability.json"), JSON.stringify({ schemaVersion: 1, references: [], links: [] }));
	writeFileSync(join(root, ".www/Development-Map.md"), buildDevelopmentMap("# Map\n", ledger));
	writeFileSync(join(root, "evidence.json"), JSON.stringify({ runId: "validation-1", runPurpose: "traceability-validation", sourceState: "dirty-worktree", sourceRevision }));
	const snapshot = [{ id: "WOO-1", uuid: ledger.issues[0]!.uuid, title: "Trace", description: "## 연결\n\n- Code-ID: Code-001\n- Obsidian: [detail](obsidian://open?vault=vault&file=notes/issue.md)", parentId: "WOO-P", projectMilestone: "v0.2.0", project: null, archivedAt: null, status: "In Progress", labels: [], priority: 0 }];
	return { root, vault, ledger, snapshot };
}

describe("schema-v2 development traceability", () => {
	test("validates UUID aliases, tombstones, edge directions, and next Code-NNN allocation", () => {
		const { ledger } = fixture();
		expect(validateLedger(ledger, digestLedger(ledger))).toEqual([]);
		expect(nextUnitKey(ledger)).toBe("Code-002");
		const reused = structuredClone(ledger); reused.tombstones = ["Code-001"]; reused.payloadDigest = digestLedger(reused);
		expect(validateLedger(reused, digestLedger(reused))).toContain("Code-001: active Unit reuses a tombstone");
		const retired = structuredClone(reused); retired.units[0]!.lifecycle = "retired"; retired.payloadDigest = digestLedger(retired);
		expect(validateLedger(retired, digestLedger(retired))).not.toContain("Code-001: active Unit reuses a tombstone");
		const duplicate = structuredClone(ledger); duplicate.units.push({ ...duplicate.units[0]!, uuid: randomUUID(), key: "Code-002" }); duplicate.payloadDigest = digestLedger(duplicate);
		expect(validateLedger(duplicate, digestLedger(duplicate)).some(error => error.includes("reused Unit alias"))).toBeTrue();
		expect(validateLedger(duplicate, digestLedger(duplicate)).some(error => error.includes("duplicate Unit location"))).toBeTrue();
		const duplicateEdge = structuredClone(ledger); duplicateEdge.edges.push(duplicateEdge.edges[0]!); duplicateEdge.payloadDigest = digestLedger(duplicateEdge);
		expect(validateLedger(duplicateEdge, digestLedger(duplicateEdge)).some(error => error.includes("duplicate edge"))).toBeTrue();
		const sluglessUrl = structuredClone(ledger); sluglessUrl.issues[0]!.url = "https://linear.app/woo/issue/WOO-1"; sluglessUrl.payloadDigest = digestLedger(sluglessUrl);
		expect(validateLedger(sluglessUrl, digestLedger(sluglessUrl))).toEqual([]);
		const wrongIssueUrl = structuredClone(ledger); wrongIssueUrl.issues[0]!.url = "https://linear.app/woo/issue/WOO-10"; wrongIssueUrl.payloadDigest = digestLedger(wrongIssueUrl);
		expect(validateLedger(wrongIssueUrl, digestLedger(wrongIssueUrl))).toContain("invalid Linear identity: WOO-1");
	});

	test("uses AST declarations and actual note frontmatter while rejecting mutations", async () => {
		const { root, vault, ledger, snapshot } = fixture();
		expect(await validateTraceability({ projectRoot: root, ledger, vaultRoot: vault, linearSnapshot: snapshot })).toEqual([]);
		const linked = structuredClone(snapshot); linked[0].description = "## 연결\n\n- Code-ID: [Code-001](https://example.com)";
		expect((await validateTraceability({ projectRoot: root, ledger, vaultRoot: vault, linearSnapshot: linked })).some(error => error.includes("must not be a link"))).toBeTrue();
		const missing = structuredClone(snapshot); missing.splice(0, 1);
		expect((await validateTraceability({ projectRoot: root, ledger, vaultRoot: vault, linearSnapshot: missing })).some(error => error.includes("missing from Linear readback"))).toBeTrue();
		const wrongUri = structuredClone(ledger); wrongUri.notes[0]!.uri = "obsidian://open?vault=wrong&file=notes/issue.md"; wrongUri.payloadDigest = digestLedger(wrongUri);
		expect((await validateTraceability({ projectRoot: root, ledger: wrongUri, vaultRoot: vault, linearSnapshot: snapshot })).some(error => error.includes("Obsidian URI differs"))).toBeTrue();
		const traversal = structuredClone(ledger); traversal.notes[0]!.relativePath = "../outside.md"; traversal.payloadDigest = digestLedger(traversal);
		expect(validateLedger(traversal, digestLedger(traversal)).some(error => error.includes("safe relative path"))).toBeTrue();
		const absolute = structuredClone(ledger); absolute.notes[0]!.relativePath = join(root, "outside.md"); absolute.payloadDigest = digestLedger(absolute);
		expect(validateLedger(absolute, digestLedger(absolute)).some(error => error.includes("safe relative path"))).toBeTrue();
		const outside = join(root, "outside"); mkdirSync(outside); writeFileSync(join(outside, "issue.md"), readFileSync(join(vault, "notes/issue.md")));
		symlinkSync(outside, join(vault, "notes", "escape"), process.platform === "win32" ? "junction" : "dir");
		const escaped = structuredClone(ledger); escaped.notes[0]!.relativePath = "escape/issue.md"; escaped.notes[0]!.uri = "obsidian://open?vault=vault&file=notes/escape/issue.md"; escaped.payloadDigest = digestLedger(escaped);
		expect((await validateTraceability({ projectRoot: root, ledger: escaped, vaultRoot: vault, linearSnapshot: snapshot })).some(error => error.includes("escapes the real vault root"))).toBeTrue();
		const notePath = join(vault, "notes/issue.md");
		const note = readFileSync(notePath, "utf8");
		writeFileSync(notePath, note.replace("22222222-2222-4222-8222-222222222222", "44444444-4444-4444-8444-444444444444"));
		expect((await validateTraceability({ projectRoot: root, ledger, vaultRoot: vault, linearSnapshot: snapshot })).some(error => error.includes("Unit key/UUID mismatch"))).toBeTrue();
		writeFileSync(notePath, note.replace("worktree:1111111111111111111111111111111111111111:dirty", "worktree:2222222222222222222222222222222222222222:dirty"));
		expect((await validateTraceability({ projectRoot: root, ledger, vaultRoot: vault, linearSnapshot: snapshot })).some(error => error.includes("source_revision differs"))).toBeTrue();
		writeFileSync(notePath, note);
		writeFileSync(join(root, "src/unit.ts"), "export class Unit {}\n");
		expect((await validateTraceability({ projectRoot: root, ledger, vaultRoot: vault, linearSnapshot: snapshot })).some(error => error.includes("observed 0"))).toBeTrue();
	});

	test("rebuilds SQLite after deletion and returns one logical graph from four entry points", () => {
		const { root, ledger } = fixture();
		const data = join(root, "data");
		let store = new DevelopmentStore({ projectRoot: root, dataRoot: data });
		expect(() => store.registerUnit({ name: "competing" })).toThrow("refusing a competing source envelope");
		expect(() => store.linkIssue({ unitId: ledger.units[0]!.uuid, issue: ledger.issues[0]! })).toThrow("refusing a competing source envelope");
		const first = store.rebuildTraceability();
		const graphs = [store.queryTraceability("issue", "WOO-1"), store.queryTraceability("unit", "Code-001"), store.queryTraceability("run", "validation-1"), store.queryTraceability("note", "detail")];
		expect(new Set(graphs.map(graph => graph.logicalDigest))).toEqual(new Set([first.logicalDigest]));
		expect(graphs.every(graph => graph.issues.includes("WOO-1") && graph.units.includes("Code-001") && graph.notes.includes("detail"))).toBeTrue();
		expect(store.queryTraceability("pr", "46").issues).toEqual(["WOO-1"]);
		const index = store.indexPath; store.close(); rmSync(index); rmSync(`${index}-wal`, { force: true }); rmSync(`${index}-shm`, { force: true });
		store = new DevelopmentStore({ projectRoot: root, dataRoot: data });
		expect(() => store.queryTraceability("issue", "WOO-1")).toThrow("projection differs");
		const second = store.rebuildTraceability(); expect(second.logicalDigest).toBe(first.logicalDigest); expect(second.logicalDigest).toBe(digestLedger(ledger)); store.close();
	});

	test("fails closed when any traceability entity, edge, or metadata row is deleted or mutated", () => {
		const { root } = fixture(); const dataRoot = join(root, "data"); const store = new DevelopmentStore({ projectRoot: root, dataRoot });
		store.rebuildTraceability();
		const mutate = (sql: string) => { const db = new Database(store.indexPath); db.run(sql); db.close(); };
		mutate("UPDATE traceability_entities SET payload = '{}' WHERE ref = 'unit:Code-001'");
		expect(() => store.queryTraceability("issue", "WOO-1")).toThrow("entity projection differs");
		store.rebuildTraceability(); mutate("DELETE FROM traceability_edges WHERE relation = 'detailed-by'");
		expect(() => store.queryTraceability("issue", "WOO-1")).toThrow("edge projection differs");
		store.rebuildTraceability(); mutate("UPDATE traceability_meta SET value = 'forged' WHERE key = 'logical_digest'");
		expect(() => store.queryTraceability("issue", "WOO-1")).toThrow("metadata projection differs");
		store.rebuildTraceability(); mutate("DELETE FROM traceability_entities WHERE ref = 'pr:46'");
		expect(() => store.assertTraceabilityCurrent()).toThrow();
		store.close();
	});

	test("requires explicit frozen Linear and Vault export artifacts for the offline gate", async () => {
		const { root, vault, ledger, snapshot } = fixture();
		await expect(runTraceability(["check", "--project-root", root])).rejects.toThrow("explicit --linear-snapshot");
		const linear = { capturedAt: "2026-09-07T00:00:00Z", hasNextPage: false, issues: snapshot };
		const linearBytes = JSON.stringify(linear); writeFileSync(join(root, "linear.json"), linearBytes);
		const uuidSet = snapshot.map(issue => `${issue.id}:${issue.uuid}`).sort().join("\n");
		writeFileSync(join(root, "linear-receipt.json"), JSON.stringify({ artifactKind: "external-linear-mcp-acquisition-receipt", receiptVersion: 1, trustBoundary: "external-mcp-ingestion", snapshotPath: "linear.json", snapshotSha256: createHash("sha256").update(linearBytes).digest("hex"), issueUuidSetSha256: createHash("sha256").update(uuidSet).digest("hex"), queryStartedAt: "2026-09-06T23:59:00Z", queryCompletedAt: linear.capturedAt, receivedAt: linear.capturedAt, pagination: [{ query: "fixture", hasNextPage: false, nextCursor: null, issueIds: ["WOO-1"] }] }));
		await expect(runTraceability(["check", "--project-root", root, "--linear-snapshot", "linear.json"])).rejects.toThrow("explicit --linear-receipt");
		await expect(runTraceability(["check", "--project-root", root, "--linear-snapshot", "linear.json", "--linear-receipt", "linear-receipt.json"])).rejects.toThrow("explicit --vault-export-manifest");
		const bytes = readFileSync(join(vault, "notes/issue.md")); const sha = createHash("sha256").update(bytes).digest("hex");
		writeFileSync(join(root, "vault-manifest.json"), JSON.stringify({ status: "PASS", artifactKind: "actual-vault-byte-readback", vaultId: ledger.vault.id, actualVaultRoot: vault, capturedAt: "2026-09-07T00:00:00Z", exportRoot: "vault", files: [{ noteId: "detail", relativePath: "issue.md", actualSha256: sha, exportSha256: sha, byteIdentical: true }] }));
		expect(await runTraceability(["check", "--project-root", root, "--linear-snapshot", "linear.json", "--linear-receipt", "linear-receipt.json", "--vault-export-manifest", "vault-manifest.json", "--data-root", join(root, "offline-data")])).toContain("Traceability OK");
		await expect(runTraceability(["live-check", "--project-root", root])).rejects.toThrow("Unknown traceability command: live-check");
		const validReceipt = JSON.parse(readFileSync(join(root, "linear-receipt.json"), "utf8"));
		for (const [field, value, message] of [["snapshotSha256", "0".repeat(64), "snapshot hash differs"], ["issueUuidSetSha256", "0".repeat(64), "issue UUID set differs"]] as const) {
			writeFileSync(join(root, "linear-receipt.json"), JSON.stringify({ ...validReceipt, [field]: value }));
			await expect(runTraceability(["check", "--project-root", root, "--linear-snapshot", "linear.json", "--linear-receipt", "linear-receipt.json", "--vault-export-manifest", "vault-manifest.json"])).rejects.toThrow(message);
		}
		writeFileSync(join(root, "linear-receipt.json"), JSON.stringify({ ...validReceipt, pagination: [{ ...validReceipt.pagination[0], hasNextPage: true }] }));
		await expect(runTraceability(["check", "--project-root", root, "--linear-snapshot", "linear.json", "--linear-receipt", "linear-receipt.json", "--vault-export-manifest", "vault-manifest.json"])).rejects.toThrow("complete pagination");
		writeFileSync(join(root, "linear-receipt.json"), JSON.stringify(validReceipt));
		const old = "2020-01-01T00:00:00Z", staleLinear = { ...linear, capturedAt: old }, staleBytes = JSON.stringify(staleLinear);
		writeFileSync(join(root, "stale-linear.json"), staleBytes);
		writeFileSync(join(root, "stale-receipt.json"), JSON.stringify({ ...validReceipt, snapshotPath: "stale-linear.json", snapshotSha256: createHash("sha256").update(staleBytes).digest("hex"), queryStartedAt: old, queryCompletedAt: old, receivedAt: old }));
		await expect(runTraceability(["receipt-check", "--project-root", root, "--linear-snapshot", "stale-linear.json", "--linear-receipt", "stale-receipt.json", "--vault-root", vault])).rejects.toThrow("stale or future-dated");
		const now = new Date().toISOString(), freshLinear = { ...linear, capturedAt: now }, freshBytes = JSON.stringify(freshLinear);
		writeFileSync(join(root, "fresh-linear.json"), freshBytes);
		writeFileSync(join(root, "fresh-receipt.json"), JSON.stringify({ ...validReceipt, snapshotPath: "fresh-linear.json", snapshotSha256: createHash("sha256").update(freshBytes).digest("hex"), queryStartedAt: now, queryCompletedAt: now, receivedAt: now }));
		const freshArgs = ["receipt-check", "--project-root", root, "--linear-snapshot", "fresh-linear.json", "--linear-receipt", "fresh-receipt.json", "--vault-root", vault];
		await expect(runTraceability(freshArgs)).rejects.toThrow("explicit --vault-export-manifest");
		const otherVault = join(root, "other-vault"); mkdirSync(otherVault);
		await expect(runTraceability([...freshArgs.slice(0, -1), otherVault, "--vault-export-manifest", "vault-manifest.json"])).rejects.toThrow("differs from the manifest actualVaultRoot");
		expect(await runTraceability([...freshArgs, "--vault-export-manifest", "vault-manifest.json"])).toContain("Fresh external-receipt traceability OK");
		const outside = mkdtempSync(join(tmpdir(), "www-trace-artifact-outside-")); roots.push(outside);
		writeFileSync(join(outside, "linear.json"), linearBytes); symlinkSync(join(outside, "linear.json"), join(root, "linear-link.json"));
		await expect(runTraceability(["check", "--project-root", root, "--linear-snapshot", "linear-link.json", "--linear-receipt", "linear-receipt.json", "--vault-export-manifest", "vault-manifest.json"])).rejects.toThrow("Linear snapshot must stay inside the repository");
		writeFileSync(join(outside, "manifest.json"), readFileSync(join(root, "vault-manifest.json"))); symlinkSync(join(outside, "manifest.json"), join(root, "manifest-link.json"));
		await expect(runTraceability(["check", "--project-root", root, "--linear-snapshot", "linear.json", "--linear-receipt", "linear-receipt.json", "--vault-export-manifest", "manifest-link.json"])).rejects.toThrow("Vault export manifest must stay inside the repository");
		writeFileSync(join(outside, "receipt.json"), JSON.stringify(validReceipt)); symlinkSync(join(outside, "receipt.json"), join(root, "receipt-link.json"));
		await expect(runTraceability(["check", "--project-root", root, "--linear-snapshot", "linear.json", "--linear-receipt", "receipt-link.json", "--vault-export-manifest", "vault-manifest.json"])).rejects.toThrow("Linear acquisition receipt must stay inside the repository");
		mkdirSync(join(outside, "vault/notes"), { recursive: true }); writeFileSync(join(outside, "vault/notes/issue.md"), bytes); symlinkSync(join(outside, "vault"), join(root, "export-link"), process.platform === "win32" ? "junction" : "dir");
		const escapedManifest = JSON.parse(readFileSync(join(root, "vault-manifest.json"), "utf8")); escapedManifest.exportRoot = "export-link"; writeFileSync(join(root, "escaped-manifest.json"), JSON.stringify(escapedManifest));
		await expect(runTraceability(["check", "--project-root", root, "--linear-snapshot", "linear.json", "--linear-receipt", "linear-receipt.json", "--vault-export-manifest", "escaped-manifest.json"])).rejects.toThrow("Vault export root must stay inside the repository");
		writeFileSync(join(vault, "notes/issue.md"), `${bytes.toString()}\nmutated`);
		await expect(runTraceability(["check", "--project-root", root, "--linear-snapshot", "linear.json", "--linear-receipt", "linear-receipt.json", "--vault-export-manifest", "vault-manifest.json"])).rejects.toThrow("hash/provenance mismatch");
	});

	test("requires every repository reference to resolve to a real file inside the project", async () => {
		const { root, ledger } = fixture();
		const linear = { kind: "linear-issue", id: "WOO-1", uuid: ledger.issues[0]!.uuid, url: ledger.issues[0]!.url } as const;
		const code = { kind: "code", id: "src/unit.ts" } as const;
		await expect(assertRepositoryReferencesExist(parseWorkTraceabilityManifest({ schemaVersion: 1, references: [linear, code], links: [{ from: linear, relation: "implements", to: code }] }), root)).resolves.toBeUndefined();
		const missing = { kind: "test", id: "test/missing.test.ts" } as const;
		await expect(assertRepositoryReferencesExist(parseWorkTraceabilityManifest({ schemaVersion: 1, references: [linear, missing], links: [{ from: missing, relation: "verifies", to: linear }] }), root)).rejects.toThrow("Missing repository work reference");
		const outside = mkdtempSync(join(tmpdir(), "www-work-ref-outside-")); roots.push(outside); writeFileSync(join(outside, "escape.ts"), "export {};"); symlinkSync(join(outside, "escape.ts"), join(root, "src/escape.ts"));
		const escaped = { kind: "code", id: "src/escape.ts" } as const;
		await expect(assertRepositoryReferencesExist(parseWorkTraceabilityManifest({ schemaVersion: 1, references: [linear, escaped], links: [{ from: linear, relation: "implements", to: escaped }] }), root)).rejects.toThrow("escapes project root");
	});

	test("generates a stable Map while retaining Initiative Epic Story Evidence columns", () => {
		const { ledger } = fixture();
		const linear = { kind: "linear-issue", id: "WOO-1", uuid: ledger.issues[0]!.uuid, url: ledger.issues[0]!.url } as const;
		const initiative = { kind: "initiative", id: "INIT-999" } as const, epic = { kind: "epic", id: "EP-999" } as const, story = { kind: "story", id: "ST-999-01" } as const, evidence = { kind: "evidence", id: ".www/evidence/map.json" } as const;
		const manifest = parseWorkTraceabilityManifest({ schemaVersion: 1, references: [initiative, epic, story, linear, evidence], links: [
			{ from: initiative, relation: "tracks", to: epic }, { from: epic, relation: "tracks", to: story }, { from: story, relation: "tracks", to: linear }, { from: evidence, relation: "evidences", to: story },
		] });
		const first = buildDevelopmentMap("# WWW Development Map\n\n기존 설명\n", ledger, manifest);
		const second = buildDevelopmentMap(first, ledger, manifest);
		expect(second).toBe(first);
		const mutated = first.replace("| 연결됨 |", "| 깨짐 | ");
		expect(buildDevelopmentMap(mutated, ledger, manifest)).not.toBe(mutated);
		expect(first).toContain("| Initiative | Epic | Story | Evidence | Linear | Code Unit | Obsidian | PR code evidence | Validation Run | 무결성 | 다음 전환 |");
		expect(first).toContain("| INIT-999 | EP-999 | ST-999-01 | .www/evidence/map.json<br>evidence.json | WOO-1 | Code-001 | detail | #46 (Chat v0.1 code) | validation-1 | 연결됨 |");
		expect(issuesForWorkReference(manifest, "evidence", evidence.id)).toEqual(["WOO-1"]);
	});
});

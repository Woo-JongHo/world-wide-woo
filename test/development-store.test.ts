import { Database } from "bun:sqlite";
import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { DevelopmentStore } from "../src/infrastructure/development-store.js";

/** @linear WOO-696 */
const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
function fixture() {
 const root = mkdtempSync(join(tmpdir(), "www-development-test-")); roots.push(root);
 const options = { projectRoot: join(root, "project"), dataRoot: join(root, "data") };
 const store = new DevelopmentStore(options);
 const unit = store.registerUnit({ name: "Message" });
 const issue = { id: "WOO-683", uuid: "83a6ac75-5383-4323-850d-93f0677ae8a1", url: "https://linear.app/woo/issue/WOO-683/message" };
 store.linkIssue({ unitId: unit.id, issue });
 store.bindRun({ runId: "run-a", issueIds: [issue.id], unitIds: [unit.id] });
 return { root, options, store, unit, issue };
}

describe("development source ledger and shared SQLite", () => {
 test("preserves captured attribution across binding changes and rejects conflicting replay", () => {
  const { store, unit } = fixture();
  const input = { runId: "run-a", sourceEventId: "provider-turn-1", kind: "message", body: "public text" };
  const first = store.captureRecord(input);
  store.bindRun({ runId: "run-a", issueIds: ["WOO-683"], unitIds: [] });
  expect(store.captureRecord(input)).toEqual(first);
  const second = store.captureRecord({ ...input, sourceEventId: "provider-turn-2" });
  expect(first.unitIds).toEqual([unit.id]); expect(second.unitIds).toEqual([]);
  expect(first.bindingId).not.toBe(second.bindingId);
  expect(() => store.captureRecord({ ...input, body: "different" })).toThrow("Source event conflict");
  expect(store.getRunContext("run-a").records).toHaveLength(2);
  expect(() => store.captureRecord({ ...input, runId: "unbound" })).toThrow("explicitly bound"); store.close();
 });
 test("rebuilds after DB loss and reports modified source rather than accepting it", () => {
  const { options, store } = fixture();
  const record = store.captureRecord({ runId: "run-a", sourceEventId: "one", kind: "message", body: "original" });
  const before = store.getRunContext("run-a"); const index = store.indexPath; store.close();
  rmSync(index); rmSync(`${index}-wal`, { force: true }); rmSync(`${index}-shm`, { force: true });
  const restored = new DevelopmentStore(options);
  expect(restored.getRunContext("run-a").integrity.status).toBe("stale");
  restored.rebuildIndex();
  expect(restored.getRunContext("run-a")).toEqual(before);
  const path = join(restored.sourceRoot, `record-${record.id}.json`);
  const envelope = JSON.parse(readFileSync(path, "utf8")); envelope.payload.body = "tampered"; writeFileSync(path, JSON.stringify(envelope));
  expect(restored.getRunContext("run-a").integrity.status).toBe("corrupt");
  expect(() => restored.rebuildIndex()).toThrow("digest");
  expect(restored.getRunContext("run-a").records).toHaveLength(0); restored.close();
 });
 test("keeps original v1 UUID references queryable without Unit and distinguishes test verdict", () => {
  const { store, options, issue } = fixture();
  const code = { kind: "code", id: "src/message.ts" };
  const ref = { kind: "linear-issue" as const, ...issue };
  writeFileSync(join(options.projectRoot, ".www/control-ledger/traceability.json"), JSON.stringify({ schemaVersion: 1, references: [ref, code], links: [{ from: ref, relation: "implements", to: code }] }));
  expect(store.getIssueContext(issue.id).legacyReferences).toContainEqual(ref);
  expect(store.getIssueContext(issue.id).legacyLinks).toHaveLength(1);
  expect(() => store.recordTest({ runId: "run-a", sourceEventId: "test-1", command: "bun test", cwd: options.projectRoot, status: "passed", exitCode: 1, output: "failed" })).toThrow("disagree");
  const result = store.recordTest({ runId: "run-a", sourceEventId: "test-1", command: "bun test", cwd: options.projectRoot, status: "failed", exitCode: 1, output: "failed" });
  expect(result.status).toBe("failed"); expect("accepted" in result).toBe(false); store.close();
 });
 test("rejects a reused Linear id or UUID with a different URL across source and legacy links", () => {
  const { store, options, unit, issue } = fixture();
  expect(() => store.linkIssue({ unitId: unit.id, issue: { ...issue, uuid: "59b87827-996a-486c-a233-b3c502e713a4", url: `${issue.url}-forged` } })).toThrow("Linear identity conflict");
  const legacyIssue = { kind: "linear-issue" as const, id: "WOO-684", uuid: issue.uuid, url: "https://linear.app/woo/issue/WOO-684/original" };
  writeFileSync(join(options.projectRoot, ".www/control-ledger/traceability.json"), JSON.stringify({ schemaVersion: 1, references: [legacyIssue], links: [] }));
  expect(() => store.rebuildIndex()).toThrow("Conflicting Linear identity");
  store.close();
 });
 test("serializes independent processes and preserves every source event", async () => {
  const { store, options } = fixture(); store.close();
  const modulePath = resolve("src/infrastructure/development-store.ts");
  const processes = Array.from({ length: 4 }, (_, worker) => Bun.spawn([process.execPath, "-e", `import {DevelopmentStore} from ${JSON.stringify(modulePath)}; const store=new DevelopmentStore(${JSON.stringify(options)}); for(let i=0;i<8;i++) store.captureRecord({runId:'run-a',sourceEventId:${JSON.stringify(`worker-${worker}-`)}+i,kind:'message',body:'captured'}); store.close();`], { stdout: "pipe", stderr: "pipe" }));
  for (const child of processes) { const error = await new Response(child.stderr).text(); expect(await child.exited, error).toBe(0); }
  const reader = new DevelopmentStore(options); const context = reader.getRunContext("run-a");
  expect(context.records).toHaveLength(32); expect(new Set(context.records.map(x => x.id)).size).toBe(32); expect(context.integrity.status).toBe("current"); reader.close();
 });
 test("binds an asynchronous test to its start binding and detects DB payload tampering", () => {
  const { store } = fixture();
  const original = store.getRunContext("run-a").bindings[0];
  store.bindRun({ runId: "run-a", issueIds: ["WOO-683"], unitIds: [] });
  const result = store.recordTest({ runId: "run-a", bindingId: original.id, sourceEventId: "delayed-test", command: "bun test", cwd: "/tmp", status: "passed", exitCode: 0, output: "passed" });
  expect(result.bindingId).toBe(original.id); expect(result.unitIds).toEqual(original.unitIds);
  const db = new Database(store.indexPath);
  db.query("UPDATE development_sources SET payload = ? WHERE project = ? AND kind = 'test'").run(JSON.stringify({ ...result, output: "forged" }), store.projectId); db.close();
  const context = store.getRunContext("run-a"); expect(context.integrity.status).toBe("corrupt"); expect(context.tests).toHaveLength(0);
  store.rebuildIndex(); expect(store.getRunContext("run-a").tests[0].output).toBe("passed"); store.close();
 });
 test("rebuild is project scoped within one shared database", () => {
  const { store, options, root } = fixture();
  const other = new DevelopmentStore({ projectRoot: join(root, "second-project"), dataRoot: options.dataRoot });
  const unit = other.registerUnit({ name: "Other" }); store.rebuildIndex();
  expect(other.getUnitContext(unit.id).units).toHaveLength(1); expect(store.getUnitContext(unit.id).units).toHaveLength(0);
  expect(other.indexPath).toBe(store.indexPath); other.close(); store.close();
 });
});

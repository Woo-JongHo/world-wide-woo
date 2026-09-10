import { afterEach, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { verifyLocalWorkflow } from "../src/adapters/outbound/development/local-workflow-verifier";

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
function fixture() {
 const root = mkdtempSync(join(tmpdir(), "workflow-preflight-test-")); roots.push(root);
 mkdirSync(join(root, ".woo")); mkdirSync(join(root, ".www/control-ledger"), { recursive: true }); mkdirSync(join(root, "src"));
 writeFileSync(join(root, ".woo/units.yaml"), JSON.stringify({ schemaVersion: 1, units: [{ id: "Code-001", name: "Example", code: { path: "src/example.ts", symbol: "Example" }, linear: ["issue-1"] }] }));
 writeFileSync(join(root, ".www/control-ledger/traceability-v3.json"), JSON.stringify({ projectId: "project", entities: [{ kind: "issue", id: "issue-1" }] }));
 writeFileSync(join(root, "src/example.ts"), "export class Example {}\n"); return root;
}
test("same workflow independently verifies two projects and binds evidence to root and bytes", async () => {
 const a = await verifyLocalWorkflow(fixture()); const b = await verifyLocalWorkflow(fixture());
 expect(a.status).toBe("passed"); expect(b.status).toBe("passed"); expect(a.subjectDigest).not.toBe(b.subjectDigest);
 expect(a.evidence.some(value => value.includes("src/example.ts") && /sha256:[a-f0-9]{64}/.test(value))).toBe(true);
 expect(a.issues).toEqual([]);
});
test("missing local issue reference fails", async () => {
 const root = fixture(); writeFileSync(join(root, ".www/control-ledger/traceability-v3.json"), '{"projectId":"project","issues":[]}');
 const result = await verifyLocalWorkflow(root); expect(result.status).toBe("failed"); expect(result.issues.join()).toContain("issue-1");
});
test("changed code invalidates previously checked subject", async () => {
 const root = fixture(); const before = await verifyLocalWorkflow(root);
 writeFileSync(join(root, "src/example.ts"), "export class Example { updated() {} }\n");
 const after = await verifyLocalWorkflow(root, { subjectDigest: before.subjectDigest });
 expect(after.status).toBe("failed"); expect(after.issues.join()).toContain("STALE");
});
test("zero units cannot pass", async () => {
 const root = fixture(); writeFileSync(join(root, ".woo/units.yaml"), '{"schemaVersion":1,"units":[]}');
 expect((await verifyLocalWorkflow(root)).status).toBe("failed");
});
test("missing inputs and missing symbol fail with reasons", async () => {
 const root = fixture(); writeFileSync(join(root, "src/example.ts"), "export class Another {}\n");
 expect((await verifyLocalWorkflow(root)).issues.join()).toContain("Example");
 rmSync(join(root, ".woo/units.yaml")); expect((await verifyLocalWorkflow(root)).issues.join()).toContain(".woo/units.yaml");
});
test("symlink escape and traversal are rejected", async () => {
 const root = fixture(); const outside = fixture();
 rmSync(join(root, "src/example.ts")); symlinkSync(join(outside, "src/example.ts"), join(root, "src/example.ts"));
 expect((await verifyLocalWorkflow(root)).status).toBe("failed");
 writeFileSync(join(root, ".woo/units.yaml"), JSON.stringify({ schemaVersion: 1, units: [{ id: "Code-001", name: "bad", code: { path: "../outside.ts", symbol: "Example" }, linear: ["issue-1"] }] }));
 expect((await verifyLocalWorkflow(root)).issues.join()).toContain("PATH");
});
test("change while validation awaits read-back is uncertain", async () => {
 const root = fixture(); const pending = verifyLocalWorkflow(root);
 writeFileSync(join(root, "src/example.ts"), "export class Example { changed() {} }\n");
 const result = await pending; expect(result.status).toBe("uncertain"); expect(result.issues.join()).toContain("SOURCE_CHANGED");
});
test("v2 ledger fallback works and adding preferred v3 invalidates the subject", async () => {
 const root = fixture(); rmSync(join(root, ".www/control-ledger/traceability-v3.json"));
 writeFileSync(join(root, ".www/control-ledger/traceability-v2.json"), '{"projectId":"project","issues":[{"id":"issue-1"}]}');
 const before = await verifyLocalWorkflow(root); expect(before.status).toBe("passed");
 writeFileSync(join(root, ".www/control-ledger/traceability-v3.json"), '{"projectId":"project","entities":[{"kind":"issue","id":"issue-1"}]}');
 expect((await verifyLocalWorkflow(root, before)).status).toBe("failed");
});
test("manifest and ledger symlinks are refused", async () => {
 for (const path of [".woo/units.yaml", ".www/control-ledger/traceability-v3.json"]) {
  const root = fixture(); const outside = fixture(); rmSync(join(root, path)); symlinkSync(join(outside, path), join(root, path));
  expect((await verifyLocalWorkflow(root)).issues.join()).toContain("SYMLINK");
 }
});
test("optional local note is scoped explicitly and its bytes invalidate the subject", async () => {
 const root = fixture();
 writeFileSync(join(root, ".woo/units.yaml"), JSON.stringify({ schemaVersion: 1, units: [{ id: "Code-001", name: "Example", code: { path: "src/example.ts", symbol: "Example" }, linear: ["issue-1"], obsidian: "note.md" }] }));
 const absent = await verifyLocalWorkflow(root); expect(absent.status).toBe("passed"); expect(absent.evidence.join()).toContain("local-scope-excluded:obsidian:note.md");
 writeFileSync(join(root, "note.md"), "# local note");
 const present = await verifyLocalWorkflow(root); expect(present.status).toBe("passed"); expect(present.subjectDigest).not.toBe(absent.subjectDigest);
 writeFileSync(join(root, "note.md"), "# updated note"); expect((await verifyLocalWorkflow(root, present)).status).toBe("failed");
});

import      { afterEach, expect, test } from "bun:test"                                                     ;
import      {
              mkdtempSync           ,
              mkdirSync             ,
              writeFileSync         ,
              rmSync                ,
              symlinkSync           ,
                                      } from "node:fs"                                                      ;
import      { tmpdir                  } from "node:os"                                                      ;
import      { join                    } from "node:path"                                                    ;
import      { verifyLocalWorkflow     } from "../src/adapters/outbound/development/local-workflow-verifier" ;

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
function fixture() {
 const root = mkdtempSync(join(tmpdir(), "workflow-preflight-test-")); roots.push(root);
 mkdirSync(join(root, ".woo")); mkdirSync(join(root, "src"));
 writeFileSync(join(root, ".woo/units.yaml"), JSON.stringify({ schemaVersion: 1, units: [{ id: "Code-001", name: "Example", code: { path: "src/example.ts", symbol: "Example" } }] }));
 writeFileSync(join(root, "src/example.ts"), "export class Example {}\n"); return root;
}
test("same workflow independently verifies two projects and binds evidence to root and bytes", async () => {
 const a = await verifyLocalWorkflow(fixture()); const b = await verifyLocalWorkflow(fixture());
 expect(a.status).toBe("passed"); expect(b.status).toBe("passed"); expect(a.subjectDigest).not.toBe(b.subjectDigest);
 expect(a.evidence.some(value => value.includes("src/example.ts") && /sha256:[a-f0-9]{64}/.test(value))).toBe(true);
 expect(a.issues).toEqual([]);
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
 writeFileSync(join(root, ".woo/units.yaml"), JSON.stringify({ schemaVersion: 1, units: [{ id: "Code-001", name: "bad", code: { path: "../outside.ts", symbol: "Example" } }] }));
 expect((await verifyLocalWorkflow(root)).issues.join()).toContain("PATH");
});
test("change while validation awaits read-back is uncertain", async () => {
 const root = fixture(); const pending = verifyLocalWorkflow(root);
 writeFileSync(join(root, "src/example.ts"), "export class Example { changed() {} }\n");
 const result = await pending; expect(result.status).toBe("uncertain"); expect(result.issues.join()).toContain("SOURCE_CHANGED");
});
test("manifest symlinks are refused", async () => {
 for (const path of [".woo/units.yaml"]) {
  const root = fixture(); const outside = fixture(); rmSync(join(root, path)); symlinkSync(join(outside, path), join(root, path));
  expect((await verifyLocalWorkflow(root)).issues.join()).toContain("SYMLINK");
 }
});
test("local verification requires only a code manifest and code bytes", async () => {
 const root = fixture(); const result = await verifyLocalWorkflow(root);
 expect(result.status                                                                                        ).toBe        ("passed") ;
 expect(result.evidence                                                                                      ).toHaveLength(2       ) ;
 expect(result.evidence.every(value => value.includes(".woo/units.yaml") || value.includes("src/example.ts"))).toBe        (true    ) ;
});

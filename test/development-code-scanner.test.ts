import { expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { scanDevelopmentCode } from "../src/workflows/tui-development/adapters/code-scanner";

test("annotation scanner ignores strings and keeps declarations separate without inferring edges", () => {
 const root = mkdtempSync(join(tmpdir(), "www-annotations-"));
 try {
  execFileSync("git", ["init", "--quiet"], { cwd: root }); mkdirSync(join(root,"src"));
  const id = "27b9f16e-c312-4d2a-960b-b21126c8146f";
  writeFileSync(join(root,"src/example.ts"), `const fake = '@unit unknown';\n/** @unit ${id}\n * @linear WOO-683 */\nexport const real = 1;\n// @unit missing\n`);
  const result=scanDevelopmentCode(root,[{id,name:"Message",createdAt:"2026-09-06"}],[{id:"WOO-683",uuid:"ea233806-8926-4e7f-90b1-8328f3f874d4",url:"https://linear.app/woo-world/issue/WOO-683"}]);
  expect(result.locations).toHaveLength(2); expect(result.locations[0]?.line).toBe(2);
  expect(result.locations[0]?.unitIds).toEqual([id]); expect(result.errors).toHaveLength(1); expect(result.errors[0]).toContain("missing");
 } finally {rmSync(root,{recursive:true,force:true});}
});

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as ts from "typescript/unstable/ast";
import type { DevelopmentIssue, DevelopmentUnit } from "../../core/domain/development/development-records.js";

export interface DevelopmentCodeLocation {
 path: string; line: number; unitIds: string[]; issueIds: string[];
}
export interface DevelopmentCodeScan { locations: DevelopmentCodeLocation[]; errors: string[] }

/** @linear WOO-695
 * Declaration observations only: co-location never creates a Unit–Issue edge.
 */
export function scanDevelopmentCode(projectRoot: string, units: readonly DevelopmentUnit[], issues: readonly DevelopmentIssue[]): DevelopmentCodeScan {
 const files = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z", "--", "src", "test"], { cwd: projectRoot, encoding: "utf8" }).split("\0");
 const result: DevelopmentCodeScan = { locations: [], errors: [] };
 for (const path of [...new Set(files)].filter(p => /\.[cm]?[jt]sx?$/.test(p))) {
  let body: string;
  try { body = readFileSync(join(projectRoot, path), "utf8"); }
  catch (error) { result.errors.push(`${path}: ${String(error)}`); continue; }
  const scanner = ts.createScanner(false, path.endsWith("x") ? ts.LanguageVariant.JSX : ts.LanguageVariant.Standard, body);
  for (let token = scanner.scan(); token !== ts.SyntaxKind.EndOfFile; token = scanner.scan()) {
   if (token !== ts.SyntaxKind.SingleLineCommentTrivia && token !== ts.SyntaxKind.MultiLineCommentTrivia) continue;
   const comment = scanner.getTokenText();
   const unitIds = [...comment.matchAll(/@unit\s+([^\s*]+)/g)].map(m => m[1]!);
   const issueIds = [...comment.matchAll(/@linear((?:[ \t]+WOO-\d+)+)/g)].flatMap(m => m[1]!.match(/WOO-\d+/g) ?? []);
   if (!unitIds.length && !issueIds.length) continue;
   const line = body.slice(0, scanner.getTokenStart()).split("\n").length;
   for (const id of unitIds) if (!units.some(u => u.id === id)) result.errors.push(`${path}:${line}: 등록되지 않은 Unit ${id}`);
   for (const id of issueIds) if (!issues.some(i => i.id === id)) result.errors.push(`${path}:${line}: 연결 원장에 없는 Issue ${id}`);
   result.locations.push({ path, line, unitIds: [...new Set(unitIds)], issueIds: [...new Set(issueIds)] });
  }
 }
 return result;
}

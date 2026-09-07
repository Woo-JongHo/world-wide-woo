#!/usr/bin/env bun
import { readFileSync, existsSync } from "node:fs";
import { resolve, relative, isAbsolute } from "node:path";
import { execFileSync } from "node:child_process";
import * as ts from "typescript/unstable/ast";
import { API } from "typescript/unstable/async";
import YAML from "yaml";

type Code = { id: string; name: string; locations: { path: string; symbol: string }[]; linearIssueIds: string[]; detail: string };
export function validateCodeLinks(issues: readonly { id: string; description?: string }[], codes: readonly Code[]): string[] {
  const errors: string[] = [];
  for (const issue of issues) {
    const expected = codes.filter(code => code.linearIssueIds.includes(issue.id)).map(code => code.id).sort();
    if (!expected.length) continue;
    const line = issue.description?.match(/^Code-ID:\s*(.+)$/mu)?.[1];
    const actual = line?.replace(/\[([^\]]+)\]\([^)]+\)/gu, "$1").replace(/`/gu, "").split(/[\s,·]+/u).filter(Boolean).sort() ?? [];
    if (JSON.stringify(actual) !== JSON.stringify(expected)) errors.push(`${issue.id}: Code-ID 연결이 등록 원장과 다릅니다.`);
  }
  return errors;
}

export async function validateCodeIds(root: string, codes: readonly Code[]): Promise<string[]> {
  const errors: string[] = [];
  const ids = new Set<string>();
  const paths = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z", "--", "src"], { cwd: root, encoding: "utf8" }).split("\0").filter(p => /\.[cm]?[jt]sx?$/u.test(p));
  const declarations = new Map<string, { path: string; symbol: string }[]>();
  const api = new API({ cwd: root });
  try {
    const snapshot = await api.updateSnapshot({ openProjects: [resolve(root, "tsconfig.json")] });
    const project = snapshot.getProject(resolve(root, "tsconfig.json"));
    if (!project) throw new Error("TypeScript 프로젝트를 읽을 수 없습니다.");
    for (const path of new Set(paths)) {
      const file = await project.program.getSourceFile(resolve(root, path));
      if (!file) { errors.push(`${path}: 컴파일러에서 파일을 읽을 수 없습니다.`); continue; }
      for (const statement of file.statements) {
        if (!ts.isClassDeclaration(statement) && !ts.isFunctionDeclaration(statement)) continue;
        const ranges = ts.getLeadingCommentRanges(file.text, statement.pos) ?? [];
        const comments = ranges.map(range => file.text.slice(range.pos, range.end)).join("\n");
        if (comments.includes("@codeId") && comments.includes("@linear")) errors.push(`${path}: 대표 Code-ID 선언에 이슈 목록을 중복 보관하지 않습니다.`);
        for (const range of ranges) {
          for (const match of file.text.slice(range.pos, range.end).matchAll(/@codeId\s+([^\s*]+)/gu)) {
            const list = declarations.get(match[1]!) ?? [];
            list.push({ path, symbol: statement.name?.text ?? "" }); declarations.set(match[1]!, list);
          }
        }
      }
    }
  } finally { await api.close(); }
  for (const code of codes) {
    if (!/^\d{4}$/u.test(code.id) || code.id === "0000") errors.push(`${code.id}: 0001부터 네 자리 문자열을 사용합니다.`);
    if (ids.has(code.id)) errors.push(`${code.id}: 등록 ID 중복`);
    ids.add(code.id);
    if (!code.name || !code.locations.length || !code.linearIssueIds.length) errors.push(`${code.id}: 이름·위치·Linear 연결이 필요합니다.`);
    for (const path of [...code.locations.map(location => location.path), code.detail]) {
      const local = relative(root, resolve(root, path));
      if (isAbsolute(path) || local.startsWith("..") || !existsSync(resolve(root, path))) errors.push(`${code.id}: 저장소 안의 실제 경로가 아닙니다: ${path}`);
    }
    const observed = declarations.get(code.id) ?? [];
    if (observed.length !== 1 || !code.locations.some(location => location.path === observed[0]?.path && location.symbol === observed[0]?.symbol)) errors.push(`${code.id}: 등록 위치에 대표 @codeId 선언이 정확히 하나여야 합니다.`);
    if (code.linearIssueIds.some(id => !/^WOO-\d+$/u.test(id))) errors.push(`${code.id}: 잘못된 Linear ID`);
    const notePath = resolve(root, code.detail);
    if (relative(root, notePath).startsWith("..") || !existsSync(notePath)) continue;
    const frontmatter = readFileSync(notePath, "utf8").match(/^---\r?\n([\s\S]*?)\r?\n---/u)?.[1];
    if (!frontmatter || YAML.parse(frontmatter)?.code_id !== code.id) errors.push(`${code.id}: 상세 노트의 code_id가 일치하지 않습니다.`);
    if (frontmatter && "linear" in (YAML.parse(frontmatter) ?? {})) errors.push(`${code.id}: 노트의 이슈 목록은 연결 원장을 참조해야 합니다.`);
  }
  for (const id of declarations.keys()) if (!ids.has(id)) errors.push(`${id}: 등록되지 않은 코드 선언`);
  return errors;
}

if (import.meta.main) {
  const root = resolve(import.meta.dir, "..");
  const registry = JSON.parse(readFileSync(resolve(root, ".www/control-ledger/code-ids.json"), "utf8"));
  const errors = await validateCodeIds(root, registry.codes);
  const issuesPath = process.argv[2];
  if (issuesPath) errors.push(...validateCodeLinks(JSON.parse(readFileSync(resolve(issuesPath), "utf8")).issues, registry.codes));
  if (errors.length) { console.error(errors.join("\n")); process.exit(1); }
  console.log(`Code-ID ${registry.codes.length}개: 등록·대표 선언·파일·문서 연결 통과 (SQLite 연결 검사는 아님)`);
}

import { test, expect } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { validateCodeIds, validateCodeLinks } from "../scripts/code-id";

test("Code-ID는 문자열 예시를 선언으로 세지 않고 실제 선언·노트·중복을 대조한다", async () => {
  const root = mkdtempSync(join(tmpdir(), "www-code-id-"));
  try {
    execFileSync("git", ["init", "--quiet"], { cwd: root });
    mkdirSync(join(root, "src"));
    writeFileSync(join(root, "tsconfig.json"), JSON.stringify({ compilerOptions: { noEmit: true }, include: ["src/**/*.ts"] }));
    writeFileSync(join(root, "src/chat.ts"), 'const example = `\n/** @codeId 9999 */\nclass Fake {}\n`;\n/** @codeId 0001 */\nexport class Chat {}\n');
    writeFileSync(join(root, "note.md"), '---\ncode_id: "0001"\n---\nChat');
    const code = { id: "0001", name: "Chat", locations: [{ path: "src/chat.ts", symbol: "Chat" }], linearIssueIds: ["WOO-679"], detail: "note.md" };
    expect(validateCodeLinks([{ id: "WOO-679", description: "Code-ID: [0001](https://example.com/code)" }], [code])).toEqual([]);
    expect(validateCodeLinks([{ id: "WOO-679", description: "Code-ID: 0002" }], [code])).toHaveLength(1);
    expect(await validateCodeIds(root, [code])).toEqual([]);
    expect((await validateCodeIds(root, [code, code])).some(error => error.includes("등록 ID 중복"))).toBeTrue();
    writeFileSync(join(root, "note.md"), '---\ncode_id: "0002"\n---\n다른 기능');
    expect((await validateCodeIds(root, [code])).some(error => error.includes("상세 노트의 code_id"))).toBeTrue();
  } finally { rmSync(root, { recursive: true, force: true }); }
});

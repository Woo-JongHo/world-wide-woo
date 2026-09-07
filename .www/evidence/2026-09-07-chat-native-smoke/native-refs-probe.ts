import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CodexAppServer, StdioJsonLineTransport } from "../../../src/system/adapters/executors/codex-app-server";
const cwd = await mkdtemp(join(tmpdir(), "www-native-refs-"));
const raw: unknown[] = [], adapted: unknown[] = [];
const transport = new StdioJsonLineTransport();
transport.onLine(line => {
  try {
    const value = JSON.parse(line);
    if (typeof value.method !== "string" || !value.method.startsWith("item/")) return;
    const p = value.params ?? {};
    raw.push({ method: value.method, keys: Object.keys(p), threadId: p.threadId, turnId: p.turnId, itemId: p.itemId ?? p.item?.id, itemType: p.item?.type });
  } catch {}
});
let server: CodexAppServer | undefined;
let done!: () => void;
const completion = new Promise<void>(resolve => { done = resolve; });
let outcome = "pending";
try {
  server = await CodexAppServer.connectTransport(transport, { requestTimeoutMs: 20000 });
  server.subscribe(event => {
    if (event.type !== "notification") return;
    if (event.method.startsWith("item/")) adapted.push({ method: event.method, refs: event.refs });
    if (event.method === "turn/completed") { outcome = "turn-completed"; done(); }
  });
  const thread = await server.startThread({ cwd, model: "gpt-5.6-sol", effort: "low", approvalPolicy: "never", sandbox: "read-only", ephemeral: true });
  await server.startTurn({ threadId: thread.id, text: "연결 확인용입니다. 도구를 사용하지 말고 '연결 확인' 두 단어만 답하세요.", model: "gpt-5.6-sol", effort: "low", approvalPolicy: "never" });
  let timeout: ReturnType<typeof setTimeout>;
  await Promise.race([completion, new Promise<void>(resolve => { timeout = setTimeout(() => { outcome = "timeout"; resolve(); }, 45000); })]);
  clearTimeout(timeout!);
} catch (error) { outcome = String(error); }
finally { await (server?.close() ?? transport.close()); }
const report = { recordedAt: new Date().toISOString(), model: "gpt-5.6-sol", outcome, raw, adapted, scope: "isolated ephemeral Native adapter probe; not rendered TUI acceptance" };
await writeFile(join(import.meta.dir, "2026-09-07-native-refs-probe.json"), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report));

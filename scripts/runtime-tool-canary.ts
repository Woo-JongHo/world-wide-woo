/** Explicit opt-in live test: one ephemeral Native turn, one side-effect-free host tool. */
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { CodexAppServer } from "../src/adapters/outbound/execution/codex-app-server";

if (!process.argv.includes("--live")) throw new Error("This consumes one Native model turn. Run: bun scripts/runtime-tool-canary.ts --live");
const cwd = await mkdtemp(join(tmpdir(), "www-runtime-canary-"));
const nonce = randomUUID();
let server: CodexAppServer | undefined;
let calls = 0, accepted = false, terminal = false;
try {
	server = await CodexAppServer.connect({ requestTimeoutMs: 15000 });
	server.registerRuntimeTools([{ name: "www_runtime_canary", description: "Side-effect-free WWW transport test. Return the supplied nonce unchanged.", inputSchema: { type: "object", properties: { nonce: { type: "string" } }, required: ["nonce"], additionalProperties: false } }], async call => {
		calls++;
		const matches = !!call.arguments && typeof call.arguments === "object" && (call.arguments as { nonce?: unknown }).nonce === nonce;
		return { success: matches, text: JSON.stringify({ nonce, accepted: matches }) };
	});
	const finished = Promise.withResolvers<void>();
	server.subscribe(event => {
		if (event.type !== "notification") return;
		const item = event.params.item as Record<string, unknown> | undefined;
		if (event.method === "item/completed" && item?.type === "dynamicToolCall" && item.tool === "www_runtime_canary") accepted = item.success === true && JSON.stringify(item.contentItems).includes(nonce);
		if (event.method === "turn/completed" || event.method === "turn/failed") { terminal = true; finished.resolve(); }
	});
	const thread = await server.startThread({ cwd, ephemeral: true, sandbox: "read-only", approvalPolicy: "never" });
	await server.startTurn({ threadId: thread.id, text: `Transport test only. Call www_runtime_canary exactly once with nonce ${nonce}, then answer "canary complete". Do not use shell, MCP, files, agents, web, or any other tools.` });
	let timeout: ReturnType<typeof setTimeout> | undefined;
	try { await Promise.race([finished.promise, new Promise<never>((_, reject) => { timeout = setTimeout(() => reject(new Error("LIVE_CANARY_TIMEOUT")), 45000); })]); }
	finally { clearTimeout(timeout); }
	const result = { test: "runtime-tool-host-acceptance", calls, hostAcceptedToolResult: accepted, nativeTurnTerminated: terminal, strictIsolationProven: false };
	console.log(JSON.stringify(result));
	if (calls !== 1 || !accepted || !terminal) process.exitCode = 1;
} finally {
	await server?.close();
	await rm(cwd, { recursive: true, force: true });
}

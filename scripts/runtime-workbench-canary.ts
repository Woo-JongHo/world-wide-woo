/** Explicit live acceptance check through the actual Workbench and durable journal. No external mutation. */
import { mkdtemp, realpath, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CodexAppServer } from "../src/adapters/outbound/execution/codex-app-server";
import { ProjectWorkbench } from "../src/core/application/orchestration/project-workbench";
import { ActivityJournalStore } from "../src/adapters/outbound/persistence/activity-journal-store";
import { ThreadBoundActivityJournal } from "../src/adapters/outbound/workspace/project-workbench-session";
import { pinnedFileCapabilities } from "../src/adapters/outbound/workspace/pinned-file-capabilities";

if (!process.argv.includes("--live")) throw new Error("Consumes a Native model turn. Run: bun scripts/runtime-workbench-canary.ts --live");
const directory = await realpath(await mkdtemp(join(tmpdir(), "www-workbench-canary-")));
const writeFixture = process.argv.includes("--write-fixture");
const target = join(directory, "fixture.txt");
if (writeFixture) await writeFile(target, "before");
const native = await CodexAppServer.connect({ requestTimeoutMs: 15_000 });
const journal = new ThreadBoundActivityJournal(new ActivityJournalStore(directory), undefined, "request-intake-canary");
const workbench = new ProjectWorkbench(native, journal, { projectId: "canary", cwd: directory, sandbox: "read-only", approvalPolicy: "never", requestCapabilities: writeFixture ? pinnedFileCapabilities([target]) : [], acquireThreadLease: threadId => journal.bindThread(threadId) });
let timer: ReturnType<typeof setTimeout> | undefined;
try {
	const done = Promise.withResolvers<void>();
	const approvalIds = new Set<string | number>();
	workbench.subscribe(snapshot => {
		const approval = snapshot.pendingApproval;
		if (approval && !approvalIds.has(approval.requestId)) {
			approvalIds.add(approval.requestId);
			// Test-only host authority for this freshly created scratch file, never a user file.
			const accept = writeFixture && approval.params.authority === "runtime" && approval.params.command === `파일 교체 · ${target}`;
			void workbench.dispatch({ type: "approval.resolve", requestId: approval.requestId, response: { decision: accept ? "accept" : "decline" } });
		}
		if (snapshot.requestRuntime?.some(r => !!r.completedAt)) done.resolve();
	});
	const text = writeFixture
		? `WWW Runtime real-action canary. Using ONLY WWW runtime tools, replace the existing pinned file ${target} with exactly the UTF-8 string after (no newline). First inspect available capability schemas. Record UNDERSTAND, optionally skip DECOMPOSE, read the file via files.read-pinned in GROUND, record a public DECIDE, run files.replace-approved in EXECUTE using its beforeDigest, and perform a NEW files.read-pinned action in VERIFY to check the expected content. Complete stages with exact Runtime receipt IDs. Enter DELIVER and provide a brief result. The test host approves only this scratch-file operation. Never use Native shell, MCP, apply_patch, web, agents or non-WWW tools. Do not put protocol JSON in chat.`
		: "WWW Runtime acceptance canary. Answer only the value of 2 + 2. Use the WWW runtime tools to complete or explicitly skip all seven protocol stages. This is a trivial question: no file, shell, web, MCP, agent or other action is needed. Do not use any non-WWW tools. Record UNDERSTAND, skip unnecessary stages with a reason, enter DELIVER, then answer 4. Do not put protocol JSON in chat.";
	const sent = await workbench.dispatch({ type: "chat.send", text });
	if (sent.state !== "accepted") throw new Error(`CANARY_INTAKE_${sent.state}`);
	await Promise.race([done.promise, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("CANARY_TIMEOUT")), 120_000); })]);
	const request = workbench.snapshot.requestRuntime!.find(r => r.requestId === sent.commandId)!;
	const records = await journal.readAll("canary");
	const fileMatches = writeFixture ? await readFile(target, "utf8") === "after" : null;
	const result = { test: "runtime-workbench-acceptance", writeFixture, fileMatches, requestId: request.requestId, protocolVersion: request.protocolVersion, status: request.status, stages: request.stages.map(s => ({ id: s.id, status: s.status, skipReason: s.skipReason })), trustedReports: records.filter(a => a.payload.method === "runtime/stage-report").length, actionReceipts: records.filter(a => a.payload.method === "runtime/action-completed").map(a => ({ id: a.id, stage: a.payload.stage, capability: a.payload.capability, phase: a.phase })), approvals: approvalIds.size, deliveries: request.deliveries.map(d => d.target), issues: request.issues, journalDirectory: directory, strictIsolationProven: false };
	console.log(JSON.stringify(result));
	if (request.status !== "completed" || request.stages.length !== 7 || request.stages.some(s => !["completed", "skipped"].includes(s.status)) || writeFixture && !fileMatches) process.exitCode = 1;
} finally {
	clearTimeout(timer);
	await workbench.dispatch({ type: "chat.cancel" });
	await workbench.close();
}

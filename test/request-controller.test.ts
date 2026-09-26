import { describe, expect, test }                     from "bun:test";
import { createHash }                                 from "node:crypto";
import { mkdtemp, readFile, writeFile, realpath, rm } from "node:fs/promises";
import { tmpdir }                                     from "node:os";
import { join }                                       from "node:path";
import { RequestController }                          from "../src/core/application/orchestration/request-controller";
import type { RequestControllerDependencies }         from "../src/core/application/orchestration/request-controller";
import type { ProjectActivity }                       from "../src/core/domain/execution/project-activity";
import type { RuntimeToolCall }                       from "../src/core/ports/execution/runtime-tool-port";
import type { RequestActionCapability }               from "../src/core/ports/execution/request-action-port";
import { pinnedFileCapabilities }                     from "../src/adapters/outbound/workspace/pinned-file-capabilities";
import { projectRequestRuntime }                      from "../src/core/runtime/request-runtime";
import { requestRuntimeRows }                         from "../src/adapters/inbound/tui/features/monitoring/view/request-runtime-view";
import { projectRequestDestinations }                 from "../src/core/domain/work/request-projections";
import { stripTerminalSequences, visibleWidth }       from "@earendil-works/pi-tui";

const digest = (s: string) => `sha256:${createHash("sha256").update(s).digest("hex")}`;
function fixture() {
	const journal: ProjectActivity[] = [];
	let enabled = true, failAppend = false, counter = 0;
	const append: RequestControllerDependencies["append"] = async (call, kind, phase, payload) => {
		if (failAppend) throw new Error("disk failed");
		const sequence = journal.length + 1;
		const a: ProjectActivity = { schemaVersion: 1, id: `activity-${sequence}`, sequence, recordedAt: new Date(1700000000000 + sequence).toISOString(), projectId: "p", provider: "codex", kind, phase, nativeRefs: { threadId: call.threadId, turnId: call.turnId, itemId: call.callId }, sourceDigest: digest(JSON.stringify(payload)), payload };
		journal.push(a); return a;
	};
	const call                                = (tool: string, args: Record<string, unknown> = {}): RuntimeToolCall => ({ threadId: "t", turnId: "turn", callId: `call-${++counter}`, tool: `www_runtime_${tool}`, arguments: { requestId: "r", ...args } }) ;
	const deps: RequestControllerDependencies = { activities: () => journal, append, digest, canAct: () => enabled }                                                                                                                                         ;
	const controller                          = (capabilities: readonly RequestActionCapability[] = [], extra: Partial<RequestControllerDependencies> = {}) => new RequestController({ ...deps, capabilities, ...extra })                                    ;
	const init = async () => {
		await append(call("inspect"), "progress", "started", { method: "request/submitted", requestId: "r", protocolVersion: 2, text: "파일 변경" });
		await append(call("inspect"), "progress", "started", { method: "request/started", requestId: "r" });
	};
	const inspect = async (c: RequestController) => JSON.parse((await c.handle(call("inspect"))).text);
	const propose = async (c: RequestController, stage: string, status: string) => c.handle(call("propose", { expectedRevision: (await inspect(c)).revision, report: { requestId: "r", stage, status, summary: "이 요청의 공개 결과 또는 생략 이유" } }));
	const executeStage = async (c: RequestController) => {
		for (const stage of ["UNDERSTAND", "DECOMPOSE", "GROUND", "DECIDE"]) expect((await propose(c, stage, "skipped")).success).toBe(true);
		expect((await propose(c, "EXECUTE", "running")).success).toBe(true);
	};
	return { journal, append, call, controller, init, inspect, propose, executeStage, disable: () => { enabled = false; }, failWrites: () => { failAppend = true; } };
}

describe("RequestController", () => {
	test("accepts pass as the public alias for a reasoned skipped stage", async () => {
		const f = fixture(); await f.init(); const c = f.controller();
		const result = await f.propose(c, "UNDERSTAND", "pass");
		expect(result.success).toBe(true);
		expect((await f.inspect(c)).request.stages[0]).toMatchObject({ status: "skipped", skipReason: "이 요청의 공개 결과 또는 생략 이유" });
	});
	test("Runtime control transport is not accumulated as business evidence", async () => {
		const f = fixture(); await f.init();
		await f.append(f.call("inspect"), "tool", "completed", { method: "item/completed", params: { item: { type: "dynamicToolCall", tool: "www_runtime_inspect", success: true } } });
		expect((await f.inspect(f.controller())).request.stages[0].evidence).toEqual([]);
		await f.append(f.call("inspect"), "tool", "completed", { method: "item/completed", params: { item: { type: "commandExecution", command: "read fixture", exitCode: 0 } } });
		expect((await f.inspect(f.controller())).request.stages[0].evidence).toHaveLength(1);
	});
	test("a stale host approval cannot cross the write-ahead boundary", async () => {
		const f = fixture(); await f.init(); let writes = 0;
		const cap: RequestActionCapability = { id: "fixture", effect: "workspace-change", authorize: async () => false, approvalPreview: async () => ({ summary: "exact action", detail: "fixture" }), execute: async () => { writes++; return { outcome: "passed", summary: "changed", source: {} }; } };
		const c = f.controller([cap], { requestApproval: async call => { await f.append(call, "progress", "completed", { method: "runtime/changed-during-approval" }); return true; } });
		await f.executeStage(c);
		const result = await c.handle(f.call("act", { operationId: "write", capability: cap.id, stage: "EXECUTE", expectedRevision: (await f.inspect(c)).revision, arguments: {} }));
		expect(result.success).toBe(false); expect(writes).toBe(0);
		expect(f.journal.some(a => a.payload.method === "runtime/action-prepared")).toBe(false);
		expect(f.journal.find(a => a.payload.method === "runtime/approval-resolved")?.payload.decision).toBe("decline");
	});
	test("host recovers a terminated turn read-only without reopening stages or accepting Native recovery", async () => {
		const f = fixture(); await f.init(); let writes = 0, reads = 0;
		const cap: RequestActionCapability = { id: "fixture", effect: "workspace-change", authorize: async () => true, execute: async () => { writes++; throw new Error("lost after write"); }, reconciliation: { prepare: () => ({ path: "pinned" }), readBack: async () => { reads++; return { confirmed: true, summary: "desired state observed", source: { readBack: true } }; } } };
		const c = f.controller([cap]); await f.executeStage(c);
		await c.handle(f.call("act", { expectedRevision: (await f.inspect(c)).revision, stage: "EXECUTE", operationId: "uncertain", capability: cap.id, arguments: {} }));
		await f.append(f.call("inspect"), "progress", "cancelled", { method: "turn/interrupted" });
		const before = (await f.inspect(c)).request;
		f.disable();
		const restarted = f.controller([cap], { canRecover: () => true });
		const call = f.call("reconcile", { operationId: "uncertain" });
		expect((await restarted.handle(call)).success).toBe(false);
		expect((await f.controller([cap]).recover(call)).success).toBe(false);
		expect((await restarted.recover(f.call("act", { operationId: "evil" }))).success).toBe(false);
		expect((await restarted.recover(call)).success).toBe(true);
		expect(reads).toBe(1); expect(writes).toBe(1);
		const after = (await f.inspect(restarted)).request;
		expect(after.actions[0].status).toBe("reconciled");
		expect(after.stages).toEqual(before.stages); expect(after.completedAt).toBe(before.completedAt);
		expect(after.status).toBe(before.status);
		expect((await restarted.recover(call)).success).toBe(true); expect(reads).toBe(1);
	});
	test("required destinations block final and cannot borrow another publication receipt", async () => {
		const f = fixture(); await f.init(); let published = 0;
		const cap: RequestActionCapability = { id: "publish", effect: "publish", authorize: async () => true, execute: async intent => { published++; return { outcome: "passed", summary: "Read-back publication", source: { readBack: true }, delivery: { target: String(intent.arguments.target), artifact: String(intent.arguments.artifact) } }; } };
		const c = f.controller([cap]);
		for (const target of ["github", "linear"]) expect((await c.handle(f.call("require_delivery", { expectedRevision: (await f.inspect(c)).revision, target, artifact: `${target}-1` }))).success).toBe(true);
		for (const stage of ["UNDERSTAND", "DECOMPOSE", "GROUND", "DECIDE", "EXECUTE", "VERIFY"]) expect((await f.propose(c, stage, "skipped")).success).toBe(true);
		expect((await f.propose(c, "DELIVER", "skipped")).success).toBe(false);
		await f.append(f.call("inspect"), "message", "completed", { role: "assistant", text: "Everything delivered" });
		expect((await f.inspect(c)).request.deliveries).toEqual([]);
		expect((await f.propose(c, "DELIVER", "running")).success).toBe(true);
		const publish = async (target: string) => JSON.parse((await c.handle(f.call("act", { expectedRevision: (await f.inspect(c)).revision, operationId: target, stage: "DELIVER", capability: cap.id, arguments: { target, artifact: `${target}-1` } }))).text).receipt                                                 ;
		const github  = await publish("github")                                                                                                                                                                                                                                                                            ;
		const report  = async (status: string, target: string, ref: string) => c.handle(f.call("propose", { expectedRevision: (await f.inspect(c)).revision, report: { requestId: "r", stage: "DELIVER", status, summary: "Publication progress", deliveries: [{ target, artifact: `${target}-1`, evidence: [ref] }] } })) ;
		expect((await report("completed", "linear", github.id)).success).toBe(false);
		expect((await report("completed", "github", github.id)).success).toBe(false);
		expect((await report("failed", "github", github.id)).success).toBe(true);
		expect((await c.handle(f.call("replan", { expectedRevision: (await f.inspect(c)).revision, stage: "DELIVER", reason: "남은 Linear 대상만 재개" }))).success).toBe(true);
		expect((await f.inspect(c)).request.requiredDeliveries).toHaveLength(2);
		expect((await f.inspect(c)).request.deliveries).toHaveLength(1);
		const linear = await publish("linear");
		expect((await report("completed", "linear", linear.id)).success).toBe(true);
		await f.append(f.call("inspect"), "message", "completed", { role: "assistant", text: "Both confirmed" });
		await f.append(f.call("inspect"), "progress", "completed", { method: "turn/completed" });
		expect((await f.inspect(c)).request.status).toBe("completed");
		expect(published).toBe(2);
	});
	test("publish success without an attested identity remains uncertain", async () => {
		const f = fixture(); await f.init();
		const cap: RequestActionCapability = { id: "publish", effect: "publish", authorize: async () => true, execute: async () => ({ outcome: "passed", summary: "Unidentified publication", source: {} }) };
		const c = f.controller([cap]);
		for (const stage of ["UNDERSTAND", "DECOMPOSE", "GROUND", "DECIDE", "EXECUTE", "VERIFY"]) await f.propose(c, stage, "skipped");
		await f.propose(c, "DELIVER", "running");
		const result = await c.handle(f.call("act", { expectedRevision: (await f.inspect(c)).revision, operationId: "publish", stage: "DELIVER", capability: cap.id, arguments: {} }));
		expect(JSON.parse(result.text).reason).toBe("DELIVERY_RECEIPT_MISSING");
		expect((await f.inspect(c)).request.actions[0].status).toBe("unconfirmed");
		expect((await f.propose(c, "DELIVER", "skipped")).success).toBe(false);
	});
	test("verification failure replans within seven stages without accepting old receipts", async () => {
		const f = fixture(); await f.init();
		const cap: RequestActionCapability = { id: "read", effect: "read", authorize: async () => true, execute: async () => ({ outcome: "passed", summary: "Read back result", source: { digest: "observed" } }) };
		const c = f.controller([cap]); await f.executeStage(c);
		let operation = 0                                                                                                                                                                                                                                 ;
		const act     = async (stage: string) => JSON.parse((await c.handle(f.call("act", { expectedRevision: (await f.inspect(c)).revision, operationId: `op-${++operation}`, stage, capability: cap.id, arguments: {} }))).text).receipt                ;
		const tool    = await act("EXECUTE")                                                                                                                                                                                                              ;
		const report  = async (stage: string, status: string, evidence: string[] = []) => c.handle(f.call("propose", { expectedRevision: (await f.inspect(c)).revision, report: { requestId: "r", stage, status, summary: "Public result", evidence } })) ;
		expect((await report("EXECUTE", "completed", [tool.id])).success).toBe(true);
		expect((await report("VERIFY", "failed")).success).toBe(true);
		const replan = async (extra = {}) => c.handle(f.call("replan", { expectedRevision: (await f.inspect(c)).revision, stage: "EXECUTE", reason: "검증 실패로 구현 수정", ...extra }));
		expect((await replan({ stage: "DELIVER" })).success).toBe(false);
		expect((await replan({ reason: " " })).success).toBe(false);
		expect((await replan({ expectedRevision: 0 })).success).toBe(false);
		expect((await replan()).success).toBe(true);
		const request = projectRequestRuntime(f.journal, "t")[0]!;
		expect(request.attempt).toBe(2); expect(request.stages).toHaveLength(7);
		expect(request.previousAttempts[0]!.stages[5]!.status).toBe("failed");
		expect(request.previousAttempts[0]!.stages[4]!.evidence.some(e => e.activityId === tool.id)).toBe(true);
		expect(request.stages[4]!.evidence).toEqual([]);
		expect(request.stages[4]!.status).toBe("running"); expect(request.stages[5]!.status).toBe("pending");
		expect((await report("EXECUTE", "completed", [tool.id])).success).toBe(false);
		const fresh = await act("EXECUTE");
		expect((await report("EXECUTE", "completed", [fresh.id])).success).toBe(true);
		expect((await report("VERIFY", "completed", [tool.id])).success).toBe(false);
		expect((await report("VERIFY", "completed", [fresh.id])).success).toBe(false);
		expect((await report("VERIFY", "running")).success).toBe(true);
		const check = await act("VERIFY");
		expect((await report("VERIFY", "completed", [check.id])).success).toBe(true);
		expect((await f.inspect(f.controller())).request.previousAttempts).toEqual(request.previousAttempts);
		await f.append(f.call("inspect"), "progress", "completed", { method: "turn/completed" });
		expect((await replan()).success).toBe(false);
	});
	test("lost file receipt is reconciled after restart without another write", async () => {
		const dir = await realpath(await mkdtemp(join(tmpdir(), "www-reconcile-")));
		try {
			const path = join(dir, "target.txt"); await writeFile(path, "before");
			const f = fixture(); await f.init(); const initial = f.controller(); await f.executeStage(initial);
			const revision = (await f.inspect(initial)).revision;
			const caps = pinnedFileCapabilities([path], [{ path, requestId: "r", operationId: "replace", expectedRevision: revision, beforeDigest: digest("before"), afterDigest: digest("after") }]);
			const write = caps[1]!; let executions = 0;
			const c = f.controller([{ ...write, execute: async (intent, signal) => { executions++; await write.execute(intent, signal); throw new Error("receipt lost"); } }]);
			const input = { expectedRevision: revision, operationId: "replace", stage: "EXECUTE", capability: write.id, arguments: { path, beforeDigest: digest("before"), content: "after" } };
			expect((await c.handle(f.call("act", input))).success).toBe(false);
			expect((await f.inspect(c)).request.actions[0].status).toBe("unconfirmed");
			const prepared = f.journal.find(a => a.payload.method === "runtime/action-prepared")!;
			expect(prepared.payload.reconciliation).toEqual({ path, beforeDigest: digest("before"), afterDigest: digest("after") });
			// Restoration needs the recorded locator and current read scope, not a fresh write permit.
			const restored = f.controller(pinnedFileCapabilities([path]));
			const reconcile = async (extra = {}) => restored.handle(f.call("reconcile", { expectedRevision: (await f.inspect(restored)).revision, operationId: "replace", ...extra }));
			expect(JSON.parse((await reconcile({ arguments: { path: "/outside" } })).text).reason).toBe("INVALID_RECONCILIATION");
			expect(JSON.parse((await reconcile({ expectedRevision: 0 })).text).reason).toBe("STALE_REVISION");
			expect(JSON.parse((await reconcile({ operationId: "foreign" })).text).reason).toBe("ACTION_NOT_FOUND");
			const receipt = JSON.parse((await reconcile()).text);
			expect(receipt.reason).toBe("ACTION_RECONCILED");
			expect(receipt.receipt.payload.source).toMatchObject({ observedDigest: digest("after"), readBack: true });
			expect((await f.inspect(restored)).request.actions[0].status).toBe("reconciled");
			expect(JSON.parse((await reconcile()).text).reason).toBe("RECORDED_RESULT");
			expect(JSON.parse((await restored.handle(f.call("act", input))).text).reason).toBe("RECORDED_RESULT");
			expect(executions).toBe(1); expect(await readFile(path, "utf8")).toBe("after");
			const completed = await restored.handle(f.call("propose", { expectedRevision: (await f.inspect(restored)).revision, report: { requestId: "r", stage: "EXECUTE", status: "completed", summary: "Desired state confirmed by read-back", evidence: [receipt.receipt.id] } }));
			expect(completed.success).toBe(true);
		} finally { await rm(dir, { recursive: true, force: true }); }
	});
	test("inconclusive reconciliation remains blocked and cannot advance through replay", async () => {
		const f = fixture(); await f.init(); let attempts = 0;
		const cap: RequestActionCapability = { id: "write", effect: "workspace-change", authorize: async () => true,
			reconciliation: { prepare: () => ({ target: "fixed" }), readBack: async () => ({ confirmed: false, summary: "No proof of desired state", source: { observed: "before" } }) },
			execute: async () => { attempts++; throw new Error("lost"); } };
		const c = f.controller([cap]); await f.executeStage(c);
		await c.handle(f.call("act", { expectedRevision: (await f.inspect(c)).revision, operationId: "op", stage: "EXECUTE", capability: "write", arguments: {} }));
		const result = await c.handle(f.call("reconcile", { expectedRevision: (await f.inspect(c)).revision, operationId: "op" }));
		expect(JSON.parse(result.text).reason).toBe("ACTION_STILL_UNCERTAIN");
		expect((await f.propose(c, "EXECUTE", "skipped")).success).toBe(false);
		await f.append(f.call("inspect"), "progress", "completed", { method: "runtime/stage-report", authority: "runtime", requestId: "r", report: { requestId: "r", stage: "EXECUTE", status: "skipped", summary: "bypass" } });
		expect((await f.inspect(c)).request.stages[4].status).toBe("running");
		expect((await f.inspect(c)).request.actions[0].status).toBe("unconfirmed");
		expect(f.journal.some(a => a.payload.method === "runtime/action-completed")).toBe(false);
		const request = projectRequestRuntime(f.journal, "t")[0]!;
		expect(request.events.some(e => e.type === "action.reconciliation-failed")).toBe(true);
		for (const width of [40, 80, 160]) {
			const rows = requestRuntimeRows(request, width, true);
			expect(rows.every(row => visibleWidth(row) <= width)).toBe(true);
			expect(stripTerminalSequences(rows.join("\n"))).toContain("결과 미확인");
		}
		for (const value of Object.values(projectRequestDestinations(request))) expect(value).toContain("재실행 금지");
		expect(attempts).toBe(1);
	});
	test("cancelled, unscoped and unrecorded read-back never clear uncertainty", async () => {
		for (const mode of ["cancel", "journal", "unavailable"]) {
			const f = fixture(); await f.init(); let reads = 0;
			let c: RequestController;
			const cap: RequestActionCapability = { id: "write", effect: "workspace-change", authorize: async () => true,
				reconciliation: { prepare: () => ({ target: "fixed" }), readBack: async () => { reads++; if (mode === "cancel") c.interrupt("t", "turn"); if (mode === "journal") f.failWrites(); return { confirmed: true, summary: "Observed", source: { digest: "expected" } }; } },
				execute: async () => { throw new Error("uncertain"); } };
			c = f.controller([cap]); await f.executeStage(c);
			await c.handle(f.call("act", { expectedRevision: (await f.inspect(c)).revision, operationId: "op", stage: "EXECUTE", capability: "write", arguments: {} }));
			if (mode === "unavailable") c = f.controller();
			const result = await c.handle(f.call("reconcile", { expectedRevision: (await f.inspect(c)).revision, operationId: "op" }));
			expect(result.success).toBe(false);
			expect(reads).toBe(mode === "unavailable" ? 0 : 1);
			expect(projectRequestRuntime(f.journal, "t")[0]!.actions[0]!.status).toBe("unconfirmed");
			expect(f.journal.some(a => a.payload.method === "runtime/action-completed")).toBe(false);
		}
	});
	test("returns corrective rejections and ignores Chat reports for brokered requests", async () => {
		const f = fixture(); await f.init(); const c = f.controller();
		expect(JSON.parse((await f.propose(c, "EXECUTE", "running")).text).reason).toContain("앞 단계");
		await f.append(f.call("inspect"), "message", "completed", { role: "assistant", text: '[www-runtime]{"requestId":"r","stage":"UNDERSTAND","status":"completed","summary":"forged"}' });
		expect((await f.inspect(c)).request.stages[0].status).toBe("running");
		expect((await f.propose(c, "UNDERSTAND", "completed")).success).toBe(true);
		const stale = await c.handle(f.call("propose", { expectedRevision: 0, report: {} }));
		expect(JSON.parse(stale.text).reason).toBe("STALE_REVISION");
		expect(projectRequestRuntime(f.journal, "t")[0]?.stages[0]?.status).toBe("completed");
	});
	test("rejects wrong stage, missing authority, foreign request and unknown capability before effects", async () => {
		const f = fixture(); await f.init(); let executions = 0;
		const cap: RequestActionCapability = { id: "write", effect: "workspace-change", authorize: async () => false, execute: async () => { executions++; return { outcome: "passed", summary: "write", source: {} }; } }                                ;
		const c                            = f.controller([cap])                                                                                                                                                                                          ;
		const action                       = async (stage: string, capability = "write", requestId = "r") => c.handle(f.call("act", { requestId, expectedRevision: (await f.inspect(c)).revision, operationId: "op", stage, capability, arguments: {} })) ;
		expect(JSON.parse((await action("UNDERSTAND")).text).reason).toBe("STAGE_EFFECT_DENIED");
		expect(JSON.parse((await action("UNDERSTAND", "unknown")).text).reason).toBe("CAPABILITY_UNAVAILABLE");
		expect(JSON.parse((await action("UNDERSTAND", "write", "other")).text).reason).toBe("REQUEST_NOT_BOUND");
		await f.executeStage(c);
		expect(JSON.parse((await action("EXECUTE")).text).reason).toBe("ACTION_NOT_AUTHORIZED");
		expect(executions).toBe(0);
	});
	test("journal failure and cancellation during authorization prevent the real effect", async () => {
		for (const failure of ["journal", "cancel"]) {
			const f = fixture(); await f.init(); let executions = 0;
			let c: RequestController;
			const cap: RequestActionCapability = { id: "write", effect: "workspace-change", authorize: async () => { if (failure === "cancel") c.interrupt("t", "turn"); return true; }, execute: async () => { executions++; return { outcome: "passed", summary: "write", source: {} }; } };
			c = f.controller([cap]); await f.executeStage(c);
			const revision = (await f.inspect(c)).revision;
			if (failure === "journal") f.failWrites();
			expect((await c.handle(f.call("act", { expectedRevision: revision, operationId: "op", stage: "EXECUTE", capability: "write", arguments: {} }))).success).toBe(false);
			expect(executions).toBe(0);
		}
	});
	test("a real pinned file changes only under the exact host permit; replay never executes it again", async () => {
		const dir = await realpath(await mkdtemp(join(tmpdir(), "www-control-")));
		try {
			const path = join(dir, "target.txt"); await writeFile(path, "before");
			const f = fixture(); await f.init(); const c = f.controller(); await f.executeStage(c);
			const revision   = (await f.inspect(c)).revision                                                                                                                                                         ;
			const caps       = pinnedFileCapabilities([path], [{ path, requestId: "r", operationId: "replace", expectedRevision: revision, beforeDigest: digest("before"), afterDigest: digest("after") }])          ;
			const controlled = f.controller(caps)                                                                                                                                                                    ;
			const input      = { expectedRevision: revision, operationId: "replace", stage: "EXECUTE", capability: "files.replace-approved", arguments: { path, content: "after", beforeDigest: digest("before") } } ;
			const denied     = await controlled.handle(f.call("act", { ...input, arguments: { ...input.arguments, content: "unapproved" } }))                                                                        ;
			expect(denied.success).toBe(false); expect(await readFile(path, "utf8")).toBe("before");
			const result = JSON.parse((await controlled.handle(f.call("act", input))).text);
			expect(result.reason).toBe("ACTION_RECORDED"); expect(await readFile(path, "utf8")).toBe("after");
			expect(result.receipt.payload.source).toMatchObject({ beforeDigest: digest("before"), afterDigest: digest("after"), readBack: true });
			expect(f.journal.findIndex(a => a.payload.method === "runtime/action-prepared")).toBeLessThan(f.journal.findIndex(a => a.payload.method === "runtime/action-completed"));
			const restored = f.controller(caps);
			expect(JSON.parse((await restored.handle(f.call("act", input))).text).reason).toBe("RECORDED_RESULT");
			expect(f.journal.filter(a => a.payload.method === "runtime/action-completed")).toHaveLength(1);
			expect(JSON.parse((await restored.handle(f.call("act", { ...input, arguments: { ...input.arguments, content: "different" } }))).text).reason).toBe("OPERATION_ID_CONFLICT");
		} finally { await rm(dir, { recursive: true, force: true }); }
	});
	test("uncertain effects are not retried after controller restart", async () => {
		const f = fixture(); await f.init(); let attempts = 0;
		const cap: RequestActionCapability = { id: "write", effect: "workspace-change", authorize: async () => true, execute: async () => { attempts++; throw new Error("connection lost after write"); } };
		const c = f.controller([cap]); await f.executeStage(c);
		const input = { expectedRevision: (await f.inspect(c)).revision, operationId: "op", stage: "EXECUTE", capability: "write", arguments: {} };
		expect(JSON.parse((await c.handle(f.call("act", input))).text).reason).toBe("ACTION_UNCERTAIN_RECONCILE_REQUIRED");
		expect(JSON.parse((await f.controller([cap]).handle(f.call("act", input))).text).reason).toBe("ACTION_UNCERTAIN_RECONCILE_REQUIRED");
		expect(attempts).toBe(1);
		expect(JSON.parse((await f.controller([cap]).handle(f.call("act", { ...input, expectedRevision: (await f.inspect(c)).revision, operationId: "different-op" }))).text).reason).toBe("ACTION_UNCERTAIN_RECONCILE_REQUIRED");
		expect((await f.propose(c, "EXECUTE", "skipped")).success).toBe(false);
	});
});

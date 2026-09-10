#!/usr/bin/env bun
import { createLocalWorkflow } from "../src/adapters/outbound/development/local-workflow.js";
import { resolve } from "node:path";
import { FileSkillRegistry } from "../src/adapters/outbound/workspace/file-skill-registry.js";
import { FileSkillRunStore } from "../src/adapters/outbound/persistence/skill-run-store.js";
import { classifyRpaIntent, planRpaScenario, type RpaIntent } from "../src/core/agents/rpa-agent.js";
import { authorizeSkillStep, beginSkillStep, finishSkillStep, requestSkillAuthorization, skillRunMonitor, startSkillRun, type WooReceiptStatus } from "../src/core/workflows/skill-run.js";

const args = process.argv.slice(2), command = args[0];
const flag = (name: string) => { const index = args.indexOf(name); return index < 0 ? undefined : args[index + 1]; };
const required = (name: string) => { const value = flag(name); if (!value) throw new Error(`${name} 값이 필요합니다.`); return value; };
const root = resolve(flag("--root") ?? "."), registry = new FileSkillRegistry(root), store = new FileSkillRunStore(resolve(root, ".www"));

async function main(): Promise<unknown> {
	if (command === "check-local") return createLocalWorkflow(root).run(required("--process"));
 if (command === "resume-local") return createLocalWorkflow(root).resume(required("--run"));
 if (command === "show-local") return createLocalWorkflow(root).inspect(required("--run"));
 if (command === "registry") return registry.load();
	if (command === "classify") return { intent: classifyRpaIntent(required("--text")) };
	if (command === "plan" || command === "start") {
		const intent = required("--intent") as RpaIntent;
		const scenario = planRpaScenario({ intent, registry: await registry.load(), processId: flag("--process"), taskId: flag("--task"), unitIds: flag("--units")?.split(",").filter(Boolean) });
		if (command === "plan") return scenario;
		const state = startSkillRun(scenario); await store.write(state); return state;
	}
	const runId = required("--run"), current = await store.read(runId);
	if (command === "monitor") return skillRunMonitor(current);
	if (command === "receipts") return store.listReceipts(runId);
	if (command === "receipt") return store.readReceipt(runId, required("--receipt"));
	let next;
	if (command === "begin") next = beginSkillStep(current);
	else if (command === "request-auth") next = requestSkillAuthorization(current, { id: required("--candidate"), digest: required("--digest") }, [required("--evidence")]);
	else if (command === "authorize") next = authorizeSkillStep(current, required("--digest"), required("--actor"));
	else if (command === "finish") {
		const result = finishSkillStep(current, required("--status") as WooReceiptStatus, [required("--evidence")]);
		const receipt = await store.commitStep(result.state, result.receipt, current.revision); return { state: result.state, receipt, receiptDigest: result.receipt.receiptDigest };
	} else throw new Error("usage: skill-runtime registry|classify|plan|start|begin|request-auth|authorize|finish|monitor|receipts|receipt|check-local|resume-local|show-local");
	await store.write(next, current.revision); return next;
}

try {
 const result = await main();
 console.log(JSON.stringify(result, null, 2));
 if ((command === "check-local" || command === "resume-local") && (result as {state?: {stage?: string}})?.state?.stage !== "completed") process.exitCode = 2;
}
catch (error) { console.error(error instanceof Error ? error.message : String(error)); process.exit(2); }

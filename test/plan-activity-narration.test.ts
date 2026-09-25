import { expect, test }                 from "bun:test";
import { PlanActivityNarration }        from "../src/core/application/orchestration/plan-activity-narration";
import type { ActivityNarrationResult } from "../src/core/application/orchestration/activity-narrator";
import type { ProjectActivity }         from "../src/core/domain/execution/project-activity";

const context = { turnId: "turn-1", stepId: "verify", stepTitle: "회귀 테스트와 독립 검토", goal: "표시 동작 확인" };
function observation(sequence: number, itemId = `item-${sequence}`, phase: ProjectActivity["phase"] = "started", turnId = "turn-1"): ProjectActivity {
	return { schemaVersion: 1, id: `event-${sequence}`, projectId: "p", sequence, recordedAt: "", kind: "tool", phase, provider: "codex", sourceDigest: "", nativeRefs: { turnId, itemId }, payload: { params: { item: { command: `bun test test-${sequence}.ts`, output: "PRIVATE OUTPUT" } } } };
}
const result = { what: "회귀 테스트로 표시 동작을 확인합니다.", inputSummary: [] };
const flush = async () => { await Bun.sleep(0); };

test("serializes calls, coalesces item lifecycle, and keeps the latest five refined actions", async () => {
	const pending: ((result: ActivityNarrationResult) => void)[] = [];
	let calls = 0;
	const queue = new PlanActivityNarration({ narrate: async request => {
		calls += 1;
		expect(request.inputSummary.join()).not.toContain("PRIVATE OUTPUT");
		return await new Promise(resolve => pending.push(resolve));
	} }, new AbortController().signal, () => {});
	queue.select(context.turnId);
	for (let index = 1; index <= 7; index++) queue.observe(observation(index), context);
	queue.observe(observation(8, "item-1", "completed"), { ...context, stepId: "next" });
	expect(calls).toBe(1);
	pending.shift()!(result);
	await flush();
	expect(queue.snapshot("verify").planActivities[0]).toMatchObject({ status: "completed", stepId: "verify" });
	for (let index = 0; index < 6; index++) { pending.shift()!(result); await flush(); }
	expect(calls).toBe(7);
	expect(queue.snapshot("verify").planActivities.map(item => item.sequence)).toEqual([3, 4, 5, 6, 7]);
});

test("discards old-turn asynchronous results and rejects raw event text without fallback", async () => {
	const pending: ((result: ActivityNarrationResult) => void)[] = [];
	const queue = new PlanActivityNarration({ narrate: () => new Promise(resolve => pending.push(resolve)) }, new AbortController().signal, () => {});
	queue.select("turn-1");
	queue.observe(observation(1), context);
	queue.select("turn-2");
	queue.observe(observation(2, "item-2", "started", "turn-2"), { ...context, turnId: "turn-2" });
	pending.shift()!(result);
	await flush();
	expect(queue.snapshot().planActivities).toEqual([]);
	pending.shift()!({ ...result, what: "item/started" });
	await flush();
	expect(queue.snapshot()).toEqual({ planActivities: [], planActivityStatus: "unavailable" });
});

test("records nonzero exit as failure and never sends reasoning or tool results", async () => {
	const inputs: string[] = [];
	const queue = new PlanActivityNarration({ narrate: async request => { inputs.push(...request.inputSummary); return result; } }, new AbortController().signal, () => {});
	queue.select("turn-1");
	queue.observe({ ...observation(1), payload: { params: { item: { type: "reasoning", command: "PRIVATE" } } } }, context);
	queue.observe({ ...observation(2), payload: { params: { item: { command: "bun test", exitCode: 1 } } } }, context);
	await flush();
	expect(inputs).toEqual(["bun test"]);
	expect(queue.snapshot().planActivities[0]?.status).toBe("failed");
});

test("timeout releases an uncooperative model and processes the next action", async () => {
	let calls = 0;
	const queue = new PlanActivityNarration({ narrate: () => ++calls === 1 ? new Promise(() => {}) : Promise.resolve(result) }, new AbortController().signal, () => {}, 5);
	queue.select("turn-1");
	queue.observe(observation(1), context);
	queue.observe(observation(2), context);
	await Bun.sleep(15);
	expect(calls).toBe(2);
	expect(queue.snapshot().planActivities.map(entry => entry.sequence)).toEqual([2]);
});

test("turn switch immediately releases a model that ignores abort", async () => {
	let calls = 0;
	const queue = new PlanActivityNarration({ narrate: () => ++calls === 1 ? new Promise(() => {}) : Promise.resolve(result) }, new AbortController().signal, () => {});
	queue.select("turn-1");
	queue.observe(observation(1), context);
	queue.select("turn-2");
	queue.observe(observation(2, "item-2", "started", "turn-2"), { ...context, turnId: "turn-2" });
	await flush();
	expect(queue.snapshot().planActivities[0]?.turnId).toBe("turn-2");
});

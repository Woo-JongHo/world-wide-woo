import      { expect, test            } from "bun:test"                                                      ;
import      { PlanActivityNarration   } from "../src/core/application/orchestration/plan-activity-narration" ;
import type { ActivityNarrationResult } from "../src/core/application/orchestration/activity-narrator"       ;
import type { ProjectActivity         } from "../src/core/domain/execution/project-activity"                 ;

const context = { turnId: "turn-1", stepId: "verify", stepTitle: "회귀 테스트와 독립 검토", goal: "표시 동작 확인" };
function observation(sequence: number, itemId = `item-${sequence}`, phase: ProjectActivity["phase"] = "started", turnId = "turn-1"): ProjectActivity {
	return { schemaVersion: 1, id: `event-${sequence}`, projectId: "p", sequence, recordedAt: "", kind: "tool", phase, provider: "codex", sourceDigest: "", nativeRefs: { turnId, itemId }, payload: { params: { item: { command: `bun test test-${sequence}.ts`, output: "PRIVATE OUTPUT" } } } };
}
const result = { what: "회귀 테스트로 표시 동작을 확인합니다.", inputSummary: [] } ;
const flush  = async () => { await Bun.sleep(0); }                                 ;

test("preserves a sanitized bounded reason for selecting a test", async () => {
	const queue = new PlanActivityNarration({ narrate: async () => ({ ...result, why: `\u001b[31m${"입력 회귀 확인 ".repeat(30)}\u001b[0m` }) }, new AbortController().signal, () => {});
	queue.select(context.turnId);
	queue.observe(observation(1), context);
	await flush();
	const projected = queue.snapshot().planActivities[0];
	expect(projected                       )    .toHaveProperty("why"           ) ;
	expect(projected?.why                  )    .toStartWith   ("입력 회귀 확인") ;
	expect(projected?.why                  ).not.toContain     ("\u001b"        ) ;
	expect(Array.from(projected?.why ?? ""))    .toHaveLength  (120             ) ;
});

test("omits selection reason when the model did not supply one", async () => {
	const queue = new PlanActivityNarration({ narrate: async () => ({ ...result, why: "  \u001b[0m " }) }, new AbortController().signal, () => {});
	queue.select(context.turnId);
	queue.observe(observation(1), context);
	await flush();
	expect(queue.snapshot().planActivities[0]).not.toHaveProperty("why");
});

test("serializes calls, coalesces item lifecycle, and keeps one latest progress per Plan step", async () => {
	const pending: ((result: ActivityNarrationResult) => void)[] = [] ;
	let calls                                                    = 0  ;
	const queue = new PlanActivityNarration({ narrate: async request => {
		calls += 1;
		expect(request.inputSummary.join()).not.toContain("PRIVATE OUTPUT");
		return await new Promise(resolve => pending.push(resolve));
	} }, new AbortController().signal, () => {});
	queue.select(context.turnId);
	for (let index = 1; index <= 7; index++) queue.observe(observation(index), { ...context, stepId: `step-${index}` });
	queue.observe(observation(8, "item-1", "completed"), { ...context, stepId: "next" });
	expect(calls).toBe(1);
	pending.shift()!(result);
	await flush();
	expect(queue.snapshot("step-1").planActivities[0]).toMatchObject({ status: "completed", stepId: "step-1" });
	for (let index = 0; index < 6; index++) { pending.shift()!(result); await flush(); }
	expect(calls).toBe(7);
	expect(queue.snapshot().planActivities.map(item => item.sequence)).toEqual([3, 4, 5, 6, 7]);
});

test("many shell actions within one Plan item project one progress entry", async () => {
	let index   = 0                                                                                                                                                          ;
	const queue = new PlanActivityNarration({ narrate: async () => ({ what: `계획 단계 세부 진행 ${++index}`, inputSummary: [] }) }, new AbortController().signal, () => {}) ;
	queue.select(context.turnId);
	for (let sequence = 1; sequence <= 3; sequence++) queue.observe(observation(sequence), context);
	await Bun.sleep(0);
	expect(queue.snapshot().planActivities).toHaveLength(1);
	expect(queue.snapshot().planActivities[0]?.summary).toBe("계획 단계 세부 진행 3");
});

test("read commands retain immediate summaries while the model interprets their purpose", async () => {
	const kinds: string[] = []                                                                                                                                                                                                                      ;
	const queue           = new PlanActivityNarration({ narrate: async request => { kinds.push(request.kind ?? ""); return { what: `도구 행동 ${kinds.length}`, inputSummary: [] }; } }, new AbortController().signal, () => {}, 30_000, "actions") ;
	queue.select(context.turnId);
	queue.observe({ ...observation(1), payload: { params: { item: { command: "rg -n first src" } } } }, { ...context, kind: "tool-action" });
	queue.observe({ ...observation(2), payload: { params: { item: { command: "rg -n second src" } } } }, { ...context, kind: "tool-action" });
	await Bun.sleep(0);
	expect(kinds).toEqual(["tool-action", "tool-action"]);
	expect(queue.snapshot().planActivities).toHaveLength(2);
});

test("shell interpretation preserves its fallback on failure and updates lifecycle without duplicate calls", async () => {
	let calls   = 0                                                                                                                                                              ;
	const queue = new PlanActivityNarration({ narrate: async () => { calls += 1; throw new Error("unavailable"); } }, new AbortController().signal, () => {}, 30_000, "actions") ;
	queue.select(context.turnId);
	const source = { ...observation(1, "read"), payload: { params: { item: { command: "rg -n workFlow src", output: "PRIVATE OUTPUT" } } } };
	queue.observe(source, { ...context, kind: "tool-action" });
	expect(queue.snapshot().planActivities[0]?.summary).toContain("검색");
	expect(queue.snapshot().planActivities[0]).toMatchObject({ narrationSource: "command", narrationStatus: "pending" });
	await flush();
	queue.observe({ ...source, sequence: 2, phase: "completed" }, { ...context, kind: "tool-action" });
	expect(calls).toBe(1);
	expect(queue.snapshot().planActivities[0]).toMatchObject({ summary: "텍스트·파일 검색: -n workFlow src", status: "completed", narrationSource: "command", narrationStatus: "unavailable" });
	queue.observe(source, { ...context, kind: "tool-action" });
	expect(queue.snapshot().planActivities[0]?.status).toBe("completed");
	expect(queue.snapshot().planActivityStatus).toBe("unavailable");
});

test("shell fallback and model input redact local paths and never include private output", async () => {
	const requests: string[] = [];
	const queue = new PlanActivityNarration({ narrate: async request => {
		requests.push(...request.inputSummary);
		throw new Error("unavailable");
	} }, new AbortController().signal, () => {}, 30_000, "actions");
	queue.select(context.turnId);
	queue.observe({ ...observation(1), payload: { params: { item: { command: "cat /private/secret.txt", aggregatedOutput: "PRIVATE OUTPUT" } } } }, { ...context, kind: "tool-action" });
	await flush();
	expect(requests.join(" ")                         ).not.toContain("/private/"            ) ;
	expect(requests.join(" ")                         ).not.toContain("PRIVATE OUTPUT"       ) ;
	expect(queue.snapshot().planActivities[0]?.summary)    .toContain("[redacted:local-path]") ;
});

test("test command waits for its terminal observation and receives one evidence-bound narration", async () => {
	const requests: { kind?: string; inputSummary: readonly string[] }[] = [];
	const queue = new PlanActivityNarration({ narrate: async request => {
		requests.push(request);
		return { what: "입력 경로의 회귀 테스트를 확인합니다.", inputSummary: [] };
	} }, new AbortController().signal, () => {}, 30_000, "actions");
	queue.select(context.turnId);
	const started = observation(1, "test-run");
	queue.observe(started, { ...context, kind: "tool-action" });
	expect(requests).toHaveLength(0);
	queue.observe({ ...observation(2, "test-run", "completed"), payload: { params: { item: {
		type: "commandExecution", command: "bun test test/input.test.ts", exitCode: 0,
		aggregatedOutput: "(pass) 입력 경로를 유지한다 [1ms]\n1 pass\n0 fail",
	} } } }, { ...context, kind: "tool-action" });
	await flush();
	expect(requests                                   ).toHaveLength(1                                      ) ;
	expect(requests[0]?.kind                          ).toBe        ("test-action"                          ) ;
	expect(requests[0]?.inputSummary.join(" ")        ).toContain   ("입력 경로를 유지한다"                 ) ;
	expect(queue.snapshot().planActivities[0]?.summary).toBe        ("입력 경로의 회귀 테스트를 확인합니다.") ;
});

test("test narration uses observed suite names when command output is redirected", async () => {
	const inputs: string[] = [];
	const queue = new PlanActivityNarration({ narrate: async request => {
		inputs.push(...request.inputSummary);
		return { what: "입력 경로가 유지되는지 확인합니다.", inputSummary: [] };
	} }, new AbortController().signal, () => {}, 30_000, "actions");
	queue.select(context.turnId);
	queue.observe({ ...observation(1, "redirected", "completed"), payload: { params: { item: {
		type: "commandExecution", command: "bun test test/input.test.ts > /tmp/test.log 2>&1", exitCode: 0,
		aggregatedOutput: "",
	} } } }, { ...context, kind: "tool-action", testNames: ["input.test.ts"] });
	await flush();
	expect(inputs.join(" ")).toContain("관측된 테스트: input.test.ts");
	expect(queue.snapshot().planActivities[0]?.summary).toBe("입력 경로가 유지되는지 확인합니다.");
});

test("discards old-turn asynchronous results and rejects raw event text without fallback", async () => {
	const pending: ((result: ActivityNarrationResult) => void)[] = []                                                                                                                                  ;
	const queue                                                  = new PlanActivityNarration({ narrate: () => new Promise(resolve => pending.push(resolve)) }, new AbortController().signal, () => {}) ;
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
	const inputs: string[] = []                                                                                                                                                        ;
	const queue            = new PlanActivityNarration({ narrate: async request => { inputs.push(...request.inputSummary); return result; } }, new AbortController().signal, () => {}) ;
	queue.select("turn-1");
	queue.observe({ ...observation(1), payload: { params: { item: { type: "reasoning", command: "PRIVATE" } } } }, context);
	queue.observe({ ...observation(2), payload: { params: { item: { command: "bun test", exitCode: 1 } } } }, context);
	await flush();
	expect(inputs).toEqual(["bun test"]);
	expect(queue.snapshot().planActivities[0]?.status).toBe("failed");
});

test("timeout releases an uncooperative model and processes the next action", async () => {
	let calls   = 0                                                                                                                                                        ;
	const queue = new PlanActivityNarration({ narrate: () => ++calls === 1 ? new Promise(() => {}) : Promise.resolve(result) }, new AbortController().signal, () => {}, 5) ;
	queue.select("turn-1");
	queue.observe(observation(1), context);
	queue.observe(observation(2), context);
	await Bun.sleep(15);
	expect(calls).toBe(2);
	expect(queue.snapshot().planActivities.map(entry => entry.sequence)).toEqual([2]);
});

test("turn switch immediately releases a model that ignores abort", async () => {
	let calls   = 0                                                                                                                                                     ;
	const queue = new PlanActivityNarration({ narrate: () => ++calls === 1 ? new Promise(() => {}) : Promise.resolve(result) }, new AbortController().signal, () => {}) ;
	queue.select("turn-1");
	queue.observe(observation(1), context);
	queue.select("turn-2");
	queue.observe(observation(2, "item-2", "started", "turn-2"), { ...context, turnId: "turn-2" });
	await flush();
	expect(queue.snapshot().planActivities[0]?.turnId).toBe("turn-2");
});

test("normalizes model narration to one concise sentence without changing source activity provenance", async () => {
	const source = observation(1);
	const queue = new PlanActivityNarration({
		narrate: async () => ({ what: `첫 문장으로 작업을 설명합니다. ${"두 번째 설명은 화면 계약에 포함하지 않습니다 ".repeat(8)}`, inputSummary: [] }),
	}, new AbortController().signal, () => {});
	queue.select("turn-1");
	queue.observe(source, context);
	await flush();
	const projected = queue.snapshot().planActivities[0];
	expect(projected?.summary   ).toBe         ("첫 문장으로 작업을 설명합니다."                                     ) ;
	expect(projected?.id        ).toContain    (source.nativeRefs.itemId!                                            ) ;
	expect(source.payload.params).toMatchObject({ item: { command: "bun test test-1.ts", output: "PRIVATE OUTPUT" } }) ;
});

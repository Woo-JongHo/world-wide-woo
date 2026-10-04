import { describe, expect, test }                                      from "bun:test";
import { mkdtemp, readdir, readFile, rm }                              from "node:fs/promises";
import { tmpdir }                                                      from "node:os";
import { join }                                                        from "node:path";
import chalk                                                           from "chalk";
import type { ProjectActivity }                                        from "../src/core/domain/execution/project-activity";
import { REQUEST_STAGES, parseRequestCheckpointReport, parseRequestPhaseReport, parseRequestStageReport } from "../src/core/domain/execution/request-runtime";
import type { RequestStageReport }                                     from "../src/core/domain/execution/request-runtime";
import { requestProtocolContext }                                      from "../src/core/application/orchestration/request-protocol";
import { observeWorkEvidence, projectRequestRuntime }                  from "../src/core/runtime/request-runtime";
import { projectRequestTodo }                                          from "../src/core/domain/work/request-projections";
import { parseTodoMarkdown, renderTodoMarkdown, validateTodoDocument } from "../src/core/domain/work/todos";
import { FileRequestProjectionStore }                                  from "../src/adapters/outbound/persistence/request-projection-store";
import { requestRuntimeRows, stageInk }                                from "../src/adapters/inbound/tui/features/monitoring/view/request-runtime-view";
import { stripTerminalSequences, visibleWidth }                        from "@earendil-works/pi-tui";

function fixture(protocolVersion: 1 | 2 | 3 | 4 = 1) {
	const journal: ProjectActivity[] = [];
	const append = (payload: Record<string, unknown>, kind: ProjectActivity["kind"] = "progress", refs = { threadId: "thread-1", turnId: "turn-1" }) => {
		const sequence = journal.length + 1;
		const a: ProjectActivity = { schemaVersion: 1, id: `activity-${sequence}`, sequence, recordedAt: new Date(1700000000000 + sequence).toISOString(), projectId: "www", provider: "codex", sourceDigest: `sha256:${sequence}`, nativeRefs: refs, kind, phase: "completed", payload };
		journal.push(a); return a;
	};
	append({ method: "request/submitted", protocolVersion, requestId: "request-1", text: "기존 구조에 Runtime 구현" });
	append({ method: "request/started", requestId: "request-1", model: "native" });
	const report = (stage: RequestStageReport["stage"], status: RequestStageReport["status"] = "completed", extra: Partial<RequestStageReport> = {}) => append({ role: "assistant", text: "[www-runtime]" + JSON.stringify({ requestId: "request-1", stage, status, summary: `${stage} 공개 결과`, ...extra }) }, "message");
	const checkpoint = (name: "INTENT" | "WORK" | "RESULT", extra: Record<string, unknown> = {}) => append({ role: "assistant", text: "[www-runtime]" + JSON.stringify({ requestId: "request-1", checkpoint: name, summary: `${name} 공개 결과`, ...extra }) }, "message");
	const result = () => projectRequestRuntime(journal, "thread-1")[0]!;
	return { journal, append, report, checkpoint, result };
}

describe("seven-stage request runtime", () => {
	test("owned three-phase requests decide Plan before WORK and report before the final answer", () => {
		const f = fixture(4);
		const send = (checkpoint: "UNDERSTAND" | "RESULT", extra: Record<string, unknown> = {}) => f.append({ role: "assistant", text: `[www-runtime]${JSON.stringify({ requestId: "request-1", checkpoint, summary: `${checkpoint} 공개 결과`, ...extra })}` }, "message");
		expect(f.result().checkpoints?.map(item => item.status)).toEqual(["running", "pending", "pending"]);
		send("UNDERSTAND", { goal: "구조를 정리한다", planRequired: true, planReason: "세 단계의 수정이 필요하다" });
		expect(f.result().checkpoints?.map(item => item.status)).toEqual(["observed", "pending", "pending"]);
		f.append({ method: "turn/plan/updated", params: { plan: [{ step: "계약 확인", status: "inProgress" }, { step: "구현", status: "pending" }] } });
		expect(f.result().checkpoints?.map(item => item.status)).toEqual(["observed", "running", "pending"]);
		expect(f.result().planDecision?.planActivityId).toBe("activity-4");
		send("RESULT");
		expect(f.result().checkpoints?.map(item => item.status)).toEqual(["observed", "observed", "running"]);
		f.append({ role: "assistant", text: "구조를 정리했습니다." }, "message");
		expect(f.result().checkpoints?.map(item => item.status)).toEqual(["observed", "observed", "observed"]);
	});

	test("simple requests record a no-Plan decision and malformed decisions do not advance", () => {
		const f = fixture(4);
		f.append({ role: "assistant", text: '[www-runtime]{"requestId":"request-1","checkpoint":"UNDERSTAND","summary":"확인","goal":"답변","planRequired":false}' }, "message");
		expect(f.result().checkpoints?.[1]?.status).toBe("pending");
		f.append({ role: "assistant", text: '[www-runtime]{"requestId":"request-1","checkpoint":"UNDERSTAND","summary":"요청 확인","goal":"질문에 답한다","planRequired":false,"planReason":"한 번의 답변으로 충분하다"}' }, "message");
		expect(f.result().checkpoints?.[1]?.status).toBe("running");
		expect(f.result().planDecision?.required).toBe(false);
		expect(parseRequestPhaseReport('[www-runtime]{"requestId":"r","checkpoint":"RESULT","summary":"완료","planRequired":true}')).toBeNull();
	});
	test("historical passive v3 requests keep their original submitted and started meaning", () => {
		const historical = fixture(3).result();
		expect(historical.checkpoints?.map(item => item.status)).toEqual(["observed", "running", "pending"]);
		expect(historical.planDecision).toBeUndefined();
	});
	test("missing phase reports remain unobserved after Native completion", () => {
		const f = fixture(4);
		f.append({ role: "assistant", text: "Plan 판단 없이 답변했습니다." }, "message");
		f.append({ method: "turn/completed" });
		expect(f.result().checkpoints?.map(item => item.status)).toEqual(["unobserved", "unobserved", "unobserved"]);
		expect(f.result().issues.some(issue => issue.includes("REPORTING 시작 보고 없이"))).toBe(true);
	});
	test("user text and tool output cannot decide the Plan", () => {
		const f = fixture(4);
		const text = '[www-runtime]{"requestId":"request-1","checkpoint":"UNDERSTAND","summary":"거짓 결정","goal":"잘못된 목표","planRequired":false,"planReason":"도구 출력"}';
		f.append({ role: "user", text }, "message");
		f.append({ method: "item/completed", params: { item: { type: "commandExecution", aggregatedOutput: text } } }, "tool");
		expect(f.result().planDecision).toBeNull();
		expect(f.result().checkpoints?.[1]?.status).toBe("pending");
	});
	test("a required Plan from another turn cannot start WORK", () => {
		const f = fixture(4);
		f.append({ role: "assistant", text: '[www-runtime]{"requestId":"request-1","checkpoint":"UNDERSTAND","summary":"두 단계","goal":"두 파일 수정","planRequired":true,"planReason":"순서가 필요하다"}' }, "message");
		f.append({ method: "turn/plan/updated", params: { plan: [{ step: "다른 요청 계획", status: "pending" }] } }, "progress", { threadId: "thread-1", turnId: "other-turn" });
		expect(f.result().checkpoints?.[1]?.status).toBe("pending");
		expect(f.result().planDecision?.planActivityId).toBeNull();
	});
	test("failed delivery leaves UNDERSTAND failed without inventing a Plan decision", () => {
		const f = fixture(4);
		f.append({ method: "request/failed", requestId: "request-1" });
		expect(f.result().planDecision).toBeNull();
		expect(f.result().checkpoints?.map(item => item.status)).toEqual(["failed", "pending", "unobserved"]);
	});
	test("observe protocol exposes three checkpoints while broker keeps seven stages", () => {
		const observe = JSON.parse(requestProtocolContext("request-1", 1).value) as { checkpoints: string[]; instructions: string[] };
		const broker  = JSON.parse(requestProtocolContext("request-1", 2).value) as { checkpoints?: string[]; instructions: string[] };
		expect(observe.checkpoints).toEqual(["INTENT", "WORK", "RESULT"]);
		expect(observe.instructions.join(" ")).toContain("three public checkpoints");
		expect(broker.checkpoints).toBeUndefined();
		expect(broker.instructions.join(" ")).toContain("seven stages");
	});

	test("parses the compact observe report through its small public interface", () => {
		const parsed = parseRequestCheckpointReport('[www-runtime]{"requestId":"r","checkpoint":"WORK","summary":"근거를 확인했다","evidence":["tool-1"],"verification":["test-1"]}');
		expect(parsed).toEqual({ requestId: "r", checkpoint: "WORK", summary: "근거를 확인했다", evidence: ["tool-1"], verification: ["test-1"] });
		expect(parseRequestCheckpointReport('[www-runtime]{"requestId":"r","checkpoint":"UNKNOWN","summary":"잘못됨"}')).toBeNull();
		expect(parseRequestCheckpointReport('[www-runtime]{"requestId":"r","checkpoint":"INTENT","summary":"요청 이해","goal":"문제 해결","plan":["원인 조사","동작 검증"]}')?.plan).toEqual(["원인 조사", "동작 검증"]);
		expect(parseRequestCheckpointReport('[www-runtime]{"requestId":"r","checkpoint":"WORK","summary":"완료","plan":["늦은 계획"]}')).toBeNull();
	});

	test("shows an observe plan after UNDERSTAND and settles it with WORK", () => {
		const f = fixture();
		f.checkpoint("INTENT", { goal: "계획을 표시한다", plan: ["원인 조사", "회귀 검증"] });
		const planned = f.result();
		expect(planned.stages[0]?.status).toBe("completed");
		expect(planned.stages[1]?.status).toBe("completed");
		expect(planned.stages[2]?.status).toBe("running");
		expect(planned.stages[2]?.tasks.map(task => [task.title, task.status])).toEqual([["원인 조사", "pending"], ["회귀 검증", "pending"]]);
		expect(stripTerminalSequences(requestRuntimeRows(planned, 80).join("\n"))).toContain("원인 조사");
		f.checkpoint("WORK");
		expect(f.result().stages[2]?.tasks.every(task => task.status === "completed")).toBe(true);
	});

	test("projects three observe checkpoints onto the existing seven-stage record", () => {
		const f = fixture();
		f.checkpoint("INTENT", { goal: "가벼운 요청을 처리한다" });
		const read = f.append({ params: { item: { exitCode: 0, command: "rg request runtime" } } }, "tool");
		const check = f.append({ params: { item: { exitCode: 0, command: "bun test request-runtime" } } }, "tool");
		f.checkpoint("WORK", { evidence: [read.id], verification: [check.id] });
		f.checkpoint("RESULT");
		f.append({ role: "assistant", text: "경량 요청 결과" }, "message");
		f.append({ method: "turn/completed" });
		const result = f.result();
		expect(result.objective).toBe("가벼운 요청을 처리한다");
		expect(result.stages.map(stage => stage.status)).toEqual(["completed", "skipped", "completed", "skipped", "completed", "completed", "completed"]);
		expect(result.stages[4]?.evidence.map(item => item.activityId)).toEqual([read.id]);
		expect(result.stages[5]?.evidence.map(item => item.activityId)).toEqual([check.id]);
		expect(result.status).toBe("completed");
	});

	test("lists only resolvable successful evidence for the current observe turn", () => {
		const f = fixture();
		f.checkpoint("INTENT", { goal: "근거를 연결한다" });
		const good = f.append({ params: { item: { exitCode: 0, command: "bun test" } } }, "tool");
		f.append({ params: { item: { exitCode: 1, command: "failed" } } }, "tool");
		f.append({ params: { item: { exitCode: 0 } } }, "tool", { threadId: "thread-1", turnId: "another-turn" });
		f.append({ role: "assistant", text: "claim" }, "message");
		expect(observeWorkEvidence(f.journal, "request-1", "thread-1", "turn-1").map(item => item.activityId)).toEqual([good.id]);
		expect(observeWorkEvidence(f.journal, "another-request", "thread-1", "turn-1")).toEqual([]);
		f.checkpoint("WORK", { verification: [good.id] });
		expect(f.result().stages[5]?.status).toBe("completed");
	});

	test("rejects compact checkpoints from the brokered protocol", () => {
		const f = fixture(2);
		f.checkpoint("INTENT", { goal: "엄격 실행" });
		expect(f.result().stages[0]?.status).toBe("running");
		expect(f.result().issues.at(-1)).toContain("runtime.propose 도구");
	});

	test("rejects invalid compact WORK evidence without partially advancing stages", () => {
		const f = fixture();
		f.checkpoint("INTENT", { goal: "원자적으로 처리한다" });
		const message = f.append({ role: "assistant", text: "실행했다고 주장" }, "message");
		const check   = f.append({ params: { item: { exitCode: 0, command: "bun test" } } }, "tool");
		f.checkpoint("WORK", { evidence: [message.id], verification: [check.id] });
		expect(f.result().stages.slice(2, 6).map(stage => stage.status)).toEqual(["blocked", "pending", "pending", "pending"]);
		expect(f.result().issues.at(-1)).toContain("도구 또는 파일 변경");
		f.checkpoint("WORK", { evidence: [check.id] });
		expect(f.result().stages[2]?.status).toBe("completed");
	});

	test("requires distinct execution and verification evidence for compact WORK", () => {
		const f = fixture();
		f.checkpoint("INTENT", { goal: "독립 검증한다" });
		const tool = f.append({ params: { item: { exitCode: 0, command: "bun test" } } }, "tool");
		f.checkpoint("WORK", { evidence: [tool.id], verification: [tool.id] });
		expect(f.result().stages.slice(2, 6).map(stage => stage.status)).toEqual(["blocked", "pending", "pending", "pending"]);
		expect(f.result().issues.at(-1)).toContain("서로 다른 Activity");
	});

	test("observe WORK accepts Native execution without a separate verification run", () => {
		const f = fixture();
		f.checkpoint("INTENT", { goal: "요청을 처리한다" });
		const tool = f.append({ params: { item: { exitCode: 0, command: "inspect source" } } }, "tool");
		f.checkpoint("WORK", { evidence: [tool.id] });
		expect(f.result().stages[4]?.status).toBe("completed");
		expect(f.result().stages[5]?.status).toBe("skipped");
	});

	test("rejects duplicate checkpoints and RESULT before WORK", () => {
		const f = fixture();
		f.checkpoint("RESULT");
		expect(f.result().stages[6]?.status).toBe("pending");
		f.checkpoint("INTENT", { goal: "한 번만 전환한다" });
		f.checkpoint("INTENT", { goal: "중복" });
		expect(f.result().stages[0]?.output).toBe("INTENT 공개 결과");
		expect(f.result().issues).toHaveLength(2);
	});

	test("the generated DELIVER shape is accepted by the public Stage parser", () => {
		const requestId = "1f068212-edaf-4a02-8de9-fb2b48dc99d7";
		const protocol = JSON.parse(requestProtocolContext(requestId, 2).value) as { deliveryShape: Record<string, unknown> };
		const message = "[www-runtime]" + JSON.stringify({
			requestId,
			stage   : "DELIVER",
			status  : "completed",
			summary : "사용자에게 결과를 전달했다.",
			...protocol.deliveryShape,
		});
		expect(parseRequestStageReport(message)).toMatchObject({
			requestId,
			stage      : "DELIVER",
			status     : "completed",
			deliveries : [{ target: "linear | github | obsidian | files | another target", artifact: "actual identity", evidence: ["actual item ID"] }],
		});
	});
	test("keeps historical requests legacy and scopes protocol reports to the owning request", () => {
		const f = fixture();
		const legacy = f.journal.map(a => ({ ...a, payload: { ...a.payload, protocolVersion: undefined } }));
		expect(projectRequestRuntime(legacy, "thread-1")).toEqual([]);
		f.report("UNDERSTAND", "completed", { requestId: "foreign" });
		expect(f.result().stages[0]?.status).toBe("running");
		expect(f.result().issues).toHaveLength(1);
	});
	test("does not stall planning stages when descriptive evidence is not an Activity reference", () => {
		const f = fixture();
		f.report("UNDERSTAND", "completed", { evidence: ["git-status-dev"] });
		expect(f.result().stages[0]?.status                                         ).toBe   ("completed"    ) ;
		expect(f.result().stages[0]?.evidence                                       ).toEqual([]             ) ;
		expect(stripTerminalSequences(requestRuntimeRows(f.result(), 80).join("\n"))).toMatch(/STAGE\s+1\/7/u) ;
		f.report("DECOMPOSE", "completed", { evidence: ["plan-registered"] });
		expect(f.result().stages[1]?.status).toBe("completed");
	});
	test("approval blocks reports until the exact request is resolved", () => {
		const f = fixture();
		const approval = f.append({ approval: { requestId: "approval-1" } }, "approval");
		approval.phase = "started";
		expect(f.result().status).toBe("blocked");
		f.report("UNDERSTAND");
		expect(f.result().stages[0]?.status).toBe("blocked");
		f.append({ requestId: "another-approval" }, "approval");
		expect(f.result().status).toBe("blocked");
		f.append({ requestId: "approval-1" }, "approval");
		f.report("UNDERSTAND");
		expect(f.result().stages[0]?.status).toBe("completed");
	});
	test("VERIFY rejects failed, foreign and prose-only evidence", () => {
		const f = fixture();
		for (const stage of REQUEST_STAGES.slice(0, 5)) f.report(stage, "skipped");
		const failed  = f.append({ params: { item: { command: "test", exitCode: 1 } } }, "tool")                             ;
		const foreign = f.append({ params: { item: { exitCode: 0 } } }, "tool", { threadId: "elsewhere", turnId: "turn-1" }) ;
		const prose   = f.append({ role: "assistant", text: "검증 성공이라고 말하기만 함" }, "message")                      ;
		for (const ref of [failed.id, foreign.id, prose.id]) f.report("VERIFY", "completed", { evidence: [ref] });
		expect(f.result().stages[5]?.status).toBe("pending");
		expect(f.result().issues).toHaveLength(3);
	});
	test("creates seven Todo parents before Native has authored its plan", () => {
		const f = fixture(), todo = validateTodoDocument(projectRequestTodo(f.result(), "session-1", 0));
		expect(todo.items.map(t => t.content)             ).toEqual([...REQUEST_STAGES]) ;
		expect(todo.items[0]?.status                      ).toBe   ("in_progress"      ) ;
		expect(parseTodoMarkdown(renderTodoMarkdown(todo))).toEqual(todo               ) ;
	});
	test("preserves the current Goal when a queued follow-up skips UNDERSTAND", () => {
		const f = fixture();
		f.report("UNDERSTAND", "skipped", {
			summary : "기존 Goal을 보충하는 후속 요청이라 재해석하지 않는다.",
			goal    : "진입 대시보드를 완성한다",
		});
		expect(f.result().stages[0]?.status).toBe("skipped");
		expect(f.result().objective).toBe("진입 대시보드를 완성한다");
	});
	test("Native authors stage tasks; parallel work and stable dependency IDs survive projection", () => {
		const f = fixture();
		f.report("UNDERSTAND");
		const tasks = [{ id: "types", title: "타입 구현", status: "pending" as const, dependsOn: [] }, { id: "ui", title: "화면 구현", status: "pending" as const, dependsOn: [] }];
		f.report("DECOMPOSE", "completed", { plan: [{ stage: "EXECUTE", tasks }] });
		f.report("GROUND", "skipped", { summary: "사용자 제공 코드가 전체 근거" });
		f.report("DECIDE", "completed", { decision: { decision: "기존 Journal 재사용", rationale: "중복 저장 제거", selectedApproach: "projection", rejectedAlternatives: ["별도 DB"], executionPlan: ["타입", "UI"] } });
		f.report("EXECUTE", "running", { plan: [{ stage: "EXECUTE", tasks: tasks.map(t => ({ ...t, status: "running" })) }] });
		const todo = validateTodoDocument(projectRequestTodo(f.result(), "session-1", 1));
		expect(todo.items[4]?.details.map(t => t.status)).toEqual(["in_progress", "in_progress"]);
		expect(parseTodoMarkdown(renderTodoMarkdown(todo))).toEqual(todo);
		const action = f.append({ params: { item: { exitCode: 0, command: "apply_patch" } } }, "tool");
		f.report("EXECUTE", "completed", { evidence: [action.id] });
		expect(f.result().stages[4]?.status).toBe("running");
		f.report("EXECUTE", "completed", { evidence: [action.id], plan: [{ stage: "EXECUTE", tasks: tasks.map(t => ({ ...t, status: "completed" })) }] });
		f.report("VERIFY", "completed", { evidence: ["invented"] });
		expect(f.result().stages[5]?.status).toBe("pending");
		const check = f.append({ params: { item: { exitCode: 0, command: "bun test", aggregatedOutput: "2 pass" } } }, "tool");
		f.report("VERIFY", "completed", { evidence: [check.id] });
		f.report("DELIVER", "running");
		f.append({ role: "assistant", text: "구현과 테스트 완료" }, "message");
		f.append({ method: "turn/completed" });
		const result = f.result();
		expect(result.status                                                  ).toBe          ("completed"                                                                        ) ;
		expect(result.objective                                               ).toBe          ("UNDERSTAND 공개 결과"                                                             ) ;
		expect(result.stages[2]?.skipReason                                   ).toBe          ("사용자 제공 코드가 전체 근거"                                                     ) ;
		expect(result.stages[5]?.evidence                                     ).toContainEqual(expect.objectContaining({ activityId: check.id, sourceDigest: check.sourceDigest })) ;
		expect(result.deliveries[0]?.target                                   ).toBe          ("chat"                                                                             ) ;
		expect(projectRequestRuntime([...f.journal, ...f.journal], "thread-1")).toEqual       ([result]                                                                           ) ;
		for (const width of [30, 80, 140]) expect(requestRuntimeRows(result, width).every(row => visibleWidth(row) <= width)).toBe(true);
		const requestRows = stripTerminalSequences(requestRuntimeRows(result, 80).join("\n"));
		expect(requestRows).toContain("− GROUND"                             ) ;
		expect(requestRows).toContain("GROUND · 사용자 제공 코드가 전체 근거") ;
		expect(requestRows).toContain("✓ DELIVER"                            ) ;
	});
	test("renders Stage, planned work, and Progress as separate layers", () => {
		const f = fixture();
		f.report("UNDERSTAND");
		f.report("DECOMPOSE", "completed", { plan: [{ stage: "EXECUTE", tasks: [
			{ id : "layout" , title : "화면 계층 구현" , status : "pending" , dependsOn : []                 },
			{ id : "goal"   , title : "GOAL 상태 연결" , status : "pending" , dependsOn : []                 },
			{ id : "verify" , title : "통합 화면 검증" , status : "pending" , dependsOn : ["layout", "goal"] },
		] }] });
		const plain = stripTerminalSequences(requestRuntimeRows(f.result(), 80, false, 0, "장기 목표").join("\n"));
		const stage = plain.indexOf("STAGE"), plan = plain.indexOf("PLAN"), activity = plain.indexOf("PROGRESS");
		expect(plain                   ).not.toContain             ("Proposal"        ) ;
		expect(plain                   ).not.toMatch               (/^GOAL(?:\s|$)/mu ) ;
		expect(stage                   )    .toBeGreaterThanOrEqual(0                 ) ;
		expect(plan                    )    .toBeGreaterThan       (stage             ) ;
		expect(activity                )    .toBeGreaterThan       (plan              ) ;
		expect(plain                   ).not.toContain             ("NEXT"            ) ;
		expect(plain.slice(stage, plan))    .toContain             ("판단의 실제 근거") ;
		for (const stageName of REQUEST_STAGES) expect(plain.slice(stage, plan)).toContain(stageName);
		expect(plain.slice(plan, activity))    .toContain("화면 계층 구현"                                ) ;
		expect(plain.slice(plan, activity))    .toContain("GOAL 상태 연결"                                ) ;
		expect(plain.slice(plan, activity))    .toContain("병렬 가능"                                     ) ;
		expect(plain.slice(plan, activity))    .toContain("layout, goal 이후"                             ) ;
		expect(plain.slice(activity)      )    .toContain("정리된 세부 작업이 도착하면 이곳에 표시합니다.") ;
		expect(plain                      ).not.toContain("Tool · 관련 렌더 코드를 읽는 중"               ) ;
		expect(plain                      ).not.toContain("관측된 동작"                                   ) ;
		expect(plain                      ).not.toContain("request-1"                                     ) ;
	});
	test("Progress does not repeat Native stage tasks while waiting for interpreted content", () => {
		const f = fixture();
		const base = f.result();
		const request = {
			...base,
			stages: base.stages.map(stage => stage.id === "UNDERSTAND" ? {
				...stage,
				goal: "요청 범위 확인",
				tasks: [{ id: "scope", title: "계획의 범위를 확정", status: "running" as const, dependsOn: [] }],
			} : stage),
		};
		const plain = stripTerminalSequences(requestRuntimeRows(request, 80, false, 0).join("\n"));
		const progress = plain.slice(plain.indexOf("PROGRESS"), plain.indexOf("NEXT"));
		expect(progress)    .toContain("정리된 세부 작업이 도착하면 이곳에 표시합니다.") ;
		expect(progress).not.toContain("요청 범위 확인"                                ) ;
		expect(progress).not.toContain("계획의 범위를 확정"                            ) ;
		expect(progress).not.toContain("Bash"                                          ) ;
	});
	test("settled stage rail distinguishes skipped stages from completed stages", () => {
		const level = chalk.level;
		chalk.level = 3;
		try { expect(stageInk("skipped")("GROUND")).not.toBe(stageInk("pending")("GROUND")); }
		finally { chalk.level = level; }
		const base    = fixture().result()                                                                                           ;
		const stages  = base.stages.map((stage, index) => ({ ...stage, status: index ? "skipped" as const : "completed" as const })) ;
		const waiting = stripTerminalSequences(requestRuntimeRows({ ...base, stages }, 100).join("\n"))                              ;
		expect(waiting).not.toContain("기존 구조에 Runtime 구현") ;
		expect(waiting).not.toContain("╭ 완료"                  ) ;
		expect(waiting)    .toContain("✓ UNDERSTAND"            ) ;
		expect(waiting)    .toContain("− DECOMPOSE"             ) ;
		expect(waiting).not.toContain("다음 계획 단계의 시작"   ) ;
		const complete = stripTerminalSequences(requestRuntimeRows({ ...base, stages, status: "completed" }, 100).join("\n"));
		expect(complete).toContain("− DELIVER");
		expect(complete).not.toContain("모든 단계가 완료");
	});
	test("stage rail preserves concurrent running and failed stages at compact widths", () => {
		const base     = fixture().result()                                                                                                                                                                     ;
		const request  = { ...base, stages: base.stages.map(stage => ({ ...stage, status: stage.id === "EXECUTE" ? "failed" as const : stage.id === "DELIVER" ? "running" as const : "completed" as const })) } ;
		const plain    = stripTerminalSequences(requestRuntimeRows(request, 100).join("\n"))                                                                                                                    ;
		const progress = plain.slice(0, plain.indexOf("PROGRESS"))                                                                                                                                              ;
		expect(progress)    .toContain("× EXECUTE"              ) ;
		expect(progress)    .toContain("● DELIVER"              ) ;
		expect(progress).not.toContain("╭ 진행 중"              ) ;
		expect(progress)    .toContain("대상별 결과와 근거 전달") ;
		const narrow = requestRuntimeRows(request, 16, true);
		expect(narrow.every(row => visibleWidth(row) <= 16)).toBe(true);
		const plan = stripTerminalSequences(narrow.join("\n")).split("Progress")[0]!;
		expect(plan)    .toContain("× EXECUTE"    ) ;
		expect(plan)    .toContain("● DELIVER"    ) ;
		expect(plan).not.toContain("진행 중"      ) ;
		expect(plan)    .toContain("대상별 결과와") ;
	});
	test("does not expose queued input as a fourth Plan layer", () => {
		const base   = fixture().result()                                                                                                                          ;
		const stages = base.stages.map(stage => ({ ...stage, tasks: [{ id: stage.id, title: "완료한 세부 계획", status: "completed" as const, dependsOn: [] }] })) ;
		const plain  = stripTerminalSequences(requestRuntimeRows({ ...base, stages }, 80).join("\n"))                                                              ;
		expect(plain).not.toContain("NEXT"                      ) ;
		expect(plain).not.toContain("다음 입력 제안이 없습니다.") ;
		expect(plain)    .toContain("완료한 세부 계획"          ) ;
	});
	test("rejects out-of-order, cyclic and future-running plans without partial updates", () => {
		const f = fixture();
		f.report("VERIFY", "completed");
		expect(f.result().stages[5]?.status).toBe("pending");
		f.report("UNDERSTAND");
		f.report("DECOMPOSE", "completed", { plan: [{ stage: "EXECUTE", tasks: [{ id: "a", title: "순환", status: "pending", dependsOn: ["a"] }] }] });
		expect(f.result().stages[1]?.status).toBe("pending");
		f.report("DECOMPOSE", "completed", { plan: [{ stage: "EXECUTE", tasks: [{ id: "a", title: "조기 실행", status: "running", dependsOn: [] }] }] });
		expect(f.result().stages[4]?.tasks).toEqual([]);
		expect(f.result().issues).toHaveLength(3);
	});
	test("Native completion never invents stage completion; private reasoning cannot become a report", () => {
		const f = fixture();
		f.append({ role: "assistant", classification: "reasoning", text: '[www-runtime]{"requestId":"request-1","stage":"UNDERSTAND","status":"completed","summary":"private"}' }, "message");
		f.append({ method: "turn/completed" });
		expect(f.result().status                                   )    .toBe     ("blocked") ;
		expect(f.result().stages.every(s => s.status === "blocked"))    .toBe     (true     ) ;
		expect(JSON.stringify(f.result())                          ).not.toContain("private") ;
		expect(parseRequestStageReport('[www-runtime]{"requestId":"r","stage":"UNDERSTAND","status":"skipped","summary":""}')).toBeNull();
		expect(parseRequestStageReport('[www-runtime]{"requestId":"r","stage":"UNDERSTAND","status":"pass","summary":"이 단계는 필요하지 않음"}')).toMatchObject({ status: "skipped", summary: "이 단계는 필요하지 않음" });
	});
	test("keeps an interrupted Native turn distinct from a failed request", () => {
		const f = fixture();
		f.report("UNDERSTAND", "running");
		const interrupted = f.append({ method: "turn/interrupted" });
		interrupted.phase = "cancelled";
		const result = f.result();
		expect(result.status                                                    ).toBe     ("blocked"                      ) ;
		expect(result.stages.every(stage => stage.status === "blocked")         ).toBe     (true                           ) ;
		expect(result.stages[0]?.output                                         ).toBe     ("Native 실행이 중단되었습니다.") ;
		expect(result.events.at(-1)?.type                                       ).toBe     ("request.blocked"              ) ;
		expect(stripTerminalSequences(requestRuntimeRows(result, 80).join("\n"))).toContain("7/7"                          ) ;
		expect(stripTerminalSequences(requestRuntimeRows(result, 80).join("\n"))).toContain("중단"                         ) ;
	});
	test("accepts structured VERIFY intent only on VERIFY tasks", () => {
		const valid = parseRequestStageReport('[www-runtime]{"requestId":"r","stage":"DECOMPOSE","status":"completed","summary":"검증 계획","plan":[{"stage":"VERIFY","tasks":[{"id":"blackbox","title":"사용자 요청부터 결과까지 실행한다","status":"pending","dependsOn":[],"verification":{"kind":"black-box","purpose":"실제 경계에서 요청이 완료되는지 확인"}}]}]}');
		expect(valid?.plan?.[0]?.tasks[0]?.verification).toEqual({ kind: "black-box", purpose: "실제 경계에서 요청이 완료되는지 확인" });
		expect(parseRequestStageReport('[www-runtime]{"requestId":"r","stage":"DECOMPOSE","status":"completed","summary":"잘못된 계획","plan":[{"stage":"EXECUTE","tasks":[{"id":"wrong","title":"실행 작업","status":"pending","dependsOn":[],"verification":{"kind":"black-box","purpose":"VERIFY 외부에는 둘 수 없음"}}]}]}')).toBeNull();
		expect(parseRequestStageReport('[www-runtime]{"requestId":"r","stage":"DECOMPOSE","status":"completed","summary":"잘못된 종류","plan":[{"stage":"VERIFY","tasks":[{"id":"wrong-kind","title":"검사","status":"pending","dependsOn":[],"verification":{"kind":"mystery","purpose":"알 수 없는 종류"}}]}]}')).toBeNull();
	});
	test("accepts current-stage tasks as a plan shorthand", () => {
		const parsed = parseRequestStageReport('[www-runtime]{"requestId":"r","stage":"DECOMPOSE","status":"completed","summary":"작업을 분해했다","tasks":[{"id":"runtime","title":"Runtime 상태를 고친다","status":"completed","dependsOn":[]}]}');
		expect(parsed?.plan).toEqual([{ stage: "DECOMPOSE", tasks: [{ id: "runtime", title: "Runtime 상태를 고친다", status: "completed", dependsOn: [] }] }]);
	});
	test("persists canonical record and distinct destination drafts atomically", async () => {
		const directory = await mkdtemp(join(tmpdir(), "www-request-"));
		try {
			const f = fixture(), store = new FileRequestProjectionStore(directory);
			await store.capture(f.result()); f.report("UNDERSTAND"); await store.capture(f.result());
			const files = await readdir(directory);
			expect(files).toHaveLength(1);
			const saved = JSON.parse(await readFile(join(directory, files[0]!), "utf8"));
			expect(saved.record).toEqual(f.result());
			expect(saved.projections.linear).not.toBe(saved.projections.obsidian);
		} finally { await rm(directory, { recursive: true, force: true }); }
	});
});

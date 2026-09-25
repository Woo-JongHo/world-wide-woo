import { describe, expect, test }                                      from "bun:test";
import { mkdtemp, readdir, readFile, rm }                              from "node:fs/promises";
import { tmpdir }                                                      from "node:os";
import { join }                                                        from "node:path";
import type { ProjectActivity }                                        from "../src/core/domain/execution/project-activity";
import { REQUEST_STAGES, parseRequestStageReport }                     from "../src/core/domain/execution/request-runtime";
import type { RequestStageReport }                                     from "../src/core/domain/execution/request-runtime";
import { projectRequestRuntime }                                       from "../src/core/runtime/request-runtime";
import { projectRequestTodo }                                          from "../src/core/domain/work/request-projections";
import { parseTodoMarkdown, renderTodoMarkdown, validateTodoDocument } from "../src/core/domain/work/todos";
import { FileRequestProjectionStore }                                  from "../src/adapters/outbound/persistence/request-projection-store";
import { requestRuntimeRows }                                          from "../src/adapters/inbound/tui/features/monitoring/request-runtime-view";
import { stripTerminalSequences, visibleWidth }                        from "@earendil-works/pi-tui";

function fixture() {
	const journal: ProjectActivity[] = [];
	const append = (payload: Record<string, unknown>, kind: ProjectActivity["kind"] = "progress", refs = { threadId: "thread-1", turnId: "turn-1" }) => {
		const sequence = journal.length + 1;
		const a: ProjectActivity = { schemaVersion: 1, id: `activity-${sequence}`, sequence, recordedAt: new Date(1700000000000 + sequence).toISOString(), projectId: "www", provider: "codex", sourceDigest: `sha256:${sequence}`, nativeRefs: refs, kind, phase: "completed", payload };
		journal.push(a); return a;
	};
	append({ method: "request/submitted", protocolVersion: 1, requestId: "request-1", text: "기존 구조에 Runtime 구현" });
	append({ method: "request/started", requestId: "request-1", model: "native" });
	const report = (stage: RequestStageReport["stage"], status: RequestStageReport["status"] = "completed", extra: Partial<RequestStageReport> = {}) => append({ role: "assistant", text: "[www-runtime]" + JSON.stringify({ requestId: "request-1", stage, status, summary: `${stage} 공개 결과`, ...extra }) }, "message");
	const result = () => projectRequestRuntime(journal, "thread-1")[0]!;
	return { journal, append, report, result };
}

describe("seven-stage request runtime", () => {
	test("keeps historical requests legacy and scopes protocol reports to the owning request", () => {
		const f = fixture();
		const legacy = f.journal.map(a => ({ ...a, payload: { ...a.payload, protocolVersion: undefined } }));
		expect(projectRequestRuntime(legacy, "thread-1")).toEqual([]);
		f.report("UNDERSTAND", "completed", { requestId: "foreign" });
		expect(f.result().stages[0]?.status).toBe("running");
		expect(f.result().issues).toHaveLength(1);
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
		expect(todo.items.map(t => t.content)).toEqual([...REQUEST_STAGES]);
		expect(todo.items[0]?.status).toBe("in_progress");
		expect(parseTodoMarkdown(renderTodoMarkdown(todo))).toEqual(todo);
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
		expect(result.status).toBe("completed");
		expect(result.stages[2]?.skipReason).toBe("사용자 제공 코드가 전체 근거");
		expect(result.stages[5]?.evidence).toContainEqual(expect.objectContaining({ activityId: check.id, sourceDigest: check.sourceDigest }));
		expect(result.deliveries[0]?.target).toBe("chat");
		expect(projectRequestRuntime([...f.journal, ...f.journal], "thread-1")).toEqual([result]);
		for (const width of [30, 80, 140]) expect(requestRuntimeRows(result, width).every(row => visibleWidth(row) <= width)).toBe(true);
		const requestRows = stripTerminalSequences(requestRuntimeRows(result, 80).join("\n"));
		expect(requestRows).toContain("− GROUND");
		expect(requestRows).toContain("GROUND · 사용자 제공 코드가 전체 근거");
		expect(requestRows).toContain("✓ DELIVER");
	});
	test("renders Request stages, Activity, and Next input as separate layers", () => {
		const f = fixture();
		f.report("UNDERSTAND");
		f.report("DECOMPOSE", "completed", { plan: [{ stage: "EXECUTE", tasks: [{ id: "edit", title: "화면 계층 구현", status: "pending", dependsOn: [] }] }] });
		const plain = stripTerminalSequences(requestRuntimeRows(f.result(), 80, false, 0, ["다음 입력 후보"]).join("\n"));
		const request = plain.indexOf("Plan"), activity = plain.indexOf("Activity"), proposal = plain.indexOf("Next");
		expect(plain).not.toContain("Proposal");
		expect(request).toBeGreaterThanOrEqual(0);
		expect(activity).toBeGreaterThan(request);
		expect(proposal).toBeGreaterThan(activity);
		expect(plain.slice(request, activity)).not.toContain("Goal");
		expect(plain.slice(request, activity)).not.toContain("기존 구조에 Runtime 구현");
		expect(plain.slice(request, activity)).toContain("판단의 실제 근거");
		for (const stage of REQUEST_STAGES) expect(plain.slice(request, activity)).toContain(stage);
		expect(plain.slice(proposal)).toContain("다음 입력 후보");
		expect(plain.slice(proposal)).not.toContain("화면 계층 구현");
		expect(plain.slice(activity, proposal)).toContain("정리된 세부 작업이 도착하면 이곳에 표시합니다.");
		expect(plain).not.toContain("Tool · 관련 렌더 코드를 읽는 중");
		expect(plain).not.toContain("관측된 동작");
		expect(plain).not.toContain("request-1");
	});
	test("Activity does not repeat Native stage tasks while waiting for interpreted content", () => {
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
		const progress = plain.slice(plain.indexOf("Activity"), plain.indexOf("Next"));
		expect(progress).toContain("정리된 세부 작업이 도착하면 이곳에 표시합니다.");
		expect(progress).not.toContain("요청 범위 확인");
		expect(progress).not.toContain("계획의 범위를 확정");
		expect(progress).not.toContain("Bash");
	});
	test("settled stage rail distinguishes skipped stages from completed stages", () => {
		const base    = fixture().result()                                                                                           ;
		const stages  = base.stages.map((stage, index) => ({ ...stage, status: index ? "skipped" as const : "completed" as const })) ;
		const waiting = stripTerminalSequences(requestRuntimeRows({ ...base, stages }, 100).join("\n"))                              ;
		expect(waiting).not.toContain("기존 구조에 Runtime 구현");
		expect(waiting).not.toContain("╭ 완료");
		expect(waiting).toContain("✓ UNDERSTAND");
		expect(waiting).toContain("− DECOMPOSE");
		expect(waiting).not.toContain("다음 계획 단계의 시작");
		const complete = stripTerminalSequences(requestRuntimeRows({ ...base, stages, status: "completed" }, 100).join("\n"));
		expect(complete).toContain("− DELIVER");
		expect(complete).not.toContain("모든 단계가 완료");
	});
	test("stage rail preserves concurrent running and failed stages at compact widths", () => {
		const base     = fixture().result()                                                                                                                                                                     ;
		const request  = { ...base, stages: base.stages.map(stage => ({ ...stage, status: stage.id === "EXECUTE" ? "failed" as const : stage.id === "DELIVER" ? "running" as const : "completed" as const })) } ;
		const plain    = stripTerminalSequences(requestRuntimeRows(request, 100).join("\n"))                                                                                                                    ;
		const progress = plain.slice(0, plain.indexOf("Activity"))                                                                                                                                              ;
		expect(progress).toContain("! EXECUTE");
		expect(progress).toContain("› DELIVER");
		expect(progress).not.toContain("╭ 진행 중");
		expect(progress).toContain("대상별 결과와 근거 전달");
		const narrow = requestRuntimeRows(request, 16, true);
		expect(narrow.every(row => visibleWidth(row) <= 16)).toBe(true);
		const plan = stripTerminalSequences(narrow.join("\n")).split("Activity")[0]!;
		expect(plan).toContain("! EXECUTE");
		expect(plan).toContain("› DELIVER");
		expect(plan).not.toContain("진행 중");
		expect(plan).toContain("대상별 결과와");
	});
	test("Next looks toward the next input instead of remaining Plan tasks", () => {
		const base     = fixture().result()                                                                                                                          ;
		const stages   = base.stages.map(stage => ({ ...stage, tasks: [{ id: stage.id, title: "완료한 세부 계획", status: "completed" as const, dependsOn: [] }] })) ;
		const plain    = stripTerminalSequences(requestRuntimeRows({ ...base, stages }, 80).join("\n"))                                                              ;
		const proposal = plain.slice(plain.indexOf("Next"))                                                                                                          ;
		expect(proposal).toContain("없음");
		expect(proposal).not.toContain("완료한 세부 계획");
		expect(proposal).toContain("다음 입력 제안이 없습니다.");
		const suggested = stripTerminalSequences(requestRuntimeRows(base, 80, false, 0, ["오류 로그를 함께 확인해줘"]).join("\n"));
		expect(suggested.slice(suggested.indexOf("Next"))).toContain("오류 로그를 함께 확인해줘");
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
		expect(f.result().status).toBe("blocked");
		expect(f.result().stages.every(s => s.status === "blocked")).toBe(true);
		expect(JSON.stringify(f.result())).not.toContain("private");
		expect(parseRequestStageReport('[www-runtime]{"requestId":"r","stage":"UNDERSTAND","status":"skipped","summary":""}')).toBeNull();
		expect(parseRequestStageReport('[www-runtime]{"requestId":"r","stage":"UNDERSTAND","status":"pass","summary":"이 단계는 필요하지 않음"}')).toMatchObject({ status: "skipped", summary: "이 단계는 필요하지 않음" });
	});
	test("keeps an interrupted Native turn distinct from a failed request", () => {
		const f = fixture();
		f.report("UNDERSTAND", "running");
		const interrupted = f.append({ method: "turn/interrupted" });
		interrupted.phase = "cancelled";
		const result = f.result();
		expect(result.status).toBe("blocked");
		expect(result.stages.every(stage => stage.status === "blocked")).toBe(true);
		expect(result.stages[0]?.output).toBe("Native 실행이 중단되었습니다.");
		expect(result.events.at(-1)?.type).toBe("request.blocked");
	});
	test("accepts structured VERIFY intent only on VERIFY tasks", () => {
		const valid = parseRequestStageReport('[www-runtime]{"requestId":"r","stage":"DECOMPOSE","status":"completed","summary":"검증 계획","plan":[{"stage":"VERIFY","tasks":[{"id":"blackbox","title":"사용자 요청부터 결과까지 실행한다","status":"pending","dependsOn":[],"verification":{"kind":"black-box","purpose":"실제 경계에서 요청이 완료되는지 확인"}}]}]}');
		expect(valid?.plan?.[0]?.tasks[0]?.verification).toEqual({ kind: "black-box", purpose: "실제 경계에서 요청이 완료되는지 확인" });
		expect(parseRequestStageReport('[www-runtime]{"requestId":"r","stage":"DECOMPOSE","status":"completed","summary":"잘못된 계획","plan":[{"stage":"EXECUTE","tasks":[{"id":"wrong","title":"실행 작업","status":"pending","dependsOn":[],"verification":{"kind":"black-box","purpose":"VERIFY 외부에는 둘 수 없음"}}]}]}')).toBeNull();
		expect(parseRequestStageReport('[www-runtime]{"requestId":"r","stage":"DECOMPOSE","status":"completed","summary":"잘못된 종류","plan":[{"stage":"VERIFY","tasks":[{"id":"wrong-kind","title":"검사","status":"pending","dependsOn":[],"verification":{"kind":"mystery","purpose":"알 수 없는 종류"}}]}]}')).toBeNull();
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

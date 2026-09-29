import      {
              expect                    ,
              test                      ,
                                          } from "bun:test"                                                              ;
import      { stripTerminalSequences      } from "@earendil-works/pi-tui"                                                ;
import      { projectRequestTestWorkspace } from "../src/core/domain/observability/request-test-workspace"               ;
import type { ProjectActivity             } from "../src/core/domain/execution/project-activity"                         ;
import      { WwwMonitorView              } from "../src/adapters/inbound/tui/features/monitoring/view/www-monitor-view" ;
import      {
              WwwTestView               ,
              projectWwwTestView        ,
                                          } from "../src/adapters/inbound/tui/features/test/view/www-test-view"          ;
import      { wwwFixture                  } from "./fixtures/www-snapshot"                                               ;

const output = `bun test v1.4.0

auth.service.test.ts:
(pass) accepts active token [2.8ms]

workflow.test.ts:
(pass) starts workflow [1.1ms]
(fail) expired token should return 401 [3.2ms]
Expected: 401
Received: 200

 2 pass
 1 fail
Ran 3 tests across 2 files. [41.8ms]`;
const activity = (id: string, sequence: number, command: string, phase: ProjectActivity["phase"], exitCode: number | null, aggregatedOutput: string, time: string): ProjectActivity => ({
	schemaVersion: 1, id, projectId: "p", sequence, recordedAt: time, kind: "tool", phase, provider: "openai-codex",
	nativeRefs: { threadId: "t", turnId: "turn", itemId: id }, sourceDigest: `sha256:${"a".repeat(64)}`,
	payload: { method: `item/${phase}`, params: { item: { type: "commandExecution", command, ...(exitCode === null ? {} : { exitCode }), aggregatedOutput } } },
});
const observed = activity("run-1", 1, "bun test", "completed", 1, output, "2026-09-12T00:00:01Z");
const change: ProjectActivity = { ...observed, id: "change", sequence: 0, kind: "file-change", phase: "completed", nativeRefs: { ...observed.nativeRefs, itemId: "change" }, payload: { method: "item/completed", params: { item: { type: "fileChange" } } } };

test("preserves observed Bun command, suite, test and raw error without semantic labels", () => {
	const run = projectRequestTestWorkspace({ activities: [observed] }).runs[0]!;
	expect(run                                ).toMatchObject({ command: "bun test", exitCode: 1, pass: 2, fail: 1, skip: 0, durationMs: 41.8 }    ) ;
	expect(run.suites.map(suite => suite.name)).toEqual      (["auth.service.test.ts", "workflow.test.ts"]                                         ) ;
	expect(run.suites[1]!.failures[0]         ).toEqual      ({ name: "expired token should return 401", rawError: "Expected: 401\nReceived: 200" }) ;
	const snapshot = wwwFixture("ready"); snapshot.activities = [change, observed];
	const rendered = stripTerminalSequences(new WwwTestView(() => projectWwwTestView(snapshot)).render(44).join("\n"));
	expect(rendered)    .toContain("workflow.test.ts"               ) ;
	expect(rendered)    .toContain("expired token should return 401") ;
	expect(rendered)    .toContain("Expected: 401"                  ) ;
	expect(rendered).not.toContain("블랙박스"                       ) ;
});

test("TEST 화면은 한 번 해석된 검증 목적을 관측 결과와 함께 보여준다", () => {
	const snapshot = wwwFixture("ready");
	snapshot.activities = [change, observed];
	const narration = { id: "turn:run-1", turnId: "turn", stepId: "chat-tool-action", stepTitle: "검증", summary: "만료된 토큰이 거부되는지 확인합니다.", status: "failed" as const, sequence: 1 };
	const rendered = stripTerminalSequences(new WwwTestView(() => projectWwwTestView(snapshot), () => "ko", () => [narration]).render(44).join("\n"));
	expect(rendered).toContain("이 테스트가 확인하는 것");
	expect(rendered).toContain("만료된 토큰이 거부되는지 확인합니다.");
	expect(rendered).toContain("실패 1");
});

test("keeps unsupported counts unobserved and carries failed attempt into rerun", () => {
	const second    = activity("run-2", 2, "bun test", "completed", 0, "", "2026-09-12T00:00:03Z") ;
	const workspace = projectRequestTestWorkspace({ activities: [observed, second] })              ;
	expect(workspace.runs).toHaveLength(2);
	expect(workspace.runs[1]).toMatchObject({ status: "passed", pass: null, fail: null, skip: null });
	const rendered = stripTerminalSequences(new WwwTestView(() => workspace).render(44).join("\n"));
	expect(rendered).toContain("#1"                      ) ;
	expect(rendered).toContain("#2"                      ) ;
	expect(rendered).toContain("통과 — │ 실패 — │ 건너뜀 —") ;
	const english = stripTerminalSequences(new WwwTestView(() => workspace, () => "en").render(44).join("\n"));
	expect(english).toContain("PASS — │ FAIL — │ SKIP —");
});

test("derives elapsed time only from start and terminal observations", () => {
	const start = activity("run", 1, "bun test", "started", null, "", "2026-09-12T00:00:01Z") ;
	const end   = activity("run", 2, "bun test", "completed", 0, "", "2026-09-12T00:00:04Z")  ;
	const run   = projectRequestTestWorkspace({ activities: [start, end] }).runs[0]!          ;
	expect(run.durationMs).toBe(3000);
	expect(run.status).toBe("passed");
});

test("keeps separate verification commands and trusts only an observed runner footer after truncation", () => {
	const lint                       = activity("lint", 1, "npm run lint", "completed", 0, "", "2026-09-12T00:00:01Z")            ;
	const truncated: ProjectActivity = { ...observed, sequence: 2, payload: { ...observed.payload, observationTruncated: true } } ;
	const runs                       = projectRequestTestWorkspace({ activities: [lint, truncated] }).runs                        ;
	expect(runs.map(run => run.command)         ).toEqual      (["npm run lint", "bun test"]                                 ) ;
	expect(runs[0]                              ).toMatchObject({ status: "passed", pass: null, fail: null }                 ) ;
	expect(runs[1]                              ).toMatchObject({ outputTruncated: true, pass: 2, fail: 1, skip: 0, totalsSource: "command-output" }) ;
	expect(runs[1]!.suites[1]!.failures[0]!.name).toBe         ("expired token should return 401"                            ) ;
});

test("keeps partial truncated case rows unobserved without the runner footer", () => {
	const partial: ProjectActivity = { ...observed, payload: { ...observed.payload, observationTruncated: true, params: { item: { type: "commandExecution", command: "bun test", exitCode: 1, aggregatedOutput: "auth.test.ts:\n(fail) expired token should return 401" } } } };
	const run = projectRequestTestWorkspace({ activities: [partial] }).runs[0]!;
	expect(run).toMatchObject({ pass: null, fail: null, totalsSource: "unobserved", failureNames: ["expired token should return 401"] });
});

test("reads a redirected full-regression footer and failure names from an observed log inspection", () => {
	const command = "bun test > .www/scratchpad/regression.log 2>&1";
	const run = activity("full", 1, command, "completed", 1, "", "2026-09-12T00:00:01Z");
	const readback = activity("readback", 2, "rg -n 'pass|fail|Ran' .www/scratchpad/regression.log", "completed", 0,
		"101:(fail) login rejects an expired token [2ms]\n102:(fail) workflow resumes once [3ms]\n900: 1613 pass\n901: 9 fail\n902:Ran 1622 tests across 182 files. [40.39s]", "2026-09-12T00:00:02Z");
	const result = projectRequestTestWorkspace({ activities: [change, run, readback], requireCodeChange: true }).runs[0]!;
	expect(result).toMatchObject({ command, pass: 1613, fail: 9, skip: 0, totalsSource: "log-readback", failureNames: ["login rejects an expired token", "workflow resumes once"] });
	expect(projectRequestTestWorkspace({ activities: [change, run], requireCodeChange: true }).runs[0]).toMatchObject({ pass: null, fail: null, totalsSource: "unobserved" });
});

test("aggregates only observed case rows while a Bun run is active", () => {
	const running = activity("run", 1, "bun test", "started", null, "auth.test.ts:\n(pass) accepts active token [2.8ms]", "2026-09-12T00:00:01Z") ;
	const run     = projectRequestTestWorkspace({ activities: [running] }).runs[0]!                                                               ;
	expect(run).toMatchObject({ status: "running", pass: 1, fail: 0, skip: 0, exitCode: null, durationMs: null });
	expect(run.suites[0]).toMatchObject({ name: "auth.test.ts", pass: 1 });
});

test("opens the selected run's captured command output in Monitor", () => {
	const snapshot = wwwFixture("ready");
	snapshot.activities = [change, observed, activity("run-2", 2, "npm run lint", "completed", 0, "lint complete", "2026-09-12T00:00:03Z")];
	const view = new WwwTestView(() => projectWwwTestView(snapshot));
	view.moveSelection(-1);
	expect(view.selectedRun?.id).toBe("run-1");
	const monitor  = new WwwMonitorView(() => ({} as never), Date.now, false, () => snapshot, false, () => view.selectedRun?.id ?? null) ;
	const rendered = stripTerminalSequences(monitor.render(80).join("\n"))                                                               ;
	expect(rendered)    .toContain("bun test"     ) ;
	expect(rendered)    .toContain("Expected: 401") ;
	expect(rendered).not.toContain("lint complete") ;
});

test("shows verification only after a code change and ignores read commands with test paths", () => {
	const read = activity("read", 2, "rg -n test src", "completed", 0, "", "2026-09-12T00:00:02Z");
	const tests = [
		activity("before", 1, "bun test", "completed", 0, "", "2026-09-12T00:00:01Z"),
		activity("after", 3, "bun test", "completed", 0, "", "2026-09-12T00:00:03Z"),
	];
	const changedLater = { ...change, sequence: 2 };
	const runs = projectRequestTestWorkspace({ activities: [tests[0]!, changedLater, read, tests[1]!], requireCodeChange: true }).runs;
	expect(runs.map(run => run.id)).toEqual(["after"]);
	expect(projectRequestTestWorkspace({ activities: [read, tests[1]!], requireCodeChange: true }).runs).toEqual([]);
	const wrapped = activity("wrapped", 4, '/bin/zsh -lcr "bun test test/example.test.ts"', "completed", 0, "", "2026-09-12T00:00:04Z");
	expect(projectRequestTestWorkspace({ activities: [change, wrapped], requireCodeChange: true }).runs.map(run => run.id)).toEqual(["wrapped"]);
	const snapshot = wwwFixture("ready");
	snapshot.activities = [read, tests[1]!];
	expect(stripTerminalSequences(new WwwTestView(() => projectWwwTestView(snapshot)).render(60).join("\n"))).toContain("관측된 검증 없음");
});

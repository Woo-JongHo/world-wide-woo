import { describe, expect, test }                          from "bun:test";
import { stripTerminalSequences }                          from "@earendil-works/pi-tui";
import chalk                                               from "chalk";
import { LayerPerformanceRecorder, PERFORMANCE_LAYER_IDS } from "../src/core/domain/observability/layer-performance";
import type { PerformanceObservation }                     from "../src/core/domain/observability/layer-performance";
import { projectRuntimeMonitor }                           from "../src/core/domain/observability/runtime-monitor";
import { REQUEST_STAGES }                                  from "../src/core/domain/execution/request-runtime";
import type { RequestRuntimeRecord }                       from "../src/core/domain/execution/request-runtime";
import { a, duration, telemetryDuration }                  from "../src/adapters/inbound/tui/foundation/theme/www-theme";
import { WwwMonitorView }                                  from "../src/adapters/inbound/tui/features/monitoring/view/www-monitor-view";
import { WwwDashboardView }                                from "../src/adapters/inbound/tui/features/dashboard/view/entry-dashboard-view";
import { wwwFixture }                                      from "./fixtures/www-snapshot";

function withCodeChange(snapshot: ReturnType<typeof wwwFixture>): ReturnType<typeof wwwFixture> {
	const tool = snapshot.activities.find(activity => activity.id === "tool-2")!;
	const change = { ...tool, id: "changed-code", sequence: tool.sequence, kind: "file-change" as const, phase: "completed" as const, nativeRefs: { ...tool.nativeRefs, itemId: "changed-code" }, payload: { method: "item/completed", params: { item: { type: "fileChange" } } } };
	return { ...snapshot, activities: [...snapshot.activities.filter(activity => activity.id !== "tool-2"), change, { ...tool, sequence: tool.sequence + 1 }], journalSequence: snapshot.journalSequence + 1 };
}

/** A production-shaped complete trace; every boundary lands below one second, as in real frames. */
function recordCompleteSubSecondTrace(): LayerPerformanceRecorder {
	const recorder = new LayerPerformanceRecorder() ;
	const traceId  = "turn-diag:event-1"            ;
	let at         = 1000                           ;
	const observe = (layerId: PerformanceObservation["layerId"], boundary: PerformanceObservation["boundary"]): void => {
		recorder.observe({ traceId, layerId, boundary, atMs: (at += 0.3) });
	};
	observe("native-receive", "queued");
	observe("native-receive", "started");
	observe("native-receive", "completed");
	observe("event-queue", "queued");
	observe("event-queue", "started");
	observe("state-projection", "queued");
	observe("state-projection", "started");
	observe("state-projection", "completed");
	observe("snapshot-publish", "queued");
	observe("snapshot-publish", "started");
	observe("snapshot-publish", "completed");
	observe("event-queue", "completed");
	observe("render-schedule", "queued");
	observe("render-schedule", "started");
	observe("render-schedule", "completed");
	observe("layout-materialize", "queued");
	observe("terminal-write", "queued");
	observe("layout-materialize", "started");
	observe("layout-materialize", "completed");
	observe("terminal-write", "started");
	observe("terminal-write", "completed");
	return recorder;
}

describe("telemetry duration formatting", () => {
	test("idle Monitor rail shows readiness instead of empty run telemetry", () => {
		const snapshot = {
			...wwwFixture("ready"),
			activeModel: "gpt-5.6-sol",
			effort: "low",
			permissionMode: "manual",
			collaborationMode: "manual",
			skillInventory: { count: 24, names: [], sourceRevision: "test", digest: "test" },
			mcpServers: [
				{ name: "ready", enabled: true, status: "ready", tools: [] },
				{ name: "off", enabled: false, status: "disabled", tools: [] },
			],
		} as const;
		const projection = projectRuntimeMonitor(snapshot as never, []);
		const output     = new WwwMonitorView(() => projection, Date.now, false, () => snapshot as never)
			.render(38)
			.map(stripTerminalSequences)
			.join("\n");
		expect(output).toContain("SYSTEM"       ) ;
		expect(output).toContain("● READY"      ) ;
		expect(output).toContain("GPT-5.6-Sol"  ) ;
		expect(output).toContain("스킬"         ) ;
		expect(output).toContain("24"           ) ;
		expect(output).toContain("MCP"          ) ;
		expect(output).toContain("1 / 2"        ) ;
		expect(output).toContain("SHORTCUTS"    ) ;
		expect(output).not.toContain("RUN #0"   ) ;
		expect(output).not.toContain("FAILURE 0") ;
	});

	test("Chat rail shows native plan and progress without Monitor trace sections", () => {
		const snapshot = wwwFixture("working");
		const projection = projectRuntimeMonitor(snapshot);
		const output = new WwwMonitorView(() => projection, Date.now, false, () => snapshot, true)
			.render(38).map(stripTerminalSequences).join("\n");
		expect(output).toContain("PLAN");
		expect(output).toContain("PROGRESS");
		expect(output).not.toContain("TEST ─");
		expect(output).not.toContain("COMMAND");
		expect(output).not.toContain("bun test test/session-");
		expect(output).toContain("세션과 이벤트 결합 지점 확인");
		expect(output).not.toContain("WATERFALL");
		expect(output).not.toContain("TRACE TREE");
		const privateCommand = { ...snapshot, activities: snapshot.activities.map(activity => activity.id === "tool-2" ? { ...activity, payload: { ...activity.payload, params: { item: { type: "commandExecution", command: "token=private-value bun test", aggregatedOutput: "1 pass", exitCode: 0 } } } } : activity) };
		const privateOutput = new WwwMonitorView(() => projectRuntimeMonitor(privateCommand), Date.now, false, () => privateCommand, true).render(38).map(stripTerminalSequences).join("\n");
		expect(privateOutput).not.toContain("token=");
		expect(privateOutput).not.toContain("private-value");
		const otherTurn = { ...snapshot, activities: [...snapshot.activities, { ...snapshot.activities.at(-1)!, id: "other-turn-test", sequence: 99, nativeRefs: { threadId: snapshot.threadId ?? "preview-thread", turnId: "other-turn", itemId: "other-turn-test" }, payload: { method: "item/completed", params: { item: { type: "commandExecution", command: "bun test unrelated.test.ts", aggregatedOutput: "1 pass", exitCode: 0 } } } }] };
		const otherOutput = new WwwMonitorView(() => projectRuntimeMonitor(otherTurn), Date.now, false, () => otherTurn, true).render(38).map(stripTerminalSequences).join("\n");
		expect(otherOutput).not.toContain("unrelated.test.ts");
	});

	test("Chat rail keeps observed test counts and the failed suite in a compact table", () => {
		const snapshot = withCodeChange(wwwFixture("working"));
		const activities = snapshot.activities.map(activity => activity.id === "tool-2" ? {
			...activity,
			phase: "completed" as const,
			payload: { method: "item/completed", params: { item: { type: "commandExecution", command: "bun test test/resume.test.ts", exitCode: 1, aggregatedOutput: "resume.test.ts:\n(pass) existing behavior\n(pass) event binding\n(fail) duplicate on resume\nExpected one event\n 2 pass\n 1 fail\nRan 3 tests across 1 file. [49ms]" } } },
		} : activity);
		const observed = { ...snapshot, activities };
		const output = new WwwMonitorView(() => projectRuntimeMonitor(observed), Date.now, false, () => observed, true).render(38).map(stripTerminalSequences).join("\n");
		expect(output).toContain("TEST");
		expect(output).toContain("49ms");
		expect(output).toContain("TOTAL");
		expect(output).toContain("실패 1건");
		expect(output).toContain("duplicate on resume");
		expect(output).toContain("resume.test.ts");
		expect(output).not.toContain("최근 검증 구성");
		expect(output).toContain("2P 1F 0S");
	});

	test("Chat TEST explains the planned verification and observed type-check command", () => {
		const snapshot = withCodeChange(wwwFixture("working"));
		snapshot.activities = snapshot.activities.map(activity => activity.id === "tool-2" ? {
			...activity,
			phase: "completed" as const,
			payload: { method: "item/completed", params: { item: { type: "commandExecution", command: '/bin/zsh -lcr "bun run check"', exitCode: 0, aggregatedOutput: "$ tsc --noEmit" } } },
		} : activity);
		const stage = { id: "VERIFY", status: "completed", goal: "타입 확인", input: [], owner: "orchestrator", model: null, agents: [], tools: [], output: null, evidence: [], decision: null, skipReason: null, startedAt: null, completedAt: null, next: "DELIVER", evidenceAfterSequence: 0, tasks: [{ id: "typecheck", title: "TypeScript 타입 검사", status: "completed", dependsOn: [], verification: { kind: "static-analysis", purpose: "변경 코드의 타입 오류가 없는지 확인" } }] } as const;
		snapshot.requestRuntime = [{ schemaVersion: 1, protocolVersion: 2, requestId: "request", threadId: snapshot.threadId, turnId: snapshot.activeTurnId, objective: "검증 설명", status: "completed", attempt: 1, previousAttempts: [], deliveries: [], requiredDeliveries: [], events: [], startedAt: null, completedAt: null, issues: [], actions: [], stages: [stage] }] as never;
		const output = new WwwMonitorView(() => projectRuntimeMonitor(snapshot), Date.now, false, () => snapshot, true).render(48).map(stripTerminalSequences).join("\n");
		expect(output).toContain("TypeScript 타입 검사");
		expect(output).toContain("변경 코드의 타입 오류가 없는지 확인");
		expect(output).toContain("bun run check");
		expect(output).toContain("tsc --noEmit");
		expect(output).not.toContain("검증 1");
	});

	test("Chat TEST shows redirected full-regression totals and the failures actually read back", () => {
		const snapshot = withCodeChange(wwwFixture("working"));
		const command = "bun test > .www/scratchpad/full-regression.log 2>&1";
		const tool = snapshot.activities.find(activity => activity.id === "tool-2")!;
		snapshot.activities = [
			...snapshot.activities.map(activity => activity.id === "tool-2" ? { ...activity, phase: "completed" as const, payload: { method: "item/completed", params: { item: { type: "commandExecution", command, exitCode: 1, aggregatedOutput: "" } } } } : activity),
			{ ...tool, id: "regression-readback", sequence: tool.sequence + 2, phase: "completed", nativeRefs: { ...tool.nativeRefs, itemId: "regression-readback" }, payload: { method: "item/completed", params: { item: { type: "commandExecution", command: "rg -n 'pass|fail|Ran' .www/scratchpad/full-regression.log", exitCode: 0, aggregatedOutput: "101:(fail) expired token regression [2ms]\n900: 1613 pass\n901: 9 fail\n902:Ran 1622 tests across 182 files. [40.39s]" } } } },
		];
		const output = new WwwMonitorView(() => projectRuntimeMonitor(snapshot), Date.now, false, () => snapshot, true).render(48).map(stripTerminalSequences).join("\n");
		expect(output).toContain("1613");
		expect(output).toContain("9");
		expect(output).toContain("출력 파일 재조회로 총계 확인");
		expect(output).toContain("expired token regression");
		expect(output).toContain("나머지 8건은 출력에서 확인되지 않음");
	});

	test("Chat rail separates the native plan from observed stage work", () => {
		const snapshot = wwwFixture("working");
		const tasks = [
			{ id: "a", title: "Reproduce event path", status: "completed", dependsOn: [] },
			{ id: "b", title: "Locate merge point", status: "completed", dependsOn: [] },
			{ id: "c", title: "Patch merge condition", status: "running", dependsOn: [] },
			{ id: "d", title: "Recheck result", status: "pending", dependsOn: [] },
		] as const;
		const stage = { id: "EXECUTE", status: "running", goal: "Fix duplicate event edge", input: [], owner: "orchestrator", model: null, agents: [], tools: [], output: null, evidence: [], decision: null, skipReason: null, startedAt: null, completedAt: null, next: "VERIFY", evidenceAfterSequence: 0, tasks } as const;
		snapshot.requestRuntime = [{ schemaVersion: 1, protocolVersion: 2, requestId: "request", threadId: snapshot.threadId, turnId: snapshot.activeTurnId, objective: "resume", status: "running", attempt: 1, previousAttempts: [], deliveries: [], requiredDeliveries: [], events: [], startedAt: null, completedAt: null, issues: [], actions: [], stages: [stage] }] as never;
		const output = new WwwMonitorView(() => projectRuntimeMonitor(snapshot), Date.now, false, () => snapshot, true).render(38).map(stripTerminalSequences).join("\n");
		const plan = output.slice(output.indexOf("PLAN"), output.indexOf("PROGRESS"));
		const progress = output.slice(output.indexOf("PROGRESS"), output.indexOf("TEST"));
		expect(plan).toContain("세션과 이벤트 결합 지점 확인");
		expect(plan).not.toContain("Reproduce event path");
		expect(progress).toContain("Reproduce event path");
		expect(progress).toContain("Patch merge condition");
		expect(progress).toContain("2 / 4");
	});

	test("Chat rail shows a decision without repeating the stage goal", () => {
		const snapshot = wwwFixture("working");
		const stage = { id: "DECIDE", status: "running", goal: "검증 경로 선택", input: [], owner: "orchestrator", model: null, agents: [], tools: [], output: null, evidence: [], decision: { decision: "관측된 테스트만 표시", rationale: "공개 근거", selectedApproach: "원문 사용", rejectedAlternatives: [], executionPlan: [] }, skipReason: null, startedAt: null, completedAt: null, next: "EXECUTE", evidenceAfterSequence: 0, tasks: [] } as const;
		snapshot.requestRuntime = [{ schemaVersion: 1, protocolVersion: 2, requestId: "request", threadId: snapshot.threadId, turnId: snapshot.activeTurnId, objective: "검증 화면", status: "running", attempt: 1, previousAttempts: [], deliveries: [], requiredDeliveries: [], events: [], startedAt: null, completedAt: null, issues: [], actions: [], stages: [stage] }] as never;
		const output = new WwwMonitorView(() => projectRuntimeMonitor(snapshot), Date.now, false, () => snapshot, true).render(38).map(stripTerminalSequences).join("\n");
		expect(output).not.toContain("검증 경로 선택");
		expect(output).not.toContain("Focus ·");
		expect(output).toContain("DECISION");
		expect(output).toContain("관측된 테스트만 표시");
		expect(output).not.toContain("공개 근거");
	});

	test("idle Chat rail keeps plan and progress instead of switching to runtime shortcuts", () => {
		const snapshot = withCodeChange(wwwFixture("ready"));
		const projection = projectRuntimeMonitor(snapshot);
		const output = new WwwMonitorView(() => projection, Date.now, false, () => snapshot, true)
			.render(38).map(stripTerminalSequences).join("\n");
		expect(output).toContain("PLAN");
		expect(output).toContain("PROGRESS");
		expect(output).not.toContain("최근 요청 계획");
		expect(output).not.toContain("최근 요청 검증");
		expect(output).not.toContain("작업·의존성·병렬 가능성");
		expect(output).toContain("세션과 이벤트 결합 지점 확인");
		expect(output).not.toContain("RUNTIME");
		expect(output).not.toContain("SHORTCUTS");
	});

	test("Chat rail gives PLAN, PROGRESS, and TEST distinct semantic colors", () => {
		const level = chalk.level; chalk.level = 3;
		try {
			const snapshot = withCodeChange(wwwFixture("ready"));
			const output = new WwwMonitorView(() => projectRuntimeMonitor(snapshot), Date.now, false, () => snapshot, true).render(52).join("\n");
			expect(output).toContain(a.plan("PLAN"));
			expect(output).toContain(a.info("PROGRESS"));
			expect(output).toContain(a.tool("TEST"));
		} finally { chalk.level = level; }
	});

	test("Monitor는 요청 창 밖으로 이어진 stage waterfall을 viewport 안으로 제한한다", () => {
		const startedAt = "2026-09-28T00:00:00.000Z";
		const request: RequestRuntimeRecord = {
			schemaVersion: 1, protocolVersion: 2, requestId: "request-bounded-waterfall", threadId: "thread", turnId: "turn",
			objective: "waterfall 폭을 제한한다", status: "completed", attempt: 1, previousAttempts: [], deliveries: [], requiredDeliveries: [], events: [],
			startedAt, completedAt: "2026-09-28T00:00:01.000Z", issues: [], actions: [],
			stages: REQUEST_STAGES.map((id, index) => ({
				id, status: index === 0 ? "running" : "pending", goal: id, input: [], owner: "orchestrator", model: null,
				agents: [], tools: [], output: null, evidence: [], decision: null, skipReason: null,
				startedAt: index === 0 ? startedAt : null, completedAt: null, next: REQUEST_STAGES[index + 1] ?? null,
				evidenceAfterSequence: 0, tasks: [],
			})),
		};
		const projection = { state: "completed", activeRequest: null, model: null, agent: null, currentTool: null, approval: null, retryCount: 0, failureCount: 0, sourceActivityIds: [], recentEvents: [], skillRun: null, requestRuntime: request } as const;
		const width      = 80;
		const rows       = new WwwMonitorView(() => projection, () => Date.parse(startedAt) + 1_000_000_000_000).render(width);
		expect(rows.every(row => stripTerminalSequences(row).length <= width)).toBe(true);
	});

	test("request duration keeps second flooring for elapsed labels", () => {
		expect(duration(0.4)  ).toBe("0s") ;
		expect(duration(950)  ).toBe("0s") ;
		expect(duration(1_234)).toBe("1s") ;
	});

	test("telemetry duration preserves sub-second milliseconds", () => {
		expect(telemetryDuration(null) ).toBe("—"     ) ;
		expect(telemetryDuration(0.02) ).toBe("0.02ms") ;
		expect(telemetryDuration(3.3)  ).toBe("3.3ms" ) ;
		expect(telemetryDuration(42)   ).toBe("42ms"  ) ;
		expect(telemetryDuration(1_234)).toBe("1s"    ) ;
	});

	test("Monitor renders complete sub-second traces with millisecond layer values, never all-zero seconds", () => {
		const recorder  = recordCompleteSubSecondTrace();
		const current   = recorder.latest();
		if (!current) throw new Error("expected a projected trace");
		expect(current.state).toBe("complete");
		const snapshot   = { ...wwwFixture("ready"), layerPerformance: { current, window: recorder.window() } } as const     ;
		const projection = projectRuntimeMonitor(snapshot as never, snapshot.activities, snapshot.layerPerformance as never) ;
		const rows       = new WwwMonitorView(() => projection).render(96).map(stripTerminalSequences)                       ;
		const layerRows  = rows.filter(row => PERFORMANCE_LAYER_IDS.some(layerId => row.includes(layerId)))                  ;
		expect(layerRows.length                                     ).toBe(PERFORMANCE_LAYER_IDS.length) ;
		expect(layerRows.some(row => /wait 0s · work 0s/u.test(row))).toBe(false                       ) ;
		expect(layerRows.some(row => /\d+(?:\.\d+)?ms/u.test(row))  ).toBe(true                        ) ;
	});

	test("Dashboard slowest P95 reports milliseconds below one second", () => {
		const recorder = recordCompleteSubSecondTrace()                                                                                   ;
		const snapshot = { ...wwwFixture("ready"), layerPerformance: { current: recorder.latest(), window: recorder.window() } } as const ;
		const rows     = new WwwDashboardView(() => snapshot as never).render(96).map(stripTerminalSequences)                             ;
		const p95      = rows.find(row => row.includes("SLOWEST P95"))                                                                    ;
		if (!p95) throw new Error("expected a SLOWEST P95 row");
		expect(p95).toContain("ms");
		expect(p95).not.toContain("0s");
	});

	test("Monitor exposes slow Chat render rate, percentile, threshold, and worst frame", () => {
		const recorder = new LayerPerformanceRecorder();
		const render = (traceId: string, frameId: string, queuedAt: number, completedAt: number): void => {
			recorder.observe({ traceId, layerId: "render-schedule", boundary: "queued", atMs: queuedAt });
			recorder.observe({ traceId, layerId: "terminal-write", boundary: "started", atMs: completedAt - 1, frameId });
			recorder.observe({ traceId, layerId: "terminal-write", boundary: "completed", atMs: completedAt, frameId });
		};
		render("slow", "frame-slow", 0, 150);
		render("fast", "frame-fast", 200, 240);
		const snapshot   = { ...wwwFixture("ready"), layerPerformance: { current: recorder.latest(), window: recorder.window() } } as const ;
		const projection = projectRuntimeMonitor(snapshot as never, snapshot.activities, snapshot.layerPerformance as never)                ;
		const output     = new WwwMonitorView(() => projection).render(96).map(stripTerminalSequences).join("\n")                           ;
		expect(output).toContain("Render Health"     ) ;
		expect(output).toContain("1 / 2 (50%)"       ) ;
		expect(output).toContain("> 100ms"           ) ;
		expect(output).toContain("p95 150ms"         ) ;
		expect(output).toContain("frame-slow · 150ms") ;
	});
});

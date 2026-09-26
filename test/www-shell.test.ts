import { expect, spyOn, test }                                               from "bun:test";
import { TuiAltScreen, stripTerminalSequences, visibleWidth }                from "@earendil-works/pi-tui";
import type { Component, Terminal }                                          from "@earendil-works/pi-tui";
import { getScrollViewBox, renderLayoutFrame }                               from "@earendil-works/pi-tui/dist/layout.js";
import type { ProjectWorkbench }                                             from "../src/core/application/orchestration/project-workbench";
import type { WorkbenchCommand, WorkbenchCommandReceipt, WorkbenchListener } from "../src/core/domain/work/workbench";
import { runProjectWorkbenchShell }                                          from "../src/adapters/inbound/tui/shell/workbench-shell";
import { runCli }                                                            from "../src/cli";
import type { CliDependencies }                                              from "../src/cli";
import { wwwFixture }                                                        from "./fixtures/www-snapshot";

class MemoryTerminal implements Terminal {
	columns = 80; rows = 24; kittyProtocolActive = false; output = ""; stopped = false;
	input: (data: string) => void = () => { throw new Error("terminal not started"); };
	resize: () => void = () => { throw new Error("terminal not started"); };
	start           (input: (data: string) => void, resize: () => void): void { this.input = input; this.resize = resize; }
	stop            ()                                                 : void { this.stopped = true; }
	async drainInput()                                                 : Promise<void> { this.input = () => {}; }
	write           (data: string                                     ): void { this.output += data; }
	moveBy          (n: number                                        ): void { this.write(`\x1b[${Math.abs(n)}${n > 0 ? "B" : "A"}`); }
	hideCursor      ()                                                 : void { this.write("\x1b[?25l"); }
	showCursor      ()                                                 : void { this.write("\x1b[?25h"); }
	clearLine       ()                                                 : void { this.write("\x1b[2K"); }
	clearFromCursor ()                                                 : void { this.write("\x1b[J"); }
	clearScreen     ()                                                 : void { this.write("\x1b[2J"); }
	setTitle        (title: string                                    ): void { this.write(`\x1b]0;${title}\x07`); }
	setProgress     (active: boolean                                  ): void { this.write(active ? "\x1b]9;4;3\x07" : "\x1b]9;4;0\x07"); }
}
const tick = () => new Promise(resolve => setTimeout(resolve, 40));

test("production Www shell routes navigation, rejection, approval and shutdown through existing contracts", async () => {
	const terminal = new MemoryTerminal();
	const showOverlay = spyOn(TuiAltScreen.prototype, "showOverlay");
	let snapshot = {
		...wwwFixture("ready"),
		reasoningSummaryDraft: "LIVE_PRIVATE_REASONING_SENTINEL",
		linearDashboard: { state: "ready" as const, projectName: "LIVE_PRIVATE_PROJECT_SENTINEL", fetchedAt: null, issues: [], update: null, comments: [], milestones: [], error: null },
	}, listener: WorkbenchListener = () => {};
	const commands: WorkbenchCommand[] = []; let closed = false, released = false, saved = "";
	const wb = {
		get snapshot() { return snapshot; },
		subscribe(fn: WorkbenchListener) { listener = fn; fn(snapshot); return () => { listener = () => {}; }; },
		async dispatch(command: WorkbenchCommand): Promise<WorkbenchCommandReceipt> {
			commands.push(command);
			if (command.type === "chat.send") return { state: "rejected", commandId: "r", reason: "전송 거부 확인" };
			if (command.type === "approval.resolve") { snapshot = { ...snapshot, pendingApproval: null }; listener(snapshot); }
			return { state: "accepted", commandId: "ok" };
		},
		async close() { closed = true; },
	} as unknown as ProjectWorkbench;
	runProjectWorkbenchShell({ surface: "www", terminal, cwd: "/test/www", workbench: wb,
		usage               : { async refresh() { return []; }, startPolling(fn) { fn([]); return () => {}; }, cacheMetrics: () => ({ entries: 0, hits: 0, misses: 0, evictions: 0, lastAccessedAt: null }) },
		auth                : { methods: () => [], status: async provider => ({ state: "configured", provider, type: "oauth", source: "test fixture" }), login: async () => { throw new Error("not requested"); }, logout: async () => {} },
		composerDraft       : { initialText: "", save: async text => { saved = text; }, clear: async () => { saved = ""; } },
		releaseSessionLease : async () => { released = true; },
	});
	const submit = async (text: string) => { terminal.input(text); terminal.input("\r"); await tick(); };
	try {
		await tick(); expect(terminal.output).toContain("www"); expect(terminal.output).toContain("세션 연결됨"); expect(terminal.output).toContain("REQ 1");
		const labStart = terminal.output.length;
		await submit("/three-body"); expect(terminal.output.slice(labStart)).toContain("THREE BODY LAB");
		terminal.input(" "); await tick(); expect(terminal.output.slice(labStart)).toContain("PAUSED");
		terminal.input("t"); await tick(); expect(terminal.output.slice(labStart)).toContain("Trail off");
		terminal.input("q"); await tick(); expect(terminal.output.slice(labStart)).toContain("REQ 1");
		await submit("/todo"); expect(terminal.output).toContain("Plan"); expect(commands).toHaveLength(0);
		terminal.input("\x1b"); await tick();
		const legacyNotesStart = terminal.output.length;
		await submit("/tnotes");
		expect(terminal.output.slice(legacyNotesStart)).toContain("완료 Note");
		expect(terminal.output.slice(legacyNotesStart)).toContain("저장된 완료 Note가 없습니다");
		expect(showOverlay).toHaveBeenCalled();
		expect(commands).toHaveLength(0);
		terminal.input("\x1b"); await tick();
		snapshot = {
			...snapshot,
			tnoteRead: { status: "ready", error: null },
			tnotes: [
				{ id: "note-legacy", sequence: 1, title: "이전 질문", summary: "질문: 이전 질문\n왜: 이전 이유\n결과: 이전 결과", sourceActivityIds: ["legacy-source"], format: "legacy-three-field", updatedAt: "2026-09-24T00:00:00.000Z" },
				{ id: "note-current", sequence: 2, title: "현재 질문", summary: "질문: 현재 질문\nPlan: 실제 terminal 경로를 검증한다\n과정: 목록과 선택을 연결했다\n결론: 상세 화면을 열었다", sourceActivityIds: ["source-1", "source-2"], sourceRange: { startSequence: 1, endSequence: 2 }, completion: { threadId: "preview-thread", turnId: "preview-turn", number: 1, terminalActivityId: "source-2" }, provenance: { provider: "openai-codex", model: "gpt-5.6-luna", version: "2026-09-25" }, format: "request-report-v2", updatedAt: "2026-09-25T00:00:00.000Z" },
		],
		};
		listener(snapshot); await tick();
		terminal.rows = 40; terminal.resize(); await tick();
		const populatedNotesStart = terminal.output.length;
		await submit("/tnotes");
		expect(terminal.output.slice(populatedNotesStart)).toContain("› 2. 현재 질문 · note-current");
		terminal.input("\x1b[A"); await tick();
		expect(terminal.output.slice(populatedNotesStart)).toContain("› 1. 이전 질문 · note-legacy");
		terminal.input("\x1b[B"); await tick();
		terminal.input("\r"); await tick();
		expect(terminal.output.slice(populatedNotesStart)).toContain("Turn preview-thread / preview-turn · 질문 #1");
		expect(terminal.output.slice(populatedNotesStart)).toContain("생성 openai-codex / gpt-5.6-luna / 2026-09-25");
		terminal.input("\x1b"); await tick();
		expect(terminal.output.slice(populatedNotesStart)).toContain("↑↓ 선택 · Enter 열기 · Esc 닫기");
		terminal.input("\x1b"); await tick();
		terminal.rows = 24; terminal.resize(); await tick();
		await submit("/stats"); expect(terminal.output).toContain("세션 검토");
		terminal.input("\x1b"); await tick();
		const testViewStart = terminal.output.length;
		await submit("/Test"); expect(terminal.output.slice(testViewStart)).toContain("질문별 Test");
		terminal.input("\x1b"); await tick();
		const navigationStart = terminal.output.length;
		terminal.input("\x07"); terminal.input("3"); await tick(); expect(terminal.output.slice(navigationStart)).toContain("Progress");
		terminal.input("1"); await tick();
		terminal.input("\x10"); await tick(); terminal.input("\x1b"); await tick();
		await submit("request 1"); expect(commands.at(-1)).toEqual({ type: "chat.send", text: "request 1", delivery: "queue" });
		terminal.input("\x15");
		terminal.input("\x1b"); await tick();
		const sourceStart = terminal.output.length;
		await submit("/source latest");
		expect(terminal.output.slice(sourceStart)).toContain("실행 근거");
		expect(terminal.output.slice(sourceStart)).not.toContain("Tab 입력");
		terminal.input("\x1b"); await tick();
		terminal.rows = 14; terminal.resize(); await tick();
		await submit("/login");
		const loginStart = terminal.output.length;
		for (let i = 0; i < 5; i++) { terminal.input("\x1b[6~"); await tick(); }
		expect(terminal.output.slice(loginStart)).toContain("Z.AI GLM Coding Plan");
		terminal.input("\x1b"); await tick();
		terminal.rows = 24; terminal.resize(); await tick();
		terminal.input("abcdef"); terminal.input("\x01"); terminal.input("\x05"); terminal.input("Z"); terminal.input("\r"); await tick();
		expect(commands.at(-1)).toEqual({ type: "chat.send", text: "abcdefZ", delivery: "queue" });
		terminal.input("\x15");
		const completionStart = terminal.output.length;
		terminal.input("/mo"); terminal.input("\t"); await tick();
		expect(terminal.output.slice(completionStart)).toContain("→ model");
		terminal.input("\x1b"); terminal.input("\x15"); await tick();
		await submit("거절된 요청"); expect(commands.at(-1)).toEqual({ type: "chat.send", text: "거절된 요청", delivery: "queue" });
		terminal.input("\x03"); await tick();
		await submit("/login");
		const overlaysBeforeApproval = showOverlay.mock.calls.length;
		snapshot = { ...snapshot, pendingApproval: { requestId: 99, callbackId: null, kind: "command", refs: {}, availableDecisions: ["accept", "decline"], params: { command: "git status" } } }; listener(snapshot); await tick();
		expect(showOverlay).toHaveBeenCalledTimes(overlaysBeforeApproval);
		expect(terminal.output).toContain("승인 필요");
		terminal.input("\x1b"); await tick();
		terminal.input("\x10"); await tick(); listener({ ...snapshot, revision: snapshot.revision + 1 }); await tick();
		const pendingPaletteStart = terminal.output.length;
		terminal.input("approval"); await tick(); expect(terminal.output.slice(pendingPaletteStart)).toContain("검색  approval");
		terminal.input("\x1b"); await tick();
		const blockedLoginStart = terminal.output.length;
		await submit("/login"); expect(terminal.output.slice(blockedLoginStart)).toContain("먼저 결정");
		const beforeApproval = commands.length;
		await submit("/approval"); expect(commands).toHaveLength(beforeApproval);
		terminal.input("\x1b[B"); terminal.input("\r"); await tick();
		expect(commands.at(-1)).toEqual({ type: "approval.resolve", requestId: 99, response: { decision: "decline" } });
		const paletteStart = terminal.output.length;
		terminal.input("\x10"); await tick(); expect(terminal.output.slice(paletteStart)).toContain("명령 찾기");
		terminal.input("\x1b"); await tick();
		terminal.columns = 120; terminal.rows = 35; terminal.resize(); await tick();
		terminal.input("보존할 초안"); await tick();
		terminal.input("\x04"); await tick(); expect(closed).toBe(false);
		await new Promise(resolve => setTimeout(resolve, 550));
		terminal.input("\x03"); terminal.input("\x03"); await tick();
		expect(closed).toBe(true); expect(released).toBe(true); expect(terminal.stopped).toBe(true); expect(saved).toBe("");
	} finally {
		if (!terminal.stopped) { terminal.input("\x03"); terminal.input("\x03"); await tick(); }
		showOverlay.mockRestore();
	}
});

test("WWW CLI keeps resume selection, cancellation and execution-lane semantics", async () => {
	const opened: unknown[] = []; let select: string | null = "selected";
	const deps: CliDependencies = {
		runApp: async () => { throw new Error("wrong shell"); }, runWww: async options => { opened.push(options); },
		runRouter: async () => { throw new Error("wrong shell"); }, runAuth: async () => {}, listSessions: async () => [],
		runDevelopment: async () => "", runWorkflow: async () => "",
		listNativeThreads: async () => [{ id: "selected", cwd: "/test", updatedAt: 1, preview: "", status: "idle" }],
		selectNativeThread: async () => select, writeOut: () => {}, writeError: () => {},
	};
	expect(await runCli([], deps)).toBe(0);
	expect(await runCli(["--resume"], deps)).toBe(0);
	expect(await runCli(["--resume", "specific"], deps)).toBe(0);
	expect(await runCli(["--execution-lane", "pi"], deps)).toBe(0);
	expect(opened).toEqual([{}, { resumeThreadId: "selected" }, { resumeThreadId: "specific" }, { executionLane: "pi" }]);
	select = null; expect(await runCli(["--resume"], deps)).toBe(0); expect(opened).toHaveLength(4);
	expect(await runCli(["garbage"], deps)).toBe(1); expect(opened).toHaveLength(4);
});

test("Mac Control+G navigation preserves drafts, routes every page, and leaves ordinary digits editable", async () => {
	const terminal = new MemoryTerminal(), commands: WorkbenchCommand[] = [];
	const snapshot = wwwFixture("ready");
	const wb = { snapshot, subscribe(fn: WorkbenchListener) { fn(snapshot); return () => {}; }, async dispatch(command: WorkbenchCommand) { commands.push(command); return { state: "rejected", commandId: "r", reason: "test draft retained" }; }, async close() {} } as unknown as ProjectWorkbench;
	runProjectWorkbenchShell({ surface: "www", terminal, cwd: "/test/www", workbench: wb,
		usage: { async refresh() { return []; }, startPolling(fn) { fn([]); return () => {}; }, cacheMetrics: () => ({ entries: 0, hits: 0, misses: 0, evictions: 0, lastAccessedAt: null }) },
		auth: { methods: () => [], status: async provider => ({ state: "configured", provider, type: "oauth", source: "test" }), login: async () => { throw new Error("not requested"); }, logout: async () => {} },
	});
	try {
		await tick(); terminal.input("초안"); await tick();
		for (const [key, label] of [["2", "Plan"], ["3", "Progress"], ["4", "세션 검토"], ["5", "SESSION OVERVIEW"], ["6", "개발"], ["7", "Context"], ["8", "질문별 Test"], ["1", "Chat"]]) {
			terminal.input("\x07"); await tick(); expect(terminal.output).toContain("화면 이동");
			const start = terminal.output.length; terminal.input(key!); await tick(); expect(terminal.output.slice(start)).toContain(label!);
		}
		expect(commands).toHaveLength(0);
		terminal.input("\x07"); await tick(); terminal.input("\x1b"); await tick(); terminal.input("1"); terminal.input("\r"); await tick();
		expect(commands.at(-1)).toEqual({ type: "chat.send", text: "초안1", delivery: "queue" });
		terminal.input("\x15"); await tick();
		const start = terminal.output.length; terminal.input("\x1b[13~"); await tick(); expect(terminal.output.slice(start)).toContain("Plan");
	} finally { terminal.input("\x03"); terminal.input("\x03"); await tick(); }
});

test("/demo presents synthetic MVP pages with R/E navigation and restores live state on Escape", async () => {
	const terminal = new MemoryTerminal();
	terminal.columns = 120; terminal.rows = 36;
	let snapshot = wwwFixture("ready"), listener: WorkbenchListener = () => {};
	const commands: WorkbenchCommand[] = [];
	const wb = {
		get snapshot() { return snapshot; },
		subscribe(fn: WorkbenchListener) { listener = fn; fn(snapshot); return () => {}; },
		async dispatch(command: WorkbenchCommand) { commands.push(command); return { state: "accepted", commandId: "unexpected" }; },
		async close() {},
	} as unknown as ProjectWorkbench;
	let root: Component | undefined                                                                                                                                                   ;
	const original = TuiAltScreen.prototype.setLayoutRoot                                                                                                                             ;
	const capture  = spyOn(TuiAltScreen.prototype, "setLayoutRoot").mockImplementation(function(this: TuiAltScreen, component) { root = component; original.call(this, component); }) ;
	const frame    = () => {
		expect(root).toBeDefined();
		return renderLayoutFrame(root!, terminal.columns, terminal.rows, () => {}).lines.map(stripTerminalSequences).join("\n");
	};
	const submit = async (text: string) => { terminal.input(text); terminal.input("\r"); await tick(); };
	try {
		runProjectWorkbenchShell({ surface: "www", terminal, cwd: "/test/www", workbench: wb,
			usage: { async refresh() { return []; }, startPolling(fn) { fn([]); return () => {}; }, cacheMetrics: () => ({ entries: 0, hits: 0, misses: 0, evictions: 0, lastAccessedAt: null }) },
			auth: { methods: () => [], status: async provider => ({ state: "configured", provider, type: "oauth", source: "test" }), login: async () => { throw new Error("not requested"); }, logout: async () => {} },
		});
		await tick();
		await submit("/demo");
		expect(frame()).toContain("DEMO DATA");
		expect(frame()).toContain("Chat");
		expect(frame()).toContain("Stages");
		expect(frame()).toContain("+2 대기");
		terminal.columns = 80; terminal.rows = 24; terminal.resize(); await tick();
		expect(frame()).toContain("승인 대기");
		expect(frame()).not.toContain("Stages");
		terminal.columns = 160; terminal.rows = 48; terminal.resize(); await tick();
		expect(frame()).not.toContain("LIVE_PRIVATE_REASONING_SENTINEL");
		terminal.input("E"); await tick(); expect(frame()).toContain("ACTIVE SESSION ID"); expect(frame()).toContain("TOKEN ALLOCATION TRENDS"); expect(frame()).toContain("SESSION EVENT AGGREGATES");
		terminal.input("E"); await tick(); expect(frame()).toContain("모델별 사용 내역");
		terminal.input("E"); await tick(); expect(frame()).toContain("CONTEXT ACCUMULATION SPECTROMETER");
		expect(frame()).not.toContain("LIVE_PRIVATE_PROJECT_SENTINEL");
		expect(frame()).toContain("LOADED SKILLS"); expect(frame()).toContain("STORAGE METRICS");
		for (const label of ["CONTEXT COMPOSITION BREAKDOWN", "CONTEXT CHANGE ACTIVITY", "DIAGNOSTIC EVENT AGGREGATES", "TOP ITEMS BY SIZE", "STATE CHANGE ALERTS", "synthetic fixtures", "T-8"]) expect(frame()).toContain(label);
		terminal.input("R"); await tick(); expect(frame()).toContain("모델별 사용 내역");
		terminal.input("E"); await tick(); expect(frame()).toContain("CONTEXT CHANGE ACTIVITY");
		terminal.input("G"); await tick(); expect(frame()).toContain("DIAGNOSTIC EVENT AGGREGATES");
		expect(frame()).not.toContain("계획 연결 근거");
		terminal.input("E"); await tick(); expect(frame()).toContain("CACHE SLICES");
		terminal.input("E"); await tick(); expect(frame()).toContain("7-stage request pipeline"); expect(frame()).toContain("5 ACTIVE / 8 TOTAL");
		for (const label of ["UNDERSTAND", "DECOMPOSE", "GROUND", "DECIDE", "EXECUTE", "VERIFY", "DELIVER", "LANE_A", "LANE_B", "LANE_C"]) expect(frame()).toContain(label);
		terminal.input("E"); await tick(); expect(frame()).toContain("Plan"); expect(frame()).toContain("Next"); expect(frame()).toContain("2개");
		terminal.input("E"); await tick(); expect(frame()).toContain("Chat");
		terminal.input("R"); await tick(); expect(frame()).toContain("Plan");
		snapshot = { ...snapshot, revision: 77,
			sessionGoal: { text: "LIVE RESTORED", sourceActivityId: "live-goal", updatedAt: "2026-09-22T00:00:00Z" },
			pendingApproval: { requestId: 77, callbackId: null, kind: "command", refs: {}, availableDecisions: ["accept", "decline"], params: { command: "DEMO_EXIT_APPROVAL" } },
		};
		listener(snapshot); await tick();
		expect(frame()).not.toContain("LIVE RESTORED");
		terminal.input("\x1b"); await tick();
		expect(frame()).toContain("LIVE RESTORED");
		expect(frame()).toContain("DEMO_EXIT_APPROVAL");
		expect(frame()).not.toContain("DEMO DATA");
		terminal.input("\x03"); await tick(); // Close the restored approval sheet before navigating Live.
		snapshot = { ...snapshot, revision: 78, pendingApproval: null };
		listener(snapshot); await tick();
		terminal.input("\x07"); terminal.input("7"); await tick();
		terminal.input("g"); await tick(); // Context retains the earlier Demo end-of-page scroll position.
		expect(frame()).toContain("Source token allocation unavailable");
		expect(frame()).not.toContain("CONV growing");
		expect(commands).toHaveLength(0);
	} finally {
		if (!terminal.stopped) { terminal.input("\x03"); terminal.input("\x03"); await tick(); }
		capture.mockRestore();
	}
});

test("ESC commits a focused follow-up as an explicit Queue delivery while a turn is working", async () => {
	const terminal                      = new MemoryTerminal() ;
	let snapshot                        = wwwFixture("ready")  ;
	let listener   : WorkbenchListener  = () => {}             ;
	const commands : WorkbenchCommand[] = []                   ;
	const wb = {
		get snapshot() { return snapshot; },
		subscribe(fn: WorkbenchListener) { listener = fn; fn(snapshot); return () => {}; },
		async dispatch(command: WorkbenchCommand): Promise<WorkbenchCommandReceipt> {
			commands.push(command);
			return command.type === "chat.send"
				? { state: "queued", commandId: "queued", position: 1 }
				: { state: "accepted", commandId: "ok" };
		},
		async close() {},
	} as unknown as ProjectWorkbench;
	runProjectWorkbenchShell({ surface: "www", terminal, cwd: "/test/www", workbench: wb,
		usage: { async refresh() { return []; }, startPolling(fn) { fn([]); return () => {}; }, cacheMetrics: () => ({ entries: 0, hits: 0, misses: 0, evictions: 0, lastAccessedAt: null }) },
		auth: { methods: () => [], status: async provider => ({ state: "configured", provider, type: "oauth", source: "test" }), login: async () => { throw new Error("not requested"); }, logout: async () => {} },
	});
	try {
		await tick();
		snapshot = { ...snapshot, phase: "working" };
		listener(snapshot);
		terminal.input("후속 응답"); await tick();
		terminal.input("\x1b"); await tick();
		expect(commands.at(-1)).toEqual({ type: "chat.send", text: "후속 응답", delivery: "queue" });
	} finally {
		if (!terminal.stopped) { terminal.input("\x03"); terminal.input("\x03"); await tick(); }
	}
});

test("the production layout keeps autocomplete selections and multiline rails visible at 80x24", async () => {
	const terminal = new MemoryTerminal(), snapshot = wwwFixture("ready");
	const usageSnapshots = [{ provider: "openai-codex" as const, state: "ready" as const, fetchedAt: 1, limits: [{ label: "7 days", remainingPercent: 62, status: "ok" as const }] }];
	snapshot.tnotes = [{ id: "layout-note", title: "Layout note", summary: "QUESTION_PREVIEW_SENTINEL", updatedAt: "2026-09-12T00:00:00Z", sourceActivityIds: [] }];
	const wb       = { snapshot, subscribe(fn: WorkbenchListener) { fn(snapshot); return () => {}; }, async close() {} } as unknown as ProjectWorkbench                               ;
	let root            : Component | undefined                                                                                                                                       ;
	let transcriptWidth : number | undefined                                                                                                                                          ;
	const original = TuiAltScreen.prototype.setLayoutRoot                                                                                                                             ;
	const capture  = spyOn(TuiAltScreen.prototype, "setLayoutRoot").mockImplementation(function(this: TuiAltScreen, component) { root = component; original.call(this, component); }) ;
	const frame = () => {
		expect(root).toBeDefined();
		const layout = renderLayoutFrame(root!, terminal.columns, terminal.rows, () => {});
		transcriptWidth = layout.primaryScrollView ? getScrollViewBox(layout, layout.primaryScrollView)?.rect.width : undefined;
		const rows = layout.lines;
		expect(rows).toHaveLength(terminal.rows); expect(rows.every(row => visibleWidth(row) <= terminal.columns)).toBe(true);
		return rows.map(stripTerminalSequences);
	};
	try {
		runProjectWorkbenchShell({ surface: "www", terminal, cwd: "/test/www", workbench: wb,
			usage: { async refresh() { return usageSnapshots; }, startPolling(fn) { fn(usageSnapshots); return () => {}; }, cacheMetrics: () => ({ entries: usageSnapshots.length, hits: 0, misses: 1, evictions: 0, lastAccessedAt: "1970-01-01T00:00:00.001Z" }) },
			auth: { methods: () => [], status: async provider => ({ state: "configured", provider, type: "oauth", source: "test" }), login: async () => { throw new Error("not requested"); }, logout: async () => {} },
		});
		await tick(); terminal.columns = 112; terminal.resize(); await tick();
		terminal.input("\x07"); terminal.input("1"); await tick();
		// Notes belong to the execution stream even when the plan rail is hidden.
		expect(frame().join("\n")).toContain("QUESTION_PREVIEW_SENTINEL");
		terminal.rows = 30; terminal.resize(); await tick(); frame();
		const before = transcriptWidth; expect(before).toBe(74);
		terminal.input("\x02"); await tick(); frame(); expect(transcriptWidth).toBe(112);
		terminal.input("\x02"); await tick(); frame(); expect(transcriptWidth).toBe(before);
		terminal.input("/"); await tick(); frame(); expect(transcriptWidth).toBe(before);
		terminal.input("\x1b"); terminal.input("\x15"); await tick(); frame(); expect(transcriptWidth).toBe(before);
		terminal.rows = 38; terminal.resize(); await tick();
		expect(frame().join("\n")).toContain("QUESTION_PREVIEW_SENTINEL");
		expect(frame().join("\n")).not.toContain("Ctrl+G 3 요약 전체");
		terminal.columns = 80; terminal.rows = 24; terminal.resize();
		terminal.input("/"); await tick();
		for (let i = 0; i < 50; i++) {
			expect(frame().join("\n")).toMatch(/→\s+\S/u);
			terminal.input("\x1b[B"); await tick();
		}
		terminal.input("\x1b"); terminal.input("\x15");
		terminal.input(`\x1b[200~${Array.from({ length: 7 }, (_, i) => `line-${i}`).join("\n")}\x1b[201~`); await tick();
		for (let i = 0; i < 6; i++) terminal.input("\x1b[A"); await tick();
		const rows = frame(), text = rows.join("\n");
		for (let i = 0; i < 7; i++) expect(text).toContain(`line-${i}`);
		const bottom = rows.findIndex(row => row.includes("line-6")) + 1;
		expect(rows[bottom]).toMatch(/^\s*─+\s*$/u);
		expect(text).toContain("› GPT-5.6-Sol · High");
		expect(text).not.toContain("여기에 작성한다.");
		expect(text).not.toMatch(/구독 잔여|\bleft\b|\breset\b/u); expect(text).toContain("62%");
		expect(text).not.toContain("Enter 추가 지시");
		terminal.input("\x01"); terminal.input("\x0b"); terminal.input("/"); await tick();
		for (let i = 0; i < 50; i++) {
			const output = frame().join("\n");
			expect(output).toMatch(/→\s+\S/u); expect(output).not.toMatch(/구독 잔여|\bleft\b|\breset\b/u);
			terminal.input("\x1b[B"); await tick();
		}
	} finally {
		if (!terminal.stopped) { terminal.input("\x03"); terminal.input("\x03"); await tick(); }
		capture.mockRestore();
	}
}, 10_000);

test("execution heading belongs only to the execution page", async () => {
	const terminal = new MemoryTerminal();
	terminal.columns = 120; terminal.rows = 32;
	const snapshot = wwwFixture("working");
	const commands : unknown[] = [];
	const wb = {
		snapshot,
		subscribe(fn: WorkbenchListener) { fn(snapshot); return () => {}; },
		async dispatch(command: unknown) { commands.push(command); return { state: "accepted", commandId: "ok" }; },
		async close() {},
	} as unknown as ProjectWorkbench;
	let root: Component | undefined;

	const original = TuiAltScreen.prototype.setLayoutRoot;
	const capture  = spyOn(TuiAltScreen.prototype, "setLayoutRoot").mockImplementation(function(this: TuiAltScreen, component) { root = component; original.call(this, component); });
	const frame = () => {
		expect(root).toBeDefined();
		return renderLayoutFrame(root!, terminal.columns, terminal.rows, () => {}).lines.map(stripTerminalSequences).join("\n");
	};
	try {
		runProjectWorkbenchShell({ surface: "www", initialWwwPage: "usage", terminal, cwd: "/test/www", workbench: wb,
			usage: { async refresh() { return []; }, startPolling(fn) { fn([]); return () => {}; }, cacheMetrics: () => ({ entries: 0, hits: 0, misses: 0, evictions: 0, lastAccessedAt: null }) },
			auth: { methods: () => [], status: async provider => ({ state: "configured", provider, type: "oauth", source: "test" }), login: async () => { throw new Error("not requested"); }, logout: async () => {} },
		});
		await tick();
		expect(frame()).toContain("모델별 사용 내역");
		expect(frame()).not.toContain("⟦esc 중단⟧");
		terminal.input("\t"); terminal.input("\x1b"); await tick();
		const execution = frame();
		expect(execution).toContain("⟦esc 중단⟧");
		expect(execution.indexOf("⟦esc 중단⟧")).toBeLessThan(execution.indexOf("GPT-5.6-Sol"));
		terminal.input("\x1b"); await tick();
		expect(commands).toContainEqual({ type: "chat.cancel" });
	} finally {
		if (!terminal.stopped) { terminal.input("\x03"); terminal.input("\x03"); await tick(); }
		capture.mockRestore();
	}
});

import { expect, spyOn, test } from "bun:test";
import { TuiAltScreen, stripTerminalSequences, visibleWidth, type Component, type Terminal } from "@earendil-works/pi-tui";
import { getScrollViewBox, renderLayoutFrame } from "@earendil-works/pi-tui/dist/layout.js";
import type { ProjectWorkbench } from "../src/core/application/orchestration/project-workbench";
import type { WorkbenchCommand, WorkbenchCommandReceipt, WorkbenchListener } from "../src/core/domain/work/workbench";
import { runProjectWorkbenchShell } from "../src/adapters/inbound/tui/shell/workbench-shell";
import { runCli, type CliDependencies } from "../src/cli";
import { astraFixture } from "./fixtures/astra-snapshot";

class MemoryTerminal implements Terminal {
	columns = 80; rows = 24; kittyProtocolActive = false; output = ""; stopped = false;
	input: (data: string) => void = () => { throw new Error("terminal not started"); };
	resize: () => void = () => { throw new Error("terminal not started"); };
	start(input: (data: string) => void, resize: () => void): void { this.input = input; this.resize = resize; }
	stop(): void { this.stopped = true; }
	async drainInput(): Promise<void> { this.input = () => {}; }
	write(data: string): void { this.output += data; }
	moveBy(n: number): void { this.write(`\x1b[${Math.abs(n)}${n > 0 ? "B" : "A"}`); }
	hideCursor(): void { this.write("\x1b[?25l"); }
	showCursor(): void { this.write("\x1b[?25h"); }
	clearLine(): void { this.write("\x1b[2K"); }
	clearFromCursor(): void { this.write("\x1b[J"); }
	clearScreen(): void { this.write("\x1b[2J"); }
	setTitle(title: string): void { this.write(`\x1b]0;${title}\x07`); }
	setProgress(active: boolean): void { this.write(active ? "\x1b]9;4;3\x07" : "\x1b]9;4;0\x07"); }
}
const tick = () => new Promise(resolve => setTimeout(resolve, 40));

test("production Astra shell routes navigation, rejection, approval and shutdown through existing contracts", async () => {
	const terminal = new MemoryTerminal();
	const showOverlay = spyOn(TuiAltScreen.prototype, "showOverlay");
	let snapshot = astraFixture("ready"), listener: WorkbenchListener = () => {};
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
	runProjectWorkbenchShell({ design: "astra", terminal, cwd: "/test/astra", workbench: wb,
		usage: { async refresh() { return []; }, startPolling(fn) { fn([]); return () => {}; } },
		auth: { methods: () => [], status: async provider => ({ state: "configured", provider, type: "oauth", source: "test fixture" }), login: async () => { throw new Error("not requested"); }, logout: async () => {} },
		composerDraft: { initialText: "", save: async text => { saved = text; }, clear: async () => { saved = ""; } },
		releaseSessionLease: async () => { released = true; },
	});
	const submit = async (text: string) => { terminal.input(text); terminal.input("\r"); await tick(); };
	try {
		await tick(); expect(terminal.output).toContain("astra"); expect(terminal.output).toContain("WWW Dashboard"); expect(terminal.output).toContain("현재 Workbench snapshot");
		await submit("/todo"); expect(terminal.output).toContain("계획"); expect(commands).toHaveLength(0);
		terminal.input("\x1b"); await tick();
		const legacyNotesStart = terminal.output.length;
		await submit("/tnotes");
		expect(terminal.output.slice(legacyNotesStart)).toContain("실행 타임라인의 각 질문 뒤에 표시됩니다");
		expect(commands).toHaveLength(0);
		await submit("/stats"); expect(terminal.output).toContain("세션 검토");
		terminal.input("\x1b"); await tick();
		const testViewStart = terminal.output.length;
		await submit("/Test"); expect(terminal.output.slice(testViewStart)).toContain("질문별 Test");
		terminal.input("\x1b"); await tick();
		const navigationStart = terminal.output.length;
		terminal.input("\x07"); terminal.input("3"); await tick(); expect(terminal.output.slice(navigationStart)).toContain("실행 관측");
		terminal.input("1"); await tick();
		terminal.input("\x10"); await tick(); terminal.input("\x1b"); await tick();
		await submit("request 1"); expect(commands.at(-1)).toEqual({ type: "chat.send", text: "request 1" });
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
		expect(terminal.output.slice(loginStart)).toContain("Z.AI Coding API");
		terminal.input("\x1b"); await tick();
		terminal.rows = 24; terminal.resize(); await tick();
		terminal.input("abcdef"); terminal.input("\x01"); terminal.input("\x05"); terminal.input("Z"); terminal.input("\r"); await tick();
		expect(commands.at(-1)).toEqual({ type: "chat.send", text: "abcdefZ" });
		terminal.input("\x15");
		const completionStart = terminal.output.length;
		terminal.input("/mo"); terminal.input("\t"); await tick();
		expect(terminal.output.slice(completionStart)).toContain("→ model");
		terminal.input("\x1b"); terminal.input("\x15"); await tick();
		await submit("거절된 요청"); expect(commands.at(-1)).toEqual({ type: "chat.send", text: "거절된 요청" });
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

test("Astra CLI keeps resume selection, cancellation and execution-lane semantics", async () => {
	const opened: unknown[] = []; let select: string | null = "selected";
	const deps: CliDependencies = {
		runApp: async () => { throw new Error("wrong shell"); }, runAstra: async options => { opened.push(options); },
		runRouter: async () => { throw new Error("wrong shell"); }, runAuth: async () => {}, listSessions: async () => [],
		listNativeThreads: async () => [{ id: "selected", cwd: "/test", updatedAt: 1, preview: "", status: "idle" }],
		selectNativeThread: async () => select, writeOut: () => {}, writeError: () => {},
	};
	expect(await runCli(["astra"], deps)).toBe(0);
	expect(await runCli(["astra", "--resume"], deps)).toBe(0);
	expect(await runCli(["astra", "--resume", "specific"], deps)).toBe(0);
	expect(await runCli(["astra", "--execution-lane", "pi"], deps)).toBe(0);
	expect(opened).toEqual([{}, { resumeThreadId: "selected" }, { resumeThreadId: "specific" }, { executionLane: "pi" }]);
	select = null; expect(await runCli(["astra", "--resume"], deps)).toBe(0); expect(opened).toHaveLength(4);
	expect(await runCli(["astra", "garbage"], deps)).toBe(1); expect(opened).toHaveLength(4);
});

test("Mac Control+G navigation preserves drafts, routes every page, and leaves ordinary digits editable", async () => {
	const terminal = new MemoryTerminal(), commands: WorkbenchCommand[] = [];
	const snapshot = astraFixture("ready");
	const wb = { snapshot, subscribe(fn: WorkbenchListener) { fn(snapshot); return () => {}; }, async dispatch(command: WorkbenchCommand) { commands.push(command); return { state: "rejected", commandId: "r", reason: "test draft retained" }; }, async close() {} } as unknown as ProjectWorkbench;
	runProjectWorkbenchShell({ design: "astra", terminal, cwd: "/test/astra", workbench: wb,
		usage: { async refresh() { return []; }, startPolling(fn) { fn([]); return () => {}; } },
		auth: { methods: () => [], status: async provider => ({ state: "configured", provider, type: "oauth", source: "test" }), login: async () => { throw new Error("not requested"); }, logout: async () => {} },
	});
	try {
		await tick(); terminal.input("초안"); await tick();
		for (const [key, label] of [["2", "plan"], ["3", "실행 관측"], ["4", "세션 검토"], ["5", "세션 기록"], ["6", "개발"], ["7", "Context"], ["8", "질문별 Test"], ["1", "execution"]]) {
			terminal.input("\x07"); await tick(); expect(terminal.output).toContain("화면 이동");
			const start = terminal.output.length; terminal.input(key!); await tick(); expect(terminal.output.slice(start)).toContain(label!);
		}
		expect(commands).toHaveLength(0);
		terminal.input("\x07"); await tick(); terminal.input("\x1b"); await tick(); terminal.input("1"); terminal.input("\r"); await tick();
		expect(commands.at(-1)).toEqual({ type: "chat.send", text: "초안1" });
		terminal.input("\x15"); await tick();
		const start = terminal.output.length; terminal.input("\x1b[13~"); await tick(); expect(terminal.output.slice(start)).toContain("plan");
	} finally { terminal.input("\x03"); terminal.input("\x03"); await tick(); }
});

test("the production layout keeps autocomplete selections and multiline rails visible at 80x24", async () => {
	const terminal = new MemoryTerminal(), snapshot = astraFixture("ready");
	const usageSnapshots = [{ provider: "openai-codex" as const, state: "ready" as const, fetchedAt: 1, limits: [{ label: "7 days", remainingPercent: 62, status: "ok" as const }] }];
	snapshot.tnotes = [{ id: "layout-note", title: "Layout note", summary: "QUESTION_PREVIEW_SENTINEL", updatedAt: "2026-09-12T00:00:00Z", sourceActivityIds: [] }];
	const wb = { snapshot, subscribe(fn: WorkbenchListener) { fn(snapshot); return () => {}; }, async close() {} } as unknown as ProjectWorkbench;
	let root: Component | undefined;
	let transcriptWidth: number | undefined;
	const original = TuiAltScreen.prototype.setLayoutRoot;
	const capture = spyOn(TuiAltScreen.prototype, "setLayoutRoot").mockImplementation(function(this: TuiAltScreen, component) { root = component; original.call(this, component); });
	const frame = () => {
		expect(root).toBeDefined();
		const layout = renderLayoutFrame(root!, terminal.columns, terminal.rows, () => {});
		transcriptWidth = layout.primaryScrollView ? getScrollViewBox(layout, layout.primaryScrollView)?.rect.width : undefined;
		const rows = layout.lines;
		expect(rows).toHaveLength(terminal.rows); expect(rows.every(row => visibleWidth(row) <= terminal.columns)).toBe(true);
		return rows.map(stripTerminalSequences);
	};
	try {
		runProjectWorkbenchShell({ design: "astra", terminal, cwd: "/test/astra", workbench: wb,
			usage: { async refresh() { return usageSnapshots; }, startPolling(fn) { fn(usageSnapshots); return () => {}; } },
			auth: { methods: () => [], status: async provider => ({ state: "configured", provider, type: "oauth", source: "test" }), login: async () => { throw new Error("not requested"); }, logout: async () => {} },
		});
		await tick(); terminal.columns = 112; terminal.resize(); await tick();
		terminal.input("\x07"); terminal.input("1"); await tick();
		// T-notes belong to the execution stream even when the plan rail is hidden.
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
		expect(text).toContain("› 요청 입력"); expect(rows.at(-2)).toContain("A›"); expect(rows.at(-2)).toContain("ctx");
		expect(rows.at(-1)).toContain("구독 잔여"); expect(rows.at(-1)).toContain("Codex 7d 62%");
		expect(text).not.toContain("Enter 추가 지시");
		terminal.input("\x01"); terminal.input("\x0b"); terminal.input("/"); await tick();
		for (let i = 0; i < 50; i++) {
			const output = frame().join("\n");
			expect(output).toMatch(/→\s+\S/u); expect(output).toContain("A›");
			terminal.input("\x1b[B"); await tick();
		}
	} finally {
		if (!terminal.stopped) { terminal.input("\x03"); terminal.input("\x03"); await tick(); }
		capture.mockRestore();
	}
}, 10_000);

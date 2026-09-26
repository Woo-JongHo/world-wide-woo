import { describe, expect, test }                  from "bun:test";
import { TuiAltScreen }                            from "@earendil-works/pi-tui";
import type { Component, Terminal }                from "@earendil-works/pi-tui";
import { ProjectWorkbench }                        from "../src/core/application/orchestration/project-workbench";
import { LayerPerformanceRecorder }                from "../src/core/domain/observability/layer-performance";
import type {
	WorkbenchCommand,
	WorkbenchCommandReceipt,
	WorkbenchListener,
	WorkbenchSnapshot,
} from "../src/core/domain/work/workbench";
import { runProjectWorkbenchShell }                from "../src/adapters/inbound/tui/shell/workbench-shell";
import { ShellLifecycle }                          from "../src/adapters/inbound/tui/shell/shell-lifecycle";
import { wwwFixture }                              from "./fixtures/www-snapshot";
import { FakeNativeHarness, MemoryJournal, ready } from "./project-workbench.fixtures";

class CharacterizationTerminal implements Terminal {
	columns                                = 100                                                ;
	rows                                   = 30                                                 ;
	kittyProtocolActive                    = false                                              ;
	output                                 = ""                                                 ;
	writeCalls                             = 0                                                  ;
	stopped                                = false                                              ;
	failNextWrite                          = false                                              ;
	writeSequence : string[]               = []                                                 ;
	input         : (data: string) => void = () => { throw new Error("terminal not started"); } ;
	resize        : () => void             = () => { throw new Error("terminal not started"); } ;
	start           (input: (data: string) => void, resize: () => void): void { this.input = input; this.resize = resize; }
	stop            ()                                                 : void { this.stopped = true; }
	async drainInput()                                                 : Promise<void> { this.input = () => undefined; }
	write           (data: string                                     ): void {
		this.writeSequence.push("terminal.write:entered");
		this.writeCalls += 1;
		if (this.failNextWrite) {
			this.failNextWrite = false;
			throw new Error("terminal write failed");
		}
		this.output += data;
		this.writeSequence.push("terminal.write:return");
	}
	moveBy          ()                                                 : void {}
	hideCursor      ()                                                 : void {}
	showCursor      ()                                                 : void {}
	clearLine       ()                                                 : void {}
	clearFromCursor ()                                                 : void {}
	clearScreen     ()                                                 : void {}
	setTitle        ()                                                 : void {}
	setProgress     ()                                                 : void {}
}

interface ShellHarness {
	readonly terminal: CharacterizationTerminal;
	readonly commands: WorkbenchCommand[];
	readonly disposed: {
		readonly closed             : number            ;
		readonly unsubscribed       : number            ;
		readonly usagePolling       : number            ;
		readonly developmentPolling : number            ;
		readonly lease              : number            ;
		readonly savedDrafts        : readonly string[] ;
		readonly clearedDrafts      : number            ;
	};
	emit    (snapshot: WorkbenchSnapshot): void;
	submit  (text: string               ): Promise<void>;
	shutdown()                           : Promise<void>;
}

describe("runProjectWorkbenchShell characterization", () => {
	test("opens Chat directly without dismissing Dashboard", async () => {
		const shell = startShell(wwwFixture("ready"));
		try {
			await settle();
			expect(shell.terminal.output).not.toContain("WWW Dashboard");
			await shell.submit("바로 대화 시작");
			expect(shell.commands).toEqual([{ type: "chat.send", text: "바로 대화 시작", delivery: "queue" }]);
		} finally { await shell.shutdown(); }
	});

	test("dispatches one chat send for a ready composer submission", async () => {
		const shell = startShell(wwwFixture("ready"));
		try {
			await shell.submit("첫 요청");
			expect(shell.commands).toEqual([{ type: "chat.send", text: "첫 요청", delivery: "queue" }]);
		} finally { await shell.shutdown(); }
	});

	test("routes a working composer submission through the chat command queue", async () => {
		const shell = startShell(wwwFixture("working"));
		try {
			await shell.submit("현재 turn에 추가 지시");
			expect(shell.commands).toEqual([{ type: "chat.send", text: "현재 turn에 추가 지시", delivery: "queue" }]);
		} finally { await shell.shutdown(); }
	});

	test("does not replace a newer composer draft when an earlier submission is rejected late", async () => {
		const firstReceipt = deferred<WorkbenchCommandReceipt>();
		const shell = startShell(wwwFixture("ready"), async (_command, index) => index === 1
			? firstReceipt.promise
			: { state: "accepted", commandId: `command-${index}` });
		try {
			await shell.submit("먼저 제출한 요청");
			shell.terminal.input("나중에 작성한 초안");
			firstReceipt.resolve({ state: "rejected", commandId: "late-rejection", reason: "늦은 거절" });
			await settle();
			shell.terminal.input("\r");
			await settle();

			expect(shell.commands.at(-1)).toEqual({ type: "chat.send", text: "나중에 작성한 초안", delivery: "queue" });
		} finally { await shell.shutdown(); }
	});

	test("does not clear persisted draft state when a newer composer generation exists", async () => {
		const firstReceipt = deferred<WorkbenchCommandReceipt>();
		const shell = startShell(wwwFixture("ready"), async (_command, index) => index === 1
			? firstReceipt.promise
			: { state: "accepted", commandId: `command-${index}` });
		try {
			await shell.submit("먼저 제출한 요청");
			shell.terminal.input("새 초안");
			firstReceipt.resolve({ state: "accepted", commandId: "late-acceptance" });
			await settle();

			expect(shell.disposed.clearedDrafts).toBe(0);
		} finally { await shell.shutdown(); }
	});

	test("keeps Escape non-decisive and dispatches an approval exactly once", async () => {
		const pending = {
			...wwwFixture("ready"),
			pendingApproval: {
				requestId          : 91,
				callbackId         : null,
				kind               : "command" as const,
				refs               : {},
				availableDecisions : ["accept", "decline"] as const,
				params             : { command: "bun test" },
			},
		};
		const shell = startShell(pending);
		try {
			shell.terminal.input("\x1b");
			await settle();
			expect(shell.commands).toEqual([]);

			await shell.submit("/approval");
			shell.terminal.input("\r");
			await settle();
			expect(shell.commands).toEqual([{
				type: "approval.resolve",
				requestId: 91,
				response: { decision: "accept" },
			}]);
		} finally { await shell.shutdown(); }
	});

	test("dispatches one cancellation for Escape while working", async () => {
		const shell = startShell(wwwFixture("working"));
		try {
			await settle();
			shell.terminal.input("\x1b");
			await settle();
			expect(shell.commands).toEqual([{ type: "chat.cancel" }]);
		} finally { await shell.shutdown(); }
	});

	test("resumes a workflow without creating a new chat send", async () => {
		const shell = startShell(wwwFixture("ready"));
		try {
			await shell.submit("/workflow resume run-17");
			expect(shell.commands).toEqual([{ type: "workflow.resume", runId: "run-17" }]);
			expect(shell.commands.filter(command => command.type === "chat.send")).toHaveLength(0);
		} finally { await shell.shutdown(); }
	});

	test("disposes shell-owned resources during shutdown", async () => {
		const shell = startShell(wwwFixture("ready"));
		await shell.submit("/map");
		expect(shell.disposed.developmentPolling).toBe(0);

		await shell.shutdown();

		expect(shell.disposed).toEqual({
			closed             : 1,
			unsubscribed       : 1,
			usagePolling       : 1,
			developmentPolling : 1,
			lease              : 1,
			savedDrafts        : [""],
			clearedDrafts      : 0,
		});
		expect(shell.terminal.stopped).toBe(true);
	});

	test("releases shell resources once in the established shutdown order", async () => {
		const events: string[] = [];
		const lifecycle = new ShellLifecycle({
			cancelPrompt    : () => events.push("prompt"),
			dismissOverlay  : () => events.push("overlay"),
			announceClosing : () => events.push("notice"),
			unsubscribe     : () => events.push("subscription"),
			stopPolling     : [() => events.push("usage"), () => events.push("development")],
			timers          : [],
			disposables: [
				{ dispose : () => events.push("renders")   },
				{ dispose : () => events.push("telemetry") },
				{ dispose : () => events.push("chat")      },
			],
			saveDraft           : async () => { events.push("draft"); },
			closeWorkbench      : async () => { events.push("workbench"); },
			releaseSessionLease : async () => { events.push("lease"); },
			stopTerminal        : () => events.push("terminal"),
		});

		await Promise.all([lifecycle.shutdown(), lifecycle.shutdown()]);

		expect(lifecycle.isShuttingDown).toBe(true);
		expect(events).toEqual([
			"prompt", "overlay", "notice", "subscription", "usage", "development",
			"renders", "telemetry", "chat", "draft", "workbench", "lease", "terminal",
		]);
	});

	test("connects one visible Native event through all seven layers until Terminal.write returns", async () => {
		expect(typeof TuiAltScreen.prototype.setRenderObserver).toBe("function");
		const native    = new FakeNativeHarness()                                                  ;
		const workbench = new ProjectWorkbench(native, new MemoryJournal(), { projectId: "p", cwd: "/p" }) ;
		await ready(workbench);
		const shell = startObservedShell(workbench);
		try {
			await settle();
			native.emit({
				type   : "notification",
				method : "item/agentMessage/delta",
				refs   : { threadId: "thread-1", turnId: "turn-visible", itemId: "answer-visible" },
				params : { delta: "화면에 표시" },
			});
			await waitFor(() => workbench.performanceTrace("turn-visible:event-1")?.state === "complete");

			const trace = workbench.performanceTrace("turn-visible:event-1");
			expect(trace?.state).toBe("complete");
			expect(trace?.layers.map(layer => layer.layerId)).toEqual([
				"native-receive", "event-queue", "state-projection", "snapshot-publish",
				"render-schedule", "layout-materialize", "terminal-write",
			]);
			expect(trace?.layers.every(layer => layer.workMs !== null)).toBe(true);
			expect(trace?.layers.at(-1)?.frameId).toMatch(/^terminal-frame-/u);
		} finally { await shell.shutdown(); }
	});

	test("observes terminal-write completed only after the synchronous Terminal.write implementation returns", async () => {
		const native          = new FakeNativeHarness()                                                          ;
		const workbench       = new ProjectWorkbench(native, new MemoryJournal(), { projectId: "p", cwd: "/p" }) ;
		const originalObserve = workbench.observeLayerPerformance.bind(workbench)                                ;
		await ready(workbench);
		const shell = startObservedShell(workbench);
		workbench.observeLayerPerformance = (traceId, layerId, boundary, atMs, frameId) => {
			originalObserve(traceId, layerId, boundary, atMs, frameId);
			if (layerId === "terminal-write" && boundary === "completed") shell.terminal.writeSequence.push("observer:terminal-write:completed");
		};
		try {
			shell.terminal.writeSequence.length = 0;
			native.emit({
				type   : "notification",
				method : "item/agentMessage/delta",
				refs   : { threadId: "thread-1", turnId: "turn-write-order", itemId: "answer-write-order" },
				params : { delta: "순서 확인" },
			});
			await waitFor(() => shell.terminal.writeSequence.includes("observer:terminal-write:completed"));

			expect(shell.terminal.writeSequence.slice(-2)).toEqual([
				"terminal.write:return",
				"observer:terminal-write:completed",
			]);
		} finally { await shell.shutdown(); }
	});

	test("links every coalesced Native delta to the same terminal frame", async () => {
		const native    = new FakeNativeHarness()                                                  ;
		const workbench = new ProjectWorkbench(native, new MemoryJournal(), { projectId: "p", cwd: "/p" }) ;
		await ready(workbench);
		const shell = startObservedShell(workbench);
		try {
			await settle();
			native.emit({ type: "notification", method: "turn/started", refs: { threadId: "thread-1", turnId: "turn-burst" }, params: {} });
			await settle();
			native.emit({ type: "notification", method: "item/reasoning/delta", refs: { threadId: "thread-1", turnId: "turn-burst", itemId: "reasoning-burst" }, params: { delta: "A" } });
			native.emit({ type: "notification", method: "item/reasoning/delta", refs: { threadId: "thread-1", turnId: "turn-burst", itemId: "reasoning-burst" }, params: { delta: "B" } });
			await waitFor(() => workbench.performanceTrace("turn-burst:event-2")?.state === "complete"
				&& workbench.performanceTrace("turn-burst:event-3")?.state === "complete");

			const first       = workbench.performanceTrace("turn-burst:event-2") ;
			const second      = workbench.performanceTrace("turn-burst:event-3") ;
			const firstFrame  = first?.layers.at(-1)?.frameId                    ;
			const secondFrame = second?.layers.at(-1)?.frameId                   ;
			expect(first?.state).toBe("complete");
			expect(second?.state).toBe("complete");
			expect(firstFrame).toMatch(/^terminal-frame-/u);
			expect(secondFrame).toBe(firstFrame);
		} finally { await shell.shutdown(); }
	});

	test("marks an ignored duplicate event as no-render instead of missing instrumentation", async () => {
		const native    = new FakeNativeHarness()                                                  ;
		const workbench = new ProjectWorkbench(native, new MemoryJournal(), { projectId: "p", cwd: "/p" }) ;
		await ready(workbench);
		const shell = startObservedShell(workbench);
		const completed = {
			type   : "notification" as const,
			method : "item/completed",
			refs   : { threadId: "thread-1", turnId: "turn-ignored", itemId: "answer-ignored" },
			params : { item: { id: "answer-ignored", type: "agentMessage", text: "완료" } },
		};
		try {
			await settle();
			native.emit(completed);
			await waitFor(() => workbench.performanceTrace("turn-ignored:event-1")?.state === "complete");
			native.emit(completed);
			await waitFor(() => workbench.performanceTrace("turn-ignored:event-2")?.state === "no-render");

			const trace = workbench.performanceTrace("turn-ignored:event-2");
			expect(trace?.state).toBe("no-render");
			expect(trace?.layers.find(layer => layer.layerId === "terminal-write")?.frameId).toBeNull();
		} finally { await shell.shutdown(); }
	});

	test("records real TUI layout and terminal write exceptions on their owning failed layers", () => {
		const layoutTerminal = new CharacterizationTerminal()          ;
		const layoutTui      = new TuiAltScreen(layoutTerminal, false) ;
		const layoutRecorder = new LayerPerformanceRecorder()          ;
		const brokenLayout: Component = {
			render     : () => { throw new Error("layout failed"); },
			invalidate : () => undefined,
		};
		layoutTui.setLayoutRoot(brokenLayout);
		layoutTui.setRenderObserver((phase, boundary) => {
			layoutRecorder.observe({ traceId: "layout-failure", layerId: phase, boundary, atMs: performance.now(), frameId: "frame-layout" });
		});
		try {
			layoutTui.start();
			expect(() => layoutTui.renderNow()).toThrow("layout failed");
		} finally {
			layoutTui.setLayoutRoot({ render: () => [], invalidate: () => undefined });
			layoutTui.stop();
		}

		const writeTerminal = new CharacterizationTerminal()         ;
		const writeTui      = new TuiAltScreen(writeTerminal, false) ;
		const writeRecorder = new LayerPerformanceRecorder()         ;
		const stableLayout: Component = {
			render     : () => ["stable"],
			invalidate : () => undefined,
		};
		writeTui.setLayoutRoot(stableLayout);
		writeTui.setRenderObserver((phase, boundary) => {
			writeRecorder.observe({ traceId: "write-failure", layerId: phase, boundary, atMs: performance.now(), frameId: "frame-write" });
		});
		try {
			writeTui.start();
			writeTerminal.failNextWrite = true;
			expect(() => writeTui.renderNow()).toThrow("terminal write failed");
		} finally { writeTui.stop(); }

		const layout = layoutRecorder.project("layout-failure")!;
		const write  = writeRecorder.project("write-failure")!  ;
		expect(layout.layers.find(layer => layer.layerId === "layout-materialize")?.failed).toBe(true);
		expect(layout.layers.find(layer => layer.layerId === "terminal-write")?.failed).toBe(false);
		expect(write.layers.find(layer => layer.layerId === "layout-materialize")?.failed).toBe(false);
		expect(write.layers.find(layer => layer.layerId === "terminal-write")?.failed).toBe(true);
	});
});

function startObservedShell(workbench: ProjectWorkbench): { readonly terminal: CharacterizationTerminal; shutdown(): Promise<void> } {
	const terminal = new CharacterizationTerminal();
	runProjectWorkbenchShell({
		terminal,
		cwd: "/test/layer-performance",
		workbench,
		renderIntervalMs: 100,
		usage: {
			async refresh() { return []; },
			startPolling(next) { next([]); return () => undefined; },
			cacheMetrics: () => ({ entries: 0, hits: 0, misses: 0, evictions: 0, lastAccessedAt: null }),
		},
		auth: {
			methods : () => [],
			status  : async provider => ({ state: "configured", provider, type: "oauth", source: "test" }),
			login   : async () => { throw new Error("not requested"); },
			logout  : async () => undefined,
		},
	});
	return {
		terminal,
		async shutdown() {
			if (!terminal.stopped) {
				terminal.input("\x03");
				terminal.input("\x03");
				await settle();
			}
		},
	};
}

function startShell(
	initial: WorkbenchSnapshot,
	dispatchReceipt?: (command: WorkbenchCommand, index: number) => Promise<WorkbenchCommandReceipt>,
): ShellHarness {
	const terminal                         = new CharacterizationTerminal() ;
	const commands    : WorkbenchCommand[] = []                             ;
	let snapshot                           = initial                        ;
	let listener      : WorkbenchListener  = () => undefined                ;
	let closed                             = 0                              ;
	let unsubscribed                       = 0                              ;
	let usagePolling                       = 0                              ;
	let developmentPolling                 = 0                              ;
	let lease                              = 0                              ;
	let clearedDrafts                      = 0                              ;
	const savedDrafts : string[]           = []                             ;
	const workbench = {
		get snapshot() { return snapshot; },
		subscribe(next: WorkbenchListener) {
			listener = next;
			next(snapshot);
			return () => { unsubscribed += 1; listener = () => undefined; };
		},
		async dispatch(command: WorkbenchCommand): Promise<WorkbenchCommandReceipt> {
			commands.push(command);
			if (command.type === "approval.resolve") {
				snapshot = { ...snapshot, pendingApproval: null, revision: snapshot.revision + 1 };
				listener(snapshot);
			}
			if (dispatchReceipt) return dispatchReceipt(command, commands.length);
			return { state: "accepted", commandId: `command-${commands.length}` };
		},
		async close() { closed += 1; },
	} as unknown as ProjectWorkbench;

	runProjectWorkbenchShell({
		surface: "www",
		terminal,
		cwd: "/test/tui-characterization",
		workbench,
		usage: {
			async refresh() { return []; },
			startPolling(next) { next([]); return () => { usagePolling += 1; }; },
			cacheMetrics: () => ({ entries: 0, hits: 0, misses: 0, evictions: 0, lastAccessedAt: null }),
		},
		auth: {
			methods : () => [],
			status  : async provider => ({ state: "configured", provider, type: "oauth", source: "test" }),
			login   : async () => { throw new Error("not requested"); },
			logout  : async () => undefined,
		},
		developmentMapSource: {
			startPolling() { return () => { developmentPolling += 1; }; },
		},
		composerDraft: {
			initialText : "",
			save        : async text => { savedDrafts.push(text); },
			clear       : async () => { clearedDrafts += 1; },
		},
		releaseSessionLease: async () => { lease += 1; },
	});

	return {
		terminal,
		commands,
		get disposed() { return { closed, unsubscribed, usagePolling, developmentPolling, lease, savedDrafts, clearedDrafts }; },
		emit(next) { snapshot = next; listener(next); },
		async submit(text) { terminal.input(text); terminal.input("\r"); await settle(); },
		async shutdown() {
			if (!terminal.stopped) {
				terminal.input("\x03");
				terminal.input("\x03");
				await settle();
			}
		},
	};
}

async function settle(): Promise<void> {
	await Bun.sleep(30);
}

async function waitFor(predicate: () => boolean, timeoutMs = 2_000): Promise<void> {
	const deadline = performance.now() + timeoutMs;
	while (!predicate()) {
		if (performance.now() >= deadline) throw new Error(`Timed out after ${timeoutMs}ms waiting for TUI observation.`);
		await Bun.sleep(5);
	}
}

function deferred<T>(): { readonly promise: Promise<T>; readonly resolve: (value: T) => void } {
	let settle = (_value: T): void => { throw new Error("Deferred promise was not initialized."); };
	const promise = new Promise<T>((resolve) => { settle = resolve; });
	return { promise, resolve: settle };
}

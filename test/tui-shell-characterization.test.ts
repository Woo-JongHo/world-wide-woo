import { describe, expect, test } from "bun:test";
import type { Terminal } from "@earendil-works/pi-tui";
import type { ProjectWorkbench } from "../src/core/application/orchestration/project-workbench";
import type { WorkbenchCommand, WorkbenchCommandReceipt, WorkbenchListener, WorkbenchSnapshot } from "../src/core/domain/work/workbench";
import { runProjectWorkbenchShell } from "../src/adapters/inbound/tui/shell/workbench-shell";
import { ShellLifecycle } from "../src/adapters/inbound/tui/shell/shell-lifecycle";
import { astraFixture } from "./fixtures/astra-snapshot";

class CharacterizationTerminal implements Terminal {
	columns = 100;
	rows = 30;
	kittyProtocolActive = false;
	output = "";
	stopped = false;
	input: (data: string) => void = () => { throw new Error("terminal not started"); };
	resize: () => void = () => { throw new Error("terminal not started"); };
	start(input: (data: string) => void, resize: () => void): void { this.input = input; this.resize = resize; }
	stop(): void { this.stopped = true; }
	async drainInput(): Promise<void> { this.input = () => undefined; }
	write(data: string): void { this.output += data; }
	moveBy(): void {}
	hideCursor(): void {}
	showCursor(): void {}
	clearLine(): void {}
	clearFromCursor(): void {}
	clearScreen(): void {}
	setTitle(): void {}
	setProgress(): void {}
}

interface ShellHarness {
	readonly terminal: CharacterizationTerminal;
	readonly commands: WorkbenchCommand[];
	readonly disposed: {
		readonly closed: number;
		readonly unsubscribed: number;
		readonly usagePolling: number;
		readonly developmentPolling: number;
		readonly lease: number;
		readonly savedDrafts: readonly string[];
	};
	emit(snapshot: WorkbenchSnapshot): void;
	submit(text: string): Promise<void>;
	shutdown(): Promise<void>;
}

describe("runProjectWorkbenchShell characterization", () => {
	test("opens Chat directly without dismissing Dashboard", async () => {
		const shell = startShell(astraFixture("ready"));
		try {
			await settle();
			expect(shell.terminal.output).not.toContain("WWW Dashboard");
			await shell.submit("바로 대화 시작");
			expect(shell.commands).toEqual([{ type: "chat.send", text: "바로 대화 시작", delivery: "queue" }]);
		} finally { await shell.shutdown(); }
	});

	test("dispatches one chat send for a ready composer submission", async () => {
		const shell = startShell(astraFixture("ready"));
		try {
			await shell.submit("첫 요청");
			expect(shell.commands).toEqual([{ type: "chat.send", text: "첫 요청", delivery: "queue" }]);
		} finally { await shell.shutdown(); }
	});

	test("routes a working composer submission through the chat command queue", async () => {
		const shell = startShell(astraFixture("working"));
		try {
			await shell.submit("현재 turn에 추가 지시");
			expect(shell.commands).toEqual([{ type: "chat.send", text: "현재 turn에 추가 지시", delivery: "queue" }]);
		} finally { await shell.shutdown(); }
	});

	test("keeps Escape non-decisive and dispatches an approval exactly once", async () => {
		const pending = {
			...astraFixture("ready"),
			pendingApproval: {
				requestId: 91,
				callbackId: null,
				kind: "command" as const,
				refs: {},
				availableDecisions: ["accept", "decline"] as const,
				params: { command: "bun test" },
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
		const shell = startShell(astraFixture("working"));
		try {
			await settle();
			shell.terminal.input("\x1b");
			await settle();
			expect(shell.commands).toEqual([{ type: "chat.cancel" }]);
		} finally { await shell.shutdown(); }
	});

	test("resumes a workflow without creating a new chat send", async () => {
		const shell = startShell(astraFixture("ready"));
		try {
			await shell.submit("/workflow resume run-17");
			expect(shell.commands).toEqual([{ type: "workflow.resume", runId: "run-17" }]);
			expect(shell.commands.filter(command => command.type === "chat.send")).toHaveLength(0);
		} finally { await shell.shutdown(); }
	});

	test("disposes shell-owned resources during shutdown", async () => {
		const shell = startShell(astraFixture("ready"));
		await shell.submit("/map");
		expect(shell.disposed.developmentPolling).toBe(0);

		await shell.shutdown();

		expect(shell.disposed).toEqual({
			closed: 1,
			unsubscribed: 1,
			usagePolling: 1,
			developmentPolling: 1,
			lease: 1,
			savedDrafts: [""],
		});
		expect(shell.terminal.stopped).toBe(true);
	});

	test("releases shell resources once in the established shutdown order", async () => {
		const events: string[] = [];
		const lifecycle = new ShellLifecycle({
			cancelPrompt: () => events.push("prompt"),
			dismissOverlay: () => events.push("overlay"),
			announceClosing: () => events.push("notice"),
			unsubscribe: () => events.push("subscription"),
			stopPolling: [() => events.push("usage"), () => events.push("development")],
			timers: [],
			disposables: [
				{ dispose: () => events.push("renders") },
				{ dispose: () => events.push("telemetry") },
				{ dispose: () => events.push("chat") },
			],
			saveDraft: async () => { events.push("draft"); },
			closeWorkbench: async () => { events.push("workbench"); },
			releaseSessionLease: async () => { events.push("lease"); },
			stopTerminal: () => events.push("terminal"),
		});

		await Promise.all([lifecycle.shutdown(), lifecycle.shutdown()]);

		expect(lifecycle.isShuttingDown).toBe(true);
		expect(events).toEqual([
			"prompt", "overlay", "notice", "subscription", "usage", "development",
			"renders", "telemetry", "chat", "draft", "workbench", "lease", "terminal",
		]);
	});
});

function startShell(initial: WorkbenchSnapshot): ShellHarness {
	const terminal = new CharacterizationTerminal();
	const commands: WorkbenchCommand[] = [];
	let snapshot = initial;
	let listener: WorkbenchListener = () => undefined;
	let closed = 0;
	let unsubscribed = 0;
	let usagePolling = 0;
	let developmentPolling = 0;
	let lease = 0;
	const savedDrafts: string[] = [];
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
			return { state: "accepted", commandId: `command-${commands.length}` };
		},
		async close() { closed += 1; },
	} as unknown as ProjectWorkbench;

	runProjectWorkbenchShell({
		design: "astra",
		terminal,
		cwd: "/test/tui-characterization",
		workbench,
		usage: {
			async refresh() { return []; },
			startPolling(next) { next([]); return () => { usagePolling += 1; }; },
			cacheMetrics: () => ({ entries: 0, hits: 0, misses: 0, evictions: 0, lastAccessedAt: null }),
		},
		auth: {
			methods: () => [],
			status: async provider => ({ state: "configured", provider, type: "oauth", source: "test" }),
			login: async () => { throw new Error("not requested"); },
			logout: async () => undefined,
		},
		developmentMapSource: {
			startPolling() { return () => { developmentPolling += 1; }; },
		},
		composerDraft: {
			initialText: "",
			save: async text => { savedDrafts.push(text); },
			clear: async () => undefined,
		},
		releaseSessionLease: async () => { lease += 1; },
	});

	return {
		terminal,
		commands,
		get disposed() { return { closed, unsubscribed, usagePolling, developmentPolling, lease, savedDrafts }; },
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

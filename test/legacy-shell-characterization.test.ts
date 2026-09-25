import { describe, expect, test }    from "bun:test";
import type { Terminal }             from "@earendil-works/pi-tui";
import type { SessionSnapshot }      from "../src/core/application/session/session-runtime";
import { runTuiShell }               from "../src/adapters/inbound/tui/legacy/legacy-session-shell";
import type { TuiShellDependencies } from "../src/adapters/inbound/tui/legacy/legacy-session-shell";

class MemoryTerminal implements Terminal {
	columns                         = 80                                                 ;
	rows                            = 24                                                 ;
	kittyProtocolActive             = false                                              ;
	output                          = ""                                                 ;
	stopped                         = false                                              ;
	input  : (data: string) => void = () => { throw new Error("terminal not started"); } ;
	resize : () => void             = () => { throw new Error("terminal not started"); } ;

	constructor(private readonly onStop: () => void = () => {}) {}

	start(input: (data: string) => void, resize: () => void): void {
		this.input = input;
		this.resize = resize;
	}

	stop(): void {
		this.stopped = true;
		this.onStop();
	}

	async drainInput()                                                                                 : Promise<void> { this.input = () => {}; }
	write           (data: string                                 )                                    : void { this.output += data; }
	moveBy          (n: number                                    )                                    : void { this.write(`\x1b[${Math.abs(n)}${n > 0 ? "B" : "A"}`); }
	hideCursor      ()                                                                                 : void { this.write("\x1b[?25l"); }
	showCursor      ()                                                                                 : void { this.write("\x1b[?25h"); }
	clearLine       ()                                                                                 : void { this.write("\x1b[2K"); }
	clearFromCursor ()                                                                                 : void { this.write("\x1b[J"); }
	clearScreen     ()                                                                                 : void { this.write("\x1b[2J"); }
	setTitle        (title: string                                )                                    : void { this.write(`\x1b]0;${title}\x07`); }
	setProgress     (active: boolean                              )                                    : void { this.write(active ? "\x1b]9;4;3\x07" : "\x1b]9;4;0\x07"); }
}

const readySnapshot: SessionSnapshot = {
	id          : "legacy-session",
	phase       : "ready",
	turns       : [],
	draft       : "",
	error       : null,
	auth        : { configured: true, source: "fixture" },
	settings    : { provider: "openai-codex", model: "gpt-5.6-terra", effort: "high" },
	cwd         : "/test/legacy",
	projectName : "legacy fixture",
	projectRoot : "/test/legacy",
	activity    : null,
	tools       : [],
	narrations  : [],
};

function shellFixture(snapshot: SessionSnapshot = readySnapshot) {
	const events: string[] = []                                                     ;
	let aborts             = 0                                                      ;
	const terminal         = new MemoryTerminal(() => events.push("terminal.stop")) ;
	const runtime = {
		id: snapshot.id,
		get snapshot() { return snapshot; },
		subscribe(listener: (next: SessionSnapshot) => void) {
			listener(snapshot);
			return () => {};
		},
		abort() { aborts += 1; return true; },
		async close() { events.push("runtime.close"); },
		async refreshAuth() {},
		async submit() {},
		async runTerminalCommand() {},
		updatePlanning() {},
	};
	const dependencies = {
		terminal,
		runtime,
		auth: {
			methods : () => [],
			status  : async (provider: string) => ({ state: "configured", provider, type: "oauth", source: "fixture" }),
			login   : async () => { throw new Error("not requested"); },
			logout  : async () => {},
		},
		usage: {
			async refresh() { return []; },
			startPolling(listener: (snapshots: readonly never[]) => void) { listener([]); return () => {}; },
		},
		routerSettings: {
			async update() {},
			async flush() { events.push("settings.flush"); },
		},
		repository: {
			async snapshot() { throw new Error("not requested"); },
			async recentCommits() { return []; },
			async issues() { return []; },
		},
		composerDraft: {
			initialText: "",
			async save(text: string) { events.push(`draft.save:${text}`); },
			async clear() {},
		},
		async releaseSessionLease() { events.push("lease.release"); },
		todos: {
			snapshot: null,
			subscribe(listener: (value: null) => void) { listener(null); return () => {}; },
		},
		monitor: { dispose() {} },
		planning: { current: null },
	} as unknown as TuiShellDependencies;
	return { dependencies, events, terminal, aborts: () => aborts };
}

async function waitFor(predicate: () => boolean): Promise<void> {
	for (let attempt = 0; attempt < 50; attempt += 1) {
		if (predicate()) return;
		await new Promise(resolve => setTimeout(resolve, 10));
	}
	throw new Error("legacy shell did not settle");
}

describe("legacy shell characterization", () => {
	test("Escape aborts an active stream without stopping the shell", async () => {
		const fixture = shellFixture({
			...readySnapshot,
			phase: "streaming",
			activity: { kind: "responding", label: "응답 중" },
		});
		runTuiShell(fixture.dependencies);

		fixture.terminal.input("\x1b");
		expect(fixture.aborts()).toBe(1);
		expect(fixture.terminal.stopped).toBe(false);

		fixture.terminal.input("\x04");
		await waitFor(() => fixture.terminal.stopped);
	});

	for (const [label, exit] of [
		["empty Ctrl+D", (terminal: MemoryTerminal) => terminal.input("\x04")],
		["/exit", (terminal: MemoryTerminal) => { terminal.input("/exit"); terminal.input("\r"); }],
	] as const) {
		test(`${label} saves and closes legacy resources in order`, async () => {
			const fixture = shellFixture();
			runTuiShell(fixture.dependencies);

			exit(fixture.terminal);
			await waitFor(() => fixture.terminal.stopped);

			expect(fixture.events).toEqual([
				"draft.save:",
				"settings.flush",
				"runtime.close",
				"lease.release",
				"terminal.stop",
			]);
		});
	}
});

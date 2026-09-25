import { describe, expect, test }                            from "bun:test";
import type { RunAppOptions }                                from "../src/app";
import { runCli, writeAstraBootstrap, writeRouterBootstrap } from "../src/cli";
import type { CliDependencies }                              from "../src/cli";
import type { NativeThreadSummary }                          from "../src/core/domain/execution/native-session";

const threads: readonly NativeThreadSummary[] = [{
	id: "thread-2",
	updatedAt: 1_788_000_200,
	cwd: "/workspace/sample",
	preview: "두 번째 작업",
	status: "idle",
}, {
	id: "thread-1",
	updatedAt: 1_788_000_100,
	cwd: "/workspace/sample",
	preview: "첫 번째 작업",
	status: "idle",
}];

function fakeDependencies() {
	const calls = {
		app    : [] as RunAppOptions[],
		astra  : [] as RunAppOptions[],
		router : [] as Array<{ resumeSessionId?: string }>,
		listed : 0,
		picked : [] as Array<readonly NativeThreadSummary[]>,
		out    : [] as string[],
		error  : [] as string[],
	};
	const dependencies: CliDependencies = {
		runApp             : async (options = {}) => { calls.app.push(options); },
		runAstra           : async (options = {}) => { calls.astra.push(options); },
		runRouter          : async (options = {}) => { calls.router.push(options); },
		runAuth            : async () => undefined,
		runDevelopment     : async () => "",
		runWorkflow        : async () => "",
		listSessions       : async () => [],
		listNativeThreads  : async () => { calls.listed += 1; return threads; },
		selectNativeThread : async items => { calls.picked.push(items); return items[1]?.id ?? null; },
		writeOut           : (value) => { calls.out.push(value); },
		writeError         : (value) => { calls.error.push(value); },
	};
	return { calls, dependencies };
}

describe("WWW CLI session entry", () => {
	test("www astra keeps explicit Runtime scope and resume compatibility", async () => {
		const { calls, dependencies } = fakeDependencies();
		expect(await runCli(["astra", "--runtime-config", "runtime.json", "--resume", "thread-2"], dependencies)).toBe(0);
		expect(calls.astra).toEqual([{ runtimeConfig: "runtime.json", resumeThreadId: "thread-2" }]);
		expect(await runCli(["astra", "--runtime-config"], dependencies)).toBe(1);
		expect(await runCli(["astra", "--runtime-config", "one.json", "--runtime-config", "two.json"], dependencies)).toBe(1);
		expect(calls.astra).toHaveLength(1);
	});
	test("paints and clears a www loading bar before production modules load", async () => {
		const writes: string[] = [];
		const stop = writeAstraBootstrap(value => writes.push(value), true);
		try {
			expect(writes).toEqual(["\r\x1b[2Kwww v0.0.19 [███░░░░░░░░░░░░]"]);
			await new Promise(resolve => setTimeout(resolve, 180));
			expect(writes.length).toBeGreaterThan(1);
			expect(writes[1]).not.toBe(writes[0]);
		} finally {
			stop();
		}
		expect(writes.at(-1)).toBe("\r\x1b[2K");
		const count = writes.length;
		await new Promise(resolve => setTimeout(resolve, 120));
		expect(writes).toHaveLength(count);
		writeAstraBootstrap(value => writes.push(value), false)();
		expect(writes).toHaveLength(count);
	});

	test("paints a distinct bootstrap for the explicit multi-provider Router", () => {
		const writes: string[] = [];
		writeRouterBootstrap(value => writes.push(value), true);
		expect(writes).toEqual(["\r\x1b[2K🐙 Wooni · 호환 Multi-provider Router를 여는 중…\n"]);
		writeRouterBootstrap(value => writes.push(value), false);
		expect(writes).toHaveLength(1);
	});

	test("reports the package release version", async () => {
		const { calls, dependencies } = fakeDependencies();
		expect(await runCli(["--version"], dependencies)).toBe(0);
		expect(calls.out).toEqual(["0.0.19"]);
		expect(calls.app).toEqual([]);
	});

	test("documents the compatibility Router command and its Native feature boundary", async () => {
		const { calls, dependencies } = fakeDependencies();
		expect(await runCli(["--help"], dependencies)).toBe(0);
		expect(calls.out[0]).toContain("www router");
		expect(calls.out[0]).toContain("Native 승인·Sandbox·Skill은 제공하지 않음");
		expect(calls.out[0]).toContain("Claude·Gemini·OpenAI·Z.AI 모델 변경");
	});

	test("keeps help ahead of version and command dispatch", async () => {
		const { calls, dependencies } = fakeDependencies();
		expect(await runCli(["router", "--version", "--help"], dependencies)).toBe(0);
		expect(calls.out).toHaveLength(1);
		expect(calls.out[0]).toStartWith("사용법:");
		expect(calls.router).toEqual([]);
	});

	test("opens the Astra console for plain www without listing or resuming", async () => {
		const { calls, dependencies } = fakeDependencies();
		expect(await runCli([], dependencies)).toBe(0);
		expect(calls.astra).toEqual([{}]);
		expect(calls.app).toEqual([]);
		expect(calls.listed).toBe(0);
		expect(calls.picked).toEqual([]);
	});

	test("invokes the Astra dependency with its receiver", async () => {
		const { dependencies } = fakeDependencies();
		let receiver: unknown;
		dependencies.runAstra = async function () { receiver = this; };
		expect(await runCli([], dependencies)).toBe(0);
		expect(receiver).toBe(dependencies);
	});

	test("opens the experimental embedded Pi lane inside Astra", async () => {
		const { calls, dependencies } = fakeDependencies();
		expect(await runCli(["--execution-lane", "pi"], dependencies)).toBe(0);
		expect(calls.astra).toEqual([{ executionLane: "pi" }]);
	});

	test("accepts an explicit Codex lane inside Astra", async () => {
		const { calls, dependencies } = fakeDependencies();
		expect(await runCli(["--execution-lane", "codex"], dependencies)).toBe(0);
		expect(calls.astra).toEqual([{ executionLane: "codex" }]);
	});

	test("opens an explicit multi-provider Router session without changing the native default", async () => {
		const { calls, dependencies } = fakeDependencies();
		expect(await runCli(["router"], dependencies)).toBe(0);
		expect(calls.router).toEqual([{}]);
		expect(calls.app).toEqual([]);
	});

	test("resumes an explicit legacy Router session id", async () => {
		const { calls, dependencies } = fakeDependencies();
		expect(await runCli(["router", "--resume", "legacy-session"], dependencies)).toBe(0);
		expect(calls.router).toEqual([{ resumeSessionId: "legacy-session" }]);
		expect(calls.app).toEqual([]);
	});

	test("rejects malformed Router commands and session ids", async () => {
		const { calls, dependencies } = fakeDependencies();
		for (const args of [
			["router", "--resume"],
			["router", "unexpected"],
			["router", "--resume", "session", "extra"],
			["router", "--resume", "--resume"],
			["router", "--resume", "../outside"],
		]) expect(await runCli(args, dependencies)).toBe(1);
		expect(calls.router).toEqual([]);
		expect(calls.error).toEqual(Array.from(
			{ length: 5 },
			() => "사용법: www router [--resume <session-id>]",
		));
	});

	test("opens a project-scoped picker for --resume without an id", async () => {
		const { calls, dependencies } = fakeDependencies();
		expect(await runCli(["--resume"], dependencies)).toBe(0);
		expect(calls.listed).toBe(1);
		expect(calls.picked).toEqual([threads]);
		expect(calls.astra).toEqual([{ resumeThreadId: "thread-1" }]);
	});

	test("treats a cancelled Astra resume picker as a successful no-op", async () => {
		const { calls, dependencies } = fakeDependencies();
		dependencies.selectNativeThread = async () => null;
		expect(await runCli(["astra", "--resume"], dependencies)).toBe(0);
		expect(calls.listed).toBe(1);
		expect(calls.astra).toEqual([]);
		expect(calls.error).toEqual([]);
	});

	test("resumes an explicit thread id without opening the picker", async () => {
		const { calls, dependencies } = fakeDependencies();
		expect(await runCli(["--resume", "thread-direct"], dependencies)).toBe(0);
		expect(calls.listed).toBe(0);
		expect(calls.picked).toEqual([]);
		expect(calls.astra).toEqual([{ resumeThreadId: "thread-direct" }]);
	});

	test("opens the resume picker for an empty explicit thread id", async () => {
		const { calls, dependencies } = fakeDependencies();
		expect(await runCli(["--resume", ""], dependencies)).toBe(0);
		expect(calls.listed).toBe(1);
		expect(calls.picked).toEqual([threads]);
		expect(calls.astra).toEqual([{ resumeThreadId: "thread-1" }]);
	});
});

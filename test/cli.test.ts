import { describe, expect, test } from "bun:test";
import { runCli, writeRouterBootstrap, writeWorkbenchBootstrap, type CliDependencies } from "../src/cli";
import type { NativeThreadSummary } from "../src/domain/native-session";

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
		app: [] as Array<{ resumeThreadId?: string }>,
		router: [] as Array<{ resumeSessionId?: string }>,
		listed: 0,
		picked: [] as Array<readonly NativeThreadSummary[]>,
		out: [] as string[],
		error: [] as string[],
	};
	const dependencies: CliDependencies = {
		runApp: async (options = {}) => { calls.app.push(options); },
		runRouter: async (options = {}) => { calls.router.push(options); },
		runAuth: async () => undefined,
		listSessions: async () => [],
		listNativeThreads: async () => { calls.listed += 1; return threads; },
		selectNativeThread: async (items) => { calls.picked.push(items); return items[1]?.id ?? null; },
		writeOut: (value) => { calls.out.push(value); },
		writeError: (value) => { calls.error.push(value); },
	};
	return { calls, dependencies };
}

describe("WWW CLI session entry", () => {
	test("paints the lightweight bori bootstrap before production modules load", () => {
		const writes: string[] = [];
		writeWorkbenchBootstrap(value => writes.push(value), true);
		expect(writes).toEqual(["\r\x1b[2Kbori · 프로젝트 Workbench를 여는 중…\n"]);
		writeWorkbenchBootstrap(value => writes.push(value), false);
		expect(writes).toHaveLength(1);
	});

	test("paints a distinct bootstrap for the explicit multi-provider Router", () => {
		const writes: string[] = [];
		writeRouterBootstrap(value => writes.push(value), true);
		expect(writes).toEqual(["\r\x1b[2Kbori · 호환 Multi-provider Router를 여는 중…\n"]);
		writeRouterBootstrap(value => writes.push(value), false);
		expect(writes).toHaveLength(1);
	});

	test("reports the package release version", async () => {
		const { calls, dependencies } = fakeDependencies();
		expect(await runCli(["--version"], dependencies)).toBe(0);
		expect(calls.out).toEqual(["0.1.11"]);
		expect(calls.app).toEqual([]);
	});

	test("documents the compatibility Router command and its Native feature boundary", async () => {
		const { calls, dependencies } = fakeDependencies();
		expect(await runCli(["--help"], dependencies)).toBe(0);
		expect(calls.out[0]).toContain("www router");
		expect(calls.out[0]).toContain("Native 승인·Sandbox·Skill은 제공하지 않음");
		expect(calls.out[0]).toContain("Claude·Gemini·OpenAI 모델 변경");
	});

	test("opens a new session for plain www without listing or resuming", async () => {
		const { calls, dependencies } = fakeDependencies();
		expect(await runCli([], dependencies)).toBe(0);
		expect(calls.app).toEqual([{}]);
		expect(calls.listed).toBe(0);
		expect(calls.picked).toEqual([]);
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
		expect(calls.app).toEqual([{ resumeThreadId: "thread-1" }]);
	});

	test("resumes an explicit thread id without opening the picker", async () => {
		const { calls, dependencies } = fakeDependencies();
		expect(await runCli(["--resume", "thread-direct"], dependencies)).toBe(0);
		expect(calls.listed).toBe(0);
		expect(calls.picked).toEqual([]);
		expect(calls.app).toEqual([{ resumeThreadId: "thread-direct" }]);
	});
});

import { describe, expect, test } from "bun:test";
import { runCli, type CliDependencies } from "../src/cli";
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
		listed: 0,
		picked: [] as Array<readonly NativeThreadSummary[]>,
		out: [] as string[],
		error: [] as string[],
	};
	const dependencies: CliDependencies = {
		runApp: async (options = {}) => { calls.app.push(options); },
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
	test("reports the package release version", async () => {
		const { calls, dependencies } = fakeDependencies();
		expect(await runCli(["--version"], dependencies)).toBe(0);
		expect(calls.out).toEqual(["0.1.4"]);
		expect(calls.app).toEqual([]);
	});

	test("opens a new session for plain www without listing or resuming", async () => {
		const { calls, dependencies } = fakeDependencies();
		expect(await runCli([], dependencies)).toBe(0);
		expect(calls.app).toEqual([{}]);
		expect(calls.listed).toBe(0);
		expect(calls.picked).toEqual([]);
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

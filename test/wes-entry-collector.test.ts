import { describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { WesEntryCollector } from "../src/infrastructure/wes-entry-collector";

const config = "workspace_root: ~/wes\n";
const system = "authority:\n  wes_entry_runner: hooks/wes_entry.py\n";
const testRoot = resolve("/Users/test/wes");
const testRunner = join(testRoot, "hooks", "wes_entry.py");
const json = JSON.stringify({ kind: "wes-entry-snapshot", status: { branch: "main" }, git: {}, authority: {}, signals: [{ kind: "upstream-missing" }], next_actions: [{ id: "WI-1" }] });
describe("WesEntryCollector", () => {
	test("uses configured safe runner once and preserves signals", async () => {
		const calls: string[][] = [];
		const collector = new WesEntryCollector({ configPath: "/config", readText: async path => path === "/config" ? config : system, realpath: async path => path.includes("hooks") ? testRunner : testRoot, runner: async (_command, args) => { calls.push([...args]); return { exitCode: 0, stdout: json, stderr: "" }; } });
		const result = await collector.collect();
		expect(calls).toEqual([[testRunner, "--root", testRoot]]);
		expect(result.payload.signals).toEqual([{ kind: "upstream-missing" }]);
	});

	test("fails closed for a nonzero runner exit", async () => {
		const bad = fakeCollector("hooks/wes_entry.py", async () => ({ exitCode: 1, stdout: "not-json", stderr: "secret=never-leak" }));
		await expect(bad.collect()).rejects.toThrow("BLOCKED");
	});

	test("rejects malformed runner JSON separately", async () => {
		const bad = fakeCollector("hooks/wes_entry.py", async () => ({ exitCode: 0, stdout: "not-json", stderr: "" }));
		await expect(bad.collect()).rejects.toThrow("malformed JSON");
	});

	test("rejects an unsafe runner path before any process starts", async () => {
		let called = false;
		const collector = fakeCollector("../outside.py", async () => { called = true; return { exitCode: 0, stdout: json, stderr: "" }; });
		await expect(collector.collect()).rejects.toThrow("unsafe");
		expect(called).toBe(false);
	});

	test("default system runner times out and fails closed", async () => {
		const root = await mkdtemp(join(tmpdir(), "woo-entry-timeout-"));
		const configPath = join(root, "woo.yaml");
		const hooks = join(root, "hooks");
		try {
			await mkdir(hooks);
			await writeFile(configPath, `workspace_root: ${root}\n`);
			await writeFile(join(root, "system.yaml"), system);
			await writeFile(join(hooks, "wes_entry.py"), "import time\ntime.sleep(2)\n");
			const collector = new WesEntryCollector({ configPath, timeoutMs: 20 });
			await expect(collector.collect()).rejects.toThrow("timed out");
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});
});

function fakeCollector(
	runnerPath: string,
	runner: (command: string, args: readonly string[]) => Promise<{ exitCode: number; stdout: string; stderr: string }>,
): WesEntryCollector {
	return new WesEntryCollector({
		configPath: "/config",
		readText: async path => path === "/config" ? config : `authority:\n  wes_entry_runner: ${runnerPath}\n`,
		realpath: async path => path.includes("hooks") ? testRunner : testRoot,
		runner: async (command, args) => runner(command, args),
	});
}

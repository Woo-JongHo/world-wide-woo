import { afterEach, describe, expect, test } from "bun:test";
import { execFileSync, spawnSync }           from "node:child_process";
import {
	existsSync,
	mkdtempSync,
	mkdirSync,
	readFileSync,
	readdirSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { tmpdir }                            from "node:os";
import { basename, dirname, join, resolve }  from "node:path";
import { evaluateWorkRecordingGate }         from "../src/core/domain/development/work-recording-gate";

const roots: string[] = [];
const hook = resolve(import.meta.dir, "../scripts/work-recording-hook.ts");

afterEach(() => {
	for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("work recording gate", () => {
	test("compares the current turn against its own dirty-worktree baseline", () => {
		const same = { entries: { "existing.ts": "before" } };
		expect(evaluateWorkRecordingGate({ before: same, after: same, stopHookActive: false })).toEqual({
			state: "clear",
			changedPaths: [],
		});
		const changed = evaluateWorkRecordingGate({
			before         : same,
			after          : { entries: { "existing.ts": "after", ".www/runtime/session.json": "noise" } },
			stopHookActive : false,
		});
		expect(changed).toMatchObject({ state: "continue", changedPaths: ["existing.ts"] });
	});

	test("continues once when a turn changes a file and releases the continued stop", () => {
		const root = repository();
		writeFileSync(join(root, "existing.ts"), "dirty before prompt\n");
		run(root, event("UserPromptSubmit"));
		writeFileSync(join(root, "existing.ts"), "changed during turn\n");

		const first = run(root, event("Stop"));
		expect(first.status).toBe(0);
		expect(JSON.parse(first.stdout)).toMatchObject({ decision: "block" });
		expect(first.stdout).toContain("existing.ts");
		expect(first.stdout).toContain("woo-linear-activity");

		const continued = run(root, { ...event("Stop"), stop_hook_active: true });
		expect(JSON.parse(continued.stdout)).toEqual({});
	});

	test("does not continue for no change or runtime-only noise", () => {
		const root = repository();
		writeFileSync(join(root, "existing.ts"), "dirty before prompt\n");
		run(root, event("UserPromptSubmit"));
		expect(JSON.parse(run(root, event("Stop")).stdout)).toEqual({});

		run(root, { ...event("UserPromptSubmit"), turn_id: "turn-2" });
		mkdirSync(join(root, ".www/runtime"), { recursive: true });
		writeFileSync(join(root, ".www/runtime/session.json"), "noise\n");
		expect(JSON.parse(run(root, { ...event("Stop"), turn_id: "turn-2" }).stdout)).toEqual({});
	});

	test("observes a repository symlink without following its external target", () => {
		const root = repository();
		const target = join(dirname(root), `${basename(root)}-external.txt`);
		writeFileSync(target, "before\n");
		roots.push(target);
		symlinkSync(target, join(root, "external-link"));
		run(root, event("UserPromptSubmit"));
		writeFileSync(target, "after\n");

		expect(JSON.parse(run(root, event("Stop")).stdout)).toEqual({});
	});

	test("removes pending baseline state when the session ends", () => {
		const root = repository();
		run(root, event("UserPromptSubmit"));
		const stateRoot = join(root, ".git", "woo", "recording-hook");
		expect(existsSync(stateRoot)).toBe(true);
		expect(run(root, event("SessionEnd")).stdout).toBe("");
		expect(existsSync(stateRoot) && readdirSync(stateRoot).length > 0).toBe(false);
	});

	test("registers baseline, stop and cleanup hooks in the project layer", () => {
		const config = JSON.parse(readFileSync(resolve(import.meta.dir, "../.codex/hooks.json"), "utf8"));
		expect(Object.keys(config.hooks).sort()).toEqual(["SessionEnd", "Stop", "UserPromptSubmit"]);
		for (const event of Object.values(config.hooks) as Array<Array<{ hooks: Array<{ command: string }> }>>) {
			expect(event[0]?.hooks[0]?.command).toContain("scripts/work-recording-hook.ts");
		}
	});
});

function repository(): string {
	const root = mkdtempSync(join(tmpdir(), "www-recording-hook-"));
	roots.push(root);
	execFileSync("git", ["init", "-q"], { cwd: root });
	execFileSync("git", ["config", "user.email", "test@example.com"], { cwd: root });
	execFileSync("git", ["config", "user.name", "Test"], { cwd: root });
	writeFileSync(join(root, "existing.ts"), "base\n");
	execFileSync("git", ["add", "existing.ts"], { cwd: root });
	execFileSync("git", ["commit", "-qm", "base"], { cwd: root });
	return root;
}

function event(hook_event_name: string) {
	return { hook_event_name, session_id: "session-1", turn_id: "turn-1", cwd: "ignored", stop_hook_active: false };
}

function run(root: string, input: Record<string, unknown>) {
	return spawnSync("bun", [hook], { cwd: root, input: JSON.stringify({ ...input, cwd: root }), encoding: "utf8" });
}

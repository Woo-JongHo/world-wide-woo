import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";
import { sanitizeTerminalText } from "../src/domain/terminal";
import { LocalTerminalCommandExecutor, TerminalCommandRejectedError } from "../src/infrastructure/terminal-command-executor";

async function fixture(): Promise<string> {
	return mkdtemp(join(tmpdir(), "www-terminal-"));
}

function run(command: string, cwd: string, options: ConstructorParameters<typeof LocalTerminalCommandExecutor>[0] = {}) {
	const updates: { stdout: string; stderr: string }[] = [];
	const controller = new AbortController();
	return { controller, updates, result: new LocalTerminalCommandExecutor(options).execute(command, cwd, controller.signal, update => updates.push(update)) };
}

describe("LocalTerminalCommandExecutor", () => {
	test("captures stdout, stderr, exit status, and shell pipes", async () => {
		const cwd = await fixture();
		const execution = run("printf 'one\\ntwo\\n' | wc -l; printf err >&2; exit 7", cwd);
		const result = await execution.result;
		expect(result).toMatchObject({ stderr: "err", exitCode: 7, cancelled: false, timedOut: false });
		expect(result.stdout.trim()).toBe("2");
		expect(execution.updates.at(-1)?.stdout.trim()).toBe("2");
	});

	test("uses a restricted environment", async () => {
		const cwd = await fixture();
		const previous = process.env.TERMINAL_EXECUTOR_LEAK;
		process.env.TERMINAL_EXECUTOR_LEAK = "must-not-leak";
		try {
			const result = await run("printf '%s' \"${TERMINAL_EXECUTOR_LEAK-unset}\"", cwd).result;
			expect(result.stdout).toBe("unset");
		} finally {
			if (previous === undefined) delete process.env.TERMINAL_EXECUTOR_LEAK;
			else process.env.TERMINAL_EXECUTOR_LEAK = previous;
		}
	});

	test("redacts credentials across output chunks and strips terminal controls", async () => {
		const cwd = await fixture();
		const result = await run("printf '\\033[31mBearer '; sleep 0.01; printf 'sk-secret_value\\033[0m'", cwd).result;
		expect(result.stdout).toBe("Bearer [redacted]");
		expect(sanitizeTerminalText("Authorization: Bearer abc\napi_key='value' AKIA1234567890ABCDEF", 1_000)).toBe("Authorization: [redacted]\napi_key=[redacted] [redacted]");
		expect(sanitizeTerminalText("printf \"token=secret-value\"", 1_000)).toBe("printf \"token=[redacted]\"");
		expect(sanitizeTerminalText("DATABASE_PASSWORD=hunter2\npostgres://user:pass@host/db", 1_000))
			.toBe("DATABASE_PASSWORD=[redacted]\npostgres://[redacted]@host/db");
		expect(sanitizeTerminalText("-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----", 1_000))
			.toBe("[private key redacted]");
	});

	test("keeps a bounded tail with an omission marker", async () => {
		const cwd = await fixture();
		const result = await run("printf 'abcdefghijklmnopqrstuvwxyz1234'", cwd, { snapshotCodePoints: 24 }).result;
		expect(result.stdout).toBe("…[output truncated]\n1234");
	});

	test("terminates on abort", async () => {
		const cwd = await fixture();
		const execution = run("sleep 10", cwd, { killGraceMs: 10 });
		setTimeout(() => execution.controller.abort(), 10);
		const result = await execution.result;
		expect(result).toMatchObject({ exitCode: null, cancelled: true, timedOut: false });
	});

	test("terminates on timeout", async () => {
		const cwd = await fixture();
		const result = await run("sleep 10", cwd, { timeoutMs: 10, killGraceMs: 10 }).result;
		expect(result).toMatchObject({ exitCode: null, cancelled: false, timedOut: true });
	});

	test("rejects unsafe or non-directory working directories before execution", async () => {
		const cwd = await fixture();
		const file = join(cwd, "file");
		await writeFile(file, "x");
		await expect(run("printf nope", file).result).rejects.toBeInstanceOf(TerminalCommandRejectedError);
		await expect(run("printf nope", "relative").result).rejects.toBeInstanceOf(TerminalCommandRejectedError);
		await expect(run(" ", cwd).result).rejects.toBeInstanceOf(TerminalCommandRejectedError);
		await expect(run("x".repeat(8_193), cwd).result).rejects.toBeInstanceOf(TerminalCommandRejectedError);
		await mkdir(join(cwd, "directory"));
	});
});

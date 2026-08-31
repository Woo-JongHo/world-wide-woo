import { stat } from "node:fs/promises";
import { basename, isAbsolute } from "node:path";
import type { TerminalCommandExecutor } from "../application/ports";
import { sanitizeTerminalText, type TerminalCommandResult, type TerminalCommandUpdate } from "../domain/terminal";

const MAX_COMMAND_CODE_POINTS = 8_192;
const MAX_RAW_OUTPUT_BYTES = 256 * 1024;
const DEFAULT_TIMEOUT_MS = 5 * 60 * 1_000;
const DEFAULT_KILL_GRACE_MS = 1_000;
const DEFAULT_SNAPSHOT_CODE_POINTS = 32 * 1024;

export class TerminalCommandRejectedError extends Error {
	constructor() {
		super("Terminal command rejected.");
		this.name = "TerminalCommandRejectedError";
	}
}

export interface LocalTerminalCommandExecutorOptions {
	timeoutMs?: number;
	killGraceMs?: number;
	snapshotCodePoints?: number;
}

function appendTail(previous: Uint8Array<ArrayBufferLike>, next: Uint8Array<ArrayBufferLike>): Uint8Array<ArrayBufferLike> {
	if (next.byteLength >= MAX_RAW_OUTPUT_BYTES) return next.slice(next.byteLength - MAX_RAW_OUTPUT_BYTES);
	const retained = Math.min(previous.byteLength, MAX_RAW_OUTPUT_BYTES - next.byteLength);
	const combined = new Uint8Array(retained + next.byteLength);
	combined.set(previous.subarray(previous.byteLength - retained));
	combined.set(next, retained);
	return combined;
}

function safeEnvironment(): Record<string, string> {
	const environment: Record<string, string> = {
		GIT_PAGER: "cat",
		PAGER: "cat",
		NO_COLOR: "1",
	};
	for (const [key, value] of Object.entries(process.env)) {
		if (value === undefined) continue;
		if (key === "PATH" || key === "HOME" || key === "USER" || key === "SHELL" || key === "TMPDIR" || key === "TERM" || key === "COLORTERM" || key === "LANG" || key.startsWith("LC_")) environment[key] = value;
	}
	return environment;
}

async function validate(command: string, cwd: string): Promise<void> {
	if (!command.trim() || command.includes("\0") || Array.from(command).length > MAX_COMMAND_CODE_POINTS) throw new TerminalCommandRejectedError();
	if (!cwd || cwd.includes("\0") || !isAbsolute(cwd)) throw new TerminalCommandRejectedError();
	try {
		if (!(await stat(cwd)).isDirectory()) throw new TerminalCommandRejectedError();
	} catch (error) {
		if (error instanceof TerminalCommandRejectedError) throw error;
		throw new TerminalCommandRejectedError();
	}
}

/** Non-interactive executor for commands directly submitted by the user. */
export class LocalTerminalCommandExecutor implements TerminalCommandExecutor {
	private readonly timeoutMs: number;
	private readonly killGraceMs: number;
	private readonly snapshotCodePoints: number;

	constructor(options: LocalTerminalCommandExecutorOptions = {}) {
		this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
		this.killGraceMs = options.killGraceMs ?? DEFAULT_KILL_GRACE_MS;
		this.snapshotCodePoints = options.snapshotCodePoints ?? DEFAULT_SNAPSHOT_CODE_POINTS;
	}

	async execute(command: string, cwd: string, signal: AbortSignal, onUpdate: (update: TerminalCommandUpdate) => void): Promise<TerminalCommandResult> {
		await validate(command, cwd);
		const startedAt = performance.now();
		const shell = process.env.SHELL?.startsWith("/") ? process.env.SHELL : "/bin/sh";
		let child: ReturnType<typeof Bun.spawn> | undefined;
		try {
			const loginShell = ["bash", "zsh"].includes(basename(shell));
			child = Bun.spawn([shell, ...(loginShell ? ["-l", "-s"] : ["-s"])], {
				cwd,
				env: safeEnvironment(),
				stdin: "pipe",
				stdout: "pipe",
				stderr: "pipe",
				detached: true,
			});
			const stdin = child.stdin;
			if (!stdin || typeof stdin === "number") throw new Error("Terminal command stdin is unavailable.");
			stdin.write(`${command}\n`);
			stdin.end();
		} catch {
			try { child?.kill("SIGKILL"); } catch { /* startup already failed */ }
			return { stdout: "", stderr: "Unable to start terminal command.", exitCode: null, durationMs: Math.round(performance.now() - startedAt), cancelled: false, timedOut: false };
		}

		let stdout: Uint8Array<ArrayBufferLike> = new Uint8Array();
		let stderr: Uint8Array<ArrayBufferLike> = new Uint8Array();
		let cancelled = false;
		let timedOut = false;
		let killTimer: ReturnType<typeof setTimeout> | undefined;
		const decoder = new TextDecoder();
		const update = () => {
			try {
				onUpdate({
					stdout: sanitizeTerminalText(decoder.decode(stdout), this.snapshotCodePoints),
					stderr: sanitizeTerminalText(decoder.decode(stderr), this.snapshotCodePoints),
				});
			} catch {
				// Presentation listeners cannot interrupt the user-owned process.
			}
		};
		const killGroup = (signal: NodeJS.Signals) => {
			try { process.kill(-child.pid, signal); }
			catch { try { child.kill(signal); } catch { /* already exited */ } }
		};
		const terminate = () => {
			killGroup("SIGTERM");
			killTimer ??= setTimeout(() => killGroup("SIGKILL"), this.killGraceMs);
		};
		const abort = () => { cancelled = true; terminate(); };
		signal.addEventListener("abort", abort, { once: true });
		if (signal.aborted) abort();
		const timeout = setTimeout(() => { timedOut = true; terminate(); }, this.timeoutMs);
		const drain = async (
			stream: ReadableStream<Uint8Array<ArrayBufferLike>> | number | null | undefined,
			set: (value: Uint8Array<ArrayBufferLike>) => void,
		): Promise<void> => {
			if (!stream || typeof stream === "number") return;
			const reader = stream.getReader();
			try {
				while (true) {
					const { done, value } = await reader.read();
					if (done) return;
					set(value!);
					update();
				}
			} finally {
				reader.releaseLock();
			}
		};
		try {
			const [exitCode] = await Promise.all([
				child.exited.then(exitCode => {
					killGroup("SIGTERM");
					return exitCode;
				}),
				drain(child.stdout, value => { stdout = appendTail(stdout, value); }),
				drain(child.stderr, value => { stderr = appendTail(stderr, value); }),
			]);
			const result: TerminalCommandResult = {
				stdout: sanitizeTerminalText(decoder.decode(stdout), this.snapshotCodePoints),
				stderr: sanitizeTerminalText(decoder.decode(stderr), this.snapshotCodePoints),
				exitCode: cancelled || timedOut ? null : exitCode,
				durationMs: Math.round(performance.now() - startedAt),
				cancelled,
				timedOut,
			};
			update();
			return result;
		} finally {
			clearTimeout(timeout);
			if (killTimer) clearTimeout(killTimer);
			signal.removeEventListener("abort", abort);
			killGroup("SIGTERM");
		}
	}
}

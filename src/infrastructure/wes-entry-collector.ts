import { readFile, realpath } from "node:fs/promises";
import { homedir } from "node:os";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { parse } from "yaml";
import { normalizeWooEntryPayload, type WooEntryCollection, type WooEntryCollector } from "../application/woo-entry.js";

const OUTPUT_LIMIT = 16 * 1024;
const TIMEOUT_MS = 10_000;

export interface WesEntryProcessResult {
	readonly exitCode: number;
	readonly stdout: string;
	readonly stderr: string;
}

export type WesEntryProcessRunner = (
	command: string,
	args: readonly string[],
	options: { readonly cwd: string; readonly timeoutMs: number; readonly outputLimit: number },
) => Promise<WesEntryProcessResult>;

export interface WesEntryCollectorOptions {
	readonly configPath?: string;
	readonly readText?: (path: string) => Promise<string>;
	readonly realpath?: (path: string) => Promise<string>;
	readonly runner?: WesEntryProcessRunner;
	readonly timeoutMs?: number;
	readonly outputLimit?: number;
}

/** Local-only adapter for the canonical WES runner configured in ~/.codex/woo.yaml. */
export class WesEntryCollector implements WooEntryCollector {
	private readonly configPath: string;
	private readonly readText: (path: string) => Promise<string>;
	private readonly resolveRealpath: (path: string) => Promise<string>;
	private readonly run: WesEntryProcessRunner;
	private readonly timeoutMs: number;
	private readonly outputLimit: number;
	constructor(options: WesEntryCollectorOptions = {}) {
		this.configPath = options.configPath ?? resolve(homedir(), ".codex", "woo.yaml");
		this.readText = options.readText ?? ((path) => readFile(path, "utf8"));
		this.resolveRealpath = options.realpath ?? realpath;
		this.run = options.runner ?? systemRunner;
		this.timeoutMs = options.timeoutMs ?? TIMEOUT_MS;
		this.outputLimit = options.outputLimit ?? OUTPUT_LIMIT;
	}
	async collect(): Promise<WooEntryCollection> {
		try {
			const config = mapping(parse(await this.readText(this.configPath)), "configuration");
			const configuredRoot = config.workspace_root;
			if (typeof configuredRoot !== "string" || !configuredRoot.trim()) {
				throw new WesEntryCollectorError("WES configuration has no workspace_root.");
			}
			const root = await this.resolveRealpath(expandHome(configuredRoot.trim()));
			const system = mapping(parse(await this.readText(resolve(root, "system.yaml"))), "system manifest");
			const authority = mapping(system.authority, "system authority");
			if (typeof authority.wes_entry_runner !== "string" || !authority.wes_entry_runner.trim()) {
				throw new WesEntryCollectorError("WES system manifest has no entry runner.");
			}
			const configuredRunner = authority.wes_entry_runner.trim();
			const runner = await safeRunner(root, configuredRunner, this.resolveRealpath);
			const result = await this.run("python3", [runner, "--root", root], {
				cwd: root,
				timeoutMs: this.timeoutMs,
				outputLimit: this.outputLimit,
			});
			if (result.stdout.length > this.outputLimit || result.stderr.length > this.outputLimit) throw new WesEntryCollectorError("WES entry runner exceeded its output budget.");
			if (result.exitCode !== 0) throw new WesEntryCollectorError("WES entry runner reported BLOCKED.");
			const snapshot = mapping(parseJson(result.stdout), "runner output");
			if (snapshot.status === "BLOCKED" || snapshot.kind !== "wes-entry-snapshot") throw new WesEntryCollectorError("WES entry runner reported BLOCKED.");
			return Object.freeze({
				source: Object.freeze({ root, runner: configuredRunner }),
				payload: normalizeWooEntryPayload(snapshot),
			});
		} catch (error) {
			if (error instanceof WesEntryCollectorError) throw error;
			throw new WesEntryCollectorError("WES entry collection failed.");
		}
	}
}

export class WesEntryCollectorError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "WesEntryCollectorError";
	}
}
function mapping(value: unknown, label: string): Record<string, unknown> {
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		throw new WesEntryCollectorError(`Invalid WES ${label}.`);
	}
	return value as Record<string, unknown>;
}

function expandHome(value: string): string {
	if (value === "~") return homedir();
	if (value.startsWith("~/")) return resolve(homedir(), value.slice(2));
	if (value.startsWith("~")) throw new WesEntryCollectorError("WES configuration has an unsupported home path.");
	return resolve(value);
}

async function safeRunner(
	root: string,
	configured: string,
	resolveRealpath: (path: string) => Promise<string>,
): Promise<string> {
	if (isAbsolute(configured) || configured.split(/[\\/]/).includes("..")) {
		throw new WesEntryCollectorError("WES entry runner path is unsafe.");
	}
	const runner = await resolveRealpath(resolve(root, configured));
	const rel = relative(root, runner);
	if (!rel || rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
		throw new WesEntryCollectorError("WES entry runner path is unsafe.");
	}
	return runner;
}

function parseJson(text: string): unknown {
	try {
		return JSON.parse(text);
	} catch {
		throw new WesEntryCollectorError("WES entry runner returned malformed JSON.");
	}
}

async function systemRunner(
	command: string,
	args: readonly string[],
	options: { cwd: string; timeoutMs: number; outputLimit: number },
): Promise<WesEntryProcessResult> {
	const child = Bun.spawn([command, ...args], { cwd: options.cwd, stdout: "pipe", stderr: "pipe" });
	let timedOut = false;
	const timer = setTimeout(() => {
		timedOut = true;
		child.kill();
	}, options.timeoutMs);
	try {
		const [exitCode, stdout, stderr] = await Promise.all([
			child.exited,
			readBounded(child.stdout, options.outputLimit, () => child.kill()),
			readBounded(child.stderr, options.outputLimit, () => child.kill()),
		]);
		if (timedOut) throw new WesEntryCollectorError("WES entry runner timed out.");
		if (stdout.overflow || stderr.overflow) {
			throw new WesEntryCollectorError("WES entry runner exceeded its output budget.");
		}
		return { exitCode, stdout: stdout.text, stderr: stderr.text };
	} finally {
		clearTimeout(timer);
	}
}

async function readBounded(
	stream: ReadableStream<Uint8Array>,
	limit: number,
	onOverflow: () => void,
): Promise<{ text: string; overflow: boolean }> {
	const reader = stream.getReader();
	const chunks: Uint8Array[] = [];
	let size = 0;
	for (;;) {
		const { done, value } = await reader.read();
		if (done) break;
		if (size + value.length > limit) {
			onOverflow();
			await reader.cancel();
			return { text: "", overflow: true };
		}
		chunks.push(value);
		size += value.length;
	}
	return { text: new TextDecoder().decode(concat(chunks, size)), overflow: false };
}

function concat(chunks: readonly Uint8Array[], size: number): Uint8Array {
	const result = new Uint8Array(size);
	let offset = 0;
	for (const chunk of chunks) {
		result.set(chunk, offset);
		offset += chunk.length;
	}
	return result;
}

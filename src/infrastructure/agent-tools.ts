import { lstat, realpath, readdir, readFile, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { Type } from "typebox";
import type { AgentTool, AgentToolExecution, TodoController } from "../application/ports";
import type { CommandResultSnapshot, GenericToolResultSnapshot } from "../domain/output";

const MAX_FILE_BYTES = 256 * 1024;
const MAX_OUTPUT_BYTES = 64 * 1024;
const MAX_DIRECTORY_ENTRIES = 500;
const MAX_SEARCH_RESULTS = 200;
const TIMEOUT_MS = 10_000;

const reason = Type.Optional(Type.String({ maxLength: 160 }));
const readParameters = Type.Object({ path: Type.String({ minLength: 1 }), reason });
const searchParameters = Type.Object({
	pattern: Type.String({ minLength: 1, maxLength: 1_000 }),
	path: Type.Optional(Type.String({ minLength: 1 })),
	regex: Type.Optional(Type.Boolean()),
	reason,
});
const bashParameters = Type.Object({
	command: Type.String({ minLength: 1 }),
	args: Type.Optional(Type.Array(Type.String({ maxLength: 4_096 }), { maxItems: 32 })),
	reason,
});
const sshConfigParameters = Type.Object({
	host: Type.String({ minLength: 1, maxLength: 255, pattern: "^[A-Za-z0-9][A-Za-z0-9._-]*$" }),
	reason,
});
const todoParameters = Type.Object({
	operation: Type.Union([
		Type.Literal("status"),
		Type.Literal("init"),
		Type.Literal("add"),
		Type.Literal("detail"),
		Type.Literal("start"),
		Type.Literal("done"),
		Type.Literal("block"),
		Type.Literal("reopen"),
	]),
	title: Type.Optional(Type.String({ minLength: 1, maxLength: 120 })),
	storyId: Type.Optional(Type.String({ minLength: 1, maxLength: 64 })),
	items: Type.Optional(Type.Array(Type.String({ minLength: 1, maxLength: 120 }), { minItems: 1, maxItems: 12 })),
	itemId: Type.Optional(Type.String({ minLength: 1, maxLength: 64 })),
	content: Type.Optional(Type.String({ minLength: 1, maxLength: 120 })),
	details: Type.Optional(Type.Array(Type.String({ minLength: 1, maxLength: 120 }), { minItems: 1, maxItems: 8 })),
	placement: Type.Optional(Type.Union([Type.Literal("now"), Type.Literal("after")])),
	reason,
});

export function createProjectAgentTools(
	root: string,
	options: { sshConfigPath?: string; todos?: TodoController } = {},
): readonly AgentTool[] {
	const projectRoot = resolve(root);
	const tools = [
		createReadTool(projectRoot),
		createSearchTool(projectRoot),
		createBashTool(projectRoot),
		createSshConfigTool(options.sshConfigPath ?? resolve(homedir(), ".ssh", "config")),
	];
	if (options.todos) tools.push(createTodoTool(options.todos));
	return tools;
}

function createReadTool(root: string): AgentTool {
	return {
		definition: { name: "read", description: "Read a UTF-8 file or list a directory inside the project root. Absolute paths are accepted only when they remain inside the project.", parameters: readParameters },
		execute: async (arguments_, signal) => {
			const startedAt = Date.now();
			try {
				const path = stringArgument(arguments_, "path");
				const target = await projectPath(root, path);
				await assertNonSensitive(root, target);
				const info = await stat(target);
				let output: string;
				if (info.isFile()) {
					if (info.size > MAX_FILE_BYTES) throw new Error(`File exceeds ${MAX_FILE_BYTES} byte limit.`);
					const bytes = await readFile(target);
					output = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
				} else if (info.isDirectory()) {
					const entries = await readdir(target, { withFileTypes: true });
					output = entries.slice(0, MAX_DIRECTORY_ENTRIES).map((entry) => `${entry.name}${entry.isDirectory() ? "/" : ""}`).join("\n");
					if (entries.length > MAX_DIRECTORY_ENTRIES) output += `\n… ${entries.length - MAX_DIRECTORY_ENTRIES} more entries`;
				} else throw new Error("Only regular files and directories may be read.");
				return generic("read", path, output, startedAt);
			} catch (error) { return genericError("read", arguments_, error, startedAt, signal); }
		},
	};
}

function createSearchTool(root: string): AgentTool {
	return {
		definition: { name: "search", description: "Search project files using literal text or regular expressions.", parameters: searchParameters },
		execute: async (arguments_, signal) => {
			const startedAt = Date.now();
			try {
				const pattern = stringArgument(arguments_, "pattern");
				const requestedPath = optionalStringArgument(arguments_, "path") ?? ".";
				const target = await projectPath(root, requestedPath);
				const regex = arguments_.regex === true;
				const output = await searchProject(root, target, pattern, regex, signal);
				return generic("search", `${regex ? "regex" : "literal"}: ${pattern}`, output || "No matches.", startedAt);
			} catch (error) { return genericError("search", arguments_, error, startedAt, signal); }
		},
	};
}

function createBashTool(root: string): AgentTool {
	return {
		definition: { name: "bash", description: "Run an allowlisted read-only command in the project root.", parameters: bashParameters },
		execute: async (arguments_, signal) => {
			const startedAt = Date.now();
			const command = typeof arguments_.command === "string" ? arguments_.command : "";
			const args = Array.isArray(arguments_.args) && arguments_.args.every((value) => typeof value === "string") ? arguments_.args : [];
			try {
				if (arguments_.args !== undefined && args.length !== (arguments_.args as unknown[]).length) throw new Error("Command arguments must be strings.");
				validateCommand(command, args);
				const result = await run(command, args, root, signal);
				const snapshot: CommandResultSnapshot = {
					id: id(), shell: "bash", command: safe(`${command} ${args.join(" ")}`.trim()), cwd: root,
					status: result.error ? (signal.aborted ? "cancelled" : "failed") : result.exitCode === 0 ? "passed" : "failed",
					stdout: safe(result.stdout), stderr: safe(result.stderr), startedAt, durationMs: Date.now() - startedAt,
					exitCode: result.exitCode,
				};
				return { modelContent: safe(result.output || result.error || "(no output)"), isError: snapshot.status !== "passed", snapshot };
			} catch (error) {
				const message = errorMessage(error);
				const snapshot: CommandResultSnapshot = { id: id(), shell: "bash", command: safe(`${command} ${args.join(" ")}`.trim()), cwd: root, status: signal.aborted ? "cancelled" : "failed", stdout: "", stderr: safe(message), startedAt, durationMs: Date.now() - startedAt, exitCode: undefined };
				return { modelContent: snapshot.stderr, isError: true, snapshot };
			}
		},
	};
}

function createSshConfigTool(configPath: string): AgentTool {
	return {
		definition: {
			name: "ssh_config",
			description: "Resolve hostname, user, and port for one SSH alias without executing ssh, Match exec, Include, or network commands.",
			parameters: sshConfigParameters,
		},
		execute: async (arguments_, signal) => {
			const startedAt = Date.now();
			try {
				if (signal.aborted) throw signal.reason ?? new Error("SSH config lookup aborted.");
				const host = stringArgument(arguments_, "host");
				if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/u.test(host)) throw new Error("Invalid SSH host alias.");
				const output = await resolveSshAlias(configPath, host);
				return generic("ssh_config", host, output, startedAt);
			} catch (error) {
				return genericError("ssh_config", arguments_, error, startedAt, signal);
			}
		},
	};
}

function createTodoTool(todos: TodoController): AgentTool {
	return {
		definition: {
			name: "todo_write",
			description: [
				"Maintain the current project's thin live Todo list.",
				"Use status to inspect existing work before init when a prior session may have unfinished items.",
				"Use add with placement now to interrupt safely or after to queue directly behind the active item.",
				"For implementation work with at least three concrete steps, call init before other tools.",
				"Use detail with a parent itemId and one to eight details for exactly one nested level; never add details to details.",
				"Start the parent first, then one pending detail at a time; finish every detail before done on its parent.",
				"Call start immediately before one item and done only after observable evidence; flat item completion without evidence fails.",
				"Do not use for simple answers or invent completed work.",
			].join(" "),
			parameters: todoParameters,
		},
		execute: async (arguments_, signal) => {
			const startedAt = Date.now();
			try {
				if (signal.aborted) throw signal.reason ?? new Error("Todo update aborted.");
				const operation = stringArgument(arguments_, "operation");
				let document;
				if (operation === "status") {
					document = todos.snapshot;
					if (!document) return generic("todo_write", operation, "No active Todo.", startedAt);
				} else if (operation === "init") {
					const title = stringArgument(arguments_, "title");
					if (!Array.isArray(arguments_.items) || !arguments_.items.every(item => typeof item === "string")) {
						throw new Error("Todo init requires a string items array.");
					}
					const storyId = optionalStringArgument(arguments_, "storyId");
					document = await todos.create(title, arguments_.items, storyId);
				} else if (operation === "add") {
					const content = stringArgument(arguments_, "content");
					const placement = stringArgument(arguments_, "placement");
					if (placement !== "now" && placement !== "after") throw new Error("Todo placement must be now or after.");
					document = await todos.add(content, placement);
				} else if (operation === "detail") {
					const itemId = stringArgument(arguments_, "itemId");
					if (!Array.isArray(arguments_.details) || !arguments_.details.every(detail => typeof detail === "string")) {
						throw new Error("Todo detail requires a string details array.");
					}
					document = await todos.addDetails(itemId, arguments_.details);
				} else {
					const itemId = stringArgument(arguments_, "itemId");
					if (operation === "start") document = await todos.start(itemId);
					else if (operation === "done") document = await todos.complete(itemId);
					else if (operation === "block") document = await todos.block(itemId);
					else if (operation === "reopen") document = await todos.reopen(itemId);
					else throw new Error(`Unsupported todo operation: ${operation}`);
				}
				const output = [
					`${document.title} · revision ${document.revision}`,
					...document.items.flatMap(item => [
						`${item.id} [${item.status}] ${item.content}${item.details.length > 0
							? ` · details ${item.details.filter(detail => detail.status === "completed").length}/${item.details.length}`
							: ""}`,
						...item.details.map(detail => `  ${detail.id} [${detail.status}] ${detail.content}`),
					]),
				].join("\n");
				return generic("todo_write", operation, output, startedAt);
			} catch (error) {
				return genericError("todo_write", arguments_, error, startedAt, signal);
			}
		},
	};
}

async function projectPath(root: string, path: string): Promise<string> {
	if (!isAbsolute(path) && path.split(/[\\/]+/).includes("..")) throw new Error("Path must remain inside the project root.");
	const realRoot = await realpath(root);
	const target = isAbsolute(path) ? path : resolve(root, path);
	const realTarget = await realpath(target);
	if (relative(realRoot, realTarget) === "" || !relative(realRoot, realTarget).startsWith(`..${sep}`) && relative(realRoot, realTarget) !== "..") return realTarget;
	throw new Error("Path must remain inside the project root.");
}

async function assertNonSensitive(root: string, target: string): Promise<void> {
	const path = relative(await realpath(root), target);
	const parts = path.split(sep);
	if (
		parts.some(part => part === ".git" || part === ".env" || part.startsWith(".env.")) ||
		parts.some(part => [".npmrc", ".pypirc", "id_rsa", "id_ed25519"].includes(part)) ||
		parts[0] === ".www" && (
			["sessions", "drafts", "runtime", "todos"].includes(parts[1] ?? "") ||
			(parts[1] ?? "").toLowerCase() === "todo.md"
		)
	) {
		throw new Error("Sensitive project state cannot be read by the model.");
	}
}

async function searchProject(
	root: string,
	target: string,
	pattern: string,
	regex: boolean,
	signal: AbortSignal,
): Promise<string> {
	const matcher = regex ? new RegExp(pattern, "u") : null;
	const matches: string[] = [];
	const ignoredDirectories = new Set([".git", "node_modules", "dist", "coverage"]);
	const visit = async (path: string): Promise<void> => {
		if (signal.aborted) throw signal.reason ?? new Error("Search aborted.");
		if (matches.length >= MAX_SEARCH_RESULTS) return;
		const info = await lstat(path);
		if (info.isSymbolicLink()) return;
		if (info.isDirectory()) {
			for (const entry of await readdir(path, { withFileTypes: true })) {
				if (ignoredDirectories.has(entry.name)) continue;
				const child = resolve(path, entry.name);
				const childRelative = relative(root, child);
				if (
					childRelative.startsWith(`.www${sep}`) &&
					/^(?:\.www\/)?(?:(?:sessions|drafts|runtime|todos)(?:\/|$)|Todo\.md$)/iu.test(childRelative.replaceAll(sep, "/"))
				) continue;
				await visit(child);
				if (matches.length >= MAX_SEARCH_RESULTS) return;
			}
			return;
		}
		if (!info.isFile() || info.size > MAX_FILE_BYTES) return;
		try {
			await assertNonSensitive(root, path);
			const content = new TextDecoder("utf-8", { fatal: true }).decode(await readFile(path));
			const name = relative(root, path).replaceAll(sep, "/");
			for (const [index, line] of content.split("\n").entries()) {
				if (matcher ? matcher.test(line) : line.includes(pattern)) {
					matches.push(`${name}:${index + 1}:${line.slice(0, 2_000)}`);
					if (matches.length >= MAX_SEARCH_RESULTS) return;
				}
			}
		} catch (error) {
			if (error instanceof Error && error.message === "Sensitive project state cannot be read by the model.") return;
			if (error instanceof TypeError) return;
			throw error;
		}
	};
	await visit(target);
	return matches.join("\n");
}

async function resolveSshAlias(configPath: string, host: string): Promise<string> {
	const content = new TextDecoder("utf-8", { fatal: true }).decode(await readFile(configPath));
	const values = new Map<string, string>();
	let active = true;
	let matchedHostBlock = false;
	for (const rawLine of content.split("\n")) {
		const line = rawLine.trim();
		if (!line || line.startsWith("#")) continue;
		const separator = line.search(/\s/u);
		if (separator < 0) continue;
		const key = line.slice(0, separator).toLowerCase();
		const value = line.slice(separator).trim();
		if (key === "host") {
			active = sshPatternsMatch(value.split(/\s+/u), host);
			if (active) matchedHostBlock = true;
			continue;
		}
		if (key === "match") {
			active = false;
			continue;
		}
		if (!active || !["hostname", "user", "port"].includes(key) || values.has(key)) continue;
		values.set(key, value.split(/\s+#/u)[0]?.trim() ?? "");
	}
	if (!matchedHostBlock) throw new Error(`SSH alias not found: ${host}`);
	const hostname = values.get("hostname") ?? host;
	const user = values.get("user");
	const port = values.get("port");
	return [`host ${host}`, `hostname ${hostname}`, user ? `user ${user}` : "", port ? `port ${port}` : ""]
		.filter(Boolean)
		.join("\n");
}

function sshPatternsMatch(patterns: readonly string[], host: string): boolean {
	let matched = false;
	for (const entry of patterns) {
		const negated = entry.startsWith("!");
		const pattern = negated ? entry.slice(1) : entry;
		const expression = new RegExp(`^${pattern
			.replace(/[.+^${}()|[\]\\]/gu, "\\$&")
			.replaceAll("*", ".*")
			.replaceAll("?", ".")}$`, "iu");
		if (!expression.test(host)) continue;
		if (negated) return false;
		matched = true;
	}
	return matched;
}

function validateCommand(command: string, args: string[]): void {
	if (!command || /[;&|`$<>()\n\r]/.test(command) || args.some((arg) => /[;&|`$<>()\n\r]/.test(arg))) throw new Error("Shell syntax is not allowed.");
	if (command === "pwd" && args.length === 0) return;
	if (command === "git" && isReadOnlyGitArguments(args)) return;
	throw new Error("Command is not allowlisted.");
}

function isReadOnlyGitArguments(args: readonly string[]): boolean {
	const [subcommand, ...rest] = args;
	if (subcommand === "status") {
		return rest.every(arg => ["--short", "--branch", "--porcelain", "--porcelain=v1", "--porcelain=v2", "-s", "-b", "-sb"].includes(arg));
	}
	if (subcommand === "branch") {
		return rest.length === 1 && ["--show-current", "--list"].includes(rest[0] ?? "");
	}
	if (subcommand === "rev-parse") {
		const joined = rest.join(" ");
		return ["--show-toplevel", "--git-common-dir", "--is-inside-work-tree", "--abbrev-ref HEAD"].includes(joined);
	}
	if (subcommand === "log") {
		const count = rest.find(arg => /^--max-count=\d+$/u.test(arg) || /^-n\d+$/u.test(arg));
		if (!count) return false;
		const value = Number.parseInt(count.replace(/^--max-count=|-n/u, ""), 10);
		return value >= 1 && value <= 100 && rest.every(arg =>
			["--oneline", "--decorate"].includes(arg) ||
			/^--max-count=\d+$/u.test(arg) ||
			/^-n\d+$/u.test(arg),
		);
	}
	return false;
}

async function run(command: string, args: string[], cwd: string, signal: AbortSignal): Promise<{ stdout: string; stderr: string; output: string; exitCode: number | undefined; error?: string }> {
	if (signal.aborted) return { stdout: "", stderr: "", output: "", exitCode: undefined, error: "Command aborted." };
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(new Error("Command timed out.")), TIMEOUT_MS);
	const abort = () => controller.abort(signal.reason);
	signal.addEventListener("abort", abort, { once: true });
	try {
		const env = command === "git"
			? {
				...process.env,
				GIT_OPTIONAL_LOCKS: "0",
				GIT_PAGER: "cat",
				GIT_CONFIG_NOSYSTEM: "1",
				GIT_CONFIG_GLOBAL: "/dev/null",
				GIT_CONFIG_COUNT: "2",
				GIT_CONFIG_KEY_0: "core.fsmonitor",
				GIT_CONFIG_VALUE_0: "false",
				GIT_CONFIG_KEY_1: "log.showSignature",
				GIT_CONFIG_VALUE_1: "false",
			}
			: process.env;
		const child = Bun.spawn([command, ...args], { cwd, env, stdout: "pipe", stderr: "pipe", signal: controller.signal });
		const [exitCode, stdout, stderr] = await Promise.all([
			child.exited,
			new Response(child.stdout).text(),
			new Response(child.stderr).text(),
		]);
		return { stdout: tail(stdout), stderr: tail(stderr), output: tail(`${stdout}${stderr ? `${stdout ? "\n" : ""}${stderr}` : ""}`), exitCode };
	} catch (error) {
		return { stdout: "", stderr: "", output: "", exitCode: undefined, error: errorMessage(error) };
	} finally { clearTimeout(timeout); signal.removeEventListener("abort", abort); }
}

function generic(toolName: string, input: string, output: string, startedAt: number, isError = false, error?: string): AgentToolExecution {
	const snapshot: GenericToolResultSnapshot = { id: id(), toolName, status: isError ? "failed" : "passed", input: safe(input), output: safe(tail(output)), startedAt, durationMs: Date.now() - startedAt, error: error ? safe(error) : undefined };
	return { modelContent: snapshot.output, isError, snapshot };
}
function genericError(toolName: string, input: unknown, error: unknown, startedAt: number, signal: AbortSignal): AgentToolExecution { return generic(toolName, typeof input === "object" && input ? JSON.stringify(input) : "", errorMessage(error), startedAt, true, errorMessage(error)); }
function stringArgument(args: Record<string, unknown>, name: string): string { if (typeof args[name] !== "string" || !args[name]) throw new Error(`Missing ${name}.`); return args[name]; }
function optionalStringArgument(args: Record<string, unknown>, name: string): string | undefined { if (args[name] === undefined) return undefined; return stringArgument(args, name); }
function tail(value: string): string {
	const bytes = new TextEncoder().encode(value);
	if (bytes.length <= MAX_OUTPUT_BYTES) return value;
	const prefix = "… output truncated\n";
	const retained = MAX_OUTPUT_BYTES - new TextEncoder().encode(prefix).length;
	return `${prefix}${new TextDecoder().decode(bytes.slice(-retained))}`;
}
function safe(value: string): string { return tail(value.replace(/\x1b\][\s\S]*?(?:\x07|\x1b\\)/g, "").replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "").replace(/[\x00-\x08\x0b-\x1f\x7f]/g, "").replace(/\b(authorization|token|credential|password|api[-_]?key|secret)\s*([:=])\s*([^\s,;]+)/gi, "$1$2[REDACTED]").replace(/\b(sk-[A-Za-z0-9_-]{8,}|gh[pousr]_[A-Za-z0-9_]{8,})\b/g, "[REDACTED]")); }
function errorMessage(error: unknown): string { return error instanceof Error ? error.message : String(error); }
function id(): string { return `tool-${crypto.randomUUID()}`; }

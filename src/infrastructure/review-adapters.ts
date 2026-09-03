import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Context, Models, ModelsSimpleStreamOptions } from "@earendil-works/pi-ai";
import {
	reviewPacketInput,
	stableJson,
	verifyReviewPacket,
	type ReviewAdapter,
	type ReviewDelivery,
	type ReviewDigester,
	type ReviewGenerationClient,
	type ReviewPacket,
	type ReviewProvider,
	type ReviewUsage,
} from "../domain/review";
import { redactForExternalReview } from "../domain/redaction";
import type { SessionModelUsageObservation } from "../application/session-model-usage.js";

export const CLAUDE_OPUS_REVIEW_MODEL = "claude-opus-5";
export const GEMINI_REVIEW_MODEL = "gemini-3.1-pro-preview";
export const CLAUDE_CLI_REVIEW_INPUT_LIMIT = 32 * 1024;
export const CLAUDE_CLI_REVIEW_OUTPUT_LIMIT = 64 * 1024;
export const CLAUDE_CLI_REVIEW_TIMEOUT_MS = 60_000;

const MODEL_ALIASES: Readonly<Record<ReviewProvider, Readonly<Record<string, string>>>> = Object.freeze({
	anthropic: Object.freeze({ "claude-opus": CLAUDE_OPUS_REVIEW_MODEL, [CLAUDE_OPUS_REVIEW_MODEL]: CLAUDE_OPUS_REVIEW_MODEL }),
	google: Object.freeze({ gemini: GEMINI_REVIEW_MODEL, [GEMINI_REVIEW_MODEL]: GEMINI_REVIEW_MODEL }),
});

export interface ReviewModelSelection {
	readonly model?: string;
	readonly version?: string;
}

export interface ReviewAdapterOptions {
	readonly anthropic?: ReviewModelSelection;
	readonly google?: ReviewModelSelection;
}

export interface ProductionReviewAdapterOptions extends ReviewAdapterOptions {
	/** Installed Claude CLI provenance, resolved only when Claude review is sent. */
	readonly claudeCliVersion: string | (() => string);
	readonly claudeCli?: ClaudeCliReviewAdapterOptions;
}

/** The only pi-ai surface review dispatch may use: model resolution and one stream. */
export type PiReviewModels = Pick<Models, "getModel" | "streamSimple">;

export function sha256ReviewDigest(value: string): string {
	return createHash("sha256").update(value, "utf8").digest("hex");
}

/**
 * Production generation bridge for detached reviews. It creates a fresh,
 * tool-free single-message context for every packet and never receives a cwd
 * or filesystem capability.
 */
export class PiReviewGenerationClient implements ReviewGenerationClient {
	constructor(
		private readonly models: PiReviewModels,
		private readonly observeUsage?: (observation: SessionModelUsageObservation) => void,
	) {}

	async generate(request: import("../domain/review").ReviewGenerationRequest): Promise<string> {
		assertDetachedRequest(request);
		const model = this.models.getModel(request.provider, request.model);
		if (!model) throw new Error(`Review model is not available: ${request.provider}/${request.model}`);
		const context: Context = {
			systemPrompt: "You are an independent read-only reviewer. Review only the supplied redacted packet. Do not call tools, access files, infer omitted project data, or request credentials.",
			messages: [{ role: "user", content: request.input, timestamp: Date.now() }],
			tools: [],
		};
		const options: ModelsSimpleStreamOptions = { toolChoice: "none" };
		const stream = this.models.streamSimple(model, context, options);
		const response = await stream.result();
		const totalTokens = response.usage?.totalTokens;
		if (this.observeUsage && Number.isSafeInteger(totalTokens) && (totalTokens ?? -1) >= 0) {
			try { this.observeUsage({ model: request.model, effort: null, totalTokens: totalTokens! }); } catch { /* Telemetry cannot invalidate a review response. */ }
		}
		if (response.stopReason === "toolUse" || response.content.some(block => block.type === "toolCall")) {
			throw new Error("Review providers may not return tool calls");
		}
		if (response.stopReason === "error" || response.stopReason === "aborted") {
			throw new Error(response.errorMessage ?? "Review provider failed");
		}
		return response.content.filter(block => block.type === "text").map(block => block.text).join("");
	}
}

/**
 * A narrow adapter: packet text is its sole input, no project path or tools
 * can cross this boundary, and only the provider API client is invoked.
 */
export class ProviderReviewAdapter implements ReviewAdapter {
	constructor(
		readonly provider: ReviewProvider,
		readonly model: string,
		readonly version: string,
		private readonly client: ReviewGenerationClient,
		private readonly digest: ReviewDigester = sha256ReviewDigest,
		private readonly clock: () => Date = () => new Date(),
	) {
		if (resolveModel(provider, model) !== model) throw new Error(`Unsupported ${provider} review model`);
		if (typeof version !== "string" || version.trim().length === 0) throw new Error("Review adapter version is required");
	}

	async review(packet: ReviewPacket): Promise<ReviewDelivery> {
		verifyReviewPacket(packet, this.digest);
		const sentAt = this.clock().toISOString();
		const input = reviewPacketInput(packet, this.digest);
		const result = await this.client.generate(Object.freeze({
			provider: this.provider,
			model: this.model,
			version: this.version,
			cwd: "",
			tools: [] as [],
			readOnly: true,
			networkAccess: "provider-api-only",
			input,
			packetDigest: packet.digest,
		}));
		if (typeof result !== "string") throw new Error("Review provider returned a non-text result");
		const safeResult = redactForExternalReview(result).text;
		const receivedAt = this.clock().toISOString();
		return Object.freeze({
			provider: this.provider,
			model: this.model,
			version: this.version,
			transport: "provider-api",
			packetDigest: packet.digest,
			sentAt,
			receivedAt,
			result: safeResult,
			resultDigest: this.digest(safeResult),
		});
	}
}

export type ClaudeCliReviewFailureCode = "unavailable" | "authentication" | "subscription-limit" | "timeout" | "malformed-json" | "process";

export class ClaudeCliReviewError extends Error {
	constructor(readonly code: ClaudeCliReviewFailureCode, message: string) {
		super(message);
		this.name = "ClaudeCliReviewError";
	}
}

export interface ClaudeCliProcessResult {
	readonly exitCode: number;
	readonly stdout: string;
	readonly stderr: string;
	readonly timedOut?: boolean;
}

export type ClaudeCliProcessRunner = (
	command: string,
	args: readonly string[],
	options: { readonly cwd: string; readonly input: string; readonly timeoutMs: number; readonly outputLimit: number },
) => Promise<ClaudeCliProcessResult>;

export interface ClaudeCliReviewAdapterOptions {
	readonly command?: string;
	readonly timeoutMs?: number;
	readonly inputLimit?: number;
	readonly outputLimit?: number;
	readonly runner?: ClaudeCliProcessRunner;
	readonly makeTempDirectory?: () => Promise<string>;
	readonly removeDirectory?: (path: string) => Promise<void>;
	readonly clock?: () => Date;
}

export interface ClaudeCliSubprocess {
	readonly pid: number;
	readonly stdin: { write(input: string): unknown; end(): unknown };
	readonly stdout: ReadableStream<Uint8Array>;
	readonly stderr: ReadableStream<Uint8Array>;
	readonly exited: Promise<number>;
	kill(signal?: NodeJS.Signals): void;
}

export interface ClaudeCliSystemRunnerDependencies {
	spawn(command: string, args: readonly string[], cwd: string): ClaudeCliSubprocess;
	killProcessGroup(pid: number, signal: NodeJS.Signals): void;
	setTimer(callback: () => void, ms: number): ReturnType<typeof setTimeout>;
	clearTimer(timer: ReturnType<typeof setTimeout>): void;
}

/**
 * Claude Code subscription transport. It has no implicit Provider API retry:
 * callers must explicitly select a ProviderReviewAdapter when that fallback is
 * appropriate, preserving unambiguous packet delivery evidence.
 */
export class ClaudeCliReviewAdapter implements ReviewAdapter {
	readonly provider = "anthropic" as const;
	private readonly command: string;
	private readonly timeoutMs: number;
	private readonly inputLimit: number;
	private readonly outputLimit: number;
	private readonly run: ClaudeCliProcessRunner;
	private readonly makeTempDirectory: () => Promise<string>;
	private readonly removeDirectory: (path: string) => Promise<void>;
	private readonly clock: () => Date;

	constructor(
		readonly model: string,
		/** Installed Claude CLI provenance, supplied by composition rather than guessed. */
		private readonly cliVersion: string | (() => string),
		private readonly digest: ReviewDigester = sha256ReviewDigest,
		options: ClaudeCliReviewAdapterOptions = {},
	) {
		if (resolveModel("anthropic", model) !== model) throw new Error("Unsupported anthropic review model");
		if (typeof cliVersion === "string" && cliVersion.trim().length === 0) throw new Error("Claude CLI version is required");
		this.command = options.command ?? "claude";
		this.timeoutMs = options.timeoutMs ?? CLAUDE_CLI_REVIEW_TIMEOUT_MS;
		this.inputLimit = options.inputLimit ?? CLAUDE_CLI_REVIEW_INPUT_LIMIT;
		this.outputLimit = options.outputLimit ?? CLAUDE_CLI_REVIEW_OUTPUT_LIMIT;
		if (!Number.isSafeInteger(this.timeoutMs) || this.timeoutMs <= 0 || !Number.isSafeInteger(this.inputLimit) || this.inputLimit <= 0 || !Number.isSafeInteger(this.outputLimit) || this.outputLimit <= 0) throw new Error("Claude CLI review bounds must be positive integers");
		this.run = options.runner ?? systemClaudeCliRunner;
		this.makeTempDirectory = options.makeTempDirectory ?? (() => mkdtemp(join(tmpdir(), "www-claude-review-")));
		this.removeDirectory = options.removeDirectory ?? (path => rm(path, { recursive: true, force: true }));
		this.clock = options.clock ?? (() => new Date());
	}

	get version(): string {
		const version = typeof this.cliVersion === "function" ? this.cliVersion() : this.cliVersion;
		if (typeof version !== "string" || version.trim().length === 0) {
			throw new ClaudeCliReviewError("unavailable", "Claude CLI version is unavailable");
		}
		return version;
	}

	async review(packet: ReviewPacket): Promise<ReviewDelivery> {
		verifyReviewPacket(packet, this.digest);
		const input = reviewPacketInput(packet, this.digest);
		if (Buffer.byteLength(input, "utf8") > this.inputLimit) throw new ClaudeCliReviewError("process", "Claude CLI review input exceeds its budget");
		const version = this.version;
		const cwd = await this.makeTempDirectory();
		const sentAt = this.clock().toISOString();
		try {
			const response = await this.run(this.command, [
				"--print", "--output-format", "json", "--model", this.model,
				"--tools", "", "--no-session-persistence",
			], { cwd, input, timeoutMs: this.timeoutMs, outputLimit: this.outputLimit });
			if (response.timedOut) throw new ClaudeCliReviewError("timeout", "Claude CLI review timed out");
			if (Buffer.byteLength(response.stdout, "utf8") > this.outputLimit || Buffer.byteLength(response.stderr, "utf8") > this.outputLimit) throw new ClaudeCliReviewError("process", "Claude CLI review output exceeds its budget");
			if (response.exitCode !== 0) throw classifyClaudeCliFailure(response.stderr || response.stdout);
			const parsed = parseClaudeCliResult(response.stdout);
			const safeResult = redactForExternalReview(parsed.result).text;
			const receivedAt = this.clock().toISOString();
			return Object.freeze({
				provider: this.provider, model: this.model, version, transport: "claude-cli",
				packetDigest: packet.digest, sentAt, receivedAt, result: safeResult, resultDigest: this.digest(safeResult),
				usage: parsed.usage,
			});
		} finally {
			await this.removeDirectory(cwd);
		}
	}
}

function parseClaudeCliResult(stdout: string): { result: string; usage?: ReviewUsage } {
	let value: unknown;
	try { value = JSON.parse(stdout); } catch { throw new ClaudeCliReviewError("malformed-json", "Claude CLI returned malformed JSON"); }
	if (!value || typeof value !== "object" || typeof (value as { result?: unknown }).result !== "string") {
		throw new ClaudeCliReviewError("malformed-json", "Claude CLI JSON has no text result");
	}
	const usage = observedUsage((value as { usage?: unknown }).usage);
	return usage ? { result: (value as { result: string }).result, usage } : { result: (value as { result: string }).result };
}

function observedUsage(value: unknown): ReviewUsage | undefined {
	if (!value || typeof value !== "object") return undefined;
	const source = value as Record<string, unknown>;
	const usage: ReviewUsage = {
		inputTokens: token(source.input_tokens),
		outputTokens: token(source.output_tokens),
		cacheCreationInputTokens: token(source.cache_creation_input_tokens),
		cacheReadInputTokens: token(source.cache_read_input_tokens),
	};
	return Object.values(usage).some(count => count !== undefined) ? usage : undefined;
}

function token(value: unknown): number | undefined {
	return Number.isSafeInteger(value) && (value as number) >= 0 ? value as number : undefined;
}

function classifyClaudeCliFailure(output: string): ClaudeCliReviewError {
	const normalized = output.toLowerCase();
	if (/(not logged in|login required|authentication|auth.*required)/u.test(normalized)) return new ClaudeCliReviewError("authentication", "Claude CLI authentication is unavailable");
	if (/(rate limit|usage limit|subscription|quota.*exceeded)/u.test(normalized)) return new ClaudeCliReviewError("subscription-limit", "Claude CLI subscription limit was reached");
	return new ClaudeCliReviewError("process", "Claude CLI review process failed");
}

const SYSTEM_CLAUDE_CLI_RUNNER_DEPENDENCIES: ClaudeCliSystemRunnerDependencies = {
	spawn: (command, args, cwd) => Bun.spawn([command, ...args], {
		cwd, stdin: "pipe", stdout: "pipe", stderr: "pipe", detached: true,
	}),
	killProcessGroup: (pid, signal) => process.kill(-pid, signal),
	setTimer: (callback, ms) => setTimeout(callback, ms),
	clearTimer: timer => clearTimeout(timer),
};

/**
 * Runs Claude in its own process group. Output is consumed while the process is
 * running, so a verbose or compromised CLI cannot make us buffer an unbounded
 * response before its budget is checked.
 */
export function createSystemClaudeCliRunner(
	dependencies: ClaudeCliSystemRunnerDependencies = SYSTEM_CLAUDE_CLI_RUNNER_DEPENDENCIES,
): ClaudeCliProcessRunner {
	return async (command, args, options) => {
		const child = dependencies.spawn(command, args, options.cwd);
		child.stdin.write(options.input);
		child.stdin.end();
		let timedOut = false;
		let terminating = false;
		const terminate = (signal: NodeJS.Signals) => {
			if (terminating) return;
			terminating = true;
			try { dependencies.killProcessGroup(child.pid, signal); } catch { child.kill(signal); }
		};
		const stdout = readCappedClaudeCliStream(child.stdout, options.outputLimit, () => terminate("SIGTERM"));
		const stderr = readCappedClaudeCliStream(child.stderr, options.outputLimit, () => terminate("SIGTERM"));
		const timer = dependencies.setTimer(() => {
			timedOut = true;
			terminate("SIGTERM");
		}, options.timeoutMs);
		try {
			const exitCode = await child.exited;
			const [stdoutText, stderrText] = await Promise.all([stdout, stderr]);
			return { exitCode, stdout: stdoutText, stderr: stderrText, timedOut };
		} finally {
			dependencies.clearTimer(timer);
			if (timedOut) {
				// A group leader may exit before descendants. Escalate and bound
				// reaping so timeout handling itself cannot hang a review.
				try { dependencies.killProcessGroup(child.pid, "SIGKILL"); } catch { child.kill("SIGKILL"); }
				await Promise.race([
					child.exited.then(() => undefined),
					new Promise<void>(resolve => dependencies.setTimer(resolve, 1_000)),
				]);
			}
		}
	};
}

async function readCappedClaudeCliStream(
	stream: ReadableStream<Uint8Array>,
	limit: number,
	onLimit: () => void,
): Promise<string> {
	const reader = stream.getReader();
	const chunks: Uint8Array[] = [];
	let size = 0;
	try {
		for (;;) {
			const next = await reader.read();
			if (next.done) break;
			const remaining = limit + 1 - size;
			if (next.value.byteLength > remaining) {
				chunks.push(next.value.subarray(0, Math.max(0, remaining)));
				onLimit();
				await reader.cancel();
				break;
			}
			chunks.push(next.value);
			size += next.value.byteLength;
			if (size > limit) {
				onLimit();
				await reader.cancel();
				break;
			}
		}
	} finally {
		reader.releaseLock();
	}
	return new TextDecoder().decode(concatClaudeCliChunks(chunks));
}

function concatClaudeCliChunks(chunks: readonly Uint8Array[]): Uint8Array {
	const size = chunks.reduce((total, chunk) => total + chunk.byteLength, 0);
	const output = new Uint8Array(size);
	let offset = 0;
	for (const chunk of chunks) {
		output.set(chunk, offset);
		offset += chunk.byteLength;
	}
	return output;
}

export const systemClaudeCliRunner = createSystemClaudeCliRunner();

export function createReviewAdapters(client: ReviewGenerationClient, options: ReviewAdapterOptions = {}, digest: ReviewDigester = sha256ReviewDigest): ReadonlyMap<ReviewProvider, ReviewAdapter> {
	const anthropic = createAdapter("anthropic", options.anthropic, client, digest);
	const google = createAdapter("google", options.google, client, digest);
	return new Map<ReviewProvider, ReviewAdapter>([[anthropic.provider, anthropic], [google.provider, google]]);
}

/** Production uses the Claude subscription transport. Provider API use remains
 * an explicit call to createReviewAdapters, rather than an implicit retry. */
export function createProductionReviewAdapters(
	client: ReviewGenerationClient,
	options: ProductionReviewAdapterOptions,
	digest: ReviewDigester = sha256ReviewDigest,
): ReadonlyMap<ReviewProvider, ReviewAdapter> {
	const anthropicModel = resolveModel("anthropic", options.anthropic?.model ?? CLAUDE_OPUS_REVIEW_MODEL);
	const google = createAdapter("google", options.google, client, digest);
	const anthropic = new ClaudeCliReviewAdapter(
		anthropicModel,
		options.claudeCliVersion,
		digest,
		options.claudeCli,
	);
	return new Map<ReviewProvider, ReviewAdapter>([[anthropic.provider, anthropic], [google.provider, google]]);
}

export function installedClaudeCliVersion(command = "claude"): string {
	try {
		const result = Bun.spawnSync([command, "--version"], { stdout: "pipe", stderr: "pipe" });
		if (result.exitCode !== 0) throw new ClaudeCliReviewError("unavailable", "Claude CLI version is unavailable");
		const version = new TextDecoder().decode(result.stdout).trim();
		if (version.length === 0) throw new ClaudeCliReviewError("unavailable", "Claude CLI version is unavailable");
		return version;
	} catch (error) {
		if (error instanceof ClaudeCliReviewError) throw error;
		throw new ClaudeCliReviewError("unavailable", "Claude CLI version is unavailable");
	}
}

function createAdapter(provider: ReviewProvider, selection: ReviewModelSelection | undefined, client: ReviewGenerationClient, digest: ReviewDigester): ProviderReviewAdapter {
	const fallback = provider === "anthropic" ? CLAUDE_OPUS_REVIEW_MODEL : GEMINI_REVIEW_MODEL;
	const model = resolveModel(provider, selection?.model ?? fallback);
	const version = selection?.version ?? model;
	return new ProviderReviewAdapter(provider, model, version, client, digest);
}

function resolveModel(provider: ReviewProvider, requested: string): string {
	const resolved = MODEL_ALIASES[provider][requested];
	if (!resolved) throw new Error(`Unsupported ${provider} review model: ${requested}`);
	return resolved;
}

function assertDetachedRequest(request: import("../domain/review").ReviewGenerationRequest): void {
	if (request.cwd !== "" || request.readOnly !== true || request.networkAccess !== "provider-api-only" || request.tools.length !== 0) {
		throw new Error("Review generation request is not detached");
	}
}

export function immutableReviewRecord(value: ReviewDelivery): string {
	return stableJson({
		provider: value.provider,
		model: value.model,
		version: value.version,
		...(value.transport ? { transport: value.transport } : {}),
		packetDigest: value.packetDigest,
		resultDigest: value.resultDigest,
		sentAt: value.sentAt,
		receivedAt: value.receivedAt,
		...(value.usage ? { usage: value.usage } : {}),
	});
}

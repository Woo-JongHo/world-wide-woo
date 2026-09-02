import { describe, expect, test } from "bun:test";
import { afterEach } from "bun:test";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Api, AssistantMessage, AssistantMessageEventStream, Context, Model, ModelsSimpleStreamOptions } from "@earendil-works/pi-ai";
import { ReviewService } from "../src/application/review-service";
import { createReviewPacket } from "../src/domain/review";
import { redactForExternalReview } from "../src/domain/redaction";
import { CLAUDE_OPUS_REVIEW_MODEL, CLAUDE_CLI_REVIEW_INPUT_LIMIT, ClaudeCliReviewAdapter, GEMINI_REVIEW_MODEL, PiReviewGenerationClient, ProviderReviewAdapter, createProductionReviewAdapters, createReviewAdapters, createSystemClaudeCliRunner, sha256ReviewDigest } from "../src/infrastructure/review-adapters";
import { FileReviewProvenanceStore } from "../src/infrastructure/review-store";

const directories: string[] = [];
afterEach(async () => { await Promise.all(directories.splice(0).map(path => rm(path, { recursive: true, force: true }))); });
const publicText = (value: string) => ({ value, sensitivity: "public" as const });

describe("external review boundary", () => {
	test("redacts paths, credentials, and customer identifiers before making an immutable preview", () => {
		const preview = createReviewPacket({
			createdAt: "2026-09-01T00:00:00.000Z",
			purpose: publicText("RPA 검토"),
			request: publicText("token=very-secret customer_id=ACME-42 /Users/jonghoPro/private/client.csv"),
			context: publicText("담당자 alice@example.com, ../customer/run.log, AKIA1234567890ABCDEF"),
		}, sha256ReviewDigest);
		const encoded = JSON.stringify(preview.packet);
		for (const forbidden of ["very-secret", "ACME-42", "/Users/", "alice@example.com", "../customer", "AKIA"]) expect(encoded).not.toContain(forbidden);
		expect(preview.findings.map(finding => finding.kind)).toEqual(expect.arrayContaining(["secret", "customer-identifier", "local-path"]));
		expect(Object.isFrozen(preview.packet)).toBe(true);
		expect(() => { (preview.packet as { request: string }).request = "changed"; }).toThrow();
		expect(redactForExternalReview("C:\\work\\client\\input.csv and src/client/input.csv").text).toContain("[redacted:local-path]");
		expect(() => createReviewPacket({ purpose: publicText("review"), request: { value: "ACME", sensitivity: "customer" } }, sha256ReviewDigest)).toThrow("denied by sensitivity");
		expect(() => createReviewPacket({ purpose: publicText("review"), request: { value: "unclassified", sensitivity: "unknown" } }, sha256ReviewDigest)).toThrow("denied by sensitivity");
	});

	test("keeps generic numbers but redacts separated and phone-labelled telephone numbers", () => {
		const generic = redactForExternalReview("timestamp=1711929600 count=1234567890");
		expect(generic).toEqual({ text: "timestamp=1711929600 count=1234567890", findings: [] });

		const separated = redactForExternalReview("call 010-1234-5678 or +82 10 1234 5678");
		expect(separated.text).not.toContain("010-1234-5678");
		expect(separated.text).not.toContain("+82 10 1234 5678");

		const labelled = redactForExternalReview("phone=01012345678 tel:0212345678 mobile 821012345678");
		for (const number of ["01012345678", "0212345678", "821012345678"]) expect(labelled.text).not.toContain(number);
		expect(labelled.findings).toHaveLength(3);
	});

	test("requires the exact reviewed digest and sends only a constrained packet to Claude Opus", async () => {
		const calls: unknown[] = [];
		const adapter = new ProviderReviewAdapter("anthropic", CLAUDE_OPUS_REVIEW_MODEL, "2026-09-01", {
			generate: async request => {
				calls.push(request);
				return "검토 결과: safe\ncustomer_id=should-not-leak";
			},
		}, sha256ReviewDigest, (() => {
			const times = [new Date("2026-09-01T01:00:00.000Z"), new Date("2026-09-01T01:00:02.000Z")];
			return () => times.shift() ?? new Date("2026-09-01T01:00:03.000Z");
		})());
		const root = await mkdtemp(join(tmpdir(), "www-review-")); directories.push(root);
		const store = new FileReviewProvenanceStore(join(root, "review-provenance.jsonl"));
		const service = new ReviewService(new Map([["anthropic", adapter]]), sha256ReviewDigest, store);
		const preview = service.preview({ purpose: publicText("review"), request: publicText("검토 /private/client.txt"), createdAt: "2026-09-01T00:00:00.000Z" });
		await expect(service.send({ packet: preview.packet, acceptedDigest: "wrong", provider: "anthropic" })).rejects.toThrow("exact preview digest");
		expect(calls).toHaveLength(0);
		const delivery = await service.send({ packet: preview.packet, acceptedDigest: preview.packet.digest, provider: "anthropic" });
		expect(calls).toEqual([expect.objectContaining({
			provider: "anthropic", model: CLAUDE_OPUS_REVIEW_MODEL, version: "2026-09-01", cwd: "", tools: [], readOnly: true,
			networkAccess: "provider-api-only", packetDigest: preview.packet.digest,
		})]);
		expect(JSON.stringify(calls)).not.toContain("/private/client.txt");
		expect(delivery.result).not.toContain("should-not-leak");
		expect(delivery.resultDigest).toBe(sha256ReviewDigest(delivery.result));
		expect(service.provenance()).toEqual([expect.objectContaining({ transport: "provider-api", packetDigest: preview.packet.digest, resultDigest: delivery.resultDigest, sentAt: "2026-09-01T01:00:00.000Z", receivedAt: "2026-09-01T01:00:02.000Z" })]);
		expect(await new FileReviewProvenanceStore(join(root, "review-provenance.jsonl")).readAll()).toEqual(service.provenance());
	});

	test("factory isolates anthropic and google review adapters from the chat router", async () => {
		const calls: unknown[] = [];
		const adapters = createReviewAdapters({ generate: async request => { calls.push(request); return "done"; } }, { anthropic: { model: "claude-opus", version: "opus-v" }, google: { model: "gemini", version: "gemini-v" } });
		const packet = createReviewPacket({ purpose: publicText("review"), request: publicText("only this"), createdAt: "2026-09-01T00:00:00.000Z" }, sha256ReviewDigest).packet;
		await adapters.get("anthropic")!.review(packet);
		await adapters.get("google")!.review(packet);
		expect(calls).toEqual([
			expect.objectContaining({ provider: "anthropic", model: CLAUDE_OPUS_REVIEW_MODEL, version: "opus-v", cwd: "", tools: [] }),
			expect.objectContaining({ provider: "google", model: GEMINI_REVIEW_MODEL, version: "gemini-v", cwd: "", tools: [] }),
		]);
	});

	test("Pi production bridge uses a fresh tool-free packet-only context and rejects tool output", async () => {
		const model = {} as Model<Api>;
		let observed: { context: Context; options: ModelsSimpleStreamOptions } | undefined;
		const observedUsage: unknown[] = [];
		const response = { role: "assistant", content: [{ type: "text", text: "독립 검토" }], stopReason: "stop", usage: { totalTokens: 4_321 } } as AssistantMessage;
		const client = new PiReviewGenerationClient({
			getModel: (provider, id) => provider === "anthropic" && id === CLAUDE_OPUS_REVIEW_MODEL ? model : undefined,
			streamSimple: (_model, context, options) => {
				observed = { context, options: options ?? {} };
				return { result: async () => response } as AssistantMessageEventStream;
			},
		}, observation => observedUsage.push(observation));
		await expect(client.generate({ provider: "anthropic", model: CLAUDE_OPUS_REVIEW_MODEL, version: "opus-v", cwd: "", tools: [], readOnly: true, networkAccess: "provider-api-only", input: "packet only", packetDigest: "a".repeat(64) })).resolves.toBe("독립 검토");
		expect(observed).toEqual(expect.objectContaining({ options: { toolChoice: "none" } }));
		expect(observed?.context).toEqual(expect.objectContaining({ tools: [], messages: [expect.objectContaining({ role: "user", content: "packet only" })] }));
		expect(observedUsage).toEqual([{ model: CLAUDE_OPUS_REVIEW_MODEL, effort: null, totalTokens: 4_321 }]);
		const toolClient = new PiReviewGenerationClient({
			getModel: () => model,
			streamSimple: () => ({ result: async () => ({ role: "assistant", content: [{ type: "toolCall" }], stopReason: "toolUse" } as AssistantMessage) }) as AssistantMessageEventStream,
		});
		await expect(toolClient.generate({ provider: "anthropic", model: CLAUDE_OPUS_REVIEW_MODEL, version: "opus-v", cwd: "", tools: [], readOnly: true, networkAccess: "provider-api-only", input: "packet only", packetDigest: "a".repeat(64) })).rejects.toThrow("may not return tool calls");
	});

	test("Claude CLI transport runs one bounded packet-only print request in a blank temporary cwd and records observed evidence", async () => {
		const calls: unknown[] = [];
		const removed: string[] = [];
		const adapter = new ClaudeCliReviewAdapter(CLAUDE_OPUS_REVIEW_MODEL, "2.1.3", sha256ReviewDigest, {
			makeTempDirectory: async () => mkdtemp(join(tmpdir(), "www-empty-review-cwd-")),
			removeDirectory: async path => { removed.push(path); await rm(path, { recursive: true, force: true }); },
			clock: (() => {
				const times = [new Date("2026-09-01T01:00:00.000Z"), new Date("2026-09-01T01:00:02.000Z")];
				return () => times.shift() ?? new Date();
			})(),
			runner: async (command, args, options) => {
				expect(await readdir(options.cwd)).toEqual([]);
				calls.push({ command, args, options });
				return { exitCode: 0, stderr: "", stdout: JSON.stringify({ result: "독립 검토", usage: { input_tokens: 12, output_tokens: 7 } }) };
			},
		});
		const packet = createReviewPacket({ purpose: publicText("review"), request: publicText("packet only"), createdAt: "2026-09-01T00:00:00.000Z" }, sha256ReviewDigest).packet;
		const delivery = await adapter.review(packet);
		expect(calls).toEqual([expect.objectContaining({
			command: "claude",
			args: ["--print", "--output-format", "json", "--model", CLAUDE_OPUS_REVIEW_MODEL, "--tools", "", "--no-session-persistence"],
			options: expect.objectContaining({ cwd: expect.stringContaining("www-empty-review-cwd-"), timeoutMs: 60_000, outputLimit: 64 * 1024 }),
		})]);
		const input = (calls[0] as { options: { input: string } }).options.input;
		expect(Buffer.byteLength(input, "utf8")).toBeLessThanOrEqual(CLAUDE_CLI_REVIEW_INPUT_LIMIT);
		expect(input).toContain(packet.digest);
		expect(input).not.toContain("resume");
		expect(removed).toHaveLength(1);
		expect(delivery).toMatchObject({
			transport: "claude-cli", model: CLAUDE_OPUS_REVIEW_MODEL, version: "2.1.3", packetDigest: packet.digest,
			sentAt: "2026-09-01T01:00:00.000Z", receivedAt: "2026-09-01T01:00:02.000Z",
			usage: { inputTokens: 12, outputTokens: 7 },
		});
		expect(delivery.resultDigest).toBe(sha256ReviewDigest(delivery.result));
	});

	test("Claude CLI classifies terminal failures and never retries an ambiguous packet", async () => {
		const packet = createReviewPacket({ purpose: publicText("review"), request: publicText("packet only"), createdAt: "2026-09-01T00:00:00.000Z" }, sha256ReviewDigest).packet;
		for (const [response, code] of [
			[{ exitCode: 1, stdout: "", stderr: "Not logged in" }, "authentication"],
			[{ exitCode: 1, stdout: "", stderr: "Subscription usage limit reached" }, "subscription-limit"],
			[{ exitCode: 0, stdout: "{", stderr: "" }, "malformed-json"],
			[{ exitCode: 0, stdout: "", stderr: "", timedOut: true }, "timeout"],
		] as const) {
			let calls = 0;
			const adapter = new ClaudeCliReviewAdapter(CLAUDE_OPUS_REVIEW_MODEL, "2.1.3", sha256ReviewDigest, {
				makeTempDirectory: async () => "/tmp/empty-review-cwd",
				removeDirectory: async () => {},
				runner: async () => { calls++; return response; },
			});
			await expect(adapter.review(packet)).rejects.toMatchObject({ name: "ClaudeCliReviewError", code });
			expect(calls).toBe(1);
		}
		const oversized = new ClaudeCliReviewAdapter(CLAUDE_OPUS_REVIEW_MODEL, "2.1.3", sha256ReviewDigest, {
			makeTempDirectory: async () => "/tmp/should-not-run",
			removeDirectory: async () => {},
			runner: async () => ({ exitCode: 0, stdout: "x".repeat(64 * 1024 + 1), stderr: "" }),
		});
		await expect(oversized.review(packet)).rejects.toMatchObject({ code: "process" });
	});

	test("Provider API remains explicitly labelled as the selected fallback transport", async () => {
		const adapter = new ProviderReviewAdapter("anthropic", CLAUDE_OPUS_REVIEW_MODEL, "api-v", { generate: async () => "provider result" });
		const packet = createReviewPacket({ purpose: publicText("review"), request: publicText("packet only"), createdAt: "2026-09-01T00:00:00.000Z" }, sha256ReviewDigest).packet;
		await expect(adapter.review(packet)).resolves.toMatchObject({ transport: "provider-api" });
	});

	test("production selection uses Claude CLI with its observed version; Provider API is not a retry path", async () => {
		const adapters = createProductionReviewAdapters(
			{ generate: async () => { throw new Error("Provider API must not be called"); } },
			{ claudeCliVersion: "claude 2.1.3", claudeCli: {
				makeTempDirectory: async () => "/tmp/production-claude",
				removeDirectory: async () => {},
				runner: async () => ({ exitCode: 1, stdout: "", stderr: "Not logged in" }),
			} },
		);
		const adapter = adapters.get("anthropic")!;
		const packet = createReviewPacket({ purpose: publicText("review"), request: publicText("packet only"), createdAt: "2026-09-01T00:00:00.000Z" }, sha256ReviewDigest).packet;
		expect(adapter).toBeInstanceOf(ClaudeCliReviewAdapter);
		expect(adapter.version).toBe("claude 2.1.3");
		await expect(adapter.review(packet)).rejects.toMatchObject({ code: "authentication" });
	});

	test("system Claude runner caps streamed output before process completion and kills its process group", async () => {
		let resolveExit!: (code: number) => void;
		const killed: string[] = [];
		const runner = createSystemClaudeCliRunner({
			spawn: () => ({
				pid: 42,
				stdin: { write: () => undefined, end: () => undefined },
				stdout: new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode("abcdef")); } }),
				stderr: new ReadableStream({ start(controller) { controller.close(); } }),
				exited: new Promise<number>(resolve => { resolveExit = resolve; }),
				kill: signal => { killed.push(`child:${signal}`); resolveExit(143); },
			}),
			killProcessGroup: (_pid, signal) => { killed.push(`group:${signal}`); resolveExit(143); },
			setTimer: () => 0 as unknown as ReturnType<typeof setTimeout>,
			clearTimer: () => {},
		});
		const result = await runner("claude", [], { cwd: "/tmp", input: "", timeoutMs: 1_000, outputLimit: 4 });
		expect(result.stdout).toHaveLength(5);
		expect(killed).toEqual(["group:SIGTERM"]);
	});

	test("system Claude runner times out by terminating and reaping the entire process group", async () => {
		let resolveExit!: (code: number) => void;
		const killed: string[] = [];
		const runner = createSystemClaudeCliRunner({
			spawn: () => ({
				pid: 43,
				stdin: { write: () => undefined, end: () => undefined },
				stdout: new ReadableStream({ start(controller) { controller.close(); } }),
				stderr: new ReadableStream({ start(controller) { controller.close(); } }),
				exited: new Promise<number>(resolve => { resolveExit = resolve; }),
				kill: signal => { killed.push(`child:${signal}`); resolveExit(143); },
			}),
			killProcessGroup: (_pid, signal) => { killed.push(`group:${signal}`); resolveExit(143); },
			setTimer: callback => {
				queueMicrotask(callback);
				return 0 as unknown as ReturnType<typeof setTimeout>;
			},
			clearTimer: () => {},
		});
		const result = await runner("claude", [], { cwd: "/tmp", input: "", timeoutMs: 1, outputLimit: 4 });
		expect(result.timedOut).toBe(true);
		expect(killed).toEqual(["group:SIGTERM", "group:SIGKILL"]);
	});
});

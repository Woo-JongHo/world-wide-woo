import { describe, expect, test } from "bun:test";
import { PiHarness, type PiHarnessSdk, type PiSession } from "../src/infrastructure/executors/pi-harness.js";
import { createNativeHarness, createProductionPiHarnessSdk, type PiSdkBindings } from "../src/infrastructure/executors/factory.js";
import { assertPhaseANativeHarnessContract, assertPhaseATerminalContract, type NativeHarnessContractFixture } from "./native-harness.contract.js";

class Deferred<T> {
	public readonly promise: Promise<T>;
	public resolve!: (value: T) => void;
	public reject!: (error: Error) => void;
	public constructor() {
		this.promise = new Promise<T>((resolve, reject) => {
			this.resolve = resolve;
			this.reject = reject;
		});
	}
}

type SessionEvent =
	| { type: "text-delta"; text: string }
	| { type: "reasoning-delta"; text: string };

class FakePiSession implements PiSession {
	public readonly promptResult = new Deferred<void>();
	public readonly listeners = new Set<(event: SessionEvent) => void>();
	public abortCalls = 0;
	public promptCalls: string[] = [];
	public prompt(text: string): Promise<void> { this.promptCalls.push(text); return this.promptResult.promise; }
	public abort(): void { this.abortCalls += 1; }
	public inspect(): Readonly<Record<string, unknown>> { return { messages: this.promptCalls }; }
	public subscribe(listener: (event: SessionEvent) => void): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}
	public emit(event: SessionEvent): void { for (const listener of this.listeners) listener(event); }
}

class FakePiSdk implements PiHarnessSdk {
	public readonly sessions: FakePiSession[] = [];
	public readonly createInputs: Array<Readonly<Record<string, unknown>>> = [];
	public createSession(input: Readonly<Record<string, unknown>>): PiSession {
		this.createInputs.push(input);
		const session = new FakePiSession();
		this.sessions.push(session);
		return session;
	}
}

function fixture(): Promise<NativeHarnessContractFixture> {
	const sdk = new FakePiSdk();
	return Promise.resolve({
		harness: new PiHarness({ sdk, provider: "openai-codex", model: "gpt-5.6-sol", effort: "high", systemPrompt: "WWW system prompt" }),
		settleSuccess: (text = "visible answer") => {
			sdk.sessions[0]?.emit({ type: "text-delta", text });
			sdk.sessions[0]?.promptResult.resolve();
		},
		settleFailure: (error = new Error("Pi failed")) => sdk.sessions[0]?.promptResult.reject(error),
		settleInterrupted: () => sdk.sessions[0]?.promptResult.reject(new DOMException("Interrupted", "AbortError")),
		emitReasoning: text => sdk.sessions[0]?.emit({ type: "reasoning-delta", text }),
	});
}

describe("PiHarness Phase A native compatibility", () => {
	test("keeps the observable start, text delta, terminal, and close contract without exposing reasoning", async () => {
		await assertPhaseANativeHarnessContract(fixture);
	});

	test("emits exactly one terminal for success and failure", async () => {
		await assertPhaseATerminalContract(fixture, subject => subject.settleSuccess(), "turn/completed");
		await assertPhaseATerminalContract(fixture, subject => subject.settleFailure(), "turn/failed");
	});

	test("interrupts the active session and emits one interrupted terminal", async () => {
		const sdk = new FakePiSdk();
		const harness = new PiHarness({ sdk, provider: "openai-codex", model: "gpt-5.6-sol", effort: "low", systemPrompt: "WWW system prompt" });
		const events: string[] = [];
		harness.subscribe(event => {
			if (event.type === "notification") events.push(event.method);
		});
		const thread = await harness.startThread({ cwd: "/workspace" });
		const turn = await harness.startTurn({ threadId: thread.id, text: "stop" });
		await Bun.sleep(5);
		await harness.interruptTurn({ threadId: thread.id, turnId: turn.id });
		expect(sdk.sessions[0]?.abortCalls).toBe(1);
		sdk.sessions[0]?.promptResult.reject(new DOMException("Interrupted", "AbortError"));
		await Bun.sleep(5);
		expect(events).toEqual(["turn/started", "turn/interrupted"]);
	});

	test("keeps an interrupted terminal when Pi resolves its prompt after abort", async () => {
		const sdk = new FakePiSdk();
		const harness = new PiHarness({ sdk, provider: "openai-codex", model: "gpt-5.6-sol", effort: "low", systemPrompt: "WWW system prompt" });
		const events: string[] = [];
		harness.subscribe(event => { if (event.type === "notification") events.push(event.method); });
		const thread = await harness.startThread({ cwd: "/workspace" });
		const turn = await harness.startTurn({ threadId: thread.id, text: "stop" });
		await Bun.sleep(5);
		await harness.interruptTurn({ threadId: thread.id, turnId: turn.id });
		sdk.sessions[0]?.promptResult.resolve();
		await Bun.sleep(5);
		expect(events).toEqual(["turn/started", "turn/interrupted"]);
	});

	test("interrupts before deferred Pi startup without issuing the prompt", async () => {
		const sdk = new FakePiSdk();
		const harness = new PiHarness({ sdk, provider: "openai-codex", model: "gpt-5.6-sol", effort: "low", systemPrompt: "WWW system prompt" });
		const events: string[] = [];
		harness.subscribe(event => { if (event.type === "notification") events.push(event.method); });
		const thread = await harness.startThread({ cwd: "/workspace" });
		const turn = await harness.startTurn({ threadId: thread.id, text: "must not run" });
		await harness.interruptTurn({ threadId: thread.id, turnId: turn.id });
		await Bun.sleep(5);
		expect(sdk.sessions[0]?.promptCalls).toEqual([]);
		expect(events).toEqual(["turn/started", "turn/interrupted"]);
	});

	test("rejects a concurrent turn and inspects only the current in-memory session", async () => {
		const sdk = new FakePiSdk();
		const harness = new PiHarness({ sdk, provider: "anthropic", model: "claude-sonnet", effort: "medium", systemPrompt: "WWW system prompt" });
		const thread = await harness.startThread({ cwd: "/workspace" });
		const receipt = await harness.startTurn({ threadId: thread.id, text: "first" });
		await Bun.sleep(5);
		await expect(harness.startTurn({ threadId: thread.id, text: "second" })).rejects.toThrow("active");
		expect(await harness.readThread({ threadId: thread.id, includeTurns: true })).toMatchObject({
			id: thread.id,
			value: { messages: ["first"], status: { type: "inProgress" }, turns: [{ id: receipt.id }] },
		});
		expect(receipt.threadId).toBe(thread.id);
		sdk.sessions[0]?.promptResult.resolve();
	});

	test("rejects silent mid-session model and effort substitutions", async () => {
		const harness = new PiHarness({ sdk: new FakePiSdk(), provider: "anthropic", model: "claude-sonnet", effort: "high", systemPrompt: "WWW system prompt" });
		await expect(harness.startThread({ cwd: "/workspace", model: "other" })).rejects.toMatchObject({ code: "unsupported-operation" });
		const thread = await harness.startThread({ cwd: "/workspace" });
		await expect(harness.startTurn({ threadId: thread.id, text: "change", model: "other" })).rejects.toMatchObject({ code: "unsupported-operation" });
		await expect(harness.startTurn({ threadId: thread.id, text: "change", effort: "low" })).rejects.toMatchObject({ code: "unsupported-operation" });
	});

	test("fails closed for persistent-session, approval, MCP, and tool operations", async () => {
		const harness = new PiHarness({ sdk: new FakePiSdk(), provider: "openai-codex", model: "gpt-5.6-sol", effort: "low", systemPrompt: "WWW system prompt" });
		await expect(harness.resumeThread({ threadId: "old" })).rejects.toMatchObject({ code: "unsupported-operation" });
		await expect(harness.listThreads({ cwd: "/workspace" })).rejects.toMatchObject({ code: "unsupported-operation" });
		await expect(harness.respondToApproval({ requestId: "approval", response: { decision: "accept" } })).rejects.toMatchObject({ code: "unsupported-operation" });
		await expect(harness.requestMcp({ operation: "list" })).rejects.toMatchObject({ code: "unsupported-operation" });
		await expect(harness.requestTool({ name: "Bash", input: {} })).rejects.toMatchObject({ code: "unsupported-operation" });
	});

	test("creates a fresh restricted Pi session and independently forwards provider, model, effort, and WWW prompt", async () => {
		const sdk = new FakePiSdk();
		const harness = new PiHarness({ sdk, provider: "anthropic", model: "claude-sonnet", effort: "high", systemPrompt: "WWW-owned prompt" });
		await harness.startThread({ cwd: "/workspace" });
		expect(sdk.createInputs).toEqual([expect.objectContaining({
			cwd: "/workspace",
			provider: "anthropic",
			model: "claude-sonnet",
			effort: "high",
			systemPrompt: "WWW-owned prompt",
			noTools: "all",
			noExtensions: true,
			noSkills: true,
			noPromptTemplates: true,
			noContextFiles: true,
		})]);
	});

	test("can retry thread creation after model or authentication setup fails", async () => {
		const fallback = new FakePiSession();
		let attempts = 0;
		const harness = new PiHarness({
			sdk: {
				createSession: () => {
					attempts += 1;
					if (attempts === 1) throw new Error("Pi authentication is unavailable");
					return fallback;
				},
			},
			provider: "anthropic", model: "claude-sonnet", effort: "high", systemPrompt: "WWW prompt",
		});
		await expect(harness.startThread({ cwd: "/workspace" })).rejects.toThrow("authentication");
		await expect(harness.startThread({ cwd: "/workspace" })).resolves.toMatchObject({ id: expect.stringContaining("pi-thread-") });
		expect(attempts).toBe(2);
	});

	test("loads the pinned Pi SDK surface used by the production adapter", async () => {
		const sdk = await import("@earendil-works/pi-coding-agent");
		expect(typeof sdk.createAgentSession).toBe("function");
		expect(typeof sdk.DefaultResourceLoader).toBe("function");
		expect(typeof sdk.ModelRuntime).toBe("function");
		expect(typeof sdk.SessionManager.inMemory).toBe("function");
	});

	test("drives model resolution, restrictions, and public event mapping through the SDK seam", async () => {
		let sessionInput: Readonly<Record<string, unknown>> | undefined;
		let resourceInput: Readonly<Record<string, unknown>> | undefined;
		let sdkListener: ((event: any) => void) | undefined;
		const sdkMessages: unknown[] = [];
		let nextMessage: unknown;
		const bindings: PiSdkBindings = {
			createRuntime: async () => ({
				getModel: (provider, model) => provider === "anthropic" && model === "claude-sonnet" ? { id: model } : undefined,
				hasConfiguredAuth: provider => provider === "anthropic",
			}),
			createResourceLoader: input => {
				resourceInput = input;
				return { reload: async () => undefined };
			},
			createSession: async input => {
				sessionInput = input;
				return {
					prompt: async () => { if (nextMessage) sdkMessages.push(nextMessage); },
					abort: async () => undefined,
					dispose: () => undefined,
					state: { messages: sdkMessages },
					isStreaming: false,
					subscribe: listener => { sdkListener = listener; return () => undefined; },
				};
			},
			inMemorySession: cwd => ({ cwd, persistence: false }),
		};
		const adapter = createProductionPiHarnessSdk(async () => bindings);
		const session = await adapter.createSession({
			cwd: "/workspace", provider: "anthropic", model: "claude-sonnet", effort: "ultra",
			systemPrompt: "WWW prompt", noTools: "all", noExtensions: true, noSkills: true,
			noPromptTemplates: true, noContextFiles: true,
		});
		expect(resourceInput).toMatchObject({
			cwd: "/workspace", noExtensions: true, noSkills: true, noPromptTemplates: true,
			noContextFiles: true, systemPrompt: "WWW prompt",
		});
		expect(sessionInput).toMatchObject({ model: { id: "claude-sonnet" }, thinkingLevel: "xhigh", noTools: "all", tools: [] });
		const events: SessionEvent[] = [];
		session.subscribe(event => events.push(event));
		sdkListener?.({ type: "message_update", assistantMessageEvent: { type: "thinking_delta", delta: "secret" } });
		sdkListener?.({ type: "message_update", assistantMessageEvent: { type: "text_delta", delta: "public" } });
		expect(events).toEqual([
			{ type: "reasoning-delta", text: "secret" },
			{ type: "text-delta", text: "public" },
		]);
		nextMessage = { role: "assistant", stopReason: "error", errorMessage: "rate limited" };
		await expect(session.prompt("fail")).rejects.toThrow("rate limited");
		nextMessage = undefined;
		await expect(session.prompt("no result")).rejects.toThrow("without an assistant result");
	});

	test("requires WWW-owned instructions before constructing the production Pi lane", async () => {
		await expect(createNativeHarness({
			executionLane: "pi",
			provider: "anthropic",
			model: "claude-sonnet",
			effort: "high",
		})).rejects.toThrow("WWW-owned system prompt");
	});
});

import { homedir } from "node:os";
import { join } from "node:path";
import type { AssistantMessage } from "@earendil-works/pi-ai/compat";
import type { NativeHarnessPort } from "../application/native-harness.js";
import { CodexAppServer } from "./codex-app-server.js";
import { PiHarness, type PiHarnessSdk, type PiSession, type PiSessionEvent, type PiSessionInput } from "./pi-harness.js";

export type ExecutionLane = "codex" | "pi";

export function buildPiExecutionSystemPrompt(cwd: string): string {
	return [
		"You are the embedded Pi text execution lane inside World Wide Woo.",
		`The WWW-owned project root is ${cwd}.`,
		"Return only public assistant response text.",
		"Do not claim tools, file changes, approvals, Todo, T-note, Evidence, or persistent session capabilities.",
		"WWW owns workflow, authorization, completion, and durable records.",
	].join("\n");
}

export interface NativeHarnessSelection {
	readonly executionLane?: ExecutionLane;
	readonly provider: string;
	readonly model: string;
	readonly effort: string;
	readonly systemPrompt?: string;
	readonly connectCodex?: (input: Readonly<{ provider: string; model: string; effort: string }>) => Promise<NativeHarnessPort>;
	readonly createPi?: (input: Readonly<{ provider: string; model: string; effort: string }>) => Promise<NativeHarnessPort>;
}

export async function createNativeHarness(input: NativeHarnessSelection): Promise<NativeHarnessPort> {
	const selection = { provider: input.provider, model: input.model, effort: input.effort };
	if ((input.executionLane ?? "codex") === "codex") {
		return (input.connectCodex ?? (() => CodexAppServer.connect()))(selection);
	}
	if (input.createPi) return input.createPi(selection);
	if (!input.systemPrompt?.trim()) throw new Error("Pi execution lane requires a WWW-owned system prompt");
	return new PiHarness({
		sdk: createProductionPiHarnessSdk(),
		...selection,
		systemPrompt: input.systemPrompt,
	});
}

export interface PiSdkBindings {
	createRuntime(): Promise<{
		getModel(provider: string, model: string): unknown;
		hasConfiguredAuth(provider: string): boolean;
	}>;
	createResourceLoader(input: Readonly<Record<string, unknown>>): { reload(): Promise<void> };
	createSession(input: Readonly<Record<string, unknown>>): Promise<{
		prompt(text: string, options: Readonly<Record<string, unknown>>): Promise<void>;
		abort(): Promise<void>;
		dispose(): void;
		readonly state: { readonly messages: readonly unknown[] };
		readonly isStreaming: boolean;
		subscribe(listener: (event: any) => void): () => void;
	}>;
	inMemorySession(cwd: string): unknown;
}

export function createProductionPiHarnessSdk(
	loadBindings: () => Promise<PiSdkBindings> = productionPiBindings,
): PiHarnessSdk {
	return {
		async createSession(input: PiSessionInput): Promise<PiSession> {
			const bindings = await loadBindings();
			const runtime = await bindings.createRuntime();
			const model = runtime.getModel(input.provider, input.model);
			if (!model) throw new Error(`Pi model is unavailable: ${input.provider}/${input.model}`);
			if (!runtime.hasConfiguredAuth(input.provider)) throw new Error(`Pi authentication is unavailable: ${input.provider}`);
			const resourceLoader = bindings.createResourceLoader({
				cwd: input.cwd,
				agentDir: join(homedir(), ".pi", "agent"),
				noExtensions: true,
				noSkills: true,
				noPromptTemplates: true,
				noThemes: true,
				noContextFiles: true,
				systemPrompt: input.systemPrompt,
			});
			await resourceLoader.reload();
			const session = await bindings.createSession({
				cwd: input.cwd,
				modelRuntime: runtime,
				model,
				thinkingLevel: normalizeThinkingLevel(input.effort),
				noTools: "all",
				tools: [],
				resourceLoader,
				sessionManager: bindings.inMemorySession(input.cwd),
			});
			return {
				prompt: async text => {
					const messageCount = session.state.messages.length;
					await session.prompt(text, { expandPromptTemplates: false });
					const latest = session.state.messages.slice(messageCount).findLast(isAssistantMessage);
					if (!latest) throw new Error("Pi session settled without an assistant result");
					if (latest?.stopReason === "error") throw new Error(latest.errorMessage ?? "Pi model request failed");
					if (latest?.stopReason === "aborted") throw new DOMException("Pi model request was aborted", "AbortError");
				},
				abort: () => session.abort(),
				inspect: () => ({ messageCount: session.state.messages.length, isStreaming: session.isStreaming }),
				subscribe(listener) {
					return session.subscribe(event => {
						if (event.type !== "message_update") return;
						const update = event.assistantMessageEvent;
						if (update.type === "text_delta") listener({ type: "text-delta", text: update.delta });
						else if (update.type === "thinking_delta") listener({ type: "reasoning-delta", text: update.delta });
					});
				},
				close: () => session.dispose(),
			};
		},
	};
}

function isAssistantMessage(message: unknown): message is AssistantMessage {
	return Boolean(message && typeof message === "object" && (message as { role?: unknown }).role === "assistant");
}

async function productionPiBindings(): Promise<PiSdkBindings> {
	const sdk = await import("@earendil-works/pi-coding-agent");
	return {
		createRuntime: () => sdk.ModelRuntime.create({ allowModelNetwork: false }),
		createResourceLoader: input => new sdk.DefaultResourceLoader(input as unknown as ConstructorParameters<typeof sdk.DefaultResourceLoader>[0]),
		createSession: async input => (await sdk.createAgentSession(input as Parameters<typeof sdk.createAgentSession>[0])).session,
		inMemorySession: cwd => sdk.SessionManager.inMemory(cwd),
	};
}

function normalizeThinkingLevel(effort: string): "off" | "minimal" | "low" | "medium" | "high" | "xhigh" {
	if (effort === "ultra") return "xhigh";
	if (effort === "off" || effort === "minimal" || effort === "low" || effort === "medium" || effort === "high" || effort === "xhigh") return effort;
	throw new Error(`Pi reasoning effort is unsupported: ${effort}`);
}

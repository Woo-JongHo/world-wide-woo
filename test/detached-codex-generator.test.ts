import { describe, expect, test } from "bun:test";
import type { Api, AssistantMessage, AssistantMessageEventStream, Context, Model, ModelsSimpleStreamOptions } from "@earendil-works/pi-ai";
import type { DetachedGenerationPolicy, DetachedTextGenerationRequest } from "../src/application/detached-text-generator";
import { DETACHED_CODEX_PROVIDER, PiDetachedCodexGenerator, type PiDetachedCodexModels } from "../src/infrastructure/detached-codex-generator";
import { createTNotePacket } from "../src/domain/t-notes";

const policy: DetachedGenerationPolicy = Object.freeze({ cwd: "", noTools: true, network: false, readOnly: true, ephemeral: true });
const packet = createTNotePacket("project-1", { startSequence: 1, endSequence: 1 }, [{
	id: "activity-1", projectId: "project-1", sequence: 1, occurredAt: "2026-09-01T00:00:00.000Z", kind: "message", title: "native output", body: "redacted source", nativeRefs: ["thread-1", "item-1"],
}], "2026-09-01T00:00:00.000Z", () => "a".repeat(64));
const request: DetachedTextGenerationRequest = Object.freeze({ packet, instruction: "작업 상태를 요약해줘", policy });
const model = {} as Model<Api>;

function response(content: AssistantMessage["content"], stopReason: AssistantMessage["stopReason"] = "stop", totalTokens = 0): AssistantMessage {
	return { role: "assistant", content, stopReason, usage: { totalTokens } } as AssistantMessage;
}

describe("PiDetachedCodexGenerator", () => {
	test("sends one stable packet-only context without tools or cwd and records structural isolation", async () => {
		let requestedModel: { provider: string; modelId: string } | undefined;
		let dispatched: { context: Context; options: ModelsSimpleStreamOptions | undefined } | undefined;
		const observedUsage: unknown[] = [];
		const models: PiDetachedCodexModels = {
			getModel: (provider, id) => {
				requestedModel = { provider, modelId: id };
				return provider === DETACHED_CODEX_PROVIDER && id === "gpt-5.6-sol" ? model : undefined;
			},
			streamSimple: (_model, context, options) => {
				dispatched = { context, options };
				return { result: async () => response([{ type: "text", text: "요약 결과" }], "stop", 1_234) } as AssistantMessageEventStream;
			},
		};
		const signal = new AbortController().signal;
		const result = await new PiDetachedCodexGenerator(models, "gpt-5.6-sol", "2026-09-01", observation => observedUsage.push(observation)).generate(request, signal);

		expect(result).toEqual(expect.objectContaining({ text: "요약 결과", provenance: { provider: DETACHED_CODEX_PROVIDER, model: "gpt-5.6-sol", version: "2026-09-01" }, isolation: expect.objectContaining({ projectRootVisible: false, toolCalls: 0, networkCalls: 0, filesystemWrites: 0 }) }));
		expect(requestedModel).toEqual({ provider: DETACHED_CODEX_PROVIDER, modelId: "gpt-5.6-sol" });
		expect(dispatched?.options).toEqual({ toolChoice: "none", signal });
		expect(dispatched?.context).toEqual(expect.objectContaining({ tools: [], messages: [expect.objectContaining({ role: "user" })] }));
		expect(dispatched?.context.messages[0]?.content).toBe(`{"instruction":"작업 상태를 요약해줘","packet":{"activities":[{"body":"redacted source","id":"activity-1","kind":"message","occurredAt":"2026-09-01T00:00:00.000Z","sequence":1,"title":"native output"}],"createdAt":"2026-09-01T00:00:00.000Z","digest":"${"a".repeat(64)}","projectId":"project-1","range":{"endSequence":1,"startSequence":1},"schemaVersion":1},"schemaVersion":1}`);
		expect("cwd" in (dispatched?.context ?? {})).toBe(false);
		expect(packet.activities[0]?.body).toBe("redacted source");
		expect(observedUsage).toEqual([{ model: "gpt-5.6-sol", effort: null, totalTokens: 1_234 }]);
	});

	test("rejects tool output, unavailable models, and failed provider results", async () => {
		const toolModels: PiDetachedCodexModels = {
			getModel: () => model,
			streamSimple: () => ({ result: async () => response([{ type: "toolCall", id: "call-1", name: "shell", arguments: {} }], "toolUse") }) as AssistantMessageEventStream,
		};
		await expect(new PiDetachedCodexGenerator(toolModels, "gpt-5.6-sol").generate(request)).rejects.toThrow("tool call");

		const unavailable: PiDetachedCodexModels = {
			getModel: () => undefined,
			streamSimple: () => { throw new Error("must not dispatch"); },
		};
		await expect(new PiDetachedCodexGenerator(unavailable, "missing").generate(request)).rejects.toThrow("not available");

		const failed: PiDetachedCodexModels = {
			getModel: () => model,
			streamSimple: () => ({ result: async () => response([], "error") }) as AssistantMessageEventStream,
		};
		await expect(new PiDetachedCodexGenerator(failed, "gpt-5.6-sol").generate(request)).rejects.toThrow("failed");
	});
});

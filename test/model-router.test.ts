import { describe, expect, test } from "bun:test";
import type {
	AssistantMessageEventStream,
	Api,
	Context,
	Model,
	Models,
	ModelsSimpleStreamOptions,
} from "@earendil-works/pi-ai";
import { ModelRouteError, ModelRouter, createModelRegistry, reasoningLevel } from "../src/infrastructure/model-router";
import type { WwwSettings } from "../src/domain/model-settings";

const settings: WwwSettings = {
	provider: "openai",
	model: "gpt-5.4",
	effort: "ultra",
};

describe("ModelRouter", () => {
	test("the configured catalog resolves every selectable model", () => {
		const registry = createModelRegistry();
		for (const provider of registry.getProviders()) {
			for (const model of registry.getModels(provider.id)) {
				expect(registry.getModel(provider.id, model.id)).toBeDefined();
			}
		}
		expect(registry.getModel("openai-codex", "gpt-5.6-sol")).toBeDefined();
		expect(registry.getModel("openai", "gpt-5.4")).toBeDefined();
		expect(registry.getModel("anthropic", "claude-opus-4-6")).toBeDefined();
		expect(registry.getModel("google", "gemini-3.1-pro-preview")).toBeDefined();
	});

	test("routes a stream with normalized reasoning and abort signal", () => {
		const model = createModelRegistry().getModel("openai", "gpt-5.4") as Model<Api>;
		const signal = new AbortController().signal;
		let receivedOptions: ModelsSimpleStreamOptions | undefined;
		const stream = {} as AssistantMessageEventStream;
		const registry: Pick<Models, "checkAuth" | "getModel" | "streamSimple"> = {
			checkAuth: async () => ({ type: "api_key", source: "테스트" }),
			getModel: () => model,
			streamSimple: (_model, _context, options) => {
				receivedOptions = options;
				return stream;
			},
		};

		const result = new ModelRouter(registry).stream(settings, { messages: [] } as Context, signal);

		expect(result).toBe(stream);
		expect(receivedOptions?.reasoning).toBe("xhigh");
		expect(receivedOptions?.signal).toBe(signal);
	});

	test("fails before dispatch when the selected model is absent", () => {
		const registry = {
			checkAuth: async () => undefined,
			getModel: () => undefined,
			streamSimple: () => {
				throw new Error("must not dispatch");
			},
		} as Pick<Models, "checkAuth" | "getModel" | "streamSimple">;

		expect(() => new ModelRouter(registry).resolve(settings)).toThrow(ModelRouteError);
	});

	test("reports whether provider authentication is configured", async () => {
		const model = createModelRegistry().getModel("openai", "gpt-5.4") as Model<Api>;
		const registry: Pick<Models, "checkAuth" | "getModel" | "streamSimple"> = {
			checkAuth: async () => ({ type: "api_key", source: "OPENAI_API_KEY" }),
			getModel: () => model,
			streamSimple: () => ({} as AssistantMessageEventStream),
		};

		await expect(new ModelRouter(registry).checkAuth(settings)).resolves.toEqual({
			configured: true,
			source: "OPENAI_API_KEY",
			type: "api_key",
		});
	});

	test("maps UI effort to SDK reasoning levels", () => {
		expect(["low", "medium", "high", "ultra"].map((effort) => reasoningLevel(effort as WwwSettings["effort"])))
			.toEqual(["low", "medium", "high", "max"]);
	});
});

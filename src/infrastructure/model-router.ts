import {
	clampThinkingLevel,
	createModels,
	type Api,
	type Context,
	type Model,
	type Models,
	type ModelsSimpleStreamOptions,
	type AssistantMessageEventStream,
	type CredentialStore,
} from "@earendil-works/pi-ai";
import { anthropicProvider } from "@earendil-works/pi-ai/providers/anthropic";
import { googleProvider } from "@earendil-works/pi-ai/providers/google";
import { openaiProvider } from "@earendil-works/pi-ai/providers/openai";
import { openaiCodexProvider } from "@earendil-works/pi-ai/providers/openai-codex";
import type { ModelAuthStatus, ModelClient } from "../application/ports";
import type { Effort, WwwSettings } from "../domain/model-settings";

type ModelRegistry = Pick<Models, "checkAuth" | "getModel" | "streamSimple">;

const REASONING_LEVEL = {
	low: "low",
	medium: "medium",
	high: "high",
	ultra: "max",
} as const;

export class ModelRouteError extends Error {
	readonly code = "MODEL_NOT_FOUND";

	constructor(provider: string, model: string) {
		super(`설정된 모델을 찾을 수 없습니다: ${provider}/${model}`);
		this.name = "ModelRouteError";
	}
}

export interface ModelRoute {
	model: Model<Api>;
	options: ModelsSimpleStreamOptions;
}

export function createModelRegistry(credentials?: CredentialStore): Models {
	const models = createModels({ credentials });
	models.setProvider(openaiCodexProvider());
	models.setProvider(openaiProvider());
	models.setProvider(anthropicProvider());
	models.setProvider(googleProvider());
	return models;
}

export class ModelRouter implements ModelClient {
	constructor(private readonly models: ModelRegistry = createModelRegistry()) {}

	async checkAuth(settings: Pick<WwwSettings, "provider">): Promise<ModelAuthStatus> {
		const auth = await this.models.checkAuth(settings.provider);
		return auth
			? { configured: true, source: auth.source, type: auth.type }
			: { configured: false };
	}

	resolve(settings: WwwSettings, signal?: AbortSignal): ModelRoute {
		const model = this.models.getModel(settings.provider, settings.model);
		if (!model) throw new ModelRouteError(settings.provider, settings.model);

		const reasoning = clampThinkingLevel(model, REASONING_LEVEL[settings.effort]);
		const options: ModelsSimpleStreamOptions = { signal };
		if (reasoning !== "off") options.reasoning = reasoning;
		return { model, options };
	}

	stream(
		settings: WwwSettings,
		context: Context,
		signal?: AbortSignal,
	): AssistantMessageEventStream {
		const route = this.resolve(settings, signal);
		return this.models.streamSimple(route.model, context, route.options);
	}
}

export function reasoningLevel(effort: Effort): (typeof REASONING_LEVEL)[Effort] {
	return REASONING_LEVEL[effort];
}

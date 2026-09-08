export const PROVIDERS = ["openai-codex", "anthropic", "openai", "google"] as const;
export const MODELS = {
	"openai-codex": ["gpt-5.6-sol", "gpt-5.6-terra", "gpt-5.6-luna", "gpt-5.4"],
	openai: ["gpt-5.4", "gpt-5.3-codex"],
	anthropic: ["claude-opus-4-6", "claude-sonnet-4-6"],
	google: ["gemini-3.1-pro-preview", "gemini-3-flash-preview"],
} as const;
export const EFFORTS = ["low", "medium", "high", "ultra"] as const;

export type Provider = (typeof PROVIDERS)[number];
export type Effort = (typeof EFFORTS)[number];

export interface WwwSettings {
	provider: Provider;
	model: string;
	effort: Effort;
}

export const DEFAULT_SETTINGS: WwwSettings = {
	provider: "openai-codex",
	model: MODELS["openai-codex"][0],
	effort: "ultra",
};

export function normalizeSettings(value: unknown): WwwSettings {
	if (!value || typeof value !== "object") return { ...DEFAULT_SETTINGS };
	const candidate = value as Partial<WwwSettings>;
	const provider = PROVIDERS.includes(candidate.provider as Provider) ? (candidate.provider as Provider) : DEFAULT_SETTINGS.provider;
	const validModels = MODELS[provider] as readonly string[];
	const model = typeof candidate.model === "string" && validModels.includes(candidate.model) ? candidate.model : validModels[0];
	const effort = EFFORTS.includes(candidate.effort as Effort) ? candidate.effort as Effort : DEFAULT_SETTINGS.effort;
	return { provider, model, effort };
}

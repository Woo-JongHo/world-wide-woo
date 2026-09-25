export const PROVIDERS = ["openai-codex", "anthropic", "openai", "google", "zai"] as const;
export const MODELS = {
	"openai-codex" : ["gpt-5.6-sol", "gpt-5.6-terra", "gpt-5.6-luna", "gpt-5.4", "gpt-6-astra"],
	openai         : ["gpt-5.4", "gpt-5.3-codex"],
	anthropic      : ["claude-opus-4-6", "claude-sonnet-4-6"],
	google         : ["gemini-3.1-pro-preview", "gemini-3-flash-preview"],
	zai            : ["glm-5.3", "glm-5.3-flash", "glm-5.2", "glm-5.2-highspeed", "glm-5.3-highspeed", "glm-5-turbo", "glm-4.7"],
} as const;
export type Effort = "low" | "medium" | "high" | "xhigh" | "max" | "ultra";
/** Compatibility/Pi options. Native Codex has model-specific capabilities below. */
export const EFFORTS: readonly Effort[] = ["low", "medium", "high", "ultra"];
export const CODEX_EFFORTS: readonly Effort[] = ["low", "medium", "high", "xhigh", "max", "ultra"];

export type Provider = (typeof PROVIDERS)[number];

/** Session-scoped capabilities reported by the Native host, not a model-name allowlist. */
export interface NativeModelOption {
	readonly model         : string            ;
	readonly displayName   : string            ;
	readonly efforts       : readonly Effort[] ;
	readonly defaultEffort : Effort            ;
}
export interface NativeModelCatalog {
	readonly models    : readonly NativeModelOption[] ;
	readonly source    : "native" | "fallback"        ;
	readonly checkedAt : string | null                ;
	readonly error     : string | null                ;
}
export function nativeModelNames(catalog?: NativeModelCatalog): readonly string[] {
	return catalog ? catalog.models.map(entry => entry.model) : MODELS["openai-codex"];
}
export function nativeModelEfforts(model: string, catalog?: NativeModelCatalog): readonly Effort[] {
	return catalog ? catalog.models.find(entry => entry.model === model)?.efforts ?? [] : modelEfforts("openai-codex", model);
}
export function fallbackNativeModelCatalog(): NativeModelCatalog {
	return { source: "fallback", checkedAt: null, error: null, models: MODELS["openai-codex"].map(model => ({ model, displayName: model, efforts: modelEfforts("openai-codex", model), defaultEffort: "medium" })) };
}

/** Verified against Codex 0.154.0 model/list (2026-09-11). Ultra is not an xhigh alias. */
export function modelEfforts(provider: Provider, model: string): readonly Effort[] {
	if (provider !== "openai-codex") return EFFORTS;
	if (["gpt-6-astra", "gpt-5.6-sol", "gpt-5.6-terra"].includes(model)) return CODEX_EFFORTS;
	if (model === "gpt-5.6-luna") return CODEX_EFFORTS.filter(e => e !== "ultra");
	// Older GPT-5.4 has no max/automatic delegation option (official model guide).
	return ["low", "medium", "high", "xhigh"];
}

export interface WwwSettings {
	provider : Provider ;
	model    : string   ;
	effort   : Effort   ;
}

export const DEFAULT_SETTINGS: WwwSettings = {
	provider : "openai-codex",
	model    : MODELS["openai-codex"][0],
	effort   : "ultra",
};

export function normalizeSettings(value: unknown): WwwSettings {
	if (!value || typeof value !== "object") return { ...DEFAULT_SETTINGS };
	const candidate   = value as Partial<WwwSettings>                                                                                     ;
	const provider    = PROVIDERS.includes(candidate.provider as Provider) ? (candidate.provider as Provider) : DEFAULT_SETTINGS.provider ;
	const validModels = MODELS[provider] as readonly string[]                                                                             ;
	const model       = typeof candidate.model === "string" && validModels.includes(candidate.model) ? candidate.model : validModels[0]   ;
	// settings.json/router-settings.json belong to the compatibility lane.
	const effort = EFFORTS.includes(candidate.effort as Effort) ? candidate.effort as Effort : DEFAULT_SETTINGS.effort;
	return { provider, model, effort };
}

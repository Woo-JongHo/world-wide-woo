import {
	DEFAULT_SETTINGS,
	EFFORTS,
	MODELS,
	PROVIDERS,
	type Effort,
	type Provider,
} from "./model-settings.js";
import type { NativeApprovalPolicy, NativeSandboxMode } from "./native-session.js";

/** Validated, immutable project configuration. Runtime state never belongs here. */
export interface WorkbenchConfig {
	readonly schemaVersion: 1;
	readonly execution: {
		readonly provider: Provider;
		readonly model: string;
		readonly effort: Effort;
		readonly approvalPolicy: NativeApprovalPolicy;
		readonly sandbox: NativeSandboxMode;
	};
	readonly tnote: { readonly model: string };
	readonly narrator: { readonly model: string };
	readonly limits: { readonly contextCharacters: number };
	readonly retry: { readonly enabled: boolean; readonly maxRetries: number; readonly baseDelayMs: number };
	readonly delegation: { readonly detailActivities: number };
	readonly evaluation: { readonly requireVerification: boolean };
	readonly orchestration: { readonly maxAgentRounds: number };
	/** Detached review lane; this is deliberately separate from interactive execution. */
	readonly review: { readonly provider: "anthropic" | "google"; readonly model: string };
	readonly display: { readonly tnoteVisibleLimit: number };
	/** HUD visibility is policy, not a compile-time terminal constant. */
	readonly hud: { readonly showUsage: boolean; readonly showContext: boolean };
	readonly slash: { readonly mcp: boolean; readonly clear: boolean; readonly compact: boolean };
	readonly linear: { readonly server: string; readonly projectId: string; readonly projectName: string } | null;
}

export const DEFAULT_WORKBENCH_CONFIG: WorkbenchConfig = Object.freeze({
	schemaVersion: 1,
	execution: Object.freeze({
		provider: DEFAULT_SETTINGS.provider,
		model: DEFAULT_SETTINGS.model,
		effort: "medium",
		approvalPolicy: "on-request",
		sandbox: "workspace-write",
	}),
	tnote: Object.freeze({ model: "gpt-5.6-luna" }),
	narrator: Object.freeze({ model: "gpt-5.6-luna" }),
	limits: Object.freeze({ contextCharacters: 4_000 }),
	retry: Object.freeze({ enabled: true, maxRetries: 2, baseDelayMs: 500 }),
	delegation: Object.freeze({ detailActivities: 8 }),
	evaluation: Object.freeze({ requireVerification: true }),
	orchestration: Object.freeze({ maxAgentRounds: 24 }),
	review: Object.freeze({ provider: "anthropic", model: "claude-opus" }),
	display: Object.freeze({ tnoteVisibleLimit: 20 }),
	hud: Object.freeze({ showUsage: true, showContext: true }),
	slash: Object.freeze({ mcp: true, clear: true, compact: true }),
	linear: null,
});

export function normalizeWorkbenchConfig(value: unknown): WorkbenchConfig {
	const root = record(value);
	if (root && Object.keys(root).some(key => !ROOT_KEYS.has(key))) return DEFAULT_WORKBENCH_CONFIG;
	if (root?.schemaVersion !== undefined && root.schemaVersion !== 1) return DEFAULT_WORKBENCH_CONFIG;
	const execution = record(root?.execution), tnote = record(root?.tnote), narrator = record(root?.narrator), limits = record(root?.limits), retry = record(root?.retry), delegation = record(root?.delegation), evaluation = record(root?.evaluation), orchestration = record(root?.orchestration), review = record(root?.review), display = record(root?.display), hud = record(root?.hud), slash = record(root?.slash), linear = record(root?.linear);
	const provider = PROVIDERS.includes(execution?.provider as Provider) ? execution!.provider as Provider : DEFAULT_WORKBENCH_CONFIG.execution.provider;
	const models = MODELS[provider] as readonly string[];
	const model = typeof execution?.model === "string" && models.includes(execution.model) ? execution.model : (models[0] ?? DEFAULT_SETTINGS.model);
	const effort = EFFORTS.includes(execution?.effort as Effort) ? execution!.effort as Effort : DEFAULT_WORKBENCH_CONFIG.execution.effort;
	const approvalPolicy = execution?.approvalPolicy === "untrusted" || execution?.approvalPolicy === "on-request" || execution?.approvalPolicy === "never"
		? execution.approvalPolicy : DEFAULT_WORKBENCH_CONFIG.execution.approvalPolicy;
	const sandbox = execution?.sandbox === "read-only" || execution?.sandbox === "workspace-write" || execution?.sandbox === "danger-full-access"
		? execution.sandbox : DEFAULT_WORKBENCH_CONFIG.execution.sandbox;
	return Object.freeze({
		schemaVersion: 1,
		execution: Object.freeze({ provider, model, effort, approvalPolicy, sandbox }),
		tnote: Object.freeze({ model: validTNoteModel(tnote) }),
		narrator: Object.freeze({ model: validTNoteModel(narrator) }),
		limits: Object.freeze({ contextCharacters: positiveInt(limits?.contextCharacters, DEFAULT_WORKBENCH_CONFIG.limits.contextCharacters) }),
		retry: Object.freeze({ enabled: retry?.enabled !== false, maxRetries: boundedInt(retry?.maxRetries, 2, 0, 8), baseDelayMs: boundedInt(retry?.baseDelayMs, 500, 0, 60_000) }),
		delegation: Object.freeze({ detailActivities: boundedInt(delegation?.detailActivities, 8, 0, 32) }),
		evaluation: Object.freeze({ requireVerification: evaluation?.requireVerification !== false }),
		orchestration: Object.freeze({ maxAgentRounds: boundedInt(orchestration?.maxAgentRounds, 24, 1, 64) }),
		review: Object.freeze({
			provider: review?.provider === "google" ? "google" : "anthropic",
			model: validReviewModel(review),
		}),
		display: Object.freeze({ tnoteVisibleLimit: boundedInt(display?.tnoteVisibleLimit, 20, 0, 100) }),
		hud: Object.freeze({ showUsage: hud?.showUsage !== false, showContext: hud?.showContext !== false }),
		slash: Object.freeze({ mcp: slash?.mcp !== false, clear: slash?.clear !== false, compact: slash?.compact !== false }),
		linear: validLinearConfig(linear),
	});
}

export function isSupportedWorkbenchConfigDocument(value: unknown): boolean {
	const root = record(value);
	return !!root && !Object.keys(root).some(key => !ROOT_KEYS.has(key)) && (root.schemaVersion === undefined || root.schemaVersion === 1);
}
function positiveInt(value: unknown, fallback: number): number { return typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : fallback; }
function boundedInt(value: unknown, fallback: number, minimum: number, maximum: number): number { return typeof value === "number" && Number.isSafeInteger(value) ? Math.min(maximum, Math.max(minimum, value)) : fallback; }
function record(value: unknown): Readonly<Record<string, unknown>> | undefined { return value && typeof value === "object" && !Array.isArray(value) ? value as Readonly<Record<string, unknown>> : undefined; }
const ROOT_KEYS = new Set(["schemaVersion", "execution", "tnote", "narrator", "limits", "retry", "delegation", "evaluation", "orchestration", "review", "display", "linear", "hud", "slash"]);

function validReviewModel(review: Readonly<Record<string, unknown>> | undefined): string {
	const provider = review?.provider === "google" ? "google" : "anthropic";
	const model = typeof review?.model === "string" ? review.model.trim() : "";
	if (provider === "google") return model === "gemini" || model === "gemini-3.1-pro-preview" ? model : "gemini";
	return model === "claude-opus" || model === "claude-opus-5" ? model : "claude-opus";
}

function validTNoteModel(tnote: Readonly<Record<string, unknown>> | undefined): string {
	const model = typeof tnote?.model === "string" ? tnote.model.trim() : "";
	return (MODELS["openai-codex"] as readonly string[]).includes(model) ? model : DEFAULT_WORKBENCH_CONFIG.tnote.model;
}

function validLinearConfig(linear: Readonly<Record<string, unknown>> | undefined): WorkbenchConfig["linear"] {
	if (typeof linear?.server !== "string" || !linear.server.trim() || typeof linear.projectId !== "string" || !linear.projectId.trim() || typeof linear.projectName !== "string" || !linear.projectName.trim()) return null;
	return Object.freeze({ server: linear.server.trim(), projectId: linear.projectId.trim(), projectName: linear.projectName.trim() });
}

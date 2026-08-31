import type {
	AssistantMessageEventStream,
	AuthCheck,
	AuthInteraction,
	AuthType,
	Context,
} from "@earendil-works/pi-ai";
import type { SessionEvent, SessionEventInput } from "../domain/session-events";
import type { Provider, WwwSettings } from "../domain/model-settings";

export interface ModelAuthStatus {
	configured: boolean;
	source?: string;
	type?: AuthCheck["type"];
}

export interface ModelClient {
	checkAuth(settings: Pick<WwwSettings, "provider">): Promise<ModelAuthStatus>;
	stream(settings: WwwSettings, context: Context, signal?: AbortSignal): AssistantMessageEventStream;
}

export interface SessionRepository {
	append(sessionId: string, input: SessionEventInput): Promise<SessionEvent>;
	readAll(sessionId: string): Promise<SessionEvent[]>;
}

export type ProviderAuthState =
	| { state: "configured"; provider: Provider; source: string; type: AuthType }
	| { state: "required"; provider: Provider }
	| { state: "failed"; provider: Provider; message: string };

export interface AuthController {
	methods(provider: Provider): AuthType[];
	status(provider: Provider, signal?: AbortSignal): Promise<ProviderAuthState>;
	login(provider: Provider, type: AuthType, interaction: AuthInteraction): Promise<ProviderAuthState>;
	logout(provider: Provider, signal?: AbortSignal): Promise<void>;
}

export type UsageProviderId = "openai-codex" | "anthropic";
export type UsageState = "loading" | "ready" | "auth-required" | "unsupported" | "error";
export type UsageIssueKind = "rate-limit" | "authentication" | "network" | "provider";

export interface UsageIssue {
	kind: UsageIssueKind;
	retryAt?: number;
}

export interface UsageLimitSnapshot {
	label: string;
	usedPercent?: number;
	remainingPercent?: number;
	resetsAt?: number;
	status: "ok" | "warning" | "exhausted" | "unknown";
}

export interface UsageSnapshot {
	provider: UsageProviderId;
	state: UsageState;
	fetchedAt: number;
	limits: UsageLimitSnapshot[];
	stale?: boolean;
	issue?: UsageIssue;
}

export interface UsageMonitor {
	refresh(): Promise<readonly UsageSnapshot[]>;
	startPolling(listener: (snapshots: readonly UsageSnapshot[]) => void, intervalMs?: number): () => void;
}

export interface SettingsRepository {
	load(): Promise<WwwSettings>;
	save(settings: WwwSettings): Promise<void>;
}

export interface RecentSessionSummary {
	id: string;
	updatedAt: string;
}

export interface RouterSettingsController {
	update(settings: WwwSettings): Promise<void>;
	flush(): Promise<void>;
}

import type {
	AssistantMessageEventStream,
	AuthCheck,
	AuthInteraction,
	AuthType,
	Context,
	Tool,
} from "@earendil-works/pi-ai";
import type { SessionEvent, SessionEventInput } from "../domain/session-events";
import type { Provider, WwwSettings } from "../domain/model-settings";
import type { CommitSummary, IssueState, IssueSummary, RepositorySnapshot } from "../domain/repository";
import type { ToolResultSnapshot } from "../domain/output";
import type { TodoDocument } from "../domain/todos";

export interface ModelAuthStatus {
	configured: boolean;
	source?: string;
	type?: AuthCheck["type"];
}

export interface ModelClient {
	checkAuth(settings: Pick<WwwSettings, "provider">): Promise<ModelAuthStatus>;
	stream(settings: WwwSettings, context: Context, signal?: AbortSignal): AssistantMessageEventStream;
}

export interface AgentToolExecution {
	modelContent: string;
	isError: boolean;
	snapshot: ToolResultSnapshot;
}

export interface AgentTool {
	readonly definition: Tool;
	execute(arguments_: Record<string, unknown>, signal: AbortSignal): Promise<AgentToolExecution>;
}

export interface TodoStore {
	read(): Promise<TodoDocument | null>;
	compareAndSwap(expectedRevision: number | null, next: TodoDocument): Promise<"written" | "conflict">;
}

export interface TodoController {
	readonly snapshot: TodoDocument | null;
	initialize(): Promise<void>;
	create(title: string, items: readonly string[], storyId?: string): Promise<TodoDocument>;
	start(itemId: string): Promise<TodoDocument>;
	complete(itemId: string): Promise<TodoDocument>;
	block(itemId: string): Promise<TodoDocument>;
	reopen(itemId: string): Promise<TodoDocument>;
	recordEvidence(evidenceId: string): Promise<TodoDocument | null>;
	subscribe(listener: (snapshot: TodoDocument | null) => void): () => void;
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

export interface AtomicSettingsRepository extends SettingsRepository {
	/** Replaces expected with next under an interprocess lock; false means another writer won. */
	compareAndSwap(expected: WwwSettings, next: WwwSettings): Promise<boolean>;
}

export interface ComposerDraftController {
	readonly initialText: string;
	save(text: string): Promise<void>;
	clear(): Promise<void>;
}

export interface RecentSessionSummary {
	id: string;
	updatedAt: string;
}

export interface RouterSettingsController {
	update(settings: WwwSettings): Promise<void>;
	flush(): Promise<void>;
}

export interface RepositoryInsights {
	snapshot(): Promise<RepositorySnapshot>;
	recentCommits(limit?: number): Promise<readonly CommitSummary[]>;
	issues(state?: IssueState, limit?: number): Promise<readonly IssueSummary[]>;
}

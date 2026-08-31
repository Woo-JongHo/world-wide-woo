import type { UsageCredential, UsageFetchContext, UsageLimit } from "@gajae-code/ai/core";
import { claudeUsageProvider } from "@gajae-code/ai/usage/claude";
import { openaiCodexUsageProvider } from "@gajae-code/ai/usage/openai-codex";
import type { Credential, CredentialStore } from "@earendil-works/pi-ai";
import type {
	UsageLimitSnapshot,
	UsageMonitor,
	UsageIssue,
	UsageIssueKind,
	UsageProviderId,
	UsageSnapshot,
	UsageState,
} from "../application/ports";

export type UsageListener = (snapshots: readonly UsageSnapshot[]) => void;

type AuthRegistry = {
	getAuth(providerId: string): Promise<unknown>;
	checkAuth(providerId: string): Promise<{ type: "api_key" | "oauth"; source?: string } | undefined>;
};
type UsageFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

const PROVIDERS: readonly UsageProviderId[] = ["openai-codex", "anthropic"];
const BASE_BACKOFF_MS = 30_000;
const MAX_BACKOFF_MS = 5 * 60_000;
const CLAUDE_SUCCESS_TTL_MS = 5 * 60_000;

interface FetchObservation {
	status?: number;
	networkFailure: boolean;
	retryAt?: number;
}

interface ProviderBackoff {
	failures: number;
	issue: UsageIssue;
}

function asUsageCredential(credential: Credential): UsageCredential {
	if (credential.type === "api_key") return { type: "api_key", apiKey: credential.key };
	const { type: _type, access, refresh, expires, ...metadata } = credential;
	return {
		type: "oauth",
		accessToken: access,
		refreshToken: refresh,
		expiresAt: expires,
		metadata: Object.keys(metadata).length === 0 ? undefined : metadata,
	};
}

function percent(value: number | undefined): number | undefined {
	if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
	return Math.max(0, Math.min(100, value * 100));
}

function normalizeLimit(limit: UsageLimit): UsageLimitSnapshot {
	const usedFraction = limit.amount.usedFraction ??
		(typeof limit.amount.used === "number" && typeof limit.amount.limit === "number" && limit.amount.limit > 0
			? limit.amount.used / limit.amount.limit
			: undefined);
	const remainingFraction = limit.amount.remainingFraction ??
		(typeof usedFraction === "number" ? 1 - usedFraction : undefined);
	return {
		label: limit.label,
		usedPercent: percent(usedFraction),
		remainingPercent: percent(remainingFraction),
		resetsAt: limit.window?.resetsAt,
		status: limit.status ?? "unknown",
	};
}

function snapshot(
	provider: UsageProviderId,
	state: UsageState,
	limits: UsageLimitSnapshot[] = [],
	fetchedAt = Date.now(),
): UsageSnapshot {
	return { provider, state, fetchedAt, limits };
}

function retryAt(headers: Headers, now: number): number | undefined {
	const value = headers.get("retry-after")?.trim();
	if (!value) return undefined;
	const seconds = Number.parseFloat(value);
	if (Number.isFinite(seconds)) return now + Math.min(MAX_BACKOFF_MS, Math.max(0, seconds * 1_000));
	const timestamp = Date.parse(value);
	return Number.isFinite(timestamp) && timestamp > now ? Math.min(timestamp, now + MAX_BACKOFF_MS) : undefined;
}

function issueKind(observation: FetchObservation): UsageIssueKind {
	if (observation.status === 429) return "rate-limit";
	if (observation.status === 401 || observation.status === 403) return "authentication";
	if (observation.networkFailure) return "network";
	return "provider";
}

/**
 * Reads and refreshes provider credentials through the model registry, then delegates quota parsing to Gajae's adapters.
 * Only display-safe snapshots leave this service.
 */
export class UsageService implements UsageMonitor {
	private activeRefresh: Promise<readonly UsageSnapshot[]> | undefined;
	private pollTimer: ReturnType<typeof setInterval> | undefined;
	private listener: UsageListener | undefined;
	private readonly lastReady = new Map<UsageProviderId, UsageSnapshot>();
	private readonly backoff = new Map<UsageProviderId, ProviderBackoff>();

	constructor(
		private readonly credentials: CredentialStore,
		private readonly models: AuthRegistry,
		private readonly fetchImpl: UsageFetch = fetch,
		private readonly now: () => number = Date.now,
		private readonly retryWait?: UsageFetchContext["retryWait"],
	) {}

	refresh(): Promise<readonly UsageSnapshot[]> {
		this.activeRefresh ??= this.fetchAll().finally(() => {
			this.activeRefresh = undefined;
		});
		return this.activeRefresh;
	}

	startPolling(listener: UsageListener, intervalMs = 30_000): () => void {
		this.stopPolling();
		this.listener = listener;
		listener(PROVIDERS.map(provider => snapshot(provider, "loading")));
		void this.refresh().then(snapshots => this.listener?.(snapshots));
		this.pollTimer = setInterval(() => {
			void this.refresh().then(snapshots => this.listener?.(snapshots));
		}, intervalMs);
		return () => this.stopPolling();
	}

	stopPolling(): void {
		if (this.pollTimer !== undefined) clearInterval(this.pollTimer);
		this.pollTimer = undefined;
		this.listener = undefined;
	}

	private async fetchAll(): Promise<readonly UsageSnapshot[]> {
		return Promise.all(PROVIDERS.map(provider => this.fetchProvider(provider)));
	}

	private async fetchProvider(provider: UsageProviderId): Promise<UsageSnapshot> {
		const observation: FetchObservation = { networkFailure: false };
		try {
			// getAuth owns serialized OAuth refresh; re-read afterwards to use its rotated token.
			await this.models.getAuth(provider);
			const stored = await this.credentials.read(provider);
			if (!stored) {
				this.clearProviderState(provider);
				const ambient = await this.models.checkAuth(provider);
				return snapshot(provider, ambient?.type === "api_key" ? "unsupported" : "auth-required");
			}
			const credential = asUsageCredential(stored);
			const adapter = provider === "openai-codex" ? openaiCodexUsageProvider : claudeUsageProvider;
			if (!adapter.supports?.({ provider, credential })) {
				this.clearProviderState(provider);
				return snapshot(provider, "unsupported");
			}
			const cached = this.lastReady.get(provider);
			if (provider === "anthropic" && cached && this.now() - cached.fetchedAt < CLAUDE_SUCCESS_TTL_MS) {
				return { ...cached, limits: cached.limits.map(limit => ({ ...limit })) };
			}
			const waiting = this.backoff.get(provider);
			if (waiting?.issue.retryAt && waiting.issue.retryAt > this.now()) {
				return this.degradedSnapshot(provider, waiting.issue);
			}
			const observedFetch: UsageFetch = async (input, init) => {
				try {
					const response = await this.fetchImpl(input, init);
					observation.status = response.status;
					if (response.status === 429) {
						const hinted = retryAt(response.headers, this.now());
						if (hinted !== undefined) observation.retryAt = Math.max(observation.retryAt ?? 0, hinted);
					}
					return response;
				} catch (error) {
					observation.networkFailure = true;
					throw error;
				}
			};
			const report = await adapter.fetchUsage(
				{ provider, credential },
				{ fetch: observedFetch as typeof fetch, retryWait: this.retryWait },
			);
			if (!report) return this.recordFailure(provider, observation);
			const ready = snapshot(provider, "ready", report.limits.map(normalizeLimit), this.now());
			this.lastReady.set(provider, ready);
			this.backoff.delete(provider);
			return ready;
		} catch {
			return this.recordFailure(provider, observation);
		}
	}

	private recordFailure(provider: UsageProviderId, observation: FetchObservation): UsageSnapshot {
		const previous = this.backoff.get(provider);
		const failures = (previous?.failures ?? 0) + 1;
		const kind = issueKind(observation);
		const exponentialDelay = Math.min(MAX_BACKOFF_MS, BASE_BACKOFF_MS * 2 ** Math.min(failures, 4));
		const issue: UsageIssue = {
			kind,
			retryAt: Math.max(observation.retryAt ?? 0, this.now() + exponentialDelay),
		};
		this.backoff.set(provider, { failures, issue });
		return this.degradedSnapshot(provider, issue);
	}

	private degradedSnapshot(provider: UsageProviderId, issue: UsageIssue): UsageSnapshot {
		const lastReady = this.lastReady.get(provider);
		if (!lastReady) return { ...snapshot(provider, "error", [], this.now()), issue };
		return {
			...lastReady,
			limits: lastReady.limits.map(limit => ({ ...limit })),
			stale: true,
			issue,
		};
	}

	private clearProviderState(provider: UsageProviderId): void {
		this.lastReady.delete(provider);
		this.backoff.delete(provider);
	}
}

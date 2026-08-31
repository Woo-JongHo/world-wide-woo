import type { UsageCredential, UsageLimit } from "@gajae-code/ai/core";
import { claudeUsageProvider } from "@gajae-code/ai/usage/claude";
import { openaiCodexUsageProvider } from "@gajae-code/ai/usage/openai-codex";
import type { Credential, CredentialStore } from "@earendil-works/pi-ai";
import type {
	UsageLimitSnapshot,
	UsageMonitor,
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

function snapshot(provider: UsageProviderId, state: UsageState, limits: UsageLimitSnapshot[] = []): UsageSnapshot {
	return { provider, state, fetchedAt: Date.now(), limits };
}

/**
 * Reads and refreshes provider credentials through the model registry, then delegates quota parsing to Gajae's adapters.
 * Only display-safe snapshots leave this service.
 */
export class UsageService implements UsageMonitor {
	private activeRefresh: Promise<readonly UsageSnapshot[]> | undefined;
	private pollTimer: ReturnType<typeof setInterval> | undefined;
	private listener: UsageListener | undefined;

	constructor(
		private readonly credentials: CredentialStore,
		private readonly models: AuthRegistry,
		private readonly fetchImpl: UsageFetch = fetch,
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
		try {
			// getAuth owns serialized OAuth refresh; re-read afterwards to use its rotated token.
			await this.models.getAuth(provider);
			const stored = await this.credentials.read(provider);
			if (!stored) {
				const ambient = await this.models.checkAuth(provider);
				return snapshot(provider, ambient?.type === "api_key" ? "unsupported" : "auth-required");
			}
			const credential = asUsageCredential(stored);
			const adapter = provider === "openai-codex" ? openaiCodexUsageProvider : claudeUsageProvider;
			if (!adapter.supports?.({ provider, credential })) return snapshot(provider, "unsupported");
			const report = await adapter.fetchUsage({ provider, credential }, { fetch: this.fetchImpl as typeof fetch });
			return report ? snapshot(provider, "ready", report.limits.map(normalizeLimit)) : snapshot(provider, "error");
		} catch {
			return snapshot(provider, "error");
		}
	}
}

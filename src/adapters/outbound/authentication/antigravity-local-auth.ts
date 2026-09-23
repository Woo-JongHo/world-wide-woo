import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { UsageCredential } from "@gajae-code/ai/core";
import { getAntigravityUserAgent } from "@gajae-code/ai/providers/google-gemini-headers";
import {
	ANTIGRAVITY_LOAD_CODE_ASSIST_METADATA,
	refreshAntigravityToken,
} from "@gajae-code/ai/utils/oauth/google-antigravity";

export interface AntigravityLocalAuthSource {
	configured(): Promise<boolean>;
	usageCredential?(): Promise<UsageCredential | undefined>;
}

function hasToken(value: unknown): boolean {
	if (typeof value !== "object" || value === null || !("token" in value)) return false;
	const token = value.token;
	if (typeof token === "string") return token.trim().length > 0;
	return typeof token === "object" && token !== null
		&& "access_token" in token
		&& typeof token.access_token === "string"
		&& token.access_token.trim().length > 0;
}

interface AntigravityTokenFile {
	token?: {
		access_token?: string;
		refresh_token?: string;
		expiry?: string;
	};
}

interface LoadCodeAssistResponse {
	cloudaicompanionProject?: string | { id?: string };
}

const CLOUD_CODE_ENDPOINT = "https://cloudcode-pa.googleapis.com";
const EXPIRY_SKEW_MS = 5 * 60_000;
type UsageFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

function projectId(value: LoadCodeAssistResponse["cloudaicompanionProject"]): string | undefined {
	if (typeof value === "string" && value.length > 0) return value;
	if (typeof value !== "object" || value === null) return undefined;
	return typeof value.id === "string" && value.id.length > 0 ? value.id : undefined;
}

/**
 * Observes an existing Antigravity desktop login without reading Keychain.
 * Its token is used only for Antigravity's Cloud Code quota endpoints and is
 * never exposed through WWW snapshots or persisted by WWW.
 */
export class SystemAntigravityLocalAuthSource implements AntigravityLocalAuthSource {
	private cachedUsageCredential: UsageCredential | undefined;

	constructor(
		private readonly home = homedir(),
		private readonly fetchImpl: UsageFetch = fetch,
	) {}

	private async tokenFile(): Promise<AntigravityTokenFile | undefined> {
		try {
			return JSON.parse(await readFile(join(this.home, ".gemini", "antigravity-cli", "antigravity-oauth-token"), "utf8"));
		} catch {
			return undefined;
		}
	}

	async configured(): Promise<boolean> {
		return hasToken(await this.tokenFile());
	}

	async usageCredential(): Promise<UsageCredential | undefined> {
		if (this.cachedUsageCredential?.expiresAt && this.cachedUsageCredential.expiresAt > Date.now() + EXPIRY_SKEW_MS) {
			return this.cachedUsageCredential;
		}
		const stored = await this.tokenFile();
		const token = stored?.token;
		if (!token?.access_token) return undefined;
		const storedExpiry = token.expiry ? Date.parse(token.expiry) : Number.NaN;
		let accessToken = token.access_token;
		let refreshToken = token.refresh_token;
		let expiresAt = Number.isFinite(storedExpiry) ? storedExpiry : undefined;
		if (!expiresAt || expiresAt <= Date.now() + EXPIRY_SKEW_MS) {
			if (!refreshToken) return undefined;
			const refreshed = await refreshAntigravityToken(refreshToken, "");
			accessToken = refreshed.access;
			refreshToken = refreshed.refresh;
			expiresAt = refreshed.expires;
		}
		const headers = {
			Authorization: `Bearer ${accessToken}`,
			"Content-Type": "application/json",
			"User-Agent": getAntigravityUserAgent(),
		};
		const response = await this.fetchImpl(`${CLOUD_CODE_ENDPOINT}/v1internal:loadCodeAssist`, {
			method: "POST",
			headers,
			body: JSON.stringify({ metadata: ANTIGRAVITY_LOAD_CODE_ASSIST_METADATA }),
		});
		if (!response.ok) {
			await response.arrayBuffer().catch(() => undefined);
			return undefined;
		}
		const load = await response.json() as LoadCodeAssistResponse;
		const discoveredProject = projectId(load.cloudaicompanionProject);
		if (!discoveredProject) return undefined;
		this.cachedUsageCredential = {
			type: "oauth",
			accessToken,
			refreshToken,
			expiresAt,
			projectId: discoveredProject,
		};
		return this.cachedUsageCredential;
	}
}

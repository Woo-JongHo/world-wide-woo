import { access, readFile } from "node:fs/promises";
import { homedir, platform } from "node:os";
import { join } from "node:path";
import type { Credential } from "@earendil-works/pi-ai";

const GOOGLE_LOGIN = "oauth-personal";

export interface GeminiCliUsageCredentialSource {
	read(): Promise<Credential | undefined>;
}

type KeychainReader = () => Promise<string | undefined>;

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function valueString(value: unknown): string | undefined {
	return typeof value === "string" && value.length > 0 ? value : undefined;
}

function valueNumber(value: unknown): number | undefined {
	return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function credentialFrom(value: unknown): Credential | undefined {
	if (!isRecord(value)) return undefined;
	const token = isRecord(value.token) ? value.token : value;
	const access = valueString(token.accessToken) ?? valueString(token.access_token);
	const refresh = valueString(token.refreshToken) ?? valueString(token.refresh_token);
	const expires = valueNumber(token.expiresAt) ?? valueNumber(token.expiry_date);
	if (!access || !refresh || expires === undefined) return undefined;
	return { type: "oauth", access, refresh, expires };
}

async function exists(path: string): Promise<boolean> {
	try {
		await access(path);
		return true;
	} catch {
		return false;
	}
}

async function systemKeychainReader(): Promise<string | undefined> {
	try {
		const child = Bun.spawn(["security", "find-generic-password", "-s", "gemini-cli-oauth", "-a", "main-account", "-w"], {
			stdout: "pipe",
			stderr: "ignore",
		});
		const [exitCode, text] = await Promise.all([child.exited, new Response(child.stdout).text()]);
		return exitCode === 0 ? text.trim() || undefined : undefined;
	} catch {
		return undefined;
	}
}

/**
 * Reads the Gemini CLI OAuth record in place for quota requests. The record is
 * never copied into WWW's credential store or returned beyond the usage adapter.
 */
export class SystemGeminiCliUsageCredentialSource implements GeminiCliUsageCredentialSource {
	constructor(
		private readonly home = homedir(),
		private readonly operatingSystem = platform(),
		private readonly keychain: KeychainReader = systemKeychainReader,
	) {}

	async read(): Promise<Credential | undefined> {
		if (!await this.googleLoginSelected()) return undefined;
		if (this.operatingSystem === "darwin") {
			const keychainCredential = await this.readKeychain();
			if (keychainCredential) return keychainCredential;
		}
		return this.readLegacyFile();
	}

	private async googleLoginSelected(): Promise<boolean> {
		try {
			const settings = JSON.parse(await readFile(join(this.home, ".gemini", "settings.json"), "utf8")) as unknown;
			return isRecord(settings) && isRecord(settings.security) && isRecord(settings.security.auth) && settings.security.auth.selectedType === GOOGLE_LOGIN;
		} catch {
			return false;
		}
	}

	private async readKeychain(): Promise<Credential | undefined> {
		const raw = await this.keychain();
		if (!raw) return undefined;
		try {
			return credentialFrom(JSON.parse(raw));
		} catch {
			return undefined;
		}
	}

	private async readLegacyFile(): Promise<Credential | undefined> {
		const path = join(this.home, ".gemini", "oauth_creds.json");
		if (!await exists(path)) return undefined;
		try {
			return credentialFrom(JSON.parse(await readFile(path, "utf8")));
		} catch {
			return undefined;
		}
	}
}

import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

export interface AntigravityLocalAuthSource {
	configured(): Promise<boolean>;
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

/**
 * Detects an existing Antigravity desktop login without reading Keychain or
 * returning the token. The token belongs to Antigravity and must not be reused
 * as a Gemini API credential.
 */
export class SystemAntigravityLocalAuthSource implements AntigravityLocalAuthSource {
	constructor(private readonly home = homedir()) {}

	async configured(): Promise<boolean> {
		try {
			return hasToken(JSON.parse(await readFile(join(this.home, ".gemini", "antigravity-cli", "antigravity-oauth-token"), "utf8")));
		} catch {
			return false;
		}
	}
}

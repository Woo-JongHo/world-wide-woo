import { afterEach, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SystemGeminiCliUsageCredentialSource } from "../src/adapters/outbound/observability/gemini-cli-usage-credentials";

const homes: string[] = [];
afterEach(async () => { for (const home of homes.splice(0)) await rm(home, { recursive: true, force: true }); });

test("Gemini CLI Keychain OAuth를 복사하지 않고 HUD 조회 자격으로 읽는다", async () => {
	const home = await mkdtemp(join(tmpdir(), "www-gemini-usage-"));
	homes.push(home);
	await mkdir(join(home, ".gemini"));
	await writeFile(join(home, ".gemini", "settings.json"), JSON.stringify({ security: { auth: { selectedType: "oauth-personal" } } }));
	const source = new SystemGeminiCliUsageCredentialSource(home, "darwin", async () => JSON.stringify({
		serverName: "main-account",
		token: { accessToken: "access-secret", refreshToken: "refresh-secret", expiresAt: 1_800_000_000_000 },
	}));
	await expect(source.read()).resolves.toEqual({ type: "oauth", access: "access-secret", refresh: "refresh-secret", expires: 1_800_000_000_000 });
});

test("Google 로그인 선택이 아니면 CLI의 이전 자격을 사용하지 않는다", async () => {
	const home = await mkdtemp(join(tmpdir(), "www-gemini-usage-"));
	homes.push(home);
	await mkdir(join(home, ".gemini"));
	await writeFile(join(home, ".gemini", "settings.json"), "{}\n");
	const source = new SystemGeminiCliUsageCredentialSource(home, "darwin", async () => JSON.stringify({ token: { accessToken: "access", refreshToken: "refresh", expiresAt: 1 } }));
	await expect(source.read()).resolves.toBeUndefined();
});

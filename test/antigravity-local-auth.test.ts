import { afterEach, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SystemAntigravityLocalAuthSource } from "../src/adapters/outbound/authentication/antigravity-local-auth";

const homes: string[] = [];
afterEach(async () => { for (const home of homes.splice(0)) await rm(home, { recursive: true, force: true }); });

test("Antigravity 로컬 토큰의 존재만 확인하고 토큰을 반환하지 않는다", async () => {
	const home = await mkdtemp(join(tmpdir(), "www-antigravity-auth-"));
	homes.push(home);
	await mkdir(join(home, ".gemini", "antigravity-cli"), { recursive: true });
	await writeFile(join(home, ".gemini", "antigravity-cli", "antigravity-oauth-token"), JSON.stringify({ token: "local-secret", auth_method: "oauth" }));
	await expect(new SystemAntigravityLocalAuthSource(home).configured()).resolves.toBe(true);
});

test("유효한 토큰 필드가 없으면 Antigravity 로그인을 주장하지 않는다", async () => {
	const home = await mkdtemp(join(tmpdir(), "www-antigravity-auth-"));
	homes.push(home);
	await mkdir(join(home, ".gemini", "antigravity-cli"), { recursive: true });
	await writeFile(join(home, ".gemini", "antigravity-cli", "antigravity-oauth-token"), "{}\n");
	await expect(new SystemAntigravityLocalAuthSource(home).configured()).resolves.toBe(false);
});

test("Antigravity OAuth 객체의 access_token도 값 없이 감지한다", async () => {
	const home = await mkdtemp(join(tmpdir(), "www-antigravity-auth-"));
	homes.push(home);
	await mkdir(join(home, ".gemini", "antigravity-cli"), { recursive: true });
	await writeFile(join(home, ".gemini", "antigravity-cli", "antigravity-oauth-token"), JSON.stringify({ token: { access_token: "local-secret", refresh_token: "refresh-secret" } }));
	await expect(new SystemAntigravityLocalAuthSource(home).configured()).resolves.toBe(true);
});

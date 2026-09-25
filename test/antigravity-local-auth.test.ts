import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, rm, writeFile }     from "node:fs/promises";
import { join }                              from "node:path";
import { tmpdir }                            from "node:os";
import { SystemAntigravityLocalAuthSource }  from "../src/adapters/outbound/authentication/antigravity-local-auth.js";

const homes: string[] = [];

afterEach(async () => {
	await Promise.all(homes.splice(0).map(home => rm(home, { recursive: true, force: true })));
});

async function tokenHome(): Promise<string> {
	const home = await mkdtemp(join(tmpdir(), "www-antigravity-"));
	homes.push(home);
	const directory = join(home, ".gemini", "antigravity-cli");
	await mkdir(directory, { recursive: true });
	await writeFile(join(directory, "antigravity-oauth-token"), JSON.stringify({
		token: {
			access_token  : "access-secret",
			refresh_token : "refresh-secret",
			expiry        : new Date(Date.now() + 60 * 60_000).toISOString(),
		},
	}));
	return home;
}

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

describe("SystemAntigravityLocalAuthSource", () => {
	test("discovers an existing companion project without onboarding", async () => {
		const home = await tokenHome();
		const requests: string[] = [];
		const source = new SystemAntigravityLocalAuthSource(home, async input => {
			requests.push(String(input));
			return Response.json({ cloudaicompanionProject: { id: "project-existing" } });
		});

		await expect(source.usageCredential()).resolves.toMatchObject({
			type: "oauth", accessToken: "access-secret", projectId: "project-existing",
		});
		expect(requests).toHaveLength(1);
		expect(requests[0]).toContain("loadCodeAssist");
	});

	test("does not mutate the Google account when no companion project exists", async () => {
		const home = await tokenHome();
		let requests = 0;
		const source = new SystemAntigravityLocalAuthSource(home, async (input, init) => {
			requests++;
			expect(String(input)).toContain("loadCodeAssist");
			expect(init?.method).toBe("POST");
			return Response.json({ allowedTiers: [{ id: "consumer-tier", isDefault: true }] });
		});

		await expect(source.usageCredential()).resolves.toBeUndefined();
		expect(requests).toBe(1);
	});
});

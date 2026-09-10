import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AuthController } from "../src/core/ports/index.js";
import { ProviderAuthController, SystemGeminiCliAuthGateway } from "../src/adapters/outbound/authentication/gemini-cli-auth.js";

const homes: string[] = [];
afterEach(async () => { for (const home of homes.splice(0)) await rm(home, { recursive: true, force: true }); });

function base(): AuthController {
	return {
		methods: () => ["api_key"],
		status: async provider => ({ state: "required", provider }),
		login: async (provider, type) => ({ state: "configured", provider, source: "base", type }),
		logout: async () => undefined,
	};
}

describe("ProviderAuthController", () => {
	test("offers Google subscription login before the API key alternative", () => {
		const auth = new ProviderAuthController(base(), { configured: async () => false, login: async () => undefined });
		expect(auth.methods("google")).toEqual(["oauth", "api_key"]);
		expect(auth.methods("openai")).toEqual(["api_key"]);
	});

	test("reports only a confirmed Gemini CLI credential as Google OAuth", async () => {
		const auth = new ProviderAuthController(base(), { configured: async () => true, login: async () => undefined });
		await expect(auth.status("google")).resolves.toEqual({
			state: "configured", provider: "google", source: "Gemini CLI · Google 계정", type: "oauth",
		});
	});

	test("does not complete Google OAuth until the CLI credential exists", async () => {
		let configured = false;
		const auth = new ProviderAuthController(base(), {
			configured: async () => configured,
			login: async () => { configured = true; },
		});
		await expect(auth.login("google", "oauth", { prompt: async () => "", notify: () => undefined })).resolves.toMatchObject({
			state: "configured", provider: "google", type: "oauth",
		});
	});

	test("persists ACP web authentication in the Gemini CLI config directory without opening Terminal", async () => {
		const home = await mkdtemp(join(tmpdir(), "www-gemini-auth-"));
		homes.push(home);
		await mkdir(join(home, ".gemini"));
		await writeFile(join(home, ".gemini", "settings.json"), "{}\n");
		const commands: string[] = [];
		let webAuthCalls = 0;
		const notifications: unknown[] = [];
		const gateway = new SystemGeminiCliAuthGateway(home, async (command, args) => {
			commands.push([command, ...args].join(" "));
			return { exitCode: 0 };
		}, 1, 10, "darwin", async (configDirectory, _signal, onAuthUrl) => {
			webAuthCalls += 1;
			expect(configDirectory).toBe(join(home, ".gemini"));
			await writeFile(join(configDirectory, "gemini-credentials.json"), "opaque");
			onAuthUrl?.("https://accounts.google.com/o/oauth2/v2/auth?state=test");
		});

		await gateway.login({ prompt: async () => "", notify: (event) => { notifications.push(event); } });
		expect(commands).toContain("gemini --version");
		expect(commands.some(command => command.startsWith("osascript -e"))).toBe(false);
		expect(webAuthCalls).toBe(1);
		expect(notifications).toContainEqual(expect.objectContaining({
			type: "auth_url", url: "https://accounts.google.com/o/oauth2/v2/auth?state=test",
		}));
		expect(await gateway.configured()).toBe(true);
		const settings = await Bun.file(join(home, ".gemini", "settings.json")).json();
		expect(settings.security.auth.selectedType).toBe("oauth-personal");
	});
});

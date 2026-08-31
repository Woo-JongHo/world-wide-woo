import { describe, expect, test } from "bun:test";
import type { Models } from "@earendil-works/pi-ai";
import { AuthFlowOverlay } from "../src/presentation/tui/auth-overlay";
import { AuthService } from "../src/infrastructure/auth-service";

function fakeAuthModels(): Pick<Models, "checkAuth" | "getProvider" | "login" | "logout"> {
	let configured = false;
	return {
		checkAuth: async () => configured ? { type: "api_key", source: "WWW 인증 저장소" } : undefined,
		getProvider: () => ({
			id: "openai",
			name: "OpenAI",
			auth: { apiKey: { name: "API key", login: async () => ({ type: "api_key", key: "unused" }), resolve: async () => undefined } },
			getModels: () => [],
			stream: () => { throw new Error("not used"); },
			streamSimple: () => { throw new Error("not used"); },
		}),
		login: async (_provider, _type, interaction) => {
			const key = await interaction.prompt({ type: "secret", message: "API 키" });
			expect(key).toBe("secret-token");
			configured = true;
			return { type: "api_key", key };
		},
		logout: async () => undefined,
	};
}

describe("AuthFlowOverlay", () => {
	test("masks secret input and completes login without rendering the credential", async () => {
		let authenticated = false;
		const overlay = new AuthFlowOverlay(
			"openai",
			["api_key"],
			new AuthService(fakeAuthModels()),
			() => undefined,
			() => { authenticated = true; },
			() => undefined,
		);
		overlay.start();
		await Bun.sleep(0);
		overlay.handleInput("secret-token");
		const pending = overlay.render(60).join("\n");
		expect(pending).not.toContain("secret-token");
		expect(pending).toContain("••••••••••••");
		overlay.handleInput("\r");
		for (let index = 0; index < 20 && !authenticated; index++) await Bun.sleep(1);
		expect(authenticated).toBe(true);
		expect(overlay.render(60).join("\n")).not.toContain("secret-token");
	});

	test.each(["\u0003", "\u0004"])("cancels an active auth overlay before global %j handling", async (key) => {
		let closed = false;
		const overlay = new AuthFlowOverlay(
			"openai",
			["api_key"],
			new AuthService(fakeAuthModels()),
			() => undefined,
			() => undefined,
			() => { closed = true; },
		);
		overlay.start();
		await Bun.sleep(0);
		overlay.handleInput(key);
		expect(closed).toBe(true);
	});
});

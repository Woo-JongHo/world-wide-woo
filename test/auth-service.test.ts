import { describe, expect, test } from "bun:test";
import type { AuthInteraction, Models } from "@earendil-works/pi-ai";
import { AuthService } from "../src/infrastructure/auth-service";

function fakeModels(overrides: Partial<Pick<Models, "checkAuth" | "getProvider" | "login" | "logout">> = {}): Pick<Models, "checkAuth" | "getProvider" | "login" | "logout"> {
	return {
		checkAuth: async () => undefined,
		getProvider: () => ({
			id: "test",
			name: "Test",
			auth: { apiKey: { name: "API key", login: async () => ({ type: "api_key", key: "stored" }), resolve: async () => undefined } },
			getModels: () => [],
			stream: () => { throw new Error("not used"); },
			streamSimple: () => { throw new Error("not used"); },
		}),
		login: async () => ({ type: "api_key", key: "stored" }),
		logout: async () => undefined,
		...overrides,
	};
}

const interaction: AuthInteraction = {
	prompt: async () => "secret",
	notify: () => undefined,
};

describe("AuthService", () => {
	test("distinguishes configured and required providers without exposing credentials", async () => {
		const configured = new AuthService(fakeModels({
			checkAuth: async () => ({ type: "api_key", source: "OPENAI_API_KEY" }),
		}));
		await expect(configured.status("openai")).resolves.toEqual({
			state: "configured",
			provider: "openai",
			source: "OPENAI_API_KEY",
			type: "api_key",
		});
		await expect(new AuthService(fakeModels()).status("anthropic")).resolves.toEqual({
			state: "required",
			provider: "anthropic",
		});
	});

	test("returns the post-login status and delegates logout", async () => {
		let configured = false;
		let loggedOut = false;
		const service = new AuthService(fakeModels({
			checkAuth: async () => configured ? { type: "api_key", source: "WWW 인증 저장소" } : undefined,
			login: async () => {
				configured = true;
				return { type: "api_key", key: "must-not-appear-in-status" };
			},
			logout: async () => {
				loggedOut = true;
			},
		}));

		expect(await service.login("google", "api_key", interaction)).toMatchObject({ state: "configured", provider: "google" });
		await service.logout("google");
		expect(loggedOut).toBe(true);
	});
});

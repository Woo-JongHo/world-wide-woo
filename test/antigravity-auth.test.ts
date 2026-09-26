import { describe, expect, test } from "bun:test";
import type { AuthController }    from "../src/core/ports/integration/auth-controller-port";
import { ProviderAuthController } from "../src/adapters/outbound/authentication/antigravity-auth.js";

function base(): AuthController {
	return {
		methods : () => ["api_key"],
		status  : async provider => ({ state: "required", provider }),
		login   : async (provider, type) => ({ state: "configured", provider, source: "base", type }),
		logout  : async () => undefined,
	};
}

describe("ProviderAuthController", () => {
	test("Google API 키 선택지만 제공하고 폐기된 Gemini OAuth 흐름은 제공하지 않는다", () => {
		const auth = new ProviderAuthController(base(), { configured: async () => false });
		expect(auth.methods("google")).toEqual(["api_key"]);
	});

	test("확인된 Antigravity 로컬 세션을 Google 구독 상태로 표시한다", async () => {
		const auth = new ProviderAuthController(base(), { configured: async () => true });
		await expect(auth.status("google")).resolves.toEqual({
			state: "configured", provider: "google", source: "Antigravity · 로컬 구독", type: "oauth",
		});
	});
});

import { describe, expect, test } from "bun:test";
import { stripTerminalSequences, visibleWidth } from "@earendil-works/pi-tui";
import type { Models } from "@earendil-works/pi-ai";
import { AuthFlowOverlay, GEMINI_API_KEY_URL, LoginOverlay } from "../src/adapters/inbound/tui/overlays/auth-overlay";
import { AuthService } from "../src/adapters/outbound/authentication/auth-service";

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
	test("describes Google OAuth as an in-browser login instead of a Gemini terminal", async () => {
		const overlay = new AuthFlowOverlay(
			"google", ["oauth", "api_key"], new AuthService(fakeAuthModels()), () => undefined,
			() => undefined, () => undefined,
		);
		overlay.start();
		await Bun.sleep(0);
		const output = stripTerminalSequences(overlay.render(80).join("\n"));
		expect(output).toContain("브라우저에서 Google 계정 로그인");
		expect(output).not.toContain("Gemini CLI");
	});

	test("keeps provider selection and auth in one keyboard surface", async () => {
		let closed = false;
		const overlay = new LoginOverlay(
			new AuthService(fakeAuthModels()),
			() => undefined,
			() => undefined,
			() => { closed = true; },
			["openai"],
		);
		overlay.start();
		await Bun.sleep(0);
		expect(overlay.render(80).join("\n")).toContain("OpenAI API");
		overlay.handleInput("\r");
		await Bun.sleep(0);
		expect(overlay.render(80).join("\n")).toContain("API 키");
		overlay.handleInput("\u001b");
		expect(closed).toBe(true);
	});

	test.each(["\u001b", "\u0003", "\u0004"])("cancels provider selection with %j", async (key) => {
		let closed = false;
		const overlay = new LoginOverlay(
			new AuthService(fakeAuthModels()),
			() => undefined,
			() => undefined,
			() => { closed = true; },
			["openai"],
		);
		overlay.start();
		overlay.handleInput(key);
		expect(closed).toBe(true);
	});

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

	test("shows and opens the official Gemini API key page without capturing the shortcut as a secret", async () => {
		const opened: string[] = [];
		const overlay = new AuthFlowOverlay(
			"google", ["api_key"], new AuthService(fakeAuthModels()), () => undefined,
			() => undefined, () => undefined, async (url) => { opened.push(url); },
		);
		overlay.start();
		await Bun.sleep(0);
		const output = overlay.render(80).join("\n");
		expect(output).toContain("Gemini API 키 발급");
		expect(output).toContain(GEMINI_API_KEY_URL);
		expect(output).toContain("Ctrl+O 브라우저에서 열기");
		for (const width of [40, 80, 120]) {
			expect(overlay.render(width).every((line) => visibleWidth(line) <= width)).toBe(true);
		}
		overlay.handleInput("\u000f");
		await Bun.sleep(0);
		expect(opened).toEqual([GEMINI_API_KEY_URL]);
		expect(overlay.render(80).join("\n")).toContain("> 입력 중…");
	});

	test("keeps a copyable Gemini URL after browser launch fails", async () => {
		const overlay = new AuthFlowOverlay(
			"google", ["api_key"], new AuthService(fakeAuthModels()), () => undefined,
			() => undefined, () => undefined, async () => { throw new Error("browser unavailable"); },
		);
		overlay.start();
		await Bun.sleep(0);
		overlay.handleInput("\u000f");
		await Bun.sleep(0);
		const output = overlay.render(80).join("\n");
		expect(output).toContain("브라우저를 열지 못했습니다");
		expect(output).toContain(GEMINI_API_KEY_URL);
	});
});

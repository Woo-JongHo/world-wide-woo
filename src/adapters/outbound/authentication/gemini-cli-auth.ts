import { access, readFile, writeFile, mkdir } from "node:fs/promises";
import { homedir, platform } from "node:os";
import { dirname, join } from "node:path";
import type { AuthInteraction, AuthType } from "@earendil-works/pi-ai";
import type { AuthController, ProviderAuthState } from "../../../core/ports/index.js";
import type { Provider } from "../../../core/domain/execution/model-settings.js";

const GOOGLE_LOGIN = "oauth-personal";

export interface GeminiCliAuthGateway {
	configured(): Promise<boolean>;
	login(interaction: AuthInteraction): Promise<void>;
}

/** Adds Google subscription authentication without pretending that a Gemini CLI
 * credential is a Generative Language API key. */
/** @Unit Code-015 */
export class ProviderAuthController implements AuthController {
	constructor(
		private readonly base: AuthController,
		private readonly gemini: GeminiCliAuthGateway = new SystemGeminiCliAuthGateway(),
	) {}

	methods(provider: Provider): AuthType[] {
		const methods = this.base.methods(provider);
		return provider === "google" ? ["oauth", ...methods.filter(method => method !== "oauth")] : methods;
	}

	async status(provider: Provider, signal?: AbortSignal): Promise<ProviderAuthState> {
		if (provider === "google" && await this.gemini.configured()) {
			return { state: "configured", provider, source: "Gemini CLI · Google 계정", type: "oauth" };
		}
		return this.base.status(provider, signal);
	}

	async login(provider: Provider, type: AuthType, interaction: AuthInteraction): Promise<ProviderAuthState> {
		if (provider !== "google" || type !== "oauth") return this.base.login(provider, type, interaction);
		await this.gemini.login(interaction);
		if (!await this.gemini.configured()) throw new Error("Gemini CLI의 Google 로그인이 완료되지 않았습니다.");
		return { state: "configured", provider, source: "Gemini CLI · Google 계정", type: "oauth" };
	}

	logout(provider: Provider, signal?: AbortSignal): Promise<void> {
		return this.base.logout(provider, signal);
	}
}

export class SystemGeminiCliAuthGateway implements GeminiCliAuthGateway {
	constructor(
		private readonly home = homedir(),
		private readonly run = runCommand,
		private readonly waitIntervalMs = 500,
		private readonly waitLimitMs = 5 * 60_000,
	) {}

	async configured(): Promise<boolean> {
		const settings = await this.settings();
		if (settings?.security?.auth?.selectedType !== GOOGLE_LOGIN) return false;
		const legacy = join(this.home, ".gemini", "oauth_creds.json");
		const fallback = join(this.home, ".gemini", "gemini-credentials.json");
		if (await exists(legacy) || await exists(fallback)) return true;
		if (platform() !== "darwin") return false;
		return (await this.run("security", ["find-generic-password", "-s", "gemini-cli-oauth", "-a", "main-account"])).exitCode === 0;
	}

	async login(interaction: AuthInteraction): Promise<void> {
		if ((await this.run("gemini", ["--version"])).exitCode !== 0) {
			throw new Error("Gemini CLI가 설치되어 있지 않습니다. 먼저 공식 Gemini CLI를 설치하세요.");
		}
		await this.selectGoogleLogin();
		interaction.notify({
			type: "info",
			message: "별도 터미널에서 Gemini CLI를 열었습니다. 브라우저에서 구독 계정 로그인을 완료하세요.",
			links: [{ label: "공식 로그인 안내", url: "https://geminicli.com/docs/get-started/authentication/" }],
		});
		await this.launchTerminal();
		const startedAt = Date.now();
		while (!await this.configured()) {
			if (interaction.signal?.aborted) throw new DOMException("로그인이 취소되었습니다.", "AbortError");
			if (Date.now() - startedAt >= this.waitLimitMs) throw new Error("Gemini CLI 로그인을 확인하지 못했습니다. 다시 시도하세요.");
			await Bun.sleep(this.waitIntervalMs);
		}
	}

	private async settings(): Promise<any> {
		try { return JSON.parse(await readFile(join(this.home, ".gemini", "settings.json"), "utf8")); }
		catch { return {}; }
	}

	private async selectGoogleLogin(): Promise<void> {
		const path = join(this.home, ".gemini", "settings.json");
		const settings = await this.settings();
		settings.security = { ...(settings.security ?? {}), auth: { ...(settings.security?.auth ?? {}), selectedType: GOOGLE_LOGIN } };
		await mkdir(dirname(path), { recursive: true });
		await writeFile(path, `${JSON.stringify(settings, null, 2)}\n`, { mode: 0o600 });
	}

	private async launchTerminal(): Promise<void> {
		if (platform() === "darwin") {
			const script = 'tell application "Terminal" to do script "gemini"';
			const result = await this.run("osascript", ["-e", script]);
			if (result.exitCode === 0) return;
		}
		throw new Error("로그인 터미널을 열 수 없습니다. 새 터미널에서 gemini를 실행하세요.");
	}
}

async function exists(path: string): Promise<boolean> {
	try { await access(path); return true; } catch { return false; }
}

async function runCommand(command: string, args: readonly string[]): Promise<{ exitCode: number }> {
	try {
		const process = Bun.spawn([command, ...args], { stdout: "ignore", stderr: "ignore" });
		return { exitCode: await process.exited };
	} catch {
		return { exitCode: 127 };
	}
}

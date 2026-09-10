import { access, readFile, writeFile, mkdir } from "node:fs/promises";
import { homedir, platform } from "node:os";
import { dirname, join } from "node:path";
import { spawn } from "node:child_process";
import type { AuthInteraction, AuthType } from "@earendil-works/pi-ai";
import type { AuthController, ProviderAuthState } from "../../../core/ports/index.js";
import type { Provider } from "../../../core/domain/execution/model-settings.js";

const GOOGLE_LOGIN = "oauth-personal";

export interface GeminiCliAuthGateway {
	configured(): Promise<boolean>;
	login(interaction: AuthInteraction): Promise<void>;
}

type GeminiWebAuthenticator = (configDirectory: string, signal?: AbortSignal, onAuthUrl?: (url: string) => void) => Promise<void>;

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
		private readonly operatingSystem = platform(),
		private readonly authenticateWithWeb: GeminiWebAuthenticator = runGeminiAcpWebAuthentication,
	) {}

	async configured(): Promise<boolean> {
		const settings = await this.settings();
		if (settings?.security?.auth?.selectedType !== GOOGLE_LOGIN) return false;
		const legacy = join(this.home, ".gemini", "oauth_creds.json");
		const fallback = join(this.home, ".gemini", "gemini-credentials.json");
		if (await exists(legacy) || await exists(fallback)) return true;
		if (this.operatingSystem !== "darwin") return false;
		return (await this.run("security", ["find-generic-password", "-s", "gemini-cli-oauth", "-a", "main-account"])).exitCode === 0;
	}

	async login(interaction: AuthInteraction): Promise<void> {
		if ((await this.run("gemini", ["--version"])).exitCode !== 0) {
			throw new Error("Gemini CLI가 설치되어 있지 않습니다. 먼저 공식 Gemini CLI를 설치하세요.");
		}
		interaction.notify({
			type: "info",
			message: "브라우저에서 Google 계정 로그인을 완료하세요. 이 화면이 인증 완료를 자동으로 확인합니다.",
			links: [{ label: "공식 로그인 안내", url: "https://geminicli.com/docs/get-started/authentication/" }],
		});
		await this.authenticateWithWeb(join(this.home, ".gemini"), interaction.signal, (url) => interaction.notify({
			type: "auth_url",
			url,
			instructions: "브라우저에서 Google 계정 로그인을 완료하세요.",
		}));
		await this.selectGoogleLogin();
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

async function runGeminiAcpWebAuthentication(configDirectory: string, signal?: AbortSignal, onAuthUrl?: (url: string) => void): Promise<void> {
	const environment = { ...process.env };
	delete environment.NO_BROWSER;
	const configRoot = dirname(configDirectory);
	environment.GEMINI_CLI_HOME = configRoot;
	environment.GEMINI_FORCE_ENCRYPTED_FILE_STORAGE = "true";
	await mkdir(configDirectory, { recursive: true });
	await writeFile(join(configDirectory, "settings.json"), `${JSON.stringify({
		security: { auth: { useExternal: true } },
	}, null, 2)}\n`, { mode: 0o600 });
	const child = spawn("gemini", ["--acp", "--skip-trust"], {
		stdio: ["pipe", "pipe", "pipe"],
		env: environment,
		cwd: configRoot,
	});
	const abort = () => child.kill();
	signal?.addEventListener("abort", abort, { once: true });
	if (signal?.aborted) abort();
	child.stderr.resume();
	const decoder = new TextDecoder();
	let buffer = "";
	let initialized = false;
	let authUrlPublished = false;
	try {
		child.stdin.write(`${JSON.stringify({
			jsonrpc: "2.0", id: 1, method: "initialize", params: {
				protocolVersion: 1,
				clientCapabilities: { auth: { terminal: false }, fs: { readTextFile: false, writeTextFile: false }, terminal: false },
				clientInfo: { name: "world-wide-woo", version: "0.0.16" },
			},
		})}\n`);
		for await (const value of child.stdout) {
			buffer += decoder.decode(value, { stream: true });
			const lines = buffer.split("\n");
			buffer = lines.pop() ?? "";
			for (const line of lines) {
				if (!line.trim()) continue;
				const text = line.trim();
				if (!authUrlPublished && /^https:\/\/accounts\.google\.com\/o\/oauth2\//u.test(text)) {
					authUrlPublished = true;
					onAuthUrl?.(text);
					continue;
				}
				let message: { id?: number; result?: unknown; error?: { message?: string } };
				try { message = JSON.parse(line); } catch { continue; }
				if (message.id === 1) {
					if (message.error) throw new Error("Gemini ACP 초기화에 실패했습니다.");
					initialized = true;
					child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id: 2, method: "authenticate", params: { methodId: GOOGLE_LOGIN } })}\n`);
				}
				if (message.id === 2) {
					if (message.error) throw new Error("Google 브라우저 인증에 실패했습니다.");
					return;
				}
			}
		}
		if (signal?.aborted) throw new DOMException("로그인이 취소되었습니다.", "AbortError");
		throw new Error(initialized ? "Google 브라우저 인증이 완료되기 전에 종료되었습니다." : "Gemini ACP를 시작하지 못했습니다.");
	} finally {
		signal?.removeEventListener("abort", abort);
		child.stdin.end();
		child.kill();
		await new Promise<void>((resolve) => {
			if (child.exitCode !== null || child.signalCode !== null) return resolve();
			child.once("exit", () => resolve());
		});
	}
}

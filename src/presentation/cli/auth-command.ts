import { createInterface } from "node:readline/promises";
import type { AuthEvent, AuthPrompt } from "@earendil-works/pi-ai";
import type { AuthController } from "../../application/ports";
import { PROVIDERS, type Provider } from "../../domain/model-settings";

function providerFrom(value: string | undefined): Provider {
	if (value && PROVIDERS.includes(value as Provider)) return value as Provider;
	throw new Error(`공급자를 지정하세요: ${PROVIDERS.join(", ")}`);
}

async function readLine(message: string): Promise<string> {
	const readline = createInterface({ input: process.stdin, output: process.stdout });
	try {
		return (await readline.question(`${message} `)).trim();
	} finally {
		readline.close();
	}
}

async function readSecret(message: string, signal?: AbortSignal): Promise<string> {
	if (!process.stdin.isTTY || !process.stdout.isTTY || !process.stdin.setRawMode) {
		throw new Error("API 키 입력에는 대화형 터미널이 필요합니다.");
	}
	return new Promise<string>((resolve, reject) => {
		let value = "";
		const stdin = process.stdin;
		const cleanup = () => {
			stdin.off("data", onData);
			signal?.removeEventListener("abort", onAbort);
			stdin.setRawMode(false);
			stdin.pause();
		};
		const fail = (error: Error) => {
			cleanup();
			process.stdout.write("\n");
			reject(error);
		};
		const onAbort = () => fail(new DOMException("인증 입력이 취소되었습니다.", "AbortError"));
		const onData = (chunk: Buffer | string) => {
			const data = chunk.toString();
			if (data === "\r" || data === "\n") {
				cleanup();
				process.stdout.write("\n");
				if (!value) reject(new Error("빈 API 키는 저장할 수 없습니다."));
				else resolve(value);
				return;
			}
			if (data === "\u0003" || data === "\u001b") return fail(new Error("인증 입력이 취소되었습니다."));
			if (data === "\u007f" || data === "\b") {
				if (value) {
					value = Array.from(value).slice(0, -1).join("");
					process.stdout.write("\b \b");
				}
				return;
			}
			if (![...data].some((character) => character < " ")) {
				value += data;
				process.stdout.write("•".repeat(Array.from(data).length));
			}
		};
		process.stdout.write(`${message} `);
		stdin.setRawMode(true);
		stdin.resume();
		stdin.on("data", onData);
		signal?.addEventListener("abort", onAbort, { once: true });
		if (signal?.aborted) onAbort();
	});
}

async function answerPrompt(prompt: AuthPrompt): Promise<string> {
	if (prompt.type === "secret") return readSecret(prompt.message, prompt.signal);
	if (prompt.type === "select") {
		for (const [index, option] of prompt.options.entries()) {
			console.log(`${index + 1}. ${option.label}${option.description ? ` — ${option.description}` : ""}`);
		}
		const answer = Number(await readLine(prompt.message));
		const selected = prompt.options[answer - 1];
		if (!selected) throw new Error("올바른 번호를 선택하세요.");
		return selected.id;
	}
	return readLine(prompt.message);
}

function notify(event: AuthEvent): void {
	if (event.type === "auth_url") {
		console.log(`${event.instructions ?? "브라우저에서 인증하세요."}\n${event.url}`);
		return;
	}
	if (event.type === "device_code") {
		console.log(`${event.verificationUri}\n인증 코드: ${event.userCode}`);
		return;
	}
	console.log(event.message);
}

export async function runAuthCommand(auth: AuthController, args: string[]): Promise<void> {
	const operation = args[0] ?? "status";

	if (operation === "status") {
		for (const provider of PROVIDERS) {
			const status = await auth.status(provider);
			if (status.state === "configured") console.log(`${provider}: 연결됨 (${status.source})`);
			if (status.state === "required") console.log(`${provider}: 인증 필요`);
			if (status.state === "failed") console.log(`${provider}: 확인 실패 (${status.message})`);
		}
		return;
	}

	const provider = providerFrom(args[1]);
	if (operation === "login") {
		const requestedMethod = args[2];
		const method = requestedMethod === "api-key"
			? "api_key"
			: requestedMethod === "oauth"
				? "oauth"
				: provider === "openai-codex" || provider === "anthropic"
					? "oauth"
					: "api_key";
		const status = await auth.login(provider, method, { prompt: answerPrompt, notify });
		if (status.state !== "configured") throw new Error(`${provider} 인증 상태를 확인할 수 없습니다.`);
		console.log(`${provider} 인증을 안전하게 저장했습니다.`);
		return;
	}
	if (operation === "logout") {
		await auth.logout(provider);
		console.log(`${provider} 인증을 삭제했습니다.`);
		return;
	}
	throw new Error("인증 명령은 status, login, logout 중 하나여야 합니다.");
}

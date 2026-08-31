import type { SlashCommand } from "@earendil-works/pi-tui";
import {
	EFFORTS,
	MODELS,
	PROVIDERS,
	type Effort,
	type Provider,
	type WwwSettings,
} from "../../domain/model-settings";

export type ShellCommand =
	| { type: "model.select" }
	| { type: "model.set"; settings: WwwSettings }
	| { type: "auth.select" }
	| { type: "auth.login"; provider: Provider }
	| { type: "auth.logout"; provider: Provider }
	| { type: "effort.set"; effort: Effort }
	| { type: "usage.refresh" }
	| { type: "status" }
	| { type: "monitoring" }
	| { type: "repository.commits" }
	| { type: "repository.issues" }
	| { type: "help" }
	| { type: "exit" }
	| { type: "error"; message: string };

export type ShellCommandConcurrency = "local-read" | "async-read" | "mutation" | "control" | "error";

export function shellCommandConcurrency(command: ShellCommand): ShellCommandConcurrency {
	switch (command.type) {
		case "status":
		case "monitoring":
		case "help":
			return "local-read";
		case "usage.refresh":
		case "repository.commits":
		case "repository.issues":
			return "async-read";
		case "model.select":
		case "model.set":
		case "auth.select":
		case "auth.login":
		case "auth.logout":
		case "effort.set":
			return "mutation";
		case "exit":
			return "control";
		case "error":
			return "error";
	}
}

const modelItems = PROVIDERS.flatMap((provider) =>
	MODELS[provider].map((model) => ({
		value: `${provider}/${model}`,
		label: `${provider}/${model}`,
		description: "Router 모델",
	})),
);

export const SLASH_COMMANDS: SlashCommand[] = [
	{
		name: "model",
		description: "Router·모델·추론 강도 설정",
		argumentHint: "[provider/model] [low|medium|high|ultra]",
		getArgumentCompletions: (prefix) => prefix.includes(" ")
			? EFFORTS.map((effort) => ({ value: effort, label: effort, description: "추론 강도" }))
			: modelItems,
	},
	{
		name: "login",
		description: "Codex·Claude·API Provider 로그인",
		argumentHint: "[provider]",
		getArgumentCompletions: () => PROVIDERS.map((provider) => ({ value: provider, label: provider })),
	},
	{
		name: "logout",
		description: "저장된 Provider 인증 삭제",
		argumentHint: "<provider>",
		getArgumentCompletions: () => PROVIDERS.map((provider) => ({ value: provider, label: provider })),
	},
	{
		name: "effort",
		description: "활성 모델 추론 강도 변경",
		argumentHint: "<low|medium|high|ultra>",
		getArgumentCompletions: () => EFFORTS.map((effort) => ({ value: effort, label: effort })),
	},
	{ name: "usage", description: "Codex·Claude 사용량 즉시 갱신" },
	{ name: "status", description: "현재 Router·인증·세션 상태" },
	{ name: "monitor", description: "실시간 Session·Turn·Tool·Todo 관측" },
	{ name: "dashboard", description: "Monitoring Dashboard 열기" },
	{ name: "commits", description: "Git 작업 트리와 최근 Commit" },
	{ name: "issues", description: "현재 저장소의 열린 GitHub Issue" },
	{ name: "help", description: "WWW Shell 명령 안내" },
	{ name: "exit", description: "세션을 안전하게 종료" },
];

function provider(value: string): Provider | null {
	return PROVIDERS.includes(value as Provider) ? value as Provider : null;
}

export function parseShellCommand(text: string, current: WwwSettings): ShellCommand | null {
	const trimmed = text.trim();
	if (!trimmed.startsWith("/")) return null;
	const [name, ...args] = trimmed.slice(1).split(/\s+/u);
	if (name === "model") {
		if (!args[0]) return { type: "model.select" };
		const separator = args[0].indexOf("/");
		if (separator <= 0) return { type: "error", message: "모델은 provider/model 형식으로 입력하세요." };
		const providerId = provider(args[0].slice(0, separator));
		const model = args[0].slice(separator + 1);
		if (!providerId || !(MODELS[providerId] as readonly string[]).includes(model)) {
			return { type: "error", message: `지원하지 않는 모델입니다: ${args[0]}` };
		}
		const effort = args[1] ?? current.effort;
		if (!EFFORTS.includes(effort as Effort)) {
			return { type: "error", message: `지원하지 않는 추론 강도입니다: ${effort}` };
		}
		return { type: "model.set", settings: { provider: providerId, model, effort: effort as Effort } };
	}
	if (name === "login") {
		if (!args[0]) return { type: "auth.select" };
		const providerId = provider(args[0]);
		return providerId
			? { type: "auth.login", provider: providerId }
			: { type: "error", message: `지원하지 않는 Provider입니다: ${args[0]}` };
	}
	if (name === "logout") {
		const providerId = provider(args[0] ?? "");
		return providerId
			? { type: "auth.logout", provider: providerId }
			: { type: "error", message: "사용법: /logout <provider>" };
	}
	if (name === "effort") {
		const effort = args[0];
		return EFFORTS.includes(effort as Effort)
			? { type: "effort.set", effort: effort as Effort }
			: { type: "error", message: "사용법: /effort <low|medium|high|ultra>" };
	}
	if (name === "usage") return { type: "usage.refresh" };
	if (name === "status") return { type: "status" };
	if (name === "monitor" || name === "dashboard") return { type: "monitoring" };
	if (name === "commits" || name === "commit") return { type: "repository.commits" };
	if (name === "issues" || name === "issue") return { type: "repository.issues" };
	if (name === "help") return { type: "help" };
	if (name === "exit" || name === "quit") return { type: "exit" };
	return { type: "error", message: `알 수 없는 명령입니다: /${name}` };
}

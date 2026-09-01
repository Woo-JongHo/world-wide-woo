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
	| { type: "planning.status" }
	| { type: "planning.epic.create"; title: string; goal: string }
	| { type: "planning.story.create"; epicId: string; title: string; acceptance: string; supersedes: string | null }
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
		case "planning.status":
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
		case "planning.epic.create":
		case "planning.story.create":
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
	{ name: "planning", description: "Project Planning catalog 상태" },
	{ name: "epic", description: "새 Epic 초안 저장", argumentHint: "<title> :: <goal>" },
	{ name: "story", description: "새 Story 초안 저장", argumentHint: "<EP-ID> <title> [--supersedes ST-ID] :: <acceptance>" },
	{ name: "commits", description: "Git 작업 트리와 최근 Commit" },
	{ name: "issues", description: "현재 저장소의 열린 GitHub Issue" },
	{ name: "help", description: "WWW Shell 명령 안내" },
	{ name: "exit", description: "세션을 안전하게 종료" },
];

export type WorkbenchShellCommand =
	| { type: "pane.show"; pane: "chat" | "tnotes" | "todo" }
	| { type: "activity.select"; activityId: string | "latest" | null }
	| { type: "tnote.capture" }
	| { type: "tnote.capture-range"; startSequence: number; endSequence: number }
	| { type: "todo.create"; title: string; items: readonly string[] }
	| { type: "todo.add"; placement: "now" | "after"; content: string }
	| { type: "todo.details"; itemId: string; details: readonly string[] }
	| { type: "todo.transition"; action: "start" | "complete" | "block" | "reopen"; itemId: string }
	| { type: "todo.evidence"; activityId: string | "latest" }
	| { type: "todo.import-legacy" }
	| { type: "promotion.accept"; noteId: string }
	| { type: "promotion.confirm"; token: string }
	| { type: "review.preview"; provider: "anthropic" | "google"; noteId: string; request: string }
	| { type: "review.send"; digest: string }
	| { type: "approval.accept" }
	| { type: "approval.accept-session" }
	| { type: "approval.decline" }
	| { type: "chat.cancel" }
	| { type: "exit" }
	| { type: "error"; message: string };

export const WORKBENCH_SLASH_COMMANDS: SlashCommand[] = [
	{ name: "chat", description: "Chat pane 안내" },
	{ name: "tnotes", description: "T-notes·source pane 안내" },
	{ name: "todo", description: "Todo.md 생성·항목·근거 관리", argumentHint: "<create|add|detail|start|complete|block|reopen|evidence|import-legacy> …" },
	{ name: "source", description: "Activity source 선택", argumentHint: "<activity-id|latest|clear>" },
	{ name: "tnote", description: "선택 또는 연속 Activity를 T-note로 캡처", argumentHint: "[range <start-sequence> <end-sequence>]" },
	{ name: "promote", description: "T-note 정본 반영: diff 확인 후 사람 승인", argumentHint: "<tnote|confirm> <note-id|token>" },
	{ name: "review", description: "공개 분류 T-note의 외부 검토 미리보기·송신", argumentHint: "<preview|send> …" },
	{ name: "approve", description: "대기 중인 native 요청 승인" },
	{ name: "approve-session", description: "현재 세션 동안 native 요청 승인" },
	{ name: "decline", description: "대기 중인 native 요청 거절" },
	{ name: "cancel", description: "현재 native turn 중단" },
	{ name: "exit", description: "Workbench를 안전하게 종료" },
];

export function parseWorkbenchShellCommand(text: string): WorkbenchShellCommand | null {
	const trimmed = text.trim();
	if (!trimmed.startsWith("/")) return null;
	const [name, ...args] = trimmed.slice(1).split(/\s+/u);
	if ((name === "chat" || name === "tnotes" || name === "todo") && args.length === 0) return { type: "pane.show", pane: name };
	if (name === "source") {
		const activityId = args[0];
		if (!activityId) return { type: "error", message: "사용법: /source <activity-id|latest|clear>" };
		return { type: "activity.select", activityId: activityId === "clear" ? null : activityId };
	}
	if (name === "tnote") {
		if (args.length === 0) return { type: "tnote.capture" };
		if (args[0] !== "range" || args.length !== 3) return { type: "error", message: "사용법: /tnote [range <start-sequence> <end-sequence>]" };
		const startSequence = parseSequence(args[1]);
		const endSequence = parseSequence(args[2]);
		return startSequence !== null && endSequence !== null && startSequence <= endSequence
			? { type: "tnote.capture-range", startSequence, endSequence }
			: { type: "error", message: "T-note 범위는 1 이상의 시작·끝 sequence여야 합니다." };
	}
	if (name === "todo") return parseTodoCommand(trimmed);
	if (name === "promote") {
		if (args[0] === "tnote" && args.length === 2 && args[1]) return { type: "promotion.accept", noteId: args[1] };
		if (args[0] === "confirm" && args.length === 2 && args[1]) return { type: "promotion.confirm", token: args[1] };
		return { type: "error", message: "사용법: /promote tnote <note-id> | /promote confirm <token>" };
	}
	if (name === "review") return parseReviewCommand(trimmed);
	if (name === "approve") return { type: "approval.accept" };
	if (name === "approve-session") return { type: "approval.accept-session" };
	if (name === "decline") return { type: "approval.decline" };
	if (name === "cancel") return { type: "chat.cancel" };
	if (name === "exit" || name === "quit") return { type: "exit" };
	return null;
}

function parseTodoCommand(trimmed: string): WorkbenchShellCommand {
	const body = trimmed.slice("/todo".length).trim();
	const [action, ...args] = body.split(/\s+/u);
	if (action === "create") {
		const separator = body.slice("create".length).indexOf("::");
		const header = separator < 0 ? "" : body.slice("create".length, "create".length + separator).trim();
		const items = separator < 0 ? [] : body.slice("create".length + separator + 2)
			.split("|").map(item => item.trim()).filter(Boolean);
		return header && items.length > 0
			? { type: "todo.create", title: header, items }
			: { type: "error", message: "사용법: /todo create <title> :: <item1> | <item2>" };
	}
	if (action === "add") {
		const placement = args[0];
		const content = body.slice("add".length).trim().slice(placement?.length ?? 0).trim();
		return (placement === "now" || placement === "after") && content
			? { type: "todo.add", placement, content }
			: { type: "error", message: "사용법: /todo add <now|after> <text>" };
	}
	if (action === "detail") {
		const itemId = args[0];
		const detail = body.slice("detail".length).trim().slice(itemId?.length ?? 0).trim();
		return itemId && detail
			? { type: "todo.details", itemId, details: [detail] }
			: { type: "error", message: "사용법: /todo detail <id> <text>" };
	}
	if (action === "start" || action === "complete" || action === "block" || action === "reopen") {
		return args.length === 1 && args[0]
			? { type: "todo.transition", action, itemId: args[0] }
			: { type: "error", message: "사용법: /todo start|complete|block|reopen <id>" };
	}
	if (action === "evidence") {
		return args.length === 1 && args[0]
			? { type: "todo.evidence", activityId: args[0] }
			: { type: "error", message: "사용법: /todo evidence <activity-id|latest>" };
	}
	if (action === "import-legacy" && args.length === 0) return { type: "todo.import-legacy" };
	return { type: "error", message: "사용법: /todo create|add|detail|start|complete|block|reopen|evidence|import-legacy …" };
}

function parseReviewCommand(trimmed: string): WorkbenchShellCommand {
	const body = trimmed.slice("/review".length).trim();
	const [action, ...args] = body.split(/\s+/u);
	if (action === "send") {
		return args.length === 1 && args[0]
			? { type: "review.send", digest: args[0] }
			: { type: "error", message: "사용법: /review send <digest>" };
	}
	if (action !== "preview") return { type: "error", message: "사용법: /review preview <opus|gemini> public <note-id> :: <request> | /review send <digest>" };
	const separator = body.indexOf("::");
	const header = separator < 0 ? [] : body.slice(0, separator).trim().split(/\s+/u);
	const request = separator < 0 ? "" : body.slice(separator + 2).trim();
	const provider = header[1];
	const classification = header[2];
	const noteId = header[3];
	return (provider === "opus" || provider === "gemini") && classification === "public" && noteId && request && header.length === 4
		? { type: "review.preview", provider: provider === "opus" ? "anthropic" : "google", noteId, request }
		: { type: "error", message: "사용법: /review preview <opus|gemini> public <note-id> :: <request>" };
}

function parseSequence(value: string | undefined): number | null {
	if (!value || !/^\d+$/u.test(value)) return null;
	const sequence = Number(value);
	return Number.isSafeInteger(sequence) && sequence > 0 ? sequence : null;
}

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
	if (name === "planning") return { type: "planning.status" };
	if (name === "epic") {
		const body = trimmed.slice("/epic".length).trim();
		const separator = body.indexOf("::");
		const title = separator < 0 ? "" : body.slice(0, separator).trim();
		const goal = separator < 0 ? "" : body.slice(separator + 2).trim();
		return title && goal
			? { type: "planning.epic.create", title, goal }
			: { type: "error", message: "사용법: /epic <title> :: <goal>" };
	}
	if (name === "story") {
		const body = trimmed.slice("/story".length).trim();
		const separator = body.indexOf("::");
		const header = separator < 0 ? "" : body.slice(0, separator).trim();
		const acceptance = separator < 0 ? "" : body.slice(separator + 2).trim();
		const parts = header.split(/\s+/u).filter(Boolean);
		const epicId = parts.shift() ?? "";
		const supersedesAt = parts.indexOf("--supersedes");
		let supersedes: string | null = null;
		if (supersedesAt >= 0) {
			supersedes = parts[supersedesAt + 1] ?? null;
			parts.splice(supersedesAt, 2);
		}
		const title = parts.join(" ");
		if (!/^EP-\d{3}$/u.test(epicId) || !title || !acceptance || (supersedesAt >= 0 && !/^ST-\d{3}-\d{2}$/u.test(supersedes ?? ""))) {
			return { type: "error", message: "사용법: /story <EP-ID> <title> [--supersedes ST-ID] :: <acceptance>" };
		}
		return { type: "planning.story.create", epicId, title, acceptance, supersedes };
	}
	if (name === "commits" || name === "commit") return { type: "repository.commits" };
	if (name === "issues" || name === "issue") return { type: "repository.issues" };
	if (name === "help") return { type: "help" };
	if (name === "exit" || name === "quit") return { type: "exit" };
	// Only exact WWW-local commands are intercepted. Unknown slash input (for
	// example native /skills) remains ordinary chat input for Codex.
	return null;
}

export function parseTerminalCommand(text: string): string | null {
	const trimmed = text.trimStart();
	if (!trimmed.startsWith("!")) return null;
	return trimmed.slice(1).trim();
}

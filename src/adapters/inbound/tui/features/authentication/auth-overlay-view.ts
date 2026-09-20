import { stripTerminalSequences, truncateToWidth, visibleWidth, wrapTextWithAnsi } from "@earendil-works/pi-tui";
import type { AuthPrompt } from "@earendil-works/pi-ai";
import type { Provider } from "../../../../../core/domain/execution/model-settings";
import type { TuiColors } from "../../foundation/theme/theme";

export const GEMINI_API_KEY_URL = "https://aistudio.google.com/app/apikey";
export const ZAI_API_KEY_URL = "https://z.ai/manage-apikey/apikey-list";

export interface AuthPromptViewState {
	readonly prompt: AuthPrompt;
	readonly value: string;
	readonly selected: number;
}

export interface LoginOverlayViewState {
	readonly providers: readonly Provider[];
	readonly selected: number;
	readonly statusLabels: ReadonlyMap<Provider, string>;
}

export interface AuthFlowOverlayViewState {
	readonly provider: Provider;
	readonly lines: readonly string[];
	readonly pending: AuthPromptViewState | null;
	readonly done: boolean;
}

function fit(text: string, width: number): string {
	const clipped = truncateToWidth(text, Math.max(1, width));
	return clipped + " ".repeat(Math.max(0, width - visibleWidth(clipped)));
}

export function renderLoginOverlayView(state: LoginOverlayViewState, width: number, ui: TuiColors): string[] {
	const contentWidth = Math.max(1, width);
	const rows = [
		ui.accent("◈ 모델 연결 · 로그인"),
		ui.muted("연결할 Provider를 선택하세요."),
		ui.muted("↑↓ 선택 · Enter 로그인 · Esc 닫기"),
		"",
	].map(row => fit(row, contentWidth));
	for (const [index, provider] of state.providers.entries()) {
		const cursor = index === state.selected ? ui.accent("›") : " ";
		rows.push(fit(`${cursor} ${providerLabel(provider)}  ${state.statusLabels.get(provider) ?? ""}`, contentWidth));
	}
	return rows;
}

export function renderAuthFlowOverlayView(state: AuthFlowOverlayViewState, width: number, ui: TuiColors): string[] {
	const contentWidth = Math.max(1, width - 2);
	const rows = [ui.accent(`◈ 모델 연결 · ${state.provider} 로그인`), ""];
	for (const line of state.lines.slice(-8)) rows.push(...wrapTextWithAnsi(line, contentWidth));
	if (state.pending) {
		rows.push("", ui.highlight(stripTerminalSequences(state.pending.prompt.message)));
		const keyHelp = subscriptionKeyHelp(state.provider, state.pending.prompt.type);
		if (keyHelp) {
			for (const line of [
				ui.secondary(keyHelp.label),
				ui.text(keyHelp.url),
				ui.muted("Ctrl+O 브라우저에서 열기 · 주소를 선택해 복사할 수 있습니다."),
			]) rows.push(...wrapTextWithAnsi(line, contentWidth));
		}
		if (state.pending.prompt.type === "select") {
			for (const [index, option] of state.pending.prompt.options.entries()) {
				const marker = index === state.pending.selected ? ui.accent("●") : ui.muted("○");
				rows.push(...wrapTextWithAnsi(`${marker} ${stripTerminalSequences(option.label)}`, contentWidth));
			}
		} else {
			const value = state.pending.prompt.type === "secret"
				? "•".repeat(Array.from(state.pending.value).length)
				: stripTerminalSequences(state.pending.value);
			rows.push(...wrapTextWithAnsi(`${ui.accent(">")} ${value || ui.muted("입력 중…")}`, contentWidth));
		}
		rows.push("", ui.muted("Enter 확인 · Esc 취소"));
	} else if (state.done) {
		rows.push("", ui.muted("Esc로 닫기"));
	} else {
		rows.push("", ui.muted("인증 흐름을 준비하는 중…"));
	}
	return rows;
}

export function subscriptionKeyHelp(provider: Provider, promptType: AuthPrompt["type"]): { label: string; url: string } | null {
	if (promptType !== "secret") return null;
	if (provider === "google") return { label: "Gemini API 키 발급", url: GEMINI_API_KEY_URL };
	if (provider === "zai") return { label: "Z.AI GLM Coding Plan 구독 API 키", url: ZAI_API_KEY_URL };
	return null;
}

function providerLabel(provider: Provider): string {
	return ({
		"openai-codex": "ChatGPT Plus/Pro (Codex Subscription)",
		anthropic: "Anthropic (Claude Pro/Max)",
		openai: "OpenAI API",
		google: "Antigravity (로컬 Google 구독)",
		zai: "Z.AI GLM Coding Plan (구독 API 키)",
	})[provider];
}

import {
	SelectList,
	SettingsList,
	type Component,
	type SettingItem,
	type SettingsListTheme,
} from "@earendil-works/pi-tui";
import {
	EFFORTS,
	MODELS,
	PROVIDERS,
	type Effort,
	type Provider,
	type WwwSettings,
} from "../../domain/model-settings";
import { colors, selectListTheme } from "./theme";

const settingsTheme: SettingsListTheme = {
	label: (text, active) => active ? colors.accent(text) : text,
	value: (text, active) => active ? colors.selected(` ${text} `) : text,
	description: colors.muted,
	cursor: colors.accent("●"),
	hint: colors.muted,
};

export class LoginProviderOverlay implements Component {
	private readonly list: SelectList;

	constructor(onSelect: (provider: Provider) => void, onCancel: () => void) {
		const descriptions: Record<Provider, string> = {
			"openai-codex": "ChatGPT Plus/Pro 구독 · OAuth · 사용량 지원",
			anthropic: "Claude Pro/Max OAuth 또는 Anthropic API 키",
			openai: "OpenAI API 키",
			google: "Gemini API 키",
		};
		this.list = new SelectList(
			PROVIDERS.map((provider) => ({ value: provider, label: provider, description: descriptions[provider] })),
			8,
			selectListTheme,
		);
		this.list.onSelect = (item) => onSelect(item.value as Provider);
		this.list.onCancel = onCancel;
	}

	invalidate(): void {
		this.list.invalidate();
	}
	render(width: number): string[] {
		return [colors.accent("로그인할 Router 선택"), "", ...this.list.render(width)];
	}
	handleInput(data: string): void {
		this.list.handleInput(data);
	}
}

export class ModelSettingsOverlay implements Component {
	private readonly list: SettingsList;

	constructor(
		settings: WwwSettings,
		authLabel: string,
		onChange: (settings: WwwSettings) => void,
		onCancel: () => void,
	) {
		const modelValues = PROVIDERS.flatMap((provider) => MODELS[provider].map((model) => `${provider}/${model}`));
		const items: SettingItem[] = [
			{
				id: "model",
				label: "모델",
				description: "대화에 사용할 공급자와 모델",
				currentValue: `${settings.provider}/${settings.model}`,
				values: modelValues,
			},
			{
				id: "effort",
				label: "추론 강도",
				description: "모델이 지원하는 범위 안에서 자동 조정됩니다.",
				currentValue: settings.effort,
				values: [...EFFORTS],
			},
			{ id: "auth", label: "인증", currentValue: authLabel, description: "환경 변수 또는 WWW 인증 저장소" },
		];
		let current = { ...settings };
		this.list = new SettingsList(items, 8, settingsTheme, (id, value) => {
			if (id === "model") {
				const [provider, ...model] = value.split("/");
				current = { ...current, provider: provider as Provider, model: model.join("/") };
			}
			if (id === "effort") current = { ...current, effort: value as Effort };
			onChange(current);
		}, onCancel);
	}

	invalidate(): void {
		this.list.invalidate();
	}
	render(width: number): string[] {
		return [colors.accent("모델 설정"), "", ...this.list.render(width)];
	}
	handleInput(data: string): void {
		this.list.handleInput(data);
	}
}

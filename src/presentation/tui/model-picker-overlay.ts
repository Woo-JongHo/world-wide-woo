import {
	Key,
	matchesKey,
	stripTerminalSequences,
	truncateToWidth,
	visibleWidth,
	type Component,
} from "@earendil-works/pi-tui";
import type { ProviderAuthState } from "../../application/ports";
import { EFFORTS, MODELS, PROVIDERS, type Effort, type Provider, type WwwSettings } from "../../domain/model-settings";
import { colors, semantic } from "./theme";

type ModelPickerStep = "provider" | "model" | "effort" | "confirm";
type AuthStatus = ProviderAuthState | { state: "pending"; provider: Provider };

export type ModelPickerAuthStatus = (provider: Provider) => Promise<ProviderAuthState>;
export type ModelPickerApply = (settings: WwwSettings) => Promise<void>;

export interface ModelPickerOptions {
	providers?: readonly Provider[];
	startAtModel?: boolean;
}

const STEP_LABEL: Record<ModelPickerStep, string> = {
	provider: "공급자",
	model: "모델",
	effort: "추론",
	confirm: "확인",
};

const effortColor: Record<Effort, (text: string) => string> = {
	low: semantic.effortLow,
	medium: semantic.effortMedium,
	high: semantic.effortHigh,
	ultra: semantic.effortUltra,
};

function fit(text: string, width: number): string {
	const clipped = truncateToWidth(text, Math.max(0, width));
	return clipped + " ".repeat(Math.max(0, width - visibleWidth(clipped)));
}

/** Provider → model → effort → confirmation picker. Persistence and authentication stay caller-owned. */
export class ModelPickerOverlay implements Component {
	private readonly auth = new Map<Provider, AuthStatus>();
	private readonly providers: readonly Provider[];
	private readonly providerStepVisible: boolean;
	private staged: WwwSettings;
	private step: ModelPickerStep = "provider";
	private selected: number;
	private error: string | null = null;
	private applying = false;
	private lookupGeneration = 0;

	constructor(
		private readonly current: WwwSettings,
		private readonly authStatus: ModelPickerAuthStatus,
		private readonly requestRender: () => void,
		private readonly onApply: ModelPickerApply,
		private readonly onRequireAuth: (settings: WwwSettings) => void,
		private readonly onClose: () => void,
		initial: WwwSettings = current,
		resumeAtConfirmation = false,
		options: ModelPickerOptions = {},
	) {
		const requestedProviders = options.providers?.length ? options.providers : PROVIDERS;
		this.providers = requestedProviders.filter((provider, index) => requestedProviders.indexOf(provider) === index);
		const provider = this.providers.includes(initial.provider) ? initial.provider : this.providers[0] ?? initial.provider;
		const models = MODELS[provider];
		const model = (models as readonly string[]).includes(initial.model) ? initial.model : models[0];
		this.staged = { ...initial, provider, model };
		this.providerStepVisible = !(options.startAtModel === true && this.providers.length === 1);
		this.step = resumeAtConfirmation ? "confirm" : this.providerStepVisible ? "provider" : "model";
		this.selected = this.step === "model"
			? Math.max(0, (models as readonly string[]).indexOf(model))
			: Math.max(0, this.providers.indexOf(provider));
		for (const provider of this.providers) this.auth.set(provider, { state: "pending", provider });
	}

	start(): void {
		const generation = ++this.lookupGeneration;
		for (const provider of this.providers) {
			this.auth.set(provider, { state: "pending", provider });
			void this.authStatus(provider).then(
				status => {
					if (generation !== this.lookupGeneration) return;
					this.auth.set(provider, status);
					this.requestRender();
				},
				() => {
					if (generation !== this.lookupGeneration) return;
					this.auth.set(provider, {
						state: "failed",
						provider,
						message: "인증 상태를 확인하지 못했습니다.",
					});
					this.requestRender();
				},
			);
		}
		this.requestRender();
	}

	invalidate(): void {}

	render(width: number): string[] {
		const contentWidth = Math.max(1, width);
		const result = [
			fit(colors.accent("모델 설정"), contentWidth),
			fit(this.breadcrumb(), contentWidth),
			fit(`현재: ${this.current.provider} / ${this.current.model} / ${this.current.effort}`, contentWidth),
			fit(`선택: ${this.staged.provider} / ${this.staged.model} / ${this.staged.effort}`, contentWidth),
		];
		for (const row of this.rows()) result.push(fit(row, contentWidth));
		if (this.error) result.push(fit(colors.error(this.error), contentWidth));
		const hint = this.step === "confirm"
			? "Enter 적용 · ←/Backspace 이전 · Esc 취소"
			: "↑↓ 선택 · Enter/→ 다음 · ←/Backspace 이전 · Esc 취소";
		result.push(fit(colors.muted(this.applying ? "적용하는 중…" : hint), contentWidth));
		return result;
	}

	handleInput(data: string): void {
		if (this.applying) return;
		if (matchesKey(data, Key.escape)) return this.onClose();
		if (matchesKey(data, Key.up)) return this.move(-1);
		if (matchesKey(data, Key.down)) return this.move(1);
		if (matchesKey(data, Key.left) || matchesKey(data, Key.backspace)) return this.back();
		if (matchesKey(data, Key.right) || matchesKey(data, Key.enter)) return void this.forward();
	}

	private breadcrumb(): string {
		const order: ModelPickerStep[] = this.providerStepVisible
			? ["provider", "model", "effort", "confirm"]
			: ["model", "effort", "confirm"];
		return order.map(step => step === this.step ? colors.accent(`[${STEP_LABEL[step]}]`) : colors.muted(STEP_LABEL[step])).join("  ›  ");
	}

	private rows(): string[] {
		if (this.step === "provider") {
			return this.providers.map((provider, index) => this.row(
				index,
				provider,
				this.authBadge(provider),
				provider === this.current.provider ? "현재" : provider === this.staged.provider ? "선택" : "",
			));
		}
		if (this.step === "model") {
			return (MODELS[this.staged.provider] as readonly string[]).map((model, index) => this.row(
				index,
				model,
				"",
				model === this.current.model && this.staged.provider === this.current.provider
					? "현재"
					: model === this.staged.model ? "선택" : "",
			));
		}
		if (this.step === "effort") {
			return EFFORTS.map((effort, index) => this.row(
				index,
				effortColor[effort](effort),
				"",
				effort === this.current.effort ? "현재" : effort === this.staged.effort ? "선택" : "",
			));
		}
		return [
			`  공급자  ${this.staged.provider}  ${this.authBadge(this.staged.provider)}`,
			`  모델    ${this.staged.model}`,
			`  추론    ${effortColor[this.staged.effort](this.staged.effort)}`,
			colors.success("  Enter를 누르면 한 번에 적용합니다."),
		];
	}

	private row(index: number, label: string, badge: string, marker: string): string {
		const cursor = index === this.selected ? colors.accent("›") : " ";
		const markerText = marker === "현재" ? colors.muted(marker) : marker ? colors.success(marker) : "";
		return `${cursor} ${label}${badge ? `  ${badge}` : ""}${markerText ? `  ${markerText}` : ""}`;
	}

	private move(delta: number): void {
		const length = this.optionCount();
		if (length === 0 || this.step === "confirm") return;
		this.selected = (this.selected + delta + length) % length;
		this.error = null;
		this.requestRender();
	}

	private optionCount(): number {
		if (this.step === "provider") return this.providers.length;
		if (this.step === "model") return MODELS[this.staged.provider].length;
		if (this.step === "effort") return EFFORTS.length;
		return 1;
	}

	private forward(): void | Promise<void> {
		this.error = null;
		if (this.step === "provider") {
			const provider = this.providers[this.selected];
			const models = MODELS[provider];
			const model = (models as readonly string[]).includes(this.staged.model) ? this.staged.model : models[0];
			this.staged = { ...this.staged, provider, model };
			this.step = "model";
			this.selected = Math.max(0, (models as readonly string[]).indexOf(model));
			this.requestRender();
			return;
		}
		if (this.step === "model") {
			this.staged = { ...this.staged, model: MODELS[this.staged.provider][this.selected] };
			this.step = "effort";
			this.selected = Math.max(0, EFFORTS.indexOf(this.staged.effort));
			this.requestRender();
			return;
		}
		if (this.step === "effort") {
			this.staged = { ...this.staged, effort: EFFORTS[this.selected] };
			this.step = "confirm";
			this.selected = 0;
			this.requestRender();
			return;
		}
		return this.apply();
	}

	private back(): void {
		this.error = null;
		if (this.step === "confirm") {
			this.step = "effort";
			this.selected = Math.max(0, EFFORTS.indexOf(this.staged.effort));
		} else if (this.step === "effort") {
			this.step = "model";
			this.selected = Math.max(0, (MODELS[this.staged.provider] as readonly string[]).indexOf(this.staged.model));
		} else if (this.step === "model") {
			if (!this.providerStepVisible) {
				this.onClose();
				return;
			}
			this.step = "provider";
			this.selected = Math.max(0, this.providers.indexOf(this.staged.provider));
		} else {
			this.onClose();
			return;
		}
		this.requestRender();
	}

	private authBadge(provider: Provider): string {
		const status = this.auth.get(provider);
		if (!status || status.state === "pending") return colors.muted("확인 중");
		if (status.state === "configured") return colors.success("인증됨");
		if (status.state === "required") return colors.warning("인증 필요");
		return colors.error("인증 오류");
	}

	private async apply(): Promise<void> {
		const status = this.auth.get(this.staged.provider);
		if (!status || status.state === "pending") {
			this.error = "인증 상태를 확인하는 중입니다.";
			this.requestRender();
			return;
		}
		if (status.state === "failed") {
			this.error = "인증 상태를 확인하지 못했습니다. 모델 화면을 다시 열어 확인하세요.";
			this.requestRender();
			return;
		}
		if (status.state === "required") {
			this.onRequireAuth({ ...this.staged });
			return;
		}
		this.applying = true;
		this.requestRender();
		try {
			await this.onApply({ ...this.staged });
			this.onClose();
		} catch (error) {
			this.error = error instanceof Error && error.message
				? stripTerminalSequences(error.message)
				: "설정을 적용하지 못했습니다.";
			this.applying = false;
			this.requestRender();
		}
	}
}

import { Key, matchesKey, stripTerminalSequences }   from "@earendil-works/pi-tui";
import type { Component }                            from "@earendil-works/pi-tui";
import type { ProviderAuthState }                    from "@/core/ports/integration/auth-controller-port";
import { EFFORTS, MODELS, PROVIDERS }                from "@/core/domain/execution/model-settings";
import type { Effort, Provider, WwwSettings }        from "@/core/domain/execution/model-settings";
import { colors, semantic }                          from "@/adapters/inbound/tui/foundation/theme/theme";
import type { TuiColors }                            from "@/adapters/inbound/tui/foundation/theme/theme";
import { nativeModelNames, nativeModelEfforts }      from "@/core/domain/execution/model-settings";
import type { NativeModelCatalog }                   from "@/core/domain/execution/model-settings";
import { renderModelPickerView }                     from "@/adapters/inbound/tui/features/model-selection/view/model-picker-view";
import { workbenchEffortLabel, workbenchModelLabel } from "@/adapters/inbound/tui/foundation/labels";

type ModelPickerStep = "provider" | "model" | "effort" | "confirm";
type AuthStatus = ProviderAuthState | { state: "pending"; provider: Provider };

export type ModelPickerAuthStatus = (provider: Provider) => Promise<ProviderAuthState>;
export type ModelPickerApply = (settings: WwwSettings) => Promise<void>;

export interface ModelPickerOptions {
	providers?         : readonly Provider[]               ;
	startAtModel?      : boolean                           ;
	colors?            : TuiColors                         ;
	appearance?        : "www"                             ;
	nativeCodex?       : boolean                           ;
	catalog?           : NativeModelCatalog                ;
	loadCatalog?       : () => Promise<NativeModelCatalog> ;
	maxVisibleOptions? : () => number                      ;
}

const STEP_LABEL: Record<ModelPickerStep, string> = {
	provider : "공급자",
	model    : "모델",
	effort   : "추론",
	confirm  : "확인",
};

const effortColor: Record<Effort, (text: string) => string> = {
	low    : semantic.effortLow,
	medium : semantic.effortMedium,
	high   : semantic.effortHigh,
	ultra  : semantic.effortUltra,
	xhigh  : semantic.effortHigh,
	max    : semantic.effortUltra,
};

/** Provider → model → effort → confirmation picker. Persistence and authentication stay caller-owned. */
export class ModelPickerOverlay implements Component {
	private readonly auth                                  = new Map<Provider, AuthStatus>() ;
	private readonly providers           : readonly Provider[]                               ;
	private readonly providerStepVisible : boolean                                           ;
	private staged                       : WwwSettings                                       ;
	private step                         : ModelPickerStep = "provider"                      ;
	private selected                     : number                                            ;
	private error                        : string | null   = null                            ;
	private applying                                       = false                           ;
	private lookupGeneration                               = 0                               ;
	private readonly ui                  : TuiColors                                         ;
	private catalog                      : NativeModelCatalog | undefined                    ;
	private loadingModels                                  = false                           ;

	constructor(
		private readonly current: WwwSettings,
		private readonly authStatus: ModelPickerAuthStatus,
		private readonly requestRender: () => void,
		private readonly onApply: ModelPickerApply,
		private readonly onRequireAuth: (settings: WwwSettings) => void,
		private readonly onClose: () => void,
		initial: WwwSettings = current,
		resumeAtConfirmation = false,
		private readonly options: ModelPickerOptions = {},
	) {
		this.ui = options.colors ?? colors;
		this.catalog = options.catalog;
		const requestedProviders = options.providers?.length ? options.providers : PROVIDERS;
		this.providers = requestedProviders.filter((provider, index) => requestedProviders.indexOf(provider) === index);
		const provider = this.providers.includes(initial.provider) ? initial.provider : this.providers[0] ?? initial.provider ;
		const models   = this.models(provider)                                                                                ;
		const model    = models.includes(initial.model) ? initial.model : models[0] ?? initial.model                          ;
		this.staged = { ...initial, provider, model };
		if (!this.efforts().includes(this.staged.effort)) this.staged.effort = this.defaultEffort();
		this.providerStepVisible = !(options.startAtModel === true && this.providers.length === 1);
		this.step = resumeAtConfirmation ? "confirm" : this.providerStepVisible ? "provider" : "model";
		this.selected = this.step === "model"
			? Math.max(0, models.indexOf(model))
			: Math.max(0, this.providers.indexOf(provider));
		for (const provider of this.providers) this.auth.set(provider, { state: "pending", provider });
	}

	start(): void {
		const generation = ++this.lookupGeneration;
		if (this.options.loadCatalog) {
			this.loadingModels = true;
			void this.options.loadCatalog().then(catalog => {
				if (generation !== this.lookupGeneration) return;
				this.catalog = catalog;
				const models = this.models(this.staged.provider);
				if (!models.includes(this.staged.model)) this.staged.model = models[0] ?? this.staged.model;
				if (!this.efforts().includes(this.staged.effort)) this.staged.effort = this.defaultEffort();
				this.selected = Math.max(0, models.indexOf(this.staged.model));
			}, () => { this.error = "모델 조회 실패 · 기존 목록을 유지합니다."; }).finally(() => {
				this.loadingModels = false;
				this.requestRender();
			});
		}
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
		return renderModelPickerView({
			nativeCodex   : this.options.nativeCodex === true,
			current       : this.current,
			staged        : this.staged,
			breadcrumb    : this.breadcrumb(),
			catalogNotice : this.catalogNotice(),
			rows          : this.visibleRows(),
			error         : this.error,
			applying      : this.applying,
			confirmation  : this.step === "confirm",
			...(this.options.appearance === "www" ? { appearance: "www" } : {}),
		}, width, this.ui);
	}

	handleInput(data: string): void {
		if (this.applying) return;
		if (matchesKey(data, Key.escape)) return this.onClose();
		if (this.loadingModels) return;
		if (matchesKey(data, Key.up)) return this.move(-1);
		if (matchesKey(data, Key.down)) return this.move(1);
		if (matchesKey(data, Key.left) || matchesKey(data, Key.backspace)) return this.back();
		if (matchesKey(data, Key.right) || matchesKey(data, Key.enter)) return void this.forward();
	}

	private breadcrumb(): string {
		const order: ModelPickerStep[] = this.providerStepVisible
			? ["provider", "model", "effort", "confirm"]
			: ["model", "effort", "confirm"];
		return order.map(step => step === this.step ? this.ui.accent(`[${STEP_LABEL[step]}]`) : this.ui.muted(STEP_LABEL[step])).join("  ›  ");
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
			return this.models(this.staged.provider).map((model, index) => this.row(
				index,
				workbenchModelLabel(model),
				"",
				model === this.current.model && this.staged.provider === this.current.provider
					? "현재"
					: model === this.staged.model ? "선택" : "",
			));
		}
		if (this.step === "effort") {
			return this.efforts().map((effort, index) => this.row(
				index,
				(this.options.appearance ? this.ui.text : effortColor[effort])(workbenchEffortLabel(effort)),
				effort === "ultra" && this.options.nativeCodex ? "자동 위임 포함" : "",
				effort === this.current.effort ? "현재" : effort === this.staged.effort ? "선택" : "",
			));
		}
		return [
			`  공급자  ${this.staged.provider}  ${this.authBadge(this.staged.provider)}`,
			`  모델    ${workbenchModelLabel(this.staged.model)}`,
			`  추론    ${(this.options.appearance ? this.ui.text : effortColor[this.staged.effort])(workbenchEffortLabel(this.staged.effort))}`,
			this.ui.success("  Enter를 누르면 한 번에 적용합니다."),
		];
	}

	private visibleRows(): string[] {
		const rows = this.rows();
		if (this.step === "confirm" || !this.options.maxVisibleOptions) return rows;
		const limit = Math.max(1, this.options.maxVisibleOptions());
		if (rows.length <= limit) return rows;
		const offset = Math.max(0, Math.min(this.selected - Math.floor(limit / 2), rows.length - limit));
		return rows.slice(offset, offset + limit);
	}

	private row(index: number, label: string, badge: string, marker: string): string {
		const cursor = index === this.selected ? this.ui.accent("›") : " ";
		const markerText = marker === "현재" ? this.ui.muted(marker) : marker ? this.ui.success(marker) : "";
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
		if (this.step === "model") return this.models(this.staged.provider).length;
		if (this.step === "effort") return this.efforts().length;
		return 1;
	}
	private efforts      ()                  : readonly Effort[] { return this.options.nativeCodex ? nativeModelEfforts(this.staged.model, this.catalog) : EFFORTS; }
	private defaultEffort()                  : Effort { return this.catalog?.models.find(entry => entry.model === this.staged.model)?.defaultEffort ?? "medium"; }
	private models       (provider: Provider): readonly string[] { return this.options.nativeCodex && provider === "openai-codex" ? nativeModelNames(this.catalog) : MODELS[provider]; }
	private catalogNotice(): string {
		if (this.loadingModels) return "Native 모델 목록 갱신 중…";
		if (this.catalog?.error) return "조회 실패 · 기존 목록 유지 · 다시 열면 재시도";
		const count = this.step === "model" ? ` · ${this.selected + 1}/${this.optionCount()}` : "";
		return (this.catalog?.source === "native" ? "Native 동기화됨 · 열 때마다 자동 갱신" : "내장 모델 목록") + count;
	}

	private forward(): void | Promise<void> {
		this.error = null;
		if (this.step === "provider") {
			const provider = this.providers[this.selected]                                                           ;
			const models   = this.models(provider)                                                                   ;
			const model    = models.includes(this.staged.model) ? this.staged.model : models[0] ?? this.staged.model ;
			this.staged   = { ...this.staged, provider, model } ;
			this.step     = "model"                             ;
			this.selected = Math.max(0, models.indexOf(model))  ;
			this.requestRender();
			return;
		}
		if (this.step === "model") {
			const model = this.models(this.staged.provider)[this.selected] ?? this.staged.model;
			this.staged = { ...this.staged, model };
			if (!this.efforts().includes(this.staged.effort)) this.staged.effort = this.defaultEffort();
			this.step = "effort";
			this.selected = Math.max(0, this.efforts().indexOf(this.staged.effort));
			this.requestRender();
			return;
		}
		if (this.step === "effort") {
			const effort = this.efforts()[this.selected] ?? this.defaultEffort();
			this.staged   = { ...this.staged, effort } ;
			this.step     = "confirm"                  ;
			this.selected = 0                          ;
			this.requestRender();
			return;
		}
		return this.apply();
	}

	private back(): void {
		this.error = null;
		if (this.step === "confirm") {
			this.step = "effort";
			this.selected = Math.max(0, this.efforts().indexOf(this.staged.effort));
		} else if (this.step === "effort") {
			this.step = "model";
			this.selected = Math.max(0, this.models(this.staged.provider).indexOf(this.staged.model));
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
		if (!status || status.state === "pending") return this.ui.muted("확인 중");
		if (status.state === "configured") return this.ui.success("인증됨");
		if (status.state === "required") return this.ui.warning("인증 필요");
		return this.ui.error("인증 오류");
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

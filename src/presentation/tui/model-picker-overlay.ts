import {
	Input,
	Key,
	matchesKey,
	stripTerminalSequences,
	truncateToWidth,
	visibleWidth,
	type Component,
} from "@earendil-works/pi-tui";
import type { ProviderAuthState } from "../../application/ports";
import { EFFORTS, MODELS, PROVIDERS, type Provider, type WwwSettings } from "../../domain/model-settings";
import { colors, semantic } from "./theme";

type ModelRow = { provider: Provider; model: string };
type AuthStatus = ProviderAuthState | { state: "pending"; provider: Provider };
const effortColor = {
	low: semantic.effortLow,
	medium: semantic.effortMedium,
	high: semantic.effortHigh,
	ultra: semantic.effortUltra,
} as const;

export type ModelPickerAuthStatus = (provider: Provider) => Promise<ProviderAuthState>;
export type ModelPickerApply = (settings: WwwSettings) => Promise<void>;

function fit(text: string, width: number): string {
	const clipped = truncateToWidth(text, Math.max(0, width));
	return clipped + " ".repeat(Math.max(0, width - visibleWidth(clipped)));
}

/** Searchable, staged model settings editor. Authentication and persistence remain caller-owned. */
export class ModelPickerOverlay implements Component {
	private readonly search = new Input();
	private readonly auth = new Map<Provider, AuthStatus>();
	private staged: WwwSettings;
	private tab: Provider;
	private selected = 0;
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
	) {
		this.staged = { ...initial };
		this.tab = initial.provider;
		this.selected = Math.max(0, (MODELS[initial.provider] as readonly string[]).indexOf(initial.model));
		this.search.focused = true;
		for (const provider of PROVIDERS) this.auth.set(provider, { state: "pending", provider });
	}

	start(): void {
		const generation = ++this.lookupGeneration;
		for (const provider of PROVIDERS) {
			this.auth.set(provider, { state: "pending", provider });
			void this.authStatus(provider).then(
				status => {
					if (generation !== this.lookupGeneration) return;
					this.auth.set(provider, status);
					this.requestRender();
				},
				error => {
					if (generation !== this.lookupGeneration) return;
					this.auth.set(provider, {
						state: "failed",
						provider,
						message: error instanceof Error ? error.message : "인증 상태를 확인하지 못했습니다.",
					});
					this.requestRender();
				},
			);
		}
		this.requestRender();
	}

	invalidate(): void {
		this.search.invalidate();
	}

	render(width: number): string[] {
		const contentWidth = Math.max(1, width);
		const rows = this.rows();
		this.selected = Math.min(this.selected, Math.max(0, rows.length - 1));
		const tabs = PROVIDERS.map(provider => provider === this.tab ? colors.accent(`[${provider}]`) : colors.muted(provider)).join(" ");
		const renderedSearch = this.search.render(Math.max(1, contentWidth - 3))[0] ?? "";
		const result = [
			fit(colors.accent("모델 선택"), contentWidth),
			fit(`현재: ${this.current.provider} / ${this.current.model} / ${this.current.effort}`, contentWidth),
			fit(`선택: ${this.staged.provider} / ${this.staged.model} / ${this.staged.effort}`, contentWidth),
			fit(`${tabs} ${colors.muted(`· ${rows.length}개`)}`, contentWidth),
			fit(`${colors.accent("검색")} ${renderedSearch}`, contentWidth),
		];
		for (const [index, row] of this.visibleRows(rows)) {
			const cursor = index === this.selected ? colors.accent("›") : " ";
			const current = row.provider === this.current.provider && row.model === this.current.model ? colors.muted("현재") : "";
			const selected = row.provider === this.staged.provider && row.model === this.staged.model ? colors.success("선택") : "";
			result.push(fit(`${cursor} ${row.provider} / ${row.model} ${this.authBadge(row.provider)} ${current} ${selected}`, contentWidth));
		}
		if (rows.length === 0) result.push(fit(colors.muted("일치하는 모델이 없습니다."), contentWidth));
		result.push(fit(`추론: ${effortColor[this.staged.effort](this.staged.effort)} ${colors.muted("(Ctrl+E로 변경)")}`, contentWidth));
		if (this.error) result.push(fit(colors.error(this.error), contentWidth));
		result.push(fit(colors.muted(this.applying ? "적용하는 중…" : "↑↓ 선택 · Tab 공급자 · Ctrl+E 추론 · Enter 적용 · Esc 취소"), contentWidth));
		return result;
	}

	handleInput(data: string): void {
		if (this.applying) return;
		if (matchesKey(data, Key.escape)) return this.onClose();
		if (matchesKey(data, Key.up)) return this.move(-1);
		if (matchesKey(data, Key.down)) return this.move(1);
		if (matchesKey(data, Key.tab)) return this.moveTab(1);
		if (matchesKey(data, Key.ctrl("e"))) return this.cycleEffort();
		if (matchesKey(data, Key.enter)) return void this.apply();
		const before = this.search.getValue();
		this.search.handleInput(data);
		if (before !== this.search.getValue()) {
			this.selected = 0;
			const [first] = this.rows();
			if (first) this.select(first);
			this.error = null;
			this.requestRender();
		}
	}

	private visibleRows(rows: readonly ModelRow[]): Array<readonly [number, ModelRow]> {
		const maximum = 3;
		const start = Math.max(0, Math.min(this.selected - 1, rows.length - maximum));
		return rows.slice(start, start + maximum).map((row, offset) => [start + offset, row] as const);
	}

	private rows(): ModelRow[] {
		const query = this.search.getValue().trim().toLowerCase();
		const providers = query ? PROVIDERS : [this.tab];
		return providers.flatMap(provider => (MODELS[provider] as readonly string[])
			.filter(model => !query || `${provider} ${model}`.toLowerCase().includes(query))
			.map(model => ({ provider, model })));
	}

	private move(delta: number): void {
		const rows = this.rows();
		if (!rows.length) return;
		this.selected = (this.selected + delta + rows.length) % rows.length;
		this.select(rows[this.selected]);
	}

	private moveTab(delta: number): void {
		const index = PROVIDERS.indexOf(this.tab);
		this.tab = PROVIDERS[(index + delta + PROVIDERS.length) % PROVIDERS.length];
		this.selected = 0;
		const [first] = this.rows();
		if (first) this.select(first);
		this.error = null;
		this.requestRender();
	}

	private select(row: ModelRow): void {
		this.staged = { ...this.staged, provider: row.provider, model: row.model };
		this.error = null;
		this.requestRender();
	}

	private cycleEffort(): void {
		const index = EFFORTS.indexOf(this.staged.effort);
		this.staged = { ...this.staged, effort: EFFORTS[(index + 1) % EFFORTS.length] };
		this.error = null;
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
		const selected = this.rows()[this.selected];
		if (selected) this.select(selected);
		const status = this.auth.get(this.staged.provider);
		if (!status || status.state === "pending") {
			this.error = "인증 상태를 확인하는 중입니다.";
			this.requestRender();
			return;
		}
		if (status.state === "failed") {
			this.error = "인증 상태를 확인하지 못했습니다. 다시 열어 확인하세요.";
			this.requestRender();
			return;
		}
		if (status?.state === "required") {
			this.onRequireAuth({ ...this.staged });
			return;
		}
		this.applying = true;
		this.error = null;
		this.requestRender();
		try {
			await this.onApply({ ...this.staged });
			this.onClose();
		} catch (error) {
			this.error = error instanceof Error && error.message ? stripTerminalSequences(error.message) : "설정을 적용하지 못했습니다.";
			this.applying = false;
			this.requestRender();
		}
	}
}

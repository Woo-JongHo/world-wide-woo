import open                                        from "open";
import { Key, matchesKey, stripTerminalSequences } from "@earendil-works/pi-tui";
import type { Component }                          from "@earendil-works/pi-tui";
import type { AuthEvent, AuthPrompt, AuthType }    from "@earendil-works/pi-ai";
import type { AuthController, ProviderAuthState }  from "@/core/ports/integration/auth-controller-port";
import { PROVIDERS }                               from "@/core/domain/execution/model-settings";
import type { Provider }                           from "@/core/domain/execution/model-settings";
import { colors }                                  from "@/adapters/inbound/tui/foundation/theme/theme";
import type { TuiColors }                          from "@/adapters/inbound/tui/foundation/theme/theme";
import {
	renderAuthFlowOverlayView,
	renderLoginOverlayView,
	subscriptionKeyHelp,
} from "@/adapters/inbound/tui/features/authentication/view/auth-overlay-view";

export { GEMINI_API_KEY_URL, ZAI_API_KEY_URL } from "@/adapters/inbound/tui/features/authentication/view/auth-overlay-view";

type PendingPrompt = {
	prompt   : AuthPrompt ;
	value    : string     ;
	selected : number     ;
	resolve(value: string): void;
	reject(error: Error): void;
	removeAbort?: () => void;
};

type LoginStatus = ProviderAuthState | { state: "pending"; provider: Provider };

type OpenExternal = (target: string) => Promise<unknown>;

/** Owns the complete provider-picker → authentication flow in one keyboard surface. */
export class LoginOverlay implements Component {
	private readonly statuses            = new Map<Provider, LoginStatus>() ;
	private selected                     = 0                                ;
	private flow: AuthFlowOverlay | null = null                             ;
	private generation                   = 0                                ;

	constructor(
		private readonly auth: AuthController,
		private readonly requestRender: () => void,
		private readonly onAuthenticated: (status: ProviderAuthState) => void | Promise<void>,
		private readonly onClose: () => void,
		private readonly providers: readonly Provider[] = PROVIDERS,
		private readonly openExternal: OpenExternal = open,
		private readonly ui: TuiColors = colors,
	) {
		for (const provider of providers) this.statuses.set(provider, { state: "pending", provider });
	}

	start(selectImmediately = false): void {
		if (selectImmediately) {
			this.selectProvider();
			return;
		}
		const generation = ++this.generation;
		for (const provider of this.providers) {
			this.statuses.set(provider, { state: "pending", provider });
			void this.auth.status(provider).then(
				status => {
					if (generation !== this.generation || this.flow) return;
					this.statuses.set(provider, status);
					this.requestRender();
				},
				() => {
					if (generation !== this.generation || this.flow) return;
					this.statuses.set(provider, { state: "failed", provider, message: "인증 상태를 확인하지 못했습니다." });
					this.requestRender();
				},
			);
		}
		this.requestRender();
	}

	invalidate(): void {
		this.flow?.invalidate();
	}

	render(width: number): string[] {
		if (this.flow) return this.flow.render(width);
		return renderLoginOverlayView({
			providers    : this.providers,
			selected     : this.selected,
			statusLabels : new Map(this.providers.map(provider => [provider, this.statusLabel(provider)])),
		}, width, this.ui);
	}

	handleInput(data: string): void {
		if (this.flow) return this.flow.handleInput(data);
		if (matchesKey(data, Key.escape) || matchesKey(data, Key.ctrl("c")) || matchesKey(data, Key.ctrl("d"))) {
			this.generation += 1;
			this.onClose();
			return;
		}
		if (matchesKey(data, Key.up)) this.selected = (this.selected + this.providers.length - 1) % this.providers.length;
		else if (matchesKey(data, Key.down)) this.selected = (this.selected + 1) % this.providers.length;
		else if (matchesKey(data, Key.enter)) this.selectProvider();
		else return;
		this.requestRender();
	}

	private selectProvider(): void {
		const provider = this.providers[this.selected];
		if (!provider) return;
		this.generation += 1;
		this.flow = new AuthFlowOverlay(
			provider,
			this.auth.methods(provider),
			this.auth,
			this.requestRender,
			this.onAuthenticated,
			this.onClose,
			this.openExternal,
			this.ui,
		);
		this.flow.start();
	}

	private statusLabel(provider: Provider): string {
		const status = this.statuses.get(provider);
		if (!status || status.state === "pending") return this.ui.muted("확인 중");
		if (status.state === "configured") return this.ui.success("✓ 로그인됨");
		if (status.state === "required") return this.ui.warning("로그인 필요");
		return this.ui.error("확인 실패");
	}
}

export class AuthFlowOverlay implements Component {
	private readonly controller                   = new AbortController() ;
	private readonly lines : string[]             = []                    ;
	private pending        : PendingPrompt | null = null                  ;
	private done                                  = false                 ;

	constructor(
		private readonly provider: Provider,
		private readonly methods: readonly AuthType[],
		private readonly auth: AuthController,
		private readonly requestRender: () => void,
		private readonly onAuthenticated: (status: ProviderAuthState) => void | Promise<void>,
		private readonly onClose: () => void,
		private readonly openExternal: OpenExternal = open,
		private readonly ui: TuiColors = colors,
	) {}

	start(): void {
		void this.run();
	}

	invalidate(): void {}

	render(width: number): string[] {
		return renderAuthFlowOverlayView({
			provider : this.provider,
			lines    : this.lines,
			pending  : this.pending,
			done     : this.done,
		}, width, this.ui);
	}

	handleInput(data: string): void {
		if (matchesKey(data, Key.escape) || matchesKey(data, Key.ctrl("c")) || matchesKey(data, Key.ctrl("d"))) {
			if (this.done) return this.onClose();
			this.controller.abort();
			this.rejectPrompt(new DOMException("로그인이 취소되었습니다.", "AbortError"));
			this.onClose();
			return;
		}
		const pending = this.pending;
		if (!pending) return;
		const keyHelp = this.subscriptionKeyHelp();
		if (keyHelp && matchesKey(data, Key.ctrl("o"))) {
			void this.openExternal(keyHelp.url).catch(() => {
				this.lines.push(this.ui.warning("브라우저를 열지 못했습니다. 아래 주소를 복사해 여세요."));
				this.lines.push(keyHelp.url);
				this.requestRender();
			});
			return;
		}
		if (pending.prompt.type === "select") {
			if (matchesKey(data, Key.up)) pending.selected = (pending.selected + pending.prompt.options.length - 1) % pending.prompt.options.length;
			if (matchesKey(data, Key.down)) pending.selected = (pending.selected + 1) % pending.prompt.options.length;
			if (matchesKey(data, Key.enter)) {
				const selected = pending.prompt.options[pending.selected];
				if (selected) this.resolvePrompt(selected.id);
			}
			this.requestRender();
			return;
		}
		if (matchesKey(data, Key.enter)) {
			if (pending.value.trim()) this.resolvePrompt(pending.value.trim());
			return;
		}
		if (matchesKey(data, Key.backspace) || data === "\u007f") {
			pending.value = Array.from(pending.value).slice(0, -1).join("");
			this.requestRender();
			return;
		}
		if (!data.startsWith("\u001b") && !/[\u0000-\u001f]/u.test(data)) {
			pending.value += data;
			this.requestRender();
		}
	}

	private subscriptionKeyHelp(): { label: string; url: string } | null {
		return this.pending ? subscriptionKeyHelp(this.provider, this.pending.prompt.type) : null;
	}

	private async run(): Promise<void> {
		try {
			if (this.methods.length === 0) throw new Error("이 공급자는 대화형 로그인을 지원하지 않습니다.");
			const method = this.methods.length === 1
				? this.methods[0]
				: await this.ask({
					type: "select",
					message: "로그인 방식을 선택하세요.",
					options: this.methods.map((method) => ({
						id: method,
					label: method === "oauth" ? (this.provider === "google" ? "브라우저에서 Google 계정 로그인" : "구독 계정 로그인 (OAuth)") : this.provider === "zai" ? "GLM Coding Plan 구독 API 키" : "API 키",
					})),
				});
			const status = await this.auth.login(this.provider, method as AuthType, {
				signal : this.controller.signal,
				prompt : (prompt) => this.ask(prompt),
				notify : (event) => this.notify(event),
			});
			this.lines.push(this.ui.success("로그인이 완료되었습니다."));
			await this.onAuthenticated(status);
			this.done = true;
		} catch (error) {
			if (!this.controller.signal.aborted) {
				this.lines.push(this.ui.error(error instanceof Error ? error.message : String(error)));
				this.done = true;
			}
		} finally {
			this.requestRender();
		}
	}

	private ask(prompt: AuthPrompt): Promise<string> {
		return new Promise<string>((resolve, reject) => {
			const pending: PendingPrompt = { prompt, value: "", selected: 0, resolve, reject };
			if (prompt.signal) {
				const abort = () => this.rejectPrompt(new DOMException("입력이 취소되었습니다.", "AbortError"));
				prompt.signal.addEventListener("abort", abort, { once: true });
				pending.removeAbort = () => prompt.signal?.removeEventListener("abort", abort);
			}
			this.pending = pending;
			this.requestRender();
			if (prompt.signal?.aborted) this.rejectPrompt(new DOMException("입력이 취소되었습니다.", "AbortError"));
		});
	}

	private resolvePrompt(value: string): void {
		const pending = this.pending;
		if (!pending) return;
		pending.removeAbort?.();
		this.pending = null;
		pending.resolve(value);
		this.requestRender();
	}

	private rejectPrompt(error: Error): void {
		const pending = this.pending;
		if (!pending) return;
		pending.removeAbort?.();
		this.pending = null;
		pending.reject(error);
		this.requestRender();
	}

	private notify(event: AuthEvent): void {
		if (event.type === "auth_url") {
			this.lines.push(stripTerminalSequences(event.instructions ?? "브라우저에서 로그인을 완료하세요."));
			void this.openExternal(event.url).catch(() => {
				this.lines.push(this.ui.warning(`브라우저를 열지 못했습니다: ${stripTerminalSequences(event.url)}`));
				this.requestRender();
			});
		}
		if (event.type === "device_code") {
			this.lines.push(`인증 코드: ${stripTerminalSequences(event.userCode)}`);
			void this.openExternal(event.verificationUri).catch(() => undefined);
		}
		if (event.type === "info") {
			this.lines.push(stripTerminalSequences(event.message));
			for (const link of event.links ?? []) {
				this.lines.push(`${stripTerminalSequences(link.label ?? "안내")}: ${stripTerminalSequences(link.url)}`);
			}
		}
		if (event.type === "progress") this.lines.push(stripTerminalSequences(event.message));
		this.requestRender();
	}
}

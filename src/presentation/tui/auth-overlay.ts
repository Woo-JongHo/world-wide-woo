import open from "open";
import {
	Key,
	matchesKey,
	stripTerminalSequences,
	wrapTextWithAnsi,
	type Component,
} from "@earendil-works/pi-tui";
import type { AuthEvent, AuthPrompt, AuthType } from "@earendil-works/pi-ai";
import type { AuthController, ProviderAuthState } from "../../application/ports";
import type { Provider } from "../../domain/model-settings";
import { colors } from "./theme";

type PendingPrompt = {
	prompt: AuthPrompt;
	value: string;
	selected: number;
	resolve(value: string): void;
	reject(error: Error): void;
	removeAbort?: () => void;
};

export class AuthFlowOverlay implements Component {
	private readonly controller = new AbortController();
	private readonly lines: string[] = [];
	private pending: PendingPrompt | null = null;
	private done = false;

	constructor(
		private readonly provider: Provider,
		private readonly methods: readonly AuthType[],
		private readonly auth: AuthController,
		private readonly requestRender: () => void,
		private readonly onAuthenticated: (status: ProviderAuthState) => void | Promise<void>,
		private readonly onClose: () => void,
	) {}

	start(): void {
		void this.run();
	}

	invalidate(): void {}

	render(width: number): string[] {
		const contentWidth = Math.max(1, width - 2);
		const rows = [colors.accent(`${this.provider} 로그인`), ""];
		for (const line of this.lines.slice(-8)) rows.push(...wrapTextWithAnsi(line, contentWidth));
		if (this.pending) {
			rows.push("", colors.highlight(stripTerminalSequences(this.pending.prompt.message)));
			if (this.pending.prompt.type === "select") {
				for (const [index, option] of this.pending.prompt.options.entries()) {
					const marker = index === this.pending.selected ? colors.accent("●") : colors.muted("○");
					rows.push(`${marker} ${stripTerminalSequences(option.label)}`);
				}
			} else {
				const value = this.pending.prompt.type === "secret"
					? "•".repeat(Array.from(this.pending.value).length)
					: stripTerminalSequences(this.pending.value);
				rows.push(`${colors.accent(">")} ${value || colors.muted("입력 중…")}`);
			}
			rows.push("", colors.muted("Enter 확인 · Esc 취소"));
		} else if (this.done) {
			rows.push("", colors.muted("Esc로 닫기"));
		} else {
			rows.push("", colors.muted("인증 흐름을 준비하는 중…"));
		}
		return rows;
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
						label: method === "oauth" ? "구독 계정 로그인 (OAuth)" : "API 키",
					})),
				});
			const status = await this.auth.login(this.provider, method as AuthType, {
				signal: this.controller.signal,
				prompt: (prompt) => this.ask(prompt),
				notify: (event) => this.notify(event),
			});
			this.lines.push(colors.success("로그인이 완료되었습니다."));
			await this.onAuthenticated(status);
			this.done = true;
		} catch (error) {
			if (!this.controller.signal.aborted) {
				this.lines.push(colors.error(error instanceof Error ? error.message : String(error)));
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
			void open(event.url).catch(() => {
				this.lines.push(colors.warning(`브라우저를 열지 못했습니다: ${stripTerminalSequences(event.url)}`));
				this.requestRender();
			});
		}
		if (event.type === "device_code") {
			this.lines.push(`인증 코드: ${stripTerminalSequences(event.userCode)}`);
			void open(event.verificationUri).catch(() => undefined);
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

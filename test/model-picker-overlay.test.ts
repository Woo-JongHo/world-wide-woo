import { describe, expect, test } from "bun:test";
import { stripTerminalSequences, visibleWidth } from "@earendil-works/pi-tui";
import type { ProviderAuthState } from "../src/application/ports";
import type { Provider, WwwSettings } from "../src/domain/model-settings";
import { ModelPickerOverlay, type ModelPickerOptions } from "../src/presentation/tui/model-picker-overlay";

const current: WwwSettings = { provider: "openai-codex", model: "gpt-5.6-sol", effort: "ultra" };

function auth(state: ProviderAuthState["state"] = "configured"): (provider: Provider) => Promise<ProviderAuthState> {
	return async provider => {
		if (state === "configured") return { state, provider, source: "test", type: "api_key" };
		if (state === "required") return { state, provider };
		return { state, provider, message: "상태 조회 실패" };
	};
}

function overlay(options: {
	authStatus?: (provider: Provider) => Promise<ProviderAuthState>;
	onApply?: (settings: WwwSettings) => Promise<void>;
	onRequireAuth?: (settings: WwwSettings) => void;
	onClose?: () => void;
	initial?: WwwSettings;
	resumeAtConfirmation?: boolean;
	pickerOptions?: ModelPickerOptions;
} = {}): ModelPickerOverlay {
	return new ModelPickerOverlay(
		current,
		options.authStatus ?? auth(),
		() => undefined,
		options.onApply ?? (async () => undefined),
		options.onRequireAuth ?? (() => undefined),
		options.onClose ?? (() => undefined),
		options.initial,
		options.resumeAtConfirmation,
		options.pickerOptions,
	);
}

function text(picker: ModelPickerOverlay, width = 80): string {
	return stripTerminalSequences(picker.render(width).join("\n"));
}

describe("ModelPickerOverlay hierarchy", () => {
	test("starts at provider and contains no search field", () => {
		const picker = overlay();
		const output = text(picker);
		expect(output).toContain("[공급자]  ›  모델  ›  추론  ›  확인");
		expect(output).toContain("› openai-codex");
		expect(output).not.toContain("검색");
		picker.handleInput("gemini");
		expect(text(picker)).toContain("› openai-codex");
	});

	test("limits provider rows and auth lookups to the configured subset", async () => {
		const lookedUp: Provider[] = [];
		const picker = overlay({
			pickerOptions: { providers: ["openai-codex", "anthropic"] },
			authStatus: async provider => {
				lookedUp.push(provider);
				return { state: "configured", provider, source: "test", type: "api_key" };
			},
		});
		picker.start();
		await Bun.sleep(0);

		const output = text(picker);
		expect(output).toContain("› openai-codex");
		expect(output).toContain("  anthropic");
		expect(output).not.toContain("openai  ");
		expect(output).not.toContain("google  ");
		expect(lookedUp.sort()).toEqual(["anthropic", "openai-codex"]);
		picker.handleInput("\x1b[B");
		picker.handleInput("\r");
		expect(text(picker)).toContain("선택: anthropic / claude-opus-4-6 / ultra");
	});

	test("starts at model and applies without exposing the single provider step", async () => {
		let applied: WwwSettings | undefined;
		const picker = overlay({
			pickerOptions: { providers: ["openai-codex"], startAtModel: true },
			onApply: async settings => { applied = settings; },
		});
		picker.start();
		await Bun.sleep(0);

		const output = text(picker);
		expect(output).toContain("[모델]  ›  추론  ›  확인");
		expect(output).not.toContain("[공급자]");
		expect(output).toContain("› gpt-5.6-sol");
		picker.handleInput("\r");
		expect(text(picker)).toContain("[추론]");
		picker.handleInput("\r");
		expect(text(picker)).toContain("[확인]");
		picker.handleInput("\r");
		await Bun.sleep(0);
		expect(applied).toEqual(current);
	});

	test("backs out of the model step when provider selection was intentionally skipped", () => {
		let closed = false;
		const picker = overlay({
			pickerOptions: { providers: ["openai-codex"], startAtModel: true },
			onClose: () => { closed = true; },
		});
		picker.handleInput("\x1b[D");
		expect(closed).toBe(true);
	});

	test("walks provider to model to effort and applies only at confirmation", async () => {
		let applied: WwwSettings | undefined;
		let closed = false;
		const picker = overlay({
			onApply: async settings => { applied = settings; },
			onClose: () => { closed = true; },
		});
		picker.start();
		await Bun.sleep(0);

		picker.handleInput("\x1b[B");
		picker.handleInput("\r");
		expect(text(picker)).toContain("공급자  ›  [모델]  ›  추론  ›  확인");
		expect(text(picker)).toContain("선택: anthropic / claude-opus-4-6 / ultra");
		picker.handleInput("\x1b[B");
		picker.handleInput("\r");
		expect(text(picker)).toContain("공급자  ›  모델  ›  [추론]  ›  확인");
		picker.handleInput("\x1b[A");
		picker.handleInput("\x1b[A");
		picker.handleInput("\r");
		expect(text(picker)).toContain("공급자  ›  모델  ›  추론  ›  [확인]");
		expect(applied).toBeUndefined();
		picker.handleInput("\r");
		await Bun.sleep(0);
		expect(applied).toEqual({ provider: "anthropic", model: "claude-sonnet-4-6", effort: "medium" });
		expect(closed).toBe(true);
	});

	test("moves backward one hierarchy level without losing staged values", () => {
		const picker = overlay();
		picker.handleInput("\x1b[B");
		picker.handleInput("\r");
		picker.handleInput("\x1b[B");
		picker.handleInput("\r");
		picker.handleInput("\x1b[D");
		expect(text(picker)).toContain("공급자  ›  [모델]  ›  추론  ›  확인");
		expect(text(picker)).toContain("선택: anthropic / claude-sonnet-4-6 / ultra");
		picker.handleInput("\x1b[D");
		expect(text(picker)).toContain("[공급자]  ›  모델  ›  추론  ›  확인");
	});

	test("hands an unauthenticated staged selection to the caller only at confirmation", async () => {
		let required: WwwSettings | undefined;
		let applied = false;
		const picker = overlay({
			authStatus: auth("required"),
			onApply: async () => { applied = true; },
			onRequireAuth: settings => { required = settings; },
		});
		picker.start();
		await Bun.sleep(0);
		for (let step = 0; step < 4; step++) picker.handleInput("\r");
		expect(required).toEqual(current);
		expect(applied).toBe(false);
	});

	test("keeps confirmation visible when apply fails", async () => {
		let closed = false;
		const picker = overlay({
			onApply: async () => { throw new Error("스트리밍 중에는 변경할 수 없습니다."); },
			onClose: () => { closed = true; },
		});
		picker.start();
		await Bun.sleep(0);
		for (let step = 0; step < 4; step++) picker.handleInput("\r");
		await Bun.sleep(0);
		expect(closed).toBe(false);
		expect(text(picker)).toContain("스트리밍 중에는 변경할 수 없습니다.");
		expect(text(picker)).toContain("[확인]");
	});

	test("does not let Esc disguise an in-flight apply as cancellation", async () => {
		let resolveApply!: () => void;
		const applying = new Promise<void>(resolve => { resolveApply = resolve; });
		let closed = false;
		const picker = overlay({ onApply: () => applying, onClose: () => { closed = true; } });
		picker.start();
		await Bun.sleep(0);
		for (let step = 0; step < 4; step++) picker.handleInput("\r");
		picker.handleInput("\u001b");
		expect(closed).toBe(false);
		resolveApply();
		await Bun.sleep(0);
		expect(closed).toBe(true);
	});

	test("shows auth lookup errors and blocks final apply", async () => {
		let applied = false;
		const picker = overlay({
			authStatus: async () => { throw new Error("private provider error"); },
			onApply: async () => { applied = true; },
		});
		picker.start();
		await Bun.sleep(0);
		for (let step = 0; step < 4; step++) picker.handleInput("\r");
		expect(applied).toBe(false);
		expect(text(picker)).toContain("인증 상태를 확인하지 못했습니다");
		expect(text(picker)).not.toContain("private provider error");
	});

	test("restores a staged selection after auth without changing the current header", () => {
		const initial: WwwSettings = { provider: "google", model: "gemini-3-flash-preview", effort: "low" };
		const picker = overlay({ initial, resumeAtConfirmation: true });
		const output = text(picker);
		expect(output).toContain("현재: openai-codex / gpt-5.6-sol / ultra");
		expect(output).toContain("선택: google / gemini-3-flash-preview / low");
		expect(output).toContain("[확인]");
	});

	test("Esc discards every hierarchy level and all lines fit 40 columns", () => {
		let closed = false;
		let applied = false;
		const picker = overlay({ onApply: async () => { applied = true; }, onClose: () => { closed = true; } });
		picker.handleInput("\x1b[B");
		picker.handleInput("\r");
		picker.handleInput("\u001b");
		expect(closed).toBe(true);
		expect(applied).toBe(false);
		for (const line of picker.render(40)) expect(visibleWidth(line)).toBe(40);
	});
});

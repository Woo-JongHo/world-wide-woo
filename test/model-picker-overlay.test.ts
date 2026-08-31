import { describe, expect, test } from "bun:test";
import { visibleWidth } from "@earendil-works/pi-tui";
import type { ProviderAuthState } from "../src/application/ports";
import type { Provider, WwwSettings } from "../src/domain/model-settings";
import { ModelPickerOverlay } from "../src/presentation/tui/model-picker-overlay";

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
} = {}): ModelPickerOverlay {
	return new ModelPickerOverlay(
		current,
		options.authStatus ?? auth(),
		() => undefined,
		options.onApply ?? (async () => undefined),
		options.onRequireAuth ?? (() => undefined),
		options.onClose ?? (() => undefined),
	);
}

describe("ModelPickerOverlay", () => {
	test("filters tabs, globally searches, and displays current and staged settings", () => {
		const picker = overlay();
		expect(picker.render(80).join("\n")).toContain("현재: openai-codex / gpt-5.6-sol / ultra");
		picker.handleInput("\t");
		expect(picker.render(80).join("\n")).toContain("anthropic / claude-opus-4-6");
		picker.handleInput("\x1b[B");
		expect(picker.render(80).join("\n")).toContain("선택: anthropic / claude-sonnet-4-6 / ultra");
		picker.handleInput("gemini");
		const searched = picker.render(80).join("\n");
		expect(searched).toContain("google / gemini-3.1-pro-preview");
		expect(searched).not.toContain("anthropic / claude-opus-4-6");
	});

	test("cycles effort and applies the staged settings atomically", async () => {
		let applied: WwwSettings | undefined;
		let closed = false;
		const picker = overlay({
			onApply: async settings => { applied = settings; },
			onClose: () => { closed = true; },
		});
		picker.start();
		await Bun.sleep(0);
		picker.handleInput("\x05");
		picker.handleInput("\r");
		await Bun.sleep(0);
		expect(applied).toEqual({ ...current, effort: "low" });
		expect(closed).toBe(true);
	});

	test("keeps the staged header and Enter result aligned after switching provider tabs", async () => {
		let applied: WwwSettings | undefined;
		const picker = overlay({ onApply: async settings => { applied = settings; } });
		picker.start();
		await Bun.sleep(0);
		picker.handleInput("\t");
		expect(picker.render(80).join("\n")).toContain("선택: anthropic / claude-opus-4-6 / ultra");
		picker.handleInput("\r");
		await Bun.sleep(0);
		expect(applied).toEqual({ provider: "anthropic", model: "claude-opus-4-6", effort: "ultra" });
	});

	test("opens with the cursor on a non-first current model", async () => {
		const sonnet: WwwSettings = { provider: "anthropic", model: "claude-sonnet-4-6", effort: "high" };
		let applied: WwwSettings | undefined;
		const picker = new ModelPickerOverlay(
			sonnet,
			auth(),
			() => undefined,
			async settings => { applied = settings; },
			() => undefined,
			() => undefined,
		);
		picker.start();
		await Bun.sleep(0);
		picker.handleInput("\r");
		await Bun.sleep(0);
		expect(applied).toEqual(sonnet);
	});

	test("does not let Esc disguise an in-flight apply as cancellation", async () => {
		let resolveApply!: () => void;
		const applying = new Promise<void>((resolve) => {
			resolveApply = resolve;
		});
		let closed = false;
		const picker = overlay({
			onApply: () => applying,
			onClose: () => { closed = true; },
		});
		picker.start();
		await Bun.sleep(0);
		picker.handleInput("\r");
		picker.handleInput("\u001b");
		expect(closed).toBe(false);
		resolveApply();
		await Bun.sleep(0);
		expect(closed).toBe(true);
	});

	test("keeps the sheet and staged settings visible when apply fails", async () => {
		let closed = false;
		const picker = overlay({
			onApply: async () => { throw new Error("스트리밍 중에는 변경할 수 없습니다."); },
			onClose: () => { closed = true; },
		});
		picker.start();
		await Bun.sleep(0);
		picker.handleInput("\x05");
		picker.handleInput("\r");
		await Bun.sleep(0);
		const text = picker.render(80).join("\n");
		expect(closed).toBe(false);
		expect(text).toContain("스트리밍 중에는 변경할 수 없습니다.");
		expect(text).toContain("선택: openai-codex / gpt-5.6-sol / low");
	});

	test("hands unauthenticated selections to the caller without applying", async () => {
		let required: WwwSettings | undefined;
		let applied = false;
		const picker = overlay({
			authStatus: auth("required"),
			onApply: async () => { applied = true; },
			onRequireAuth: settings => { required = settings; },
		});
		picker.start();
		await Bun.sleep(0);
		picker.handleInput("\r");
		expect(required).toEqual(current);
		expect(applied).toBe(false);
	});

	test("shows authentication lookup errors without blocking search", async () => {
		const picker = overlay({ authStatus: async () => { throw new Error("상태 조회 실패"); } });
		picker.start();
		await Bun.sleep(0);
		picker.handleInput("gemini");
		const text = picker.render(80).join("\n");
		expect(text).toContain("인증 오류");
		expect(text).toContain("google / gemini-3.1-pro-preview");
	});

	test("Esc discards staging without saving and Korean layout fits 40 columns", () => {
		let closed = false;
		let applied = false;
		const picker = overlay({
			onApply: async () => { applied = true; },
			onClose: () => { closed = true; },
		});
		picker.handleInput("\x05");
		picker.handleInput("\u001b");
		expect(closed).toBe(true);
		expect(applied).toBe(false);
		for (const line of picker.render(40)) expect(visibleWidth(line)).toBe(40);
	});

	test("keeps ordinary e input available to the active search field", () => {
		const picker = overlay();
		picker.handleInput("e");
		expect(picker.render(80).join("\n")).toContain("> e");
	});

	test("leaves Left and Right available for correcting the search cursor", () => {
		const picker = overlay();
		picker.handleInput("gemni");
		picker.handleInput("\u001b[D");
		picker.handleInput("\u001b[D");
		picker.handleInput("i");
		expect(picker.render(80).join("\n")).toContain("google / gemini-3.1-pro-preview");
	});
});

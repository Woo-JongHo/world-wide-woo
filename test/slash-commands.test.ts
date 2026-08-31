import { describe, expect, test } from "bun:test";
import { parseShellCommand, SLASH_COMMANDS } from "../src/presentation/tui/slash-commands";
import type { WwwSettings } from "../src/domain/model-settings";

const current: WwwSettings = { provider: "openai", model: "gpt-5.4", effort: "high" };

describe("WWW slash commands", () => {
	test("opens interactive model and login selectors", () => {
		expect(parseShellCommand("/model", current)).toEqual({ type: "model.select" });
		expect(parseShellCommand("/login", current)).toEqual({ type: "auth.select" });
	});

	test("sets a validated Router model directly", () => {
		expect(parseShellCommand("/model openai-codex/gpt-5.6-sol ultra", current)).toEqual({
			type: "model.set",
			settings: { provider: "openai-codex", model: "gpt-5.6-sol", effort: "ultra" },
		});
	});

	test("routes provider login and usage refresh", () => {
		expect(parseShellCommand("/login anthropic", current)).toEqual({ type: "auth.login", provider: "anthropic" });
		expect(parseShellCommand("/usage", current)).toEqual({ type: "usage.refresh" });
		expect(parseShellCommand("/logout anthropic", current)).toEqual({ type: "auth.logout", provider: "anthropic" });
		expect(parseShellCommand("/effort ultra", current)).toEqual({ type: "effort.set", effort: "ultra" });
		expect(parseShellCommand("/status", current)).toEqual({ type: "status" });
		expect(parseShellCommand("/exit", current)).toEqual({ type: "exit" });
	});

	test("never sends unknown slash commands to the model", () => {
		expect(parseShellCommand("hello", current)).toBeNull();
		expect(parseShellCommand("/unknown", current)).toEqual({ type: "error", message: "알 수 없는 명령입니다: /unknown" });
		expect(parseShellCommand("/model fake/nope", current)).toMatchObject({ type: "error" });
	});

	test("advertises every supported command for editor completion", () => {
		expect(SLASH_COMMANDS.map((command) => command.name)).toEqual([
			"model",
			"login",
			"logout",
			"effort",
			"usage",
			"status",
			"help",
			"exit",
		]);
	});
});

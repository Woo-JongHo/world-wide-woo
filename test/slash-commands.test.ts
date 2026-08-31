import { describe, expect, test } from "bun:test";
import {
	parseShellCommand,
	shellCommandConcurrency,
	SLASH_COMMANDS,
} from "../src/presentation/tui/slash-commands";
import type { WwwSettings } from "../src/domain/model-settings";

const current: WwwSettings = { provider: "openai", model: "gpt-5.4", effort: "high" };

describe("WWW slash commands", () => {
	test("opens interactive model and login selectors", () => {
		expect(parseShellCommand("/model", current)).toEqual({ type: "model.select" });
		expect(parseShellCommand("/login", current)).toEqual({ type: "auth.select" });
	});

	test("classifies streaming concurrency independently from mutability", () => {
		expect(shellCommandConcurrency({ type: "status" })).toBe("local-read");
		expect(shellCommandConcurrency({ type: "monitoring" })).toBe("local-read");
		expect(shellCommandConcurrency({ type: "planning.status" })).toBe("local-read");
		expect(shellCommandConcurrency({ type: "planning.epic.create", title: "A", goal: "B" })).toBe("mutation");
		expect(shellCommandConcurrency({ type: "repository.commits" })).toBe("async-read");
		expect(shellCommandConcurrency({ type: "usage.refresh" })).toBe("async-read");
		expect(shellCommandConcurrency({ type: "model.select" })).toBe("mutation");
		expect(shellCommandConcurrency({ type: "exit" })).toBe("control");
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
		expect(parseShellCommand("/monitor", current)).toEqual({ type: "monitoring" });
		expect(parseShellCommand("/dashboard", current)).toEqual({ type: "monitoring" });
		expect(parseShellCommand("/planning", current)).toEqual({ type: "planning.status" });
		expect(parseShellCommand("/epic Safe edits :: Preview and approve every edit", current)).toEqual({
			type: "planning.epic.create",
			title: "Safe edits",
			goal: "Preview and approve every edit",
		});
		expect(parseShellCommand("/story EP-010 Approval flow --supersedes ST-010-01 :: User approves before mutation", current)).toEqual({
			type: "planning.story.create",
			epicId: "EP-010",
			title: "Approval flow",
			acceptance: "User approves before mutation",
			supersedes: "ST-010-01",
		});
		expect(parseShellCommand("/commits", current)).toEqual({ type: "repository.commits" });
		expect(parseShellCommand("/issues", current)).toEqual({ type: "repository.issues" });
		expect(parseShellCommand("/exit", current)).toEqual({ type: "exit" });
	});

	test("never sends unknown slash commands to the model", () => {
		expect(parseShellCommand("hello", current)).toBeNull();
		expect(parseShellCommand("/unknown", current)).toEqual({ type: "error", message: "알 수 없는 명령입니다: /unknown" });
		expect(parseShellCommand("/model fake/nope", current)).toMatchObject({ type: "error" });
		expect(parseShellCommand("/epic missing separator", current)).toMatchObject({ type: "error" });
		expect(parseShellCommand("/story EP-010 missing acceptance", current)).toMatchObject({ type: "error" });
	});

	test("advertises every supported command for editor completion", () => {
		expect(SLASH_COMMANDS.map((command) => command.name)).toEqual([
			"model",
			"login",
			"logout",
			"effort",
			"usage",
			"status",
			"monitor",
			"dashboard",
			"planning",
			"epic",
			"story",
			"commits",
			"issues",
			"help",
			"exit",
		]);
	});
});

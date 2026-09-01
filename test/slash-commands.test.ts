import { describe, expect, test } from "bun:test";
import {
	parseShellCommand,
	parseTerminalCommand,
	parseWorkbenchShellCommand,
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

	test("intercepts exact WWW commands and leaves unknown native slash input untouched", () => {
		expect(parseShellCommand("hello", current)).toBeNull();
		expect(parseShellCommand("/skills", current)).toBeNull();
		expect(parseShellCommand("/unknown", current)).toBeNull();
		expect(parseShellCommand("/model fake/nope", current)).toMatchObject({ type: "error" });
		expect(parseShellCommand("/epic missing separator", current)).toMatchObject({ type: "error" });
		expect(parseShellCommand("/story EP-010 missing acceptance", current)).toMatchObject({ type: "error" });
	});

	test("extracts explicit bang commands without treating ordinary messages as shell", () => {
		expect(parseTerminalCommand("!git status --short")).toBe("git status --short");
		expect(parseTerminalCommand("  ! printf 'hello' | wc -c  ")).toBe("printf 'hello' | wc -c");
		expect(parseTerminalCommand("!")).toBe("");
		expect(parseTerminalCommand("terminal 설명")).toBeNull();
	});

	test("intercepts only exact workbench-local commands", () => {
		expect(parseWorkbenchShellCommand("/source latest")).toEqual({ type: "activity.select", activityId: "latest" });
		expect(parseWorkbenchShellCommand("/tnote")).toEqual({ type: "tnote.capture" });
		expect(parseWorkbenchShellCommand("/tnote range 3 7")).toEqual({ type: "tnote.capture-range", startSequence: 3, endSequence: 7 });
		expect(parseWorkbenchShellCommand("/tnote range 7 3")).toMatchObject({ type: "error" });
		expect(parseWorkbenchShellCommand("/todo create v0.1 :: TUI 배선 | 증거 확인")).toEqual({
			type: "todo.create", title: "v0.1", items: ["TUI 배선", "증거 확인"],
		});
		expect(parseWorkbenchShellCommand("/todo add now 우선 작업")).toEqual({ type: "todo.add", placement: "now", content: "우선 작업" });
		expect(parseWorkbenchShellCommand("/todo detail todo-1 세부 검증")).toEqual({ type: "todo.details", itemId: "todo-1", details: ["세부 검증"] });
		expect(parseWorkbenchShellCommand("/todo complete todo-1")).toEqual({ type: "todo.transition", action: "complete", itemId: "todo-1" });
		expect(parseWorkbenchShellCommand("/todo evidence latest")).toEqual({ type: "todo.evidence", activityId: "latest" });
		expect(parseWorkbenchShellCommand("/todo import-legacy")).toEqual({ type: "todo.import-legacy" });
		expect(parseWorkbenchShellCommand("/promote tnote note-1")).toEqual({ type: "promotion.accept", noteId: "note-1" });
		expect(parseWorkbenchShellCommand("/promote confirm receipt-token")).toEqual({ type: "promotion.confirm", token: "receipt-token" });
		expect(parseWorkbenchShellCommand("/review preview opus public note-1 :: 현재 결정만 검토")).toEqual({
			type: "review.preview", provider: "anthropic", noteId: "note-1", request: "현재 결정만 검토",
		});
		expect(parseWorkbenchShellCommand("/review preview gemini private note-1 :: 안 됨")).toMatchObject({ type: "error" });
		expect(parseWorkbenchShellCommand("/review send abc123")).toEqual({ type: "review.send", digest: "abc123" });
		expect(parseWorkbenchShellCommand("/approve")).toEqual({ type: "approval.accept" });
		expect(parseWorkbenchShellCommand("/approve-session")).toEqual({ type: "approval.accept-session" });
		expect(parseWorkbenchShellCommand("/skill commit")).toBeNull();
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

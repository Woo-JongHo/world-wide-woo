import { describe, expect, test } from "bun:test";
import { stripTerminalSequences, visibleWidth } from "@earendil-works/pi-tui";
import type { WorkbenchModelUsage } from "../src/domain/workbench";
import { colors } from "../src/presentation/tui/theme";
import { modelChipLabel, UsageStripView, type UsageStripSession } from "../src/presentation/tui/usage-strip-view";

function readyView(session?: UsageStripSession): UsageStripView {
	const now = Date.now();
	const view = new UsageStripView(session ? () => session : undefined);
	view.update([
		{
			provider: "openai-codex",
			state: "ready",
			fetchedAt: now,
			limits: [
				{ label: "5 hours", remainingPercent: 68, usedPercent: 32, resetsAt: now + 2 * 3_600_000 + 14 * 60_000 + 59_000, status: "ok" },
				{ label: "7 days", remainingPercent: 51, usedPercent: 49, resetsAt: now + (3 * 24 + 8) * 3_600_000 + 59_000, status: "ok" },
				{ label: "7 days (Spark)", remainingPercent: 81, usedPercent: 19, resetsAt: now + (5 * 24 + 2) * 3_600_000 + 59_000, status: "ok" },
			],
		},
		{
			provider: "anthropic",
			state: "ready",
			fetchedAt: now,
			limits: [
				{ label: "Claude 5 Hour", remainingPercent: 63, usedPercent: 37, resetsAt: now + 1 * 3_600_000 + 42 * 60_000 + 59_000, status: "ok" },
				{ label: "Claude 7 Day", remainingPercent: 72, usedPercent: 28, resetsAt: now + (4 * 24 + 6) * 3_600_000 + 59_000, status: "ok" },
				{ label: "Claude 7 Day (Opus)", remainingPercent: 41, usedPercent: 59, resetsAt: now + (4 * 24 + 6) * 3_600_000 + 59_000, status: "ok" },
			],
		},
	]);
	return view;
}

function usage(model: string, turns: number, totalTokens: number): WorkbenchModelUsage {
	return { model, effort: null, interactiveRootTurns: turns, interactiveTokens: totalTokens, detachedInvocations: 0, detachedTokens: 0, totalTokens };
}

describe("UsageStripView", () => {
	test("gives every provider window its own row with a bar and a reset time", () => {
		const rendered = readyView().render(100);
		const lines = rendered.map(stripTerminalSequences);

		expect(lines).toHaveLength(4);
		expect(lines.every((line) => visibleWidth(line) === 100)).toBe(true);
		expect(lines[0]).toContain("Codex");
		expect(lines[0]).toContain("7d");
		expect(lines[0]).toContain("3d08h");
		expect(lines[1]).toContain("Claude");
		expect(lines[1]).toContain("4d06h");
		expect(lines[2]).toContain("5h");
		expect(lines[2]).toContain("1h42m");
		expect(lines[3]).toContain("Gemini");
	});

	test("repeats no provider label on its second window row", () => {
		const lines = readyView().render(100).map(stripTerminalSequences);
		expect(lines[2]?.startsWith("      ")).toBe(true);
		expect(lines[2]).not.toContain("Claude");
	});

	test("keeps the bar proportional to the remaining quota", () => {
		const lines = readyView().render(100).map(stripTerminalSequences);
		// Codex 7d is 51% remaining, so five of ten cells are filled.
		expect(lines[0]).toContain("█████░░░░░");
		// Claude 7d is 72% remaining.
		expect(lines[1]).toContain("███████░░░");
	});

	test("marks only the running model and attributes chips to the owning provider", () => {
		const session: UsageStripSession = {
			activeModel: "gpt-5.6-sol",
			models: [usage("gpt-5.6-sol", 12, 900), usage("claude-opus-4-6", 3, 400), usage("gemini-3.1-pro", 2, 100)],
		};
		const rendered = readyView(session).render(100);
		const lines = rendered.map(stripTerminalSequences);

		expect(lines[0]).toContain("● Sol i12");
		expect(lines[1]).toContain("Opus i3");
		expect(lines[1]).not.toContain("●");
		expect(lines[3]).toContain("Pro i2");
		expect(rendered[0]).toContain(colors.success("● Sol i12"));
	});

	test("counts an unrecognised model instead of attributing it to a guess", () => {
		const session: UsageStripSession = { models: [usage("mystery-model", 4, 50)] };
		const lines = readyView(session).render(100).map(stripTerminalSequences);
		expect(lines.join("\n")).not.toContain("Mystery");
		expect(lines[3]).toContain("+1");
	});

	test("shows the provider state instead of a bar when a snapshot is not ready", () => {
		const view = new UsageStripView();
		view.update([
			{ provider: "openai-codex", state: "auth-required", fetchedAt: Date.now(), limits: [] },
			{ provider: "anthropic", state: "loading", fetchedAt: Date.now(), limits: [] },
		]);
		const lines = view.render(100).map(stripTerminalSequences);
		expect(lines[0]).toContain("/login");
		expect(lines[1]).toContain("확인 중");
		expect(lines[0]).not.toContain("█");
	});

	test("keeps four padded rows and drops chips before the quota when narrow", () => {
		for (const width of [28, 40, 64, 100, 140]) {
			const lines = readyView({ models: [usage("gpt-5.6-sol", 9, 10)] }).render(width).map(stripTerminalSequences);
			expect(lines).toHaveLength(4);
			expect(lines.every((line) => visibleWidth(line) === width)).toBe(true);
		}
		const narrow = readyView({ models: [usage("gpt-5.6-sol", 9, 10)] }).render(28).map(stripTerminalSequences);
		expect(narrow.join("\n")).not.toContain("Sol");
		expect(narrow[0]).toContain("Codex");
	});

	test("reports a width it cannot lay out rather than clipping silently", () => {
		const lines = readyView().render(12).map(stripTerminalSequences);
		expect(lines).toHaveLength(4);
		expect(lines[0]).toContain("폭 부족");
		expect(lines.every((line) => visibleWidth(line) === 12)).toBe(true);
	});

	test("shortens a model id to its variant and keeps an unusual id intact", () => {
		expect(modelChipLabel("gpt-5.6-sol")).toBe("Sol");
		expect(modelChipLabel("claude-opus-4-6")).toBe("Opus");
		expect(modelChipLabel("gemini-3.1-pro-preview")).toBe("Pro");
		expect(modelChipLabel("weird_id")).toBe("weird_id");
	});
});

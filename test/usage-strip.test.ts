import { describe, expect, test } from "bun:test";
import { stripTerminalSequences, visibleWidth } from "@earendil-works/pi-tui";
import { UsageStripView } from "../src/presentation/tui/usage-strip-view";

describe("UsageStripView", () => {
	test("renders Codex and Claude in exactly two compact HUD lines", () => {
		const view = new UsageStripView();
		view.update([
			{
				provider: "openai-codex",
				state: "ready",
				fetchedAt: Date.now(),
				limits: [
					{ label: "7 days", remainingPercent: 66, usedPercent: 34, resetsAt: Date.now() + 6 * 86_400_000, status: "ok" },
					{ label: "5 hours (Spark)", remainingPercent: 100, usedPercent: 0, resetsAt: Date.now() + 5 * 3_600_000, status: "ok" },
				],
			},
			{ provider: "anthropic", state: "auth-required", fetchedAt: Date.now(), limits: [] },
		]);

		const lines = view.render(120);
		expect(lines).toHaveLength(2);
		expect(lines.every((line) => visibleWidth(line) === 120)).toBe(true);
		expect(lines[0]).toContain("Codex");
		expect(lines[0]).toContain("7Day");
		expect(lines[0]).toContain("7Day      66%");
		expect(lines[0]).not.toContain(":");
		expect(lines[0]).not.toMatch(/[▐▌▮█░]/u);
		expect(lines[0]).toContain("66%");
		expect(lines[0]).not.toContain("Spark");
		expect(lines[1]).toContain("Claude");
		expect(lines[1]).toContain("/login anthropic");
	});

	test("aligns provider usage columns by terminal width", () => {
		const view = new UsageStripView();
		view.update([
			{ provider: "openai-codex", state: "ready", fetchedAt: 1, limits: [{ label: "7 days", remainingPercent: 34, usedPercent: 66, status: "ok" }] },
			{ provider: "anthropic", state: "ready", fetchedAt: 1, limits: [{ label: "Claude 5 Hour", remainingPercent: 92, usedPercent: 8, status: "ok" }] },
		]);

		const [codex, claude] = view.render(100).map(stripTerminalSequences);
		expect(codex?.indexOf("7Day")).toBe(claude?.indexOf("5Session"));
		expect(codex?.indexOf("%")).toBe(claude?.indexOf("%"));
	});

	test("keeps resets beside compact quotas at constrained widths", () => {
		const view = new UsageStripView();
		view.update([
			{ provider: "openai-codex", state: "ready", fetchedAt: 1, limits: [{ label: "7 days", remainingPercent: 34, usedPercent: 66, resetsAt: Date.now() + 3_600_000, status: "ok" }] },
			{ provider: "anthropic", state: "ready", fetchedAt: 1, limits: [{ label: "Claude 5 Hour", remainingPercent: 92, usedPercent: 8, resetsAt: Date.now() + 2 * 3_600_000, status: "ok" }] },
		]);

		for (const width of [32, 36, 50, 64]) {
			const lines = view.render(width).map(stripTerminalSequences);
			expect(lines).toHaveLength(2);
			expect(lines.every((line) => visibleWidth(line) === width)).toBe(true);
			expect(lines[0]).toMatch(/34% 59m|34% 1h/u);
			expect(lines[1]).toMatch(/92% 1h|92% 2h/u);
		}
	});

	test("places the six fixed session model slots beside the selected provider quotas", () => {
		const view = new UsageStripView(() => ({
			totalTokens: 38_760,
			unattributedTokens: 0,
			models: [
				{ model: "gpt-5.6-sol", effort: "ultra", turns: 2, totalTokens: 25_840 },
				{ model: "claude-opus-5", effort: null, turns: 1, totalTokens: 12_920 },
			],
		}));
		view.update([
			{
				provider: "openai-codex",
				state: "ready",
				fetchedAt: 1,
				limits: [
					{ label: "7 days", remainingPercent: 34, usedPercent: 66, status: "ok" },
					{ label: "5 hours (Spark)", remainingPercent: 100, usedPercent: 0, status: "ok" },
				],
			},
			{
				provider: "anthropic",
				state: "ready",
				fetchedAt: 1,
				limits: [
					{ label: "Claude 5 Hour", remainingPercent: 92, usedPercent: 8, status: "ok" },
					{ label: "Claude 7 Day", remainingPercent: 69, usedPercent: 31, status: "ok" },
				],
			},
		]);

		const lines = view.render(132).map(stripTerminalSequences);
		expect(lines).toHaveLength(3);
		expect(lines[0]).toContain("Codex   7Day");
		expect(lines[0]).toContain("Sol   : 25.8k");
		expect(lines[0]).toContain("Fable  :     –");
		expect(lines[1]).toContain("Claude  5Session");
		expect(lines[1]).toContain("7Day");
		expect(lines[1]).toContain("Terra :     –");
		expect(lines[1]).toContain("Opus   : 12.9k");
		expect(lines[2]).toContain("Luna  :     –");
		expect(lines[2]).toContain("Sonnet :     –");
		expect(lines[0]?.indexOf("Fable")).toBe(lines[1]?.indexOf("Opus"));
		expect(lines[1]?.indexOf("Opus")).toBe(lines[2]?.indexOf("Sonnet"));
		expect(lines.join("\n")).not.toContain("Spark");
	});

	test("distinguishes rate limiting and preserves visibly stale values", () => {
		const view = new UsageStripView();
		view.update([
			{ provider: "openai-codex", state: "error", fetchedAt: 1, limits: [] },
			{
				provider: "anthropic",
				state: "ready",
				fetchedAt: 1,
				stale: true,
				issue: { kind: "rate-limit", retryAt: Date.now() + 120_000 },
				limits: [{ label: "Claude 5 Hour", remainingPercent: 69, usedPercent: 31, status: "ok" }],
			},
		]);

		const lines = view.render(120);
		expect(lines[1]).toContain("Claude");
		expect(lines[1]).toContain("*");
		expect(lines[1]).toContain("69%");
		expect(lines[1]).toContain("요청 제한");
	});
});

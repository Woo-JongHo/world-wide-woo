import { describe, expect, test } from "bun:test";
import { visibleWidth } from "@earendil-works/pi-tui";
import { UsageStripView } from "../src/presentation/tui/dashboard-views";

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
		expect(lines[0]).toContain("7d:66%남음");
		expect(lines[0]).toContain("5h·Spark:100%남음");
		expect(lines[1]).toContain("Claude");
		expect(lines[1]).toContain("/login anthropic");
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
		expect(lines[1]).toContain("69%남음");
		expect(lines[1]).toContain("요청 제한");
	});
});

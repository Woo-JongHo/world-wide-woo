import { describe, expect, test } from "bun:test";
import { stripTerminalSequences, visibleWidth } from "@earendil-works/pi-tui";
import { AstraUsageRail, AstraUsageView } from "../src/adapters/inbound/tui/features/usage/astra-usage-view";
import type { UsageSnapshot } from "../src/core/ports";
import { astraFixture } from "./fixtures/astra-snapshot";

describe("AstraUsageView", () => {
	test("shows only observed session and provider usage", () => {
		const snapshot = astraFixture();
		snapshot.sessionUsage = {
			totalTokens: 1_500,
			observedTotalTokens: 1_500,
			unattributedTokens: 100,
			models: [{ model: "gpt-5.6-sol", effort: "high", interactiveRootTurns: 2, interactiveTokens: 1_200, detachedInvocations: 1, detachedTokens: 300, totalTokens: 1_500 }],
			observationCoverage: { interactive: true, detached: true },
		};
		const usage: UsageSnapshot[] = [{
			provider: "openai-codex",
			state: "ready",
			fetchedAt: 1,
			limits: [{ label: "7 days", remainingPercent: 62, status: "ok" }],
		}];
		const output = stripTerminalSequences(new AstraUsageView(() => snapshot, () => usage).render(120).join("\n"));
		expect(output).not.toContain("Usage Dashboard");
		expect(output).toContain("Active Providers Telemetry");
		for (const provider of ["CODEX", "CLAUDE", "ANTIGRAVITY", "Z.AI"]) expect(output).toContain(provider);
		expect(output).toContain("gpt-5.6-sol");
		expect(output).toContain("62% 남음");
		expect(output).toContain("████");
		expect(output).toContain("░░░░");
		expect(output).toContain("high 100% · 1.5K");
		for (const heading of ["MODEL NAME", "EFFORT", "REQUEST", "INPUT / OUTPUT / CACHED TOKENS", "EXEC TIME", "RECENT USE", "SUPPORTED EFFORTS"]) expect(output).toContain(heading);
		for (const panel of ["Provider Availability Window", "Time Until Renewal", "Model Effort Distribution", "Token Trend", "Today vs Session", "Provider Load Ratio", "Token Consumption Matrix", "Input / Output Ratio", "Performance Trend"]) expect(output).toContain(panel);
		expect(output).toContain("provider attribution");
		expect(output).toContain("Token Trend · unavailable");
	});

	test("keeps unobserved state explicit and every row within the pane", () => {
		for (const width of [40, 80, 120]) {
			const rows = new AstraUsageView(() => astraFixture(), () => []).render(width);
			const output = stripTerminalSequences(rows.join("\n"));
			expect(output).not.toContain("Usage Dashboard");
			expect(output).toContain("미관측");
			for (const panel of ["Provider Availability", "Model Effort Distribution", "Token Consumption Matrix", "Performance Trend"]) expect(output).toContain(panel);
			expect(rows.every(row => visibleWidth(row) <= width)).toBe(true);
		}
	});

	test("uses shared provider cards wide, stacks them compactly, and keeps the rail honest", () => {
		const snapshot = astraFixture();
		const usage: UsageSnapshot[] = [{
			provider: "anthropic",
			state: "ready",
			stale: true,
			fetchedAt: 1,
			limits: [{ label: "Claude 7 Day", remainingPercent: 84, status: "ok" }],
		}];
		const view = new AstraUsageView(() => snapshot, () => usage);
		const wide = view.render(120);
		const compact = view.render(60);
		const wideText = stripTerminalSequences(wide.join("\n"));
		const compactText = stripTerminalSequences(compact.join("\n"));
		expect(wideText).toContain("┌");
		expect(wideText).toContain("Claude");
		expect(wideText).toContain("84% 남음");
		expect(wideText).toContain("████");
		expect(compactText).toContain("provider snapshot 없음");
		for (const rows of [wide, compact]) expect(rows.every(row => visibleWidth(row) <= (rows === wide ? 120 : 60))).toBe(true);
		const rail = stripTerminalSequences(new AstraUsageRail(() => snapshot, () => usage).render(38).join("\n"));
		expect(rail).toContain("Workbench Metrics");
		expect(rail).toContain("Time Window Performance");
		expect(rail).toContain("System Hints");
		expect(rail).toContain("미관측");
	});
});

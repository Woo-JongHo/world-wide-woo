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
		expect(output).toContain("모델별 사용 내역");
		for (const provider of ["CODEX", "CLAUDE", "ANTIGRAVITY", "Z.AI"]) expect(output).toContain(provider);
		expect(output).toContain("gpt-5.6-sol");
		expect(output).toContain("62% 남음");
		for (const heading of ["MODEL", "EFFORT", "DIRECT", "DETACHED", "OBSERVED"]) expect(output).toContain(heading);
		for (const value of ["1.2K", "300", "1.5K"]) expect(output).toContain(value);
		expect(output).toContain("작업별 귀속 미확인");
		expect(output).not.toContain("Token Trend");
	});

	test("keeps unobserved state explicit and every row within the pane", () => {
		for (const width of [40, 80, 120]) {
			const rows = new AstraUsageView(() => astraFixture(), () => []).render(width);
			const output = stripTerminalSequences(rows.join("\n"));
			expect(output).not.toContain("Usage Dashboard");
			expect(output).toContain("미관측");
			for (const panel of ["모델별 사용 내역", "어디에 사용했나", "구독 잔여 한도"]) expect(output).toContain(panel);
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
		expect(compactText).toContain("provider snapshot 없음");
		for (const rows of [wide, compact]) expect(rows.every(row => visibleWidth(row) <= (rows === wide ? 120 : 60))).toBe(true);
		const rail = stripTerminalSequences(new AstraUsageRail(() => snapshot, () => usage).render(38).join("\n"));
		expect(rail).toContain("관측 범위");
		expect(rail).toContain("아직 알 수 없는 것");
		expect(rail).toContain("오래된 한도 정보");
		expect(rail).toContain("미관측");
	});
});

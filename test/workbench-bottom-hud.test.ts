import { expect, test } from "bun:test";
import { stripTerminalSequences, visibleWidth } from "@earendil-works/pi-tui";
import { WorkbenchBottomHudView } from "../src/adapters/inbound/tui/dashboard/workbench-bottom-hud";
import { UsageStripView } from "../src/adapters/inbound/tui/dashboard/usage-strip-view";

test("HUD는 실행 모드와 provider 사용량을 한 줄에 표시한다", () => {
	const usage = new UsageStripView();
	usage.update([
		{ provider: "openai-codex", state: "ready", fetchedAt: 1, limits: [{ label: "7 days", remainingPercent: 98, status: "ok" }] },
		{ provider: "anthropic", state: "ready", fetchedAt: 1, limits: [{ label: "Claude 7 Day", remainingPercent: 99, status: "ok" }] },
	]);
	const lines = new WorkbenchBottomHudView(usage).render(120).map(stripTerminalSequences);
	expect(lines).toHaveLength(1);
	expect(lines[0]).toContain("Codex 98%");
	expect(lines[0]).toContain("Claude 99%");
	expect(lines[0]).toContain("Gemini —");
	expect(lines[0]).not.toContain("⑂ main");
	expect(lines[0]).toContain("● Manual");
	expect(lines[0]).toContain("Context —");
	expect(lines[0]).not.toContain("WOONI");
	expect(visibleWidth(lines[0]!)).toBe(120);
});

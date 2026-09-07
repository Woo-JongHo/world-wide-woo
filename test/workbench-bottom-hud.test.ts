import { expect, test } from "bun:test";
import { stripTerminalSequences, visibleWidth } from "@earendil-works/pi-tui";
import { WorkbenchBottomHudView } from "../src/presentation/tui/workbench-bottom-hud";
import { UsageStripView } from "../src/presentation/tui/usage-strip-view";

test("HUD는 캐릭터와 기타 상태 없이 provider 주간 사용량 한 줄만 차지한다", () => {
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
	expect(lines[0]).not.toContain("5h");
	expect(lines[0]).not.toContain("●");
	expect(lines[0]).not.toContain("WOONI");
	expect(visibleWidth(lines[0]!)).toBe(120);
});

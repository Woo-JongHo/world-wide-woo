import { expect, test } from "bun:test";
import { compactTokenCount, WORKBENCH_HUD_SYSTEM } from "../src/adapters/inbound/tui/dashboard/workbench-hud-system";

test("HUD 계약은 composer 탭과 한 줄 telemetry strip의 구획을 고정한다", () => {
	expect(WORKBENCH_HUD_SYSTEM.composer.leftCap).toBe("╭─");
	expect(WORKBENCH_HUD_SYSTEM.strip.separator).toBe(" │ ");
	expect(WORKBENCH_HUD_SYSTEM.providers).toEqual(["Codex", "Claude", "Gemini", "Z.AI"]);
});

test("context 토큰은 읽기 쉬운 축약 단위로 렌더링한다", () => {
	expect(compactTokenCount(92400)).toBe("92k");
	expect(compactTokenCount(2400)).toBe("2.4k");
	expect(compactTokenCount(200000)).toBe("200k");
});

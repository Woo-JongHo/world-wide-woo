import { expect, test } from "bun:test";
import { stripTerminalSequences, visibleWidth } from "@earendil-works/pi-tui";
import { UsageStripView } from "../src/tui/workbench/usage-strip-view";

test("주간 잔여 비율과 초기화까지 남은 기간만 표시한다", () => {
	const now = Date.now();
	const view = new UsageStripView();
	view.update([
		{ provider: "openai-codex", state: "ready", fetchedAt: now, limits: [
			{ label: "5 hours", remainingPercent: 82, resetsAt: now + 2 * 3_600_000, status: "ok" },
			{ label: "7 days", remainingPercent: 80, resetsAt: now + 7 * 86_400_000, status: "ok" },
		] },
		{ provider: "anthropic", state: "ready", fetchedAt: now, limits: [
			{ label: "Claude 5 Hour", remainingPercent: 12, status: "ok" },
			{ label: "Claude 7 Day", remainingPercent: 84, resetsAt: now + 7 * 86_400_000, status: "ok" },
		] },
	]);
	const line = stripTerminalSequences(view.render(100)[0]!);
	expect(line.trimEnd()).toBe("Codex 80% · 7d | Claude 84% · 7d | Gemini —");
	expect(line).not.toContain("5h");
	expect(line).not.toContain("●");
});

test("값 없음과 좁은 폭에서도 한 줄 경계를 지킨다", () => {
	const line = new UsageStripView().render(24)[0]!;
	expect(stripTerminalSequences(line)).toContain("Codex");
	expect(visibleWidth(line)).toBe(24);
	expect(new UsageStripView().render(24)).toHaveLength(1);
});

test("ready 상태에 주간 값이 없으면 추정이나 실패 문구 대신 대시를 표시한다", () => {
	const view = new UsageStripView();
	view.update([
		{ provider: "openai-codex", state: "ready", fetchedAt: 1, limits: [{ label: "5 hours", remainingPercent: 50, status: "ok" }] },
		{ provider: "anthropic", state: "ready", fetchedAt: 1, limits: [] },
	]);
	const line = stripTerminalSequences(view.render(100)[0]!);
	expect(line).toContain("Codex —");
	expect(line).toContain("Claude —");
	expect(line).toContain("Gemini —");
	expect(line).not.toContain("조회 실패");
});

test("loading auth-required unsupported 상태만 짧은 상태 문구를 사용한다", () => {
	const view = new UsageStripView();
	view.update([
		{ provider: "openai-codex", state: "auth-required", fetchedAt: 1, limits: [] },
		{ provider: "anthropic", state: "unsupported", fetchedAt: 1, limits: [] },
	]);
	const line = stripTerminalSequences(view.render(100)[0]!);
	expect(line).toContain("Codex 로그인 필요");
	expect(line).toContain("Claude 미지원");
});

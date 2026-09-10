import { expect, test } from "bun:test";
import { stripTerminalSequences, visibleWidth } from "@earendil-works/pi-tui";
import { UsageStripView } from "../src/adapters/inbound/tui/dashboard/usage-strip-view";

const now = Date.now();

function readyUsage() {
	const view = new UsageStripView(() => ({
		models: [],
		contextUsage: { usedTokens: 92_400, contextWindow: 200_000, percent: 46.2 },
		collaborationMode: "manual",
		permissionMode: "manual",
	}));
	view.update([
		{ provider: "openai-codex", state: "ready", fetchedAt: now, limits: [{ label: "7 days", remainingPercent: 80, resetsAt: now + 7 * 86_400_000, status: "ok" }] },
		{ provider: "anthropic", state: "ready", fetchedAt: now, limits: [
			{ label: "Claude 5 Hour", remainingPercent: 12, resetsAt: now + 2 * 3_600_000, status: "ok" },
			{ label: "Claude 7 Day", remainingPercent: 84, resetsAt: now + 7 * 86_400_000, status: "ok" },
		] },
		{ provider: "google", state: "ready", fetchedAt: now, limits: [{ label: "Gemini gemini-3.1-pro-preview", remainingPercent: 63, resetsAt: now + 86_400_000, status: "ok" }] },
	]);
	return view;
}

test("runtime mode, 공급자 잔여 시간, Context 토큰을 한 줄에 표시한다", () => {
	const line = stripTerminalSequences(readyUsage().render(240)[0]!);
	expect(line).toContain("● Manual");
	expect(line).toMatch(/Codex (?:7d 0h|6d 23h)/u);
	expect(line).toContain("80%");
	expect(line).toMatch(/Claude (?:7d 0h|6d 23h)/u);
	expect(line).toMatch(/5h 2h \d{2}m/u);
	expect(line).toMatch(/Gemini (?:1d 0h|23h \d{2}m)/u);
	expect(line).toContain("Context 92k / 200k 46%");
	expect(line).toContain(" │ ");
});

test("값 없음과 좁은 폭에서도 한 줄 경계를 지킨다", () => {
	const line = new UsageStripView().render(24)[0]!;
	expect(stripTerminalSequences(line)).toContain("● Manual");
	expect(visibleWidth(line)).toBe(24);
	expect(new UsageStripView().render(24)).toHaveLength(1);
});

test("ready 상태에 사용량 값이 없으면 대시를 표시한다", () => {
	const view = new UsageStripView();
	view.update([
		{ provider: "openai-codex", state: "ready", fetchedAt: 1, limits: [{ label: "5 hours", remainingPercent: 50, status: "ok" }] },
		{ provider: "anthropic", state: "ready", fetchedAt: 1, limits: [] },
	]);
	const line = stripTerminalSequences(view.render(120)[0]!);
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
		{ provider: "google", state: "auth-required", fetchedAt: 1, limits: [] },
	]);
	const line = stripTerminalSequences(view.render(120)[0]!);
	expect(line).toContain("Codex 로그인 필요");
	expect(line).toContain("Claude 미지원");
	expect(line).toContain("Gemini 로그인 필요");
});

test("YAML HUD 정책으로 측정 사용량과 Context를 각각 숨긴다", () => {
	const view = new UsageStripView(() => ({
		models: [],
		contextUsage: { usedTokens: 10_000, contextWindow: 20_000, percent: 50 },
		permissionMode: "manual",
		showUsage: false,
		showContext: false,
	}));
	view.update([{ provider: "openai-codex", state: "ready", fetchedAt: now, limits: [{ label: "7 days", remainingPercent: 80, status: "ok" }] }]);
	const line = stripTerminalSequences(view.render(120)[0]!);
	expect(line).toContain("● Manual");
	expect(line).not.toContain("Codex");
	expect(line).not.toContain("Context");
});

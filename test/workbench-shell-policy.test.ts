import { describe, expect, test } from "bun:test";
import {
	workbenchActivityIndicator,
	workbenchFrameTitle,
	workbenchModelSettings,
	workbenchReceiptClearsComposer,
	workbenchReceiptNotice,
} from "../src/presentation/tui/workbench-shell";

const workingSnapshot = {
	phase: "working",
	pendingApproval: null,
	draft: "",
	reasoningDraft: "",
	chat: [
		{ role: "user", content: "현재 디렉터리 구조를 확인해줘" },
		{ role: "assistant", content: "현재 디렉터리 구조를 직접 확인하겠습니다." },
	],
	workFlow: { steps: [] },
} as const;

describe("native workbench shell receipt policy", () => {
	test("normalizes native model telemetry into a selectable Codex setting", () => {
		expect(workbenchModelSettings({ model: "gpt-5.6-terra", effort: "high" })).toEqual({
			provider: "openai-codex",
			model: "gpt-5.6-terra",
			effort: "high",
		});
		expect(workbenchModelSettings({ model: "unknown", effort: null })).toEqual({
			provider: "openai-codex",
			model: "gpt-5.6-sol",
			effort: "ultra",
		});
	});

	test("places the native model and effort in the frame title", () => {
		const title = workbenchFrameTitle({
			projectId: "project-123",
			phase: "ready",
			model: "gpt-5.6-sol",
			effort: "ultra",
			collaborationMode: "manual",
			permissionMode: "manual",
			chatQueue: [],
			pendingApproval: null,
		});

		expect(title).toBe("🐙 WWW · project-123 · GPT-5.6-Sol · ultra · ready · Manual · Permission manual");
	});

	test("shows an animated current-activity rail while a native turn is working", () => {
		const indicator = workbenchActivityIndicator(workingSnapshot);

		expect(indicator?.frames.length).toBeGreaterThan(1);
		expect(indicator?.message).toBe("현재 디렉터리 구조를 직접 확인하겠습니다. ⟦esc⟧");
	});

	test("falls back to an immediate analysis label before native intent arrives", () => {
		const indicator = workbenchActivityIndicator({
			...workingSnapshot,
			chat: [{ role: "user", content: "응답해봐" }],
		});

		expect(indicator?.message).toBe("요청을 분석하는 중 ⟦esc⟧");
	});

	test("uses the public Native reasoning summary as the live activity label", () => {
		const indicator = workbenchActivityIndicator({
			...workingSnapshot,
			chat: [{ role: "user", content: "테마를 조정해줘" }],
			reasoningDraft: "raw reasoning hidden",
			reasoningSummaryDraft: "Planning semantic color token adjustments",
		});

		expect(indicator?.message).toBe("Planning semantic color token adjustments ⟦esc⟧");
	});

	test("shows approval as a paused turn instead of animated background work", () => {
		const indicator = workbenchActivityIndicator({
			...workingSnapshot,
			pendingApproval: { kind: "file-change" },
			chatQueue: [{ id: "queued-1" }, { id: "queued-2" }],
		});

		expect(indicator?.frames).toEqual(["⏸"]);
		expect(indicator?.message).toBe("승인 대기 · 현재 턴 일시중지 · 대기 메시지 2개는 승인 후 전송 ⟦esc⟧");
	});

	test("starts animating while the first user message is still being delivered", () => {
		const indicator = workbenchActivityIndicator({
			...workingSnapshot,
			phase: "ready",
			chat: [{ role: "user", content: "응답해봐", status: "streaming" }],
		});

		expect(indicator?.message).toBe("요청 전송 준비 중 ⟦esc⟧");
	});

	test("does not animate the current-activity rail after the turn completes", () => {
		expect(workbenchActivityIndicator({ ...workingSnapshot, phase: "ready" })).toBeNull();
	});

	test("clears an accepted chat and reports its message", () => {
		const accepted = { state: "accepted", commandId: "chat-1", message: "전송했습니다." } as const;
		expect(workbenchReceiptClearsComposer(accepted)).toBe(true);
		expect(workbenchReceiptNotice(accepted)).toBe("전송했습니다.");
	});

	test("clears a queued chat from the editor and reports its FIFO position", () => {
		const queued = { state: "queued", commandId: "chat-2", position: 2 } as const;
		expect(workbenchReceiptClearsComposer(queued)).toBe(true);
		expect(workbenchReceiptNotice(queued)).toBe("메시지를 대기열 2번에 추가했습니다.");
	});

	test("restores only rejected input", () => {
		const rejected = { state: "rejected", commandId: "chat-3", reason: "보낼 수 없습니다." } as const;
		expect(workbenchReceiptClearsComposer(rejected)).toBe(false);
		expect(workbenchReceiptNotice(rejected)).toBe("보낼 수 없습니다.");
	});

	test("points an uncertain native send to the explicit reconciliation command", () => {
		const uncertain = {
			state: "uncertain",
			commandId: "chat-4",
			reason: "Native turn/start 요청의 수신 여부를 확인할 수 없습니다.",
			resolution: "manual-reconcile",
		} as const;
		expect(workbenchReceiptClearsComposer(uncertain)).toBe(true);
		expect(workbenchReceiptNotice(uncertain)).toContain("/cancel로 서버 상태를 확인하세요");
	});
});

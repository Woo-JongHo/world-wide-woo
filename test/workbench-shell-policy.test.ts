import { describe, expect, test } from "bun:test";
import { stripTerminalSequences, type Component } from "@earendil-works/pi-tui";
import { renderLayoutFrame } from "@earendil-works/pi-tui/dist/layout.js";
import {
	createWorkbenchViewHost,
	workbenchActivityIndicator,
	workbenchFrameTitle,
	workbenchModelSettings,
	workbenchPaneNotice,
	workbenchReceiptClearsComposer,
	workbenchReceiptNotice,
	workbenchViewModeForCommand,
	workbenchViewModeCommand,
} from "../src/presentation/tui/workbench-shell";
import { RenderScheduler } from "../src/presentation/tui/render-scheduler";
import { workbenchApprovalIdentity, workbenchExternalMutationCandidates } from "../src/domain/workbench";
import { createDashboardLayout } from "../src/presentation/tui/dashboard-layout";
import { parseWorkbenchShellCommand, WORKBENCH_SLASH_COMMANDS } from "../src/presentation/tui/slash-commands";

const workingSnapshot = {
	phase: "working",
	pendingApproval: null,
	draft: "",
	reasoningDraft: "",
	chat: [
		{ role: "user", content: "현재 디렉터리 구조를 확인해줘" },
		{ role: "assistant", content: "현재 디렉터리 구조를 직접 확인하겠습니다." },
	],
	workFlow: { currentStepNumber: null, steps: [] },
} as const;

describe("native workbench shell receipt policy", () => {
	test("keeps completed T-notes separate from selected execution Trace and current Todo", () => {
		expect(workbenchPaneNotice("tnotes")).toContain("완료 질문 T-note");
		expect(workbenchPaneNotice("tnotes")).not.toContain("Trace");
		expect(workbenchPaneNotice("chat")).toContain("질문과 공개 응답");
		expect(workbenchPaneNotice("todo")).toContain("현재 Native Plan·Todo.md");
		expect(workbenchViewModeForCommand("monitor", { type: "pane.show", pane: "tnotes" })).toBe("dashboard");
		expect(workbenchViewModeForCommand("dashboard", { type: "activity.select", activityId: "activity-1" })).toBe("monitor");
		expect(workbenchViewModeForCommand("dashboard", { type: "trace.select", planItemId: "plan-1" })).toBe("monitor");
	});

	test("selects Trace by Todo planItemId and rejects mutable legacy Todo commands", () => {
		expect(parseWorkbenchShellCommand("/trace plan-item-17")).toEqual({
			type: "trace.select",
			planItemId: "plan-item-17",
		});
		for (const command of ["create 계획 :: 항목", "add now 항목", "detail item 항목", "start item", "complete item", "block item", "reopen item", "evidence latest"]) {
			expect(parseWorkbenchShellCommand(`/todo ${command}`)).toEqual({
				type: "error",
				message: "레거시 Todo.md는 읽기 전용 migration view입니다.",
			});
		}
		expect(WORKBENCH_SLASH_COMMANDS.find((command) => command.name === "todo")).toEqual({
			name: "todo",
			description: "레거시 Todo.md 읽기 전용 migration view",
		});
	});

	test("preserves ordered editor input while streaming frames remain coalesced", async () => {
		let now = 0;
		let renders = 0;
		let scheduled: (() => void) | undefined;
		let draft = "";
		const scheduler = new RenderScheduler(
			() => { renders += 1; },
			64,
			() => now,
			(callback) => {
				scheduled = callback;
				return 1 as unknown as ReturnType<typeof setTimeout>;
			},
			() => { scheduled = undefined; },
		);

		scheduler.request("streaming");
		for (const key of "빠른 입력") {
			scheduler.prioritizeInput();
			scheduler.request("streaming");
			draft += key;
			await Promise.resolve();
			now += 5;
		}

		expect(draft).toBe("빠른 입력");
		expect(renders).toBe(1);
		now = 64;
		scheduled?.();
		expect(renders).toBe(2);
	});

	test("binds an external mutation approval identity to the exact candidate payload", () => {
		const approval = {
			requestId: "approval-1",
			callbackId: "callback-1",
			kind: "command",
			refs: {},
			availableDecisions: ["accept"],
			params: {
				externalMutationCandidates: [{
					kind: "commit",
					target: "main",
					content: "승인 화면 추가",
					currentState: "2 files staged",
					scope: "staged files only",
					status: "pending",
					payload: { message: "승인 화면 추가", paths: ["src/a.ts", "test/a.test.ts"] },
				}],
			},
		} as const;
		const candidate = workbenchExternalMutationCandidates(approval)[0]!;
		expect(candidate.payload).toEqual({ message: "승인 화면 추가", paths: ["src/a.ts", "test/a.test.ts"] });
		expect(workbenchApprovalIdentity(approval)).not.toBe(workbenchApprovalIdentity({
			...approval,
			params: {
				externalMutationCandidates: [{ ...approval.params.externalMutationCandidates[0], payload: { message: "다른 커밋", paths: ["src/a.ts"] } }],
			},
		}));
	});

	test("routes dashboard and monitor to distinct local view modes", () => {
		expect(workbenchViewModeCommand("/dashboard")).toBe("dashboard");
		expect(workbenchViewModeCommand(" /monitor ")).toBe("monitor");
		expect(workbenchViewModeCommand("/monitor details")).toBeNull();
	});

	test("preserves dashboard layout viewports while switching views", () => {
		const text = (value: string): Component => ({
			invalidate: () => undefined,
			render: () => [value],
		});
		const dashboard = createDashboardLayout(
			() => "Dashboard",
			{ color: value => value, component: text("dashboard-chat") },
			{ color: value => value, component: text("dashboard-trace") },
			{ color: value => value, component: text("dashboard-todo") },
		);
		const monitor = createDashboardLayout(
			() => "Monitor",
			{ color: value => value, component: text("monitor-chat") },
			{ color: value => value, component: text("monitor-trace") },
			{ color: value => value, component: text("monitor-todo") },
		);
		let mode: "dashboard" | "monitor" = "dashboard";
		const host = createWorkbenchViewHost(() => mode, dashboard.component, monitor.component);

		let frame = renderLayoutFrame(host, 120, 24, () => undefined);
		expect(frame.primaryScrollView).toBe(dashboard.leftScroll);
		expect(stripTerminalSequences(frame.lines.join("\n"))).toContain("dashboard-chat");

		mode = "monitor";
		frame = renderLayoutFrame(host, 120, 24, () => undefined);
		expect(frame.primaryScrollView).toBe(monitor.leftScroll);
		expect(stripTerminalSequences(frame.lines.join("\n"))).toContain("monitor-chat");
	});

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

	test("names the model the running turn uses, not a selection that applies to the next one", () => {
		const title = workbenchFrameTitle({
			projectId: "project-123",
			phase: "working",
			model: "gpt-5.6-luna",
			activeModel: "gpt-5.6-sol",
			effort: "ultra",
			collaborationMode: "manual",
			permissionMode: "manual",
			chatQueue: [],
			pendingApproval: null,
		});

		expect(title).toContain("GPT-5.6-Sol");
		expect(title).not.toContain("Luna");
	});

	test("does not repeat an assistant chat sentence in the current-activity rail", () => {
		const indicator = workbenchActivityIndicator(workingSnapshot);

		expect(indicator?.frames.length).toBeGreaterThan(1);
		expect(indicator?.message).toBe("분석 · 요청을 읽고 첫 단계를 정하는 중");
		expect(indicator?.message).not.toContain("현재 디렉터리 구조를 직접 확인하겠습니다.");
		expect(indicator?.hint).toBe("Esc 중단");
	});

	test("falls back to an immediate analysis label before native intent arrives", () => {
		const indicator = workbenchActivityIndicator({
			...workingSnapshot,
			chat: [{ role: "user", content: "응답해봐" }],
		});

		expect(indicator?.message).toBe("분석 · 요청을 읽고 첫 단계를 정하는 중");
		expect(indicator?.message).not.toContain("esc");
	});

	test("shows the numbered current Native plan step", () => {
		const indicator = workbenchActivityIndicator({
			...workingSnapshot,
			workFlow: {
				currentStepNumber: 2,
				steps: [
					{ number: 1, title: "기준 확인" },
					{ number: 2, title: "입출력 UX 정리" },
					{ number: 3, title: "검증" },
				],
			},
		});

		expect(indicator?.message).toBe("단계 2/3 · 입출력 UX 정리");
	});

	test("adds the concrete live action to the current Native plan step", () => {
		const indicator = workbenchActivityIndicator({
			...workingSnapshot,
			liveActivity: {
				method: "item/commandExecution/outputDelta",
				kind: "tool",
			},
			workFlow: {
				currentStepNumber: 2,
				steps: [
					{ number: 1, title: "기준 확인" },
					{ number: 2, title: "입출력 UX 정리" },
					{ number: 3, title: "검증" },
				],
			},
		});

		expect(indicator?.message).toBe("단계 2/3 · 입출력 UX 정리 · Bash 명령 결과를 확인하는 중");
	});

	test("shows the concrete live action even when Native Plan is absent", () => {
		const indicator = workbenchActivityIndicator({
			...workingSnapshot,
			liveActivity: {
				method: "item/fileChange/outputDelta",
				kind: "file-change",
			},
		});

		expect(indicator?.message).toBe("실행 · Edit 변경을 반영하는 중");
		expect(indicator?.message).not.toBe("분석 · 요청을 읽고 첫 단계를 정하는 중");
	});

	test("keeps the completed plan visible while the final response is being prepared", () => {
		const indicator = workbenchActivityIndicator({
			...workingSnapshot,
			workFlow: {
				currentStepNumber: null,
				steps: [
					{ number: 1, title: "기준 확인" },
					{ number: 2, title: "입출력 UX 정리" },
					{ number: 3, title: "검증" },
				],
			},
		});

		expect(indicator?.message).toBe("마무리 · 3개 단계 결과를 정리하는 중");
	});

	test("keeps the current step while adding the public Native reasoning summary", () => {
		const indicator = workbenchActivityIndicator({
			...workingSnapshot,
			chat: [{ role: "user", content: "테마를 조정해줘" }],
			reasoningDraft: "raw reasoning hidden",
			reasoningSummaryDraft: "Planning semantic color token adjustments ⟦esc⟧",
			workFlow: {
				currentStepNumber: 1,
				steps: [{ number: 1, title: "테마 조정" }],
			},
		});

		expect(indicator?.message).toBe("단계 1/1 · 테마 조정 · 판단 · Planning semantic color token adjustments");
		expect(indicator?.message).not.toContain("raw reasoning hidden");
		expect(indicator?.message).not.toContain("⟦esc⟧");
	});

	test("keeps a no-plan live action visible alongside its public reasoning summary", () => {
		const indicator = workbenchActivityIndicator({
			...workingSnapshot,
			chat: [{ role: "user", content: "테스트를 실행해줘" }],
			reasoningDraft: "raw reasoning hidden",
			reasoningSummaryDraft: "회귀 범위를 확인하는 중",
			liveActivity: {
				method: "item/commandExecution/outputDelta",
				kind: "tool",
			},
		});

		expect(indicator?.message).toBe("실행 · Bash 명령 결과를 확인하는 중 · 판단 · 회귀 범위를 확인하는 중");
		expect(indicator?.message).not.toContain("raw reasoning hidden");
	});

	test("identifies response drafting without exposing partial output", () => {
		const indicator = workbenchActivityIndicator({
			...workingSnapshot,
			draft: "완성되지 않은 응답 본문",
			reasoningSummaryDraft: "최종 답변 구성 확정",
		});

		expect(indicator?.message).toBe("응답 · 결과를 작성하는 중");
		expect(indicator?.message).not.toContain("완성되지 않은 응답 본문");
	});

	test("shows approval as a paused turn instead of animated background work", () => {
		const indicator = workbenchActivityIndicator({
			...workingSnapshot,
			pendingApproval: { kind: "file-change" },
			chatQueue: [{ id: "queued-1" }, { id: "queued-2" }],
		});

		expect(indicator?.frames).toEqual(["⏸"]);
		expect(indicator?.message).toBe("승인 대기 · 현재 턴 일시중지 · 대기 메시지 2개는 승인 후 전송");
		expect(indicator?.hint).toBe("Esc 중단");
	});

	test("starts animating while the first user message is still being delivered", () => {
		const indicator = workbenchActivityIndicator({
			...workingSnapshot,
			phase: "ready",
			chat: [{ role: "user", content: "응답해봐", status: "streaming" }],
		});

		expect(indicator?.message).toBe("전송 · 요청을 Native Thread에 전달하는 중");
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

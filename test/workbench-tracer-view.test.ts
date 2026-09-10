import { describe, expect, test } from "bun:test";
import { stripTerminalSequences } from "@earendil-works/pi-tui";
import { WorkbenchTracerView } from "../src/adapters/inbound/tui/dashboard/workbench-tracer-view";
import { projectWorkFlow } from "../src/core/domain/work";
import type { WorkbenchSnapshot } from "../src/core/domain/work/workbench";
import type { PerformanceProjection } from "../src/core/domain/work/performance";
import type { NativeDelegatedTask, NativeDelegationProjection } from "../src/core/domain/work/delegation";

function performance(overrides: Partial<PerformanceProjection> = {}): PerformanceProjection {
	return {
		execution: { threadId: "thread-root", turnId: "turn-2", runId: "thread-root:turn-2" },
		workContext: null,
		request: { text: "계획 없이 성능을 점검해", activityId: "request-2" },
		state: "executing",
		verification: "not-verified",
		planProgress: null,
		lastObservation: { activityId: "tool-2", recordedAt: "2026-09-10T00:00:02.000Z", label: "commandExecution · completed", phase: "completed" },
		health: { observedRetries: 0, observedFailures: 0, unassociatedActivities: 0 },
		...overrides,
	};
}

function snapshot(overrides: Partial<WorkbenchSnapshot> = {}): WorkbenchSnapshot {
	return {
		projectId: "sample-project",
		revision: 1,
		journalSequence: 2,
		phase: "working",
		mcpServers: [],
		threadId: "thread-root",
		activeTurnId: "turn-2",
		activities: [],
		selectedActivityId: null,
		pendingApproval: null,
		chat: [],
		chatQueue: [],
		draft: "",
		reasoningDraft: "",
		liveActivity: null,
		workFlow: projectWorkFlow([]),
		tnotes: [],
		todo: null,
		actionResult: null,
		error: null,
		performance: performance(),
		...overrides,
	};
}

function render(value: WorkbenchSnapshot): string {
	return stripTerminalSequences(new WorkbenchTracerView(() => value).render(100).join("\n"));
}

function task(id: string, ref: string, status: NativeDelegatedTask["status"], taskText: string): NativeDelegatedTask {
	return { ref, id, attempt: 1, parentId: "thread-root", parentRef: null, role: id, status, task: taskText, model: "gpt-5.6-terra", reasoningEffort: "high", activities: [], result: status === "completed" ? "완료 증거" : null };
}

function delegation(turnId: string, itemId: string, delegated: NativeDelegatedTask): NativeDelegationProjection {
	return { sourceThreadId: "thread-root", turnId, activityIds: [`activity-${itemId}`], itemIds: [itemId], tasks: [delegated] };
}

describe("WorkbenchTracerView execution surface", () => {
	test("keeps a no-plan performance execution visible", () => {
		const output = render(snapshot());
		expect(output).toContain("독립 수행");
		expect(output).toContain("현재 · 수행 중");
		expect(output).toContain("계획 없이 성능을 점검해");
		expect(output).toContain("최근 관측 · commandExecution · completed");
	});

	test("shows an explicit assigned goal beside its no-plan execution", () => {
		const output = render(snapshot({ performance: performance({
			workContext: { goal: "응답 지연을 절반으로 줄인다", goalActivityId: "goal-1", threadId: "thread-root", turnId: "turn-2" },
		}) }));
		expect(output).toContain("맡긴 일 · 응답 지연을 절반으로 줄인다");
		expect(output).toContain("현재 · 수행 중");
	});

	test("renders observed health counters without inventing orphan-blocked state", () => {
		const output = render(snapshot({ performance: performance({
			health: { observedRetries: 2, observedFailures: 1, unassociatedActivities: 3 },
		}) }));
		expect(output).toContain("관측된 재시도 2 · 실패 1 · 미연결 3");
		expect(output).not.toContain("차단");
	});

	test("labels retry and orphan health as unconfirmed when no performance projection exists", () => {
		const output = render(snapshot({ performance: undefined, liveActivity: { method: "item/started", kind: "tool", text: "실행 중", nativeRefs: {} } }));
		expect(output).toContain("미연결 활동 0 · 재시도 관측 미확인");
		expect(output).not.toContain("관측된 재시도 0");
		expect(output).not.toContain("차단");
	});

	test("states that completion evidence remains unverified", () => {
		const output = render(snapshot());
		expect(output).toContain("검증 · 미검증");
		expect(output).not.toContain("검증 · 통과");
	});

	test("aggregates delegation across turns and renders the selected exact detail", () => {
		const first = task("agent-old", "thread-root:turn-1:agent-old:1", "completed", "이전 turn 조사");
		const selected = task("agent-current", "thread-root:turn-2:agent-current:1", "running", "현재 turn 검증");
		const output = render(snapshot({
			delegation: [delegation("turn-1", "spawn-old", first), delegation("turn-2", "spawn-current", selected)],
			selectedAgentRef: selected.ref,
			selectedAgentDetail: selected,
		}));
		expect(output).toContain("agent-old · completed");
		expect(output).toContain("agent-current · running");
		expect(output).toContain("이전 turn 조사");
		expect(output).toContain("현재 turn 검증");
		expect(output).toContain("Attempt: 1");
		expect(output).toContain("Result: 상세 관측 미지원/미수신");
	});
});

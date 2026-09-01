import { describe, expect, test } from "bun:test";
import type { ProjectActivity } from "../src/domain/project-activity";
import {
	classifyWorkActivity,
	projectWorkFlow,
	type WorkStepNarration,
} from "../src/domain/work-steps";

function activity(
	sequence: number,
	kind: ProjectActivity["kind"],
	phase: ProjectActivity["phase"],
	method: string,
	item: Readonly<Record<string, unknown>> = {},
): ProjectActivity {
	return {
		schemaVersion: 1,
		id: `activity-${sequence}`,
		projectId: "sample-project",
		sequence,
		recordedAt: new Date(Date.UTC(2026, 8, 1, 0, 0, sequence)).toISOString(),
		kind,
		phase,
		provider: "openai-codex",
		nativeRefs: { threadId: "thread-1", turnId: "turn-1", itemId: String(item.id ?? `item-${sequence}`) },
		sourceDigest: `sha256:${String(sequence).padStart(64, "0")}`,
		payload: { method, params: { item } },
	};
}

function planActivity(sequence: number, steps: readonly Readonly<Record<string, unknown>>[]): ProjectActivity {
	return {
		...activity(sequence, "progress", "updated", "turn/plan/updated"),
		payload: {
			method: "turn/plan/updated",
			params: { explanation: "Executor 흐름을 의미 단위로 정리합니다.", plan: steps },
		},
	};
}

function inTurn(source: ProjectActivity, turnId: string): ProjectActivity {
	return {
		...source,
		nativeRefs: { ...source.nativeRefs, turnId },
	};
}

describe("semantic work flow", () => {
	test("uses native plan steps while keeping Read commands as hidden evidence", () => {
		const activities: ProjectActivity[] = [
			{
				...activity(1, "message", "started", "user/message"),
				payload: { direction: "outbound", role: "user", text: "Executor와 Live T-notes를 구현해줘" },
			},
			planActivity(2, [
				{ step: "GJC Executor 색상 규칙 조사", status: "inProgress" },
				{ step: "WWW에 의미 Step 적용", status: "pending" },
			]),
			activity(3, "tool", "completed", "item/completed", {
				id: "read-1", type: "commandExecution", command: "rg -n 'toolPendingBg' src | head -20",
			}),
			planActivity(4, [
				{ step: "GJC Executor 색상 규칙 조사", status: "completed" },
				{ step: "WWW에 의미 Step 적용", status: "inProgress" },
			]),
			activity(5, "file-change", "completed", "item/completed", {
				id: "change-1", type: "fileChange", changes: [{ path: "src/work-step.ts", kind: "update" }],
			}),
		];

		const flow = projectWorkFlow(activities);

		expect(flow.goal).toBe("Executor와 Live T-notes를 구현해줘");
		expect(flow.steps.map((step) => [step.number, step.status, step.narration.what])).toEqual([
			[1, "completed", "GJC Executor 색상 규칙 조사"],
			[2, "running", "WWW에 의미 Step 적용"],
		]);
		expect(flow.steps[0]?.observationCount).toBe(1);
		expect(flow.steps[0]?.activityIds).toEqual([]);
		expect(flow.steps[1]?.activityIds).toEqual(["activity-5"]);
		expect(flow.completedCount).toBe(1);
		expect(flow.currentStepNumber).toBe(2);
	});

	test("projects only the latest turn when a resumed thread contains older plans", () => {
		const oldTurn = "turn-old";
		const currentTurn = "turn-current";
		const activities: ProjectActivity[] = [
			{
				...activity(1, "message", "completed", "user/message"),
				nativeRefs: { threadId: "thread-1", itemId: "user-old" },
				payload: { direction: "outbound", role: "user", text: "이전 요청" },
			},
			inTurn(activity(2, "progress", "started", "turn/started"), oldTurn),
			inTurn(planActivity(3, [
				{ step: "이전 단계 1", status: "completed" },
				{ step: "이전 단계 2", status: "inProgress" },
			]), oldTurn),
			inTurn(activity(4, "file-change", "completed", "item/completed", {
				id: "old-change", type: "fileChange", changes: [{ path: "src/old.ts", kind: "update" }],
			}), oldTurn),
			inTurn(activity(5, "progress", "completed", "turn/completed"), oldTurn),
			{
				...activity(6, "message", "completed", "user/message"),
				nativeRefs: { threadId: "thread-1", itemId: "user-current" },
				payload: { direction: "outbound", role: "user", text: "현재 요청" },
			},
			inTurn(activity(7, "progress", "started", "turn/started"), currentTurn),
			inTurn(planActivity(8, [
				{ step: "현재 단계 1", status: "completed" },
				{ step: "현재 단계 2", status: "inProgress" },
				{ step: "현재 단계 3", status: "pending" },
			]), currentTurn),
			inTurn(activity(9, "file-change", "completed", "item/completed", {
				id: "current-change", type: "fileChange", changes: [{ path: "src/current.ts", kind: "update" }],
			}), currentTurn),
		];

		const flow = projectWorkFlow(activities);

		expect(flow.goal).toBe("현재 요청");
		expect(flow.steps.map((step) => [step.id, step.status])).toEqual([
			["plan:turn-current:1", "completed"],
			["plan:turn-current:2", "running"],
			["plan:turn-current:3", "pending"],
		]);
		expect(flow.steps.flatMap((step) => step.activityIds)).toEqual(["activity-9"]);
	});

	test("does not show an older plan while the latest turn is still preparing its plan", () => {
		const activities: ProjectActivity[] = [
			{
				...activity(1, "message", "completed", "user/message"),
				nativeRefs: { threadId: "thread-1", itemId: "user-old" },
				payload: { direction: "outbound", role: "user", text: "이전 요청" },
			},
			inTurn(activity(2, "progress", "started", "turn/started"), "turn-old"),
			inTurn(planActivity(3, [
				{ step: "이전 단계", status: "completed" },
			]), "turn-old"),
			{
				...activity(4, "message", "completed", "user/message"),
				nativeRefs: { threadId: "thread-1", itemId: "user-current" },
				payload: { direction: "outbound", role: "user", text: "현재 요청" },
			},
			inTurn(activity(5, "progress", "started", "turn/started"), "turn-current"),
		];

		const flow = projectWorkFlow(activities);

		expect(flow.goal).toBe("현재 요청");
		expect(flow.steps).toEqual([]);
		expect(flow.summary).toBe("의미 있는 실행 단계를 기다리고 있습니다.");
	});

	test("starts a pending turn at the latest outbound message before a native turn id exists", () => {
		const activities: ProjectActivity[] = [
			{
				...activity(1, "message", "completed", "user/message"),
				nativeRefs: { threadId: "thread-1", itemId: "user-old" },
				payload: { direction: "outbound", role: "user", text: "이전 요청" },
			},
			inTurn(activity(2, "progress", "started", "turn/started"), "turn-old"),
			inTurn(planActivity(3, [
				{ step: "이전 단계", status: "inProgress" },
			]), "turn-old"),
			{
				...activity(4, "message", "started", "user/message"),
				nativeRefs: { threadId: "thread-1", itemId: "user-current" },
				payload: { direction: "outbound", role: "user", text: "현재 요청" },
			},
		];

		const flow = projectWorkFlow(activities);

		expect(flow.goal).toBe("현재 요청");
		expect(flow.steps).toEqual([]);
		expect(flow.summary).toBe("의미 있는 실행 단계를 기다리고 있습니다.");
	});

	test("excludes observation-only commands and deduplicates action item lifecycle", () => {
		const activities = [
			activity(1, "tool", "completed", "item/completed", {
				id: "read-1", type: "commandExecution", command: "sed -n '1,120p' src/app.ts",
			}),
			activity(2, "tool", "started", "item/started", {
				id: "test-1", type: "commandExecution", command: "bun test test/work-flow.test.ts",
			}),
			activity(3, "tool", "completed", "item/completed", {
				id: "test-1", type: "commandExecution", command: "bun test test/work-flow.test.ts", exitCode: 0,
			}),
		];

		const flow = projectWorkFlow(activities);

		expect(flow.steps).toHaveLength(1);
		expect(flow.steps[0]).toMatchObject({ status: "completed", activityIds: ["activity-2", "activity-3"] });
		expect(flow.observationCount).toBe(1);
	});

	test("keeps ambiguous or mutating shell commands visible", () => {
		expect(classifyWorkActivity(activity(1, "tool", "completed", "item/completed", {
			type: "commandExecution", command: "git diff --stat",
		}))).toBe("observation");
		expect(classifyWorkActivity(activity(2, "tool", "completed", "item/completed", {
			type: "commandExecution", command: "find . -name '*.tmp' -delete",
		}))).toBe("action");
		expect(classifyWorkActivity(activity(3, "tool", "completed", "item/completed", {
			type: "commandExecution", command: "cat input.txt > output.txt",
		}))).toBe("action");
	});

	test("projects model narration without letting it own step status", () => {
		const source = [activity(1, "file-change", "completed", "item/completed", {
			id: "change-1", type: "fileChange", changes: [{ path: "src/app.ts", kind: "update" }],
		})];
		const initial = projectWorkFlow(source);
		const narration: WorkStepNarration = {
			what: "Live T-notes가 읽을 의미 Step을 추가합니다.",
			why: "저수준 실행 기록과 사용자용 작업 흐름을 분리하기 위해서입니다.",
			inputSummary: ["src/app.ts의 Workbench snapshot 변경"],
			source: "model",
		};
		const narrated = projectWorkFlow(source, new Map([[initial.steps[0]!.id, narration]]));

		expect(narrated.steps[0]?.narration).toMatchObject({
			what: narration.what,
			why: narration.why,
			source: "model",
		});
		expect(narrated.steps[0]?.narration.inputSummary[0]).toContain("[redacted:local-path]");
		expect(narrated.steps[0]?.status).toBe("completed");
	});
});

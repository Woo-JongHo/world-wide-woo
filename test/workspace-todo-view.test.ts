import { describe, expect, test } from "bun:test";
import { stripTerminalSequences, visibleWidth } from "@earendil-works/pi-tui";
import type { ProjectActivity } from "../src/core/domain/execution/project-activity";
import type { WorkFlowProjection } from "../src/core/domain/work";
import type { TodoDocument } from "../src/core/domain/work/todos";
import { WorkspaceTodoView } from "../src/adapters/inbound/tui/dashboard/shared-dashboard-views";

function todo(items: TodoDocument["items"]): TodoDocument {
	return {
		version: 1,
		revision: 1,
		ownerSessionId: "session",
		storyId: null,
		title: "릴리스",
		items,
		updatedAt: "2026-08-31T00:00:00.000Z",
	};
}

const mixedTodo = todo([
	{ id: "pending", content: "한국어 pending 작업", status: "pending", evidenceIds: [], details: [] },
	{
		id: "active",
		content: "\u001B[31m진행 중인 아주 긴 작업\u001B[0m",
		status: "in_progress",
		evidenceIds: [],
		details: [
			{ id: "active-detail-1", content: "재현 완료", status: "completed", evidenceIds: ["proof"] },
			{ id: "active-detail-2", content: "캐시 구현", status: "in_progress", evidenceIds: [] },
			{ id: "active-detail-3", content: "검증 예정", status: "pending", evidenceIds: [] },
		],
	},
	{ id: "completed", content: "완료 작업", status: "completed", evidenceIds: ["proof"], details: [] },
	{ id: "blocked", content: "막힌 작업", status: "blocked", evidenceIds: [], details: [] },
]);

describe("WorkspaceTodoView", () => {
	test("distinguishes no plan from a plan still being prepared", () => {
		for (const document of [null, todo([])]) {
			const idle = stripTerminalSequences(new WorkspaceTodoView(() => document).render(70).join("\n"));
			expect(idle).toContain("현재 계획 없음");
			const waiting = stripTerminalSequences(new WorkspaceTodoView(
				() => document,
				() => ({ activeTurnId: "turn-1", activities: [], workFlow: emptyFlow() }),
			).render(70).join("\n"));
			expect(waiting).toContain("공개 계획을 기다리는 중");
			expect(waiting).not.toContain("0/0");
		}
	});

	test.each([30, 40, 70, 120])("wraps Korean and ANSI todo content safely within %i columns", (width) => {
		const output = new WorkspaceTodoView(() => mixedTodo).render(width);
		expect(output.every(line => visibleWidth(line) <= width)).toBe(true);
	});

	test("uses status markers without mixing project metadata or commands into Todo", () => {
		const output = new WorkspaceTodoView(() => mixedTodo).render(120).join("\n");
		expect(output).toContain("TODO 1/4 · 세부 1/3");
		expect(output).toContain("릴리스");
		expect(output).toContain("○ 한국어 pending 작업");
		expect(output).toContain("◉");
		expect(output).toContain("\u001B[31m진행 중인 아주 긴 작업\u001B[0m");
		expect(output).toContain("✓ 완료 작업");
		expect(output).toContain("◆ 막힌 작업");
		expect(output).toContain("├ ✓ 재현 완료");
		expect(output).toContain("├ ◉ 캐시 구현");
		expect(output).toContain("└ ○ 검증 예정");
		expect(output).not.toContain("프로젝트");
		expect(output).not.toContain("작업 위치");
		expect(output).not.toContain("/usage");
		expect(output).not.toContain("최근 세션");
		expect(output).not.toContain("Map");
		expect(output).not.toContain("Architecture");
		expect(output).not.toContain("T-Notes");
	});

	test("uses the active item rather than an earlier pending item in compact layout", () => {
		const output = new WorkspaceTodoView(() => mixedTodo).render(40).join("\n");
		expect(output).toContain("TODO 1/4 · 세부 1/3");
		expect(output).toContain("◉");
		expect(output).toContain("└ ◉ 캐시 구현");
		expect(output).not.toContain("○");
		expect(output).not.toContain("✓");
		expect(output).not.toContain("◆");
		expect(stripTerminalSequences(output)).toContain("3개 숨김");
	});

	test("shows observed root and parallel agent work beside the bound plan item", () => {
		const identity = "a".repeat(64);
		const revision = { sourceRevisionKeyDigest: "b".repeat(64), activityId: "plan", sequence: 1, sourceDigest: "sha256:plan" };
		const document: TodoDocument = {
			...todo([]),
			items: [{
				id: "native-item",
				content: "구현한다",
				status: "in_progress",
				evidenceIds: [],
				details: [],
				source: { kind: "native-plan-item", identity, originRevision: revision, currentRevision: revision, executions: [] },
			}],
			source: {
				kind: "native-plan",
				threadKeyDigest: "c".repeat(64),
				turnId: "turn-1",
				input: null,
				planRevision: revision,
				rootExecution: { provider: "openai-codex", model: "gpt-5.6-sol", agentId: null, threadId: "root", runId: "turn-1" },
			},
		};
		const activities: ProjectActivity[] = ["agent-a", "agent-b"].map((agentId, index) => ({
			schemaVersion: 1,
			id: `agent-activity-${index}`,
			projectId: "project",
			sequence: index + 2,
			recordedAt: "2026-09-07T00:00:00.000Z",
			kind: "progress",
			phase: "updated",
			provider: "codex",
			nativeRefs: { threadId: "root", turnId: "turn-1", itemId: `spawn-${index}` },
			sourceDigest: `sha256:${index}`,
			payload: { method: "item/updated", params: { item: {
				type: "collabAgentToolCall",
				receiverThreadIds: [agentId],
				prompt: index === 0 ? "코드 구현" : "검증",
				model: index === 0 ? "gpt-5.6-terra" : "gpt-5.6-luna",
				agentsStates: { [agentId]: { status: "running" } },
			} } },
		}));
		const workFlow: WorkFlowProjection = {
			...emptyFlow(),
			source: { kind: "native-plan-derived", expectedThreadKeyDigest: "c".repeat(64), turnId: "turn-1", currentRevision: revision, algorithm: "dplan-v1" },
			steps: [{
				id: identity,
				identity: { kind: "deterministic-derived", value: identity, originRevision: revision },
				currentRevision: revision,
				reconciliation: { kind: "minted", evidence: { kind: "mint", tokenDigest: identity, sourceRevisionOrdinal: 1, sourcePosition: 0 } },
				association: null,
				number: 1,
				title: "구현한다",
				status: "running",
				activityIds: activities.map((activity) => activity.id),
				observationCount: 2,
				narration: { what: "구현", inputSummary: [], source: "plan" },
			}],
		};
		const output = stripTerminalSequences(new WorkspaceTodoView(
			() => document,
			() => ({ activeTurnId: "turn-1", activities, workFlow, sync: { state: "syncing", lastConfirmedAt: null, message: null } }),
		).render(120).join("\n"));

		expect(output).toContain("주 실행 · gpt-5.6-sol · root · run turn-1");
		expect(output).toContain("gpt-5.6-terra · agent agent-a · 진행 중 · 코드 구현");
		expect(output).toContain("gpt-5.6-luna · agent agent-b · 진행 중 · 검증");
		expect(output).toContain("저장 동기화 중 · 대화는 계속됩니다");
	});
});

function emptyFlow(): WorkFlowProjection {
	return {
		source: null,
		retirements: [],
		orphans: [],
		rejections: [],
		goal: "",
		steps: [],
		completedCount: 0,
		currentStepNumber: null,
		observationCount: 0,
		summary: "",
	};
}

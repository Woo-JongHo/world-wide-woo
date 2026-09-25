import { describe, expect, test }               from "bun:test";
import { renderLayoutFrame }                    from "@earendil-works/pi-tui/dist/layout.js";
import type { LayoutBox }                       from "@earendil-works/pi-tui/dist/layout.js";
import { stripTerminalSequences, visibleWidth } from "@earendil-works/pi-tui";
import chalk                                    from "chalk";
import type { WorkbenchSnapshot }               from "../src/core/domain/work/workbench";
import { createDashboardLayout }                from "../src/adapters/inbound/tui/foundation/layout/dashboard-layout";
import { StatusLine, WorkspaceTodoView }        from "../src/adapters/inbound/tui/features/dashboard/shared-dashboard-views";
import { WorkbenchChatView }                    from "../src/adapters/inbound/tui/features/chat/workbench-views";
import { EntryDashboardView }                   from "../src/adapters/inbound/tui/features/dashboard/entry-dashboard-view";
import { TNotesSourceView }                     from "../src/adapters/inbound/tui/features/tnote/t-notes-source-view";
import { WorkbenchMonitorView }                 from "../src/adapters/inbound/tui/features/monitoring/workbench-monitor-view";
import { WorkbenchTracerView }                  from "../src/adapters/inbound/tui/features/trace/workbench-tracer-view";
import { boundedPublicProjection }              from "../src/adapters/inbound/tui/features/chat/bounded-public-projection";
import {
	approvalCardRows,
	projectApprovalBackgroundState,
} from "../src/adapters/inbound/tui/features/approval/approval-presentation";
import { projectWorkFlow }                      from "../src/core/domain/work";
import type { DplanHash }                       from "../src/core/domain/work";

export const hash: DplanHash = {
	sha256Hex: (input) => new Bun.CryptoHasher("sha256").update(input).digest("hex"),
};

export const approvalPresentation = {
	render(value: WorkbenchSnapshot, width: number): readonly string[] {
		return value.pendingApproval
			? approvalCardRows(value.pendingApproval, value.chatQueue.length, projectApprovalBackgroundState(value.activities), width)
			: [];
	},
};

export function fixtureWorkFlow(activities: WorkbenchSnapshot["activities"]) {
	const source = [...activities].reverse().find(activity =>
		(activity.payload.method === "turn/start" || activity.payload.method === "turn/started")
		&& activity.nativeRefs.threadId && activity.nativeRefs.turnId,
	) ?? [...activities].reverse().find(activity => activity.nativeRefs.threadId && activity.nativeRefs.turnId);
	const threadId = source?.nativeRefs.threadId
		?? activities.find(activity => activity.nativeRefs.threadId)?.nativeRefs.threadId
		?? "fixture-thread";
	const turnId = source?.nativeRefs.turnId ?? "fixture-turn";
	const hasPlan = activities.some(activity => activity.payload.method === "turn/plan/updated");
	const hasTurnStart = activities.some(activity =>
		activity.payload.method === "turn/start" || activity.payload.method === "turn/started",
	);
	const normalized = activities.map((activity, index) => ({
		...activity,
		sequence: index + (hasPlan ? 2 : 3),
		kind: !hasPlan && activity.kind === "tool" ? "file-change" as const : activity.kind,
		nativeRefs: {
			...activity.nativeRefs,
			threadId: activity.nativeRefs.threadId ?? threadId,
			turnId: activity.nativeRefs.turnId ?? turnId,
		},
	}));
	const sourceItem = activities.find(activity => activity.kind === "tool")?.payload.params as { item?: { tool?: string; status?: string } } | undefined        ;
	const title      = sourceItem?.item?.tool ? `${sourceItem.item.tool} 입력 해석 중` : "변경 결과 검증"                                                        ;
	const status     = sourceItem?.item?.status === "failed" ? "failed" : normalized.some(activity => activity.phase === "started") ? "inProgress" : "completed" ;
	const plan = hasPlan || hasTurnStart ? [] : [{
		...normalized[0]!,
		id: "fixture-plan",
		sequence: 2,
		kind: "progress" as const,
		phase: "updated" as const,
		nativeRefs: { threadId, turnId },
		payload: { method: "turn/plan/updated", params: { plan: [{ step: title, status: "inProgress" }] } },
	}];
	const finalPlan = hasPlan || hasTurnStart ? [] : [{
		...plan[0]!,
		id: "fixture-plan-final",
		sequence: normalized.length + 3,
		payload: { method: "turn/plan/updated", params: { plan: [{ step: title, status }] } },
	}];
	return projectWorkFlow([{
		...normalized[0]!,
		id         : "fixture-turn-start",
		sequence   : 1,
		kind       : "progress",
		phase      : "started",
		nativeRefs : { threadId, turnId },
		payload    : { method: "turn/started" },
	}, ...plan, ...normalized, ...finalPlan], new Map(), { expectedThreadKey: threadId, selectedTurnId: turnId, hash });
}
export const snapshot: WorkbenchSnapshot = {
	projectId       : "sample-project",
	revision        : 3,
	journalSequence : 1,
	phase           : "ready",
	mcpServers      : [],
	threadId        : "thread-1",
	activeTurnId    : null,
	activities: [{
		schemaVersion: 1,
		id: "activity-1",
		projectId: "sample-project",
		sequence: 1,
		recordedAt: "2026-09-01T00:00:00.000Z",
		kind: "message",
		phase: "completed",
		provider: "openai-codex",
		nativeRefs: { threadId: "thread-1", itemId: "message-1" },
		sourceDigest: `sha256:${"a".repeat(64)}`,
		payload: { text: "완료했습니다." },
	}],
	selectedActivityId: "activity-1",
	pendingApproval: null,
	chat: [{
		id: "message-1",
		role: "assistant",
		content: "완료했습니다.",
		activityId: "activity-1",
		status: "completed",
	}],
	chatQueue      : [],
	draft          : "",
	reasoningDraft : "",
	liveActivity   : null,
	workFlow       : projectWorkFlow([]),
	tnotes: [{
		id: "note-1",
		title: "결정 요약",
		summary: "질문: 결정 요약\n왜: 완료된 질문의 이유를 남깁니다.\n결과: Native 응답을 정리했습니다.",
		sourceActivityIds: ["activity-1"],
		updatedAt: "2026-09-01T00:00:01.000Z",
	}],
	todo         : null,
	actionResult : null,
	error        : null,
};

export function allScrollContent(box: LayoutBox): string[] {
	return [...(box.scrollContentLines ?? []), ...box.children.flatMap(allScrollContent)];
}

export function renderChatWithDashboard(value: WorkbenchSnapshot, width = 100): string {
	return stripTerminalSequences(new WorkbenchChatView(
		value,
		new EntryDashboardView(() => value.linearDashboard),
	).render(width).join("\n"));
}

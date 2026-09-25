import type { WorkbenchSnapshot } from "../../src/core/domain/work/workbench";
import type { ProjectActivity }   from "../../src/core/domain/execution/project-activity";
import { projectWorkFlow }        from "../../src/core/domain/work";

/** Synthetic screen fixture; no provider calls, credentials, filesystem mutation, or fabricated live metrics. */
export function astraFixture(phase: WorkbenchSnapshot["phase"] = "working"): WorkbenchSnapshot {
	const activities: ProjectActivity[] = [];
	const activity = (id: string, kind: ProjectActivity["kind"], state: ProjectActivity["phase"], payload: ProjectActivity["payload"], itemId = id): ProjectActivity => ({
		schemaVersion: 1, id, projectId: "astra-preview", sequence: activities.length + 1, recordedAt: `2026-09-11T09:42:${String(activities.length).padStart(2, "0")}.000Z`, kind, phase: state, provider: "openai-codex", nativeRefs: { threadId: "preview-thread", turnId: "preview-turn", itemId }, sourceDigest: `sha256:${"a".repeat(64)}`, payload,
	});
	activities.push(activity("request", "message", "completed", { role: "user", text: "세션 재개 시 작업 기록이 두 번 표시되는 문제를 수정해줘." }));
	activities.push(activity("turn", "progress", "started", { method: "turn/started" }));
	activities.push(activity("plan", "progress", "updated", { method: "turn/plan/updated", params: { plan: [{ step: "세션과 이벤트 결합 지점 확인", status: "completed" }, { step: "중복 이벤트 재현 및 경계 수정", status: "inProgress" }, { step: "재개 시나리오 회귀 검증", status: "pending" }] } }));
	activities.push(activity("tool-1", "tool", "completed", { method: "item/completed", params: { item: { type: "commandExecution", command: "rg -n 'resume|sequence' src/core", aggregatedOutput: "src/core/application/session/session-runtime.ts:42: resume\n관련 경계를 확인했습니다.", exitCode: 0 } } }));
	activities.push(activity("answer", "message", "completed", { role: "assistant", text: "기존 이벤트와 재개 이벤트가 같은 경로로 합쳐집니다.\n\n`sequence`를 기준으로 중복을 확인하고, 연결 경계를 좁히겠습니다." }));
	activities.push(activity("tool-2", "tool", phase === "working" ? "started" : "completed", { method: phase === "working" ? "item/started" : "item/completed", params: { item: { type: "commandExecution", command: "bun test test/session-resume.test.ts", aggregatedOutput: "resume boundary\n  ✓ 기존 기록 보존\n  ✓ 새 이벤트 한 번만 표시", ...(phase === "working" ? {} : { exitCode: 0 }) } } }));
	return {
		projectId: "astra-preview", revision: 1, journalSequence: activities.length, phase,
		model: "gpt-5.6-sol", effort: "high", contextUsage: { usedTokens: 28400, contextWindow: 200000, percent: 14.2 }, permissionMode: "manual", collaborationMode: "manual",
		mcpServers: [], threadId: "preview-thread", activeTurnId: phase === "working" ? "preview-turn" : null, activities,
		selectedActivityId: null, pendingApproval: null, chat: [
			{ id: "m1", activityId: "request", role: "user", content: String(activities[0]!.payload.text), status: "completed" },
			{ id: "m2", activityId: "answer", role: "assistant", content: String(activities[4]!.payload.text), status: "completed" },
		], chatQueue: [], draft: "", reasoningDraft: "", liveActivity: phase === "working" ? { kind: "tool", method: "commandExecution", text: "재개 시나리오를 테스트하는 중", nativeRefs: { threadId: "preview-thread", turnId: "preview-turn", itemId: "tool-2" } } : null,
		workFlow: projectWorkFlow(activities, new Map(), { expectedThreadKey: "preview-thread", selectedTurnId: "preview-turn", hash: { sha256Hex: value => new Bun.CryptoHasher("sha256").update(value).digest("hex") } }),
		tnotes: [], todo: null, actionResult: null, error: null,
	};
}

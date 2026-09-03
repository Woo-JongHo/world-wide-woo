import { describe, expect, test } from "bun:test";
import { projectRuntimeMonitor } from "../src/domain/runtime-monitor.js";
import type { ProjectActivity } from "../src/domain/project-activity.js";
import type { WorkbenchSnapshot } from "../src/domain/workbench.js";

function activity(sequence: number, method: string, options: Partial<ProjectActivity> & { payload?: Record<string, unknown> } = {}): ProjectActivity {
	return {
		schemaVersion: 1, id: `activity-${sequence}`, projectId: "project", sequence, recordedAt: `2026-09-04T00:00:${String(sequence).padStart(2, "0")}.000Z`, kind: "progress", phase: "started", provider: "test", nativeRefs: {}, sourceDigest: `sha256:${"a".repeat(64)}`,
		...options, payload: { method, ...options.payload },
	};
}
function snapshot(activities: readonly ProjectActivity[], patch: Partial<WorkbenchSnapshot> = {}): WorkbenchSnapshot {
	return { projectId: "project", revision: 1, journalSequence: activities.length, phase: "ready", mcpServers: [], threadId: null, activeTurnId: null, activities, selectedActivityId: null, pendingApproval: null, chat: [], chatQueue: [], draft: "", reasoningDraft: "", liveActivity: null, workFlow: {} as WorkbenchSnapshot["workFlow"], tnotes: [], todo: null, actionResult: null, error: null, ...patch };
}

describe("projectRuntimeMonitor", () => {
	test("projects idle deterministically", () => {
		const input = snapshot([]);
		expect(projectRuntimeMonitor(input)).toEqual(projectRuntimeMonitor(input));
		expect(projectRuntimeMonitor(input).state).toBe("idle");
	});
	test("reports a model-only execution as running", () => {
		const result = projectRuntimeMonitor(snapshot([activity(1, "turn/started", { payload: { model: "gpt-test" }, nativeRefs: { turnId: "turn" } })]));
		expect(result).toMatchObject({ state: "running", model: "gpt-test", currentTool: null });
	});
	test("reports a running tool before execution", () => {
		const result = projectRuntimeMonitor(snapshot([
			activity(1, "turn/started", { nativeRefs: { turnId: "turn" } }),
			activity(2, "item/started", { kind: "tool", nativeRefs: { itemId: "tool" }, payload: { params: { item: { tool: "shell" } } } }),
		]));
		expect(result).toMatchObject({ state: "running", currentTool: { label: "shell" } });
	});
	test("reports pending approval as blocked", () => {
		const approval = { requestId: "approval", callbackId: "callback", kind: "command", params: {} } as WorkbenchSnapshot["pendingApproval"];
		const result = projectRuntimeMonitor(snapshot([activity(1, "approval/requested", { kind: "approval" })], { pendingApproval: approval }));
		expect(result).toMatchObject({ state: "blocked", approval: { pending: true } });
	});
	test("counts retries", () => {
		const result = projectRuntimeMonitor(snapshot([activity(1, "request/retry"), activity(2, "retry/observed")]));
		expect(result.retryCount).toBe(2);
		expect(result.recentEvents.map(event => event.kind)).toEqual(["RETRY", "RETRY"]);
	});
	test("failure overrides all other observable state", () => {
		const result = projectRuntimeMonitor(snapshot([
			activity(1, "turn/started", { nativeRefs: { turnId: "turn" } }),
			activity(2, "item/failed", { kind: "tool", phase: "failed", nativeRefs: { itemId: "tool" } }),
		]));
		expect(result).toMatchObject({ state: "failed", failureCount: 1 });
	});
	test("reports completion after a completed turn", () => {
		const result = projectRuntimeMonitor(snapshot([activity(1, "turn/started", { nativeRefs: { turnId: "turn" } }), activity(2, "turn/completed", { phase: "completed", nativeRefs: { turnId: "turn" } })]));
		expect(result.state).toBe("completed");
	});
	test("bounds a semantic event burst to its latest twelve events", () => {
		const result = projectRuntimeMonitor(snapshot(Array.from({ length: 20 }, (_, index) => activity(index + 1, "request/started", { payload: { requestId: String(index) } }))));
		expect(result.recentEvents).toHaveLength(12);
		expect(result.recentEvents[0]?.activityId).toBe("activity-9");
		expect(result.recentEvents.at(-1)?.activityId).toBe("activity-20");
	});
});

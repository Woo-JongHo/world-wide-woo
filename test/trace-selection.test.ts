import { describe, expect, test } from "bun:test";
import type { ProjectActivity } from "../src/core/domain/execution/project-activity";
import {
	resolveTraceSelection,
	type TraceSelectionInput,
} from "../src/core/domain/work/trace-selection";
import type { WorkFlowProjection } from "../src/core/domain/work";

function activity(id: string, sequence: number, threadId: string, turnId: string, itemId: string): ProjectActivity {
	return {
		schemaVersion: 1,
		id,
		projectId: "project-1",
		sequence,
		recordedAt: `2026-09-07T00:00:0${sequence}.000Z`,
		kind: "tool",
		phase: "completed",
		provider: "openai-codex",
		nativeRefs: { threadId, turnId, itemId },
		sourceDigest: `sha256:${String(sequence).repeat(64).slice(0, 64)}`,
		payload: { method: "item/completed" },
	};
}

function flow(turnId: string, activityId: string, planItemId: string): WorkFlowProjection {
	return {
		source: {
			kind: "native-plan-derived",
			authority: "native-checklist",
			expectedThreadKeyDigest: "thread-digest",
			turnId,
			currentRevision: { sourceRevisionKeyDigest: "revision", activityId: `plan-${turnId}`, sequence: 1, sourceDigest: "digest" },
			algorithm: "dplan-v1",
		},
		retirements: [],
		orphans: [],
		rejections: [],
		goal: "fixture",
		steps: [{
			id: planItemId,
			identity: { kind: "deterministic-derived", value: planItemId, originRevision: { sourceRevisionKeyDigest: "origin", activityId: `plan-${turnId}`, sequence: 1, sourceDigest: "digest" } },
			currentRevision: { sourceRevisionKeyDigest: "revision", activityId: `plan-${turnId}`, sequence: 1, sourceDigest: "digest" },
			reconciliation: { kind: "minted", evidence: { kind: "mint", tokenDigest: "token", sourceRevisionOrdinal: 1, sourcePosition: 0 } },
			association: {
				attribution: "inferred",
				activityIds: [activityId],
				observationActivityIds: [],
				sources: [{ turnId, startSequence: 1, endSequence: null, activityIds: [activityId], observationActivityIds: [] }],
			},
			number: 1,
			title: "같은 제목",
			status: "completed",
			activityIds: [activityId],
			observationCount: 0,
			narration: { what: "fixture", inputSummary: [], source: "plan" },
		}],
		completedCount: 1,
		currentStepNumber: null,
		observationCount: 0,
		summary: "fixture",
	};
}

function input(overrides: Partial<TraceSelectionInput> = {}): TraceSelectionInput {
	const first = activity("activity-turn-1", 2, "thread-1", "turn-1", "same-item");
	return {
		activityId: first.id,
		activities: [first],
		currentThreadId: "thread-1",
		workFlow: flow("turn-1", first.id, "plan-item-1"),
		resumeCoverage: { mode: "fresh", processAttachedAt: "2026-09-07T00:00:00.000Z", priorProviderHistoryHydrated: false },
		...overrides,
	};
}

describe("WOO-705 trace selection identity", () => {
	// @linear WOO-705 4738e3c5-c5b3-4cc2-9cea-ff9bf600367d
	test("selects exact activity identities when different turns reuse one item id", () => {
		const first = activity("activity-turn-1", 2, "thread-1", "turn-1", "same-item");
		const second = activity("activity-turn-2", 5, "thread-1", "turn-2", "same-item");
		const activities = [first, second];

		const selectedFirst = resolveTraceSelection(input({ activityId: first.id, activities, workFlow: flow("turn-1", first.id, "plan-item-1") }));
		const selectedSecond = resolveTraceSelection(input({ activityId: second.id, activities, workFlow: flow("turn-2", second.id, "plan-item-2") }));

		expect(selectedFirst).toMatchObject({
			state: "selected",
			identity: { activityId: first.id, threadId: "thread-1", turnId: "turn-1", itemId: "same-item" },
			attribution: { identity: "observed", planAssociation: "inferred" },
		});
		expect(selectedSecond).toMatchObject({
			state: "selected",
			identity: { activityId: second.id, threadId: "thread-1", turnId: "turn-2", itemId: "same-item" },
		});
	});

	test("fails closed with structured coverage for invalid ids, partial journals, and execution mismatches", () => {
		const missing = resolveTraceSelection(input({ activityId: "missing" }));
		expect(missing).toMatchObject({ state: "failed", failure: { code: "activity_not_found", activityId: "missing" }, coverage: { mode: "fresh" } });

		const partial = resolveTraceSelection(input({
			activityId: "missing-before-resume",
			resumeCoverage: { mode: "partial-local-journal", processAttachedAt: "2026-09-07T00:00:00.000Z", priorProviderHistoryHydrated: false },
		}));
		expect(partial).toMatchObject({
			state: "failed",
			failure: { code: "outside_observed_journal" },
			coverage: {
				mode: "partial-local-journal",
				priorProviderHistoryHydrated: false,
				observedActivityCount: 1,
				observedSequenceFrom: 2,
				observedSequenceThrough: 2,
			},
		});

		const wrongTurn = activity("wrong-turn", 3, "thread-1", "turn-2", "same-item");
		const mismatched = resolveTraceSelection(input({
			activityId: wrongTurn.id,
			activities: [wrongTurn],
			workFlow: flow("turn-1", wrongTurn.id, "plan-item-1"),
		}));
		expect(mismatched).toMatchObject({
			state: "failed",
			failure: { code: "turn_mismatch", expected: { turnId: "turn-1" }, actual: { turnId: "turn-2", itemId: "same-item" } },
		});
	});
});

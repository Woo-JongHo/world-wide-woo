import { describe, expect, test } from "bun:test";
import {
	projectChatFeature,
	projectPlanFeature,
	projectTracerFeature,
} from "../src/core/application/orchestration/workbench-feature-reads";
import { wwwFixture }             from "./fixtures/www-snapshot";

describe("Workbench feature read projections", () => {
	test("Chat receives only semantic transcript state and preserves producer identities", () => {
		const snapshot   = wwwFixture("working")     ;
		const projection = projectChatFeature(snapshot) ;
		const allowedKeys = [
			"actionResult", "activeTurnId", "activities", "chat", "chatQueue", "deliveryUncertain",
			"delegation", "developmentRecordingError", "draft", "error", "executionRun", "journalSequence",
			"linearDashboard", "liveActivity", "pendingApproval", "performance", "phase", "planActivities",
			"planActivityStatus", "projectId", "reasoningDraft", "reasoningSummaryDraft", "requestRuntime",
			"selectedActivityId", "sessionGoal", "threadId", "tnotes", "workFlow",
		];

		expect(Object.keys(projection).every(key => allowedKeys.includes(key))).toBe(true);
		expect(Object.isFrozen(projection)).toBe(true);
		expect(projection.activities).toBe(snapshot.activities);
		expect(projection.chat).toBe(snapshot.chat);
		expect(projection.tnotes).toBe(snapshot.tnotes);
		expect("todo" in projection).toBe(false);
		expect("revision" in projection).toBe(false);
		expect("modelCatalog" in projection).toBe(false);
	});

	test("Chat streaming state settles under the same message identity without retaining a duplicate draft", () => {
		const streamingSnapshot = wwwFixture("working");
		const message = streamingSnapshot.chat.find(candidate => candidate.role === "assistant")
			?? streamingSnapshot.chat[0]!;
		const streaming = projectChatFeature({
			...streamingSnapshot,
			chat  : [{ ...message, role: "assistant", status: "streaming", content: "부분" }],
			draft : "부분",
		});
		const completed = projectChatFeature({
			...streamingSnapshot,
			chat  : [{ ...message, role: "assistant", status: "completed", content: "완료" }],
			draft : "",
		});

		expect(streaming.chat).toHaveLength(1);
		expect(completed.chat).toHaveLength(1);
		expect(completed.chat[0]?.id).toBe(streaming.chat[0]?.id);
		expect(completed.chat[0]?.status).toBe("completed");
		expect(completed.draft).toBe("");
		expect(streaming.chat[0]?.status).toBe("streaming");
		expect(streaming.draft).toBe("부분");
	});

	test("Plan receives only its semantic state and no terminal presentation details", () => {
		const projection = projectPlanFeature(wwwFixture("working"));

		const allowedKeys = [
			"activeTurnId",
			"chatQueue",
			"planActivities",
			"planActivityStatus",
			"requestRuntime",
			"workFlow",
		];
		expect(Object.keys(projection).every(key => allowedKeys.includes(key))).toBe(true);
		expect(Object.keys(projection)).toEqual(expect.arrayContaining(["activeTurnId", "chatQueue", "workFlow"]));
		expect(Object.isFrozen(projection)).toBe(true);
		expect("draft" in projection).toBe(false);
		expect("activities" in projection).toBe(false);
	});

	test("Tracer receives its narrow read contract without composer or terminal state", () => {
		const projection = projectTracerFeature(wwwFixture("working"));

		const allowedKeys = [
			"actionResult",
			"activeTurnId",
			"activities",
			"chat",
			"configurationSource",
			"delegation",
			"delegationDetailActivities",
			"evaluationRequired",
			"linearDashboard",
			"liveActivity",
			"performance",
			"recordingReadOnly",
			"selectedAgentDetail",
			"workFlow",
		];
		expect(Object.keys(projection).every(key => allowedKeys.includes(key))).toBe(true);
		expect(Object.keys(projection)).toContain("workFlow");
		expect(Object.isFrozen(projection)).toBe(true);
		expect("draft" in projection).toBe(false);
		expect("pendingApproval" in projection).toBe(false);
	});

	test("a later Snapshot creates new projections without changing prior feature reads", () => {
		const firstSnapshot = wwwFixture("working")               ;
		const firstChat     = projectChatFeature(firstSnapshot)   ;
		const firstPlan     = projectPlanFeature(firstSnapshot)   ;
		const firstTracer   = projectTracerFeature(firstSnapshot) ;
		const firstTitle    = firstPlan.workFlow.steps[0]?.title  ;
		const firstCount    = firstTracer.activities.length       ;
		const nextSnapshot   = {
			...firstSnapshot,
			activities: [],
			workFlow: {
				...firstSnapshot.workFlow,
				steps: [],
			},
		};

		const nextPlan   = projectPlanFeature(nextSnapshot)   ;
		const nextTracer = projectTracerFeature(nextSnapshot) ;
		const nextChat   = projectChatFeature(nextSnapshot)   ;

		expect(nextChat.activities).toHaveLength(0);
		expect(nextPlan.workFlow.steps).toHaveLength(0);
		expect(nextTracer.activities).toHaveLength(0);
		expect(firstPlan.workFlow.steps[0]?.title).toBe(firstTitle);
		expect(firstChat.activities).toHaveLength(firstCount);
		expect(firstTracer.activities).toHaveLength(firstCount);
	});
});

import { describe, expect, test } from "bun:test";
import type {
	ProjectActivity,
	ProjectActivityKind,
	ProjectActivityPhase,
} from "../src/core/domain/execution/project-activity";
import {
	boundCompletedTurnNoteActivities,
	questionForTurn,
	resolveCompletedTurnNoteScope,
} from "../src/core/application/work/completed-turn-note-scope";

function activity(input: {
	id: string;
	sequence: number;
	kind?: ProjectActivityKind;
	phase?: ProjectActivityPhase;
	threadId?: string;
	turnId?: string;
	itemId?: string;
	payload: Readonly<Record<string, unknown>>;
}): ProjectActivity {
	return {
		schemaVersion: 1,
		id: input.id,
		projectId: "project-1",
		sequence: input.sequence,
		recordedAt: new Date(1_700_000_000_000 + input.sequence).toISOString(),
		kind: input.kind ?? "progress",
		phase: input.phase ?? "updated",
		provider: "openai-codex",
		nativeRefs: {
			...(input.threadId ? { threadId: input.threadId } : {}),
			...(input.turnId ? { turnId: input.turnId } : {}),
			...(input.itemId ? { itemId: input.itemId } : {}),
		},
		sourceDigest: `sha256:${input.sequence.toString(16).padStart(64, "0")}`,
		payload: input.payload,
	};
}

function completedTurn(
	turnId: string,
	startSequence: number,
	question: string,
	threadId = "thread-1",
): ProjectActivity[] {
	return [
		activity({ id: `${turnId}-question`, sequence: startSequence, kind: "message", phase: "completed", threadId, itemId: "same-item", payload: { direction: "outbound", text: question } }),
		activity({ id: `${turnId}-start`, sequence: startSequence + 1, phase: "started", threadId, turnId, payload: { method: "turn/start" } }),
		activity({ id: `${turnId}-answer`, sequence: startSequence + 2, kind: "message", phase: "completed", threadId, turnId, itemId: "same-item", payload: { role: "assistant", text: "답" } }),
		activity({ id: `${turnId}-terminal`, sequence: startSequence + 3, phase: "completed", threadId, turnId, payload: { method: "turn/completed" } }),
	];
}

describe("completed turn note scope", () => {
	test("selects one completed turn and excludes interleaved foreign-thread activity", () => {
		const target = completedTurn("turn-1", 1, "무엇을 확인했나요?");
		const foreign = activity({ id: "foreign", sequence: 3, kind: "tool", threadId: "thread-2", turnId: "foreign-turn", payload: { method: "item/completed" } });
		const activities = [target[0]!, target[1]!, foreign, ...target.slice(2).map((item) => ({ ...item, sequence: item.sequence + 1 }))];
		const before = structuredClone(activities);

		const scope = resolveCompletedTurnNoteScope(activities, { type: "turn", turnId: "turn-1" });
		expect(scope?.question).toBe("무엇을 확인했나요?");
		expect(scope?.activities.map((item) => item.id)).toEqual([
			"turn-1-question", "turn-1-start", "turn-1-answer", "turn-1-terminal",
		]);
		expect(activities).toEqual(before);
	});

	test("rejects incomplete, cross-turn, reversed, and non-owning question scopes", () => {
		const full = completedTurn("turn-1", 1, "질문");
		expect(resolveCompletedTurnNoteScope(full.slice(0, -1), { type: "turn", turnId: "turn-1" })).toBeNull();

		const crossTurn = full.map((item) => item.id.endsWith("terminal")
			? { ...item, nativeRefs: { ...item.nativeRefs, turnId: "turn-2" } }
			: item);
		expect(resolveCompletedTurnNoteScope(crossTurn, { type: "turn", turnId: "turn-1" })).toBeNull();

		const reversed = full.map((item) => item.id.endsWith("answer") ? { ...item, sequence: 1 } : item);
		expect(resolveCompletedTurnNoteScope(reversed, { type: "turn", turnId: "turn-1" })).toBeNull();

		const foreignQuestion = [
			{ ...full[0]!, nativeRefs: { ...full[0]!.nativeRefs, threadId: "thread-2" } },
			...full.slice(1),
		];
		expect(resolveCompletedTurnNoteScope(foreignQuestion, { type: "turn", turnId: "turn-1" })).toBeNull();
	});

	test("latest chooses the most recent valid completion", () => {
		const first = completedTurn("turn-1", 1, "첫 질문");
		const second = completedTurn("turn-2", 5, "둘째 질문");
		const scope = resolveCompletedTurnNoteScope([...first, ...second], { type: "latest" });
		expect(scope?.question).toBe("둘째 질문");
		expect(scope?.activities.at(-1)?.id).toBe("turn-2-terminal");
	});

	test("finds the owning question despite a foreign outbound question and repeated item id", () => {
		const target = completedTurn("turn-1", 1, "소유 질문");
		const foreign = activity({ id: "foreign-question", sequence: 2, kind: "message", phase: "completed", threadId: "thread-2", itemId: "same-item", payload: { direction: "outbound", text: "다른 질문" } });
		const shifted = target.slice(1).map((item) => ({ ...item, sequence: item.sequence + 1 }));
		const activities = [target[0]!, foreign, ...shifted];

		expect(questionForTurn(activities, "turn-1")).toBe("소유 질문");
		expect(resolveCompletedTurnNoteScope(activities, { type: "turn", turnId: "turn-1" })?.question).toBe("소유 질문");
	});

	test("exact-selection accepts only the complete ordered source set", () => {
		const full = completedTurn("turn-1", 1, "질문");
		expect(resolveCompletedTurnNoteScope(full, { type: "exact-selection" })?.activities).toHaveLength(4);
		const extra = activity({ id: "foreign", sequence: 3.5, threadId: "thread-2", turnId: "foreign", payload: { method: "item/completed" } });
		expect(resolveCompletedTurnNoteScope([...full.slice(0, 3), extra, full[3]!], { type: "exact-selection" })).toBeNull();
		expect(resolveCompletedTurnNoteScope([...full].reverse(), { type: "exact-selection" })).toBeNull();
	});

	test("deterministically samples long turns while preserving both boundaries", () => {
		const activities = Array.from({ length: 205 }, (_, index) => activity({
			id: `activity-${index + 1}`,
			sequence: index + 1,
			kind: index === 180 ? "message" : undefined,
			phase: index === 180 ? "completed" : undefined,
			threadId: "thread-1",
			turnId: "turn-1",
			payload: index === 180 ? { role: "assistant", text: "최종 응답" } : { method: `event-${index + 1}` },
		}));
		const before = structuredClone(activities);
		const sampled = boundCompletedTurnNoteActivities(activities, 100);

		expect(sampled).toHaveLength(100);
		expect(sampled.slice(0, 2).map((item) => item.id)).toEqual(["activity-1", "activity-2"]);
		expect(sampled.at(-1)?.id).toBe("activity-205");
		expect(sampled.map((item) => item.id)).toContain("activity-181");
		expect(sampled.map((item) => item.sequence)).toEqual([...sampled.map((item) => item.sequence)].sort((left, right) => left - right));
		expect(sampled.some((item) => item.sequence > 90 && item.sequence < 115)).toBe(true);
		expect(activities).toEqual(before);
		expect(Object.isFrozen(sampled)).toBe(true);
	});

	test("normalizes, redacts, and bounds the question without mutating its activity", () => {
		const question = `  password=scope-secret   ${"긴 질문 ".repeat(300)} https://user:url-secret@example.com/end  `;
		const activities = completedTurn("turn-1", 1, question);
		const before = structuredClone(activities);
		const result = questionForTurn(activities, "turn-1") ?? "";

		expect(result.length).toBeLessThanOrEqual(800);
		expect(result).not.toContain("scope-secret");
		expect(result).not.toContain("url-secret");
		expect(result).not.toMatch(/\s{2,}/u);
		expect(activities).toEqual(before);
	});
});

import { describe, expect, test } from "bun:test";
import type { ProjectActivity } from "../src/domain/project-activity";
import { type DplanHash, DplanIdentityCollisionError, projectWorkFlow } from "../src/domain/work-steps";

const hash: DplanHash = {
	sha256Hex: (input) => new Bun.CryptoHasher("sha256").update(input).digest("hex"),
};
const input = { expectedThreadKey: "thread-1", selectedTurnId: "turn-1", hash };
function activity(
	sequence: number,
	method: string,
	payload: Record<string, unknown> = {},
	refs: Record<string, string> = {},
): ProjectActivity {
	return {
		schemaVersion: 1,
		id: `a-${sequence}`,
		projectId: "p",
		sequence,
		recordedAt: "2026-09-01T00:00:00.000Z",
		kind: method === "item/completed" ? "file-change" : "progress",
		phase: "completed",
		provider: "native",
		nativeRefs: { threadId: "thread-1", turnId: "turn-1", ...refs },
		sourceDigest: `sha256:${String(sequence).padStart(64, "0")}`,
		payload: { method, ...payload },
	};
}
function plan(sequence: number, entries: readonly Record<string, unknown>[], refs: Record<string, string> = {}) {
	return activity(sequence, "turn/plan/updated", { params: { plan: entries } }, refs);
}
function start() {
	return activity(1, "turn/started");
}
function flow(entries: readonly Record<string, unknown>[]) {
	return projectWorkFlow([start(), plan(2, entries)], new Map(), input);
}

describe("dplan-v1", () => {
	test("retains unique insert delete and reorder without index identity", () => {
		const base = [
			start(),
			plan(2, [{ step: "A", status: "inProgress" }, { step: "B", status: "pending" }]),
			plan(3, [{ step: "B", status: "pending" }, { step: "A", status: "inProgress" }, { step: "C", status: "pending" }]),
			plan(4, [{ step: "A", status: "inProgress" }, { step: "C", status: "pending" }]),
		];
		const result = projectWorkFlow(base, new Map(), input);
		expect(result.steps.map((s) => s.title)).toEqual(["A", "C"]);
		expect(result.steps[0]!.reconciliation.kind).toBe("retained");
		expect(result.retirements).toHaveLength(1);
	});
	test("fails closed for duplicate/status and redaction collapse", () => {
		const duplicate = projectWorkFlow(
			[
				start(),
				plan(2, [{ step: "same", status: "inProgress" }, { step: "same", status: "pending" }]),
				plan(3, [{ step: "same", status: "pending" }, { step: "same", status: "inProgress" }]),
			],
			new Map(),
			input,
		);
		expect(duplicate.steps.every((s) => s.reconciliation.kind === "minted")).toBe(true);
		expect(duplicate.retirements.length).toBe(2);
		const collapsed = projectWorkFlow(
			[start(), plan(2, [{ step: "/secret/a", status: "inProgress" }]), plan(3, [{ step: "/secret/b", status: "inProgress" }])],
			new Map(),
			input,
		);
		expect(collapsed.steps[0]!.reconciliation.kind).toBe("minted");
	});
	test("allows one bounded unique edit but rejects multi-edit and replacement", () => {
		const edit = projectWorkFlow(
			[start(), plan(2, [{ step: "compile source", status: "inProgress" }]), plan(3, [{ step: "compile sources", status: "inProgress" }])],
			new Map(),
			input,
		);
		expect(edit.steps[0]!.reconciliation.evidence.kind).toBe("isolated_edit");
		const multi = projectWorkFlow(
			[
				start(),
				plan(2, [{ step: "alpha", status: "inProgress" }, { step: "beta", status: "pending" }]),
				plan(3, [{ step: "gamma", status: "inProgress" }, { step: "delta", status: "pending" }]),
			],
			new Map(),
			input,
		);
		expect(multi.retirements[0]!.reason).toBe("replacement");
	});
	test("orphans pre-plan and zero, one, or multiple running actions", () => {
		const action = (n: number) => activity(n, "item/completed", { params: { item: {} } });
		const result = projectWorkFlow(
			[
				start(),
				action(2),
				plan(3, [{ step: "A", status: "pending" }]),
				action(4),
				plan(5, [{ step: "A", status: "inProgress" }]),
				action(6),
				plan(7, [{ step: "A", status: "inProgress" }, { step: "B", status: "inProgress" }]),
				action(8),
			],
			new Map(),
			input,
		);
		expect(result.orphans.map((x) => x.reason)).toEqual(["pre_plan", "no_unambiguous_running_item", "no_unambiguous_running_item"]);
		expect(result.steps[0]!.activityIds).toEqual(["a-6"]);
	});
	test("preserves each inferred activity's plan revision interval", () => {
		const action = (n: number, refs: Record<string, string> = {}) =>
			activity(n, "item/completed", { params: { item: {} } }, refs);
		const result = projectWorkFlow(
			[
				start(),
				plan(2, [{ step: "A", status: "inProgress" }]),
				action(3),
				// The equal-status revision is a new monotonic interval; its action
				// remains attributable, while the parallel boundary is fail-closed.
				plan(4, [{ step: "A", status: "inProgress" }]),
				action(5),
				plan(6, [{ step: "A", status: "inProgress" }, { step: "B", status: "inProgress" }]),
				action(7),
				action(8, { turnId: "other" }),
			],
			new Map(),
			input,
		);
		expect(result.steps[0]!.association).toEqual({
			attribution: "inferred",
			activityIds: ["a-3", "a-5"],
			observationActivityIds: [],
			sources: [
				{
					turnId: "turn-1",
					startSequence: 2,
					endSequence: 4,
					activityIds: ["a-3"],
					observationActivityIds: [],
				},
				{
					turnId: "turn-1",
					startSequence: 4,
					endSequence: 6,
					activityIds: ["a-5"],
					observationActivityIds: [],
				},
			],
		});
		expect(result.steps[0]!.activityIds).toEqual(["a-3", "a-5"]);
		expect(result.orphans.map((orphan) => [orphan.activityId, orphan.reason])).toEqual([
			["a-7", "no_unambiguous_running_item"],
			["a-8", "source_mismatch"],
		]);
	});
	test("keeps boundary and equal-status revision attribution in monotonic intervals", () => {
		const action = (n: number) =>
			activity(n, "item/completed", { params: { item: {} } });
		const result = projectWorkFlow(
			[
				start(),
				plan(2, [{ step: "A", status: "inProgress" }]),
				action(3),
				plan(4, [{ step: "A", status: "inProgress" }]),
				action(5),
			],
			new Map(),
			input,
		);
		expect(result.steps[0]!.association?.sources).toEqual([
			{
				turnId: "turn-1",
				startSequence: 2,
				endSequence: 4,
				activityIds: ["a-3"],
				observationActivityIds: [],
			},
			{
				turnId: "turn-1",
				startSequence: 4,
				endSequence: null,
				activityIds: ["a-5"],
				observationActivityIds: [],
			},
		]);
	});
	test("halts at integrity prefix and gives revision precedence to source mismatch", () => {
		const bad = { ...plan(3, [{ step: "X", status: "inProgress" }]), id: "a-2" };
		const integrity = projectWorkFlow(
			[start(), plan(2, [{ step: "A", status: "inProgress" }]), bad, plan(4, [{ step: "Z", status: "inProgress" }])],
			new Map(),
			input,
		);
		expect(integrity.rejections).toMatchObject([{ kind: "journal_integrity", code: "duplicate_activity_id" }]);
		expect(integrity.steps[0]!.title).toBe("A");
		const foreign = projectWorkFlow(
			[
				start(),
				plan(2, [{ step: "A", status: "inProgress" }]),
				plan(3, [{ step: "X", status: "inProgress" }], { turnId: "foreign" }),
				activity(4, "item/completed", { params: { item: {} } }, { threadId: "foreign" }),
			],
			new Map(),
			input,
		);
		expect(foreign.rejections[0]).toMatchObject({ code: "source_turn_mismatch" });
		expect(foreign.orphans[0]!.reason).toBe("source_mismatch");
		expect(foreign.steps[0]!.title).toBe("A");
	});
	test("leaves malformed plans to Layer B instead of registering revision collisions", () => {
		const collide: DplanHash = { sha256Hex: () => "0".repeat(64) };
		const malformed = { ...plan(3, [{ step: " " }, {}]), id: "a-3", sourceDigest: `sha256:${"3".padStart(64, "0")}` };
		const result = projectWorkFlow([start(), plan(2, [{ step: "A", status: "inProgress" }]), malformed], new Map(), {
			...input,
			hash: collide,
		});
		expect(result.rejections).toEqual([{ kind: "revision", code: "non_string_entry", activityId: "a-3", sequence: 3 }]);
	});
	test("is replay deterministic and detects injected full digest collisions", () => {
		const source = [start(), plan(2, [{ step: "A", status: "inProgress" }])];
		expect(projectWorkFlow(source, new Map(), input)).toEqual(projectWorkFlow(source, new Map(), input));
		const collision: DplanHash = { sha256Hex: () => "0".repeat(64) };
		expect(() =>
			projectWorkFlow([start(), plan(2, [{ step: "A", status: "inProgress" }, { step: "B", status: "pending" }])], new Map(), {
				...input,
				hash: collision,
			})
		).toThrow(DplanIdentityCollisionError);
	});
	test("transfers every associated activity to a retirement orphan", () => {
		const observation = { ...activity(3, "item/completed", { params: { item: { command: "pwd" } } }), kind: "tool" as const };
		const result = projectWorkFlow(
			[start(), plan(2, [{ step: "A", status: "inProgress" }]), activity(3, "item/completed", { params: { item: {} } }), {
				...observation,
				sequence: 4,
				id: "a-4",
				sourceDigest: `sha256:${"4".padStart(64, "0")}`,
			}, plan(5, [])],
			new Map(),
			input,
		);
		expect(result.retirements[0]).toMatchObject({ reason: "deleted" });
		expect(result.orphans).toEqual(expect.arrayContaining([
			expect.objectContaining({
				activityId: "a-3",
				activityKind: "action",
				reason: "deleted",
				priorIdentity: result.retirements[0]!.identity.value,
				currentRevision: result.retirements[0]!.retiredBy,
			}),
			expect.objectContaining({
				activityId: "a-4",
				activityKind: "observation",
				reason: "deleted",
				priorIdentity: result.retirements[0]!.identity.value,
				currentRevision: result.retirements[0]!.retiredBy,
			}),
		]));
	});
	test("attributes mixed unmatched regions per item before transferring orphans", () => {
		const action = (n: number) => activity(n, "item/completed", { params: { item: {} } });
		const result = projectWorkFlow(
			[
				start(),
				plan(2, [{ step: "compile source", status: "inProgress" }, { step: "legacy task", status: "pending" }]),
				action(3),
				plan(4, [{ step: "compile source", status: "completed" }, { step: "legacy task", status: "inProgress" }]),
				action(5),
				plan(6, [{ step: "compile sources", status: "completed" }, { step: "replacement task", status: "inProgress" }]),
			],
			new Map(),
			input,
		);
		expect(result.retirements.map((retirement) => retirement.reason)).toEqual(["ambiguous_edit", "replacement"]);
		expect(result.orphans.map((orphan) => [orphan.activityId, orphan.reason])).toEqual([["a-3", "ambiguous_edit"], ["a-5", "replacement"]]);
	});
	test("treats duplicate token transitions as ambiguous and transfers each association once", () => {
		const action = (n: number) => activity(n, "item/completed", { params: { item: {} } });
		const observation = (n: number) => ({
			...activity(n, "item/completed", { params: { item: { command: "pwd" } } }),
			kind: "tool" as const,
		});
		const oneToTwo = projectWorkFlow(
			[
				start(),
				plan(2, [{ step: "A", status: "inProgress" }]),
				action(3),
				observation(4),
				plan(5, [{ step: "A", status: "inProgress" }, { step: "A", status: "pending" }]),
			],
			new Map(),
			input,
		);
		expect(oneToTwo.retirements.map((retirement) => retirement.reason)).toEqual(["ambiguous_duplicate"]);
		expect(oneToTwo.orphans.map((orphan) => [orphan.activityId, orphan.reason])).toEqual([["a-3", "ambiguous_duplicate"], [
			"a-4",
			"ambiguous_duplicate",
		]]);
		const twoToOne = projectWorkFlow(
			[
				start(),
				plan(2, [{ step: "A", status: "inProgress" }, { step: "A", status: "pending" }]),
				plan(3, [{ step: "A", status: "inProgress" }]),
			],
			new Map(),
			input,
		);
		expect(twoToOne.retirements.map((retirement) => retirement.reason)).toEqual(["ambiguous_duplicate", "ambiguous_duplicate"]);
		const twoToTwo = projectWorkFlow(
			[
				start(),
				plan(2, [{ step: "A", status: "inProgress" }, { step: "A", status: "pending" }]),
				plan(3, [{ step: "A", status: "inProgress" }, { step: "A", status: "pending" }]),
			],
			new Map(),
			input,
		);
		expect(twoToTwo.retirements.map((retirement) => retirement.reason)).toEqual(["ambiguous_duplicate", "ambiguous_duplicate"]);
	});
	test("does not use public labels, display status, or positions as identity evidence", () => {
		const collapsed = projectWorkFlow(
			[start(), plan(2, [{ step: "/secret/a", status: "inProgress" }]), plan(3, [{ step: "/secret/b", status: "completed" }])],
			new Map(),
			input,
		);
		expect(collapsed.steps[0]!.reconciliation.kind).toBe("minted");
		const nfkc = projectWorkFlow(
			[start(), plan(2, [{ step: "Ａ", status: "pending" }]), plan(3, [{ step: "A", status: "completed" }])],
			new Map(),
			input,
		);
		expect(nfkc.steps[0]!.reconciliation).toMatchObject({ kind: "retained", evidence: { kind: "exact_unique" } });
	});
	test("uses the selected turn's outbound request as the public goal", () => {
		const message = {
			...activity(1, "message"),
			kind: "message" as const,
			payload: { method: "message", direction: "outbound", text: "선택된 목표" },
			sourceDigest: `sha256:${"1".padStart(64, "0")}`,
		};
		const result = projectWorkFlow(
			[
				message,
				{ ...start(), sequence: 2, id: "a-2", sourceDigest: `sha256:${"2".padStart(64, "0")}` },
				plan(3, [{ step: "A", status: "inProgress" }]),
			],
			new Map(),
			input,
		);
		expect(result.goal).toBe("선택된 목표");
	});
	test("requires the selected turn start to match the expected thread", () => {
		const foreignStart = { ...start(), nativeRefs: { threadId: "foreign", turnId: "turn-1" } };
		const localPlan = plan(2, [{ step: "A", status: "inProgress" }]);
		const result = projectWorkFlow([foreignStart, localPlan], new Map(), input);

		expect(result.source).toBeNull();
		expect(result.steps).toEqual([]);
	});
	test("does not take a later foreign-turn message as the selected turn goal", () => {
		const selectedGoal = {
			...activity(1, "message"),
			kind: "message" as const,
			payload: { method: "message", direction: "outbound", text: "선택된 목표" },
		};
		const selectedStart = { ...start(), sequence: 2, id: "a-2", sourceDigest: `sha256:${"2".padStart(64, "0")}` };
		const foreignGoal = {
			...activity(4, "message", {}, { turnId: "foreign" }),
			kind: "message" as const,
			payload: { method: "message", direction: "outbound", text: "다른 turn 목표" },
		};
		const result = projectWorkFlow(
			[selectedGoal, selectedStart, plan(3, [{ step: "A", status: "inProgress" }]), foreignGoal],
			new Map(),
			input,
		);

		expect(result.goal).toBe("선택된 목표");
	});
	test("uses only the selected turn's preceding outbound request and sanitizes it", () => {
		const earlier = {
			...activity(1, "message"),
			kind: "message" as const,
			payload: { method: "message", direction: "outbound", text: "/private/secret" },
			sourceDigest: `sha256:${"1".padStart(64, "0")}`,
		};
		const selectedStart = { ...start(), sequence: 2, id: "a-2", sourceDigest: `sha256:${"2".padStart(64, "0")}` };
		const selectedPlan = plan(3, [{ step: "A", status: "inProgress" }]);
		const foreignStart = {
			...start(),
			sequence: 4,
			id: "a-4",
			nativeRefs: { threadId: "thread-1", turnId: "turn-2" },
			sourceDigest: `sha256:${"4".padStart(64, "0")}`,
		};
		const sensitive = {
			...activity(5, "message"),
			kind: "message" as const,
			payload: { method: "message", direction: "outbound", text: "/private/secret" },
			sourceDigest: `sha256:${"5".padStart(64, "0")}`,
		};
		const result = projectWorkFlow([earlier, selectedStart, selectedPlan, foreignStart, sensitive], new Map(), input);
		expect(result.goal).not.toContain("/private/secret");
		expect(result.goal).toContain("[redacted:local-path]");
	});
	test("keeps same-turn lifecycle markers and foreign boundaries inside the selected interval", () => {
		const repeated = { ...start(), sequence: 3, id: "a-3", sourceDigest: `sha256:${"3".padStart(64, "0")}` };
		const foreign = {
			...start(),
			sequence: 4,
			id: "a-4",
			nativeRefs: { threadId: "foreign", turnId: "foreign-turn" },
			sourceDigest: `sha256:${"4".padStart(64, "0")}`,
		};
		const result = projectWorkFlow(
			[
				start(),
				plan(2, [{ step: "A", status: "inProgress" }]),
				repeated,
				foreign,
				plan(5, [{ step: "A", status: "inProgress" }]),
				activity(6, "item/completed", { params: { item: {} } }),
			],
			new Map(),
			input,
		);
		expect(result.source).toMatchObject({ turnId: "turn-1" });
		expect(result.steps[0]).toMatchObject({ status: "running", activityIds: ["a-6"] });
		expect(result.orphans).toEqual([]);
	});
});

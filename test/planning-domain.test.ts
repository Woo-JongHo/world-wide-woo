import { describe, expect, test } from "bun:test";
import { createPlanningSnapshot, sanitizePlanningText } from "../src/domain/planning";

const createdAt = "2026-08-31T11:24:24.000Z";
const epic = { id: "EP-010", title: "Planning", goal: "Keep intent", createdAt };

describe("Planning domain", () => {
	test("redacts credentials and removes terminal or Markdown injection", () => {
		const raw = "\u001b[31m<!-- hide --> token=secret sk-abcdefgh12345678 ghp_abcdefgh12345678 AIzaabcdefghijklmnopqrstuvwxyz12345\nnext";
		const safe = sanitizePlanningText(raw, 500);
		expect(safe).not.toContain("\u001b");
		expect(safe).not.toContain("<!--");
		expect(safe).not.toContain("secret");
		expect(safe).not.toContain("sk-");
		expect(safe).not.toContain("ghp_");
		expect(safe).not.toContain("AIza");
		expect(safe).toContain("next");
	});

	test("accepts backward same-Epic supersede and freezes the snapshot", () => {
		const snapshot = createPlanningSnapshot(3, [epic], [
			{ id: "ST-010-01", epicId: "EP-010", title: "Old", acceptance: "A", createdAt, supersedes: null },
			{ id: "ST-010-02", epicId: "EP-010", title: "New", acceptance: "B", createdAt, supersedes: "ST-010-01" },
		]);
		expect(snapshot.stories[1]?.supersedes).toBe("ST-010-01");
		expect(Object.isFrozen(snapshot)).toBe(true);
		expect(Object.isFrozen(snapshot.stories)).toBe(true);
		expect(Object.isFrozen(snapshot.stories[0]!)).toBe(true);
	});

	test("rejects missing parents, forward supersedes, and mismatched IDs", () => {
		expect(() => createPlanningSnapshot(1, [], [
			{ id: "ST-010-01", epicId: "EP-010", title: "No parent", acceptance: "A", createdAt, supersedes: null },
		])).toThrow("parent epic");
		expect(() => createPlanningSnapshot(3, [epic], [
			{ id: "ST-010-01", epicId: "EP-010", title: "Forward", acceptance: "A", createdAt, supersedes: "ST-010-02" },
			{ id: "ST-010-02", epicId: "EP-010", title: "Target", acceptance: "B", createdAt, supersedes: null },
		])).toThrow("supersedes relation");
		expect(() => createPlanningSnapshot(1, [epic], [
			{ id: "ST-011-01", epicId: "EP-010", title: "Wrong", acceptance: "A", createdAt, supersedes: null },
		])).toThrow("does not match epic");
	});
});

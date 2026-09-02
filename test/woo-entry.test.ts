import { describe, expect, test } from "bun:test";
import { WooEntry, type WooEntryCollector } from "../src/application/woo-entry";

const payload = {
	status: { branch: "main" },
	git: { head: "abc" },
	authority: { writer_id: "woo" },
	signals: [{ kind: "stale-revision" }],
	nextActions: [{ id: "WI-1" }],
};
describe("WooEntry", () => {
	test("merges stable policy and untrusted snapshot without losing turn fields", async () => {
		const entry = new WooEntry({ collect: async () => ({ source: { root: "/wes", runner: "hooks/wes_entry.py" }, payload }) });
		await entry.refresh();
		const turn = entry.prepareTurn({ threadId: "t", text: "hi", approvalPolicy: "on-request", additionalContext: { existing: { kind: "application", value: "keep" } } });
		expect(turn.approvalPolicy).toBe("on-request");
		expect(turn.additionalContext?.existing?.value).toBe("keep");
		expect(turn.additionalContext?.woo_entry_policy?.kind).toBe("application");
		expect(turn.additionalContext?.woo_entry_snapshot?.kind).toBe("untrusted");
		expect(turn.additionalContext?.woo_entry_snapshot?.value).toContain("stale-revision");
	});
	test("coalesces concurrent refresh and atomically replaces ready state with blocked", async () => {
		let calls = 0;
		let fail = false;
		const collector: WooEntryCollector = { collect: async () => { calls++; if (fail) throw new Error("runner failed"); return { source: { root: "/wes", runner: "hooks/wes_entry.py" }, payload }; } };
		const entry = new WooEntry(collector);
		await Promise.all([entry.refresh(), entry.refresh()]);
		expect(calls).toBe(1);
		fail = true;
		await entry.refresh();
		expect(entry.snapshot).toMatchObject({ state: "blocked", reason: "runner failed" });
	});

	test("blocks an oversize payload and still prepares a safe turn context", async () => {
		const entry = new WooEntry({ collect: async () => ({ source: { root: "/wes", runner: "hooks/wes_entry.py" }, payload: { ...payload, status: { huge: "x".repeat(4_000) } } }) });
		await entry.refresh();
		expect(entry.snapshot).toMatchObject({ state: "blocked" });
		expect(() => entry.prepareTurn({ threadId: "t", text: "hi" })).not.toThrow();
		expect(entry.prepareTurn({ threadId: "t", text: "hi" }).additionalContext?.woo_entry_snapshot?.value).toContain("blocked");
	});
});

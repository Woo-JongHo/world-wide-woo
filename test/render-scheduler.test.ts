import { describe, expect, test } from "bun:test";
import { RenderScheduler, workbenchRenderUrgency } from "../src/presentation/tui/render-scheduler";

describe("RenderScheduler", () => {
	test("coalesces in-turn native deltas but flushes durable and terminal updates", () => {
		const working = { phase: "working", journalSequence: 7 } as const;
		expect(workbenchRenderUrgency(working, { phase: "working", journalSequence: 7 })).toBe("streaming");
		expect(workbenchRenderUrgency(working, { phase: "working", journalSequence: 8 })).toBe("immediate");
		expect(workbenchRenderUrgency(working, { phase: "ready", journalSequence: 7 })).toBe("immediate");
	});

	test("coalesces token deltas to a 64ms trailing render", () => {
		let now = 0;
		let renders = 0;
		let scheduled: (() => void) | undefined;
		let scheduledDelay = -1;
		const scheduler = new RenderScheduler(
			() => { renders += 1; },
			64,
			() => now,
			(callback, delay) => {
				scheduled = callback;
				scheduledDelay = delay;
				return 1 as unknown as ReturnType<typeof setTimeout>;
			},
			() => { scheduled = undefined; },
		);

		scheduler.request("streaming");
		expect(renders).toBe(1);
		now = 10;
		scheduler.request("streaming");
		now = 20;
		scheduler.request("streaming");
		expect(renders).toBe(1);
		expect(scheduledDelay).toBe(54);

		now = 64;
		scheduled?.();
		expect(renders).toBe(2);
	});

	test("flushes terminal state immediately and cancels a stale timer", () => {
		let now = 0;
		let renders = 0;
		let cancelled = 0;
		const scheduler = new RenderScheduler(
			() => { renders += 1; },
			64,
			() => now,
			() => 1 as unknown as ReturnType<typeof setTimeout>,
			() => { cancelled += 1; },
		);

		scheduler.request("streaming");
		now = 5;
		scheduler.request("streaming");
		scheduler.request("immediate");
		expect(renders).toBe(2);
		expect(cancelled).toBe(1);

		scheduler.dispose();
		scheduler.request("immediate");
		expect(renders).toBe(2);
	});
});

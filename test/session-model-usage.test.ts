import { describe, expect, test } from "bun:test";
import { SessionModelUsageAccumulator } from "../src/application/session-model-usage";

describe("SessionModelUsageAccumulator", () => {
	test("aggregates detached model calls and publishes immutable session snapshots", () => {
		const usage = new SessionModelUsageAccumulator();
		let notifications = 0;
		const unsubscribe = usage.subscribe(() => { notifications += 1; });

		usage.observe({ model: "gpt-5.6-luna", effort: null, totalTokens: 1_200 });
		usage.observe({ model: "gpt-5.6-luna", effort: null, totalTokens: 800 });
		usage.observe({ model: "claude-opus-5", effort: null, totalTokens: 3_000 });

		expect(usage.snapshot).toEqual([
			{ model: "claude-opus-5", effort: null, turns: 1, totalTokens: 3_000 },
			{ model: "gpt-5.6-luna", effort: null, turns: 2, totalTokens: 2_000 },
		]);
		expect(Object.isFrozen(usage.snapshot)).toBe(true);
		expect(notifications).toBe(3);
		unsubscribe();
		usage.observe({ model: "gpt-5.6-luna", effort: null, totalTokens: 100 });
		expect(notifications).toBe(3);
	});

	test("rejects invalid observations rather than guessing token usage", () => {
		const usage = new SessionModelUsageAccumulator();
		expect(() => usage.observe({ model: "", effort: null, totalTokens: 1 })).toThrow("model");
		expect(() => usage.observe({ model: "gpt-5.6-luna", effort: null, totalTokens: Number.NaN })).toThrow("tokens");
	});
});

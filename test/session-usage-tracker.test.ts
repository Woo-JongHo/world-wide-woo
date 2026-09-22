import { expect, test } from "bun:test";
import { SessionUsageTracker } from "../src/core/application/session/session-usage-tracker";

test.each([0, 12_000, 28_000, 128_400, 240_000])("context occupancy uses the complete native window: %s", usedTokens => {
	const tracker = new SessionUsageTracker();
	tracker.observe({ type: "notification", method: "thread/tokenUsage/updated", refs: { threadId: "thread", turnId: "turn" }, params: { tokenUsage: { last: { totalTokens: usedTokens }, modelContextWindow: 200_000 } } }, "thread", "turn");
	expect(tracker.contextUsage).toEqual({ usedTokens, contextWindow: 200_000, percent: Math.min(100, Math.round(usedTokens / 200_000 * 1_000) / 10) });
});

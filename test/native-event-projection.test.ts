import { describe, expect, test }                  from "bun:test";
import type { NativeHarnessEvent }                 from "../src/core/domain/execution/native-session";
import { nativeTurnLifecycle, projectNativeEvent } from "../src/core/application/orchestration/native-event-projection";

describe("native event projection", () => {
	test("redacts completed reasoning while retaining only a bounded public summary", () => {
		const event: NativeHarnessEvent = {
			type   : "notification",
			method : "item/completed",
			refs   : { threadId: "thread-1", turnId: "turn-1", itemId: "reasoning-1" },
			params: {
				item: {
					type    : "reasoning",
					summary : ["Public planning summary"],
					content : ["private chain of thought"],
				},
			},
		};
		const before = structuredClone(event);
		const projection = projectNativeEvent(event);

		expect(projection).toMatchObject({
			type: "durable",
			observation: {
				kind: "progress",
				phase: "completed",
				payload: {
					classification : "reasoning",
					redacted       : true,
					publicSummary  : "Public planning summary",
				},
			},
			assistantMessage: false,
		});
		expect(JSON.stringify(projection)).not.toContain("private chain of thought");
		expect(event).toEqual(before);
	});

	test("bounds and sanitizes oversized nested Native evidence", () => {
		let nested: Record<string, unknown> = {
			text: `password=native-secret\n${"x".repeat(40_000)}\nhttps://user:url-secret@example.com/end`,
		};
		for (let depth = 0; depth < 10; depth += 1) nested = { child: nested };
		const projection = projectNativeEvent({
			type   : "notification",
			method : "item/completed",
			refs   : { threadId: "thread-1", turnId: "turn-1", itemId: "command-1" },
			params : { item: { type: "commandExecution", output: nested }, many: Array.from({ length: 200 }, (_, index) => index) },
		});

		expect(projection.type).toBe("durable");
		if (projection.type !== "durable") return;
		expect(projection.observation.payload.observationTruncated).toBe(true);
		const serialized = JSON.stringify(projection.observation.payload);
		expect(serialized).not.toContain("native-secret");
		expect(serialized).not.toContain("url-secret");
		expect(serialized).toContain("[journal observation omitted]");
	});

	test.each([
		[{ status: "completed" }, "completed"],
		[{ status: { type: "failed" } }, "failed"],
		[{ status: { type: "cancelled" } }, "cancelled"],
	] as const)("maps nested turn completion status %o to %s", (turn, phase) => {
		const projection = projectNativeEvent({
			type   : "notification",
			method : "turn/completed",
			refs   : { threadId: "thread-1", turnId: "turn-1" },
			params : { turn },
		});
		expect(projection.type).toBe("durable");
		if (projection.type !== "durable") return;
		expect(projection.observation.phase).toBe(phase);
		expect(projection.lifecycle).toBe("terminal");
	});

	test.each([
		["userMessage", false],
		["alienMessage", false],
		["agentMessage", true],
	] as const)("classifies %s assistant ownership conservatively", (type, assistantMessage) => {
		const projection = projectNativeEvent({
			type   : "notification",
			method : "item/completed",
			refs   : { threadId: "thread-1", turnId: "turn-1", itemId: "message-1" },
			params : { item: { type, text: "content" } },
		});
		expect(projection).toMatchObject({ type: "durable", assistantMessage });
	});

	test.each([
		["item/agentMessage/delta", { item: { type: "agentMessage" }, delta: "answer" }, "assistant", "message"],
		["item/reasoning/textDelta", { delta: "private" }, "reasoning", "progress"],
		["item/reasoning/summaryTextDelta", { delta: "public" }, "reasoning-summary", "progress"],
		["item/commandExecution/outputDelta", { delta: "output" }, "activity", "tool"],
	] as const)("projects %s through the delta channel matrix", (method, params, channel, activityKind) => {
		const projection = projectNativeEvent({
			type: "notification",
			method,
			refs: { threadId: "thread-1", turnId: "turn-1", itemId: "item-1" },
			params,
		});
		expect(projection).toMatchObject({ type: "delta", channel, activityKind });
	});

	test("exposes Native turn lifecycle independently for restored activities", () => {
		expect(nativeTurnLifecycle("turn/started")).toBe("started");
		expect(nativeTurnLifecycle("turn/interrupted")).toBe("terminal");
		expect(nativeTurnLifecycle("item/completed")).toBeNull();
	});
});

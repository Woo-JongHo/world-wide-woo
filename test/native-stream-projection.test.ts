import { describe, expect, test }             from "bun:test";
import { NativeStreamProjection }             from "../src/core/application/orchestration/native-stream-projection.js";
import type { NativeTerminalProjectionScope } from "../src/core/application/orchestration/native-stream-projection.js";
import type { NativeEventDeltaProjection }    from "../src/core/application/orchestration/native-event-projection.js";

function delta(
	channel: NativeEventDeltaProjection["channel"],
	text: string,
	turnId = "turn-1",
	itemId = "item-1",
): NativeEventDeltaProjection {
	return {
		type   : "delta",
		method : `${channel}/delta`,
		refs   : { threadId: "thread-1", turnId, itemId },
		text,
		channel,
		activityKind: channel === "assistant" ? "message" : "progress",
	};
}

function terminalScope(turnId: string): NativeTerminalProjectionScope {
	return {
		itemScoped        : false,
		completedIdentity : null,
		terminalTurn      : true,
		refs              : { threadId: "thread-1", turnId },
	};
}

describe("NativeStreamProjection", () => {
	test("keeps assistant and reasoning channels separate", () => {
		const projection = new NativeStreamProjection();
		expect(projection.apply(delta("assistant", "공개 답변"))).toBe(true);
		expect(projection.apply(delta("reasoning-summary", "공개 추론 요약", "turn-1", "reasoning-1"))).toBe(true);

		expect(projection.snapshot).toMatchObject({
			draft                 : "공개 답변",
			reasoningDraft        : "",
			reasoningSummaryDraft : "공개 추론 요약",
		});
	});

	test("clears only the terminal turn owner", () => {
		const projection = new NativeStreamProjection();
		projection.apply(delta("assistant", "진행 중"));

		projection.clearTerminal(terminalScope("turn-2"));
		expect(projection.snapshot.draft).toBe("진행 중");

		projection.clearTerminal(terminalScope("turn-1"));
		expect(projection.snapshot.draft).toBe("");
		expect(projection.snapshot.draftNativeRefs).toBeNull();
	});

	test("rejects an ownerless delta instead of creating volatile state", () => {
		const projection = new NativeStreamProjection();
		const event = { ...delta("assistant", "unowned"), refs: { threadId: "thread-1" } };

		expect(projection.apply(event)).toBe(false);
		expect(projection.snapshot.draft).toBe("");
	});
});

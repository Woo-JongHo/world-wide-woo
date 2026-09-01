import { describe, expect, test } from "bun:test";
import type {
	Api,
	AssistantMessage,
	AssistantMessageEventStream,
	Context,
	Model,
	ModelsSimpleStreamOptions,
} from "@earendil-works/pi-ai";
import type { ActivityNarrationRequest } from "../src/application/activity-narrator";
import {
	ACTIVITY_NARRATOR_MODEL,
	ACTIVITY_NARRATOR_PROVIDER,
	PiActivityNarrator,
	type PiActivityNarratorModels,
} from "../src/infrastructure/pi-activity-narrator";

const model = {} as Model<Api>;
const request: ActivityNarrationRequest = {
	goal: "Executor 실행 흐름을 읽기 쉽게 만든다.",
	stepTitle: "변경 결과 검증",
	inputSummary: ["command: bun test test/work-flow.test.ts"],
};

function response(text: string, stopReason: AssistantMessage["stopReason"] = "stop"): AssistantMessage {
	return { role: "assistant", content: [{ type: "text", text }], stopReason } as AssistantMessage;
}

describe("PiActivityNarrator", () => {
	test("uses the smallest Codex model with no tools and a bounded structured result", async () => {
		let requestedModel: { provider: string; id: string } | undefined;
		let dispatched: { context: Context; options?: ModelsSimpleStreamOptions } | undefined;
		const models: PiActivityNarratorModels = {
			getModel(provider, id) {
				requestedModel = { provider, id };
				return model;
			},
			streamSimple(_model, context, options) {
				dispatched = { context, options };
				return {
					result: async () => response(JSON.stringify({
						what: "의미 Step 변경에 대한 회귀 테스트를 실행합니다.",
						why: "Read 제외와 단계 상태 계산이 유지되는지 확인하기 위해서입니다.",
						inputSummary: ["work-flow 관련 테스트"],
					})),
				} as AssistantMessageEventStream;
			},
		};

		const result = await new PiActivityNarrator(models).narrate(request);

		expect(requestedModel).toEqual({ provider: ACTIVITY_NARRATOR_PROVIDER, id: ACTIVITY_NARRATOR_MODEL });
		expect(dispatched?.options).toMatchObject({ toolChoice: "none", reasoning: "minimal", maxTokens: 240 });
		expect(dispatched?.context.tools).toEqual([]);
		expect(result).toEqual({
			what: "의미 Step 변경에 대한 회귀 테스트를 실행합니다.",
			why: "Read 제외와 단계 상태 계산이 유지되는지 확인하기 위해서입니다.",
			inputSummary: ["work-flow 관련 테스트"],
		});
	});

	test("rejects malformed output instead of inventing a narration", async () => {
		const models: PiActivityNarratorModels = {
			getModel: () => model,
			streamSimple: () => ({ result: async () => response("명령 실행입니다.") }) as AssistantMessageEventStream,
		};

		await expect(new PiActivityNarrator(models).narrate(request)).rejects.toThrow("구조화된 narration");
	});
});

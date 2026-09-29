import { describe, expect, test }        from "bun:test";
import type {
	Api,
	AssistantMessage,
	AssistantMessageEventStream,
	Context,
	Model,
	ModelsSimpleStreamOptions,
} from "@earendil-works/pi-ai";
import type { ActivityNarrationRequest } from "../src/core/application/orchestration/activity-narrator";
import {
	ACTIVITY_NARRATOR_MODEL,
	ACTIVITY_NARRATOR_PROVIDER,
	PiActivityNarrator,
} from "../src/adapters/outbound/execution/pi-activity-narrator";
import type { PiActivityNarratorModels } from "../src/adapters/outbound/execution/pi-activity-narrator";

const model = {} as Model<Api>;
const request: ActivityNarrationRequest = {
	goal         : "Executor 실행 흐름을 읽기 쉽게 만든다.",
	stepTitle    : "변경 결과 검증",
	inputSummary : ["command: bun test test/work-flow.test.ts"],
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
				dispatched = { context, ...(options === undefined ? {} : { options }) };
				return {
					result: async () => response(JSON.stringify({
						what         : "의미 Step 변경에 대한 회귀 테스트를 실행합니다.",
						why          : "Read 제외와 단계 상태 계산이 유지되는지 확인하기 위해서입니다.",
						inputSummary : ["work-flow 관련 테스트"],
					})),
				} as AssistantMessageEventStream;
			},
		};

		const result = await new PiActivityNarrator(models).narrate(request);

		expect(requestedModel           ).toEqual      ({ provider: ACTIVITY_NARRATOR_PROVIDER, id: ACTIVITY_NARRATOR_MODEL }) ;
		expect(dispatched?.options      ).toMatchObject({ toolChoice: "none", reasoning: "minimal", maxTokens: 240 }         ) ;
		expect(dispatched?.context.tools).toEqual      ([]                                                                   ) ;
		expect(result).toEqual({
			what         : "의미 Step 변경에 대한 회귀 테스트를 실행합니다.",
			why          : "Read 제외와 단계 상태 계산이 유지되는지 확인하기 위해서입니다.",
			inputSummary : ["work-flow 관련 테스트"],
		});
	});

	test("rejects malformed output instead of inventing a narration", async () => {
		const models: PiActivityNarratorModels = {
			getModel: () => model,
			streamSimple: () => ({ result: async () => response("명령 실행입니다.") }) as AssistantMessageEventStream,
		};

		await expect(new PiActivityNarrator(models).narrate(request)).rejects.toThrow("구조화된 narration");
	});

	test("interprets shell actions with a separate AI prompt from Plan progress", async () => {
		let prompt = "";
		let input = "";
		const models: PiActivityNarratorModels = {
			getModel: () => model,
			streamSimple: (_model, context) => {
				prompt = context.systemPrompt ?? "";
				input = String(context.messages[0]?.content);
				return { result: async () => response(JSON.stringify({ what: "설정 파일의 연관 코드를 찾습니다.", inputSummary: [] })) } as AssistantMessageEventStream;
			},
		};
		const result = await new PiActivityNarrator(models).narrate({ ...request, kind: "tool-action", inputSummary: ["/bin/zsh -lcr 'rg -n config src'"] });
		expect(prompt).toContain("Chat의 도구 행동");
		expect(prompt).not.toContain("stepTitle은 PLAN 항목");
		expect(input).toContain('"kind":"tool-action"');
		expect(result.what).toBe("설정 파일의 연관 코드를 찾습니다.");
	});

	test("test actions ask the model for the behavior checked by observed test names", async () => {
		let prompt = "";
		const models: PiActivityNarratorModels = {
			getModel: () => model,
			streamSimple: (_model, context) => {
				prompt = context.systemPrompt ?? "";
				return { result: async () => response(JSON.stringify({ what: "입력 경로를 확인합니다.", inputSummary: [] })) } as AssistantMessageEventStream;
			},
		};
		await new PiActivityNarrator(models).narrate({ ...request, kind: "test-action", inputSummary: ["bun test · 입력 경로를 유지한다 · exit 0"] });
		expect(prompt).toContain("관측된 테스트 이름");
		expect(prompt).toContain("빠진 테스트나 커버리지를 추측하지 마세요");
	});

	test("uses the selected language to describe commands without inventing results", async () => {
		let prompt = "";
		const models: PiActivityNarratorModels = {
			getModel: () => model,
			streamSimple: (_model, context) => {
				prompt = context.systemPrompt ?? "";
				return { result: async () => response(JSON.stringify({ what: "Reads the project instructions.", inputSummary: [] })) } as AssistantMessageEventStream;
			},
		};
		const language = { current: "en" as "ko" | "en" };
		const narrator = new PiActivityNarrator(models, ACTIVITY_NARRATOR_MODEL, () => language.current);
		await narrator.narrate({ ...request, kind: "tool-action", inputSummary: ["cat AGENTS.md"] });
		expect(prompt).toContain("in English");
		expect(prompt).toContain("Do not infer results");
		language.current = "ko";
		await narrator.narrate({ ...request, kind: "tool-action", inputSummary: ["cat AGENTS.md"] });
		expect(prompt).toContain("한국어로");
	});
});

import { describe, expect, test } from "bun:test";
import {
	sanitizeCompletedAssistantResponse,
	sanitizePartialAssistantResponse,
} from "../src/domain/redaction";

describe("assistant response envelope projection", () => {
	test("keeps completed response compatibility for an unfinished envelope", () => {
		const value = "<analysis>\n중간 추론";
		expect(sanitizeCompletedAssistantResponse(value)).toBe(value);
	});

	test("fails closed when a partial response ends inside a private envelope", () => {
		expect(sanitizePartialAssistantResponse("<analysis>\n중간 추론")).toBe("");
		expect(sanitizePartialAssistantResponse("<analysis>한 줄에서 잘린 중간 추론")).toBe("");
		expect(sanitizePartialAssistantResponse(
			"<analysis>\n중간 추론\n</analysis>\n<answer>\n사용자에게 보일 부분",
		)).toBe("사용자에게 보일 부분");
		expect(sanitizePartialAssistantResponse(
			"<analysis>중간 추론</analysis>\n<answer>한 줄에서 시작한 공개 부분",
		)).toBe("한 줄에서 시작한 공개 부분");
	});

	test("keeps ordinary Markdown and fenced tag examples unchanged for partial responses", () => {
		for (const value of [
			"prefix <answer>content</answer> suffix",
			"인라인 코드 `<analysis>`는 설명입니다.",
			"```xml\n<analysis>\n코드\n</analysis>\n```",
			"```xml\n<analysis>example</analysis>\n```\n<answer>literal HTML example</answer>",
		]) {
			expect(sanitizePartialAssistantResponse(value)).toBe(value);
		}
	});
});

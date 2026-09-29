import type { Context, Models, ModelsSimpleStreamOptions } from "@earendil-works/pi-ai";
import type {
	ActivityNarrationRequest,
	ActivityNarrationResult,
	ActivityNarrator,
} from "@/core/application/orchestration/activity-narrator.js";
import { redactForExternalReview }                         from "@/core/domain/review/redaction.js";
import { sanitizeTerminalTextExcerpt }                     from "@/core/domain/execution/terminal.js";
import type { OutputLanguage }                             from "@/core/domain/execution/output-language.js";

const MAX_REQUEST_BYTES = 8 * 1024 ;
const MAX_RESULT_TEXT   = 600      ;
const MAX_INPUT_ITEMS   = 4        ;

export const ACTIVITY_NARRATOR_PROVIDER = "openai-codex";
export const ACTIVITY_NARRATOR_MODEL = "gpt-5.6-luna";

export type PiActivityNarratorModels = Pick<Models, "getModel" | "streamSimple">;

/** Small, tool-free model adapter that interprets already-sanitized Step input. */
export class PiActivityNarrator implements ActivityNarrator {
	public constructor(
		private readonly models: PiActivityNarratorModels,
		private readonly modelId = ACTIVITY_NARRATOR_MODEL,
		private readonly language: () => OutputLanguage = () => "ko",
	) {}

	public async narrate(request: ActivityNarrationRequest, signal?: AbortSignal): Promise<ActivityNarrationResult> {
		const input = narrationInput(request);
		const model = this.models.getModel(ACTIVITY_NARRATOR_PROVIDER, this.modelId);
		if (!model) throw new Error(`Activity Narrator 모델을 찾을 수 없습니다: ${ACTIVITY_NARRATOR_PROVIDER}/${this.modelId}`);
		const context: Context = {
			systemPrompt: [
				this.language() === "en"
					? "You are an Activity Narrator. Briefly describe development actions in English."
					: "당신은 개발 실행 기록의 행동을 한국어로 짧게 설명하는 Activity Narrator입니다.",
				this.language() === "en"
					? "Use only the supplied goal, step, and command as evidence. Do not guess omitted intent."
					: "입력에 명시된 목표·단계·명령만 근거로 사용하고, 누락된 의도를 추측하지 마세요.",
				this.language() === "en"
					? "Write what as one concrete sentence. Write why only when supported by the input."
					: "what은 사용자가 이해할 구체적인 한 문장, why는 근거가 있을 때만 한 문장으로 작성하세요.",
				request.kind === "test-action"
					? this.language() === "en"
						? "This is one observed test run. Explain what behavior the command and observed test names check. State the result only if the exit code supports it. Do not infer missing cases or coverage."
						: "이 입력은 관측된 테스트 실행 한 건입니다. 명령과 관측된 테스트 이름으로 어떤 동작을 확인하는지 설명하세요. 종료 코드가 뒷받침할 때만 결과를 말하고, 빠진 테스트나 커버리지를 추측하지 마세요."
				: request.kind === "tool-action"
					? this.language() === "en"
						? "This is a Chat tool action. Describe only the action evident from the command, such as its target, query, or read range. Do not infer results or PLAN progress."
						: "이 요청은 Chat의 도구 행동입니다. what에는 명령의 대상·검색어·읽은 범위처럼 입력에서 확인되는 행동만 자연어로 설명하세요. PLAN 진행이나 작업 결과를 추측하지 마세요."
					: this.language() === "en"
						? "stepTitle is a PLAN item. Describe observed progress, not a list of commands. Do not infer results from one command."
						: "stepTitle은 PLAN 항목입니다. what에는 명령 목록이 아니라 해당 항목에서 관측된 세부 진행을 설명하세요. 단일 명령만으로 결과를 단정하지 마세요.",
				this.language() === "en"
					? "Do not copy commands, paths, raw logs, or technical event names such as item/started."
					: "명령·경로·원시 로그를 그대로 복사하거나 item/started 같은 기술 이벤트 이름을 출력하지 마세요.",
				this.language() === "en"
					? "Return exactly one {what, why|null, inputSummary:string[]} JSON object."
					: "반드시 {what, why|null, inputSummary:string[]} JSON 객체 하나만 반환하세요.",
			].join(" "),
			messages: [{ role: "user", content: input, timestamp: Date.now() }],
			tools: [],
		};
		const options: ModelsSimpleStreamOptions = Object.freeze({
			toolChoice : "none",
			reasoning  : "minimal",
			maxTokens  : 240,
			...(signal ? { signal } : {}),
		});
		const response = await this.models.streamSimple(model, context, options).result();
		if (response.stopReason === "toolUse" || response.content.some((block) => block.type === "toolCall")) {
			throw new Error("Activity Narrator가 허용되지 않은 도구 호출을 반환했습니다.");
		}
		if (response.stopReason === "error" || response.stopReason === "aborted") {
			throw new Error(response.errorMessage ?? "Activity Narrator 생성에 실패했습니다.");
		}
		const text = response.content.filter((block) => block.type === "text").map((block) => block.text).join("");
		return parseNarration(text);
	}
}

function narrationInput(request: ActivityNarrationRequest): string {
	if (!request || typeof request !== "object" || Array.isArray(request)) throw new Error("Activity Narrator 요청이 올바르지 않습니다.");
	const goal         = safeText(request.goal)                                                       ;
	const stepTitle    = safeText(request.stepTitle)                                                  ;
	const inputSummary = request.inputSummary.slice(0, MAX_INPUT_ITEMS).map(safeText).filter(Boolean) ;
	if (!goal || !stepTitle) throw new Error("Activity Narrator의 목표와 단계가 필요합니다.");
	const input = stableJson({ goal, inputSummary, kind: request.kind ?? "plan-progress", schemaVersion: 1, stepTitle });
	if (new TextEncoder().encode(input).byteLength > MAX_REQUEST_BYTES) throw new Error("Activity Narrator 요청이 너무 큽니다.");
	return input;
}

function parseNarration(raw: string): ActivityNarrationResult {
	const candidate = raw.trim().replace(/^```(?:json)?\s*/iu, "").replace(/\s*```$/u, "");
	let value: unknown;
	try {
		value = JSON.parse(candidate);
	} catch {
		throw new Error("Activity Narrator가 구조화된 narration을 반환하지 않았습니다.");
	}
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		throw new Error("Activity Narrator가 구조화된 narration을 반환하지 않았습니다.");
	}
	const record = value as Readonly<Record<string, unknown>>;
	if (typeof record.what === "string" && /\b(?:item|turn)\/(?:started|completed|updated)|commandExecution|function_call|tool_call/iu.test(record.what)) throw new Error("Activity Narrator가 기술 이벤트를 반환했습니다.");
	const what = typeof record.what === "string" ? safeText(record.what) : "";
	const why = typeof record.why === "string" ? safeText(record.why) : "";
	const inputSummary = Array.isArray(record.inputSummary)
		? record.inputSummary.slice(0, MAX_INPUT_ITEMS).filter((item): item is string => typeof item === "string").map(safeText).filter(Boolean)
		: [];
	if (!what) throw new Error("Activity Narrator가 구조화된 narration을 반환하지 않았습니다.");
	return Object.freeze({
		what,
		...(why ? { why } : {}),
		inputSummary: Object.freeze(inputSummary),
	});
}

function safeText(value: string): string {
	return redactForExternalReview(sanitizeTerminalTextExcerpt(value, MAX_RESULT_TEXT, "head-tail")).text.trim();
}

function stableJson(value: unknown): string {
	if (value === null || typeof value !== "object") return JSON.stringify(value);
	if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
	const record = value as Record<string, unknown>;
	return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(",")}}`;
}

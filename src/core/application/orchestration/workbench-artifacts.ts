import type { CanonicalDocumentDraft }                          from "@/core/domain/work/canonical-document.js";
import type { TNoteDraft }                                      from "@/core/domain/work/t-notes.js";
import type { TodoDocument }                                    from "@/core/domain/work/todos.js";
import type { WorkbenchTNote }                                  from "@/core/domain/work/workbench.js";
import { sanitizeTerminalTextExcerpt }                          from "@/core/domain/execution/terminal.js";
import { createCanonicalDocumentDraft }                         from "@/core/application/work/canonical-promotion.js";
import { stableJson }                                           from "@/core/application/orchestration/workbench-projections.js";
import { parseCanonicalTNoteReport, parseLegacyCanonicalTNote } from "@/core/application/work/t-note-service.js";

export function turnTNoteInstruction(question: string): string {
	return [
		"완료된 요청 전체를 종료 보고서 REPORT로 정리하세요.",
		`질문: ${question}`,
		"관찰 가능한 대화와 실행만 근거로 삼고 숨은 사고과정은 추측하지 마세요.",
		"처음 보는 사람도 요청부터 결론까지 이어서 이해하도록 각 항목을 한두 문장으로 요약하세요.",
		"파일 목록·원시 로그·다음 할 일은 넣지 마세요. 관측하지 못한 변경은 추정하지 마세요.",
		"Plan에는 질문을 해결하기 위해 세운 작업 순서와 판단 기준을 쓰세요.",
		"과정에는 실제로 거친 조사, 결정, 변경, 검증과 중요한 방향 전환만 시간 순서로 쓰세요.",
		"결론에는 도달한 답, 바뀐 것, 검증 결과, GitHub와 Linear 변경 여부를 관측된 범위에서 요약하세요.",
		"출력은 다음 네 줄 형식을 정확히 지키세요:",
		`질문: ${question}`,
		"Plan: 질문을 해결하기 위해 세운 계획과 판단 기준",
		"과정: 실제로 거친 조사, 결정, 변경과 검증의 흐름",
		"결론: 최종 답과 코드·문서·GitHub·Linear의 실제 변경 상태",
	].join("\n");
}

export function projectTNote(draft: TNoteDraft): WorkbenchTNote {
	const report   = parseCanonicalTNoteReport(draft.text)                          ;
	const legacy   = parseLegacyCanonicalTNote(draft.text)                          ;
	const question = report?.question ?? legacy?.question                           ;
	const format   = report?.version ?? (legacy ? "legacy-three-field" : "unknown") ;
	return {
		id       : draft.id,
		sequence : draft.sequence,
		title    : question
			? sanitizeTerminalTextExcerpt(question, 160, "head-tail")
			: "현재 세션 대화 요약",
		summary           : draft.text,
		sourceActivityIds : draft.packet.activities.map((activity) => activity.id),
		sourceRange       : draft.packet.range,
		...(draft.packet.completion ? { completion: draft.packet.completion } : {}),
		provenance : draft.provenance,
		format,
		updatedAt  : draft.createdAt,
	};
}

export function canonicalTNoteDraft(draft: TNoteDraft, sessionId: string): CanonicalDocumentDraft {
	const source = stableJson(draft);
	return createCanonicalDocumentDraft({
		kind       : "tnote",
		body       : `# 질문 요약 #${draft.sequence}\n\n${draft.text}`,
		source     : { id: draft.id, body: source },
		provenance : { sessionId, capturedAt: draft.createdAt },
	});
}

export function todoResultBody(document: TodoDocument): string {
	return stableJson({ revision: document.revision, title: document.title, items: document.items });
}

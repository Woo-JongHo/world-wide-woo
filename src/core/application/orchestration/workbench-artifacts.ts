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
		"완료된 요청 전체를 요청별 상세 업무 REPORT로 정리하세요.",
		`완료 요청: ${question}`,
		"관찰 가능한 대화와 실행만 근거로 삼고 숨은 사고과정을 추측하거나 쓰지 마세요.",
		"각 항목은 충분히 상세하게 여러 줄로 쓸 수 있습니다. 관측되지 않은 사실은 반드시 `관측 없음`으로 쓰세요.",
		"주요 작업에는 요청을 위해 의미 있었던 조사·결정·변경·검증만, 장시간·차단 작업에는 retry를 포함한 원인만 쓰세요.",
		"모델·토큰에는 source activity로 관측된 모델과 토큰 소비만 쓰며, 관측값이 없으면 `관측 없음`으로 쓰세요.",
		"변경 상태에는 코드·문서·GitHub·Linear 각각의 실제 변경 또는 관측 없음을 쓰고, Commit·Evidence에는 필요한 hash·근거 ID·Evidence path만 요약하세요.",
		"파일 목록, 원시 로그, raw evidence, 근거 없는 수치, 미래 실행 약속과 다음 할 일을 넣지 마세요.",
		"Test 섹션은 시스템이 실행 관측만 나중에 추가합니다. 절대 작성하지 마세요.",
		"출력은 다음 canonical grammar와 필드 순서를 정확히 지키세요. 각 값은 비어 있지 않은 여러 줄 텍스트여야 합니다:",
		"REPORT: request-report-v3",
		"제목:",
		"짧은 보고서 제목",
		"",
		"요청 목적·접근:",
		"요청 목적과 접근 요약",
		"",
		"주요 작업:",
		"의미 있었던 주요 작업",
		"",
		"장시간·차단 작업:",
		"오래 걸리거나 막힌 작업과 원인, 없으면 관측 없음",
		"",
		"잘된 점:",
		"잘된 점",
		"",
		"모델·토큰:",
		"관측된 모델과 토큰 소비, 없으면 관측 없음",
		"",
		"업무 자체평가:",
		"업무 자체평가",
		"",
		"다음 유사 요청:",
		"다음 유사 요청의 접근·관리 방식; 미래 실행 약속이 아닌 재사용 기준",
		"",
		"변경 상태:",
		"코드·문서·GitHub·Linear 변경 상태",
		"",
		"Commit·Evidence:",
		"Commit과 Evidence 기록",
	].join("\n");
}

export function projectTNote(draft: TNoteDraft): WorkbenchTNote {
	const report = parseCanonicalTNoteReport(draft.text)                          ;
	const legacy = parseLegacyCanonicalTNote(draft.text)                          ;
	const title  = report?.title ?? legacy?.question                              ;
	const format = report?.version ?? (legacy ? "legacy-three-field" : "unknown") ;
	return {
		id       : draft.id,
		sequence : draft.sequence,
		title    : title
			? sanitizeTerminalTextExcerpt(title, 160, "head-tail")
			: "현재 세션 업무 보고",
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
		body       : `# 업무 보고 #${draft.sequence}\n\n${draft.text}`,
		source     : { id: draft.id, body: source },
		provenance : { sessionId, capturedAt: draft.createdAt },
	});
}

export function todoResultBody(document: TodoDocument): string {
	return stableJson({ revision: document.revision, title: document.title, items: document.items });
}

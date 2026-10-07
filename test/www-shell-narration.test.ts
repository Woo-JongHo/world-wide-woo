import      { expect, test             } from "bun:test"                                                     ;
import      {
              stripTerminalSequences ,
              visibleWidth           ,
                                       } from "@earendil-works/pi-tui"                                       ;
import      { WwwTranscriptView        } from "../src/adapters/inbound/tui/features/chat/view/www-execution" ;
import type { PlanActivity             } from "../src/core/domain/work/workbench"                            ;
import      { wwwFixture               } from "./fixtures/www-snapshot"                                      ;

const interpretation: PlanActivity = {
	id: "preview-turn:tool-1", turnId: "preview-turn", stepId: "shell-action", stepTitle: "실행",
	summary: "재개 이벤트가 결합되는 코드를 찾습니다.", why: "중복 기록의 진입 경로를 좁히기 위해서입니다.",
	status: "completed", sequence: 4, narrationSource: "model", narrationStatus: "ready",
};
const { why: _reason, ...commandActivity } = interpretation;

function freeze<T>(value: T): T {
	if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
	for (const child of Object.values(value)) freeze(child);
	return Object.freeze(value);
}

test("Chat displays the model interpretation and selection reason beside the exact command", () => {
	const snapshot = { ...wwwFixture(), toolActions: [interpretation] } ;
	const view     = new WwwTranscriptView(snapshot)                    ;
	const rows     = view.render(100)                                   ;
	const text     = stripTerminalSequences(rows.join("\n"))            ;
	expect(text                                       ).toContain("AI 해석"                         ) ;
	expect(text                                       ).toContain(interpretation.summary            ) ;
	expect(text                                       ).toContain(interpretation.why!               ) ;
	expect(text                                       ).toContain("rg -n 'resume|sequence' src/core") ;
	expect(rows.every(row => visibleWidth(row) <= 100)).toBe     (true                              ) ;
	view.dispose();
});

test("a narration-only immutable snapshot update replaces the pending command explanation", () => {
	const fallback = { ...commandActivity, summary: "텍스트·파일 검색: resume", narrationSource: "command" as const, narrationStatus: "pending" as const } ;
	const initial  = freeze({ ...wwwFixture(), toolActions: [fallback] })                                                                                  ;
	const view     = new WwwTranscriptView(initial)                                                                                                        ;
	const pending  = stripTerminalSequences(view.render(100).join("\n"))                                                                                   ;
	expect(pending).toContain("명령 설명");
	expect(pending).toContain("AI 해석 대기");
	view.render(120);
	const before = view.cacheMetrics()                                   ;
	const next   = freeze({ ...initial, toolActions: [interpretation] }) ;
	expect(next.journalSequence).toBe(initial.journalSequence);
	view.update(next);
	const ready = stripTerminalSequences(view.render(100).join("\n"));
	expect(ready                                                                             )    .toContain(interpretation.summary) ;
	expect(ready                                                                             ).not.toContain(fallback.summary      ) ;
	expect(ready                                                                             )    .toContain(interpretation.why!   ) ;
	expect(view.cacheMetrics().durableCountRenderedBlocks - before.durableCountRenderedBlocks)    .toBe     (2                     ) ;
	view.dispose();
});

test("a failed interpretation keeps the command explanation and reports its absence", () => {
	const fallback = { ...commandActivity, summary: "파일 내용 읽기: README.md", narrationSource: "command" as const, narrationStatus: "unavailable" as const } ;
	const view     = new WwwTranscriptView({ ...wwwFixture(), toolActions: [fallback] })                                                                        ;
	const text     = stripTerminalSequences(view.render(100).join("\n"))                                                                                        ;
	expect(text)    .toContain(fallback.summary           ) ;
	expect(text)    .toContain("AI 해석을 받지 못했습니다") ;
	expect(text).not.toContain(interpretation.why!        ) ;
	view.dispose();
});

test("reused item ids in another turn do not attach the wrong interpretation", () => {
	const other = { ...interpretation, id: "other-turn:tool-1", turnId: "other-turn" } ;
	const view  = new WwwTranscriptView({ ...wwwFixture(), toolActions: [other] })     ;
	expect(stripTerminalSequences(view.render(100).join("\n"))).not.toContain(interpretation.summary);
	view.dispose();
});

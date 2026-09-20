# Message 요구사항 조사 — 2026-09-04

## 질문

`Chat > Message`에서 v0.1.0에 필요한 사용자 요구를 정리한다. 비교 기준은 Gajae Code(GJC), Pi 계열의 공개 구현과 WWW의 현재 코드·테스트·제품 계약이다.

## 결론

Message는 **한 사용자 또는 Agent 발화의 정직하고 구조화된 읽기 표면**이다.

사용자가 즉시 알 수 있어야 하는 것은 세 가지다.

1. 누가 말했는가 — user / agent / system notice를 혼동하지 않는다.
2. 무슨 내용인가 — Markdown·Code·긴 답변의 구조와 핵심이 읽힌다.
3. 지금 어떤 상태인가 — 전송·응답 중·완료·실패·중단과 해당 Message의 identity를 안다.

이것은 "대화 전체를 다른 모델이 다시 요약하는 화면"이 아니다. Agent의 답변은 결론·핵심 내용·검증/다음 행동이 읽히는 Markdown 구조로 **작성**될 수 있지만, Message renderer가 원문 의미를 임의로 압축하거나 재서술해서는 안 된다. 완료된 Turn의 결과 요약은 `CompletionReport`·T-note(Completion 소유), Tool 원문은 Activity/Tracer가 소유한다.

## GJC에서 확인한 원칙

GJC는 Message를 자동 의미 요약하는 대신 다음 계약으로 읽기 경험을 만든다.

- streaming 중에도 같은 assistant Message/Markdown 인스턴스를 갱신하고, abort/error는 본문 아래에 terminal 상태로 남긴다.
- Markdown·syntax·status·symbol을 하나의 semantic theme vocabulary로 연결한다.
- Theme은 user message surface, Markdown, syntax, status line, `unicode/nerd/ascii` symbol까지 의미 token으로 나누며 terminal truecolor/256/default에 투영한다.
- ANSI visible width·truncate·wrap을 명시적으로 다루며, 어떤 component도 주어진 terminal 폭보다 긴 line을 반환할 수 없다.
- viewport/streaming 처리와 실제 terminal 품질은 별도의 renderer 계약이다.

GJC가 주는 교훈은 붉은 외형이나 테마 마켓이 아니라, **의미 → 시각 요소 → terminal capability**를 분리하고 상태를 색만으로 표현하지 않는다는 점이다.

외부 원문:

- [GJC AssistantMessageComponent](https://raw.githubusercontent.com/Yeachan-Heo/gajae-code/bf188c1cda0665219f8af2edbed1256eede317bc/packages/coding-agent/src/modes/components/assistant-message.ts)
- [GJC Markdown component](https://raw.githubusercontent.com/Yeachan-Heo/gajae-code/bf188c1cda0665219f8af2edbed1256eede317bc/packages/tui/src/components/markdown.ts)
- [GJC theme contract](https://raw.githubusercontent.com/Yeachan-Heo/gajae-code/bf188c1cda0665219f8af2edbed1256eede317bc/docs/theme.md)
- [GJC TUI renderer contract](https://raw.githubusercontent.com/Yeachan-Heo/gajae-code/bf188c1cda0665219f8af2edbed1256eede317bc/packages/tui/README.md)

## WWW의 정본 계약

- `Chat`은 선택된 execution lane과의 대화 및 공개 가능한 중간 작업을 시간순으로 보이는 표면이며, 별도 모델이 다시 쓴 session summary가 아니다.
- 완료된 질문의 Question·Reason·Result는 T-note/Completion의 책임이다.
- 화면 truncate/fold는 저장 원문과 model context를 바꾸지 않으며, completed payload가 streaming delta보다 최종 권위를 가진다.
- Message의 lifecycle은 `streaming | completed | failed | cancelled`이고 stable `threadId/turnId/itemId`와 append-only activity가 순서를 정한다.

근거: [CONTEXT.md](../../CONTEXT.md), [TUI 비교 결정](../../docs/TUI_COMPARISON.md), [TUI 코드 지도](../../docs/TUI_CODE_MATRIX.md), [Stories](../Stories.md).

## 현재 구현: 이미 있는 것

| 요구 | 현재 근거 | 판정 |
| --- | --- | --- |
| user surface / assistant open transcript | `WorkbenchChatView.renderMessage()`와 role label | 구현됨 |
| Markdown, fenced Code, native syntax와 plain fallback | `theme.ts`, `syntax-highlighter.ts`, Pi `Markdown` | 구현됨 |
| 완료 응답에서 안전한 public answer만 보이기 | `sanitizeCompletedAssistantResponse()` 및 회귀 테스트 | 구현됨 |
| streaming → completed 재투영 | 같은 Markdown instance 갱신과 completion sanitization | 구현됨 |
| failed/cancelled/uncertain outbound 상태 | message status와 recovery label | 구현됨 |
| resume의 thread/turn 정합 | `ProjectWorkbench` resume 회귀 테스트 | 구현됨 |
| 장기 transcript scroll-only render cache | 5,000-message performance test | 구현됨 |

## 현재 구현: 아직 요구로 남는 것

| 빈틈 | 이유 |
| --- | --- |
| Message contract가 화면 하나에 섞여 있음 | `WorkbenchChatView`가 Message 외에 Activity, approval, completion card, selected T-note까지 직접 렌더한다. Message Issue는 이 소유 경계를 먼저 고정해야 한다. |
| 출력의 읽기용 축약 방식 미결정 | live draft만 16KiB/120행으로 생략하고 completed assistant Markdown은 의도적으로 전체를 보존한다. 긴 완료 답변의 fold/page/copy/source 이동은 아직 없다. |
| semantic theme의 구조 부재 | 현재 palette와 Markdown/syntax 색은 좋지만 단일 hard-coded theme다. `ThemeTokens + SymbolTokens + CapabilityProjection`과 no-color/256-color acceptance가 없다. |
| 실제 terminal acceptance 부족 | CJK/emoji/ANSI/resize, truecolor·256·무색, 실제 PTY trackpad scroll의 수락 근거가 없다. `ST-005-02`도 미완료다. |
| Message와 Completion의 요약 경계 미명문화 | Completion/T-note가 결과 요약을 소유한다는 용어는 있으나, "Agent 답변의 구조화"와 "별도 요약"의 차이를 Issue acceptance에 써야 한다. |

## Message 요구사항 초안

### 불편했던 점

대화 발화와 실행 정보가 한 transcript 안에서 섞이고, streaming·긴 Markdown·Code·terminal 차이가 더해지면 누가 말했는지, 현재 상태가 무엇인지, 답변의 핵심이 무엇인지 빠르게 읽기 어렵다.

### 이게 해결하는 점

각 Message를 역할·내용·lifecycle·identity가 보존된 읽기 단위로 만들고, 원문을 왜곡하지 않는 구조화된 출력과 semantic theme로 긴 대화도 빠르게 파악하게 한다.

### 기능 요구

1. **역할과 경계** — user / assistant / system notice의 독립적인 label·spacing·surface 규칙. 색을 꺼도 구분된다.
2. **내용 표현** — heading, list, quote, link, inline/fenced Code, language-aware syntax, unknown-language plain fallback, terminal-control sanitize. Agent final response는 `결론 → 핵심 내용 → 검증/다음 행동`처럼 읽히는 작성 구조를 권장한다.
3. **정직한 압축** — 화면의 생략·fold·page는 `… N`과 원문 도달 경로를 보인다. 저장 원문·evidence·model context는 변하지 않는다. 별도 모델이 대화 Message를 재서술하지 않는다.
4. **lifecycle와 identity** — same item의 delta는 한 Message를 갱신하고 terminal transition은 중복 없이 완료한다. 실패·중단·불확정 전송은 마지막 읽을 수 있는 본문과 정확한 상태를 남긴다. resume 후에도 thread/turn/item과 시간순서를 보존한다.
5. **semantic theme와 capability** — role, Markdown, code, state, muted metadata에 semantic token을 둔다. label/symbol/surface로 색을 보조하고 truecolor·256·무색/ASCII degradation을 정의한다.
6. **terminal 읽기 품질** — ANSI visible width, 한글/CJK·emoji·긴 URL, narrow width·resize, long session cache와 manual scroll follow를 검증한다.

### 제외 범위

- Tool·Plan·Subagent·approval의 lifecycle card와 raw output: Activity.
- Turn 결과의 Question·Reason·Result, CompletionReport, T-note: Completion.
- 상세 raw source 탐색과 evidence drilldown: Tracer.
- panel size, focus, global scroll model, composer: Layout.

## Issue로 나눌 때의 권장 경계

1. **Message 역할·상태·identity 계약** — role surface, lifecycle, optimistic delivery, stream→terminal, resume ordering.
2. **Message Markdown·Code와 정직한 긴 출력** — formatting, sanitize, code fallback, fold/page/copy/source path, omission evidence.
3. **Message semantic theme와 terminal capability** — token schema, symbol/no-color/256-color projection, accessibility cue.
4. **Message terminal acceptance** — CJK/ANSI/resize/long-session/real PTY capture. 구현 기능이 아니라 release quality gate이므로 위 이슈의 Evidence 또는 별도 quality Issue 중 한 곳에만 둔다.

## 요구 확정 전에 필요한 선택

"출력을 이해하기 쉽게 요약"의 의미를 아래 둘 중 하나로 확정해야 한다.

- **권장:** Agent가 처음부터 구조화된 답변을 내고, Message는 원문을 보존해 표현한다. Turn 결과를 별도로 요약하는 것은 Completion/T-note다.
- **별도 기능:** Message 안에서 긴 Agent 답변의 생성 요약을 새로 만든다. 이 경우 원문/요약의 provenance, stale 조건, 실패 fallback, raw 접근 경로가 필요하며 Completion과 겹친다.

현재 WWW의 CONTEXT와 raw/projection 계약은 첫 번째를 지지한다.

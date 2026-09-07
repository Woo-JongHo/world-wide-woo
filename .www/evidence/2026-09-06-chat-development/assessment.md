# Chat 개발 현황 확인 — 2026-09-06

이 문서는 특정 로컬 작업 트리를 확인한 Evidence다. 현재 업무 상태의 정본은 Linear이며, 이 기록은 구현·검증 관측을 보존한다.

Linear 반영 결과는 [MCP 재조회 원문](linear-after.json)과 [10개 이슈 대조 결과](linear-verification.json)에 보존했다. UUID·코드 주석·상태·라벨을 확인하고 기존 제목·부모·마일스톤과 대조했다.

## 확인 범위

- Git HEAD: `19bad6c00b2dbb4f8c58fd632eb362aae6d31d8d` + 기존 미커밋 변경. 파일별 SHA-256과 실행 전 상태: [baseline.json](baseline.json).
- 기본 검사: `bun run check` exit 0, `bun test` **617 pass / 0 fail / 74 files**. [typecheck](typecheck.log), [test 원문](tests-baseline.log).
- ID 주석·무결성 테스트 반영 후 최종 검사: `bun run check` exit 0, `bun test` **618 pass / 0 fail / 74 files**. [최종 타입 검사](typecheck-annotated.log), [최종 전체 테스트](tests-annotated.log). 상대 코드 링크는 [최종 파일 fingerprint](verified-source.json)와 함께 읽는다.
- 별도 재현: 기존 FakeNativeHarness/MemoryJournal을 재사용한 [실행 코드](runtime-probes.ts), [관측 결과](runtime-probes.json). 실제 provider 또는 TUI 수락 검사가 아니다.
- 제품 동작은 변경하지 않았다. 실제 함수·컴포넌트·테스트에 @linear WOO 주석을 추가하고 연결 원장과 그 무결성 테스트를 보완했다.
- 사용자가 명확히 한 연결 대상은 코드와 Linear 이슈 ID다. 실제 선언의 @linear WOO 주석 → 원장의 Linear UUID·URL → 코드·테스트·Evidence를 연결했다. 별도 Unit ID와 기존 EP/ST 동치 연결은 이번 범위가 아니다.

## 현재 위치

| 이슈 | 관측 결과 | 다음 개발 |
| --- | --- | --- |
| [WOO-679](https://linear.app/woo-world/issue/WOO-679/chat-대화실행결과를-읽기-좋은-하나의-흐름으로-보여준다) | 부분 구현 | Chat 실행 카드에서 Tracer로 이동하는 조작과 원본 부재 안내, 최종 메시지 미수신 시 결과 안내, 실제 화면 수락. |
| [WOO-683](https://linear.app/woo-world/issue/WOO-683/message-대화의-내용과-상태를-편하게-읽는다) | 부분 구현 | 하위 WOO-688·690·691의 보존·격리·예외 결함과 WOO-692 실제 TUI 수락이 남았다. |
| [WOO-684](https://linear.app/woo-world/issue/WOO-684/chat-git-bash-입력출력상태를-읽기-좋게-표시한다) | 부분 구현 | 원문을 여는 실제 Tracer 조작, 취소·출력 없는 완료·반복 명령·다국어의 40/80/120열 전체 matrix와 화면 수락. |
| [WOO-686](https://linear.app/woo-world/issue/WOO-686/message-01-문서와-코드를-읽기-쉽게-표시한다) | 부분 구현 | 표·중첩 목록·TS/JSON/Bash·미완성 fence의 전 폭 조합, highlight 예외/budget 강제 사례와 실제 TUI 수락. |
| [WOO-687](https://linear.app/woo-world/issue/WOO-687/message-02-대화-주체와-진행-상태를-한눈에-구분한다) | 부분 구현 | unknown role을 assistant로 추정하는 경계, 모든 상태의 무채색·좁은 폭 가독성 확인. |
| [WOO-688](https://linear.app/woo-world/issue/WOO-688/message-03-답변-생성완료중단-과정을-보여준다) | 부분 구현·결함 재현 | final 미수신·실패·중단의 부분 답변 보존, terminal item의 late delta 차단, 복수 item 전환과 실제 화면 검증. |
| [WOO-689](https://linear.app/woo-world/issue/WOO-689/message-04-긴-결과를-안정적으로-탐색한다) | 부분 구현 | 최초 렌더·resize와 장기 메모리의 실측 기준선, CJK/emoji/결합문자/URL 전체 폭 조합, 실제 focus·최신 복귀 수락. |
| [WOO-690](https://linear.app/woo-world/issue/WOO-690/message-05-재개-뒤에도-대화-순서와-대상을-유지한다) | 부분 구현·결함 재현 | thread 범위의 메시지 identity/격리, local-journal 범위 안내, 요청/반환 thread ID 불일치 검사와 전용 회귀. |
| [WOO-691](https://linear.app/woo-world/issue/WOO-691/message-06-비정상-응답에서도-내용을-보존하고-복구를-안내한다) | 부분 구현 | 빈 최종 응답 안내, unknown role/status의 항목별 notice, renderer 예외 격리와 오류 뒤 입력 복구 matrix. |
| [WOO-692](https://linear.app/woo-world/issue/WOO-692/message-07-실제-tui에서-가독성과-상태-전환을-검증한다) | 자동 검증 근거 확보·실제 TUI 미검증 | 실제 Native 연결 TUI의 7개 시나리오, 40/80/120열·무채색·resize/focus 캡처와 사용자 수락. fake provider 결과를 실제 TUI 수락으로 대체하지 않는다. |

**9개 이슈에 제품 구현 기반이 있고, 1개는 통합 수락 작업이다. 10개 모두 전체 수락 완료로 판정하지 않았다.** 부모/자식·공통 코드가 겹치므로 이를 합산한 퍼센트는 만들지 않는다. 기본 617개·최종 618개 테스트는 저장소 회귀 검증 규모이며 Chat 수락 항목 수가 아니다.

## 재현한 미충족 동작

1. **WOO-688:** `partial answer` delta 뒤 final item 없이 `turn/completed`를 보내면 draft가 비고 assistant 메시지는 0개, 오류 안내도 null이었다.
2. **WOO-688:** completed item에 같은 item의 late delta를 보내면 완료 답변과 별도로 live draft `late delta`가 생겼다.
3. **WOO-690:** fresh root thread에 child agentMessage가 나타났다. child가 root와 같은 itemId를 쓰면 root 답변이 child 내용으로 바뀌었다.

세 probe 모두 스크립트 실행은 성공했지만 `requirementMet: false`였다. 기존 617개 테스트 통과와 이 누락 조건의 실패를 구분한다. 해결 순서는 부분 답변 보존/late event → thread 격리 → 빈/unknown 응답 → 원문 탐색과 화면 수락을 권장한다.

## 이슈별 근거

### WOO-679

- 구현: 메시지·실행 카드·승인/전송 알림·동일 turn 결과 요약·스크롤을 조합한다.
- 검증: 동일 실행의 delta 연결, 완료 전 요약 금지, child plan의 root 요약 제외, 스크롤 중 자동 추적 방지 테스트가 통과했다.
- 남은 부분: Chat 실행 카드에서 Tracer로 이동하는 조작과 원본 부재 안내, 최종 메시지 미수신 시 결과 안내, 실제 화면 수락.
- 코드: [src/presentation/tui/workbench-views.ts](../../../src/presentation/tui/workbench-views.ts), [src/presentation/tui/result-cards.ts](../../../src/presentation/tui/result-cards.ts), [src/presentation/tui/workbench-shell.ts](../../../src/presentation/tui/workbench-shell.ts), [src/presentation/tui/theme.ts](../../../src/presentation/tui/theme.ts)
- 실행한 기존 테스트:
  - [test/workbench-views.test.ts](../../../test/workbench-views.test.ts) — `does not claim a completion recap before the same Native turn completes`
  - [test/workbench-views.test.ts](../../../test/workbench-views.test.ts) — `never promotes a completed child-thread plan into the root completion recap`

### WOO-683

- 구현: 역할·Markdown·Code·상태 label, durable 메시지와 live draft의 표시 경로가 있다.
- 검증: 사용자 배경/열린 Agent 본문, 완료 본문 보존, 동일 내용의 상태 전환 정제 테스트가 통과했다.
- 남은 부분: 하위 WOO-688·690·691의 보존·격리·예외 결함과 WOO-692 실제 TUI 수락이 남았다.
- 코드: [src/presentation/tui/workbench-views.ts](../../../src/presentation/tui/workbench-views.ts), [src/application/project-workbench.ts](../../../src/application/project-workbench.ts), [src/domain/workbench.ts](../../../src/domain/workbench.ts), [src/presentation/tui/theme.ts](../../../src/presentation/tui/theme.ts)
- 실행한 기존 테스트:
  - [test/workbench-views.test.ts](../../../test/workbench-views.test.ts) — `uses one filled user surface and an open assistant transcript`
  - [test/workbench-views.test.ts](../../../test/workbench-views.test.ts) — `preserves completed Markdown while bounding only the live draft`

### WOO-684

- 구현: ObservationCard의 Bash 명령·출력·상태 기호·관측된 Exit/Duration과 10행 tail 표시가 있다.
- 검증: 실제 Native 카드 renderer와 tool delta projection의 기존 테스트가 통과했다. legacy BashResultCard만으로 판정하지 않았다.
- 남은 부분: 원문을 여는 실제 Tracer 조작, 취소·출력 없는 완료·반복 명령·다국어의 40/80/120열 전체 matrix와 화면 수락.
- 코드: [src/presentation/tui/work-step-card.ts](../../../src/presentation/tui/work-step-card.ts), [src/presentation/tui/workbench-views.ts](../../../src/presentation/tui/workbench-views.ts), [src/application/project-workbench.ts](../../../src/application/project-workbench.ts)
- 실행한 기존 테스트:
  - [test/work-step-card-highlight.test.ts](../../../test/work-step-card-highlight.test.ts) — `renders native command execution with a Gajae-style Bash frame`
  - [test/workbench-views.test.ts](../../../test/workbench-views.test.ts) — `keeps a native command output delta on the same running step`

### WOO-686

- 구현: pi-tui Markdown·표 wrapping/fallback, native syntax highlight, ANSI/공개 응답 정제와 완료 본문 전체 표시가 있다.
- 검증: Python/미지원 언어, 구조화된 응답 순서와 완료 본문 보존 테스트가 통과했다.
- 남은 부분: 표·중첩 목록·TS/JSON/Bash·미완성 fence의 전 폭 조합, highlight 예외/budget 강제 사례와 실제 TUI 수락.
- 코드: [src/presentation/tui/workbench-views.ts](../../../src/presentation/tui/workbench-views.ts), [src/presentation/tui/theme.ts](../../../src/presentation/tui/theme.ts), [src/presentation/tui/syntax-highlighter.ts](../../../src/presentation/tui/syntax-highlighter.ts), [src/domain/terminal.ts](../../../src/domain/terminal.ts), [src/domain/redaction.ts](../../../src/domain/redaction.ts)
- 실행한 기존 테스트:
  - [test/syntax-highlighter.test.ts](../../../test/syntax-highlighter.test.ts) — `renders an unknown language safely`
  - [test/workbench-views.test.ts](../../../test/workbench-views.test.ts) — `keeps a structured native answer in its original Markdown order`

### WOO-687

- 구현: user/bori label, 사용자 surface, 응답 중·실패·중단 문구, queue/error notice가 있다.
- 검증: 역할별 배경, queue 순서, 불확실 전송의 조건부 복구 안내 테스트가 통과했다.
- 남은 부분: unknown role을 assistant로 추정하는 경계, 모든 상태의 무채색·좁은 폭 가독성 확인.
- 코드: [src/presentation/tui/workbench-views.ts](../../../src/presentation/tui/workbench-views.ts), [src/presentation/tui/theme.ts](../../../src/presentation/tui/theme.ts), [src/domain/workbench.ts](../../../src/domain/workbench.ts)
- 실행한 기존 테스트:
  - [test/workbench-views.test.ts](../../../test/workbench-views.test.ts) — `shows queued user inputs in their delivery order`
  - [test/workbench-views.test.ts](../../../test/workbench-views.test.ts) — `keeps an uncertain delivery warning and its recovery command visible`

### WOO-688

- 구현: 정상 delta 누적 → completed durable 메시지 전환과 상태에 따른 정제/캐시 갱신이 있다.
- 검증: 정상 전환 테스트는 통과했지만 별도 fake-provider 재현에서 final 미수신 시 부분 답변 소실, 완료 후 late delta 재표시를 확인했다.
- 남은 부분: final 미수신·실패·중단의 부분 답변 보존, terminal item의 late delta 차단, 복수 item 전환과 실제 화면 검증.
- 코드: [src/application/project-workbench.ts](../../../src/application/project-workbench.ts), [src/infrastructure/project-workbench-session.ts](../../../src/infrastructure/project-workbench-session.ts), [src/presentation/tui/workbench-views.ts](../../../src/presentation/tui/workbench-views.ts)
- 실행한 기존 테스트:
  - [test/project-workbench.test.ts](../../../test/project-workbench.test.ts) — `keeps deltas ephemeral and durably appends completed native observations before publishing`
  - [test/workbench-views.test.ts](../../../test/workbench-views.test.ts) — `reprojects unchanged envelope text when streaming becomes completed`

### WOO-689

- 구현: assistant 완료 본문 보존, draft 제한·생략 표시, scroll-only 캐시, wide/compact viewport와 자동 추적 해제가 있다.
- 검증: 5,000개 메시지에서 600회 scroll-only render가 동일 rows를 재사용하고 평균 0.25ms 미만이라는 기존 assertion 및 wheel/follow 테스트가 통과했다.
- 남은 부분: 최초 렌더·resize와 장기 메모리의 실측 기준선, CJK/emoji/결합문자/URL 전체 폭 조합, 실제 focus·최신 복귀 수락.
- 코드: [src/presentation/tui/workbench-views.ts](../../../src/presentation/tui/workbench-views.ts), [src/presentation/tui/dashboard-layout.ts](../../../src/presentation/tui/dashboard-layout.ts), [src/presentation/tui/workbench-shell.ts](../../../src/presentation/tui/workbench-shell.ts)
- 실행한 기존 테스트:
  - [test/workbench-views.test.ts](../../../test/workbench-views.test.ts) — `reuses the complete chat projection for scroll-only frames`
  - [test/workbench-views.test.ts](../../../test/workbench-views.test.ts) — `does not restore chat auto-follow while wheel scrolling concurrent streaming output`

### WOO-690

- 구현: local-journal resume, native active/idle 정합, optimistic/uncertain user 전송 reconciliation, thread journal/lease가 있다.
- 검증: resume·전송 identity 테스트는 통과했지만 별도 fresh-session 재현에서 child message 혼입과 thread 간 같은 itemId의 root 답변 덮어쓰기를 확인했다.
- 남은 부분: thread 범위의 메시지 identity/격리, local-journal 범위 안내, 요청/반환 thread ID 불일치 검사와 전용 회귀.
- 코드: [src/application/project-workbench.ts](../../../src/application/project-workbench.ts), [src/infrastructure/project-workbench-session.ts](../../../src/infrastructure/project-workbench-session.ts), [src/infrastructure/activity-journal-store.ts](../../../src/infrastructure/activity-journal-store.ts), [src/domain/project-activity.ts](../../../src/domain/project-activity.ts)
- 실행한 기존 테스트:
  - [test/project-workbench.test.ts](../../../test/project-workbench.test.ts) — `resumes without native turns and reconciles the opaque thread against local activity`
  - [test/project-workbench.test.ts](../../../test/project-workbench.test.ts) — `reconciles an uncertain queued send from native lifecycle without duplicate delivery`

### WOO-691

- 구현: terminal/민감값 정제, highlight fallback, 공개 응답 추출, deliveryUncertain일 때만 /cancel 안내가 있다.
- 검증: 미지원 언어, 공개 envelope 정제, 불가능한 /cancel 안내 제거 테스트가 통과했다. 부분 답변 소실은 WOO-688 재현과 공유한다.
- 남은 부분: 빈 최종 응답 안내, unknown role/status의 항목별 notice, renderer 예외 격리와 오류 뒤 입력 복구 matrix.
- 코드: [src/domain/terminal.ts](../../../src/domain/terminal.ts), [src/domain/redaction.ts](../../../src/domain/redaction.ts), [src/presentation/tui/syntax-highlighter.ts](../../../src/presentation/tui/syntax-highlighter.ts), [src/presentation/tui/workbench-views.ts](../../../src/presentation/tui/workbench-views.ts), [src/application/project-workbench.ts](../../../src/application/project-workbench.ts)
- 실행한 기존 테스트:
  - [test/workbench-views.test.ts](../../../test/workbench-views.test.ts) — `omits the /cancel recovery line for a failure it cannot reconcile`
  - [test/workbench-views.test.ts](../../../test/workbench-views.test.ts) — `renders only the public answer from a completed assistant envelope`

### WOO-692

- 구현: 통합 검증에 재사용할 Native Workbench 테스트가 있다. 새 제품 모듈을 구현하는 이슈가 아니다.
- 검증: 현재 작업 트리의 타입 검사·617개 기존 테스트를 실행하고 raw log와 source fingerprint를 저장했다.
- 남은 부분: 실제 Native 연결 TUI의 7개 시나리오, 40/80/120열·무채색·resize/focus 캡처와 사용자 수락. fake provider 결과를 실제 TUI 수락으로 대체하지 않는다.
- 코드: 제품 코드 소유 없음 — 통합 수락 작업
- 실행한 기존 테스트:
  - [test/workbench-views.test.ts](../../../test/workbench-views.test.ts) — `keeps the live chat, streaming projection, and Todo while switching to the monitor projection`
  - [test/dashboard-layout.test.ts](../../../test/dashboard-layout.test.ts) — `keeps every wheel delta in its contained chat viewport while content renders`

## ID 연결의 의미와 범위

[연결 원장](../../control-ledger/traceability.json)에 `linear-issue → implements → code`, `test → verifies → linear-issue`, `evidence → evidences → linear-issue`를 저장한다. 이는 기존 v1 schema의 방향을 따른다.

`implements`는 구현 위치, `verifies`는 해당 요구 일부를 검사하는 테스트 위치를 뜻한다. 어느 관계도 요구 전체의 통과·완료·사람 수락을 의미하지 않는다. WOO-692에는 테스트/근거를 연결하고 새 제품 모듈을 배정하지 않는다.

원장의 API는 양방향 조회를 지원한다. 현행 `/map` 화면은 기존 EP/ST projection이며, 이번 파일 연결만으로 Linear/Unit 연동 화면이나 자동 동기화 기능이 생긴 것은 아니다.


## 코드 주석 검증

실제 선언의 `@linear WOO-*`를 추가했다. 연결 테스트는 src/test 전체의 태그가 등록된 Linear ID이며 올바른 파일 관계로 연결되는지 확인한다. [annotation-tests.log](annotation-tests.log)에 실행 결과를 남겼다. UUID/URL은 원장에 저장하고 함수마다 복제하지 않는다.

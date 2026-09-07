---
www_document_id: "tui-test-methodology-2026-09-07"
www_project_id: "99_www"
www_linear_ids: ["WOO-679", "WOO-682", "WOO-681", "WOO-677", "WOO-695", "WOO-696", "WOO-697", "WOO-698"]
www_prs: ["38", "39", "40", "41", "42", "43", "44"]
www_record_ids: ["TEST-METHOD-2026-09-07"]
www_renderer_version: 1
---

# TUI 테스트 방법론과 검증 기록

## 이 문서의 역할

이 문서는 Chat·Todo·Tracer·Stats와 Linear↔Code↔SQLite↔Obsidian 연결을 검증한 방법을 한 가지 형식으로 남긴다. Linear Comment에는 각 이슈의 결론과 blocker만 요약하고, 이 문서에는 재현 명령·입력·기대값·실패 유형·증거 위치를 보존한다.

테스트 통과는 코드가 주어진 입력에서 기대 동작을 했다는 뜻이다. Linear 이슈 수락은 제품 경계, 실제 런타임, 관측 한계, 사람 검토를 함께 확인한 뒤 별도로 판정한다.

## 공통 기록 스키마

각 테스트는 다음 순서로 기록한다.

1. **테스트 목적** — 어떤 사용자 가치 또는 불변식을 확인하는가.
2. **테스트 종류** — Unit, Integration, Contract, System, Manual/PTY, Static, Review 중 하나 이상.
3. **테스트 유형** — 정상 경로, 경계값, 음성 경로, 회귀, 결정성, 소유권 격리, 재현성 등.
4. **기대값 및 실패 유형** — 통과 조건과 실패 시 분류를 함께 쓴다. 실패 유형 코드는 아래의 완전한 실패 유형 사전을 따른다.
5. **테스트 내용** — 다음 필드를 구분해 쓴다.
   - **재현 명령/입력·fixture/실행 경로** — 보존된 재현 명령, 입력·fixture, 실행 경로. 보존되지 않았으면 `원문 미보존`, 다른 증거가 소유하면 `별도 증거 파일에 보존`이라고 쓴다.
   - **관측값** — 실행에서 직접 관측한 값과 관측하지 못한 범위.
   - **증거** — 결과를 뒷받침하는 파일 위치. 없거나 분리 보존되었으면 그 상태를 명시한다.
   - **실행 결과** — 자동 또는 수동 실행 자체의 결과. `PASS`는 해당 실행의 기대값을 만족했다는 뜻일 뿐 제품 수락을 뜻하지 않는다.
   - **제품 수락 판정** — Linear 이슈의 제품 경계와 미관측 범위까지 포함한 별도 판정.

## 테스트 카탈로그

### TEST-CHAT-IDENTITY

- **Linear / PR**: WOO-690, WOO-679 / PR #39
- **목적**: 메시지·실행을 thread/turn/item 단위로 분리하고 재개 후 다른 실행의 내용이 섞이지 않게 한다.
- **종류**: Unit + Integration + Regression
- **유형**: identity boundary, duplicate/late delta, cross-owner negative path, resume
- **기대값**: 같은 item은 하나의 메시지로 합쳐지고, 다른 thread/turn은 projection에서 제외되며, optimistic 메시지와 durable 메시지가 중복되지 않는다.
- **실패 유형**: `identity_mix`, `duplicate_projection`, `resume_scope_leak`
- **재현 명령/입력·fixture/실행 경로**: 원문 미보존. 테스트 경로는 `test/project-workbench.test.ts`, `test/workbench-views.test.ts`; 검토 입력과 실행 세부는 별도 증거 파일에 보존.
- **관측값**: Opus resolution은 PASS를 기록했다. 실제 Native assistant refs의 일부 경로는 관측되지 않았다.
- **증거**: `.www/scratchpad/2026-09-07-chat-identity-opus-resolution.json`
- **실행 결과**: Opus resolution PASS.
- **제품 수락 판정**: 실제 Native assistant refs 일부 경로의 관측 한계가 남아 있어 이 기록만으로는 제품 수락을 판정하지 않음.

### TEST-CHAT-LIFECYCLE

- **Linear / PR**: WOO-688, WOO-679 / PR #40
- **목적**: 부분 응답, 최종 본문 미수신, 실패·중단 상태를 읽을 수 있게 보존한다.
- **종류**: Integration + Renderer regression
- **유형**: state transition, incomplete payload, redaction negative path, late event
- **기대값**: 부분 본문은 보존하되 미수신 상태를 표시하고, 실패·중단 응답에서 내부 reasoning이 공개되지 않는다.
- **실패 유형**: `content_loss`, `redaction_fail_open`, `late_event_overwrite`
- **재현 명령/입력·fixture/실행 경로**: 원문 미보존. 검토 입력과 실행 경로는 별도 증거 파일에 보존.
- **관측값**: Opus가 D1~D3와 sparse refs를 지적하고 REVISE를 기록했다.
- **증거**: `.www/scratchpad/2026-09-07-chat-lifecycle-opus.json`, `.www/scratchpad/2026-09-07-chat-lifecycle-code-review.md`
- **실행 결과**: 독립 검토 REVISE.
- **제품 수락 판정**: 미수락. PR #40은 최종 수락 전 수정 대상.

### TEST-TODO-PARSER

- **Linear / PR**: WOO-702, WOO-682 / PR #43
- **목적**: Native Plan Markdown을 안정적인 Todo identity/status로 투영한다.
- **종류**: Unit
- **유형**: grammar variants, boundary, malformed negative, deterministic replay
- **기대값**: 번호 단계와 column-0 bullet은 순서대로 읽고, 번호 단계 아래 임의 폭 들여쓰기 bullet은 상세로 무시하며, bullet 단계의 중첩·빈 status·번호 공백·257개 초과는 전체 계획을 거부한다.
- **실패 유형**: `parse_accept_wrong`, `malformed_plan_mutation`, `identity_reorder_loss`
- **재현 명령/입력·fixture/실행 경로**: `bun test test/work-flow.test.ts`; 입력 fixture는 별도 증거 파일과 테스트 코드에 보존.
- **관측값**: 24 pass / 0 fail / 120 assertions.
- **증거**: `.www/scratchpad/2026-09-07-todo-terra-final.md`
- **실행 결과**: 자동 테스트 PASS.
- **제품 수락 판정**: 이 단위 테스트 결과만으로는 제품 수락을 판정하지 않음.

### TEST-TODO-WIRING

- **Linear / PR**: WOO-702 / PR #43
- **목적**: root `item/completed(item.type=plan)`이 Workbench와 Todo 저장소까지 전달되는지 확인한다.
- **종류**: Integration
- **유형**: root ownership, foreign-turn negative, malformed no-write, CAS regression
- **기대값**: root Plan만 Todo를 갱신하고 child/unknown Plan은 거부하며 malformed Plan은 snapshot과 CAS write를 바꾸지 않는다.
- **실패 유형**: `wrong_owner_sync`, `stale_write`, `foreign_turn_leak`
- **재현 명령/입력·fixture/실행 경로**: `bun test test/native-plan-wiring.test.ts`; 입력 fixture는 별도 증거 파일과 테스트 코드에 보존.
- **관측값**: 단독 실행 1 pass. Parser와 합쳐진 대상 실행은 24 pass.
- **증거**: `.www/scratchpad/2026-09-07-production-workbench-todo-qa.md`, `.www/scratchpad/2026-09-07-todo-opus-final-blocked.md`
- **실행 결과**: 자동 테스트 PASS, Terra 검토 APPROVE. Opus 최종 감사는 provider 제한으로 미실행.
- **제품 수락 판정**: 미판정. 필수 Opus 최종 감사가 provider 제한으로 실행되지 않음.

### TEST-TODO-NATIVE

- **Linear / PR**: WOO-702 / PR #43
- **목적**: 실제 `createProjectWorkbenchSession → CodexAppServer.connect → ProjectWorkbench → FileTodoStore` 경로의 Plan/Todo 저장을 확인한다.
- **종류**: System / Manual acceptance
- **유형**: production path, persistence, scoped session
- **기대값**: dplan-v1 4/4 단계와 stable native/detail ID가 session-scoped Todo.md에 기록된다.
- **실패 유형**: `missing_native_plan`, `session_scope_leak`, `resume_unproven`
- **재현 명령/입력·fixture/실행 경로**: 원문 미보존. `createProjectWorkbenchSession → CodexAppServer.connect → ProjectWorkbench → FileTodoStore` 실행 경로의 세부는 별도 증거 파일에 보존.
- **관측값**: 초기 production 실행에서 dplan-v1 4/4 저장을 관측했다. Native resume/cross-session은 별도 증거를 확보하지 못했다.
- **증거**: `.www/scratchpad/2026-09-07-production-workbench-todo-qa.md`
- **실행 결과**: 초기 수동 production 실행 PASS.
- **제품 수락 판정**: 미판정. 수동 실행 PASS는 제품 수락이 아니며 Native resume/cross-session 증거가 미확보됨.

### TEST-TRACER-IDENTITY

- **Linear / PR**: WOO-705, WOO-681 / PR #44
- **목적**: `/trace`가 정확한 activityId와 같은 실행의 근거만 선택하게 한다.
- **종류**: Unit + Integration
- **유형**: exact identity, same-item reuse, partial journal negative
- **기대값**: exact activityId만 선택되고 item 제목·순번·latest fallback은 사용하지 않으며 thread/turn/item 결속이 맞지 않으면 구조화 실패를 반환한다.
- **실패 유형**: `activity_not_found`, `cross_turn_mix`, `fallback_selection`
- **재현 명령/입력·fixture/실행 경로**: 원문 미보존. 대상 및 전체 테스트의 명령·입력은 별도 증거 파일에 보존.
- **관측값**: targeted 161 pass / full 624 pass / 0 fail. 실제 Native 성공 Plan association은 관측되지 않았다.
- **증거**: `.www/scratchpad/2026-09-07-tracer-native-pty-terra.md`, `.www/scratchpad/2026-09-07-tracer-terra-review.md`
- **실행 결과**: 자동 테스트 PASS, Terra 검토 통과.
- **제품 수락 판정**: 미판정. 실제 Native 성공 Plan association이 미관측됨.

### TEST-TRACER-PTY

- **Linear / PR**: WOO-705 / PR #44
- **목적**: 사용자 입력 오류가 다른 Source를 열지 않는지 확인한다.
- **종류**: Manual / PTY
- **유형**: negative interaction, width matrix
- **재현 명령/입력·fixture/실행 경로**: PTY에서 `/trace not-an-activity`를 40·80·120 columns 조건으로 입력. 그 밖의 실행 명령은 원문 미보존.
- **기대값**: `activity_not_found`, Source 이동 없음, 화면 폭별 overflow 없음.
- **실패 유형**: `wrong_source_navigation`, `overflow`, `error_hidden`
- **관측값**: 3폭 모두 invalid ID 처리 PASS. 성공 `/trace`의 Native association은 증거 부족으로 관측하지 못함.
- **증거**: 별도 증거 파일에 보존.
- **실행 결과**: 수동 PTY 음성 경로 실행 PASS.
- **제품 수락 판정**: 보류. 수동 실행 PASS는 제품 수락이 아니며 성공 `/trace`의 Native association 증거가 부족함.

### TEST-STATS-OBSERVATION

- **Linear / PR**: WOO-714, WOO-677 / PR #41
- **목적**: 결과·사용량·시간을 관측 단위와 함께 계산하고 미관측과 실제 0을 구분한다.
- **종류**: Unit + Integration + PTY
- **유형**: null-vs-zero boundary, resume coverage, failure/cancelled state, denominator semantics
- **기대값**: 관측되지 않은 값은 `unknown/unobserved`로 남고 실제 0과 같아지지 않으며, 실패·취소·완료가 분리된다.
- **실패 유형**: `unknown_as_zero`, `state_collapse`, `wrong_denominator`
- **재현 명령/입력·fixture/실행 경로**: 원문 미보존. 명령·입력 fixture·PTY 실행 경로는 별도 증거 파일에 보존.
- **관측값**: Spark 재검토와 후속 구현은 통과했다. 초기 Opus는 D1~D3를 지적했고 최종 Opus 재감사는 provider session limit로 실행되지 않았다.
- **증거**: `.www/scratchpad/2026-09-07-stats-enter-spark-rereview.md`, `.www/scratchpad/2026-09-07-stats-opus.json`, `.www/scratchpad/2026-09-07-stats-opus-final.json`
- **실행 결과**: Spark 재검토 및 후속 구현 검증 통과; 최종 Opus 재감사 미실행.
- **제품 수락 판정**: 미판정. provider session limit로 최종 Opus 재감사가 실행되지 않음.

### TEST-CODE-MAP

- **Linear / PR**: WOO-695 / PR #42
- **목적**: Linear ID와 실제 코드 선언·테스트를 일방향 추측 없이 연결한다.
- **종류**: Static analysis + Integration
- **유형**: AST declaration scan, duplicate/dangling negative, bidirectional lookup
- **기대값**: 선언·테스트·Linear ID가 원장에 존재하고 고아 링크·중복·경로 누락을 검출한다.
- **실패 유형**: `dangling_link`, `duplicate_identity`, `false_co_location`
- **재현 명령/입력·fixture/실행 경로**: 원문 미보존. 정적 분석과 전체 테스트의 명령·입력은 별도 증거 파일에 보존.
- **관측값**: 107 refs / 142 links / 선언 6 / 제품 선언 4; 전체 628 tests pass 기록.
- **증거**: `.www/scratchpad/2026-09-07-code-map-opus.json`, `.www/scratchpad/2026-09-07-code-map-pr-audit.md`
- **실행 결과**: 정적 분석 및 자동 테스트 PASS 기록.
- **제품 수락 판정**: 이 실행 기록만으로는 제품 수락을 판정하지 않음.

### TEST-STATIC-GATES

- **목적**: 타입·공백·가짜 완료 표식이 변경을 통과하지 않게 한다.
- **종류**: Static
- **유형**: compile, diff hygiene, sentinel scan
- **기대값**: `bun run check`, `git diff --check`가 통과하고 TODO/skip/only/debug 자리표시자가 없다.
- **실패 유형**: `type_error`, `diff_error`, `fake_completion`
- **재현 명령/입력·fixture/실행 경로**: `bun run check`; `git diff --check`; `rg -n 'TODO|test\.(skip|only)|describe\.(skip|only)'`; 입력 fixture는 해당 없음.
- **관측값**: Todo·Tracer·Stats·Map 대상 기록에서 통과.
- **증거**: 별도 증거 파일에 보존.
- **실행 결과**: 정적 게이트 PASS 기록.
- **제품 수락 판정**: 정적 게이트 PASS만으로는 제품 수락을 판정하지 않음.

### TEST-REVIEW-GATES

- **목적**: 작성자와 독립 검토자가 서로 다른 종류의 오류를 찾게 한다.
- **종류**: Independent review
- **유형**: Terra implementation review, Opus final audit, Spark re-review, Luna inventory
- **기대값**: 구현·문서·실행 증거를 분리해 판정하고, blocker가 있으면 APPROVE로 올리지 않는다.
- **실패 유형**: `self_approval`, `evidence_overclaim`, `provider_blocked`
- **재현 명령/입력·fixture/실행 경로**: 원문 미보존. 각 provider의 검토 입력·실행 경로는 별도 증거 파일에 보존.
- **관측값**: Terra/Spark/Luna 기록은 보존됐다. Opus는 이슈별 PASS/REVISE 기록을 남겼고 Todo·Stats 일부 최종 재감사는 provider 제한으로 실행되지 않았다.
- **증거**: 각 카탈로그 항목에 연결된 scratchpad 증거 파일에 분산 보존.
- **실행 결과**: 이슈별 검토 결과가 혼재하며 Todo·Stats 일부 최종 재감사는 미실행.
- **제품 수락 판정**: 일괄 수락하지 않음. 각 이슈의 독립 검토 결과와 provider blocker를 개별 적용해야 함.

## 공통 재현·판정 매트릭스

아래 표의 두 판정은 의도적으로 분리한다. 실행 결과가 `PASS`여도 제품 수락 판정이 `UNVERIFIED` 또는 `PARTIAL`일 수 있다. `원문 미보존`은 누락을 숨기지 않고 재현 한계를 기록하는 값이다.

| 테스트 ID | 재현 명령·입력/실행 경로 | 관측값 | 실행 결과 | 제품 수락 판정 | 증거 |
| --- | --- | --- | --- | --- | --- |
| TEST-CHAT-IDENTITY | 원문 미보존; 관련 테스트 파일과 resolution JSON 참조 | thread/turn/item 병합·중복 제거, Native assistant refs 일부 미관측 | PASS (증거 로그 기준) | PARTIAL | `test/project-workbench.test.ts`, `test/workbench-views.test.ts`, `2026-09-07-chat-identity-opus-resolution.json` |
| TEST-CHAT-LIFECYCLE | 원문 미보존; PR #40 증거 로그 참조 | Opus D1~D3 및 sparse refs/content 미검증 | REVISE | UNVERIFIED | `2026-09-07-chat-lifecycle-opus.json`, `2026-09-07-chat-lifecycle-code-review.md` |
| TEST-TODO-PARSER | `bun test test/work-flow.test.ts`; Markdown fixture는 테스트 소스에 보존 | 24 pass, 120 assertions | PASS | PARTIAL | `2026-09-07-todo-terra-final.md` |
| TEST-TODO-WIRING | `bun test test/native-plan-wiring.test.ts`; transport fixture는 테스트 소스에 보존 | root Plan 갱신, foreign/malformed no-write | PASS | PARTIAL | `2026-09-07-production-workbench-todo-qa.md` |
| TEST-TODO-NATIVE | `createProjectWorkbenchSession → CodexAppServer.connect → ProjectWorkbench → FileTodoStore`; Native probe 원문 참조 | dplan-v1 4/4, stable Todo IDs; resume/cross-session 미관측 | PASS (초기 실행) | UNVERIFIED | `2026-09-07-production-workbench-todo-qa.md` |
| TEST-TRACER-IDENTITY | 원문 미보존; PR #44 테스트 로그·receipt 참조 | targeted 161, full 624 pass; Native 성공 association 미관측 | PASS | PARTIAL | `2026-09-07-tracer-terra-review.md`, `2026-09-07-tracer-native-pty-terra.md` |
| TEST-TRACER-PTY | `/trace not-an-activity` at 40/80/120 columns; PTY artifact 참조 | 세 폭에서 `activity_not_found`, Source 이동 없음 | PASS | PARTIAL | `2026-09-07-tracer-native-pty-terra.md` |
| TEST-STATS-OBSERVATION | 원문 미보존; Spark/Opus review artifact와 PR branch 로그 참조 | null-vs-zero 보완, Opus D1~D3 최종 재감사 미실행 | PARTIAL | UNVERIFIED | `2026-09-07-stats-enter-spark-rereview.md`, `2026-09-07-stats-opus.json` |
| TEST-CODE-MAP | 원문 미보존; AST scan receipt 참조 | 107 refs, 142 links, declarations 6, product declarations 4 | PASS | PARTIAL | `2026-09-07-code-map-pr-audit.md`, `2026-09-07-code-map-opus.json` |
| TEST-STATIC-GATES | `bun run check`; `git diff --check`; sentinel `rg` scan | 타입·diff·자리표시자 검사 통과(기록된 변경 범위) | PASS | PARTIAL | 각 PR 검증 로그 |
| TEST-REVIEW-GATES | 각 reviewer prompt와 artifact 참조; provider별 독립 세션 | Terra/Spark/Luna 결과 보존, 일부 Opus 최종 세션 provider blocked | PARTIAL | BLOCKED | 각 `*-opus*.json`, Terra/Spark/Luna artifacts |

## 실패 유형 사전

카탈로그와 공통 매트릭스에서 사용하는 코드는 다음 전체 목록으로 제한한다. 새 코드는 이 목록과 이 문서를 함께 갱신한다.

- `wrong_projection`: 입력은 받았지만 잘못된 화면·원장 상태로 투영됨
- `identity_mix`: 다른 thread/turn/item의 데이터가 섞임
- `stale_write`: 오래된 revision 또는 malformed 입력이 저장소를 덮음
- `missing_observation`: 실제 이벤트·토큰·Plan을 관측하지 못했는데 성공처럼 표시함
- `scope_mismatch`: 테스트가 요구 범위보다 좁거나 다른 경계를 검증함
- `provider_blocked`: 필수 리뷰 모델·외부 실행 경로가 제공되지 않음
- `duplicate_projection`: 하나의 원문이 화면에 두 번 투영됨
- `resume_scope_leak`: 재개 시 다른 세션의 내용이 유입됨
- `content_loss`: 부분 또는 최종 본문이 사라짐
- `redaction_fail_open`: 공개 경계를 넘으면 안 되는 내용이 노출됨
- `late_event_overwrite`: 늦게 도착한 이벤트가 확정 상태를 덮음
- `parse_accept_wrong`: 잘못된 Plan 문법을 유효한 단계로 수용함
- `malformed_plan_mutation`: malformed Plan이 저장소를 변경함
- `identity_reorder_loss`: Plan 재정렬·삽입에서 identity가 유실됨
- `wrong_owner_sync`: 다른 turn/owner가 Todo를 갱신함
- `foreign_turn_leak`: foreign turn의 activity가 선택된 흐름에 들어옴
- `missing_native_plan`: Native Plan 이벤트 또는 단계가 관측되지 않음
- `session_scope_leak`: 다른 session의 Todo가 섞임
- `resume_unproven`: resume 경로의 실제 증거가 없음
- `activity_not_found`: 요청한 activity identity를 찾지 못함
- `cross_turn_mix`: 다른 turn의 근거가 선택됨
- `fallback_selection`: exact identity 대신 제목·순번·latest fallback을 사용함
- `wrong_source_navigation`: 잘못된 Source로 이동함
- `overflow`: 터미널 폭을 넘김
- `error_hidden`: 실패가 사용자에게 표시되지 않음
- `unknown_as_zero`: 미관측 값을 실제 0으로 표시함
- `state_collapse`: 실패·취소·완료 상태를 하나로 합침
- `wrong_denominator`: 통계 분모·분자의 의미가 어긋남
- `dangling_link`: 원장에 없는 대상을 링크함
- `duplicate_identity`: 같은 identity를 중복 등록함
- `false_co_location`: 같은 파일에 있다는 이유만으로 관계를 생성함
- `type_error`: 타입 검사 실패
- `diff_error`: 공백·패치 검사 실패
- `fake_completion`: TODO/skip/only 등 가짜 완료 표식이 남음
- `self_approval`: 작성자가 자기 결과를 승인함
- `evidence_overclaim`: 증거 범위를 넘어 완료를 주장함


## 다음 검증 순서

1. Opus가 REVISE한 Chat lifecycle과 Stats D1~D3를 수정하고 해당 회귀를 다시 실행한다.
2. Todo Native resume/cross-session과 Tracer Native success association을 실제 실행으로 확보한다.
3. PR별 Opus 판정과 macOS CI를 확인한 뒤 Linear 상태를 갱신한다.
4. 이 문서의 Linear ID와 각 PR/evidence 링크를 다시 대조한다.

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
4. **기대값 및 실패 유형** — 통과 조건과 실패 시 분류(`wrong_projection`, `identity_mix`, `stale_write`, `missing_observation`, `scope_mismatch`, `provider_blocked`)를 함께 쓴다.
5. **테스트 내용** — 명령, 입력 fixture/실행 경로, 관측값, 증거 파일, 현재 판정.

## 테스트 카탈로그

### TEST-CHAT-IDENTITY

- **Linear / PR**: WOO-690, WOO-679 / PR #39
- **목적**: 메시지·실행을 thread/turn/item 단위로 분리하고 재개 후 다른 실행의 내용이 섞이지 않게 한다.
- **종류**: Unit + Integration + Regression
- **유형**: identity boundary, duplicate/late delta, cross-owner negative path, resume
- **기대값**: 같은 item은 하나의 메시지로 합쳐지고, 다른 thread/turn은 projection에서 제외되며, optimistic 메시지와 durable 메시지가 중복되지 않는다.
- **실패 유형**: `identity_mix`, `duplicate_projection`, `resume_scope_leak`
- **내용/증거**: `test/project-workbench.test.ts`, `test/workbench-views.test.ts`, `.www/scratchpad/2026-09-07-chat-identity-opus-resolution.json`
- **판정**: Opus resolution PASS. 실제 Native assistant refs의 일부 경로는 별도 관측 한계로 남김.

### TEST-CHAT-LIFECYCLE

- **Linear / PR**: WOO-688, WOO-679 / PR #40
- **목적**: 부분 응답, 최종 본문 미수신, 실패·중단 상태를 읽을 수 있게 보존한다.
- **종류**: Integration + Renderer regression
- **유형**: state transition, incomplete payload, redaction negative path, late event
- **기대값**: 부분 본문은 보존하되 미수신 상태를 표시하고, 실패·중단 응답에서 내부 reasoning이 공개되지 않는다.
- **실패 유형**: `content_loss`, `redaction_fail_open`, `late_event_overwrite`
- **내용/증거**: `.www/scratchpad/2026-09-07-chat-lifecycle-opus.json`, `.www/scratchpad/2026-09-07-chat-lifecycle-code-review.md`
- **판정**: Opus는 REVISE(D1~D3, sparse refs)로 남아 있다. PR #40은 최종 수락 전 수정 대상.

### TEST-TODO-PARSER

- **Linear / PR**: WOO-702, WOO-682 / PR #43
- **목적**: Native Plan Markdown을 안정적인 Todo identity/status로 투영한다.
- **종류**: Unit
- **유형**: grammar variants, boundary, malformed negative, deterministic replay
- **기대값**: 번호 단계와 column-0 bullet은 순서대로 읽고, 번호 단계 아래 임의 폭 들여쓰기 bullet은 상세로 무시하며, bullet 단계의 중첩·빈 status·번호 공백·257개 초과는 전체 계획을 거부한다.
- **실패 유형**: `parse_accept_wrong`, `malformed_plan_mutation`, `identity_reorder_loss`
- **명령**: `bun test test/work-flow.test.ts`
- **결과**: 24 pass / 0 fail / 120 assertions.
- **증거**: `.www/scratchpad/2026-09-07-todo-terra-final.md`

### TEST-TODO-WIRING

- **Linear / PR**: WOO-702 / PR #43
- **목적**: root `item/completed(item.type=plan)`이 Workbench와 Todo 저장소까지 전달되는지 확인한다.
- **종류**: Integration
- **유형**: root ownership, foreign-turn negative, malformed no-write, CAS regression
- **기대값**: root Plan만 Todo를 갱신하고 child/unknown Plan은 거부하며 malformed Plan은 snapshot과 CAS write를 바꾸지 않는다.
- **실패 유형**: `wrong_owner_sync`, `stale_write`, `foreign_turn_leak`
- **명령**: `bun test test/native-plan-wiring.test.ts`
- **결과**: 1 pass. Parser와 합쳐진 대상 실행은 24 pass.
- **증거**: `.www/scratchpad/2026-09-07-production-workbench-todo-qa.md`, `.www/scratchpad/2026-09-07-todo-opus-final-blocked.md`
- **판정**: Terra APPROVE. Opus 최종 감사는 provider 제한으로 미실행.

### TEST-TODO-NATIVE

- **Linear / PR**: WOO-702 / PR #43
- **목적**: 실제 `createProjectWorkbenchSession → CodexAppServer.connect → ProjectWorkbench → FileTodoStore` 경로의 Plan/Todo 저장을 확인한다.
- **종류**: System / Manual acceptance
- **유형**: production path, persistence, scoped session
- **기대값**: dplan-v1 4/4 단계와 stable native/detail ID가 session-scoped Todo.md에 기록된다.
- **실패 유형**: `missing_native_plan`, `session_scope_leak`, `resume_unproven`
- **결과**: 초기 production 실행은 4/4 저장 PASS. Native resume/cross-session 별도 증거는 미확보.
- **증거**: `.www/scratchpad/2026-09-07-production-workbench-todo-qa.md`

### TEST-TRACER-IDENTITY

- **Linear / PR**: WOO-705, WOO-681 / PR #44
- **목적**: `/trace`가 정확한 activityId와 같은 실행의 근거만 선택하게 한다.
- **종류**: Unit + Integration
- **유형**: exact identity, same-item reuse, partial journal negative
- **기대값**: exact activityId만 선택되고 item 제목·순번·latest fallback은 사용하지 않으며 thread/turn/item 결속이 맞지 않으면 구조화 실패를 반환한다.
- **실패 유형**: `activity_not_found`, `cross_turn_mix`, `fallback_selection`
- **결과**: targeted 161 pass / full 624 pass / 0 fail.
- **증거**: `.www/scratchpad/2026-09-07-tracer-native-pty-terra.md`, `.www/scratchpad/2026-09-07-tracer-terra-review.md`
- **판정**: 코드·Terra 검토는 통과했으나 실제 Native 성공 Plan association은 미관측.

### TEST-TRACER-PTY

- **Linear / PR**: WOO-705 / PR #44
- **목적**: 사용자 입력 오류가 다른 Source를 열지 않는지 확인한다.
- **종류**: Manual / PTY
- **유형**: negative interaction, width matrix
- **명령/조건**: `/trace not-an-activity` at 40·80·120 columns.
- **기대값**: `activity_not_found`, Source 이동 없음, 화면 폭별 overflow 없음.
- **실패 유형**: `wrong_source_navigation`, `overflow`, `error_hidden`
- **판정**: 3폭 모두 invalid ID 처리가 PASS. 성공 `/trace`는 Native association 증거 부족으로 보류.

### TEST-STATS-OBSERVATION

- **Linear / PR**: WOO-714, WOO-677 / PR #41
- **목적**: 결과·사용량·시간을 관측 단위와 함께 계산하고 미관측과 실제 0을 구분한다.
- **종류**: Unit + Integration + PTY
- **유형**: null-vs-zero boundary, resume coverage, failure/cancelled state, denominator semantics
- **기대값**: 관측되지 않은 값은 `unknown/unobserved`로 남고 실제 0과 같아지지 않으며, 실패·취소·완료가 분리된다.
- **실패 유형**: `unknown_as_zero`, `state_collapse`, `wrong_denominator`
- **증거**: `.www/scratchpad/2026-09-07-stats-enter-spark-rereview.md`, `.www/scratchpad/2026-09-07-stats-opus.json`, `.www/scratchpad/2026-09-07-stats-opus-final.json`
- **판정**: Spark 재검토와 후속 구현은 통과. 초기 Opus는 D1~D3를 지적했고, 최종 Opus 재감사는 provider session limit로 미실행.

### TEST-CODE-MAP

- **Linear / PR**: WOO-695 / PR #42
- **목적**: Linear ID와 실제 코드 선언·테스트를 일방향 추측 없이 연결한다.
- **종류**: Static analysis + Integration
- **유형**: AST declaration scan, duplicate/dangling negative, bidirectional lookup
- **기대값**: 선언·테스트·Linear ID가 원장에 존재하고 고아 링크·중복·경로 누락을 검출한다.
- **실패 유형**: `dangling_link`, `duplicate_identity`, `false_co_location`
- **결과**: 107 refs / 142 links / 선언 6 / 제품 선언 4; 전체 628 tests pass 기록.
- **증거**: `.www/scratchpad/2026-09-07-code-map-opus.json`, `.www/scratchpad/2026-09-07-code-map-pr-audit.md`

### TEST-STATIC-GATES

- **목적**: 타입·공백·가짜 완료 표식이 변경을 통과하지 않게 한다.
- **종류**: Static
- **유형**: compile, diff hygiene, sentinel scan
- **기대값**: `bun run check`, `git diff --check`가 통과하고 TODO/skip/only/debug 자리표시자가 없다.
- **실패 유형**: `type_error`, `diff_error`, `fake_completion`
- **명령**: `bun run check`; `git diff --check`; `rg -n 'TODO|test\.(skip|only)|describe\.(skip|only)'`
- **판정**: Todo·Tracer·Stats·Map 대상 기록에서 통과.

### TEST-REVIEW-GATES

- **목적**: 작성자와 독립 검토자가 서로 다른 종류의 오류를 찾게 한다.
- **종류**: Independent review
- **유형**: Terra implementation review, Opus final audit, Spark re-review, Luna inventory
- **기대값**: 구현·문서·실행 증거를 분리해 판정하고, blocker가 있으면 APPROVE로 올리지 않는다.
- **실패 유형**: `self_approval`, `evidence_overclaim`, `provider_blocked`
- **판정**: Terra/Spark/Luna 기록은 보존됨. Opus는 이슈별 PASS/REVISE 기록을 남겼고, Todo·Stats 일부 최종 재감사는 provider 제한으로 미실행.

## 실패 유형 사전

- `wrong_projection`: 입력은 받았지만 잘못된 화면·원장 상태로 투영됨
- `identity_mix`: 다른 thread/turn/item의 데이터가 섞임
- `stale_write`: 오래된 revision 또는 malformed 입력이 저장소를 덮음
- `missing_observation`: 실제 이벤트·토큰·Plan을 관측하지 못했는데 성공처럼 표시함
- `scope_mismatch`: 테스트가 요구 범위보다 좁거나 다른 경계를 검증함
- `provider_blocked`: 필수 리뷰 모델·외부 실행 경로가 제공되지 않음

## 다음 검증 순서

1. Opus가 REVISE한 Chat lifecycle과 Stats D1~D3를 수정하고 해당 회귀를 다시 실행한다.
2. Todo Native resume/cross-session과 Tracer Native success association을 실제 실행으로 확보한다.
3. PR별 Opus 판정과 macOS CI를 확인한 뒤 Linear 상태를 갱신한다.
4. 이 문서의 Linear ID와 각 PR/evidence 링크를 다시 대조한다.

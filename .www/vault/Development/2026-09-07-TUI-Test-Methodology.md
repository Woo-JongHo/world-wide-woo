---
www_document_id: "tui-test-methodology-2026-09-07"
www_project_id: "99_www"
www_linear_ids: ["WOO-720", "WOO-679", "WOO-682", "WOO-681", "WOO-677", "WOO-695", "WOO-696", "WOO-697", "WOO-698"]
www_prs: ["38", "39", "40", "41", "42", "43", "44"]
www_record_ids: ["TEST-METHOD-2026-09-07"]
www_renderer_version: 1
---

# TUI 테스트 방법론과 검증 기록

## 이 문서의 역할

사용자가 지정한 테스트·예외 처리 기록의 Linear 기준점은 [WOO-720 테스트](https://linear.app/woo-world/issue/WOO-720)다. WOO-697은 저장·연결 기반 작업이며 기록 기준점을 대신하지 않는다. 이 문서는 상세 실행 원문과 증거를 보존한다. 아래 기존 카탈로그는 당시 기록이며, 최신 증거 대조와 한정된 판정은 문서 끝의 WOO-720 정리에서 확인한다.

테스트 통과는 코드가 주어진 입력에서 기대 동작을 했다는 뜻이다. Linear 이슈 수락은 제품 경계, 실제 런타임, 관측 한계, 사람 검토를 함께 확인한 뒤 별도로 판정한다.

## 공통 기록 스키마

WOO-720과 동일한 기록 ID로 각 테스트를 다음 순서로 기록한다.

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

## WOO-720 정리 — 2026-09-07 증거 재대조

## 목적과 기록 기준
Chat의 Message 01~08 및 Todo·Tracer·Layout 연동에서 수행한 테스트와 예외 처리 검증을 이 이슈에서 확인한다. 사용자 지정 기록 기준점은 **WOO-720**이다. WOO-697은 저장·연결 기반 작업이며 이 기록을 대신하지 않는다.

**2026-09-07 기존 증거 대조 결과**다. 이번 정리는 테스트 재실행이나 현재 main의 수락 판정이 아니다. PASS는 아래에 적은 입력·버전·관측 범위에만 적용한다.

## 결과 요약
| 기록 | 대상 / 종류·유형 | 목적과 기대값 | 실제 결과 / 판정 |
| --- | --- | --- | --- |
| TEST-CHAT-LIFECYCLE | WOO-688, PR #40 / 실제 Native·PTY 통합 / 정상·중단·회귀 | 응답은 중복 없이 표시되고, 중단해도 받은 본문과 중단 상태를 보존 | replay-002: 정상 user/assistant 각 1개, completed 본문 확인. Esc 뒤 cancelled·partial=true·본문 `1. 오늘은`·`중단됨` 확인. **이 범위 PASS** |
| TEST-LAYOUT-WIDTH | WOO-707·708 연관 / 실제 PTY / 폭 경계값 | 40·80·120열에서도 완료 답변을 읽을 수 있음 | 세 폭에서 `안녕하세요 👋 연결 확인` 본문 존재 확인. **본문 표시만 PASS**. 스크롤 위치·focus·overlay 복귀 수락은 미검증 |
| TEST-TODO-NATIVE | WOO-702, PR #43 / 실제 System / 계획 저장·세션 범위 | Native Plan이 올바른 세션 Todo.md에 ID와 완료 상태로 저장 | `item/completed(type=plan)`, dplan-v1 4/4 완료, checked 항목과 stable native/detail ID 저장 확인. **최초 저장 PASS**, resume·cross-session은 미검증 |
| TEST-TRACER-IDENTITY | WOO-705, PR #44 / 자동 Unit·Integration / ID 격리·회귀 | exact activityId만 선택하고 다른 turn·불완전 journal은 거부 | 독립 검토 기록: 78 pass/449 assertions + 83 pass/1,062 assertions. **자동 검증 PASS**, 실제 정상 Source 진입의 증거로 확대하지 않음 |
| TEST-TRACER-PTY | WOO-705, PR #44 / 실제 Native·PTY / 잘못된 입력 | 없는 ID 입력 시 오류를 표시하고 다른 Source를 열지 않음 | `activity_not_found`, 40·80·120열에서 sourceScreen=false, selectedActivityId=null. **오류 경로 PASS**. 40열 오류 문구는 말줄임 |

## 예외 처리: 기대 행동과 관측
| 실패 조건 / 분류 | 기대 행동 | 확인한 결과와 남은 검증 |
| --- | --- | --- |
| 응답 도중 Esc / content_loss | 받은 본문을 보존하고 중단을 표시 | Chat 실제 중단에서 부분 본문·중단 표시 확인. 잘못된 최종 본문 미수신 경고가 없음을 확인 |
| 빈 최종 응답·failed·late delta / missing_observation, late_event_overwrite | 누락·실패를 드러내고 기존 본문을 잘못 덮지 않음 | 이번 실제 provider 실행에서는 해당 입력을 관측하지 못함. **Native 미검증** |
| Todo 경로의 threadId와 ownerSessionId 혼동 / session_scope_leak | 실제 세션 소유 범위의 파일을 조회 | 초기 probe가 threadId 경로를 읽어 파일을 놓침. snapshot의 ownerSessionId 경로로 바로잡아 저장 확인. **검증 도구의 경로 오류 수정**이며 제품 복구 성공으로 세지 않음 |
| 없는 activityId / activity_not_found | 오류 표시, 선택과 Source 이동 억제 | 실제 PTY에서 확인. 정상 ID로 이어서 복구하는 시나리오는 미검증 |
| 다른 turn ID·Plan association 부재 / cross_turn_mix, missing_observation | 다른 실행을 대체 선택하지 않음 | 자동 격리 테스트 기록은 있음. 실제 세션은 turn/plan/updated와 associated activity가 없어 정상 선택·cross-turn 수락 **BLOCKED** |
| resize·overlay 후 위치/입력 상실 / wrong_projection | 읽던 위치와 입력 focus 복원 | 본문 폭 변경 외에는 **미검증** |
| 필수 최종 감사 실행 불가 / provider_blocked | 감사 미실행을 명시 | Terra의 제한된 APPROVE를 Opus 최종 수락으로 바꾸지 않음 |

## 테스트 내용과 재현 근거
1. **Chat / Layout** — 실제 Codex App Server → ProjectWorkbench → TUI를 실행하고 정상 완료 → 40·80·120열 resize → 다음 응답 도중 Esc를 관측한다. replay-002의 steps.json, state, JSONL, 화면 7개, ANSI, source-fingerprints를 대조했다. 실행 제품 HEAD: `a5188b351ebceb12f4529e9fc7ac1558b5accaf5`. 증거: `.www/scratchpad/2026-09-07-chat-runtime-terra-rereview.md`. 이 기록의 APPROVE는 runtime 증거 blocker 해소에 한정된다.
2. **Todo** — 임시 README 프로젝트, gpt-5.6-sol/medium, plan, workspace-write에서 `createProjectWorkbenchSession → CodexAppServer.connect → ProjectWorkbench → FileTodoStore` 실행. snapshot의 실제 scoped 경로 `.www/todos/native-f11aee9080ae9c489ac6ad121380762e/Todo.md`에 4개 checked 항목 확인. 증거: `.www/scratchpad/2026-09-07-production-workbench-todo-qa.md`. 원본에 commit·재실행 runner 정보가 부족하므로 재현성은 추가 보완 대상이다.
3. **Tracer 자동 검증** — `bun test test/trace-selection.test.ts test/project-workbench.test.ts`와 `bun test test/workbench-shell-policy.test.ts test/workbench-views.test.ts`. 최초 병렬 실행에 module resolution 오류가 있었고, 순차 재실행 결과가 위 PASS 수치다. 증거: `.www/scratchpad/2026-09-07-tracer-terra-review.md`. 미커밋 diff 검토 당시 기록이므로 현재 main 전체 통과로 해석하지 않는다.
4. **Tracer 실제 입력** — 80×36 PTY에서 `/mode plan`, 실제 요청, `/trace not-an-activity`, 40·80·120열 변경, Ctrl+D. exitCode=0. 제품 HEAD: `d8835fa7b666fffb42cc802e689c2b2ca5ede9c4`. 증거: `.www/scratchpad/2026-09-07-tracer-native-pty-terra.md`; 원본 artifact는 `99_www-pr-tracer-identity/.www/evidence/2026-09-07-tracer-native-pty-terra/`.

## 상세 기록과 연결
- Obsidian 상세 원장: `.www/vault/Development/2026-09-07-TUI-Test-Methodology.md` — 기록 ID `TEST-METHOD-2026-09-07`, Linear ID `WOO-720`.
- 각 TEST-* ID로 위 결과와 상세 원문을 대조한다. 원본에 Unit/Run ID가 없는 경우 새 값을 만들어 기존 실행 ID처럼 기록하지 않는다.
- 관련 기능별 이슈: [Chat 예외 처리](https://linear.app/woo-world/issue/WOO-719), [Todo 테스트](https://linear.app/woo-world/issue/WOO-722), [Tracer 테스트](https://linear.app/woo-world/issue/WOO-724), [Layout 테스트](https://linear.app/woo-world/issue/WOO-726).

## 남은 수락 조건
- [ ] Chat의 bodyless·failed·late delta 및 재시작을 실제 Native 경로로 검증한다.
- [ ] Todo의 resume·cross-session·저장 실패 후 복구를 검증한다.
- [ ] 실제 Plan association을 확보해 Tracer 정상 진입·다른 turn 거부·오류 후 정상 복구를 검증한다.
- [ ] Layout의 스크롤 위치 보존·focus·IME·overlay 복귀와 색상 제한을 확인한다.
- [ ] 각 실행의 commit·명령·환경·Run/Unit ID 누락을 보완하고 필수 Opus 최종 감사 판정을 연결한다.

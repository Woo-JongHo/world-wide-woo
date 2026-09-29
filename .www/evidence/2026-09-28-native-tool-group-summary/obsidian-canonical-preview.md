---
acceptance: partial
capability: Native Plan projection
code_ids:
  - Code-002
  - Code-011
decision_ids: []
document_id: 911c3fc2-5576-4651-9067-811a6238608e
domain: Todo
exception_ids: []
linear: WOO-700
parent: null
record_type: detailed-canonical
related: []
schema_version: 2
source_revision: worktree:8486a759746ab2e0748beb1ab9fdd4d250fa6b27:dirty
spec_ids: []
status: draft
tags:
  - www/spec
  - domain/todo
  - capability/native-plan
  - status/draft
test_ids: []
updated_at: 2026-09-28T05:38:25Z
---

# Native Plan projection — AI가 세운 계획을 세션별로 실시간 확인한다

## 1. Intent

사용자는 GOAL과 이를 수행하는 STAGE·PLAN·PROGRESS를 구분해 읽고, Chat에서는 대기·실행 상태 모두 계획과 진도를 우선 확인해야 한다.

## 2. Scope

Chat rail은 현재 Native 계획 항목과 진행 상태를 간결하게 표시한다. 입력창 위 HUD는 7개 STAGE의 위치만 표시한다. Monitor의 trace·span·세부 계측, 추정 진행률, 새 Runtime 이벤트 생성은 제외한다. Chat rail에는 현재 요청의 관측된 검증 명령·결과와 공개 Stage 목표·결정을 요약하며 상세 실패 원문은 /test·Monitor가 소유한다. Chat 본문은 현재 요청의 공개 Stage 목표·결과·결정과 관측 소요 시간을 순서대로 표시하고, 오른쪽 TEST는 관측된 명령·시간·통과·실패와 실패 요약을 표로 표시한다. 작업 중인 응답의 도구 요약은 RES 작성 중 카드 안에만 두고 같은 Turn의 성공·실패 명령을 모두 요약한다. 기존 Terminal/Git Bash 카드와 exit 상태는 유지한다.

## 3. Desired Behavior

Given 현재 turn에 Native checklist가 있을 때 Chat rail은 PLAN·PROGRESS를 표시하고 STAGE HUD는 현재 단계를 강조한다. Given 실행 전이면 rail은 PLAN·PROGRESS 구조를 유지하고 마지막 계획이 있으면 '최근 요청 계획'으로 구분한다. Given 계획이 미보고이면 추정 항목 대신 '계획 미보고'를 표시한다. terminal 요청에서 blocked 상태는 완료로 위장하지 않는다.

## 4. Domain Contract

INV-001: STAGE는 고정 Runtime 상태, PLAN은 Native checklist 또는 현재 request task, PROGRESS는 그 관측된 상태를 소유한다. INV-002: Chat rail의 작업 수는 실제 plan/task 항목만 센다. INV-003: 관측되지 않은 시간·비율은 표시하지 않는다. INV-004: 이전 turn의 계획은 최근 요청 계획으로 구분하고 현재 진행으로 표시하지 않는다. 기존 terminal 분자와 blocked 의미는 유지한다. INV-005: VERIFY는 동일 turn의 commandExecution 관측만 사용하고 미관측 pass/fail은 —로 남긴다. INV-006: 공개 Stage goal·decision 문장만 표시하며 비공개 추론을 수집하거나 재구성하지 않는다. INV-007: Chat workstream은 현재 turn의 공개 goal·output·decision만 보여주며 rationale과 대안은 표시하지 않는다. INV-008: TEST 총계는 모든 명령의 대응 수치가 관측됐을 때만 합산한다. INV-CHAT-TOOL-001: 작업 중인 응답의 도구 요약은 RES 작성 중 카드 안에만 표시한다. INV-CHAT-TOOL-002: 같은 Turn의 성공·실패 명령 이름과 상태를 모두 요약하며 /bin/zsh -lc 래퍼는 요약에서 생략한다. INV-CHAT-TOOL-003: 각 명령의 기존 Terminal/Git Bash 카드, exit 상태와 /source를 유지한다. 공개 Native 설명은 기존 응답에 남기고 목적을 추측하지 않는다.

## 5. State Model

Stage는 pending·running·completed·skipped·failed·blocked를 투영한다. Chat HUD는 7개 상태를 한 줄에 배치하고 폭이 부족하면 약어, 더 좁으면 현재 단계만 표시한다. Chat rail은 idle·working 모두 PLAN·PROGRESS를 유지한다. 실행 진단과 시스템 정보는 F4 Monitor 화면의 책임이다.

## 6. Data & Runtime Flow

WorkbenchSnapshot의 activeTurnId가 있으면 현재 requestRuntime stage/task와 같은 turn의 Native checklist를 읽고, 없으면 workFlow source의 마지막 turn 계획을 최근 요청 계획으로 구분해 Chat rail에 투영한다. Stage HUD는 현재 요청만 읽는다. Monitor 원본 trace는 기존 화면에 남으며 새 이벤트를 만들지 않는다.

## 7. Identity & Persistence Contract

Request ID·turn ID·stage ID·계획 항목 ID를 변경하지 않는다. rail과 HUD는 저장하지 않는 presentation이며 이전 turn을 현재 상태로 재귀속하지 않는다.

## 8. Integration Contract

Request Runtime과 Native plan projection이 사실을 소유한다. Chat은 PLAN·PROGRESS 요약, HUD는 STAGE 위치, Monitor는 상세 실행 trace를 소유한다. WOO-680은 폭과 composer 배치 책임으로 연결한다. Chat VERIFY는 request-test-workspace 투영을 재사용하고 /test·Monitor 상세로 연결한다. 별도 narrator 모델 호출 없이 기존 Native commentary와 Activity journal을 Chat 렌더가 결합한다.

## 9. Failure & Recovery Contract

계획이 없으면 '계획 미보고', 작업 수가 없으면 비율 대신 대시를 표시한다. 좁은 terminal에서 7개 전체 이름이 맞지 않으면 약어 또는 현재 단계로 축소한다. 중단 상태는 failed·blocked 기호를 유지하며 재시도는 별도 Runtime 요청이 소유한다.

## 10. Acceptance Contract

AC-CHAT-001: 대기·실행 중 Chat rail에서 PLAN·PROGRESS가 유지되고 Monitor trace section은 나타나지 않는다. AC-CHAT-002: active request가 있을 때 7개 STAGE가 HUD에 표시되며 좁은 폭에서 정렬이 유지된다. AC-CHAT-003: idle에서 마지막 계획은 최근 요청으로 표시하며 계획이 없으면 '계획 미보고'를 표시한다. AC-CHAT-004: 계획·duration이 미관측이면 값이나 진행률을 만들지 않는다. 실제 TUI 사용자 수락은 partial이다. AC-CHAT-005: 현재 turn의 검증 명령과 관측된 pass/fail이 Chat rail에 보이며 다른 turn 결과는 섞이지 않는다. AC-CHAT-006: 공개 Stage 목표·결정만 표시하고 비공개 reasoning은 나오지 않는다. AC-CHAT-007: Chat 본문에서 공개 단계 결과를 시간순으로 읽을 수 있다. AC-CHAT-008: 오른쪽 TEST 표에는 관측된 명령별 시간·통과·실패와 실패 suite가 보인다. AC-CHAT-TOOL-001: 작성 중인 RES 안에서 성공·실패 명령 모두를 짧게 읽는다. AC-CHAT-TOOL-002: 각 명령의 원본 Terminal/Git Bash 카드와 exit 상태가 계속 보인다.

## 11. Verification Strategy

www-ui·www-telemetry-duration·www-shell 100건과 타입 검사·변경 파일 diff 검사를 통과했다. 전체 suite의 기존 결과는 1597건 통과, 가독성 스킬 링크 대상 누락으로 2건 실패했다. 실제 TUI 사용자 수락과 외부 정본 read-back은 남았다. 도구 묶음 추가 후 관련 131개 테스트와 타입 검사·diff 검사 통과. 2026-09-28 정정 후 Chat UI·transcript cache·render acceptance 116개와 타입 검사·diff 검사를 통과했다.

## 12. Implementation Map

www-monitor-view.ts의 compact runInspector가 Chat rail을, www-surface.ts의 WwwStageHud가 단계 한 줄을, workbench-shell.ts가 composer 위 배치를 소유한다. full WwwMonitorView는 상세 Monitor로 남긴다. www-execution.ts의 durableBlocks와 appendToolGroupBlock이 표시를 소유한다.

## 13. Current State & Gaps

Chat 공개 workstream과 PLAN·PROGRESS·TEST 레이아웃은 로컬 구현·회귀를 통과했다. 실제 TUI 사용자 수락, 최신 Linear·Vault read-back, 가독성 스킬 링크 복구는 남아 있다. 실 TUI 수동 수락과 원격 Linear·Vault read-back은 미실행이다.

## 14. Decisions & Evidence

DEC-CHAT-HUD-001 approved by user: Chat rail은 PLAN·PROGRESS를 먼저 보여주고 STAGE는 composer 위 한 줄 HUD로 분리한다. 7단계 전체 pipeline을 rail과 Chat transcript에 중복하는 대안은 주의 분산으로 기각한다. DEC-CHAT-HUD-002 requested by user: idle에서도 Chat rail은 PLAN·PROGRESS를 유지한다. 이전 READY inspector 전환은 의도한 설계와 달라 폐기한다. 사용자의 2026-09-28 정정과 www-monitor-view.ts·www-telemetry-duration.test.ts가 근거다. 최신 Vault bytes와 독립 검토는 게시 전에 확인해야 한다. DEC-CHAT-HUD-003: 사용자 2026-09-28 정정에 따라 Chat rail에서 검증을 함께 보고 공개된 목표·결정으로 작업의 방향을 읽는다. 비공개 chain-of-thought는 표시 대상이 아니다. DEC-CHAT-HUD-004: 사용자 ASCII 화면 예시에 따라 Chat 본문을 공개 workstream으로, 오른쪽 레일을 PLAN·PROGRESS·TEST로 구성한다. 원본에서 검증되지 않은 수치는 생성하지 않는다. DEC-CHAT-TOOL-001: 사용자가 속도를 우선해 Native가 이미 출력한 공개 목적을 재사용한다. 별도 모델 호출은 추가하지 않는다. 설명이 없으면 목적을 추측하지 않는다. DEC-CHAT-TOOL-002: 사용자 정정에 따라 실패 호출만 나열하는 방식과 완료된 Git Bash 카드를 그룹에 숨기는 방식을 폐기했다. 현재 RES 초안 안에 모든 명령의 짧은 요약을 표시하고 원본 카드는 유지한다.

## Change Log

2026-09-27 GOAL·STAGE·PLAN·PROGRESS와 terminal 진행률 계약을 반영했다. 2026-09-28 Chat rail의 PLAN·PROGRESS 우선 구조 및 Stage HUD 표시 책임을 반영했다. 같은 날 idle READY inspector 전환을 폐기하고 PLAN·PROGRESS 고정 구조로 정정했다. 2026-09-28: Chat rail에 현재 turn VERIFY 요약과 공개 목표·결정을 추가했다. 2026-09-28: Chat 공개 workstream과 PLAN·PROGRESS·TEST 표 레이아웃을 추가했다. 2026-09-28: Native 공개 목적 아래 연속 도구 호출을 묶고 실패·원본 조회 계약을 추가했다. 2026-09-28: 사용자 정정에 따라 도구 요약을 작성 중인 RES에 배치하고 성공·실패 명령 전체와 원본 카드 보존 계약을 반영했다.

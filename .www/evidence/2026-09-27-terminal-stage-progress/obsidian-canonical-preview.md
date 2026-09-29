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
source_revision: worktree:495f61c0f3d5e3c9c6d58340d315c06b4ad70cc0:dirty
spec_ids: []
status: active
tags:
  - www/spec
  - domain/todo
  - capability/native-plan
  - status/partial
test_ids: []
updated_at: 2026-09-27T13:09:16+09:00
---

# Native Plan projection — AI가 세운 계획을 세션별로 실시간 확인한다

## 1. Intent

사용자는 GOAL과 이를 수행하는 STAGE·PLAN·PROGRESS를 구분해 읽고, 요청이 중단됐을 때 진행 중인지 terminal 결과인지 오해하지 않아야 한다.

## 2. Scope

In scope는 STAGE 진행률, 상태 기호, failed·blocked 종료 사유, PLAN task와 PROGRESS 계층이다. Runtime의 상태 전이 의미, 중단을 자동 성공 처리하는 복구, 외부 게시는 제외한다.

## 3. Desired Behavior

Given 일부 단계가 completed이고 마지막 단계가 blocked인 요청에서, STAGE는 모든 terminal 단계를 진행률에 포함해 7/7을 표시하고 blocked 단계의 실제 output을 보여준다. blocked는 완료 기호로 바꾸지 않는다.

## 4. Domain Contract

INV-001: STAGE는 고정 Runtime 상태, PLAN은 task와 의존성, PROGRESS는 해석된 활동을 소유한다. INV-002: 진행률은 성공률이 아니라 terminal 단계 수다. INV-003: pending·running만 미종료이며 completed·skipped·failed·blocked는 terminal이다. INV-004: failed·blocked의 사용자 설명은 일반 goal보다 실제 stage output을 우선한다.

## 5. State Model

Stage는 pending·running·completed·skipped·failed·blocked를 투영한다. completed/skipped는 ✓, running은 ›, pending은 ○, failed는 ×, blocked는 Ⅱ다. 진행률 분자는 completed·skipped·failed·blocked 수다.

## 6. Data & Runtime Flow

Native terminal event → Request Runtime stage status·output → requestRuntimeRows terminal count → STAGE 진행률과 active terminal summary로 흐른다. Runtime record는 변경하지 않는다.

## 7. Identity & Persistence Contract

Request ID·turn ID·stage ID와 기존 기록을 유지한다. 화면은 저장된 status·output을 읽기만 하며 interrupted request를 completed로 다시 쓰지 않는다.

## 8. Integration Contract

Request Runtime이 상태와 종료 사유를 소유하고 request-runtime-view가 이를 투영한다. WOO-688의 중단 의미와 WOO-700의 STAGE 화면 책임을 연결하되 두 이슈의 소유권을 합치지 않는다.

## 9. Failure & Recovery Contract

Native 중단은 blocked로 남는다. 화면은 이를 6/7 running처럼 숨기지 않고 7/7 terminal과 실제 'Native 실행이 중단되었습니다.'로 표시한다. 재시도·후속 요청은 별도 Runtime 요청이 소유한다.

## 10. Acceptance Contract

AC-STAGE-001: terminal 단계 수가 STAGE 분자다. AC-STAGE-002: completed 6개와 blocked 1개는 7/7이며 BLOCKED 의미를 유지한다. AC-STAGE-003: failed·blocked 단계는 실제 output을 표시한다. 자동 회귀는 PASS이고 실제 TUI 사용자 수락은 partial이다.

## 11. Verification Strategy

request-runtime.test.ts가 Native interrupted projection의 7/7과 중단 문구를 검증하고 www-ui.test.ts가 주변 화면 회귀를 검증한다. TypeScript, import normalization, table alignment, diff check를 함께 실행한다.

## 12. Implementation Map

request-runtime-view.ts의 requestRuntimeRows가 terminal count와 activeSummary를 소유한다. request-runtime.test.ts의 interrupted Native turn 회귀가 계약을 고정한다.

## 13. Current State & Gaps

terminal 진행률과 실제 중단 사유 표시는 구현됐고 관련 97개 테스트와 정적 게이트가 통과했다. 실제 TUI 수동 수락과 외부 정본 게시·read-back은 남아 있다.

## 14. Decisions & Evidence

DEC-STAGE-TERMINAL-001 approved: STAGE 분자는 성공한 단계 수가 아니라 terminal 단계 수로 표시한다. 중단을 completed로 위장하는 대안은 실제 전달 실패를 숨겨 기각했고, blocked를 분자에서 제외하는 대안은 종료 요청을 영구 정체처럼 보여 기각했다. 결정 권한은 2026-09-27 사용자 요청이며 Evidence는 .www/evidence/2026-09-27-terminal-stage-progress다.

## Change Log

2026-09-27 GOAL·STAGE·PLAN·PROGRESS 계층을 반영했다. 2026-09-27 terminal 진행률과 failed·blocked 실제 output 우선 표시 계약을 추가했다.

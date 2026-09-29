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
updated_at: 2026-09-27T15:48:09+09:00
---

# Native Plan projection — AI가 세운 계획을 세션별로 실시간 확인한다

## 1. Intent

사용자는 요청을 보낸 직후부터 현재 Session Goal과 7개 Stage 진행을 함께 읽어야 하며, 이해 단계 완료를 기다리는 동안 GOAL이 비어 보여서는 안 된다.

## 2. Scope

요청 접수 objective의 provisional Goal, UNDERSTAND 결과의 정제, queued follow-up Goal 연속성, GOAL·STAGE projection을 포함한다. 7단계 의미와 완료 evidence 정책 변경은 제외한다.

## 3. Desired Behavior

활성 요청이 시작되면 request objective를 즉시 Session Goal로 표시한다. UNDERSTAND가 완료되면 그 결과로 같은 Goal을 정제한다. queued follow-up은 현재 snapshot의 Goal을 문맥으로 이어받는다. 요청이 없는 idle 화면에는 임시 GOAL을 만들지 않는다.

## 4. Domain Contract

INV-GOAL-001: 활성 요청의 Goal source는 UNDERSTAND 완료 전 request-started objective이고 완료 뒤 understood 결과다. INV-GOAL-002: Goal source 교체는 같은 요청 identity 안에서만 일어난다. INV-GOAL-003: queued follow-up은 private cache가 아니라 현재 projection의 Goal을 사용한다. INV-GOAL-004: idle 상태는 Goal을 발명하지 않는다.

## 5. State Model

요청 생성 시 provisional Goal이 생기고 UNDERSTAND 완료 시 refined Goal로 전이한다. 요청이 terminal 상태가 되어도 해당 snapshot의 Goal은 유지되며 새 요청이 시작되면 새 request identity의 provisional Goal로 교체된다.

## 6. Data & Runtime Flow

request-started objective → Workbench snapshot provisional Goal → GOAL HUD로 흐르고, UNDERSTAND output → 같은 snapshot의 refined Goal로 대체된다. queued follow-up context는 snapshot Goal을 읽는다.

## 7. Identity & Persistence Contract

Request ID와 Goal source stage를 유지한다. provisional과 refined 값은 별도 영속 정본이 아니라 현재 Request Runtime journal에서 재구성되는 projection이다.

## 8. Integration Contract

project-workbench가 journal의 request-started와 understood event를 우선순위로 해석한다. www-surface는 전달된 sessionGoal만 표시하며 Goal을 자체 생성하지 않는다.

## 9. Failure & Recovery Contract

UNDERSTAND가 지연되거나 실패해도 provisional Goal은 유지된다. objective가 없는 비정상 journal이면 Goal을 발명하지 않는다. 다음 유효 snapshot에서 정상 source를 다시 투영한다.

## 10. Acceptance Contract

AC-GOAL-001: 요청 접수 snapshot에 objective 기반 Session Goal이 존재한다. AC-GOAL-002: UNDERSTAND 완료 뒤 정제 결과가 표시된다. AC-GOAL-003: queued follow-up이 provisional Goal을 이어받는다. AC-GOAL-004: idle 화면에는 GOAL이 없다. 자동 회귀는 PASS이고 실제 재시작 TUI 수락은 남아 partial이다.

## 11. Verification Strategy

project-workbench.test.ts로 provisional·refined Goal을, queued recording 회귀로 follow-up 문맥을, www-ui.test.ts로 Goal 표시 경계를 검증한다. 타입·가독성·diff 검사를 함께 적용한다.

## 12. Implementation Map

src/core/application/orchestration/project-workbench.ts가 Goal source 선택과 follow-up context를 소유하고 src/adapters/inbound/tui/shell/www-surface.ts가 HUD projection을 소유한다.

## 13. Current State & Gaps

provisional Goal과 UNDERSTAND 정제, queued 연속성이 구현됐고 관련 회귀 166개와 정적 검사가 통과했다. 실제 재시작 TUI 사용자 수락과 독립 provider 감사 판정은 남아 있다.

## 14. Decisions & Evidence

DEC-GOAL-002 approved: GOAL은 UNDERSTAND 완료까지 숨기지 않고 request objective를 provisional source로 쓴다. DEC-GOAL-003 approved: queued follow-up은 현재 snapshot Goal을 사용한다. 사용자 요구와 .www/evidence/2026-09-27-goal-render-hud-repair의 자동 검증이 근거다. Claude Sonnet·Opus 감사는 max-turn 제한으로 판정을 회수하지 못했다.

## Change Log

2026-09-27 요청 직후 provisional Session Goal과 UNDERSTAND 완료 시 정제 전이 계약을 추가했다. queued follow-up의 snapshot Goal 연속성을 명시했다.

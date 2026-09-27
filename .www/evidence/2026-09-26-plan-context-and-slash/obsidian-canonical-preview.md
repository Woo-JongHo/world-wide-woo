---
acceptance: partial
capability: Native Plan projection
code_ids:
  - Code-002
  - Code-011
decision_ids:
  - DEC-PLAN-CONTEXT-001
document_id: 911c3fc2-5576-4651-9067-811a6238608e
domain: Todo
exception_ids:
  - EXC-PLAN-CONTEXT-001
  - EXC-PLAN-CONTEXT-002
linear: WOO-700
parent: null
record_type: detailed-canonical
related: []
schema_version: 2
source_revision: worktree:49898145b1348f85f9268d12c6451abe9dbc3f3e:dirty
spec_ids:
  - SPEC-PLAN-CONTEXT-001
status: active
tags:
  - www/spec
  - domain/todo
  - capability/native-plan
  - status/partial
test_ids:
  - TEST-PLAN-CONTEXT-001
  - TEST-PLAN-CONTEXT-002
  - TEST-PLAN-CONTEXT-003
updated_at: 2026-09-26T10:26:45+09:00
---

# WOO-700

## 1. Intent

사용자는 실행 중 같은 맥락의 후속 입력을 queue에 추가해도 기존 PLAN과 PROGRESS를 계속 읽어야 한다. 새 turn의 공개 Plan이 도착하면 그때 새 계획으로 자연스럽게 전환한다.

## 2. Scope

In scope는 queued turn 시작부터 새 Plan 수신 또는 terminal 종료까지 PLAN 선택과 PROGRESS 결속을 유지하는 일이다. 서로 다른 thread 병합, 관측되지 않은 Plan 생성, 수동 Plan 편집은 제외한다.

## 3. Desired Behavior

Given 현재 turn의 Plan이 보이는 중 같은 thread에 후속 입력이 queue되었을 때, When queued turn이 시작됐지만 아직 Plan이 없으면, Then 기존 PLAN과 그 turn의 PROGRESS를 유지한다. 새 turn의 Plan이 durable journal에 기록되면 새 PLAN으로 전환한다. 새 Plan 없이 terminal이면 보류 상태를 해제해 다음 queued turn이 정상 전환될 수 있게 한다.

## 4. Domain Contract

INV-001: selected Plan turn과 PROGRESS source turn은 같은 turn을 가리킨다. INV-002: queued turn 시작만으로 기존 Plan을 지우지 않는다. INV-003: 새 Plan은 durable journal append 성공 뒤에만 선택한다. INV-004: 다른 thread의 Plan과 activity는 현재 projection에 섞지 않는다.

## 5. State Model

stable은 현재 selected Plan이 보이는 상태다. deferred는 같은 thread의 queued turn이 시작됐지만 새 Plan이 아직 없는 상태다. replaced는 새 Plan append 뒤 selected turn이 새 turn으로 바뀐 상태다. released는 deferred turn이 Plan 없이 terminal이 되어 다음 전환을 허용하는 상태다.

## 6. Data & Runtime Flow

Native queued input → turn start → deferredPlanTurnId 설정 → 기존 selectedPlanTurnId 유지 → turn/plan/updated journal append → selectedPlanTurnId 교체 → PLAN·PROGRESS projection 갱신. terminal이 먼저 오면 deferredPlanTurnId만 해제한다.

## 7. Identity & Persistence Contract

threadId·turnId·Plan revision을 유지한다. selectedPlanTurnId와 deferredPlanTurnId는 process projection 상태이며 Plan 원본과 Activity는 기존 durable journal과 Todo 저장 계약을 따른다. 재개 시 관측된 durable facts만 사용한다.

## 8. Integration Contract

ProjectWorkbench가 Native lifecycle과 journal 순서를 소유하고, Plan·Workflow view는 projection을 읽기만 한다. WOO-912는 PLAN/PROGRESS/NEXT 화면 표기를, WOO-909는 slash suggestion과 command 경계를 소유한다.

## 9. Failure & Recovery Contract

EXC-PLAN-CONTEXT-001: 새 Plan journal append 실패 시 기존 PLAN을 유지하고 새 Plan을 선택하지 않는다. EXC-PLAN-CONTEXT-002: deferred turn이 completed·failed·interrupted·cancelled/canceled로 끝나면 보류를 해제한다. 두 경우 모두 기존 durable Plan과 Progress를 보존한다.

## 10. Acceptance Contract

AC-PLAN-001: queued turn 시작 직후 기존 PLAN과 PROGRESS 유지. AC-PLAN-002: 새 Plan journal append 뒤 새 turn으로 전환. AC-PLAN-003: Plan 없는 queued terminal 뒤 다음 queued turn이 막히지 않음. 세 자동 회귀는 PASS이며 실제 TUI 연속 입력 수동 관측은 남아 있다.

## 11. Verification Strategy

TEST-PLAN-CONTEXT-001은 test/project-workbench-recording.test.ts에서 기존 Plan 유지와 새 Plan 전환을 검증한다. TEST-PLAN-CONTEXT-002는 Plan 없는 terminal 뒤 다음 queued turn을 검증한다. TEST-PLAN-CONTEXT-003은 PROGRESS가 active queued turn이 아니라 retained Plan turn을 따르는지 검증한다.

## 12. Implementation Map

ProjectWorkbench의 deferredPlanTurnId와 Plan selection이 상태 전환을 소유한다. workbench-shell과 Plan·Workflow·Monitoring view는 PLAN/PROGRESS/NEXT 대문자 라벨을 표시한다. workbench-input.controller는 bare slash 제출을 거부한다.

## 13. Current State & Gaps

queued Plan 보존·전환·terminal release, PROGRESS 결속, bare slash 차단, PLAN/PROGRESS/NEXT 대문자 표기가 구현됐다. TypeScript 검사와 전체 1573 pass·0 fail·21507 expect, 변경 TypeScript 가독성 검사, diff 검사가 통과했다. 실제 TUI에서 연속 queue 입력과 slash popup 조작을 관측한 수동 Evidence는 아직 없다.

## 14. Decisions & Evidence

DEC-PLAN-CONTEXT-001 approved: 같은 thread의 queued 후속 입력은 새 Plan이 durable하게 도착할 때까지 이전 Plan을 유지한다. 이유는 사용자가 같은 작업 맥락의 진행 상태를 잃지 않게 하기 위해서다. 즉시 초기화 대안은 화면 공백과 맥락 단절을 만들므로 기각했다. 잘못되면 다른 요청의 계획이 잠시 보일 수 있으므로 same-thread queued 경계와 terminal release를 함께 적용한다. 결정 권한은 2026-09-26 사용자 요청이며 근거는 변경 코드와 전체 회귀다.

## Change Log

2026-09-07 legacy 상세 정본 작성. 2026-09-26 same-context queued 입력의 Plan 유지·교체 결정과 구현·검증 결과를 schema v2 Candidate로 반영.

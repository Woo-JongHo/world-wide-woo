---
acceptance: not-tested
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
source_revision: git:0e7d421b5da741d39b34895a6d2d1fbdb3ff14be:dirty
spec_ids: []
status: draft
tags:
  - www/spec
  - domain/todo
  - capability/native-plan
  - status/partial
test_ids: []
updated_at: 2026-10-01T00:00:00Z
---

# Native Plan projection — AI가 세운 계획을 세션별로 실시간 확인한다

## 1. Intent

사용자는 모든 요청에서 UNDERSTANDING → WORKING → REPORTING 순서를 읽고, 계획이 필요할 때만 Native Plan과 진행 항목을 본다. WWW는 공개 Activity에 없는 실행 사실을 만들지 않는다.

## 2. Scope

일반 observe 요청의 Request Runtime v4와 Chat·Monitor 상태 표시를 다룬다. Native 도구 실행 권한, 외부 게시 승인, Broker의 별도 계약은 이 세 단계 표시가 대체하지 않는다. 기존 v1~v3 Activity 재생은 유지한다.

## 3. Desired Behavior

요청 직후 UNDERSTANDING을 표시한다. Native는 목표와 Plan 필요 여부·이유를 공개 보고한다. Plan이 불필요하면 WORKING을 표시하고, 필요하면 같은 turn의 유효한 Native Plan revision을 관측한 뒤 WORKING을 표시한다. 결과 보고 이후 REPORTING을 표시하고 최종 응답까지 유지한다. PLAN 패널은 Native Plan 항목을, PROGRESS 패널은 관측된 작업을 독립적으로 보여준다.

## 4. Domain Contract

INV-001: WWW가 세 단계의 표시 상태와 재생을 소유한다. INV-002: Native가 Plan 필요 여부와 이유를 보고하고 Plan 항목·진행은 Native Plan이 소유한다. INV-003: 현재 요청과 다른 turn, 빈 Plan, 잘못된 revision은 WORK 시작 조건이 아니다. INV-004: 공개 보고 누락·파싱 실패는 단계를 추정 완료시키지 않는다. INV-005: 단계 보고는 도구 실행 또는 외부 쓰기의 승인으로 취급하지 않는다.

## 5. State Model

v4의 UNDERSTAND·WORK·RESULT checkpoint를 사용자에게 UNDERSTANDING·WORKING·REPORTING으로 표시한다. submitted는 UNDERSTAND running, 유효한 UNDERSTAND 보고는 observed, Plan 불필요 또는 같은 turn Native Plan은 WORK running, 유효한 RESULT 보고는 WORK observed와 RESULT running, 최종 응답은 RESULT observed로 만든다. Native turn 종료는 별도로 request completed·failed·blocked를 결정한다. 보고가 빠지면 미관측 상태와 issue를 보존한다. 마지막 checkpoint가 observed여도 turn이 끝나기 전에는 REPORTING을 유지한다.

## 6. Data & Runtime Flow

ProjectWorkbench가 v4 additionalContext를 Native에 전달한다. Native 공개 보고와 Native Plan revision이 Activity journal에 쌓인다. Request Runtime projection이 같은 turn의 보고·Plan을 검증해 checkpoint와 planDecision을 계산한다. TUI는 이 projection을 세 단계 상태로 표시하고 Native Plan·PROGRESS를 별도로 읽는다.

## 7. Identity & Persistence Contract

Request ID와 active turn ID를 결속한다. UNDERSTAND 보고의 goal·planRequired·planReason과 Plan Activity ID를 journal에서 재생 가능한 decision으로 저장한다. 이전 turn의 Plan이나 사용자·도구 출력에 있는 위조 보고는 현재 단계에 귀속하지 않는다. 기존 v1~v3 기록의 재생 의미를 변경하지 않는다.

## 8. Integration Contract

Native는 요청 복잡도에 따라 update_plan 사용 여부와 항목 진행을 결정한다. WWW는 v4 보고 형식을 additionalContext로 요청하고 공개 Activity만 재생한다. Plan이 필요한 요청에서 WORK 표시 시작은 Native Plan revision 관측에 의존한다. 물리적인 도구 실행 차단은 이 projection의 책임이 아니다.

## 9. Failure & Recovery Contract

UNDERSTAND 보고가 누락되거나 잘못되면 WORK를 추정 시작하지 않고 프로토콜 issue를 남긴다. Plan이 필요한데 유효한 현재 turn Plan이 없으면 WORK는 pending이다. RESULT 보고가 누락되면 최종 응답이나 turn 완료만으로 RESULT checkpoint를 완료로 꾸미지 않는다. 재개 시 같은 journal을 재생해 상태를 복원한다.

## 10. Acceptance Contract

AC-001: 단순 요청에서 Plan 불필요 이유가 기록되고 UNDERSTANDING·WORKING·REPORTING이 순서대로 보인다. AC-002: 복합 요청에서 같은 turn Native Plan 이후 WORKING이 시작한다. AC-003: Plan 항목 변화가 PLAN·PROGRESS에 반영된다. AC-004: 잘못된·누락된·다른 turn 보고는 완료로 표시하지 않는다. 실제 TUI 두 시나리오에서 checkpoint 관측을 확인했으나 최종 상태줄 수정 뒤 재실행과 전체 회귀 테스트, 독립 검토는 남아 있다.

## 11. Verification Strategy

타입·아키텍처 검사를 실행하고, Runtime의 Plan 필요/불필요·위조·누락·다른 turn·실패 재생과 ProjectWorkbench Native context 수신, TUI 상태를 확인한다. 실제 Native TUI에서 단순·복합 요청을 실행해 journal과 표시를 대조한다. 전체 관련 테스트와 독립 Sonnet·Opus 감사도 수락 전에 확인한다. 현재 집중 테스트는 통과했지만 전체 테스트 파일에 과거 7단계 기대값 등 실패가 남고 감사 호출은 Execution error였다.

## 12. Implementation Map

request-runtime.ts(domain)이 v4 보고와 Plan decision을 정의하고 request-protocol.ts가 Native context를 만든다. request-runtime.ts(runtime)가 journal을 재생하며 project-workbench.ts가 context를 연결한다. www-surface.ts는 상태줄을, www-plan-view.ts·www-monitor-view.ts는 Plan·Progress와 판단 이유를 표시한다.

## 13. Current State & Gaps

v4 로컬 구현과 두 실제 Native TUI 시나리오를 확인했다. 상태줄 마지막 checkpoint 유지 수정은 TUI 단위 테스트만 완료했다. 전체 request-runtime·project-workbench 테스트의 기존 기대값 실패, 가독성 검사 스킬 경로 누락, Sonnet·Opus 독립 검토 실패가 남는다. Vault에는 구형 WOO-700.md가 있고 schema v2 target은 아직 없으므로 이 후보는 draft이며 게시 전 이관·경로·digest를 다시 검증해야 한다.

## 14. Decisions & Evidence

2026-10-01 사용자 요구: 모든 요청을 UNDERSTANDING·WORKING·REPORTING으로 표현하고 UNDERSTANDING에서 Plan 필요 여부를 판단한다. 결정: WWW는 관측 가능한 단계 표시와 재생을 소유하고 Native는 Plan 판단·항목 갱신을 소유한다. 이유: Plan이 없는 단순 요청과 실제 Plan이 있는 복합 요청을 같은 고정 계획으로 꾸미지 않기 위해서다. 대안인 모든 요청의 Plan 강제는 단순 요청의 불필요한 항목을 만든다. 위험: 모델 보고를 신뢰하는 관측 계약이라 실제 도구 실행을 물리적으로 막지는 않는다. Evidence: .www/evidence/2026-10-01-three-phase-runtime/local-verification.md. 독립 검토 미완료와 전체 테스트 실패 때문에 active·수락 완료로 승격하지 않는다.

## Change Log

2026-09-28 일반 observe 표시를 GOAL·Native PLAN·해석된 PROGRESS 중심으로 개정하고 질문 배경과 검증 선택 경계를 기록했다. 기존 Chat 7단계 HUD 일반 표시 결정은 이 결정으로 대체한다.
2026-09-29 사이드바 REPORT 4필드 투영과 최신 PROGRESS 5개·한 줄 TOP 표시를 draft에 추가했다.
2026-09-29 네 구역 20:40:20:20 사용자 결정을 로컬 draft에 추가했다. Vault read-back과 게시 승인은 남아 있다.
2026-10-01 세 단계 Request Runtime v4와 UNDERSTAND의 선택적 Native Plan 판단 계약을 로컬 draft에 추가했다. 실제 TUI 두 시나리오와 남은 검증 경계를 기록했다.

---
acceptance: partial
capability: Run trace
code_ids: []
decision_ids: []
document_id: 5fb2c04b-42fa-4720-9918-2a99d314b726
domain: Monitor
exception_ids: []
linear: WOO-675
parent: null
record_type: detailed-canonical
related: []
schema_version: 2
source_revision: worktree:8486a759746ab2e0748beb1ab9fdd4d250fa6b27:dirty
spec_ids: []
status: draft
tags:
  - www/spec
  - domain/monitor
  - capability/run-trace
  - status/draft
test_ids: []
updated_at: 2026-09-28T12:00:00+09:00
---

# Run trace — 현재 요청의 실행과 실패를 관찰한다

## 1. Intent

사용자는 현재 질문의 실행을 실시간 Monitor에서 읽고, Dashboard의 질문 목록에서 지난 질문의 같은 관측 기록을 다시 열어야 한다.

## 2. Scope

현재 세션의 Request Runtime 기록을 Dashboard에 최신순으로 표시한다. 현재 Monitor는 실시간 투영을 사용하고 기록 Monitor는 선택한 request ID와 turn ID의 활동·계획만 표시한다. Chat 우측 패널은 언제나 현재 요청을 사용한다. Cache·Context 화면은 기본 탐색에서 보류하되 직접 명령과 구현은 유지한다.

## 3. Desired Behavior

Dashboard는 세션 요약 다음에 질문별 상태와 목표를 보여주고 ↑↓·Enter 또는 /monitor #번호로 선택한 기록을 연다. /monitor는 선택을 해제하고 현재 요청을 보여준다. 완료 기록의 경과 시간은 완료 시각에서 멈춘다. 다른 세션으로 전환하면 선택은 해제된다.

## 4. Domain Contract

INV-MON-006: 기록 선택은 request ID를 사용하며 목록 번호는 현재 화면 순서일 뿐 영속 ID가 아니다. INV-MON-007: 기록 Monitor의 활동과 계획은 선택한 turn ID로 제한한다. INV-MON-008: Chat 우측 Monitor는 기록 선택의 영향을 받지 않는다. INV-MON-009: 완료 시각이 있는 기록의 경과 시간은 현재 시각으로 증가하지 않는다. 기존 INV-MON-001~005의 읽기 전용·관측 진실성 계약도 유지한다.

## 5. State Model

Monitor는 현재 요청 실시간 모드와 선택한 요청 기록 모드를 갖는다. Dashboard 선택 인덱스는 현재 목록 안에서만 유효하며 실제 기록 식별은 request ID다. 세션 전환 또는 /monitor는 기록 선택을 해제한다.

## 6. Data & Runtime Flow

WorkbenchSnapshot의 requestRuntime을 현재 thread ID로 걸러 Dashboard 목록을 만든다. 선택한 request ID의 turn ID로 activities와 planActivities를 걸러 RuntimeMonitorProjection과 WwwMonitorView에 전달한다. Chat 우측 패널은 별도 live projection을 계속 읽는다.

## 7. Identity & Persistence Contract

Request ID는 기록 선택의 안정적 키이며 목록 번호는 최신순 표시 인덱스다. Request Runtime과 Activity journal이 기존 기록을 보유하고 별도의 Monitor 기록 DB는 만들지 않는다. 현재 세션 범위에서만 목록을 표시한다.

## 8. Integration Contract

Dashboard는 기록 목록과 선택 진입을 소유하고 Monitor는 실시간·선택 기록의 읽기 화면을 공유한다. Shell은 선택 ID와 탐색을 조립한다. /cache와 /context는 직접 명령으로만 열 수 있다.

## 9. Failure & Recovery Contract

현재 세션에 기록이 없으면 Dashboard는 빈 상태를 표시한다. 잘못된 /monitor #번호는 기록 없음 안내를 표시하고 선택을 바꾸지 않는다. 세션 전환으로 선택 기록이 사라지면 실시간 모드로 돌아간다. 기록의 turn ID가 없으면 다른 요청의 활동을 가져오지 않는다.

## 10. Acceptance Contract

AC-MON-007: Dashboard가 현재 세션 질문을 최신순으로 표시한다. AC-MON-008: ↑↓·Enter와 /monitor #번호가 선택한 질문의 Monitor를 연다. AC-MON-009: /monitor가 실시간 모드로 돌아가며 Chat 우측 실시간 패널은 기록 선택과 무관하다. AC-MON-010: 완료 기록의 시간은 고정된다. 관련 자동 테스트 150개와 타입 검사는 통과했고 셸 입력 수락은 통과했고 실제 터미널 수동 수락과 독립 리뷰는 남아 있어 acceptance는 partial이다.

## 11. Verification Strategy

키맵·Dashboard 렌더·Shell 정책 테스트로 기본 탐색과 질문 목록을 확인한다. 150개 관련 테스트, TypeScript, diff 검사가 통과했다. 셸 입력 테스트에서 ↑↓·Enter와 /monitor 실시간 복귀를 확인했다. 실제 터미널에서 세션 전환과 기록 열기 후 Chat 우측 실시간 표시를 추가 확인한다.

## 12. Implementation Map

entry-dashboard-view.ts가 요청 목록을, www-monitor-view.ts가 기록 표시와 고정 경과 시간을, workbench-shell.ts와 workbench-input-routing.ts가 요청 선택·모드 분리를, workbench-command-router.ts가 /monitor #번호를 소유한다. www-keymap.ts와 www-demo.ts가 보류한 화면의 기본 진입을 숨긴다.

## 13. Current State & Gaps

질문 기록 목록·선택·기록 Monitor 연결과 실시간 Chat 패널 분리가 구현됐다. 150개 관련 테스트와 타입 검사·diff 검사는 통과했다. 지정 가독성 스크립트는 끊어진 symlink 때문에 미실행이며 실제 터미널 수락, 독립 리뷰, Vault read-back이 남아 있다.

## 14. Decisions & Evidence

DEC-MON-004 proposed: Dashboard는 세션 요약과 질문별 Monitor 기록 목록을 함께 제공한다. DEC-MON-005 proposed: Monitor는 실시간과 선택 기록을 같은 화면으로 표시하며 Chat 우측 패널은 실시간을 고정한다. DEC-MON-006 proposed: Cache·Context 화면은 삭제하지 않고 기본 탐색에서 숨긴다. 근거는 사용자 요청, 코드 변경, 150개 테스트 통과이며 독립 검토 전 draft로 유지한다.

## Change Log

2026-09-28 현재 질문 실시간 Monitor와 Dashboard 요청별 기록 탐색, Cache·Context 기본 탐색 보류 계약을 draft로 개정했다.

---
acceptance: partial
capability: Usage Dashboard
code_ids: []
decision_ids:
  - DEC-USAGE-001
  - DEC-USAGE-002
  - DEC-USAGE-003
document_id: 2a2fc684-7d04-4813-9867-1cd1afd4d067
domain: Stats
exception_ids: []
linear: WOO-714
parent: null
record_type: detailed-canonical
related:
  - WOO-712
schema_version: 2
source_revision: git:495f61c0f3d5e3c9c6d58340d315c06b4ad70cc0:dirty
spec_ids: []
status: active
tags:
  - www/spec
  - domain/stats
  - capability/usage-dashboard
  - status/partial
test_ids: []
updated_at: 2026-09-27T22:46:49+09:00
---

# Usage Dashboard — 현재 프로세스의 모델 사용과 라우팅을 관측한다

## 1. Intent

사용자는 현재 프로세스에서 관측된 토큰·요청 결과·모델 비중과 실행 단계별 모델 라우팅을 한 화면에서 비교하고, 관측되지 않은 값은 실제 0이나 추세로 오인하지 않아야 한다.

## 2. Scope

현재 Workbench snapshot의 sessionUsage·requestRuntime과 provider quota를 읽는 Usage 화면을 포함한다. 저장된 여러 세션의 일별 추세, 비용 추정, 작업별 사용 목적 귀속은 제외하며 WOO-712 또는 별도 저장 계약이 소유한다.

## 3. Desired Behavior

상단은 관측 토큰·요청·모델·성공률을 요약하고 MODEL SHARE·STAGE DISTRIBUTION·MODEL × ROLE·SELECTED·RECENT ROUTING을 표시한다. 기존 모델별 직접/분리 사용량과 provider 구독 한도는 아래에서 유지한다. 넓은 화면은 2열, 좁은 화면은 단일 열로 읽힌다.

## 4. Domain Contract

INV-001: observedTotalTokens가 없으면 0이 아니라 미관측으로 표시한다. INV-002: 성공률 분모는 completed·failed·blocked·skipped terminal request이며 분자는 completed만 사용한다. INV-003: 모델 share는 관측된 모델 귀속 token만 사용한다. INV-004: 저장 계약이 없는 일별 추세는 unavailable이다. INV-005: provider quota는 token 사용량과 별도 지표다.

## 5. State Model

요약 값은 observed·unobserved로 나뉘고 request는 active와 terminal 상태를 구분한다. routing 표시는 completed=성공, failed 또는 blocked=실패, skipped=제외, 그 외=진행으로 표시한다. provider는 loading·ready·auth-required·unsupported와 stale을 기존 snapshot 의미대로 유지한다.

## 6. Data & Runtime Flow

WorkbenchSnapshot.sessionUsage → 모델 token 합계와 share·effort 상세로 흐르고, WorkbenchSnapshot.requestRuntime.stages → stage 분포·semantic role·최근 routing으로 흐른다. UsageMonitorPort snapshot은 별도 provider quota 패널로 흐른다.

## 7. Identity & Persistence Contract

현재 수치는 프로세스 연결 이후의 관측 범위이며 과거 전체 대화나 하루 합계가 아니다. Usage 화면은 새 이력을 저장하지 않는다. model identity는 원본 model 문자열을 유지하고 화면 label만 축약한다.

## 8. Integration Contract

WwwUsageView는 WorkbenchSnapshot과 UsageSnapshot을 읽기 전용으로 투영한다. request stage identity와 상태는 core request-runtime 계약을 사용하고 stage→role 해석은 Usage view의 표시 의미로만 사용한다. 원격 quota 갱신과 세션 통계 계산 책임을 가져오지 않는다.

## 9. Failure & Recovery Contract

세션 usage나 routing이 없으면 각 패널에 미관측 이유를 표시하고 합성 숫자를 만들지 않는다. timestamp 한쪽이 없으면 elapsed를 표시하지 않는다. stale provider는 오래된 한도 정보로 드러내며 다음 snapshot 갱신 때 회복한다.

## 10. Acceptance Contract

AC-001: 관측 token·request·model·success 요약이 원본 snapshot과 일치한다. AC-002: 모델 share와 선택 모델 합계가 effort row를 중복 또는 누락하지 않는다. AC-003: 7개 stage와 5개 semantic role 분포가 routing 원본과 일치한다. AC-004: skipped는 성공으로 보이지 않는다. AC-005: 추세 저장이 없으면 unavailable을 표시한다. AC-006: 좁은 폭에서 단일 열로 경계를 지킨다.

## 11. Verification Strategy

www-usage-dashboard.test.ts에서 wide·compact·미관측·routing 상태와 모델 선택을 fixture로 검증하고 www-usage-view.test.ts와 www-usage-fidelity.test.ts로 기존 상세·provider 표시 회귀를 검증한다. 타입 검사·import normalization·table alignment·diff check를 함께 통과시킨다.

## 12. Implementation Map

src/adapters/inbound/tui/features/usage/view/www-usage-view.ts가 대시보드 투영과 반응형 렌더링을 소유한다. test/www-usage-dashboard.test.ts가 새 수락 예시를, 기존 Usage 테스트 두 파일이 회귀를 소유한다.

## 13. Current State & Gaps

현재 프로세스 기반 요약·모델 share·stage와 role 분포·선택 모델·최근 routing·반응형 배치가 구현됐고 집중 회귀 17개와 타입·가독성 검사가 통과했다. 일별 history 저장, 작업별 목적 귀속, 실제 Native TUI 시각 수락, Vault와 Linear 게시 read-back은 남아 있다.

## 14. Decisions & Evidence

DEC-USAGE-001 approved: stage 의미는 UNDERSTAND·DECOMPOSE·DECIDE→THINK, GROUND→GROUND, EXECUTE→BUILD, VERIFY→REVIEW, DELIVER→FAST로 표시한다. DEC-USAGE-002 approved: 저장 계약이 없는 Usage Trend는 차트를 만들지 않고 unavailable로 둔다. DEC-USAGE-003 approved: 선택 모델은 effort row 전체 token을 모델 identity별로 합산해 가장 큰 관측 모델을 고른다. 근거는 test/www-usage-dashboard.test.ts와 독립 Claude Sonnet 읽기 전용 2회 검토다.

## Change Log

2026-09-27 WOO-714 Usage Dashboard 정본 Candidate를 생성하고 현재 프로세스 관측·stage role·추세 unavailable 계약을 기록했다.

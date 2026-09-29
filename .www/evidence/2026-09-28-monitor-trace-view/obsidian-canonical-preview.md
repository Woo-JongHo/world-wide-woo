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
source_revision: worktree:5269ee3bf49ebf563e15cfcef5c5c595f33d2922:dirty
spec_ids: []
status: draft
tags:
  - www/spec
  - domain/monitor
  - capability/run-trace
  - status/draft
test_ids: []
updated_at: 2026-09-28T09:34:33+09:00
---

# Run trace — 현재 요청의 실행과 실패를 관찰한다

## 1. Intent

사용자는 현재 요청이 어느 단계에서 무엇을 실행하고 어디에서 실패하거나 방향을 바꿨는지 한 화면에서 읽어야 한다. Monitor는 실행을 조작하지 않고 관측된 공개 사실을 시간과 계층으로 설명한다.

## 2. Scope

현재 Request Runtime의 7단계, 요청 상태, 모델·도구, 실패·재시도, 공개 decision 이벤트, 세션 사용량, 기존 Render Health와 계층 성능 표시를 포함한다. 정규화된 span identity, 모델 호출별 토큰·TTFT·TTFA·TTLT, critical path와 원인 추정은 관측 계약이 생기기 전까지 제외한다.

## 3. Desired Behavior

요청이 관측되면 상단 요약은 상태와 경과, 모델·도구·실패·재시도·토큰·컨텍스트를 표시한다. 요청 시작 시각이 있으면 워터폴은 7단계와 같은 시간 창의 최근 도구 활동을 배치하고 트레이스 트리는 단계와 도구의 포함 관계를 보여준다. decision.created가 있으면 공개된 이유만 시간순으로 표시하고, 실패·차단 이벤트가 있으면 단계와 관측된 사유를 표시한다. 값이 없으면 0이나 원인을 만들지 않고 미관측으로 남긴다.

## 4. Domain Contract

INV-MON-001: Monitor는 관측 화면이며 읽기만으로 승인·재실행·상태 변경을 만들지 않는다. INV-MON-002: 모든 행은 Request Runtime, Workbench activity, usage snapshot, layer telemetry의 실측 데이터에서만 만든다. INV-MON-003: 사적 chain-of-thought는 표시하지 않고 runtime이 공개한 decision.created 이유만 사용한다. INV-MON-004: 미관측 값과 실제 0을 구별한다. INV-MON-005: Render Health는 UI 진단이며 요청의 모델·도구 latency와 합치지 않는다.

## 5. State Model

요청은 미관측, pending, running, completed, failed 상태로 보이며 각 공개 단계는 pending, running, completed, skipped, failed, blocked 상태를 가진다. completed와 skipped는 완료 기호, running은 활성 기호, failed와 blocked는 실패 계열 기호로 구분한다. 관측되지 않은 요청은 IDLE로 표시하되 서비스 전체의 유휴 상태로 확대 해석하지 않는다.

## 6. Data & Runtime Flow

Native·도구 활동과 공개 Stage report가 Workbench journal과 Request Runtime record로 투영되고 RuntimeMonitorProjection과 WorkbenchSnapshot을 거쳐 요약 스트립, 워터폴, 트레이스 트리, 결정, 실패, 계층 성능, 최근 이벤트 순으로 렌더된다.

## 7. Identity & Persistence Contract

Request ID와 Stage ID는 Request Runtime이, Activity ID와 recordedAt은 Workbench journal이 소유한다. Monitor는 별도 실행 정본을 저장하지 않고 현재 projection을 읽는다. 워터폴의 도구 위치는 activity recordedAt과 request startedAt의 차이이며 정규 span identity로 승격하지 않는다.

## 8. Integration Contract

request-runtime은 공개 단계와 decision event를 제공하고 runtime-monitor는 현재 실행·도구·실패·재시도를 투영한다. WorkbenchSnapshot은 activities, usage, model, journal sequence를 제공한다. WwwMonitorView는 이를 표시할 뿐 상태 전이와 집계의 정본이 되지 않는다. Source 원문 탐색과 승인 조작은 인접 기능이 소유한다.

## 9. Failure & Recovery Contract

요청 시작 시각이 없으면 워터폴을 만들지 않고 미관측 안내를 표시한다. 잘못된 event 시각은 해당 행에서 제외한다. 실패 원인이 관측되지 않으면 event type 이상의 원인을 추정하지 않는다. 빈 결정·실패 목록은 각각 미관측 또는 관측된 실패 없음으로 표시한다. 좁은 폭에서도 행을 잘라 화면 경계를 넘지 않아야 한다.

## 10. Acceptance Contract

AC-MON-001: running·completed·failed 요청의 상태와 경과가 구분된다. AC-MON-002: 7단계의 실제 시작·완료 시각이 워터폴에 배치된다. AC-MON-003: 도구 activity가 요청 시간 창 안에서만 표시된다. AC-MON-004: 공개 decision.created만 결정 타임라인에 나타난다. AC-MON-005: 실패·차단 이벤트와 미관측 원인이 구별된다. AC-MON-006: Render Health와 요청 trace가 별도 섹션으로 유지된다. 기존 관련 회귀 23개는 통과했지만 새 정보 구조를 직접 고정하는 테스트와 실제 TUI 수락은 남아 acceptance는 partial이다.

## 11. Verification Strategy

runtime-monitor 단위 테스트로 상태·실패·재시도·이벤트 경계를 검증한다. observability view 테스트로 관측 없음과 폭 제한을 검증한다. telemetry duration 테스트로 Render Health와 계층 시간을 검증한다. 추가로 워터폴 오프셋, 단계별 도구 포함, 공개 decision 필터, 실패 표, 40·80·120열을 직접 고정하는 수락 테스트와 실제 TUI read-back이 필요하다.

## 12. Implementation Map

src/core/domain/execution/request-runtime.ts가 요청·단계·공개 event를, src/core/domain/observability/runtime-monitor.ts가 실행 projection을, src/adapters/inbound/tui/features/monitoring/view/www-monitor-view.ts가 Run trace 화면을 소유한다. test/runtime-monitor.test.ts, test/observability-views.test.ts, test/www-telemetry-duration.test.ts가 현재 자동 검증의 일부를 소유한다.

## 13. Current State & Gaps

요약 스트립, 단계 워터폴, 트레이스 트리, 공개 결정, 실패 표와 기존 계층·Render Health 표시는 구현됐다. 관련 자동 회귀 23개와 TypeScript, diff 검사는 통과했다. AGENTS.md 지정 가독성 스크립트는 로컬 symlink 대상에 필요한 파일이 없어 미실행이며, 새 화면 구조의 직접 테스트, 실제 TUI 40·80·120열 수락, 독립 리뷰, Vault 중복 read-back이 남아 있다.

## 14. Decisions & Evidence

DEC-MON-001 proposed: Monitor의 시각 중심을 현재 상태 목록에서 요청 시작 기준 Run trace로 바꾼다. DEC-MON-002 proposed: private reasoning 대신 runtime이 내보낸 공개 decision.created만 표시한다. DEC-MON-003 proposed: 정규 span 계약이 없는 현재에는 activity recordedAt을 점 형태로만 배치하고 critical path나 latency attribution을 만들지 않는다. Figma Monitor prompt와 현재 구현 diff가 근거이며 직접 수락 테스트와 독립 리뷰가 끝날 때까지 본 문서는 draft다.

## Change Log

2026-09-28 WOO-675의 요청 요약, 7단계 워터폴, 단계별 도구 트리, 공개 결정, 실패 표시와 미관측 경계를 draft로 작성했다.

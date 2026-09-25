---
acceptance: not-tested
capability: Layer Monitoring
code_ids: []
decision_ids:
  - DEC-MONITORING-001
  - DEC-MONITORING-002
  - DEC-MONITORING-003
document_id: 0913c197-9fb1-421f-af5e-0fd36b049e53
domain: Workbench
exception_ids: []
linear: WOO-913
parent: "[[Workbench — 대화와 계획을 통제한다]]"
record_type: detailed-canonical
related: []
schema_version: 2
source_revision: worktree:ca775998641d284738cd87c50d2593f689b6c86c:dirty
spec_ids: []
status: draft
tags:
  - www/spec
  - domain/workbench
  - capability/layer-monitoring
  - status/draft
test_ids: []
updated_at: 2026-09-24T00:00:00+09:00
---

# Monitoring — 실행 계층별 병목을 진단한다

## 1. Intent

### 사용자 문제

사용자는 WWW가 느릴 때 전체 응답 시간이 느리다는 사실만 보고 Native 수신, 상태 투영, 렌더 계산, 터미널 출력 중 어느 계층이 병목인지 구분할 수 없다.

### 기대 결과

현재 실행의 end-to-end 증상과 7개 내부 계층의 wait/work를 함께 보고, 관측되지 않은 값과 실제 0을 구분해 다음 조사 지점을 정한다.

### Reference

Google SRE Monitoring Distributed Systems와 SRE Workbook Monitoring의 Four Golden Signals, 증상/원인 분리, percentile, freshness 원칙을 채택한다. 복잡한 자동 인과 추론과 근거 없는 임계값은 채택하지 않는다.

## 2. Scope

### In Scope

- Native Receive부터 Terminal Write까지 7계층 trace
- 계층별 wait/work latency, traffic, errors, saturation
- /monitor 현재 trace와 /dashboard window 요약
- /cache와 /context의 관측 의미 분리

### Out of Scope

- 원격 telemetry backend와 collector fleet
- source별 Context token 비율 추정
- 화면 경고색을 즉시 paging으로 연결하는 자동 알림

### Boundary

Core는 계측 의미와 immutable projection을 소유하고 Adapter는 monotonic clock과 실제 boundary observation을 제공한다. TUI는 projection만 표시한다.

## 3. Desired Behavior

### Scenario DB-001 · 느린 실행의 병목을 찾는다

**Given** 하나의 trace에 7계층 timing이 수집됐다.

**When** 사용자가 /monitor를 연다.

**Then** end-to-end latency와 계층별 wait/work waterfall, traffic, errors, saturation을 같은 trace 범위에서 본다.

### Scenario DB-002 · 관측이 빠진 실행을 본다

**Given** 일부 계층의 시작 또는 종료가 수집되지 않았다.

**When** 화면이 trace를 투영한다.

**Then** 빠진 계층은 unobserved로 표시되고 0ms 또는 complete로 바뀌지 않는다.

### Scenario DB-003 · Context 점유 bucket을 본다

**Given** Native가 전체 usedTokens와 contextWindow만 제공한다.

**When** /context를 연다.

**Then** 동일 크기 bucket이 전체 점유율만 표현하고 source별 token allocation은 주장하지 않는다.

## 4. Domain Contract

### INV-001

실행 계층은 Native Receive, Event Queue, State Projection, Snapshot Publish, Render Schedule, Layout / Materialize, Terminal Write의 7개다.

### INV-002

각 계층은 waitMs와 workMs를 분리한다. end-to-end는 첫 수신부터 terminal write 완료까지 같은 trace에서 계산하며 계층 시간을 단순 합산하지 않는다.

### INV-003

공통 신호는 Latency, Traffic, Errors, Saturation이다. latency는 표본 수와 p50·p95·p99를 보존한다.

### INV-004

관측되지 않은 값은 0, 정상, 빈 상태로 추정하지 않는다. synthetic fixture는 Demo에서만 사용한다.

### 용어

| 용어 | 정의 |
|---|---|
| trace | 한 실행의 계층 observation을 연결하는 identity |
| wait | 이전 경계 뒤 실제 처리가 시작되기 전 대기 시간 |
| work | 해당 계층이 실제 처리한 시간 |
| saturation | queue, backlog, frame budget처럼 처리 여유에 가까운 정도 |

## 5. State Model

### 상태

| State | 의미 |
|---|---|
| collecting | trace observation 수집 중 |
| complete | 필수 시작·종료 경계가 모두 관측됨 |
| partial | 일부 경계가 누락됨 |
| stale | freshness budget을 넘음 |

### 상태 전이

| From | Event / Condition | To | 비고 |
|---|---|---|---|
| collecting | terminal write 완료와 모든 경계 관측 | complete | 같은 trace identity 필요 |
| collecting | terminal 종료 뒤 경계 누락 | partial | 누락을 0으로 채우지 않음 |
| complete / partial | freshness budget 초과 | stale | 과거 값임을 보존 |

## 6. Data & Runtime Flow

```text
Native event → queue → state projection → snapshot → render scheduler → layout/materialize → terminal write
       └──────────────────── trace identity + monotonic timestamps ────────────────────┘
                                      ↓
                         bounded Layer Monitoring projection
                              ├── /monitor current trace
                              └── /dashboard window summary
```

### Ownership

| State / Data | Owner | Writer | Reader |
|---|---|---|---|
| layer definition | Core observability contract | code revision | projection, tests, TUI |
| monotonic timestamps | boundary Adapter | instrumented boundary | Core projection |
| window aggregate | Core projection | trace reducer | Dashboard |
| display state | TUI | renderer | user |

## 7. Identity & Persistence Contract

### Identity

traceId는 한 실행의 모든 계층 표본을 연결한다. layerId와 sample window는 traceId 안에서 안정적이어야 한다.

### Persistence

초기 구현은 bounded in-memory window를 사용한다. 장기 추세 저장은 별도 capability다.

### Resume

재시작 전 in-memory trace를 복원한다고 주장하지 않는다. durable source가 추가될 때만 resume coverage를 확장한다.

### Idempotency / Concurrency

같은 traceId·layerId·boundary의 중복 observation은 중복 표본을 만들지 않는다. 동시에 진행되는 trace는 identity로 분리한다.

## 8. Integration Contract

`/monitor`는 현재 trace의 white-box 원인을, `/dashboard`는 사용자 증상과 window Golden Signals를, `/cache`는 기존 7개 cache slice를, `/context`는 전체 Native context 점유율과 loaded input을 소유한다. 실행 파이프라인 7계층과 cache 7종을 같은 지표로 합치지 않는다.

## 9. Failure & Recovery Contract

| ID | Failure | Detection | User-visible State | Recovery | Preserve |
|---|---|---|---|---|---|
| ERR-MON-001 | 계층 boundary 누락 | trace terminal 뒤 필수 경계 없음 | partial / unobserved | source link로 조사 | 관측된 표본 |
| ERR-MON-002 | timestamp 역행 | monotonic order 위반 | invalid sample | 표본 제외·오류 count 증가 | 원본 boundary IDs |
| ERR-MON-003 | bounded window overflow | capacity 도달 | dropped count | 오래된 complete trace부터 축출 | drop counter |

## 10. Acceptance Contract

| AC-ID | Acceptance Criterion | Test-ID | Evidence | Status |
|---|---|---|---|---|
| AC-MON-001 | 같은 trace의 7계층 wait/work가 누락과 0을 구분한다. | TST-MON-001 | — | NOT TESTED |
| AC-MON-002 | /monitor가 현재 trace waterfall과 네 Golden Signals를 표시한다. | TST-MON-002 | — | NOT TESTED |
| AC-MON-003 | /dashboard가 sample count와 p50·p95·p99, freshness를 표시한다. | TST-MON-003 | — | NOT TESTED |
| AC-MON-004 | telemetry 활성화 오버헤드가 정한 budget을 넘지 않는다. | TST-MON-004 | — | NOT TESTED |
| AC-MON-005 | Context bucket이 전체 점유율만 나타내고 source 비율을 추정하지 않는다. | TST-MON-005 | — | NOT TESTED |

## 11. Verification Strategy

| Test-ID | 검증 대상 | 방법 | 연결 계약 |
|---|---|---|---|
| TST-MON-001 | duplicate, missing boundary, clock order, concurrent trace | Unit | INV-001, INV-002, ERR-MON-001/002 |
| TST-MON-002 | current trace projection과 narrow/wide 화면 | TUI integration | AC-MON-002 |
| TST-MON-003 | percentile, sample count, stale window | Unit | INV-003, AC-MON-003 |
| TST-MON-004 | 계측 전후 동일 fixture overhead | Benchmark | AC-MON-004 |
| TST-MON-005 | Context bucket과 unavailable source | TUI behavior | INV-004, AC-MON-005 |

## 12. Implementation Map

| Responsibility | Module / Component | Code-ID |
|---|---|---|
| 7계층 recorder와 window projection | src/core/domain/observability/layer-performance.ts | 미지정 |
| runtime 상태 projection | src/core/domain/observability/runtime-monitor.ts | 미지정 |
| cache telemetry | src/core/domain/observability/cache-telemetry.ts | 미지정 |
| Monitor view | src/adapters/inbound/tui/features/monitoring/astra-monitor-view.ts | 미지정 |
| Context cell view | src/adapters/inbound/tui/features/context/astra-context-view.ts | 미지정 |
| Figma reference | Q7kGUdqiaQRJI8CZlPMRX7 section 50:609, node 77:2 | 해당 없음 |

## 13. Current State & Gaps

### Implemented

Core의 bounded LayerPerformanceRecorder가 7계층 wait/work, partial, failure, monotonic order와 p50·p95·p99 window projection을 소유한다. 대상 테스트 4건과 TypeScript 검사가 통과했다. Context 점유율은 동일 크기 cell로 표시하며 관련 UI 테스트 69건이 통과했다. Figma에는 기준 화면 node 77:2가 생성됐다.

### Partial

Recorder 계약은 구현됐지만 실제 Native·projection·render·terminal boundary 배선은 진행 중이다. Cache의 일부 계층만 실제 source가 연결되어 unobserved가 남는다. Figma 기준 화면의 예시 수치는 구현 telemetry가 아니라 reference다.

### Gap

| GAP-ID | 관련 Contract | 내용 | Linear |
|---|---|---|---|
| GAP-MON-001 | INV-001/002 | 실제 7계층 boundary를 recorder에 연결하고 /monitor에 투영해야 한다. | WOO-913 |
| GAP-MON-002 | INV-003 | window projection을 /dashboard에 연결하고 saturation source를 보강해야 한다. | WOO-913 |
| GAP-MON-003 | AC-MON-004 | telemetry overhead budget이 결정되지 않았다. | WOO-913 |

## 14. Decisions & Evidence

### Open Design Questions

| Q-ID | Question | Cost of Wrong | Options | Next Evidence | Owner | Blocking |
|---|---|---|---|---|---|---|
| Q-MON-001 | 표본 window와 memory bound는 얼마인가? | 장기 세션 memory 증가 또는 진단 표본 부족 | count bound / time bound / hybrid | 실제 session traffic benchmark | Codex | yes |
| Q-MON-002 | 허용할 instrumentation overhead는 얼마인가? | 계측 자체가 latency를 만든다 | absolute ms / relative percent | 동일 fixture A/B benchmark | 사용자·Codex | yes |

### Decisions

#### DEC-MONITORING-001 · Google SRE Four Golden Signals를 공통 열로 사용한다

**Status** approved

**Decision** Latency, Traffic, Errors, Saturation을 모든 실행 계층의 공통 진단 축으로 사용한다.

**Why** 계층별 시간을 장식하는 대신 사용자 증상과 용량·오류를 같은 언어로 비교할 수 있다.

**Alternatives** latency 단일 표는 traffic과 saturation 변화로 생긴 병목을 설명하지 못해 채택하지 않았다.

**Cost of Wrong** 모든 계측과 화면 열을 다시 이관해야 한다.

**Impact** INV-003, AC-MON-002/003.

**Decision Authority** 사용자 결정 2026-09-24.

#### DEC-MONITORING-002 · 관측되지 않은 값은 unknown으로 유지한다

**Status** approved

**Decision** missing source를 0 또는 정상으로 표시하지 않고 synthetic은 Demo에 격리한다.

**Why** 0건과 미실행, 0ms와 미관측은 운영 의미가 다르다.

**Alternatives** UI 완성을 위해 placeholder 수치를 쓰는 안은 거짓 인과를 만들어 거절했다.

**Cost of Wrong** 병목과 정상 상태를 잘못 판단한다.

**Impact** INV-004, ERR-MON-001.

**Decision Authority** 기존 WWW 계약과 사용자 재확인 2026-09-24.

#### DEC-MONITORING-003 · Context bucket은 전체 window 점유율만 표현한다

**Status** approved

**Decision** `[] [] []` bucket은 usedTokens/contextWindow만 나타내고 source별 비율은 별도 관측 전까지 만들지 않는다.

**Why** Native는 현재 source별 token allocation을 제공하지 않는다.

**Alternatives** loaded count를 token 비율로 바꾸는 안은 분모가 달라 거절했다.

**Cost of Wrong** Skills·MCP가 Context 사용량 원인이라는 잘못된 결론을 만든다.

**Impact** AC-MON-005.

**Decision Authority** 사용자 결정 2026-09-24.

### Evidence

- docs/research/2026-09-24-www-layer-monitoring-principles.md
- docs/audit/2026-09-22-astra-figma-implementation-readiness.md
- Google SRE Monitoring Distributed Systems / SRE Workbook Monitoring

## Change Log

| Date | Change | Reason |
|---|---|---|
| 2026-09-24 | Layer Monitoring draft 생성 | 7계층 병목과 Google SRE 원칙을 구현 전 계약으로 고정 |

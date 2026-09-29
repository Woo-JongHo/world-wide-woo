# WWW 관측 화면 디자인 진단

- 작성일: 2026-09-27
- 대상: Chat, Usage, Context, Monitor
- 목적: 외부 디자인 프롬프트를 현재 WWW의 관측 계약과 TUI 구조에 맞게 분류한다.
- 판정 기준: `즉시 적용` / `표시 계약 수정` / `telemetry 개발 선행` / `현재 제외`

## 1. 요약 판정

| 화면 | 현재 적합도 | 바로 디자인 가능한 핵심 | 개발이 먼저 필요한 핵심 |
|---|---:|---|---|
| Chat | 높음 | 72:28 우선순위, 조밀한 rail, 전역 footer | Run/Activity/Inspect를 하나의 rail projection으로 통합 |
| Usage | 중상 | Summary, model share, stage·role matrix, recent routing | 선택 상태, trend history, outcome·retry의 모델별 귀속 |
| Context | 낮음 | 전체 context pressure와 `UNOBSERVED` 상태 | producer token attribution, turn history, repeat/waste/churn 수집 |
| Monitor | 중하 | 7-stage runtime, 현재 활동, 실패·retry 수, render timing | span identity·parent·duration, waterfall, token/finish/critical path |

가장 중요한 원칙은 화면을 먼저 그린 뒤 데이터를 끼워 맞추지 않는 것이다. Figma는 `OBSERVED`, `DERIVED`, `UNOBSERVED` 세 상태를 모두 설계해야 하며, 합성 demo 값은 live 화면의 약속으로 취급하지 않는다.

## 2. 현재 구조에서 공통으로 유지할 것

### 전역 chrome

- `WWW / project / page` identity와 실제 Session Goal은 이미 header projection에 있다.
- footer는 context·mode·quota를 표시하는 전역 telemetry 표면이다.
- Chat을 제외한 전용 분석 화면은 본문 전체 폭이 원칙이다. 현재 Context와 Usage에 붙은 34–44열 rail은 이 원칙과 충돌하므로 제거하거나 명시적 toggle drawer로 내려야 한다.
- 터미널 레이아웃은 px가 아니라 column 단위로 구현된다. Figma의 1536px 수치는 시각 기준이고 구현 수락은 `70–72% : 28–30%`, rail `34–44 columns`, 폭별 bounded rendering으로 표현한다.

### 시각 언어

- 유지: near-black, monospace, 1-cell separator, 고정 column, cyan active, green success, amber attention, red failure, gray secondary.
- 제거: 큰 SaaS card, 장식용 gradient, provider별 상시 강한 색, 빈 공간을 채우는 설명문.
- 모든 수치는 출처 상태를 가진다. 미관측은 `— unobserved`이며 0과 다르다.

## 3. Chat / Work + Run Inspector

### 현재 구현 근거

- `WwwWorkspace`의 Chat은 transcript가 grow하고 오른쪽 rail은 `basis: 38`, `minSize: 34`, `maxSize: 44`다.
- rail은 현재 `WwwPlanView`를 재사용한다. RUN·PIPELINE·ACTIVITY·INSPECT를 독립 projection으로 제공하지 않는다.
- header와 footer는 workspace 밖의 전역 chrome이므로 footer 100% 폭 요구와 양립한다.

### 판정

| 요구 | 판정 | 이유 |
|---|---|---|
| Chat 70–72%, Inspector 28–30% | 즉시 적용 | 현재 160 columns에서 44 columns는 약 27.5%다. 비율 수락 테스트를 추가하면 된다. |
| Report·Composer도 왼쪽 폭 유지 | 표시 계약 수정 | Chat 내부 heading·transcript·composer가 같은 left stack을 사용하도록 명시해야 한다. |
| RUN / PIPELINE / CURRENT PLAN | 표시 계약 수정 | 데이터 일부는 requestRuntime과 native plan에 있으나 하나의 rail projection이 없다. |
| ACTIVITY duration 우측 정렬 | 개발 일부 필요 | activity는 있으나 모든 행에 start/end가 존재하지 않는다. 없는 duration은 `—`로 둔다. |
| INSPECT 2-group grid | 표시 계약 수정 | 현재 단일 Plan rail이다. strict table primitive를 재사용할 수 있다. |
| right rail에 다른 지표 금지 | 즉시 적용 | Context·Cache·Usage는 이미 전용 page가 있다. |

### 권고 계약

- 기본 desktop: left `calc(100% - rail)`, rail은 전체의 28–30%이되 최대 44 columns.
- rail 최소 유효 폭 아래에서는 숨김/toggle로 전환한다. Chat을 55%까지 압축하지 않는다.
- rail 섹션은 `RUN → PIPELINE → CURRENT PLAN → ACTIVITY → INSPECT` 고정 순서다.
- 빈 영역은 prose로 채우지 않는다. 관측 데이터가 없으면 한 줄 `— unobserved`를 사용한다.

## 4. Usage

### 현재 구현 근거

현재 `WwwUsageView`에는 다음이 이미 있다.

- observed tokens, requests, models, success 요약
- model token share
- 7-stage distribution
- stage를 BUILD·THINK·GROUND·REVIEW·FAST로 투영한 model × role
- selected model의 route·token·effort
- recent routing
- 넓은 폭 2열 / 좁은 폭 단일 열
- 일별 history 부재를 unavailable로 표시
- 기존 모델 상세, attribution, provider quota

### 판정

| 요구 | 판정 | 이유 |
|---|---|---|
| Summary strip | 표시 계약 수정 | 현재 card primitive다. 한두 줄 telemetry strip으로 바꾸면 된다. |
| Model share | 즉시 적용 | token 기반 share가 구현돼 있다. token 절대값 column만 보강한다. |
| Model × Stage | 즉시 적용 | 실제 request stage routing에서 계산한다. intensity threshold의 의미를 표기해야 한다. |
| Model × Role | 즉시 적용 | 현재 stage semantic mapping에서 파생된다. 실제 provider role telemetry는 아니다. |
| Trend | telemetry 개발 선행 | 저장된 일별/turn/run token series가 없다. 지금은 unavailable이 정답이다. |
| 선택 연동 | 개발 필요 | view-local selection state와 keyboard routing이 없다. |
| Outcome·retry by model | telemetry 개발 선행 | request 결과를 개별 model invocation에 안정적으로 귀속하지 못한다. |
| Recent routing의 effort/token | telemetry 개발 선행 | stage에는 model은 있으나 effort와 token allocation이 없다. |
| quota card 제거 | 표시 계약 수정 | main 하단 quota를 drawer/overlay로 옮기고 footer를 primary로 삼는다. |

### 의미상 주의

- `MODEL × ROLE`은 현재 stage 의미를 role로 번역한 `DERIVED` 값이다. 실제 호출에 role tag가 기록된 것처럼 표현하면 안 된다.
- success는 terminal request 분모 기반이지 모델 품질 점수가 아니다.
- 선택 모델의 outcome을 보여주려면 model invocation과 request outcome 사이의 attribution 계약이 먼저 필요하다.

## 5. Context

### 현재 구현 근거

Live snapshot이 제공하는 핵심은 `usedTokens`, `contextWindow`, `percent`뿐이다. skill count/name, MCP enabled/status, chat/activity/note 개수와 cache logical bytes는 별도 관측이지만 각 항목의 context token 기여량은 아니다.

현재 화면도 live 상태에서 source token allocation이 없음을 명시한다. 다색 composition, turn chart, diagnostic ranking은 synthetic Figma catalog에서만 제공되며 테스트가 live에 유입되지 않음을 고정한다.

### 판정

| 요구 | 판정 | 이유 |
|---|---|---|
| Context budget bar | 즉시 적용 | used/window/percent는 관측된다. free는 안전하게 파생 가능하다. |
| Producer bars | telemetry 개발 선행 | conversation/tool/skill/memory별 token attribution이 없다. |
| Growth timeline | telemetry 개발 선행 | turn별 context sample history가 없다. |
| Repeated injection | telemetry 개발 선행 | content identity·digest·turn injection event가 없다. |
| Waste candidates | telemetry 개발 선행 | 크기만으로 waste를 판정할 수 없다. reason-bearing detector가 필요하다. |
| Tool result bloat | telemetry 개발 선행 | tool output byte/token size와 reinjection 관계가 없다. |
| Context churn | telemetry 개발 선행 | compress/evict/retrieve/reinject의 양과 identity가 없다. |
| Loaded capabilities | 즉시 적용 | count/name/status는 관측되나 token share는 unobserved다. |
| Selected producer | 개발 후 가능 | producer identity와 event history가 먼저 필요하다. |

### 최소 telemetry 계약 제안

```text
ContextSample
  turnId, at, usedTokens, contextWindow

ContextContribution
  contributionId, turnId, sourceKind, sourceIdentity
  observedTokens | null, observedBytes | null, contentDigest | null
  action: inject | retrieve | compress | evict | reinject
  parentActivityId | null

ContextDiagnostic
  contributionId, reason, count, confidence, evidenceActivityIds
```

`SUSPECTED WASTE`는 크기가 아니라 중복 digest, 반복 reinjection, 오래된 revision, oversized result 같은 관측 가능한 reason이 있을 때만 생성한다.

## 6. Monitor

### 현재 구현 근거

현재 Monitor는 다음을 관측한다.

- active request/model/agent/tool/approval
- request와 tool의 시작 및 종료가 모두 있을 때 duration
- retry/failure count
- 최근 semantic events와 activity ID
- 7-stage request runtime과 public decision/event
- Native event → projection → render의 in-process layer performance와 render p50/p95/p99

그러나 일반 실행 operation의 통합 span tree는 없다. `traceId`, `spanId`, `parentSpanId`, model input/output tokens, finish reason, TTFT/TTFA/TTLT, critical path를 요청 전체에 대해 저장하지 않는다.

### 판정

| 요구 | 판정 | 이유 |
|---|---|---|
| NOW, stage pipeline, recent events | 즉시 적용 | 기존 runtime projection으로 표현 가능하다. |
| compact run summary | 부분 적용 | elapsed/retry/failure는 가능, call/token/TTF*는 일부 미관측이다. |
| run waterfall | telemetry 개발 선행 | span parent와 공통 clock boundary가 필요하다. |
| trace tree | telemetry 개발 선행 | activity를 의미 span으로 묶는 identity 계약이 필요하다. |
| decision trace | 부분 적용 | public decision summary와 plan change만 사용 가능하다. private reasoning은 제외한다. |
| failures & retries table | 개발 필요 | activity error code·recovery link를 정규화해야 한다. |
| tool/model observability | telemetry 개발 선행 | call별 token·finish reason·정확한 duration coverage가 부족하다. |
| latency breakdown | telemetry 개발 선행 | 겹치는 span을 단순 합산하지 않는 category/critical path 계산이 필요하다. |
| selected span inspector | telemetry 개발 선행 | span schema와 bounded payload reference가 필요하다. |
| render health | 유지하되 분리 | AI run trace가 아니라 UI render pipeline telemetry임을 명확히 라벨링한다. |

### 최소 span 계약 제안

```text
RunSpan
  traceId, spanId, parentSpanId
  requestId, stageId | null, activityId | null
  kind: model | tool | retrieval | subagent | verify | output | wait
  name, status, startedAt, endedAt | null
  model | null, effort | null, tool | null
  inputTokens | null, outputTokens | null, finishReason | null
  retryOfSpanId | null, errorCode | null
```

원문 input/output은 기본 화면에 넣지 않고 activity reference로 연결한다. private chain-of-thought는 수집·표시 대상이 아니다.

## 7. 구현 우선순위

1. Chat rail 비율과 section composition을 먼저 정리한다. 새로운 telemetry가 거의 필요 없다.
2. Usage main에서 quota를 내리고 기존 관측 기반 matrix를 시각적으로 정제한다.
3. Usage selection state를 추가하되 trend/outcome은 `UNOBSERVED` 상태로 남긴다.
4. Context contribution event 계약을 설계·수집한 뒤 profiler 화면을 활성화한다.
5. 공통 RunSpan 계약을 설계한 뒤 Monitor waterfall·tree·critical path를 구현한다.

Context와 Monitor는 화면 작업으로 시작하면 demo data와 live data의 경계가 무너지기 쉽다. 두 화면은 telemetry 계약과 fixture를 먼저 만들고 Figma의 observed/unobserved 상태를 동시에 수락해야 한다.

## 8. 수락 기준

- Chat desktop 기본 폭에서 left 70–72%, right 28–30%이며 inspector는 30%를 넘지 않는다.
- Usage·Context·Monitor는 기본 상태에서 full-width이며 side rail은 drawer로만 열린다.
- 모든 시각화는 실제 source, derived rule, unobserved 상태 중 하나로 추적된다.
- synthetic catalog 값은 live 화면과 테스트에서 명확히 분리된다.
- 좁은 폭에서 horizontal overflow 없이 table이 축약되거나 단일 열로 전환된다.
- 키보드 안내는 실제 구현된 handler와 일치한다.

## 9. 근거 파일

- `src/adapters/inbound/tui/shell/www-surface.ts`
- `src/adapters/inbound/tui/features/usage/view/www-usage-view.ts`
- `src/adapters/inbound/tui/features/context/view/www-context-view.ts`
- `src/adapters/inbound/tui/features/context/view/www-context-catalog.ts`
- `src/adapters/inbound/tui/features/monitoring/view/www-monitor-view.ts`
- `src/core/domain/work/workbench.ts`
- `src/core/domain/execution/request-runtime.ts`
- `src/core/domain/observability/runtime-monitor.ts`
- `test/www-usage-dashboard.test.ts`
- `test/www-context-fidelity.test.ts`


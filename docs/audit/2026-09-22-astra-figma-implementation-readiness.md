# ASTRA Monitoring Figma 구현 준비 감사

- 기준 Figma: `Q7kGUdqiaQRJI8CZlPMRX7`, section `50:609`
- 화면: Usage `50:610`, Context `50:967`, Cache `50:1403`, Workflow `50:1986`, Dashboard `50:2169`
- 코드 기준: `ui/workbench-visual-polish`의 현재 미커밋 워크트리
- 목적: Figma 모양을 흉내 내는 작업과 제품 데이터를 정확히 표시하는 작업을 분리하고, 다음 구현 패스의 입력을 고정한다.

## 판정

현재 구현은 다섯 화면의 이름과 주요 패널을 대부분 만들어 놓았지만, Figma 구현 완료 상태는 아니다.

### 2026-09-22 구현 패스 결과

이번 패스에서 P0 의미 정확성 항목은 모두 교정했다.

- Context label과 meter를 전체 Native window의 `usedTokens / contextWindow`로 통일하고 MCP·Skills loaded count와 분리했다.
- source별 Context token attribution은 가짜 track 대신 단일 unavailable 상태로 표시한다.
- 오프라인 preview의 모든 화면 header에 `DEMO DATA · synthetic fixtures` provenance를 표시한다.
- Dashboard의 queue·approval·recording 묶음을 `System load`가 아니라 `Session state`로 표시하고 Context meter의 의미를 명시한다.
- Cache의 byte meter를 bounded occupancy가 아니라 `Logical byte distribution`으로 바꾸고 capacity limit이 관측되지 않음을 명시한다.
- Usage Workspace 검증이 이전 panel 명칭을 기대하던 drift를 현재 observed/unavailable 계약에 맞게 교정했다.

통합 검증은 monitoring 관련 7개 test file에서 96 pass, 0 fail이며 TypeScript와 대상 diff 검사가 통과했다. 아직 완료되지 않은 수락 항목은 Dashboard module card의 직접 keyboard focus/activation state, 동일 viewport의 Figma↔실제 TUI capture 대조, 작성 패스와 분리된 독립 시각 리뷰다.

가장 큰 문제는 세 가지다.

1. **기능 의미와 시각 연결이 섞였다.** 전체 context 사용률과 Skills/MCP/Notes 같은 context 입력 개수는 서로 다른 계측인데 한 spectrometer 아래에 연속 배치된다. 이 때문에 `MCP`가 보이는 화면에서 `64%`가 MCP 점유율처럼 읽힌다.
2. **Figma 구조를 확인하는 검증이 부족하다.** 현재 테스트는 제목 문자열 존재와 행 폭 상한을 주로 확인한다. 패널의 순서, 첫 viewport의 정보량, 열 비율, 색 역할, 높이, 실제 캡처 차이는 수락 조건이 아니다.
3. **데이터 계약보다 화면이 먼저 확장됐다.** Figma에 있는 per-source context tokens, cache history, retry queue, provider 추세 등은 현재 관측되지 않는다. 일부는 `미관측`으로 정직하게 처리했지만, 화면 전체는 관측 가능한 값과 불가능한 값을 구획하지 않아 완성된 계측기처럼 보인다.

## `MCP 64%`로 읽히는 이유

현재 프리뷰는 다음 두 값을 독립적으로 만든다.

- 전체 context: `usedTokens=128,400`, `contextWindow=200,000`, 표시 percent `64.2`
- MCP: 3개 서버가 enabled/connected

`64.2%`는 Native token usage의 전체 context 점유율이다. MCP 서버 수나 MCP가 주입한 token 양에서 계산하지 않는다. 실제 계산 경로도 `tokenUsage.last.totalTokens`와 `modelContextWindow`뿐이며 MCP별 token 기여량은 수집하지 않는다.

오독은 `CONTEXT ACCUMULATION SPECTROMETER` 바로 아래에 `LOADED CONTEXT INPUTS`와 `MCP 3/3 enabled`를 붙이고, 이어지는 composition panel에 MCP track까지 그리면서 발생한다. 값은 거짓이 아니지만 인과 관계를 암시하는 배치가 잘못됐다.

다음 구현에서는 아래처럼 분리한다.

- `Context window`: 전체 used / free만 meter로 표시한다.
- `Loaded capabilities`: Skills, MCP, Notes는 개수와 연결 상태만 표시한다.
- `Source allocation`: token attribution source가 생기기 전까지 bar를 그리지 않고 `소스별 token 기여량 미관측` 한 상태로 표시한다.
- 프리뷰 값에는 `DEMO` 표지를 넣어 실제 관측값과 구분한다.

## 기능 분류와 값의 출처

### 1. Usage

| 기능 | Figma 표현 | 사용할 값 | 현재 상태 | 구현 판정 |
|---|---|---|---|---|
| Provider 상태 | 4개 telemetry card | `UsageSnapshot.state`, `stale`, auth 상태 | 일부 구현 | 가능 |
| 5h/7d quota | dual meter, renewal | `UsageLimitSnapshot.remainingPercent`, `resetsAt`, `label` | 구현됨 | 가능, provider마다 window가 다름을 보존 |
| 모델별 사용 | 7열 표 | `WorkbenchSessionUsage.models` | 축약 구현 | request 수 대신 observed root turn/invocation을 명시해야 함 |
| input/output/cached | 표와 trend | 현재는 total token만 관측 | unavailable panel | 현 계약으로 불가 |
| 비용/실행시간/recent use | 표 열 | 관측 source 없음 | 대부분 생략 | 현 계약으로 불가 |
| session vs today | chart | today history 없음 | 미관측 | history 계약 전 불가 |

### 2. Context

| 기능 | Figma 표현 | 사용할 값 | 현재 상태 | 구현 판정 |
|---|---|---|---|---|
| 전체 용량 | 7 summary cards + spectrometer | `WorkbenchContextUsage` | 구현됨 | 가능 |
| source별 구성 | SYS/CONV/SKILL/MCP/MEM/WORK/RUNT bar | source별 token telemetry 없음 | 빈 track 7개 | **빈 bar 제거 필요**, 현 계약으로 불가 |
| loaded inputs | legend/list | chat, skill inventory, MCP, notes, workflow, live runtime count | 구현됨 | 가능, token 점유와 분리 |
| 최근 변화 | turn chart/event log | durable activities | 근사 구현 | context 변화 이벤트가 아니므로 라벨을 `Activity`로 제한 |
| MCP 상태 | rail/server rows | `WorkbenchMcpServer` | 구현됨 | 가능 |
| top items by size | ranking | item별 byte/token 없음 | 미관측 | 현 계약으로 불가 |

### 3. Cache

| 기능 | Figma 표현 | 사용할 값 | 현재 상태 | 구현 판정 |
|---|---|---|---|---|
| 7 layer 현황 | summary/grid | `CacheTelemetrySnapshot.layers` | 구현됨 | 가능 |
| entries/bytes/hit/miss/eviction | table/cards | `CacheLayerObservation` | 구현됨 | 가능 |
| occupancy | segment distribution | `logicalBytes` 합 | 구현됨 | 합의 기준/limit이 없으면 용량 meter가 아니라 비율 분포로 명시 |
| 시간 heatmap/trend | 24h heatmap | history bucket 없음 | 미관측 | 현 계약으로 불가 |
| miss cause | TTL/cold/invalidation | cause telemetry 없음 | 미관측 | 현 계약으로 불가 |
| purge/sync/reset | action rail | 명령 계약 없음 | 읽기 전용 안내 | 실제 action처럼 보이지 않게 disabled/unsupported 표현 |

### 4. Workflow

| 기능 | Figma 표현 | 사용할 값 | 현재 상태 | 구현 판정 |
|---|---|---|---|---|
| request pipeline | stage flow | `RequestRuntimeRecord.stages` | 구현됨 | 가능 |
| delegation tree | node graph | `NativeDelegationProjection` | 문자 tree로 근사 | 가능 |
| agent state | matrix | task status/model/role | 구현됨 | 가능 |
| queue/retry | queue panel | queue/retry 전용 telemetry 없음 | unavailable | 현 계약으로 불가 |
| event log | timeline | delegation activity feed가 제한적 | 일부 요약 | 실제 event source 추가 전 제한 |
| connector lines | SVG connectors | terminal glyph | 미사용 | 터미널에서는 tree/arrow로 근사 |

### 5. Dashboard

| 기능 | Figma 표현 | 사용할 값 | 현재 상태 | 구현 판정 |
|---|---|---|---|---|
| session summary | 5 cards | thread, revision, activity, token, context, health | 구현됨 | 가능 |
| module router | F2–F5 entry cards | page routes + 각 요약 | 구현됨 | 표시만 있고 focus/activation affordance는 약함 |
| token allocation | stacked distribution | total만 관측 | total meter + unavailable 문구 | source 비율 bar는 불가 |
| activity heatmap | 24h matrix | `recordedAt`, activity kind | 근사 구현 | 실제 access frequency가 아니라 activity frequency임을 명시 |
| system load | swap/cache | process load source 없음 | queue/approval/recording으로 대체 | Figma와 의미가 다르므로 제목 변경 또는 telemetry 추가 필요 |

## 시각 요소 분해

### 공통으로 구현해야 하는 것

- 48px/26px을 그대로 복제하지 않고 terminal row로 환산한 header/footer 높이 계약
- 1140:300 비율을 large viewport의 main:rail 열 비율로 고정
- summary card 높이와 baseline 통일
- panel 배경, border, section label, nominal/attention/failure의 색 역할 고정
- meter의 의미를 `용량`, `잔여 quota`, `구성 비율`로 구분하고 각기 다른 legend 사용
- first viewport에 Figma의 핵심 정보가 들어오는 행 예산
- 160+, 120, 80열에서의 명시적인 재배치 순서

### 터미널에서 근사해야 하는 것

- 둥근 모서리: box drawing border
- 9/10/11/12px typography: bold/dim/color 계층
- SVG connector: `├─`, `└─`, `→`, rule glyph
- 픽셀 heatmap: ANSI background 또는 block cell
- hover/mouse affordance: keyboard focus marker와 slash command

### 현재 방식으로 구현 불가능한 것

- sub-pixel spacing, 정확한 font metrics, 1px rule
- per-source context token 비율
- input/output/cached token 분해와 today trend
- cache 24h bucket, miss cause, TTL history
- workflow retry queue와 완전한 state change feed
- OS swap/process memory 수치

불가능한 항목은 장식용 샘플 수치로 채우지 않는다. `미관측` 패널을 반복해 화면을 채우기보다, 한 개의 명확한 unavailable block으로 축약한다.

## 현재 구현에서 빠졌거나 잘못된 것

### P0 — 의미 정확성

1. Context 전체 점유율과 MCP/Skills 입력 목록을 시각적으로 분리한다.
2. `contextUsage.percent`와 `usedTokens/contextWindow`의 분모 의미를 하나로 통일한다. 현재 percent는 Native baseline 보정값으로 계산하지만 meter는 raw used/window를 사용해 숫자와 막대가 다를 수 있다.
3. preview fixture 전체에 `DEMO DATA` provenance를 표시한다.
4. Dashboard의 `SYSTEM LOAD` 대체값(queue/approval/recording)을 system load라고 부르지 않는다.
5. Cache occupancy에서 limit이 없는 byte 합을 bounded capacity처럼 보이지 않게 한다.

### P1 — Figma 정보 구조

1. 각 화면의 첫 viewport 행 예산을 정하고, Context 뒤쪽의 Linear/Provider/Delegation/raw JSON 상세 덤프는 별도 detail/source surface로 이동한다.
2. 공통 shell에서 header, page body, rail, footer의 높이와 경계를 고정한다.
3. Usage 모델 표의 열을 관측 가능한 계약에 맞춰 다시 정의한다.
4. Workflow tree와 lanes의 좌우 관계를 large viewport에서 보존한다.
5. Dashboard module card에 실제 keyboard focus와 activation 상태를 표현한다.

### P2 — 시각 충실도와 검증

1. Figma와 실제 TUI를 같은 크기의 캡처로 남긴다.
2. 카드 높이, panel 순서, rail 폭, 색 역할을 snapshot/golden test로 검사한다.
3. 160×42, 120×32, 80×24에서 첫 viewport와 overflow를 각각 검증한다.
4. 문자열 존재 테스트와 별도로 시각 구조 테스트를 만든다.

## 구현 순서

1. **계측 의미 수정**: Context percent 계약을 raw 또는 effective 중 하나로 통일하고 MCP 오독을 제거한다.
2. **화면 view-model 정의**: 다섯 화면마다 `observed / derived / unavailable` 필드를 가진 projection을 만든다.
3. **공통 layout 계약**: header/body/rail/footer와 3개 viewport breakpoint의 열·행 예산을 고정한다.
4. **P0 화면 구현**: Context → Dashboard → Usage 순으로 의미 오류를 먼저 제거한다.
5. **나머지 화면 구현**: Cache → Workflow 순으로 unsupported 영역을 정돈한다.
6. **실제 캡처 대조**: Figma 원본과 TUI 캡처를 나란히 검토하고 차이를 기록한다.
7. **독립 검토**: 작성 패스와 분리된 read-only 시각/계약 감사를 수행한다.

## 수락 기준

- 화면의 모든 숫자는 source와 계산식을 설명할 수 있다.
- count, percentage, capacity, status가 같은 meter 의미로 섞이지 않는다.
- 관측되지 않은 값은 0이나 예시 수치로 보이지 않는다.
- Figma의 공통 shell과 각 화면의 첫 정보 계층이 large viewport에서 식별된다.
- 120×32와 80×24에서 필수 정보가 유지되고 행/열 overflow가 없다.
- 실제 TUI 캡처와 Figma 캡처의 차이가 증거로 남는다.
- 변경 파일에서 TODO 자리표시, `test.skip`, `test.only`, 미구현 분기가 없다.

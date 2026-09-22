# 5개 Figma 화면 사전 대조 감사

- 감사 일시: 2026-09-22
- 범위: Figma `Q7kGUdqiaQRJI8CZlPMRX7`의 Usage `50:610`, Context `50:967`, Cache `50:1403`, Workflow `50:1986`, Dashboard `50:2169`와 현재 Astra TUI 구현
- 방법: Figma `get_design_context`와 `get_metadata`를 다시 조회하고, 현재 component tree·공통 primitive·shell 조립부를 읽기 전용으로 대조했다. 실행 스크린샷/픽셀 비교는 아직 없으므로 완료 증거가 아니다.

## 공통 완료 기준

다섯 Figma 화면은 모두 다음의 같은 시각 시스템을 갖는다.

1. `1440×900` 기준으로 48행 헤더, 좌측 1140 폭 본문, 우측 300 폭 rail, 26행 상태바라는 동일한 shell.
2. 16/20 단위의 inset과 얇은 muted rule, dark panel, orange section label, green nominal 상태, mono typography.
3. 상단 summary card strip, 중앙 visualizer/표/분석 panel, 우측의 page-specific rail이라는 반복된 계층.
4. 동일한 카드, meter, section head, rail row, status pill을 공통 component로 재사용하고, 페이지별로 실제 관측 모델만 바꾼다.

현재 `AstraWorkspace`는 페이지 본문과 별도로 2행 AstraHeader, editor/composer, AstraHud를 항상 조립한다([astra-surface.ts:135](/Users/jonghoPro/woo/00_project/99_www/src/adapters/inbound/tui/shell/astra-surface.ts:135), [workbench-shell.ts:448](/Users/jonghoPro/woo/00_project/99_www/src/adapters/inbound/tui/shell/workbench-shell.ts:448)). 이는 Figma의 단일 48px header/26px footer 구조가 아니므로, 각 page component만 바꿔서는 Figma 프레임 일치를 주장할 수 없다.

## 페이지별 대조

### Usage — `50:610`

Figma 구조: 4개 provider capacity card → 7열 model grid → provider availability/time-until-renewal + model effort/token trend → 300폭 rail의 quota/system/shortcuts. Figma metadata: `provider-metrics-box` `50:624`, `model-grid` `50:677`, `lower-workspace` `50:718`.

- **HIGH — 핵심 정보 구조가 구현되지 않았다.** 현재 본문은 Session/Model activity를 세로 텍스트로 출력하고 provider별 limit를 반복할 뿐([astra-usage-view.ts:57](/Users/jonghoPro/woo/00_project/99_www/src/adapters/inbound/tui/features/usage/astra-usage-view.ts:57)-[76](/Users/jonghoPro/woo/00_project/99_www/src/adapters/inbound/tui/features/usage/astra-usage-view.ts:76)), Figma의 4 provider card, 7열 모델 테이블, dual-window availability, renewal 목록, effort 분포, 추세 chart가 없다.
- **HIGH — Figma가 요구하는 summary/analysis 패널을 공통 monitoring card로도 사용하지 않는다.** Usage 파일은 `astra-theme`만 import하며 `[monitoringCard, monitoringColumns, monitoringMeter]`를 사용하지 않는다([astra-usage-view.ts:1](/Users/jonghoPro/woo/00_project/99_www/src/adapters/inbound/tui/features/usage/astra-usage-view.ts:1)-[4](/Users/jonghoPro/woo/00_project/99_www/src/adapters/inbound/tui/features/usage/astra-usage-view.ts:4)). Cache/Dashboard와 다른 구조로 drift한다.
- **MEDIUM — 관측 계약과 Figma의 필요 값이 맞지 않는다.** 현재 cost/trend는 미관측 처리([astra-usage-view.ts:75](/Users/jonghoPro/woo/00_project/99_www/src/adapters/inbound/tui/features/usage/astra-usage-view.ts:75))가 정직하지만, Figma의 capacity/renewal 시각화에 필요한 5h/7d/renewal source를 어떤 조건에서 표시 가능한지 명시한 상태 모델이 없다. 빈 chart를 흉내 내면 안 된다.

완료 전 필요한 것: provider-card/model-row/availability/renewal/effort/trend를 실제 제공 가능한 usage data와 `unobserved` 상태로 분리해 shared monitoring layout으로 렌더링하고, wide/compact 시나리오의 구조 테스트와 실제 TUI 캡처 대조를 남길 것.

### Context — `50:967`

Figma 구조: 7개 summary card → segment별 context accumulation spectrometer/legend → composition bar 8종 + 최근 8 turn chart + context event log → 300폭 context/system rail. Figma metadata: `summary-strip` `50:981`, `visualizer-box` `50:1003`, `analysis-panel` `50:1071`.

- **HIGH — Figma의 context composition 시각 모델이 없다.** 현재는 전체 used/free meter와 Skills/MCP/Memory 수만 보여준다([astra-context-view.ts:50](/Users/jonghoPro/woo/00_project/99_www/src/adapters/inbound/tui/features/context/astra-context-view.ts:50)-[64](/Users/jonghoPro/woo/00_project/99_www/src/adapters/inbound/tui/features/context/astra-context-view.ts:64)). SYS/CONV/SKILL/MCP/MEM/WORK/RUNT/NOTE처럼 source category별 사용량과 legend, composition breakdown이 없다.
- **HIGH — 화면 목적이 Monitoring에서 상세 덤프로 바뀌었다.** Session, skill inventory 뒤에 request runtime, Linear, provider quota, MCP, delegation, raw JSON이 한 scroll에 결합된다([astra-context-view.ts:65](/Users/jonghoPro/woo/00_project/99_www/src/adapters/inbound/tui/features/context/astra-context-view.ts:65)-[101](/Users/jonghoPro/woo/00_project/99_www/src/adapters/inbound/tui/features/context/astra-context-view.ts:101)). Figma의 2열 analysis/rail 공간 계층과 전혀 다르며, 정보 밀도·탐색성이 대조 불가 상태다.
- **MEDIUM — 7-card 요약과 shared monitoring primitive 미사용.** Context도 page-local `section/pair/astraMeter`만 사용한다([astra-context-view.ts:1](/Users/jonghoPro/woo/00_project/99_www/src/adapters/inbound/tui/features/context/astra-context-view.ts:1)-[7](/Users/jonghoPro/woo/00_project/99_www/src/adapters/inbound/tui/features/context/astra-context-view.ts:7)). 공통 카드와 column allocation 계약이 없다.

완료 전 필요한 것: category telemetry가 실제로 가능한지 먼저 명시하고, 가능 category만 spectrometer/legend/turn activity/event log에 매핑한다. 나머지는 미관측 명시. 그 위에 context-specific summary cards와 rail을 shared layout으로 재구성할 것.

### Cache — `50:1403`

Figma 구조: 6개 cache 요약 card → cache memory map/segment legend → layer matrix, hit/miss trend, eviction trend → cache health/action/24-hour trend rail. 원본은 cache-layer 중심의 dashboard이며, metadata에는 hit/miss/eviction panel이 존재한다.

- **HIGH — 레이아웃/시각 계층은 원본과 아직 다르다.** 현 구현은 6 summary card와 7-layer 표를 보여주지만([astra-cache-view.ts:31](/Users/jonghoPro/woo/00_project/99_www/src/adapters/inbound/tui/features/cache/astra-cache-view.ts:31)-[78](/Users/jonghoPro/woo/00_project/99_www/src/adapters/inbound/tui/features/cache/astra-cache-view.ts:78)), Figma의 memory map, layer matrix, hit/miss 및 eviction trend로 분리된 panel hierarchy가 없다. 따라서 7계층 telemetry 구현은 진전이지만 Figma 구현 완료는 아니다.
- **MEDIUM — TTL column은 의도적으로 `—`로 고정되어, 원본의 stale/TTL signal과 대조할 수 없다.** [astra-cache-view.ts:50](/Users/jonghoPro/woo/00_project/99_www/src/adapters/inbound/tui/features/cache/astra-cache-view.ts:50)-[60](/Users/jonghoPro/woo/00_project/99_www/src/adapters/inbound/tui/features/cache/astra-cache-view.ts:60). 값이 없으면 `unobserved`는 적절하지만, column은 존재하므로 “TTL 관리 구현”으로 오인될 수 있다. source contract와 함께 tooltip/상태 marker를 명확히 해야 한다.
- **MEDIUM — action rail은 UI 정직성은 높지만 Figma의 action design fidelity를 대체하지 않는다.** disabled/unavailable action을 표시한다([astra-cache-view.ts:118](/Users/jonghoPro/woo/00_project/99_www/src/adapters/inbound/tui/features/cache/astra-cache-view.ts:118)-[124](/Users/jonghoPro/woo/00_project/99_www/src/adapters/inbound/tui/features/cache/astra-cache-view.ts:124)). 실제 destructive action을 만들 필요는 없으나, 원본의 control panel 상호작용 계층을 read-only state로 어떻게 표현할지 shared component 규칙이 필요하다.

긍정 근거: 유일하게 `monitoringCard`/`monitoringColumns`를 공통 사용한다([astra-cache-view.ts:3](/Users/jonghoPro/woo/00_project/99_www/src/adapters/inbound/tui/features/cache/astra-cache-view.ts:3), [31](/Users/jonghoPro/woo/00_project/99_www/src/adapters/inbound/tui/features/cache/astra-cache-view.ts:31)-[46](/Users/jonghoPro/woo/00_project/99_www/src/adapters/inbound/tui/features/cache/astra-cache-view.ts:46)); 직접 관측되지 않는 trend를 fabricated data로 채우지 않는 점도 맞다([80](/Users/jonghoPro/woo/00_project/99_www/src/adapters/inbound/tui/features/cache/astra-cache-view.ts:80)-[90](/Users/jonghoPro/woo/00_project/99_www/src/adapters/inbound/tui/features/cache/astra-cache-view.ts:90)).

### Workflow — `50:1986`

Figma 구조: 5 summary card → subagent delegation relationship tree → 4 parallel execution lanes + active work queue → subagent matrix/event log + active process/throttle rail. Metadata: `summary-strip` `50:2000`, `node-graph-area` `50:2020`, `execution-panel` `50:2051`, `matrix-panel` `50:2096`.

- **HIGH — Figma의 병렬 실행 model/relationship tree가 없다.** 구현은 request stages와 delegation task를 직렬 텍스트 목록으로 렌더한다([astra-workflow-view.ts:30](/Users/jonghoPro/woo/00_project/99_www/src/adapters/inbound/tui/features/workflow/astra-workflow-view.ts:30)-[55](/Users/jonghoPro/woo/00_project/99_www/src/adapters/inbound/tui/features/workflow/astra-workflow-view.ts:55)). parent→delegate→subagent graph, lanes, queue, state matrix, event log가 전부 빠져 있다.
- **HIGH — summary/rail이 Figma의 정보 구조에 맞지 않는다.** rail은 Requests/Stages/Agents/Active/Goal/navigation만 제공한다([astra-workflow-view.ts:63](/Users/jonghoPro/woo/00_project/99_www/src/adapters/inbound/tui/features/workflow/astra-workflow-view.ts:63)-[81](/Users/jonghoPro/woo/00_project/99_www/src/adapters/inbound/tui/features/workflow/astra-workflow-view.ts:81)); active processes list, allocation/CPU throttle, shortcut hierarchy가 없다.
- **MEDIUM — source telemetry gap이 미정의다.** elapsed duration, retries, queue position, lane state, stall/error classification을 Workbench snapshot의 어떤 field에서 만들지 합의되지 않았다. 수치·line chart를 지어내지 말고 Native event에서 확보 가능한 field와 unobserved behavior를 먼저 계약화해야 한다.

완료 전 필요한 것: 실제 parent/delegation graph와 stage/task lifecycle에서 panel model을 만들고, graph/lane/matrix/rail을 shared primitive로 제공한다. 이는 정보 배치가 핵심이므로 단순 text styling 변경으로 해결되지 않는다.

### Dashboard — `50:2169`

Figma 구조: 5 summary card → 4 module entry card router → token allocation panel + input/output/cached proportion → 3×12 access heatmap/event aggregates → shared context/system/navigation rail. Metadata: `summary-strip` `50:2183`, `entry-point-grid` `50:2199`, `lower-workspace` `50:2220`, `heatmap-panel` `50:2250`.

- **HIGH — 현재 router가 요구한 모듈 진입 UI가 아니다.** Figma의 Context/Cache/Usage/Workflow entry card를 대신해 현재 Chat/Activity/Plan/Health의 내부 상태 card를 출력한다([entry-dashboard-view.ts:123](/Users/jonghoPro/woo/00_project/99_www/src/adapters/inbound/tui/features/dashboard/entry-dashboard-view.ts:123)-[128](/Users/jonghoPro/woo/00_project/99_www/src/adapters/inbound/tui/features/dashboard/entry-dashboard-view.ts:128)). 기능 접근 경로, copy, 액션 의미가 달라서 Figma router를 구현한 것으로 볼 수 없다.
- **HIGH — summary와 analysis panel이 원본의 필드를 재현하지 않는다.** Figma는 Session ID/total requests/session tokens/elapsed/system health, token distribution/input-output-cached, heatmap/event aggregates를 요구하지만, 구현은 Session/Model/Tokens/Context/Workflow와 단일 meter 및 `activities.length` 기반 pseud heatmap을 사용한다([entry-dashboard-view.ts:102](/Users/jonghoPro/woo/00_project/99_www/src/adapters/inbound/tui/features/dashboard/entry-dashboard-view.ts:102)-[145](/Users/jonghoPro/woo/00_project/99_www/src/adapters/inbound/tui/features/dashboard/entry-dashboard-view.ts:145)). 특히 `monitoringHeatmap`은 시간 bucket이 아니라 activity 개수만 1열로 채운다([astra-monitoring-layout.ts:42](/Users/jonghoPro/woo/00_project/99_www/src/adapters/inbound/tui/foundation/layout/astra-monitoring-layout.ts:42)-[48](/Users/jonghoPro/woo/00_project/99_www/src/adapters/inbound/tui/foundation/layout/astra-monitoring-layout.ts:48)); Figma의 T-24H/T-12H/NOW heatmap과 의미가 다르다.
- **MEDIUM — `EntryDashboardView`는 별도 legacy-like 화면 계약을 병존시킨다.** 같은 파일에 `WwwDashboardView`와 Linear-centric `EntryDashboardView`가 함께 존재한다([entry-dashboard-view.ts:85](/Users/jonghoPro/woo/00_project/99_www/src/adapters/inbound/tui/features/dashboard/entry-dashboard-view.ts:85)-[174](/Users/jonghoPro/woo/00_project/99_www/src/adapters/inbound/tui/features/dashboard/entry-dashboard-view.ts:174)). 실제 Astra surface는 전자를 사용하지만, 용도와 명명이 혼재되어 다음 구현자가 Figma Dashboard 경로를 잘못 선택할 위험이 높다.

## 공통 컴포넌트 재사용 위험

- **HIGH — 공통 panel family가 형식상만 존재한다.** `monitoringCard`와 column helper는 [astra-monitoring-layout.ts:16](/Users/jonghoPro/woo/00_project/99_www/src/adapters/inbound/tui/foundation/layout/astra-monitoring-layout.ts:16)-[39](/Users/jonghoPro/woo/00_project/99_www/src/adapters/inbound/tui/foundation/layout/astra-monitoring-layout.ts:39)에 있으나 Cache/Dashboard만 사용한다. Usage/Context/Workflow는 개별 `section/pair` 수직 나열이다. 다섯 화면의 visual grammar가 재사용되지 않는다.
- **HIGH — 공통 Figma shell component가 없다.** Header/rail/status bar는 shell 레벨에서 각각 다른 Astra Header/HUD/composer 규칙으로 처리된다. Figma의 status pill, 48px header, 26px footer, 1140/300 분할을 한 컴포넌트가 소유하지 않는다.
- **MEDIUM — wide-grid/compact fallback만 검증되고 Figma hierarchy가 검증되지 않는다.** Cache의 wide/compact row test는 있으나 Figma panel set/field contract를 테스트하지 않는다(`test/astra-ui.test.ts:247` 이후). 나머지 페이지는 텍스트 존재 여부 중심 테스트라 카드/rail/visualizer drift를 잡지 못한다.

## 결론

현재 상태는 **Cache telemetry의 도메인 계측과 일부 Dashboard/Cache 카드 primitive가 진행된 상태**다. 그러나 다섯 화면 모두 Figma의 panel hierarchy와 공통 shell/컴포넌트 재사용 완료 기준에는 도달하지 않았다. Usage, Context, Workflow, Dashboard는 HIGH 차이가 2개 이상이고 Cache도 Figma fidelity 완료가 아니다. 따라서 전체 완료 또는 “모든 페이지 구현 완료” 보고는 부정확하다.

## 후속 구현 순서 제안

1. `astra-monitoring-layout`을 summary strip, section head, meter row, data row, two-column analysis, rail row, status footer까지 확장해 공통 layout contract를 고정한다.
2. Usage/Context/Workflow/Dashboard의 Figma panel 모델과 실제 Native source field를 1:1로 표로 만들고, 없는 값은 `unobserved`로 명시한다.
3. 다섯 page를 공통 shell에서 조립하고 page-specific data projection만 주입한다.
4. 각 page wide/compact render와 실제 terminal capture를 Figma reference에 재대조한다. 데이터 미관측 상태도 별도 시나리오로 검증한다.

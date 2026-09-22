# Cache 7계층 클론·디자인 시스템 충실도 최종 재감사

대상: Figma `03 CACHE — Cache Monitoring` node `50:1403`, 최신 워크트리. 2026-09-22.

## Recommendation

`APPROVE`

이전의 HIGH 2건은 모두 해소됐다. Cache는 live TUI component와 공통 theme/layout primitives로 렌더되고, Figma의 핵심 구조를 terminal 제약에 맞게 요약 card → 8열 cache grid → 분석/정책 → 상태/action rail로 번역한다. 관측되지 않은 항목은 수치나 차트로 위장하지 않고 `미관측`/`disabled`/`unavailable`로 남긴다.

## Inspected evidence

- Figma design context 재조회: `Q7kGUdqiaQRJI8CZlPMRX7`, node `50:1403`.
- `src/adapters/inbound/tui/features/cache/astra-cache-view.ts`
- `src/adapters/inbound/tui/features/cache/cache-telemetry-projection.ts`
- `src/core/domain/observability/cache-telemetry.ts`
- `src/adapters/inbound/tui/foundation/theme/astra-theme.ts`
- `src/adapters/inbound/tui/foundation/layout/astra-monitoring-layout.ts`
- `src/adapters/inbound/tui/shell/astra-surface.ts`
- `test/astra-ui.test.ts`, `test/cache-telemetry.test.ts`
- Verification: `bun test test/astra-ui.test.ts test/cache-telemetry.test.ts --test-name-pattern "Cache dashboard|Cache telemetry|monitoring pages"` → 7 pass, 0 fail. `git diff --check` → pass.

## Resolved blockers

1. **시간 정보를 발명하던 heatmap 제거.** `CacheLayerTelemetry`에 time bucket이 없음을 전제로 access-frequency heatmap을 `미관측 (time-bucket source 없음)`으로 표시한다: [astra-cache-view.ts](/Users/jonghoPro/woo/00_project/99_www/src/adapters/inbound/tui/features/cache/astra-cache-view.ts:80)–[86]. 누적 hit은 실제 aggregate hit/miss meter로만 사용된다.
2. **실제 Workspace에서 wide grid 도달.** Cache grid는 본문 78 columns부터 8열을 동적으로 배분하고, 열 폭과 7개 gap의 합이 정확히 전달된 width가 된다: [astra-cache-view.ts](/Users/jonghoPro/woo/00_project/99_www/src/adapters/inbound/tui/features/cache/astra-cache-view.ts:50)–[61]. `AstraWorkspace`의 Cache page를 120×60으로 실제 layout render해 `CACHE SLICE`와 `LAST AC`를 확인한다: [astra-ui.test.ts](/Users/jonghoPro/woo/00_project/99_www/test/astra-ui.test.ts:676)–[691]. 이로써 38-column side rail이 켜지는 환경도 검사된다.

## Design-system checks

- **Live component tree:** `AstraCacheView`/`AstraCacheRail`의 `render()`가 text UI를 생성한다. screenshot, raster asset, background image, local CSS는 없다.
- **Token/primitives:** Cache는 공통 `a`, `section`, `railSection`, `pair`, `fit`, `prose`를 사용하고: [astra-cache-view.ts](/Users/jonghoPro/woo/00_project/99_www/src/adapters/inbound/tui/features/cache/astra-cache-view.ts:3)–[4], Figma summary 구조는 공통 `monitoringCard`/`monitoringColumns`/`monitoringWidths`로 조립한다: [31]–[47].
- **Fixed 7 layers:** `CACHE_LAYER_IDS`가 seven-layer 순서를 소유하고, 무관측 metric은 `null`을 유지한다: [cache-telemetry.ts](/Users/jonghoPro/woo/00_project/99_www/src/core/domain/observability/cache-telemetry.ts:1)–[12], [78]–[117].
- **Figma layout translation:** 여섯 summary cards, wide 8-column grid, observed hit/miss/occupancy/risk 영역, 상태/action rail이 있고 compact에서는 안전하게 two-line layer rows로 전환된다: [astra-cache-view.ts](/Users/jonghoPro/woo/00_project/99_www/src/adapters/inbound/tui/features/cache/astra-cache-view.ts:24)–[29], [31]–[61], [80]–[126].
- **Partial/permission semantics:** unobserved layer가 있으면 `nominal`이 아니라 `N unobserved`, destructive controls는 실행 가능한 것처럼 보이지 않는 `disabled`/`unavailable`이다: [astra-cache-view.ts](/Users/jonghoPro/woo/00_project/99_www/src/adapters/inbound/tui/features/cache/astra-cache-view.ts:101)–[125].

## Non-blocking limitations

### MEDIUM — Figma의 usage-limit/TTL/miss-cause/24-hour trend는 아직 source contract가 없다

현재 표는 known logical bytes와 `—` TTL을 보여 주며, miss cause·TTL refresh·24-hour trend는 미관측으로 명시한다. 이는 Figma의 시각적 영역을 전부 활성화한 것은 아니지만, false data/placeholder chart로 대체하지 않는다. source telemetry가 추가되면 각 영역은 실제 timestamp/capacity/cause evidence와 함께 활성화해야 한다.

### LOW — 좁은 wide grid의 header는 일부 축약된다

78-column 본문에서 모든 열을 유지하기 위해 `LAST ACCESS` 같은 header는 폭에 맞춰 축약될 수 있다. 120-column Workspace integration test가 `LAST AC`를 의도적으로 검증한다. 이는 terminal compactness tradeoff이며, data column을 숨기거나 잘라 내는 결함은 아니다.


# Usage 페이지 Figma 대조·구현 증거

대상: Figma `01 USAGE — Provider Monitoring`, file `Q7kGUdqiaQRJI8CZlPMRX7`, node `50:610`. 날짜: 2026-09-22.

## 대조와 구현

Figma 원본의 공급자 telemetry 카드, 모델 activity grid, 우측 provider/coverage rail을 terminal 제약에 맞춰 구현했다. 카드·열 배분·meter는 feature-local 구현이 아니라 공통 `astra-monitoring-layout`의 `monitoringCard`, `monitoringColumns`, `monitoringWidths`, `monitoringMeter`를 사용한다.

- 실제 provider snapshot이 있으면 상태와 첫 실제 quota의 남은 비율만 보인다.
- snapshot/limit이 없으면 `미관측` 또는 `quota 미관측`으로 표시한다.
- model은 실제 `totalTokens`, interactive/detached invocation과 token만 보인다.
- Figma의 input/output/cached 분해, 실행 시간, recent-use, supported efforts, cost/trend는 source contract가 없으므로 `미관측`으로 명시한다.
- 96 columns 이상은 4개 provider 카드의 공통 grid, 그 미만은 card stack을 사용한다.

## 시나리오·호출·관측값

| 성공 기준 | 시나리오 | 호출 | 이진 관측값 |
| --- | --- | --- | --- |
| 실제 Usage 표시 | Codex quota 62%, session 1,500 tokens, model 1개 | `bun test test/astra-usage-view.test.ts` | `AstraUsageView > shows only observed session and provider usage` 통과; 출력에 `62% 남음`, session/model 값, source 없는 fields의 미관측 선언이 존재한다. |
| 반응형 구조 | 120-column wide와 60-column compact 렌더 | 같은 호출 | `AstraUsageView > uses shared provider cards wide, stacks them compactly, and keeps the rail honest` 통과; wide box glyph, compact unobserved card, 38-column rail 문구를 확인하며 모든 행의 visible width가 각 viewport 이하이다. |
| 미관측 보존 | provider/session 데이터가 없는 40/80/120-column 렌더 | 같은 호출 | `AstraUsageView > keeps unobserved state explicit and every row within the pane` 통과; `연결 대기`와 `미관측`이 유지되고 모든 행 폭이 제한 이하다. |
| Usage 변경 검증 | 위 3개 Usage 시나리오 | `bun test test/astra-usage-view.test.ts` | `3 pass`, `0 fail`, `31 expect() calls`. |
| 전체 TypeScript | 공유 워크트리 typecheck | `bun run check` | Usage 소유 파일 오류 없이 중단. 병렬 변경의 `test/entry-dashboard-view.test.ts:67,72`가 `cacheObservations.id: string`을 `CacheLayerObservation` 고정 ID union에 대입하지 못해 실패했다. |

## 변경 소유

- `src/adapters/inbound/tui/features/usage/astra-usage-view.ts`
- `test/astra-usage-view.test.ts`
- `test/astra-ui.test.ts`의 Usage Workspace black-box scenario

`usage.units.ts`의 기존 병렬 변경은 소유 범위가 아니므로 수정하지 않았다.

## 최종 감사 보완 (Figma 하단 hierarchy)

감사 지적에 따라 Figma Usage 하단의 다섯 계층을 모두 공통 bordered panel로 분리했다.

| Panel | 관측 정책 |
| --- | --- |
| `Provider Availability` | 실제 provider state와 quota/reset snapshot을 matrix로 표시한다. |
| `Token / Effort` | 실제 session model의 effort, calls, interactive/detached token만 표시한다. |
| `Telemetry Distribution` | model usage에 provider attribution이 없어 `unavailable` panel로 명시한다. |
| `Token Matrix` | observed session total, interactive/detached, unattributed, 명확히 별도인 context window만 표시한다. |
| `Performance Chart` | duration/time-bucket source가 없어 `unavailable` panel로 명시한다. |

모든 panel은 공통 `monitoringPanel`, `monitoringMatrix`, `monitoringUnavailablePanel`을 사용하며 feature-local box/layout을 만들지 않았다.

| 성공 기준 | 시나리오 | 호출 | 이진 관측값 |
| --- | --- | --- | --- |
| 다섯 Figma 하단 계층 | observed session/provider와 unobserved telemetry | `bun test test/astra-usage-view.test.ts` | `3 pass`, `0 fail`, `48 expect() calls`; 다섯 panel 제목, unavailable 선언, 40/80/120열 bounds를 확인한다. |
| 실제 Workspace rail split | `AstraWorkspace` Usage page, 120×60 → lower scroll → 80×24 | `bun test test/astra-ui.test.ts --test-name-pattern "Usage keeps every Figma lower hierarchy panel"` | `1 pass`, `0 fail`; 120열에서는 `Usage monitor` rail이 column 80 이후에 있고, main pane의 Token/Effort·Provider Availability와 scroll 뒤 Telemetry Distribution·Token Matrix·Performance Chart가 모두 보이며 모든 row bound가 유지된다. |
| Usage 회귀 | Usage view와 Workspace UI 전체 | `bun test test/astra-ui.test.ts test/astra-usage-view.test.ts` | `71 pass`, `0 fail`, `1466 expect() calls`. |
| 정적 검증 | 공유 워크트리 최신 상태 | `bun run check` 및 `git diff --check` | 둘 다 성공(출력 없음). |

# Dashboard Figma fidelity evidence — 2026-09-22

## Scope

- Figma source: `Q7kGUdqiaQRJI8CZlPMRX7`, node `50:2169` (`05 DASHBOARD — Session Overview`).
- Owned implementation: `src/adapters/inbound/tui/features/dashboard/entry-dashboard-view.ts`.
- Owned verification: `test/entry-dashboard-view.test.ts`.

## Direct Figma comparison

Scenario: compare the Dashboard node's information hierarchy with the native terminal view.

- Invocation: `mcp__codex_apps__figma_get_design_context({ fileKey: "Q7kGUdqiaQRJI8CZlPMRX7", nodeId: "50:2169", skillNames: "figma-design-to-code" })`.
- Binary observable: node exposes a five-card session summary, four module-router cards, token/allocation analysis, three-row activity heatmap, and a session/system/navigation rail.
- Result: the native wide view renders the same hierarchy with shared `monitoringCard`, `monitoringColumns`, `monitoringMeter`, `railSection`, and Astra theme primitives.
- Data boundary: session, context, workflow, cache, and activity values are read from `WorkbenchSnapshot`; the activity matrix uses durable `recordedAt` timestamps. Missing cache/token data is rendered as `미관측`, not a fabricated zero or percentage.

## Automated scenarios

1. Wide Dashboard surface
   - Invocation: `bun test test/entry-dashboard-view.test.ts`
   - Binary observable: `renders the WWW first screen from the current Workbench snapshot` asserts summary cards, module router, actual context percentage, token allocation, timestamp-backed activity frequency, and event aggregates.

2. Observed Cache ratio plus compact width
   - Invocation: `bun test test/entry-dashboard-view.test.ts`
   - Binary observable: `uses only observed cache access counts and keeps compact dashboard rows bounded` asserts `90% hit` / `9/10 accesses` from a supplied cache observation and verifies every row at widths 36, 60, and 90.

3. Dashboard rail, wide and compact panes
   - Invocation: `bun test test/entry-dashboard-view.test.ts`
   - Binary observable: `keeps the dashboard rail snapshot-backed and bounded in wide and compact panes` verifies project/thread/model/context source fields, `/cache` navigation, and row bounds at widths 24 and 48.

4. Type and formatting guards
   - Invocation: `bunx tsc --noEmit && git diff --check -- src/adapters/inbound/tui/features/dashboard/entry-dashboard-view.ts test/entry-dashboard-view.test.ts`
   - Binary observable: process exits 0.

## Captured result

`bun test test/entry-dashboard-view.test.ts`: 8 pass, 0 fail, 297 assertions.

`bunx tsc --noEmit`: exit 0.

`git diff --check`: exit 0.

## Final audit blocker repair

The real dashboard body is narrower than the terminal once the 38-column rail and insets are active. The former `< 92` compact branch removed the summary cards, module router, token analysis, and activity analysis at that actual body width.

Scenario: render the real `AstraWorkspace` Dashboard at 120 columns with its rail enabled.

- Invocation: `bun test test/entry-dashboard-view.test.ts test/astra-ui.test.ts`.
- Binary observable: `Dashboard keeps summary, router, proportion, and heatmap panels in the actual 120-column workspace rail split` renders the true `AstraWorkspace` component at `120 × 60`, asserts five summary landmarks (`SESSION`, `EVENTS`, `TOKENS`, `CONTEXT`, `HEALTH`), the module router, `TOKEN ALLOCATION / PROPORTION`, `INPUT / OUTPUT / CACHE`, `ACTIVITY HEATMAP`, and the `Session context` rail. It also asserts every frame row is at most 120 cells.
- Result: 76 pass, 0 fail, 1,785 assertions across the Dashboard and Astra Workspace test files.

Scenario: absence of token-category and time-series telemetry.

- Invocation: `bun test test/entry-dashboard-view.test.ts`.
- Binary observable: `keeps token proportion and activity heatmap landmarks when telemetry is unavailable` requires both panels to remain visible at 80 cells, with `recordedAt unavailable` and without the observed-time label.
- Result: unavailable remains explicit; no input/output/cache slice, timestamp, or token value is fabricated.

`bunx tsc --noEmit` and `git diff --check -- src/adapters/inbound/tui/features/dashboard/entry-dashboard-view.ts src/adapters/inbound/tui/foundation/layout/astra-monitoring-layout.ts test/entry-dashboard-view.test.ts test/astra-ui.test.ts`: exit 0.

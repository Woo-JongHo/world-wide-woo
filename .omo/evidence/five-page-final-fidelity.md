# Five-page final Figma fidelity audit — 2026-09-22

## Scope and method

Read-only review of the current worktree only. Earlier completion claims and prior
review artifacts were not accepted as evidence. The five Figma design contexts were
re-read from file `Q7kGUdqiaQRJI8CZlPMRX7` at nodes `50:610` (Usage), `50:967`
(Context), `50:1403` (Cache), `50:1986` (Workflow), and `50:2169` (Dashboard).

The reference is a desktop monitoring surface with a fixed header, full-width main
panel and desktop sidebar. The implementation is a terminal UI, so this audit allows
terminal-native equivalents (live text, box drawing, and coloured terminal cells),
but does not allow silently omitting a reference panel hierarchy just because a metric
is unavailable. An unavailable panel may be represented as a clearly labelled,
non-fabricated unavailable state.

## Evidence inspected

- Figma `get_design_context` results for all five nodes above, including their layer
  hierarchies. Reference hierarchy names observed include:
  - Usage: `provider-metrics-box`, `model-grid`, `analytics-main`,
    `provider-availability-panel`, `token-effort-panel`, `token-matrix`,
    `perf-chart`, `sidebar`.
  - Context: `summary-strip`, `visualizer-box`, `analysis-panel`,
    `section-activity`, `section-diagnostics`, `dep-map`, `insight-panel`, `sidebar`.
  - Cache: `summary-strip`, `cache-grid`, `occupancy-panel`, `heatmap-panel`,
    `miss-diag-col`, `telemetry-panel`, `sidebar`.
  - Workflow: `summary-strip`, `node-graph-area`, `execution-panel`,
    `queue-section`, `matrix-panel`, `sidebar`.
  - Dashboard: `summary-strip`, `entry-point-grid`, `token-panel`,
    `heatmap-panel`, `sidebar`.
- Current implementations:
  - `src/adapters/inbound/tui/features/usage/astra-usage-view.ts`
  - `src/adapters/inbound/tui/features/context/astra-context-view.ts`
  - `src/adapters/inbound/tui/features/cache/astra-cache-view.ts`
  - `src/adapters/inbound/tui/features/workflow/astra-workflow-view.ts`
  - `src/adapters/inbound/tui/features/dashboard/entry-dashboard-view.ts`
  - `src/adapters/inbound/tui/foundation/layout/astra-monitoring-layout.ts`
  - `src/adapters/inbound/tui/shell/astra-surface.ts`
- Current targeted test execution:
  `bun test test/astra-ui.test.ts test/astra-usage-view.test.ts
  test/entry-dashboard-view.test.ts test/astra-shell.test.ts
  test/dashboard-layout.test.ts` → **90 pass / 0 fail**.

## Cross-page findings

### HIGH — 120-column Workspace does not preserve the Figma desktop main-panel layout

At a 120-column terminal, monitoring pages show a 38-column rail whenever the frame
is at least 18 rows tall (`astra-surface.ts:200-203`). The main pane is consequently
about 81 columns wide after the stack divider/insets, not 120. All five Figma nodes
are desktop layouts that require the reference main panel plus its sidebar. The
implementation's wide card thresholds are tested at a *standalone component* width of
120, but not at the actual 120-column Workspace content width. This directly changes
the layout: Usage stacks its provider cards below 96 (`astra-usage-view.ts:51-54`),
Context reduces its seven-card summary below 108 (`astra-context-view.ts:82-86`),
Cache reduces cards below 108 (`astra-cache-view.ts:40-46`), and Dashboard uses a
different compact structure below 92 (`entry-dashboard-view.ts:175-184`).

The current Workspace test only asserts that two cache table strings are visible at
120 columns (`test/astra-ui.test.ts:714-725`); it does not assert the reference desktop
panel hierarchy. Therefore passing 120-wide tests are not evidence of the requested
desktop Figma composition.

### MEDIUM — The shared terminal primitives are real and reusable, but cover only cards,
columns and meters

`monitoringCard`, `monitoringColumns`, `monitoringWidths`, and `monitoringMeter` are
live terminal components/helpers (`astra-monitoring-layout.ts:9-39`) and are reused by
all five views. Theme inks also come from shared palette getters rather than page-local
hex values (`astra-theme.ts:5-37`). This satisfies the no-screenshot/no-raster and
token-reuse checks. It does not, however, provide reusable primitives for reference
graph, heatmap, dependency graph, queue matrix, or diagnostics structures, which
contributes to the missing panel hierarchies below.

## Page findings

### Usage — BLOCK

**Missing reference hierarchy (HIGH).** The implementation renders provider cards,
model rows, per-provider quota rows, and a single `Cost & trends` unavailable message
(`astra-usage-view.ts:100-112`). It has no terminal counterparts for the Figma
`analytics-main`, provider availability, token-effort distribution, telemetry
distribution, token matrix, or performance chart panels. The Figma lower workspace is
therefore not represented as a panel hierarchy; it is omitted rather than labelled
unavailable panel-by-panel.

**Honesty and reuse (PASS).** Provider, cost, execution-time and trend unavailability
are explicit (`astra-usage-view.ts:72-85, 109-111`); the cards use shared monitoring
primitives (`astra-usage-view.ts:4, 51-54`). No image/screenshot substitute is used.

**Responsive evidence (PARTIAL).** Standalone 120/60 card stacking and a 38-column rail
are covered by `test/astra-usage-view.test.ts:45-64`; the actual 120-column Workspace
limitation above remains.

### Context — BLOCK

**Missing reference hierarchy (HIGH).** The summary cards and a context meter exist
(`astra-context-view.ts:70-103`), but the Figma `section-activity` turn chart,
`section-diagnostics` event grid, `insight-panel`, and `dep-map` are absent. The later
ledger/session/skills text sections (`astra-context-view.ts:138-177`) do not recreate
those visual panel landmarks or explicitly label each omitted analysis panel as
unavailable.

**Honesty and reuse (PASS).** Source-token allocation, compression, and retrieval are
shown as `미관측` (`astra-context-view.ts:74-79, 95-102`), and summaries reuse common
cards/columns/meters (`astra-context-view.ts:5, 82-85, 99`).

**Responsive evidence (PARTIAL).** Standalone 120/60 bounds are asserted
(`test/astra-ui.test.ts:236-254`), not the full Workspace desktop hierarchy at 120.

### Cache — BLOCK

**Reference mismatch (HIGH).** The fixed seven-layer cache table and summary cards are
genuine (`astra-cache-view.ts:31-61, 64-94`), but the Figma lower workspace separately
contains occupancy, hit/miss and eviction trends, a heatmap, miss diagnosis, and
telemetry flow. The implementation compresses these into text lines and a single
meter; several reference panels do not exist as individually addressable unavailable
panels (`astra-cache-view.ts:80-87`). This is materially different from the reference
panel hierarchy.

**Actual data and honesty (PASS).** The cache snapshot preserves null values and maps
only named observed layers (`cache-telemetry.ts:75-120`); the UI explicitly says it
does not infer unknown values as zero (`astra-cache-view.ts:89-91`). It uses live text
and shared primitives, not an image.

**Responsive evidence (PARTIAL).** Standalone 120/60 and rail checks exist
(`test/astra-ui.test.ts:257-280`), but not a full 120-column desktop composition check.

### Workflow — BLOCK

**Missing reference hierarchy (HIGH).** Figma's top node graph and lower parallel
execution lanes, queue grid, matrix/state-change panels are absent. The implementation
has cards plus a linear list of seven stages and delegated tasks
(`astra-workflow-view.ts:44-118`). That is an operationally valid projection, but it
does not match the designed graph/pipeline/queue/matrix hierarchy.

**Actual data and honesty (PASS).** It selects only the active turn and connected
delegations (`astra-workflow-view.ts:18-29, 94-107`), displays absent request/delegation
state as `미관측` (`astra-workflow-view.ts:48-59, 69-70, 96-97`), and uses common cards
and meter primitives (`astra-workflow-view.ts:5, 61-65, 71-79`).

**Responsive evidence (PARTIAL).** Standalone 120/52 bounds and active-turn filtering
are tested (`test/astra-ui.test.ts:529-544`). It does not establish the Figma desktop
graph/queue layout at Workspace width 120.

### Dashboard — BLOCK

**Missing reference hierarchy (HIGH).** Dashboard correctly emits five summary cards,
module-router cards, token allocation and activity frequency when its own render width
is 92+ (`entry-dashboard-view.ts:187-213`). It does not recreate the distinct Figma
lower token proportion and heatmap panels as their own panel structure, and it replaces
the reference dashboard body with an event matrix. At a 120-column Workspace it falls
into the compact branch because the rail reduces content below 92
(`entry-dashboard-view.ts:175-184`; `astra-surface.ts:200-203`), so the five-card
reference summary/router hierarchy is not rendered at all alongside the rail.

**Actual data and honesty (PASS).** Dashboard values derive from `WorkbenchSnapshot`
(`entry-dashboard-view.ts:155-174`); cache percentages are returned as `미관측` if no
observed accesses exist (`entry-dashboard-view.ts:94-104`), and the activity matrix
uses recorded timestamps rather than fabricated dates (`entry-dashboard-view.ts:114-146`).

**Responsive evidence (PARTIAL).** Component-level compact width bounds are covered
(`test/entry-dashboard-view.test.ts:62-83`), but that does not prove the required
120-column Workspace composition.

## Severity summary

- CRITICAL: none. No page uses a pasted screenshot, raster background, or an image as
  a UI substitute.
- HIGH: all five pages fail the Figma panel-hierarchy requirement; cross-page actual
  120-column Workspace composition invalidates standalone-120 claims.
- MEDIUM: shared primitive set is appropriately reused but incomplete for the designed
  monitoring graph/heatmap/matrix structures.
- LOW: none material beyond ordinary text truncation/responsiveness trade-offs.

## Verdict

| Page | Result | Reason |
| --- | --- | --- |
| Usage | BLOCK | Reference analytics lower workspace is omitted. |
| Context | BLOCK | Activity/diagnostics/dependency/insight panels are omitted. |
| Cache | BLOCK | Seven-layer data is real, but lower visual analytic panels are collapsed/omitted. |
| Workflow | BLOCK | Graph, lanes, queue and matrix hierarchy is replaced with a list. |
| Dashboard | BLOCK | 120-column Workspace takes compact branch; lower visual hierarchy differs. |

**Overall recommendation: REQUEST_CHANGES / BLOCK.** The implementation has real,
token-driven terminal components and truthful telemetry, but it is not yet a faithful
implementation of the five Figma designs at the requested 120-column Workspace state.

## Required changes before approval

1. Define and render terminal-native, reusable panel primitives for the Figma analysis
   hierarchy (cards, chart/matrix/heatmap/diagnostic/flow/queue panel containers), with
   individual explicit unavailable states when a source metric does not exist.
2. Preserve the desktop main-panel hierarchy at an actual 120-column Workspace with the
   sidebar visible. This may require a changed wide breakpoint/layout allocation or a
   deliberately different rail policy; standalone `render(120)` is insufficient.
3. Add black-box Workspace tests for every page at 120-wide-with-rail and compact
   widths that assert reference panel landmarks as well as width bounds.

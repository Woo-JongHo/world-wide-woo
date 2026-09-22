# Cache lower-panel fidelity evidence

## Scenario

Render the Cache page from a `CacheTelemetrySnapshot` with one real `render`
observation, then render the real `AstraWorkspace` at 120 columns with its
38-column rail and again at 80 columns.

## Invocation

`bun test test/astra-ui.test.ts test/cache-telemetry.test.ts && bunx tsc --noEmit`

## Binary observables

- The direct Cache screen contains five Figma-derived lower landmarks:
  `Occupancy`, `Hit / Miss & Eviction Trends`, `Access Heatmap`, `Miss
  Diagnostics`, and `Telemetry Flow`.
- Only observed bytes, hits, misses, and evictions become meters or counts.
  Missing time buckets and miss causes render explicit unavailable statements;
  no history chart or cause is fabricated.
- The real 120-column `AstraWorkspace` exposes `Cache health` and `Cache
  actions` in the rail at column 80 or later, keeps all rows within 120 cells,
  and reaches all five lower landmarks after scrolling.
- The 80-column Workspace hides the Cache rail and keeps every rendered row
  within 80 cells.

## Result

`72 pass / 0 fail` across the two Cache-focused test files; TypeScript emitted
no diagnostics. `git diff --check` for the owned Cache view and test files
also passed.

# Usage Snapshot Cache Telemetry Evidence

Date: 2026-09-22

## Scenario

`UsageService` records only its real `lastReady` cache behavior:

1. an Anthropic quota request with no prior snapshot is a cache miss;
2. a request inside the five-minute TTL reuses that snapshot as a hit;
3. a failed request after TTL falls back to the last snapshot as a second hit while recording the required network miss;
4. credential removal clears that entry as an eviction.

## Invocations and observables

| Invocation | Binary observable |
| --- | --- |
| `bun test test/usage-service.test.ts` before implementation | failed: `TypeError: service.cacheMetrics is not a function` in the new seam scenario. |
| `bun test test/usage-service.test.ts` after implementation | passed: `10 pass`, `0 fail`, `37 expect() calls`. The new scenario observes `{ entries: 1, hits: 0, misses: 1, evictions: 0 }`, then TTL `{ hits: 1 }`, stale fallback `{ hits: 2, misses: 2 }`, then credential removal `{ entries: 0, evictions: 1 }`. |
| `git diff --check` | passed with no output. |
| `bunx tsc --noEmit` | not green at capture time because shared, concurrently edited test doubles do not yet implement the newly required `UsageMonitor.cacheMetrics()` method (`test/astra-shell.test.ts` and `test/tui-shell-characterization.test.ts`); also blocked by unrelated in-progress `WorkbenchSnapshot.cacheObservations` errors in `test/project-workbench.test.ts`. |

## Changed ownership

- `src/core/ports/index.ts`: public read-only `UsageSnapshotCacheMetrics` and `UsageMonitor.cacheMetrics()` seam.
- `src/adapters/outbound/observability/usage-service.ts`: real cache miss, reuse hit, stale fallback hit, access time, and removal eviction accounting.
- `test/usage-service.test.ts`: behavior-level lifecycle test for the metrics seam.

# Render Health Monitoring Code Review

## Scope and evidence

- Goal reviewed: expose per-terminal-frame `render-schedule.queued` to terminal-write completion latency, 100 ms slow-frame rate, percentiles, and worst frame in the WWW Monitoring view.
- Reviewed diff: `src/core/domain/observability/layer-performance.ts`, `src/adapters/inbound/tui/features/monitoring/view/www-monitor-view.ts`, `test/layer-performance.test.ts`, and `test/www-telemetry-duration.test.ts`.
- Runtime wiring inspected: `src/adapters/inbound/tui/shell/workbench-shell.ts:193-203, 367-388, 640-654`; it assigns a shared `terminal-frame-N` identity to traces coalesced into one TUI render.
- Checks run: `bun test test/layer-performance.test.ts test/www-telemetry-duration.test.ts` (12 pass, 0 fail); `bun run check` (pass); `git diff --check` (pass).

## Skill-perspective check

`remove-ai-slops` and `programming` are not available in this session's skill catalog or repository file list, so their documented checklists could not be loaded. I applied the requested perspectives manually: the new tests are not deletion-only or tautological, and no untyped escape hatch or unnecessary parsing was added. The production aggregation is small and directly needed for the goal. The test coverage still misses the failure boundary below.

## Re-review result

The blocking issue is fixed. `renderMs` now requires `terminal-write.completed` (`layer-performance.ts:118-126`), while `totalMs` and `errorCount` retain failed writes as request/trace errors. The new unit regression at `test/layer-performance.test.ts:115-123` proves a 500 ms failed write leaves render-frame samples empty. This matches the boundary: Render Health represents successfully completed terminal frames, not failed I/O.

The coalescing concern is also now covered at the real shell boundary. `test/tui-shell-characterization.test.ts:277-302` compares the render-window frame-count increase against the number of unique terminal frame IDs emitted by the coalesced Native events. Together with the recorder test's oldest-queued-to-shared-completion values, this substantiates the aggregation semantics.

## Remaining finding

### LOW

1. `Current render` is trace-scoped but is presented alongside frame-scoped metrics.  
   **Location:** `src/adapters/inbound/tui/features/monitoring/view/www-monitor-view.ts:45-48`.

   For a coalesced frame, `current` is the latest trace, while the frame's displayed p95/worst value uses the oldest queued trace (`max` latency). This is not wrong if the label means “latest trace”, but it makes the row easy to compare incorrectly with `Slow frames` and `Worst frame`. Rename it to `Current trace latency` or project the current physical frame's latency explicitly.

## Assessment

- `codeQualityStatus`: `CLEAR`
- `recommendation`: `APPROVE`
- `blockers`: none.

No CRITICAL, HIGH, or MEDIUM findings remain. The bounded 128-trace window keeps the additional snapshot work finite; it is not a release blocker, though profiling under a busy Monitoring view would be useful after correctness is fixed.

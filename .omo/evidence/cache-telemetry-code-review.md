# Cache telemetry final code review

Scope: 7-layer Cache telemetry changes only. Reviewed the domain projection, Workbench instrumentation, UsageMonitor contract, ActivityJournalStore / ThreadBoundActivityJournal bridge, Astra surface, and their focused tests.

Skill-perspective check: `remove-ai-slops` and `programming` are not available in this session's skill catalog, so their requested checks were applied directly: tests were checked for implementation mirroring and tautology; production code was checked for needless abstraction, untyped escapes, and boundary-only validation. The diff has one implementation-mirroring test noted below and does not otherwise introduce untyped escape hatches or unnecessary parsing.

## CRITICAL

None.

## HIGH

1. Cache state is reported as `ready` even when its source is failed or stale, and first population is counted as an eviction. This makes the dashboard claim real cache health facts that are false.

   - `src/core/application/orchestration/project-workbench.ts:792` and `:797` pass `true` to `recordCacheMiss` for every Linear refresh, including the first load and an initial failure. With no previously retained dashboard value, there is nothing to evict. The new test codifies this incorrect behavior at `test/project-workbench.test.ts:512-513`.
   - `src/core/application/orchestration/project-workbench.ts:486` likewise records an eviction for the first successful Native model-catalog fetch, although the only preceding data is the static fallback.
   - `src/core/application/orchestration/project-workbench.ts:2373-2383` hard-codes every Workbench observation to `state: "ready"`. Thus a dashboard currently in `error` or `stale`, and a model catalog whose Native refresh failed, are presented as healthy cache layers. The fixed layer state type already supports `stale` and the UI explicitly highlights it.

   Required change: derive eviction from whether a prior retained value for that same cache owner was replaced, and derive the observation state from the model catalog / dashboard source state (or make it `unobserved` where no cache-backed value exists). Add a first-load, failed-load, and stale-reuse test that checks both state and eviction count.

## MEDIUM

1. The generic composition boundary has silent last-writer-wins precedence for duplicate IDs, but neither documents nor tests it.

   - `src/core/domain/observability/cache-telemetry.ts:77` creates a `Map` from observations, so duplicate IDs overwrite earlier values silently.
   - `src/adapters/inbound/tui/features/cache/cache-telemetry-projection.ts:40-55` deliberately puts local transcript/render metrics first, external Workbench observations second, and Usage last. Today the actual caller avoids those duplicates, but the public input type allows them; a future snapshot can overwrite the local telemetry without an error or clear priority rule.

   Required change: either reject duplicate IDs in `composeCacheTelemetry`, or constrain the projection inputs to their owned IDs and add a test proving the documented precedence. The test at `test/cache-telemetry.test.ts:88-106` only proves all seven IDs can be present; it does not test collision behavior.

2. Session-read telemetry is unit-tested at the store level but not through the ThreadBoundActivityJournal-to-WorkbenchSnapshot route.

   - The bridge is present at `src/adapters/outbound/workspace/project-workbench-session.ts:394-416`, and core consumes it at `src/core/application/orchestration/project-workbench.ts:2358-2359`.
   - Existing tests cover `ActivityJournalStore.cacheTelemetry()` but no test binds a `ThreadBoundActivityJournal`, constructs a Workbench, and asserts that the public snapshot contains the scoped `session-read` layer. A structural cast in `:413-415` makes this exactly the wiring that needs an integration test.

   Required change: add one integration test covering bound stream selection, an observed `session-read` snapshot layer, and non-leakage from the intake/other stream.

## LOW

1. `test/project-workbench.test.ts:495-520` is partly implementation-mirroring: it asserts the fabricated initial eviction value instead of a user-visible cache invariant. This violates the requested `remove-ai-slops` perspective and should be replaced while fixing the HIGH issue.

2. `UsageMonitor.cacheMetrics()` is a sensible outbound contract and the adapter-to-TUI dependency direction is intact. Its focused test exercises hit, miss, stale reuse, and eviction; no issue found there.

## Verification

- `bun test test/cache-telemetry.test.ts test/usage-service.test.ts test/activity-journal-store.test.ts test/project-workbench.test.ts test/astra-shell.test.ts test/astra-ui.test.ts test/astra-transcript-cache.test.ts` — 238 pass, 0 fail.
- `bun run check` (`tsc --noEmit`) — pass.
- `git diff --check` — pass.

## Decision

codeQualityStatus: BLOCK

recommendation: REQUEST_CHANGES

blockers:

- Correct false dashboard/model-catalog eviction accounting and source-state reporting, with regression tests.

---

## Re-audit (latest worktree)

The originally reported false first-eviction issue is fixed: model catalog only counts an eviction when replacing a Native catalog (`project-workbench.ts:485-487`), and the first Dashboard fetch tests `evictions: 0` (`test/project-workbench.test.ts:495-520`). Duplicate layer owners are now rejected (`cache-telemetry.ts:77-81`) with a focused test. The ThreadBoundActivityJournal bridge is now covered through the public Workbench snapshot (`test/project-workbench-session.test.ts:64-78`).

One HIGH blocker remains:

1. An empty/loading Dashboard is still rendered as a stale cache layer rather than unobserved (or a distinct loading state). At `src/core/application/orchestration/project-workbench.ts:2355-2362`, the layer has `entries: 0` whenever `fetchedAt === null`, but `state` is `"stale"` for every source state except `"ready"`, including initial `loading` and initial error. No retained Dashboard cache value exists in those states, so stale falsely asserts an older retained value. This breaks the stated nullable/unobserved contract. The existing stale-Dashboard test (`test/project-workbench.test.ts:562-589`) checks `linearDashboard.state` only; it does not assert the associated cache observation is stale only after a prior successful snapshot.

Required change: emit no `dashboard-data` observation (so the fixed seven-layer projection renders it unobserved) until a Dashboard payload has been retained; emit `stale` only when `fetchedAt !== null` and the source itself is stale/error. Add one loading/initial-failure assertion and one prior-success-then-failure assertion against `cacheObservations`.

Re-audit verification:

- `bun test test/cache-telemetry.test.ts test/project-workbench.test.ts test/project-workbench-session.test.ts` — 152 pass, 0 fail.
- `bun run check` — pass.
- `git diff --check` — pass.

Re-audit decision: `codeQualityStatus: BLOCK`; `recommendation: REQUEST_CHANGES`.

---

## Final re-audit

The remaining Dashboard issue is resolved. `src/core/application/orchestration/project-workbench.ts:2355-2363` now adds a `dashboard-data` observation only once `fetchedAt !== null`; the fixed seven-layer composition therefore renders loading / initial failure as `unobserved`. A retained Dashboard snapshot is `ready` on success and `stale` only after a subsequent failure.

The integration assertions cover all three public states at `test/project-workbench.test.ts:464-482` and `:562-589`.

Final verification:

- `bun test test/project-workbench.test.ts test/project-workbench-session.test.ts test/cache-telemetry.test.ts` — 152 pass, 0 fail.
- `bun run check` — pass.
- `git diff --check` — pass.

Final decision: `codeQualityStatus: CLEAR`; `recommendation: APPROVE`; no blockers remain in the reviewed Cache telemetry scope.

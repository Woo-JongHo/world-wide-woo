# Workbench Context / Model Catalog / Dashboard cache telemetry evidence

Date: 2026-09-22
Branch: `ui/workbench-visual-polish`

## Success criteria

### Context Projection

- Scenario: a ready Workbench re-publishes without changing Activity length or root thread.
- Invocation: `bun test test/project-workbench.test.ts --test-name-pattern "reports a connected Dashboard snapshot miss|reports request and delegation projection cache reuse|coalesces concurrent Native model catalog refreshes"`
- Binary observable: `context-projection` has two entries (request and delegation); the public `session.mode` dispatch increases hits while misses and evictions remain unchanged.
- Result: pass.

### Model Catalog

- Scenario: two concurrent public `refreshModels()` calls share one in-flight Native model-list request.
- Invocation: same targeted test command above.
- Binary observable: Native `listModels` call count increases by exactly one, misses increase by exactly one, hits increase, and entries equal the two returned model options.
- Result: pass.

### Dashboard Data

- Scenario: a connected Linear Dashboard performs one remote refresh, then a Workbench publish reuses the stored snapshot.
- Invocation: same targeted test command above.
- Binary observable: `dashboard-data` reports one entry, one miss, one replacement eviction, and a later cache hit without an additional refresh; an unconnected Workbench omits the observation.
- Result: pass.

Targeted result: `3 pass / 0 fail / 13 expect`.

## Regression and structure

- Invocation: `bun test test/project-workbench.test.ts`
- Binary observable: exit 0, `129 pass / 0 fail / 736 expect`.
- Invocation: `bun run check`
- Binary observable: `tsc --noEmit`, exit 0.
- Invocation: `bun test test/architecture.test.ts`
- Binary observable: exit 0, `13 pass / 0 fail / 1783 expect`.
- Invocation: `git diff --check -- src/core/application/orchestration/project-workbench.ts src/core/domain/work/workbench.ts test/project-workbench.test.ts`
- Binary observable: no output, exit 0.
- Invocation: `rg -n 'TODO|test\\.skip|test\\.only|describe\\.skip|describe\\.only' src/core/application/orchestration/project-workbench.ts src/core/domain/work/workbench.ts test/project-workbench.test.ts`
- Binary observable: only the pre-existing literal `TODO.md` fixture reference at `test/project-workbench.test.ts:809`; no placeholder or skipped/focused test was introduced.

## Changed surface

- `src/core/application/orchestration/project-workbench.ts`: actual hit/miss/eviction/latency/last-access instrumentation for request+delegation projections, model catalog, and connected Dashboard snapshot.
- `src/core/domain/work/workbench.ts`: optional public `cacheObservations` projection.
- `test/project-workbench.test.ts`: public-seam behavior tests and Native model catalog fixture.

No cache UI, theme, layout, or shared cache contract was changed in this assignment.

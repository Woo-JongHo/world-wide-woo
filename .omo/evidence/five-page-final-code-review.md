# Five-page final code review — 2026-09-22

## Scope and method

Read-only review of the Usage, Context, Cache, Workflow and Dashboard screens; their shared monitoring layout; shell wiring; and cache telemetry paths. Unrelated readability-skill changes were deliberately excluded.

`remove-ai-slops` and `programming` skill perspectives were requested by the review protocol, but neither skill is available in this session's skill catalog. I applied their stated checks manually: tests were checked for tautology/implementation mirroring and production code for needless abstraction, untyped escapes, and unnecessary parsing/normalization.

## Result

## Re-audit — after remediation

The two previous HIGH findings are fixed:

- The Usage projection now omits an untouched all-zero metric object, and `test/cache-telemetry.test.ts` proves that the layer remains `unobserved`.
- `projectModelCatalog()` no longer increments a hit. The refreshed Workbench test proves an unrelated publish leaves Model Catalog hits unchanged, while a concurrent `refreshModels()` still records the coalesced lookup.

The navigation expectation was aligned to the intentional Figma heading, and the unused `monitoringHeatmap` export was removed. Final status:

`codeQualityStatus: CLEAR`  
`recommendation: APPROVE`

## Findings

### HIGH — Usage cache is presented as observed before there has been any cache observation

- [cache-telemetry-projection.ts:45](/Users/jonghoPro/woo/00_project/99_www/src/adapters/inbound/tui/features/cache/cache-telemetry-projection.ts:45) unconditionally turns every `UsageSnapshotCacheMetrics` object into a `usage-snapshot` layer observation.
- [usage-service.ts:133](/Users/jonghoPro/woo/00_project/99_www/src/adapters/outbound/observability/usage-service.ts:133) always returns such an object, including the initial `{ entries: 0, hits: 0, misses: 0, evictions: 0, lastAccessedAt: null }` state.
- `composeCacheTelemetry` therefore assigns the default `ready` state. On first render this raises Cache coverage and exposes zero-valued Usage metrics even though the service has neither fetched nor reused a snapshot. This contradicts the screen's stated policy that unknown values are not fabricated as zero.

Required fix: include an explicit observation state (or nullable/unobserved result) in the Usage cache contract, and omit or mark the layer `unobserved` until a fetch, reuse, or clear operation has actually been observed. Add an end-to-end Cache view/projection test for the initial usage monitor state.

### HIGH — Model Catalog hit metric is manufactured by snapshot projection, not a cache lookup

- [project-workbench.ts:2256](/Users/jonghoPro/woo/00_project/99_www/src/core/application/orchestration/project-workbench.ts:2256) calls `projectModelCatalog()` for every Workbench snapshot.
- [project-workbench.ts:2369](/Users/jonghoPro/woo/00_project/99_www/src/core/application/orchestration/project-workbench.ts:2369) increments `modelCatalogCacheTelemetry.hits` unconditionally. It does so even before `refreshModels()` has succeeded, including when the catalog is only the static fallback.

Consequently normal UI publishes/renders increase the displayed hit rate without a catalog-cache reuse or coalesced request. The added test at [project-workbench.test.ts:550](/Users/jonghoPro/woo/00_project/99_www/test/project-workbench.test.ts:550) accepts the inflation by reading `snapshot` before and after the operation, so it does not protect against this false counter.

Required fix: count a hit only when an actual catalog-cache lookup/reuse occurs (for example, an explicit refresh satisfied from a defined cache); do not increment it while serializing a snapshot. Until then, keep the fallback-only catalog unobserved or label it as static fallback rather than a ready cache.

### MEDIUM — Test coverage does not cover the two initial/unobserved paths that make the Cache summary misleading

The added Usage test starts only after a successful provider fetch ([usage-service.test.ts:285](/Users/jonghoPro/woo/00_project/99_www/test/usage-service.test.ts:285)); Cache projection tests inject metrics that have already been observed. There is no test that creates `AstraWorkspace` with the production initial `cacheMetrics()` object and asserts `Usage Snapshot · unobserved` and correct coverage. Likewise no test proves a passive `workbench.snapshot` read leaves the model catalog hit count unchanged. These omissions allowed both high-severity truthfulness regressions through.

## Other checks

- Shared layout use is consistent across the five target screens: `monitoringCard`, `monitoringColumns`, `monitoringMeter`, and bounded `fit`/`prose` paths are reused rather than duplicated.
- The Dashboard activity matrix has actual `recordedAt` bucketing and explicitly marks absent timestamps unobserved; Cache's heatmap/trend/TTL text is also explicitly unobserved rather than synthetic.
- Tested narrow/wide view assertions are present for the new Context, Usage, Dashboard, Workflow and Cache paths. No additional width overflow was found in the reviewed code.
- Architecture and TypeScript checks passed. No untyped escape hatch or unnecessary parsing was added in the production telemetry paths beyond the required timestamp handling. The changed tests are otherwise relevant; the concern is missing negative cases, not deletion-only or tautological tests.

## Verification run

- `git diff --check` — pass
- `bun run check` — pass (`tsc --noEmit`)
- Targeted TUI/telemetry regression suite — pass
- `bun test` — completed without a reported test failure in this run; output was lengthy but showed the reviewed target suites and architecture suite passing.

## Blockers

None.

## Re-audit verification

- `git diff --check` — pass
- `bun run check` — pass (`tsc --noEmit`)
- Reviewed target suite — **253 pass / 0 fail** across 11 files.
- `test/astra-shell.test.ts` navigation route now passes with the intentional `SESSION OVERVIEW` heading.
- No `monitoringHeatmap` production export/caller remains.

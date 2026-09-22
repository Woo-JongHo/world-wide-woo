# Cache 7-layer telemetry code review

## Scope

Reviewed only the requested Cache 7-layer implementation files:

- `src/core/domain/observability/cache-telemetry.ts`
- `src/adapters/inbound/tui/features/cache/cache-telemetry-projection.ts`
- `src/adapters/inbound/tui/features/cache/astra-cache-view.ts`
- cache-metric additions in `src/adapters/inbound/tui/features/chat/astra-execution.ts`
- cache wiring in `src/adapters/inbound/tui/shell/astra-surface.ts`
- `test/cache-telemetry.test.ts` and Cache assertions in `test/astra-ui.test.ts`

`LAYERS.md` check: no Core-to-Adapter or inbound-to-outbound import violation found. The domain contract is adapter-independent and the shell owns construction/wiring.

Skill-perspective check: `remove-ai-slops` and `programming` were not available in the session skill registry, so their documented tooling could not be loaded. Applied the requested criteria manually. The diff has no untyped escape hatch, but the new tests mirror fixed implementation labels/input values and do not prove the real cache behavior.

## Findings

### HIGH — Five advertised cache layers are snapshots, not cache observations

`projectWorkbenchCacheTelemetry` turns request/delegation counts, provider usage response count, model catalog count, Linear dashboard records, and activity journal count into ready cache layers, without observing a cache instance, a reuse, a miss, an eviction, or retained bytes. See `cache-telemetry-projection.ts:46-79`.

As a result, a normal populated workbench will report roughly `6/7 observed` and a nominal Cache health even though only transcript/render caches are instrumented. This directly conflicts with the screen policy that it reports only directly observed values and makes the requested seven-layer model appear implemented when five layers have no cache evidence. Keep such sources `unobserved` until their owning caches expose telemetry, or define and implement actual cache ownership for each layer.

### HIGH — Aggregate totals erase unknownness and render it as observed zero

`composeCacheTelemetry` coerces every `null` into `0` when creating totals (`cache-telemetry.ts:100-110`), while the Cache screen prints those numeric totals as `0 entries`, `0 B`, and `Evictions 0` (`astra-cache-view.ts:41-42`, `astra-cache-view.ts:65-68`). That is contradictory to the UI's own policy in `astra-cache-view.ts:49`: unknown bytes/hit/miss must not be estimated as zero.

With no observations (or with all evictions unobserved), the aggregate communicates a measured zero rather than `미관측`. Totals need nullable/partial-observation semantics (per metric), and the rail/header must render those as unobserved.

### MEDIUM — Tests supply telemetry constants rather than exercise the new counters and misleading-state paths

`test/cache-telemetry.test.ts:7-56` constructs `CacheLayerObservation` values and asserts the implementation's fixed seven IDs/derived arithmetic. `test/astra-ui.test.ts:248-255` similarly asserts labels from a handcrafted one-layer snapshot. Neither test runs `AstraTranscriptView` through a cache miss followed by a reuse/eviction, projects it, and asserts the screen's result. They also do not cover an all-unobserved snapshot, which would expose the false-zero aggregate above, or populated non-cache workbench sources, which would expose the false `ready` layer state.

This is an implementation-mirroring / false-confidence test gap under the manual `remove-ai-slops` and `programming` perspectives. Add behavior-level tests at the transcript-to-projection boundary and a test that unknown aggregates remain visibly unknown.

## Verification

- `pnpm test -- test/cache-telemetry.test.ts test/astra-ui.test.ts`
- Result: 66 passed, 0 failed.

## Decision

- `codeQualityStatus`: BLOCK
- `recommendation`: REQUEST_CHANGES
- `blockers`:
  1. Do not mark non-cache snapshots as observed cache layers without actual cache telemetry.
  2. Preserve unknown aggregate metrics rather than displaying them as zero.

# Session Read cache telemetry evidence

## Scope

- Implementation: `src/adapters/outbound/persistence/activity-journal-store.ts`
- Behavior seam: `ActivityJournalStore.cacheTelemetry(projectId)`
- Test: `test/activity-journal-store.test.ts`

## Scenarios and observables

| Scenario | Invocation | Binary observable |
| --- | --- | --- |
| Same project journal is retained and reused | `bun test test/activity-journal-store.test.ts` | `reports a project-scoped Session Read cache hit with its retained journal size` passes; the returned telemetry reports `ready`, two entries, disk-derived logical bytes, two hits, and one miss. |
| An externally appended journal record reloads only that stream | `bun test test/activity-journal-store.test.ts` | `reloads a changed project journal without attributing it to another session` passes; `reloaded` has two entries and `other-session` remains `unobserved`. |
| LRU capacity eviction is observable on the evicted stream | `bun test test/activity-journal-store.test.ts` | `evicts only the least-recently-used session cache state and retains its scoped eviction telemetry` passes; first stream is `stale` with one eviction and second stream remains `ready`. |

## Result

`bun test test/activity-journal-store.test.ts`: 8 pass, 0 fail, 24 expectations (2026-09-22).

`bun run check` was also invoked. It currently fails before this change can be validated globally because concurrent changes made `UsageMonitor.cacheMetrics` required while existing `astra-shell.test.ts` and `tui-shell-characterization.test.ts` fixtures do not supply it. The compiler reported no error in either Session Read file.

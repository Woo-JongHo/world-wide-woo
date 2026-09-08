# Monitor pre-user-test verification

Date: 2026-09-07 (Asia/Seoul)

## Success criteria and evidence

| Criterion | Scenario | Invocation | Binary observable |
|---|---|---|---|
| Live Session/Turn/Tool/Todo projection | Streaming snapshot with one running tool and active Todo | `bun test test/monitoring-overlay.test.ts test/observability-views.test.ts` | `MonitoringOverlay > renders a content-safe live session dashboard` PASS; output assertions contain `RUNNING`, Session/Turn/Tool/Todo counts, active Todo, and partial-history notice |
| Honest terminal and unknown states | Ready, error, and empty/unobserved fixtures | same invocation | completed, failed, and unknown cases PASS; empty projection contains `UNKNOWN` and does not contain `No active execution observed.` |
| Narrow width preserves core facts | 40-column Runtime Monitor and legacy overlay fixtures | same invocation | both narrow-width cases PASS; state, request/tool or Session/Turn/Tool/Todo, coverage, and return hint remain present |
| Existing projections and subscriptions remain valid | Domain projection and SessionMonitor subscription suites | `bun test test/session-monitor.test.ts test/runtime-monitor.test.ts test/monitoring-overlay.test.ts test/observability-views.test.ts` | 23 pass, 0 fail, 330 expectations |
| Type safety | Repository TypeScript check | `bun run check` | exit 0, `tsc --noEmit` |
| Patch hygiene | Assigned files and tests | `git diff --check -- src/presentation/tui/runtime-monitor-view.ts src/presentation/tui/monitoring-overlay.ts test/monitoring-overlay.test.ts test/observability-views.test.ts` | exit 0, no output |
| No fake completion markers | Assigned files and tests | `rg -n 'TODO|test\\.(skip|only)|describe\\.(skip|only)|it\\.(skip|only)' ...` | exit 0 with no matches |

## Captured test output

```text
bun test v1.4.0 (34cbb9a40)

test/observability-views.test.ts: 7 pass
test/session-monitor.test.ts: 3 pass
test/runtime-monitor.test.ts: 8 pass
test/monitoring-overlay.test.ts: 5 pass

23 pass
0 fail
330 expect() calls
Ran 23 tests across 4 files.
```

```text
$ tsc --noEmit
exit: 0
```

## User-test boundary

Automated rendering and type checks are complete. A human Native TUI pass at 40/80/120 columns, including input focus return and approval/source navigation, remains intentionally unclaimed. Those flows require shared `workbench-shell.ts` wiring outside this assignment.

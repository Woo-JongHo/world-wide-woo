# Usage Sol reimplementation evidence

Date: 2026-09-22 KST

## Success criteria

### Figma Usage hierarchy and honest telemetry

- Scenario: observed session with one Codex quota plus four-provider layout, model table, three analysis columns, and metrics rail.
- Invocation: `bun test test/astra-usage-view.test.ts`
- Binary observable: 3 tests passed, 0 failed; rendered output contains all requested panels and does not contain the removed `Usage Dashboard` block.
- Artifact: `test/astra-usage-view.test.ts` (render assertions and 40/80/120 width checks).

### Execution heading page ownership

- Scenario: shell starts on Usage while a turn is working, then returns to execution.
- Invocation: `bun test test/astra-shell.test.ts --test-name-pattern "execution heading belongs only"`
- Binary observable: 1 test passed, 0 failed; Usage frame excludes `▎ 실행 중`, execution frame includes it.
- Artifact: `test/astra-shell.test.ts` (`execution heading belongs only to the execution page`).

### Relevant regression and static verification

- Scenario: complete Usage and Astra shell related suites.
- Invocation: `bun test test/astra-usage-view.test.ts test/astra-shell.test.ts`
- Binary observable: 9 tests passed, 0 failed, 623 assertions.
- Artifact: this receipt and the two named test files.
- Invocation: `bunx tsc --noEmit`
- Binary observable: exit code 0, no diagnostics.
- Invocation: `git diff --check -- src/adapters/inbound/tui/features/usage/astra-usage-view.ts src/adapters/inbound/tui/shell/workbench-shell.ts test/astra-usage-view.test.ts test/astra-shell.test.ts`
- Binary observable: exit code 0, no whitespace errors.
- Invocation: `rg -n "TODO|test\.(skip|only)"` over the four task files.
- Binary observable: no skipped/only tests or new TODO placeholder; the sole match is the pre-existing literal dashboard label `"TODO"` in `workbench-shell.ts`.

## Deliberate native differences

- Today aggregation, session uptime, average response, request duration, input/output/cached split, recent-use timestamp, supported-effort discovery, provider-attributed model load, and time-bucket trends are not exposed by the current Native snapshot.
- Their Figma panels and chart space remain present, but values are rendered as `미관측` rather than synthesized numbers.
- At widths below 108 columns the three analysis columns stack to preserve terminal readability; at 120 columns they render as three columns.

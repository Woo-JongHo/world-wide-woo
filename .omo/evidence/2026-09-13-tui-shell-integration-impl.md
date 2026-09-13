# TUI shell integration implementation evidence

- Date: 2026-09-13
- Workspace: `/Users/jonghoPro/woo/00_project/99_www`
- Branch observed before and after implementation: `astra/terminal-ui`
- Scope: final composition, path migration, feature registry, traceability/documentation updates, and regression validation for the TUI feature/foundation refactor

## Preconditions and constraints

The repository `AGENTS.md`, `LAYERS.md`, current Git status, `~/.codex/woo.yaml`, and the canonical workspace status were read before editing. The worktree already contained changes from other execution agents. Those changes were preserved; no reset, checkout, clean, or broad rollback was used.

The Linear entry named by the workspace policy could not be queried because the `linear-woo` MCP tool was not available in this agent session. Local source, control-ledger, unit, and test verification remained available and was completed.

## Implemented integration

### Shell composition and dependency seams

- Updated `src/adapters/inbound/tui/shell/workbench-shell.ts` and `astra-surface.ts` to consume the new `foundation/**` and `features/**` paths.
- Preserved the public `runProjectWorkbenchShell` entry and its arguments.
- Constructed `WorkbenchChatView` with the Entry Dashboard dependency.
- Constructed `WorkbenchTracerView` with shell-owned delegation summary/detail render dependencies.
- Constructed both `AstraPlanView` instances with shell-owned Runtime presentation dependencies.
- Constructed `AstraTestView` with `() => projectAstraTestView(snapshot)`.
- Moved approval presentation from the temporary legacy location to `features/approval/approval-presentation.ts`.
- Added the `ChatApprovalPresentation` interface at the Chat boundary and injected the Approval feature's row/background projection from the shell. Chat has no direct Approval sibling import.
- Kept Monitoring's bounded public projection local to Monitoring, removing its direct Chat feature dependency.
- Moved the welcome surface to `features/chat/workbench-welcome.ts`.
- Preserved the existing substantive `shell-lifecycle.ts` timeout behavior. No shallow pass-through controller files were added.
- Fixed focus restoration so an approval present at subscription time retains focus instead of being overwritten by the editor focus assignment.
- Preserved Astra's initial Dashboard contract while dispatching exactly one cancellation when Escape is pressed during active work.

### Feature catalog and boundaries

- Added a closed `TuiFeatureId` union for `TUI-F001` through `TUI-F016`.
- Added a static, frozen, ordered `TUI_FEATURES` descriptor list and lookup by ID/key.
- The order is Dashboard, Chat, Plan, T-note, Trace, Monitoring, Session, Stats, Usage, Project Map, Context, Test, Approval, Authentication, Model Selection, Repository.
- The registry creates no views and contains no dynamic factory.
- The architecture gate confirms that feature implementations do not import sibling feature implementations.

### Path retirement

- Removed the old `src/adapters/inbound/tui/chat/**`, `dashboard/**`, and `overlays/**` trees after moving their implementations into feature/foundation/legacy ownership.
- Removed the shell compatibility re-exports `shell/theme.ts`, `shell/astra-theme.ts`, and `shell/render-scheduler.ts`.
- Updated CLI lazy imports, the chat rendering benchmark, application composition, and affected tests to the new paths.
- A final stale-path scan across `src`, `test`, `scripts`, `docs`, `LAYERS.md`, `README.md`, `.woo`, and `.www/control-ledger` returned no matches for the retired TUI trees or shell compatibility modules.

### Documentation and traceability

- Updated `LAYERS.md`, `docs/WWW_CODE_ARCHITECTURE.md`, `docs/TUI_CODE_MATRIX.md`, `docs/OSS_POSITIONING.md`, `docs/WWW_OBSERVABILITY_VIEW_ARCHITECTURE.md`, and the planning `BASELINE.md`, `IDENTITY.md`, and `ARCHITECTURE.md` documents.
- Updated historical research path references that asserted current source locations.
- Updated `.www/control-ledger/code-ids.json`, `traceability.json`, `traceability-v2.json`, and its README.
- Code-001 resolves to `features/chat/workbench-views.ts`; Code-003 resolves to `features/chat/chat-scroll.view.ts`; Code-004 remains at `shell/workbench-shell.ts`.
- Replaced the three stale legacy traceability paths with `legacy/legacy-dashboard-views.ts`, `legacy/legacy-session-shell.ts`, and `features/chat/workbench-welcome.ts`.
- Synchronized the local unit catalog from `.woo/units.yaml`; its stable digest remained `4a5b0089fcb5000b498507a4e9cbeca5037841ab19f9ed9c9ca4f56ec231d2cc`.

## Verification record

All commands ran from the workspace root.

| Command | Result |
| --- | --- |
| `bun run check` | PASS; TypeScript emitted 0 errors |
| `bun test test/architecture.test.ts` | PASS; 13 tests, 0 failures, 1319 expectations |
| `bun test test/astra-model.test.ts test/astra-shell.test.ts test/astra-ui.test.ts test/cli.test.ts test/development-cli.test.ts test/development-map.test.ts test/legacy-shell-characterization.test.ts test/tui-shell-characterization.test.ts test/workbench-shell-policy.test.ts` | PASS; 121 tests, 0 failures, 1186 expectations |
| `bun run units:sync` | PASS; 5 Units, 32 Linear links, SQLite synchronized |
| `bun run units:check` | PASS; 5 Units, 32 Linear links, valid |
| `bun test test/code-id.test.ts test/work-traceability.test.ts` | PASS; 7 tests, 0 failures, 340 expectations |
| static registry order/lookup assertion | PASS; 16 descriptors in `TUI-F001`–`TUI-F016` order and both lookups resolve exact descriptors |
| feature sibling-import scan | PASS; no sibling feature import matches |
| `git diff --check` | PASS; no whitespace errors |
| `bun test` | PASS; 1175 tests across 130 files, 0 failures, 9179 expectations |

The first full-suite run exposed one Astra regression caused by temporarily making Workbench the initial Astra screen. The implementation was corrected to retain the existing Dashboard initial screen and handle active-work Escape cancellation explicitly. The final targeted run and the final full-suite run above both passed.

The forbidden-test scan found no active `test.skip`, `test.only`, `describe.skip`, `describe.only`, `it.skip`, or `it.only` in the changed TUI implementation. Its only repository-wide text hit was the deliberate string fixture `blocks an untracked test.skip fixture` in `test/release-gate.test.ts`.

## Remaining blockers

There are no remaining local implementation or verification blockers. Live Linear MCP inspection was unavailable in this session; the checked-in unit and traceability contracts were validated offline by their canonical commands and tests.

## Follow-up: deep shell seams

The 1,435-line `workbench-shell.ts` was reviewed again against the deep-module criteria after the initial integration. The follow-up keeps `runProjectWorkbenchShell` as the public composition entry while moving three bodies of independent knowledge behind shell-local interfaces.

### Navigation controller

`workbench-navigation.controller.ts` now owns:

- the closed Workbench, observability, map, source, and test view-mode vocabulary;
- command-to-view and stats-target parsing;
- observability rotation, direct shortcuts, Escape return policy, and Dashboard session identity preservation;
- the stable component slot and view host;
- map polling entry/leave transitions;
- Astra browse state, observability browse state, current scroll selection, and the focus target for page, detail, map, test, observability, composer, and Escape transitions.

The shell constructs this module once with the actual focus targets. Call sites now ask it to open a view, enter observability, show an Astra page, toggle browse focus, open source, or return to Workbench. They no longer mutate `viewMode`, `astraNavigation`, and `observabilityNavigation` independently.

### Lifecycle module

`shell-lifecycle.ts` now owns the shutdown state machine. Its single `shutdown()` method is idempotent and preserves the existing order:

1. cancel the active login prompt;
2. dismiss the overlay and announce shutdown;
3. unsubscribe, stop Usage and Development Map polling, and clear render timers;
4. dispose render scheduling, telemetry, and Chat resources;
5. save the draft, close Workbench, and release the session lease within the existing five-second bound;
6. stop the terminal.

The shell checks `isShuttingDown` for submit/input/render suppression instead of maintaining a second lifecycle flag. A direct characterization test calls shutdown concurrently and asserts that every resource is released exactly once in the established order.

### Input policy

`workbench-input.controller.ts` owns the independent pure input policies: receipt presentation and composer clearing, natural-language approval decisions, Runtime mode cycling, login-provider aliases, Native model normalization, and pane notices. Tests import these policies from their owning module rather than widening the public surface of `workbench-shell.ts`.

A `workbench-command-router.ts` was deliberately not added. The remaining `handleLocal` implementation coordinates live Workbench dispatch, authentication, overlays, observability refresh, mutable selection state, status notices, and rendering. Extracting it now would require passing most of the shell context through a large configuration interface, leaving a shallow pass-through and increasing the caller's knowledge. The input policies that can vary and be tested without that context were extracted instead.

After the follow-up, `workbench-shell.ts` is 1,207 lines. The resulting module sizes are 250 lines for navigation, 58 for input policy, and 61 for lifecycle. The line reduction is incidental; the material result is that navigation state cannot drift across separate flags and shutdown order has one owner.

### Follow-up verification

| Command | Result |
| --- | --- |
| `bun run check` | PASS; 0 TypeScript errors |
| `bun test test/architecture.test.ts` | PASS; 13 tests, 0 failures |
| `bun test test/astra-shell.test.ts test/astra-ui.test.ts test/tui-shell-characterization.test.ts test/legacy-shell-characterization.test.ts test/workbench-shell-policy.test.ts` | PASS; 89 tests, 0 failures before the final combined rerun |
| `bun test test/architecture.test.ts test/tui-shell-characterization.test.ts test/astra-shell.test.ts test/astra-ui.test.ts test/workbench-shell-policy.test.ts` | PASS; 99 tests, 0 failures, 2314 expectations after the final cleanup |
| `bun test` | PASS; 1176 tests across 130 files, 0 failures, 9192 expectations |
| `git diff --check` | PASS |
| forbidden placeholder/skip scan over the changed shell and shell tests | PASS; no matches |

The first follow-up full-suite run found one traceability failure because the `WOO-694` annotation moved with a pure helper while its registered code owner remained `workbench-shell.ts`. The annotation was returned to the shell's composer-submit orchestration, where the registered behavior is implemented. The isolated traceability rerun passed 6/6 and the final full suite passed as recorded above.

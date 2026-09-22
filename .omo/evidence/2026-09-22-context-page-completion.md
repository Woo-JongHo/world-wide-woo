# Context page completion evidence

- Scope: `src/adapters/inbound/tui/features/context/astra-context-view.ts` and the direct Context assertions in `test/astra-ui.test.ts`.
- Figma source: file `Q7kGUdqiaQRJI8CZlPMRX7`, node `50:967` (`02 CONTEXT — Context Monitoring`), read through `figma_get_design_context` with `figma-design-to-code` on 2026-09-22.

## Implemented observables

- Seven Figma-style summary cards at 120 columns: total capacity, used tokens, free space, compression, last retrieval, active model, and effort configuration.
- One observed aggregate context meter; no per-source token segmentation is invented. The screen states that allocation is unobserved.
- Native/Workbench-backed context-input inventory: chat, skills, enabled MCP, notes, workflow steps, and live runtime. Unknown native data remains `미관측`.
- The existing Source mode continues to redact `reasoning`, `analysis`, credential, secret, token, password, and API-key payload fields.
- Uses shared `astra-monitoring-layout` cards, columns, and meter plus `astra-theme` sections/rail primitives.
- Lower Figma analysis landmarks are implemented as real panels: aggregate-only composition, durable recent-activity list, current-snapshot diagnostics grid, dependency map, and insights. Per-item token sizes and the Native context-change feed remain panel-local `unavailable`; neither is inferred.

## Verification

| Scenario | Invocation | Binary observable |
| --- | --- | --- |
| Wide Context rendering | `bun test test/astra-ui.test.ts --test-name-pattern 'Context dashboard|Context quota|Context never|long Linear metadata|accepted but unloaded source|source renderer'` | `9 pass / 0 fail`; summary cards, spectrometer, no fabricated token slices, and every 120-column row bounded |
| Compact Context rendering | same invocation | 60-column Context rows are bounded and retain context dashboard/free-space information |
| Hidden payload guard | same invocation | source renderer retains the selected activity identity and excludes secret/reasoning sentinels |
| Diff whitespace | `git diff --check -- src/adapters/inbound/tui/features/context/astra-context-view.ts test/astra-ui.test.ts` | exit code 0 |
| Lower analysis / rail layout | `bun test test/astra-ui.test.ts --test-name-pattern 'Context preserves Figma lower analysis'` | `1 pass / 0 fail`; all lower Figma landmarks render at an 80-column Context main pane and remain bounded inside a 120-column workspace with its rail |
| Type check | `bunx tsc --noEmit` | exit code 0 |

## Integration note

At the time of the final lower-panel check, `bun test test/astra-ui.test.ts` had one unrelated Cache assertion mismatch (`Observed analysis` no longer exists after the Cache panel wording changed). All Context-focused checks and `bunx tsc --noEmit` are green.

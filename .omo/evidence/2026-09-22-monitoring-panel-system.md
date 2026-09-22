# Monitoring panel system evidence

- Scenario: render shared terminal monitoring primitives at compact 52 columns and wide 80 columns, including a titled panel, explicit unavailable panel, bounded matrix, flow, queue, and diagnostics.
  - Invocation: `bun test test/astra-monitoring-layout.test.ts`
  - Binary observable: all rendered rows satisfy `visibleWidth(row) <= width`; the rendered result includes explicit `미관측` and matrix truncation rather than fabricated telemetry.
  - Result: 3 passing tests, 0 failures, 14 expectations.

- Scenario: compile the shared primitive API with current Context, Usage, Dashboard, Workflow, and Cache consumers.
  - Invocation: `bun run check`
  - Binary observable: TypeScript exits successfully with no diagnostics.
  - Result: passed.

- Scenario: verify the Usage view continues to consume the shared card and panel layout at compact and wide widths.
  - Invocation: `bun test test/astra-usage-view.test.ts`
  - Binary observable: view rows remain within their pane and unobserved values remain explicit.
  - Result: 3 passing tests, 0 failures, 31 expectations.

# Chat renderer completion evidence

Date: 2026-09-07
Branch: `woo-chat-completion`
Base: `e1b188b`
Scope: renderer, dedicated acceptance test, benchmark only

## Findings

- `renderMessage()` recomputed the complete T-note completion index for every assistant message and repeatedly searched activities/notes. The 5,000-message baseline was `constructMs=9.152292`, `renderMs=138.461625`, `totalMs=147.613917`.
- Execution-card deduplication used `itemId` alone. Equal item IDs in separate thread/turn owners could suppress an earlier card or attach live state to the wrong card.
- Runtime role/status values outside the TypeScript union fell through to assistant/success presentation.
- A thrown Markdown component render aborted the complete Chat render pass.
- Execution cards exposed only the legacy item-based `/trace` affordance; exact activity Source navigation needed an activity ID.

## Result

- T-note completion, notes, activities, and selected activity are indexed once per render.
- Execution ownership uses the composite thread/turn/item identity, with activity ID fallback when item ID is absent.
- Unknown roles and statuses render explicit error labels and retain sanitized content.
- Markdown rendering is isolated per message; failures fall back to wrapped, terminal-sanitized source text and later messages continue.
- Visible execution cards include `Source · /source <activity.id>`; planned cards retain the existing trace line for compatibility.
- Completed Markdown remains unbounded by the live-draft cap. Unsupported fenced languages retain plain code. Rows remain within 40/80/120 columns and terminal control sequences are removed.

## Performance

Command: `bun scripts/chat-render-benchmark.ts`

Five warm post-change runs (`renderMs`): `38.534833`, `33.161709`, `33.28925`, `33.853542`, `35.401958`; median `33.853542ms`. The baseline-to-post median reduction is about 75.5%. Construction and JIT warm-up vary, so the renderer measurement is recorded separately from total time.

## Verification

- `bun test test/chat-render-acceptance.test.ts test/workbench-views.test.ts`: 77 pass, 0 fail, 1,040 assertions.
- `bun run check`: pass.
- `git diff --check`: pass.
- Placeholder scan over owned production/test/benchmark files found no `TODO`, `test.skip`, `test.only`, `describe.skip`, or `describe.only`.

This receipt records bounded renderer evidence only; it does not claim whole-feature acceptance.

## Later comparable measurement

The 75.5% figure above compares one baseline run with a warm median and is historical, not the final comparable benchmark. The later runner uses five samples for both revisions, 5,000 messages with 94,887 payload bytes including a long code block, on the same Apple M1/Bun environment. `comparison-before.json` and `comparison-after.json` record median render 260.216ms → 166.298ms and resize pair 517.744ms → 328.088ms. Use this pair for the current performance claim. The full Chat verification record is `../../vault/Development/2026-09-07-Chat-Completion-Verification.md`.

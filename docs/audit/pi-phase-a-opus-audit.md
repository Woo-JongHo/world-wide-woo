Audited the five files (no commands run, no edits).

**Findings**

1. `native-harness-factory.ts:96` — the new-message window (`slice(messageCount)` + `findLast`) is sound for the single fresh in-memory session, but only `error`/`aborted` are treated as terminal-failing. `max_tokens`/`refusal` settle as `turn/completed`, and an earlier assistant message with `stopReason: "error"` is masked by a later one. Phase A-acceptable; worth an explicit allowlist later.
2. `native-harness-factory.ts:96` — if Pi ever prunes/compacts `state.messages` so the new length drops below the snapshot, the slice is empty and a successful turn surfaces as "settled without an assistant result" (`turn/failed`). Low risk under `noTools`/in-memory.
3. `pi-harness.ts:167` — durable text is derived *only* from `text-delta`. A non-streamed response would produce an empty `active.text`, so no `item/completed` is emitted and the turn completes with no visible answer. No fallback to the settled assistant message's text. This is the one gap I'd fix first in Phase B.
4. Lifecycle holds: receipt → `setTimeout(0)` handoff barrier → exactly one `turn/started` → deltas → single terminal via `finalizeTurnOnce`. Pre-start interrupt skips `prompt()`; post-abort resolve still yields `turn/interrupted`; partial text is flushed before every terminal, including failure/interrupt. `close()` during an active turn suppresses the terminal, but listeners are already cleared, so nothing observable dangles.
5. Reasoning: `thinking_delta` is mapped at the SDK seam and then dropped in `receive()`; `inspect()` exposes only `messageCount`/`isStreaming`. No raw reasoning path to Chat/journal.
6. Model/effort: substitution rejected at both `startThread` and `startTurn`; `getModel`/`hasConfiguredAuth` fail closed with no silent fallback; `app.ts:21-24` keeps `executionLane` and `provider` independent and blocks pi-lane persistence.
7. Fail-closed: resume/list/approval/MCP/tool all reject with `unsupported-operation`; production pi lane requires a WWW-owned prompt (`createPi` bypass is a test-only seam and unused by `app.ts`).

**APPROVE** — items 1–3 are non-blocking Phase B follow-ups, with #3 the highest-value one; nothing here breaks the stated Phase A contract or the Codex default path.

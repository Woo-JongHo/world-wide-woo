## Pi SDK Phase A — Final Acceptance Review

**Scope & boundary:** Matches handoff. `PiHarness` sits behind `NativeHarnessPort`; Codex stays default (`executionLane ?? "codex"` in app.ts:17, factory:31, session:162); Pi built only on explicit `executionLane: "pi"` with a mandatory WWW system prompt (factory:35, session:157). No child process — SDK `import("@earendil-works/pi-coding-agent")` in-process. Reduction options (`noTools:"all"`, `noExtensions/noSkills/noPromptTemplates/noContextFiles`) forwarded and asserted.

**Lifecycle:** Receipt returns before `turn/started` (setTimeout seam, contract asserts `events == []` post-startTurn). Ordering start → delta → `item/completed` → terminal holds; `finalizeTurnOnce` is idempotent and turn-ID-bound; abort/resolve race keeps exactly one `turn/interrupted` (pi-harness.test:89-101). Prior HIGH (streamed answer vanishing) is fixed: full `agentMessage` `item/completed` emitted before `turn/completed` (pi-harness.ts:152-158). Post-close events suppressed. Reasoning deltas dropped in `receive()` — not forwarded to compat events.

**Fail-closed:** resume/list/approval/MCP/tool all reject with `code:"unsupported-operation"`; `readThread` returns only live in-memory inspect state. Model/auth resolution throws rather than silently substituting (factory:68-69); observed real-SDK `resolves=true / auth=false` is correct fail-closed behavior, not a defect.

**Minor (non-blocking):**
- L1: Real-SDK event mapping (`message_update` / `assistantMessageEvent` / `text_delta`) and session surface (`state.messages`, `isStreaming`, `subscribe`) are covered only by the mocked-bindings test; the pinned-surface test verifies just top-level exports. Recommend a follow-up smoke assertion on the event shape.
- L2: On interrupt after partial streaming, deltas were emitted but no `item/completed`; partial-text retention on interrupt depends on Workbench delta handling — acceptable for Phase A, worth a Phase B note.

**Verdict: APPROVE**

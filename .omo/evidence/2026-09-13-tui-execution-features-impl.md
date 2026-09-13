# TUI execution features implementation evidence — 2026-09-13

## Scope

- Moved Chat execution presentation into `src/adapters/inbound/tui/features/chat`.
- Split Astra Plan into `features/plan/astra-plan-view.ts`.
- Split T-note panel into `features/tnote/t-notes-source-view.ts`.
- Moved Workbench Tracer into `features/trace/workbench-tracer-view.ts`.
- Added feature descriptors TUI-F002 through TUI-F005.
- Kept Monitoring outside the owned feature scope and isolated Approval presentation in a temporary legacy module.
- Removed the mistakenly-created top-level `src/features` directory.

## Targeted tests

Command:

```sh
bun test test/workbench-views.test.ts test/chat-render-acceptance.test.ts test/work-step-card-highlight.test.ts test/result-cards.test.ts test/native-plan-wiring.test.ts test/request-runtime.test.ts test/delegation-tree-view.test.ts test/workbench-tracer-view.test.ts test/transcript-markdown.test.ts
```

Exit code: 0

```text
bun test v1.4.0 (34cbb9a40)

test/request-runtime.test.ts:
(pass) seven-stage request runtime > keeps historical requests legacy and scopes protocol reports to the owning request [0.92ms]
(pass) seven-stage request runtime > approval blocks reports until the exact request is resolved [0.39ms]
(pass) seven-stage request runtime > VERIFY rejects failed, foreign and prose-only evidence [0.54ms]
(pass) seven-stage request runtime > creates seven Todo parents before Native has authored its plan [1.04ms]
(pass) seven-stage request runtime > Native authors stage tasks; parallel work and stable dependency IDs survive projection [13.02ms]
(pass) seven-stage request runtime > renders Request stages, Native Todo, and the actual Now observation as separate layers [0.53ms]
(pass) seven-stage request runtime > rejects out-of-order, cyclic and future-running plans without partial updates [0.18ms]
(pass) seven-stage request runtime > Native completion never invents stage completion; private reasoning cannot become a report [0.15ms]
(pass) seven-stage request runtime > keeps an interrupted Native turn distinct from a failed request [0.05ms]
(pass) seven-stage request runtime > accepts structured VERIFY intent only on VERIFY tasks [0.04ms]
(pass) seven-stage request runtime > persists canonical record and distinct destination drafts atomically [2.76ms]

test/workbench-views.test.ts:
(pass) workbench dashboard views > shows the linked Linear project while the entry dashboard is connecting [0.67ms]
(pass) workbench dashboard views > projects linked Linear issues into the empty Chat dashboard [2.31ms]
(pass) workbench dashboard views > keeps a failed Linear entry Dashboard visible with a recovery action [0.06ms]
(pass) workbench dashboard views > replaces the entry Dashboard with ordinary Chat after the first user message [0.81ms]
(pass) workbench dashboard views > reuses the complete chat projection for scroll-only frames [57.91ms]
(pass) workbench dashboard views > shows a T-note failure without assigning a completion number to an unstored note [2.10ms]
(pass) workbench dashboard views > keeps completed T-notes in Dashboard and selected execution Source in Monitor [0.58ms]
(pass) workbench dashboard views > renders the dashboard Tracer from Plan-linked public activities rather than T-note summaries [2.18ms]
(pass) workbench dashboard views > shows each inferred Plan activity with an exact Trace address and readable public Source [0.81ms]
(pass) workbench dashboard views > distinguishes an unavailable selected Source from a partial resumed journal [0.09ms]
(pass) workbench dashboard views > keeps resumed assistant output free of the selected T-note recap [0.17ms]
(pass) workbench dashboard views > keeps the live chat, streaming projection, and Todo while switching to the monitor projection [0.55ms]
(pass) workbench dashboard views > keeps public Native plan, compaction, collaboration, and reasoning summaries in transcript order [0.48ms]
(pass) workbench dashboard views > uses one filled user surface and an open assistant transcript [0.17ms]
(pass) workbench dashboard views > renders only the public answer from a completed assistant envelope [6.66ms]
(pass) workbench dashboard views > reprojects unchanged envelope text when streaming becomes completed [0.17ms]
(pass) workbench dashboard views > renders a preserved incomplete answer and final-observation notice within 40 columns [0.29ms]
(pass) workbench dashboard views > renders a preserved incomplete answer and final-observation notice within 80 columns [0.06ms]
(pass) workbench dashboard views > renders a preserved incomplete answer and final-observation notice within 120 columns [0.06ms]
(pass) workbench dashboard views > reprojects unchanged partial text when streaming becomes incomplete [0.11ms]
(pass) workbench dashboard views > reprojects unchanged failed text when its observation becomes partial [0.09ms]
(pass) workbench dashboard views > distinguishes an empty missing-final response from a preserved partial answer [0.06ms]
(pass) workbench dashboard views > sanitizes preserved answer text beside the failed terminal label [0.05ms]
(pass) workbench dashboard views > sanitizes preserved answer text beside the cancelled terminal label [0.04ms]
(pass) workbench dashboard views > fails closed for an unfinished analysis envelope on a incomplete partial [0.04ms]
(pass) workbench dashboard views > fails closed for an unfinished analysis envelope on a failed partial [0.02ms]
(pass) workbench dashboard views > fails closed for an unfinished analysis envelope on a cancelled partial [0.02ms]
(pass) workbench dashboard views > preserves partial tags, surrounding text, and fenced tag examples [0.62ms]
(pass) workbench dashboard views > renders the live action and its Esc hint as separate rows [0.26ms]
(pass) workbench dashboard views > keeps activity emphasis on every wrapped row at narrow widths [0.44ms]
(pass) workbench dashboard views > advances the spinner and activity gradient on the configured timer [0.28ms]
(pass) workbench dashboard views > reuses Chat rows when only the activity spinner frame changes [0.14ms]
(pass) workbench dashboard views > stops activity motion when the selected execution run is terminal [0.06ms]
(pass) workbench dashboard views > shows interrupted runtime state without expanding receipt internals into Chat [0.09ms]
(pass) workbench dashboard views > keeps command receipt details in Tracer instead of expanding them into Chat [0.06ms]
(pass) workbench dashboard views > explains the selected run waiting reason and operator action [0.09ms]
(pass) workbench dashboard views > keeps the native final answer without attaching a second plan recap [0.15ms]
(pass) workbench dashboard views > keeps the native final answer when Native Plan is absent [24.88ms]
(pass) workbench dashboard views > keeps an answer-only Native turn unchanged [0.12ms]
(pass) workbench dashboard views > does not claim a completion recap before the same Native turn completes [0.20ms]
(pass) workbench dashboard views > never promotes a completed child-thread plan into the root completion recap [0.09ms]
(pass) workbench dashboard views > does not revive an older turn when the latest turn is still preparing its plan [0.89ms]
(pass) workbench dashboard views > keeps plan-only steps out of Chat while showing compact observation work [0.81ms]
(pass) workbench dashboard views > shows the public Native plan while adding only its executing step card [0.67ms]
(pass) workbench dashboard views > renders model-interpreted what and why on the shared Step card [0.41ms]
(pass) workbench dashboard views > hides empty Todo and T-note counters [0.05ms]
(pass) workbench dashboard views > keeps active goal, progress, queue, Todo, and source details out of T-notes [0.06ms]
(pass) workbench dashboard views > bounds append-only T-notes while preserving omission and visible-count evidence [2.22ms]
(pass) workbench dashboard views > renders Todo status icons and hanging wraps inside the pane width [0.27ms]
(pass) workbench dashboard views > hides lifecycle progress payloads from Chat cards [0.56ms]
(pass) workbench dashboard views > shows only a content-free state while native reasoning is streaming [0.14ms]
(pass) workbench dashboard views > shows only the App Server public reasoning summary text [0.08ms]
(pass) workbench dashboard views > explains a pending approval and tells the user how to respond [0.42ms]
(pass) workbench dashboard views > renders authoritative approval background states and compact queued delivery [0.72ms]
(pass) workbench dashboard views > shows persisted completed-question records after active work without source payloads [0.10ms]
(pass) workbench dashboard views > renders a completed native command as a bounded public step card [1.35ms]
(pass) workbench dashboard views > keeps an unplanned command as a detailed Bash action instead of a generic sentence [0.53ms]
(pass) workbench dashboard views > keeps every planned action once and labels intermediate actions with their parent step [0.93ms]
(pass) workbench dashboard views > keeps a native command output delta on the same running step [0.68ms]
(pass) workbench dashboard views > keeps completed command observations out of Native-plan step numbering [1.09ms]
(pass) workbench dashboard views > shows follow-up inputs immediately as ordinary user messages [0.13ms]
(pass) workbench dashboard views > keeps an uncertain delivery warning and its recovery command visible [0.15ms]
(pass) workbench dashboard views > omits the /cancel recovery line for a failure it cannot reconcile [0.08ms]
(pass) workbench dashboard views > shows the failed delivery state on an outbound user bubble [0.05ms]
(pass) workbench dashboard views > shows the streaming delivery state on an outbound user bubble [0.02ms]
(pass) workbench dashboard views > renders the first outbound user message before native thread activity exists [0.06ms]
(pass) workbench dashboard views > uses the public MCP item status, arguments, and error without exposing reasoning [0.39ms]
(pass) workbench dashboard views > preserves completed Markdown while bounding only the live draft [0.98ms]
(pass) workbench dashboard views > keeps a structured native answer in its original Markdown order [0.84ms]
(pass) workbench dashboard views > keeps the full current native session transcript visible [2.58ms]
(pass) workbench dashboard views > leaves the resting status line blank instead of advertising commands [0.12ms]
(pass) workbench dashboard views > keeps immutable action results out of completed-question notes [0.09ms]
(pass) workbench dashboard views > keeps selected activity payloads out of completed-question notes [0.09ms]
(pass) workbench dashboard views > bounds public Source strings and total projection before JSON rendering [3.79ms]
(pass) workbench dashboard views > bounds large work-step output without leaking edge credentials [2.92ms]
(pass) workbench dashboard views > bounds action result body by characters and lines before rendering Source [1.27ms]
(pass) workbench dashboard views > keeps titleless Chat, T-notes, and Todo content reachable at 120x30 [6.09ms]
(pass) workbench dashboard views > keeps titleless Chat, T-notes, and Todo content reachable at 70x24 [1.35ms]
(pass) workbench dashboard views > keeps an incomplete answer reachable through the full TUI layout at 40 columns [1.40ms]
(pass) workbench dashboard views > keeps an incomplete answer reachable through the full TUI layout at 80 columns [1.47ms]
(pass) workbench dashboard views > keeps an incomplete answer reachable through the full TUI layout at 120 columns [1.84ms]
(pass) workbench dashboard views > keeps following the newest user message when repeated delivery states extend Chat [4.69ms]
(pass) workbench dashboard views > does not restore chat auto-follow while wheel scrolling concurrent streaming output [8.14ms]
(pass) renders a local workflow result even before a Native conversation exists [0.10ms]

test/workbench-tracer-view.test.ts:
(pass) WorkbenchTracerView execution surface > keeps a no-plan performance execution visible [0.14ms]
(pass) WorkbenchTracerView execution surface > shows an explicit assigned goal beside its no-plan execution [0.04ms]
(pass) WorkbenchTracerView execution surface > renders observed health counters without inventing orphan-blocked state [0.04ms]
(pass) WorkbenchTracerView execution surface > labels retry and orphan health as unconfirmed when no performance projection exists [0.04ms]
(pass) WorkbenchTracerView execution surface > states that completion evidence remains unverified [0.04ms]
(pass) WorkbenchTracerView execution surface > aggregates delegation across turns and renders the selected exact detail [0.58ms]

test/transcript-markdown.test.ts:
(pass) TranscriptView Markdown > left-aligns role labels and message bodies at the conversation edge [0.38ms]
(pass) TranscriptView Markdown > syntax-highlights completed fenced code [10.97ms]
(pass) TranscriptView Markdown > keeps partial streaming code colored and width-safe [0.36ms]
(pass) TranscriptView Markdown > labels a persisted partial assistant response as cancelled [0.10ms]
(pass) TranscriptView Markdown > renders actual tool observations as boxed transcript items [0.60ms]
(pass) TranscriptView Markdown > renders truthful work narration before the corresponding tool card [0.21ms]
(pass) TranscriptView Markdown > reuses stable transcript rows across scroll frames and invalidates on observation changes [0.20ms]
(pass) TranscriptView Markdown > bounds stable transcript caches to two width variants [0.06ms]
(pass) TranscriptView Markdown > keeps a long unchanged transcript on one cached row projection [18.21ms]

test/delegation-tree-view.test.ts:
(pass) Gajae-style delegation tree > groups native agent lifecycle and IRC items without duplicating lifecycle updates [1.07ms]
(pass) Gajae-style delegation tree > keeps agent names and states scoped to their native turn [0.16ms]
(pass) Gajae-style delegation tree > uses the latest reordered lifecycle state for queued, failed, and cancelled agents [0.49ms]
(pass) Gajae-style delegation tree > preserves native nested activity messages while excluding ordinary collaboration tools [0.13ms]
(pass) Gajae-style delegation tree > projects native call and subagent payloads into one stable delegated task [0.07ms]
(pass) Gajae-style delegation tree > keeps lifecycle, identity, and attempts authoritative when events arrive out of order [0.09ms]
(pass) Gajae-style delegation tree > resolves nested ownership across turns and attaches only public child work [0.18ms]
(pass) Gajae-style delegation tree > scopes repeated native spawn item ids by sender thread and turn [0.06ms]
(pass) Gajae-style delegation tree > keeps delayed child-turn events on their bound attempt and rejects ambiguous new turns [0.09ms]
(pass) Gajae-style delegation tree > renders an aggregate parentRef tree in DFS order with sanitized selectable refs [0.14ms]
(pass) Gajae-style delegation tree > renders the grouped tree in Chat instead of the old one-line collaboration notice [0.55ms]
(pass) Gajae-style delegation tree > stays absent when the App Server has not emitted collaboration items [0.01ms]
(pass) Gajae-style delegation tree > requires native turn and item references for observed trace nodes and keeps source visible when compact [0.20ms]
(pass) Gajae-style delegation tree > keeps a failed spawn visible before the server assigns a receiver thread [0.11ms]

test/chat-render-acceptance.test.ts:
(pass) Chat renderer completion > renders readable Markdown, plain unsupported code, and ANSI-safe rows at 40 columns [0.41ms]
(pass) Chat renderer completion > renders readable Markdown, plain unsupported code, and ANSI-safe rows at 80 columns [0.12ms]
(pass) Chat renderer completion > renders readable Markdown, plain unsupported code, and ANSI-safe rows at 120 columns [0.12ms]
(pass) Chat renderer completion > shows malformed roles and statuses explicitly while preserving safe text and later messages [0.17ms]
(pass) Chat renderer completion > isolates a Markdown renderer failure to one message [0.11ms]
(pass) Chat renderer completion > keeps execution cards with the same item id in separate turns and chronological order [0.95ms]
(pass) Chat renderer completion > sanitizes body-bearing failed messages without partial metadata [0.11ms]
(pass) Chat renderer completion > sanitizes body-bearing cancelled messages without partial metadata [0.05ms]
(pass) Chat renderer completion > sanitizes body-bearing streaming messages without partial metadata [0.04ms]

test/result-cards.test.ts:
(pass) BashResultCard > renders every lifecycle status with its themed label [1.27ms]
(pass) BashResultCard > groups stdout and stderr and shows failed exit details [0.16ms]
(pass) BashResultCard > limits output lines and removes terminal controls [0.61ms]
(pass) BashResultCard > preserves Korean visible width in a 40-column card [0.56ms]
(pass) BashResultCard > highlights bash while retaining prompts, wrapping, and redaction [1.63ms]
(pass) BashResultCard > applies semantic Git status and diff highlighting inside Bash output [0.31ms]
(pass) GenericToolResultCard > keeps generic tool cards focused on their own input and output [0.11ms]
(pass) GenericToolResultCard > renders lifecycle labels and display-safe values [0.23ms]
(pass) GenericToolResultCard > bounds output and preserves visible width at narrow and wide widths [0.60ms]
(pass) GenericToolResultCard > pretty prints and highlights JSON input and output without changing its snapshot [0.44ms]
(pass) GenericToolResultCard > pretty prints path-grounded YAML but falls back for invalid, multi-document, aliased, and ungrounded YAML [12.53ms]
(pass) GenericToolResultCard > pretty prints JSON output for raw read paths and content-based JSON detection [0.33ms]
(pass) GenericToolResultCard > applies structured output tail limits at narrow widths [0.34ms]
(pass) GenericToolResultCard > bounds huge valid structured output before highlighting without breaking ANSI or width [1.14ms]
(pass) DiffResultCard > distinguishes added, removed, and context lines without color [0.31ms]
(pass) CompletionSummaryCard > renders three ordered # sections, bullets, and verification at stable widths [2.13ms]

test/work-step-card-highlight.test.ts:
(pass) WorkStepCard executor highlighting > keeps generated input and output summaries out of a Tracer step card [0.19ms]
(pass) WorkStepCard executor highlighting > labels an unplanned action as Bash, Edit, or Tool while keeping the Bash block [1.18ms]
(pass) WorkStepCard executor highlighting > renders native command execution with a Gajae-style Bash frame [0.70ms]
(pass) WorkStepCard executor highlighting > shortens repeated native paths at the presentation boundary without conflating external paths [0.81ms]
(pass) WorkStepCard executor highlighting > projects project, home, sibling, outside, false-prefix, and Windows paths on component boundaries [0.12ms]
(pass) WorkStepCard executor highlighting > uses the same path projection at the Bash result-card boundary without mutating its snapshot [0.21ms]
(pass) WorkStepCard executor highlighting > projects file-change and read what paths without narration while preserving raw activities [0.46ms]
(pass) WorkStepCard executor highlighting > leaves short relative paths unchanged [0.48ms]
(pass) WorkStepCard executor highlighting > keeps direct work and why text without a repeated what label [1.36ms]
(pass) WorkStepCard executor highlighting > classifies execution output by semantic meaning [0.03ms]
(pass) WorkStepCard executor highlighting > connects native Bash highlighting without changing public text [0.40ms]
(pass) WorkStepCard executor highlighting > pretty prints and highlights native structured tool output like generic tools [56.30ms]
(pass) WorkStepCard executor highlighting > unwraps the Codex mcpToolCall arguments and result envelope before rendering [0.33ms]
(pass) WorkStepCard executor highlighting > renders text from a Codex mcpToolCall result.content envelope [0.57ms]
(pass) WorkStepCard executor highlighting > keeps a semantic reason while narrator work is pending or has failed [0.22ms]
(pass) WorkStepCard executor highlighting > rejects inline commands and filename-only narrator text [0.14ms]

test/native-plan-wiring.test.ts:
(pass) Native Plan and Runtime Todo boundaries > keeps a public numbered Plan in workFlow without replacing the seven-stage Todo or carrying it into manual execution [17.12ms]
(pass) Native Plan and Runtime Todo boundaries > keeps a structured Native plan authoritative over a public numbered reply [5.91ms]
(pass) Native Plan and Runtime Todo boundaries > does not manufacture a Native Plan when a Plan turn supplies no plan body [6.57ms]
(pass) Native Plan and Runtime Todo boundaries > projects the Test2 numbered-heading Native plan and associates the earlier Bash activity [8.78ms]
(pass) Native Plan and Runtime Todo boundaries > projects the Test2 numbered list beneath a step-count heading without treating the heading as a step [5.83ms]
(pass) Native Plan and Runtime Todo boundaries > projects the Test2 top-level numbered Native plan and associates the earlier Bash activity [7.46ms]
(pass) Native Plan and Runtime Todo boundaries > does not infer a Native Plan for manual mode [18.77ms]
(pass) Native Plan and Runtime Todo boundaries > does not infer a Native Plan for failed Plan turn [18.79ms]
(pass) Native Plan and Runtime Todo boundaries > does not infer a Native Plan for Plan turn without observed work [18.80ms]
(pass) Native Plan and Runtime Todo boundaries > does not project 일반 번호 목록 [13.88ms]
(pass) Native Plan and Runtime Todo boundaries > does not project 불연속 번호 계획 [14.01ms]
(pass) Native Plan and Runtime Todo boundaries > does not project 실패한 계획 turn [14.65ms]
(pass) Native Plan and Runtime Todo boundaries > does not project 중단된 계획 turn [13.89ms]
(pass) Native Plan and Runtime Todo boundaries > accepts only the known root turn's completed plan item without replacing the Runtime Todo [40.08ms]

 179 pass
 0 fail
 1599 expect() calls
Ran 179 tests across 9 files. [591.00ms]

```

## Type check

Command:

```sh
bun run check
```

Exit code: 1

The remaining errors are unresolved composition/test imports from concurrently moved Dashboard, Overlay, Shell, and Astra modules. The owned Chat/Plan/T-note/Trace implementation files do not appear in the TypeScript diagnostics.

```text
$ tsc --noEmit
src/adapters/inbound/tui/shell/astra-surface.ts(4,32): error TS2307: Cannot find module '../dashboard/dashboard-layout' or its corresponding type declarations.
src/adapters/inbound/tui/shell/astra-surface.ts(5,92): error TS2307: Cannot find module '../chat/astra-execution' or its corresponding type declarations.
src/adapters/inbound/tui/shell/astra-surface.ts(6,34): error TS2307: Cannot find module '../dashboard/astra-details' or its corresponding type declarations.
src/adapters/inbound/tui/shell/astra-surface.ts(9,30): error TS2307: Cannot find module '../dashboard/usage-value' or its corresponding type declarations.
src/adapters/inbound/tui/shell/astra-surface.ts(10,32): error TS2307: Cannot find module '../dashboard/astra-usage' or its corresponding type declarations.
src/adapters/inbound/tui/shell/workbench-shell.ts(30,39): error TS2307: Cannot find module '../dashboard/dashboard-layout' or its corresponding type declarations.
src/adapters/inbound/tui/shell/workbench-shell.ts(31,67): error TS2307: Cannot find module '../dashboard/shared-dashboard-views' or its corresponding type declarations.
src/adapters/inbound/tui/shell/workbench-shell.ts(32,57): error TS2307: Cannot find module '../chat/workbench-views' or its corresponding type declarations.
src/adapters/inbound/tui/shell/workbench-shell.ts(33,37): error TS2307: Cannot find module '../dashboard/workbench-tracer-view' or its corresponding type declarations.
src/adapters/inbound/tui/shell/workbench-shell.ts(35,30): error TS2307: Cannot find module '../overlays/auth-overlay' or its corresponding type declarations.
src/adapters/inbound/tui/shell/workbench-shell.ts(36,33): error TS2307: Cannot find module '../overlays/approval-overlay' or its corresponding type declarations.
src/adapters/inbound/tui/shell/workbench-shell.ts(37,36): error TS2307: Cannot find module '../overlays/model-picker-overlay' or its corresponding type declarations.
src/adapters/inbound/tui/shell/workbench-shell.ts(38,30): error TS2307: Cannot find module '../overlays/overlay-sheet' or its corresponding type declarations.
src/adapters/inbound/tui/shell/workbench-shell.ts(43,40): error TS2307: Cannot find module '../dashboard/workbench-bottom-hud' or its corresponding type declarations.
src/adapters/inbound/tui/shell/workbench-shell.ts(44,61): error TS2307: Cannot find module '../dashboard/workbench-telemetry' or its corresponding type declarations.
src/adapters/inbound/tui/shell/workbench-shell.ts(45,32): error TS2307: Cannot find module '../dashboard/usage-strip-view' or its corresponding type declarations.
src/adapters/inbound/tui/shell/workbench-shell.ts(46,38): error TS2307: Cannot find module '../dashboard/workbench-hud-system' or its corresponding type declarations.
src/adapters/inbound/tui/shell/workbench-shell.ts(47,36): error TS2307: Cannot find module '../dashboard/development-map-view' or its corresponding type declarations.
src/adapters/inbound/tui/shell/workbench-shell.ts(48,44): error TS2307: Cannot find module '../dashboard/observability-dashboard-view' or its corresponding type declarations.
src/adapters/inbound/tui/shell/workbench-shell.ts(49,36): error TS2307: Cannot find module '../dashboard/runtime-monitor-view' or its corresponding type declarations.
src/adapters/inbound/tui/shell/workbench-shell.ts(50,34): error TS2307: Cannot find module '../dashboard/session-stats-view' or its corresponding type declarations.
src/adapters/inbound/tui/shell/workbench-shell.ts(51,100): error TS2307: Cannot find module '../dashboard/astra-details' or its corresponding type declarations.
src/adapters/inbound/tui/shell/workbench-shell.ts(52,31): error TS2307: Cannot find module '../dashboard/astra-test-view' or its corresponding type declarations.
src/adapters/inbound/tui/shell/workbench-shell.ts(53,44): error TS2307: Cannot find module '../dashboard/request-runtime-view' or its corresponding type declarations.
src/adapters/inbound/tui/shell/workbench-shell.ts(55,38): error TS2307: Cannot find module '../chat/astra-execution' or its corresponding type declarations.
src/adapters/inbound/tui/shell/workbench-shell.ts(786,11): error TS7006: Parameter 'authStatus' implicitly has an 'any' type.
src/adapters/inbound/tui/shell/workbench-shell.ts(820,10): error TS7006: Parameter 'provider' implicitly has an 'any' type.
src/adapters/inbound/tui/shell/workbench-shell.ts(845,5): error TS7006: Parameter 'decision' implicitly has an 'any' type.
src/cli.ts(59,47): error TS2307: Cannot find module './adapters/inbound/tui/overlays/native-thread-picker' or its corresponding type declarations.
test/astra-model.test.ts(12,36): error TS2307: Cannot find module '../src/adapters/inbound/tui/overlays/model-picker-overlay' or its corresponding type declarations.
test/astra-model.test.ts(39,55): error TS7006: Parameter 'provider' implicitly has an 'any' type.
test/astra-model.test.ts(39,154): error TS7006: Parameter 'value' implicitly has an 'any' type.
test/astra-model.test.ts(72,54): error TS7006: Parameter 'provider' implicitly has an 'any' type.
test/astra-model.test.ts(85,55): error TS7006: Parameter 'provider' implicitly has an 'any' type.
test/astra-ui.test.ts(7,142): error TS2307: Cannot find module '../src/adapters/inbound/tui/chat/astra-execution' or its corresponding type declarations.
test/astra-ui.test.ts(8,68): error TS2307: Cannot find module '../src/adapters/inbound/tui/dashboard/astra-details' or its corresponding type declarations.
test/astra-ui.test.ts(12,33): error TS2307: Cannot find module '../src/adapters/inbound/tui/overlays/approval-overlay' or its corresponding type declarations.
test/astra-ui.test.ts(13,36): error TS2307: Cannot find module '../src/adapters/inbound/tui/overlays/native-thread-picker' or its corresponding type declarations.
test/astra-ui.test.ts(15,32): error TS2307: Cannot find module '../src/adapters/inbound/tui/dashboard/astra-usage' or its corresponding type declarations.
test/astra-ui.test.ts(16,67): error TS2307: Cannot find module '../src/adapters/inbound/tui/dashboard/request-runtime-view' or its corresponding type declarations.
test/astra-ui.test.ts(93,100): error TS7006: Parameter 'row' implicitly has an 'any' type.
test/astra-ui.test.ts(294,134): error TS7006: Parameter 'id' implicitly has an 'any' type.
test/astra-ui.test.ts(297,21): error TS7006: Parameter 'row' implicitly has an 'any' type.
test/request-controller.test.ts(12,36): error TS2307: Cannot find module '../src/adapters/inbound/tui/dashboard/request-runtime-view' or its corresponding type declarations.
test/request-controller.test.ts(206,22): error TS7006: Parameter 'row' implicitly has an 'any' type.
test/workbench-bottom-hud.test.ts(3,40): error TS2307: Cannot find module '../src/adapters/inbound/tui/dashboard/workbench-bottom-hud' or its corresponding type declarations.
test/workbench-bottom-hud.test.ts(4,32): error TS2307: Cannot find module '../src/adapters/inbound/tui/dashboard/usage-strip-view' or its corresponding type declarations.
test/workbench-hud-system.test.ts(2,57): error TS2307: Cannot find module '../src/adapters/inbound/tui/dashboard/workbench-hud-system' or its corresponding type declarations.
test/workbench-lifecycle-noise.test.ts(6,35): error TS2307: Cannot find module '../src/adapters/inbound/tui/chat/workbench-views' or its corresponding type declarations.
test/workbench-shell-policy.test.ts(30,39): error TS2307: Cannot find module '../src/adapters/inbound/tui/dashboard/dashboard-layout' or its corresponding type declarations.
test/workbench-shell-policy.test.ts(230,13): error TS7006: Parameter 'value' implicitly has an 'any' type.
test/workbench-shell-policy.test.ts(231,13): error TS7006: Parameter 'value' implicitly has an 'any' type.
test/workbench-shell-policy.test.ts(232,13): error TS7006: Parameter 'value' implicitly has an 'any' type.
test/workspace-todo-view.test.ts(6,35): error TS2307: Cannot find module '../src/adapters/inbound/tui/dashboard/shared-dashboard-views' or its corresponding type declarations.
test/workspace-todo-view.test.ts(80,23): error TS7006: Parameter 'line' implicitly has an 'any' type.
error: script "check" exited with code 1

```

## Hygiene

Command:

```sh
git diff --check -- <owned paths>
rg <fake-completion patterns> <owned paths>
```

Exit code: 0

```text
(no output)
```


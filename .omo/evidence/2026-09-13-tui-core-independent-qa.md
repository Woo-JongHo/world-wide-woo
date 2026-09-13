# TUI / Core 독립 QA 실행 전문

- 저장소: `/Users/jonghoPro/woo/00_project/99_www`
- 브랜치: `astra/terminal-ui`
- 실행일: 2026-09-13T07:21:49+09:00
- 방식: 읽기 전용 검증. 모든 전체 출력과 exit code를 아래에 보존한다.

## Registry 16/35 contract

Invocation: `bun test test/tui-feature-registry.test.ts`

```text
bun test v1.4.0 (34cbb9a40)

test/tui-feature-registry.test.ts:
(pass) TUI feature Unit catalog > contains the 16 features and exact 35 inventoried Units [0.08ms]
(pass) TUI feature Unit catalog > keeps Unit IDs unique and attached to the declared parent feature [0.09ms]
(pass) TUI feature Unit catalog > numbers each feature from U01 without gaps and preserves the inventory counts [0.15ms]
(pass) TUI feature Unit catalog > never reuses an ID reserved by a retired Unit [0.03ms]

 4 pass
 0 fail
 158 expect() calls
Ran 4 tests across 1 file. [10.00ms]

exit_code=0
```

## Chat facade compatibility and render consumers

Invocation: `bun test test/workbench-views.test.ts test/chat-render-acceptance.test.ts test/workbench-lifecycle-noise.test.ts test/delegation-tree-view.test.ts test/workbench-tracer-view.test.ts`

```text
bun test v1.4.0 (34cbb9a40)

test/workbench-lifecycle-noise.test.ts:
(pass) Workbench lifecycle noise filter > keeps repeated MCP startup and retry telemetry out of Chat [9.18ms]

test/workbench-views.test.ts:
(pass) workbench dashboard views > shows the linked Linear project while the entry dashboard is connecting [0.27ms]
(pass) workbench dashboard views > projects linked Linear issues into the empty Chat dashboard [2.84ms]
(pass) workbench dashboard views > keeps a failed Linear entry Dashboard visible with a recovery action [0.10ms]
(pass) workbench dashboard views > replaces the entry Dashboard with ordinary Chat after the first user message [0.47ms]
(pass) workbench dashboard views > reuses the complete chat projection for scroll-only frames [65.83ms]
(pass) workbench dashboard views > shows a T-note failure without assigning a completion number to an unstored note [2.63ms]
(pass) workbench dashboard views > keeps completed T-notes in Dashboard and selected execution Source in Monitor [0.90ms]
(pass) workbench dashboard views > renders the dashboard Tracer from Plan-linked public activities rather than T-note summaries [2.54ms]
(pass) workbench dashboard views > shows each inferred Plan activity with an exact Trace address and readable public Source [1.12ms]
(pass) workbench dashboard views > distinguishes an unavailable selected Source from a partial resumed journal [0.07ms]
(pass) workbench dashboard views > keeps resumed assistant output free of the selected T-note recap [0.15ms]
(pass) workbench dashboard views > keeps the live chat, streaming projection, and Todo while switching to the monitor projection [0.53ms]
(pass) workbench dashboard views > keeps public Native plan, compaction, collaboration, and reasoning summaries in transcript order [0.39ms]
(pass) workbench dashboard views > uses one filled user surface and an open assistant transcript [0.16ms]
(pass) workbench dashboard views > renders only the public answer from a completed assistant envelope [6.82ms]
(pass) workbench dashboard views > reprojects unchanged envelope text when streaming becomes completed [0.29ms]
(pass) workbench dashboard views > renders a preserved incomplete answer and final-observation notice within 40 columns [0.34ms]
(pass) workbench dashboard views > renders a preserved incomplete answer and final-observation notice within 80 columns [0.06ms]
(pass) workbench dashboard views > renders a preserved incomplete answer and final-observation notice within 120 columns [0.07ms]
(pass) workbench dashboard views > reprojects unchanged partial text when streaming becomes incomplete [0.15ms]
(pass) workbench dashboard views > reprojects unchanged failed text when its observation becomes partial [0.14ms]
(pass) workbench dashboard views > distinguishes an empty missing-final response from a preserved partial answer [0.07ms]
(pass) workbench dashboard views > sanitizes preserved answer text beside the failed terminal label [0.06ms]
(pass) workbench dashboard views > sanitizes preserved answer text beside the cancelled terminal label [0.04ms]
(pass) workbench dashboard views > fails closed for an unfinished analysis envelope on a incomplete partial [0.05ms]
(pass) workbench dashboard views > fails closed for an unfinished analysis envelope on a failed partial [0.02ms]
(pass) workbench dashboard views > fails closed for an unfinished analysis envelope on a cancelled partial [0.02ms]
(pass) workbench dashboard views > preserves partial tags, surrounding text, and fenced tag examples [0.69ms]
(pass) workbench dashboard views > renders the live action and its Esc hint as separate rows [0.29ms]
(pass) workbench dashboard views > keeps activity emphasis on every wrapped row at narrow widths [0.40ms]
(pass) workbench dashboard views > advances the spinner and activity gradient on the configured timer [0.27ms]
(pass) workbench dashboard views > reuses Chat rows when only the activity spinner frame changes [0.18ms]
(pass) workbench dashboard views > stops activity motion when the selected execution run is terminal [0.06ms]
(pass) workbench dashboard views > shows interrupted runtime state without expanding receipt internals into Chat [0.12ms]
(pass) workbench dashboard views > keeps command receipt details in Tracer instead of expanding them into Chat [0.12ms]
(pass) workbench dashboard views > explains the selected run waiting reason and operator action [0.18ms]
(pass) workbench dashboard views > keeps the native final answer without attaching a second plan recap [0.22ms]
(pass) workbench dashboard views > keeps the native final answer when Native Plan is absent [26.64ms]
(pass) workbench dashboard views > keeps an answer-only Native turn unchanged [0.14ms]
(pass) workbench dashboard views > does not claim a completion recap before the same Native turn completes [0.20ms]
(pass) workbench dashboard views > never promotes a completed child-thread plan into the root completion recap [0.08ms]
(pass) workbench dashboard views > does not revive an older turn when the latest turn is still preparing its plan [0.80ms]
(pass) workbench dashboard views > keeps plan-only steps out of Chat while showing compact observation work [0.90ms]
(pass) workbench dashboard views > shows the public Native plan while adding only its executing step card [0.88ms]
(pass) workbench dashboard views > renders model-interpreted what and why on the shared Step card [0.75ms]
(pass) workbench dashboard views > hides empty Todo and T-note counters [0.07ms]
(pass) workbench dashboard views > keeps active goal, progress, queue, Todo, and source details out of T-notes [0.05ms]
(pass) workbench dashboard views > bounds append-only T-notes while preserving omission and visible-count evidence [1.08ms]
(pass) workbench dashboard views > renders Todo status icons and hanging wraps inside the pane width [0.17ms]
(pass) workbench dashboard views > hides lifecycle progress payloads from Chat cards [0.54ms]
(pass) workbench dashboard views > shows only a content-free state while native reasoning is streaming [0.14ms]
(pass) workbench dashboard views > shows only the App Server public reasoning summary text [0.09ms]
(pass) workbench dashboard views > explains a pending approval and tells the user how to respond [0.51ms]
(pass) workbench dashboard views > renders authoritative approval background states and compact queued delivery [3.15ms]
(pass) workbench dashboard views > shows persisted completed-question records after active work without source payloads [0.24ms]
(pass) workbench dashboard views > renders a completed native command as a bounded public step card [1.15ms]
(pass) workbench dashboard views > keeps an unplanned command as a detailed Bash action instead of a generic sentence [0.47ms]
(pass) workbench dashboard views > keeps every planned action once and labels intermediate actions with their parent step [0.81ms]
(pass) workbench dashboard views > keeps a native command output delta on the same running step [0.55ms]
(pass) workbench dashboard views > keeps completed command observations out of Native-plan step numbering [1.04ms]
(pass) workbench dashboard views > shows follow-up inputs immediately as ordinary user messages [0.14ms]
(pass) workbench dashboard views > keeps an uncertain delivery warning and its recovery command visible [0.15ms]
(pass) workbench dashboard views > omits the /cancel recovery line for a failure it cannot reconcile [0.08ms]
(pass) workbench dashboard views > shows the failed delivery state on an outbound user bubble [0.05ms]
(pass) workbench dashboard views > shows the streaming delivery state on an outbound user bubble [0.03ms]
(pass) workbench dashboard views > renders the first outbound user message before native thread activity exists [0.06ms]
(pass) workbench dashboard views > uses the public MCP item status, arguments, and error without exposing reasoning [0.53ms]
(pass) workbench dashboard views > preserves completed Markdown while bounding only the live draft [0.94ms]
(pass) workbench dashboard views > keeps a structured native answer in its original Markdown order [0.81ms]
(pass) workbench dashboard views > keeps the full current native session transcript visible [2.68ms]
(pass) workbench dashboard views > leaves the resting status line blank instead of advertising commands [0.14ms]
(pass) workbench dashboard views > keeps immutable action results out of completed-question notes [0.09ms]
(pass) workbench dashboard views > keeps selected activity payloads out of completed-question notes [0.07ms]
(pass) workbench dashboard views > bounds public Source strings and total projection before JSON rendering [5.06ms]
(pass) workbench dashboard views > bounds large work-step output without leaking edge credentials [3.96ms]
(pass) workbench dashboard views > bounds action result body by characters and lines before rendering Source [2.76ms]
(pass) workbench dashboard views > keeps titleless Chat, T-notes, and Todo content reachable at 120x30 [5.26ms]
(pass) workbench dashboard views > keeps titleless Chat, T-notes, and Todo content reachable at 70x24 [1.52ms]
(pass) workbench dashboard views > keeps an incomplete answer reachable through the full TUI layout at 40 columns [1.66ms]
(pass) workbench dashboard views > keeps an incomplete answer reachable through the full TUI layout at 80 columns [2.64ms]
(pass) workbench dashboard views > keeps an incomplete answer reachable through the full TUI layout at 120 columns [2.20ms]
(pass) workbench dashboard views > keeps following the newest user message when repeated delivery states extend Chat [6.92ms]
(pass) workbench dashboard views > does not restore chat auto-follow while wheel scrolling concurrent streaming output [10.49ms]
(pass) renders a local workflow result even before a Native conversation exists [0.13ms]

test/workbench-tracer-view.test.ts:
(pass) WorkbenchTracerView execution surface > keeps a no-plan performance execution visible [0.17ms]
(pass) WorkbenchTracerView execution surface > shows an explicit assigned goal beside its no-plan execution [0.04ms]
(pass) WorkbenchTracerView execution surface > renders observed health counters without inventing orphan-blocked state [0.04ms]
(pass) WorkbenchTracerView execution surface > labels retry and orphan health as unconfirmed when no performance projection exists [0.04ms]
(pass) WorkbenchTracerView execution surface > states that completion evidence remains unverified [0.03ms]
(pass) WorkbenchTracerView execution surface > aggregates delegation across turns and renders the selected exact detail [0.64ms]

test/delegation-tree-view.test.ts:
(pass) Gajae-style delegation tree > groups native agent lifecycle and IRC items without duplicating lifecycle updates [0.90ms]
(pass) Gajae-style delegation tree > keeps agent names and states scoped to their native turn [0.16ms]
(pass) Gajae-style delegation tree > uses the latest reordered lifecycle state for queued, failed, and cancelled agents [0.45ms]
(pass) Gajae-style delegation tree > preserves native nested activity messages while excluding ordinary collaboration tools [0.12ms]
(pass) Gajae-style delegation tree > projects native call and subagent payloads into one stable delegated task [0.07ms]
(pass) Gajae-style delegation tree > keeps lifecycle, identity, and attempts authoritative when events arrive out of order [0.09ms]
(pass) Gajae-style delegation tree > resolves nested ownership across turns and attaches only public child work [0.17ms]
(pass) Gajae-style delegation tree > scopes repeated native spawn item ids by sender thread and turn [0.06ms]
(pass) Gajae-style delegation tree > keeps delayed child-turn events on their bound attempt and rejects ambiguous new turns [0.10ms]
(pass) Gajae-style delegation tree > renders an aggregate parentRef tree in DFS order with sanitized selectable refs [0.14ms]
(pass) Gajae-style delegation tree > renders the grouped tree in Chat instead of the old one-line collaboration notice [0.53ms]
(pass) Gajae-style delegation tree > stays absent when the App Server has not emitted collaboration items [0.01ms]
(pass) Gajae-style delegation tree > requires native turn and item references for observed trace nodes and keeps source visible when compact [0.32ms]
(pass) Gajae-style delegation tree > keeps a failed spawn visible before the server assigns a receiver thread [0.13ms]

test/chat-render-acceptance.test.ts:
(pass) Chat renderer completion > renders readable Markdown, plain unsupported code, and ANSI-safe rows at 40 columns [0.44ms]
(pass) Chat renderer completion > renders readable Markdown, plain unsupported code, and ANSI-safe rows at 80 columns [0.13ms]
(pass) Chat renderer completion > renders readable Markdown, plain unsupported code, and ANSI-safe rows at 120 columns [0.12ms]
(pass) Chat renderer completion > shows malformed roles and statuses explicitly while preserving safe text and later messages [0.22ms]
(pass) Chat renderer completion > isolates a Markdown renderer failure to one message [0.12ms]
(pass) Chat renderer completion > keeps execution cards with the same item id in separate turns and chronological order [0.90ms]
(pass) Chat renderer completion > sanitizes body-bearing failed messages without partial metadata [0.08ms]
(pass) Chat renderer completion > sanitizes body-bearing cancelled messages without partial metadata [0.04ms]
(pass) Chat renderer completion > sanitizes body-bearing streaming messages without partial metadata [0.04ms]

 114 pass
 0 fail
 1195 expect() calls
Ran 114 tests across 5 files. [264.00ms]

exit_code=0
```

## Core extractions and call-site regressions

Invocation: `bun test test/native-event-projection.test.ts test/completed-turn-note-scope.test.ts test/project-workbench.test.ts test/work-flow.test.ts test/workflow-projection.test.ts test/native-plan-wiring.test.ts test/architecture.test.ts`

```text
bun test v1.4.0 (34cbb9a40)

test/workflow-projection.test.ts:
(pass) execution-run workflow adapter preserves the empty workflow projection contract [0.40ms]

test/project-workbench.test.ts:
(pass) ProjectWorkbench > host reconcile reads an uncertain action after Native termination through the Workbench command [18.32ms]
(pass) ProjectWorkbench > Runtime approval gates real files, stays cancellable, and never calls Native approval [21.66ms]
(pass) ProjectWorkbench > brokered tool requests drive the actual Workbench Runtime and return corrective responses [2.29ms]
(pass) ProjectWorkbench > Astra native passthrough sends the user request unchanged and projects Native state [0.75ms]
(pass) ProjectWorkbench > Astra goal opts one request into the seven-stage Runtime protocol [0.77ms]
(pass) ProjectWorkbench > accepts Native stage reports into seven-stage Todo and hides transport messages from Chat [23.46ms]
(pass) ProjectWorkbench > turns a Goal into a Native Plan request and exposes it before Todo sync [0.73ms]
(pass) ProjectWorkbench > publishes the entry Dashboard before its Linear refresh completes [0.27ms]
(pass) ProjectWorkbench > keeps Linear Dashboard absent when the project has no dashboard connection [0.09ms]
(pass) ProjectWorkbench > keeps the last successful Linear snapshot stale after an unexpected refresh rejection [0.23ms]
(pass) ProjectWorkbench > does not project ordinary execution items as Todo before a Native Plan is observed [6.94ms]
(pass) ProjectWorkbench > keeps a public plan document visible without promoting it to the Native Todo checklist [11.78ms]
(pass) ProjectWorkbench > development recording observes only newly durable activities and failure does not fail Native send [1.46ms]
(pass) ProjectWorkbench > projects MCP management separately and sends enable, disable, and global reload requests [0.35ms]
(pass) ProjectWorkbench > clears only the visible Chat projection and starts compaction on its current thread [11.37ms]
(pass) ProjectWorkbench > derives conservative background work only from complete native collaboration lifecycle snapshots [23.68ms]
(pass) ProjectWorkbench > selects only a root-owned delegated agent and links its exact snapshot detail [12.24ms]
(pass) ProjectWorkbench > collects woo-entry before Chat and applies a refresh to the next queued turn [13.29ms]
(pass) ProjectWorkbench > excludes a WES source that exceeds its bounded collection payload [1.01ms]
(pass) ProjectWorkbench > mirrors seven-stage Runtime to Todo without delaying Native activity projection [34.77ms]
(pass) ProjectWorkbench > keeps Chat usable while Todo sync is blocked and clears the warning after a later plan sync [34.30ms]
(pass) ProjectWorkbench > preserves rewritten root-plan Trace while seven-stage Todo survives resume [36.74ms]
(pass) ProjectWorkbench > narrates meaningful actions asynchronously while excluding Read commands [33.05ms]
(pass) ProjectWorkbench > narrates a selected plan with sanitized goal and bounded action evidence [23.48ms]
(pass) ProjectWorkbench > steers a follow-up into the active Codex turn without creating a queued turn [2.17ms]
(pass) ProjectWorkbench > queues rapid chat submissions when the executor does not support steering [13.54ms]
(pass) ProjectWorkbench > delivers cancel immediately while a native observation is still being journaled and preserves FIFO [7.14ms]
(pass) ProjectWorkbench > records the first public output milestone once without journaling delta text or reasoning [12.73ms]
(pass) ProjectWorkbench > publishes the accepted user message as preparing before native start settles [6.79ms]
(pass) ProjectWorkbench > marks a first-submit thread start failure without leaving preparing progress [0.77ms]
(pass) ProjectWorkbench > ignores Native events that arrive before the journal owns a thread [0.47ms]
(pass) ProjectWorkbench > creates one plain-language question summary after turn completion without blocking queued chat [34.76ms]
(pass) ProjectWorkbench > keeps one immutable T-note per completed question instead of replacing a cumulative summary [24.39ms]
(pass) ProjectWorkbench > projects a SessionGoal marker from a completed assistant message [12.94ms]
(pass) ProjectWorkbench > rejects SessionGoal spoof markers unless they are a sole bounded assistant line for a $session-goal turn [17.45ms]
(pass) ProjectWorkbench > rejects generated T-notes without exactly one canonical non-empty question, why, and result [0.74ms]
(pass) ProjectWorkbench > does not append question-mismatched or prohibited T-note fields [0.43ms]
(pass) ProjectWorkbench > permits user-owned Git/Bun/error/path questions and normal explanatory fields [0.14ms]
(pass) ProjectWorkbench > permits completed-state results that negatively mention 후속 or 추후 [0.10ms]
(pass) ProjectWorkbench > persists an exactly once-sanitized completed question through FileTNoteStore [2.71ms]
(pass) ProjectWorkbench > validates a range capture through TNoteService with its canonical expected question [1.07ms]
(pass) ProjectWorkbench > rejects pre-completion and cross-turn manual T-note ranges [14.05ms]
(pass) ProjectWorkbench > reconciles a failed automatic T-note after restart and appends it only after generation succeeds [25.32ms]
(pass) ProjectWorkbench > reconciles one sparse target-thread T-note after interleaved foreign journal activity [24.12ms]
(pass) ProjectWorkbench > retries a target-thread note after a foreign outbound question interleaves before its turn [25.60ms]
(pass) ProjectWorkbench > publishes the first user message before a slow native thread start completes [0.95ms]
(pass) ProjectWorkbench > keeps active context separate from cumulative model usage and ignores a late auxiliary turn [33.64ms]
(pass) ProjectWorkbench > merges detached Luna and Claude usage into the live WWW session totals [0.51ms]
(pass) ProjectWorkbench > applies permission and collaboration controls to native thread and turn settings [0.76ms]
(pass) ProjectWorkbench > persists an idle Codex selection and uses it for the next native turn [12.60ms]
(pass) ProjectWorkbench > keeps the current model when persistence fails or a turn is active [0.84ms]
(pass) ProjectWorkbench > keeps the selected flow while exposing a pending turn goal [23.95ms]
(pass) ProjectWorkbench > drains FIFO only for exact interrupted and failed turn lifecycle notifications [26.25ms]
(pass) ProjectWorkbench > keeps a normally started turn active when an item event arrives before its local start activity is journaled [23.93ms]
(pass) ProjectWorkbench > keeps follow-up messages on the root thread while sub-agent events are streaming [12.24ms]
(pass) ProjectWorkbench > shows the first optimistic request once while request journaling is pending [12.13ms]
(pass) ProjectWorkbench > observes first output without an item id without accepting an unowned draft [11.38ms]
(pass) ProjectWorkbench > isolates root chat identity from child threads and repeated item ids across turns [24.56ms]
(pass) ProjectWorkbench > keeps a current turn draft separate from a repeated item id in another turn [34.56ms]
(pass) ProjectWorkbench > normalizes sparse root message refs only from an observed turn or item owner [12.93ms]
(pass) ProjectWorkbench > does not treat an ownerless item-only completion as a root message wildcard [13.73ms]
(pass) ProjectWorkbench > does not turn a Native userMessage completion into a missing assistant response [12.13ms]
(pass) ProjectWorkbench > projects a nested interrupted turn/completed as a cancelled partial response [11.94ms]
(pass) ProjectWorkbench > renders an outputless interrupted turn as a terminal state notice [12.11ms]
(pass) ProjectWorkbench > projects nested failed turn/completed status and skips the success checkpoint [13.45ms]
(pass) ProjectWorkbench > projects nested cancelled turn/completed status and skips the success checkpoint [11.46ms]
(pass) ProjectWorkbench > uses nested completed turn status as a success T-note checkpoint [12.39ms]
(pass) ProjectWorkbench > preserves a partial answer and marks a completed turn with no final item as incomplete [34.54ms]
(pass) ProjectWorkbench > preserves a partial answer when turn/failed ends the turn [12.86ms]
(pass) ProjectWorkbench > preserves a partial answer when turn/interrupted ends the turn [11.10ms]
(pass) ProjectWorkbench > preserves a partial answer when turn/cancelled ends the turn [12.17ms]
(pass) ProjectWorkbench > preserves a partial answer when item/agentMessage/failed is the only terminal observation [13.35ms]
(pass) ProjectWorkbench > preserves a partial answer when item/agentMessage/cancelled is the only terminal observation [11.56ms]
(pass) ProjectWorkbench > shows an incomplete placeholder when a completed turn has no answer observation [11.90ms]
(pass) ProjectWorkbench > ignores duplicate completion and late delta only for the exact terminal item owner [23.85ms]
(pass) ProjectWorkbench > remembers a terminal message observation without relying on an item method prefix [11.76ms]
(pass) ProjectWorkbench > does not accept a sparse assistant completion without a turn owner [11.94ms]
(pass) ProjectWorkbench > preserves only the unfinished item when another item in the turn already completed [12.77ms]
(pass) ProjectWorkbench > does not clear a different turn draft when an older root turn terminates [12.81ms]
(pass) ProjectWorkbench > hydrates terminal item identity from the local journal before accepting resumed deltas [11.96ms]
(pass) ProjectWorkbench > ignores a late start for a terminal turn without replacing the active FIFO turn [35.10ms]
(pass) ProjectWorkbench > records one failed bubble and recovers after a definite first-send failure [1.27ms]
(pass) ProjectWorkbench > continues FIFO after a definite queued-send failure without duplicate bubbles [12.00ms]
(pass) ProjectWorkbench > reconciles an uncertain queued send from native lifecycle without duplicate delivery [33.19ms]
(pass) ProjectWorkbench > explicit cancel escapes an uncertain queued send without retrying it and preserves the remaining FIFO [25.23ms]
(pass) ProjectWorkbench > explicit cancel reconciles and interrupts a server-received uncertain turn before draining FIFO [34.59ms]
(pass) ProjectWorkbench > keeps an uncertain FIFO blocked when thread read shape is unknown [12.29ms]
(pass) ProjectWorkbench > does not drain queued chat after the workbench closes [11.61ms]
(pass) ProjectWorkbench > keeps an active turn through item and hook completion until the turn lifecycle terminates [43.51ms]
(pass) ProjectWorkbench > resolves a pending approval by request id when the resolution omits its thread ref [22.02ms]
(pass) ProjectWorkbench > persists approval response preparation before Native transmission [7.08ms]
(pass) ProjectWorkbench > does not resend another decision after approval delivery becomes uncertain [7.43ms]
(pass) ProjectWorkbench > restores an unresolved approval transmission interlock before resuming Native [13.63ms]
(pass) ProjectWorkbench > ignores an approval from another thread instead of mixing it into the active root turn [12.24ms]
(pass) ProjectWorkbench > holds multiple queued messages through approval and drains them only after resolution and turn completion [25.89ms]
(pass) ProjectWorkbench > keeps deltas ephemeral and durably appends completed native observations before publishing [23.53ms]
(pass) ProjectWorkbench > shares frozen durable projections across deltas after a large activity history [26.65ms]
(pass) ProjectWorkbench > bounds live drafts and raw native envelopes while preserving the full safe completed assistant reply [23.16ms]
(pass) ProjectWorkbench > separates public reasoning summaries from raw reasoning content [20.99ms]
(pass) ProjectWorkbench > resumes without native turns and reconciles the opaque thread against local activity [0.56ms]
(pass) ProjectWorkbench > fails closed before reading or journaling when native resume returns another thread [0.17ms]
(pass) ProjectWorkbench > fails closed before journaling when thread read returns another resumed thread [0.13ms]
(pass) ProjectWorkbench > uses native idle state instead of reviving an unterminated historical turn on resume [1.19ms]
(pass) ProjectWorkbench > queues behind the exact in-progress native turn discovered during resume [22.09ms]
(pass) ProjectWorkbench > projects command output deltas as ephemeral tool activity rather than assistant text [11.52ms]
(pass) ProjectWorkbench > does not clear live activity for the same item id completed by another turn [22.23ms]
(pass) ProjectWorkbench > keeps sparse live deltas on one observed owner and clears its sparse completion [21.09ms]
(pass) ProjectWorkbench > bounds repeated live tool deltas to a recent tail with cumulative omission metadata [22.63ms]
(pass) ProjectWorkbench > journals MCP startup status as hidden progress instead of a Chat tool card [11.98ms]
(pass) ProjectWorkbench > never infers a native resume from historical local activities [1.84ms]
(pass) ProjectWorkbench > returns uncertain without retrying an ambiguous native send [0.53ms]
(pass) ProjectWorkbench > rejects invalid local commands without touching native state [0.32ms]
(pass) ProjectWorkbench > selects Trace by exact activity across turns that reuse an item id [36.33ms]
(pass) ProjectWorkbench > routes native approval and detached T-note commands through their explicit ports [12.13ms]
(pass) ProjectWorkbench > reaches Todo mutations and preserves both CAS conflict documents in the immutable action result [1.27ms]
(pass) ProjectWorkbench > promotes a full T-note only after a one-time token and reviews only after exact digest approval [1.95ms]
(pass) ProjectWorkbench > keeps clipped private envelopes out of the live and preserved public response [21.30ms]
(pass) ProjectWorkbench > isolates unknown message roles and refuses a source from another thread [12.05ms]
(pass) ProjectWorkbench > projects the selected run as failed exactly once and appends one durable receipt [11.73ms]
(pass) ProjectWorkbench > keeps a tool failure recoverable until the authoritative turn completion [22.17ms]
(pass) ProjectWorkbench > native command failure preserves the public plan and records recovery without accepting work [55.66ms]
(pass) ProjectWorkbench > Native replacement plans remain in Trace without replacing the seven Todo parents [23.91ms]
(pass) ProjectWorkbench > local workflow commands expose stored summary and reject mutation during native execution [1.49ms]
(pass) ProjectWorkbench > resumes an authenticated legacy completion without replacing its receipt digest [2.60ms]

test/completed-turn-note-scope.test.ts:
(pass) completed turn note scope > selects one completed turn and excludes interleaved foreign-thread activity [0.22ms]
(pass) completed turn note scope > rejects incomplete, cross-turn, reversed, and non-owning question scopes [0.08ms]
(pass) completed turn note scope > latest chooses the most recent valid completion [0.05ms]
(pass) completed turn note scope > finds the owning question despite a foreign outbound question and repeated item id [0.06ms]
(pass) completed turn note scope > exact-selection accepts only the complete ordered source set [0.06ms]
(pass) completed turn note scope > normalizes, redacts, and bounds the question without mutating its activity [0.54ms]

test/native-event-projection.test.ts:
(pass) native event projection > redacts completed reasoning while retaining only a bounded public summary [0.08ms]
(pass) native event projection > bounds and sanitizes oversized nested Native evidence [0.14ms]
(pass) native event projection > maps nested turn completion status {"status":"completed"} to completed [0.03ms]
(pass) native event projection > maps nested turn completion status {"status":{"type":"failed"}} to failed
(pass) native event projection > maps nested turn completion status {"status":{"type":"cancelled"}} to cancelled
(pass) native event projection > classifies userMessage assistant ownership conservatively [0.03ms]
(pass) native event projection > classifies alienMessage assistant ownership conservatively
(pass) native event projection > classifies agentMessage assistant ownership conservatively
(pass) native event projection > projects item/agentMessage/delta through the delta channel matrix [0.03ms]
(pass) native event projection > projects item/reasoning/textDelta through the delta channel matrix
(pass) native event projection > projects item/reasoning/summaryTextDelta through the delta channel matrix
(pass) native event projection > projects item/commandExecution/outputDelta through the delta channel matrix
(pass) native event projection > exposes Native turn lifecycle independently for restored activities [0.01ms]

test/architecture.test.ts:
(pass) source architecture > keeps flattened layers grouped by their canonical responsibility [19.16ms]
(pass) source architecture > keeps the core independent from adapters [12.87ms]
(pass) source architecture > keeps core domain independent from orchestration and effects [16.25ms]
(pass) source architecture > does not recreate the retired top-level source layers [0.25ms]
(pass) source architecture > keeps inbound adapters from importing outbound adapters [13.18ms]
(pass) source architecture > keeps process execution behind application-owned ports [13.41ms]
(pass) source architecture > keeps TUI foundation independent from higher-level TUI groups [13.74ms]
(pass) source architecture > keeps TUI feature implementations independent from sibling features [12.67ms]
(pass) source architecture > keeps concrete executor adapters independent [12.59ms]
(pass) source architecture > has no relative source dependency cycles [13.44ms]
(pass) source architecture > keeps the Work capability entry independent from TUI and Runtime implementations [12.67ms]
(pass) source architecture > keeps the composition root small [0.13ms]
(pass) source architecture > keeps the native workbench shell independent from the legacy session runtime [12.02ms]

test/native-plan-wiring.test.ts:
(pass) Native Plan and Runtime Todo boundaries > keeps a public numbered Plan in workFlow without replacing the seven-stage Todo or carrying it into manual execution [15.16ms]
(pass) Native Plan and Runtime Todo boundaries > keeps a structured Native plan authoritative over a public numbered reply [6.20ms]
(pass) Native Plan and Runtime Todo boundaries > does not manufacture a Native Plan when a Plan turn supplies no plan body [6.58ms]
(pass) Native Plan and Runtime Todo boundaries > projects the Test2 numbered-heading Native plan and associates the earlier Bash activity [7.88ms]
(pass) Native Plan and Runtime Todo boundaries > projects the Test2 numbered list beneath a step-count heading without treating the heading as a step [6.37ms]
(pass) Native Plan and Runtime Todo boundaries > projects the Test2 top-level numbered Native plan and associates the earlier Bash activity [7.72ms]
(pass) Native Plan and Runtime Todo boundaries > does not infer a Native Plan for manual mode [20.73ms]
(pass) Native Plan and Runtime Todo boundaries > does not infer a Native Plan for failed Plan turn [20.97ms]
(pass) Native Plan and Runtime Todo boundaries > does not infer a Native Plan for Plan turn without observed work [20.09ms]
(pass) Native Plan and Runtime Todo boundaries > does not project 일반 번호 목록 [16.18ms]
(pass) Native Plan and Runtime Todo boundaries > does not project 불연속 번호 계획 [15.35ms]
(pass) Native Plan and Runtime Todo boundaries > does not project 실패한 계획 turn [14.28ms]
(pass) Native Plan and Runtime Todo boundaries > does not project 중단된 계획 turn [14.62ms]
(pass) Native Plan and Runtime Todo boundaries > accepts only the known root turn's completed plan item without replacing the Runtime Todo [43.10ms]

test/work-flow.test.ts:
(pass) dplan-v1 > parses completed plan Markdown variants and maps Korean and English statuses [0.51ms]
(pass) dplan-v1 > parses top-level bullets with numbered entries in document order [0.15ms]
(pass) dplan-v1 > accepts 2 plain numbered Native steps only beneath an explicit plan heading [0.09ms]
(pass) dplan-v1 > accepts 12 plain numbered Native steps only beneath an explicit plan heading [0.11ms]
(pass) dplan-v1 > accepts top-level numbered steps from an authoritative Native plan item [0.08ms]
(pass) dplan-v1 > rejects plain numbered Native plan: 한 단계뿐인 목록 [0.04ms]
(pass) dplan-v1 > rejects plain numbered Native plan: 불연속 목록 [0.02ms]
(pass) dplan-v1 > rejects plain numbered Native plan: 13단계 목록 [0.03ms]
(pass) dplan-v1 > fails closed for nested bullets unless they detail the preceding numbered step [0.09ms]
(pass) dplan-v1 > ignores a space-indented detail bullet of any width beneath a numbered step [0.08ms]
(pass) dplan-v1 > fails closed for malformed completed plan Markdown [0.70ms]
(pass) dplan-v1 > retains unique insert delete and reorder without index identity [0.17ms]
(pass) dplan-v1 > fails closed for duplicate/status and redaction collapse [0.19ms]
(pass) dplan-v1 > allows one bounded unique edit but rejects multi-edit and replacement [0.15ms]
(pass) dplan-v1 > orphans pre-plan and zero, one, or multiple running actions [0.14ms]
(pass) dplan-v1 > preserves each inferred activity's plan revision interval [0.14ms]
(pass) dplan-v1 > keeps boundary and equal-status revision attribution in monotonic intervals [0.08ms]
(pass) dplan-v1 > halts at integrity prefix and gives revision precedence to source mismatch [0.12ms]
(pass) dplan-v1 > leaves malformed plans to Layer B instead of registering revision collisions [0.06ms]
(pass) dplan-v1 > is replay deterministic and detects injected full digest collisions [0.13ms]
(pass) dplan-v1 > transfers every associated activity to a retirement orphan [0.09ms]
(pass) dplan-v1 > attributes mixed unmatched regions per item before transferring orphans [0.11ms]
(pass) dplan-v1 > treats duplicate token transitions as ambiguous and transfers each association once [0.21ms]
(pass) dplan-v1 > does not use public labels, display status, or positions as identity evidence [0.55ms]
(pass) dplan-v1 > uses the selected turn's outbound request as the public goal [0.10ms]
(pass) dplan-v1 > requires the selected turn start to match the expected thread [0.03ms]
(pass) dplan-v1 > does not take a later foreign-turn message as the selected turn goal [0.07ms]
(pass) dplan-v1 > uses only the selected turn's preceding outbound request and sanitizes it [0.08ms]
(pass) dplan-v1 > keeps same-turn lifecycle markers and foreign boundaries inside the selected interval [0.09ms]

 200 pass
 0 fail
 2530 expect() calls
Ran 200 tests across 7 files. [2.17s]

exit_code=0
```

## TypeScript check

Invocation: `bun run check`

```text
$ tsc --noEmit

exit_code=0
```

## Local units check

Invocation: `bun run units:check`

```text
$ bun scripts/local-units.ts check
5 Units · 32 Linear links · valid · 4a5b0089fcb5000b498507a4e9cbeca5037841ab19f9ed9c9ca4f56ec231d2cc

exit_code=0
```

## Architecture suite

Invocation: `bun test test/architecture.test.ts`

```text
bun test v1.4.0 (34cbb9a40)

test/architecture.test.ts:
(pass) source architecture > keeps flattened layers grouped by their canonical responsibility [14.76ms]
(pass) source architecture > keeps the core independent from adapters [13.46ms]
(pass) source architecture > keeps core domain independent from orchestration and effects [27.13ms]
(pass) source architecture > does not recreate the retired top-level source layers [0.99ms]
(pass) source architecture > keeps inbound adapters from importing outbound adapters [39.71ms]
(pass) source architecture > keeps process execution behind application-owned ports [15.99ms]
(pass) source architecture > keeps TUI foundation independent from higher-level TUI groups [15.95ms]
(pass) source architecture > keeps TUI feature implementations independent from sibling features [12.81ms]
(pass) source architecture > keeps concrete executor adapters independent [12.32ms]
(pass) source architecture > has no relative source dependency cycles [13.36ms]
(pass) source architecture > keeps the Work capability entry independent from TUI and Runtime implementations [12.72ms]
(pass) source architecture > keeps the composition root small [0.18ms]
(pass) source architecture > keeps the native workbench shell independent from the legacy session runtime [13.18ms]

 13 pass
 0 fail
 1554 expect() calls
Ran 13 tests across 1 file. [201.00ms]

exit_code=0
```

## Complete test suite

Invocation: `bun test`

```text
bun test v1.4.0 (34cbb9a40)

test/session-stats-view.test.ts:
(pass) session stats view > renders a visual dashboard with KPI, usage bar, compact metrics, and request table [9.97ms]
(pass) session stats view > keeps request prompts to one truncated table row [3.17ms]
(pass) session stats view > marks the selected shortlist request so Enter has a visible target [0.75ms]
(pass) session stats view > keeps wide, normal, and narrow layouts bounded [7.44ms]
(pass) session stats view > renders diagnostics and request investigation as separate top-level views [0.52ms]
(pass) session stats view > keeps empty sessions quiet [0.72ms]
(pass) session stats view > renders coverage, observation units, denominators, and acceptance boundary [1.32ms]
(pass) session stats view > renders the ACTIVE observation state [1.05ms]
(pass) session stats view > renders the FAILED observation state [0.58ms]
(pass) session stats view > renders the CANCELLED observation state [0.41ms]
(pass) session stats view > renders the OBSERVED observation state [0.43ms]
(pass) session stats view > keeps mixed active, failed, cancelled, and completed root-turn outcomes visible [0.48ms]
(pass) session stats view > keeps every root outcome count above the first rule at 40 columns [0.51ms]
(pass) session stats view > keeps every root outcome count above the first rule at 80 columns [0.42ms]
(pass) session stats view > keeps every root outcome count above the first rule at 120 columns [0.45ms]
(pass) session stats view > discloses partial coverage and excludes a terminal-only root turn from elapsed pairs [0.48ms]
(pass) session stats view > renders observed zero tokens differently from unobserved usage [0.97ms]
(pass) session stats view > renders a conservatively bounded historical session drilldown [0.18ms]

test/workflow-projection.test.ts:
(pass) execution-run workflow adapter preserves the empty workflow projection contract [0.31ms]

test/request-controller.test.ts:
(pass) RequestController > accepts pass as the public alias for a reasoned skipped stage [3.20ms]
(pass) RequestController > Runtime control transport is not accumulated as business evidence [0.23ms]
(pass) RequestController > a stale host approval cannot cross the write-ahead boundary [1.67ms]
(pass) RequestController > host recovers a terminated turn read-only without reopening stages or accepting Native recovery [2.13ms]
(pass) RequestController > required destinations block final and cannot borrow another publication receipt [6.09ms]
(pass) RequestController > publish success without an attested identity remains uncertain [2.15ms]
(pass) RequestController > verification failure replans within seven stages without accepting old receipts [9.96ms]
(pass) RequestController > lost file receipt is reconciled after restart without another write [7.74ms]
(pass) RequestController > inconclusive reconciliation remains blocked and cannot advance through replay [6.63ms]
(pass) RequestController > cancelled, unscoped and unrecorded read-back never clear uncertainty [5.51ms]
(pass) RequestController > returns corrective rejections and ignores Chat reports for brokered requests [0.41ms]
(pass) RequestController > rejects wrong stage, missing authority, foreign request and unknown capability before effects [1.78ms]
(pass) RequestController > journal failure and cancellation during authorization prevent the real effect [1.14ms]
(pass) RequestController > a real pinned file changes only under the exact host permit; replay never executes it again [2.93ms]
(pass) RequestController > uncertain effects are not retried after controller restart [1.09ms]

test/pi-harness.test.ts:
(pass) PiHarness Phase A native compatibility > passes WWW request context into the Pi prompt instead of silently dropping it [6.45ms]
(pass) PiHarness Phase A native compatibility > keeps the observable start, text delta, terminal, and close contract without exposing reasoning [12.52ms]
(pass) PiHarness Phase A native compatibility > emits exactly one terminal for success and failure [23.91ms]
(pass) PiHarness Phase A native compatibility > interrupts the active session and emits one interrupted terminal [11.47ms]
(pass) PiHarness Phase A native compatibility > keeps an interrupted terminal when Pi resolves its prompt after abort [12.43ms]
(pass) PiHarness Phase A native compatibility > interrupts before deferred Pi startup without issuing the prompt [6.17ms]
(pass) PiHarness Phase A native compatibility > rejects a concurrent turn and inspects only the current in-memory session [5.38ms]
(pass) PiHarness Phase A native compatibility > rejects silent mid-session model and effort substitutions [0.16ms]
(pass) PiHarness Phase A native compatibility > fails closed for persistent-session, approval, MCP, and tool operations [0.12ms]
(pass) PiHarness Phase A native compatibility > creates a fresh restricted Pi session and independently forwards provider, model, effort, and WWW prompt [0.09ms]
(pass) PiHarness Phase A native compatibility > can retry thread creation after model or authentication setup fails [0.09ms]
(pass) PiHarness Phase A native compatibility > loads the pinned Pi SDK surface used by the production adapter [292.05ms]
(pass) PiHarness Phase A native compatibility > drives model resolution, restrictions, and public event mapping through the SDK seam [0.55ms]
(pass) PiHarness Phase A native compatibility > requires WWW-owned instructions before constructing the production Pi lane [0.07ms]

test/gemini-cli-usage-credentials.test.ts:
(pass) Gemini CLI Keychain OAuth를 복사하지 않고 HUD 조회 자격으로 읽는다 [1.07ms]
(pass) Google 로그인 선택이 아니면 CLI의 이전 자격을 사용하지 않는다 [0.77ms]

test/workbench-lifecycle-noise.test.ts:
(pass) Workbench lifecycle noise filter > keeps repeated MCP startup and retry telemetry out of Chat [1.42ms]

test/skill-run-store.test.ts:
(pass) Receipt projection 저장 실패에도 재시작 후 상태와 Receipt를 함께 읽는다 [8.62ms]
(pass) 독립 프로세스 둘이 같은 revision에서 저장하면 하나만 수락한다 [51.40ms]
(pass) 다른 프로젝트에 복사한 새 state projection은 import하지 않는다 [5.65ms]
(pass) 기존 무바인딩 JSON은 읽고 다음 mutation부터 현재 프로젝트에 결박한다 [6.00ms]
(pass) 불일치 Receipt commit을 거절하고 기존 상태를 보존한다 [4.14ms]
(pass) step 완료를 Receipt 없이 state write로 저장할 수 없다 [3.46ms]
(pass) projection 장애를 제거하면 재조회로 JSON export를 복구하고 중복 commit은 거절한다 [5.73ms]
(pass) 새 Receipt JSON을 다른 프로젝트의 legacy run에 복사해도 import하지 않는다 [6.04ms]
(pass) 유효한 digest여도 다른 skill Receipt 또는 다른 종료 state를 commit하지 않는다 [4.62ms]
(pass) stage만 완료로 바꾸는 state write도 Receipt 없이 거절한다 [3.48ms]
(pass) state write와 commitStep은 고정된 scope·subject·scenario·skill identity를 변경하지 못한다 [4.89ms]
(pass) 고정 identity를 유지한 승인 요청과 승인은 저장하고 종료 Receipt와 연결한다 [12.61ms]

test/usage-strip.test.ts:
(pass) runtime mode, 공급자 잔여 시간, Context 토큰을 한 줄에 표시한다 [0.83ms]
(pass) 값 없음과 좁은 폭에서도 한 줄 경계를 지킨다 [0.09ms]
(pass) ready 상태에 사용량 값이 없으면 대시를 표시한다 [0.07ms]
(pass) loading auth-required unsupported 상태만 짧은 상태 문구를 사용한다 [0.07ms]
(pass) YAML HUD 정책으로 측정 사용량과 Context를 각각 숨긴다 [0.05ms]

test/skill-runtime.test.ts:
(pass) RPA Agent runtime > 명확한 intent만 분류하고 모호한 요청은 질문 대상으로 남긴다 [0.23ms]
(pass) RPA Agent runtime > 신규 개발을 고정 Skill 체인으로 계획한다 [0.08ms]
(pass) RPA Agent runtime > Skill Run이 순서, stale 승인, evidence와 Receipt를 강제한다 [0.25ms]
(pass) RPA Agent runtime > 상태 CAS와 Receipt 저장·조회를 run 경계 안에서 수행한다 [7.03ms]
(pass) File Skill Registry > 프로젝트 Skill frontmatter와 bytes digest를 실제 Git revision에 고정한다 [80.59ms]

test/session-stats.test.ts:
(pass) session review projection > A: projects an empty session without unavailable compatibility fields [0.09ms]
(pass) session review projection > distinguishes unobserved token usage from an observed zero [0.08ms]
(pass) session review projection > B: preserves a single model's three successful root turns [0.14ms]
(pass) session review projection > C: separates interactive and detached model namespaces [0.05ms]
(pass) session review projection > D: reports recovery only for an explicit later success with the same concrete item ID [0.07ms]
(pass) session review projection > E: measures only paired approval time [0.07ms]
(pass) session review projection > F: labels resumed local observations as partial coverage [0.04ms]
(pass) session review projection > projects the active observed session state [0.03ms]
(pass) session review projection > projects the failed observed session state [0.03ms]
(pass) session review projection > projects the cancelled observed session state [0.03ms]
(pass) session review projection > projects the completed observed session state [0.02ms]
(pass) session review projection > classifies native turn/completed events by the nested turn status [0.11ms]
(pass) session review projection > honors a corrected failed activity phase for turn/completed [0.04ms]
(pass) session review projection > honors a corrected cancelled activity phase for turn/completed [0.02ms]
(pass) session review projection > G: gives unattributed usage its own warning [0.03ms]
(pass) session review projection > H: keeps details bounded and shortlists issues before slowest and recent requests [0.76ms]
(pass) session review projection > retains every shortlisted issue for drill-down beyond one thousand requests [16.94ms]
(pass) session review projection > does not assign elapsed time to an active root turn [0.15ms]
(pass) session review projection > excludes a completed root turn without an observed start from elapsed averages [0.07ms]
(pass) session review projection > uses root turns and paired observations as the explicit performance denominators [0.20ms]
(pass) session review projection > captures the first output milestone from a text delta [0.04ms]
(pass) session review projection > does not classify error:null as a failure and marks t-note results unverified [0.16ms]

test/request-runtime.test.ts:
(pass) seven-stage request runtime > keeps historical requests legacy and scopes protocol reports to the owning request [0.30ms]
(pass) seven-stage request runtime > approval blocks reports until the exact request is resolved [0.17ms]
(pass) seven-stage request runtime > VERIFY rejects failed, foreign and prose-only evidence [0.26ms]
(pass) seven-stage request runtime > creates seven Todo parents before Native has authored its plan [0.97ms]
(pass) seven-stage request runtime > Native authors stage tasks; parallel work and stable dependency IDs survive projection [3.62ms]
(pass) seven-stage request runtime > renders Request stages, Native Todo, and the actual Now observation as separate layers [0.60ms]
(pass) seven-stage request runtime > rejects out-of-order, cyclic and future-running plans without partial updates [0.18ms]
(pass) seven-stage request runtime > Native completion never invents stage completion; private reasoning cannot become a report [0.14ms]
(pass) seven-stage request runtime > keeps an interrupted Native turn distinct from a failed request [0.17ms]
(pass) seven-stage request runtime > accepts structured VERIFY intent only on VERIFY tasks [0.06ms]
(pass) seven-stage request runtime > persists canonical record and distinct destination drafts atomically [1.53ms]

test/composer-draft-store.test.ts:
(pass) file composer draft controller > starts empty when its draft is missing [0.44ms]
(pass) file composer draft controller > saves and restores a draft without exposing stored metadata [1.21ms]
(pass) file composer draft controller > restores the project draft into a newly created session [0.83ms]
(pass) file composer draft controller > clears drafts explicitly and when saving empty text [1.42ms]
(pass) file composer draft controller > writes private directories and files [0.85ms]
(pass) file composer draft controller > isolates drafts by project key [1.01ms]
(pass) file composer draft controller > fails closed for malformed schema [1.23ms]
(pass) file composer draft controller > fails closed when a stored draft names another project [1.07ms]
(pass) file composer draft controller > rejects oversized UTF-8 text [0.25ms]
(pass) file composer draft controller > ignores interrupted temporary artifacts [0.58ms]
(pass) file composer draft controller > keeps concurrent session drafts isolated and restores the newest [4.09ms]
(pass) file composer draft controller > does not clear a source draft that changed after it was restored [3.87ms]

test/workbench-shell-policy.test.ts:
(pass) native workbench shell receipt policy > replaces the Composer slot without rebuilding it [0.07ms]
(pass) native workbench shell receipt policy > accepts or declines a pending approval through natural Chat input [0.13ms]
(pass) native workbench shell receipt policy > cycles Shift+Tab runtime modes as Bypass, Manual, and Plan [0.03ms]
(pass) native workbench shell receipt policy > places the active model and effort on the composer edge [0.12ms]
(pass) native workbench shell receipt policy > cycles the focused Composer border through distinct shimmer frames [0.11ms]
(pass) native workbench shell receipt policy > resolves login Provider names from ordinary Chat input [0.03ms]
(pass) native workbench shell receipt policy > keeps completed T-notes separate from selected execution Trace and current Todo [0.02ms]
(pass) native workbench shell receipt policy > selects Trace only by exact activity id and rejects mutable legacy Todo commands [0.19ms]
(pass) native workbench shell receipt policy > preserves ordered editor input while streaming frames remain coalesced [0.20ms]
(pass) native workbench shell receipt policy > binds an external mutation approval identity to the exact candidate payload [0.36ms]
(pass) native workbench shell receipt policy > routes dashboard, monitor, map, and stats to distinct local view modes [0.08ms]
(pass) native workbench shell receipt policy > treats observability views as siblings with one workspace return target [0.07ms]
(pass) native workbench shell receipt policy > preserves the selected Dashboard session by identity across refresh reorder [0.04ms]
(pass) native workbench shell receipt policy > preserves dashboard layout viewports while switching views [3.80ms]
(pass) native workbench shell receipt policy > preserves native model identity even before the catalog recognizes it [0.06ms]
(pass) native workbench shell receipt policy > places the native model and effort in the frame title [0.09ms]
(pass) native workbench shell receipt policy > names the model the running turn uses, not a selection that applies to the next one [0.06ms]
(pass) native workbench shell receipt policy > does not repeat an assistant chat sentence in the current-activity rail [0.19ms]
(pass) native workbench shell receipt policy > falls back to an immediate analysis label before native intent arrives [0.03ms]
(pass) native workbench shell receipt policy > shows the numbered current Native plan step [0.06ms]
(pass) native workbench shell receipt policy > adds the concrete live action to the current Native plan step [0.04ms]
(pass) native workbench shell receipt policy > shows the concrete live action even when Native Plan is absent [0.02ms]
(pass) native workbench shell receipt policy > keeps the completed plan visible while the final response is being prepared [0.02ms]
(pass) native workbench shell receipt policy > keeps the current step while adding the public Native reasoning summary [0.04ms]
(pass) native workbench shell receipt policy > keeps a no-plan live action visible alongside its public reasoning summary [0.02ms]
(pass) native workbench shell receipt policy > identifies response drafting without exposing partial output [0.02ms]
(pass) native workbench shell receipt policy > shows approval as a paused turn instead of animated background work [0.03ms]
(pass) native workbench shell receipt policy > marks an exact root tool as observation-stalled after its terminal event is overdue [0.04ms]
(pass) native workbench shell receipt policy > starts animating while the first user message is still being delivered [0.01ms]
(pass) native workbench shell receipt policy > does not animate the current-activity rail after the turn completes
(pass) native workbench shell receipt policy > clears an accepted chat and reports its message [0.03ms]
(pass) native workbench shell receipt policy > keeps a generic accepted notice from adding another HUD row [0.01ms]
(pass) native workbench shell receipt policy > clears a deferred chat from the editor without presenting FIFO as the primary UX [0.01ms]
(pass) native workbench shell receipt policy > restores only rejected input
(pass) native workbench shell receipt policy > points an uncertain native send to the explicit reconciliation command [0.01ms]

test/project-workbench.test.ts:
(pass) ProjectWorkbench > host reconcile reads an uncertain action after Native termination through the Workbench command [21.57ms]
(pass) ProjectWorkbench > Runtime approval gates real files, stays cancellable, and never calls Native approval [21.62ms]
(pass) ProjectWorkbench > brokered tool requests drive the actual Workbench Runtime and return corrective responses [1.25ms]
(pass) ProjectWorkbench > Astra native passthrough sends the user request unchanged and projects Native state [0.53ms]
(pass) ProjectWorkbench > Astra goal opts one request into the seven-stage Runtime protocol [0.76ms]
(pass) ProjectWorkbench > accepts Native stage reports into seven-stage Todo and hides transport messages from Chat [25.55ms]
(pass) ProjectWorkbench > turns a Goal into a Native Plan request and exposes it before Todo sync [1.03ms]
(pass) ProjectWorkbench > publishes the entry Dashboard before its Linear refresh completes [0.46ms]
(pass) ProjectWorkbench > keeps Linear Dashboard absent when the project has no dashboard connection [0.12ms]
(pass) ProjectWorkbench > keeps the last successful Linear snapshot stale after an unexpected refresh rejection [0.24ms]
(pass) ProjectWorkbench > does not project ordinary execution items as Todo before a Native Plan is observed [6.92ms]
(pass) ProjectWorkbench > keeps a public plan document visible without promoting it to the Native Todo checklist [13.33ms]
(pass) ProjectWorkbench > development recording observes only newly durable activities and failure does not fail Native send [1.99ms]
(pass) ProjectWorkbench > projects MCP management separately and sends enable, disable, and global reload requests [0.45ms]
(pass) ProjectWorkbench > clears only the visible Chat projection and starts compaction on its current thread [12.67ms]
(pass) ProjectWorkbench > derives conservative background work only from complete native collaboration lifecycle snapshots [26.03ms]
(pass) ProjectWorkbench > selects only a root-owned delegated agent and links its exact snapshot detail [12.95ms]
(pass) ProjectWorkbench > collects woo-entry before Chat and applies a refresh to the next queued turn [15.13ms]
(pass) ProjectWorkbench > excludes a WES source that exceeds its bounded collection payload [1.42ms]
(pass) ProjectWorkbench > mirrors seven-stage Runtime to Todo without delaying Native activity projection [36.87ms]
(pass) ProjectWorkbench > keeps Chat usable while Todo sync is blocked and clears the warning after a later plan sync [38.56ms]
(pass) ProjectWorkbench > preserves rewritten root-plan Trace while seven-stage Todo survives resume [39.33ms]
(pass) ProjectWorkbench > narrates meaningful actions asynchronously while excluding Read commands [33.94ms]
(pass) ProjectWorkbench > narrates a selected plan with sanitized goal and bounded action evidence [21.69ms]
(pass) ProjectWorkbench > steers a follow-up into the active Codex turn without creating a queued turn [1.85ms]
(pass) ProjectWorkbench > queues rapid chat submissions when the executor does not support steering [13.06ms]
(pass) ProjectWorkbench > delivers cancel immediately while a native observation is still being journaled and preserves FIFO [7.37ms]
(pass) ProjectWorkbench > records the first public output milestone once without journaling delta text or reasoning [13.11ms]
(pass) ProjectWorkbench > publishes the accepted user message as preparing before native start settles [6.50ms]
(pass) ProjectWorkbench > marks a first-submit thread start failure without leaving preparing progress [0.59ms]
(pass) ProjectWorkbench > ignores Native events that arrive before the journal owns a thread [0.36ms]
(pass) ProjectWorkbench > creates one plain-language question summary after turn completion without blocking queued chat [36.03ms]
(pass) ProjectWorkbench > keeps one immutable T-note per completed question instead of replacing a cumulative summary [25.30ms]
(pass) ProjectWorkbench > projects a SessionGoal marker from a completed assistant message [13.52ms]
(pass) ProjectWorkbench > rejects SessionGoal spoof markers unless they are a sole bounded assistant line for a $session-goal turn [18.33ms]
(pass) ProjectWorkbench > rejects generated T-notes without exactly one canonical non-empty question, why, and result [0.83ms]
(pass) ProjectWorkbench > does not append question-mismatched or prohibited T-note fields [0.47ms]
(pass) ProjectWorkbench > permits user-owned Git/Bun/error/path questions and normal explanatory fields [0.26ms]
(pass) ProjectWorkbench > permits completed-state results that negatively mention 후속 or 추후 [0.12ms]
(pass) ProjectWorkbench > persists an exactly once-sanitized completed question through FileTNoteStore [1.98ms]
(pass) ProjectWorkbench > validates a range capture through TNoteService with its canonical expected question [1.30ms]
(pass) ProjectWorkbench > rejects pre-completion and cross-turn manual T-note ranges [14.25ms]
(pass) ProjectWorkbench > reconciles a failed automatic T-note after restart and appends it only after generation succeeds [32.13ms]
(pass) ProjectWorkbench > reconciles one sparse target-thread T-note after interleaved foreign journal activity [24.62ms]
(pass) ProjectWorkbench > retries a target-thread note after a foreign outbound question interleaves before its turn [27.23ms]
(pass) ProjectWorkbench > publishes the first user message before a slow native thread start completes [0.98ms]
(pass) ProjectWorkbench > keeps active context separate from cumulative model usage and ignores a late auxiliary turn [35.63ms]
(pass) ProjectWorkbench > merges detached Luna and Claude usage into the live WWW session totals [1.14ms]
(pass) ProjectWorkbench > applies permission and collaboration controls to native thread and turn settings [1.45ms]
(pass) ProjectWorkbench > persists an idle Codex selection and uses it for the next native turn [13.92ms]
(pass) ProjectWorkbench > keeps the current model when persistence fails or a turn is active [0.73ms]
(pass) ProjectWorkbench > keeps the selected flow while exposing a pending turn goal [24.14ms]
(pass) ProjectWorkbench > drains FIFO only for exact interrupted and failed turn lifecycle notifications [23.78ms]
(pass) ProjectWorkbench > keeps a normally started turn active when an item event arrives before its local start activity is journaled [26.11ms]
(pass) ProjectWorkbench > keeps follow-up messages on the root thread while sub-agent events are streaming [12.18ms]
(pass) ProjectWorkbench > shows the first optimistic request once while request journaling is pending [12.93ms]
(pass) ProjectWorkbench > observes first output without an item id without accepting an unowned draft [13.16ms]
(pass) ProjectWorkbench > isolates root chat identity from child threads and repeated item ids across turns [27.33ms]
(pass) ProjectWorkbench > keeps a current turn draft separate from a repeated item id in another turn [34.93ms]
(pass) ProjectWorkbench > normalizes sparse root message refs only from an observed turn or item owner [13.55ms]
(pass) ProjectWorkbench > does not treat an ownerless item-only completion as a root message wildcard [12.05ms]
(pass) ProjectWorkbench > does not turn a Native userMessage completion into a missing assistant response [13.18ms]
(pass) ProjectWorkbench > projects a nested interrupted turn/completed as a cancelled partial response [13.00ms]
(pass) ProjectWorkbench > renders an outputless interrupted turn as a terminal state notice [13.20ms]
(pass) ProjectWorkbench > projects nested failed turn/completed status and skips the success checkpoint [13.33ms]
(pass) ProjectWorkbench > projects nested cancelled turn/completed status and skips the success checkpoint [13.98ms]
(pass) ProjectWorkbench > uses nested completed turn status as a success T-note checkpoint [12.79ms]
(pass) ProjectWorkbench > preserves a partial answer and marks a completed turn with no final item as incomplete [34.94ms]
(pass) ProjectWorkbench > preserves a partial answer when turn/failed ends the turn [11.01ms]
(pass) ProjectWorkbench > preserves a partial answer when turn/interrupted ends the turn [12.48ms]
(pass) ProjectWorkbench > preserves a partial answer when turn/cancelled ends the turn [11.85ms]
(pass) ProjectWorkbench > preserves a partial answer when item/agentMessage/failed is the only terminal observation [12.74ms]
(pass) ProjectWorkbench > preserves a partial answer when item/agentMessage/cancelled is the only terminal observation [12.26ms]
(pass) ProjectWorkbench > shows an incomplete placeholder when a completed turn has no answer observation [12.70ms]
(pass) ProjectWorkbench > ignores duplicate completion and late delta only for the exact terminal item owner [24.89ms]
(pass) ProjectWorkbench > remembers a terminal message observation without relying on an item method prefix [14.17ms]
(pass) ProjectWorkbench > does not accept a sparse assistant completion without a turn owner [12.87ms]
(pass) ProjectWorkbench > preserves only the unfinished item when another item in the turn already completed [11.56ms]
(pass) ProjectWorkbench > does not clear a different turn draft when an older root turn terminates [11.97ms]
(pass) ProjectWorkbench > hydrates terminal item identity from the local journal before accepting resumed deltas [12.98ms]
(pass) ProjectWorkbench > ignores a late start for a terminal turn without replacing the active FIFO turn [33.86ms]
(pass) ProjectWorkbench > records one failed bubble and recovers after a definite first-send failure [1.44ms]
(pass) ProjectWorkbench > continues FIFO after a definite queued-send failure without duplicate bubbles [12.15ms]
(pass) ProjectWorkbench > reconciles an uncertain queued send from native lifecycle without duplicate delivery [36.20ms]
(pass) ProjectWorkbench > explicit cancel escapes an uncertain queued send without retrying it and preserves the remaining FIFO [25.16ms]
(pass) ProjectWorkbench > explicit cancel reconciles and interrupts a server-received uncertain turn before draining FIFO [39.63ms]
(pass) ProjectWorkbench > keeps an uncertain FIFO blocked when thread read shape is unknown [12.33ms]
(pass) ProjectWorkbench > does not drain queued chat after the workbench closes [13.16ms]
(pass) ProjectWorkbench > keeps an active turn through item and hook completion until the turn lifecycle terminates [46.76ms]
(pass) ProjectWorkbench > resolves a pending approval by request id when the resolution omits its thread ref [21.43ms]
(pass) ProjectWorkbench > persists approval response preparation before Native transmission [6.96ms]
(pass) ProjectWorkbench > does not resend another decision after approval delivery becomes uncertain [7.34ms]
(pass) ProjectWorkbench > restores an unresolved approval transmission interlock before resuming Native [13.11ms]
(pass) ProjectWorkbench > ignores an approval from another thread instead of mixing it into the active root turn [11.78ms]
(pass) ProjectWorkbench > holds multiple queued messages through approval and drains them only after resolution and turn completion [24.97ms]
(pass) ProjectWorkbench > keeps deltas ephemeral and durably appends completed native observations before publishing [23.40ms]
(pass) ProjectWorkbench > shares frozen durable projections across deltas after a large activity history [23.67ms]
(pass) ProjectWorkbench > bounds live drafts and raw native envelopes while preserving the full safe completed assistant reply [22.43ms]
(pass) ProjectWorkbench > separates public reasoning summaries from raw reasoning content [22.95ms]
(pass) ProjectWorkbench > resumes without native turns and reconciles the opaque thread against local activity [0.59ms]
(pass) ProjectWorkbench > fails closed before reading or journaling when native resume returns another thread [0.15ms]
(pass) ProjectWorkbench > fails closed before journaling when thread read returns another resumed thread [0.11ms]
(pass) ProjectWorkbench > uses native idle state instead of reviving an unterminated historical turn on resume [1.17ms]
(pass) ProjectWorkbench > queues behind the exact in-progress native turn discovered during resume [24.73ms]
(pass) ProjectWorkbench > projects command output deltas as ephemeral tool activity rather than assistant text [12.38ms]
(pass) ProjectWorkbench > does not clear live activity for the same item id completed by another turn [21.14ms]
(pass) ProjectWorkbench > keeps sparse live deltas on one observed owner and clears its sparse completion [21.05ms]
(pass) ProjectWorkbench > bounds repeated live tool deltas to a recent tail with cumulative omission metadata [23.06ms]
(pass) ProjectWorkbench > journals MCP startup status as hidden progress instead of a Chat tool card [11.86ms]
(pass) ProjectWorkbench > never infers a native resume from historical local activities [1.68ms]
(pass) ProjectWorkbench > returns uncertain without retrying an ambiguous native send [0.54ms]
(pass) ProjectWorkbench > rejects invalid local commands without touching native state [0.34ms]
(pass) ProjectWorkbench > selects Trace by exact activity across turns that reuse an item id [37.72ms]
(pass) ProjectWorkbench > routes native approval and detached T-note commands through their explicit ports [12.99ms]
(pass) ProjectWorkbench > reaches Todo mutations and preserves both CAS conflict documents in the immutable action result [1.28ms]
(pass) ProjectWorkbench > promotes a full T-note only after a one-time token and reviews only after exact digest approval [1.86ms]
(pass) ProjectWorkbench > keeps clipped private envelopes out of the live and preserved public response [24.27ms]
(pass) ProjectWorkbench > isolates unknown message roles and refuses a source from another thread [13.01ms]
(pass) ProjectWorkbench > projects the selected run as failed exactly once and appends one durable receipt [12.52ms]
(pass) ProjectWorkbench > keeps a tool failure recoverable until the authoritative turn completion [24.58ms]
(pass) ProjectWorkbench > native command failure preserves the public plan and records recovery without accepting work [57.22ms]
(pass) ProjectWorkbench > Native replacement plans remain in Trace without replacing the seven Todo parents [23.68ms]
(pass) ProjectWorkbench > local workflow commands expose stored summary and reject mutation during native execution [1.15ms]
(pass) ProjectWorkbench > resumes an authenticated legacy completion without replacing its receipt digest [2.61ms]

test/gemini-cli-auth.test.ts:
(pass) ProviderAuthController > offers Google subscription login before the API key alternative [0.14ms]
(pass) ProviderAuthController > reports only a confirmed Gemini CLI credential as Google OAuth [0.08ms]
(pass) ProviderAuthController > does not complete Google OAuth until the CLI credential exists [0.09ms]
(pass) ProviderAuthController > persists ACP web authentication in the Gemini CLI config directory without opening Terminal [1.60ms]

test/linear-contract-v2.test.ts:
(pass) Linear v2 contract > accepts the fixed hierarchy and Feynman-readable body order [1.65ms]
(pass) Linear v2 contract > validates Artifact Skill groups and their exact parents [0.11ms]
(pass) Linear v2 contract > rejects missing sections, unfilled template markers, linked Code-ID, and active WOO-683 [0.39ms]
(pass) Linear v2 contract > requires protected metadata changes to be declared [3.06ms]
(pass) Linear v2 contract > validates a traceability-only snapshot and its exact milestone [0.23ms]
(pass) Linear v2 contract > accepts Linear's canonical bullet and angle-wrapped Obsidian URL [0.12ms]
(pass) Linear v2 contract > accepts Linear's native pull request embed in a GitHub connection line [0.20ms]
(pass) Linear v2 contract > requires a complete, unpaginated readback snapshot [0.24ms]
(pass) Linear RPA contract > accepts separate Environment, Skills, and Agents roots with four independent project RPA roots [1.02ms]
(pass) Linear RPA contract > rejects missing capability and project tasks plus invalid RPA identity [0.62ms]

test/render-scheduler.test.ts:
(pass) RenderScheduler > coalesces in-turn native deltas but flushes durable and terminal updates [0.09ms]
(pass) RenderScheduler > coalesces token deltas to a 64ms trailing render [0.08ms]
(pass) RenderScheduler > flushes terminal state immediately and cancels a stale timer [0.06ms]

test/workbench-views.test.ts:
(pass) workbench dashboard views > shows the linked Linear project while the entry dashboard is connecting [0.31ms]
(pass) workbench dashboard views > projects linked Linear issues into the empty Chat dashboard [2.38ms]
(pass) workbench dashboard views > keeps a failed Linear entry Dashboard visible with a recovery action [0.07ms]
(pass) workbench dashboard views > replaces the entry Dashboard with ordinary Chat after the first user message [0.49ms]
(pass) workbench dashboard views > reuses the complete chat projection for scroll-only frames [86.94ms]
(pass) workbench dashboard views > shows a T-note failure without assigning a completion number to an unstored note [2.14ms]
(pass) workbench dashboard views > keeps completed T-notes in Dashboard and selected execution Source in Monitor [0.88ms]
(pass) workbench dashboard views > renders the dashboard Tracer from Plan-linked public activities rather than T-note summaries [0.82ms]
(pass) workbench dashboard views > shows each inferred Plan activity with an exact Trace address and readable public Source [0.82ms]
(pass) workbench dashboard views > distinguishes an unavailable selected Source from a partial resumed journal [0.09ms]
(pass) workbench dashboard views > keeps resumed assistant output free of the selected T-note recap [0.16ms]
(pass) workbench dashboard views > keeps the live chat, streaming projection, and Todo while switching to the monitor projection [0.91ms]
(pass) workbench dashboard views > keeps public Native plan, compaction, collaboration, and reasoning summaries in transcript order [0.52ms]
(pass) workbench dashboard views > uses one filled user surface and an open assistant transcript [0.16ms]
(pass) workbench dashboard views > renders only the public answer from a completed assistant envelope [7.42ms]
(pass) workbench dashboard views > reprojects unchanged envelope text when streaming becomes completed [0.22ms]
(pass) workbench dashboard views > renders a preserved incomplete answer and final-observation notice within 40 columns [0.19ms]
(pass) workbench dashboard views > renders a preserved incomplete answer and final-observation notice within 80 columns [0.07ms]
(pass) workbench dashboard views > renders a preserved incomplete answer and final-observation notice within 120 columns [0.07ms]
(pass) workbench dashboard views > reprojects unchanged partial text when streaming becomes incomplete [0.11ms]
(pass) workbench dashboard views > reprojects unchanged failed text when its observation becomes partial [0.10ms]
(pass) workbench dashboard views > distinguishes an empty missing-final response from a preserved partial answer [0.07ms]
(pass) workbench dashboard views > sanitizes preserved answer text beside the failed terminal label [0.06ms]
(pass) workbench dashboard views > sanitizes preserved answer text beside the cancelled terminal label [0.04ms]
(pass) workbench dashboard views > fails closed for an unfinished analysis envelope on a incomplete partial [0.05ms]
(pass) workbench dashboard views > fails closed for an unfinished analysis envelope on a failed partial [0.02ms]
(pass) workbench dashboard views > fails closed for an unfinished analysis envelope on a cancelled partial [0.03ms]
(pass) workbench dashboard views > preserves partial tags, surrounding text, and fenced tag examples [0.62ms]
(pass) workbench dashboard views > renders the live action and its Esc hint as separate rows [0.29ms]
(pass) workbench dashboard views > keeps activity emphasis on every wrapped row at narrow widths [0.38ms]
(pass) workbench dashboard views > advances the spinner and activity gradient on the configured timer [0.28ms]
(pass) workbench dashboard views > reuses Chat rows when only the activity spinner frame changes [0.17ms]
(pass) workbench dashboard views > stops activity motion when the selected execution run is terminal [0.07ms]
(pass) workbench dashboard views > shows interrupted runtime state without expanding receipt internals into Chat [0.12ms]
(pass) workbench dashboard views > keeps command receipt details in Tracer instead of expanding them into Chat [0.10ms]
(pass) workbench dashboard views > explains the selected run waiting reason and operator action [0.14ms]
(pass) workbench dashboard views > keeps the native final answer without attaching a second plan recap [0.15ms]
(pass) workbench dashboard views > keeps the native final answer when Native Plan is absent [28.59ms]
(pass) workbench dashboard views > keeps an answer-only Native turn unchanged [0.20ms]
(pass) workbench dashboard views > does not claim a completion recap before the same Native turn completes [0.28ms]
(pass) workbench dashboard views > never promotes a completed child-thread plan into the root completion recap [0.51ms]
(pass) workbench dashboard views > does not revive an older turn when the latest turn is still preparing its plan [1.74ms]
(pass) workbench dashboard views > keeps plan-only steps out of Chat while showing compact observation work [1.85ms]
(pass) workbench dashboard views > shows the public Native plan while adding only its executing step card [1.65ms]
(pass) workbench dashboard views > renders model-interpreted what and why on the shared Step card [0.71ms]
(pass) workbench dashboard views > hides empty Todo and T-note counters [0.07ms]
(pass) workbench dashboard views > keeps active goal, progress, queue, Todo, and source details out of T-notes [0.05ms]
(pass) workbench dashboard views > bounds append-only T-notes while preserving omission and visible-count evidence [1.30ms]
(pass) workbench dashboard views > renders Todo status icons and hanging wraps inside the pane width [0.29ms]
(pass) workbench dashboard views > hides lifecycle progress payloads from Chat cards [0.62ms]
(pass) workbench dashboard views > shows only a content-free state while native reasoning is streaming [0.21ms]
(pass) workbench dashboard views > shows only the App Server public reasoning summary text [0.12ms]
(pass) workbench dashboard views > explains a pending approval and tells the user how to respond [0.47ms]
(pass) workbench dashboard views > renders authoritative approval background states and compact queued delivery [1.44ms]
(pass) workbench dashboard views > shows persisted completed-question records after active work without source payloads [0.18ms]
(pass) workbench dashboard views > renders a completed native command as a bounded public step card [1.38ms]
(pass) workbench dashboard views > keeps an unplanned command as a detailed Bash action instead of a generic sentence [0.57ms]
(pass) workbench dashboard views > keeps every planned action once and labels intermediate actions with their parent step [1.24ms]
(pass) workbench dashboard views > keeps a native command output delta on the same running step [0.99ms]
(pass) workbench dashboard views > keeps completed command observations out of Native-plan step numbering [1.46ms]
(pass) workbench dashboard views > shows follow-up inputs immediately as ordinary user messages [0.20ms]
(pass) workbench dashboard views > keeps an uncertain delivery warning and its recovery command visible [0.18ms]
(pass) workbench dashboard views > omits the /cancel recovery line for a failure it cannot reconcile [0.08ms]
(pass) workbench dashboard views > shows the failed delivery state on an outbound user bubble [0.07ms]
(pass) workbench dashboard views > shows the streaming delivery state on an outbound user bubble [0.03ms]
(pass) workbench dashboard views > renders the first outbound user message before native thread activity exists [0.07ms]
(pass) workbench dashboard views > uses the public MCP item status, arguments, and error without exposing reasoning [0.53ms]
(pass) workbench dashboard views > preserves completed Markdown while bounding only the live draft [1.20ms]
(pass) workbench dashboard views > keeps a structured native answer in its original Markdown order [1.08ms]
(pass) workbench dashboard views > keeps the full current native session transcript visible [5.16ms]
(pass) workbench dashboard views > leaves the resting status line blank instead of advertising commands [0.16ms]
(pass) workbench dashboard views > keeps immutable action results out of completed-question notes [0.09ms]
(pass) workbench dashboard views > keeps selected activity payloads out of completed-question notes [0.08ms]
(pass) workbench dashboard views > bounds public Source strings and total projection before JSON rendering [3.11ms]
(pass) workbench dashboard views > bounds large work-step output without leaking edge credentials [5.22ms]
(pass) workbench dashboard views > bounds action result body by characters and lines before rendering Source [0.84ms]
(pass) workbench dashboard views > keeps titleless Chat, T-notes, and Todo content reachable at 120x30 [4.49ms]
(pass) workbench dashboard views > keeps titleless Chat, T-notes, and Todo content reachable at 70x24 [1.87ms]
(pass) workbench dashboard views > keeps an incomplete answer reachable through the full TUI layout at 40 columns [1.56ms]
(pass) workbench dashboard views > keeps an incomplete answer reachable through the full TUI layout at 80 columns [1.61ms]
(pass) workbench dashboard views > keeps an incomplete answer reachable through the full TUI layout at 120 columns [2.15ms]
(pass) workbench dashboard views > keeps following the newest user message when repeated delivery states extend Chat [4.51ms]
(pass) workbench dashboard views > does not restore chat auto-follow while wheel scrolling concurrent streaming output [8.62ms]
(pass) renders a local workflow result even before a Native conversation exists [0.13ms]

test/observability-history-source.test.ts:
(pass) observability history source > reads existing JSONL streams without treating partial records as facts [1.14ms]
(pass) observability history source > bounds discovered streams and reports unknown for an absent directory [0.61ms]
(pass) observability history source > discovers thread journals nested under workbench directories [0.57ms]

test/traceability-v3.test.ts:
(pass) receipt-scoped registry authority > does not make an unrelated spec retroactively required [1.62ms]
(pass) receipt-scoped registry authority > rejects traversal, symlink escape, digest tamper, and envelope identity mismatch [1.96ms]
(pass) runtime receipt journal authentication > selects the exact receipt from a multi-turn ProjectActivity JSONL journal [1.02ms]
(pass) runtime receipt journal authentication > authenticates a fixed pre-v2 Plan plus command receipt without rewriting its historical meaning [0.42ms]
(pass) runtime receipt journal authentication > authenticates observed command results and rejects edited command output [0.49ms]
(pass) runtime receipt journal authentication > rejects replay tampering, global sequence gaps, and receipt checkpoint tampering [0.29ms]
(pass) traceability v3 SQLite projection > rebuilds identical logical and row digests after deleting SQLite [62.12ms]
(pass) traceability v3 SQLite projection > projects current receipts from aligned source digests and deterministic coverage [41.07ms]
(pass) traceability v3 SQLite projection > projects a contained runtime receipt through the production CLI into validated evidence and store queries [105.95ms]

test/artifact-publication-capability.test.ts:
(pass) approved Artifact uses GET/PATCH/GET and returns an identity-bound, secret-free receipt [1.84ms]
(pass) different permit, unsupported target and before-state drift cannot issue a PATCH [0.25ms]
(pass) lost publication response is recovered by GET only; candidate substitution is denied [0.32ms]
(pass) Linear publication uses the pinned UUID, checks project identity and never creates an issue [0.82ms]
(pass) Obsidian publishes a complete canonical artifact with read-back and rejects traversal/symlinks [5.07ms]

test/todos-domain.test.ts:
(pass) todo domain > round trips Native input, Plan revision, item identity, and observed execution references [0.53ms]
(pass) todo domain > reads reference-free legacy Markdown as unknown without changing its bytes [0.44ms]
(pass) todo domain > round trips strict markdown with visible status prefixes [0.09ms]
(pass) todo domain > patches managed CRLF ranges without changing unknown Markdown [0.16ms]
(pass) todo domain > preserves each unowned Markdown line ending in a mixed LF and CRLF document [0.17ms]
(pass) todo domain > reports progress and rejects a second active item [0.08ms]
(pass) todo domain > strips controls and redacts credential material before display [0.04ms]
(pass) todo domain > removes terminal and HTML-comment injection while preserving round trips [0.04ms]
(pass) todo domain > round trips content that begins with visible status words [0.05ms]
(pass) todo domain > fails closed for malformed metadata, unknown versions, duplicate ids, and invalid states [0.34ms]
(pass) todo domain > normalizes legacy flat documents and rejects orphan, nested, and invalid detail states [0.17ms]

test/trace-store.test.ts:
(pass) session Tracer.md projection > projects the canonical journal in sequence order with exact Source addresses [0.11ms]
(pass) session Tracer.md projection > atomically replaces the session projection [0.93ms]

test/dashboard-panel-system.test.ts:
(pass) Workbench panel system > keeps the Todo and Tracer information hierarchy stable across widths [0.05ms]

test/workbench-tracer-view.test.ts:
(pass) WorkbenchTracerView execution surface > keeps a no-plan performance execution visible [0.19ms]
(pass) WorkbenchTracerView execution surface > shows an explicit assigned goal beside its no-plan execution [0.04ms]
(pass) WorkbenchTracerView execution surface > renders observed health counters without inventing orphan-blocked state [0.06ms]
(pass) WorkbenchTracerView execution surface > labels retry and orphan health as unconfirmed when no performance projection exists [0.04ms]
(pass) WorkbenchTracerView execution surface > states that completion evidence remains unverified [0.03ms]
(pass) WorkbenchTracerView execution surface > aggregates delegation across turns and renders the selected exact detail [0.60ms]

test/activity-journal-store.test.ts:
(pass) ActivityJournalStore > appends monotonic project observations and deduplicates a repeated native terminal observation [3.01ms]
(pass) ActivityJournalStore > discards only an unterminated final crash residue and rejects middle corruption or sequence gaps [1.69ms]
(pass) ActivityJournalStore > shares one monotonic append stream across store instances for the same journal [6.82ms]
(pass) ActivityJournalStore > does not re-read and parse the complete journal on every append [35.47ms]
(pass) ActivityJournalStore > replays a native-thread stream in a fresh store and still rejects a durable sequence gap [1.04ms]

test/native-thread-picker.test.ts:
(pass) native thread resume picker > shows project threads and returns the selected native id [2.43ms]

test/development-cli.test.ts:
(pass) CLI binds existing Linear UUID and TUI captures only after binding, then exports and opens the same document [69.83ms]
(pass) capture errors stay observable and unrelated slash commands remain untouched [0.21ms]
(pass) CLI preserves test argv help/version and shell metacharacters without top-level reinterpretation [0.62ms]
(pass) completion freezes a checkpoint before later events and binding switches [38.70ms]

test/obsidian-traceability.test.ts:
(pass) Obsidian authoring source traceability > documents the explicit Vault root required by rebuild and drift [0.13ms]
(pass) Obsidian authoring source traceability > previews legacy replacement and a missing WOO-674 note before digest-bound apply [27.39ms]
(pass) Obsidian authoring source traceability > projects declared Properties through immutable registries and blocks missing IDs [6.19ms]
(pass) Obsidian authoring source traceability > requires exactly one canonical detailed note for selected Linear issues [6.49ms]
(pass) Obsidian authoring source traceability > orders canonical note UUIDs with SQLite binary collation [4.14ms]
(pass) Obsidian authoring source traceability > uses schema v2 document IDs for full and scoped Vault export coverage [2.17ms]
(pass) Obsidian authoring source traceability > keeps every Pilot registry immutable and digest-valid, including body-grounded gaps [1.10ms]
(pass) Obsidian authoring source traceability > detects rename/content drift and stale Linear Obsidian URIs by stable document_id [3.06ms]
(pass) Obsidian authoring source traceability > blocks duplicate document IDs and missing related wiki targets [3.25ms]
(pass) Obsidian authoring source traceability > rebuilds the disposable SQLite note projection with identical digests after deletion [38.96ms]

test/development-vault.test.ts:
(pass) development Vault > durable readback, retry and rename preserve document identity; edits and copies conflict [3.62ms]
(pass) development Vault > same request ID cannot silently export different source records [1.61ms]
(pass) replay validates forged done receipts and the existing exported document [4.69ms]
(pass) blocked export can retry after the filesystem obstruction is removed [2.12ms]

test/activity-narrator.test.ts:
(pass) PiActivityNarrator > uses the smallest Codex model with no tools and a bounded structured result [0.66ms]
(pass) PiActivityNarrator > rejects malformed output instead of inventing a narration [0.13ms]

test/observability-views.test.ts:
(pass) observability views > renders aggregate dashboard hierarchy without inventing trend [0.68ms]
(pass) observability views > renders live current state and indeterminate tool elapsed [0.43ms]
(pass) observability views > marks empty projection unknown instead of inventing idle zeroes [0.27ms]
(pass) observability views > keeps current state, request, tool, and coverage visible at 40 columns [0.21ms]
(pass) observability views > renders a bounded Skill Run projection [0.28ms]
(pass) observability views > renders the observed completed terminal state [0.13ms]
(pass) observability views > renders the observed failed terminal state [0.19ms]
(pass) observability views > keeps all responsive rows bounded [10.83ms]

test/transcript-markdown.test.ts:
(pass) TranscriptView Markdown > left-aligns role labels and message bodies at the conversation edge [0.45ms]
(pass) TranscriptView Markdown > syntax-highlights completed fenced code [11.57ms]
(pass) TranscriptView Markdown > keeps partial streaming code colored and width-safe [0.40ms]
(pass) TranscriptView Markdown > labels a persisted partial assistant response as cancelled [0.10ms]
(pass) TranscriptView Markdown > renders actual tool observations as boxed transcript items [0.62ms]
(pass) TranscriptView Markdown > renders truthful work narration before the corresponding tool card [0.24ms]
(pass) TranscriptView Markdown > reuses stable transcript rows across scroll frames and invalidates on observation changes [0.24ms]
(pass) TranscriptView Markdown > bounds stable transcript caches to two width variants [0.05ms]
(pass) TranscriptView Markdown > keeps a long unchanged transcript on one cached row projection [19.28ms]

test/completed-turn-note-scope.test.ts:
(pass) completed turn note scope > selects one completed turn and excludes interleaved foreign-thread activity [2.03ms]
(pass) completed turn note scope > rejects incomplete, cross-turn, reversed, and non-owning question scopes [0.10ms]
(pass) completed turn note scope > latest chooses the most recent valid completion [0.05ms]
(pass) completed turn note scope > finds the owning question despite a foreign outbound question and repeated item id [0.07ms]
(pass) completed turn note scope > exact-selection accepts only the complete ordered source set [0.06ms]
(pass) completed turn note scope > normalizes, redacts, and bounds the question without mutating its activity [0.57ms]

test/tui-feature-registry.test.ts:
(pass) TUI feature Unit catalog > contains the 16 features and exact 35 inventoried Units [0.06ms]
(pass) TUI feature Unit catalog > keeps Unit IDs unique and attached to the declared parent feature [0.09ms]
(pass) TUI feature Unit catalog > numbers each feature from U01 without gaps and preserves the inventory counts [0.08ms]
(pass) TUI feature Unit catalog > never reuses an ID reserved by a retired Unit [0.03ms]

test/native-event-projection.test.ts:
(pass) native event projection > redacts completed reasoning while retaining only a bounded public summary [0.19ms]
(pass) native event projection > bounds and sanitizes oversized nested Native evidence [0.18ms]
(pass) native event projection > maps nested turn completion status {"status":"completed"} to completed [0.03ms]
(pass) native event projection > maps nested turn completion status {"status":{"type":"failed"}} to failed
(pass) native event projection > maps nested turn completion status {"status":{"type":"cancelled"}} to cancelled
(pass) native event projection > classifies userMessage assistant ownership conservatively [0.03ms]
(pass) native event projection > classifies alienMessage assistant ownership conservatively
(pass) native event projection > classifies agentMessage assistant ownership conservatively
(pass) native event projection > projects item/agentMessage/delta through the delta channel matrix [0.03ms]
(pass) native event projection > projects item/reasoning/textDelta through the delta channel matrix
(pass) native event projection > projects item/reasoning/summaryTextDelta through the delta channel matrix
(pass) native event projection > projects item/commandExecution/outputDelta through the delta channel matrix
(pass) native event projection > exposes Native turn lifecycle independently for restored activities [0.01ms]

test/work-traceability.test.ts:
(pass) work traceability > queries Linear, code, test, and evidence in both directions without merging identifiers [0.35ms]
(pass) work traceability > rejects duplicate, dangling, conflated, and malformed references [0.23ms]
(pass) work traceability > rejects links whose endpoints violate the relation contract [0.13ms]
(pass) work traceability > keeps source and test issue annotations connected to registered Linear identities [46.97ms]
(pass) work traceability > requires knowledge bridge issues to annotate linked production code and regression tests [5.92ms]
(pass) work traceability > validates the real Chat issue mappings offline without inventing legacy planning ownership [28.46ms]

test/context-composer.test.ts:
(pass) ContextComposer Skill Registry > 검증된 registry revision과 각 Skill digest만 application context로 주입한다 [0.17ms]

test/astra-shell.test.ts:
(pass) production Astra shell routes navigation, rejection, approval and shutdown through existing contracts [2479.94ms]
(pass) Astra CLI keeps resume selection, cancellation and execution-lane semantics [0.48ms]
(pass) Mac Control+G navigation preserves drafts, routes every page, and leaves ordinary digits editable [1000.19ms]
(pass) the production layout keeps autocomplete selections and multiline rails visible at 80x24 [4829.12ms]

test/model-router.test.ts:
(pass) ModelRouter > the configured catalog resolves every selectable model [0.66ms]
(pass) ModelRouter > routes a stream with normalized reasoning and abort signal [0.23ms]
(pass) ModelRouter > fails before dispatch when the selected model is absent [0.08ms]
(pass) ModelRouter > reports whether provider authentication is configured [0.14ms]
(pass) ModelRouter > maps UI effort to SDK reasoning levels [0.03ms]

test/request-runtime-mode.test.ts:
(pass) RequestRuntimePolicy > off + goal=false -> off [0.03ms]
(pass) RequestRuntimePolicy > off + goal=true -> observe
(pass) RequestRuntimePolicy > observe + goal=false -> observe
(pass) RequestRuntimePolicy > observe + goal=true -> observe
(pass) RequestRuntimePolicy > broker + goal=false -> broker
(pass) RequestRuntimePolicy > broker + goal=true -> broker
(pass) RequestRuntimePolicy > resumed v1 sessions are not silently upgraded to protocol v2 [0.02ms]
(pass) RequestRuntimePolicy > capability authority and broker mode must be configured together [0.02ms]

test/syntax-highlighter.test.ts:
(pass) native syntax highlight plugin > colors supported Python tokens without changing terminal width [2.58ms]
(pass) native syntax highlight plugin > renders an unknown language safely [0.05ms]

test/exit-key-policy.test.ts:
(pass) ExitKeyPolicy > clears first and exits only on a second Ctrl+C inside 500ms [0.03ms]
(pass) ExitKeyPolicy > resets the exit gesture after its safety window [0.01ms]
(pass) ExitKeyPolicy > does not treat a backwards clock jump as a second press [0.03ms]
(pass) ExitKeyPolicy > aborts streaming first and exits on the second Ctrl+C [0.01ms]
(pass) ExitKeyPolicy > Ctrl+D exits only with an empty composer [0.02ms]
(pass) ExitKeyPolicy > resets a pending destructive gesture after a non-destructive overlay close [0.02ms]

test/obsidian-contract.test.ts:
(pass) Obsidian detailed-canonical schema v2 > accepts stable Properties, human-readable path, and the exact 14 sections plus Change Log [0.39ms]
(pass) Obsidian detailed-canonical schema v2 > blocks invalid IDs, inline relationship text, section drift, and machine-oriented filenames [0.13ms]
(pass) Obsidian detailed-canonical schema v2 > blocks every Linear identifier from the H1 even when it differs from the linked issue [0.06ms]
(pass) Obsidian detailed-canonical schema v2 > blocks IDs, numeric prefixes, and bracket labels from human-readable titles [0.17ms]
(pass) Obsidian detailed-canonical schema v2 > blocks incomplete markers only for active contracts without treating the Todo feature name as TODO work [0.48ms]
(pass) Obsidian vault drift and exact-digest sync > previews a canonical rename and applies only the exact unchanged digest [5.13ms]
(pass) Obsidian vault drift and exact-digest sync > rejects changed sources and an approval for a different preview [2.08ms]
(pass) Obsidian vault drift and exact-digest sync > preflights every target before moving the first document [3.33ms]
(pass) Obsidian vault drift and exact-digest sync > tracks a stable document across rename and content changes [2.96ms]
(pass) Obsidian vault drift and exact-digest sync > blocks duplicate identity and broken wiki-links before filesystem mutation [4.47ms]
(pass) Obsidian vault drift and exact-digest sync > exposes fixture-safe check and preview CLI commands [1.95ms]
$ bun src/adapters/outbound/development/obsidian-contract-cli.ts check --vault "/var/folders/mg/06v1fkqx341gsjxv_l0l3kcw0000gp/T/obsidian-contract-VJT2Ji"
$ bun src/adapters/outbound/development/obsidian-contract-cli.ts preview --vault "/var/folders/mg/06v1fkqx341gsjxv_l0l3kcw0000gp/T/obsidian-contract-POd0iW" --out "/var/folders/mg/06v1fkqx341gsjxv_l0l3kcw0000gp/T/obsidian-contract-POd0iW/preview.json"
$ bun src/adapters/outbound/development/obsidian-contract-cli.ts apply --vault "/var/folders/mg/06v1fkqx341gsjxv_l0l3kcw0000gp/T/obsidian-contract-POd0iW" --preview "/var/folders/mg/06v1fkqx341gsjxv_l0l3kcw0000gp/T/obsidian-contract-POd0iW/preview.json" --digest "916f7a01b8f9543870772322a6e7a0923f952696b2ec8ce18230aa37e0b51632"
(pass) Obsidian vault drift and exact-digest sync > accepts the documented bun run check and sync preview command shapes [141.87ms]
(pass) Obsidian vault drift and exact-digest sync > ignores ordinary vault notes under a configured root while validating every canonical marker candidate [3.19ms]
(pass) Obsidian vault drift and exact-digest sync > recognizes quoted YAML markers and rejects missing CLI option values [0.93ms]
(pass) Obsidian vault drift and exact-digest sync > requires explicit Linear identities whenever a CLI inspection is scoped [1.00ms]
(pass) Obsidian vault drift and exact-digest sync > keeps canonical targets inside a spec root that differs from the domain [1.22ms]
(pass) Obsidian vault drift and exact-digest sync > reports malformed YAML when the raw document declares the canonical marker [1.27ms]
(pass) Obsidian vault drift and exact-digest sync > does not promote a normal note when canonical marker text appears only in the body [0.72ms]

test/execution-run.test.ts:
(pass) ExecutionRun reducer > keeps approval waiting through write-ahead and uncertain audit observations [1.04ms]
(pass) ExecutionRun reducer > reduces normal durable evidence deterministically into a structured receipt [1.44ms]
(pass) ExecutionRun reducer > creates failed, cancelled, and interrupted receipts only from terminal evidence [0.48ms]
(pass) ExecutionRun reducer > keeps a failed tool as recoverable evidence until an authoritative turn terminal [0.37ms]
(pass) ExecutionRun reducer > does not invent verification from text-only durable observations [0.27ms]
(pass) ExecutionRun reducer > preserves explicit skipped verification instead of promoting its completed activity phase [0.28ms]
(pass) ExecutionRun reducer > treats completed verification without an explicit outcome or exit code as unknown [0.26ms]
(pass) ExecutionRun reducer > accepts a run's observations across unrelated global journal sequence values [0.14ms]
(pass) ExecutionRun reducer > ignores duplicates and late events after terminal [0.16ms]
(pass) ExecutionRun reducer > enters reconciling on a durable gap and never manufactures a receipt [0.34ms]
(pass) ExecutionRun reducer > uses dplan-v1 identity and association across reorder, insert, and delete [1.89ms]
(pass) ExecutionRun reducer > keeps duplicate running Plan association unowned and requires complete journal context [0.70ms]
(pass) ExecutionRun reducer > uses the global journal prefix across foreign root turns and excludes public Plan documents [0.61ms]
(pass) ExecutionRun reducer > keeps v2 replay byte-stable while live receipts use algorithmVersion 3 [0.87ms]

test/astra-ui.test.ts:
(pass) Astra execution console > Request status uses bounded motion and settles after completion [0.17ms]
(pass) Astra execution console > Now names the actual live activity instead of repeating the current Todo [0.35ms]
(pass) Astra execution console > the progress highlight moves without implying a percentage, and stops for approval [1.37ms]
(pass) Astra execution console > durations use whole h m s units without milliseconds [0.05ms]
(pass) Astra execution console > the actual editor keeps its text coordinates and bottom boundary on focus changes [0.66ms]
(pass) Astra execution console > running Bash shows bounded live output; finished commands fold and failed output stays open [0.45ms]
(pass) Astra execution console > scrolled multiline drafts retain focus rails, hidden-line counts and autocomplete coordinates [1.57ms]
(pass) Astra execution console > Context quota details reject non-finite percentages and clamp out-of-range values [1.05ms]
(pass) Astra execution console > HUD and Context never expose invalid percentages: %s [0.76ms]
(pass) Astra execution console > HUD and Context never expose invalid percentages: %s [0.48ms]
(pass) Astra execution console > HUD and Context never expose invalid percentages: %s [0.49ms]
(pass) Astra execution console > HUD and Context never expose invalid percentages: %s [0.45ms]
(pass) Astra execution console > quota remains readable at 80 columns, with stale and missing values distinguished [0.55ms]
(pass) Astra execution console > role headings and every provider have stable, distinct visual identities [1.65ms]
(pass) Astra execution console > native-plan Todo does not repeat the visible Plan, while manual Todo remains [0.66ms]
(pass) Astra execution console > all screen shortcuts work as a prefix sequence without function keys [0.08ms]
(pass) Astra execution console > question summaries live inside ZChat rather than a separate slash screen [0.81ms]
(pass) Astra execution console > native startup telemetry does not leave an empty execution screen [0.17ms]
(pass) Astra execution console > long Linear metadata stays in Context instead of taking over the idle execution viewport [1.20ms]
(pass) Astra execution console > keeps execution and controls readable at 80×24 [5.63ms]
(pass) Astra execution console > keeps execution and controls readable at 112×32 [4.14ms]
(pass) Astra execution console > keeps execution and controls readable at 160×48 [5.21ms]
(pass) Astra execution console > keeps execution and controls readable at 60×18 [2.19ms]
(pass) Astra execution console > keeps execution and controls readable at 80×10 [1.52ms]
(pass) Astra execution console > keeps newlines, code, draft and the latest tool visible without raw reasoning [1.75ms]
(pass) Astra execution console > preserves reading position across streaming and resize, then follows on End [17.01ms]
(pass) Astra execution console > durable messages require activity order while optimistic user delivery remains visible [1.06ms]
(pass) Astra execution console > approval outranks running state, and no unobserved metric becomes zero [1.05ms]
(pass) Astra execution console > a completed command with nonzero exit remains a visible failure even when output is collapsed [0.41ms]
(pass) Astra execution console > searching commands does not execute them and includes retained workflows [0.14ms]
(pass) Astra execution console > a small colourless palette follows the selected command rather than the search prompt [2.10ms]
(pass) Astra execution console > Astra resume selection uses its own presentation without changing selected Native identity [0.40ms]
(pass) Astra execution console > long approval sheets expose choices through paging without deciding on Escape [3.67ms]
(pass) Astra execution console > moving approval selection reveals the action without hiding details on initial open [0.96ms]
(pass) Astra execution console > pinned controls never skip candidate lines during paging [0.75ms]
(pass) Astra execution console > an active auth prompt is revealed without preventing manual paging back to its explanation [0.18ms]
(pass) Astra execution console > one turn finishing never claims the long-term goal is complete [0.71ms]
(pass) Astra execution console > an accepted but unloaded source keeps its exact identity instead of reporting no selection [0.49ms]
(pass) Astra execution console > history keeps every keyboard selection in the first 11 lines at 80×24 [4.26ms]
(pass) Astra execution console > source renderer keeps exact identity and filters secret envelopes [0.78ms]

test/session-model-usage.test.ts:
(pass) SessionModelUsageAccumulator > aggregates detached model calls and publishes immutable session snapshots [2.14ms]
(pass) SessionModelUsageAccumulator > rejects invalid observations rather than guessing token usage [0.08ms]

test/project-activity-artifact-control.test.ts:
(pass) Project Activity Artifact 경로 > Comment를 고정 다섯 항목으로 렌더한다 [0.77ms]
(pass) Project Activity Artifact 경로 > Update는 버전과 직전 Comment ID를 요구한다 [0.31ms]
(pass) Project Activity Artifact 경로 > Comment 유형과 상태를 제한해 자유 본문 우회를 막는다 [0.07ms]
(pass) Project Activity Artifact 경로 > 현재 Project Activity의 직전 identity를 Candidate에 고정한다 [0.05ms]
(pass) Project Activity Artifact 경로 > 새 Comment를 변경·영향·분류·검증·연결로 렌더한다 [0.11ms]

test/codex-app-server.test.ts:
(pass) CodexAppServer > registers host tools and replies to dynamic calls once without admitting changed duplicate arguments [13.33ms]
(pass) CodexAppServer > uses the native MCP status protocol and projects runtime status and tool names [0.32ms]
(pass) CodexAppServer > projects MCP tool elicitations as approvals and answers with the elicitation protocol [0.38ms]
(pass) CodexAppServer > uses protocol-defined decisions when file-change approval params omit availableDecisions [0.14ms]
(pass) CodexAppServer > preserves a structured v2 command approval decision and returns it unchanged [0.27ms]
(pass) CodexAppServer > writes escaped MCP enablement config and reloads through supported protocol methods [0.20ms]
(pass) CodexAppServer > starts provider-owned thread compaction through the App Server protocol [0.08ms]
(pass) CodexAppServer > calls an addressed MCP tool through the documented App Server boundary [0.14ms]
(pass) CodexAppServer > performs the JSONL handshake and preserves native thread, turn, item, and approval ids [1.02ms]
(pass) CodexAppServer > marks a sent mutating request uncertain without retrying it after disconnect [0.17ms]
(pass) CodexAppServer > binds threadless plan updates only to their observed root or child turn owners [0.27ms]
(pass) CodexAppServer > includes a bounded sanitized stderr tail when the App Server process exits [15.02ms]
(pass) CodexAppServer > fails a stalled turn start as uncertain instead of waiting forever [11.00ms]

test/model-picker-overlay.test.ts:
(pass) ModelPickerOverlay hierarchy > starts at provider and contains no search field [0.95ms]
(pass) ModelPickerOverlay hierarchy > limits provider rows and auth lookups to the configured subset [0.43ms]
(pass) ModelPickerOverlay hierarchy > starts at model and applies without exposing the single provider step [0.52ms]
(pass) ModelPickerOverlay hierarchy > backs out of the model step when provider selection was intentionally skipped [0.04ms]
(pass) ModelPickerOverlay hierarchy > walks provider to model to effort and applies only at confirmation [0.52ms]
(pass) ModelPickerOverlay hierarchy > moves backward one hierarchy level without losing staged values [0.31ms]
(pass) ModelPickerOverlay hierarchy > hands an unauthenticated staged selection to the caller only at confirmation [0.08ms]
(pass) ModelPickerOverlay hierarchy > keeps confirmation visible when apply fails [0.32ms]
(pass) ModelPickerOverlay hierarchy > does not let Esc disguise an in-flight apply as cancellation [0.09ms]
(pass) ModelPickerOverlay hierarchy > shows auth lookup errors and blocks final apply [0.33ms]
(pass) ModelPickerOverlay hierarchy > restores a staged selection after auth without changing the current header [0.13ms]
(pass) ModelPickerOverlay hierarchy > Esc discards every hierarchy level and all lines fit 40 columns [0.17ms]

test/chat-scroll-acceptance.test.ts:
(pass) chat scroll acceptance > retains the older reading anchor and disabled follow across 120, 80, and 40 columns while streaming [8.28ms]
(pass) chat scroll acceptance > restores follow when the reader returns to latest before changing width [5.07ms]

test/review-service.test.ts:
(pass) external review boundary > redacts paths, credentials, and customer identifiers before making an immutable preview [0.38ms]
(pass) external review boundary > keeps generic numbers but redacts separated and phone-labelled telephone numbers [0.05ms]
(pass) external review boundary > requires the exact reviewed digest and sends only a constrained packet to Claude Opus [1.33ms]
(pass) external review boundary > factory isolates anthropic and google review adapters from the chat router [0.26ms]
(pass) external review boundary > Pi production bridge uses a fresh tool-free packet-only context and rejects tool output [0.30ms]
(pass) external review boundary > Claude CLI transport runs one bounded packet-only print request in a blank temporary cwd and records observed evidence [0.69ms]
(pass) external review boundary > Claude CLI classifies terminal failures and never retries an ambiguous packet [0.45ms]
(pass) external review boundary > Provider API remains explicitly labelled as the selected fallback transport [0.07ms]
(pass) external review boundary > production selection uses Claude CLI with its observed version; Provider API is not a retry path [0.13ms]
(pass) external review boundary > production Claude CLI probing is lazy and an unavailable CLI fails without Provider API fallback [0.09ms]
(pass) external review boundary > system Claude runner caps streamed output before process completion and kills its process group [0.36ms]
(pass) external review boundary > system Claude runner times out by terminating and reaping the entire process group [0.10ms]

test/release-gate.test.ts:
(pass) release gate hygiene > blocks an untracked test.skip fixture [73.63ms]
(pass) release gate hygiene > blocks a hygiene violation in the latest commit [130.57ms]
(pass) release gate hygiene > scans the initial commit when no parent is available [69.37ms]
(pass) release gate hygiene > scans tracked files at a shallow history boundary [136.00ms]

test/astra-model.test.ts:
(pass) Astra model selections survive YAML reload without changing workload defaults [5.72ms]
(pass) the picker applies Astra max explicitly and keeps Ultra distinct [0.42ms]
(pass) actual argument completion retains model identity for every native effort [0.37ms]
(pass) Native capabilities stay separate from compatibility effort settings and null defaults [0.53ms]
(pass) a small model sheet reveals the current effort immediately after advancing [0.42ms]
(pass) Workbench passes Astra xhigh to Native without aliasing or changing a running model [1.75ms]
(pass) Workbench passes Astra max to Native without aliasing or changing a running model [0.59ms]
(pass) Workbench passes Astra ultra to Native without aliasing or changing a running model [0.51ms]

test/workbench-config.test.ts:
(pass) Workbench YAML configuration > normalizes supported execution policy and rejects unsafe values to defaults [0.16ms]
(pass) Workbench YAML configuration > loads project YAML and falls back safely when it is absent or malformed [1.32ms]
(pass) Workbench YAML configuration > persists a validated model selection atomically in project YAML [1.16ms]
(pass) Workbench YAML configuration > loads every live project policy section from the checked-in Workbench YAML [0.48ms]

test/project-workspace.test.ts:
(pass) FileProjectWorkspace > uses the Git root when opened from a subdirectory [19.10ms]
(pass) FileProjectWorkspace > uses the real cwd as root outside Git [9.40ms]
(pass) FileProjectWorkspace > is idempotent and preserves a valid manifest [12.79ms]
(pass) FileProjectWorkspace > fails closed for malformed or unsupported manifests [26.39ms]
(pass) FileProjectWorkspace > creates private local directories and only ignores local workspace state [7.79ms]
(pass) FileProjectWorkspace > adds new managed ignores without removing project-specific entries [13.13ms]
(pass) FileProjectWorkspace > keeps the canonical vault Todo visible to Git [37.93ms]
(pass) FileProjectWorkspace > rejects workspace symlinks instead of escaping the project root [5.98ms]
(pass) FileProjectWorkspace > holds one session writer lease and releases it deterministically [8.30ms]
(pass) FileProjectWorkspace > reclaims a lease only after confirming its owner process is dead [7.42ms]

test/development-map.test.ts:
(pass) development map > projects explicit initiative, epic, and story relations without inferring acceptance [3.02ms]
(pass) development map > surfaces unavailable and invalid sources instead of a normal empty snapshot [0.84ms]
(pass) development map > keeps the last valid projection stale during a failed poll without overlapping refreshes [32.10ms]
(pass) development map > starts map polling only while map is open and stops idempotently [0.06ms]
(pass) development map > sanitizes and bounds file-derived terminal text [0.34ms]
(pass) development map > notifies an open map when its planning revision changes [32.19ms]
(pass) development map > marks malformed catalog relations invalid and renders every aggregate as unknown [1.02ms]
(pass) development map > marks malformed Initiative identity and unknown Epic references invalid [4.40ms]

test/local-unit-registry.test.ts:
(pass) local Code-ID registry > validates code owners and projects Linear links into SQLite [24.70ms]
(pass) local Code-ID registry > rejects missing symbols and unknown Linear issues before writing [2.24ms]
(pass) local Code-ID registry > normalizes unordered links and members into a stable projection [11.85ms]

test/development-code-scanner.test.ts:
(pass) annotation scanner ignores strings and keeps declarations separate without inferring edges [22.39ms]

test/redaction.test.ts:
(pass) assistant response envelope projection > keeps completed response compatibility for an unfinished envelope [0.02ms]
(pass) assistant response envelope projection > fails closed when a partial response ends inside a private envelope [0.05ms]
(pass) assistant response envelope projection > keeps ordinary Markdown and fenced tag examples unchanged for partial responses [0.03ms]

test/left-dashboard.test.ts:
(pass) WWW left welcome > keeps product identity and live pills within 40 columns [0.45ms]
(pass) WWW left welcome > keeps product identity and live pills within 100 columns [0.23ms]
(pass) WWW left welcome > gradient styling preserves landmark cell width [0.05ms]

test/session-monitor.test.ts:
(pass) SessionMonitor > aggregates initial, streaming, and completed session state without raw content [0.44ms]
(pass) SessionMonitor > projects Todo progress and isolates broken listeners [0.11ms]
(pass) SessionMonitor > stops receiving runtime and Todo updates after disposal [0.05ms]

test/terminal-command-executor.test.ts:
(pass) LocalTerminalCommandExecutor > captures stdout, stderr, exit status, and shell pipes [26.06ms]
(pass) LocalTerminalCommandExecutor > uses a restricted environment [17.59ms]
(pass) LocalTerminalCommandExecutor > redacts credentials across output chunks and strips terminal controls [30.56ms]
(pass) LocalTerminalCommandExecutor > keeps a bounded tail with an omission marker [20.75ms]
(pass) LocalTerminalCommandExecutor > terminates on abort [12.68ms]
(pass) LocalTerminalCommandExecutor > terminates on timeout [12.97ms]
(pass) LocalTerminalCommandExecutor > rejects unsafe or non-directory working directories before execution [0.76ms]

test/canonical-promotion.test.ts:
(pass) human-gated canonical promotion > uses the ignored per-document temporary-file convention [0.16ms]
(pass) human-gated canonical promotion > accepts then atomically promotes an approved Todo draft without git operations [2.08ms]
(pass) human-gated canonical promotion > requires new approval when body, source, or target state becomes stale [1.84ms]
(pass) human-gated canonical promotion > uses a safe per-note allowlist target for T-note drafts [1.31ms]
(pass) human-gated canonical promotion > rejects path escape and symlink targets before reading or writing [0.85ms]

test/commit-governance.test.ts:
(pass) woo-commit contract > 99_www는 type과 scope를 metadata로 보존하고 한국어 결과 제목을 렌더링한다 [0.44ms]
(pass) woo-commit contract > 여러 경로는 body와 Candidate digest를 요구한다 [0.25ms]
(pass) woo-commit contract > blocking 검증 실패와 모호한 결과를 차단한다 [0.04ms]
(pass) woo-commit contract > Agent Hook이 직접 Git mutation을 차단하고 Woo Runtime은 허용한다 [15.14ms]
(pass) staged boundary > NFD/NFC로 보이는 같은 변경 경로는 Git 추적 경로 하나로 고정한다 [67.73ms]
(pass) staged boundary > 후보 경로의 unstaged hunk와 추가 staged 파일을 차단한다 [55.77ms]
(pass) staged boundary > 직접 commit을 막고 승인된 executor만 commit과 Receipt를 만든다 [1467.37ms]
(pass) staged boundary > 승인 뒤 후보 파일 내용이 바뀌면 stale로 차단한다 [87.35ms]
(pass) staged boundary > rename의 삭제·추가 경로를 Candidate부터 Receipt까지 동일하게 보존한다 [223.36ms]

test/agent-tools.test.ts:
(pass) project agent tools > reads UTF-8 files and bounded directory listings [2.04ms]
(pass) project agent tools > blocks traversal and symlink escapes [1.66ms]
(pass) project agent tools > searches literal and regex patterns and reports no matches [2.38ms]
(pass) project agent tools > runs only safe argv commands and preserves command observations [9.18ms]
(pass) project agent tools > fails closed for network SSH, git mutation, and shell syntax [1.37ms]
(pass) project agent tools > handles aborted commands and redacts terminal output [1.62ms]
(pass) project agent tools > blocks common project credential files from read and search [1.56ms]
(pass) project agent tools > keeps the project Todo ledger out of model read and search tools [4.19ms]
(pass) project agent tools > resolves SSH aliases without evaluating Match exec [0.64ms]
(pass) project agent tools > disables repository fsmonitor execution for read-only Git profiles [34.35ms]
(pass) project agent tools > accepts ignored reasons on every tool and routes one-level Todo detail writes [1.46ms]

test/execution-journal.test.ts:
(pass) ExecutionJournal > restores an authenticated v3 receipt and rejects replay tampering [0.86ms]
(pass) ExecutionJournal > bounds v3 replay context at the authenticated terminal source [0.13ms]
(pass) ExecutionJournal > does not let a future Plan revision alter an earlier replay event [0.06ms]
(pass) ExecutionJournal > authenticates fixed v2 and versionless receipts without rewriting bytes [0.21ms]
(pass) ExecutionJournal > rejects unsupported versions and versionless commandResults [0.05ms]

test/legacy-router-app.test.ts:
(pass) legacy Router composition > uses isolated Router settings and releases a failed shell handoff before resume [21.47ms]

test/local-workflow-verifier.test.ts:
(pass) same workflow independently verifies two projects and binds evidence to root and bytes [10.62ms]
(pass) missing local issue reference fails [4.90ms]
(pass) changed code invalidates previously checked subject [7.16ms]
(pass) zero units cannot pass [2.10ms]
(pass) missing inputs and missing symbol fail with reasons [4.27ms]
(pass) symlink escape and traversal are rejected [5.14ms]
(pass) change while validation awaits read-back is uncertain [4.43ms]
(pass) v2 ledger fallback works and adding preferred v3 invalidates the subject [7.98ms]
(pass) manifest and ledger symlinks are refused [6.65ms]
(pass) optional local note is scoped explicitly and its bytes invalidate the subject [14.26ms]

test/observability-dashboard.test.ts:
(pass) observability dashboard > is deterministic, aggregates only attributed usage, and bounds recent sessions [0.30ms]
(pass) observability dashboard > keeps incomplete boundaries and insufficient trend unavailable [0.04ms]
(pass) observability dashboard > does not manufacture session boundaries from partial activity [0.11ms]

test/planning-domain.test.ts:
(pass) Planning domain > redacts credentials and removes terminal or Markdown injection [0.19ms]
(pass) Planning domain > accepts backward same-Epic supersede and freezes the snapshot [0.10ms]
(pass) Planning domain > rejects missing parents, forward supersedes, and mismatched IDs [0.16ms]

test/approval-dispatch.test.ts:
(pass) dispatchApprovalResponse > awaits immutable preparation evidence before sending the exact signed response [0.34ms]
(pass) dispatchApprovalResponse > does not send when preparation persistence fails [0.10ms]
(pass) dispatchApprovalResponse > records a truthful uncertain delivery after a send rejection without spoofing authority [0.15ms]
(pass) dispatchApprovalResponse > treats delivery-audit failure as uncertain even after Native resolves before send returns [0.13ms]
(pass) dispatchApprovalResponse > blocks a resend after a send failure leaves delivery uncertain [0.23ms]
(pass) dispatchApprovalResponse > blocks every decision after a delivered response until Native resolution [0.22ms]
(pass) dispatchApprovalResponse > restores prepared and dispatched interlocks after restart until a resolved observation [0.27ms]
(pass) dispatchApprovalResponse > restores a prepared-only crash interlock but ignores request-less observations [0.07ms]
(pass) dispatchApprovalResponse > does not relock when dispatched audit follows an early Native resolution [0.20ms]
(pass) dispatchApprovalResponse > keeps terminal delivery observations distinct in the real journal deduplicator [1.64ms]
(pass) dispatchApprovalResponse > bounds raw transport errors through the evidence serializer [0.20ms]

test/router-service.test.ts:
(pass) RouterService > serializes durable writes before active-session publication [4.97ms]
(pass) RouterService > continues processing after a failed settings write [0.09ms]
(pass) RouterService > rolls durable settings back when active-session publication fails [0.08ms]
(pass) RouterService > synchronizes an external model selection so a later retry can succeed [0.10ms]
(pass) RouterService > moves an exact model to the sole authenticated Router [0.07ms]
(pass) RouterService > does not switch models or guess between unauthenticated Routers [0.04ms]

test/runtime-monitor.test.ts:
(pass) projectRuntimeMonitor > projects idle deterministically [0.09ms]
(pass) projectRuntimeMonitor > reports a model-only execution as running [0.24ms]
(pass) projectRuntimeMonitor > reports a running tool before execution [0.08ms]
(pass) projectRuntimeMonitor > reports pending approval as blocked [0.04ms]
(pass) projectRuntimeMonitor > counts retries [0.03ms]
(pass) projectRuntimeMonitor > failure overrides all other observable state [0.03ms]
(pass) projectRuntimeMonitor > reports completion after a completed turn [0.03ms]
(pass) projectRuntimeMonitor > does not revive an older unmatched request after the current snapshot becomes ready [0.05ms]
(pass) projectRuntimeMonitor > bounds a semantic event burst to its latest twelve events [0.10ms]
(pass) projectRuntimeMonitor > projects a Skill Run without exposing business payloads [0.05ms]

test/rpa-artifact-control.test.ts:
(pass) RPA Description Artifact 경로 > 공통 Candidate가 Project와 Task를 동일한 고정 엔진으로 렌더한다 [2.52ms]
(pass) RPA Description Artifact 경로 > 유효한 map이어도 다른 대상과 revision으로 게시할 수 없다 [0.33ms]
(pass) RPA Description Artifact 경로 > 프로필 추가 필드와 누락 Task를 거부해 자유 본문 우회를 막는다 [0.38ms]
(pass) RPA Description Artifact 경로 > map 변경은 승인 digest를 무효화하고 대상의 동시 변경은 stale로 판정한다 [0.39ms]
(pass) RPA Description Artifact 경로 > 잘못된 map은 게시 렌더에 도달하지 않는다 [0.13ms]

test/planning-service.test.ts:
(pass) PlanningService > publishes current immutable snapshots while isolating listener failures [0.28ms]

test/credential-store.test.ts:
(pass) file credential store > stores, reads, modifies, lists metadata, and deletes credentials [2.30ms]
(pass) file credential store > serializes concurrent modifications against the file [4.47ms]
(pass) file credential store > writes private directories and files atomically [0.72ms]
(pass) file credential store > rejects corrupt credential files [0.57ms]
(pass) file credential store > rejects operations with an already aborted signal [0.29ms]

test/workbench-telemetry.test.ts:
(pass) workbench telemetry rail > renders only Git state and project path; Context belongs to the usage strip [0.13ms]
(pass) workbench telemetry rail > uses explicit unknown markers before Git arrives [0.03ms]
(pass) workbench telemetry rail > normalizes an unborn Git branch without exposing the porcelain sentence [0.10ms]

test/native-model-catalog.test.ts:
(pass) Native catalog follows all pages, filters hidden entries and uses host efforts instead of hardcoded capabilities [0.35ms]
(pass) Native catalog rejects empty instead of claiming a successful refresh [0.10ms]
(pass) Native catalog rejects malformed instead of claiming a successful refresh [0.03ms]
(pass) Native catalog rejects cycle instead of claiming a successful refresh [0.03ms]
(pass) Native catalog rejects unknown-effort instead of claiming a successful refresh [0.10ms]
(pass) an unresponsive model endpoint times out without poisoning other Native requests [15.54ms]
(pass) Workbench automatically loads and refreshes its session catalog, retaining the last good list on failure [0.62ms]
(pass) first discovery failure uses explicitly labelled fallback without blocking the Workbench [0.21ms]
(pass) a newly discovered model crosses completion, command, picker, persistence, reload and Native execution without a code allowlist update [4.54ms]
(pass) a long refreshed model list keeps the selected last item visible in a small Astra sheet [0.42ms]
(pass) astra bounds long option lists and wraps selection without hiding it at 80x24 [0.28ms]
(pass) workbench bounds long option lists and wraps selection without hiding it at 80x24 [0.29ms]

test/legacy-shell-characterization.test.ts:
(pass) legacy shell characterization > Escape aborts an active stream without stopping the shell [13.00ms]
(pass) legacy shell characterization > empty Ctrl+D saves and closes legacy resources in order [13.84ms]
(pass) legacy shell characterization > /exit saves and closes legacy resources in order [12.01ms]

test/performance.test.ts:
(pass) performance projection > binds each independent question to its own request item and turn [0.26ms]
(pass) performance projection > does not leak an assigned goal across a different goal turn boundary [0.06ms]
(pass) performance projection > does not display successful command output as acceptance verification [0.07ms]
(pass) performance projection > excludes governance and uncertain request observations from execution failures [0.03ms]
(pass) performance projection > counts each actual failed tool, turn, and verification observation [0.04ms]

test/workbench-bottom-hud.test.ts:
(pass) HUD는 실행 모드와 provider 사용량을 한 줄에 표시한다 [0.33ms]

test/auth-overlay.test.ts:
(pass) AuthFlowOverlay > describes Google OAuth as an in-browser login instead of a Gemini terminal [0.47ms]
(pass) AuthFlowOverlay > keeps provider selection and auth in one keyboard surface [0.71ms]
(pass) AuthFlowOverlay > cancels provider selection with "\u001b" [0.04ms]
(pass) AuthFlowOverlay > cancels provider selection with "\u0003"
(pass) AuthFlowOverlay > cancels provider selection with "\u0004"
(pass) AuthFlowOverlay > masks secret input and completes login without rendering the credential [1.45ms]
(pass) AuthFlowOverlay > cancels an active auth overlay before global "\u0003" handling [0.17ms]
(pass) AuthFlowOverlay > cancels an active auth overlay before global "\u0004" handling [0.02ms]
(pass) AuthFlowOverlay > shows and opens the official Gemini API key page without capturing the shortcut as a secret [0.42ms]
(pass) AuthFlowOverlay > keeps a copyable Gemini URL after browser launch fails [0.14ms]

test/github-template-contract.test.ts:
(pass) GitHub templates mirror agent contracts > Bug form은 무접두어 제목과 문제·재현 최소 계약만 요구한다 [1.82ms]
(pass) GitHub templates mirror agent contracts > Enhancement form은 무접두어 제목과 요청·현재 불편만 요구한다 [0.39ms]
(pass) GitHub templates mirror agent contracts > PR template은 연결과 복구 계약을 노출한다 [0.11ms]

test/repository-overlays.test.ts:
(pass) repository overlays > renders real commit status inside a width-safe sheet [1.96ms]
(pass) repository overlays > renders open GitHub issues and closes with Escape [1.70ms]

test/dashboard-pre-user-test.test.ts:
(pass) dashboard before user testing > keeps the twelfth keyboard selection visible and identifies its Stats target [0.69ms]
(pass) dashboard before user testing > states unknown and partial local-journal coverage without declaring system health [0.57ms]
(pass) dashboard before user testing > keeps dashboard rows bounded at user-test widths [1.80ms]

test/local-workflow-service.test.ts:
(pass) 두 프로젝트에서 실제 로컬 검사→증거→저장→새 프로세스 조회를 수행한다 [258.70ms]
(pass) 실패한 실제 검사는 실패 Receipt와 다음 행동을 남긴다 [84.43ms]
(pass) 저장된 running 검사를 재개하고 변경된 입력은 거절한다 [171.96ms]
(pass) 다른 프로젝트에 복사한 새 상태를 정상 기록으로 읽지 않는다 [129.36ms]
(pass) 공개 CLI가 검사 결과와 동일한 종료 코드를 반환한다 [230.13ms]
(pass) 완료한 Run은 입력 변경 후 재개 성공으로 재사용하지 않는다 [196.60ms]
(pass) full legacy 기록은 로컬 검사 통과로 표시하지 않는다 [89.85ms]
(pass) 로컬 완료 상태만 있고 검증 Receipt가 없으면 통과 표시를 거절한다 [84.59ms]
(pass) 무관한 커밋으로 재개가 차단될 때 Skill 파일 변경으로 단정하지 않는다 [104.77ms]

test/artifact-control.test.ts:
(pass) Artifact Candidate control > 같은 Candidate를 결정적으로 렌더링한다 [0.16ms]
(pass) Artifact Candidate control > digest 변조와 stale expectedBefore를 차단한다 [0.07ms]
(pass) Artifact Candidate control > GitHub Issue 유형 접두어와 미실행 검증을 거부한다 [0.05ms]
(pass) Artifact Candidate control > PR은 네 연결과 위험·복구를 빠짐없이 요구한다 [0.10ms]
(pass) Artifact Candidate control > Obsidian Candidate의 여러 줄 절과 경로 제목을 Vault 문서로 렌더링한다 [0.32ms]
(pass) Artifact Candidate control > 신뢰하지 않은 JSON의 null content와 links를 오류로 반환하고 죽지 않는다 [0.07ms]

test/rpa-description.test.ts:
(pass) RPA description map validation > accepts the complete normalized fixture [0.20ms]
(pass) RPA description map validation > rejects unknown object keys and unfilled scaffold markers [0.15ms]
(pass) RPA description map validation > rejects malformed, impossible, and out-of-order WBS dates [0.21ms]
(pass) RPA description map validation > rejects duplicate sibling IDs, sequences, and ambiguous code symbols [0.15ms]
(pass) RPA description map validation > rejects broken Unit, Step, code, exception-test cross-references [0.11ms]
(pass) RPA description map validation > requires evidence for completed test outcomes and permits explicit unknown safety text [0.11ms]
(pass) RPA description map validation > requires not-run evidence to remain null [0.09ms]
(pass) RPA description map validation > rejects a Unit identity reused by another Task [0.09ms]
(pass) RPA Linear description rendering > derives counts and sorts Task and Step rows by sequence [0.29ms]
(pass) RPA Linear description rendering > renders the exact fixed H2 surfaces and explicit empty collections [0.30ms]
(pass) RPA Linear description rendering > escapes dynamic markdown so input cannot add headings or table cells [0.42ms]
(pass) RPA Linear description rendering > rejects an unknown Task instead of rendering a partial surface [0.15ms]
(pass) rpa-description CLI > validates, renders, and detects stale read-back content [43.12ms]

test/planning-store.test.ts:
(pass) FilePlanningStore > does not create Planning files during an empty read [0.69ms]
(pass) FilePlanningStore > uses legacy maxima, preserves unmanaged bytes, and restores on restart [8.93ms]
(pass) FilePlanningStore > serializes concurrent writers, redacts secrets, and creates private immutable artifacts [13.61ms]
(pass) FilePlanningStore > serializes independent process writers without duplicate IDs [33.63ms]
(pass) FilePlanningStore > rejects invalid parents and unsafe symlink catalog paths [1.53ms]
(pass) FilePlanningStore > does not commit a catalog record over an untracked artifact collision [1.73ms]
(pass) FilePlanningStore > records only backward same-Epic supersedes relations [10.46ms]
(pass) FilePlanningStore > repairs catalog-derived artifacts and projections but rejects immutable divergence [6.58ms]
(pass) FilePlanningStore > fails closed for catalog revision gaps and unclosed projection markers [2.18ms]

test/linear-project-dashboard.test.ts:
(pass) McpLinearProjectDashboard > returns one ready snapshot from the three Linear reads [0.42ms]
(pass) McpLinearProjectDashboard > rejects a failed Linear read so the Workbench can choose unavailable or stale [0.05ms]

test/entry-dashboard-view.test.ts:
(pass) EntryDashboardView > renders the project pulse in the requested information order [0.90ms]
(pass) EntryDashboardView > keeps loading and unavailable states explicit [0.13ms]
(pass) EntryDashboardView > keeps a stale snapshot visible with its recovery context [0.45ms]
(pass) EntryDashboardView > bounds every row to the pane width [2.04ms]

test/architecture.test.ts:
(pass) source architecture > keeps flattened layers grouped by their canonical responsibility [17.32ms]
(pass) source architecture > keeps the core independent from adapters [12.73ms]
(pass) source architecture > keeps core domain independent from orchestration and effects [12.21ms]
(pass) source architecture > does not recreate the retired top-level source layers [2.83ms]
(pass) source architecture > keeps inbound adapters from importing outbound adapters [12.88ms]
(pass) source architecture > keeps process execution behind application-owned ports [12.79ms]
(pass) source architecture > keeps TUI foundation independent from higher-level TUI groups [12.28ms]
(pass) source architecture > keeps TUI feature implementations independent from sibling features [13.41ms]
(pass) source architecture > keeps concrete executor adapters independent [12.82ms]
(pass) source architecture > has no relative source dependency cycles [13.83ms]
(pass) source architecture > keeps the Work capability entry independent from TUI and Runtime implementations [12.22ms]
(pass) source architecture > keeps the composition root small [0.14ms]
(pass) source architecture > keeps the native workbench shell independent from the legacy session runtime [12.91ms]

test/skill-verification.test.ts:
(pass) Skill 검증 경계 > 검증 없이 성공 거절: [""] [0.05ms]
(pass) Skill 검증 경계 > 검증 없이 성공 거절: [" "]
(pass) Skill 검증 경계 > 검증 없이 성공 거절: ["임의 성공 주장"]
(pass) 다른 Run·검사 입력의 결과와 full 범위의 로컬 검증을 거절한다 [0.06ms]
(pass) 검증 결과가 있어도 Run에 검사 입력이 고정되지 않았다면 성공을 거절한다 [0.07ms]

test/todo-store.test.ts:
(pass) FileTodoStore > round trips Native references and leaves reference-free legacy source untouched on read [3.61ms]
(pass) FileTodoStore > writes only an absent document with null revision and enforces private modes [2.50ms]
(pass) FileTodoStore > atomically persists and reads a parent with one detail [2.52ms]
(pass) FileTodoStore > rejects stale revisions and malformed existing files without overwriting [2.58ms]
(pass) FileTodoStore > preserves CRLF and unknown Markdown while patching managed Todo lines [2.17ms]
(pass) FileTodoStore > debounces external editor writes and suppresses its own atomic rename [164.71ms]
(pass) FileTodoStore > delivers the same external source only once across separate filesystem events [165.06ms]
(pass) FileTodoStore > rejects symlink and non-regular targets [3.93ms]
(pass) FileTodoStore > allows exactly one concurrent writer for the same revision and cleans artifacts [7.02ms]
(pass) FileTodoStore > keeps the canonical vault free of local lock databases [2.56ms]
(pass) FileTodoStore > releases the interprocess lock when a writer process is killed [17.47ms]
(pass) FileTodoStore > copies a legacy Todo into an absent canonical path without deleting the source [2.55ms]
(pass) FileTodoStore > does not overwrite an existing canonical Todo during explicit import [2.52ms]

test/development-traceability.test.ts:
(pass) traceability v3 contracts > accepts a complete typed chain and derives verdict from coverage, not terminal completion [0.42ms]
(pass) traceability v3 contracts > never derives pass from empty required coverage [0.01ms]
(pass) traceability v3 contracts > adapts a real reducer completion receipt only with explicit evidence-bound verification context [0.26ms]
(pass) traceability v3 contracts > preserves distinct exception test mappings by stage [0.06ms]
(pass) traceability v3 contracts > rejects duplicate, dangling, stale, and unverified identities [0.31ms]
(pass) traceability v3 contracts > requires purpose, risk, pass, and complete important exception recovery tests [0.06ms]
(pass) traceability v3 contracts > rejects receipt/evidence digest and source revision mismatches [0.10ms]
(pass) traceability v3 contracts > migrates v2 deterministically without reusing its runtime format [0.23ms]

test/delegation-tree-view.test.ts:
(pass) Gajae-style delegation tree > groups native agent lifecycle and IRC items without duplicating lifecycle updates [0.83ms]
(pass) Gajae-style delegation tree > keeps agent names and states scoped to their native turn [0.17ms]
(pass) Gajae-style delegation tree > uses the latest reordered lifecycle state for queued, failed, and cancelled agents [0.46ms]
(pass) Gajae-style delegation tree > preserves native nested activity messages while excluding ordinary collaboration tools [0.13ms]
(pass) Gajae-style delegation tree > projects native call and subagent payloads into one stable delegated task [0.07ms]
(pass) Gajae-style delegation tree > keeps lifecycle, identity, and attempts authoritative when events arrive out of order [0.09ms]
(pass) Gajae-style delegation tree > resolves nested ownership across turns and attaches only public child work [0.18ms]
(pass) Gajae-style delegation tree > scopes repeated native spawn item ids by sender thread and turn [0.06ms]
(pass) Gajae-style delegation tree > keeps delayed child-turn events on their bound attempt and rejects ambiguous new turns [0.09ms]
(pass) Gajae-style delegation tree > renders an aggregate parentRef tree in DFS order with sanitized selectable refs [0.15ms]
(pass) Gajae-style delegation tree > renders the grouped tree in Chat instead of the old one-line collaboration notice [0.69ms]
(pass) Gajae-style delegation tree > stays absent when the App Server has not emitted collaboration items [0.02ms]
(pass) Gajae-style delegation tree > requires native turn and item references for observed trace nodes and keeps source visible when compact [0.18ms]
(pass) Gajae-style delegation tree > keeps a failed spawn visible before the server assigns a receiver thread [0.29ms]

test/chat-render-acceptance.test.ts:
(pass) Chat renderer completion > renders readable Markdown, plain unsupported code, and ANSI-safe rows at 40 columns [0.63ms]
(pass) Chat renderer completion > renders readable Markdown, plain unsupported code, and ANSI-safe rows at 80 columns [0.16ms]
(pass) Chat renderer completion > renders readable Markdown, plain unsupported code, and ANSI-safe rows at 120 columns [0.15ms]
(pass) Chat renderer completion > shows malformed roles and statuses explicitly while preserving safe text and later messages [0.26ms]
(pass) Chat renderer completion > isolates a Markdown renderer failure to one message [0.12ms]
(pass) Chat renderer completion > keeps execution cards with the same item id in separate turns and chronological order [1.45ms]
(pass) Chat renderer completion > sanitizes body-bearing failed messages without partial metadata [0.17ms]
(pass) Chat renderer completion > sanitizes body-bearing cancelled messages without partial metadata [0.07ms]
(pass) Chat renderer completion > sanitizes body-bearing streaming messages without partial metadata [0.05ms]

test/auth-service.test.ts:
(pass) AuthService > distinguishes configured and required providers without exposing credentials [0.11ms]
(pass) AuthService > returns the post-login status and delegates logout [0.12ms]

test/monitoring-overlay.test.ts:
(pass) MonitoringOverlay > renders a content-safe live session dashboard [0.35ms]
(pass) MonitoringOverlay > keeps core status visible at narrow width and marks missing observations unknown [0.17ms]
(pass) MonitoringOverlay > renders completed state from the latest observed snapshot [0.12ms]
(pass) MonitoringOverlay > renders failed state from the latest observed snapshot [0.05ms]
(pass) MonitoringOverlay > unsubscribes on Escape [0.05ms]

test/development-store.test.ts:
(pass) development source ledger and shared SQLite (v3 traceability projection remains disposable) > preserves captured attribution across binding changes and rejects conflicting replay [33.14ms]
(pass) development source ledger and shared SQLite (v3 traceability projection remains disposable) > rebuilds after DB loss and reports modified source rather than accepting it [22.32ms]
(pass) development source ledger and shared SQLite (v3 traceability projection remains disposable) > keeps original v1 UUID references queryable without Unit and distinguishes test verdict [14.36ms]
(pass) development source ledger and shared SQLite (v3 traceability projection remains disposable) > rejects a reused Linear id or UUID with a different URL across source and legacy links [11.66ms]
(pass) development source ledger and shared SQLite (v3 traceability projection remains disposable) > serializes independent processes and preserves every source event [161.44ms]
(pass) development source ledger and shared SQLite (v3 traceability projection remains disposable) > binds an asynchronous test to its start binding and detects DB payload tampering [17.00ms]
(pass) development source ledger and shared SQLite (v3 traceability projection remains disposable) > rebuild is project scoped within one shared database [15.82ms]

test/request-capability-config.test.ts:
(pass) Runtime config snapshots explicit files once, exposes their argument contract and defaults to no write grant [2.20ms]

test/obsidian-template-contract.test.ts:
(pass) Obsidian schema v2 documentation contract > defines a human-readable filename and Properties as the relationship authority [0.03ms]
(pass) Obsidian schema v2 documentation contract > requires all canonical sections, acceptance, verification, gaps, and evidence [0.07ms]
(pass) Obsidian schema v2 documentation contract > makes draft placeholders and non-data examples explicit [0.02ms]
(pass) Obsidian schema v2 documentation contract > assigns source ownership and defines preview/apply drift gates [0.03ms]
(pass) Obsidian schema v2 documentation contract > keeps the skill on the contract, preview, and evidence path [0.02ms]

test/session-runtime.test.ts:
(pass) SessionRuntime > streams a response while preserving a replayable event trail [5.29ms]
(pass) SessionRuntime > grounds location questions in the exact active workspace path [4.06ms]
(pass) SessionRuntime > rejects concurrent submissions without corrupting the transcript [2.60ms]
(pass) SessionRuntime > records an explicit bang command outside the model with display-safe output [3.37ms]
(pass) SessionRuntime > cancels an active terminal command and returns the session to ready [2.02ms]
(pass) SessionRuntime > commits a cancelled assistant item without polluting model context [354.26ms]
(pass) SessionRuntime > executes a real tool call, returns its result to the model, and persists the card [11.16ms]
(pass) SessionRuntime > records safe narration labels only for attempted tools [28.98ms]
(pass) SessionRuntime > appends a bounded observed learning summary after a multi-tool turn without duplicating structured answers [9.95ms]
(pass) SessionRuntime > migrates legacy narration events by event order and rejects duplicate persisted steps [1.29ms]
(pass) SessionRuntime > requires public tool reasons and evidence-scoped final summaries in the system prompt [0.03ms]
(pass) SessionRuntime > retries a transient overloaded provider response before failing the turn [506.35ms]
(pass) SessionRuntime > writes terminal tool results for every parallel call when aborted [8.57ms]
(pass) SessionRuntime > drops an incomplete persisted tool round from resumed model context [3.86ms]
(pass) SessionRuntime > drives a thin project Todo from model intent through real tool evidence [41.03ms]
(pass) SessionRuntime > blocks unauthenticated turns before they enter the transcript [0.63ms]
(pass) SessionRuntime > isolates a broken observer from durable model-setting commits [0.83ms]
(pass) SessionRuntime > resumes canonical messages from the durable event trail [2.83ms]

test/tui-shell-characterization.test.ts:
(pass) runProjectWorkbenchShell characterization > dispatches one chat send for a ready composer submission [65.57ms]
(pass) runProjectWorkbenchShell characterization > routes a working composer submission through the chat command used for steering [64.47ms]
(pass) runProjectWorkbenchShell characterization > keeps Escape non-decisive and dispatches an approval exactly once [126.22ms]
(pass) runProjectWorkbenchShell characterization > dispatches one cancellation for Escape while working [63.08ms]
(pass) runProjectWorkbenchShell characterization > resumes a workflow without creating a new chat send [62.19ms]
(pass) runProjectWorkbenchShell characterization > disposes shell-owned resources during shutdown [61.70ms]
(pass) runProjectWorkbenchShell characterization > releases shell resources once in the established shutdown order [0.30ms]

test/workspace-todo-view.test.ts:
(pass) WorkspaceTodoView > distinguishes no plan from a plan still being prepared [0.23ms]
(pass) WorkspaceTodoView > projects the latest Linear Update when no native Todo is active [0.09ms]
(pass) WorkspaceTodoView > keeps the Goal visible while the Native Plan is being prepared [0.05ms]
(pass) WorkspaceTodoView > wraps Korean and ANSI todo content safely within 30 columns [0.39ms]
(pass) WorkspaceTodoView > wraps Korean and ANSI todo content safely within 40 columns [0.06ms]
(pass) WorkspaceTodoView > wraps Korean and ANSI todo content safely within 70 columns [0.11ms]
(pass) WorkspaceTodoView > wraps Korean and ANSI todo content safely within 120 columns [0.03ms]
(pass) WorkspaceTodoView > uses status markers without mixing project metadata or commands into Todo [0.12ms]
(pass) WorkspaceTodoView > uses the active item rather than an earlier pending item in compact layout [0.07ms]
(pass) WorkspaceTodoView > keeps execution provenance out of the Todo checklist [0.21ms]

test/config.test.ts:
(pass) model settings > uses defaults when no settings file exists [0.54ms]
(pass) model settings > normalizes an unsupported provider, model, and effort [0.03ms]
(pass) model settings > rejects a model that belongs to another provider [0.02ms]
(pass) model settings > saves and loads a valid selection [1.32ms]
(pass) model settings > reports a malformed settings file instead of silently resetting it [1.24ms]

test/request-test-workspace.test.ts:
(pass) projects tests as kind -> what -> goal and keeps evidence-backed outcomes separate from completed plans [0.23ms]
(pass) renders a readable three-level black-box hierarchy with source on the goal line [1.04ms]
(pass) keeps snapshot projection outside the render pass [0.51ms]
(pass) legacy sessions expose observed commands without inventing a verification purpose [0.06ms]

test/t-notes.test.ts:
(pass) T-note service > creates an immutable redacted packet and replays an append-only detached draft [1.60ms]
(pass) T-note service > sanitizes a question embedded in the instruction before detached generation [0.79ms]
(pass) T-note service > rejects a cross-project, unordered range and a generator that does not confirm isolation [0.36ms]
(pass) T-note service > persists strictly increasing sparse global source sequences [0.95ms]
(pass) T-note service > retries one missing sparse interleaved-turn note after a failed generation [1.01ms]
(pass) T-note service > adapts the append-only ProjectActivity journal without provider-state reconstruction [0.07ms]
(pass) T-note service > removes native identifiers inside a non-reasoning event payload [0.16ms]
(pass) T-note service > removes nested native reasoning bodies and all native references before they enter a T-note packet [0.09ms]
(pass) T-note service > truncates only a final crash residue while rejecting an invalid middle record [1.47ms]

test/todo-ledger.test.ts:
(pass) TodoLedger > mirrors only the flat Native plan without inventing detail items [0.97ms]
(pass) TodoLedger > does not downgrade an observed execution binding when an internal replay omits it [0.40ms]
(pass) TodoLedger > keeps a manual item source-free when it is added to a Native-sourced Todo [0.32ms]
(pass) TodoLedger > ignores late and foreign Plan sources after a newer session Plan is durable [0.16ms]
(pass) TodoLedger > enriches the same Plan revision when its observed input reference arrives later [0.14ms]
(pass) TodoLedger > uses coarse semantic narration when a narrator is pending, fails, or returns null reasons [0.26ms]
(pass) TodoLedger > keeps deterministic Native Todo IDs across insertion, reorder, edit, and replay [0.38ms]
(pass) TodoLedger > rejects invalid identities and truncated-prefix collisions before writes or events [0.20ms]
(pass) TodoLedger > fails closed for missing or forged Native source authority before writes or events [0.25ms]
(pass) TodoLedger > creates stable IDs, refuses unfinished replacement, and shares project work across sessions [0.12ms]
(pass) TodoLedger > enforces one active item across shared sessions [0.10ms]
(pass) TodoLedger > requires unique evidence recorded while active before completion [0.13ms]
(pass) TodoLedger > runs one-level detail work with stable IDs and records evidence on the active detail [0.61ms]
(pass) TodoLedger > blocks and reopens details, blocks an active detail with its parent, and requires every detail for parent completion [0.30ms]
(pass) TodoLedger > blocks pending or active items and reopens only blocked items [0.10ms]
(pass) TodoLedger > does not record evidence for another owner or without an active item [0.07ms]
(pass) TodoLedger > accepts a project Todo created by another session [0.05ms]
(pass) TodoLedger > caps evidence and Todo rewrites at eight observations per active item [0.15ms]
(pass) TodoLedger > queues work after the active item or interrupts it now without losing order [0.12ms]
(pass) TodoLedger > reloads and emits the durable document after a CAS conflict [0.09ms]
(pass) TodoLedger > reports the exact current source and pending patch on a CAS conflict [0.10ms]
(pass) TodoLedger > reflects a debounced external file edit in the live ledger snapshot [247.59ms]
(pass) TodoLedger > appends one sanitized todo.updated event and isolates broken listeners [0.36ms]

test/work-recording-hook.test.ts:
(pass) work recording gate > compares the current turn against its own dirty-worktree baseline [0.23ms]
(pass) work recording gate > continues once when a turn changes a file and releases the continued stop [165.77ms]
(pass) work recording gate > does not continue for no change or runtime-only noise [211.12ms]
(pass) work recording gate > observes a repository symlink without following its external target [128.22ms]
(pass) work recording gate > removes pending baseline state when the session ends [118.81ms]
(pass) work recording gate > registers baseline, stop and cleanup hooks in the project layer [0.30ms]

test/dashboard-layout.test.ts:
(pass) dashboard layout > renders Todo on the Workbench top border [1.84ms]
(pass) dashboard layout > keeps three regions in one wide frame with independent viewports [2.17ms]
(pass) dashboard layout > places the Tracer title on the split rule without adding a second heading row [1.75ms]
(pass) dashboard layout > uses one ordered viewport inside the same frame when compact [1.23ms]
(pass) dashboard layout > keeps every section reachable at 120×10 [1.61ms]
(pass) dashboard layout > keeps every section reachable at 120×13 [1.01ms]
(pass) dashboard layout > reuses section rows when a child returns the same stable projection [0.17ms]
(pass) dashboard layout > reuses unchanged prefixes without retaining a stale dynamic tail [0.18ms]
(pass) dashboard layout > keeps every wheel delta in its contained chat viewport while content renders [7.29ms]

test/settings-store.test.ts:
(pass) FileSettingsStore atomic updates > keeps native and compatibility Router selections in separate files [0.07ms]
(pass) FileSettingsStore atomic updates > compares and swaps an exact durable selection [1.64ms]
(pass) FileSettingsStore atomic updates > preserves a newer selection when expected is stale [0.89ms]
(pass) FileSettingsStore atomic updates > allows only one concurrent process-shaped writer to win [27.68ms]

test/slash-commands.test.ts:
(pass) WWW slash commands > opens interactive model and login selectors [0.03ms]
(pass) WWW slash commands > classifies streaming concurrency independently from mutability [0.04ms]
(pass) WWW slash commands > sets a validated Router model directly [0.02ms]
(pass) WWW slash commands > routes provider login and usage refresh [0.10ms]
(pass) WWW slash commands > intercepts exact WWW commands and leaves unknown native slash input untouched [0.07ms]
(pass) WWW slash commands > extracts explicit bang commands without treating ordinary messages as shell [0.02ms]
(pass) WWW slash commands > intercepts only exact workbench-local commands [0.42ms]
(pass) WWW slash commands > advertises every supported command for editor completion [0.21ms]
(pass) routes local workflow commands and advertises their completion [0.06ms]

test/result-cards.test.ts:
(pass) BashResultCard > renders every lifecycle status with its themed label [1.63ms]
(pass) BashResultCard > groups stdout and stderr and shows failed exit details [0.14ms]
(pass) BashResultCard > limits output lines and removes terminal controls [0.68ms]
(pass) BashResultCard > preserves Korean visible width in a 40-column card [0.50ms]
(pass) BashResultCard > highlights bash while retaining prompts, wrapping, and redaction [1.95ms]
(pass) BashResultCard > applies semantic Git status and diff highlighting inside Bash output [0.36ms]
(pass) GenericToolResultCard > keeps generic tool cards focused on their own input and output [0.13ms]
(pass) GenericToolResultCard > renders lifecycle labels and display-safe values [0.24ms]
(pass) GenericToolResultCard > bounds output and preserves visible width at narrow and wide widths [0.61ms]
(pass) GenericToolResultCard > pretty prints and highlights JSON input and output without changing its snapshot [0.38ms]
(pass) GenericToolResultCard > pretty prints path-grounded YAML but falls back for invalid, multi-document, aliased, and ungrounded YAML [5.73ms]
(pass) GenericToolResultCard > pretty prints JSON output for raw read paths and content-based JSON detection [0.31ms]
(pass) GenericToolResultCard > applies structured output tail limits at narrow widths [0.31ms]
(pass) GenericToolResultCard > bounds huge valid structured output before highlighting without breaking ANSI or width [1.26ms]
(pass) DiffResultCard > distinguishes added, removed, and context lines without color [0.42ms]
(pass) CompletionSummaryCard > renders three ordered # sections, bullets, and verification at stable widths [0.53ms]

test/workbench-hud-system.test.ts:
(pass) HUD 계약은 composer 탭과 한 줄 telemetry strip의 구획을 고정한다 [0.03ms]
(pass) context 토큰은 읽기 쉬운 축약 단위로 렌더링한다 [0.02ms]

test/cli.test.ts:
(pass) WWW CLI session entry > Astra forwards explicit Runtime scope and resume together without silently changing legacy entry [0.17ms]
(pass) WWW CLI session entry > paints the lightweight Wooni bootstrap before production modules load [0.03ms]
(pass) WWW CLI session entry > paints a distinct bootstrap for the explicit multi-provider Router [0.02ms]
(pass) WWW CLI session entry > reports the package release version [0.04ms]
(pass) WWW CLI session entry > documents the compatibility Router command and its Native feature boundary [0.07ms]
(pass) WWW CLI session entry > opens a new session for plain www without listing or resuming [0.04ms]
(pass) WWW CLI session entry > opens the experimental embedded Pi lane without changing the default [0.03ms]
(pass) WWW CLI session entry > accepts an explicit Codex lane without changing its default semantics [0.02ms]
(pass) WWW CLI session entry > opens an explicit multi-provider Router session without changing the native default [0.03ms]
(pass) WWW CLI session entry > resumes an explicit legacy Router session id [0.04ms]
(pass) WWW CLI session entry > rejects malformed Router commands and session ids [0.09ms]
(pass) WWW CLI session entry > opens a project-scoped picker for --resume without an id [0.05ms]
(pass) WWW CLI session entry > resumes an explicit thread id without opening the picker [0.03ms]

test/repository-insights.test.ts:
(pass) repository insights > reads a dirty branch with upstream counts and display-safe Unicode paths [0.43ms]
(pass) repository insights > supports clean repositories without an upstream [0.06ms]
(pass) repository insights > parses delimiter-safe commits and clamps command limits [0.08ms]
(pass) repository insights > reads open issue labels from the current repository [0.13ms]
(pass) repository insights > returns bounded, redacted command errors without raw output [0.18ms]

test/work-step-card-highlight.test.ts:
(pass) WorkStepCard executor highlighting > keeps generated input and output summaries out of a Tracer step card [0.20ms]
(pass) WorkStepCard executor highlighting > labels an unplanned action as Bash, Edit, or Tool while keeping the Bash block [1.37ms]
(pass) WorkStepCard executor highlighting > renders native command execution with a Gajae-style Bash frame [0.70ms]
(pass) WorkStepCard executor highlighting > shortens repeated native paths at the presentation boundary without conflating external paths [0.88ms]
(pass) WorkStepCard executor highlighting > projects project, home, sibling, outside, false-prefix, and Windows paths on component boundaries [0.10ms]
(pass) WorkStepCard executor highlighting > uses the same path projection at the Bash result-card boundary without mutating its snapshot [0.22ms]
(pass) WorkStepCard executor highlighting > projects file-change and read what paths without narration while preserving raw activities [0.40ms]
(pass) WorkStepCard executor highlighting > leaves short relative paths unchanged [0.47ms]
(pass) WorkStepCard executor highlighting > keeps direct work and why text without a repeated what label [0.79ms]
(pass) WorkStepCard executor highlighting > classifies execution output by semantic meaning [0.04ms]
(pass) WorkStepCard executor highlighting > connects native Bash highlighting without changing public text [0.56ms]
(pass) WorkStepCard executor highlighting > pretty prints and highlights native structured tool output like generic tools [58.24ms]
(pass) WorkStepCard executor highlighting > unwraps the Codex mcpToolCall arguments and result envelope before rendering [0.42ms]
(pass) WorkStepCard executor highlighting > renders text from a Codex mcpToolCall result.content envelope [0.69ms]
(pass) WorkStepCard executor highlighting > keeps a semantic reason while narrator work is pending or has failed [0.29ms]
(pass) WorkStepCard executor highlighting > rejects inline commands and filename-only narrator text [0.11ms]

test/trace-selection.test.ts:
(pass) WOO-705 trace selection identity > selects exact activity identities when different turns reuse one item id [0.25ms]
(pass) WOO-705 trace selection identity > fails closed with structured coverage for invalid ids, partial journals, and execution mismatches [0.07ms]

test/project-workbench-session.test.ts:
(pass) pre-thread intake survives startup failure and is adopted once with provenance into the Native journal [8.46ms]
(pass) createProjectWorkbenchSession > selects Codex by default and forwards an explicit Pi lane independently from provider, model, and effort [0.17ms]
(pass) createProjectWorkbenchSession > requires an explicit thread bind before selecting a journal stream or appending activity [0.09ms]
(pass) createProjectWorkbenchSession > rebuilds the bound session Tracer.md from the canonical activity journal [0.81ms]
(pass) createProjectWorkbenchSession > uses the configured Codex model only and falls back when a legacy router selected another provider [0.04ms]
(pass) createProjectWorkbenchSession > uses the production composer factory with its static class receiver intact [1.36ms]
(pass) createProjectWorkbenchSession > uses distinct run-local leases and one shared unbound journal without pre-bind T-note I/O [0.55ms]
(pass) createProjectWorkbenchSession > refuses a concurrent writable resume and releases only its own thread lease [1.42ms]
(pass) createProjectWorkbenchSession > prebinds two close/reopen resume sessions to the same native journal before Native resume [2.57ms]
(pass) createProjectWorkbenchSession > bootstraps a missing or empty resumed Todo once without replacing an existing Todo [6.97ms]
(pass) createProjectWorkbenchSession > refreshes an older source-bound Todo on resume while keeping unobserved model and agent unknown [2.62ms]
(pass) createProjectWorkbenchSession > keeps two Native inputs in distinct session Todo files with matching input, turn, and model references [2.63ms]
(pass) createProjectWorkbenchSession > does not wait for resumed Todo bootstrap and exposes rejected and conflicted writes [2.29ms]
(pass) createProjectWorkbenchSession > resumes an in-progress root turn through repeated markers and applies its later Plan and action [33.60ms]
(pass) createProjectWorkbenchSession > wires one native writer to thread-scoped Todo, private activity/drafts, and deterministic project identity [1.32ms]
(pass) createProjectWorkbenchSession > isolates WES from default Chat and creates it only when explicitly enabled [0.69ms]
(pass) createProjectWorkbenchSession > binds a fresh workbench Todo before seven-stage Runtime sync [12.83ms]

test/native-plan-wiring.test.ts:
(pass) Native Plan and Runtime Todo boundaries > keeps a public numbered Plan in workFlow without replacing the seven-stage Todo or carrying it into manual execution [12.26ms]
(pass) Native Plan and Runtime Todo boundaries > keeps a structured Native plan authoritative over a public numbered reply [6.78ms]
(pass) Native Plan and Runtime Todo boundaries > does not manufacture a Native Plan when a Plan turn supplies no plan body [7.01ms]
(pass) Native Plan and Runtime Todo boundaries > projects the Test2 numbered-heading Native plan and associates the earlier Bash activity [7.55ms]
(pass) Native Plan and Runtime Todo boundaries > projects the Test2 numbered list beneath a step-count heading without treating the heading as a step [6.56ms]
(pass) Native Plan and Runtime Todo boundaries > projects the Test2 top-level numbered Native plan and associates the earlier Bash activity [7.24ms]
(pass) Native Plan and Runtime Todo boundaries > does not infer a Native Plan for manual mode [20.65ms]
(pass) Native Plan and Runtime Todo boundaries > does not infer a Native Plan for failed Plan turn [20.52ms]
(pass) Native Plan and Runtime Todo boundaries > does not infer a Native Plan for Plan turn without observed work [20.64ms]
(pass) Native Plan and Runtime Todo boundaries > does not project 일반 번호 목록 [18.76ms]
(pass) Native Plan and Runtime Todo boundaries > does not project 불연속 번호 계획 [16.33ms]
(pass) Native Plan and Runtime Todo boundaries > does not project 실패한 계획 turn [14.64ms]
(pass) Native Plan and Runtime Todo boundaries > does not project 중단된 계획 turn [15.01ms]
(pass) Native Plan and Runtime Todo boundaries > accepts only the known root turn's completed plan item without replacing the Runtime Todo [42.22ms]

test/code-id.test.ts:
(pass) Code-ID는 문자열 예시를 선언으로 세지 않고 실제 선언·노트·중복을 대조한다 [192.60ms]

test/development-test-runner.test.ts:
(pass) explicit argv captures failure and both streams, with actual input blobs [116.52ms]
(pass) snapshot excludes generated artifacts when artifactRoot is inside the repository [36.41ms]
(pass) running cancellation, unavailable executable, changed inputs and start binding remain explicit [126.62ms]

test/workbench-welcome.test.ts:
(pass) workbench welcome intro > sweeps a stable WWW wordmark through distinct gradient frames [0.51ms]
(pass) workbench welcome intro > keeps Wooni out of the main welcome surface [0.68ms]

test/approval-overlay.test.ts:
(pass) ApprovalOverlay > shows the command, the reason, the path, and every advertised decision [0.27ms]
(pass) ApprovalOverlay > pads every row to the requested width so the sheet border stays straight [0.47ms]
(pass) ApprovalOverlay > keeps the slash command visible as a second entrance [0.07ms]
(pass) ApprovalOverlay > resolves the highlighted decision on Enter and moves with the arrow keys [0.05ms]
(pass) ApprovalOverlay > wraps the selection at both ends [0.02ms]
(pass) ApprovalOverlay > takes a number key as a direct decision [0.01ms]
(pass) ApprovalOverlay > closes on Escape without deciding anything [0.02ms]
(pass) ApprovalOverlay > ignores further input once a decision is on its way [0.01ms]
(pass) ApprovalOverlay > offers only what the request advertises [0.08ms]
(pass) ApprovalOverlay > keeps an advertised policy-amendment choice as a numbered option [0.09ms]
(pass) ApprovalOverlay > never invents a decision when the request advertises none [0.14ms]
(pass) ApprovalOverlay > renders commit, push, and GitHub Issue candidates with their exact execution scope [0.36ms]
(pass) ApprovalOverlay > renders Linear Issue·Project Activity, Obsidian, and GitHub PR Artifact candidates [0.35ms]
(pass) ApprovalOverlay > drops Artifact mutations that are not bound to an exact sha256 Candidate [0.07ms]

test/planning-documents.test.ts:
(pass) project planning documents > keeps durable Epics and Stories as separate append-oriented catalogs [0.69ms]
(pass) project planning documents > links the v1 Initiative, catalog, immutable artifacts, and current Map [0.69ms]

test/usage-service.test.ts:
(pass) UsageService > normalizes Codex and Claude adapter payloads without exposing credentials or raw responses [1.41ms]
(pass) UsageService > reports missing auth and Anthropic API keys without attempting quota requests [0.14ms]
(pass) UsageService > Gemini CLI와 Z.AI Coding Plan 쿼터를 각 공식 어댑터로 조회한다 [0.92ms]
(pass) UsageService > coalesces concurrent refreshes and stops future polling [20.64ms]
(pass) UsageService > keeps the initial HUD loading while retrying a transient startup auth failure [0.52ms]
(pass) UsageService > classifies Claude 429 responses and suppresses polling during backoff [0.38ms]
(pass) UsageService > keeps the last successful Claude limits visibly stale during a 429 [0.38ms]

test/woo-entry.test.ts:
(pass) WooEntry > merges stable policy and untrusted snapshot without losing turn fields [0.19ms]
(pass) WooEntry > coalesces concurrent refresh and atomically replaces ready state with blocked [0.12ms]
(pass) WooEntry > blocks an oversize payload and still prepares a safe turn context [0.11ms]

test/wes-entry-collector.test.ts:
(pass) WesEntryCollector > uses configured safe runner once and preserves signals [0.53ms]
(pass) WesEntryCollector > fails closed for a nonzero runner exit [0.18ms]
(pass) WesEntryCollector > rejects malformed runner JSON separately [0.09ms]
(pass) WesEntryCollector > rejects an unsafe runner path before any process starts [0.09ms]
(pass) WesEntryCollector > default system runner times out and fails closed [23.52ms]

test/detached-codex-generator.test.ts:
(pass) PiDetachedCodexGenerator > sends one stable packet-only context without tools or cwd and records structural isolation [0.49ms]
(pass) PiDetachedCodexGenerator > rejects tool output, unavailable models, and failed provider results [0.25ms]

test/session-store.test.ts:
(pass) SessionEventStore > serializes concurrent appends with monotonically increasing sequences [3.43ms]
(pass) SessionEventStore > round-trips event data without alteration [0.62ms]
(pass) SessionEventStore > creates private directories and files [0.52ms]
(pass) SessionEventStore > lists stored sessions by most recent update [6.57ms]
(pass) SessionEventStore > reports the line number for corrupt JSONL [0.60ms]

test/work-flow.test.ts:
(pass) dplan-v1 > parses completed plan Markdown variants and maps Korean and English statuses [0.50ms]
(pass) dplan-v1 > parses top-level bullets with numbered entries in document order [0.14ms]
(pass) dplan-v1 > accepts 2 plain numbered Native steps only beneath an explicit plan heading [0.09ms]
(pass) dplan-v1 > accepts 12 plain numbered Native steps only beneath an explicit plan heading [0.11ms]
(pass) dplan-v1 > accepts top-level numbered steps from an authoritative Native plan item [0.08ms]
(pass) dplan-v1 > rejects plain numbered Native plan: 한 단계뿐인 목록 [0.05ms]
(pass) dplan-v1 > rejects plain numbered Native plan: 불연속 목록 [0.02ms]
(pass) dplan-v1 > rejects plain numbered Native plan: 13단계 목록 [0.02ms]
(pass) dplan-v1 > fails closed for nested bullets unless they detail the preceding numbered step [0.09ms]
(pass) dplan-v1 > ignores a space-indented detail bullet of any width beneath a numbered step [0.08ms]
(pass) dplan-v1 > fails closed for malformed completed plan Markdown [0.63ms]
(pass) dplan-v1 > retains unique insert delete and reorder without index identity [0.14ms]
(pass) dplan-v1 > fails closed for duplicate/status and redaction collapse [0.15ms]
(pass) dplan-v1 > allows one bounded unique edit but rejects multi-edit and replacement [0.11ms]
(pass) dplan-v1 > orphans pre-plan and zero, one, or multiple running actions [0.13ms]
(pass) dplan-v1 > preserves each inferred activity's plan revision interval [0.11ms]
(pass) dplan-v1 > keeps boundary and equal-status revision attribution in monotonic intervals [0.07ms]
(pass) dplan-v1 > halts at integrity prefix and gives revision precedence to source mismatch [0.12ms]
(pass) dplan-v1 > leaves malformed plans to Layer B instead of registering revision collisions [0.06ms]
(pass) dplan-v1 > is replay deterministic and detects injected full digest collisions [0.14ms]
(pass) dplan-v1 > transfers every associated activity to a retirement orphan [0.09ms]
(pass) dplan-v1 > attributes mixed unmatched regions per item before transferring orphans [0.13ms]
(pass) dplan-v1 > treats duplicate token transitions as ambiguous and transfers each association once [0.21ms]
(pass) dplan-v1 > does not use public labels, display status, or positions as identity evidence [0.11ms]
(pass) dplan-v1 > uses the selected turn's outbound request as the public goal [0.05ms]
(pass) dplan-v1 > requires the selected turn start to match the expected thread [0.02ms]
(pass) dplan-v1 > does not take a later foreign-turn message as the selected turn goal [0.05ms]
(pass) dplan-v1 > uses only the selected turn's preceding outbound request and sanitizes it [0.06ms]
(pass) dplan-v1 > keeps same-turn lifecycle markers and foreign boundaries inside the selected interval [0.07ms]

 1199 pass
 0 fail
 9609 expect() calls
Ran 1199 tests across 133 files. [20.95s]

exit_code=0
```
{"inventoryUnits":0,"registryUnits":35,"exactOrderedMatch":false}

exit_code=
{"inventoryUnits":35,"registryUnits":35,"exactOrderedMatch":true}

Comparison probe 2 (feature display name included in the inventory column): `bun --eval` importing TUI_FEATURE_UNITS and parsing the inventory rows.
exit_code=0

## Independent registry-to-inventory comparison

Invocation:

```sh
bun --eval 'import { readFileSync } from "node:fs"; import { TUI_FEATURE_UNITS, TUI_RETIRED_FEATURE_UNIT_IDS } from "./src/adapters/inbound/tui/features/feature-registry.ts"; const inventory = readFileSync(".omo/evidence/2026-09-13-tui-unit-inventory.md", "utf8"); const listed = [...inventory.matchAll(/^\\| TUI-F\\d{3} [^|]* \\| (TUI-F\\d{3}-U\\d{2}) \\| ([^|]+) \\|/gm)].map(([, id, title]) => [id, title.trim()]); const actual = TUI_FEATURE_UNITS.map(({ id, title }) => [id, title]); const equal = JSON.stringify(listed) === JSON.stringify(actual); console.log(JSON.stringify({ inventoryUnits: listed.length, registryUnits: actual.length, exactOrderedMatch: equal, retiredIds: TUI_RETIRED_FEATURE_UNIT_IDS })); if (!equal) process.exit(1);'
```

```text
1 | import { readFileSync } from "node:fs"; import { TUI_FEATURE_UNITS, TUI_RETIRED_FEATURE_UNIT_IDS } from "./src/adapters/inbound/tui/features/feature-registry.ts"; const inventory = readFileSync(".omo/evidence/2026-09-13-tui-unit-inventory.md", "utf8"); const listed = [...inventory.matchAll(/^\\| TUI-F\\d{3} [^|]* \\| (TUI-F\\d{3}-U\\d{2}) \\| ([^|]+) \\|/gm)].map(([, id, title]) => [id, title.trim()]); const actual = TUI_FEATURE_UNITS.map(({ id, title }) => [id, title]); const equal = JSON.stringify(listed) === JSON.stringify(actual); console.log(JSON.stringify({ inventoryUnits: listed.length, registryUnits: actual.length, exactOrderedMatch: equal, retiredIds: TUI_RETIRED_FEATURE_UNIT_IDS })); if (!equal) process.exit(1);

TypeError: undefined is not an object (evaluating 'title.trim')
      at <anonymous> (/Users/jonghoPro/woo/00_project/99_www/[eval]:1:391)
      at map (1:11)
      at /Users/jonghoPro/woo/00_project/99_www/[eval]:1:363

Bun v1.4.0 (macOS arm64)

exit_code=1
```

## Corrected independent registry-to-inventory comparison

Invocation:

```sh
bun --eval 'import { readFileSync } from "node:fs"; import { TUI_FEATURE_UNITS, TUI_RETIRED_FEATURE_UNIT_IDS } from "./src/adapters/inbound/tui/features/feature-registry.ts"; const inventory = readFileSync(".omo/evidence/2026-09-13-tui-unit-inventory.md", "utf8"); const listed = [...inventory.matchAll(/^\| TUI-F\d{3} [^|]* \| (TUI-F\d{3}-U\d{2}) \| ([^|]+) \|/gm)].map(([, id, title]) => [id, title.trim()]); const actual = TUI_FEATURE_UNITS.map(({ id, title }) => [id, title]); const equal = JSON.stringify(listed) === JSON.stringify(actual); console.log(JSON.stringify({ inventoryUnits: listed.length, registryUnits: actual.length, exactOrderedMatch: equal, retiredIds: TUI_RETIRED_FEATURE_UNIT_IDS })); if (!equal) process.exit(1);'
```

```text
{"inventoryUnits":35,"registryUnits":35,"exactOrderedMatch":true,"retiredIds":[]}

exit_code=0
```

## QA harness note

The initial two inventory comparison probes were invalid parsers: the first omitted the feature display name from the inventory column; the second over-escaped the Markdown delimiters. Their raw output is preserved above. The corrected direct runtime-to-inventory comparison is the section immediately above this note and reports an ordered 35/35 match with exit code 0. They are not product test failures.

## manualQa

### surfaceEvidence

| scenario id | criterion reference | surface | exact invocation | verdict | artifactRefs |
|---|---|---|---|---|---|
| S-TUI-REGISTRY | `.omo/evidence/2026-09-13-tui-unit-catalog-impl.md` implementation contract; `.omo/evidence/2026-09-13-tui-unit-inventory.md` candidate catalog | Bun test runner and the imported TUI feature registry | `bun test test/tui-feature-registry.test.ts` | PASS | `A1`, `A2` |
| S-CHAT-FACADE | `.omo/evidence/2026-09-13-chat-views-split.md` preserved behavior and public facade | Bun tests importing `WorkbenchChatView` through its existing module path | `bun test test/workbench-views.test.ts test/chat-render-acceptance.test.ts test/workbench-lifecycle-noise.test.ts test/delegation-tree-view.test.ts test/workbench-tracer-view.test.ts` | PASS | `A3` |
| S-CORE-EXTRACTIONS | `.omo/evidence/2026-09-13-project-workbench-extract-impl.md` and `.omo/evidence/2026-09-13-native-plan-revision-impl.md` | Bun unit/integration tests and source architecture checks | `bun test test/native-event-projection.test.ts test/completed-turn-note-scope.test.ts test/project-workbench.test.ts test/work-flow.test.ts test/workflow-projection.test.ts test/native-plan-wiring.test.ts test/architecture.test.ts` | PASS | `A4` |
| S-TYPESCRIPT | Current `package.json` `check` script | Repository TypeScript CLI | `bun run check` | PASS | `A5` |
| S-LOCAL-UNITS | Current `package.json` `units:check` script | Repository local units CLI | `bun run units:check` | PASS | `A6` |
| S-ARCHITECTURE | Current `package.json` test runner and `test/architecture.test.ts` | Bun architecture test suite | `bun test test/architecture.test.ts` | PASS | `A7` |
| S-ALL-TESTS | Current `package.json` `test` script | Full Bun test suite | `bun test` | PASS | `A8` |

### adversarialCases

| scenario id | criterion reference | adversarial class | expected behavior | verdict | artifactRefs |
|---|---|---|---|---|---|
| ADV-CHAT-UNSAFE-BODY | Chat public projection and compatibility contract | malformed role/status and body-bearing failed, cancelled, or streaming messages | Keep only safe public text, label unknown states, and continue rendering later messages. | PASS | `A3` |
| ADV-NATIVE-OVERSIZED-EVIDENCE | `native-event-projection.ts` bounded public projection contract | oversized nested Native evidence and completed reasoning payload | Redact reasoning content and bound/sanitize projected evidence while retaining only the public summary. | PASS | `A4` |
| ADV-NOTE-CROSS-TURN | `completed-turn-note-scope.ts` ownership contract | incomplete, reversed, cross-turn, non-owning, or interleaved foreign-thread selector | Reject invalid scopes and select only the target completed turn and its owning outbound question. | PASS | `A4` |
| ADV-PLAN-MALFORMED-IDENTITY | `native-plan-revision.ts` fail-closed contract | malformed Markdown, duplicate/status collapse, ambiguous revision identity, injected digest collision | Reject malformed or ambiguous revisions, preserve orphan attribution, and throw on an injected full digest collision. | PASS | `A4` |
| ADV-REG-RETIRED-ID-COLLISION | TUI unit ID retirement contract | reserved-ID reuse | Not applicable because the current catalog reserves no retired IDs (`TUI_RETIRED_FEATURE_UNIT_IDS` is empty). | not_applicable | `A2` |

### artifactRefs

| id | kind | description | path |
|---|---|---|---|
| A1 | test transcript | Registry contract tests: 16 features, 35 exact titles, uniqueness, parent linkage, sequential numbering, and retired-ID non-reuse assertion; 4 pass / 158 assertions. | `.omo/evidence/2026-09-13-tui-core-independent-qa.md` — `Registry 16/35 contract` |
| A2 | runtime comparison transcript | Corrected runtime registry versus inventory ordered comparison: 35/35 exact ID/title pairs, retired ID list empty, exit code 0. | `.omo/evidence/2026-09-13-tui-core-independent-qa.md` — `Corrected independent registry-to-inventory comparison` |
| A3 | test transcript | Existing chat facade render consumers and adversarial message cases: 114 pass / 1,195 assertions across 5 files. | `.omo/evidence/2026-09-13-tui-core-independent-qa.md` — `Chat facade compatibility and render consumers` |
| A4 | test transcript | Three Core extraction suites, caller regressions, malformed/oversized inputs, and architecture: 200 pass / 2,530 assertions across 7 files. | `.omo/evidence/2026-09-13-tui-core-independent-qa.md` — `Core extractions and call-site regressions` |
| A5 | CLI transcript | Full TypeScript check; exit code 0. | `.omo/evidence/2026-09-13-tui-core-independent-qa.md` — `TypeScript check` |
| A6 | CLI transcript | Local unit/Linear-link check; exit code 0; output includes 5 Units and 32 links. | `.omo/evidence/2026-09-13-tui-core-independent-qa.md` — `Local units check` |
| A7 | test transcript | Architecture suite; 13 pass / 1,554 assertions. | `.omo/evidence/2026-09-13-tui-core-independent-qa.md` — `Architecture suite` |
| A8 | test transcript | Full repository suite; 1,199 pass / 0 fail / 9,609 assertions across 133 files. | `.omo/evidence/2026-09-13-tui-core-independent-qa.md` — `Complete test suite` |
no skip/only declarations found

exit_code=0
```

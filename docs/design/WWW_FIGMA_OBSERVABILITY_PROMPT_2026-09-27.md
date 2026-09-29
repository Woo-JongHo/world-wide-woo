# Figma 전달 프롬프트 — WWW 관측 화면

## 역할과 산출물

Design four production desktop TUI surfaces for WWW: `Chat`, `Usage`, `Context`, and `Monitor`.

Deliver editable Figma frames and reusable terminal primitives, not website mockups. Each frame must show both:

1. an `OBSERVED` populated state;
2. an `UNOBSERVED / PARTIAL` state that does not replace missing data with zero.

Base viewport: `1536 × 840`. Treat pixel sizes as design guidance; the production implementation uses terminal columns and rows.

## Product truth that the design must respect

- WWW is a native terminal workbench for observing AI work.
- Global chrome is `TOP BAR → GOAL BAR → PAGE → GLOBAL TELEMETRY FOOTER`.
- The footer spans 100% width.
- `OBSERVED`, `DERIVED`, and `UNOBSERVED` are different data states.
- Never invent history, source attribution, model outcomes, private reasoning, or span metadata.
- Synthetic demo values must be visibly labeled `DEMO DATA · NOT LIVE TELEMETRY`.
- Do not expose private chain-of-thought. Use only emitted public decision summaries.

## Shared visual system

Use a disciplined terminal analytics language:

- Background `#080A0D`
- Raised working surface `#0D1117`
- Primary text `#D8DEE9`
- Secondary text `#77808C`
- Separator `#252B33`
- Cyan active/selected `#57C7FF`
- Green success `#73D18B`
- Amber attention/retry `#E5B567`
- Red failure `#F07178`

Typography: one production monospace family throughout. Use weight, brightness, and column alignment rather than large type changes. Avoid decorative uppercase labels except compact telemetry headings that behave like terminal commands or protocol fields.

Use:

- 1px separators;
- strict character-grid alignment;
- bars, heat cells, timelines, trees, and compact tables;
- 24px outer horizontal padding and 12–16px gaps in the Figma frame;
- nearly square corners and no card shadows.

Do not use gradients, glass, oversized rounded cards, provider rainbow colors, giant KPI tiles, or filler prose.

## Reusable components to create

- Global top bar and goal bar
- Global telemetry footer
- Section header with optional state metadata
- Aligned terminal table
- Horizontal usage bar
- Heatmap cell with `absent / low / medium / high / dominant`
- Status mark with `pending / running / completed / skipped / failed / blocked`
- `UNOBSERVED` placeholder row
- Compact inspector grid
- Timeline/waterfall row
- Focus and selected-row treatment
- Drawer/overlay shell for secondary details

## Frame 1 — Chat / Work

Primary purpose: conversation and work output dominate; the right rail explains the current run without becoming a second dashboard.

Layout:

- Left Chat/Work: 70–72%
- Divider: 1px
- Right Run Inspector: 28–30%, never above 30% by default
- Apply the same left width to Chat transcript, Report output, and Composer
- Only the global footer spans the full frame

The right rail contains only these sections, in this order:

1. RUN
2. PIPELINE
3. CURRENT PLAN
4. ACTIVITY
5. INSPECT

Use a dense composition:

```text
RUN                                      4 / 7
● DECIDE · 1m54s              GPT-5.6 Sol · Low

PIPELINE
✓ Understand
✓ Decompose
✓ Ground
● Decide                               1m54s
○ Execute
○ Verify
○ Deliver

CURRENT PLAN
› root render 원인 확인                  NOW
  stale state 분리                       NEXT
  fixture 계층 측정
  viewport 최적화

ACTIVITY
✓ source read                            18s
✓ inspect deps                            4s
✓ diff fixture                            8s
● benchmark                              31s

INSPECT
Stage    DECIDE          Agent     build
Task     render-profile  Tool      bash
Model    GPT-5.6 Sol     Effort    Low
Turns    7               Retry     0
Tests    0 / 0           Evidence  73
```

If duration or metadata is unavailable, show `—`; do not infer it. Do not add Usage, Context, Cache, repository, or quota metrics to this rail.

Responsive state: below the minimum two-pane width, keep Chat full width and turn Run Inspector into a keyboard-toggle drawer. Do not squeeze Chat to 55%.

## Frame 2 — Usage

Primary purpose: show model consumption and placement evidence. This page uses the full working width; it does not use the Chat split.

Priority:

1. MODEL × STAGE
2. MODEL × ROLE
3. MODEL SHARE
4. SELECTED MODEL
5. RECENT ROUTING
6. TREND only when history exists

Composition:

```text
SUMMARY STRIP
MODEL SHARE              | MODEL × STAGE
MODEL × ROLE — full width
USAGE TREND              | SELECTED MODEL
RECENT ROUTING — full width
```

Summary is one or two telemetry lines, maximum 70px high:

```text
53.4M TOKENS │ 241 REQUESTS │ 7 MODELS │ 96.8% REQUEST SUCCESS
DIRECT 98.8% │ DETACHED 1.2% │ OBSERVATION PARTIAL
```

Important semantic corrections:

- Label success as `REQUEST SUCCESS`, not model quality.
- `MODEL × ROLE` is `DERIVED FROM STAGE SEMANTICS` until the runtime records explicit roles.
- When history is absent, replace the chart with `USAGE TREND · UNOBSERVED — no persisted run series`.
- Do not show model-specific Outcome, Retry, Stage token, or Recent Routing token values unless attribution exists.
- Subscription quota stays in the global footer. Put detailed quota in an optional compact drawer, not in the main canvas.

MODEL SHARE uses muted bars, cyan selection, and amber only for a defined concentration warning. Include token value and percent.

MODEL × STAGE columns are `UND DEC GND DCD EXE VER DLV`. Provide a real intensity legend. A missing observation is `·` or `—`, distinct from observed zero.

MODEL × ROLE columns are `BUILD THINK GROUND REVIEW FAST`. Add a small metadata label: `DERIVED · stage semantic mapping`.

Interaction prototype:

- ↑↓ select a model
- Tab move visualization focus
- Enter inspect
- Esc clear
- ←→ change metric only when multiple observed metrics exist

Selection highlights the same model row across share, stage, role, selected model, and recent routing. For the trend frame, show both the filtered state and the unavailable state.

## Frame 3 — Context

Primary purpose: profile context pressure and identify observable causes of unnecessary context consumption. This page uses the full working width.

The current live product observes total used tokens, context window, and percent. It does not yet observe per-source token shares, repeated injection, churn quantity, or waste candidates. The design must therefore include two modes:

### Live baseline now

```text
CONTEXT BUDGET                      184K / 258K  71%
[ unified occupancy bar ]
USED 184K   FREE 74K
SOURCE ALLOCATION · UNOBSERVED

LOADED CAPABILITIES
SKILLS 24 loaded · token share unobserved
MCP    12 enabled · token share unobserved
MEMORY  3 entries · token share unobserved
```

Do not show fake producer bars, growth curves, repeated-load heatmaps, or waste rows in this mode.

### Future telemetry mode

Use this priority:

1. Context Budget
2. Context Producers
3. Context Growth
4. Repeated Injection
5. Waste Candidates
6. Tool → Context
7. Context Flow
8. Loaded Capabilities

Every waste row requires an observable reason such as duplicate digest, repeated reinjection, stale revision, or oversized result. Use `SUSPECTED WASTE`, never definitive `USELESS`.

Context producer and tool tables use aligned `TOKENS / EVENTS / Δ PER TURN / AVG / MAX / REPEAT`. Unknown columns render `— unobserved`.

Repeated Injection uses recent turns as columns and producer identity as rows. Amber highlights reason-bearing repetition only, not every repeat.

Context Flow distinguishes `ADDED`, `COMPRESSED`, `EVICTED`, `RETRIEVED`, and `RE-INJECTED`. Do not calculate churn without event history.

Selected Producer Inspector is a compact grid with flags and activity references. Raw payload is collapsed by default.

## Frame 4 — Monitor

Primary purpose: observe one request as a trace from submission to delivery. This page uses the full working width.

The current product has seven public request stages, active model/tool/agent, approvals, retry/failure counts, recent semantic events, public decisions, and UI render-layer timing. It does not yet have a complete OpenTelemetry-style span tree.

Create three explicit states:

1. `CURRENT LIVE BASELINE` — only currently observed fields
2. `PARTIAL TRACE` — some spans lack endpoints or token metadata
3. `FULL TRACE` — future span contract populated

Layout:

```text
RUN SUMMARY — full width
RUN TRACE / WATERFALL        | NOW + SELECTED SPAN
TRACE TREE                   | DECISIONS
LATENCY BREAKDOWN            | FAILURES / RETRIES
MODEL CALLS                  | TOOL OBSERVABILITY
RESULT — full width
```

The waterfall gets the most visual space. Parallel children align beneath their parent. Pending is gray, running/selected/critical path cyan, completed green, retry/wait amber, failed red.

Observability constraints:

- Show public decision summaries only; never private chain-of-thought.
- Missing start or end means duration is `— unobserved`.
- TTFT, TTFA, TTLT, input/output tokens, finish reason, span IDs, and critical path appear only in Full Trace.
- Keep `UI RENDER HEALTH` separate from AI run latency. Do not mix render p95 with model/tool span timing.
- Failure rows separate `ERROR TYPE`, `LIKELY CAUSE`, and `RECOVERY`; likely cause remains unobserved unless evidence supports it.
- Raw tool input/output is collapsed and opened through an activity reference.

The baseline NOW area should remain highly visible:

```text
NOW
● VERIFY
  benchmark fixture result
Model      GPT-5.6 Sol
Tool       —
Elapsed    31s
```

Decision events may use `HYPOTHESIS`, `EVIDENCE`, `DECISION`, `OBSERVATION`, `REVISION`, `PLAN CHANGE`, and `VERIFY RESULT` only when explicitly emitted by the runtime.

## Prototype behavior

For Usage, Context, and Monitor, prototype keyboard focus visibly:

- Tab: next region
- Shift+Tab: previous region
- ↑↓: row selection
- Enter: inspect selected item
- Space: expand/collapse when children exist
- Esc: close inspector or clear selection

Do not put shortcuts in the visual design unless the matching interaction exists in the prototype. Use a compact footer hint only for the active region.

## Required Figma pages

1. `00 Foundations` — palette, type, spacing, states, primitives
2. `01 Chat` — desktop observed + narrow drawer state
3. `02 Usage` — observed + trend-unobserved + selected model
4. `03 Context` — live baseline + future telemetry + unobserved
5. `04 Monitor` — live baseline + partial trace + full trace
6. `05 Interaction Map` — keyboard focus and inspector transitions
7. `06 Data Contract Notes` — mark every field OBSERVED, DERIVED, or UNOBSERVED

## Final quality check

- Chat clearly dominates its right inspector.
- Dedicated analytics pages do not inherit the Chat split.
- Stage and role matrices are visually primary in Usage.
- Context looks like a profiler, but live baseline does not pretend source attribution exists.
- Monitor looks like a trace debugger, but full span concepts are visibly future-contract states.
- No panel exists only to fill empty space.
- All tables share stable axes and remain legible at reduced width.
- The result feels like a native terminal instrument, not a SaaS dashboard placed on a dark background.


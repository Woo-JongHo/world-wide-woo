# WWW Figma Prompt — Chat / Work

Design the production desktop `Chat` surface for WWW, an AI-native terminal workbench. This is a native TUI, not a web chat or SaaS dashboard.

## Primary job

The conversation, work output, final report, and composer must dominate the interface. A narrow Run Inspector explains the active request without competing with Chat.

The memorable design decision is spatial hierarchy: the left work surface is unmistakably primary and the right inspector is a dense instrument rail.

## Product truth

- Global order: `TOP BAR → GOAL BAR → CHAT WORKSPACE → GLOBAL TELEMETRY FOOTER`.
- The footer spans 100% width.
- Session Goal is real runtime state. If absent, do not invent a placeholder goal.
- The right rail observes run state; it does not own Usage, Context, Cache, repository, or provider quota.
- Missing metadata is `— unobserved`, never zero or an inferred value.
- This Figma design guides a terminal implementation measured in columns and rows.

## Frame and layout

Create a `1536 × 840` desktop frame.

- Left Chat / Work: 70–72%, target approximately 1105px.
- Divider: 1px.
- Right Run Inspector: 28–30%, target approximately 430px.
- The right inspector must never exceed 30% in the default layout.
- Chat transcript, work cards, final Report, and Composer use the same left boundary.
- The global telemetry footer spans both columns.

Also create a narrow state where Chat remains full width and the Run Inspector becomes a keyboard-toggle drawer. Never compress Chat to a 55:45 split.

## Visual system

- Background `#080A0D`
- Working surface `#0D1117`
- Primary text `#D8DEE9`
- Secondary text `#77808C`
- Separator `#252B33`
- Selected/running cyan `#57C7FF`
- Success green `#73D18B`
- Attention/wait amber `#E5B567`
- Failure red `#F07178`

Use one production monospace family. Use fixed columns, one-cell separators, restrained weight changes, and near-square corners. No gradients, glass, shadows, large rounded cards, decorative illustrations, or filler prose.

## Global chrome

Top example:

```text
WWW / 99_www / Chat

GOAL
현재 요청을 실행하고 근거와 결과를 확인한다
```

Bottom telemetry example:

```text
Render p95 18ms  │  Context 184K / 258K 71%  │  Cache 96%  │  manual mode
```

Keep the footer compact and one or two terminal rows maximum.

## Left Chat / Work surface

Preserve a readable chronological transcript. Show user request, public work activity, tool/result cards, and final Operation Report as distinct semantic rows rather than identical cards.

- User messages: strong but quiet boundary.
- Live activity: one current indicator; do not animate every row.
- Tool output: command, state, bounded preview, exit/duration only when observed.
- Report: remains inside the left column and uses aligned result/evidence rows.
- Composer: fixed at the bottom of the left column, with draft and queue state preserved visually.

Do not turn the transcript into a dashboard. Spend visual emphasis on the active work row and keep completed history muted.

## Right Run Inspector

The rail contains only these five sections in fixed order:

1. RUN
2. PIPELINE
3. CURRENT PLAN
4. ACTIVITY
5. INSPECT

Use high density and strict alignment:

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

RUN should occupy approximately two rows. PIPELINE rows have no decorative gaps. CURRENT PLAN uses the far-right column for `NOW`, `NEXT`, or blank. ACTIVITY aligns duration to the far right. INSPECT is a two-group grid, not a single key/value list.

If a duration, model, tool, test count, or evidence count is not observed, render `—`; do not complete the row with guessed values.

## Density and ownership rules

- Do not add descriptive prose merely to fill the inspector.
- RUN is approximately two rows: progress on the first axis, active stage/model/effort on the second.
- PIPELINE uses one compact row per stage with no card wrapper and no excessive vertical gap.
- CURRENT PLAN shows only the active plan hierarchy and compact `NOW` / `NEXT` metadata.
- ACTIVITY is a bounded recent list, not the full event journal. Align duration to one shared far-right axis.
- INSPECT uses exactly two aligned key/value groups per row when width permits.
- Do not duplicate `Monitor`, `Dashboard`, `Usage`, `Context`, or `Cache` inside the rail.
- Do not fill unused space with repository status, token quota, context capacity, marketing copy, or unrelated health metrics.

The desired rail must feel significantly denser and narrower than a conventional sidebar. It is an instrument panel attached to Chat, not a second page.

## Report and Composer continuity

- Final Operation Report remains in the left work surface and never expands under the inspector.
- Report evidence rows use the same left/right axes as work results.
- Composer width matches the transcript exactly.
- Queue, approval, send uncertainty, and interruption indicators appear adjacent to Composer without changing the 72:28 split.
- Long tool output scrolls or truncates inside the left surface; it must not push the inspector wider.

## Interaction prototype

- Tab from Composer with an empty draft: move focus to the active reading surface.
- ↑↓ or J/K: move within the focused scroll/rail.
- Enter: inspect the selected activity when a real target exists.
- Esc: close the rail drawer or return focus; never imply approval or cancellation.
- Ctrl+C: show interruption separately from navigation.

Only display shortcuts that the prototype actually implements.

## Required states

Create these editable frames:

1. Desktop, request running at DECIDE.
2. Desktop, request delivered with final Report visible.
3. Desktop, approval waiting; waiting is not shown as active computation.
4. Partial observation with missing durations and model metadata.
5. Narrow viewport with Run Inspector drawer closed.
6. Narrow viewport with Run Inspector drawer open.

## Components

Create reusable components for top bar, goal bar, transcript row, tool result, report section, composer, run summary, pipeline row, plan row, activity row, inspector grid, focus state, and telemetry footer.

## Final acceptance

- Left Chat/Work is visually dominant at first glance.
- Inspector stays at or below 30% in the default desktop frame.
- Chat, Report, and Composer share the same left width.
- Only the footer spans 100%.
- The rail contains no unrelated metrics.
- Empty rail space remains empty or says `— unobserved`; it is not filled with prose.
- The result feels like a focused terminal workbench, not a two-column web dashboard.

# WWW Figma Prompt — Context

Design the production desktop `Context` view for WWW, an AI-native terminal workbench. This screen is a context profiler, not a context-window quota dashboard.

## Primary job

Help the user see current context pressure and, when telemetry exists, identify repeated or oversized contributors that may be consuming context unnecessarily.

The memorable visual center is one segmented Context Budget rail combined with a forensic Repeated Injection heatmap. The design must remain honest when source attribution is unavailable.

## Product truth

Current live WWW observes:

- used context tokens;
- context window;
- occupancy percentage;
- loaded skill inventory;
- MCP enabled/status counts;
- chat/activity/note counts;
- some cache logical-byte observations.

Current live WWW does not yet observe:

- token share by Conversation, Tool, Skill, Memory, Retrieval, or Workflow;
- per-turn context samples;
- repeated injection identity;
- compress/evict/retrieve/reinject quantities;
- tool-result token contribution;
- reason-bearing waste candidates.

Therefore create separate `LIVE BASELINE` and `FUTURE TELEMETRY` frames. Never present future data as current product behavior.

## Frame and layout

Create a `1536 × 840` full-width analysis frame.

```text
TOP BAR
GOAL BAR
CONTEXT VIEW — full working width
GLOBAL TELEMETRY FOOTER
```

Do not use the Chat split. Use 24px outer horizontal padding, 12–16px gaps, 1px separators, and strict terminal columns.

## Visual system

- Background `#080A0D`
- Working surface `#0D1117`
- Primary text `#D8DEE9`
- Secondary text `#77808C`
- Separator `#252B33`
- Active/selected cyan `#57C7FF`
- Efficient/normal green `#73D18B`
- Suspected redundancy amber `#E5B567`
- Pathological loop/failure red `#F07178`

Use a production monospace family. Use bars, heatmaps, compact timelines, aligned tables, and flow diagrams. No gradients, glass, large cards, circular gauges, decorative percent rings, or prose-heavy reports.

## Global chrome

```text
WWW / 99_www / Context

GOAL
컨텍스트 예산을 과도하게 소비하거나 반복 주입하는 원인을 관찰한다
```

## Live baseline frame

Show only what the current product can support:

```text
CONTEXT BUDGET                         184K / 258K  71%
███████████████████████████████████░░░░░░░░░░░░░
0             64K             128K              258K

USED        184K
FREE         74K
Δ / TURN      — unobserved
PEAK          — unobserved

SOURCE ALLOCATION · UNOBSERVED
Native reports overall occupancy only
```

Include pressure thresholds as a quiet axis, not a decorative gauge:

```text
NORMAL            PRESSURE             CRITICAL
0──────────────60%───────80%────────────────95%──100%
                         ● 71%
```

Loaded capability summary:

```text
SKILLS      24 loaded  · token share unobserved
MCP         12 enabled · token share unobserved
MEMORY       3 entries · token share unobserved
WORKFLOW     5 steps   · token share unobserved
```

Do not show fake producer bars, growth curves, repeated-load cells, waste rows, or churn totals in this frame.

## Future telemetry frame

Clearly label the frame `FUTURE TELEMETRY CONTRACT`. Use this priority:

1. CONTEXT BUDGET
2. CONTEXT PRODUCERS
3. CONTEXT GROWTH
4. REPEATED INJECTION
5. WASTE CANDIDATES
6. TOOL → CONTEXT
7. CONTEXT FLOW
8. LOADED CAPABILITIES

### Context Producers

```text
SOURCE             DISTRIBUTION             TOKENS  EVENTS  Δ/TURN
Conversation       ████████████████           71K      79    +3.2K
Tool results       █████████████              59K      41    +4.7K
Skills             ██████                     27K      24    +0.2K
Memory             ███                        13K       3    +0.1K
```

Only use these values in the future frame. Align numeric axes.

### Context Growth

Use a compact line graph over recent turns. Overlay observed events such as `+ TOOL`, `+ RETRIEVAL`, `+ SKILL`, `~ COMPRESS`, and `× EVICT`. Events must line up with the same time/turn axis.

### Repeated Injection

```text
SOURCE                 T-7 T-6 T-5 T-4 T-3 T-2 T-1 NOW
system instructions     █   █   █   █   █   █   █   █
rpa-build skill         ░   █   █   █   █   █   █   █
git diff result         ·   █   █   ▓   █   ·   █   █
repo map                ·   █   ·   █   ·   █   ·   █
```

Legend: `· absent`, `░ small`, `▒ medium`, `▓ large`, `█ heavy`. Repetition alone is neutral gray. Amber requires an observable diagnostic reason.

### Waste Candidates

Use the title `SUSPECTED WASTE` or `WASTE CANDIDATES`, never `USELESS CONTENT`.

```text
SOURCE                 TOKENS   REASON             COUNT
git diff                31.2K   REPEATED_LOAD        ×6
tool/bash result        18.4K   OVERSIZED_RESULT     ×2
skill:rpa-build         12.1K   RELOADED              ×7
search result #24        8.7K   DUPLICATE             ×4
old progress log         6.9K   STALE_CANDIDATE        —
```

Every row needs an observable reason such as duplicate digest, repeated reinjection, stale revision, or an explicit oversized threshold. Size alone is not waste.

### Tool → Context

This is not general tool monitoring. Show only context contribution with `CALLS / AVG / MAX / CONTEXT / REPEAT`.

```text
TOOL          CALLS    AVG      MAX      CONTEXT   REPEAT
read_file       22     3.1K     12K        68K       ×4
git diff         9     4.9K     18K        44K       ×6
shell           17     1.7K      9K        29K       ×2
web search       6     3.0K      7K        18K       ×1
Linear           4     2.0K      3K         8K        —
```

Also show a compact bar ranking. `AVG RESULT`, `MAX RESULT`, and `REPEAT COUNT` appear only when measured. This section measures context contribution, not tool health or general latency.

### Context Flow

Show `ADDED`, `COMPRESSED`, `EVICTED`, `RETRIEVED`, and `RE-INJECTED`. Highlight churn only when repeated identity movement is observed.

```text
CONTEXT FLOW

         +93K
INPUT ─────────► ACTIVE CONTEXT
                   │
             ┌─────┼──────┐
             │     │      │
          -24K   -18K    +21K
         COMPRESS EVICT  RETRIEVE

ADDED         +93K
COMPRESSED    -24K
EVICTED       -18K
RETRIEVED     +21K
RE-INJECTED   +14K
CHURN          170K
```

The Churn total is neutral by default. Mark `ATTENTION` only when the same identity repeatedly follows patterns such as `load → compress → retrieve → inject`.

### Loaded Capabilities

Skills and MCP must not dominate the screen. Default collapsed state:

```text
SKILLS                       24 loaded
MCP                          12 enabled
MEMORY                        3 entries
WORKFLOW                      5 steps
```

When contribution is observed, add the token value. Otherwise state `token share unobserved`. Individual skill/server names appear only after expansion.

## Selected producer inspector

Use a compact grid:

```text
SELECTED  git diff
TYPE      tool result       CALLS       9
CONTEXT   44.2K             AVG         4.9K
MAX       18.1K             REINJECTED  6
LAST      turn #3329

FLAGS
! REPEATED_LOAD
! OVERSIZED_RESULT

TRACE  #3321 → #3324 → #3326 → #3329
```

Raw content remains collapsed.

Allow these actions only in the future telemetry prototype:

```text
Enter   inspect trace
Space   expand
M       open Monitor
Esc     back
```

## Visual priority

Preserve this order even when the screen becomes dense:

1. Current context pressure
2. Largest context producers
3. Sudden context growth
4. Repeated injection
5. Suspected waste
6. Tool-result bloat
7. Churn
8. Loaded capability counts

Do not give Active Model or Effort configuration prominent cards. Those belong to Run or Monitor.

## Diagnostic language

Never claim content is definitely useless unless directly proven. Use `SUSPECTED WASTE`, `REDUNDANCY`, `REPEATED LOAD`, `STALE CANDIDATE`, and `OVERSIZED RESULT`. Every diagnostic flag must link to an observable reason and trace/activity identity.

## Interaction prototype

- Tab / Shift+Tab moves between profiler regions.
- ↑↓ selects producer or candidate rows.
- Enter inspects trace.
- Space expands capability groups.
- M opens Monitor only when a trace target exists.
- Esc closes the inspector.

## Required states

1. Live baseline with unified occupancy and source allocation unobserved.
2. No context telemetry at all.
3. Pressure state above 80%.
4. Future telemetry populated.
5. Future telemetry with suspected repeated load selected.
6. Narrow stacked layout without horizontal overflow.

## Final acceptance

- Current pressure is the first thing visible.
- Live baseline never fabricates producer shares or waste.
- Future diagnostics identify evidence-backed suspicion, not certainty.
- Skills and MCP counts remain secondary.
- Observed zero and unobserved are distinct.
- The result feels like a memory/context profiler for an AI runtime.

# WWW Figma Prompt — Monitor

Design the production desktop `Monitor` view for WWW, an AI-native terminal workbench. This is a terminal-native distributed trace debugger for one AI request, not a generic status dashboard.

## Primary job

Show what the request is doing now, how execution unfolded, what ran in parallel, where time and retries accumulated, which observed decisions changed direction, and what produced the final result.

The memorable visual center is the Run Trace waterfall. Everything else explains or inspects that trace.

## Product truth

Current live WWW observes:

- seven public stages: UNDERSTAND, DECOMPOSE, GROUND, DECIDE, EXECUTE, VERIFY, DELIVER;
- active request, model, agent, tool, and approval;
- retry and failure counts;
- recent semantic events with activity identity;
- public decisions and plan changes emitted by the runtime;
- some in-process UI render-layer timings.

Current live WWW does not yet guarantee:

- a normalized span tree with trace/span/parent IDs;
- model call input/output tokens and finish reason;
- TTFT, TTFA, or TTLT;
- category-complete latency attribution;
- request critical path;
- model-specific failure overhead.

Create three explicit product states: `CURRENT LIVE BASELINE`, `PARTIAL TRACE`, and `FULL TRACE · FUTURE CONTRACT`.

## Frame and layout

Create a `1536 × 840` full-width desktop frame.

```text
TOP BAR
GOAL BAR
RUN SUMMARY — full width
RUN TRACE / WATERFALL        | NOW + SELECTED SPAN
TRACE TREE                   | DECISIONS
LATENCY BREAKDOWN            | FAILURES / RETRIES
MODEL CALLS                  | TOOL OBSERVABILITY
RESULT — full width
GLOBAL TELEMETRY FOOTER
```

Do not use the Chat split. Approximate visual priority:

- Trace 40%
- Inspection 20%
- Decision events 15%
- Failures 10%
- Tools/models 10%
- Secondary latency/saturation 5%

## Visual system

- Background `#080A0D`
- Working surface `#0D1117`
- Primary text `#D8DEE9`
- Secondary text `#77808C`
- Separator `#252B33`
- Running/selected/critical cyan `#57C7FF`
- Completed green `#73D18B`
- Wait/retry amber `#E5B567`
- Failed red `#F07178`

Use one production monospace family, fixed time axes, compact tables, tree indentation, and 1px separators. No gradients, glass, large cards, decorative charts, or long prose blocks.

## Global chrome

```text
WWW / 99_www / Monitor

GOAL
현재 요청이 어디에서 시간을 쓰고 왜 실행 방향이 바뀌는지 관찰한다
```

## Current live baseline

Design a truthful baseline that works before full spans exist:

```text
RUN  request-3329       ● RUNNING       4m25s
STAGE 4 / 7             RETRY 6         FAILURE 5
MODEL GPT-5.6 Sol       TOOL benchmark
```

Show the seven-stage pipeline and recent semantic event timeline. Missing span durations, call counts, token totals, and first-token timings render as `— unobserved`.

Keep `UI RENDER HEALTH` in a separate, explicitly labeled diagnostic subsection. Never mix render p95 with model/tool run latency.

## Full Trace future contract

### Run summary

Use a compact strip:

```text
RUN #3329  ● RUNNING  4m25s │ TTFT 1.8s │ TTFA 12.4s │ TTLT —
MODEL 7 │ TOOL 24 │ FAILURE 5 │ RETRY 6 │ TOKENS 184K │ CONTEXT 71%
```

Only populate fields supported by the Full Trace contract.

Adapt the four observability signals explicitly:

- LATENCY: response, model, tool, wait, retry duration.
- TRAFFIC: model calls, tool calls, spans, retrievals, subagents.
- ERRORS: failures, retries, cancellations, recovered/fatal split.
- SATURATION: context, queue, concurrency, rate limit, quota.

### Run Trace waterfall

Use a stable horizontal time scale:

```text
                    0s      10s      20s      30s      40s
REQUEST             █
ROUTE                ██
UNDERSTAND             ████
MODEL                  ███████
PLAN                          ██
read source                    █████
inspect deps                   ███
benchmark                         ███████
MODEL                                ███████
VERIFY                                      ███
RETRY                                          ██
DELIVER                                           ███
```

Parallel spans share the same parent row group. Running/selected/critical is cyan, completed green, retry/wait amber, failed red, pending gray. Do not show every trivial internal event by default.

### Trace tree

```text
● Run #3329
├─ ✓ Understand
│  └─ ✓ model · GPT-5.6 Sol               4.2s
├─ ✓ Decompose
│  ├─ ✓ model · GPT-5.6 Sol               8.3s
│  └─ ✓ public plan                       0.2s
├─ ● Ground
│  ├─ ✓ read source                      18.2s
│  ├─ ✕ command execution                 2.1s
│  ├─ ✓ command execution                 3.8s retry
│  └─ ● benchmark                        31.1s
├─ ○ Decide
├─ ○ Execute
├─ ○ Verify
└─ ○ Deliver
```

Use meaningful spans only. Expand/collapse children.

### Decisions

Never show raw or inferred private chain-of-thought. Show only emitted public events:

```text
00:04  HYPOTHESIS
       Stage report producer may be malformed
00:11  EVIDENCE
       4 invalid public Stage reports observed
00:17  DECISION
       inspect serialization before renderer
00:46  REVISION
       renderer hypothesis rejected
```

Allowed types: HYPOTHESIS, EVIDENCE, DECISION, OBSERVATION, REVISION, PLAN CHANGE, VERIFY RESULT. If the runtime did not emit one, show no event.

### Failures and retries

```text
TIME   OPERATION          ERROR              RECOVERY
00:42  stage parser       INVALID_FORMAT     retry
01:03  command execution  EXIT_CODE_1        retry
01:17  model              RATE_LIMIT         backoff
02:08  read source        NOT_FOUND          alternate path
```

Separate `ERROR TYPE`, `LIKELY CAUSE`, and `RECOVERY`. Cause is `— unobserved` unless evidence supports it. Wasted time/tokens appear only if attribution exists.

When fully observed, include:

```text
FAILED SPANS       5
RECOVERED          4
FATAL              0
RETRIES            6
WASTED TIME       42s
WASTED TOKENS     18K
FAILURE OVERHEAD  16%
```

Do not show overhead percentages unless failed/retry spans can be attributed without double-counting overlap.

### Tool and model tables

Tool rows distinguish current-run actual duration from any historical p95 baseline. Model rows use `MODEL / EFFORT / INPUT / OUTPUT / LATENCY / FINISH / STATUS`, with unsupported values shown as `—`.

Tool example:

```text
TOOL               CALLS  SUCCESS  FAIL  TOTAL   BASELINE P95
read_file             12       12     0    18s             —
commandExecution       7        6     1    41s            18s
git diff               3        3     0    35s            18s
web                    2        2     0     8s             —
```

Model-call example:

```text
#  MODEL  EFFORT  INPUT→OUTPUT  LATENCY  FINISH      STATUS
1  Sol    Low       42K→3K        8.2s  tool_calls  ✓
2  Sol    Low       51K→2K       11.7s  tool_calls  ✓
3  Luna   —         18K→1K        2.1s  stop        ✓
4  Sol    Med       71K→4K       18.4s  error       ✕
```

### Latency and critical path

Only calculate category share and critical path in Full Trace. Do not sum overlapping spans as if they were sequential. Highlight the critical path in cyan and keep parallel non-critical spans muted.

```text
TOTAL                       4m25s
MODEL       ████████████    2m08s   48%
TOOLS       ███████         1m14s   28%
WAIT        ███               31s   12%
RETRY       ██                24s    9%
OTHER       █                  8s    3%
```

Definitions:

- TTFT: time until the first streamed model token.
- TTFA: time until the first user-visible answer token.
- TTLT: total time until the final streamed token.

Do not merge or rename these into one response-time metric.

Critical path example:

```text
CRITICAL PATH                     3m41s / 4m25s
Request → Sol → read source → git diff → Sol → verify → final
```

### Saturation

Keep this secondary to the trace:

```text
SATURATION
Context       ██████████████░░  71%
Concurrency   ██░░░░░░░░░░░░   2 / 8
Queue         ░░░░░░░░░░░░░░   0
Rate limit    NORMAL
Quota         NORMAL
```

Unsupported rows show `— unobserved`. Do not turn Monitor into a resource dashboard.

## NOW and Selected Span

NOW remains visible in every state:

```text
NOW
● VERIFY
  benchmark fixture result
Model      GPT-5.6 Sol
Tool       —
Elapsed    31s
```

Selected span is a compact grid with trace, span, parent, state, start, duration, error, retry link, token fields, and activity reference. Raw input/output is collapsed by default.

Selected span example:

```text
SPAN        commandExecution
Trace       3329          Span       7fa92
Parent      Execute       Status     FAILED
Start       22:38:11      Duration   2.14s
Command     bun test ...  Exit       1
Error       ASSERTION_FAILED
Retry       #2 / 3
Input       1.2K          Output     4.8K
Next        retry with isolated fixture
```

Provide tabs or compact modes for `Details / Input / Output / Error / Events / Parent / Children`. Do not dump large raw payloads by default.

## Result

At the end show `DELIVERED`, `FAILED`, or `CANCELED` from observed request state. Totals must come from trace data; unavailable totals remain `— unobserved`.

## Interaction prototype

- Tab / Shift+Tab moves between trace, tree, decisions, and inspector.
- ↑↓ selects rows.
- Space expands/collapses children.
- Enter inspects the selected span.
- F filters failures, T tools, M models only when the prototype implements those filters.
- Esc closes details or returns to the prior surface.

## Required states

1. Current live baseline with seven stages and NOW.
2. Partial trace with missing endpoints.
3. Full future trace with parallel spans.
4. Retry recovered.
5. Fatal failure.
6. Delivered result.
7. Narrow stacked layout without horizontal overflow.

## Final acceptance

- The waterfall receives the most space.
- NOW is discoverable immediately.
- Public decisions never become private reasoning.
- Baseline does not fabricate spans or token attribution.
- UI render latency remains separate from AI execution latency.
- Failures show location and recovery without unsupported root-cause claims.
- The result feels like an OpenTelemetry-inspired terminal debugger for AI work.

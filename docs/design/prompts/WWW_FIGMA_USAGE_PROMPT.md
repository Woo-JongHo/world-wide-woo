# WWW Figma Prompt — Usage

Design the production desktop `Usage` view for WWW, an AI-native terminal workbench. This is a terminal analytics console, not a subscription dashboard or Grafana-like website.

## Primary job

Help the user understand how much each model was used, where it was placed in the seven-stage runtime, what semantic role it served, and what evidence exists for improving future routing.

The memorable visual center is the pair of aligned matrices: `MODEL × STAGE` and `MODEL × ROLE`.

## Product truth

- The current product observes model token totals for the attached process/session.
- It observes request stages and the model recorded on each stage.
- Role is currently `DERIVED FROM STAGE SEMANTICS`, not an explicit provider role event.
- Persisted daily/run history is not currently available.
- Model-specific outcome, retry, effort, and token attribution per stage are not always available.
- Missing data is `— unobserved`, distinct from observed zero.
- Subscription quota is secondary and primarily belongs in the global footer.

## Frame and layout

Create a `1536 × 840` full-width analytics frame.

Global order:

```text
TOP BAR
GOAL BAR
USAGE VIEW — full working width
GLOBAL TELEMETRY FOOTER
```

Do not use the Chat 72:28 split. Use 24px outer horizontal padding, 12–16px gaps, and 1px separators.

Recommended composition:

```text
SUMMARY STRIP
MODEL SHARE              | MODEL × STAGE
MODEL × ROLE — full width
USAGE TREND              | SELECTED MODEL
RECENT ROUTING — full width
```

Give MODEL × STAGE and MODEL × ROLE the highest visual priority.

## Visual system

- Background `#080A0D`
- Working surface `#0D1117`
- Primary text `#D8DEE9`
- Secondary text `#77808C`
- Separator `#252B33`
- Selected cyan `#57C7FF`
- Success green `#73D18B`
- Concentration warning amber `#E5B567`
- Failure red `#F07178`

Use one production monospace family, strict axes, horizontal bars, heat cells, and tables. No provider rainbow, gradients, glass, shadows, giant KPI cards, or explanatory paragraphs used as charts.

## Global chrome

```text
WWW / 99_www / Usage

GOAL
적절한 작업에 적절한 모델을 배치하고 사용량 근거를 관찰한다
```

## Usage summary

Use one compact telemetry strip, maximum 55–70px high:

```text
53.4M TOKENS │ 241 REQUESTS │ 7 MODELS │ 96.8% REQUEST SUCCESS
DIRECT 98.8% │ DETACHED 1.2% │ OBSERVATION PARTIAL
```

Do not call request success a model quality score. If the denominator is unavailable, show `REQUEST SUCCESS — unobserved`.

## Model share

Use horizontal bars with percentage and observed token value:

```text
GPT-5.6 Sol   ████████████████████░░  78%   52.6M
GPT-5.6 Luna  ███░░░░░░░░░░░░░░░░░░   9%    4.9M
GPT-5.6 Pro   ██░░░░░░░░░░░░░░░░░░░   5%    3.4M
Fable         █░░░░░░░░░░░░░░░░░░░░   4%    2.7M
Gemini        █░░░░░░░░░░░░░░░░░░░░   4%    2.7M
```

Muted bars are default. Selected model is cyan. Amber appears only when an explicit concentration threshold is active.

## Model × Stage

Columns: `UND DEC GND DCD EXE VER DLV`.

```text
MODEL            UND DEC GND DCD EXE VER DLV
GPT-5.6 Sol       ░   ▓   ▓   █   █   ▒   ░
GPT-5.6 Luna      █   ▒   █   ░   ·   ·   ·
GPT-5.6 Pro       ░   █   ▒   █   ▒   ▓   ·
Fable             ·   ·   ░   ▒   ·   █   █
Gemini            ▓   ▒   █   ·   ▒   ·   ·
```

Legend: `· absent observation`, `░ low`, `▒ medium`, `▓ high`, `█ dominant`. Intensity must correspond to actual counts or share, not decoration. Highlight the selected model row in cyan without destroying intensity legibility.

## Model × Role

Columns: `BUILD THINK GROUND REVIEW FAST`.

Add metadata: `DERIVED · stage semantic mapping`.

```text
MODEL            BUILD      THINK      GROUND     REVIEW     FAST
GPT-5.6 Sol      ████████   ████       ███        ██         ░
GPT-5.6 Luna     ·          ░          ███        ·          ████████
GPT-5.6 Pro      ██         ████████   ████       ███        ·
Fable            ·          ██         ·          ████████   ░
Gemini           ███        ██         ███████    ██         █████
```

Rows and columns must align exactly. Do not portray these roles as explicit runtime facts until role telemetry exists.

## Usage trend

Create two variants:

1. Current live state:

```text
USAGE TREND
— unobserved
No persisted run series
```

2. Future observed state using a compact terminal line or stacked timeline, clearly labeled `FUTURE TELEMETRY CONTRACT`.

Never populate the current state with invented dates or values.

When future history exists, provide compact metric toggles:

```text
Tokens   Runs   Duration
```

Do not create a large chart-control toolbar. Left/right keyboard movement changes the active metric or period. The time axis must state whether it represents turns, requests, sessions, or dates.

Example future line graph:

```text
8M ┤                       ╭─╮
6M ┤        ╭──╮       ╭──╯ ╰╮
4M ┤   ╭────╯  ╰───────╯      ╰─
2M ┤───╯
   └──────────────────────────────
    20  21  22  23  24  25  26  27
```

## Selected model

Use compact metrics and bars:

```text
SELECTED
GPT-5.6 Sol

ROUTES      184
TOKENS      52.6M

EFFORT
Low    ████████████░░  63%
Med    ██████░░░░░░░░  29%
High   ██░░░░░░░░░░░░   8%
```

Only show AVG/RUN, OUTCOME, RETRY, FAILED, or TOP PLACEMENT when the selected model has valid attribution. Otherwise use aligned `— unobserved` rows.

Full attributed future state:

```text
SELECTED
GPT-5.6 Sol

184 runs
52.6M tokens
286K avg/run

EFFORT
Low     ████████████░░  63%
Med     ██████░░░░░░░░  29%
High    ██░░░░░░░░░░░░   8%

OUTCOME
Success   96%
Retry      4%
Failed     1%

TOP PLACEMENT
EXECUTE / BUILD
DECIDE  / THINK
GROUND  / RESEARCH
```

This full state is allowed only after runs, outcome, retry, and placement are attributable to the selected model. The current product state must keep unsupported rows explicitly unobserved.

## Recent routing

Use a compact evidence table:

```text
MODEL   STAGE    ROLE     EFFORT  TOKENS  TIME    RESULT
Sol     EXECUTE  BUILD    —       —       1m54s   ✓
Luna    GROUND   GROUND   —       —          8s   ✓
Fable   VERIFY   REVIEW   —       —         41s   ✓
```

Do not fabricate stage effort or token allocation. Skipped is `−`, not success.

The table must preserve these columns when observable: `MODEL / STAGE / ROLE / EFFORT / TOKENS / TIME / RESULT`. If the viewport is narrow, hide lower-priority columns with an explicit abbreviated header rather than silently concatenating values.

## Routing analysis questions

The final composition should let the user answer at a glance:

- How much did I use each model?
- Which stages used which models?
- Which models are being used for BUILD, THINK, REVIEW, FAST, and GROUND?
- Is one expensive model highly concentrated?
- Which placements deserve future routing-policy investigation?

Do not answer the last two questions with unsupported recommendations. The view exposes evidence and attention thresholds; it does not autonomously change routing policy.

## Subscription quota

Do not create large Codex, Claude, Antigravity, or Z.AI quota cards in the main Usage canvas. The global footer owns compact quota telemetry. If detailed quota is necessary, create a small secondary drawer or overlay that is visibly outside the primary Usage analysis hierarchy.

## Interaction prototype

- ↑↓ select model.
- Tab / Shift+Tab move focus among visualizations.
- Enter opens model inspection.
- Esc clears the filter.
- ←→ changes metric/period only if multiple observed choices exist.

Selection synchronizes Model Share, Stage row, Role row, Selected Model, and Recent Routing. Trend filters only in the future observed state.

## Required states

1. Observed desktop with one selected model.
2. Partial coverage with unattributed tokens.
3. No model observations.
4. Trend unavailable.
5. Future trend contract, clearly labeled.
6. Narrow terminal layout using stacked sections without horizontal overflow.

## Final acceptance

- Stage and Role matrices dominate the page.
- Subscription quota does not occupy the main canvas.
- Observed zero and unobserved look different.
- Role derivation is disclosed.
- No unsupported model outcome or history is shown as fact.
- The result resembles a terminal routing console, not a dark SaaS analytics page.

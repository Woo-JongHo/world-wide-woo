# Figma prompt — Context & Cache dashboards

Design two production-ready terminal dashboard screens for the **World Wide Woo Astra Workbench**: /Context and /Cache.

The product is a keyboard-first developer workbench rendered inside a terminal. The visual language should feel like a precise observability instrument: dense, calm, legible, and operational. Avoid a generic SaaS card grid, large marketing headings, decorative gradients, glass effects, and rounded containers. Use alignment, rules, meters, state color, and typographic hierarchy as information.

## Shared frame

- Target desktop terminal viewport: 120 columns × 32 rows. Also provide a compact 80 × 24 variant.
- Header: “astra  99_www / Context” or “astra  99_www / Cache”.
- Keep content left aligned with a two-character inset.
- Use the existing terminal theme:
  - background #1D2021
  - primary text #EBDBB2
  - muted text #928374
  - active cyan #83A598
  - success green #B8BB26
  - attention amber #FABD2F
  - failure red #FB4934
  - structural rule #504945
- Typography: JetBrains Mono or IBM Plex Mono throughout. Use weight and color for hierarchy; do not use all-caps labels.
- Section headings sit inside horizontal rules, such as “── Skills ─────────────────”.
- Progress meters use terminal glyphs such as “━━━━━━━━━━” with active and inactive segments.
- No mouse-only interactions. Show slash commands as the navigation vocabulary.
- Effort display names must be exactly: Low, Middle, High, xHigh, Max, Ultra. Supported options differ by GPT model; never show an unsupported effort for the selected model.

## /Context screen

The first viewport should answer: what context is loaded, how much room remains, and which capabilities are active?

Top instrument cluster:

    ── Context Dashboard ───────────────────────────── ready
    GPT-5.6-Sol  Ultra                         bypass mode · thread 연결

    Free Space  156,420 tokens                         24% used
    ━━━━━━────────────────────────
    Skills  24                                            MCP  3/4
    Memory  186 items                Chat 18 · Activity 154 · T-note 14

Below the cluster, use a continuous diagnostic document with these sections:

1. Session: project, thread, current turn, permission, observation coverage, configuration source, recording mode.
2. Skills: loaded skill count, compact skill-name list, source revision, shortened digest.
3. MCP servers: each row has enabled/disabled marker, server name, health, tool count, and the relevant /mcp enable or disable command.
4. Memory: visually distinguish chat messages, durable activities, T-notes, plan steps, and delegated tasks. Show counts only when observed; use “미관측” for unavailable data.
5. Provider 사용량: remaining quota and reset time.

Make Free Space the memorable element. Its meter should be the strongest visual signal without becoming alarming at normal usage. Skills, MCP, and Memory are compact counters, not separate rounded cards.

## /Cache screen

The first viewport should answer: what is cached, how much space does it use, and is reuse working?

    ── Cache Dashboard ─────────────────────────────── live
    2,480 rendered rows                         18 markdown views
    Reuse  92%                                   No-op reuse  147

    Row cache                              2.40 MiB / 8.00 MiB
    ━━━━━━━━━─────────────────────
    Width metadata                        640 KiB / 4.00 MiB
    ━━━━──────────────────────────

Continue with:

- Layers: durable graph blocks/builds, volatile graph blocks, layout width states/exact counts.
- Work: materialized rows/time, rendered blocks, graph build time.
- A quiet footer: “현재 프로세스의 transcript 렌더 캐시입니다. 화면을 다시 그리면 수치가 갱신됩니다.”

Use occupancy bars only for bounded byte limits. Use plain aligned rows for counters and timings. Reuse percentage is a success signal; high occupancy near the bound changes to amber, and an exceeded bound changes to red.

## Interaction and states

- Provide default, telemetry unavailable, near-capacity, and empty-cache variants.
- When telemetry is unavailable, retain the layout and show “미관측”; never substitute zero.
- Keyboard focus uses the active cyan color and a › marker.
- Respect reduced motion. Values may update in place, but do not animate every row.
- Ensure every row remains readable at 80 columns by stacking right-side values below the label when necessary.

Deliver:

1. Context desktop and compact frames.
2. Cache desktop and compact frames.
3. Component variants for section rule, metric pair, occupancy meter, server row, and unavailable state.
4. A small annotation panel documenting spacing, colors, effort labels, and responsive stacking behavior.

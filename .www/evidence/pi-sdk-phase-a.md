# Pi SDK Phase A contract evidence

Status: PASS

## Run

- Start: 2026-09-03T11:10:19+09:00
- End: 2026-09-03T12:15:35+09:00
- Elapsed: 1h 5m 16s
- Worktree: `/Users/jonghoPro/woo/00_project/99_www-pi-phase-a`
- Branch: `pi-library-phase-a`
- Base: `4a500cf1658c387e6d1cbf6e423ef3c9b6e648e7`

## RED

`bun test test/pi-harness.test.ts test/project-workbench-session.test.ts`

- 0 pass, 2 fail, 2 module-resolution errors
- Missing `src/infrastructure/pi-harness.ts` and `src/infrastructure/native-harness-factory.ts`

## GREEN

- `bun run check`: PASS
- `bun test test/pi-harness.test.ts test/project-workbench-session.test.ts test/cli.test.ts`: 36 pass, 0 fail, 134 assertions
- `bun test`: 543 pass, 0 fail, 2711 assertions
- `git diff --check`: PASS
- changed-file TODO/FIXME/skip/only scan: no matches

## Real Pi 0.84.4 observations

- npm package: `@earendil-works/pi-coding-agent@0.84.4`
- exports: `.`, `./client`, `./rpc-entry`
- SDK surface loaded: `createAgentSession`, `DefaultResourceLoader`, `ModelRuntime`, `SessionManager.inMemory`
- `ModelRuntime.getModel("openai-codex", "gpt-5.6-sol")`: resolved `true`
- observed provider/model: `openai-codex/gpt-5.6-sol`
- local Pi auth availability: `false`; adapter fails closed and does not substitute
- first-output and total model time: not measured because local Pi authentication is unavailable
- interrupt: deterministic session seam covers before-start, resolve-after-abort and reject-after-abort; each emits one `turn/interrupted`

## Model receipts

- GJC implementation: `gpt-5.6-sol`; token usage for the whole root session is not a Phase A-isolated metric and is recorded as unobserved
- contract author: `gpt-5.6-terra`, task `23-PiHarnessContractTests`, duration 3m10s, final cumulative task receipt 41,965 tokens, retry 0
- independent review: Claude Sonnet, APPROVE; token usage unobserved
- final audit: Claude Opus, APPROVE after two REQUEST_CHANGES iterations; token usage unobserved

## Review artifacts

- `.www/scratchpad/pi-phase-a-sonnet-review.md`
- `.www/scratchpad/pi-phase-a-opus-audit.md`

## Boundaries

Codex remains the default. Pi is selected only by `www --execution-lane pi`, runs in-process with no tools/extensions/skills/templates/context files, supports one fresh text session, and rejects resume/list/approval/MCP/tool and model/effort substitution. Phase B candidates are non-streamed text fallback, richer typed execution events, persistent sessions, approval/sandbox, and measured authenticated first-output/total timing.

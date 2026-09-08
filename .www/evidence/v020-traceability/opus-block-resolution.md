# Opus final-audit BLOCK resolution

## HUD missing-weekly contract

`UsageStripView` now applies one rule to every provider. A `ready` snapshot without a finite non-tier weekly limit renders `—`. Only explicit `loading`, `auth-required`, `unsupported`, or error states may render a short state phrase. Gemini currently has no backend weekly snapshot, so the HUD and Linear example render `Gemini —` without inventing a percentage.

The exact rule is covered for Codex, Claude, and Gemini. The bottom HUD remains one row. The legacy Router usage strip was reduced from two reserved rows to one.

## WOO-678 and actual Vault

WOO-678 retained its three completion conditions, parent WOO-673, v0.1.0 milestone, UUID, labels, and priority. Its example and behavior step now use the same missing-weekly rule as code. Exact post-write MCP readback records Backlog status and the state transition from Canceled at `2026-09-07T04:54:59.390Z`. Status is therefore recorded as an intentional transition rather than preserved metadata.

The actual Vault and committed export notes are byte-identical at SHA-256 `d07b01c24c8116dbdace00251d9f5daf1f588f6b1c0db879f5e9c29e167cbd1b`. The prior note was preserved as `woo678-before-opus.md`. The full project readback returned 56 issues with `hasNextPage=false`; the frozen 22-issue contract snapshot, UUID-set hash, receipt timestamps, and exact WOO-678 readback were refreshed.

## Ledger, projection, and Map

Code-010 has no alias because no historical identifier exists. Its UUID and representative declaration remain unchanged. The current graph has 10 Units, 17 issues, 17 notes, 46 SQLite entities, and 110 edges. Ledger digest is `68c2fc9da169b0e6fd2f8117f72b5d63801910767ed09c1329c57e52d922c96f`; projection digest is `e3f73171eb323f71f82f4763b24ae2cf74781ab2e7585ec44ebf816a805d6d4f`.

The verification preserved-input list no longer names the three deleted duplicate work modules. Historical test/check entries are marked `current=false`; `latestValidation` and current check entries identify only the final Opus-resolution runs.

## PR #46 wording correction

The complete two-page, 126-file PR readback contains `.www/vault/Development/2026-09-07-Chat-Completion-Verification.md`. It is under the committed `.www/vault` exportRoot but outside the v2 ledger note set. No v2 ledger note path is in PR #46. Evidence no longer claims zero traceability paths.

## Low-scope cleanup

The unused usage-strip color fixture and unreferenced Wooni module/test were removed, along with their orphan work-manifest references. The internal development help does not advertise the hidden top-level Unit/link writer or the internal `/work` and `/map` adapter commands because the current Workbench input path does not accept them. The AST validator ignores tracked paths deleted in the current worktree while still detecting any missing registered Unit through the ledger declaration check.

## Executed validation

- Targeted HUD, development CLI, traceability, and work-manifest tests: 22 pass, 0 fail, 297 assertions across 5 files.
- Traceability validator retest after deleted-source handling: 7 pass, 0 fail, 51 assertions.
- `bun run check`: PASS.
- `bun run traceability:check`: PASS.
- Fresh receipt plus actual Vault check: PASS.
- Development Map check: PASS, 17 issues.
- `git diff --check`: PASS.
- Full suite was not rerun, following the explicit minimal-targeted instruction.
- No commit, push, PR creation, or merge was performed.

## Final re-audit correction

`DEVELOPMENT_HELP` no longer lists `/work ...` or `/map issue|unit ...`. Those operations exist on the internal development-service adapter, but the current Workbench input path does not route or accept them. A targeted assertion prevents the internal help from advertising either command family.

`receipt-check` now requires the repository-local Vault export manifest and compares the realpath of its `actualVaultRoot` with the realpath supplied through `--vault-root`. A different directory fails before note validation; a symlink resolving to the same Vault remains equivalent. The package script supplies the frozen manifest explicitly.

Final re-audit validation:

- `bun test test/development-cli.test.ts test/development-traceability.test.ts`: 11 pass, 0 fail, 73 `expect()` calls.
- `bun run check`: PASS.
- Receipt check against `/Users/jonghoPro/woo/01_obsidian` with `obsidian-export-manifest.json`: PASS; 10 Units, 17 issues, 17 notes, 110 edges, ledger digest `68c2fc9da169b0e6fd2f8117f72b5d63801910767ed09c1329c57e52d922c96f`.
- `git diff --check`: PASS.
- CHANGELOG was not changed because the product version policy was outside this correction.
- No commit, push, PR creation, or merge was performed.

# Verification receipt

## Source revision and structure

- Scenario: the staged inventory still describes the four live `chacada` repositories.
- Invocation: compare `source-inventory.json` with fresh SSH reads of `git branch --show-current`, `git rev-parse HEAD`, `git status --porcelain=v1`, `sha256sum rpa-map.yaml`, and anchored Task/Unit counts.
- Binary observable: `source_revision_readback=matched`, exit 0.
- Artifact: `source-inventory.json`.
- Result: 4 Process, 23 Task, 70 Unit; current dirty path counts are Helix 0, VectorCast 14, FTA 5, 외화입금 0.

## Sensitive material and fake completion

- Scenario: the retained source evidence does not contain credential assignments, email addresses, environment-secret files, unfinished markers, or focused/skipped test directives.
- Invocation: anchored ripgrep scans plus `find ... -name '.env*'`.
- Binary observable: `sensitive_material_scan=clean` and `fake_completion_scan=clean`, exit 0.
- Artifact: this receipt and the complete `2026-09-08-rpa-gmbkorea` directory.

## Linear publication

- Scenario: four Process collections, 23 numbered Task issues, and eight exception/test siblings remain under the RPA root with stable RPA IDs.
- Invocation: `bun scripts/linear-contract.ts .www/evidence/2026-09-08-rpa-gmbkorea/linear-readback.json --scope RPA`.
- Binary observable: `Linear contract OK: RPA`, exit 0.
- Artifact: `linear-readback.json` contains 36 issues and `hasNextPage=false`; RPA descriptions contain zero Obsidian and SQLite references.
- State: `WOO-847` is In Progress; its Process and Task children remain Backlog until safety evidence exists.

## Publication procedure limitation

- The live Linear hierarchy was created after duplicate and hierarchy read-back, but the pre-mutation snapshot and draft were not persisted and gated as files before the first save call.
- The complete post-publication read-back passes the contract, but this does not retroactively satisfy the missing pre-publication gate.
- Recovery: treat this receipt as a process defect; every later RPA mutation must complete snapshot → draft gate → mutation → read-back in that order through `rpa-publish`.

## Obsidian exclusion boundary

- Scenario: preserve existing remote Obsidian notes after the scope changed to Linear-only.
- Invocation: `ssh chacada 'test ! -e /c/Users/woo/woo/01_obsidian/00_프로젝트/05_GMBKOREA/RPA'`.
- Binary observable: `remote_vault_rpa_path=absent`, exit 0.
- Artifact: `README.md` records the Linear-only scope.
- Disposition: the staged vault payload was removed. No remote file was written; Obsidian is no longer a target.

## Independent review disposition

- Two read-only Claude Sonnet review invocations returned no review output and were stopped.
- Per the user's instruction, no further Claude invocation is permitted for this work. Claude Opus final audit was therefore not run.
- This is recorded as an unexecuted independent-review gate, not as approval. The Codex-authored implementation and executable checks below remain the available evidence.

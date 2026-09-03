# Architecture refactor baseline — 2026-09-04

## Git

- branch: `main`
- baseline HEAD: `66a7a727ae309250443a8aee8b1cc8b2b2061a7f`
- tracked user changes preserved: `.www/Development-Map.md`, `CONTEXT.md`, `README.md`, `src/infrastructure/usage-service.ts`, `test/usage-service.test.ts`
- pre-existing untracked research/milestone documents preserved

## Verification

- `bun run check`: PASS
- `bun test`: PASS — 609 tests, 3982 expectations, 73 files
- `git diff --check`: PASS

## Runtime contracts that must not change

- `ProjectActivity.schemaVersion` and JSONL layout
- `WorkbenchCommand` and `WorkbenchCommandReceipt` behavior
- Codex/Pi shared execution behavior
- `/stats`, `/dashboard`, `/monitor`, r/R, 1/2/3, Esc
- `/source`, `/trace`, Todo, T-note, Review
- 5,000-message scroll projection cache regression

## Stop conditions

- tests decrease or skip/only is introduced
- journal schema or runtime protocol must change
- behavior change is required to complete a file move
- a pre-existing user change must be overwritten, staged, or reverted

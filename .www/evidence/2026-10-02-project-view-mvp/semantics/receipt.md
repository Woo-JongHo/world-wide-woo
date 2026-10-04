# Project View MVP semantics receipt

Date: 2026-10-02 (Asia/Seoul)

## Scope

- `apps/project-view/src/model.ts`
- `apps/project-view/src/mock-db.ts`
- `apps/project-view/src/selectors.ts`
- `apps/project-view/src/service.tsx`
- `apps/project-view/tests/data.spec.ts`

## Success criteria and observations

| Scenario | Invocation | Binary observable | Result |
|---|---|---|---|
| Type integrity for Project View | `cd apps/project-view && npm run check` | process exit code | `0` |
| Core mock evidence scenarios | `cd apps/project-view && npx playwright test tests/data.spec.ts` | process exit code and Playwright count | `0`; `7 passed (8.2s)` |
| PRN-003 categories use stored relations | Playwright test `PRN-003 evidence categories come from stored relations` | expected relation IDs match | `REL-007`; `REL-008`; `REL-009..010`; `REL-011`; `REL-012` |
| DEC-014 state separation | Playwright test `an adopted decision and a commit never imply a passed verification` | adoption, linked commit and check state | `adopted`; `COM-014`; `failed` |
| View mapping and content share one record | Playwright test `view annotations and preview content share one view record` | annotation order, seven stages, failed count | all assertions passed |
| Reference integrity | Playwright test `integrity checker rejects duplicated identity, missing foreign identity and replacement cycles` | duplicate, missing ref, missing view component, cycle detected | all assertions passed |
| Import normalization | `bun /Users/jonghoPro/woo/00_project/98_Plugin/skills/xxx/scripts/typescript/00_normalize-imports.ts <five files>` | process exit code and changed count | `0`; `changed=0 errors=0` |
| Table alignment | `bun /Users/jonghoPro/woo/00_project/98_Plugin/skills/xxx/scripts/typescript/06_align-tables.ts --file <file>` for each scoped file | process exit code and mismatch count | all `0`; all `misaligned=0` |
| Placeholder scan | `rg -n 'TODO|FIXME|TBD|test\.(skip|only)|describe\.(skip|only)' <five files>` | matching output | no matches |

The `service.tsx` aligner reported five safely refused candidate declaration groups while returning exit code `0`; it reported `groups=0`, `misaligned=0`, `edits=0`. No table mismatch was accepted or skipped.

## Implemented behavior

- Principles renders only stored `relations` records for document reference, principle definition, application targets, execution input evidence, and verification. It no longer invents a dashed proposed edge.
- The view annotation mapping, hotspot classes, preview labels, preview values, and revision now come from each `views` mock record.
- Overview exposes adjacent modules and connected documents from selectors, and lists every scoped check with its own status.
- Decisions defaults to `DEC-014` for Chat, links `COM-014` visibly through `IMPL-014`, and keeps verification as the independent `CHK-014 failed` state.
- View navigation uses links with `aria-current="page"`; it no longer declares a tab widget without tab behavior.


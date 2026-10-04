# Project View independent review fixes — semantics receipt

Date: 2026-10-03 (Asia/Seoul)

## Scope

- `apps/project-view/src/model.ts`
- `apps/project-view/src/mock-db.ts`
- `apps/project-view/src/selectors.ts`
- `apps/project-view/src/service.tsx`

Existing tests were preserved and were not executed, following the caller's corrected instruction.

## Evidence

| Scenario | Invocation | Binary observable | Result |
|---|---|---|---|
| Production TypeScript and bundle integration | `cd apps/project-view && npm run build` | process exit code and Vite completion | exit `0`; `✓ built in 112ms` |
| Import contract | `bun /Users/jonghoPro/woo/00_project/98_Plugin/skills/xxx/scripts/typescript/00_normalize-imports.ts <four owned product files>` | process exit code, changed/error counts | exit `0`; `changed=0 errors=0` |
| Table alignment contract | `bun /Users/jonghoPro/woo/00_project/98_Plugin/skills/xxx/scripts/typescript/06_align-tables.ts --file <owned product file>` | process exit code and mismatch count | all four exit `0`; all `misaligned=0` |
| Placeholder scan | `rg -n 'TODO|FIXME|TBD|test\.(skip|only)|describe\.(skip|only)' <four owned product files>` | match output | no matches |
| DOC-001 runtime evidence consistency | static read of `mock-db.ts` and `REL-011` | field/relation pairing | `DOC-001.includedInRuntime=null`; only evidenced `DOC-002=true` remains |
| Component evidence completeness | static read of `componentEvidenceRefs` and service consumers | canonical typed target path | Composition and View both consume principle `targetIds` and verification `targetId`; `CMP-DASH-SUMMARY` resolves PRN-004, CHK-019 and CHK-021 |
| Canonical outgoing references | static read of `outgoingReferences` and `allReferencedBy` | covered typed fields | base refs plus parent, relation endpoints/source, view annotations, principle targets/document, decision target/RAW/replacement, implementation link FKs, verification target, raw session/event FKs; deduplicated by `(table,id)` |
| Review examples retained | static read of mock data and selector branches | exact source path | DEC-011 target, REL-006/REL-012 source RAW-016, and REL-011 source SES-001 are included by typed references |
| PRN-002 excerpt | static read of `documentParagraph` and service renderer | selected paragraph index | PRN-002=`1`; renderer compares against selected principle metadata |
| Decision semantics | static read of `decisionStatusLabels` and triad | label/tone source | Korean labels are shared by list/detail; adoption tone uses DecisionStatus and verification tone uses CheckStatus |

## Cross-worker API

`outgoingReferences(table: TableName, record: DbRecord): RecordRef[]` is the canonical Database Relations API. The Database surface consumes it for outgoing rows and keeps `allReferencedBy` for inbound rows.


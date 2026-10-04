# Project View navigation and database review fix receipt

- Date: 2026-10-03 (Asia/Seoul)
- Scope: `apps/project-view/src/{App.tsx,navigation.tsx,database.tsx,common.tsx,assurance.tsx}`
- Full result: `.www/scratchpad/2026-10-03-project-view-mvp/navigation-audit-result.md`

## Binary verification

| Scenario | Invocation | Binary observable | Captured artifact |
|---|---|---|---|
| Type safety for the integrated Project View | `npm run project-view:check` | exit `0`; `tsc --noEmit` completed without diagnostics | this receipt and terminal output summarized here |
| Production bundle after the navigation fixes | `npm run project-view:build` | exit `0`; Vite transformed 24 modules and emitted `dist/index.html`, CSS, and JS | `apps/project-view/dist/` and this receipt |
| Import normalization for every owned source | `bun .../scripts/typescript/00_normalize-imports.ts apps/project-view/src/App.tsx apps/project-view/src/navigation.tsx apps/project-view/src/database.tsx apps/project-view/src/common.tsx apps/project-view/src/assurance.tsx` | exit `0`; `files=5 changed=0 errors=0` | this receipt |
| Spreadsheet alignment for every owned source | `for f in ...; do bun .../scripts/typescript/06_align-tables.ts --file "$f"; done` | exit `0`; all five reports show `misaligned=0 edits=0` | this receipt |
| Whitespace and placeholder gate | `git diff --check -- <owned files>` plus negative `rg` for `TODO`, `FIXME`, and skipped/only tests | exit `0`; no matches and no diff errors | this receipt |

Tests were neither added nor executed in this audit pass, following the parent instruction that the current user request did not authorize a new test run.

## Requirement observables

| Scenario | Observable | Source artifact |
|---|---|---|
| Assurance category, status, and check survive history navigation | Route parsing reads all three URL parameters; every filter and check transition builds one URL through `assuranceHref`; selection normalization uses `replace` while user transitions use history push | `apps/project-view/src/App.tsx:27`, `apps/project-view/src/assurance.tsx:25` |
| Evidence controls expose live inspector state | Inspect buttons point at `evidence-inspector` through `aria-controls` and receive the current `aria-expanded` value from the service inspector owner | `apps/project-view/src/common.tsx:18` |
| Narrow inspector responds to viewport changes and keeps keyboard focus inside | A `matchMedia` change listener updates the dialog mode; opening or changing to narrow focuses the panel; panel-level Shift+Tab wraps to the final control; Escape restores a connected trigger or a main-content fallback | `apps/project-view/src/common.tsx:51` |
| Database detail closes to the current record after record-to-record traversal | Return focus is refreshed whenever `focusId` changes; a detached relation trigger falls back to the current row and then to a live database control | `apps/project-view/src/database.tsx:204` |
| Relation `from` and `to` sorting uses record identity | `sortableValue` turns a `RecordRef` into `table/id` before comparison | `apps/project-view/src/database.tsx:123` |
| Search typing creates one history checkpoint | First input change pushes; later characters replace; blur, table changes, popstate, filters, and sort controls restart the transaction | `apps/project-view/src/database.tsx:139` |
| Schema and header reflect the current model | Header derives the table count from `TABLE_NAMES.length`; `Principle.documentParagraph` is present; the obsolete `views.componentIds` mapping is absent | `apps/project-view/src/database.tsx:58`, `apps/project-view/src/database.tsx:93`, `apps/project-view/src/database.tsx:171` |
| Relations and the evidence inspector include typed foreign keys and nested references | Both surfaces consume the shared `outgoingReferences(table, record)` selector | `apps/project-view/src/database.tsx:266`, `apps/project-view/src/common.tsx:51` |
| Diff gutter does not invent neighboring line numbers | Only the evidence path's explicit line is displayed on the first changed line; context and other changes render `—` when unified hunk metadata is absent | `apps/project-view/src/assurance.tsx:60` |
| Browser history does not reuse a stale row trigger | Programmatic navigation marks its synchronous synthetic popstate; a genuine browser popstate clears `latestNavigationTrigger`, so detail close falls back to the current row | `apps/project-view/src/navigation.tsx:7` |
| Inspector backdrop follows dialog mode | Backdrop presses close the inspector only while the viewport is narrow and the inspector has modal semantics | `apps/project-view/src/common.tsx:86` |
| Assurance check selection keeps the reading position | Check-row links pass `preserveScroll` to navigation | `apps/project-view/src/assurance.tsx:50` |

## Build artifact snapshot

```text
dist/index.html                   0.64 kB │ gzip:  0.44 kB
dist/assets/index-Bky8mYg1.css   37.60 kB │ gzip:  8.20 kB
dist/assets/index-BFemXuJX.js   311.88 kB │ gzip: 91.99 kB
✓ built in 218ms
```

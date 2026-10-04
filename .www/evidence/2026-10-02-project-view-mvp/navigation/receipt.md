# Project View navigation and database evidence

Date: 2026-10-02

## Verified scenarios

| Success criterion | Scenario and invocation | Binary observable | Captured artifact |
|---|---|---|---|
| Peer navigation and browser state | `npx playwright test tests/navigation.spec.ts --workers=1 --timeout=120000 --reporter=junit --trace=off` | 14 tests, 0 failures; navigation has three links and no fake tab roles; back/forward restores module, search, sort, direction, row, detail tab, window scroll, and grid scroll | `navigation-junit.xml` |
| Database reading flow | Same navigation suite: search `RAW-014`, sort by `order`, reverse direction, select row, open Transcript, go back and forward | URL and controls recover each state; selected row is revealed inside the grid while document scroll stays at 0 | `navigation-junit.xml`, `database-raw-014.png` |
| Schema and references | Same navigation suite: open `project_nodes` and `documents` Schema, then follow `relations.from` for `DEC-011` | `displayLabel` is `string / optional`; `includedInRuntime` is `boolean | null / yes`; nested reference lands on `table=decisions&row=DEC-011` | `navigation-junit.xml` |
| RAW preservation and copying | Same navigation suite: open `RAW-016` Transcript and copy it | Newlines remain in the DOM and clipboard text equals the complete source string | `navigation-junit.xml`, `database-raw-014.png` |
| Narrow detail accessibility | Same navigation suite at 720×900: open `RAW-014`, Shift+Tab, Escape | Detail has dialog semantics, focus remains inside, Escape closes it, and focus returns to `RAW-014 행 선택` | `navigation-junit.xml`, `database-drawer-720.png` |
| Assurance status and revision distinction | Open `/projects/www/assurance?check=CHK-014` and wait for `.revision-pair` | Failed status is textual and shaped; checked revision and current revision render as separate fields; status filter is operable | `assurance-chk-014.png` |
| Data integrity and meaning | `npx playwright test tests/data.spec.ts --workers=1 --timeout=120000 --reporter=junit --trace=off` | 7 tests, 0 failures | `data-junit.xml` |
| Type and production build | `npm run project-view:check`; `npm run project-view:build` | both exit 0; Vite emits `dist/index.html`, CSS, and JS | this receipt; `apps/project-view/dist/` |
| Readability gates | For each owned TS/TSX file, run `00_normalize-imports.ts <file>` and `06_align-tables.ts --file <file>` | six files report `changed=0`, `misaligned=0`, `compressed=0`, `refused=0` | this receipt |
| Placeholder and diff hygiene | `rg -n "TODO|FIXME|TBD|test\.(skip|only)|describe\.(skip|only)" <owned files>`; `git diff --check -- <owned files>` | no placeholder match; diff check exits 0 | this receipt |

The combined suite also passed once as 21/21 before the final schema completeness assertion. The final current code is covered by the green 14-test navigation JUnit plus the green 7-test data JUnit. Later combined retries encountered shared Chrome setup/teardown clock timeouts without an assertion failure; that untrusted attempt is retained as `attempted-full-shared-chrome-timeout.xml` and is not used as passing evidence.


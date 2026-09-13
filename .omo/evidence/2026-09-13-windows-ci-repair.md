# Windows CI repair evidence

Repository: `/Users/jonghoPro/woo/00_project/99_www`  
Branch: `astra/terminal-ui`  
Captured: 2026-09-13

## CI failure reproduced from the authoritative job log

| Scenario | Invocation | Binary observable | Captured artifact |
| --- | --- | --- | --- |
| Failed Windows job inspection | `gh api repos/Woo-JongHo/world-wide-woo/actions/jobs/103646251606` | Job `Core (windows-latest)` concluded `failure`; run id `34728274257`. | This file |
| Persisted skill state/receipt publication | `gh run view 34728274257 --log-failed` | `skill-run-store.ts:147` raised `EPERM: operation not permitted, fsync` on a directory handle; this caused 23 skill-run/local-workflow failures. | This file |
| Runtime-config capability schema | `gh run view 34728274257 --log-failed` | Windows path was present only JSON-escaped, so a raw substring assertion failed. | This file |
| Work-recording symlink fixture | `gh run view 34728274257 --log-failed` | Fixture constructed `C:\\...\\Temp\\C:\\...`, then `writeFileSync` raised `ENOENT`. | This file |

## Applied repair

`FileSkillRunStore` still fsyncs each temporary commit file before hard-link publication and still uses that no-replace hard link as its CAS point.  It now omits only the unsupported directory-handle fsync on Windows. The runtime-config test reads the structured schema value, and the symlink fixture uses path APIs for its external target.

## Local regression results

| Scenario | Invocation | Binary observable | Captured artifact |
| --- | --- | --- | --- |
| Skill state/receipt and local-workflow persistence | `bun test test/skill-runtime.test.ts test/local-workflow-service.test.ts` | Exit 0; 14 pass, 0 fail, 51 expectations. | This file |
| Runtime-config snapshot and symlink boundary | `bun test test/request-capability-config.test.ts test/work-recording-hook.test.ts` | Exit 0; 7 pass, 0 fail, 26 expectations. | This file |
| Type safety | `bun run check` | Exit 0 (`tsc --noEmit`). | This file |
| Full macOS regression | `bun test` | Exit 0; 1204 pass, 0 fail, 9669 expectations across 134 files. | This file |
| Changed-file hygiene | `git diff --check` and `rg -n "TODO|FIXME|test\\.skip|test\\.only|describe\\.skip|describe\\.only" src/adapters/outbound/persistence/skill-run-store.ts test/request-capability-config.test.ts test/work-recording-hook.test.ts` | Exit 0; no whitespace errors or placeholder/skip markers. | This file |

## Hosted Windows verification boundary

No commit or push was performed, as assigned. Therefore the repaired tree has not started a new hosted Windows job. The next PR CI run is the required platform confirmation; this evidence records the exact prior failing job and the complete local regression outcome without representing that confirmation as already run.

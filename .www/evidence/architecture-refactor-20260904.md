# WWW Architecture boundary migration — 2026-09-04

## Decision source

- User proposal: layer-first에서 Capability/Feature/Workflow/Runtime 중심 전환
- Independent review: Claude Opus 5 session `13d03246-4755-4dee-83ee-e7cf318ccb11`
- Verdict: original proposal REJECT; purpose-preserving reduced migration accepted
- Decision record: `.www/scratchpad/2026-09-04-capability-architecture-opus-review.md`

## Product-purpose correction

WWW의 Orchestration은 step runner 폴더가 아니라 Work Chain·Contract·Progress·Approval·Evidence·Acceptance를 소유하는 제품 전체다. Executor는 model/tool/session/sandbox 실행만 소유한다. 따라서 별도 Feature ID, feature.yaml, generic Workflow Engine과 Runtime Registry는 만들지 않았다.

## Implemented migration

- source import graph 및 cycle architecture guard
- shell entry basename discovery로 hardcoded presentation path 제거
- presentation의 process 실행 금지 guard
- concrete executor adapter 상호 의존 금지 guard
- `NativeHarnessPort` → `ExecutorPort`
- application ports public directory boundary
- Codex/Pi/factory → `infrastructure/executors/`
- Observability history → application-owned reader port
- Git telemetry process → infrastructure adapter
- ProjectWorkbench session usage → `SessionUsageTracker` collaborator
- official code architecture/inventory/migration documentation

## Preserved contracts

- ProjectActivity and journal schema unchanged
- WorkbenchSnapshot and WorkbenchCommand public unions unchanged
- Codex/Pi shared contract suite unchanged
- Stats/Dashboard/Monitor/Source navigation unchanged
- session usage and context usage values unchanged
- scroll projection cache unchanged

## Baseline

- HEAD: `66a7a727ae309250443a8aee8b1cc8b2b2061a7f`
- tests: 609
- expectations: 3982
- test files: 73

## Verification

- import graph architecture tests: 8 pass
- boundary focused tests: 110 pass
- TUI/navigation/scroll focused tests: 113 pass
- actual journal replay: 17 streams, 10,504 retained activities, partial-local-journal coverage, deterministic projection
- `bun run check`: PASS
- `bun test`: PASS — 612 tests, 4192 expectations, 73 files
- baseline delta: +3 tests, +210 expectations, no test file reduction
- `git diff --check`: PASS
- `bun build src/cli.ts --target=bun --outdir dist`: PASS — 2,516 modules

## Commits

- `836870b` product-purpose architecture decision and import graph baseline
- `38c8ab9` ProjectWorkbench session usage collaborator
- `fa62181` Executor and application port boundaries

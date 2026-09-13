# TUI 리팩터링 계약 테스트 구현 증거

## 범위

- `test/architecture.test.ts`: TUI 그룹을 `foundation/features/commands/shell/legacy`로 제한하고 foundation 역의존, sibling feature 구현 간 직접 import, 상대 import cycle을 검사한다. 중앙 `features/feature-registry.ts` 메타데이터 집계기는 sibling import 검사에서 제외한다.
- `test/workbench-config.test.ts`: checked-in `.www/workbench.yaml`의 실행 모델 `gpt-6-astra`를 기대한다.
- `test/tui-shell-characterization.test.ts`: 공개 `runProjectWorkbenchShell`을 메모리 터미널로 실행해 ready 전송, working 추가 지시, 승인, 취소, workflow resume, shutdown 자원 정리를 고정한다.
- `src/app.ts` 줄 수는 마지막 trailing newline을 행으로 세지 않는다.
- 제품 소스는 이 작업에서 수정하지 않았다.

작업 시작 전 dirty worktree와 diff/untracked manifest는 `.omo/evidence/2026-09-13-tui-refactor-baseline.md`에 별도로 기록했다.

## 전환 중 확인

첫 실행은 다른 에이전트의 파일 이동 도중 수행되어 `dashboard/dashboard-layout.ts` 잔존 그룹과 `workbench-shell.ts`의 옛 import가 실패했다. 통합 완료 신호를 받은 뒤 최종 경로에서 아래 검증을 새로 실행했으며 전부 통과했다.

## 소유 테스트

명령:

```text
bun test test/tui-shell-characterization.test.ts test/architecture.test.ts test/workbench-config.test.ts
```

출력 전문:

```text
bun test v1.4.0 (34cbb9a40)

test/workbench-config.test.ts:
(pass) Workbench YAML configuration > normalizes supported execution policy and rejects unsafe values to defaults [0.39ms]
(pass) Workbench YAML configuration > loads project YAML and falls back safely when it is absent or malformed [7.67ms]
(pass) Workbench YAML configuration > persists a validated model selection atomically in project YAML [3.60ms]
(pass) Workbench YAML configuration > loads every live project policy section from the checked-in Workbench YAML [1.04ms]

test/architecture.test.ts:
(pass) source architecture > keeps flattened layers grouped by their canonical responsibility [39.44ms]
(pass) source architecture > keeps the core independent from adapters [12.05ms]
(pass) source architecture > keeps core domain independent from orchestration and effects [13.52ms]
(pass) source architecture > does not recreate the retired top-level source layers [0.23ms]
(pass) source architecture > keeps inbound adapters from importing outbound adapters [11.31ms]
(pass) source architecture > keeps process execution behind application-owned ports [10.71ms]
(pass) source architecture > keeps TUI foundation independent from higher-level TUI groups [10.82ms]
(pass) source architecture > keeps TUI feature implementations independent from sibling features [12.98ms]
(pass) source architecture > keeps concrete executor adapters independent [10.65ms]
(pass) source architecture > has no relative source dependency cycles [11.49ms]
(pass) source architecture > keeps the Work capability entry independent from TUI and Runtime implementations [10.70ms]
(pass) source architecture > keeps the composition root small [0.15ms]
(pass) source architecture > keeps the native workbench shell independent from the legacy session runtime [10.74ms]

test/tui-shell-characterization.test.ts:
(pass) runProjectWorkbenchShell characterization > dispatches one chat send for a ready composer submission [69.03ms]
(pass) runProjectWorkbenchShell characterization > routes a working composer submission through the chat command used for steering [63.70ms]
(pass) runProjectWorkbenchShell characterization > keeps Escape non-decisive and dispatches an approval exactly once [123.98ms]
(pass) runProjectWorkbenchShell characterization > dispatches one cancellation for Escape while working [62.58ms]
(pass) runProjectWorkbenchShell characterization > resumes a workflow without creating a new chat send [61.62ms]
(pass) runProjectWorkbenchShell characterization > disposes shell-owned resources during shutdown [62.76ms]

 23 pass
 0 fail
 1372 expect() calls
Ran 23 tests across 3 files. [718.00ms]
```

## TypeScript check

명령과 출력 전문:

```text
$ bun run check
$ tsc --noEmit
```

종료 코드: `0`

## TUI import gate 단독 확인

명령:

```text
bun test test/architecture.test.ts --test-name-pattern 'TUI foundation|TUI feature|cycles'
```

출력 전문:

```text
bun test v1.4.0 (34cbb9a40)

test/architecture.test.ts:
(pass) source architecture > keeps TUI foundation independent from higher-level TUI groups [12.70ms]
(pass) source architecture > keeps TUI feature implementations independent from sibling features [10.78ms]
(pass) source architecture > has no relative source dependency cycles [11.22ms]

 3 pass
 10 filtered out
 0 fail
 18 expect() calls
Ran 3 tests across 1 file. [45.00ms]
```

## 완전성 검사

다음 명령은 출력 없이 종료 코드 `0`이었다.

```text
git diff --check -- test/architecture.test.ts test/workbench-config.test.ts
rg -n "TODO|test\.(?:skip|only)|describe\.(?:skip|only)" test/architecture.test.ts test/workbench-config.test.ts test/tui-shell-characterization.test.ts
```

판정: 소유 테스트와 typecheck가 모두 통과했고, TODO 자리표시·skip/only·whitespace 오류가 없다.

## Shell seam 후속 추출 재검증

Shell 입력·내비게이션 controller와 lifecycle seam 후속 추출이 완료된 현재 worktree에서 독립 재검증했다.

명령:

```text
bun run check
bun test test/architecture.test.ts test/tui-shell-characterization.test.ts test/legacy-shell-characterization.test.ts test/astra-shell.test.ts
```

출력 전문:

```text
$ tsc --noEmit
bun test v1.4.0 (34cbb9a40)

test/astra-shell.test.ts:
(pass) production Astra shell routes navigation, rejection, approval and shutdown through existing contracts [2480.95ms]
(pass) Astra CLI keeps resume selection, cancellation and execution-lane semantics [2.60ms]
(pass) Mac Control+G navigation preserves drafts, routes every page, and leaves ordinary digits editable [1007.31ms]
(pass) the production layout keeps autocomplete selections and multiline rails visible at 80x24 [5024.95ms]

test/legacy-shell-characterization.test.ts:
(pass) legacy shell characterization > Escape aborts an active stream without stopping the shell [28.83ms]
(pass) legacy shell characterization > empty Ctrl+D saves and closes legacy resources in order [15.44ms]
(pass) legacy shell characterization > /exit saves and closes legacy resources in order [16.29ms]

test/architecture.test.ts:
(pass) source architecture > keeps flattened layers grouped by their canonical responsibility [14.81ms]
(pass) source architecture > keeps the core independent from adapters [11.06ms]
(pass) source architecture > keeps core domain independent from orchestration and effects [12.24ms]
(pass) source architecture > does not recreate the retired top-level source layers [0.31ms]
(pass) source architecture > keeps inbound adapters from importing outbound adapters [13.32ms]
(pass) source architecture > keeps process execution behind application-owned ports [13.18ms]
(pass) source architecture > keeps TUI foundation independent from higher-level TUI groups [11.36ms]
(pass) source architecture > keeps TUI feature implementations independent from sibling features [12.73ms]
(pass) source architecture > keeps concrete executor adapters independent [10.83ms]
(pass) source architecture > has no relative source dependency cycles [12.25ms]
(pass) source architecture > keeps the Work capability entry independent from TUI and Runtime implementations [12.14ms]
(pass) source architecture > keeps the composition root small [0.14ms]
(pass) source architecture > keeps the native workbench shell independent from the legacy session runtime [10.63ms]

test/tui-shell-characterization.test.ts:
(pass) runProjectWorkbenchShell characterization > dispatches one chat send for a ready composer submission [64.51ms]
(pass) runProjectWorkbenchShell characterization > routes a working composer submission through the chat command used for steering [63.45ms]
(pass) runProjectWorkbenchShell characterization > keeps Escape non-decisive and dispatches an approval exactly once [125.56ms]
(pass) runProjectWorkbenchShell characterization > dispatches one cancellation for Escape while working [62.63ms]
(pass) runProjectWorkbenchShell characterization > resumes a workflow without creating a new chat send [65.61ms]
(pass) runProjectWorkbenchShell characterization > disposes shell-owned resources during shutdown [66.12ms]
(pass) runProjectWorkbenchShell characterization > releases shell resources once in the established shutdown order [0.71ms]

 27 pass
 0 fail
 1906 expect() calls
Ran 27 tests across 4 files. [9.31s]
```

판정: TypeScript check와 지정된 네 테스트 파일이 모두 통과했다. 후속 seam 추출로 인한 제품 회귀나 기존 characterization 계약의 불일치는 발견되지 않았다.

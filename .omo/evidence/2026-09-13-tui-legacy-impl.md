# TUI legacy boundary implementation evidence — 2026-09-13

## 작업 범위

- 작업 저장소: `/Users/jonghoPro/woo/00_project/99_www`
- branch: `astra/terminal-ui`
- 기존 dirty worktree와 다른 에이전트의 TUI 이동 변경을 보존했다.
- legacy 전용 UI 구현 세 파일을 `src/adapters/inbound/tui/legacy/` 경계로 이동했다.
  - `legacy-dashboard-views.ts`
  - `legacy-session-shell.ts`
  - `router-overlays.ts`
- `src/legacy-router-app.ts`와 관련 테스트의 import를 새 경로로 원자적으로 전환했다.
- 이전 세 source path에는 호환 shim을 만들지 않았다.

## 구현 결과

`runTuiShell(dependencies)`의 단일 인자 호출과 production 기본 동작을 유지했다. 실제 터미널을 직접 생성하던 지점에는 선택적 `terminal` dependency만 추가했다. 호출자가 주입하지 않으면 기존과 같이 `new ProcessTerminal()`을 사용한다. 이 seam으로 production shell을 fake terminal과 port로 실행해 키 입력 및 종료 순서를 고정했다.

`test/legacy-shell-characterization.test.ts`가 다음 계약을 실제 입력 byte로 검증한다.

1. streaming 중 Escape(`\x1b`)는 `runtime.abort()`를 한 번 호출하고 shell을 종료하지 않는다.
2. 빈 composer의 Ctrl+D(`\x04`)는 `draft.save → settings.flush → runtime.close → lease.release → terminal.stop` 순서로 종료한다.
3. `/exit` 제출도 같은 종료 순서를 따른다.

`test/legacy-router-app.test.ts`는 shell handoff가 throw할 때 `monitor.dispose → runtime.close`가 실행됨을 직접 기록한다. 이어 같은 legacy SessionRuntime ID로 다시 composition할 수 있음을 확인해 failed handoff 뒤 lease가 해제되고 resume ID가 보존됨을 검증한다.

## 관련 테스트

실행 명령:

```text
bun test test/legacy-shell-characterization.test.ts test/legacy-router-app.test.ts test/left-dashboard.test.ts test/transcript-markdown.test.ts
```

결과:

```text
16 pass
0 fail
72 expect() calls
Ran 16 tests across 4 files.
```

포함된 legacy characterization:

```text
(pass) Escape aborts an active stream without stopping the shell
(pass) empty Ctrl+D saves and closes legacy resources in order
(pass) /exit saves and closes legacy resources in order
(pass) uses isolated Router settings and releases a failed shell handoff before resume
```

## 정적 확인

다음 대상의 `git diff --check`는 exit 0이었다.

```text
src/adapters/inbound/tui/legacy
src/legacy-router-app.ts
test/legacy-router-app.test.ts
test/legacy-shell-characterization.test.ts
test/left-dashboard.test.ts
test/transcript-markdown.test.ts
```

`src`, `test`, `scripts`, `package.json`에서 아래 이전 import 경로를 검색한 결과는 0건이었다.

```text
adapters/inbound/tui/dashboard/legacy-dashboard-views
adapters/inbound/tui/overlays/router-overlays
adapters/inbound/tui/shell/legacy-session-shell
```

이전 source 디렉터리에서 세 파일명을 직접 검색한 결과도 0건이었다. 담당 source/test에서 `test.skip`, `test.only`, `describe.skip`, `describe.only`, `it.skip`, `it.only`, `TODO_PLACEHOLDER`는 발견되지 않았다.

## 전체 검사와 통합 blocker

작업 중 최신 통합 상태에서 `bun run check`를 실행했다. legacy 이동 파일의 타입 오류는 없었지만, 동시에 진행 중인 공통 TUI 이동이 아직 shell 및 여러 테스트 import를 새 경로로 전환하기 전이라 exit 1이었다. 대표 blocker는 다음과 같았다.

```text
src/adapters/inbound/tui/shell/astra-surface.ts: old dashboard/chat imports
src/adapters/inbound/tui/shell/workbench-shell.ts: old dashboard/chat/overlays imports
src/cli.ts: old overlays/native-thread-picker import
test/astra-ui.test.ts, test/workbench-views.test.ts 등: old TUI imports
```

같은 중간 상태의 `bun test test/architecture.test.ts`는 `12 pass / 1 fail`이었다. 실패 원인은 다른 이동 범위의 이전 파일 `src/adapters/inbound/tui/dashboard/delegation-tree-view.ts`가 아직 남아 새 허용 그룹 검사에 걸린 것이었다. legacy group 자체, inbound/outbound 방향, cycle, native shell의 legacy 독립 검사는 통과했다.

`.www/control-ledger/traceability.json`에는 이전 legacy 세 경로가 남아 있음을 통합자에게 전달했다. 통합자가 공통 import 전환과 함께 새 `tui/legacy/*` 경로로 갱신한다.

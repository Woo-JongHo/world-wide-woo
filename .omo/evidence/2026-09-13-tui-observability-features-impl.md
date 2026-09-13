# TUI 관측 기능 리팩터링 구현 증거 — 2026-09-13

## 범위

- 기존 `src/adapters/inbound/tui/dashboard`의 관측 화면을 `src/adapters/inbound/tui/features/{dashboard,monitoring,session,stats,usage,project-map,context,test}`로 이동했다.
- `astra-details.ts`의 다섯 화면을 각 기능의 `astra-{stats,history,monitor,map,context}-view.ts`로 분리하고 기존 집합 파일은 제거했다.
- Chat에서 분리 대기 중이던 `WorkbenchMonitorView`를 `features/monitoring/workbench-monitor-view.ts`로 옮기고, sibling feature import 없이 Core projection과 Foundation만 참조하게 했다.
- `AstraTestView`를 `projectAstraTestView`(snapshot → projection), `renderAstraTestView`(projection → rows), `AstraTestView`(projection 소비)로 나눴다. render pass는 Workbench snapshot을 읽거나 domain projection을 만들지 않는다.
- 각 담당 기능에 `.feature.ts` descriptor를 추가했다. 중앙 registry는 수정하지 않았다.
- 변경 중 소유권 정정에 따라 `delegation-tree-view.ts`, `workbench-tracer-view.ts`와 두 대응 테스트는 실행/Trace 담당 결과를 보존했다.

## 기능 metadata

| ID | key | order | kind | route |
|---|---|---:|---|---|
| TUI-F001 | dashboard | 10 | page | dashboard |
| TUI-F006 | monitor | 60 | page | monitor |
| TUI-F007 | session | 70 | interaction | — |
| TUI-F008 | stats | 80 | page | stats |
| TUI-F009 | usage | 90 | embedded | — |
| TUI-F010 | map | 100 | page | map |
| TUI-F011 | context | 110 | page | context |
| TUI-F012 | test | 120 | page | test |

## 검증 전문

### 담당 행동 테스트

```text
$ bun test test/entry-dashboard-view.test.ts test/observability-dashboard.test.ts test/observability-views.test.ts test/session-stats-view.test.ts test/usage-strip.test.ts test/workbench-telemetry.test.ts test/request-test-workspace.test.ts test/dashboard-pre-user-test.test.ts
bun test v1.4.0 (34cbb9a40)

test/session-stats-view.test.ts: 18 pass
test/usage-strip.test.ts: 5 pass
test/observability-views.test.ts: 8 pass
test/observability-dashboard.test.ts: 3 pass
test/workbench-telemetry.test.ts: 3 pass
test/dashboard-pre-user-test.test.ts: 3 pass
test/entry-dashboard-view.test.ts: 4 pass
test/request-test-workspace.test.ts: 4 pass

48 pass
0 fail
1083 expect() calls
Ran 48 tests across 8 files. [110.00ms]
```

`test/development-map.test.ts`를 포함한 첫 실행에서는 위 48개가 모두 통과한 뒤 다음 통합 중간 오류로 suite load가 중단됐다.

```text
error: Cannot find module '../dashboard/dashboard-layout'
from 'src/adapters/inbound/tui/shell/workbench-shell.ts'
1 tests failed
48 pass
1 fail
1 error
```

이 오류는 담당 `DevelopmentMapView`가 아니라 당시 shell composition import가 이동 전 Foundation 경로를 참조한 결과다. 통합자가 shell import를 갱신해야 실행 가능한 테스트다.

### 아키텍처 게이트

```text
$ bun test test/architecture.test.ts
bun test v1.4.0 (34cbb9a40)

(pass) source architecture > keeps flattened layers grouped by their canonical responsibility
(pass) source architecture > keeps the core independent from adapters
(pass) source architecture > keeps core domain independent from orchestration and effects
(pass) source architecture > does not recreate the retired top-level source layers
(pass) source architecture > keeps inbound adapters from importing outbound adapters
(pass) source architecture > keeps process execution behind application-owned ports
(pass) source architecture > keeps TUI foundation independent from higher-level TUI groups
(pass) source architecture > keeps TUI feature implementations independent from sibling features
(pass) source architecture > keeps concrete executor adapters independent
(pass) source architecture > has no relative source dependency cycles
(pass) source architecture > keeps the Work capability entry independent from TUI and Runtime implementations
(pass) source architecture > keeps the composition root small
(pass) source architecture > keeps the native workbench shell independent from the legacy session runtime

13 pass
0 fail
1241 expect() calls
Ran 13 tests across 1 file. [144.00ms]
```

### 새 module import smoke

```text
$ bun -e 'await Promise.all([...17개 담당 module].map(path => import(path)))'
17 feature modules imported
```

### TypeScript 중간 check

```text
$ bun run check
$ tsc --noEmit
exit 1
```

실패는 병렬 이동 중 아직 갱신되지 않은 소비 import에서만 관측됐다.

```text
features/chat/astra-execution.ts -> ../../dashboard/request-runtime-view
features/trace/workbench-tracer-view.ts -> ../../dashboard/dashboard-panel-system
shell/astra-surface.ts -> ../dashboard/dashboard-layout, ../chat/astra-execution,
  ../dashboard/astra-details, ../dashboard/usage-value, ../dashboard/astra-usage
shell/workbench-shell.ts -> 이동 전 dashboard/chat/overlay 경로들
cli.ts -> 이동 전 native-thread-picker 경로
비소유 테스트 -> 이동 전 dashboard/chat/overlay 경로들
```

해당 실패 전문의 나머지는 위 missing import가 만든 callback implicit-any 파생 오류다. 담당 feature module의 타입 오류는 보고되지 않았다.

### 정적 검사

```text
$ git diff --check -- <담당 source/test 경로>
exit 0

$ rg '^import .*\.\./(?:[^/]+/)*features/' <담당 feature 경로>
no matches

$ rg 'TODO|test\.(skip|only)|describe\.(skip|only)|it\.(skip|only)|Not implemented' <담당 경로>
shared-dashboard-views.ts: 화면 문구 "TODO · 공개 계획을 기다리는 중" / "TODO · 현재 계획 없음"
request-runtime-view.ts: 화면 section label "TODO"
```

마지막 두 `TODO` 일치는 사용자에게 표시하는 기존 제품 용어이며 구현 자리표시가 아니다. skip/only/미구현 분기 일치는 없다.

## 통합 인계

Shell/Astra surface의 소비 import는 다음 개별 module을 사용해야 한다.

- `AstraStatsView` → `features/stats/astra-stats-view`
- `AstraHistoryView` → `features/session/astra-history-view`
- `AstraMonitorView` → `features/monitoring/astra-monitor-view`
- `AstraMapView` → `features/project-map/astra-map-view`
- `AstraContextView` → `features/context/astra-context-view`
- `AstraTestView`, `projectAstraTestView` → `features/test/astra-test-view`
- `WorkbenchMonitorView` → `features/monitoring/workbench-monitor-view`

`AstraTestView` 조립은 `new AstraTestView(() => projectAstraTestView(snapshot))` 형태로 projection을 주입한다.

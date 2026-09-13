# Astra TUI foundation 구현 증거

- 작업 경로: `/Users/jonghoPro/woo/00_project/99_www`
- 브랜치: `astra/terminal-ui`
- 기록일: 2026-09-13
- 범위: TUI foundation 이동, ChatScrollView feature 분리, 직접 대응 테스트 import 전환

## Foundation 의존 확인

명령:

```sh
rg -n '(core/|features/|runtime/|session-runtime|native-session|native-execution)' src/adapters/inbound/tui/foundation || true
```

출력:

```text
```

판정: foundation 소스에서 Core, 상위 TUI feature, session/execution/runtime 구현 import가 발견되지 않았다. `@gajae-code/natives`에서는 표시 전용 `highlightCode`, `supportsLanguage`, `HighlightColors`만 사용한다.

## 직접 대응 테스트

명령:

```sh
bun test test/syntax-highlighter.test.ts test/render-scheduler.test.ts test/dashboard-layout.test.ts test/dashboard-panel-system.test.ts test/chat-scroll-acceptance.test.ts
```

출력 전문:

```text
bun test v1.4.0 (34cbb9a40)

test/render-scheduler.test.ts:
(pass) RenderScheduler > coalesces in-turn native deltas but flushes durable and terminal updates [0.06ms]
(pass) RenderScheduler > coalesces token deltas to a 64ms trailing render [0.20ms]
(pass) RenderScheduler > flushes terminal state immediately and cancels a stale timer [0.06ms]

test/dashboard-panel-system.test.ts:
(pass) Workbench panel system > keeps the Todo and Tracer information hierarchy stable across widths [0.07ms]

test/syntax-highlighter.test.ts:
(pass) native syntax highlight plugin > colors supported Python tokens without changing terminal width [14.74ms]
(pass) native syntax highlight plugin > renders an unknown language safely [0.08ms]

test/chat-scroll-acceptance.test.ts:
(pass) chat scroll acceptance > retains the older reading anchor and disabled follow across 120, 80, and 40 columns while streaming [17.81ms]
(pass) chat scroll acceptance > restores follow when the reader returns to latest before changing width [7.08ms]

test/dashboard-layout.test.ts:
(pass) dashboard layout > renders Todo on the Workbench top border [2.64ms]
(pass) dashboard layout > keeps three regions in one wide frame with independent viewports [2.45ms]
(pass) dashboard layout > places the Tracer title on the split rule without adding a second heading row [1.75ms]
(pass) dashboard layout > uses one ordered viewport inside the same frame when compact [1.79ms]
(pass) dashboard layout > keeps every section reachable at 120×10 [1.38ms]
(pass) dashboard layout > keeps every section reachable at 120×13 [0.86ms]
(pass) dashboard layout > reuses section rows when a child returns the same stable projection [0.18ms]
(pass) dashboard layout > reuses unchanged prefixes without retaining a stale dynamic tail [0.21ms]
(pass) dashboard layout > keeps every wheel delta in its contained chat viewport while content renders [8.49ms]

 17 pass
 0 fail
 128 expect() calls
Ran 17 tests across 5 files. [109.00ms]
```

## Foundation 전용 타입 검사

명령:

```sh
bunx tsc --ignoreConfig --noEmit --skipLibCheck --target ES2022 --module ESNext --moduleResolution bundler --esModuleInterop --types bun src/adapters/inbound/tui/foundation/theme/theme.ts src/adapters/inbound/tui/foundation/theme/astra-theme.ts src/adapters/inbound/tui/foundation/theme/syntax-highlighter.ts src/adapters/inbound/tui/foundation/layout/dashboard-layout.ts src/adapters/inbound/tui/foundation/layout/dashboard-panel-system.ts src/adapters/inbound/tui/foundation/components/overlay-sheet.ts src/adapters/inbound/tui/foundation/rendering/render-scheduler.ts src/adapters/inbound/tui/features/chat/chat-scroll.view.ts
```

출력 전문:

```text
```

종료 코드: `0`

## Architecture 검사

명령:

```sh
bun test test/architecture.test.ts
```

출력 전문:

```text
bun test v1.4.0 (34cbb9a40)

test/architecture.test.ts:
(fail) source architecture > keeps flattened layers grouped by their canonical responsibility
error: unknown responsibility group: adapters/inbound/tui/dashboard/delegation-tree-view.ts
Expected: true
Received: false
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

 12 pass
 1 fail
 866 expect() calls
Ran 13 tests across 1 file. [156.00ms]
```

판정: foundation 역의존 및 cycle 게이트는 통과했다. 유일한 실패는 이 작업 소유 밖의 `dashboard/delegation-tree-view.ts`가 병렬 이동 중 구 경로에 남은 상태다.

## 전체 타입 검사

명령:

```sh
bun run check
```

출력 전문:

```text
$ tsc --noEmit
src/adapters/inbound/tui/features/chat/astra-execution.ts(6,64): error TS2307: Cannot find module '../../dashboard/request-runtime-view' or its corresponding type declarations.
src/adapters/inbound/tui/features/chat/workbench-views.ts(90,9): error TS2304: Cannot find name 'sanitizeTerminalTextExcerpt'.
src/adapters/inbound/tui/features/trace/workbench-tracer-view.ts(7,40): error TS2307: Cannot find module '../../dashboard/dashboard-panel-system' or its corresponding type declarations.
src/adapters/inbound/tui/shell/astra-surface.ts(4,32): error TS2307: Cannot find module '../dashboard/dashboard-layout' or its corresponding type declarations.
src/adapters/inbound/tui/shell/astra-surface.ts(5,92): error TS2307: Cannot find module '../chat/astra-execution' or its corresponding type declarations.
src/adapters/inbound/tui/shell/astra-surface.ts(6,34): error TS2307: Cannot find module '../dashboard/astra-details' or its corresponding type declarations.
src/adapters/inbound/tui/shell/astra-surface.ts(9,30): error TS2307: Cannot find module '../dashboard/usage-value' or its corresponding type declarations.
src/adapters/inbound/tui/shell/astra-surface.ts(10,32): error TS2307: Cannot find module '../dashboard/astra-usage' or its corresponding type declarations.
src/adapters/inbound/tui/shell/workbench-shell.ts(30,39): error TS2307: Cannot find module '../dashboard/dashboard-layout' or its corresponding type declarations.
src/adapters/inbound/tui/shell/workbench-shell.ts(31,67): error TS2307: Cannot find module '../dashboard/shared-dashboard-views' or its corresponding type declarations.
src/adapters/inbound/tui/shell/workbench-shell.ts(32,57): error TS2307: Cannot find module '../chat/workbench-views' or its corresponding type declarations.
src/adapters/inbound/tui/shell/workbench-shell.ts(33,37): error TS2307: Cannot find module '../dashboard/workbench-tracer-view' or its corresponding type declarations.
src/adapters/inbound/tui/shell/workbench-shell.ts(35,30): error TS2307: Cannot find module '../overlays/auth-overlay' or its corresponding type declarations.
src/adapters/inbound/tui/shell/workbench-shell.ts(36,33): error TS2307: Cannot find module '../overlays/approval-overlay' or its corresponding type declarations.
src/adapters/inbound/tui/shell/workbench-shell.ts(37,36): error TS2307: Cannot find module '../overlays/model-picker-overlay' or its corresponding type declarations.
src/adapters/inbound/tui/shell/workbench-shell.ts(38,30): error TS2307: Cannot find module '../overlays/overlay-sheet' or its corresponding type declarations.
src/adapters/inbound/tui/shell/workbench-shell.ts(43,40): error TS2307: Cannot find module '../dashboard/workbench-bottom-hud' or its corresponding type declarations.
src/adapters/inbound/tui/shell/workbench-shell.ts(44,61): error TS2307: Cannot find module '../dashboard/workbench-telemetry' or its corresponding type declarations.
src/adapters/inbound/tui/shell/workbench-shell.ts(45,32): error TS2307: Cannot find module '../dashboard/usage-strip-view' or its corresponding type declarations.
src/adapters/inbound/tui/shell/workbench-shell.ts(46,38): error TS2307: Cannot find module '../dashboard/workbench-hud-system' or its corresponding type declarations.
src/adapters/inbound/tui/shell/workbench-shell.ts(47,36): error TS2307: Cannot find module '../dashboard/development-map-view' or its corresponding type declarations.
src/adapters/inbound/tui/shell/workbench-shell.ts(48,44): error TS2307: Cannot find module '../dashboard/observability-dashboard-view' or its corresponding type declarations.
src/adapters/inbound/tui/shell/workbench-shell.ts(49,36): error TS2307: Cannot find module '../dashboard/runtime-monitor-view' or its corresponding type declarations.
src/adapters/inbound/tui/shell/workbench-shell.ts(50,34): error TS2307: Cannot find module '../dashboard/session-stats-view' or its corresponding type declarations.
src/adapters/inbound/tui/shell/workbench-shell.ts(51,100): error TS2307: Cannot find module '../dashboard/astra-details' or its corresponding type declarations.
src/adapters/inbound/tui/shell/workbench-shell.ts(52,31): error TS2307: Cannot find module '../dashboard/astra-test-view' or its corresponding type declarations.
src/adapters/inbound/tui/shell/workbench-shell.ts(53,44): error TS2307: Cannot find module '../dashboard/request-runtime-view' or its corresponding type declarations.
src/adapters/inbound/tui/shell/workbench-shell.ts(55,38): error TS2307: Cannot find module '../chat/astra-execution' or its corresponding type declarations.
src/adapters/inbound/tui/shell/workbench-shell.ts(786,11): error TS7006: Parameter 'authStatus' implicitly has an 'any' type.
src/adapters/inbound/tui/shell/workbench-shell.ts(820,10): error TS7006: Parameter 'provider' implicitly has an 'any' type.
src/adapters/inbound/tui/shell/workbench-shell.ts(845,5): error TS7006: Parameter 'decision' implicitly has an 'any' type.
src/cli.ts(59,47): error TS2307: Cannot find module './adapters/inbound/tui/overlays/native-thread-picker' or its corresponding type declarations.
test/astra-model.test.ts(12,36): error TS2307: Cannot find module '../src/adapters/inbound/tui/overlays/model-picker-overlay' or its corresponding type declarations.
test/astra-ui.test.ts(7,142): error TS2307: Cannot find module '../src/adapters/inbound/tui/chat/astra-execution' or its corresponding type declarations.
test/astra-ui.test.ts(8,68): error TS2307: Cannot find module '../src/adapters/inbound/tui/dashboard/astra-details' or its corresponding type declarations.
test/astra-ui.test.ts(12,33): error TS2307: Cannot find module '../src/adapters/inbound/tui/overlays/approval-overlay' or its corresponding type declarations.
test/astra-ui.test.ts(13,36): error TS2307: Cannot find module '../src/adapters/inbound/tui/overlays/native-thread-picker' or its corresponding type declarations.
test/astra-ui.test.ts(15,32): error TS2307: Cannot find module '../src/adapters/inbound/tui/dashboard/astra-usage' or its corresponding type declarations.
test/astra-ui.test.ts(16,67): error TS2307: Cannot find module '../src/adapters/inbound/tui/dashboard/request-runtime-view' or its corresponding type declarations.
test/chat-render-acceptance.test.ts(5,35): error TS2307: Cannot find module '../src/adapters/inbound/tui/chat/workbench-views' or its corresponding type declarations.
test/delegation-tree-view.test.ts(6,101): error TS2307: Cannot find module '../src/adapters/inbound/tui/dashboard/delegation-tree-view' or its corresponding type declarations.
test/delegation-tree-view.test.ts(7,35): error TS2307: Cannot find module '../src/adapters/inbound/tui/chat/workbench-views' or its corresponding type declarations.
test/request-controller.test.ts(12,36): error TS2307: Cannot find module '../src/adapters/inbound/tui/dashboard/request-runtime-view' or its corresponding type declarations.
test/request-runtime.test.ts(11,36): error TS2307: Cannot find module '../src/adapters/inbound/tui/dashboard/request-runtime-view' or its corresponding type declarations.
test/result-cards.test.ts(4,94): error TS2307: Cannot find module '../src/adapters/inbound/tui/chat/result-cards' or its corresponding type declarations.
test/work-step-card-highlight.test.ts(11,8): error TS2307: Cannot find module '../src/adapters/inbound/tui/chat/work-step-card' or its corresponding type declarations.
test/work-step-card-highlight.test.ts(12,32): error TS2307: Cannot find module '../src/adapters/inbound/tui/chat/result-cards' or its corresponding type declarations.
test/workbench-bottom-hud.test.ts(3,40): error TS2307: Cannot find module '../src/adapters/inbound/tui/dashboard/workbench-bottom-hud' or its corresponding type declarations.
test/workbench-bottom-hud.test.ts(4,32): error TS2307: Cannot find module '../src/adapters/inbound/tui/dashboard/usage-strip-view' or its corresponding type declarations.
test/workbench-hud-system.test.ts(2,57): error TS2307: Cannot find module '../src/adapters/inbound/tui/dashboard/workbench-hud-system' or its corresponding type declarations.
test/workbench-lifecycle-noise.test.ts(6,35): error TS2307: Cannot find module '../src/adapters/inbound/tui/chat/workbench-views' or its corresponding type declarations.
test/workbench-shell-policy.test.ts(30,39): error TS2307: Cannot find module '../src/adapters/inbound/tui/dashboard/dashboard-layout' or its corresponding type declarations.
test/workbench-tracer-view.test.ts(3,37): error TS2307: Cannot find module '../src/adapters/inbound/tui/dashboard/workbench-tracer-view' or its corresponding type declarations.
test/workbench-views.test.ts(8,39): error TS2307: Cannot find module '../src/adapters/inbound/tui/dashboard/dashboard-layout' or its corresponding type declarations.
test/workbench-views.test.ts(12,8): error TS2307: Cannot find module '../src/adapters/inbound/tui/dashboard/shared-dashboard-views' or its corresponding type declarations.
test/workbench-views.test.ts(13,75): error TS2307: Cannot find module '../src/adapters/inbound/tui/chat/workbench-views' or its corresponding type declarations.
test/workbench-views.test.ts(14,37): error TS2307: Cannot find module '../src/adapters/inbound/tui/dashboard/workbench-tracer-view' or its corresponding type declarations.
test/workbench-views.test.ts(16,41): error TS2307: Cannot find module '../src/adapters/inbound/tui/chat/bounded-public-projection' or its corresponding type declarations.
test/workspace-todo-view.test.ts(6,35): error TS2307: Cannot find module '../src/adapters/inbound/tui/dashboard/shared-dashboard-views' or its corresponding type declarations.
error: script "check" exited with code 1
```

종료 코드: `1`

판정: 이 실행은 여러 에이전트의 병렬 파일 이동 중간 상태에서 수행됐다. foundation 전용 타입 검사는 별도로 성공했고, 전체 실패는 shell·feature·test 소비자의 구 경로 import와 해당 missing import가 유발한 연쇄 implicit-any 오류다. 최종 `bun run check`는 통합 패스가 소비자 import를 갱신한 뒤 다시 실행한다.

## 자리표시자 검사

명령:

```sh
rg -n 'test\.(skip|only)|describe\.(skip|only)|it\.(skip|only)|throw new Error\(["'"']Not implemented|IMPLEMENT ME|placeholder' src/adapters/inbound/tui/foundation src/adapters/inbound/tui/features/chat/chat-scroll.view.ts test/syntax-highlighter.test.ts test/render-scheduler.test.ts test/dashboard-layout.test.ts test/dashboard-panel-system.test.ts test/chat-scroll-acceptance.test.ts || true
```

출력:

```text
```

## 전체 타입 검사 raw 재실행

```text
$ tsc --noEmit
src/adapters/inbound/tui/shell/astra-surface.ts(4,32): error TS2307: Cannot find module '../dashboard/dashboard-layout' or its corresponding type declarations.
src/adapters/inbound/tui/shell/astra-surface.ts(5,92): error TS2307: Cannot find module '../chat/astra-execution' or its corresponding type declarations.
src/adapters/inbound/tui/shell/astra-surface.ts(6,34): error TS2307: Cannot find module '../dashboard/astra-details' or its corresponding type declarations.
src/adapters/inbound/tui/shell/astra-surface.ts(9,30): error TS2307: Cannot find module '../dashboard/usage-value' or its corresponding type declarations.
src/adapters/inbound/tui/shell/astra-surface.ts(10,32): error TS2307: Cannot find module '../dashboard/astra-usage' or its corresponding type declarations.
src/adapters/inbound/tui/shell/workbench-shell.ts(30,39): error TS2307: Cannot find module '../dashboard/dashboard-layout' or its corresponding type declarations.
src/adapters/inbound/tui/shell/workbench-shell.ts(31,67): error TS2307: Cannot find module '../dashboard/shared-dashboard-views' or its corresponding type declarations.
src/adapters/inbound/tui/shell/workbench-shell.ts(32,57): error TS2307: Cannot find module '../chat/workbench-views' or its corresponding type declarations.
src/adapters/inbound/tui/shell/workbench-shell.ts(33,37): error TS2307: Cannot find module '../dashboard/workbench-tracer-view' or its corresponding type declarations.
src/adapters/inbound/tui/shell/workbench-shell.ts(35,30): error TS2307: Cannot find module '../overlays/auth-overlay' or its corresponding type declarations.
src/adapters/inbound/tui/shell/workbench-shell.ts(36,33): error TS2307: Cannot find module '../overlays/approval-overlay' or its corresponding type declarations.
src/adapters/inbound/tui/shell/workbench-shell.ts(37,36): error TS2307: Cannot find module '../overlays/model-picker-overlay' or its corresponding type declarations.
src/adapters/inbound/tui/shell/workbench-shell.ts(38,30): error TS2307: Cannot find module '../overlays/overlay-sheet' or its corresponding type declarations.
src/adapters/inbound/tui/shell/workbench-shell.ts(43,40): error TS2307: Cannot find module '../dashboard/workbench-bottom-hud' or its corresponding type declarations.
src/adapters/inbound/tui/shell/workbench-shell.ts(44,61): error TS2307: Cannot find module '../dashboard/workbench-telemetry' or its corresponding type declarations.
src/adapters/inbound/tui/shell/workbench-shell.ts(45,32): error TS2307: Cannot find module '../dashboard/usage-strip-view' or its corresponding type declarations.
src/adapters/inbound/tui/shell/workbench-shell.ts(46,38): error TS2307: Cannot find module '../dashboard/workbench-hud-system' or its corresponding type declarations.
src/adapters/inbound/tui/shell/workbench-shell.ts(47,36): error TS2307: Cannot find module '../dashboard/development-map-view' or its corresponding type declarations.
src/adapters/inbound/tui/shell/workbench-shell.ts(48,44): error TS2307: Cannot find module '../dashboard/observability-dashboard-view' or its corresponding type declarations.
src/adapters/inbound/tui/shell/workbench-shell.ts(49,36): error TS2307: Cannot find module '../dashboard/runtime-monitor-view' or its corresponding type declarations.
src/adapters/inbound/tui/shell/workbench-shell.ts(50,34): error TS2307: Cannot find module '../dashboard/session-stats-view' or its corresponding type declarations.
src/adapters/inbound/tui/shell/workbench-shell.ts(51,100): error TS2307: Cannot find module '../dashboard/astra-details' or its corresponding type declarations.
src/adapters/inbound/tui/shell/workbench-shell.ts(52,31): error TS2307: Cannot find module '../dashboard/astra-test-view' or its corresponding type declarations.
src/adapters/inbound/tui/shell/workbench-shell.ts(53,44): error TS2307: Cannot find module '../dashboard/request-runtime-view' or its corresponding type declarations.
src/adapters/inbound/tui/shell/workbench-shell.ts(55,38): error TS2307: Cannot find module '../chat/astra-execution' or its corresponding type declarations.
src/adapters/inbound/tui/shell/workbench-shell.ts(786,11): error TS7006: Parameter 'authStatus' implicitly has an 'any' type.
src/adapters/inbound/tui/shell/workbench-shell.ts(820,10): error TS7006: Parameter 'provider' implicitly has an 'any' type.
src/adapters/inbound/tui/shell/workbench-shell.ts(845,5): error TS7006: Parameter 'decision' implicitly has an 'any' type.
src/cli.ts(59,47): error TS2307: Cannot find module './adapters/inbound/tui/overlays/native-thread-picker' or its corresponding type declarations.
test/astra-model.test.ts(12,36): error TS2307: Cannot find module '../src/adapters/inbound/tui/overlays/model-picker-overlay' or its corresponding type declarations.
test/astra-model.test.ts(39,55): error TS7006: Parameter 'provider' implicitly has an 'any' type.
test/astra-model.test.ts(39,154): error TS7006: Parameter 'value' implicitly has an 'any' type.
test/astra-model.test.ts(72,54): error TS7006: Parameter 'provider' implicitly has an 'any' type.
test/astra-model.test.ts(85,55): error TS7006: Parameter 'provider' implicitly has an 'any' type.
test/astra-ui.test.ts(7,142): error TS2307: Cannot find module '../src/adapters/inbound/tui/chat/astra-execution' or its corresponding type declarations.
test/astra-ui.test.ts(8,68): error TS2307: Cannot find module '../src/adapters/inbound/tui/dashboard/astra-details' or its corresponding type declarations.
test/astra-ui.test.ts(12,33): error TS2307: Cannot find module '../src/adapters/inbound/tui/overlays/approval-overlay' or its corresponding type declarations.
test/astra-ui.test.ts(13,36): error TS2307: Cannot find module '../src/adapters/inbound/tui/overlays/native-thread-picker' or its corresponding type declarations.
test/astra-ui.test.ts(15,32): error TS2307: Cannot find module '../src/adapters/inbound/tui/dashboard/astra-usage' or its corresponding type declarations.
test/astra-ui.test.ts(16,67): error TS2307: Cannot find module '../src/adapters/inbound/tui/dashboard/request-runtime-view' or its corresponding type declarations.
test/astra-ui.test.ts(93,100): error TS7006: Parameter 'row' implicitly has an 'any' type.
test/astra-ui.test.ts(294,134): error TS7006: Parameter 'id' implicitly has an 'any' type.
test/astra-ui.test.ts(297,21): error TS7006: Parameter 'row' implicitly has an 'any' type.
test/request-controller.test.ts(12,36): error TS2307: Cannot find module '../src/adapters/inbound/tui/dashboard/request-runtime-view' or its corresponding type declarations.
test/request-controller.test.ts(206,22): error TS7006: Parameter 'row' implicitly has an 'any' type.
test/request-runtime.test.ts(11,36): error TS2307: Cannot find module '../src/adapters/inbound/tui/dashboard/request-runtime-view' or its corresponding type declarations.
test/request-runtime.test.ts(94,85): error TS7006: Parameter 'row' implicitly has an 'any' type.
test/workbench-bottom-hud.test.ts(3,40): error TS2307: Cannot find module '../src/adapters/inbound/tui/dashboard/workbench-bottom-hud' or its corresponding type declarations.
test/workbench-bottom-hud.test.ts(4,32): error TS2307: Cannot find module '../src/adapters/inbound/tui/dashboard/usage-strip-view' or its corresponding type declarations.
test/workbench-hud-system.test.ts(2,57): error TS2307: Cannot find module '../src/adapters/inbound/tui/dashboard/workbench-hud-system' or its corresponding type declarations.
test/workbench-lifecycle-noise.test.ts(6,35): error TS2307: Cannot find module '../src/adapters/inbound/tui/chat/workbench-views' or its corresponding type declarations.
test/workbench-shell-policy.test.ts(30,39): error TS2307: Cannot find module '../src/adapters/inbound/tui/dashboard/dashboard-layout' or its corresponding type declarations.
test/workbench-shell-policy.test.ts(230,13): error TS7006: Parameter 'value' implicitly has an 'any' type.
test/workbench-shell-policy.test.ts(231,13): error TS7006: Parameter 'value' implicitly has an 'any' type.
test/workbench-shell-policy.test.ts(232,13): error TS7006: Parameter 'value' implicitly has an 'any' type.
test/workbench-views.test.ts(8,39): error TS2307: Cannot find module '../src/adapters/inbound/tui/dashboard/dashboard-layout' or its corresponding type declarations.
test/workbench-views.test.ts(2275,13): error TS7006: Parameter 'text' implicitly has an 'any' type.
test/workbench-views.test.ts(2276,13): error TS7006: Parameter 'text' implicitly has an 'any' type.
test/workbench-views.test.ts(2277,13): error TS7006: Parameter 'text' implicitly has an 'any' type.
test/workbench-views.test.ts(2308,13): error TS7006: Parameter 'text' implicitly has an 'any' type.
test/workbench-views.test.ts(2309,13): error TS7006: Parameter 'text' implicitly has an 'any' type.
test/workbench-views.test.ts(2310,13): error TS7006: Parameter 'text' implicitly has an 'any' type.
test/workbench-views.test.ts(2353,13): error TS7006: Parameter 'text' implicitly has an 'any' type.
test/workbench-views.test.ts(2354,13): error TS7006: Parameter 'text' implicitly has an 'any' type.
test/workbench-views.test.ts(2355,13): error TS7006: Parameter 'text' implicitly has an 'any' type.
test/workbench-views.test.ts(2395,13): error TS7006: Parameter 'text' implicitly has an 'any' type.
test/workbench-views.test.ts(2396,13): error TS7006: Parameter 'text' implicitly has an 'any' type.
test/workbench-views.test.ts(2397,13): error TS7006: Parameter 'text' implicitly has an 'any' type.
test/workspace-todo-view.test.ts(6,35): error TS2307: Cannot find module '../src/adapters/inbound/tui/dashboard/shared-dashboard-views' or its corresponding type declarations.
test/workspace-todo-view.test.ts(80,23): error TS7006: Parameter 'line' implicitly has an 'any' type.
error: script "check" exited with code 1
EXIT 1

```

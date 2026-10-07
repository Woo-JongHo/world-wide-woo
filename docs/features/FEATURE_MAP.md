# Feature Map

> 생성 파일 — `bun run feature-map:build`로 다시 만든다. 손으로 고치지 않는다.
> 형식: [Feature Implementation Contract](../workflows/FEATURE_IMPLEMENTATION_CONTRACT.md)
> 장은 기능 폴더 파일의 **직접 import**에서 추정한 후보다. `미발견`은 책임이 없다는 뜻이 아니다. 전이 의존·주입 경로·파일 안의 책임은 추적하지 않는다.
> 외부 효과는 기능이 쓰는 Port를 import하고 `implements`를 선언한 outbound 파일만 센다. 검증은 기능 폴더를 직접 import하는 테스트만 센다.
> 절 순서 열은 최상위 선언 줄 패턴의 후보 수다(§3·§4). 타입 순서 열은 첫 실행 선언 뒤에 있는 공개 타입 수다(§1·§2). 문단 열은 첫 처리 문장 뒤에 선언이 있는 함수 수다(F3). 0은 전체 순서 준수의 증거가 아니다.

| 기능 | 0. 연결 | 1. 정의 | 2. 흐름 | 3. 경계 | 4. 입력·조작 | 5. 외부 효과 | 6. 해석 | 7. 표현 | 8. 조립 | 9. 검증 | 절 순서 후보 | 타입 순서 후보 | 문단 후보 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| approval | 2 | 3 | · | · | · | · | · | 3 | 2 | 7 | · | · | 1 |
| authentication | 2 | 1 | · | 1 | · | 2 | · | 3 | 1 | 1 | · | · | 2 |
| cache | 2 | 1 | · | 1 | · | 2 | 1 | 4 | 1 | 3 | · | · | 1 |
| chat | 2 | 13 | 3 | · | · | · | 2 | 26 | 2 | 27 | 1 | · | 31 |
| context | 2 | 2 | · | 1 | · | 2 | · | 6 | 2 | 2 | · | · | 2 |
| dashboard | 2 | 4 | · | · | · | · | · | 8 | 3 | 9 | · | · | 3 |
| demo | · | 4 | · | 1 | · | 2 | 1 | · | 1 | 3 | · | · | · |
| model-selection | 2 | 1 | · | 1 | · | 2 | · | 4 | 1 | 3 | · | · | 2 |
| monitoring | 2 | 9 | 1 | 1 | · | 1 | · | 10 | 3 | 17 | · | · | 5 |
| plan | 2 | 2 | 1 | · | · | · | · | 3 | 1 | 4 | · | · | 2 |
| repository | 2 | 1 | · | 1 | · | 1 | · | 2 | · | 1 | · | · | · |
| session | 2 | 2 | · | · | · | · | 1 | 5 | 1 | 4 | · | · | · |
| stats | 2 | 2 | · | · | · | · | · | 5 | 1 | 2 | · | · | · |
| test | 2 | 3 | · | · | · | · | · | 2 | 1 | 2 | 3 | · | · |
| tnote | 2 | 2 | 2 | · | 1 | · | 2 | 4 | 1 | 7 | · | · | 3 |
| trace | 2 | 3 | 1 | · | · | · | · | 2 | 1 | 6 | · | · | · |
| usage | 2 | 1 | · | 1 | · | 2 | 2 | 9 | 3 | 10 | · | · | · |
| workflow | 2 | 3 | · | · | · | · | · | 4 | 1 | 2 | · | · | 2 |

## approval

- **0. 연결** `adapters/inbound/tui/features/approval/registration/approval.feature.ts`, `adapters/inbound/tui/features/approval/registration/approval.units.ts`
- **1. 정의** `core/domain/execution/native-session.ts`, `core/domain/execution/terminal.ts`, `core/domain/work/workbench.ts`
- **2. 흐름** 미발견
- **3. 경계** 미발견
- **4. 입력·조작** 미발견
- **5. 외부 효과** 미발견
- **6. 해석** 미발견
- **7. 표현** `adapters/inbound/tui/features/approval/view/approval-overlay.ts`, `adapters/inbound/tui/features/approval/view/approval-presentation.ts`, `adapters/inbound/tui/foundation/theme/theme.ts`
- **8. 조립** `adapters/inbound/tui/shell/workbench-overlay-controller.ts`, `adapters/inbound/tui/shell/workbench-shell.ts`
- **9. 검증** `test/approval-overlay.test.ts`, `test/workbench-public-views.test.ts`, `test/workbench-transcript-views.test.ts`, `test/workbench-views.fixtures.ts`, `test/workbench-views.test.ts`, `test/workbench-work-step-views.test.ts`, `test/www-ui.test.ts`

문단 후보:
- adapters/inbound/tui/features/approval/view/approval-overlay.ts:88 handleInput GBBBGDBB

## authentication

- **0. 연결** `adapters/inbound/tui/features/authentication/registration/authentication.feature.ts`, `adapters/inbound/tui/features/authentication/registration/authentication.units.ts`
- **1. 정의** `core/domain/execution/model-settings.ts`
- **2. 흐름** 미발견
- **3. 경계** `core/ports/integration/auth-controller-port.ts`
- **4. 입력·조작** 미발견
- **5. 외부 효과** `adapters/outbound/authentication/antigravity-auth.ts`, `adapters/outbound/authentication/auth-service.ts`
- **6. 해석** 미발견
- **7. 표현** `adapters/inbound/tui/features/authentication/view/auth-overlay-view.ts`, `adapters/inbound/tui/features/authentication/view/auth-overlay.ts`, `adapters/inbound/tui/foundation/theme/theme.ts`
- **8. 조립** `adapters/inbound/tui/shell/workbench-overlay-controller.ts`
- **9. 검증** `test/auth-overlay.test.ts`

문단 후보:
- adapters/inbound/tui/features/authentication/view/auth-overlay.ts:50 start BDBB
- adapters/inbound/tui/features/authentication/view/auth-overlay.ts:159 handleInput BDGDBBBBB

## cache

- **0. 연결** `adapters/inbound/tui/features/cache/registration/cache.feature.ts`, `adapters/inbound/tui/features/cache/registration/cache.units.ts`
- **1. 정의** `core/domain/observability/cache-telemetry.ts`
- **2. 흐름** 미발견
- **3. 경계** `core/ports/observability/usage-monitor-port.ts`
- **4. 입력·조작** 미발견
- **5. 외부 효과** `adapters/outbound/execution/codex-app-server.ts`, `adapters/outbound/observability/usage-service.ts`
- **6. 해석** `adapters/inbound/tui/features/cache/view-model/cache-telemetry-projection.ts`
- **7. 표현** `adapters/inbound/tui/features/cache/view/www-cache-catalog.ts`, `adapters/inbound/tui/features/cache/view/www-cache-view.ts`, `adapters/inbound/tui/foundation/layout/www-monitoring-layout.ts`, `adapters/inbound/tui/foundation/theme/www-theme.ts`
- **8. 조립** `adapters/inbound/tui/shell/www-surface.ts`
- **9. 검증** `test/cache-telemetry.test.ts`, `test/www-cache-fidelity.test.ts`, `test/www-ui.test.ts`

문단 후보:
- adapters/inbound/tui/features/cache/view/www-cache-catalog.ts:111 (anonymous) BDDBR

## chat

- **0. 연결** `adapters/inbound/tui/features/chat/registration/chat.feature.ts`, `adapters/inbound/tui/features/chat/registration/chat.units.ts`
- **1. 정의** `core/domain/execution/file-diff.ts`, `core/domain/execution/output-language.ts`, `core/domain/execution/output.ts`, `core/domain/execution/project-activity.ts`, `core/domain/execution/request-runtime.ts`, `core/domain/execution/shell-description.ts`, `core/domain/execution/terminal.ts`, `core/domain/observability/cache-telemetry.ts`, `core/domain/review/redaction.ts`, `core/domain/value/record.ts`, `core/domain/work/index.ts`, `core/domain/work/three-body-simulation.ts`, `core/domain/work/workbench.ts`
- **2. 흐름** `core/application/orchestration/workbench-feature-reads.ts`, `core/application/work/conversation-recap.ts`, `core/application/work/t-note-service.ts`
- **3. 경계** 미발견
- **4. 입력·조작** 미발견
- **5. 외부 효과** 미발견
- **6. 해석** `adapters/inbound/tui/features/chat/view-model/bounded-public-projection.ts`, `adapters/inbound/tui/features/chat/view-model/file-change.ts`
- **7. 표현** `adapters/inbound/tui/features/chat/view/chat-durable-transcript.ts`, `adapters/inbound/tui/features/chat/view/chat-live-activity.ts`, `adapters/inbound/tui/features/chat/view/chat-message-renderer.ts`, `adapters/inbound/tui/features/chat/view/chat-output-policy.ts`, `adapters/inbound/tui/features/chat/view/chat-public-lifecycle.ts`, `adapters/inbound/tui/features/chat/view/chat-scroll.view.ts`, `adapters/inbound/tui/features/chat/view/conversation-recap-view.ts`, `adapters/inbound/tui/features/chat/view/delegation-tree-view.ts`, `adapters/inbound/tui/features/chat/view/octopus-scan.ts`, `adapters/inbound/tui/features/chat/view/result-cards.ts`, `adapters/inbound/tui/features/chat/view/three-body-braille.ts`, `adapters/inbound/tui/features/chat/view/three-body-lab.ts`, `adapters/inbound/tui/features/chat/view/three-body-orbit.ts`, `adapters/inbound/tui/features/chat/view/work-step-card.ts`, `adapters/inbound/tui/features/chat/view/work-step-components.ts`, `adapters/inbound/tui/features/chat/view/work-step-output-renderer.ts`, `adapters/inbound/tui/features/chat/view/work-step-public-projection.ts`, `adapters/inbound/tui/features/chat/view/workbench-views.ts`, `adapters/inbound/tui/features/chat/view/workbench-welcome.ts`, `adapters/inbound/tui/features/chat/view/www-execution.ts`, `adapters/inbound/tui/features/chat/view/www-transcript-cache.ts`, `adapters/inbound/tui/foundation/layout/dashboard-layout.ts`, `adapters/inbound/tui/foundation/rendering/scroll-row-source.ts`, `adapters/inbound/tui/foundation/rendering/unified-diff-view.ts`, `adapters/inbound/tui/foundation/theme/theme.ts`, `adapters/inbound/tui/foundation/theme/www-theme.ts`
- **8. 조립** `adapters/inbound/tui/shell/workbench-shell.ts`, `adapters/inbound/tui/shell/www-surface.ts`
- **9. 검증** `test/chat-render-acceptance.test.ts`, `test/chat-scroll-acceptance.test.ts`, `test/command-card-golden.test.ts`, `test/conversation-recap.test.ts`, `test/delegation-tree-view.test.ts`, `test/plan-activity-view.test.ts`, `test/project-workbench-recording.test.ts`, `test/result-cards.test.ts`, `test/three-body-braille.test.ts`, `test/three-body-lab.test.ts`, `test/three-body-orbit.test.ts`, `test/work-step-card-highlight.test.ts`, `test/workbench-lifecycle-noise.test.ts`, `test/workbench-public-views.test.ts`, `test/workbench-tracer-view.test.ts`, `test/workbench-transcript-views.test.ts`, `test/workbench-views.fixtures.ts`, `test/workbench-views.test.ts`, `test/workbench-welcome.test.ts`, `test/workbench-work-step-views.test.ts`, `test/www-git-bash-highlight.test.ts`, `test/www-lazy-row-integration.test.ts`, `test/www-shell-narration.test.ts`, `test/www-theme-render-cache.test.ts`, `test/www-transcript-cache.test.ts`, `test/www-ui.test.ts`, `test/www-welcome-cache.test.ts`

절 순서 후보:
- adapters/inbound/tui/features/chat/view/three-body-braille.ts:105 공개 선언이 내부 처리(51줄) 뒤에 있음

문단 후보:
- adapters/inbound/tui/features/chat/view-model/bounded-public-projection.ts:76 boundedString DBDBDBDBR
- adapters/inbound/tui/features/chat/view-model/bounded-public-projection.ts:103 project GGBBBGBDDDDBBR
- adapters/inbound/tui/features/chat/view/three-body-braille.ts:105 renderThreeBodyBrailleFrame DDDDDBBDR
- adapters/inbound/tui/features/chat/view/work-step-components.ts:95 render DDDDDGDDGDBDBR
- adapters/inbound/tui/features/chat/view/work-step-public-projection.ts:67 projectWorkStep DDDDDDDDDDDDDDDDDDDDDDDDDDBBBBBDBBBDDGDR
- adapters/inbound/tui/features/chat/view/chat-durable-transcript.ts:71 render DDDDDDDBDDBDDDDDBDDBBBDBBBDBBBBBBR
- adapters/inbound/tui/features/chat/view/chat-durable-transcript.ts:273 renderStepCard DBDDDDGDBBR
- adapters/inbound/tui/features/chat/view/www-transcript-cache.ts:136 rowsForRange GBGDDDBDDBGBR
- adapters/inbound/tui/features/chat/view/www-transcript-cache.ts:166 prepareGenerations BDDDBDBR
- adapters/inbound/tui/features/chat/view/www-transcript-cache.ts:215 newDurableGeneration DBDBR
- adapters/inbound/tui/features/chat/view/www-transcript-cache.ts:302 renderBlock DDBBBBDGDGDBBR
- adapters/inbound/tui/features/chat/view/www-transcript-cache.ts:337 widthIndex DBBBDDDBDBBR
- adapters/inbound/tui/features/chat/view/www-transcript-cache.ts:360 rowsFrom GDDBDBGR
- adapters/inbound/tui/features/chat/view/chat-scroll.view.ts:55 render BBDBBR
- adapters/inbound/tui/features/chat/view/chat-scroll.view.ts:66 updateLayout BBDGBBDBB
- adapters/inbound/tui/features/chat/view/delegation-tree-view.ts:63 summaryRows DBDDBBDBR
- adapters/inbound/tui/features/chat/view/delegation-tree-view.ts:87 depthFirstTasks DDBDDDDBBR
- adapters/inbound/tui/features/chat/view/delegation-tree-view.ts:94 visit GBBDB
- adapters/inbound/tui/features/chat/view/chat-message-renderer.ts:23 boundedWorkbenchMarkdown DBDGDDDDDBR
- adapters/inbound/tui/features/chat/view/chat-message-renderer.ts:105 render DDDDBGDDDDBDDDR
- adapters/inbound/tui/features/chat/view/chat-live-activity.ts:45 sync DBDDBBB
- adapters/inbound/tui/features/chat/view/work-step-output-renderer.ts:64 structuredOutput DBDBGDR
- adapters/inbound/tui/features/chat/view/work-step-output-renderer.ts:84 executionLineTone DBGGGDGGGGGGGGGGGGGR
- adapters/inbound/tui/features/chat/view/work-step-output-renderer.ts:111 renderExecutionLine GDBBDR
- adapters/inbound/tui/features/chat/view/work-step-output-renderer.ts:165 renderBashExecutionBlock GDDDDDDDDBBDR
- adapters/inbound/tui/features/chat/view/www-execution.ts:93 executionHeading DDDDGGGGDDBBDDDR
- adapters/inbound/tui/features/chat/view/www-execution.ts:257 md DBDBR
- adapters/inbound/tui/features/chat/view/www-execution.ts:354 appendMessageBlock BDDB
- adapters/inbound/tui/features/chat/view/www-execution.ts:370 renderMessage DBDDDR
- adapters/inbound/tui/features/chat/view/www-execution.ts:515 wwwToolRows DBDDDDDDDDDBDDBBBR
- adapters/inbound/tui/features/chat/view/www-execution.ts:681 durableTimelineIndex DDDBDBR

## context

- **0. 연결** `adapters/inbound/tui/features/context/registration/context.feature.ts`, `adapters/inbound/tui/features/context/registration/context.units.ts`
- **1. 정의** `core/domain/execution/request-runtime.ts`, `core/domain/work/workbench.ts`
- **2. 흐름** 미발견
- **3. 경계** `core/ports/observability/usage-monitor-port.ts`
- **4. 입력·조작** 미발견
- **5. 외부 효과** `adapters/outbound/execution/codex-app-server.ts`, `adapters/outbound/observability/usage-service.ts`
- **6. 해석** 미발견
- **7. 표현** `adapters/inbound/tui/features/context/view/www-context-catalog.ts`, `adapters/inbound/tui/features/context/view/www-context-view.ts`, `adapters/inbound/tui/foundation/labels.ts`, `adapters/inbound/tui/foundation/layout/www-monitoring-layout.ts`, `adapters/inbound/tui/foundation/theme/theme.ts`, `adapters/inbound/tui/foundation/theme/www-theme.ts`
- **8. 조립** `adapters/inbound/tui/shell/workbench-shell.ts`, `adapters/inbound/tui/shell/www-surface.ts`
- **9. 검증** `test/www-context-fidelity.test.ts`, `test/www-ui.test.ts`

문단 후보:
- adapters/inbound/tui/features/context/view/www-context-view.ts:37 render DDBDGDDDDDBBBBBBBBBBR
- adapters/inbound/tui/features/context/view/www-context-catalog.ts:87 (anonymous) BDBDR

## dashboard

- **0. 연결** `adapters/inbound/tui/features/dashboard/registration/dashboard.feature.ts`, `adapters/inbound/tui/features/dashboard/registration/dashboard.units.ts`
- **1. 정의** `core/domain/execution/project-activity.ts`, `core/domain/work/index.ts`, `core/domain/work/todos.ts`, `core/domain/work/workbench.ts`
- **2. 흐름** 미발견
- **3. 경계** 미발견
- **4. 입력·조작** 미발견
- **5. 외부 효과** 미발견
- **6. 해석** 미발견
- **7. 표현** `adapters/inbound/tui/features/dashboard/view/entry-dashboard-view.ts`, `adapters/inbound/tui/features/dashboard/view/shared-dashboard-views.ts`, `adapters/inbound/tui/features/dashboard/view/www-dashboard-catalog.ts`, `adapters/inbound/tui/foundation/labels.ts`, `adapters/inbound/tui/foundation/layout/dashboard-panel-system.ts`, `adapters/inbound/tui/foundation/layout/www-monitoring-layout.ts`, `adapters/inbound/tui/foundation/theme/theme.ts`, `adapters/inbound/tui/foundation/theme/www-theme.ts`
- **8. 조립** `adapters/inbound/tui/shell/workbench-shell-presentation.ts`, `adapters/inbound/tui/shell/workbench-shell.ts`, `adapters/inbound/tui/shell/www-surface.ts`
- **9. 검증** `test/workbench-public-views.test.ts`, `test/workbench-transcript-views.test.ts`, `test/workbench-views.fixtures.ts`, `test/workbench-views.test.ts`, `test/workbench-work-step-views.test.ts`, `test/workspace-todo-view.test.ts`, `test/www-dashboard-fidelity.test.ts`, `test/www-telemetry-duration.test.ts`, `test/www-ui.test.ts`

문단 후보:
- adapters/inbound/tui/features/dashboard/view/entry-dashboard-view.ts:47 render DGDDDDDDDDDDDDDBDDDDDDDDDDDDDDR
- adapters/inbound/tui/features/dashboard/view/www-dashboard-catalog.ts:90 (anonymous) BDDBR
- adapters/inbound/tui/features/dashboard/view/shared-dashboard-views.ts:70 renderTodo DDBDDDDBBR

## demo

- **0. 연결** 미발견
- **1. 정의** `core/domain/execution/project-activity.ts`, `core/domain/execution/request-runtime.ts`, `core/domain/work/index.ts`, `core/domain/work/workbench.ts`
- **2. 흐름** 미발견
- **3. 경계** `core/ports/observability/usage-monitor-port.ts`
- **4. 입력·조작** 미발견
- **5. 외부 효과** `adapters/outbound/execution/codex-app-server.ts`, `adapters/outbound/observability/usage-service.ts`
- **6. 해석** `adapters/inbound/tui/features/demo/view-model/www-demo.ts`
- **7. 표현** 미발견
- **8. 조립** `adapters/inbound/tui/shell/workbench-shell.ts`
- **9. 검증** `test/www-context-fidelity.test.ts`, `test/www-dashboard-fidelity.test.ts`, `test/www-usage-fidelity.test.ts`

## model-selection

- **0. 연결** `adapters/inbound/tui/features/model-selection/registration/model-selection.feature.ts`, `adapters/inbound/tui/features/model-selection/registration/model-selection.units.ts`
- **1. 정의** `core/domain/execution/model-settings.ts`
- **2. 흐름** 미발견
- **3. 경계** `core/ports/integration/auth-controller-port.ts`
- **4. 입력·조작** 미발견
- **5. 외부 효과** `adapters/outbound/authentication/antigravity-auth.ts`, `adapters/outbound/authentication/auth-service.ts`
- **6. 해석** 미발견
- **7. 표현** `adapters/inbound/tui/features/model-selection/view/model-picker-overlay.ts`, `adapters/inbound/tui/features/model-selection/view/model-picker-view.ts`, `adapters/inbound/tui/foundation/labels.ts`, `adapters/inbound/tui/foundation/theme/theme.ts`
- **8. 조립** `adapters/inbound/tui/shell/workbench-overlay-controller.ts`
- **9. 검증** `test/model-picker-overlay.test.ts`, `test/native-model-catalog.test.ts`, `test/www-model.test.ts`

문단 후보:
- adapters/inbound/tui/features/model-selection/view/model-picker-overlay.ts:61 (anonymous) BBDBDDDBBBBBB
- adapters/inbound/tui/features/model-selection/view/model-picker-overlay.ts:93 (anonymous) GBDBBB

## monitoring

- **0. 연결** `adapters/inbound/tui/features/monitoring/registration/monitoring.feature.ts`, `adapters/inbound/tui/features/monitoring/registration/monitoring.units.ts`
- **1. 정의** `core/domain/execution/output-language.ts`, `core/domain/execution/project-activity.ts`, `core/domain/execution/request-runtime.ts`, `core/domain/execution/terminal.ts`, `core/domain/observability/monitoring.ts`, `core/domain/observability/request-test-workspace.ts`, `core/domain/observability/runtime-monitor.ts`, `core/domain/work/index.ts`, `core/domain/work/workbench.ts`
- **2. 흐름** `core/application/session/session-monitor.ts`
- **3. 경계** `core/ports/observability/workbench-git-telemetry-port.ts`
- **4. 입력·조작** 미발견
- **5. 외부 효과** `adapters/outbound/git/git-telemetry-source.ts`
- **6. 해석** 미발견
- **7. 표현** `adapters/inbound/tui/features/monitoring/view/monitoring-overlay.ts`, `adapters/inbound/tui/features/monitoring/view/request-runtime-view.ts`, `adapters/inbound/tui/features/monitoring/view/runtime-monitor-view.ts`, `adapters/inbound/tui/features/monitoring/view/workbench-monitor-view.ts`, `adapters/inbound/tui/features/monitoring/view/workbench-telemetry.ts`, `adapters/inbound/tui/features/monitoring/view/www-monitor-view.ts`, `adapters/inbound/tui/foundation/components/status-card.ts`, `adapters/inbound/tui/foundation/labels.ts`, `adapters/inbound/tui/foundation/theme/theme.ts`, `adapters/inbound/tui/foundation/theme/www-theme.ts`
- **8. 조립** `adapters/inbound/tui/shell/workbench-shell-presentation.ts`, `adapters/inbound/tui/shell/workbench-shell.ts`, `adapters/inbound/tui/shell/www-surface.ts`
- **9. 검증** `test/monitoring-overlay.test.ts`, `test/observability-views.test.ts`, `test/plan-activity-view.test.ts`, `test/project-workbench-recording.test.ts`, `test/request-controller.test.ts`, `test/request-runtime.test.ts`, `test/request-test-workspace.test.ts`, `test/v4-progress-visibility.test.ts`, `test/workbench-public-views.test.ts`, `test/workbench-telemetry.test.ts`, `test/workbench-transcript-views.test.ts`, `test/workbench-views.fixtures.ts`, `test/workbench-views.test.ts`, `test/workbench-work-step-views.test.ts`, `test/www-plan-view.test.ts`, `test/www-telemetry-duration.test.ts`, `test/www-ui.test.ts`

문단 후보:
- adapters/inbound/tui/features/monitoring/view/www-monitor-view.ts:82 runInspector DDDDDDDDBBGDBDBGDBDBBBR
- adapters/inbound/tui/features/monitoring/view/www-monitor-view.ts:147 reportRows DGDDDBDDDDDBBBR
- adapters/inbound/tui/features/monitoring/view/www-monitor-view.ts:279 waterfall DDGDDDDDDDBBDBBDBDBBR
- adapters/inbound/tui/features/monitoring/view/www-monitor-view.ts:379 layerSection GDDDBBBBDBR
- adapters/inbound/tui/features/monitoring/view/workbench-monitor-view.ts:62 project BGBBDBR

## plan

- **0. 연결** `adapters/inbound/tui/features/plan/registration/plan.feature.ts`, `adapters/inbound/tui/features/plan/registration/plan.units.ts`
- **1. 정의** `core/domain/execution/output-language.ts`, `core/domain/execution/request-runtime.ts`
- **2. 흐름** `core/application/orchestration/workbench-feature-reads.ts`
- **3. 경계** 미발견
- **4. 입력·조작** 미발견
- **5. 외부 효과** 미발견
- **6. 해석** 미발견
- **7. 표현** `adapters/inbound/tui/features/plan/view/www-plan-view.ts`, `adapters/inbound/tui/foundation/components/status-card.ts`, `adapters/inbound/tui/foundation/theme/www-theme.ts`
- **8. 조립** `adapters/inbound/tui/shell/www-surface.ts`
- **9. 검증** `test/plan-activity-view.test.ts`, `test/v4-progress-visibility.test.ts`, `test/www-plan-view.test.ts`, `test/www-ui.test.ts`

문단 후보:
- adapters/inbound/tui/features/plan/view/www-plan-view.ts:33 render DDDBDR
- adapters/inbound/tui/features/plan/view/www-plan-view.ts:79 progressRows DDDDBDBDBBR

## repository

- **0. 연결** `adapters/inbound/tui/features/repository/registration/repository.feature.ts`, `adapters/inbound/tui/features/repository/registration/repository.units.ts`
- **1. 정의** `core/domain/development/repository.ts`
- **2. 흐름** 미발견
- **3. 경계** `core/ports/integration/repository-insights-port.ts`
- **4. 입력·조작** 미발견
- **5. 외부 효과** `adapters/outbound/git/repository-insights.ts`
- **6. 해석** 미발견
- **7. 표현** `adapters/inbound/tui/features/repository/view/repository-overlays.ts`, `adapters/inbound/tui/foundation/theme/theme.ts`
- **8. 조립** 미발견
- **9. 검증** `test/repository-overlays.test.ts`

## session

- **0. 연결** `adapters/inbound/tui/features/session/registration/session.feature.ts`, `adapters/inbound/tui/features/session/registration/session.units.ts`
- **1. 정의** `core/domain/execution/native-session.ts`, `core/domain/observability/observability-dashboard.ts`
- **2. 흐름** 미발견
- **3. 경계** 미발견
- **4. 입력·조작** 미발견
- **5. 외부 효과** 미발견
- **6. 해석** `adapters/inbound/tui/features/session/view-model/dashboard-session-window.ts`
- **7. 표현** `adapters/inbound/tui/features/session/view/native-thread-picker.ts`, `adapters/inbound/tui/features/session/view/observability-dashboard-view.ts`, `adapters/inbound/tui/features/session/view/www-history-view.ts`, `adapters/inbound/tui/foundation/theme/theme.ts`, `adapters/inbound/tui/foundation/theme/www-theme.ts`
- **8. 조립** `adapters/inbound/tui/shell/workbench-shell.ts`
- **9. 검증** `test/dashboard-pre-user-test.test.ts`, `test/native-thread-picker.test.ts`, `test/observability-views.test.ts`, `test/www-ui.test.ts`

## stats

- **0. 연결** `adapters/inbound/tui/features/stats/registration/stats.feature.ts`, `adapters/inbound/tui/features/stats/registration/stats.units.ts`
- **1. 정의** `core/domain/observability/observability-dashboard.ts`, `core/domain/observability/session-stats.ts`
- **2. 흐름** 미발견
- **3. 경계** 미발견
- **4. 입력·조작** 미발견
- **5. 외부 효과** 미발견
- **6. 해석** 미발견
- **7. 표현** `adapters/inbound/tui/features/stats/view/session-stats-view.ts`, `adapters/inbound/tui/features/stats/view/www-stats-view.ts`, `adapters/inbound/tui/foundation/labels.ts`, `adapters/inbound/tui/foundation/theme/theme.ts`, `adapters/inbound/tui/foundation/theme/www-theme.ts`
- **8. 조립** `adapters/inbound/tui/shell/workbench-shell.ts`
- **9. 검증** `test/session-stats-view.test.ts`, `test/www-ui.test.ts`

## test

- **0. 연결** `adapters/inbound/tui/features/test/registration/test.feature.ts`, `adapters/inbound/tui/features/test/registration/test.units.ts`
- **1. 정의** `core/domain/execution/output-language.ts`, `core/domain/observability/request-test-workspace.ts`, `core/domain/work/workbench.ts`
- **2. 흐름** 미발견
- **3. 경계** 미발견
- **4. 입력·조작** 미발견
- **5. 외부 효과** 미발견
- **6. 해석** 미발견
- **7. 표현** `adapters/inbound/tui/features/test/view/www-test-view.ts`, `adapters/inbound/tui/foundation/theme/www-theme.ts`
- **8. 조립** `adapters/inbound/tui/shell/workbench-shell.ts`
- **9. 검증** `test/project-workbench-recording.test.ts`, `test/request-test-workspace.test.ts`

절 순서 후보:
- adapters/inbound/tui/features/test/view/www-test-view.ts:29 공개 선언이 내부 처리(13줄) 뒤에 있음
- adapters/inbound/tui/features/test/view/www-test-view.ts:33 공개 선언이 내부 처리(13줄) 뒤에 있음
- adapters/inbound/tui/features/test/view/www-test-view.ts:52 공개 선언이 내부 처리(13줄) 뒤에 있음

## tnote

- **0. 연결** `adapters/inbound/tui/features/tnote/registration/tnote.feature.ts`, `adapters/inbound/tui/features/tnote/registration/tnote.units.ts`
- **1. 정의** `core/domain/execution/workbench-config.ts`, `core/domain/work/workbench.ts`
- **2. 흐름** `core/application/orchestration/workbench-feature-reads.ts`, `core/application/work/t-note-service.ts`
- **3. 경계** 미발견
- **4. 입력·조작** `adapters/inbound/tui/features/tnote/controller/tnote-browser-controller.ts`
- **5. 외부 효과** 미발견
- **6. 해석** `adapters/inbound/tui/features/tnote/view-model/operation-report-view-model.ts`, `adapters/inbound/tui/features/tnote/view-model/tnote-browser-view-model.ts`
- **7. 표현** `adapters/inbound/tui/features/tnote/view/operation-report-view.ts`, `adapters/inbound/tui/features/tnote/view/t-notes-source-view.ts`, `adapters/inbound/tui/features/tnote/view/tnote-browser-view.ts`, `adapters/inbound/tui/foundation/theme/theme.ts`
- **8. 조립** `adapters/inbound/tui/shell/workbench-overlay-controller.ts`
- **9. 검증** `test/operation-report-view.test.ts`, `test/tnote-read-flow.test.ts`, `test/workbench-public-views.test.ts`, `test/workbench-transcript-views.test.ts`, `test/workbench-views.fixtures.ts`, `test/workbench-views.test.ts`, `test/workbench-work-step-views.test.ts`

문단 후보:
- adapters/inbound/tui/features/tnote/view/operation-report-view.ts:64 (anonymous) BBDB
- adapters/inbound/tui/features/tnote/view/operation-report-view.ts:85 diffRows DDBDDDDBBDDDDR
- adapters/inbound/tui/features/tnote/controller/tnote-browser-controller.ts:35 render BDBBR

## trace

- **0. 연결** `adapters/inbound/tui/features/trace/registration/trace.feature.ts`, `adapters/inbound/tui/features/trace/registration/trace.units.ts`
- **1. 정의** `core/domain/execution/project-activity.ts`, `core/domain/work/index.ts`, `core/domain/work/workflow-projection.ts`
- **2. 흐름** `core/application/orchestration/workbench-feature-reads.ts`
- **3. 경계** 미발견
- **4. 입력·조작** 미발견
- **5. 외부 효과** 미발견
- **6. 해석** 미발견
- **7. 표현** `adapters/inbound/tui/features/trace/view/workbench-tracer-view.ts`, `adapters/inbound/tui/foundation/theme/theme.ts`
- **8. 조립** `adapters/inbound/tui/shell/workbench-shell.ts`
- **9. 검증** `test/workbench-public-views.test.ts`, `test/workbench-tracer-view.test.ts`, `test/workbench-transcript-views.test.ts`, `test/workbench-views.fixtures.ts`, `test/workbench-views.test.ts`, `test/workbench-work-step-views.test.ts`

## usage

- **0. 연결** `adapters/inbound/tui/features/usage/registration/usage.feature.ts`, `adapters/inbound/tui/features/usage/registration/usage.units.ts`
- **1. 정의** `core/domain/work/workbench.ts`
- **2. 흐름** 미발견
- **3. 경계** `core/ports/observability/usage-monitor-port.ts`
- **4. 입력·조작** 미발견
- **5. 외부 효과** `adapters/outbound/execution/codex-app-server.ts`, `adapters/outbound/observability/usage-service.ts`
- **6. 해석** `adapters/inbound/tui/features/usage/view-model/usage-value.ts`, `adapters/inbound/tui/features/usage/view-model/workbench-hud-system.ts`
- **7. 표현** `adapters/inbound/tui/features/usage/view/usage-strip-view.ts`, `adapters/inbound/tui/features/usage/view/workbench-bottom-hud.ts`, `adapters/inbound/tui/features/usage/view/www-usage-catalog.ts`, `adapters/inbound/tui/features/usage/view/www-usage-view.ts`, `adapters/inbound/tui/features/usage/view/www-usage.ts`, `adapters/inbound/tui/foundation/labels.ts`, `adapters/inbound/tui/foundation/layout/www-monitoring-layout.ts`, `adapters/inbound/tui/foundation/theme/theme.ts`, `adapters/inbound/tui/foundation/theme/www-theme.ts`
- **8. 조립** `adapters/inbound/tui/shell/workbench-shell-presentation.ts`, `adapters/inbound/tui/shell/workbench-shell.ts`, `adapters/inbound/tui/shell/www-surface.ts`
- **9. 검증** `test/usage-strip.test.ts`, `test/workbench-bottom-hud.test.ts`, `test/workbench-hud-system.test.ts`, `test/www-provider-logos.test.ts`, `test/www-provider-meter-fidelity.test.ts`, `test/www-shell.test.ts`, `test/www-ui.test.ts`, `test/www-usage-dashboard.test.ts`, `test/www-usage-fidelity.test.ts`, `test/www-usage-view.test.ts`

## workflow

- **0. 연결** `adapters/inbound/tui/features/workflow/registration/workflow.feature.ts`, `adapters/inbound/tui/features/workflow/registration/workflow.units.ts`
- **1. 정의** `core/domain/execution/request-runtime.ts`, `core/domain/work/index.ts`, `core/domain/work/workbench.ts`
- **2. 흐름** 미발견
- **3. 경계** 미발견
- **4. 입력·조작** 미발견
- **5. 외부 효과** 미발견
- **6. 해석** 미발견
- **7. 표현** `adapters/inbound/tui/features/workflow/view/www-workflow-catalog.ts`, `adapters/inbound/tui/features/workflow/view/www-workflow-view.ts`, `adapters/inbound/tui/foundation/layout/www-monitoring-layout.ts`, `adapters/inbound/tui/foundation/theme/www-theme.ts`
- **8. 조립** `adapters/inbound/tui/shell/www-surface.ts`
- **9. 검증** `test/www-ui.test.ts`, `test/www-workflow-fidelity.test.ts`

문단 후보:
- adapters/inbound/tui/features/workflow/view/www-workflow-view.ts:157 compactWorkflowRows GDDDDDDDBDR
- adapters/inbound/tui/features/workflow/view/www-workflow-view.ts:183 agentDetails DDDBBDBR

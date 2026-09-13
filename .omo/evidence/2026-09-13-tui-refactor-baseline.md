# TUI 리팩터링 계약 테스트 기준선

- 캡처 시점: 2026-09-13 (Asia/Seoul)
- 저장소: `99_www`
- 브랜치: `astra/terminal-ui`
- 범위: 테스트 저작 시작 전 작업트리의 파일 단위 상태. 비밀 가능성이 있는 파일 내용과 diff 본문은 기록하지 않았다.

## Git status

```text
## astra/terminal-ui
 M .www/evidence/2026-09-10-linear-now-next/update-0.0.17.json
 M .www/workbench.yaml
 M CONTEXT.md
 M package.json
 M src/adapters/inbound/tui/commands/slash-commands.ts
 M src/adapters/inbound/tui/dashboard/dashboard-layout.ts
 M src/adapters/inbound/tui/dashboard/legacy-dashboard-views.ts
 M src/adapters/inbound/tui/dashboard/runtime-monitor-view.ts
 M src/adapters/inbound/tui/overlays/approval-overlay.ts
 M src/adapters/inbound/tui/overlays/auth-overlay.ts
 M src/adapters/inbound/tui/overlays/model-picker-overlay.ts
 M src/adapters/inbound/tui/overlays/native-thread-picker.ts
 M src/adapters/inbound/tui/shell/theme.ts
 M src/adapters/inbound/tui/shell/workbench-shell.ts
 M src/adapters/outbound/authentication/gemini-cli-auth.ts
 M src/adapters/outbound/authentication/model-router.ts
 M src/adapters/outbound/execution/codex-app-server.ts
 M src/adapters/outbound/execution/pi-harness.ts
 M src/adapters/outbound/workspace/project-workbench-session.ts
 M src/adapters/outbound/workspace/workbench-config.ts
 M src/app.ts
 M src/cli.ts
 M src/core/application/orchestration/project-workbench.ts
 M src/core/application/work/todo-ledger.ts
 M src/core/domain/execution/model-settings.ts
 M src/core/domain/execution/workbench-config.ts
 M src/core/domain/observability/runtime-monitor.ts
 M src/core/domain/work/todos.ts
 M src/core/domain/work/workbench.ts
 M src/core/ports/execution/executor-port.ts
 M test/cli.test.ts
 M test/codex-app-server.test.ts
 M test/native-plan-wiring.test.ts
 M test/pi-harness.test.ts
 M test/project-workbench-session.test.ts
 M test/project-workbench.test.ts
 M test/slash-commands.test.ts
 M test/workbench-shell-policy.test.ts
 M test/workbench-views.test.ts
?? .codex/
?? .omo/evidence/2026-09-12-native-plan-wiring.md
?? .omo/evidence/2026-09-13-runtime-code-architecture-audit.md
?? .www/evidence/2026-09-10-linear-now-next/t-note-range-diagnosis.md
?? .www/evidence/2026-09-12-request-runtime/
?? docs/ASTRA_EXECUTION_CONSOLE.md
?? docs/REQUEST_RUNTIME.md
?? docs/REQUEST_RUNTIME_STRICT.md
?? scripts/runtime-tool-canary.ts
?? scripts/runtime-workbench-canary.ts
?? scripts/work-recording-hook.ts
?? src/adapters/inbound/tui/chat/astra-execution.ts
?? src/adapters/inbound/tui/dashboard/astra-details.ts
?? src/adapters/inbound/tui/dashboard/astra-test-view.ts
?? src/adapters/inbound/tui/dashboard/astra-usage.ts
?? src/adapters/inbound/tui/dashboard/request-runtime-view.ts
?? src/adapters/inbound/tui/shell/astra-surface.ts
?? src/adapters/inbound/tui/shell/astra-theme.ts
?? src/adapters/outbound/development/github-artifact-publication.ts
?? src/adapters/outbound/development/linear-artifact-publication.ts
?? src/adapters/outbound/development/obsidian-artifact-publication.ts
?? src/adapters/outbound/persistence/request-projection-store.ts
?? src/adapters/outbound/workspace/pinned-file-capabilities.ts
?? src/adapters/outbound/workspace/request-capability-config.ts
?? src/core/application/orchestration/artifact-publication-capability.ts
?? src/core/application/orchestration/request-controller.ts
?? src/core/application/orchestration/request-protocol.ts
?? src/core/application/orchestration/request-runtime-mode.ts
?? src/core/domain/development/work-recording-gate.ts
?? src/core/domain/execution/request-runtime.ts
?? src/core/domain/observability/request-test-workspace.ts
?? src/core/domain/work/request-projections.ts
?? src/core/ports/execution/artifact-publication-port.ts
?? src/core/ports/execution/request-action-port.ts
?? src/core/ports/execution/request-projection-port.ts
?? src/core/ports/execution/runtime-tool-port.ts
?? src/core/runtime/request-runtime.ts
?? test/artifact-publication-capability.test.ts
?? test/astra-model.test.ts
?? test/astra-shell.test.ts
?? test/astra-ui.test.ts
?? test/fixtures/astra-snapshot.ts
?? test/native-model-catalog.test.ts
?? test/request-capability-config.test.ts
?? test/request-controller.test.ts
?? test/request-runtime-mode.test.ts
?? test/request-runtime.test.ts
?? test/request-test-workspace.test.ts
?? test/work-recording-hook.test.ts
```

## 추적된 diff 통계

`git diff --numstat` 기준 총 39개 파일, 1,275줄 추가, 298줄 삭제다. 파일별 값은 아래와 같다.

```text
7 7 .www/evidence/2026-09-10-linear-now-next/update-0.0.17.json
2 2 .www/workbench.yaml
25 1 CONTEXT.md
2 1 package.json
29 10 src/adapters/inbound/tui/commands/slash-commands.ts
1 1 src/adapters/inbound/tui/dashboard/dashboard-layout.ts
2 0 src/adapters/inbound/tui/dashboard/legacy-dashboard-views.ts
4 0 src/adapters/inbound/tui/dashboard/runtime-monitor-view.ts
23 16 src/adapters/inbound/tui/overlays/approval-overlay.ts
26 23 src/adapters/inbound/tui/overlays/auth-overlay.ts
89 32 src/adapters/inbound/tui/overlays/model-picker-overlay.ts
8 5 src/adapters/inbound/tui/overlays/native-thread-picker.ts
1 0 src/adapters/inbound/tui/shell/theme.ts
266 56 src/adapters/inbound/tui/shell/workbench-shell.ts
1 1 src/adapters/outbound/authentication/gemini-cli-auth.ts
2 0 src/adapters/outbound/authentication/model-router.ts
80 3 src/adapters/outbound/execution/codex-app-server.ts
2 1 src/adapters/outbound/execution/pi-harness.ts
31 3 src/adapters/outbound/workspace/project-workbench-session.ts
5 3 src/adapters/outbound/workspace/workbench-config.ts
9 4 src/app.ts
41 4 src/cli.ts
222 26 src/core/application/orchestration/project-workbench.ts
8 0 src/core/application/work/todo-ledger.ts
38 3 src/core/domain/execution/model-settings.ts
7 3 src/core/domain/execution/workbench-config.ts
4 1 src/core/domain/observability/runtime-monitor.ts
8 2 src/core/domain/work/todos.ts
5 0 src/core/domain/work/workbench.ts
5 0 src/core/ports/execution/executor-port.ts
10 1 test/cli.test.ts
23 1 test/codex-app-server.test.ts
39 31 test/native-plan-wiring.test.ts
10 0 test/pi-harness.test.ts
37 4 test/project-workbench-session.test.ts
183 44 test/project-workbench.test.ts
7 4 test/slash-commands.test.ts
10 3 test/workbench-shell-policy.test.ts
3 2 test/workbench-views.test.ts
```

## Untracked manifest

```text
.codex/hooks.json
.omo/evidence/2026-09-12-native-plan-wiring.md
.omo/evidence/2026-09-13-runtime-code-architecture-audit.md
.www/evidence/2026-09-10-linear-now-next/t-note-range-diagnosis.md
.www/evidence/2026-09-12-request-runtime/linear-issue-candidate.json
.www/evidence/2026-09-12-request-runtime/live-file-receipts.json
docs/ASTRA_EXECUTION_CONSOLE.md
docs/REQUEST_RUNTIME.md
docs/REQUEST_RUNTIME_STRICT.md
scripts/runtime-tool-canary.ts
scripts/runtime-workbench-canary.ts
scripts/work-recording-hook.ts
src/adapters/inbound/tui/chat/astra-execution.ts
src/adapters/inbound/tui/dashboard/astra-details.ts
src/adapters/inbound/tui/dashboard/astra-test-view.ts
src/adapters/inbound/tui/dashboard/astra-usage.ts
src/adapters/inbound/tui/dashboard/request-runtime-view.ts
src/adapters/inbound/tui/shell/astra-surface.ts
src/adapters/inbound/tui/shell/astra-theme.ts
src/adapters/outbound/development/github-artifact-publication.ts
src/adapters/outbound/development/linear-artifact-publication.ts
src/adapters/outbound/development/obsidian-artifact-publication.ts
src/adapters/outbound/persistence/request-projection-store.ts
src/adapters/outbound/workspace/pinned-file-capabilities.ts
src/adapters/outbound/workspace/request-capability-config.ts
src/core/application/orchestration/artifact-publication-capability.ts
src/core/application/orchestration/request-controller.ts
src/core/application/orchestration/request-protocol.ts
src/core/application/orchestration/request-runtime-mode.ts
src/core/domain/development/work-recording-gate.ts
src/core/domain/execution/request-runtime.ts
src/core/domain/observability/request-test-workspace.ts
src/core/domain/work/request-projections.ts
src/core/ports/execution/artifact-publication-port.ts
src/core/ports/execution/request-action-port.ts
src/core/ports/execution/request-projection-port.ts
src/core/ports/execution/runtime-tool-port.ts
src/core/runtime/request-runtime.ts
test/artifact-publication-capability.test.ts
test/astra-model.test.ts
test/astra-shell.test.ts
test/astra-ui.test.ts
test/fixtures/astra-snapshot.ts
test/native-model-catalog.test.ts
test/request-capability-config.test.ts
test/request-controller.test.ts
test/request-runtime-mode.test.ts
test/request-runtime.test.ts
test/request-test-workspace.test.ts
test/work-recording-hook.test.ts
```

# v0.1.0 Capability Architecture 이관 계획

- 기준 revision: `f963a587d8a48ca7f14328be001533b8eb984458` (`HEAD = origin/dev`)
- 작업 브랜치: `refactor/v010-capability-architecture`
- release 범위: `v0.1.0 — First Public Release`
- 목표: 현재 `domain/application/infrastructure/presentation` 탐색 구조를 실제 책임과 import graph에 따라 `tui/system/workflows`로 이관한다.
- 비목표: 범용 Workflow Engine, Runtime/Feature Registry, 기능 삭제, `main` 변경, commit/push/PR/merge.

## 조사 기준선

- 설치된 lockfile 의존성으로 `bun run check`와 전체 `bun test` 777건이 통과한다.
- 기존 source graph는 124개 파일이며 edge는 domain 내부 34, application→domain 47, infrastructure→application/domain 86, presentation→application/domain 68이다. 상대 import cycle은 없다.
- 이름만 `workflow`인 `domain/work/workflow-projection.ts`는 Native Plan 관측·reconciliation 계약이므로 범용 또는 Specialized Workflow로 분류하지 않고 System의 순수 projection으로 유지한다.
- 실제 TUI 개발 업무의 선택·기록 흐름은 `DevelopmentService`와 `development-*` adapter 묶음에 있다. 이 묶음만 `workflows/tui-development`로 이관한다.
- `traceability-v2.json`에는 active Unit 13개가 있고 `Code-001`~`Code-013`의 UUID·symbol은 유효하다. 이번 작업은 같은 책임의 경로 이동이므로 key/UUID를 유지하고 새 Unit을 발급하지 않는다.
- SQLite rebuild와 Development Map current 검사는 기준선에서 통과한다. 기존 `traceability:check`는 저장소에 없는 외부 Linear/Vault receipt 세 파일을 참조해 기준선부터 실패한다.
- Codex Linear connector는 `MINI_APP_PROJECT` workspace에 연결되어 `World Wide Woo`를 조회하지 못한다. Obsidian connector는 로컬 REST endpoint `127.0.0.1:27124`가 닫혀 있고, 현 머신 Obsidian registry의 vault UUID도 원장 UUID와 다르다. 원격 생성과 실제 Vault 쓰기는 실행하지 않고, 필수 UUID/parent/milestone을 명시한 draft와 미실행 receipt를 저장한다.

## 계획 모순 감사 결과

- 세 최상위 축을 채택하면서 System 내부 contract/service/adapter seam을 유지하므로 “평탄화 금지”와 충돌하지 않는다.
- Native Plan projection은 이름이 아니라 책임으로 분류해 System에 남기므로 범용 Workflow Engine 비목표와 충돌하지 않는다.
- 개발 기록 Workflow의 service/public entry는 System 공개 계약만 사용하고, scanner·Vault·SQLite·Map IO는 Workflow 내부 adapter에 격리한다.
- Workbench session과 legacy Router 모두 concrete 조립을 `app.ts`로 올리므로 TUI가 adapter를 선택하지 않는다.
- 경로 이동은 기존 Unit의 지속 책임을 바꾸지 않으므로 새 Code-ID를 만들지 않고 UUID·symbol을 유지한다.
- Linear/Vault를 검증하지 못한 상태에서 draft ID를 원장에 넣지 않는 것이 “원장 정합”과 “실제 원본 우선”을 동시에 만족한다. 외부 write 완료는 별도 blocker로 남는다.

## 목표 경계

```text
src/
├── tui/                         # 표시·입력·focus·탐색
│   ├── auth/ chat/ layout/ observability/ overlays/ shell/ theme/ work/ workbench/
│   └── legacy/                  # 기능 보존용 격리 경계
├── system/
│   ├── contracts/               # Node/TUI/adapter 비의존 순수 계약·projection·port
│   ├── services/                # 계약만 소비하는 공통 use case
│   ├── adapters/                # executor·filesystem·network·SQLite 구현
│   └── public.ts                # TUI/Workflow가 읽는 유일한 System 공개 entry
├── workflows/
│   └── tui-development/
│       ├── contracts/
│       ├── adapters/
│       ├── service.ts
│       └── index.ts             # TUI가 읽는 유일한 Workflow 공개 entry
├── app.ts                       # concrete 구현 선택·최종 조립
├── cli.ts
└── product-version.ts
```

`system/contracts/work/workflow-projection.ts`의 workflow는 Native Plan projection이라는 기존 용어다. `workflows/tui-development`의 Specialized Workflow와 동일한 엔진/수명 주체로 승격하지 않는다.

## 공개 Interface와 의존 규칙

- `system/public.ts`는 immutable snapshot/projection, command, port, 설정/관측 타입만 공개한다. executor/store class는 공개하지 않는다.
- TUI의 modern 경로는 System 내부 파일이 아니라 `system/public.ts`만 import한다. `ProjectWorkbench` concrete class 대신 `ProjectWorkbenchController`의 `snapshot/subscribe/dispatch/close` 계약을 받는다.
- `workflows/tui-development/index.ts`는 `DevelopmentService`, 명령 해석, 업무 contract만 공개한다. adapter/store/SQLite/Vault 구현을 export하지 않는다.
- `system/contracts/**`는 같은 contracts만 import하고 Node/Bun/TUI package를 import하지 않는다.
- `system/services/**`는 contracts/services만 import하며 adapters·TUI·Workflow를 import하지 않는다.
- `system/**`는 `workflows/**`와 `tui/**`를 import하지 않는다.
- `workflows/**`가 System을 사용할 때는 `system/public.ts`만 사용하며 `system/adapters`, concrete executor/store를 import하지 않는다.
- `tui/**`가 Workflow를 사용할 때는 `workflows/tui-development/index.ts`만 사용한다. Legacy는 `tui/legacy` 안에 격리하고 modern source가 legacy를 import하지 못하게 한다.
- concrete implementation 선택과 Workbench session factory 조립은 `app.ts`가 소유한다. `cli.ts`는 app entry와 TUI picker만 호출한다.

## 현재 → 목표 전수 매핑

아래 표는 기존 네 최상위 디렉터리의 124개 파일 전체를 빠짐없이 1:1로 매핑한다. 이동 중 내용 변경은 공개 seam과 import 갱신에 한정한다.

| 현재 | 목표 |
| --- | --- |
| `src/domain/canonical-document.ts` | `src/system/contracts/canonical-document.ts` |
| `src/domain/development-map.ts` | `src/system/contracts/development-map.ts` |
| `src/domain/development-records.ts` | `src/workflows/tui-development/contracts/development-records.ts` |
| `src/domain/development-traceability.ts` | `src/system/contracts/development-traceability.ts` |
| `src/domain/model-settings.ts` | `src/system/contracts/model-settings.ts` |
| `src/domain/monitoring.ts` | `src/system/contracts/monitoring.ts` |
| `src/domain/narration.ts` | `src/system/contracts/narration.ts` |
| `src/domain/native-session.ts` | `src/system/contracts/native-session.ts` |
| `src/domain/observability-dashboard.ts` | `src/system/contracts/observability-dashboard.ts` |
| `src/domain/observability-metrics.ts` | `src/system/contracts/observability-metrics.ts` |
| `src/domain/output.ts` | `src/system/contracts/output.ts` |
| `src/domain/planning.ts` | `src/system/contracts/planning.ts` |
| `src/domain/project-activity.ts` | `src/system/contracts/project-activity.ts` |
| `src/domain/redaction.ts` | `src/system/contracts/redaction.ts` |
| `src/domain/repository.ts` | `src/system/contracts/repository.ts` |
| `src/domain/review.ts` | `src/system/contracts/review.ts` |
| `src/domain/runtime-monitor.ts` | `src/system/contracts/runtime-monitor.ts` |
| `src/domain/session-events.ts` | `src/system/contracts/session-events.ts` |
| `src/domain/session-stats.ts` | `src/system/contracts/session-stats.ts` |
| `src/domain/t-notes.ts` | `src/system/contracts/t-notes.ts` |
| `src/domain/terminal.ts` | `src/system/contracts/terminal.ts` |
| `src/domain/todos.ts` | `src/system/contracts/todos.ts` |
| `src/domain/trace-selection.ts` | `src/system/contracts/trace-selection.ts` |
| `src/domain/work/activity-classification.ts` | `src/system/contracts/work/activity-classification.ts` |
| `src/domain/work/delegation.ts` | `src/system/contracts/work/delegation.ts` |
| `src/domain/work/index.ts` | `src/system/contracts/work/index.ts` |
| `src/domain/work/traceability-validator.ts` | `src/system/contracts/work/traceability-validator.ts` |
| `src/domain/work/traceability.ts` | `src/system/contracts/work/traceability.ts` |
| `src/domain/work/workflow-projection.ts` | `src/system/contracts/work/workflow-projection.ts` |
| `src/domain/workbench.ts` | `src/system/contracts/workbench.ts` |
| `src/application/activity-narrator.ts` | `src/system/services/activity-narrator.ts` |
| `src/application/canonical-promotion.ts` | `src/system/services/canonical-promotion.ts` |
| `src/application/context-composer.ts` | `src/system/services/context-composer.ts` |
| `src/application/detached-text-generator.ts` | `src/system/services/detached-text-generator.ts` |
| `src/application/development-service.ts` | `src/workflows/tui-development/service.ts` |
| `src/application/planning-service.ts` | `src/system/services/planning-service.ts` |
| `src/application/ports/executor-port.ts` | `src/system/contracts/ports/executor-port.ts` |
| `src/application/ports/index.ts` | `src/system/contracts/ports/index.ts` |
| `src/application/project-workbench.ts` | `src/system/services/project-workbench.ts` |
| `src/application/review-service.ts` | `src/system/services/review-service.ts` |
| `src/application/router-service.ts` | `src/system/services/router-service.ts` |
| `src/application/session-model-usage.ts` | `src/system/services/session-model-usage.ts` |
| `src/application/session-monitor.ts` | `src/system/services/session-monitor.ts` |
| `src/application/session-runtime.ts` | `src/system/services/session-runtime.ts` |
| `src/application/session/session-usage-tracker.ts` | `src/system/services/session/session-usage-tracker.ts` |
| `src/application/t-note-service.ts` | `src/system/services/t-note-service.ts` |
| `src/application/todo-ledger.ts` | `src/system/services/todo-ledger.ts` |
| `src/application/woo-entry.ts` | `src/system/services/woo-entry.ts` |
| `src/infrastructure/activity-journal-store.ts` | `src/system/adapters/activity-journal-store.ts` |
| `src/infrastructure/agent-tools.ts` | `src/system/adapters/agent-tools.ts` |
| `src/infrastructure/auth-service.ts` | `src/system/adapters/auth-service.ts` |
| `src/infrastructure/canonical-document-store.ts` | `src/system/adapters/canonical-document-store.ts` |
| `src/infrastructure/composer-draft-store.ts` | `src/system/adapters/composer-draft-store.ts` |
| `src/infrastructure/credential-store.ts` | `src/system/adapters/credential-store.ts` |
| `src/infrastructure/detached-codex-generator.ts` | `src/system/adapters/detached-codex-generator.ts` |
| `src/infrastructure/development-cli.ts` | `src/workflows/tui-development/adapters/development-runtime.ts` |
| `src/infrastructure/development-code-scanner.ts` | `src/workflows/tui-development/adapters/code-scanner.ts` |
| `src/infrastructure/development-map-builder.ts` | `src/workflows/tui-development/adapters/development-map-builder.ts` |
| `src/infrastructure/development-map-source.ts` | `src/workflows/tui-development/adapters/development-map-source.ts` |
| `src/infrastructure/development-snapshot.ts` | `src/workflows/tui-development/adapters/development-snapshot.ts` |
| `src/infrastructure/development-store.ts` | `src/workflows/tui-development/adapters/development-store.ts` |
| `src/infrastructure/development-test-runner.ts` | `src/workflows/tui-development/adapters/development-test-runner.ts` |
| `src/infrastructure/development-traceability-digest.ts` | `src/workflows/tui-development/adapters/traceability-digest.ts` |
| `src/infrastructure/development-vault.ts` | `src/workflows/tui-development/adapters/development-vault.ts` |
| `src/infrastructure/executors/codex-app-server.ts` | `src/system/adapters/executors/codex-app-server.ts` |
| `src/infrastructure/executors/factory.ts` | `src/system/adapters/executors/factory.ts` |
| `src/infrastructure/executors/pi-harness.ts` | `src/system/adapters/executors/pi-harness.ts` |
| `src/infrastructure/git-telemetry-source.ts` | `src/system/adapters/git-telemetry-source.ts` |
| `src/infrastructure/model-router.ts` | `src/system/adapters/model-router.ts` |
| `src/infrastructure/native-thread-discovery.ts` | `src/system/adapters/native-thread-discovery.ts` |
| `src/infrastructure/observability-history-source.ts` | `src/system/adapters/observability-history-source.ts` |
| `src/infrastructure/pi-activity-narrator.ts` | `src/system/adapters/pi-activity-narrator.ts` |
| `src/infrastructure/planning-store.ts` | `src/system/adapters/planning-store.ts` |
| `src/infrastructure/project-auth.ts` | `src/system/adapters/project-auth.ts` |
| `src/infrastructure/project-session.ts` | `src/system/adapters/project-session.ts` |
| `src/infrastructure/project-workbench-session.ts` | `src/system/services/project-workbench-session.ts` |
| `src/infrastructure/project-workspace.ts` | `src/system/adapters/project-workspace.ts` |
| `src/infrastructure/repository-insights.ts` | `src/system/adapters/repository-insights.ts` |
| `src/infrastructure/review-adapters.ts` | `src/system/adapters/review-adapters.ts` |
| `src/infrastructure/review-store.ts` | `src/system/adapters/review-store.ts` |
| `src/infrastructure/session-store.ts` | `src/system/adapters/session-store.ts` |
| `src/infrastructure/settings-store.ts` | `src/system/adapters/settings-store.ts` |
| `src/infrastructure/t-note-store.ts` | `src/system/adapters/t-note-store.ts` |
| `src/infrastructure/terminal-command-executor.ts` | `src/system/adapters/terminal-command-executor.ts` |
| `src/infrastructure/todo-store.ts` | `src/system/adapters/todo-store.ts` |
| `src/infrastructure/traceability-validator.ts` | `src/workflows/tui-development/adapters/traceability-validator.ts` |
| `src/infrastructure/usage-service.ts` | `src/system/adapters/usage-service.ts` |
| `src/infrastructure/wes-entry-collector.ts` | `src/system/adapters/wes-entry-collector.ts` |
| `src/infrastructure/work-reference-validator.ts` | `src/system/adapters/work-reference-validator.ts` |
| `src/presentation/cli/auth-command.ts` | `src/tui/auth/auth-command.ts` |
| `src/presentation/tui/approval-overlay.ts` | `src/tui/overlays/approval-overlay.ts` |
| `src/presentation/tui/auth-overlay.ts` | `src/tui/overlays/auth-overlay.ts` |
| `src/presentation/tui/bounded-public-projection.ts` | `src/tui/chat/bounded-public-projection.ts` |
| `src/presentation/tui/dashboard-layout.ts` | `src/tui/layout/dashboard-layout.ts` |
| `src/presentation/tui/dashboard-session-window.ts` | `src/tui/layout/dashboard-session-window.ts` |
| `src/presentation/tui/delegation-tree-view.ts` | `src/tui/work/delegation-tree-view.ts` |
| `src/presentation/tui/development-map-view.ts` | `src/tui/observability/development-map-view.ts` |
| `src/presentation/tui/exit-key-policy.ts` | `src/tui/shell/exit-key-policy.ts` |
| `src/presentation/tui/legacy-dashboard-views.ts` | `src/tui/legacy/legacy-dashboard-views.ts` |
| `src/presentation/tui/legacy-session-shell.ts` | `src/tui/legacy/legacy-session-shell.ts` |
| `src/presentation/tui/model-picker-overlay.ts` | `src/tui/overlays/model-picker-overlay.ts` |
| `src/presentation/tui/monitoring-overlay.ts` | `src/tui/overlays/monitoring-overlay.ts` |
| `src/presentation/tui/native-thread-picker.ts` | `src/tui/shell/native-thread-picker.ts` |
| `src/presentation/tui/observability-dashboard-view.ts` | `src/tui/observability/observability-dashboard-view.ts` |
| `src/presentation/tui/overlay-sheet.ts` | `src/tui/layout/overlay-sheet.ts` |
| `src/presentation/tui/render-scheduler.ts` | `src/tui/shell/render-scheduler.ts` |
| `src/presentation/tui/repository-overlays.ts` | `src/tui/overlays/repository-overlays.ts` |
| `src/presentation/tui/result-cards.ts` | `src/tui/chat/result-cards.ts` |
| `src/presentation/tui/router-overlays.ts` | `src/tui/overlays/router-overlays.ts` |
| `src/presentation/tui/runtime-monitor-view.ts` | `src/tui/observability/runtime-monitor-view.ts` |
| `src/presentation/tui/session-stats-view.ts` | `src/tui/observability/session-stats-view.ts` |
| `src/presentation/tui/shared-dashboard-views.ts` | `src/tui/workbench/shared-dashboard-views.ts` |
| `src/presentation/tui/shell-lifecycle.ts` | `src/tui/shell/shell-lifecycle.ts` |
| `src/presentation/tui/slash-commands.ts` | `src/tui/shell/slash-commands.ts` |
| `src/presentation/tui/syntax-highlighter.ts` | `src/tui/theme/syntax-highlighter.ts` |
| `src/presentation/tui/theme.ts` | `src/tui/theme/theme.ts` |
| `src/presentation/tui/usage-strip-view.ts` | `src/tui/workbench/usage-strip-view.ts` |
| `src/presentation/tui/usage-value.ts` | `src/tui/workbench/usage-value.ts` |
| `src/presentation/tui/work-step-card.ts` | `src/tui/work/work-step-card.ts` |
| `src/presentation/tui/workbench-bottom-hud.ts` | `src/tui/shell/workbench-bottom-hud.ts` |
| `src/presentation/tui/workbench-shell.ts` | `src/tui/shell/workbench-shell.ts` |
| `src/presentation/tui/workbench-telemetry.ts` | `src/tui/shell/workbench-telemetry.ts` |
| `src/presentation/tui/workbench-views.ts` | `src/tui/chat/workbench-views.ts` |
| `src/presentation/tui/workbench-welcome.ts` | `src/tui/shell/workbench-welcome.ts` |
| `src/legacy-router-app.ts` | `src/tui/legacy/router-app.ts` |

## 단계와 rollback

1. 공개 seam을 추가하고 architecture test를 새 경계로 RED 상태까지 작성한다. Rollback은 신규 entry/test만 제거한다.
2. 파일을 위 표대로 `git mv`하고 relative import와 테스트 import만 기계적으로 갱신한다. Rollback은 표를 역순 적용하면 되며, 이 단계에서 기능 로직은 바꾸지 않는다.
3. modern TUI를 `system/public.ts`와 Workflow public entry로 수렴시키고 Workbench session의 production factory를 `app.ts`로 올린다. Rollback은 factory 인자를 기존 production default로 되돌린다.
4. legacy Router는 `tui/legacy`에 격리하고 modern source에서 legacy import를 금지한다. 기능 entry는 보존한다.
5. Code-ID 원장 location, 코드/테스트의 `@linear` 참조, 경로 문서를 새 위치로 갱신한다. Unit key/UUID/symbol은 유지한다.
6. Linear/Vault는 draft gate→write→readback→actual Vault byte readback 순서로 반영한다. WOO-842 write 완료값은 별도 readback에 기록하고, canonical `.www/vault` note와 전체 byte manifest를 만든다. Obsidian 링크 후속 patch는 write와 구분해 준비한다.
7. 원장에서 SQLite와 Map을 순서대로 재구축하고 두 번째 build에서 diff가 없는지 검사한다. 실패 시 DB는 삭제 가능한 projection이므로 원장 수정 없이 재구축한다.

## Linear 이슈 배치

구조 이관은 세 축을 함께 바꾸지만 결과의 주책임은 여러 기능이 공유하는 실행·의존 기반이다. Issue intake 계약에 따라 System 부모 `WOO-672` 바로 아래를 우선 위치로 삼고 Workflow `WOO-671`, TUI `WOO-673`은 related 관계로 둔다. live parent/형제/중복 조회 뒤 Project `World Wide Woo`, milestone `v0.1.0 — First Public Release`에서 이 위치를 확정한다.

- 처리: 같은 acceptance의 기존 issue가 있으면 본문 보완, 없으면 새 하위 issue.
- 제목: `코드 탐색 구조를 TUI·System·Workflow 책임으로 이관한다`
- parent: `WOO-672`; display ID를 UUID 자리에 넣지 않고 live snapshot에서 실제 parent UUID와 parent chain을 확인해야 한다.
- 필수 생성 필드: `teamId`, `projectId`, `parentId`, `milestoneId`, `statusId`, label ID, 생성된 issue UUID/identifier/URL.
- 본문은 목적·결과·범위·동작·완료 조건·연결만 둔다. 상세 전수 매핑, 예외, rollback, 테스트 출력은 Obsidian 상세 기록이 소유한다.

## Code-ID·원장·Vault·SQLite·Map

- `Code-001`~`Code-013`의 UUID와 symbol을 유지하고 location path만 이동한다. 구조 이관 자체에 새 지속 기능이 생기지 않으므로 `nextUnitKey`를 호출하지 않는다.
- 실제 발급·확인된 WOO-842 identifier와 UUID만 원장 issue/note/edge에 추가한다. draft identifier나 가짜 UUID는 원장에 넣지 않는다.
- 실제 Vault note는 `.www/vault/01_프로젝트/99_WWW/01_문서/Traceability/WOO-842.md`에 작성하고 전체 37개 note를 byte readback한다.
- `.www/control-ledger/traceability-v2.json`이 관계 정본이다. 공유 SQLite는 `bun run traceability:rebuild`로 재구축하고 logical digest를 원장 digest와 대조한다.
- `.www/Development-Map.md`는 `development-map:build` 뒤 `development-map:check`와 재실행 무diff로 검증한다.

## 검증

- `bun run check`
- `bun test`
- 새 architecture import graph test: 기존 top-level 부재, contracts 순수성, System→Workflow/TUI 금지, Workflow→System public-only, modern TUI→public-only, adapter 독립성, cycle 없음, app composition.
- `bun run traceability:rebuild`
- `bun run development-map:build && bun run development-map:check`
- `bun run traceability:check` 및 외부 receipt가 없을 때의 정확한 실패 기록
- `git diff --check`
- build/check 재실행 전후 `git status --short` 비교
- 변경 파일의 `TODO`, `test.skip`, `test.only`, `<<<<<<<`, `=======`, `>>>>>>>` 검사

## 구현 결과

- 기존 124개 소스 파일과 legacy entry를 전수 매핑대로 이동했고, 이전 네 최상위 디렉터리에는 파일이나 빈 폴더가 남지 않았다.
- `system/public.ts`, `workflows/tui-development/index.ts`, Workbench factory seam, legacy session seam을 추가하고 concrete 조립을 `app.ts`에 수렴시켰다.
- origin/dev에서 export가 유실돼 실행되지 않던 code-map의 query/link/AST comment 기능을 복구했다. AST parser는 `system/adapters/linear-annotation-scanner.ts`에 두어 contract 순수성을 보존했다.
- Code-001~Code-013의 key·UUID·symbol을 유지한 채 location을 새 경로로 갱신했다.
- 전체 결과: `bun run check` PASS, `bun test` 780 PASS/0 FAIL, code-map offline PASS, SQLite rebuild PASS, Development Map build/check 및 재실행 무diff PASS.
- WOO-842 (`30006fd3-0381-4b33-a2aa-edd90b560529`)를 기존 Code-001~013에 연결했고 새 Code ID는 할당하지 않았다. 실제 Vault note와 37개 note byte manifest를 만들고 Development Map을 37개 이슈로 갱신했다.
- SQLite rebuild는 90 entities/218 edges, logical digest `985e7f0f8b62f9c3a478b5a1c0da91780f862fc3309d30083f64b20a1f6665c0`로 통과했다.
- strict `traceability:check`는 완전한 Linear snapshot/acquisition receipt가 없어 FAIL이다. 사용자 제공 WOO-842 완료값을 workspace 전체 receipt로 과장하지 않았다.
- macOS release platform check는 PASS이고 전체 release gate는 저장소에 없는 ST-011-06~13 evidence 때문에 BLOCKED다.

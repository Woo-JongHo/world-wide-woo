# `src/core/**` 축자 인벤토리

- 기준 시각: 2026-09-13 (Asia/Seoul). 현재 체크아웃의 읽은 시점 스냅샷이다.
- 저장소: `/Users/jonghoPro/woo/00_project/99_www`, 브랜치 `astra/terminal-ui`.
- 워킹트리에는 기존 변경이 있다. 요청 대상 중 `project-workbench.ts`, `todo-ledger.ts`, `todos.ts`가 modified였고, 수치는 그 변경을 포함한 현재 파일을 기준으로 했다.
- Code-002는 `.woo/units.yaml:12-16`에서 `src/core/application/orchestration/project-workbench.ts`의 `ProjectWorkbench`를 가리킨다.
- `.www/linear-project.json`의 `linear-woo` 연결을 다시 조회했다. workspace `Woo-World` (`b7b91489-dd9b-4fb7-b958-822d5dc577e0`) 및 project `World Wide Woo` (`5639ee1c-a6cd-44cf-9ed6-82ee9c5fc3db`)와 URL이 일치했다.
- 코드 변경은 하지 않았다. 이 문서는 요청에 지정된 evidence artifact다. 테스트 실행은 하지 않았다.

## 범위와 측정 방식

`src/core` 아래 76개 `.ts/.tsx` 파일을 수집했다. 물리 행수는 마지막 개행 뒤의 빈 가상행을 제외하고 공백/주석 줄을 포함한다. 총 14,571행, 공백이 아닌 행 13,609행이다.

Imports는 정적 import, re-export, 문자열 리터럴 `import()`를 센다. Fan-in은 `src`, `test`, `scripts`, `bin`의 TypeScript/JavaScript 파일에서 상대경로 import를 해석한 직접 importer 파일 수(파일별 중복 제거)다. `.js → .ts` 등 TypeScript의 확장자 치환도 적용했다. 경로 alias나 동적 계산된 import는 포함되지 않는다. Fan-out은 import 대상 고유 파일 수로 분리했다. Export는 top-level export 선언의 이름 항목 수이며 의미적 중복 제거는 하지 않았다.

함수 길이는 TypeScript AST의 function declaration, method, constructor, getter/setter, function expression, arrow function의 시작/끝 행을 포함해 계산했다. 따라서 아래 함수 수에는 중첩 콜백도 포함된다. 클래스 길이는 class declaration/expression 전체 행 범위다. 파일표의 `함수수/최대행수`와 `클래스수/최대행수`는 이 방식으로 산출했다.

## 전체 파일 표

| 파일 | 행 | export 이름 수 | fan-in 전체/core | fan-out core/local/pkg | 함수 수/최대 행 | 클래스 수/최대 행 |
|---|---:|---:|---:|---:|---:|---:|
| src/core/agents/rpa-agent.ts | 44 | 4 | 6/2 | 1/0/0 | 6/11 | 0/— |
| src/core/application/development/development-service.ts | 53 | 3 | 4/0 | 1/0/0 | 7/14 | 1/28 |
| src/core/application/orchestration/activity-narrator.ts | 16 | 3 | 5/1 | 0/0/0 | 0/— | 0/— |
| src/core/application/orchestration/approval-dispatch.ts | 256 | 9 | 2/1 | 2/0/0 | 18/67 | 2/74 |
| src/core/application/orchestration/artifact-publication-capability.ts | 59 | 2 | 2/0 | 3/0/0 | 14/47 | 0/— |
| src/core/application/orchestration/context-composer.ts | 93 | 2 | 2/1 | 3/0/0 | 5/31 | 1/76 |
| src/core/application/orchestration/detached-text-generator.ts | 45 | 4 | 5/1 | 1/0/0 | 1/7 | 0/— |
| src/core/application/orchestration/execution-journal.ts | 62 | 1 | 2/1 | 3/0/0 | 9/38 | 1/53 |
| src/core/application/orchestration/project-workbench.ts | 3171 | 5 | 10/0 | 38/0/1 | 280/146 | 1/2312 |
| src/core/application/orchestration/request-controller.ts | 183 | 3 | 2/1 | 5/0/0 | 41/111 | 1/150 |
| src/core/application/orchestration/request-protocol.ts | 30 | 1 | 1/1 | 2/0/0 | 1/26 | 0/— |
| src/core/application/orchestration/request-runtime-mode.ts | 43 | 3 | 3/1 | 0/0/0 | 5/9 | 1/30 |
| src/core/application/orchestration/woo-entry.ts | 219 | 9 | 7/2 | 1/0/0 | 20/24 | 1/62 |
| src/core/application/review/review-service.ts | 68 | 3 | 6/1 | 1/0/0 | 5/25 | 1/43 |
| src/core/application/routing/router-service.ts | 71 | 2 | 2/0 | 3/0/0 | 7/25 | 1/45 |
| src/core/application/session/session-model-usage.ts | 49 | 3 | 7/2 | 1/0/0 | 6/19 | 1/35 |
| src/core/application/session/session-monitor.ts | 133 | 3 | 5/0 | 5/0/0 | 14/35 | 1/107 |
| src/core/application/session/session-runtime.ts | 1157 | 9 | 10/2 | 8/0/1 | 83/141 | 1/916 |
| src/core/application/session/session-usage-tracker.ts | 100 | 1 | 1/1 | 3/0/0 | 15/28 | 1/84 |
| src/core/application/work/canonical-promotion.ts | 188 | 11 | 5/1 | 2/0/1 | 11/26 | 1/53 |
| src/core/application/work/local-workflow-service.ts | 78 | 4 | 1/0 | 3/0/0 | 8/23 | 1/55 |
| src/core/application/work/planning-service.ts | 37 | 2 | 4/0 | 1/0/0 | 10/5 | 1/29 |
| src/core/application/work/t-note-service.ts | 90 | 5 | 5/1 | 2/0/1 | 7/22 | 1/35 |
| src/core/application/work/todo-ledger.ts | 498 | 4 | 8/1 | 6/0/0 | 81/33 | 4/273 |
| src/core/commit/commit-governance.ts | 131 | 12 | 4/0 | 0/0/1 | 14/35 | 1/61 |
| src/core/domain/development/artifact-control.ts | 173 | 8 | 11/2 | 2/0/2 | 21/84 | 0/— |
| src/core/domain/development/development-map.ts | 51 | 7 | 5/0 | 0/0/0 | 0/— | 0/— |
| src/core/domain/development/development-records.ts | 20 | 9 | 3/0 | 1/0/0 | 0/— | 0/— |
| src/core/domain/development/development-traceability.ts | 79 | 20 | 10/0 | 0/0/0 | 15/12 | 0/— |
| src/core/domain/development/obsidian-contract.ts | 200 | 12 | 7/1 | 0/0/0 | 24/47 | 0/— |
| src/core/domain/development/repository.ts | 40 | 6 | 3/1 | 0/0/0 | 0/— | 0/— |
| src/core/domain/development/rpa-description.ts | 384 | 12 | 4/1 | 0/0/0 | 64/47 | 0/— |
| src/core/domain/development/work-recording-gate.ts | 53 | 5 | 2/0 | 0/0/0 | 6/24 | 0/— |
| src/core/domain/execution/execution-run-contract.ts | 127 | 18 | 6/5 | 1/0/0 | 0/— | 0/— |
| src/core/domain/execution/model-settings.ts | 69 | 15 | 36/7 | 0/0/0 | 9/10 | 0/— |
| src/core/domain/execution/native-session.ts | 260 | 32 | 23/9 | 0/0/0 | 6/33 | 0/— |
| src/core/domain/execution/output.ts | 54 | 7 | 8/4 | 0/0/0 | 0/— | 0/— |
| src/core/domain/execution/project-activity.ts | 88 | 10 | 56/20 | 0/0/0 | 4/31 | 0/— |
| src/core/domain/execution/request-runtime.ts | 143 | 14 | 18/10 | 1/0/0 | 7/28 | 0/— |
| src/core/domain/execution/session-events.ts | 69 | 8 | 6/3 | 0/0/0 | 0/— | 0/— |
| src/core/domain/execution/terminal.ts | 127 | 6 | 22/6 | 0/0/0 | 8/32 | 0/— |
| src/core/domain/execution/workbench-config.ts | 122 | 4 | 6/1 | 2/0/0 | 10/36 | 0/— |
| src/core/domain/observability/monitoring.ts | 42 | 3 | 3/1 | 1/0/0 | 0/— | 0/— |
| src/core/domain/observability/observability-dashboard.ts | 149 | 13 | 11/1 | 3/0/0 | 31/29 | 0/— |
| src/core/domain/observability/observability-metrics.ts | 17 | 3 | 2/2 | 0/0/0 | 5/6 | 0/— |
| src/core/domain/observability/request-test-workspace.ts | 83 | 5 | 2/0 | 2/0/0 | 22/30 | 0/— |
| src/core/domain/observability/runtime-monitor.ts | 158 | 6 | 5/0 | 2/0/0 | 52/43 | 0/— |
| src/core/domain/observability/session-stats.ts | 517 | 14 | 6/0 | 3/0/0 | 81/116 | 0/— |
| src/core/domain/review/redaction.ts | 218 | 7 | 10/4 | 0/0/0 | 9/68 | 0/— |
| src/core/domain/review/review.ts | 165 | 18 | 6/3 | 1/0/0 | 8/18 | 0/— |
| src/core/domain/work/activity-classification.ts | 63 | 2 | 2/2 | 1/0/0 | 5/28 | 0/— |
| src/core/domain/work/canonical-document.ts | 116 | 13 | 3/2 | 0/0/0 | 10/18 | 0/— |
| src/core/domain/work/delegation.ts | 90 | 5 | 4/3 | 1/0/0 | 30/65 | 0/— |
| src/core/domain/work/index.ts | 28 | 20 | 24/4 | 5/0/0 | 0/— | 0/— |
| src/core/domain/work/linear-dashboard.ts | 30 | 6 | 6/2 | 0/0/0 | 0/— | 0/— |
| src/core/domain/work/narration.ts | 84 | 4 | 1/1 | 0/0/0 | 6/28 | 0/— |
| src/core/domain/work/performance.ts | 84 | 3 | 5/2 | 4/0/0 | 15/36 | 0/— |
| src/core/domain/work/planning.ts | 91 | 8 | 6/2 | 0/0/0 | 8/31 | 0/— |
| src/core/domain/work/request-projections.ts | 33 | 2 | 6/2 | 2/0/0 | 22/17 | 0/— |
| src/core/domain/work/t-notes.ts | 442 | 19 | 9/3 | 2/0/0 | 36/36 | 0/— |
| src/core/domain/work/todos.ts | 464 | 21 | 20/7 | 0/0/0 | 52/69 | 0/— |
| src/core/domain/work/trace-selection.ts | 176 | 9 | 3/2 | 2/0/0 | 11/36 | 0/— |
| src/core/domain/work/traceability-validator.ts | 23 | 2 | 2/1 | 1/0/0 | 1/12 | 0/— |
| src/core/domain/work/traceability.ts | 164 | 10 | 8/3 | 0/0/0 | 9/26 | 0/— |
| src/core/domain/work/workbench.ts | 339 | 27 | 37/6 | 12/0/0 | 12/24 | 0/— |
| src/core/domain/work/workflow-projection.ts | 1039 | 24 | 5/3 | 5/0/0 | 72/278 | 1/6 |
| src/core/ports/execution/artifact-publication-port.ts | 13 | 1 | 4/1 | 1/0/0 | 0/— | 0/— |
| src/core/ports/execution/executor-port.ts | 36 | 1 | 10/1 | 3/0/0 | 0/— | 0/— |
| src/core/ports/execution/request-action-port.ts | 51 | 4 | 8/3 | 1/0/0 | 0/— | 0/— |
| src/core/ports/execution/request-projection-port.ts | 6 | 1 | 2/1 | 1/0/0 | 0/— | 0/— |
| src/core/ports/execution/runtime-tool-port.ts | 15 | 4 | 6/3 | 0/0/0 | 0/— | 0/— |
| src/core/ports/index.ts | 166 | 27 | 39/4 | 7/0/1 | 0/— | 0/— |
| src/core/runtime/execution-run.ts | 311 | 30 | 9/2 | 4/0/0 | 51/44 | 0/— |
| src/core/runtime/request-runtime.ts | 258 | 1 | 5/2 | 2/0/0 | 67/133 | 0/— |
| src/core/skills/skill-registry.ts | 35 | 4 | 9/4 | 0/0/0 | 1/15 | 0/— |
| src/core/workflows/skill-run.ts | 132 | 13 | 7/1 | 1/0/1 | 20/25 | 0/— |

총 export 이름 항목은 631, import/re-export/dynamic import 항목은 181개다.

## 요청된 파일의 책임 구간과 길이

아래 책임 구간은 현재 symbol 배치에 근거한 구간명이다. 향후 모듈 경계로 확정한 설계는 아니다. 함수 길이는 양 끝 행을 포함한다.

### `src/core/application/orchestration/project-workbench.ts`

- 파일 3,171행, export 5개, 직접 importer 10개( core 0 ), core fan-out 38개, 41개 import 항목. `ProjectWorkbench` class 244–2555 (2,312행), 나머지는 계약과 module helper다.
- `.woo/units.yaml`의 Code-002는 `ProjectWorkbench`를 Chat 대화 수명의 Code symbol로 연결한다. 즉 이 class는 추적 가능한 기준 symbol이다.
- 설정·생성·이벤트 구독·명령 직렬화·초기화: `ProjectWorkbench.constructor` 364–431 (68), `snapshot` 433–435, `subscribe` 468–472, `dispatch` 474–490, `dispatchSerialized` 531–597 (67), `initialize` 618–740 (123), `refreshLinearDashboard` 742–756.
- Chat/turn 수명: `sendChat` 758–781, `steerChatTurn` 795–842 (48), `startChatTurn` 844–971 (128), `drainChatQueue` 995–1006, `cancelChat` 1008–1087 (80), `clearChatProjection` 1090–1101, `compactThread` 1103–1114. `setGoal`은 783–793.
- 승인·선택·실행 설정·MCP·Woo Entry: `resolveApproval` 1116–1129부터 `currentNativeCollaborationMode` 1318–1341까지. 주요 긴 symbol은 `configureModel` 1221–1246 (26), `refreshWooEntry` 1286–1305 (20), `currentNativeCollaborationMode` 1318–1341 (24).
- T-Note, Todo, 승격 및 Review 동작: `captureNote` 1343–1372 (30), `tnoteRequest` 1398–1423 (26), `completionOrdinal` 1425–1445 (21), `createTNote` 1447–1464, `mutateTodo` 1474–1483, `transitionTodo` 1485–1492, `recordTodoEvidence` 1494–1503, `acceptPromotion` 1512–1527, `confirmPromotion` 1529–1544, `previewReview` 1546–1566 (21), `sendReview` 1568–1582. 이어서 thread source binding과 `runLocalWorkflow` 1584–1627.
- Native event/Activity journal 투영과 terminal reconciliation: `recordNativeEvent` 1641–1786 (146), `projectPublicPlanFallback` 1788–1828 (41), 자동 T-Note 1834–1881, `applyDelta` 1884–1980 (97), `appendActivity` 1982–2026 (45), execution receipt 처리 2029–2056, native state/reference/terminal 추적 2058–2126, `preserveUnfinalizedAssistantResponse` 2129–2164 (36).
- Snapshot과 public projection: `publish` 2177–2183, `makeSnapshot` 2185–2263 (79), `projectDelegation` 2265–2270, `projectDurableActivities` 2272–2286, `projectChat` 2288–2297, `projectDurableNotes` 2299–2311, `currentSessionNotes` 2313–2321, `projectCurrentWorkFlow` 2323–2356 (34), `projectExecutionTodo` 2358–2377 (20), cache invalidation 2379–2387.
- 비동기 동기화·기록: `scheduleNativeTodoSync` 2389–2408 (20), `scheduleRequestProjections` 2417–2443 (27), `scheduleNarratedTodoSync` 2445–2453, `enqueueNativeTodoSync` 2455–2491 (37), `nativeTodoBinding` 2494–2520 (27), `scheduleNarrations` 2522–2554 (33).
- module helper 구간: native observation projection 2557–2696 (`nativeObservation` 2557–2617, `projectJournalNativeValue` 2642–2690); turn/T-Note/goal projection 2698–2854; Activity 분류·plan fallback·Chat projection 2856–3038 (`publicNumberedPlanEntries` 2933–2967, `projectChat` 2976–3013); native identity, freeze/hash, bounded-text 처리 3040–3171.
- 기존 직접 import 테스트: `test/project-workbench.test.ts:11`, `test/astra-model.test.ts:14`, `test/astra-shell.test.ts:4`, `test/native-model-catalog.test.ts:7`, `test/native-plan-wiring.test.ts:2`, `test/project-workbench-session.test.ts:7`, `test/tui-shell-characterization.test.ts:3`.

### `src/core/application/session/session-runtime.ts`

- 파일 1,157행, export 9개, 직접 importer 10개( core 2 ), core fan-out 8개, import 9개. `SessionRuntime` class 242–1157 (916행).
- Prompt/session data helpers: `buildSessionSystemPrompt` 59–105 (47), `runningToolSnapshot` 147–176 (30), `storedNarration` 202–240 (39); 나머지 session message/state helpers는 107–200.
- class 초기화·상태·설정·submit/command entry: constructor 258–277, `snapshot` 295–311, `initialize` 323–351, `updateSettings` 353–374, `submit` 382–403, terminal command dispatch `runTerminalCommand` 405–418.
- Direct terminal 수행 `runDirectTerminalCommand` 420–560 (141); turn 실행 `runTurn` 562–694 (133), Assistant stream `streamAssistant` 696–746 (51), tool 실행 `executeToolCall` 748–841 (94).
- Todo evidence 및 기록: `recordTodoEvidence` 843–859, `recordNarration` 861–891 (31), `appendLearningSummary` 893–924 (32). 취소 처리 `cancelUnexecutedToolCall` 926–967 (42), `discardToolRound` 969–976. restore/lifecycle `restore` 978–1067 (90), `close` 1069–1085, `abort` 1087–1093, 마지막 기록·emit methods 1095–1156.
- 기존 직접 import 테스트: `test/session-runtime.test.ts:10`, `test/session-monitor.test.ts:4`, `test/left-dashboard.test.ts:3`, `test/legacy-shell-characterization.test.ts:3`, `test/transcript-markdown.test.ts:3`.

### `src/core/domain/work/workflow-projection.ts`

- 파일 1,039행, export 24개, 직접 importer 5개( core 3 ), core fan-out 5개, import 5개. class는 `DplanIdentityCollisionError` 168–173 (6행).
- Workflow/plan/reconciliation 계약 타입: 15–173. Identity framing/revision helpers: `frame` 175–189, `decimal` 190–195, `digest` 196–201, `revision` 202–221, `token` 222–227.
- Main projector `projectWorkFlow` 252–529 (278); execution-run wrapper `projectWorkFlowFromExecutionRun` 540–548 (9); journal validation `validateJournal` 550–598 (49); plan/activity `reconcile` 600–765 (166).
- Activity/narration and plan input decoding: `collisionTitles` 766–776부터 `parsePlan` 950–968까지; `rawPlanEntries` 828–893 (66), `nativePlainNumberedPlanBlock` 895–922 (28), `parsePlan` 950–968 (19). Status/edit similarity helpers 969–1039, including `lev` 988–1008 (21).
- 기존 직접 import 테스트: `test/workflow-projection.test.ts:3`.

### `src/core/domain/observability/session-stats.ts`

- 파일 517행, export 14개, 직접 importer 6개( core 0 ), core fan-out 3개, import 3개. class 없음.
- Stats contracts 8–117; 주 projection `projectSessionStats` 120–235 (116); root turn projection `projectRootTurns` 247–273 (27), review lifecycle 275–285; request projection `projectRequests` 287–329 (43), shortlist/request issue helpers 331–356; usage projection `projectUsage` 358–386 (29), coverage/duration pairs 388–427; lifecycle/activity classifiers and terminal states 429–517.
- 기존 직접 import 테스트: `test/session-stats.test.ts:4`, `test/session-stats-view.test.ts:4-5`, `test/astra-ui.test.ts:13`.

### `src/core/application/work/todo-ledger.ts`

- 파일 498행, export 4개, 직접 importer 8개( core 1 ), core fan-out 6개, import 6개. `TodoLedger` class 20–292 (273행); error classes는 `TodoWriteConflictError` 294–303 (10), `TodoIdentityCollisionError` 305–312 (8), `TodoNativeSourceError` 314–321 (8).
- ledger 시작·native/request plan 동기화: constructor 25–30, `initialize` 36–49, `syncRequestRuntime` 56–60, `syncNativePlan` 63–81 (19). CRUD/mutations `create` 83–101, `add` 103–125, `addDetails` 127–159 (33), `start` 161–172, `complete` 174–184, `block` 186–193, `reopen` 195–200, `recordEvidence` 202–222 (21).
- Change/event/commit: `subscribe` 224–227, `transition` 229–248 (20), `commit` 250–271 (22), `document` 273–280, validation and `emit` 282–291.
- Native plan adapter/validation helpers: event and ID helpers 323–344; native item/source mapping `nativeTodoItem` 346–363 (18), `nativeTodoSource` 365–381, binding/apply/plan checks 383–425; native ID/status/evidence/text comparisons 427–498.
- 기존 직접 import 테스트: `test/todo-ledger.test.ts:5`, `test/native-plan-wiring.test.ts:4`, `test/project-workbench-session.test.ts:10`, `test/project-workbench.test.ts:40`, `test/session-runtime.test.ts:13`.

### `src/core/domain/work/todos.ts`

- 파일 464행, export 21개, 직접 importer 20개( core 7 ), core fan-out 0개, import 0개. class 없음.
- Todo contracts/progress structures 3–89; summary progress `todoProgress` 102–104, `todoDetailProgress` 107–109, `progressFor` 111–123.
- Document invariants `validateTodoDocument` 126–194 (69); Markdown codec: `renderTodoMarkdown` 196–205, `parseTodoMarkdown` 207–229 (23), `patchTodoMarkdown` 235–256 (22), line-ending/line parsing helpers 258–279; sanitation and item/header/native source validations 281–464 (`parseItemLine` 295–319 (25), `validateTodoSource` 385–397, `validateTodoItemSource` 399–412).
- 기존 직접 import 테스트: `test/todos-domain.test.ts:2`, `test/todo-store.test.ts:6`, `test/agent-tools.test.ts:7`, `test/native-plan-wiring.test.ts:7`, `test/project-workbench.test.ts:42`, `test/request-runtime.test.ts:9`, `test/session-monitor.test.ts:5`, `test/todo-ledger.test.ts:7`, `test/workspace-todo-view.test.ts:5`.

### `src/core/domain/work/t-notes.ts`

- 파일 442행, export 19개, 직접 importer 9개( core 3 ), core fan-out 2개, import 2개. class 없음.
- T-Note source/packet/draft/completion types 28–127; completion index projector `projectTNoteCompletionIndex` 129–164 (36); Activity source conversion `projectActivityToTNoteSource` 173–185 (13), packet construction `createTNotePacket` 187–219 (33).
- Draft/packet validators `validateTNoteDraft` 221–239 (19), `validateTNotePacket` 241–265 (25), draft and text sanitation 267–280; Activity packet projection/provenance/sequence/range/identity/date helpers 282–367.
- Native payload/privacy redaction helpers 370–442: `redactNativePayload` 370–401 (32), packet freezing 403–409, byte/truncation helpers 411–421, customer ID/path redaction 423–429, redaction marker protect/restore 431–442.
- 기존 직접 import 테스트: `test/t-notes.test.ts:8`, `test/detached-codex-generator.test.ts:5`, `test/project-workbench.test.ts:48`.

## 리팩터링 후보 순위

아래 순서는 관측된 크기와 fan-in, private helper 경계에 따라 작은 독립 후보부터 큰 상태ful 후보 순으로 적었다. 실행 결정이 아니라 조사 우선순위이며 크기는 현재 symbol 구간과 필요한 helper를 포함한 추정치다.

| 순위 | 관측 구간 후보 | 위험 | 독립성 | 예상 추출 크기 | 근거 |
|---:|---|---|---|---:|---|
| 1 | `t-notes.ts`의 native payload redaction helpers (`redactNativePayload` 및 privacy/marker helpers) | 낮음 | 높음 | 70–90행 | 한 파일 안의 사설 helper 묶음(370–442), 독립 consumer/import 경로가 적음(전체 fan-in 9). |
| 2 | `workflow-projection.ts`의 raw/native/Markdown plan decoding (`rawPlanEntries`–`parsePlan`) | 낮음–중간 | 높음 | 140–180행 | 828–968의 연속 private-helper 구간. public workflow projection과 테스트 소비자는 비교적 적음(전체 fan-in 5). |
| 3 | `todos.ts`의 Markdown codec (`renderTodoMarkdown`–line parser/helpers) | 중간 | 중간 | 120–160행 | 비교적 연속된 196–319 구간이나 exports와 직접 importer가 많음(21 exports, fan-in 20); 재수출 호환성이 위험 요인. |
| 4 | `session-stats.ts`의 root-turn/request/usage subprojections | 중간 | 중간–높음 | 140–220행 | 독립 이름이 있는 pure projection functions가 여럿(247–386)이나 main projector가 조합하고 테스트가 세 경로로 분산됨. |
| 5 | `todo-ledger.ts`의 native-plan mapping/validation helpers | 중간–높음 | 중간 | 150–220행 | private normalization helper 수가 많음(323–498), 그러나 `TodoLedger.syncNativePlan`와의 stateful 연결 및 8개 importer가 영향 범위. |
| 6 | `session-runtime.ts`의 terminal/turn/tool execution cohort | 높음 | 중간 이하 | 300–450행 | 주요 실행 method가 420–841에 집중되지만 `SessionRuntime` state와 cancellation/restore 흐름에 결합됨(916행 class, fan-in 10). |
| 7 | `project-workbench.ts`의 event/activity projection 및 background scheduling cohorts | 높음 | 낮음–중간 | 350–650행 | 3,171행 파일 중 class 2,312행, `recordNativeEvent`/`applyDelta`/snapshot/async sync 사이에 state 공유가 크고 Code-002 대상. class API와 7개 직접 import 테스트 경로를 보존해야 함. |

## 전체 symbol 길이 원자료

아래 접힌 항목은 76개 파일 각각의 top-level export 목록, 직접 outbound import 명세, AST에서 수집한 모든 function-like symbol/line span/길이, 모든 class line span/길이를 담는다. Function 목록에는 작은 inline callback도 포함된다. `start-end=length`는 inclusive 행 범위다.

<details><summary>src/core/agents/rpa-agent.ts — 44행, 4 exports, 6 functions, 0 classes</summary>

- Export: RpaIntent, RpaScenario, classifyRpaIntent, planRpaScenario
- Outbound: import `../skills/skill-registry.js` → `src/core/skills/skill-registry.ts`
- Function-like symbols: `classifyRpaIntent@24-34=11`; `classifyRpaIntent.<anonymous@32>@32-32=1`; `classifyRpaIntent.<anonymous@32>@32-32=1`; `planRpaScenario@36-44=9`; `planRpaScenario.<anonymous@38>@38-38=1`; `planRpaScenario.<anonymous@39>@39-39=1`
- Classes: 없음

</details>

<details><summary>src/core/application/development/development-service.ts — 53행, 3 exports, 7 functions, 1 classes</summary>

- Export: DevelopmentServicePorts, DevelopmentService, executeDevelopmentShellCommand
- Outbound: import `../../domain/execution/project-activity` → `src/core/domain/execution/project-activity.ts`
- Function-like symbols: `DevelopmentService.<anonymous@17>@17-17=1`; `DevelopmentService.observe@20-33=14`; `DevelopmentService.observe.<anonymous@26>@26-26=1`; `DevelopmentService.observe.<anonymous@28>@28-31=4`; `DevelopmentService.execute@35-38=4`; `DevelopmentService.close@40-40=1`; `executeDevelopmentShellCommand@44-53=10`
- Classes: `DevelopmentService@14-41=28`

</details>

<details><summary>src/core/application/orchestration/activity-narrator.ts — 16행, 3 exports, 0 functions, 0 classes</summary>

- Export: ActivityNarrationRequest, ActivityNarrationResult, ActivityNarrator
- Outbound: 없음
- Function-like symbols: 없음
- Classes: 없음

</details>

<details><summary>src/core/application/orchestration/approval-dispatch.ts — 256행, 9 exports, 18 functions, 2 classes</summary>

- Export: ApprovalResponseMethod, ApprovalResponseOperation, ApprovalEvidenceProjection, ApprovalResponseObservation, ApprovalDispatchDependencies, ApprovalDispatchResult, ApprovalDeliveryUncertainError, ApprovalResponseDispatcher, dispatchApprovalResponse
- Outbound: import `../../domain/execution/native-session.js` → `src/core/domain/execution/native-session.ts`; import `../../domain/execution/project-activity.js` → `src/core/domain/execution/project-activity.ts`
- Function-like symbols: `ApprovalDeliveryUncertainError.<anonymous@48>@48-52=5`; `ApprovalResponseDispatcher.<anonymous@59>@59-59=1`; `ApprovalResponseDispatcher.dispatch@61-87=27`; `ApprovalResponseDispatcher.restoreInterlocks@90-110=21`; `ApprovalResponseDispatcher.confirmNativeResolved@113-115=3`; `ApprovalResponseDispatcher.clearResolvedScope@117-119=3`; `ApprovalResponseDispatcher.clearScope@121-127=7`; `dispatchApprovalResponse@135-201=67`; `observation@203-213=11`; `requestIdentity@215-217=3`; `requestIdentityFromRefs@219-221=3`; `requestScope@223-225=3`; `boundedErrorReason@227-236=10`; `canonicalJson@238-246=9`; `canonicalJson.<anonymous@242>@242-242=1`; `canonicalJson.<anonymous@243>@243-243=1`; `immutable@248-250=3`; `deepFreeze@252-256=5`
- Classes: `ApprovalDeliveryUncertainError@45-53=9`; `ApprovalResponseDispatcher@55-128=74`

</details>

<details><summary>src/core/application/orchestration/artifact-publication-capability.ts — 59행, 2 exports, 14 functions, 0 classes</summary>

- Export: ArtifactPublicationPermit, artifactPublicationCapability
- Outbound: import `../../domain/development/artifact-control` → `src/core/domain/development/artifact-control.ts`; import `../../ports/execution/artifact-publication-port` → `src/core/ports/execution/artifact-publication-port.ts`; import `../../ports/execution/request-action-port` → `src/core/ports/execution/request-action-port.ts`
- Function-like symbols: `artifactPublicationCapability@13-59=47`; `artifactPublicationCapability.<anonymous@19>@19-19=1`; `artifactPublicationCapability.candidateFor@24-27=4`; `artifactPublicationCapability.<anonymous@26>@26-26=1`; `artifactPublicationCapability.<anonymous@28>@28-28=1`; `artifactPublicationCapability.allowed@28-28=1`; `artifactPublicationCapability.readBack@29-33=5`; `artifactPublicationCapability.<anonymous@37>@37-37=1`; `artifactPublicationCapability.authorize@38-38=1`; `artifactPublicationCapability.approvalPreview@39-39=1`; `artifactPublicationCapability.prepare@41-41=1`; `artifactPublicationCapability.readBack@42-46=5`; `artifactPublicationCapability.<anonymous@43>@43-43=1`; `artifactPublicationCapability.execute@48-57=10`
- Classes: 없음

</details>

<details><summary>src/core/application/orchestration/context-composer.ts — 93행, 2 exports, 5 functions, 1 classes</summary>

- Export: ContextSourceResult, ContextComposer
- Outbound: import `../../domain/execution/native-session.js` → `src/core/domain/execution/native-session.ts`; import `./woo-entry.js` → `src/core/application/orchestration/woo-entry.ts`; import `../../skills/skill-registry.js` → `src/core/skills/skill-registry.ts`
- Function-like symbols: `ContextComposer.<anonymous@19>@19-19=1`; `ContextComposer.compose@20-43=24`; `ContextComposer.compose.<anonymous@40>@40-40=1`; `ContextComposer.wooEntrySource@45-75=31`; `ContextComposer.wwwSource@77-92=16`
- Classes: `ContextComposer@18-93=76`

</details>

<details><summary>src/core/application/orchestration/detached-text-generator.ts — 45행, 4 exports, 1 functions, 0 classes</summary>

- Export: DetachedGenerationPolicy, DetachedTextGenerationRequest, DetachedTextGenerator, assertDetachedPolicy
- Outbound: import `../../domain/work/t-notes.js` → `src/core/domain/work/t-notes.ts`
- Function-like symbols: `assertDetachedPolicy@39-45=7`
- Classes: 없음

</details>

<details><summary>src/core/application/orchestration/execution-journal.ts — 62행, 1 exports, 9 functions, 1 classes</summary>

- Export: ExecutionJournal
- Outbound: import `../../domain/execution/project-activity.js` → `src/core/domain/execution/project-activity.ts`; import `../../domain/execution/execution-run-contract.js` → `src/core/domain/execution/execution-run-contract.ts`; import `../../runtime/execution-run.js` → `src/core/runtime/execution-run.ts`
- Function-like symbols: `ExecutionJournal.<anonymous@8>@8-8=1`; `ExecutionJournal.get@9-9=1`; `ExecutionJournal.values@10-10=1`; `ExecutionJournal.observe@11-18=8`; `ExecutionJournal.restore@20-57=38`; `ExecutionJournal.restore.<anonymous@35>@35-35=1`; `ExecutionJournal.restore.<anonymous@38>@38-38=1`; `ExecutionJournal.restore.<anonymous@39>@39-39=1`; `asRecord@60-62=3`
- Classes: `ExecutionJournal@6-58=53`

</details>

<details><summary>src/core/application/orchestration/project-workbench.ts — 3171행, 5 exports, 280 functions, 1 classes</summary>

- Export: WorkbenchActivityJournal, WorkbenchTodoSource, WorkbenchTNoteSource, ProjectWorkbenchOptions, ProjectWorkbench
- Outbound: import `node:crypto`; import `../../ports/execution/executor-port.js` → `src/core/ports/execution/executor-port.ts`; import `../work/canonical-promotion.js` → `src/core/application/work/canonical-promotion.ts`; import `../review/review-service.js` → `src/core/application/review/review-service.ts`; import `./activity-narrator.js` → `src/core/application/orchestration/activity-narrator.ts`; import `../session/session-model-usage.js` → `src/core/application/session/session-model-usage.ts`; import `../work/todo-ledger.js` → `src/core/application/work/todo-ledger.ts`; import `./woo-entry.js` → `src/core/application/orchestration/woo-entry.ts`; import `../../skills/skill-registry.js` → `src/core/skills/skill-registry.ts`; import `./context-composer.js` → `src/core/application/orchestration/context-composer.ts`; import `./request-protocol` → `src/core/application/orchestration/request-protocol.ts`; import `./request-controller` → `src/core/application/orchestration/request-controller.ts`; import `../../ports/execution/request-action-port` → `src/core/ports/execution/request-action-port.ts`; import `../../ports/execution/runtime-tool-port` → `src/core/ports/execution/runtime-tool-port.ts`; import `./request-runtime-mode.js` → `src/core/application/orchestration/request-runtime-mode.ts`; import `../../runtime/request-runtime` → `src/core/runtime/request-runtime.ts`; import `../../domain/work/request-projections` → `src/core/domain/work/request-projections.ts`; import `../../domain/execution/request-runtime` → `src/core/domain/execution/request-runtime.ts`; import `../../ports/execution/request-projection-port` → `src/core/ports/execution/request-projection-port.ts`; import `./approval-dispatch.js` → `src/core/application/orchestration/approval-dispatch.ts`; import `../session/session-usage-tracker.js` → `src/core/application/session/session-usage-tracker.ts`; import `../../domain/execution/native-session.js` → `src/core/domain/execution/native-session.ts`; import `../../domain/execution/native-session.js` → `src/core/domain/execution/native-session.ts`; import `../../domain/execution/model-settings.js` → `src/core/domain/execution/model-settings.ts`; import `../../domain/execution/project-activity.js` → `src/core/domain/execution/project-activity.ts`; import `../../domain/review/redaction.js` → `src/core/domain/review/redaction.ts`; import `../../domain/execution/terminal.js` → `src/core/domain/execution/terminal.ts`; import `../../domain/work/todos.js` → `src/core/domain/work/todos.ts`; import `../../domain/work/canonical-document.js` → `src/core/domain/work/canonical-document.ts`; import `../../domain/review/review.js` → `src/core/domain/review/review.ts`; import `../../domain/work/index.js` → `src/core/domain/work/index.ts`; import `../../runtime/execution-run.js` → `src/core/runtime/execution-run.ts`; import `../../domain/work/t-notes.js` → `src/core/domain/work/t-notes.ts`; import `../work/t-note-service.js` → `src/core/application/work/t-note-service.ts`; import `../../domain/work/workbench.js` → `src/core/domain/work/workbench.ts`; import `../../domain/work/workbench.js` → `src/core/domain/work/workbench.ts`; import `../../domain/work/trace-selection.js` → `src/core/domain/work/trace-selection.ts`; import `../../domain/work/linear-dashboard.js` → `src/core/domain/work/linear-dashboard.ts`; import `../../domain/work/performance.js` → `src/core/domain/work/performance.ts`; import `./execution-journal.js` → `src/core/application/orchestration/execution-journal.ts`; import `../../domain/work/delegation.js` → `src/core/domain/work/delegation.ts`
- Function-like symbols: `sha256Hex@103-103=1`; `ProjectWorkbench.<anonymous@364>@364-431=68`; `ProjectWorkbench.activities@377-377=1`; `ProjectWorkbench.requestApproval@380-380=1`; `ProjectWorkbench.canAct@381-381=1`; `ProjectWorkbench.canRecover@382-382=1`; `ProjectWorkbench.append@383-383=1`; `ProjectWorkbench.<anonymous@385>@385-391=7`; `ProjectWorkbench.<anonymous@388>@388-388=1`; `ProjectWorkbench.<anonymous@389>@389-389=1`; `ProjectWorkbench.<anonymous@391>@391-391=1`; `ProjectWorkbench.record@395-395=1`; `ProjectWorkbench.respondToApproval@396-396=1`; `ProjectWorkbench.<anonymous@413>@413-421=9`; `ProjectWorkbench.<anonymous@417>@417-417=1`; `ProjectWorkbench.<anonymous@418>@418-418=1`; `ProjectWorkbench.<anonymous@419>@419-419=1`; `ProjectWorkbench.<anonymous@420>@420-420=1`; `ProjectWorkbench.<anonymous@422>@422-428=7`; `ProjectWorkbench.<anonymous@428>@428-428=1`; `ProjectWorkbench.<anonymous@429>@429-429=1`; `ProjectWorkbench.<anonymous@429>@429-429=1`; `ProjectWorkbench.<anonymous@430>@430-430=1`; `ProjectWorkbench.snapshot@433-435=3`; `ProjectWorkbench.refreshModels@438-453=16`; `ProjectWorkbench.refreshModels.<anonymous@440>@440-451=12`; `ProjectWorkbench.refreshModels.<anonymous@451>@451-451=1`; `ProjectWorkbench.backgroundWorkState@456-461=6`; `ProjectWorkbench.<anonymous@457>@457-460=4`; `ProjectWorkbench.waitUntilReady@464-466=3`; `ProjectWorkbench.subscribe@468-472=5`; `ProjectWorkbench.subscribe.<anonymous@471>@471-471=1`; `ProjectWorkbench.dispatch@474-490=17`; `ProjectWorkbench.dispatch.<anonymous@486>@486-486=1`; `ProjectWorkbench.dispatch.<anonymous@487>@487-487=1`; `ProjectWorkbench.dispatch.<anonymous@488>@488-488=1`; `ProjectWorkbench.dispatch.<anonymous@488>@488-488=1`; `ProjectWorkbench.requestActionApproval@492-517=26`; `ProjectWorkbench.requestActionApproval.<anonymous@494>@494-516=23`; `ProjectWorkbench.requestActionApproval.finish@496-505=10`; `ProjectWorkbench.requestActionApproval.abort@506-506=1`; `ProjectWorkbench.dispatchCancellation@519-529=11`; `ProjectWorkbench.dispatchSerialized@531-597=67`; `ProjectWorkbench.dispatchSerialized.<anonymous@565>@565-565=1`; `ProjectWorkbench.dispatchSerialized.<anonymous@571>@571-571=1`; `ProjectWorkbench.dispatchSerialized.<anonymous@572>@572-572=1`; `ProjectWorkbench.dispatchSerialized.<anonymous@573>@573-573=1`; `ProjectWorkbench.close@599-616=18`; `ProjectWorkbench.close.<anonymous@608>@608-608=1`; `ProjectWorkbench.close.<anonymous@609>@609-609=1`; `ProjectWorkbench.close.<anonymous@610>@610-610=1`; `ProjectWorkbench.close.<anonymous@611>@611-611=1`; `ProjectWorkbench.close.<anonymous@612>@612-612=1`; `ProjectWorkbench.initialize@618-740=123`; `ProjectWorkbench.initialize.<anonymous@623>@623-623=1`; `ProjectWorkbench.initialize.<anonymous@641>@641-641=1`; `ProjectWorkbench.initialize.<anonymous@642>@642-642=1`; `ProjectWorkbench.initialize.<anonymous@672>@672-672=1`; `ProjectWorkbench.initialize.<anonymous@673>@673-676=4`; `ProjectWorkbench.refreshLinearDashboard@742-756=15`; `ProjectWorkbench.refreshLinearDashboard.<anonymous@745>@745-749=5`; `ProjectWorkbench.refreshLinearDashboard.<anonymous@749>@749-755=7`; `ProjectWorkbench.sendChat@758-781=24`; `ProjectWorkbench.sendChat.<anonymous@762>@762-762=1`; `ProjectWorkbench.sendChat.<anonymous@762>@762-762=1`; `ProjectWorkbench.sendChat.<anonymous@763>@763-763=1`; `ProjectWorkbench.setGoal@783-793=11`; `ProjectWorkbench.steerChatTurn@795-842=48`; `ProjectWorkbench.startChatTurn@844-971=128`; `ProjectWorkbench.startChatTurn.<anonymous@887>@887-887=1`; `ProjectWorkbench.startChatTurn.<anonymous@888>@888-888=1`; `ProjectWorkbench.startChatTurn.<anonymous@888>@888-888=1`; `ProjectWorkbench.startChatTurn.<anonymous@888>@888-888=1`; `ProjectWorkbench.appendRequestObservation@973-987=15`; `ProjectWorkbench.requestProtocolVersion@989-993=5`; `ProjectWorkbench.requestProtocolVersion.<anonymous@991>@991-991=1`; `ProjectWorkbench.drainChatQueue@995-1006=12`; `ProjectWorkbench.drainChatQueue.<anonymous@996>@996-996=1`; `ProjectWorkbench.drainChatQueue.<anonymous@996>@996-996=1`; `ProjectWorkbench.cancelChat@1008-1087=80`; `ProjectWorkbench.clearChatProjection@1090-1101=12`; `ProjectWorkbench.compactThread@1103-1114=12`; `ProjectWorkbench.resolveApproval@1116-1129=14`; `ProjectWorkbench.selectAgent@1131-1140=10`; `ProjectWorkbench.selectAgent.<anonymous@1133>@1133-1133=1`; `ProjectWorkbench.selectAgent.<anonymous@1134>@1134-1134=1`; `ProjectWorkbench.selectActivity@1143-1159=17`; `ProjectWorkbench.selectTraceActivity@1161-1173=13`; `ProjectWorkbench.rejectedSelection@1175-1185=11`; `ProjectWorkbench.resumeCoverage@1187-1193=7`; `ProjectWorkbench.configurePermission@1195-1207=13`; `ProjectWorkbench.configureCollaboration@1209-1219=11`; `ProjectWorkbench.configureModel@1221-1246=26`; `ProjectWorkbench.mcpManagement@1248-1255=8`; `ProjectWorkbench.requireMcpManagement@1257-1261=5`; `ProjectWorkbench.refreshMcpServers@1263-1267=5`; `ProjectWorkbench.setMcpServerEnabled@1269-1275=7`; `ProjectWorkbench.reloadMcpServers@1277-1283=7`; `ProjectWorkbench.refreshWooEntry@1286-1305=20`; `ProjectWorkbench.currentSandboxPolicy@1307-1316=10`; `ProjectWorkbench.currentNativeCollaborationMode@1318-1341=24`; `ProjectWorkbench.captureNote@1343-1372=30`; `ProjectWorkbench.captureNote.<anonymous@1349>@1349-1349=1`; `ProjectWorkbench.captureNote.<anonymous@1349>@1349-1349=1`; `ProjectWorkbench.captureNote.<anonymous@1352>@1352-1352=1`; `ProjectWorkbench.captureNote.<anonymous@1353>@1353-1353=1`; `ProjectWorkbench.captureSessionNote@1374-1381=8`; `ProjectWorkbench.captureSessionNote.<anonymous@1379>@1379-1379=1`; `ProjectWorkbench.captureNoteRange@1383-1396=14`; `ProjectWorkbench.captureNoteRange.<anonymous@1391>@1391-1391=1`; `ProjectWorkbench.captureNoteRange.<anonymous@1395>@1395-1395=1`; `ProjectWorkbench.tnoteRequest@1398-1423=26`; `ProjectWorkbench.tnoteRequest.<anonymous@1413>@1413-1418=6`; `ProjectWorkbench.completionOrdinal@1425-1445=21`; `ProjectWorkbench.completionOrdinal.<anonymous@1430>@1430-1430=1`; `ProjectWorkbench.completionOrdinal.<anonymous@1431>@1431-1431=1`; `ProjectWorkbench.completionOrdinal.<anonymous@1432>@1432-1432=1`; `ProjectWorkbench.completionOrdinal.<anonymous@1435>@1435-1439=5`; `ProjectWorkbench.completionOrdinal.<anonymous@1437>@1437-1437=1`; `ProjectWorkbench.completionOrdinal.<anonymous@1440>@1440-1440=1`; `ProjectWorkbench.completionOrdinal.<anonymous@1441>@1441-1441=1`; `ProjectWorkbench.createTNote@1447-1464=18`; `ProjectWorkbench.noteForTurn@1466-1472=7`; `ProjectWorkbench.noteForTurn.<anonymous@1470>@1470-1470=1`; `ProjectWorkbench.noteForTurn.<anonymous@1470>@1470-1470=1`; `ProjectWorkbench.mutateTodo@1474-1483=10`; `ProjectWorkbench.transitionTodo@1485-1492=8`; `ProjectWorkbench.transitionTodo.<anonymous@1491>@1491-1491=1`; `ProjectWorkbench.recordTodoEvidence@1494-1503=10`; `ProjectWorkbench.recordTodoEvidence.<anonymous@1496>@1496-1496=1`; `ProjectWorkbench.importLegacyTodo@1505-1510=6`; `ProjectWorkbench.acceptPromotion@1512-1527=16`; `ProjectWorkbench.confirmPromotion@1529-1544=16`; `ProjectWorkbench.previewReview@1546-1566=21`; `ProjectWorkbench.sendReview@1568-1582=15`; `ProjectWorkbench.requireTodos@1584-1587=4`; `ProjectWorkbench.bindThreadSources@1589-1593=5`; `ProjectWorkbench.loadBoundTNotes@1595-1608=14`; `ProjectWorkbench.bindTodoThread@1610-1615=6`; `ProjectWorkbench.runLocalWorkflow@1617-1627=11`; `ProjectWorkbench.setActionResult@1629-1638=10`; `ProjectWorkbench.recordNativeEvent@1641-1786=146`; `ProjectWorkbench.recordNativeEvent.clearsProjection@1749-1753=5`; `ProjectWorkbench.projectPublicPlanFallback@1788-1828=41`; `ProjectWorkbench.projectPublicPlanFallback.<anonymous@1790>@1790-1791=2`; `ProjectWorkbench.projectPublicPlanFallback.<anonymous@1793>@1793-1798=6`; `ProjectWorkbench.projectPublicPlanFallback.<anonymous@1799>@1799-1799=1`; `ProjectWorkbench.projectPublicPlanFallback.<anonymous@1801>@1801-1805=5`; `ProjectWorkbench.projectPublicPlanFallback.<anonymous@1807>@1807-1810=4`; `ProjectWorkbench.projectPublicPlanFallback.<anonymous@1810>@1810-1810=1`; `ProjectWorkbench.scheduleAutomaticTNote@1834-1865=32`; `ProjectWorkbench.scheduleAutomaticTNote.<anonymous@1841>@1841-1841=1`; `ProjectWorkbench.scheduleAutomaticTNote.<anonymous@1842>@1842-1864=23`; `ProjectWorkbench.reconcileAutomaticTNotes@1867-1875=9`; `ProjectWorkbench.hasTNoteFor@1877-1881=5`; `ProjectWorkbench.hasTNoteFor.<anonymous@1880>@1880-1880=1`; `ProjectWorkbench.hasTNoteFor.<anonymous@1880>@1880-1880=1`; `ProjectWorkbench.applyDelta@1884-1980=97`; `ProjectWorkbench.appendActivity@1982-2026=45`; `ProjectWorkbench.appendActivity.<anonymous@2009>@2009-2009=1`; `ProjectWorkbench.reduceExecutionActivity@2029-2031=3`; `ProjectWorkbench.hasCompletionReceipt@2033-2038=6`; `ProjectWorkbench.hasCompletionReceipt.<anonymous@2034>@2034-2037=4`; `ProjectWorkbench.appendExecutionReceipt@2040-2056=17`; `ProjectWorkbench.selectedExecutionRun@2058-2061=4`; `ProjectWorkbench.activityJournalProjectId@2063-2065=3`; `ProjectWorkbench.reconcileNativeState@2067-2075=9`; `ProjectWorkbench.isRootThreadEvent@2077-2079=3`; `ProjectWorkbench.normalizeNativeRefs@2081-2090=10`; `ProjectWorkbench.rememberNativeRefs@2092-2098=7`; `ProjectWorkbench.applyThreadSettings@2100-2103=4`; `ProjectWorkbench.hasTerminalTurn@2105-2108=4`; `ProjectWorkbench.rememberTerminalTurn@2110-2115=6`; `ProjectWorkbench.hasTerminalItem@2117-2120=4`; `ProjectWorkbench.rememberTerminalItem@2122-2126=5`; `ProjectWorkbench.preserveUnfinalizedAssistantResponse@2129-2164=36`; `ProjectWorkbench.preserveUnfinalizedAssistantResponse.<anonymous@2138>@2138-2145=8`; `ProjectWorkbench.isActivityVisible@2166-2170=5`; `ProjectWorkbench.fail@2172-2175=4`; `ProjectWorkbench.publish@2177-2183=7`; `ProjectWorkbench.makeSnapshot@2185-2263=79`; `ProjectWorkbench.makeSnapshot.<anonymous@2197>@2197-2197=1`; `ProjectWorkbench.makeSnapshot.<anonymous@2198>@2198-2198=1`; `ProjectWorkbench.makeSnapshot.<anonymous@2232>@2232-2232=1`; `ProjectWorkbench.makeSnapshot.<anonymous@2232>@2232-2232=1`; `ProjectWorkbench.projectDelegation@2265-2270=6`; `ProjectWorkbench.projectDurableActivities@2272-2286=15`; `ProjectWorkbench.projectChat@2288-2297=10`; `ProjectWorkbench.projectChat.<anonymous@2290>@2290-2290=1`; `ProjectWorkbench.projectDurableNotes@2299-2311=13`; `ProjectWorkbench.currentSessionNotes@2313-2321=9`; `ProjectWorkbench.currentSessionNotes.<anonymous@2314>@2314-2314=1`; `ProjectWorkbench.currentSessionNotes.<anonymous@2315>@2315-2315=1`; `ProjectWorkbench.currentSessionNotes.<anonymous@2315>@2315-2315=1`; `ProjectWorkbench.currentSessionNotes.<anonymous@2317>@2317-2317=1`; `ProjectWorkbench.currentSessionNotes.<anonymous@2318>@2318-2320=3`; `ProjectWorkbench.projectCurrentWorkFlow@2323-2356=34`; `ProjectWorkbench.projectExecutionTodo@2358-2377=20`; `ProjectWorkbench.projectExecutionTodo.<anonymous@2366>@2366-2373=8`; `ProjectWorkbench.currentPlanProjectionInput@2379-2383=5`; `ProjectWorkbench.invalidateWorkFlow@2385-2387=3`; `ProjectWorkbench.scheduleNativeTodoSync@2389-2408=20`; `ProjectWorkbench.scheduleNativeTodoSync.<anonymous@2405>@2405-2405=1`; `ProjectWorkbench.requestRecords@2410-2415=6`; `ProjectWorkbench.scheduleRequestProjections@2417-2443=27`; `ProjectWorkbench.scheduleRequestProjections.<anonymous@2419>@2419-2419=1`; `ProjectWorkbench.scheduleRequestProjections.<anonymous@2424>@2424-2427=4`; `ProjectWorkbench.scheduleRequestProjections.<anonymous@2430>@2430-2430=1`; `ProjectWorkbench.scheduleRequestProjections.<anonymous@2430>@2430-2440=11`; `ProjectWorkbench.scheduleNarratedTodoSync@2445-2453=9`; `ProjectWorkbench.enqueueNativeTodoSync@2455-2491=37`; `ProjectWorkbench.enqueueNativeTodoSync.<anonymous@2467>@2467-2467=1`; `ProjectWorkbench.enqueueNativeTodoSync.<anonymous@2468>@2468-2490=23`; `ProjectWorkbench.nativeTodoBinding@2494-2520=27`; `ProjectWorkbench.nativeTodoBinding.<anonymous@2497>@2497-2501=5`; `ProjectWorkbench.scheduleNarrations@2522-2554=33`; `ProjectWorkbench.scheduleNarrations.<anonymous@2538>@2538-2550=13`; `ProjectWorkbench.scheduleNarrations.<anonymous@2550>@2550-2552=3`; `nativeObservation@2557-2617=61`; `nativeReasoningSummary@2619-2631=13`; `nativeReasoningSummary.<anonymous@2625>@2625-2625=1`; `boundedJournalNativeValue@2633-2640=8`; `projectJournalNativeValue@2642-2690=49`; `projectJournalNativeValue.<anonymous@2672>@2672-2672=1`; `journalNativeFieldPriority@2692-2696=5`; `completedTurnNoteScope@2698-2723=26`; `completedTurnNoteScope.<anonymous@2716>@2716-2718=3`; `completedTurnNoteScope.<anonymous@2719>@2719-2719=1`; `completedTurnNoteScope.<anonymous@2720>@2720-2720=1`; `completedTurnNoteScope.<anonymous@2721>@2721-2721=1`; `questionForTurn@2725-2738=14`; `questionIndexForTurn@2740-2752=13`; `latestCompletedTurnNoteScope@2754-2764=11`; `fullCompletedTurnScope@2766-2775=10`; `fullCompletedTurnScope.<anonymous@2771>@2771-2771=1`; `fullCompletedTurnScope.<anonymous@2773>@2773-2773=1`; `turnTNoteInstruction@2777-2789=13`; `normalizedQuestion@2791-2794=4`; `projectSessionGoal@2796-2814=19`; `isSessionGoalRequest@2816-2818=3`; `sessionGoalMarker@2820-2825=6`; `projectTNote@2827-2840=14`; `projectTNote.<anonymous@2835>@2835-2835=1`; `canonicalTNoteDraft@2842-2850=9`; `todoResultBody@2852-2854=3`; `activityKind@2856-2866=11`; `activityPhase@2868-2889=22`; `isDeltaNotification@2891-2893=3`; `turnLifecycle@2895-2901=7`; `isAssistantMessageObservation@2903-2910=8`; `isAssistantMessageActivity@2912-2919=8`; `isStructuredPlanActivity@2921-2926=6`; `isPublicPlanFallbackActivity@2928-2931=4`; `publicNumberedPlanEntries@2933-2967=35`; `publicNumberedPlanEntries.<anonymous@2939>@2939-2939=1`; `missingAssistantResponseNotice@2969-2973=5`; `projectChat@2976-3013=38`; `projectChat.<anonymous@3012>@3012-3012=1`; `chatMessageRole@3015-3025=11`; `chatMessageStatus@3027-3038=12`; `nativeItemIdentity@3040-3047=8`; `sameTurnOwner@3049-3052=4`; `threadItemKey@3054-3056=3`; `addOwner@3058-3062=5`; `soleValue@3064-3066=3`; `activityText@3068-3078=11`; `stableJson@3080-3088=9`; `stableJson.<anonymous@3084>@3084-3084=1`; `stableJson.<anonymous@3085>@3085-3085=1`; `digestSource@3090-3092=3`; `immutable@3094-3096=3`; `deepFreezeFresh@3098-3103=6`; `deepFreeze@3105-3110=6`; `record@3112-3114=3`; `isUncertain@3116-3121=6`; `blockedChatDeliveryState@3128-3141=14`; `turnKey@3143-3145=3`; `errorMessage@3147-3150=4`; `emptyBoundedTextProjection@3152-3154=3`; `appendBoundedText@3156-3171=16`
- Classes: `ProjectWorkbench@244-2555=2312`

</details>

<details><summary>src/core/application/orchestration/request-controller.ts — 183행, 3 exports, 41 functions, 1 classes</summary>

- Export: REQUEST_RUNTIME_TOOLS, RequestControllerDependencies, RequestController
- Outbound: import `../../domain/execution/project-activity` → `src/core/domain/execution/project-activity.ts`; import `../../domain/execution/request-runtime` → `src/core/domain/execution/request-runtime.ts`; import `../../runtime/request-runtime` → `src/core/runtime/request-runtime.ts`; import `../../ports/execution/request-action-port` → `src/core/ports/execution/request-action-port.ts`; import `../../ports/execution/runtime-tool-port` → `src/core/ports/execution/runtime-tool-port.ts`
- Function-like symbols: `obj@7-7=1`; `identity@8-8=1`; `validDelivery@9-9=1`; `RequestController.<anonymous@38>@38-41=4`; `RequestController.<anonymous@39>@39-39=1`; `RequestController.interrupt@42-42=1`; `RequestController.settled@43-43=1`; `RequestController.recover@45-50=6`; `RequestController.handle@51-53=3`; `RequestController.enqueue@54-62=9`; `RequestController.enqueue.<anonymous@59>@59-59=1`; `RequestController.enqueue.<anonymous@60>@60-60=1`; `RequestController.enqueue.<anonymous@61>@61-61=1`; `RequestController.current@63-65=3`; `RequestController.current.<anonymous@64>@64-64=1`; `RequestController.revision@66-68=3`; `RequestController.revision.<anonymous@67>@67-67=1`; `RequestController.response@69-71=3`; `RequestController.run@72-182=111`; `RequestController.run.<anonymous@77>@77-77=1`; `RequestController.run.active@78-78=1`; `RequestController.run.<anonymous@81>@81-81=1`; `RequestController.run.<anonymous@81>@81-81=1`; `RequestController.run.<anonymous@85>@85-85=1`; `RequestController.run.<anonymous@88>@88-88=1`; `RequestController.run.<anonymous@92>@92-92=1`; `RequestController.run.<anonymous@94>@94-94=1`; `RequestController.run.<anonymous@96>@96-96=1`; `RequestController.run.<anonymous@98>@98-98=1`; `RequestController.run.<anonymous@100>@100-100=1`; `RequestController.run.<anonymous@117>@117-117=1`; `RequestController.run.<anonymous@117>@117-117=1`; `RequestController.run.<anonymous@120>@120-120=1`; `RequestController.run.<anonymous@123>@123-123=1`; `RequestController.run.<anonymous@127>@127-127=1`; `RequestController.run.<anonymous@130>@130-130=1`; `RequestController.run.<anonymous@138>@138-138=1`; `RequestController.run.<anonymous@141>@141-141=1`; `RequestController.run.<anonymous@142>@142-142=1`; `RequestController.run.<anonymous@144>@144-144=1`; `RequestController.run.<anonymous@167>@167-167=1`
- Classes: `RequestController@34-183=150`

</details>

<details><summary>src/core/application/orchestration/request-protocol.ts — 30행, 1 exports, 1 functions, 0 classes</summary>

- Export: requestProtocolContext
- Outbound: import `../../domain/execution/request-runtime` → `src/core/domain/execution/request-runtime.ts`; import `../../domain/execution/native-session` → `src/core/domain/execution/native-session.ts`
- Function-like symbols: `requestProtocolContext@5-30=26`
- Classes: 없음

</details>

<details><summary>src/core/application/orchestration/request-runtime-mode.ts — 43행, 3 exports, 5 functions, 1 classes</summary>

- Export: RequestRuntimeMode, RequestRuntimePolicyOptions, RequestRuntimePolicy
- Outbound: 없음
- Function-like symbols: `RequestRuntimePolicy.<anonymous@17>@17-25=9`; `RequestRuntimePolicy.brokered@27-29=3`; `RequestRuntimePolicy.modeForRequest@31-33=3`; `RequestRuntimePolicy.manages@35-37=3`; `RequestRuntimePolicy.protocolVersion@40-42=3`
- Classes: `RequestRuntimePolicy@14-43=30`

</details>

<details><summary>src/core/application/orchestration/woo-entry.ts — 219행, 9 exports, 20 functions, 1 classes</summary>

- Export: WooEntryJsonObject, WooEntryJson, WooEntryPayload, WooEntrySource, WooEntryCollection, WooEntryCollector, WooEntrySnapshot, WooEntry, normalizeWooEntryPayload
- Outbound: import `../../domain/execution/native-session.js` → `src/core/domain/execution/native-session.ts`
- Function-like symbols: `WooEntry.<anonymous@52>@52-55=4`; `WooEntry.<anonymous@54>@54-54=1`; `WooEntry.snapshot@57-59=3`; `WooEntry.refresh@61-69=9`; `WooEntry.refresh.<anonymous@65>@65-67=3`; `WooEntry.prepareTurn@71-91=21`; `WooEntry.refreshNow@93-103=11`; `normalizeWooEntryPayload@107-128=22`; `validateCollection@130-138=9`; `toContextSnapshot@140-163=24`; `safeContextValue@165-173=9`; `assertBudget@175-177=3`; `normalizeRecord@179-182=4`; `normalizeList@184-187=4`; `normalizeList.<anonymous@186>@186-186=1`; `freezeRecord@189-194=6`; `normalizeJson@196-208=13`; `normalizeJson.<anonymous@204>@204-204=1`; `isRecord@210-212=3`; `safeReason@214-219=6`
- Classes: `WooEntry@43-104=62`

</details>

<details><summary>src/core/application/review/review-service.ts — 68행, 3 exports, 5 functions, 1 classes</summary>

- Export: ApprovedReview, ReviewProvenanceStore, ReviewService
- Outbound: import `../../domain/review/review` → `src/core/domain/review/review.ts`
- Function-like symbols: `ReviewService.<anonymous@29>@29-33=5`; `ReviewService.preview@35-37=3`; `ReviewService.send@39-63=25`; `ReviewService.provenance@65-67=3`; `ReviewService.provenance.<anonymous@66>@66-66=1`
- Classes: `ReviewService@26-68=43`

</details>

<details><summary>src/core/application/routing/router-service.ts — 71행, 2 exports, 7 functions, 1 classes</summary>

- Export: RouterService, reconcileInitialRouter
- Outbound: import `../../domain/execution/model-settings` → `src/core/domain/execution/model-settings.ts`; import `../../ports/index.js` → `src/core/ports/index.ts`; import `../session/session-runtime` → `src/core/application/session/session-runtime.ts`
- Function-like symbols: `RouterService.<anonymous@9>@9-13=5`; `RouterService.update@15-39=25`; `RouterService.update.<anonymous@16>@16-36=21`; `RouterService.update.<anonymous@37>@37-37=1`; `RouterService.synchronizeObservedSettings@41-45=5`; `RouterService.flush@47-49=3`; `reconcileInitialRouter@57-71=15`
- Classes: `RouterService@6-50=45`

</details>

<details><summary>src/core/application/session/session-model-usage.ts — 49행, 3 exports, 6 functions, 1 classes</summary>

- Export: SessionModelUsageObservation, SessionModelUsageSource, SessionModelUsageAccumulator
- Outbound: import `../../domain/work/workbench.js` → `src/core/domain/work/workbench.ts`
- Function-like symbols: `SessionModelUsageAccumulator.snapshot@19-23=5`; `SessionModelUsageAccumulator.<anonymous@21>@21-21=1`; `SessionModelUsageAccumulator.<anonymous@22>@22-22=1`; `SessionModelUsageAccumulator.observe@25-43=19`; `SessionModelUsageAccumulator.subscribe@45-48=4`; `SessionModelUsageAccumulator.subscribe.<anonymous@47>@47-47=1`
- Classes: `SessionModelUsageAccumulator@15-49=35`

</details>

<details><summary>src/core/application/session/session-monitor.ts — 133행, 3 exports, 14 functions, 1 classes</summary>

- Export: MonitoringListener, MonitoringSource, SessionMonitor
- Outbound: import `../../domain/observability/monitoring` → `src/core/domain/observability/monitoring.ts`; import `../../domain/work/todos` → `src/core/domain/work/todos.ts`; import `../../domain/execution/output` → `src/core/domain/execution/output.ts`; import `./session-runtime` → `src/core/application/session/session-runtime.ts`; import `../../ports/index.js` → `src/core/ports/index.ts`
- Function-like symbols: `SessionMonitor.<anonymous@24>@24-39=16`; `SessionMonitor.<anonymous@33>@33-35=3`; `SessionMonitor.<anonymous@36>@36-38=3`; `SessionMonitor.snapshot@41-43=3`; `SessionMonitor.subscribe@45-54=10`; `SessionMonitor.subscribe.<anonymous@53>@53-53=1`; `SessionMonitor.dispose@56-62=7`; `SessionMonitor.updateRuntime@64-67=4`; `SessionMonitor.updateTodos@69-72=4`; `SessionMonitor.publish@74-83=10`; `SessionMonitor.project@85-119=35`; `SessionMonitor.project.<anonymous@95>@95-95=1`; `SessionMonitor.project.<anonymous@96>@96-96=1`; `toolSummary@122-133=12`
- Classes: `SessionMonitor@14-120=107`

</details>

<details><summary>src/core/application/session/session-runtime.ts — 1157행, 9 exports, 83 functions, 1 classes</summary>

- Export: SessionPhase, WorkspaceContext, SessionActivityKind, SessionActivity, ConversationTurn, SessionSnapshot, SessionListener, buildSessionSystemPrompt, SessionRuntime
- Outbound: import `@earendil-works/pi-ai`; import `../../domain/execution/model-settings` → `src/core/domain/execution/model-settings.ts`; import `../../domain/execution/workbench-config.js` → `src/core/domain/execution/workbench-config.ts`; import `../../domain/work/narration` → `src/core/domain/work/narration.ts`; import `../../domain/work/planning` → `src/core/domain/work/planning.ts`; import `../../domain/execution/session-events` → `src/core/domain/execution/session-events.ts`; import `../../domain/execution/output` → `src/core/domain/execution/output.ts`; import `../../domain/execution/terminal` → `src/core/domain/execution/terminal.ts`; import `../../ports/index.js` → `src/core/ports/index.ts`
- Function-like symbols: `buildSessionSystemPrompt@59-105=47`; `buildSessionSystemPrompt.<anonymous@99>@99-99=1`; `buildSessionSystemPrompt.<anonymous@100>@100-100=1`; `messageText@107-112=6`; `messageText.<anonymous@109>@109-109=1`; `messageText.<anonymous@110>@110-110=1`; `storedAssistantMessage@114-119=6`; `errorMessage@121-130=10`; `displaySafe@132-145=14`; `runningToolSnapshot@147-176=30`; `runningToolSnapshot.<anonymous@151>@151-151=1`; `storedToolResult@178-190=13`; `storedToolSnapshot@192-200=9`; `storedNarration@202-240=39`; `SessionRuntime.<anonymous@258>@258-277=20`; `SessionRuntime.<anonymous@273>@273-273=1`; `SessionRuntime.<anonymous@275>@275-275=1`; `SessionRuntime.settings@281-283=3`; `SessionRuntime.updatePlanning@285-293=9`; `SessionRuntime.updatePlanning.<anonymous@290>@290-290=1`; `SessionRuntime.snapshot@295-311=17`; `SessionRuntime.<anonymous@299>@299-299=1`; `SessionRuntime.<anonymous@308>@308-308=1`; `SessionRuntime.<anonymous@309>@309-309=1`; `SessionRuntime.subscribe@313-321=9`; `SessionRuntime.subscribe.<anonymous@320>@320-320=1`; `SessionRuntime.initialize@323-351=29`; `SessionRuntime.updateSettings@353-374=22`; `SessionRuntime.updateSettings.<anonymous@370>@370-370=1`; `SessionRuntime.refreshAuth@376-380=5`; `SessionRuntime.submit@382-403=22`; `SessionRuntime.submit.<anonymous@395>@395-397=3`; `SessionRuntime.submit.<anonymous@398>@398-400=3`; `SessionRuntime.runTerminalCommand@405-418=14`; `SessionRuntime.runTerminalCommand.<anonymous@414>@414-414=1`; `SessionRuntime.runTerminalCommand.<anonymous@415>@415-415=1`; `SessionRuntime.runDirectTerminalCommand@420-560=141`; `SessionRuntime.runDirectTerminalCommand.<anonymous@494>@494-503=10`; `SessionRuntime.runDirectTerminalCommand.<anonymous@495>@495-495=1`; `SessionRuntime.runDirectTerminalCommand.<anonymous@528>@528-528=1`; `SessionRuntime.runTurn@562-694=133`; `SessionRuntime.runTurn.<anonymous@614>@614-614=1`; `SessionRuntime.runTurn.<anonymous@649>@649-649=1`; `SessionRuntime.streamAssistant@696-746=51`; `SessionRuntime.streamAssistant.<anonymous@712>@712-726=15`; `SessionRuntime.streamAssistant.onRetryScheduled@730-733=4`; `SessionRuntime.streamAssistant.onRetryAttemptStart@734-739=6`; `SessionRuntime.executeToolCall@748-841=94`; `SessionRuntime.executeToolCall.<anonymous@767>@767-767=1`; `SessionRuntime.executeToolCall.<anonymous@803>@803-803=1`; `SessionRuntime.recordTodoEvidence@843-859=17`; `SessionRuntime.recordNarration@861-891=31`; `SessionRuntime.appendLearningSummary@893-924=32`; `SessionRuntime.appendLearningSummary.<anonymous@894>@894-894=1`; `SessionRuntime.appendLearningSummary.<anonymous@897>@897-897=1`; `SessionRuntime.appendLearningSummary.<anonymous@900>@900-900=1`; `SessionRuntime.appendLearningSummary.<anonymous@901>@901-901=1`; `SessionRuntime.appendLearningSummary.<anonymous@902>@902-902=1`; `SessionRuntime.appendLearningSummary.<anonymous@905>@905-905=1`; `SessionRuntime.appendLearningSummary.<anonymous@906>@906-906=1`; `SessionRuntime.appendLearningSummary.<anonymous@907>@907-907=1`; `SessionRuntime.appendLearningSummary.<anonymous@908>@908-908=1`; `SessionRuntime.appendLearningSummary.<anonymous@909>@909-909=1`; `SessionRuntime.cancelUnexecutedToolCall@926-967=42`; `SessionRuntime.discardToolRound@969-976=8`; `SessionRuntime.discardToolRound.<anonymous@970>@970-971=2`; `SessionRuntime.discardToolRound.<anonymous@974>@974-974=1`; `SessionRuntime.restore@978-1067=90`; `SessionRuntime.restore.<anonymous@1022>@1022-1022=1`; `SessionRuntime.restore.<anonymous@1022>@1022-1022=1`; `SessionRuntime.restore.<anonymous@1054>@1054-1054=1`; `SessionRuntime.restore.<anonymous@1054>@1054-1054=1`; `SessionRuntime.restore.<anonymous@1055>@1055-1055=1`; `SessionRuntime.restore.<anonymous@1056>@1056-1056=1`; `SessionRuntime.restore.<anonymous@1058>@1058-1060=3`; `SessionRuntime.restore.<anonymous@1063>@1063-1063=1`; `SessionRuntime.close@1069-1085=17`; `SessionRuntime.abort@1087-1093=7`; `SessionRuntime.recordError@1095-1106=12`; `SessionRuntime.commitCancellation@1108-1119=12`; `SessionRuntime.recordCancellation@1121-1132=12`; `SessionRuntime.recordTurnCompletion@1134-1145=12`; `SessionRuntime.emit@1147-1156=10`
- Classes: `SessionRuntime@242-1157=916`

</details>

<details><summary>src/core/application/session/session-usage-tracker.ts — 100행, 1 exports, 15 functions, 1 classes</summary>

- Export: SessionUsageTracker
- Outbound: import `../../domain/execution/native-session.js` → `src/core/domain/execution/native-session.ts`; import `../../domain/work/workbench.js` → `src/core/domain/work/workbench.ts`; import `./session-model-usage.js` → `src/core/application/session/session-model-usage.ts`
- Function-like symbols: `SessionUsageTracker.<anonymous@17>@17-17=1`; `SessionUsageTracker.contextUsage@18-18=1`; `SessionUsageTracker.hasTurn@19-19=1`; `SessionUsageTracker.modelFor@20-20=1`; `SessionUsageTracker.observe@22-36=15`; `SessionUsageTracker.bindTurn@38-45=8`; `SessionUsageTracker.snapshot@47-74=28`; `SessionUsageTracker.snapshot.<anonymous@61>@61-61=1`; `SessionUsageTracker.snapshot.<anonymous@62>@62-62=1`; `SessionUsageTracker.snapshot.<anonymous@63>@63-63=1`; `SessionUsageTracker.attribute@76-81=6`; `SessionUsageTracker.add@83-89=7`; `projectContextUsage@92-98=7`; `projectThreadTotalTokens@99-99=1`; `record@100-100=1`
- Classes: `SessionUsageTracker@7-90=84`

</details>

<details><summary>src/core/application/work/canonical-promotion.ts — 188행, 11 exports, 11 functions, 1 classes</summary>

- Export: StoredCanonicalDocument, CanonicalWriteResult, CanonicalDocumentStore, AcceptedCanonicalPromotion, PromotedCanonicalPromotion, StaleCanonicalPromotion, CanonicalPromotionResult, CanonicalPromotionService, createCanonicalDocumentDraft, digestCanonicalDocument, fingerprintCanonicalDocument
- Outbound: import `node:crypto`; import `../../domain/work/canonical-document` → `src/core/domain/work/canonical-document.ts`; import `../../domain/execution/terminal` → `src/core/domain/execution/terminal.ts`
- Function-like symbols: `CanonicalPromotionService.<anonymous@80>@80-80=1`; `CanonicalPromotionService.accept@82-101=20`; `CanonicalPromotionService.promote@103-128=26`; `createCanonicalDocumentDraft@132-146=15`; `digestCanonicalDocument@148-150=3`; `fingerprintCanonicalDocument@152-159=8`; `assertPromotionDraft@161-166=6`; `stale@168-176=9`; `assertStoredDigest@178-180=3`; `isHumanAcceptance@182-184=3`; `isDigest@186-188=3`
- Classes: `CanonicalPromotionService@77-129=53`

</details>

<details><summary>src/core/application/work/local-workflow-service.ts — 78행, 4 exports, 8 functions, 1 classes</summary>

- Export: LocalWorkflowCheck, LocalWorkflowStore, LocalWorkflowResult, LocalWorkflowService
- Outbound: import `../../agents/rpa-agent.js` → `src/core/agents/rpa-agent.ts`; import `../../skills/skill-registry.js` → `src/core/skills/skill-registry.ts`; import `../../workflows/skill-run.js` → `src/core/workflows/skill-run.ts`
- Function-like symbols: `LocalWorkflowService.<anonymous@25>@25-26=2`; `LocalWorkflowService.run@27-35=9`; `LocalWorkflowService.resume@36-58=23`; `LocalWorkflowService.inspect@59-77=19`; `LocalWorkflowService.inspect.<anonymous@63>@63-66=4`; `LocalWorkflowService.inspect.<anonymous@63>@63-67=5`; `LocalWorkflowService.inspect.<anonymous@65>@65-66=2`; `LocalWorkflowService.inspect.<anonymous@76>@76-76=1`
- Classes: `LocalWorkflowService@24-78=55`

</details>

<details><summary>src/core/application/work/planning-service.ts — 37행, 2 exports, 10 functions, 1 classes</summary>

- Export: PlanningCatalogStore, PlanningService
- Outbound: import `../../domain/work/planning.js` → `src/core/domain/work/planning.ts`
- Function-like symbols: `PlanningService.<anonymous@13>@13-13=1`; `PlanningService.current@14-14=1`; `PlanningService.initialize@16-16=1`; `PlanningService.readSnapshot@17-17=1`; `PlanningService.createEpic@18-20=3`; `PlanningService.createStory@21-23=3`; `PlanningService.subscribe@24-28=5`; `PlanningService.subscribe.<anonymous@27>@27-27=1`; `PlanningService.publish@29-33=5`; `PlanningService.notify@34-36=3`
- Classes: `PlanningService@9-37=29`

</details>

<details><summary>src/core/application/work/t-note-service.ts — 90행, 5 exports, 7 functions, 1 classes</summary>

- Export: TNoteDraftStore, CreateTNoteInput, TNoteService, CanonicalTNoteValidation, validateCanonicalTNote
- Outbound: import `node:crypto`; import `../../domain/work/t-notes.js` → `src/core/domain/work/t-notes.ts`; import `../orchestration/detached-text-generator.js` → `src/core/application/orchestration/detached-text-generator.ts`
- Function-like symbols: `TNoteService.<anonymous@28>@28-33=6`; `TNoteService.<anonymous@31>@31-31=1`; `TNoteService.create@35-56=22`; `TNoteService.readAll@58-60=3`; `digest@63-63=1`; `validateCanonicalTNote@71-86=16`; `hasRawEvidence@88-90=3`
- Classes: `TNoteService@27-61=35`

</details>

<details><summary>src/core/application/work/todo-ledger.ts — 498행, 4 exports, 81 functions, 4 classes</summary>

- Export: TodoLedger, TodoWriteConflictError, TodoIdentityCollisionError, TodoNativeSourceError
- Outbound: import `../../domain/execution/session-events` → `src/core/domain/execution/session-events.ts`; import `../../domain/work/todos` → `src/core/domain/work/todos.ts`; import `../../domain/work` → `src/core/domain/work/index.ts`; import `../../ports/index.js` → `src/core/ports/index.ts`; import `../../domain/execution/request-runtime` → `src/core/domain/execution/request-runtime.ts`; import `../../domain/work/request-projections` → `src/core/domain/work/request-projections.ts`
- Function-like symbols: `TodoLedger.<anonymous@25>@25-30=6`; `TodoLedger.<anonymous@29>@29-29=1`; `TodoLedger.snapshot@32-34=3`; `TodoLedger.initialize@36-49=14`; `TodoLedger.initialize.<anonymous@42>@42-47=6`; `TodoLedger.dispose@51-54=4`; `TodoLedger.syncRequestRuntime@56-60=5`; `TodoLedger.syncNativePlan@63-81=19`; `TodoLedger.syncNativePlan.<anonymous@69>@69-71=3`; `TodoLedger.create@83-101=19`; `TodoLedger.create.<anonymous@84>@84-84=1`; `TodoLedger.create.<anonymous@87>@87-87=1`; `TodoLedger.create.<anonymous@91>@91-91=1`; `TodoLedger.create.<anonymous@98>@98-98=1`; `TodoLedger.add@103-125=23`; `TodoLedger.add.<anonymous@107>@107-110=4`; `TodoLedger.add.<anonymous@112>@112-112=1`; `TodoLedger.add.<anonymous@113>@113-116=4`; `TodoLedger.add.<anonymous@118>@118-118=1`; `TodoLedger.addDetails@127-159=33`; `TodoLedger.addDetails.<anonymous@129>@129-129=1`; `TodoLedger.addDetails.<anonymous@133>@133-133=1`; `TodoLedger.addDetails.<anonymous@137>@137-140=4`; `TodoLedger.addDetails.<anonymous@143>@143-156=14`; `TodoLedger.addDetails.<anonymous@148>@148-153=6`; `TodoLedger.start@161-172=12`; `TodoLedger.start.<anonymous@162>@162-171=10`; `TodoLedger.start.<anonymous@166>@166-166=1`; `TodoLedger.start.<anonymous@166>@166-166=1`; `TodoLedger.start.<anonymous@169>@169-169=1`; `TodoLedger.complete@174-184=11`; `TodoLedger.complete.<anonymous@175>@175-183=9`; `TodoLedger.complete.<anonymous@180>@180-180=1`; `TodoLedger.block@186-193=8`; `TodoLedger.block.<anonymous@187>@187-192=6`; `TodoLedger.block.<anonymous@191>@191-191=1`; `TodoLedger.reopen@195-200=6`; `TodoLedger.reopen.<anonymous@196>@196-199=4`; `TodoLedger.recordEvidence@202-222=21`; `TodoLedger.recordEvidence.<anonymous@206>@206-206=1`; `TodoLedger.recordEvidence.<anonymous@211>@211-211=1`; `TodoLedger.recordEvidence.<anonymous@217>@217-219=3`; `TodoLedger.recordEvidence.<anonymous@218>@218-218=1`; `TodoLedger.subscribe@224-227=4`; `TodoLedger.subscribe.<anonymous@226>@226-226=1`; `TodoLedger.transition@229-248=20`; `TodoLedger.transition.<anonymous@232>@232-232=1`; `TodoLedger.transition.<anonymous@235>@235-235=1`; `TodoLedger.transition.<anonymous@237>@237-237=1`; `TodoLedger.transition.<anonymous@237>@237-237=1`; `TodoLedger.transition.<anonymous@238>@238-238=1`; `TodoLedger.transition.<anonymous@243>@243-246=4`; `TodoLedger.transition.<anonymous@245>@245-245=1`; `TodoLedger.commit@250-271=22`; `TodoLedger.document@273-280=8`; `TodoLedger.requireCurrent@282-285=4`; `TodoLedger.emit@287-291=5`; `TodoWriteConflictError.<anonymous@295>@295-302=8`; `TodoIdentityCollisionError.<anonymous@306>@306-311=6`; `TodoNativeSourceError.<anonymous@317>@317-320=4`; `todoUpdatedEvent@323-332=10`; `isId@334-336=3`; `escapeRegExp@338-340=3`; `isTodoParent@342-344=3`; `nativeTodoItem@346-363=18`; `nativeTodoSource@365-381=17`; `reusableNativeBinding@383-389=7`; `canApplyNativeSource@391-399=9`; `validateNativePlanSource@401-403=3`; `isNativePlanSource@405-421=17`; `isRecord@423-425=3`; `isSha256Hex@427-429=3`; `isOpaqueNativeId@431-433=3`; `validateNativeTodoIds@435-451=17`; `nativeTodoParentId@453-455=3`; `todoStatus@457-462=6`; `validEvidenceIds@464-466=3`; `todoNarrationText@470-474=5`; `isTechnicalInput@476-483=8`; `sameTodoContent@485-494=10`; `immutableSnapshot@496-498=3`
- Classes: `TodoLedger@20-292=273`; `TodoWriteConflictError@294-303=10`; `TodoIdentityCollisionError@305-312=8`; `TodoNativeSourceError@314-321=8`

</details>

<details><summary>src/core/commit/commit-governance.ts — 131행, 12 exports, 14 functions, 1 classes</summary>

- Export: CommitType, CommitState, CommitDecision, AxisResult, CommitAxis, CommitValidation, CommitCandidate, CommitPolicy, canonicalJson, sha256, candidateDigest, CommitControlPlane
- Outbound: import `node:crypto`
- Function-like symbols: `canonicalJson@57-61=5`; `canonicalJson.<anonymous@59>@59-59=1`; `canonicalJson.<anonymous@59>@59-59=1`; `sha256@62-62=1`; `candidateDigest@63-63=1`; `clean@65-67=3`; `CommitControlPlane.<anonymous@72>@72-72=1`; `CommitControlPlane.validate@74-108=35`; `CommitControlPlane.validate.<anonymous@84>@84-84=1`; `CommitControlPlane.subject@110-115=6`; `CommitControlPlane.bodyRequired@117-119=3`; `CommitControlPlane.render@121-130=10`; `CommitControlPlane.render.<anonymous@125>@125-125=1`; `CommitControlPlane.render.<anonymous@127>@127-127=1`
- Classes: `CommitControlPlane@71-131=61`

</details>

<details><summary>src/core/domain/development/artifact-control.ts — 173행, 8 exports, 21 functions, 0 classes</summary>

- Export: ARTIFACT_KINDS, ArtifactKind, ArtifactValidation, ArtifactCandidate, canonicalArtifactJson, artifactCandidateDigest, validateArtifactCandidate, renderArtifactCandidate
- Outbound: import `node:crypto`; import `yaml`; import `./obsidian-contract.js` → `src/core/domain/development/obsidian-contract.ts`; import `./rpa-description.js` → `src/core/domain/development/rpa-description.ts`
- Function-like symbols: `canonicalArtifactJson@33-37=5`; `canonicalArtifactJson.<anonymous@35>@35-35=1`; `canonicalArtifactJson.<anonymous@35>@35-35=1`; `artifactCandidateDigest@39-42=4`; `line@44-44=1`; `text@45-45=1`; `lines@46-46=1`; `object@47-47=1`; `keysExactly@48-48=1`; `validateArtifactCandidate@50-133=84`; `validateArtifactCandidate.<anonymous@82>@82-82=1`; `validateArtifactCandidate.<anonymous@100>@100-100=1`; `validateArtifactCandidate.<anonymous@104>@104-104=1`; `validateArtifactCandidate.<anonymous@123>@123-123=1`; `<anonymous@135>@135-135=1`; `bullets@135-135=1`; `renderArtifactCandidate@137-161=25`; `renderArtifactCandidate.<anonymous@160>@160-160=1`; `projectActivityTypeLabel@163-165=3`; `projectActivityCategoryLabel@167-169=3`; `projectActivityStateLabel@171-173=3`
- Classes: 없음

</details>

<details><summary>src/core/domain/development/development-map.ts — 51행, 7 exports, 0 functions, 0 classes</summary>

- Export: DevelopmentMapStory, DevelopmentMapRelation, DevelopmentMapRelations, DevelopmentMapEpic, DevelopmentMapInitiative, DevelopmentMapSnapshot, EMPTY_DEVELOPMENT_MAP
- Outbound: 없음
- Function-like symbols: 없음
- Classes: 없음

</details>

<details><summary>src/core/domain/development/development-records.ts — 20행, 9 exports, 0 functions, 0 classes</summary>

- Export: DevelopmentUnit, DevelopmentIssue, DevelopmentBinding, DevelopmentRecord, DevelopmentBindingAttribution, DevelopmentTest, CaptureDevelopmentRecordInput, RecordDevelopmentTestInput, DevelopmentContext
- Outbound: import `../work/traceability.js` → `src/core/domain/work/traceability.ts`
- Function-like symbols: 없음
- Classes: 없음

</details>

<details><summary>src/core/domain/development/development-traceability.ts — 79행, 20 exports, 15 functions, 0 classes</summary>

- Export: TraceEntityKind, TraceabilityRef, TraceRef, TraceabilityRelation, TraceabilityEntity, TraceabilityEdge, TraceabilityLedgerV3, TraceabilityLedger, RegistryEnvelope, AcceptanceContract, SpecContract, TestContract, ExceptionContract, DecisionContract, EvidenceArtifact, VerificationReceipt, entityRefs, canonicalTraceabilityKind, canonicalTraceabilityRef, deriveVerificationVerdict
- Outbound: 없음
- Function-like symbols: `entityRefs@60-60=1`; `entityRefs.<anonymous@60>@60-60=1`; `canonicalTraceabilityKind@61-63=3`; `canonicalTraceabilityRef@64-67=4`; `deriveVerificationVerdict@68-79=12`; `deriveVerificationVerdict.<anonymous@69>@69-69=1`; `deriveVerificationVerdict.<anonymous@71>@71-71=1`; `deriveVerificationVerdict.<anonymous@73>@73-73=1`; `deriveVerificationVerdict.<anonymous@73>@73-73=1`; `deriveVerificationVerdict.<anonymous@75>@75-75=1`; `deriveVerificationVerdict.<anonymous@75>@75-75=1`; `deriveVerificationVerdict.<anonymous@75>@75-75=1`; `deriveVerificationVerdict.<anonymous@76>@76-76=1`; `deriveVerificationVerdict.<anonymous@77>@77-77=1`; `deriveVerificationVerdict.<anonymous@78>@78-78=1`
- Classes: 없음

</details>

<details><summary>src/core/domain/development/obsidian-contract.ts — 200행, 12 exports, 24 functions, 0 classes</summary>

- Export: OBSIDIAN_SCHEMA_VERSION, OBSIDIAN_SECTIONS, ObsidianDocumentStatus, ObsidianAcceptanceStatus, ObsidianCanonicalProperties, ObsidianContractCode, ObsidianContractIssue, ObsidianDocumentInput, ObsidianDocumentContract, canonicalObsidianPath, obsidianWikiTarget, validateObsidianDocument
- Outbound: 없음
- Function-like symbols: `withoutFencedCode@95-107=13`; `withoutFencedCode.<anonymous@97>@97-106=10`; `withoutInlineCode@109-123=15`; `withoutInlineCode.<anonymous@110>@110-122=13`; `hasEmptyTableCell@125-132=8`; `hasEmptyTableCell.<anonymous@126>@126-131=6`; `hasEmptyTableCell.<anonymous@129>@129-129=1`; `hasEmptyTableCell.<anonymous@130>@130-130=1`; `issue@134-136=3`; `isStringArray@138-140=3`; `isStringArray.<anonymous@139>@139-139=1`; `portablePath@142-142=1`; `canonicalObsidianPath@144-147=4`; `canonicalObsidianPath.<anonymous@145>@145-145=1`; `obsidianWikiTarget@149-152=4`; `validateObsidianDocument@154-200=47`; `validateObsidianDocument.stringValue@161-161=1`; `validateObsidianDocument.<anonymous@174>@174-174=1`; `validateObsidianDocument.<anonymous@175>@175-175=1`; `validateObsidianDocument.<anonymous@176>@176-176=1`; `validateObsidianDocument.<anonymous@182>@182-182=1`; `validateObsidianDocument.<anonymous@183>@183-183=1`; `validateObsidianDocument.<anonymous@193>@193-193=1`; `validateObsidianDocument.<anonymous@198>@198-198=1`
- Classes: 없음

</details>

<details><summary>src/core/domain/development/repository.ts — 40행, 6 exports, 0 functions, 0 classes</summary>

- Export: ChangedFileKind, ChangedFile, CommitSummary, IssueState, IssueSummary, RepositorySnapshot
- Outbound: 없음
- Function-like symbols: 없음
- Classes: 없음

</details>

<details><summary>src/core/domain/development/rpa-description.ts — 384행, 12 exports, 64 functions, 0 classes</summary>

- Export: RpaDescriptionMap, RpaProject, RpaTask, RpaUnit, RpaStep, RpaException, RpaTestKind, RpaTestStatus, RpaTest, validateRpaDescriptionMap, renderRpaProject, renderRpaTask
- Outbound: 없음
- Function-like symbols: `validateRpaDescriptionMap@92-120=29`; `validateRpaDescriptionMap.<anonymous@104>@104-118=15`; `validateRpaDescriptionMap.<anonymous@109>@109-111=3`; `validateRpaDescriptionMap.<anonymous@112>@112-114=3`; `validateRpaDescriptionMap.<anonymous@115>@115-117=3`; `validateProject@122-141=20`; `validateProject.<anonymous@128>@128-128=1`; `validateTask@143-189=47`; `validateTask.<anonymous@152>@152-160=9`; `validateTask.<anonymous@158>@158-158=1`; `validateTask.<anonymous@164>@164-169=6`; `validateTask.<anonymous@171>@171-188=18`; `validateTask.<anonymous@178>@178-187=10`; `validateTask.<anonymous@183>@183-183=1`; `validateUnit@191-230=40`; `validateUnit.<anonymous@196>@196-201=6`; `validateUnit.<anonymous@203>@203-210=8`; `validateUnit.<anonymous@214>@214-229=16`; `validateUnit.<anonymous@222>@222-228=7`; `validateStep@232-240=9`; `validateStep.<anonymous@239>@239-239=1`; `validateException@242-247=6`; `validateException.<anonymous@246>@246-246=1`; `validateTest@249-259=11`; `validateUnitStepReference@261-268=8`; `renderRpaProject@270-286=17`; `renderRpaProject.<anonymous@281>@281-281=1`; `renderRpaTask@288-316=29`; `renderRpaTask.<anonymous@290>@290-290=1`; `renderRpaTask.<anonymous@293>@293-293=1`; `renderRpaTask.<anonymous@294>@294-294=1`; `renderRpaTask.<anonymous@295>@295-295=1`; `renderRpaTask.<anonymous@300>@300-300=1`; `renderRpaTask.<anonymous@302>@302-302=1`; `renderRpaTask.<anonymous@304>@304-304=1`; `renderRpaTask.<anonymous@310>@310-310=1`; `renderRpaTask.<anonymous@311>@311-311=1`; `renderRpaTask.<anonymous@312>@312-312=1`; `countSteps@318-318=1`; `countSteps.<anonymous@318>@318-318=1`; `sorted@319-319=1`; `sorted.<anonymous@319>@319-319=1`; `compareReferences@320-322=3`; `raw@325-325=1`; `table@326-328=3`; `table.<anonymous@327>@327-327=1`; `table.<anonymous@327>@327-327=1`; `markdownCell@329-332=4`; `safeHeading@333-333=1`; `escapeMarkdown@334-336=3`; `linearLink@337-337=1`; `codepointCompare@338-338=1`; `assertValid@339-342=4`; `isObject@344-344=1`; `objectWithKeys@345-351=7`; `stringValue@352-356=5`; `nullableString@357-357=1`; `positiveInteger@358-361=4`; `arrayValue@362-366=5`; `uniqueString@367-371=5`; `uniqueSequence@372-376=5`; `dateValue@377-377=1`; `isValidDateString@378-383=6`; `isHttpUrl@384-384=1`
- Classes: 없음

</details>

<details><summary>src/core/domain/development/work-recording-gate.ts — 53행, 5 exports, 6 functions, 0 classes</summary>

- Export: WorkRecordingSnapshot, WorkRecordingGateDecision, isWorkRecordingPath, changedWorkRecordingPaths, evaluateWorkRecordingGate
- Outbound: 없음
- Function-like symbols: `isWorkRecordingPath@15-18=4`; `isWorkRecordingPath.<anonymous@17>@17-17=1`; `changedWorkRecordingPaths@20-28=9`; `changedWorkRecordingPaths.<anonymous@26>@26-26=1`; `changedWorkRecordingPaths.<anonymous@27>@27-27=1`; `evaluateWorkRecordingGate@30-53=24`
- Classes: 없음

</details>

<details><summary>src/core/domain/execution/execution-run-contract.ts — 127행, 18 exports, 0 functions, 0 classes</summary>

- Export: ExecutionRunId, RuntimeEventKind, RuntimeEventDurability, ExecutionRunPhase, CompletionReceiptStatus, WaitReason, ExecutionHash, RuntimeEvent, ExecutionEvidence, ExecutionTask, ExecutionActivity, CompletionReceipt, CompletionChange, CompletionVerification, CompletionRemaining, ExecutionCheckpoint, ExecutionRunState, ExecutionRunReduction
- Outbound: import `./project-activity.js` → `src/core/domain/execution/project-activity.ts`
- Function-like symbols: 없음
- Classes: 없음

</details>

<details><summary>src/core/domain/execution/model-settings.ts — 69행, 15 exports, 9 functions, 0 classes</summary>

- Export: PROVIDERS, MODELS, Effort, EFFORTS, CODEX_EFFORTS, Provider, NativeModelOption, NativeModelCatalog, nativeModelNames, nativeModelEfforts, fallbackNativeModelCatalog, modelEfforts, WwwSettings, DEFAULT_SETTINGS, normalizeSettings
- Outbound: 없음
- Function-like symbols: `nativeModelNames@29-31=3`; `nativeModelNames.<anonymous@30>@30-30=1`; `nativeModelEfforts@32-34=3`; `nativeModelEfforts.<anonymous@33>@33-33=1`; `fallbackNativeModelCatalog@35-37=3`; `fallbackNativeModelCatalog.<anonymous@36>@36-36=1`; `modelEfforts@40-46=7`; `modelEfforts.<anonymous@43>@43-43=1`; `normalizeSettings@60-69=10`
- Classes: 없음

</details>

<details><summary>src/core/domain/execution/native-session.ts — 260행, 32 exports, 6 functions, 0 classes</summary>

- Export: NativeRequestId, BackgroundWorkState, NativeCollaborationLifecycle, projectBackgroundWorkState, NativeRefs, NativeApprovalPolicy, NativeSandboxMode, NativeSandboxPolicy, NativeCollaborationMode, NativeAdditionalContextKind, NativeAdditionalContextEntry, NativeAdditionalContext, NativeThreadSnapshot, NativeTurnSnapshot, NativeThreadStart, NativeThreadResume, NativeThreadRead, NativeThreadList, NativeThreadCompact, NativeThreadStatus, NativeThreadSummary, NativeTurnStart, NativeTurnInterrupt, NativeTurnSteer, NativeTurnSteerResult, NativeApprovalKind, NativeApprovalDecision, NativeApprovalRequest, NativeApprovalResponse, NativeApprovalResolution, NativeHarnessEvent, NativeUncertainOperation
- Outbound: 없음
- Function-like symbols: `projectBackgroundWorkState@22-54=33`; `nativeLifecycleRecord@56-60=5`; `nativeLifecycleIds@62-66=5`; `nativeLifecycleIds.<anonymous@64>@64-64=1`; `normalizeNativeLifecycleName@68-70=3`; `terminalLifecycleStatus@72-76=5`
- Classes: 없음

</details>

<details><summary>src/core/domain/execution/output.ts — 54행, 7 exports, 0 functions, 0 classes</summary>

- Export: CommandStatus, CommandResultSnapshot, GenericToolResultSnapshot, DiffResultSnapshot, ToolResultSnapshot, CompletionSection, CompletionReport
- Outbound: 없음
- Function-like symbols: 없음
- Classes: 없음

</details>

<details><summary>src/core/domain/execution/project-activity.ts — 88행, 10 exports, 4 functions, 0 classes</summary>

- Export: PROJECT_ACTIVITY_KINDS, PROJECT_ACTIVITY_PHASES, ProjectActivityKind, ProjectActivityPhase, ProjectActivityNativeRefs, ProjectActivity, ProjectActivityInput, ProjectActivityAppendResult, isTerminalActivityPhase, isReasoningActivityPayload
- Outbound: 없음
- Function-like symbols: `isTerminalActivityPhase@47-49=3`; `isReasoningActivityPayload@52-56=5`; `isReasoningActivityPayload.<anonymous@55>@55-55=1`; `containsReasoningEnvelope@58-88=31`
- Classes: 없음

</details>

<details><summary>src/core/domain/execution/request-runtime.ts — 143행, 14 exports, 7 functions, 0 classes</summary>

- Export: REQUEST_STAGES, RequestStageId, RequestStageStatus, REQUEST_TEST_KINDS, RequestTestKind, RequestDecision, RequestEvidence, RequestDelivery, RequestStage, RequestLifecycleEvent, RequestRuntimeRecord, RequestStageReport, REQUEST_REPORT_PREFIX, parseRequestStageReport
- Outbound: import `./project-activity` → `src/core/domain/execution/project-activity.ts`
- Function-like symbols: `object@110-110=1`; `text@111-111=1`; `strings@112-112=1`; `<anonymous@113>@113-113=1`; `only@113-113=1`; `parseRequestStageReport@116-143=28`; `parseRequestStageReport.<anonymous@140>@140-140=1`
- Classes: 없음

</details>

<details><summary>src/core/domain/execution/session-events.ts — 69행, 8 exports, 0 functions, 0 classes</summary>

- Export: SESSION_EVENT_CATEGORIES, SESSION_EVENT_STATUSES, SessionEventCategory, SessionEventStatus, SESSION_EVENT_TYPES, SessionEventType, SessionEvent, SessionEventInput
- Outbound: 없음
- Function-like symbols: 없음
- Classes: 없음

</details>

<details><summary>src/core/domain/execution/terminal.ts — 127행, 6 exports, 8 functions, 0 classes</summary>

- Export: TerminalCommandUpdate, TerminalCommandResult, TerminalTextExcerptMode, sanitizeTerminalTextUnbounded, sanitizeTerminalTextExcerpt, sanitizeTerminalText
- Outbound: 없음
- Function-like symbols: `codePointLength@18-25=8`; `takeHeadCodePoints@27-37=11`; `takeTailCodePoints@39-53=15`; `discardCutTailToken@55-57=3`; `redactTerminalSecrets@59-71=13`; `sanitizeTerminalTextUnbounded@74-83=10`; `sanitizeTerminalTextExcerpt@91-122=32`; `sanitizeTerminalText@125-127=3`
- Classes: 없음

</details>

<details><summary>src/core/domain/execution/workbench-config.ts — 122행, 4 exports, 10 functions, 0 classes</summary>

- Export: WorkbenchConfig, DEFAULT_WORKBENCH_CONFIG, normalizeWorkbenchConfig, isSupportedWorkbenchConfigDocument
- Outbound: import `./model-settings.js` → `src/core/domain/execution/model-settings.ts`; import `./native-session.js` → `src/core/domain/execution/native-session.ts`
- Function-like symbols: `normalizeWorkbenchConfig@61-96=36`; `normalizeWorkbenchConfig.<anonymous@63>@63-63=1`; `isSupportedWorkbenchConfigDocument@98-101=4`; `isSupportedWorkbenchConfigDocument.<anonymous@100>@100-100=1`; `positiveInt@102-102=1`; `boundedInt@103-103=1`; `record@104-104=1`; `validReviewModel@107-112=6`; `validTNoteModel@114-117=4`; `validLinearConfig@119-122=4`
- Classes: 없음

</details>

<details><summary>src/core/domain/observability/monitoring.ts — 42행, 3 exports, 0 functions, 0 classes</summary>

- Export: MonitoringPhase, MonitoringTool, MonitoringSnapshot
- Outbound: import `../execution/output` → `src/core/domain/execution/output.ts`
- Function-like symbols: 없음
- Classes: 없음

</details>

<details><summary>src/core/domain/observability/observability-dashboard.ts — 149행, 13 exports, 31 functions, 0 classes</summary>

- Export: OBSERVABILITY_RECENT_SESSION_LIMIT, OBSERVABILITY_TREND_BUCKET_LIMIT, ObservabilityCoverageState, ObservabilitySessionBoundary, ObservabilitySessionResult, ObservabilityCoverage, ObservabilityActivityStream, ObservabilitySessionSummary, ObservabilityModelUsage, ObservabilityTrendBucket, ObservabilityDashboard, summarizeObservabilityStreams, projectObservabilityDashboard
- Outbound: import `../execution/project-activity.js` → `src/core/domain/execution/project-activity.ts`; import `../work/workbench.js` → `src/core/domain/work/workbench.ts`; import `./observability-metrics.js` → `src/core/domain/observability/observability-metrics.ts`
- Function-like symbols: `summarizeObservabilityStreams@63-65=3`; `summarizeObservabilityStreams.<anonymous@64>@64-64=1`; `projectObservabilityDashboard@68-96=29`; `projectObservabilityDashboard.<anonymous@72>@72-72=1`; `projectObservabilityDashboard.<anonymous@73>@73-73=1`; `projectObservabilityDashboard.<anonymous@74>@74-74=1`; `projectObservabilityDashboard.<anonymous@75>@75-75=1`; `projectObservabilityDashboard.<anonymous@76>@76-76=1`; `projectObservabilityDashboard.<anonymous@77>@77-77=1`; `projectObservabilityDashboard.<anonymous@78>@78-78=1`; `projectObservabilityDashboard.<anonymous@79>@79-79=1`; `projectObservabilityDashboard.<anonymous@79>@79-79=1`; `projectObservabilityDashboard.<anonymous@80>@80-80=1`; `projectObservabilityDashboard.<anonymous@80>@80-80=1`; `projectObservabilityDashboard.<anonymous@83>@83-83=1`; `summarizeStream@98-121=24`; `summarizeStream.<anonymous@99>@99-99=1`; `summarizeStream.<anonymous@100>@100-100=1`; `summarizeStream.<anonymous@100>@100-100=1`; `summarizeStream.<anonymous@102>@102-102=1`; `summarizeStream.<anonymous@103>@103-103=1`; `summarizeStream.<anonymous@117>@117-117=1`; `summarizeStream.<anonymous@118>@118-118=1`; `aggregateUsage@123-131=9`; `aggregateUsage.<anonymous@130>@130-130=1`; `projectTrend@133-145=13`; `projectTrend.<anonymous@143>@143-143=1`; `projectTrend.<anonymous@143>@143-143=1`; `method@147-147=1`; `timestamp@148-148=1`; `round@149-149=1`
- Classes: 없음

</details>

<details><summary>src/core/domain/observability/observability-metrics.ts — 17행, 3 exports, 5 functions, 0 classes</summary>

- Export: observedElapsedMs, observedCompletionPercent, sumAttributedTokens
- Outbound: 없음
- Function-like symbols: `observedElapsedMs@1-6=6`; `observedCompletionPercent@8-11=4`; `sumAttributedTokens@13-17=5`; `sumAttributedTokens.<anonymous@15>@15-15=1`; `sumAttributedTokens.<anonymous@16>@16-16=1`
- Classes: 없음

</details>

<details><summary>src/core/domain/observability/request-test-workspace.ts — 83행, 5 exports, 22 functions, 0 classes</summary>

- Export: RequestTestStatus, RequestTestCheck, RequestTestGroup, RequestTestWorkspace, projectRequestTestWorkspace
- Outbound: import `../execution/project-activity` → `src/core/domain/execution/project-activity.ts`; import `../execution/request-runtime` → `src/core/domain/execution/request-runtime.ts`
- Function-like symbols: `emptyTotals@26-26=1`; `record@27-27=1`; `terminal@28-33=6`; `stageStatus@34-34=1`; `commandOf@35-38=4`; `kindOf@39-47=9`; `testLike@48-51=4`; `projectRequestTestWorkspace@54-83=30`; `projectRequestTestWorkspace.<anonymous@58>@58-58=1`; `projectRequestTestWorkspace.<anonymous@59>@59-59=1`; `projectRequestTestWorkspace.<anonymous@62>@62-62=1`; `projectRequestTestWorkspace.<anonymous@63>@63-66=4`; `projectRequestTestWorkspace.<anonymous@67>@67-67=1`; `projectRequestTestWorkspace.<anonymous@68>@68-68=1`; `projectRequestTestWorkspace.<anonymous@69>@69-69=1`; `projectRequestTestWorkspace.<anonymous@69>@69-69=1`; `projectRequestTestWorkspace.<anonymous@73>@73-73=1`; `projectRequestTestWorkspace.<anonymous@76>@76-76=1`; `projectRequestTestWorkspace.<anonymous@76>@76-76=1`; `projectRequestTestWorkspace.<anonymous@77>@77-77=1`; `projectRequestTestWorkspace.<anonymous@77>@77-77=1`; `projectRequestTestWorkspace.<anonymous@77>@77-77=1`
- Classes: 없음

</details>

<details><summary>src/core/domain/observability/runtime-monitor.ts — 158행, 6 exports, 52 functions, 0 classes</summary>

- Export: RuntimeMonitorState, RuntimeMonitorEventKind, RuntimeMonitorElapsed, RuntimeMonitorEvent, RuntimeMonitorProjection, projectRuntimeMonitor
- Outbound: import `../execution/project-activity.js` → `src/core/domain/execution/project-activity.ts`; import `../work/workbench.js` → `src/core/domain/work/workbench.ts`
- Function-like symbols: `projectRuntimeMonitor@42-84=43`; `projectRuntimeMonitor.<anonymous@43>@43-43=1`; `projectRuntimeMonitor.<anonymous@47>@47-47=1`; `projectRuntimeMonitor.<anonymous@48>@48-48=1`; `projectRuntimeMonitor.<anonymous@49>@49-49=1`; `projectRuntimeMonitor.<anonymous@50>@50-50=1`; `projectRuntimeMonitor.<anonymous@52>@52-52=1`; `projectRuntimeMonitor.<anonymous@69>@69-69=1`; `semanticEvent@86-89=4`; `eventKind@90-103=14`; `eventLabel@104-111=8`; `latestActive@112-120=9`; `latest@121-121=1`; `later@122-122=1`; `method@123-123=1`; `item@124-124=1`; `record@125-125=1`; `stringValue@126-126=1`; `itemIdentity@127-127=1`; `requestIdentity@128-128=1`; `isRequest@129-129=1`; `isRequestStart@130-130=1`; `isRequestTerminal@131-131=1`; `isExecution@132-132=1`; `isExecutionStart@133-133=1`; `isExecutionTerminal@134-134=1`; `isCompletion@135-135=1`; `isAgent@136-136=1`; `isAgentStart@137-137=1`; `isAgentTerminal@138-138=1`; `isTool@139-139=1`; `isToolStart@140-140=1`; `isToolTerminal@141-141=1`; `isApproval@142-142=1`; `isWait@143-143=1`; `isWaitStart@144-144=1`; `isWaitTerminal@145-145=1`; `isRetry@146-146=1`; `isCompaction@147-147=1`; `isOutput@148-148=1`; `isSkillRun@149-149=1`; `isFailure@150-150=1`; `approvalResolvedAfter@151-151=1`; `approvalResolvedAfter.<anonymous@151>@151-151=1`; `requestLabel@152-152=1`; `toolLabel@153-153=1`; `line@154-154=1`; `elapsedFrom@155-155=1`; `modelFor@156-156=1`; `agentFor@157-157=1`; `unique@158-158=1`; `unique.<anonymous@158>@158-158=1`
- Classes: 없음

</details>

<details><summary>src/core/domain/observability/session-stats.ts — 517행, 14 exports, 81 functions, 0 classes</summary>

- Export: SessionReviewState, ObservationCoverage, ClaimAuthority, ModelUsageNamespace, RequestLifecycle, Claim, LifecycleSummary, Performance, ModelUsageRow, RequestReview, Issue, Diagnostics, SessionStatsSnapshot, projectSessionStats
- Outbound: import `../execution/project-activity.js` → `src/core/domain/execution/project-activity.ts`; import `../work/workbench.js` → `src/core/domain/work/workbench.ts`; import `./observability-metrics.js` → `src/core/domain/observability/observability-metrics.ts`
- Function-like symbols: `projectSessionStats@120-235=116`; `projectSessionStats.<anonymous@121>@121-121=1`; `projectSessionStats.<anonymous@124>@124-124=1`; `projectSessionStats.<anonymous@128>@128-128=1`; `projectSessionStats.<anonymous@129>@129-129=1`; `projectSessionStats.<anonymous@132>@132-132=1`; `projectSessionStats.<anonymous@133>@133-133=1`; `projectSessionStats.<anonymous@134>@134-134=1`; `projectSessionStats.<anonymous@157>@157-157=1`; `projectSessionStats.<anonymous@161>@161-161=1`; `projectSessionStats.<anonymous@162>@162-162=1`; `projectSessionStats.<anonymous@163>@163-163=1`; `projectSessionStats.<anonymous@164>@164-164=1`; `projectSessionStats.<anonymous@179>@179-179=1`; `projectSessionStats.<anonymous@188>@188-188=1`; `projectRootTurns@247-273=27`; `projectRootTurns.<anonymous@255>@255-272=18`; `projectRootTurns.<anonymous@259>@259-259=1`; `projectRootTurns.<anonymous@270>@270-270=1`; `sessionReviewState@275-285=11`; `sessionReviewState.<anonymous@280>@280-280=1`; `sessionReviewState.<anonymous@281>@281-281=1`; `sessionReviewState.<anonymous@282>@282-282=1`; `sessionReviewState.<anonymous@283>@283-283=1`; `projectRequests@287-329=43`; `projectRequests.<anonymous@297>@297-297=1`; `projectRequests.<anonymous@297>@297-297=1`; `projectRequests.<anonymous@298>@298-328=31`; `projectRequests.<anonymous@299>@299-299=1`; `projectRequests.<anonymous@300>@300-300=1`; `projectRequests.<anonymous@301>@301-301=1`; `projectRequests.<anonymous@303>@303-303=1`; `projectRequests.<anonymous@304>@304-304=1`; `projectRequests.<anonymous@305>@305-308=4`; `projectRequests.<anonymous@323>@323-323=1`; `shortlist@331-340=10`; `shortlist.add@333-335=3`; `shortlist.<anonymous@334>@334-334=1`; `shortlist.<anonymous@336>@336-336=1`; `shortlist.<anonymous@337>@337-337=1`; `shortlist.<anonymous@339>@339-339=1`; `retainedRequestDetails@342-349=8`; `retainedRequestDetails.<anonymous@346>@346-346=1`; `retainedRequestDetails.<anonymous@348>@348-348=1`; `projectIssue@351-356=6`; `projectIssue.<anonymous@353>@353-353=1`; `projectUsage@358-386=29`; `observationCoverage@388-396=9`; `observationCoverage.<anonymous@393>@393-393=1`; `observationCoverage.<anonymous@394>@394-394=1`; `pairedDurations@398-412=15`; `pairedApprovalDurations@414-427=14`; `method@429-431=3`; `requestId@433-436=4`; `isTurnStarted@438-440=3`; `isTurnTerminal@442-444=3`; `rootTurnTerminalStatus@446-463=18`; `isRequestTerminal@465-467=3`; `requestLifecycle@469-471=3`; `isTool@473-477=5`; `isRetry@479-481=3`; `isWait@483-486=4`; `isCompaction@488-490=3`; `isFailure@491-505=15`; `textValue@506-506=1`; `failureSummary@507-507=1`; `noteResult@508-508=1`; `noteResult.<anonymous@508>@508-508=1`; `claim@509-509=1`; `bound@510-510=1`; `record@511-511=1`; `normalizeStatus@512-512=1`; `average@513-513=1`; `average.<anonymous@513>@513-513=1`; `sum@514-514=1`; `sum.<anonymous@514>@514-514=1`; `round@515-515=1`; `countOperationIds@516-516=1`; `countOperationIds.<anonymous@516>@516-516=1`; `countActivities@517-517=1`; `countActivities.<anonymous@517>@517-517=1`
- Classes: 없음

</details>

<details><summary>src/core/domain/review/redaction.ts — 218행, 7 exports, 9 functions, 0 classes</summary>

- Export: ReviewSensitiveKind, ReviewRedactionFinding, ReviewRedactionResult, sanitizeCompletedAssistantResponse, sanitizePartialAssistantResponse, redactForExternalReview, assertExternalReviewSafe
- Outbound: 없음
- Function-like symbols: `sanitizeCompletedAssistantResponse@48-96=49`; `sanitizePartialAssistantResponse@104-171=68`; `sanitizePartialAssistantResponse.projectedAnswer@111-111=1`; `redactForExternalReview@178-189=12`; `redactForExternalReview.<anonymous@187>@187-187=1`; `assertExternalReviewSafe@192-195=4`; `redact@197-212=16`; `redact.<anonymous@205>@205-209=5`; `stripControls@214-218=5`
- Classes: 없음

</details>

<details><summary>src/core/domain/review/review.ts — 165행, 18 exports, 8 functions, 0 classes</summary>

- Export: REVIEW_PACKET_VERSION, ReviewProvider, ReviewSensitivity, ClassifiedReviewText, ReviewPacketInput, ReviewPacket, ReviewPacketPreview, ReviewDigester, ReviewGenerationRequest, ReviewGenerationClient, ReviewAdapter, ReviewDelivery, ReviewUsage, ReviewProvenance, createReviewPacket, verifyReviewPacket, reviewPacketInput, stableJson
- Outbound: import `./redaction` → `src/core/domain/review/redaction.ts`
- Function-like symbols: `createReviewPacket@94-111=18`; `verifyReviewPacket@113-129=17`; `reviewPacketInput@131-140=10`; `stableJson@142-147=6`; `stableJson.<anonymous@146>@146-146=1`; `publicProjection@149-153=5`; `isDigest@155-157=3`; `deepFreeze@159-165=7`
- Classes: 없음

</details>

<details><summary>src/core/domain/work/activity-classification.ts — 63행, 2 exports, 5 functions, 0 classes</summary>

- Export: WorkActivityClass, classifyWorkActivity
- Outbound: import `../execution/project-activity.js` → `src/core/domain/execution/project-activity.ts`
- Function-like symbols: `classifyWorkActivity@5-28=24`; `isReadOnlyShell@30-57=28`; `isReadOnlyShell.<anonymous@45>@45-45=1`; `isReadOnlyShell.<anonymous@48>@48-55=8`; `record@59-63=5`
- Classes: 없음

</details>

<details><summary>src/core/domain/work/canonical-document.ts — 116행, 13 exports, 10 functions, 0 classes</summary>

- Export: CANONICAL_DOCUMENT_SCHEMA_VERSION, CANONICAL_DOCUMENT_KINDS, CanonicalDocumentKind, CanonicalDocumentTarget, CanonicalDocumentSource, CanonicalDocumentProvenance, CanonicalDocumentRedaction, CanonicalDocumentDraft, CanonicalDocumentDraftInput, targetForCanonicalDocument, assertCanonicalDocumentDraft, canonicalMarkdownDiff, isCanonicalDocumentTarget
- Outbound: 없음
- Function-like symbols: `targetForCanonicalDocument@50-54=5`; `assertCanonicalDocumentDraft@57-74=18`; `canonicalMarkdownDiff@77-94=18`; `canonicalMarkdownDiff.<anonymous@91>@91-91=1`; `canonicalMarkdownDiff.<anonymous@92>@92-92=1`; `isCanonicalDocumentTarget@96-98=3`; `isCanonicalTargetFor@100-104=5`; `isDigest@106-108=3`; `isIdentifier@110-112=3`; `isIsoDate@114-116=3`
- Classes: 없음

</details>

<details><summary>src/core/domain/work/delegation.ts — 90행, 5 exports, 30 functions, 0 classes</summary>

- Export: NativeDelegationStatus, NativeDelegationActivity, NativeDelegatedTask, NativeDelegationProjection, projectNativeDelegation
- Outbound: import `../execution/project-activity.js` → `src/core/domain/execution/project-activity.ts`
- Function-like symbols: `projectNativeDelegation@10-74=65`; `projectNativeDelegation.<anonymous@11>@11-11=1`; `projectNativeDelegation.create@14-19=6`; `projectNativeDelegation.<anonymous@38>@38-38=1`; `projectNativeDelegation.<anonymous@59>@59-59=1`; `projectNativeDelegation.<anonymous@68>@68-73=6`; `projectNativeDelegation.<anonymous@69>@69-69=1`; `projectNativeDelegation.<anonymous@72>@72-72=1`; `projectNativeDelegation.<anonymous@72>@72-72=1`; `projectNativeDelegation.<anonymous@72>@72-72=1`; `projectNativeDelegation.<anonymous@72>@72-72=1`; `enrichSpawn@76-76=1`; `updateState@77-77=1`; `descendant@78-78=1`; `descendant.<anonymous@78>@78-78=1`; `parentRef@79-79=1`; `parentRef.<anonymous@79>@79-79=1`; `publicChildObservation@80-80=1`; `observation@81-81=1`; `lifecycle@82-82=1`; `activitySequence@83-83=1`; `activitySequence.<anonymous@83>@83-83=1`; `role@84-84=1`; `receiversFor@85-85=1`; `norm@86-86=1`; `txt@87-87=1`; `first@88-88=1`; `strings@89-89=1`; `strings.<anonymous@89>@89-89=1`; `rec@90-90=1`
- Classes: 없음

</details>

<details><summary>src/core/domain/work/index.ts — 28행, 20 exports, 0 functions, 0 classes</summary>

- Export: WORK_REFERENCE_KINDS, isRepositoryPathReference, parseWorkTraceabilityManifest, referenceKey, relatedWorkReferences, LinearIssueReference, WorkReference, WorkReferenceKind, WorkTraceabilityLink, WorkTraceabilityManifest, validateWorkTraceabilityManifest, WorkTraceabilityPathProbe, classifyWorkActivity, WorkActivityClass, projectNativeDelegation, NativeDelegatedTask, NativeDelegationActivity, NativeDelegationProjection, NativeDelegationStatus, *
- Outbound: re-export `./traceability.js` → `src/core/domain/work/traceability.ts`; re-export `./traceability-validator.js` → `src/core/domain/work/traceability-validator.ts`; re-export `./activity-classification.js` → `src/core/domain/work/activity-classification.ts`; re-export `./delegation.js` → `src/core/domain/work/delegation.ts`; re-export `./workflow-projection.js` → `src/core/domain/work/workflow-projection.ts`
- Function-like symbols: 없음
- Classes: 없음

</details>

<details><summary>src/core/domain/work/linear-dashboard.ts — 30행, 6 exports, 0 functions, 0 classes</summary>

- Export: LinearDashboardState, LinearDashboardIssue, LinearDashboardUpdate, LinearDashboardMilestone, LinearProjectDashboard, EMPTY_LINEAR_PROJECT_DASHBOARD
- Outbound: 없음
- Function-like symbols: 없음
- Classes: 없음

</details>

<details><summary>src/core/domain/work/narration.ts — 84행, 4 exports, 6 functions, 0 classes</summary>

- Export: WorkNarration, isPublicNarrationText, workNarrationLabel, workNarrationReason
- Outbound: 없음
- Function-like symbols: `value@16-19=4`; `safe@21-32=12`; `isPublicNarrationText@34-36=3`; `workNarrationLabel@38-65=28`; `workNarrationLabel.<anonymous@50>@50-50=1`; `workNarrationReason@67-84=18`
- Classes: 없음

</details>

<details><summary>src/core/domain/work/performance.ts — 84행, 3 exports, 15 functions, 0 classes</summary>

- Export: AssignedWorkContext, PerformanceProjection, projectPerformance
- Outbound: import `../execution/project-activity.js` → `src/core/domain/execution/project-activity.ts`; import `../execution/execution-run-contract.js` → `src/core/domain/execution/execution-run-contract.ts`; import `../execution/terminal.js` → `src/core/domain/execution/terminal.ts`; import `./workflow-projection.js` → `src/core/domain/work/workflow-projection.ts`
- Function-like symbols: `projectPerformance@26-61=36`; `projectPerformance.<anonymous@32>@32-32=1`; `projectPerformance.<anonymous@33>@33-33=1`; `projectPerformance.<anonymous@34>@34-38=5`; `projectPerformance.<anonymous@34>@34-38=5`; `projectPerformance.<anonymous@40>@40-40=1`; `projectPerformance.<anonymous@41>@41-42=2`; `projectPerformance.<anonymous@50>@50-50=1`; `projectPerformance.<anonymous@52>@52-52=1`; `projectPerformance.<anonymous@56>@56-56=1`; `record@63-65=3`; `isExecutionFailure@66-72=7`; `nonzeroExit@73-77=5`; `publicText@78-78=1`; `observationLabel@79-84=6`
- Classes: 없음

</details>

<details><summary>src/core/domain/work/planning.ts — 91행, 8 exports, 8 functions, 0 classes</summary>

- Export: PlanningEpic, PlanningStory, PlanningSnapshot, EPIC_ID, STORY_ID, sanitizePlanningText, createPlanningSnapshot, validatePlanningSnapshot
- Outbound: 없음
- Function-like symbols: `sanitizePlanningText@26-41=16`; `createPlanningSnapshot@43-52=10`; `validatePlanningSnapshot@54-84=31`; `validatePlanningSnapshot.<anonymous@72>@72-72=1`; `validateText@86-88=3`; `validateDate@89-89=1`; `freezeEpic@90-90=1`; `freezeStory@91-91=1`
- Classes: 없음

</details>

<details><summary>src/core/domain/work/request-projections.ts — 33행, 2 exports, 22 functions, 0 classes</summary>

- Export: projectRequestTodo, projectRequestDestinations
- Outbound: import `../execution/request-runtime` → `src/core/domain/execution/request-runtime.ts`; import `./todos` → `src/core/domain/work/todos.ts`
- Function-like symbols: `todoStatus@4-4=1`; `label@5-5=1`; `projectRequestTodo@8-14=7`; `projectRequestTodo.<anonymous@11>@11-11=1`; `projectRequestTodo.<anonymous@11>@11-12=2`; `projectRequestTodo.<anonymous@12>@12-12=1`; `projectRequestDestinations@17-33=17`; `projectRequestDestinations.<anonymous@18>@18-18=1`; `projectRequestDestinations.<anonymous@18>@18-18=1`; `projectRequestDestinations.<anonymous@19>@19-19=1`; `projectRequestDestinations.<anonymous@20>@20-20=1`; `projectRequestDestinations.<anonymous@21>@21-21=1`; `projectRequestDestinations.<anonymous@23>@23-23=1`; `projectRequestDestinations.<anonymous@24>@24-24=1`; `projectRequestDestinations.<anonymous@24>@24-24=1`; `projectRequestDestinations.<anonymous@25>@25-25=1`; `projectRequestDestinations.<anonymous@25>@25-25=1`; `projectRequestDestinations.<anonymous@30>@30-30=1`; `projectRequestDestinations.<anonymous@30>@30-30=1`; `projectRequestDestinations.<anonymous@30>@30-30=1`; `projectRequestDestinations.<anonymous@31>@31-31=1`; `projectRequestDestinations.<anonymous@31>@31-31=1`
- Classes: 없음

</details>

<details><summary>src/core/domain/work/t-notes.ts — 442행, 19 exports, 36 functions, 0 classes</summary>

- Export: TNoteActivitySource, TNoteSourceRange, TNoteSourceActivity, TNotePacket, TNoteCompletionMetadata, TNoteModelProvenance, TNoteDraftInput, TNoteDraft, TNoteCompletionRecord, TNoteCompletionActivity, TNoteCompletionIndex, projectTNoteCompletionIndex, TNotePacketDigest, projectActivityToTNoteSource, createTNotePacket, validateTNoteDraft, validateTNotePacket, createTNoteDraft, sanitizeTNoteText
- Outbound: import `../execution/project-activity.js` → `src/core/domain/execution/project-activity.ts`; import `../review/redaction.js` → `src/core/domain/review/redaction.ts`
- Function-like symbols: `projectTNoteCompletionIndex@129-164=36`; `projectTNoteCompletionIndex.<anonymous@138>@138-140=3`; `projectTNoteCompletionIndex.<anonymous@141>@141-141=1`; `projectTNoteCompletionIndex.<anonymous@143>@143-163=21`; `projectActivityToTNoteSource@173-185=13`; `createTNotePacket@187-219=33`; `createTNotePacket.<anonymous@201>@201-201=1`; `validateTNoteDraft@221-239=19`; `validateTNotePacket@241-265=25`; `validateTNotePacket.<anonymous@249>@249-249=1`; `createTNoteDraft@267-270=4`; `sanitizeTNoteText@273-280=8`; `projectActivity@282-293=12`; `projectPacketActivity@295-307=13`; `assertStrictlyIncreasingSequences@309-316=8`; `assertStrictlyIncreasingSequences.<anonymous@310>@310-310=1`; `validateProvenance@318-325=8`; `assertRange@327-332=6`; `assertId@334-336=3`; `assertDate@338-340=3`; `completionFor@342-360=19`; `canonicalJson@362-367=6`; `canonicalJson.<anonymous@366>@366-366=1`; `redactNativePayload@370-401=32`; `redactNativePayload.project@373-399=27`; `freezePacket@403-405=3`; `freezePacket.<anonymous@404>@404-404=1`; `freezeDraft@407-409=3`; `utf8ByteLength@411-411=1`; `truncateUtf8@413-421=9`; `redactCustomerIdentifiers@423-425=3`; `redactLocalPaths@427-429=3`; `protectRedactionMarkers@431-438=8`; `protectRedactionMarkers.<anonymous@433>@433-436=4`; `restoreRedactionMarkers@440-442=3`; `restoreRedactionMarkers.<anonymous@441>@441-441=1`
- Classes: 없음

</details>

<details><summary>src/core/domain/work/todos.ts — 464행, 21 exports, 52 functions, 0 classes</summary>

- Export: TODO_ITEM_STATUSES, MAX_TODO_EVIDENCE, TodoItemStatus, TodoPlanRevisionReference, TodoInputReference, TodoExecutionReference, TodoNativePlanSource, TodoNativePlanItemSource, TodoNativePlanBinding, TodoDetail, TodoItem, TodoDocument, TodoProgress, TodoDetailProgress, todoProgress, todoDetailProgress, validateTodoDocument, renderTodoMarkdown, parseTodoMarkdown, patchTodoMarkdown, sanitizeTodoText
- Outbound: 없음
- Function-like symbols: `todoProgress@102-104=3`; `todoDetailProgress@107-109=3`; `todoDetailProgress.<anonymous@108>@108-108=1`; `progressFor@111-123=13`; `validateTodoDocument@126-194=69`; `validateTodoDocument.<anonymous@134>@134-134=1`; `validateTodoDocument.<anonymous@139>@139-167=29`; `validateTodoDocument.<anonymous@147>@147-154=8`; `validateTodoDocument.<anonymous@156>@156-156=1`; `validateTodoDocument.<anonymous@157>@157-157=1`; `validateTodoDocument.<anonymous@170>@170-170=1`; `validateTodoDocument.<anonymous@178>@178-178=1`; `renderTodoMarkdown@196-205=10`; `parseTodoMarkdown@207-229=23`; `patchTodoMarkdown@235-256=22`; `patchTodoMarkdown.<anonymous@242>@242-245=4`; `patchTodoMarkdown.<anonymous@244>@244-244=1`; `patchTodoMarkdown.<anonymous@246>@246-246=1`; `patchTodoMarkdown.<anonymous@253>@253-253=1`; `patchTodoMarkdown.<anonymous@255>@255-255=1`; `splitMarkdownLines@264-273=10`; `insertionLineEnding@275-279=5`; `insertionLineEnding.<anonymous@276>@276-276=1`; `insertionLineEnding.<anonymous@277>@277-277=1`; `sanitizeTodoText@281-293=13`; `parseItemLine@295-319=25`; `isManagedTodoLine@321-323=3`; `renderHeader@325-335=11`; `renderEntry@337-347=11`; `validateTodoEntry@349-361=13`; `validateTodoEntry.<anonymous@358>@358-358=1`; `parseComment@363-367=5`; `sanitizeTitle@369-373=5`; `isIsoDate@375-377=3`; `isNonNegativeInteger@378-378=1`; `isRecord@379-379=1`; `hasExactKeys@380-383=4`; `hasExactKeys.<anonymous@382>@382-382=1`; `hasExactKeys.<anonymous@382>@382-382=1`; `validateTodoSource@385-397=13`; `validateTodoItemSource@399-412=14`; `validateTodoItemSource.<anonymous@403>@403-403=1`; `validateInputReference@414-418=5`; `validatePlanRevision@420-429=10`; `validateExecutionReference@431-443=13`; `isOpaqueReference@445-447=3`; `isSha256Hex@448-448=1`; `isSourceDigest@449-449=1`; `isPositiveInteger@450-450=1`; `samePlanRevision@451-456=6`; `sameExecutionReference@457-463=7`; `fail@464-464=1`
- Classes: 없음

</details>

<details><summary>src/core/domain/work/trace-selection.ts — 176행, 9 exports, 11 functions, 0 classes</summary>

- Export: TraceSelectionCoverage, TraceSelectionFailureCode, TraceSelectionFailure, ActivitySelectionResult, SelectionCoverageInput, ActivitySelectionInput, TraceSelectionInput, resolveActivitySelection, resolveTraceSelection
- Outbound: import `../execution/project-activity.js` → `src/core/domain/execution/project-activity.ts`; import `./index.js` → `src/core/domain/work/index.ts`
- Function-like symbols: `resolveActivitySelection@75-91=17`; `resolveActivitySelection.<anonymous@77>@77-77=1`; `resolveTraceSelection@94-129=36`; `resolveTraceSelection.<anonymous@98>@98-98=1`; `resolveTraceSelection.<anonymous@116>@116-118=3`; `resolveTraceSelection.<anonymous@116>@116-119=4`; `selectionCoverage@131-142=12`; `selectionCoverage.<anonymous@133>@133-133=1`; `selectionCoverage.<anonymous@135>@135-135=1`; `selected@144-162=19`; `failed@164-176=13`
- Classes: 없음

</details>

<details><summary>src/core/domain/work/traceability-validator.ts — 23행, 2 exports, 1 functions, 0 classes</summary>

- Export: WorkTraceabilityPathProbe, validateWorkTraceabilityManifest
- Outbound: import `./traceability.js` → `src/core/domain/work/traceability.ts`
- Function-like symbols: `validateWorkTraceabilityManifest@12-23=12`
- Classes: 없음

</details>

<details><summary>src/core/domain/work/traceability.ts — 164행, 10 exports, 9 functions, 0 classes</summary>

- Export: WORK_REFERENCE_KINDS, WorkReferenceKind, LinearIssueReference, WorkReference, WorkTraceabilityLink, WorkTraceabilityManifest, parseWorkTraceabilityManifest, relatedWorkReferences, referenceKey, isRepositoryPathReference
- Outbound: 없음
- Function-like symbols: `parseWorkTraceabilityManifest@67-92=26`; `relatedWorkReferences@94-103=10`; `referenceKey@105-108=4`; `isRepositoryPathReference@110-112=3`; `parseLink@115-129=15`; `parseReference@131-143=13`; `assertReference@145-151=7`; `isLinearIssueUrl@153-160=8`; `isRecord@162-164=3`
- Classes: 없음

</details>

<details><summary>src/core/domain/work/workbench.ts — 339행, 27 exports, 12 functions, 0 classes</summary>

- Export: WorkbenchPhase, WorkbenchPermissionMode, WorkbenchCollaborationMode, WorkbenchTodoSyncState, WorkbenchChatMessage, WorkbenchChatQueueItem, WorkbenchTNote, WorkbenchLiveActivity, WorkbenchContextUsage, WorkbenchModelUsage, WorkbenchSessionUsage, WorkbenchSessionGoal, WorkbenchWooEntrySnapshot, WorkbenchResumeCoverage, WorkbenchModelSelection, WorkbenchMcpServer, WorkbenchActionResult, WorkbenchSnapshot, WorkbenchCommand, WorkbenchCommandReceipt, WorkbenchListener, WorkbenchApprovalDecision, WorkbenchExternalMutationKind, WorkbenchExternalMutationCandidate, workbenchExternalMutationCandidates, workbenchApprovalIdentity, workbenchApprovalDecisions
- Outbound: import `../execution/native-session.js` → `src/core/domain/execution/native-session.ts`; import `../execution/model-settings.js` → `src/core/domain/execution/model-settings.ts`; import `../execution/project-activity.js` → `src/core/domain/execution/project-activity.ts`; import `./todos.js` → `src/core/domain/work/todos.ts`; import `../review/review.js` → `src/core/domain/review/review.ts`; import `./index.js` → `src/core/domain/work/index.ts`; import `../execution/execution-run-contract.js` → `src/core/domain/execution/execution-run-contract.ts`; import `../execution/request-runtime` → `src/core/domain/execution/request-runtime.ts`; import `./trace-selection.js` → `src/core/domain/work/trace-selection.ts`; import `./linear-dashboard.js` → `src/core/domain/work/linear-dashboard.ts`; import `./performance.js` → `src/core/domain/work/performance.ts`; import `./delegation.js` → `src/core/domain/work/delegation.ts`
- Function-like symbols: `workbenchExternalMutationCandidates@266-289=24`; `workbenchExternalMutationCandidates.<anonymous@269>@269-288=20`; `workbenchApprovalIdentity@292-300=9`; `workbenchApprovalIdentity.<anonymous@298>@298-298=1`; `mutationIdentity@302-310=9`; `canonicalMutationValue@312-318=7`; `canonicalMutationValue.<anonymous@315>@315-316=2`; `immutableMutationPayload@320-322=3`; `immutableMutationPayload.<anonymous@321>@321-321=1`; `immutableMutationValue@324-328=5`; `workbenchApprovalDecisions@331-339=9`; `workbenchApprovalDecisions.<anonymous@336>@336-338=3`
- Classes: 없음

</details>

<details><summary>src/core/domain/work/workflow-projection.ts — 1039행, 24 exports, 72 functions, 1 classes</summary>

- Export: TraceAttribution, WorkStepStatus, Sha256Hex, WorkStepNarration, PlanProjectionInput, PendingGoalProjectionInput, WorkFlowProjectionInput, PlanRevisionRef, DerivedPlanIdentity, NativePlanSource, PlanOrphanReason, JournalIntegrityCode, RevisionValidationCode, PlanRejection, PlanAssociation, PlanRetirement, PlanOrphan, PlanReconciliation, SemanticWorkStep, WorkFlowProjection, DplanHash, DplanIdentityCollisionError, projectWorkFlow, projectWorkFlowFromExecutionRun
- Outbound: import `../execution/project-activity.js` → `src/core/domain/execution/project-activity.ts`; import `../review/redaction.js` → `src/core/domain/review/redaction.ts`; import `../execution/terminal.js` → `src/core/domain/execution/terminal.ts`; import `./activity-classification.js` → `src/core/domain/work/activity-classification.ts`; import `../execution/execution-run-contract.js` → `src/core/domain/execution/execution-run-contract.ts`
- Function-like symbols: `DplanIdentityCollisionError.<anonymous@169>@169-172=4`; `frame@175-189=15`; `frame.<anonymous@176>@176-176=1`; `frame.<anonymous@178>@178-178=1`; `decimal@190-195=6`; `digest@196-201=6`; `revision@202-221=20`; `token@222-227=6`; `projectWorkFlow@252-529=278`; `projectWorkFlow.empty@257-268=12`; `projectWorkFlow.<anonymous@271>@271-275=5`; `projectWorkFlow.<anonymous@289>@289-292=4`; `projectWorkFlow.<anonymous@295>@295-300=6`; `projectWorkFlow.<anonymous@304>@304-310=7`; `projectWorkFlow.emitOrphan@325-340=16`; `projectWorkFlow.<anonymous@390>@390-390=1`; `projectWorkFlow.<anonymous@392>@392-392=1`; `projectWorkFlow.<anonymous@408>@408-408=1`; `projectWorkFlow.<anonymous@438>@438-438=1`; `projectWorkFlow.<anonymous@464>@464-464=1`; `projectWorkFlow.<anonymous@466>@466-497=32`; `projectWorkFlow.<anonymous@476>@476-482=7`; `projectWorkFlow.<anonymous@495>@495-495=1`; `projectWorkFlow.<anonymous@498>@498-498=1`; `projectWorkFlow.<anonymous@499>@499-499=1`; `projectWorkFlow.<anonymous@500>@500-500=1`; `projectWorkFlow.<anonymous@522>@522-522=1`; `isPublicPlanRevision@531-533=3`; `isPublicPlanRevision.<anonymous@532>@532-532=1`; `projectWorkFlowFromExecutionRun@540-548=9`; `validateJournal@550-598=49`; `reconcile@600-765=166`; `reconcile.<anonymous@618>@618-618=1`; `reconcile.<anonymous@619>@619-619=1`; `reconcile.<anonymous@621>@621-621=1`; `reconcile.<anonymous@631>@631-633=3`; `reconcile.<anonymous@637>@637-637=1`; `reconcile.<anonymous@637>@637-637=1`; `reconcile.<anonymous@638>@638-638=1`; `reconcile.<anonymous@638>@638-638=1`; `reconcile.<anonymous@653>@653-653=1`; `reconcile.<anonymous@653>@653-653=1`; `reconcile.<anonymous@654>@654-654=1`; `reconcile.<anonymous@654>@654-654=1`; `reconcile.<anonymous@660>@660-660=1`; `reconcile.<anonymous@688>@688-764=77`; `collisionTitles@766-776=11`; `collisionTitles.<anonymous@774>@774-774=1`; `collisionTitles.<anonymous@774>@774-774=1`; `narration@777-787=11`; `activitySummary@788-804=17`; `technicalNarration@805-814=10`; `isParseablePlanEnvelope@815-817=3`; `isPlanRevision@818-823=6`; `rawPlanEntries@828-893=66`; `rawPlanEntries.<anonymous@837>@837-837=1`; `rawPlanEntries.<anonymous@841>@841-841=1`; `nativePlainNumberedPlanBlock@895-922=28`; `markdownPlanEntry@924-934=11`; `markdownPlanTitle@935-938=4`; `planValidationError@939-949=11`; `parsePlan@950-968=19`; `parsePlan.<anonymous@957>@957-966=10`; `markdownPlanStatus@969-982=14`; `count@983-987=5`; `lev@988-1008=21`; `lev.<anonymous@991>@991-991=1`; `isEditLike@1009-1014=6`; `isTurnStart@1015-1018=4`; `planStatus@1019-1029=11`; `record@1030-1034=5`; `publicText@1035-1039=5`
- Classes: `DplanIdentityCollisionError@168-173=6`

</details>

<details><summary>src/core/ports/execution/artifact-publication-port.ts — 13행, 1 exports, 0 functions, 0 classes</summary>

- Export: ArtifactPublicationPort
- Outbound: import `../../domain/development/artifact-control` → `src/core/domain/development/artifact-control.ts`
- Function-like symbols: 없음
- Classes: 없음

</details>

<details><summary>src/core/ports/execution/executor-port.ts — 36행, 1 exports, 0 functions, 0 classes</summary>

- Export: ExecutorPort
- Outbound: import `../../domain/execution/native-session.js` → `src/core/domain/execution/native-session.ts`; import `./runtime-tool-port` → `src/core/ports/execution/runtime-tool-port.ts`; import `../../domain/execution/model-settings` → `src/core/domain/execution/model-settings.ts`
- Function-like symbols: 없음
- Classes: 없음

</details>

<details><summary>src/core/ports/execution/request-action-port.ts — 51행, 4 exports, 0 functions, 0 classes</summary>

- Export: RequestActionIntent, RequestActionGrant, RequestActionApproval, RequestActionCapability
- Outbound: import `../../domain/execution/request-runtime` → `src/core/domain/execution/request-runtime.ts`
- Function-like symbols: 없음
- Classes: 없음

</details>

<details><summary>src/core/ports/execution/request-projection-port.ts — 6행, 1 exports, 0 functions, 0 classes</summary>

- Export: RequestProjectionPort
- Outbound: import `../../domain/execution/request-runtime` → `src/core/domain/execution/request-runtime.ts`
- Function-like symbols: 없음
- Classes: 없음

</details>

<details><summary>src/core/ports/execution/runtime-tool-port.ts — 15행, 4 exports, 0 functions, 0 classes</summary>

- Export: RuntimeToolDefinition, RuntimeToolCall, RuntimeToolResult, RuntimeToolHandler
- Outbound: 없음
- Function-like symbols: 없음
- Classes: 없음

</details>

<details><summary>src/core/ports/index.ts — 166행, 27 exports, 0 functions, 0 classes</summary>

- Export: ModelAuthStatus, ModelClient, AgentToolExecution, AgentTool, TerminalCommandExecutor, TodoStore, TodoController, SessionRepository, ProviderAuthState, AuthController, UsageProviderId, UsageState, UsageIssueKind, UsageIssue, UsageLimitSnapshot, UsageSnapshot, UsageMonitor, ObservabilityHistory, ObservabilityHistoryReader, WorkbenchGitTelemetry, WorkbenchGitTelemetryReader, SettingsRepository, AtomicSettingsRepository, ComposerDraftController, RecentSessionSummary, RouterSettingsController, RepositoryInsights
- Outbound: import `@earendil-works/pi-ai`; import `../domain/execution/session-events` → `src/core/domain/execution/session-events.ts`; import `../domain/execution/model-settings` → `src/core/domain/execution/model-settings.ts`; import `../domain/development/repository` → `src/core/domain/development/repository.ts`; import `../domain/execution/output` → `src/core/domain/execution/output.ts`; import `../domain/execution/terminal` → `src/core/domain/execution/terminal.ts`; import `../domain/work/todos` → `src/core/domain/work/todos.ts`; import `../domain/observability/observability-dashboard` → `src/core/domain/observability/observability-dashboard.ts`
- Function-like symbols: 없음
- Classes: 없음

</details>

<details><summary>src/core/runtime/execution-run.ts — 311행, 30 exports, 51 functions, 0 classes</summary>

- Export: ExecutionRunId, RuntimeEventKind, RuntimeEventDurability, ExecutionRunPhase, CompletionReceiptStatus, WaitReason, ExecutionHash, RuntimeEvent, ExecutionEvidence, ExecutionTask, ExecutionActivity, CompletionReceipt, CompletionChange, CompletionVerification, CompletionRemaining, ExecutionCheckpoint, ExecutionRunState, ExecutionRunReduction, ExecutionRunReductionContext, createExecutionRun, normalizeProjectActivity, reduceExecutionRun, replayExecutionRun, replayLegacyExecutionRunForVerification, replayV2ExecutionRunForVerification, projectExecutionTodo, projectExecutionActivity, projectExecutionCompletion, executionCheckpointDigest, completionReceiptDigest
- Outbound: import `../domain/execution/project-activity.js` → `src/core/domain/execution/project-activity.ts`; import `../domain/work/todos.js` → `src/core/domain/work/todos.ts`; import `../domain/work/workflow-projection.js` → `src/core/domain/work/workflow-projection.ts`; import `../domain/execution/execution-run-contract.js` → `src/core/domain/execution/execution-run-contract.ts`; re-export `../domain/execution/execution-run-contract.js` → `src/core/domain/execution/execution-run-contract.ts`
- Function-like symbols: `frame@46-46=1`; `digest@47-47=1`; `terminal@48-48=1`; `createExecutionRun@55-62=8`; `normalizeProjectActivity@64-75=12`; `reduceExecutionRun@77-79=3`; `reduceExecutionRunVersion@81-124=44`; `reduceExecutionRunVersion.<anonymous@83>@83-83=1`; `replayExecutionRun@126-128=3`; `replayExecutionRun.<anonymous@127>@127-127=1`; `replayLegacyExecutionRunForVerification@131-133=3`; `replayLegacyExecutionRunForVerification.<anonymous@132>@132-132=1`; `replayV2ExecutionRunForVerification@136-138=3`; `replayV2ExecutionRunForVerification.<anonymous@137>@137-137=1`; `projectExecutionTodo@140-142=3`; `projectExecutionTodo.<anonymous@141>@141-141=1`; `projectExecutionActivity@143-143=1`; `projectExecutionCompletion@144-144=1`; `executionCheckpointDigest@145-145=1`; `completionReceiptDigest@146-146=1`; `checkpoint@148-152=5`; `eventKind@153-160=8`; `nextPhase@161-173=13`; `projectPlanTasks@174-193=20`; `projectPlanTasks.<anonymous@176>@176-176=1`; `projectPlanTasks.<anonymous@177>@177-177=1`; `projectPlanTasks.<anonymous@185>@185-192=8`; `reduceTask@195-228=34`; `reduceTask.<anonymous@198>@198-211=14`; `reduceTask.<anonymous@209>@209-209=1`; `reduceTask.<anonymous@215>@215-215=1`; `reduceTask.<anonymous@218>@218-218=1`; `reduceTask.<anonymous@220>@220-222=3`; `reduceTask.<anonymous@224>@224-224=1`; `reduceTask.<anonymous@227>@227-227=1`; `evidenceFor@229-233=5`; `projectActivity@234-238=5`; `isTerminal@239-242=4`; `terminalStatus@243-248=6`; `receiptFor@249-287=39`; `receiptFor.<anonymous@250>@250-250=1`; `receiptFor.<anonymous@251>@251-251=1`; `receiptFor.<anonymous@252>@252-258=7`; `receiptFor.<anonymous@259>@259-267=9`; `receiptFor.<anonymous@269>@269-278=10`; `receiptFor.<anonymous@280>@280-280=1`; `receiptFor.<anonymous@281>@281-281=1`; `stringValue@288-288=1`; `record@289-293=5`; `receiptFields@294-298=5`; `verificationStatus@299-311=13`
- Classes: 없음

</details>

<details><summary>src/core/runtime/request-runtime.ts — 258행, 1 exports, 67 functions, 0 classes</summary>

- Export: projectRequestRuntime
- Outbound: import `../domain/execution/project-activity` → `src/core/domain/execution/project-activity.ts`; import `../domain/execution/request-runtime` → `src/core/domain/execution/request-runtime.ts`
- Function-like symbols: `record@4-4=1`; `settled@5-5=1`; `<anonymous@6>@6-6=1`; `<anonymous@6>@6-6=1`; `delivered@6-6=1`; `publicMessage@9-14=6`; `evidence@16-21=6`; `event@23-25=3`; `reject@26-29=4`; `create@30-35=6`; `create.<anonymous@33>@33-33=1`; `resolveEvidence@37-49=13`; `resolveEvidence.<anonymous@39>@39-39=1`; `resolveEvidence.<anonymous@42>@42-43=2`; `applyReport@51-123=73`; `applyReport.<anonymous@55>@55-55=1`; `applyReport.<anonymous@56>@56-56=1`; `applyReport.<anonymous@59>@59-59=1`; `applyReport.<anonymous@61>@61-61=1`; `applyReport.<anonymous@61>@61-61=1`; `applyReport.<anonymous@63>@63-63=1`; `applyReport.<anonymous@63>@63-63=1`; `applyReport.<anonymous@64>@64-64=1`; `applyReport.<anonymous@64>@64-64=1`; `applyReport.<anonymous@69>@69-69=1`; `applyReport.<anonymous@72>@72-72=1`; `applyReport.<anonymous@72>@72-72=1`; `applyReport.<anonymous@73>@73-73=1`; `applyReport.<anonymous@73>@73-73=1`; `applyReport.<anonymous@74>@74-74=1`; `applyReport.cyclic@76-82=7`; `applyReport.<anonymous@83>@83-83=1`; `applyReport.<anonymous@83>@83-83=1`; `applyReport.<anonymous@87>@87-87=1`; `applyReport.<anonymous@87>@87-87=1`; `applyReport.<anonymous@87>@87-87=1`; `applyReport.<anonymous@91>@91-91=1`; `applyReport.<anonymous@94>@94-94=1`; `applyReport.<anonymous@95>@95-95=1`; `applyReport.<anonymous@95>@95-95=1`; `applyReport.<anonymous@111>@111-111=1`; `applyReport.<anonymous@111>@111-111=1`; `applyReport.<anonymous@113>@113-113=1`; `projectRequestRuntime@126-258=133`; `projectRequestRuntime.<anonymous@127>@127-127=1`; `projectRequestRuntime.<anonymous@127>@127-127=1`; `projectRequestRuntime.<anonymous@131>@131-131=1`; `projectRequestRuntime.<anonymous@131>@131-131=1`; `projectRequestRuntime.<anonymous@166>@166-166=1`; `projectRequestRuntime.<anonymous@169>@169-169=1`; `projectRequestRuntime.<anonymous@170>@170-170=1`; `projectRequestRuntime.<anonymous@179>@179-179=1`; `projectRequestRuntime.<anonymous@179>@179-179=1`; `projectRequestRuntime.<anonymous@184>@184-184=1`; `projectRequestRuntime.<anonymous@184>@184-184=1`; `projectRequestRuntime.<anonymous@194>@194-194=1`; `projectRequestRuntime.<anonymous@198>@198-198=1`; `projectRequestRuntime.<anonymous@201>@201-201=1`; `projectRequestRuntime.<anonymous@210>@210-210=1`; `projectRequestRuntime.<anonymous@212>@212-212=1`; `projectRequestRuntime.<anonymous@221>@221-221=1`; `projectRequestRuntime.<anonymous@231>@231-231=1`; `projectRequestRuntime.<anonymous@232>@232-232=1`; `projectRequestRuntime.<anonymous@234>@234-234=1`; `projectRequestRuntime.<anonymous@234>@234-234=1`; `projectRequestRuntime.<anonymous@246>@246-246=1`; `projectRequestRuntime.<anonymous@251>@251-251=1`
- Classes: 없음

</details>

<details><summary>src/core/skills/skill-registry.ts — 35행, 4 exports, 1 functions, 0 classes</summary>

- Export: SkillDescriptor, SkillRegistrySnapshot, SkillRegistryPort, validateSkillRegistry
- Outbound: 없음
- Function-like symbols: `validateSkillRegistry@21-35=15`
- Classes: 없음

</details>

<details><summary>src/core/workflows/skill-run.ts — 132행, 13 exports, 20 functions, 0 classes</summary>

- Export: SkillRunStage, WooReceiptStatus, SkillStepState, SkillVerification, SkillRunState, SkillRunReceipt, startSkillRun, beginSkillStep, requestSkillAuthorization, authorizeSkillStep, finishSkillStep, verifySkillRunReceipt, skillRunMonitor
- Outbound: import `node:crypto`; import `../agents/rpa-agent.js` → `src/core/agents/rpa-agent.ts`
- Function-like symbols: `digest@63-63=1`; `<anonymous@64>@64-64=1`; `freeze@64-64=1`; `startSkillRun@66-71=6`; `startSkillRun.<anonymous@69>@69-69=1`; `beginSkillStep@73-79=7`; `beginSkillStep.<anonymous@75>@75-75=1`; `beginSkillStep.<anonymous@77>@77-77=1`; `requestSkillAuthorization@81-86=6`; `requestSkillAuthorization.<anonymous@84>@84-84=1`; `authorizeSkillStep@88-96=9`; `authorizeSkillStep.<anonymous@94>@94-94=1`; `finishSkillStep@98-122=25`; `finishSkillStep.<anonymous@101>@101-101=1`; `finishSkillStep.<anonymous@116>@116-116=1`; `finishSkillStep.<anonymous@117>@117-117=1`; `finishSkillStep.<anonymous@119>@119-119=1`; `verifySkillRunReceipt@124-127=4`; `skillRunMonitor@129-132=4`; `skillRunMonitor.<anonymous@131>@131-131=1`
- Classes: 없음

</details>

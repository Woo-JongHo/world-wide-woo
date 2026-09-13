# TUI-F001~F016 사용자 하위 기능(Unit) 후보 인벤토리

- 기준일: 2026-09-13
- 저장소: `/Users/jonghoPro/woo/00_project/99_www`
- 브랜치: `astra/terminal-ui`
- 범위: `src/adapters/inbound/tui/features/**`를 실제 exports, shell/CLI 조립, slash command 등록·처리, 대응 테스트와 대조
- 코드 변경: 없음. 이 증거 문서만 새로 작성.
- 신뢰 경계: 시작 시점에 저장소는 매우 dirty했고 `features/**`, shell, tests가 미추적 또는 수정 상태였다. 아래는 그 시점의 working tree를 읽은 목록이다. 직접 대응 테스트는 코드 대조로 이름만 기록했으며 이 수집 작업에서 실행하지 않았다.

## 판정 기준 및 실제 경계

`feature-registry.ts`에는 순서대로 `TUI-F001`~`TUI-F016` descriptor 16개가 있고, `feature.types.ts`의 union도 같은 ID 16개를 선언한다. registry는 정적 메타데이터와 ID/key 조회만 제공한다. 컴포넌트 생성 및 화면 연결은 `shell/workbench-shell.ts`, `shell/astra-surface.ts`, `legacy/legacy-session-shell.ts`가 맡는다. 따라서 폴더·파일명만으로 Unit을 세지 않고 화면/명령에서 사용자가 수행하는 별도 일을 기준으로 후보를 묶었다.

현재 slash command 표면은 둘이다. `WORKBENCH_SLASH_COMMANDS`와 `parseWorkbenchShellCommand()`는 Native Workbench/Astra 경로이고, `SLASH_COMMANDS`와 `parseShellCommand()`는 `legacy-session-shell.ts`가 쓰는 호환 경로다. `/dashboard`, `/monitor`, `/stats`, `/map`, `/test`는 `workbench-navigation.controller.ts`의 화면 모드 전환으로 처리된다. Astra 전용 `/context`와 `/approval`은 `workbench-shell.ts`에서 직접 가로챈다. 이 구분 때문에 legacy에서만 조립되는 코드는 표에 legacy 상태로 표시했다.

## 후보 목록

총 **35개 Unit 후보**를 도출했다. Unit ID는 이 인벤토리 제안용이며 기존 저장소 ID가 아니다. 직접 대응 테스트 칸은 해당 UI/명령 계약을 가장 직접 확인하는 테스트 파일을 적었다.

| Feature | 제안 Unit ID | 한국어 이름 | 소유 symbol / file | 사용자 동작 / 화면 | 직접 테스트 |
|---|---|---|---|---|---|
| TUI-F001 Dashboard | TUI-F001-U01 | 첫 진입 프로젝트 요약 | `EntryDashboardView` — `features/dashboard/entry-dashboard-view.ts`; `runProjectWorkbenchShell()`에서 생성해 Chat welcome에 주입 | 대화 전 열린 Linear 이슈, NOW/NEXT, Update, 최근 변경, 연결 상태를 읽는다. Dashboard 폴더의 뷰지만 빈 Chat에서 표시됨 | `entry-dashboard-view.test.ts`, `workbench-views.test.ts` |
| TUI-F001 Dashboard | TUI-F001-U02 | 세션·프로젝트 관측 대시보드 | `ObservabilityDashboardView`, `AstraHistoryView` — `features/session/observability-dashboard-view.ts`, `features/session/astra-history-view.ts`; `/dashboard` | 로컬 관측 범위의 세션 수·토큰·추이·주의 항목을 보고 이전 세션을 선택한다. 선택 세션의 통계 상세로 진입 가능 | `observability-views.test.ts`, `workbench-shell-policy.test.ts`, `astra-ui.test.ts` |
| TUI-F002 Chat | TUI-F002-U01 | 질문·공개 응답 대화 흐름 | `WorkbenchChatView`, `AstraTranscriptView` — `features/chat/workbench-views.ts`, `features/chat/astra-execution.ts` | 사용자 질문, 공개 응답, 공개 lifecycle 요약, 진행 중 응답을 한 transcript에서 읽고 입력한다 | `chat-render-acceptance.test.ts`, `workbench-views.test.ts`, `astra-ui.test.ts` |
| TUI-F002 Chat | TUI-F002-U02 | 첫 질문 시작 화면 | `WorkbenchWelcomeView` — `features/chat/workbench-welcome.ts`; `WorkbenchChatView` 내부 소유 | 새 대화에서 Workbench 사용 안내와 시작 유도 표시. 첫 visible Chat 내용 이후 닫힌다 | `workbench-welcome.test.ts`, `workbench-views.test.ts` |
| TUI-F002 Chat | TUI-F002-U03 | 실행 단계·관측 카드 | `WorkStepCard`, `ObservationCard`, `isVisibleWorkStep()` — `features/chat/work-step-card.ts`; `WorkbenchChatView`가 사용 | Bash/Edit/Tool의 진행·결과, 공개 입력/출력, 현재 관측을 Chat에서 읽는다. 민감 필드 제거와 출력 상한을 적용 | `work-step-card-highlight.test.ts`, `workbench-views.test.ts`, `astra-ui.test.ts` |
| TUI-F002 Chat | TUI-F002-U04 | 도구 결과·Diff 카드 | `BashResultCard`, `GenericToolResultCard`, `DiffResultCard`, `CompletionSummaryCard` — `features/chat/result-cards.ts`, `legacy/legacy-dashboard-views.ts` | 구형 Router 대화에서 Bash·일반 도구·Diff·완료 결과를 카드로 읽는다. 현재 `legacy-dashboard-views.ts`에서 사용 | `result-cards.test.ts`, `syntax-highlighter.test.ts` |
| TUI-F002 Chat | TUI-F002-U05 | 위임 작업 트리·에이전트 상세 | `renderDelegationSummary()`, `renderDelegationDetail()`, `DelegationTreeView` — `features/chat/delegation-tree-view.ts`; Workbench에서 `WorkbenchTracerView`에 presentation callback 주입, `/agents`는 `agent.select` 처리 | 관측된 위임 트리와 공개 활동을 보고 `/agents <ref>`로 선택한 에이전트 상세를 읽는다. 표시 조립 일부는 Trace Tracer에 걸쳐 있음 | `delegation-tree-view.test.ts`, `workbench-tracer-view.test.ts`, `workbench-shell-policy.test.ts` |
| TUI-F002 Chat | TUI-F002-U06 | 읽던 transcript 위치 유지 | `ChatScrollView` — `features/chat/chat-scroll.view.ts`; Astra 실행 transcript에 연결 | 스트리밍 중이나 너비 전환 후에도 최신으로 강제 이동하지 않고 읽던 줄을 보존하며, 끝으로 오면 follow 복구 | `chat-scroll-acceptance.test.ts` |
| TUI-F002 Chat | TUI-F002-U07 | 대화·실행 제어 명령 | `parseWorkbenchShellCommand()`, `handleLocal()` — `commands/slash-commands.ts`, `shell/workbench-shell.ts`; `/cancel`, `/clear`, `/compact` | 실행 중단, 화면 대화 비우기(기록/thread 유지), 현재 thread 컨텍스트 압축을 명령으로 실행 | `slash-commands.test.ts`, `workbench-shell-policy.test.ts`, `project-workbench.test.ts` |
| TUI-F003 Plan | TUI-F003-U01 | Native Plan·Todo 읽기 | `AstraPlanView`, `WorkspaceTodoView` — `features/plan/astra-plan-view.ts`, `features/dashboard/shared-dashboard-views.ts`; `/todo`, Astra 화면 전환 | 현재 계획·단계·하위 항목 및 진행 상태를 읽는다. Native Plan이 생기기 전 Todo/Goal 상태와 런타임 7단계 계획은 구분된다 | `workspace-todo-view.test.ts`, `native-plan-wiring.test.ts`, `astra-ui.test.ts` |
| TUI-F003 Plan | TUI-F003-U02 | 프로젝트 계획 초안 작성 | `planning.status`, `planning.epic.create`, `planning.story.create` parser/legacy handler — `commands/slash-commands.ts`, `legacy/legacy-session-shell.ts`; `/planning`, `/epic`, `/story` | 계획 catalog 상태를 조회하고 Epic·Story 초안을 저장한다. **legacy Router에서만 연결**되며 Native Plan 화면과는 별도 command 경로 | `slash-commands.test.ts`, `planning-service.test.ts`, `planning-domain.test.ts`, `legacy-router-app.test.ts` |
| TUI-F004 T-note | TUI-F004-U01 | 질문별 완료 T-note 읽기 | `TNotesSourceView` — `features/tnote/t-notes-source-view.ts`; 대응 렌더 assertion은 `workbench-views.test.ts` | 저장된 질문별 T-note와 근거 요약을 읽는 독립 화면 후보. **현재 주 `workbench-shell.ts`가 이 컴포넌트를 mount하지 않음**. `/tnotes`는 pane 안내 notice를 반환하고 Astra에서는 실행 타임라인 안내만 반환 | `workbench-views.test.ts` (독립 render만 확인; shell mount 증거 아님) |
| TUI-F004 T-note | TUI-F004-U02 | T-note 캡처 | `tnote.capture`, `tnote.capture-range`; `parseWorkbenchShellCommand()` 및 `handleLocal()` — `commands/slash-commands.ts`, `shell/workbench-shell.ts`; `/tnote`, `/tnote range <start> <end>` | 마지막 질문 범위 또는 sequence 범위를 지정해 요약 캡처 요청 | `slash-commands.test.ts`, `project-workbench.test.ts`, `work-traceability.test.ts` |
| TUI-F004 T-note | TUI-F004-U03 | T-note 정본 반영 승인 | `promotion.accept`, `promotion.confirm` — `commands/slash-commands.ts`, `shell/workbench-shell.ts`; `/promote tnote`, `/promote confirm` | note 반영 초안을 선택하고 별도 확인 token으로 사람 승인 | `slash-commands.test.ts`, `project-workbench.test.ts` |
| TUI-F004 T-note | TUI-F004-U04 | 공개 T-note 외부 검토 | `review.preview`, `review.send`, `parseReviewCommand()` — `commands/slash-commands.ts`, `shell/workbench-shell.ts`; `/review preview`, `/review send` | 공개 분류 note만 provider 검토용 미리보기로 만들고 확인 digest로 송신 | `slash-commands.test.ts`, `project-workbench.test.ts` |
| TUI-F005 Trace | TUI-F005-U01 | Plan·실행 Flow Tracer | `WorkbenchTracerView` — `features/trace/workbench-tracer-view.ts`; 기본 Workbench의 Tracer panel | Flow 단계, 현재 Now, 관측 Health 및 단계에 연결된 공개 activity를 읽는다. 추론 연결은 확정된 Native 관계가 아님을 표시 | `workbench-tracer-view.test.ts`, `workbench-views.test.ts` |
| TUI-F005 Trace | TUI-F005-U02 | 정확한 Activity Source 선택 | `activity.select`, `trace.select`; `WorkbenchMonitorView.selectedSourceRows()` — `commands/slash-commands.ts`, `features/monitoring/workbench-monitor-view.ts`, `shell/workbench-shell.ts`; `/source`, `/trace` | activity ID 또는 latest를 고르고 해당 보존 공개 Source를 읽는다. `/trace`는 선택 trace 결속 검사를 거쳐 Source 화면으로 연다 | `trace-selection.test.ts`, `workbench-shell-policy.test.ts`, `workbench-views.test.ts` |
| TUI-F006 Monitor | TUI-F006-U01 | Runtime·Request Live Monitor | `RuntimeMonitorView`, `AstraMonitorView`, `MonitoringOverlay` — `features/monitoring/runtime-monitor-view.ts`, `astra-monitor-view.ts`, `monitoring-overlay.ts`; `/monitor` | 현재 요청·단계·Tool·승인·최근 이벤트와 관측 범위를 읽는다. 두 View는 Workbench/Astra에 연결되고 `MonitoringOverlay`는 legacy shell 연결 | `observability-views.test.ts`, `monitoring-overlay.test.ts`, `request-runtime.test.ts`, `astra-ui.test.ts` |
| TUI-F006 Monitor | TUI-F006-U02 | 로컬 Workflow 실행 재개·조회 | `workflow.check`, `workflow.resume`, `workflow.show` — `commands/slash-commands.ts`, `shell/workbench-shell.ts`; `/workflow` | RPA 사전 확인, 기존 run 재개 요청, 결과 조회를 실행하고 receipt를 본다. 화면 본체는 feature view 밖의 workflow port/runtime | `slash-commands.test.ts`, `project-workbench.test.ts`, `project-workbench-session.test.ts`, `tui-shell-characterization.test.ts` |
| TUI-F006 Monitor | TUI-F006-U03 | 미확인 동작 read-back 대조 | `runtime.reconcile`, `requestRuntimeRows()` — `commands/slash-commands.ts`, `features/monitoring/request-runtime-view.ts`, `shell/workbench-shell.ts`; `/reconcile <request> <operation>` | 종료된 요청의 operation 결과를 다시 조회해 미확인 상태를 대조한다. View는 완료된 동작 재실행 금지를 설명 | `slash-commands.test.ts`, `request-runtime.test.ts`, `project-workbench.test.ts` |
| TUI-F007 Session | TUI-F007-U01 | Native thread 재개 선택 | `NativeThreadPicker`, `selectNativeThread()` — `features/session/native-thread-picker.ts`; `cli.ts`의 `www --resume` 및 `www astra --resume` | 현재 프로젝트의 Native thread를 목록에서 선택해 재개하거나 Escape로 취소 | `native-thread-picker.test.ts`, `astra-shell.test.ts`, `cli.test.ts` |
| TUI-F007 Session | TUI-F007-U02 | 실행 권한·모드 전환 | `session.permission`, `session.mode`, `nextWorkbenchRuntimeMode()` — `commands/slash-commands.ts`, `shell/workbench-input.controller.ts`, `shell/workbench-shell.ts`; `/permission`, `/mode`, Shift+Tab | manual/all 권한 범위와 manual/plan 실행 협업 모드를 바꾼다 | `workbench-shell-policy.test.ts`, `native-plan-wiring.test.ts`, `slash-commands.test.ts` |
| TUI-F007 Session | TUI-F007-U03 | 세션 Goal·WES 상태 다시 읽기 | `goal.view`, `goal.set`, `woo-entry.refresh` — `commands/slash-commands.ts`, `shell/workbench-shell.ts`; `/goal`, `/woo-entry` | 현재 Goal을 조회/설정하고 WES entry 상태를 다시 수집해 turn context 갱신 receipt를 확인 | `slash-commands.test.ts`, `woo-entry.test.ts`, `workbench-shell-policy.test.ts` |
| TUI-F008 Stats | TUI-F008-U01 | Session Review·Diagnostics | `SessionStatsView`, `AstraStatsView`; `projectSessionStats()` — `features/stats/session-stats-view.ts`, `features/stats/astra-stats-view.ts`; `/stats`, `/stats diagnostics` | session 목표·결과·성과·관측 범위 지표를 읽고 diagnostics에서는 로컬 기록 coverage를 점검 | `session-stats-view.test.ts`, `session-stats.test.ts`, `astra-ui.test.ts` |
| TUI-F008 Stats | TUI-F008-U02 | Request 통계 상세 조사 | 같은 Stats View의 target selection/`statsTarget`; `/stats latest`, `/stats #n` — `shell/workbench-shell.ts`, `shell/workbench-navigation.controller.ts` | 최신 또는 번호가 지정된 request의 shortlist·실패/지연 상세로 drill down | `session-stats-view.test.ts`, `workbench-shell-policy.test.ts` |
| TUI-F009 Usage | TUI-F009-U01 | Provider 잔여량·Context HUD | `UsageStripView`, `WorkbenchBottomHudView`, `AstraHud`, `astraUsageLine()` — `features/usage/*`; `/usage` refresh는 legacy parser/handler | Codex/Claude/Gemini/Z.AI 계정 quota와 reset, Context token, 실행 모드를 한 줄 HUD 또는 Astra 하단에 읽는다. `/context`에는 상세 quota가 안내됨 | `usage-strip.test.ts`, `workbench-bottom-hud.test.ts`, `workbench-hud-system.test.ts`, `astra-ui.test.ts`, `slash-commands.test.ts` |
| TUI-F010 Project Map | TUI-F010-U01 | 프로젝트 구조·진척도 Map | `DevelopmentMapView`, `AstraMapView`; `DevelopmentMapPollingLifecycle` — `features/project-map/*`, `shell/workbench-navigation.controller.ts`; `/map` | Initiative/Epic/Story와 명시된 관계·진척도 및 source 오류/오래된 상태를 읽는다. 화면 진입 중 polling | `development-map.test.ts`, `astra-shell.test.ts`, `workbench-shell-policy.test.ts` |
| TUI-F011 Context | TUI-F011-U01 | 세션 Context·권한·도구·위임 현황 | `AstraContextView` — `features/context/astra-context-view.ts`; Astra `/context`, `/agents` 선택 상세 | 프로젝트/thread/turn, model/effort, 권한·모드, 관측 범위, context quota, MCP와 delegation 상태를 확인한다 | `astra-ui.test.ts`, `workbench-shell-policy.test.ts` |
| TUI-F012 Test | TUI-F012-U01 | 질문별 검증 계획·근거 보기 | `projectAstraTestView()`, `AstraTestView` — `features/test/astra-test-view.ts`; `/test`, Astra F9/화면 메뉴 | 현재 질문별 검증 목적, 검사, 목표 및 증거를 읽으며 완료 계획과 확인된 검증 결과를 구분 | `request-test-workspace.test.ts`, `astra-ui.test.ts`, `workbench-shell-policy.test.ts` |
| TUI-F013 Approval | TUI-F013-U01 | Native 요청 승인·거절 | `ApprovalOverlay`, approval presentation; `/approve`, `/approve-session`, `/decline`, natural Chat decision — `features/approval/*`, `shell/workbench-shell.ts` | 요청 scope와 선택 가능한 결정만 보여주고 1회 승인·세션 승인·거절. Escape는 결정을 내리지 않고 닫음 | `approval-overlay.test.ts`, `approval-dispatch.test.ts`, `workbench-shell-policy.test.ts` |
| TUI-F014 Authentication | TUI-F014-U01 | Provider 로그인·인증 방식 선택 | `LoginOverlay`, `AuthFlowOverlay` — `features/authentication/auth-overlay.ts`; `/login [provider]` | Provider 및 OAuth/API key 방식을 선택하고 필요한 prompt 입력 후 인증 결과를 확인 | `auth-overlay.test.ts`, `slash-commands.test.ts`, `auth-service.test.ts` |
| TUI-F014 Authentication | TUI-F014-U02 | Provider 인증 삭제 | `auth.logout` handler — `commands/slash-commands.ts`, `shell/workbench-shell.ts`; `/logout <provider>` | 현재 turn 완료 뒤 지정 Provider의 저장 인증을 삭제하고 usage를 갱신 | `slash-commands.test.ts`, `workbench-shell-policy.test.ts`, `auth-service.test.ts` |
| TUI-F015 Model Selection | TUI-F015-U01 | 모델·추론 강도 선택 | `ModelPickerOverlay`, `renderModelPickerView()`, `parseWorkbenchModelCommand()` — `features/model-selection/*`, `commands/slash-commands.ts`; `/model` | provider/model/effort 계층을 탐색해 적용을 확인. 인증 없는 선택은 인증 절차 뒤 staged 상태로 적용 | `model-picker-overlay.test.ts`, `astra-model.test.ts`, `native-model-catalog.test.ts`, `slash-commands.test.ts` |
| TUI-F016 Repository | TUI-F016-U01 | Git 작업 트리·Commit 조회 | `RepositoryActivityOverlay`; `/commits` — `features/repository/repository-overlays.ts`, `legacy/legacy-session-shell.ts` | 현재 branch/upstream 변경과 최근 commit을 읽고 `r`로 새로고침 | `repository-overlays.test.ts`, `repository-insights.test.ts`, `slash-commands.test.ts` |
| TUI-F016 Repository | TUI-F016-U02 | 열린 GitHub Issue 조회 | `IssueListOverlay`; `/issues` — `features/repository/repository-overlays.ts`, `legacy/legacy-session-shell.ts` | 열린 Issue 목록·label·갱신 일자를 읽고 `r`로 새로고침 | `repository-overlays.test.ts`, `repository-insights.test.ts`, `slash-commands.test.ts` |

## Feature별 후보 개수

| Feature ID | Registry title/key | 후보 수 |
|---|---|---:|
| TUI-F001 | Dashboard / dashboard | 2 |
| TUI-F002 | Chat / chat | 7 |
| TUI-F003 | Plan / plan | 2 |
| TUI-F004 | T-note / tnote | 4 |
| TUI-F005 | Trace / trace | 2 |
| TUI-F006 | Monitor / monitor | 3 |
| TUI-F007 | Session / session | 3 |
| TUI-F008 | Stats / stats | 2 |
| TUI-F009 | Usage / usage | 1 |
| TUI-F010 | Project Map / map | 1 |
| TUI-F011 | Context / context | 1 |
| TUI-F012 | Test / test | 1 |
| TUI-F013 | Approval / approval | 1 |
| TUI-F014 | Authentication / authentication | 2 |
| TUI-F015 | Model Selection / model-selection | 1 |
| TUI-F016 | Repository / repository | 2 |
| **합계** | **16 features** | **35** |

## 300행 초과 파일 책임 경계 감사

line 수는 조사 당시 `wc -l` 결과다. 아래 declaration 범위는 그 시점 파일의 1-based line을 포함한다. Type/interface 선언은 API shape이므로 기능 책임 범위에 포함하되 함수/class별로 구분해 적었다.

### `features/chat/work-step-card.ts` — 715행

| 함수 / class | 라인 | 실제 책임 |
|---|---:|---|
| `clean` | 102–105 | ANSI 제어문자·공백 제거 |
| `replacePathPrefix` | 106–114 | 경로 prefix 치환 |
| `projectNativePathText` | 115–120 | home/project 경로를 공개 표시 문자열로 투영 |
| `fit` | 121–125 | 폭 채우기 |
| `record` | 126–131 | unknown 객체를 record로 좁힘 |
| `firstValue` | 132–142 | 여러 입력 record에서 우선 필드를 검색 |
| `stringValue` | 143–148 | 값의 표시 문자열 추출 |
| `mcpContent` | 149–159 | MCP content 배열의 텍스트 결합 |
| `numberValue` | 160–163 | 유한 숫자 필드 추출 |
| `hiddenKey` | 164–192 | secret/reasoning 계열 필드 판별 |
| `publicValue` | 193–207 | 깊이·항목 제한과 민감 필드 제거를 적용한 재귀 projection |
| `publicPayloadProjection` | 208–211 | 공개 payload projection 진입점 |
| `displayValue` | 212–219 | 값 표시 문자열/경로 투영 |
| `highlightStructured` | 220–228 | bash/json/yaml/markdown structured text highlight |
| `isWithinStructuredDisplayBudget` | 229–233 | 구조화 표시 크기 제한 판정 |
| `prettyJson` | 234–242 | JSON 검증·pretty print |
| `prettyYaml` | 243–256 | path 근거 YAML pretty print/fallback |
| `structuredOutput` | 257–275 | 입력/출력에서 JSON/YAML/bash 언어 판별과 formatting 선택 |
| `statusOf` | 276–290 | command observation 상태 결정 |
| `methodLabel` | 291–295 | Native method를 읽기 좋은 label로 변환 |
| `toolLabel` | 296–302 | 여러 activity payload에서 tool 이름 선정 |
| `projection` | 303–417 | WorkStepCard 입력에서 status, tool, path, input/output, duration 등의 공개 display DTO 구성 |
| `bashStatusSymbol` | 418–422 | Bash 상태 기호 선택 |
| `bashBar` | 423–437 | 실행 시간/상태 rail 렌더 |
| `bashContent` | 438–442 | Bash 한 줄 경계와 border 처리 |
| `bashOutputLines` | 443–458 | Bash 출력 행 구성·제한 |
| `renderBashExecutionBlock` | 459–498 | Bash 전용 실행 결과 card 렌더 |
| `executionLineTone` | 499–529 | command/output 의미색상 분류 |
| `highlightedSource` | 530–533 | 구조화 bash/json 강조 적용 |
| `highlightedWhat` | 534–537 | 카드 요약 문구 강조 |
| `renderExecutionLine` | 538–573 | 한 실행 줄 포맷 |
| `boundedRows` | 574–601 | 행 수·폭 제한 |
| `WorkStepCard` | 602–641 | command/tool 실행 단계 카드 render |
| `ObservationCard` | 642–672 | 별도 관측 결과 카드 render |
| `activityLabel` | 673–682 | activity 종류와 phase label 생성 |
| `actionLabel` | 683–693 | Bash/Edit/Tool 분류 label 생성 |
| `observationLabel` | 694–701 | shell 명령 이름에서 observation label 생성 |
| `compactObservationOutput` | 702–712 | observation 결과 축약 |
| `isVisibleWorkStep` | 713–715 | 사용자가 볼 실행 종류 판정 |

판정: 민감정보 projection, Native event에서 카드 DTO를 만드는 과정, Bash 특화 출력 렌더링, 일반 실행/관측 컴포넌트가 한 파일에 함께 있다. 주요 단계는 개별 함수/class로 코드 수준에서 나뉘어 있지만 파일 책임은 둘 이상으로 독립 가능하다. 추가 분리 후보는 (1) 공개 payload/execution projection, (2) Bash 및 structured output renderer, (3) 일반 WorkStep/Observation component이다. 수집만으로 동작 결함을 뜻하지는 않는다.

### `features/chat/workbench-views.ts` — 653행

| 함수 / class | 라인 | 실제 책임 |
|---|---:|---|
| `fit` | 28–33 | 폭 채우기 |
| `surfaceRows` | 34–37 | 행별 표면 color/폭 적용 |
| `transcriptRows` | 38–42 | transcript 행 폭 자르기 |
| `activityOwnerKey` | 43–47 | activity native ID 기반 소유자 키 |
| `nativeOwnerKey` | 48–52 | nativeRefs/fallback ID 정규화 |
| `sameActivityOwner` | 53–59 | live/observed activity 동일 소유자 대조 |
| `turnOwnerKey` | 60–62 | thread/turn 복합키 생성 |
| `boundedWorkbenchMarkdown` | 63–84 | markdown 문자·행 상한 projection |
| `publicRecord` | 85–90 | 공개 payload record narrowing |
| `publicText` | 91–96 | 제한된 공개 문자열 투영 |
| `publicTimelineActivityRows` | 97–154 | Native plan/collaboration/reasoning 등 공개 lifecycle 행 projection |
| `WorkbenchChatView` | 155–641 | Chat snapshot, Markdown cache, live activity, command cards, transcript render를 조립하는 stateful component |
| `WorkbenchChatView.constructor` | 175–184 | snapshot·welcome·승인 presentation 주입 |
| `update` | 185–233 | snapshot과 assistant Markdown/cache 동기화 |
| `invalidate` | 234–280 | cache 무효화와 activity timer state 조정 |
| `dispose` | 281–285 | live activity timer 정리 |
| `render` | 286–510 | 메시지, Native lifecycle, 실행/관측 카드, 오류·partial/queue/활동 행을 시간순으로 합성 |
| `activityRows` | 511–530 | 진행 indicator와 취소 hint 렌더 |
| `refreshCachedActivityRows` | 531–539 | 캐시된 동적 activity 행 갱신 |
| `renderMessage` | 540–590 | user/assistant 메시지와 Markdown 표시 |
| `renderDraft` | 591–595 | assistant streaming draft 표시 |
| `stopActivity` | 596–602 | activity interval 종료 |
| `renderStepCard` | 603–640 | WorkStepCard용 입력 projection·cache와 Trace/source 부가행 렌더 |
| `hasVisibleChatContent` | 642–649 | welcome 종료 조건 판정 |
| `commandStatus` | 650–653 | WorkStep 상태를 command card 상태로 변환 |

판정: cache 갱신, snapshot 기반 timeline assembly, live indicator lifecycle, 메시지/초안 표시가 하나의 Chat component로 묶였다. helper와 private method 수준은 분리돼 있으나 `render()`(286–510)가 여러 종류의 이벤트를 순서 조정하고 `renderStepCard()`도 카드 projection/cache를 소유한다. 테스트는 큰 화면 조립과 세부 projection을 모두 직접 import한다. 추가 분리 후보는 (1) 공개 lifecycle timeline projector, (2) live activity indicator lifecycle, (3) transcript/cache와 실행 카드 assembler다. 이들은 같은 Chat screen의 변경 이유를 나누므로 필요한 경계로 보인다.

### `features/model-selection/model-picker-overlay.ts` — 324행

| 함수 / class | 라인 | 실제 책임 |
|---|---:|---|
| `ModelPickerOverlay` | 47–324 | model chooser wizard의 상태·화면·입력·비동기 catalog/auth/apply 전체 |
| `constructor` | 61–88 | 현재 선택·provider subset·native 옵션 초기화 |
| `start` | 89–126 | 필요한 provider auth 상태와 Native catalog 로드 |
| `invalidate` | 127–128 | component invalidate 구현(빈 메서드) |
| `render` | 129–143 | step과 현재 선택 상태의 view model을 picker renderer에 전달 |
| `handleInput` | 144–153 | keyboard 이동·확정·취소 입력 처리 |
| `breadcrumb` | 154–160 | provider/model/effort/confirm 단계 표시 |
| `rows` | 161–195 | 현재 단계의 선택지와 상태 안내 구성 |
| `visibleRows` | 196–204 | 폭/height 기준 선택지 slice |
| `row` | 205–210 | 선택 행 marker/badge 구성 |
| `move` | 211–218 | 선택 cursor 이동 |
| `optionCount` | 219–224 | 현재 단계 option 개수 계산 |
| `efforts` | 225 | 선택 model의 추론 강도 반환 |
| `defaultEffort` | 226 | catalog 기본 노력 수준 반환 |
| `models` | 227 | static/native model 목록 반환 |
| `catalogNotice` | 228–234 | catalog loading/error/empty 상태 notice |
| `forward` | 235–264 | 선택 wizard에서 다음 단계 이동·auth 요구 판정 |
| `back` | 265–286 | 이전 단계로 이동하거나 overlay 종료 |
| `authBadge` | 287–294 | provider별 인증 상태 표시 |
| `apply` | 295–324 | staged setting 적용 및 실패 시 confirm 단계 유지 |

판정: 코드상 단계 이동, row 렌더, provider/auth/catalog 조회, 적용 책임은 각 method로 분리돼 있다. 324행이지만 사용자 목적은 하나의 계층형 모델 선택 wizard이며 현재 stateful shell에 맞는 한 component다. 별도 view-model/render module로 추출할 여지는 있으나 이 조사에서 필수 추가 분리 대상으로 판정하지 않는다.

## 배선 및 후보 경계 메모

- `feature-registry.ts`의 `kind: page|embedded|interaction` 및 `route`는 descriptor 수준 메타데이터다. 동작 연결 증거는 shell import/constructor, view host, command handler에서 별도로 확인했다.
- `TNotesSourceView`는 export되고 `workbench-views.test.ts`가 직접 여러 상태를 렌더하지만 현재 Workbench shell import/constructor에는 나오지 않는다. `/tnotes` 명령은 `pane.show`로 parse되지만 현 Workbench handler는 안내 notice만, Astra는 실행 타임라인 안내만 내보낸다. 따라서 TUI-F004-U01은 구현된 화면이라 단정하지 않고 **배선 미확인 후보**로 둔다.
- `MonitoringOverlay`, `RepositoryActivityOverlay`, `IssueListOverlay`, Router의 Planning 명령은 `legacy/legacy-session-shell.ts`에서 실제 연결된다. 이것은 `WORKBENCH_SLASH_COMMANDS` 기반 Native 경로와 다르다.
- `WorkbenchTelemetryLine`은 `workbench-shell.ts`에서 생성·refresh·dispose되지만 `root`의 child list에 표시되지 않는다(그 자리는 AstraHud 또는 `WorkbenchBottomHudView`). 테스트는 formatter 자체만 확인한다. 그러므로 현재 UI 사용자 Unit으로 세지 않았다. 배선이 의도된 표시인지 여부는 별도 확인 과제다.
- `StatusLine`은 command receipt/notice를 표시하는 shell 공통 피드백으로, 별도 사용자 목적을 수행하지 않아 독립 Unit으로 세지 않았다.
- Registry 외부의 command/service 소유자가 섞이는 후보(예: Workflow, project planning draft)는 표에 실제 parser/dispatcher owner와 legacy 여부를 적었다. Feature ID 귀속은 제안이며 기능 오너십 확정 판정은 아니다.

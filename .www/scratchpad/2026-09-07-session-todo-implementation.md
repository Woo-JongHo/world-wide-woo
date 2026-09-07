# WOO-702 세션별 Todo identity·보존·재개 구현 전문

## 3–5줄 요약

- 세션 Todo에 Input, turn, Plan revision, 원본 item identity, 관측된 model/agent 실행 참조를 strict metadata로 저장하고 파일 재개 round trip을 연결했다.
- 더 오래됐거나 다른 thread의 Plan은 현재 Todo를 덮지 않으며, item identity는 삽입·재정렬·편집·중복 replay에서 유지된다.
- source 없는 legacy 문서는 미관측 model/agent 상태로 읽고 원문을 보존한다. 비어 있지 않은 legacy는 재개 자동 동기화에서 제외한다.
- 대상 `137/137`, 전체 `630/630`, typecheck와 diff check가 통과했다. 실제 Native 수락은 세 번 실행했으나 현재 App Server가 Plan을 발행하지 않아 실패했고, TUI 수락도 미실행이다.

## 조사 범위

Linear의 WOO-702와 부모 WOO-682, 인접 WOO-700·701·703 본문을 읽고 기준 HEAD `d35b2bbb1f784a0f177c6e80453ce634d6d93d74`의 Todo domain, ledger, FileTodoStore, Workbench resume/sync 경계를 대조했다. WOO-701은 저장된 모델과 실행 agent를 화면에 표시하는 계약을 소유하고, WOO-703은 충돌 및 실패 UX를 소유한다. 이번 작업은 그 계약이 읽을 수 있는 durable source metadata와 재개 동기화까지만 다룬다.

## 설계 결정

### source identity와 표시 ID

Native Plan item의 64자 source identity를 `TodoNativePlanItemSource.identity`에 그대로 저장한다. 기존 표시 ID 형식을 유지하기 위해 `native-<48자 prefix>`를 사용하되, 서로 다른 원본 identity가 같은 prefix를 만들면 저장 전에 실패한다. 배열 위치나 문구를 ID에 사용하지 않으므로 삽입, 재정렬, 편집에서 identity가 바뀌지 않는다.

각 item은 origin revision과 current revision을 함께 저장한다. document Plan revision과 item current revision이 다르면 parse/validation 단계에서 거부한다. item execution 목록에는 document root execution이 반드시 포함되어야 한다.

### 최신성 및 소유권

Todo의 현재 source와 incoming source의 `threadKeyDigest`를 먼저 비교한다. digest가 다르면 foreign source로 보고 아무 write/event도 만들지 않는다. 같은 digest에서는 journal sequence가 높은 revision만 갱신한다. 같은 sequence라면 revision digest, activity, source digest, turn이 모두 같아야 동일 source의 보강 또는 replay로 받아들인다.

이 규칙은 늦게 도착한 이전 Plan과 다른 thread의 Plan이 현재 문서를 덮는 것을 막는다. 동일 revision에서 Input 관측이 늦게 durable journal에 나타나면 source metadata만 보강할 수 있다.

### model/agent 관측

Workbench는 현재 선택 모델을 Todo의 과거 실행 모델로 쓰지 않는다. Plan source의 turn과 root thread가 정확히 일치하는 `request/started` activity가 있을 때만 그 activity의 request ID, source digest, payload model을 binding으로 만든다. provider와 agent ID는 현재 journal request 표면에서 관측되지 않으므로 `null`이다. 재개 journal에 model이 없으면 session option에 모델이 있어도 `null`로 남는다.

TodoLedger에 한 번 관측 binding이 저장된 뒤, 내부 replay 호출이 binding을 생략하면 같은 thread/turn에서 기존 binding을 재사용한다. 이는 이미 확인한 값이 unknown으로 퇴행하는 것을 막기 위한 방어다.

### legacy와 새 요청 전환

`source`는 optional이다. reference-free 기존 Markdown은 source와 item source가 없는 문서로 읽히며 model/agent/Plan은 미관측이다. read 자체는 파일을 쓰지 않고, 같은 문서를 patch하면 관리 밖 Markdown과 각 줄의 LF/CRLF를 포함해 바이트가 유지된다.

재개 시 비어 있지 않은 source-free 문서는 자동 Plan sync 대상에서 제외한다. 사용자가 보던 기존 projection을 관측 근거 없이 새 형식으로 재작성하지 않기 위해서다. source-free 빈 문서는 기존 bootstrap 계약에 따라 재개 journal의 Plan으로 전환한다. 새 Native 요청에서 실제 Plan이 관측되면 session Todo의 관리 영역은 그 요청으로 갱신되며 FileTodoStore는 관리 밖 Markdown을 보존한다.

현재 화면은 source-free legacy의 unknown model/agent 상태를 직접 설명하지 않는다. WOO-701 표시 계약과 합쳐 실제 화면에서 오해가 없는지 검증해야 한다.

### 상태 의미

Native Plan status는 기존 Todo status projection을 그대로 사용한다. 이번 구현은 `turn/completed`, Plan item 완료, 작업 수락을 하나의 상태로 합치지 않으며 별도의 수락 플래그를 만들지 않는다. 실제 TUI에서 그 차이가 유지되는지는 통합 QA 범위다.

## TDD와 검증

Red에서는 source metadata 부재, late/foreign overwrite, source-bound resume 미갱신, 동일 revision Input 보강 실패를 확인했다. 구현 후 domain round trip과 fail-closed validation, TodoLedger authority 비교, FileTodoStore 실제 파일 round trip, Fake Native Workbench binding, 두 thread의 경로 격리, resume 갱신을 통과시켰다.

- 대상: `137 pass / 0 fail / 5 files / 695 assertions`
- 타입: `bun run check`, exit 0
- 전체: `630 pass / 0 fail / 73 files / 4256 assertions`
- `git diff --check`, exit 0
- skip/only/debug/placeholder 검색 결과 없음

## 증거 해석과 남은 통합

FileTodoStore 테스트는 임시 디렉터리에 실제 Markdown 파일을 쓰고 읽는다. Workbench와 session 테스트는 Fake Native 및 memory/tracking store fixture다.

실제 `CodexAppServer` 0.153.4, `gpt-5.6-sol`, low, ephemeral thread, read-only sandbox, approval never 조건으로 production `createProjectWorkbenchSession`을 열었다. production 조립의 `ThreadScopedTodoSource`와 `FileTodoStore`를 그대로 사용하고, App Server 하나를 Workbench close보다 오래 유지해 같은 ephemeral thread 재개까지 이어갈 수 있는 probe를 작성했다. 첫 실행은 Plan collaboration mode, 둘째는 default mode에서 `update_plan` 명시, 셋째는 Plan mode와 terminal-aware 진단이었다. 세 요청 모두 실제 `turn/completed`까지 정상 종료했지만 `turn/plan/updated`가 0건이었고 Workbench의 workflow source와 Todo는 null이었다. 셋째 실행의 공개 item type은 `userMessage`, `reasoning`, `agentMessage`, `commandExecution`뿐이며 `plan`, `dynamicToolCall`, 공개 tool name은 없었다. 따라서 모델이 `update_plan`을 호출했는데 adapter가 버린 사례가 아니라, 현재 실제 Native가 이 요청들에서 Plan 자체를 발행하지 않은 사례다.

현재 App Server experimental schema에는 `turn/plan/updated`, `PlanThreadItem(type: "plan")`, `item/plan/delta`가 모두 존재한다. WWW adapter는 notification을 일반적으로 전달하지만 Workbench→Todo 동기화는 `turn/plan/updated`만 authority로 사용한다. 실제 run에서는 별도 `plan` item도 없었으므로 이 경로가 지금 데이터를 잃었다고 판정할 수 없다. 향후 실제 서버가 `plan` item만 발행한다면 별도 계약 확장이 필요하지만, 이번 WOO-702 source를 추측으로 확장하지 않았다.

결과적으로 실제 Plan→Todo.md 저장, metadata 재읽기, ephemeral thread 재개, 다른 실제 Native thread 파일 격리는 시작 조건인 actual Plan 부재로 실행되지 않았다. fake event를 actual로 승격하지 않으며 WOO-702 전체 수락 완료를 주장하지 않는다. 실패 원문과 process exit는 [native-qa.log](../evidence/2026-09-07-session-todo/native-qa.log)에 보존했다. 재개 전후 Todo 표시, source-free unknown 표시, 새 요청 전환의 사용자 인지는 WOO-701 표시 계약과 합쳐 실제 TUI QA가 필요하다.

WOO-703 conflict/failure UX와 Monitor/Dashboard는 건드리지 않았다. 이 base에는 이번 변경이 추가해야 할 traceability 원장이 없고 WOO-695가 Map snapshot/annotation 연결을 담당하므로 임의 파일을 만들지 않았다. 정식 근거는 [receipt](../evidence/2026-09-07-session-todo/receipt.md)에 있다.

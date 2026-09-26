# WWW 코드 가독성 지도

작성일: 2026-09-21  
범위: `src/**/*.ts` 258개  
근거: [정규화 인벤토리](../../.www/evidence/2026-09-21-code-readability-map/inventory.json), `LAYERS.md`, 실제 진입점과 호출 경계

## 결론

가독성 개선의 첫 대상은 파일 길이만 긴 곳이 아니라 **사용자 입력, 실행기 이벤트, 런타임 상태, 화면 projection이 한데 만나는 Native Workbench 경로**다. `ProjectWorkbench` 하나가 2,934 LOC, 분기 토큰 1,087개, 타입 불확실성 표식 479개를 가지며 기본 실행 흐름의 중심에 있다. 이 파일을 포함한 Native 경로의 다섯 파일은 네 가지 위험 신호가 모두 겹친다.

다만 이 수치는 정규식 기반 우선순위 신호이지 복잡도 판정이나 자동 수정 목록이 아니다. 실제 개선은 파일 하나씩 정의·호출자·테스트를 읽고, 공개 계약과 부재 의미를 먼저 고정한 뒤 구조 간결화와 표현 정렬을 분리해 진행한다.

## 조사 기준선

Luna가 수집한 파일 목록을 현재 저장소의 `src/**/*.ts`와 대조했다. 입력 258개는 모두 고유하며 현재 경로 집합과 정확히 일치했다. 누락, 추가, 중복은 각각 0개다.

| 지표 | 값 |
|---|---:|
| TypeScript 파일 | 258 |
| 전체 LOC | 36,382 |
| 함수 유사 구문 | 4,932 |
| 분기 토큰 | 13,627 |
| import / dynamic import | 997 / 23 |
| 타입 불확실성 표식 합계 | 5,566 |
| 최대 표시 행 길이 | 1,170 |
| 120열 초과 파일 | 193 (74.8%) |
| 240열 초과 파일 | 73 (28.3%) |
| 500 LOC 이상 파일 | 10 |
| 분기 토큰 200 이상 파일 | 10 |
| 타입 불확실성 100 이상 파일 | 9 |

타입 불확실성 합계는 optional 2,857, `null` 1,457, `undefined` 622, non-null assertion 94, type assertion 536의 합이다. 이들은 제거 대상 수가 아니라 생략·부재·좁히기·경계 변환을 확인할 조사 모수다.

수집 시점에 dirty로 표시된 파일은 `src/cli.ts`, `src/adapters/outbound/development/development-cli.ts`, `src/adapters/outbound/development/local-workflow-cli.ts` 세 개다. 이 작업의 소유권과 공개 계약 보존 범위는 Linear `WOO-911`과 `.www/evidence/2026-09-21-cli-readability/`에 결속했다. 나머지 wave에서는 기존 변경의 소유권을 확인하지 않은 dirty 파일을 가독성 수정 대상에서 격리한다.

### 계층별 밀도

| 계층 | 파일 | LOC | 함수 유사 | 분기 토큰 | 타입 불확실성 | 120열 초과 |
|---|---:|---:|---:|---:|---:|---:|
| `adapters/inbound/tui` | 106 | 11,251 | 1,552 | 3,934 | 1,599 | 70 |
| `adapters/outbound` | 66 | 9,313 | 1,477 | 3,622 | 1,323 | 58 |
| `core/application` | 26 | 7,026 | 723 | 2,396 | 1,049 | 23 |
| `core/domain` | 43 | 6,913 | 882 | 2,741 | 1,242 | 33 |
| `core/runtime` | 2 | 569 | 149 | 612 | 208 | 2 |
| `composition/root` | 4 | 542 | 79 | 74 | 14 | 2 |
| `core/commit` | 1 | 131 | 11 | 72 | 16 | 1 |
| `core/other` | 3 | 211 | 29 | 104 | 70 | 3 |
| `core/ports` | 6 | 296 | 9 | 28 | 36 | 1 |
| `adapters/inbound/other` | 1 | 130 | 21 | 44 | 9 | 0 |

Inbound TUI와 Outbound Adapter가 파일 수의 66.7%, LOC의 56.5%를 차지한다. 반면 `core/runtime` 두 파일은 569 LOC 안에 분기 토큰 612개와 타입 불확실성 208개가 모여 있어, 크기보다 상태 전이 밀도가 높은 별도 hotspot이다.

## 사람이 읽는 네 가지 실행 흐름

### 1. Native Workbench 시작과 화면 조립

```text
src/cli.ts
  runCli → dispatchCommand
    ↓
src/app.ts
  runApp / runAstra
    ↓
src/adapters/outbound/workspace/project-workbench-session.ts
  createProjectWorkbenchSession
    ↓
src/core/application/orchestration/project-workbench.ts
  ProjectWorkbench
    ↓
src/adapters/inbound/tui/shell/workbench-shell.ts
  runProjectWorkbenchShell
```

읽을 때는 `cli.ts`의 명령 선택, `app.ts`의 production 조립, session factory의 리소스·lease 생성, `ProjectWorkbench`의 상태와 명령, shell의 화면·입력 바인딩 순서로 내려간다. 동적 import 23개 중 16개가 composition root 네 파일에 있으므로, import 정리는 시작 화면을 먼저 보여 주는 지연 로딩과 명령별 선택 로딩을 보존해야 한다.

주요 가독성 위험은 session factory의 생성·정리 책임, Workbench의 거대한 명령/state machine, shell의 화면 조립·키 입력·명령 전달·종료 lifecycle이 한 파일 안에서 길게 이어지는 점이다.

### 2. Native 요청 실행, 승인, projection

```text
workbench-shell.ts의 chat.send
    ↓
ProjectWorkbench.dispatch / 요청 intake
    ↓
ExecutorPort ─→ codex-app-server.ts ─→ Native thread / turn 이벤트
    ↓                                ↘ Runtime tool call
ActivityJournal                       request-controller.ts
    ↓                                      ↓
core/runtime/{execution-run,request-runtime}.ts
    ↓
Todo · T-note · Observability · Chat projection
    ↓
www-execution.ts와 각 Feature view
```

이 흐름에서는 "명령을 받음", "Native turn을 시작함", "승인을 기다림", "이벤트를 기록함", "runtime action을 실행함", "화면용 상태로 투영함"을 구분해서 읽어야 한다. `ProjectWorkbench`, `codex-app-server`, 두 runtime reducer, `request-controller`, `astra-execution`을 한 덩어리로 축약하면 protocol version, revision, 승인 freshness, 불확실한 외부 쓰기 정산이 숨는다.

개선 시 가장 먼저 보존할 경계는 `ExecutorPort`, request action/projection port, Native thread·turn ID, activity payload, request revision, approval receipt다. 화면 표현은 이 기록을 다시 추론하지 않고 동일한 Runtime/Domain projection을 소비해야 한다.

### 3. 호환 Legacy Router 세션

```text
src/cli.ts의 router 명령
    ↓
src/legacy-router-app.ts
  runLegacyRouter
    ↓
src/adapters/outbound/workspace/project-session.ts
  createProjectSession
    ↓
src/core/application/session/session-runtime.ts
  SessionRuntime + RouterService
    ↓
src/adapters/inbound/tui/legacy/legacy-session-shell.ts
```

이 경로는 기본 Native Workbench와 분리된 호환 진입점이다. `SessionRuntime`은 1,157 LOC이고 저장 이벤트 재생, tool call, todo evidence, 완료·취소 상태를 함께 다룬다. Native 흐름과 이름이 비슷하더라도 thread·turn 계약과 Legacy session 계약을 합치지 않는다. 인증 저장소, provider/model 선택, session event replay, lease 인계가 호환 공개 계약이다.

### 4. 개발 기록과 로컬 RPA 제어 plane

```text
src/cli.ts
  ├─ development
  │    ↓
  │  development-cli.ts → DevelopmentService
  │    ↓
  │  development-store / map / traceability / Obsidian · SQLite adapter
  │
  └─ workflow
       ↓
     local-workflow-cli.ts → local-workflow.ts
       ↓
     core/workflows/skill-run.ts → receipt / monitor
```

두 명령은 제품 대화 실행과 달리 개발 원장과 RPA 실행 기록을 다루는 운영 제어 plane이다. `development-store`는 485 LOC에 분기 토큰 351개가 있고, `development-traceability-contract.ts`와 `skill-run.ts`는 각각 최대 1,009열과 1,170열의 단일 행을 가진다. 긴 행을 공백 정렬로 덮지 말고, ID·revision·digest·Receipt의 의미 단위를 먼저 확인한 뒤 여러 줄 계약이나 역할별 블록으로 나눌 후보인지 판정한다.

## Hotspot

다음 표는 네 신호 중 둘 이상이 겹친 12개 파일이다. 신호는 `LOC ≥ 500`, `분기 토큰 ≥ 200`, `최대 표시 행 > 240`, `타입 불확실성 ≥ 100`이다.

| 파일 | LOC | 분기 | 최대 열 | 타입 불확실성 | 겹친 신호 | 읽기 병목 |
|---|---:|---:|---:|---:|---:|---|
| `core/application/orchestration/project-workbench.ts` | 2,934 | 1,087 | 339 | 479 | 4 | 기본 명령·turn·승인·runtime·projection 조정 |
| `adapters/inbound/tui/shell/workbench-shell.ts` | 1,202 | 464 | 327 | 218 | 4 | 화면 조립·입력·명령·lifecycle |
| `adapters/outbound/execution/codex-app-server.ts` | 854 | 274 | 285 | 112 | 4 | App Server protocol·stream·승인 변환 |
| `adapters/inbound/tui/features/chat/view/www-execution.ts` | 769 | 390 | 596 | 105 | 4 | 대화 projection·materialization·render 상태 |
| `core/domain/observability/session-stats.ts` | 517 | 242 | 298 | 175 | 4 | 통계 집계와 다수 부재 상태 |
| `core/application/session/session-runtime.ts` | 1,157 | 232 | 185 | 132 | 3 | Legacy event state machine과 tool loop |
| `adapters/outbound/workspace/project-workbench-session.ts` | 529 | 113 | 311 | 113 | 3 | 리소스 조립·journal scope·lease |
| `core/runtime/execution-run.ts` | 311 | 272 | 339 | 126 | 3 | 실행 reducer와 receipt 상태 전이 |
| `core/domain/observability/runtime-monitor.ts` | 158 | 208 | 546 | 102 | 3 | 작은 파일에 밀집된 관찰 상태 조합 |
| `core/domain/work/t-notes.ts` | 514 | 168 | 301 | 30 | 2 | 문서 projection과 파싱 흐름 |
| `adapters/outbound/development/development-store.ts` | 485 | 351 | 504 | 92 | 2 | SQLite 명령·변환·분기 밀집 |
| `core/runtime/request-runtime.ts` | 258 | 340 | 575 | 82 | 2 | request protocol reducer와 revision 검사 |

단일 신호지만 구조 확인이 먼저 필요한 최대 행 outlier도 있다.

| 파일 | 최대 열 | 해석 |
|---|---:|---|
| `core/workflows/skill-run.ts` | 1,170 | 큰 상태/receipt 객체를 한 행에 구성하는지 확인 |
| `adapters/outbound/development/development-traceability-contract.ts` | 1,009 | 계약 데이터와 반복 필드를 역할별 블록으로 나눌 수 있는지 확인 |
| `core/domain/work/delegation.ts` | 706 | delegation union·projection의 필수 도메인 정보와 표시 폭을 분리 |
| `adapters/inbound/tui/features/session/observability-dashboard-view.ts` | 671 | view 데이터와 render 문장을 분리할 수 있는지 확인 |
| `core/application/orchestration/request-controller.ts` | 644 | validation, authorization, execution, reconciliation 단계 분리 여부 확인 |

최대 행 길이는 그 자체로 결함이 아니다. 생성된 literal, schema, 메시지 문장처럼 보존할 데이터일 수 있으므로 정의·호출자·테스트를 읽기 전에는 줄바꿈이나 타입 별칭을 처방하지 않는다.

## 개선 Wave

### Wave 0 — 기준선과 충돌 격리

- 수집 당시 dirty 세 파일의 기존 변경 소유권과 의도를 먼저 확정한다. 이번 첫 slice는 WOO-911로 이를 완료했다.
- 각 대상 파일마다 호출자, 행동 테스트, 동적 import, 공개 export를 좁게 기록한다.
- AST 기반 타입 불확실성 목록과 현재 관련 테스트를 기준선으로 남긴다.
- 한 wave를 일괄 포맷하지 않고 제품 파일 하나씩 후보 diff와 검증을 끝낸다.

### Wave 1 — 기본 Native 실행 경로

우선 조사 대상은 `project-workbench.ts`, `workbench-shell.ts`, `codex-app-server.ts`, `www-execution.ts`, `project-workbench-session.ts`, `request-controller.ts`다. 사용자 요청 한 번이 지나가는 전 구간이며 다중 신호가 가장 많이 겹친다.

저작 순서는 blast radius가 작은 projection·adapter에서 시작해 shell·session 조립을 거친 뒤 orchestrator로 들어간다. `ProjectWorkbench`는 조사 우선순위는 1위지만, 외부 경계와 불변식을 먼저 확보한 뒤 수정한다. 모듈 분리가 필요해지면 단순 가독성 작업으로 넘기지 말고 `LAYERS.md`의 Core/Adapter 경계와 아키텍처 게이트를 별도로 적용한다.

### Wave 2 — Runtime과 공유 projection

`core/runtime/request-runtime.ts`, `core/runtime/execution-run.ts`, `session-stats.ts`, `runtime-monitor.ts`, `todo-ledger.ts`, `todos.ts`, `t-notes.ts`, `workflow-projection.ts`를 다룬다. 목표는 reducer의 입력 → 검증 → 전이 → receipt/projection 순서를 드러내고, 같은 부재 상태가 계층마다 `null`과 `undefined`로 번역되는 지점을 줄이는 것이다.

이 wave는 타입 표식을 가장 많이 지우는 경쟁이 아니다. 이벤트 재생과 기존 영속 데이터에 필요한 optional은 유지하고, 함수 진입 뒤 좁힐 수 있는 값과 근거 없는 assertion만 분리한다.

### Wave 3 — 개발 기록과 RPA 제어 plane

`development-store.ts`, `development-traceability-contract.ts`, development map/validator, `skill-run.ts`, local workflow 경로를 다룬다. ID, revision, digest, 경로, read-back 결과처럼 지속 계약인 셀과 SQLite·filesystem 구현 세부사항을 분리한다. 수집 시 dirty였던 두 CLI 파일은 후속 작업 시작 시 상태를 다시 확인한 뒤 이 wave에 편입한다.

### Wave 4 — Legacy 호환과 long tail

`session-runtime.ts`, `legacy-session-shell.ts`, `legacy-router-app.ts`를 먼저 다룬 뒤, `slash-commands.ts`, `agent-tools.ts`, `review-adapters.ts`와 나머지 120열 초과 파일을 책임 폴더별로 순회한다. 호환 흐름은 Native 계약과 통합하지 않고 자체 테스트와 저장 event replay를 기준으로 개선한다.

Long tail은 193개를 자동 정렬하지 않는다. `src/cli.ts`의 수락된 `import`, `:`, `=>`, `case` 축을 기준 샘플로 삼아 같은 역할의 반복 블록에 적용한다. 120열은 새 구조를 분리할지 검토하는 신호로만 사용하며 기준 파일 자체는 후속 수정 대상에서 제외한다.

## 공개 계약 보존 원칙

1. **관찰 가능한 CLI/TUI 동작**: 명령 이름, 옵션, 도움말 의미, 키 바인딩, 화면 전환과 종료 순서를 보존한다.
2. **Core와 Port 계약**: exported type, command/receipt union, Port method, Domain invariant를 표시 폭을 줄이기 위해 새 별칭 뒤에 숨기거나 합치지 않는다.
3. **영속·protocol 계약**: Native thread/turn ID, Legacy session ID, activity payload, request protocol version/revision, Code·RPA ID, digest와 receipt status를 보존한다.
4. **부재 의미**: 생략 가능한 속성, 명시적 선택 취소의 `null`, 아직 정해지지 않은 내부 상태를 같은 값으로 뭉치지 않는다. 경계에서 정규화한 뒤 내부 타입을 좁힌다.
5. **외부 쓰기와 승인**: action prepared/completed, 승인 freshness, reconcile, lease 해제, close/dispose 순서는 읽기 쉬움을 이유로 재배치하지 않는다.
6. **지연 로딩**: composition root의 dynamic import는 시작 성능과 명령별 dependency 선택 계약으로 보고 실제 로딩 동작을 확인한 뒤 바꾼다.
7. **TUI metadata**: Feature descriptor와 `TUI-F###-U##`는 화면 탐색 metadata이며 지속 Code Unit과 합치지 않는다. sibling Feature 직접 참조 금지와 Foundation 경계를 유지한다.
8. **검증 가능한 한 파일 단위**: 구조 간결화와 표현 정렬을 분리해 보고하고, 관련 행동 테스트·타입 검사·아키텍처 검사·diff 공백 검사를 통과한 뒤 다음 파일로 이동한다.

## 이 지도의 사용법

파일을 고를 때 인벤토리의 `signals`를 우선순위 힌트로 사용하되, 다음 순서로 판정한다.

1. 네 실행 흐름 중 어디에 속하고 앞뒤 경계가 무엇인지 찾는다.
2. 반복 행의 최소 공통형과 가장 긴 예외 요소를 기록한다.
3. 예외를 필수 도메인 정보, 경계 정보, 구현 세부사항, 중복 표현으로 분류한다.
4. 공개 계약이면 유지하고, 구현 세부사항이면 제거·내부 결속·정규화·별도 표 분리를 검토한다.
5. optional·부재·assertion을 호출자와 테스트로 판정한다.
6. 보존된 실제 데이터만으로 열 폭을 다시 계산하되, 정본으로 지정된 기준 파일의 축은 변경하지 않는다.
7. 한 파일의 행동과 경계가 확인된 뒤에만 다음 파일로 넘어간다.

## 증거와 한계

- 정규화 JSON은 258개 unique path를 사전식으로 보존하고, 각 파일의 HEAD blob revision, 수집 당시 dirty 여부, 당시 working tree 기준 LOC·길이·구문 근사치, 타입 불확실성, 임계 신호를 담는다. 후속 수정 뒤 현재 파일 수치와 직접 비교하지 않는다.
- Luna의 개수는 정규식 기반 기계 수집이다. AST 복잡도, 실제 호출 빈도, 테스트 coverage를 뜻하지 않는다.
- 현재 경로 집합과의 일치는 조사 시점의 검증이다. 후속 wave를 시작할 때는 HEAD와 dirty 상태를 다시 확인한다.
- 이 문서는 흐름과 우선순위의 감사 정본이다. 제품 파일에 수동 함수 지도나 이 구조를 고정하는 테스트를 추가하지 않는다.

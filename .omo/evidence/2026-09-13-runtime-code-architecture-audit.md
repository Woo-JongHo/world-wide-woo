# Runtime / Code Architecture Audit — 2026-09-13

대상: `astra/terminal-ui` 현재 worktree

## 판정

현재 구조는 방향은 맞지만 유지보수 가능한 최종 구조로 보기는 어렵다.

- Native Executor와 Application Runtime의 개념 및 문서상 책임은 구분되어 있다.
- brokered Runtime의 revision 검증, 승인 결박, write-ahead 기록, 불명 결과 reconcile은 강한 편이다.
- 기본 Astra 요청은 Native passthrough이며 `/goal`만 관측형 7-stage Runtime을 선택한다.
- `--runtime-config`를 지정한 brokered v2만 Runtime tool path를 사용한다.
- Native가 가진 다른 도구 경로 전체를 broker가 차단한다는 strict isolation 증거는 없다.
- `ProjectWorkbench`가 요청 전달, Runtime, Native event reduction, approval, Todo, T-note,
  projection, snapshot을 함께 소유해 변경 locality가 낮다.

## 1. Native / Runtime 실행 구조

### 현재 흐름

```text
일반 Astra 요청
  -> ProjectWorkbench
  -> ExecutorPort.startTurn / steerTurn
  -> Native tool loop
  -> Native event
  -> activity journal
  -> Workbench snapshot / TUI

/goal 요청 (observational v1)
  -> 위 Native 흐름 + requestProtocolContext
  -> Native의 공개 [www-runtime] stage report
  -> activity journal replay
  -> RequestRuntimeRecord / Todo / TUI

--runtime-config 요청 (brokered v2)
  -> Codex dynamicTools
  -> RequestController
  -> identity/revision/stage/policy/approval 검사
  -> action-prepared journal append
  -> scoped capability adapter
  -> receipt 또는 unconfirmed
  -> replay / projection / reconcile
```

### 잘 된 부분

1. `ExecutorPort`가 Native 실행 seam을 제공하고 Codex/Pi adapter가 분리되어 있다.
2. Runtime tool 호출은 `RequestController`에서 request, turn, revision, stage와 효과를 검증한다.
3. 외부 action 전에 `action-prepared`를 기록하고, 결과 불명은 자동 재실행하지 않는다.
4. Activity journal이 정본이고 Request/Todo/TUI projection이 같은 기록에서 파생된다.
5. Runtime tool을 지원하지 않는 실행기에 capability를 연결하면 시작 단계에서 거절한다.

### 미완성 또는 위험한 부분

1. v1은 Native의 공개 보고를 관측할 뿐 행동을 통제하지 않는다.
2. v2도 Native 전체 도구의 우회 차단을 증명하지 못했다. 현재 canary는 dynamic tool 수용만 증명한다.
3. `ProjectWorkbench`의 `eventQueue`, `commandQueue`, `requestProjectionQueue`, `todoSyncQueue`,
   `tnoteQueue`가 서로 다른 비동기 projection을 조정한다. journal append 이후 화면/파일 반영까지
   지연될 수 있고 큐 사이의 전역 ordering 계약이 한 interface로 표현되지 않는다.
4. projection store는 원자적 파일 교체를 하지만 여러 프로세스가 같은 projection을 갱신할 때의
   소유권/CAS 계약은 확인되지 않았다.
5. 종료된 turn의 복구 UI와 실제 GitHub/Linear/Obsidian 게시 E2E가 strict 완료 범위에 남아 있다.

## 2. 코드 구조

현재 `src`는 189개 TypeScript 파일, 약 33,402줄이다. 평균 파일 크기는 약 177줄이지만
책임이 일부 파일에 집중되어 있다.

| 파일 | 줄 수 | 판단 |
|---|---:|---|
| `core/application/orchestration/project-workbench.ts` | 3,166 | 최우선 분리 대상 |
| `adapters/inbound/tui/shell/workbench-shell.ts` | 1,403 | shell 조립과 실행 제어가 혼합됨 |
| `core/application/session/session-runtime.ts` | 1,157 | 후속 조사 대상 |
| `core/domain/work/workflow-projection.ts` | 1,039 | domain projection의 응집도 재검토 필요 |
| `adapters/inbound/tui/chat/workbench-views.ts` | 915 | legacy/view 분리 후보 |
| `adapters/outbound/execution/codex-app-server.ts` | 785 | transport 자체는 비교적 응집됨 |

`ProjectWorkbench`는 약 94개 import와 수십 개의 mutable field를 가지며 다음 책임을 동시에 수행한다.

- Chat dispatch와 queue
- thread/turn lifecycle
- Native event 수집과 durable append
- Runtime protocol/report/replay
- Runtime approval과 Controller wiring
- execution journal
- Todo 동기화
- T-note 생성
- review/promotion/local workflow command
- model/permission/session 설정
- 모든 화면용 snapshot 조립

이는 깊은 module이라기보다 여러 module의 coordinator와 projection 구현이 한 클래스에 합쳐진 상태다.
호출자에게 보이는 interface는 작지만 내부 변경 locality와 독립 테스트 seam이 부족하다.

## 3. 목표 구조

```text
ProjectWorkbench (얇은 facade)
  ├─ ConversationCoordinator
  │    └─ Chat queue / start / steer / drain
  ├─ NativeSessionCoordinator
  │    └─ thread / turn / Native event lifecycle
  ├─ RequestRuntimeCoordinator
  │    └─ off | observe(v1) | broker(v2), report, tools, approval
  ├─ WorkbenchJournal
  │    └─ append ordering + durable observation publication
  ├─ WorkbenchProjection
  │    └─ activity replay -> immutable snapshot
  └─ AuxiliaryWorkCoordinator
       └─ Todo / T-note / review / promotion
```

Runtime 선택은 두 boolean 조합 대신 명시적 mode로 표현한다.

```ts
type RequestRuntimeMode = "off" | "observe" | "broker";
```

각 mode의 계약은 다음과 같다.

- `off`: 사용자 원문을 변경하지 않고 Native에 전달한다.
- `observe`: protocol context와 stage report만 사용하며 행동 통제를 주장하지 않는다.
- `broker`: Runtime tool interface를 등록하고 scoped capability만 실행한다.

## 4. 리팩터링 순서

### Slice 1 — Runtime mode와 요청 dispatch 분리

- `nativePassthrough`, `brokeredRuntime`, `requestRuntimeEnabled`, `goal`의 조합을
  `RequestRuntimeMode`와 request별 effective mode로 치환한다.
- start/steer/queue에 중복된 managed-request 판정을 하나의 module로 모은다.
- 일반 입력, `/goal`, `--runtime-config`, active-turn steering을 같은 표 기반 테스트로 고정한다.

완료 증거: 각 입력이 Native에 전달한 exact text, protocol version, journal event를 한 테스트 seam에서 검증.

### Slice 2 — RequestRuntimeCoordinator 추출

- `RequestController`, Runtime tool 등록, Runtime approval, report replay/projection scheduling을 이동한다.
- Workbench는 request를 넘기고 immutable runtime snapshot만 받는다.
- Runtime의 interrupt/close/restore ordering을 coordinator interface에 명시한다.

완료 증거: Workbench 없이 Runtime tool call -> approval -> receipt -> replay를 통합 검증.

### Slice 3 — NativeSessionCoordinator 추출

- thread start/resume, turn start/steer/interrupt, event filtering과 terminal transition을 이동한다.
- journal append가 끝난 이벤트만 상위로 공개한다는 invariant를 interface에 둔다.

완료 증거: Codex/Pi adapter 공통 contract test와 disconnect/uncertain/terminal ordering test.

### Slice 4 — Projection 분리

- `makeSnapshot`, durable activity/chat, delegation, plan, request runtime projection을 순수 reducer로 이동한다.
- 비동기 저장은 journal sequence를 watermark로 삼아 stale projection overwrite를 거절한다.

완료 증거: 동일 journal replay가 동일 snapshot을 만들고, 느린 이전 projection이 최신 것을 덮지 못함.

### Slice 5 — TUI shell 분리

- Astra shell 조립과 legacy shell 조립을 각각 launcher로 이동한다.
- 공통 shell lifecycle은 render scheduler, input routing, shutdown만 소유한다.

완료 증거: Astra/non-Astra launcher가 독립 fixture로 생성되고 shell policy test가 공통 lifecycle만 검증.

## 5. 즉시 지켜야 할 불변 조건

1. journal append 이전에는 action/result를 UI에 공개하지 않는다.
2. Runtime 승인 resolver를 그 resolver가 기다리는 queue 뒤에 넣지 않는다.
3. 결과 불명 operation을 자동 재실행하지 않는다.
4. request/turn/revision에 결박되지 않은 capability 실행을 거절한다.
5. v1을 strict 통제로 표현하지 않는다.
6. 일반 Astra 요청의 text는 byte-for-byte에 가깝게 원문 전달하고 `/goal`만 protocol을 추가한다.
7. Pi가 지원하지 않는 Runtime tool/approval을 조용히 downgrade하지 않는다.

## 근거 위치

- `src/app.ts:18-23`
- `src/core/application/orchestration/project-workbench.ts:190-428`
- `src/core/application/orchestration/project-workbench.ts:755-988`
- `src/core/application/orchestration/project-workbench.ts:1636-1782`
- `src/core/application/orchestration/project-workbench.ts:2180-2258`
- `src/core/application/orchestration/request-controller.ts:141-181`
- `src/core/runtime/request-runtime.ts:125-145`
- `src/adapters/outbound/execution/codex-app-server.ts:272-317`
- `src/adapters/outbound/execution/codex-app-server.ts:554-588`
- `docs/REQUEST_RUNTIME.md`
- `docs/REQUEST_RUNTIME_STRICT.md`
- `test/request-controller.test.ts`
- `test/project-workbench.test.ts`
- `test/codex-app-server.test.ts`

## 결론

첫 리팩터링은 파일을 기계적으로 쪼개는 작업이 아니라 Runtime mode와 요청 dispatch의 seam을
먼저 만드는 작업이어야 한다. 이 seam이 생기면 Native와 외부 Runtime의 책임, 프롬프트 주입,
도구 호출, journal 동기화를 하나의 계약으로 검증할 수 있고 이후 `ProjectWorkbench` 분리가
기능별 이동으로 바뀐다.

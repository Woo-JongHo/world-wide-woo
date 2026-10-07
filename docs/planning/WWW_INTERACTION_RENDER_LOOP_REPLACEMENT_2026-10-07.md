# WWW Input·Chat·Working·PLAN·PROGRESS·TEST 교체 설계

## 목적

99_www의 현재 코드와 GJC 0.18.7의 동작 구조를 비교해 다음 세 영역을 WWW의 `core / adapters` 경계에 맞게 다시 세운다.

1. Input·composer·slash command의 표시, 완성, 파싱, 실행을 하나의 계약으로 맞춘다.
2. durable Chat과 transient Working을 분리해 표시·스크롤·렌더 cadence가 서로 오염되지 않게 한다.
3. PLAN·PROGRESS·TEST가 같은 요청·turn·execution identity를 사용하고 잘못된 검증 증거를 표시하지 않게 한다.

비교 대상의 코드를 복사하지 않는다. 채택 대상은 단일 정본, stable identity, durable/transient 분리, atomic update, stale work rejection이라는 구조 원리다. 구현 이름·타입·상태 흐름은 WWW가 소유한다.

## 판정

현재 구조는 **BLOCK**이다. Native event를 하나의 immutable snapshot으로 모으는 중심 배선은 건전하지만, 사용자에게 잘못된 명령·Working 상태·TEST 증거를 보여줄 수 있는 결함이 남아 있다.

### 즉시 고칠 결함

- `/approve`, `/approve-session`, `/decline`, `/cancel`, `/exit`가 잉여 인자를 무시한다. 안전 경계 명령은 exact arity여야 한다.
- `/cache`는 command catalog에 보이지만 parser가 처리하지 않는다. 표시·완성·파싱·실행이 서로 다른 정본을 쓴다.
- Chat durable transcript가 `liveActivity`와 Working 표시 여부를 입력으로 받아 transient 상태에 따라 durable rows를 바꾼다.
- TEST run 선택은 bare `itemId`를 사용해 turn이 다른 동일 item을 Monitor에서 잘못 열 수 있다.
- 같은 turn에서 같은 log path를 두 실행이 재사용하면 뒤 readback이 앞 실행의 결과로도 귀속될 수 있다.

### 후속 구조 결함

- Input의 overlay/focus/global 우선순위와 action 실행이 하나의 전역 listener 분기 순서에 결합돼 있다.
- assistant streaming delta는 frame 직전 latest-only 병합과 stale callback fencing이 없다.
- Working `hint`는 계약과 change detection에는 있으나 렌더되지 않는다.
- retained Plan, active turn runtime stage, Progress가 서로 다른 turn을 한 화면에서 무표시로 섞을 수 있다.
- Chat의 선택된 Plan trace가 exact activity가 아니라 item id만 비교한다.
- TEST 목록은 전체 history를 보여주지만 narration은 current turn만 보존한다.
- failed phase + exit code 0 같은 상충 증거가 passed로 승격될 수 있다.
- TEST 종류는 명령 문자열 휴리스틱이며 unit/integration/E2E/typecheck/build/benchmark를 실행 identity에 결속한 계약이 없다.
- PROGRESS는 최근 5개를 자른 뒤 중복 요약을 합쳐 표시 수가 불필요하게 줄 수 있다.

## 현재 WWW 구조

### Input

```text
terminal key
  → workbench-input-routing의 전역 분기
  → overlay / focused component / page navigation / global shortcut
  → editor submit
  → command router의 선행 분기
  → parseWorkbenchShellCommand의 별도 if-chain
  → local effect 또는 native chat passthrough
```

`WORKBENCH_SLASH_COMMANDS`는 표시·설명·completion을, `parseWorkbenchShellCommand`는 문법과 typed intent를, command router는 일부 선행 명령 실행을 각각 소유한다. composer receipt generation guard와 uncertain의 at-most-once 정책은 이미 유효하므로 보존한다.

### Chat·Working

```text
WorkbenchSnapshot
  → ChatDurableTranscript
       journal + live card + reasoning draft + assistant draft + queue + notice
  → ChatLiveActivity
       frame + timer + message
  → WorkbenchChatView의 한 rows 배열
```

Working frame 자체는 부분 캐시로 갱신하지만 durable transcript가 transient visibility와 `liveActivity`를 소비한다. 따라서 의미 revision, viewport anchor, live card, assistant draft, Working animation의 수명이 완전히 분리되지 않는다.

### PLAN·PROGRESS·TEST

```text
native notification
  → serialized event queue
  → NativeEventLifecycle
  → durable journal
  → frozen WorkbenchSnapshot
  ├─ projectPlanFeature → WwwPlanView
  ├─ projectChatFeature → Chat transcript/rail
  └─ activities 전체 → projectRequestTestWorkspace → WwwTestView
```

이 backbone은 유지한다. 문제는 view마다 turn 선택과 identity 축소가 다르고, TEST가 전용 feature projection 없이 전체 snapshot/activity와 별도 narration 배열을 다시 결합한다는 점이다.

## 비교 구조에서 채택할 원리

### Input

- 하나의 `InteractionRegistry`가 action availability·dispatch의 정본이며 slash/key/palette binding은 action id만 참조한다.
- priority router는 `overlay → focused editor/component → global action` 순서만 결정한다.
- key, palette, slash가 같은 action id와 availability를 사용한다.
- composer submit은 submission token/generation을 가지고 async 결과가 최신 draft를 덮지 못하게 한다.
- unknown slash는 오류로 강제하지 않고 native chat passthrough를 유지한다.

### Chat·Working

- durable transcript와 transient status는 서로 다른 presenter/container다.
- assistant stream은 stable message identity로 시작하고 frame 직전 최신 delta만 반영한다. Core lifecycle/reducer만 durable journal을 쓰며 completion event가 transient stream과 frozen snapshot의 동일 identity journal item을 원자적으로 교대시킨다.
- Working message/frame/hint는 status lane만 갱신하고 transcript semantic revision이나 viewport source revision을 바꾸지 않는다.
- session/generation 변경, suspend, dispose 뒤의 예약 callback은 폐기한다.

### PLAN·PROGRESS·TEST

- 모든 선택과 결속은 아래 canonical value를 축소 없이 사용한다. `itemId`는 표시 metadata이며 equality와 selection에 사용하지 않는다.
- Plan/Progress 화면은 하나의 명시적 render scope를 받아 retained plan과 active request를 구분한다.
- verification은 `kind`, `purpose`, `execution identity`, `result authority`, `artifact identity`를 가진 core observation이다.
- 명령 문자열 해석은 legacy adapter evidence이며 core truth가 아니다.
- 상태 변경은 immutable snapshot에서 atomic하게 일어난다. selection은 global revision 차이만으로 거부하지 않고 target identity가 바뀌거나 사라졌을 때만 거부한다.

```text
TurnRef        = { threadId, turnId }
ActivityRef    = { ...TurnRef, activityId }
ExecutionRef   = { ...ActivityRef, executionId }       // attempt마다 새 executionId
VerificationRef = { ...ExecutionRef, verificationId }
ObservationRef  = { ...VerificationRef, observationId }
ArtifactRef     = { execution: ExecutionRef, artifactId, writeSequence }
```

## 목표 구조

### 1. Interaction registry

```text
ActionDescriptor
  id
  availability(state)
  dispatch(intent) → typed application command

SlashBinding
  names / aliases
  surface visibility
  argument schema
  complete(context)
  actionId
```

`WORKBENCH_SLASH_COMMANDS`, parser if-chain, router 선행 regex를 registry의 adapter로 교체한다. legacy shell과 WWW surface가 다른 경우 binding visibility로 표현하며 catalog를 두 벌 유지하지 않는다. 판정은 다음 하나의 표를 따른다.

| 입력 | 결과 |
|---|---|
| unknown slash | `passthrough` |
| known + invalid arguments | `invalid-known`, 실행·passthrough 금지 |
| known + unavailable action | `invalid-known`, 실행·passthrough 금지 |
| known + valid + available | `local(actionId, intent)` |

`/approve`, `/approve-session`, `/decline`, `/cancel`, `/exit`와 alias는 `maxArgs=0`이다. alias 충돌은 registry 구성 실패다. `/cache`는 cache capability가 주입된 surface에서만 보이고 typed local action으로 실행한다. capability가 없는 surface에서는 숨기고 직접 입력은 known-unavailable로 처리한다.

### 2. Input controller와 priority router

- `WorkbenchInputController`: submission token, composer ownership, draft persistence, receipt clear/restore 정책을 소유한다.
- `WorkbenchInputPriorityRouter`: overlay, focused target, editor, global action의 consume 순서만 소유한다.
- `InteractionRegistry`: key/palette/slash의 공통 action id와 availability를 소유한다.

Core는 키 문자열, editor, overlay를 알지 않는다.

### 3. Chat render coordinator

```text
ChatRenderCoordinator
  ├─ JournalTranscriptPresenter
  │    durable activity/message ordering + stable identity
  ├─ AssistantStreamPresenter
  │    session generation + ActivityRef/messageId + latest text + paint revision
  └─ WorkingStatusPresenter
       foreground generation + message + hint + frame
```

Presenter는 durable item을 삽입하지 않는다. Shell layout에서 Working status lane을 scrollable transcript와 composer 사이의 독립 row로 조립한다. `ChatDurableTranscript`에서 animated `liveActivity`와 `activityIndicatorVisible` 의존을 제거한다. Working frame tick은 layout paint만 요청한다.

| 상태 | 소유자 | 수명 | semantic revision | dispose |
|---|---|---|---|---|
| journal message/activity | Core journal/reducer | session durable | 변경 | snapshot replay로 복구 |
| assistant draft | AssistantStreamPresenter | message start~completion | 실제 공개 text paint 시 변경 | pending callback 폐기 |
| Working frame/message/hint | WorkingStatusPresenter | foreground run | 불변 | timer·callback 폐기 |
| queue | Core snapshot | 접수~소비/취소 | 변경 | snapshot을 따름 |
| approval | Core snapshot | 요청~결정 | 변경 | snapshot을 따름 |
| receipt | Core snapshot | 완료 후 durable | 변경 | snapshot replay로 복구 |
| notice/error | Core 사실 + inbound presentation | 해당 사실 해소까지 | 사실 변경 시 변경 | presentation cache 폐기 |

### 3.1 Plan·Progress·Output 표시 책임

AI 해석은 화면의 선행 조건이 아니다. 현재 narration queue는 instance 안에서 직렬이며 호출당 timeout이 30초다. Plan 해석 queue와 action/test 해석 queue는 서로 겹쳐 실행할 수 있지만 같은 queue의 두 번째 항목은 첫 번째 완료까지 기다린다. 기존 실제 synthetic probe의 단일 호출 관측값은 4.37초였으므로 같은 조건의 두 항목이 한 queue에 겹치면 두 번째 표시는 대략 8.74초까지 늦을 수 있다. 공급자 지연을 포함한 계약상 최악은 앞선 항목마다 30초이며 retained 20개 기준 마지막 항목은 약 10분 뒤 timeout될 수 있다. 이 지연을 UI의 `AI 해석 대기` 문구로 노출하지 않는다.

| 영역 | 표시 책임 | AI 해석 정책 |
|---|---|---|
| PLAN | 목표, checklist 제목, authoritative status | 해석 대기·상세 narration을 표시하지 않음 |
| PROGRESS | 현재 실행 중인 ActivityRef, 단계, command summary, Working 상태 | 결과가 준비된 경우에만 현재 activity의 보조 해석을 표시; pending/unavailable placeholder 없음 |
| OUTPUT | 완료된 plan step의 authoritative result/output과 최종 요약 | 준비된 model summary를 표시 전용 annotation으로 추가; 기다리지 않고 원본 output을 먼저 표시 |
| TEST | verification identity, authority, result | declared purpose 우선; inferred purpose가 준비된 경우에만 표시 |

한 activity는 실행 중에는 PROGRESS에 있고 terminal 상태가 되면 PROGRESS에서 제거되어 OUTPUT의 동일 ActivityRef로 나타난다. narration 완료가 늦어도 activity 위치와 authoritative status는 바뀌지 않는다. 늦은 narration은 같은 ActivityRef의 annotation만 갱신하며 새 카드나 중복 transcript item을 만들지 않는다. 실패·timeout narration은 조용히 생략하고 명령 설명·실행 결과를 유지한다.

### 4. Operational loop projection

Core/application에 화면 공통 read model을 둔다.

```text
OperationalLoopProjection
  requestScope
    active: TurnRef
    plan:
      turn: TurnRef
      activities: ActivityRef[]
    retainedPlan
  plan
  progress
  verifications[]
    key: VerificationRef
    source: ActivityRef
    execution: ExecutionRef
    kind
    purpose
    status
    resultAuthority
    artifact: ArtifactRef | null
    observations: ObservationRef[]
    narration
```

Plan, Progress, Output, TEST, Monitor는 이 projection의 identity를 그대로 소비한다. 화면 파일이 서로 다른 turn fallback을 다시 계산하지 않는다. 여러 authority observation은 `ObservationRef`로 보존하고 `VerificationRef` 단위로 집계한다.

`purpose`는 `{ value, source: "declared" | "inferred" } | null`이다. inferred purpose와 narration은 표시 전용이며 status·실행 정책을 바꾸지 않는다. verification status는 다음 lattice를 따른다.

| kind | required authority | optional corroboration |
|---|---|---|
| `unit`·`integration`·`e2e` | `native-terminal`, `process-exit` | `runner-summary`, `artifact-readback` |
| `lint`·`typecheck`·`build`·`benchmark` | `process-exit` | `native-terminal`, `runner-summary`, `artifact-readback` |
| `unknown` | `process-exit` | 나머지 전부 |

status는 다음 순서로 한 번만 판정한다.

1. authority 간 상충 또는 cancel·timeout 같은 상호 배타 terminal outcome이 둘 이상이면 `inconsistent`.
2. authoritative cancellation이면 `cancelled`.
3. authoritative timeout이면 `timed-out`.
4. authoritative failure가 하나라도 있으면 `failed`.
5. kind별 required authority가 누락되면 `unknown`.
6. required authority가 모두 success로 일치할 때만 `passed`.

duplicate terminal event는 같은 `ObservationRef`에서 멱등 처리한다. `resultAuthority`는 `process-exit`, `runner-summary`, `native-terminal`, `artifact-readback`의 provenance를 보존한다. 모델 추론과 legacy command classifier는 status authority가 아니다.

### 5. 책임 배치

| 위치 | 책임 |
|---|---|
| `core/domain` | canonical identity, verification status lattice와 불변식 |
| `core/application` | OperationalLoop reducer/read projection, typed use case |
| `core/ports` | execution·artifact observation 계약 |
| inbound `commands`·feature controller | token parsing, composer, selection |
| inbound feature view-model/view | ANSI 없는 DTO와 terminal 표현 |
| `tui/shell` | input priority, layout, render cadence 조립 |
| outbound execution/native adapter | 외부 event·log를 typed observation과 ArtifactRef로 변환 |
| `app.ts` | port와 adapter 주입 |

Inbound는 outbound를 직접 import하지 않으며 presenter는 Core durable state를 쓰지 않는다.

## 보존할 사용자 동작

- 알 수 없는 slash command는 native prompt로 전달한다.
- bare `/`는 composer에 남기고 completion을 유도한다.
- accepted/queued/uncertain receipt는 draft를 지우고 uncertain은 자동 재전송하지 않는다.
- rejected는 같은 submission token일 때만 draft를 복원하며 사용자가 새로 쓴 draft를 덮지 않는다.
- 기존 activity journal 순서, private reasoning 제거, Markdown fallback, approval/receipt/error/queue 표시는 유지한다.
- completed WORK summary 우선, running progress 표시, 코드 변경 없는 verification 표시, 모델 해석과 결과 권한 분리는 유지한다.
- Native journal과 frozen snapshot은 계속 단일 상태 소유자다.

## 채택하지 않는 대안

1. **GJC controller/renderer 직접 복사**: WWW의 domain/application/adapters 경계를 무너뜨리고 현재 native identity를 잃으므로 제외한다.
2. **Chat CSS/ANSI만 맞추기**: durable/transient ownership과 viewport revision 결함을 남기므로 제외한다.
3. **itemId가 전역 유일하다고 가정**: 저장소 회귀가 cross-turn reuse를 허용하므로 제외한다.
4. **모든 slash를 local error로 처리**: native/plugin/skill command passthrough를 깨므로 제외한다.
5. **명령명으로 TEST 종류 확대 추측**: 정확도가 아니라 오분류 범위만 커지므로 제외한다.

## 고비용 결정

| 결정 | 채택 | 기각한 대안과 비용 |
|---|---|---|
| identity 발급 | outbound normalizer가 Native activity를 받을 때 ActivityRef를 보존하고 execution 시작마다 ExecutionRef, verification 시작마다 VerificationRef를 발급 | TUI에서 합성하면 replay와 다른 화면이 서로 다른 key를 만들 수 있음 |
| path-only evidence | unverified 표시만 허용하고 status authority에서 제외 | nearest-read 추정은 동시·지연 writer에서 오귀속, 완전 폐기는 사용자 진단 정보 손실 |
| projection 소유 | core/application의 공통 OperationalLoopProjection | 화면별 projection은 turn·status 규칙 재분기, domain에 두면 orchestration 책임 침범 |
| writer cutover | C0 checkpoint 뒤 단일 writer 전환, 이후 roll-forward | dual-write는 장기 drift, cutover 뒤 code revert는 새 record를 읽지 못함 |
| purpose 출처 | declared 우선, inferred는 표시 전용 | inferred를 정책 입력으로 사용하면 모델 해석이 실행·결과 권한을 침범 |

## 실행 순서

### 단계 A — 안전한 Input 정본

1. 현재 command catalog/parser/router parity characterization test를 추가한다.
2. control/mutation command exact arity를 강제한다.
3. InteractionRegistry를 추가하고 catalog, parser, palette/help를 생성한다.
4. `/cache`는 capability가 주입된 surface에서만 노출·실행하고 나머지 surface에서는 숨긴다.
5. priority router와 submission controller를 분리한다.

완료 조건: visible local command orphan 0, key/palette/slash availability parity, receipt/draft matrix 통과.

### 단계 B — Chat과 Working 분리

1. Working status를 Shell의 독립 layout slot으로 이동한다.
2. durable transcript에서 transient status 입력을 제거한다.
3. Working hint를 실제 렌더하거나 계약에서 제거한다. 현재 제품 문구를 유지하기 위해 실제 렌더를 채택한다.
4. assistant delta coalescer와 generation fencing을 추가한다.
5. semantic revision과 animation paint를 별도 계수한다.

완료 조건: Working frame/message/hint 변경 시 durable rows·viewport anchor·semantic revision 불변, stream completion 한 번, stale callback 0.

### 단계 C0 — identity·verification 계약

1. `TurnRef`, `ActivityRef`, `ExecutionRef`, `VerificationRef`, `ObservationRef`, `ArtifactRef`를 core/domain에 정의한다.
2. status lattice, authority precedence, typed verification observation을 고정한다.
3. 기존 journal fixture의 replay 결과와 새 observation fixture를 고정한다.
4. writer cutover checkpoint를 기록하고 영구 dual-write는 만들지 않는다.

완료 조건: identity 축소 0, 상태 판정표의 모든 조합 통과, 기존 journal replay의 공개 출력 회귀 0.

### 단계 C — identity 결함 수정

1. TEST run key를 composite identity로 바꾸고 exact source activity id를 보존한다.
2. TEST→Monitor 이동에서 key를 축소하지 않는다.
3. writer 시작 시 `ArtifactRef`를 발급하고 readback은 해당 ref로만 귀속한다. path-only evidence는 `unverified`로 표시하고 verification status를 결정하지 않는다.
4. phase와 exit가 상충하면 passed로 승격하지 않는다.
5. Chat Plan trace를 exact activity/turn으로 결속한다.

Writer가 write 시점에 full byte count와 full content digest를 incremental하게 계산하고 bounded rolling tail을 유지한다. readback은 전체 파일 재주사와 전체 line scan을 금지한다. 최대 1 MiB 또는 2,000 retained lines 중 먼저 도달한 한계를 적용하고 head 200 lines + rolling tail의 잔여 budget을 보존한다. `truncated`, full byte count, retained byte count, full digest, retained-slice digest를 서로 다른 필드로 기록하며 execution 종료 뒤 durable verification record에는 요약·digest만 남기고 raw buffer는 폐기한다.

완료 조건: cross-turn 동일 item id, sequential/concurrent/delayed same-path writer, rotation, oversized log 회귀 통과, false pass 0.

### 단계 D — 공통 operational loop

1. request/plan turn과 retention을 명시한 render scope를 만든다.
2. bounded historical narration을 VerificationRef로 보존한다.
3. legacy classifier adapter를 status authority가 아닌 unclassified observation 생산자로 제한한다.
4. Plan, Progress, Output, TEST, Monitor를 공통 projection에 연결한다.
5. progress는 ActivityRef로 coalesce한 뒤 sequence 오름차순의 최근 5개 distinct item을 표시한다. sequence가 같으면 activityId lexical order를 사용한다.
6. `AI 해석 대기/미관측/불가` placeholder를 실행 카드와 Plan에서 제거하고 ready narration만 Progress 또는 Output annotation으로 투영한다.

완료 조건: 모든 화면이 같은 identity·turn·status를 표시하고 unit/integration/E2E/lint/typecheck/build/benchmark/unknown contract test를 통과한다.

Narration은 thread마다 completed 128개, UTF-8 합계 256 KiB로 제한한다. active verification은 eviction하지 않고 oldest completed부터 제거하며 잘린 값은 `truncated` marker를 표시한다.

## 검증

- Input: exact arity, local/passthrough/invalid-known 3상태, alias, dynamic completion, receipt matrix, overlay/focus/global precedence.
- Chat: durable invariance, no duplicate animated work, stream coalescing, stale work rejection, Core completion과 transient stream의 atomic handoff, viewport stability, narrow width, hint.
- Loop: same item id across turns, sequential/concurrent/delayed same-path writer, rotation, oversized log, conflicting phase/exit, retained Plan + new runtime, historical narration, typed verification kinds, progress ordering.
- Narration: pending/unavailable 상태에서 placeholder 0, 실행 중 ready 해석은 Progress에만 1회, terminal handoff 뒤 같은 ActivityRef의 요약은 Output에만 1회, 늦은 결과로 카드·journal item 증가는 0.
- 통합: Fake Native → ProjectWorkbench → frozen snapshot → 실제 Plan/Chat/TEST/Monitor view.
- Selection: payload는 `VerificationRef`, `ActivityRef`, `ExecutionRef`, `ArtifactRef`와 각각의 target revision만 담는다. 최신 snapshot에서 같은 ref를 다시 조회해 target 삭제 또는 source/execution/artifact identity 교체일 때만 거부한다. status·narration·progress·global revision 변화는 최신 값으로 재표시하고 진행한다. 거부 시 기존 선택을 유지하고 stale notice를 표시한다.
- 성능: width 80, message 1,000개 fixture에서 10회 warm-up 뒤 30회 측정한다. warm p95 16ms, draft p95 32ms, 입력 p95 50ms/p99 100ms를 넘지 않고 기존 기준선 대비 10% 초과 회귀가 없어야 한다. Working tick당 transcript materialization 0회, terminal write 최대 1회다. cold/new-width는 별도 기록하며 Working timer cadence 통과를 transcript correctness 근거로 대신하지 않는다.
- 실제 Native probe 실패는 제품 실패와 분리하되 최종 수락 전 별도 환경에서 재검증한다.

## 영향과 복구

- C0 writer cutover 전에는 code revert가 복구 수단이다. cutover 뒤 새 record가 기록되면 immutable journal checkpoint에서 replay하고 roll-forward fix로 복구한다. 구버전 writer가 새 record를 처리한다고 가정하지 않으며 영구 dual-write나 compatibility layer를 두지 않는다.
- 각 단계는 feature 단위로 적용한다. 단계별 focused regression과 전체 실패 목록 비교에서 새 실패가 생기면 cutover 전 adapter 연결을 되돌리고, cutover 뒤에는 checkpoint와 forward fix를 사용한다.
- 사용자 미커밋 변경을 기준선으로 취급하고 덮어쓰지 않는다. 대상 파일은 편집 직전 digest를 고정한다.

## 미결 질문

- background job Working tally를 WWW status lane에 포함할 제품 요구는 아직 없다. foreground 분리를 먼저 완료한다.
- declared purpose가 없으면 inferred purpose를 표시할 수 있지만 status·실행 정책에는 사용하지 않는다.
- 실제 Native App Server probe는 기존 환경에서 `EPERM`이므로 live 수락 증거가 없다.

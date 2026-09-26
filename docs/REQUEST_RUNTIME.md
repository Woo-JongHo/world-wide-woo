# 7-Stage Request Runtime

이 문서는 관측형 v1과 **brokered v2의 실제 구현 범위**를 설명한다.
Native 전체 도구의 우회 차단까지 완성됐다는 의미는 아니다. Strict 완료 조건은 [Strict Runtime 계약](REQUEST_RUNTIME_STRICT.md)을 따른다.

추가된 brokered v2는 아래와 같이 v1과 분리한다. 전체 strict 구현 완료는 아니다.

- `www --runtime-config <json>` 또는 `requestCapabilities`를 명시한 호출자는 brokered Runtime 도구 경로를 사용한다. 지원 도구는 inspect/propose/act/replan/reconcile/require_delivery다.
- 일반 `www`와 `runWww()`는 Runtime을 `off`로 시작한다. 호환 프로그램 API인 `runApp()`만 별도 설정이 없을 때 관측형 `observe`를 유지한다.
- 선택 우선순위는 명시적 capability factory/config의 `broker` → 명시한 Runtime mode → 호환 `runApp()` 기본 `observe`다. `runWww()`는 명시적으로 `off`를 전달한다.
- Native transport가 Runtime tools를 지원하지 않으면 명시적 연결을 거절한다. v2 세션은 Chat JSON이 아니라 Runtime 도구의 공개 제안으로 전환한다.
- RequestController가 요청/turn/현재 revision/단계/효과/Capability 승인 여부를 확인하고, 실행 준비를 저장한 뒤 Adapter를 호출한다.
- 지정한 UTF-8 파일 읽기·교체를 제공한다. 교체는 대상·요청·operation·revision·변경 전후 digest에 결박한 단회 승인을 요구한다. 디렉터리 권한·새 파일 생성·임의 shell은 제공하지 않는다.
- 기존 TUI 승인 화면에 Runtime 단회 승인을 연결했다. 기본 선택은 거절이며 세션 전체 승인은 없다. 5분 만료·취소·종료 시 폐기한다. Native 승인 RPC로 보내지 않으며 대기열 밖에서 결정을 받아 교착을 피한다.
- 결과 불명인 operation은 자동 재실행하지 않는다. 활성 turn에서는 Native reconcile 도구, 종료된 turn에서는 `/reconcile <request-id> <operation-id>`로 기록된 대상만 read-back한다. 정산은 과거 Stage/종료 시각을 변경하거나 업무 완료로 승격하지 않는다.
- 재계획은 이전 attempt를 보존하고 영향받는 단계의 새 Evidence를 요구한다. 실제 행동한 Stage를 skipped로 덮을 수 없다. 필수 전달 대상은 재계획/생략으로 제거할 수 없다.
- GitHub 기존 Issue title/body, Linear 기존 Issue title/description, Obsidian 기존 Markdown 교체 Adapter를 연결했다. 모두 기존 Artifact Candidate의 digest와 expectedBefore를 사용하며, 게시 후 read-back에서 target/artifact를 확정한다. 생성·상태 변경·commit/push/PR은 이 Adapter의 범위가 아니다.
- thread 생성 전 요청도 기존 Activity 저장소의 run별 intake stream에 먼저 기록한다. 성공 시 Native stream으로 한 번 연결하고 원본 intake identity를 보존한다. 생성 실패도 7단계 기록으로 남는다. 미결 intake를 자동 재전송하지 않는다.
- `bun scripts/runtime-tool-canary.ts --live`는 모델을 한 번 호출하는 명시적 호스트 수용 검사다. 임시 읽기 전용 세션에서 부작용 없는 도구를 실행하고, 호스트의 dynamicToolCall 완료 결과를 확인한다.
- 실제 실행에서 `calls=1`, `hostAcceptedToolResult=true`, `nativeTurnTerminated=true`를 확인했다. `strictIsolationProven=false`이며 우회 차단을 증명한 결과는 아니다.

아직 남은 것은 Native 전체 격리, 전체 업무 공통 입구의 broker 전환, 동일 Request의 여러 turn 재개,
미결 intake 발견·복구 UI, 외부 서비스 자동 Outbox worker와 실제 원격 게시 E2E다.
Pinned file Adapter는 명시적 파일 접근을 제한하지만 다른 프로세스의 동시 변경까지 막는 OS 격리 또는 원자적 CAS를 주장하지 않는다.

### 실행

명시적으로 선택한 JSON 파일은 Native 시작 전에 한 번 읽고 메모리에 고정한다. 이후 파일 변경으로 허용 범위가 늘어나지 않는다.
경로는 설정 파일 디렉터리 기준이며, 설정 파일 자체가 게시 승인은 아니다.

```json
{
  "schemaVersion": 1,
  "files": ["src/product-version.ts"],
  "candidates": []
}
```

위 파일을 저장소 루트의 `runtime-config.json`으로 저장했다면:

```sh
bun start -- --runtime-config runtime-config.json
```

| 호환 진입점 | 상태 | Runtime 동작 |
|---|---|---|
| `www astra …` | deprecated compatibility alias, `www --help`에는 비노출 | 인자를 WWW 진입점으로 전달 |
| 프로그램 API `runApp()` | 호환 API | 별도 설정이 없으면 `observe` |

새 실행 안내와 자동화에는 alias가 아니라 `www`를 사용한다.

`files`는 기존 파일만 허용하며 UTF-8 64KiB 상한이 있다. Native는 inspect에서 정확한 경로와 인자 스키마를 받는다.
`candidates`에는 검증된 Artifact Candidate JSON 파일 경로를 넣는다.
GitHub는 호스트의 `GITHUB_TOKEN`, Linear는 기존 Native MCP 연결과
`linear: {server, projectId, workspaceUrl}`, Obsidian은 `obsidianRoot`를 사용한다.
지원하지 않는 설정/대상/실행기는 시작 시 거절하며 관측형으로 조용히 전환하지 않는다.
원격 게시를 사용하지 않으면 자격 증명을 읽거나 원격 쓰기를 수행하지 않는다.

`bun scripts/runtime-workbench-canary.ts --live`는 실제 Native 모델을 호출해
Workbench의 일곱 단계 수락 및 Chat 전달을 확인하고 임시 디렉터리에 journal을 보존한다.
`--write-fixture`를 추가하면 직접 만든 임시 파일에만 테스트 승인을 부여해
GROUND 읽기 → EXECUTE 교체 → VERIFY 별도 읽기를 실행한다. 사용자 파일에는 자동 승인하지 않는다.
2026-09-12 실제 실행은 두 시나리오 모두 Request completed였으며,
파일 시나리오는 단회 승인 1건과 서로 다른 단계의 Action Receipt 3건을 남겼다.
[실제 Receipt 원문](../.www/evidence/2026-09-12-request-runtime/live-file-receipts.json)을 보존했다.

### 검증 범위

로컬 동작 테스트는 승인/거절/취소/종료, 실제 임시 파일 교체, stale target,
read-back, 재시작 복원, 종료 turn 정산, 필수 전달 실패, 단계 Evidence 분리, CLI 설정 연결을 다룬다.
원격 Adapter 테스트는 가짜 네트워크/MCP 응답이며 실제 원격 게시 Receipt와 구분한다.
2026-09-12 Opus 읽기 전용 감사는 주간 한도 HTTP 429로 미실행이다. 다른 모델로 대체하지 않았다.

## 1. 현재 구조와 위치

Request는 Workbench의 `request/submitted → queued/started/failed/uncertain` Activity로 식별한다.
Session은 Native thread를 소유하고, ExecutionRun은 Native turn·도구·승인·완료 Receipt를 소유한다.
새 Runtime은 `core/domain/execution/request-runtime.ts` 계약과 `core/runtime/request-runtime.ts`의 순수 재생 함수로 이 위에 놓인다.
별도 DB·Agent 루프·새 Native 세션을 만들지 않는다.

## 2. 기존 개념 Mapping

| 기존 개념 | 7단계와의 관계 |
|---|---|
| Request | 순서가 고정된 일곱 Stage 인스턴스의 소유자 |
| Session / Native turn | Request의 실행 위치; v1은 steering 가능, v2는 요청별 turn 분리를 위해 큐로 전달 |
| Todo | 일곱 Stage가 최상위 항목, Native가 작성한 작업은 각 Stage의 하위 항목 |
| Native Plan / Workflow | 기존 계획·실행 관측을 보존. 신규 요청의 최상위 Todo를 대체하지 않음 |
| Activity / Tracer | 근거 정본과 탐색 경로; Stage와 실제 Activity identity 연결 |
| Approval / Handoff | 기존 Executor 제어 유지. 승인 대기는 현재 Stage에 blocked로 관측 |
| Receipt / Artifact Control | 실행 결과와 승인된 외부 게시 계약 유지 |

## 3. 추가 Contract

Stage는 id/status/goal/input/owner/model/agents/tools/tasks/output/evidence/decision/skipReason/시간/next를 가진다.
Task는 요청 전체에서 고유한 id, title, status, dependsOn을 가진다. 단계별 최대 8개이며,
동일 단계의 독립 작업은 병렬 실행할 수 있다. 후속 단계는 pending으로 계획한다.
모델·Agent 이름은 단계에 고정하지 않는다.

## 4. 유지하는 구조

기존 Activity journal, ExecutionRun/Receipt, TodoLedger CAS, thread별 Todo.md,
권한·승인, Queue, Native steering, Trace, T-note, 세션 재개를 유지한다.
과거 기록은 protocolVersion이 없으므로 기존 방식으로 읽는다. 과거 요청이 7단계를 수행했다고 소급하지 않는다.

## 5. 통합하는 중복

신규 요청의 Todo/TUI/Projection은 모두 같은 RequestRuntimeRecord에서 파생된다.
별도의 수동 최상위 Todo와 Native 평면 계획을 Runtime Todo와 함께 쓰지 않는다.
Runtime Todo의 직접 수동 변경은 거절하고 입력창에서 Native에 하위 계획 변경을 요청하도록 안내한다.
이전 세션의 수동 Todo 명령은 유지한다.

## 6. State Model

모든 신규 Request에는 UNDERSTAND, DECOMPOSE, GROUND, DECIDE, EXECUTE, VERIFY, DELIVER가 존재한다.
pending/running/completed/skipped/failed/blocked를 기록한다. skipped는 비어 있지 않은 이유가 필수다.
Native가 보고하지 않은 단계는 완료가 아니다. turn 종료 때 미보고 단계는 blocked,
실패·취소 때 미완료 단계는 failed로 남는다. 단순 요청은 불필요한 단계를 이유와 함께 생략한다.

## 7. Transition Model과 Native 경계

Workbench가 요청 ID와 프로토콜을 additionalContext에 넣는다. steering과 Pi에도 같은 템플릿을 전달한다.
Native는 각 단계의 공개 결과를 다음처럼 독립된 commentary 메시지로 보고한다.

```text
[www-runtime]{"requestId":"실제 요청 ID","stage":"UNDERSTAND","status":"completed","summary":"공개 목표·제약·성공 조건"}
```

DECOMPOSE/DECIDE의 `plan` 배열에는 `{stage,tasks:[{id,title,status,dependsOn}]}`를 담는다.
현재 단계에서도 하위 Task를 갱신할 수 있다. 앞 단계는 completed/skipped여야 다음 단계로 이동한다.
잘못된 형식·순서·의존성·근거는 protocol.rejected로 남기며 부분 반영하지 않는다.
종료 전 failed/blocked는 running 보고로 재시도할 수 있다. 종료된 Request는 변경하지 않고 새 요청으로 이어간다.

이 구현은 **관측 기록과 전환 수락을 통제**한다. Native 내부의 각 도구 호출을 서버 측에서 선제 차단하는
Stage별 action gate는 아니다. Native 내부 추론을 저장하거나 7번의 모델 호출을 강제하지 않는다.
프로토콜 보고가 누락되면 실패를 숨기지 않지만, Native의 공개 보고 준수 여부는 실제 provider 실행에서 추가 확인이 필요하다.

## 8. Integration Model

RequestProjectionPort.capture(record)로 승인된 Runtime 기록을 Adapter에 전달한다.
record.events는 request/stage/decision/execution/verification/delivery lifecycle과 원본 Activity ID를 가진다.
이벤트 ID는 재생 시 동일하므로 소비자는 ID로 중복 처리를 막을 수 있다.
현재 production Adapter는 runtimeDirectory/requests에 JSON 스냅샷과 대상별 초안을 원자적으로 저장한다.
기존 GitHub/Linear/Obsidian 게시 자동화에 직접 외부 쓰기를 추가하지 않았다.
외부 발행은 이 초안을 각 기존 Artifact Candidate·승인·read-back 흐름에 연결해야 한다.

## 9. Evidence / Projection

Evidence는 같은 thread/turn의 요청 제출 이후, 보고 이전에 존재한 terminal Activity만 참조한다.
Native item ID 또는 Activity ID를 사용하며 Activity ID/sequence/sourceDigest를 보존한다.
EXECUTE·VERIFY 완료에는 실제 도구/파일 관측이 필요하며 실패한 참조는 완료 근거가 될 수 없다.
exitCode=0은 passed, 명시적 실패는 failed, 그 외는 observed다. observed를 독립적인 성공 인증으로 승격하지 않는다.
순수 답변이나 외부 검증 불필요 시에는 이유를 남기고 생략한다.
DELIVER는 정상 final 메시지의 실제 Activity를 Chat 전달 근거로 기록한다.

동일 정본에서 Linear는 짧은 WHAT/상태, Obsidian은 WHY/결정/전체 근거,
GitHub는 변경/검증 참조, Chat은 사용자용 결과로 투영한다. 초안 생성은 게시 완료가 아니다.
CoT·reasoning envelope는 Stage 입력으로 수락하지 않는다.

## 10. 구현 순서 및 관측

Brokered v2의 불명 결과는 `www_runtime_reconcile({requestId, expectedRevision, operationId})`로
읽기 전용 정합을 요청한다. Native가 대상·예상 digest를 새로 제공할 수 없고, Controller가
기록한 locator와 Adapter의 현재 읽기 범위만 사용한다. 목표 상태가 확인되고 Receipt가
영속화돼야 차단이 해제된다. 불일치·취소·기록 실패는 미확인 상태를 유지한다.
동일 활성 turn의 Controller 복원에 한정하며, 종료된 turn의 복구 UI는 아직 미구현이다.
`actions`에 원본 prepared/receipt Activity ID와 completed/failed/reconciled/unconfirmed를
보존하며 TUI에서 미확인 작업과 `/source` 링크를 볼 수 있다. Reconciled는 현재 상태 확인이지
과거 실행 주체나 외부 게시 성공에 대한 포괄 인증이 아니다.

계약 → journal 재생/전환 → Native 공개 보고 → 고정 7단계 Todo → 로컬 Projection → TUI 순으로 연결했다.
broker 설정을 지정해 `bun start -- --runtime-config runtime-config.json`을 실행한 후 `/todo`에서 단계·하위 계획, `/monitor`에서 현재 상태,
`/context`에서 요청별 이력·근거를 확인한다. `/source <activity-id>`는 기존 근거 탐색이다.

단위 및 Workbench 통합 테스트는 보고 수락, 생략, 병렬 Task, 의존성, 잘못된 근거,
재개, JSON 숨김, Todo 저장, Projection 저장과 좁은 화면 행 너비를 검사한다.
Native thread 생성 이전의 연결 실패는 기존 pre-thread 오류 표면에 남으며, thread journal이 아직 없어
durable 7단계 기록 대상이 아니다. Pi의 현재 제한된 공개 이벤트/도구 capability는 그대로 유지한다.

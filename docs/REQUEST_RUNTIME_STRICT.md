# 7-Stage Strict Request Runtime — 구현 준비

상태: 구현 명세 + 첫 brokered 실행 경로 구현. 현재 production 기본 경로에 strict 통제가 적용됐다는 뜻이 아니다.
범위: 모든 업무 Request를 동일한 일곱 Stage 안에서 해결하며, 필요한 Stage만 실행한다.
성공 기준은 화면 표시가 아니라 **통제되지 않은 행동은 실행되지 않고, 허용한 행동은 연동 결과까지 확인되는 것**이다.

## 1. 확정할 책임

Native는 의도 해석, 필요한 단계와 하위 작업 계획, 도구 선택, 공개 결정과 결과를 작성한다.
Runtime은 계획 수락, 단계 전환, 실행 허가, 승인 결박, 재시도, 근거 판정, 최종 완료를 소유한다.
Adapter는 허가된 실제 행동과 원본 결과를 제공한다. TUI와 Todo는 같은 Runtime 기록의 Projection이다.
내부 추론은 수집하지 않으며 일곱 번의 모델 호출을 요구하지 않는다.

```text
Native: Stage Plan / Action Intent
                 ↓
Runtime: identity → current revision → policy → approval → durable authorization
                 ↓ 허가된 경우에만
Adapter: 실제 호출 → 결과 / 결과 불명 → read-back
                 ↓
Runtime: Receipt → Stage 결과 → 다음 행동 또는 교정 응답
                 ↓
Todo · TUI · Trace · 대상별 Projection
```

### 모든 요청의 범위

- Chat, Goal, 후속 수정 요청, 업무를 실행하는 slash command, 예약 업무를 공통 입구로 받는다.
- 화면 이동·스크롤은 Request가 아니다. 실행을 변경하는 cancel/approval은 부모 Request에 연결된 제어 명령이다. 독립 업무 명령에는 Request를 만든다.
- 모델이 필요 없는 명령도 일곱 자리와 생략 이유는 갖되 모델을 호출하지 않는다.
- Native thread 생성 **이전**에 Request를 내구적으로 접수한다. thread가 없으면 unbound로 남기고 이후 연결한다.
- 취소·승인은 일반 작업 큐 뒤에서 기다리지 않는 제어 경로를 유지한다.
- 업무 전체를 일곱 단계로 표현하는 것과 모든 외부 시스템에 쓰는 권한은 다르다. 게시 대상과 권한은 요청 범위/Project Binding을 따른다.

## 2. 현재 코드에서 확인한 출발점

| 위치 | 확인한 사실 | 필요한 변경 |
|---|---|---|
| `core/runtime/request-runtime.ts` | 공개 메시지를 재생해 Stage 수락 여부를 판정 | trusted command 처리와 수락 이벤트로 전환. 읽기 Projection은 유지 |
| `core/application/orchestration/project-workbench.ts` | Native start/steer와 개별 로컬 명령을 직접 호출 | 업무 공통 접수, Runtime coordinator 위임, 제어 명령 우선 처리 |
| `core/ports/execution/executor-port.ts` | thread/turn/approval 중심 Interface | 실제 지원 여부를 알려주는 capability 계약과 Runtime tool request/response 추가 |
| `adapters/outbound/execution/codex-app-server.ts` | 승인 콜백 처리, `dynamicTools` 등록·`item/tool/call` 응답은 없음 | 등록과 양방향 응답, 호출 ID 및 thread/turn 소유 검증 |
| `adapters/outbound/execution/factory.ts` | Pi는 `noTools: "all"`, `tools: []`인 text-only 경로 | 강제 통제 동등성이 확인되기 전에는 text-only 용도로 제한 |
| `core/application/orchestration/approval-dispatch.ts` | 전송 전 기록, 불명 결과 재전송 차단 | 동일 원칙을 Action dispatch에 재사용. 범위·revision까지 결박 |
| `core/domain/development/artifact-control.ts` | Candidate digest·expectedBefore·표현 계약 존재 | 새 승인 체계를 복제하지 않고 대상별 변환/발행에서 재사용 |
| `scripts/artifact-control.ts` | validate/render만 제공 | 실제 publish/read-back Adapter가 이미 있다는 전제로 개발하지 않음 |
| `adapters/outbound/persistence/request-projection-store.ts` | 로컬 파생 JSON을 원자적으로 저장 | 원격 전달 Outbox·Receipt와 구분. 이 JSON을 실행 권한 정본으로 사용하지 않음 |

### Native transport 확인

2026-09-12 설치된 `codex-cli 0.154.0`에서 다음 명령으로 experimental 타입을 생성해 확인했다.

```sh
codex app-server generate-ts --experimental --out <임시 디렉터리>
```

- `ThreadStartParams.dynamicTools`: function/namespace 도구 등록.
- `DynamicToolCallParams`: threadId, turnId, callId, namespace, tool, arguments.
- `ServerRequest`: `item/tool/call` 분기 존재.
- `DynamicToolCallResponse`: contentItems와 success. Runtime 수락/거절 결과를 Native에 반환할 통로가 있다.

[공식 App Server 문서](https://learn.chatgpt.com/docs/app-server#dynamic-tool-calls-experimental)도 이 client response 흐름과 experimental 상태를 설명한다.
**스키마 존재를 호스트 수용·우회 차단·실제 모델 성공 증거로 취급하지 않는다.**
내장 shell/MCP/하위 Agent/환경 접근을 함께 제한하는 정확한 설정 조합은 실제 canary로 확인해야 한다.

## 3. 동일 템플릿, 선택적 실행

| Stage | Native가 제안하는 공개 산출물 | Runtime이 확인하는 조건 |
|---|---|---|
| UNDERSTAND | 목표·범위·제약·수락 조건 | 현재 요청과 일치, 모호하면 blocked와 질문 |
| DECOMPOSE | 일곱 Stage 안의 하위 Todo·의존성·필요 Capability | 참조/순환/범위/병렬 충돌, 실행 계획 revision |
| GROUND | 필요한 원본과 조회 결과 | 허용된 원본·버전·실제 조회 Receipt 또는 제공 Context identity |
| DECIDE | 선택·짧은 이유·대안·실행 계획 | 현재 근거·정책·권한·필수 승인 충족 |
| EXECUTE | 수행할 변경과 행동 | 정확한 대상·인자에 대한 실행 허가 및 실제 Action Receipt |
| VERIFY | 수락 조건과 확인 방법 | 검증 대상 revision 일치, 실제 결과를 조건별 판정 |
| DELIVER | 대상별 결과 | 필수 Delivery Obligation의 publish/read-back Receipt 충족 |

모든 Stage의 자리와 history는 유지한다. 필요 없으면 Native가 skip을 제안하고 Runtime이 수락한다.
단순 설명은 여러 Stage를 한 응답에서 완료/생략 제안할 수 있다. 중간 모델 호출·불필요한 인터뷰를 강제하지 않는다.
생략 이유만 쓰면 무조건 통과하는 구조는 아니다. 해당 Request 정책상 필수인 승인·검증·전달을 생략할 수 없다.
강한 통제는 불필요한 절차를 강요하는 것이 아니라 **선택된 의무를 우회하지 못하게 하는 것**이다.

Todo의 부모는 일곱 Stage로 고정한다. Native는 자식 작업을 계획하고 revision을 갱신한다.
병렬 실행은 의존성이 충족되고 대상이 충돌하지 않는 자식 작업에만 허용한다.
기존 Workflow의 세부 절차는 적합한 Stage 아래에서 실행하며 별도의 최상위 단계 체계로 경쟁하지 않는다.

## 4. Runtime 계약과 관리

기존 RequestRuntimeRecord를 버리지 않고 버전이 있는 command/event 계약으로 확장한다.

### 필요한 데이터

- Request: requestId, parent/related request, objective, constraints, acceptanceCriteria, policyVersion, planRevision, runtimeRevision, turnBindings, deliveryObligations.
- Stage: 기존 공통 필드 + attempt, acceptedPlanRevision, requiredOutputs, skipDecision, blocker.
- Task: 기존 하위 Todo + 의존성, 필요한 Capability, Worker assignment, 완료 조건과 Receipt refs.
- Action Intent: operationId, request/stage/attempt/task, capabilityId, normalizedTarget, argumentsDigest, expectedBefore, expected runtimeRevision.
- Stage Grant: Runtime이 보유하는 단회 권한 identity. 정확한 Intent·승인·revision·만료에 결박하고 모델이 수정할 수 없게 한다.
- Action Receipt: operationId/grantId, 실제 Adapter identity, 시도·결과 시각, outcome, 원본 identity/digest, before/after, 검증 관계.
- Delivery Obligation: target, required/optional, canonical artifact revision, Candidate/승인/게시/read-back 상태.

여기서 새 이름은 기존 Candidate·승인·Receipt를 대체하는 별도 원장이 아니다. 요청/단계와 기존 기록을 연결하는 계약이다.

### Native Interface 제안

작은 Interface로 계획·전환·행동·결과 확인을 모은다. 메서드 이름은 WWW 계약이며 SDK 내장 이름이 아니다.

- `runtime.inspect`: 현재 revision, Stage, Todo, blockers, 이용 가능한 Capability.
- `runtime.propose`: Stage Plan/전환/생략/재계획/공개 결과 제안.
- `runtime.act`: 등록된 Capability에 대한 Action Intent. Runtime만 실제 Adapter를 호출.

응답은 accepted/rejected/blocked/in-progress/completed와 실제 revision, reasonCode, permittedNextActions, Receipt refs를 가진다.
잘못된 보고를 로그에만 남기지 않고 같은 도구 호출의 결과로 반환한다. 장기 실행은 operationId로 조회한다.
모델이 임의의 JSON을 Chat으로 출력해도 실행·완료 권한은 발생하지 않는다. v1 공개 보고는 legacy 관측으로만 읽는다.

### 통제 규칙

1. runtimeRevision에 대한 CAS로 Stage 전환/계획 변경/허가 발급을 직렬화한다.
2. 현재 Stage와 planRevision에 속하지 않는 행동, 모르는 도구, 범위 밖 대상은 거절한다.
3. 승인된 Intent라도 실행 직전에 현재 revision·취소·만료·expectedBefore를 다시 확인한다.
4. 권한 발급과 dispatch 준비를 **먼저 저장**한다. 저장 실패 시 실제 도구를 부르지 않는다.
5. 실행 결과가 불명이면 자동 재전송하지 않고 read-back/reconcile 또는 사용자 개입을 요구한다.
6. Stage를 닫기 전에 미정산 Action/자식 작업을 확인한다. 승인 대기 중 완료도 거절한다.
7. 취소·재계획은 미사용 Grant를 폐기한다. 이미 외부에서 실행된 행동은 취소했다고 지워버리지 않는다.
8. 같은 operationId/같은 인자 재시도는 기존 결과를 반환한다. 같은 ID/다른 인자는 거절한다.
9. Request 종료는 Runtime만 결정한다. Native turn/completed 또는 Chat final만으로 종료하지 않는다.

### 재계획과 검증 실패

VERIFY 실패 후 같은 Request의 EXECUTE로 돌아갈 수 있어야 한다. 기존 완료 기록을 덮어쓰지 않는다.
Native가 재계획을 제안하면 Runtime이 새 attempt/planRevision을 열고, 영향받은 downstream 결과와 Grant를 무효화한다.
Todo는 최신 attempt를, Trace는 이전 시도까지 보여준다. 오류 없는 선행 근거는 버전 일치가 확인되면 재사용한다.
수정 없는 검사 재시도와 실제 코드 변경 후 재검증을 구분한다. 재시도 예산을 소진하면 blocked로 남긴다.
새 follow-up이 기존 작업 범위를 바꾸면 관련 Request와 연결해 기존 실행을 정산/중단한 뒤 새 revision을 적용한다.

## 5. 도구와 강제 통제

Tool을 Stage에 고정하지 않는다. Capability의 허용 효과·대상·권한과 현재 Task 목적을 대조한다.

- `read`: 코드/이력/Issue/문서 조회. UNDERSTAND·GROUND·DECIDE 등 필요한 단계에서 사용.
- `workspace-change`: 실제 파일 변경. EXECUTE의 허가된 작업으로 기록.
- `verify`: 테스트·diff·read-back. 임시 파일 쓰기나 subprocess도 실제 효과를 포함해 격리 정책 적용.
- `publish`: Commit/PR/Activity/정본 전달. DELIVER에서도 실행할 수 있지만 동일한 Action 허가·Receipt를 반드시 거친다.

모델이 Tool을 read라고 이름 붙였다는 이유로 읽기 전용으로 믿지 않는다.
Adapter가 정규화한 operation/target/효과와 정책이 기준이다. 범용 shell의 효과를 문자열 패턴만으로 판정하지 않는다.
범용 명령은 권한이 제한된 실행 환경 안에서만 허용하고, credential/network/쓰기 경로를 함께 제한한다.

### strict 지원 조건

- Native에는 brokered Runtime tools만 노출하거나, 우회 가능한 내장 기능을 실제로 차단할 수 있어야 한다.
- Native child Agent, MCP, extensions, shell escape, 환경 접근도 같은 허가 범위를 넘지 못해야 한다.
- Adapter는 실제 지원 여부를 선언하고 시작 시 확인한다. 통제 증거가 없으면 strict 요청을 거절한다.
- 기존 uncontrolled 세션을 자동으로 strict라고 이름만 바꾸지 않는다. 재개 시 실행 환경·도구 정책부터 재검사한다.
- Codex에서 필요한 통제가 성립하지 않으면 capability blocker로 명시한다. Pi나 다른 provider로 몰래 대체하지 않는다.
- 모델은 격리된 환경 안에서 자유롭게 추론한다. 보호 대상은 실제 프로젝트·자격증명·원격 시스템·공식 완료 기록이다.

## 6. Integration / Projection 완성 범위

하나의 Canonical Artifact revision에서 대상별 Candidate를 만든다. 현재 문자열 Projection은 초안이지 게시 계약이 아니다.
Native가 계획한 게시 대상도 사용자 범위와 정책 밖이면 승인되지 않는다.

| Adapter | 조회·실행·검증·전달 책임 |
|---|---|
| Files / Command | root/path 검증, 허가된 변경·격리 명령, diff·내용 digest·검사 결과 |
| GitHub | repo/head/branch 읽기, 기존 Commit control 연결, 별도 승인된 push/PR, SHA·PR·check read-back |
| Linear | workspace/project/issue identity 확인, 얇은 WHAT·상태·Activity, 허가된 변경 후 대상 재조회 |
| Obsidian | 허용 Vault/path와 문서 identity 확인, 상세 WHY·설계·근거 Candidate, 계약 검증과 원자적 저장/read-back |
| Chat / Artifact Store | 사용자 결과·차단 원인·필수 잔여를 기록하고 실제 전달 identity 보존 |

정본 역할은 Obsidian WHY / Linear WHAT / GitHub ACTUAL을 유지한다.
조회에 실패한 원본을 모델 기억이나 다른 워크스페이스로 조용히 대체하지 않는다.
스킬의 승인·작성 계약은 유지하되 프롬프트 준수만 보안 근거로 사용하지 않는다.

### Outbox와 부분 실패

수락된 canonical revision과 대상별 전달 의무를 기존 Activity journal에 내구적으로 기록한다.
Worker는 journal에서 미처리 의무를 재구성할 수 있고, 별도 저장소가 필요하면 재생 가능한 index로 둔다.
key는 requestId/canonicalRevision/target/operation을 포함한다. 상태는 prepared/dispatched/confirmed/failed/uncertain을 구분한다.
원격의 exactly-once를 가정하지 않는다. idempotency 지원이 없으면 read-back으로 기존 게시를 확인한 뒤 처리한다.
GitHub 성공·Linear 실패라면 GitHub를 다시 만들지 않는다. 필수 전달은 DELIVER blocked로,
선택 전달 실패는 사용자에게 명시하고 정책에 따라 완료할 수 있다. 역방향 삭제를 자동 rollback으로 사용하지 않는다.
게시 내용이 바뀌면 새 Candidate digest로 승인받는다. 이전 승인을 재사용하지 않는다.

## 7. 구현 작업: 일곱 Stage 기반 Todo

아래는 **다음 구현 Request의 계획**이며 실행 완료 기록이 아니다. Native는 각 Stage 안의 구체 작업을 조정할 수 있다.

- UNDERSTAND
  - 요청 종류·권한 범위·필수 전달 대상·완료 의미 확정.
  - Stage 생략 가능성과 프로젝트 필수 정책 구분.
- DECOMPOSE
  - Request/Stage/Task/Action/Delivery의 identity·의존성·revision 계약 정리.
  - 첫 수직 경로를 `요청 → 코드 조회 → 파일 변경 → 검사 → 사용자 전달`로 고정.
- GROUND
  - Codex tool request/response의 실제 호스트 수용 canary.
  - 내장 도구·하위 Agent·MCP 우회 시도와 차단 증거 확보.
  - GitHub/Linear/Obsidian 기존 Port와 인증·승인·read-back 경로 목록화.
- DECIDE
  - Codex strict 지원 판정과 미지원 capability 처리 결정.
  - 재계획·정산·불명 결과·필수 전달 정책 확정.
- EXECUTE
  - 기존 Runtime을 trusted command → durable event 구조로 확장.
  - pre-thread Request 접수와 공통 Workbench 입구 연결.
  - Native runtime tools 등록/결과 반환 및 수정 가능한 오류 응답 연결.
  - Gate → Action dispatch → Receipt의 첫 로컬 수직 경로 구현.
  - Candidate/Approval 재사용과 대상별 Adapter/Outbox/read-back 구현.
  - Todo/TUI를 current Stage·차단 원인·필요 행동·전달 의무에 연결.
- VERIFY
  - 아래 수락 시나리오를 실행하고 실제 Receipt 보존.
  - 재시작·부분 실패·취소·동시성·외부 drift 재현.
- DELIVER
  - 로컬 실행 방법·지원 Capability·미지원 항목 문서화.
  - 승인된 테스트 대상에서 실제 연동 완료 및 read-back.
  - 필수 수락 조건을 충족한 기능 범위만 완료로 인계.

모듈 배치는 기존 `core/domain/execution` 계약, `core/runtime` 전환 규칙,
`core/application/orchestration` coordinator, `core/ports` capability Interface,
`adapters/outbound` 실제 효과를 따른다. TUI와 모델 프롬프트에 정책 구현을 분산시키지 않는다.
UI 추가보다 **첫 차단 가능한 실제 행동 경로**를 먼저 만든다.

## 8. 완료 수락 시나리오

| 시나리오 | 반드시 관측할 결과 |
|---|---|
| 단순 질문 | 일곱 자리 유지, 불필요 Stage 이유 있는 생략, 불필요 Tool/모델 호출 없음 |
| GROUND에서 허가 없는 파일 변경 | 실제 파일 불변, 명확한 거절 응답, 차단 기록 |
| Native shell/MCP/child Agent 우회 | 효과 발생 전 거절 또는 strict 시작 자체 거절 |
| stale revision/다른 Request/위조 Grant | 실제 호출 0회 |
| 승인 대기 중 실행/완료 | 실제 호출 0회, 승인과 작업 revision 확인 뒤에만 진행 |
| 정상 코드 변경 | 정확한 변경 대상과 Action Receipt, 수락 조건별 검증 |
| VERIFY 실패 후 수정 | 새 attempt, 이전 근거 보존, 낡은 검증으로 완료 불가 |
| 실행 성공 뒤 프로세스 종료 | 재개 후 중복 쓰기 방지, 불명 결과는 read-back |
| 취소와 동시에 Tool 호출 | 취소 후 새 허가 없음, 이미 실행된 효과는 정산 |
| 필수 Linear 전달 실패 | 완료 선언 금지, 성공한 GitHub 전달은 보존, Linear만 안전하게 복구 |
| 외부 대상 drift | expectedBefore 불일치 거절, 새 Candidate/승인 필요 |
| Fake 성공 JSON / Native 조기 final | 검증·게시·Request 완료로 승격하지 않음 |
| 재개한 이전 세션 | legacy와 strict 구분, 정책 확인 없이 strict 실행 안 함 |

## 구현 범위와 남은 조건

준비 이후 첫 구현에서 Native dynamic tool 왕복, trusted Stage 제안, correction 응답,
Capability 사전 허가·write-ahead·중복 차단과 승인된 단일 파일 변경/read-back을 연결했다.
실제 Codex 임시 세션에서 도구가 한 번 호출되고 WWW 결과가 호스트의 완료 Item에 수용되는 것을 확인했다.
실행기 선택이나 인증을 바꾸지 않고 `requestCapabilities` 또는 CLI `--runtime-config`로 연결한다.
기본 CLI는 관측형을 유지한다. 현재 테스트에서 실제 외부 시스템에는 게시하지 않았다.

**구현됨:** Runtime 단회 승인 UI/만료, 재계획 attempt, 활성/종료 turn read-back 정산,
필수 전달 수락, GitHub/Linear/Obsidian 기존 Artifact 게시 Adapter, pre-thread 내구적 접수.
**미완료:** Native strict 우회 차단, 전체 업무 공통 입구/기본 모드 전환,
동일 Request의 여러 turn 재개, 미결 intake 복구 UI, 외부 자동 Outbox worker 및 원격 게시 E2E.
단일 파일 Adapter의 제약과 실행 방법은 [구현 현황](REQUEST_RUNTIME.md)에 기록한다.

### 후속 구현: 불명 실행 read-back

`www_runtime_reconcile`이 기록된 operationId/target만 재조회한다. Capability의
`reconciliation.prepare/readBack`을 통해 안전한 locator를 write-ahead에 저장하고,
같은 Request/turn·현재 revision·활성 권한을 재확인한 후 Receipt를 남긴다.
파일 내용 자체를 locator에 저장하지 않고 path와 before/after digest만 보존한다.
확인되지 않은 결과는 Stage 전환·조기 final·다른 operationId 실행으로 우회할 수 없다.

확인 성공은 현재 목표 상태의 증거이며 과거 변경 주체를 증명하지 않는다.
원래 내용이 보인다는 이유만으로 미실행으로 단정하거나 쓰기를 재시도하지 않는다.
Canonical Record.actions, action lifecycle event, TUI와 대상별 초안에 상태가 반영된다.

종료·취소된 turn은 `/reconcile <request-id> <operation-id>`로 현재 상태만 정산할 수 있다.
이 명령은 Native에 노출하지 않으며 idle 상태의 호스트에서만 허용한다.
이전 Stage와 종료 시각은 고정한다. 실제 프로세스 강제 종료·재접속 E2E와
여러 turn에 걸친 동일 Request 실행 재개는 별도 미완료 항목이다.

### Native 통제의 근거와 제한

설치된 Codex 0.154.0에서 생성한 실험 API 타입에는 dynamicTools 등록과 응답 계약이 있다.
하지만 등록 자체는 기본 도구의 비활성화 계약이 아니다.
[공식 Hooks 문서](https://learn.chatgpt.com/docs/hooks#tool-coverage)는 hosted tool과 일부 특수 경로가
훅을 통하지 않을 수 있으며, 훅을 완전한 실행 통제 경계로 취급하지 말라고 명시한다.
따라서 hook 또는 prompt만 추가한 뒤 strict 구현 완료로 표기하지 않는다.

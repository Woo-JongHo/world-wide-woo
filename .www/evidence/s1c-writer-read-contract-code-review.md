# S1-C writer/read contract 독립 코드 리뷰

- 검토 범위: `src/core/ports/index.ts`, `src/core/application/work/t-note-service.ts`, `src/core/application/orchestration/project-workbench.ts`의 S1-C 계약 변경, `src/adapters/outbound/persistence/t-note-store.ts`, `src/adapters/outbound/workspace/linear-project-dashboard.ts`, `test/t-notes.test.ts`
- 검토일: 2026-09-25
- 검토 방식: 변경 diff와 실제 호출·저장·복구 경로를 함께 대조했다.
- 실행 증거: `bun test test/t-notes.test.ts test/linear-project-dashboard.test.ts test/native-plan-wiring.test.ts test/project-workbench.test.ts test/project-workbench-async-scope.test.ts` — 60 pass, 0 fail.
- skill-perspective check: `remove-ai-slops`와 `programming` 스킬은 현재 사용 가능한 스킬 목록/로컬 경로에서 찾을 수 없어 실행하지 못했다. 그 기준(삭제만 검증하는 테스트, 구현 상수 미러링, 불필요한 추출·파싱·추상화, 타입 우회)을 수동 적용했다. 추가된 테스트에는 해당 slop 위반이 없지만, 아래 동시성 계약 공백 때문에 충분한 회귀 증거도 아니다.

## Findings

### CRITICAL

없음.

### HIGH

1. 완료 turn 단위 중복 방지 계약이 실제로 원자적이지 않아, 같은 turn의 Note가 두 번 append될 수 있다.

   - [`src/core/application/work/t-note-service.ts:17`](/Users/jonghoPro/woo/00_project/99_www/src/core/application/work/t-note-service.ts:17)는 completed-turn deduplication과 재시도 판단을 호출 Core use case의 책임으로 선언한다. 하지만 [`src/core/application/orchestration/workbench-note-narration.ts:107`](/Users/jonghoPro/woo/00_project/99_www/src/core/application/orchestration/workbench-note-narration.ts:107)의 기존 Note 확인은 각 `WorkbenchNoteNarration` 인스턴스의 메모리 `notesById`만 보며, [`src/core/application/orchestration/workbench-note-narration.ts:254`](/Users/jonghoPro/woo/00_project/99_www/src/core/application/orchestration/workbench-note-narration.ts:254)의 생성은 `readAll → existing 확인 → append`를 하나의 원자적 연산으로 만들지 않는다.
   - [`src/adapters/outbound/persistence/t-note-store.ts:20`](/Users/jonghoPro/woo/00_project/99_www/src/adapters/outbound/persistence/t-note-store.ts:20)는 path별 append 순서만 직렬화하고 `id`, packet digest, completion `(threadId, turnId, terminalActivityId)` 중 어느 것도 유일하게 강제하지 않는다. 따라서 같은 프로젝트를 연 두 Workbench(또는 재개/동시 capture)가 동일 완료 turn을 발견하면 둘 다 서로 다른 id로 append할 수 있다. append 순서는 유지되지만 “한 completed turn = 한 Note”라는 소유권 계약은 깨진다.
   - [`test/t-notes.test.ts:131`](/Users/jonghoPro/woo/00_project/99_www/test/t-notes.test.ts:131)의 새 테스트는 서로 다른 Summary 두 개가 순서대로 저장되는지만 보장한다. 같은 completion identity의 동시 capture와 그 중 하나만 채택되는지를 검증하지 않는다.
   - 요구되는 수정 방향: completion identity를 저장 경계의 unique key/CAS로 삼거나, Core가 store-serialized `find-or-append` 계약을 사용하도록 바꿔 read·dedupe·append를 한 임계 구역으로 묶어야 한다. 동일 turn 동시 capture, 이미 저장된 turn 재시도, 다른 turn의 정상 동시 append를 각각 테스트해야 한다.

2. append가 저장 후 실패한 경우의 read-back 복구를 계약이 요구하지만 호출 경로가 수행하지 않는다.

   - [`src/core/application/work/t-note-service.ts:19`](/Users/jonghoPro/woo/00_project/99_www/src/core/application/work/t-note-service.ts:19)와 [`src/core/application/work/t-note-service.ts:54`](/Users/jonghoPro/woo/00_project/99_www/src/core/application/work/t-note-service.ts:54)는 `append`가 throw하면 기존 record를 다시 읽어 completed-turn identity로 대조하라고 명시한다.
   - 실제 automatic 경로는 [`src/core/application/orchestration/workbench-note-narration.ts:154`](/Users/jonghoPro/woo/00_project/99_www/src/core/application/orchestration/workbench-note-narration.ts:154)에서 throw를 단순 실패로 기록하고 [`src/core/application/orchestration/workbench-note-narration.ts:162`](/Users/jonghoPro/woo/00_project/99_www/src/core/application/orchestration/workbench-note-narration.ts:162)에서 해당 turn을 failed set에 넣는다. `create` 경로에도 read-back이 없다. 파일 append/sync 뒤 close·응답 단계의 불확실 실패나 다른 Port 구현의 at-least-once 실패에서 다음 manual capture는 새 append를 시도해 중복을 만든다.
   - 현재 [`test/t-notes.test.ts:229`](/Users/jonghoPro/woo/00_project/99_www/test/t-notes.test.ts:229)는 generator가 append **전** 실패하는 경우만 다룬다. append 완료 후 throw하는 Store double과 read-back으로 기존 Note를 회수하는 테스트가 없다.
   - 요구되는 수정 방향: `TNoteDraftStore` 또는 별도 Core use case에서 completion identity 기준 read-back/recovery를 구현하고, throw 전후의 저장 여부가 불명확한 실패를 명시적으로 테스트해야 한다.

### MEDIUM

없음.

### LOW

없음.

## 확인된 적합 사항

- Todo 저장 경계는 `TodoStore.compareAndSwap`의 revision CAS와 [`src/core/application/work/todo-ledger.ts:257`](/Users/jonghoPro/woo/00_project/99_www/src/core/application/work/todo-ledger.ts:257)의 conflict read-back을 실제로 사용한다. 새 JSDoc의 conflict 보존/재계산 의미와 일치한다.
- Workflow coordinator는 [`src/core/application/orchestration/workbench-workflow-coordinator.ts:193`](/Users/jonghoPro/woo/00_project/99_www/src/core/application/orchestration/workbench-workflow-coordinator.ts:193)의 monotonic revision으로 늦은 Todo sync 결과의 화면 반영을 버린다.
- Usage의 stale은 마지막 성공 limits를 유지하는 실패 상태이고, Auth/Git/Repository는 stale cache를 약속하지 않는다는 Port 설명이 각 adapter와 일치한다.
- `LinearProjectDashboardReader`는 TUI가 MCP 구현을 직접 알지 않고 project Dashboard라는 읽기 계약만 의존하도록 만든다. adapter는 실제로 issue/update/milestone/comment의 제한된 query를 수행하며 실패를 Workbench가 stale/unavailable로 판단할 수 있도록 reject한다.

## 판정

- codeQualityStatus: `BLOCK`
- recommendation: `REQUEST_CHANGES`
- blockers:
  1. completed-turn identity를 기준으로 하는 원자적 Note dedupe 또는 find-or-append 계약과 동시 capture 테스트.
  2. append 성공 여부가 불명확하게 throw한 경우 read-back으로 기존 Note를 회수하는 retry/recovery 구현과 테스트.

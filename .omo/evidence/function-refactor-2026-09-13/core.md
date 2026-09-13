# Core 함수 리팩터링 증거

## 범위와 기준

- 조사 범위: `src/core/**/*.ts` 73개 파일, 총 14,828줄과 관련 테스트 목록.
- 함수/메서드 밀도와 파일 길이를 함께 대조했다. 큰 후보는 `project-workbench.ts`(2,883줄, 메서드/함수 패턴 161개), `session-runtime.ts`(1,157줄), `workflow-projection.ts`(857줄), `session-stats.ts`(517줄), `todo-ledger.ts`(498줄)였다.
- `AGENTS.md`, `LAYERS.md`, `woo-entry`, `codebase-design` 및 `DEEPENING.md`의 seam·interface·locality 기준을 적용했다.
- 공개 interface, Core ID, dplan-v1 해시 framing/식별 알고리즘과 상태 문자열은 프로토콜 계약으로 유지했다.

## 변경

`src/core/domain/work/workflow-projection.ts`의 `projectWorkFlow`는 저널 검증, 선택 턴 탐색, 계획 revision 축약, 활동 귀속, 최종 projection 조립을 한 함수에서 수행했고 action/observation 귀속 규칙을 두 번 구현했다.

- 빈 projection과 기본 문구를 `emptyWorkFlow`와 모듈 정책 상수로 모았다.
- pending goal 및 선택 턴 구간/goal 탐색을 각각 이름 있는 내부 함수로 분리했다.
- plan association source 생성과 action/observation 귀속을 한 정책 함수로 통합했다.
- 최종 `SemanticWorkStep` 조립을 `projectSteps`에 모아 메인 함수가 journal → turn → revisions → result 흐름을 드러내게 했다.
- 외부 export나 인자/반환 타입을 추가하지 않았다. 새 내부 함수는 중복 정책 또는 독립된 계산 단계를 소유하며 한 줄 forwarding seam을 만들지 않는다.

`src/core/application/orchestration/project-workbench.ts`도 긴 메서드를 직접 검토했다. 그중 I/O 순서를 건드리지 않고 분리 가능한 반복 정책 두 곳을 정리했다.

- `applyDelta`: reasoning과 reasoning-summary가 각각 구현하던 “native item identity 변경 시 누적 tail 초기화 후 제한 길이 append” 계산을 `projectStreamingText`로 통합했다. 호출 전에 item identity가 없는 delta는 반환되므로 기존 `itemIdentity ?? currentIdentity`와 동일하게 항상 관측된 identity를 기록한다.
- `recordNativeEvent`: assistant draft, reasoning, reasoning summary, live activity가 각각 공유하는 terminal projection 정리 판정을 `shouldClearTerminalProjection`에 모았다. 여러 boolean 위치 인자를 노출하지 않고 해당 event에서 계산한 `TerminalProjectionScope` 하나로 item 종료/turn 종료 소유권 규칙을 전달한다.
- 두 메서드의 journal append, await, 상태 변경, publish 순서는 유지했다. 새 함수는 순수 계산이며 공개 class interface를 늘리지 않는다.

AST 상위 후보 세 함수도 본문과 관련 테스트를 별도로 검토했다.

- `RequestController.run`: command 검증부터 revision 확인, 승인, write-ahead append, capability 실행, receipt append까지 TOCTOU 방지 순서가 하나의 transaction을 이룬다. transaction 자체는 유지했다. 다만 `require_delivery`, `replan`, `propose`가 공통으로 수행하던 “journal append → reducer 재조회 → 같은 activity의 protocol rejection 확인 → response” 순서를 `appendRuntimeTransition`에 한 번만 구현했다.
- `validateArtifactCandidate`: Candidate envelope/digest/CAS 검증과 artifact별 content schema 검증이 섞여 있었다. 공통 envelope는 `validateArtifactEnvelope`, v1.0/v1.1 Project Comment 계약은 `validateProjectCommentCandidate`가 소유하도록 분리했다. 공개 validator는 같은 순서로 error를 누적한다.
- `projectRequestRuntime`: 첫 pass에서 protocol request와 turn을 결속하고 둘째 pass에서 동일한 append-only journal 순서대로 lifecycle/action/approval/stage/terminal event를 축약한다. 분기 순서와 `continue`가 event precedence 계약이며 `applyReport`, `resolveEvidence`, `event`, `reject`가 이미 독립 정책을 소유한다. 추가 분해는 mutable reducer context를 넓은 interface로 전달하거나 순서 의존성을 숨기므로 유지했다.

## 의도적으로 유지한 항목

- `ProjectWorkbench.startChatTurn`은 thread 생성 → intake journal 채택 → source bind → outbound append → Native turn 시작 → 성공/불확실/실패 기록의 순서 자체가 전달 보장이다. 별도 객체나 공개 seam으로 나누면 상태와 오류 순서를 interface에 노출하므로 유지했다.
- `ProjectWorkbench.recordNativeEvent`의 나머지 흐름은 Native event 정규화 → projection → durable append → 상태 reconcile 순서가 핵심이다. 순수 종료 판정만 분리하고 비동기 orchestration은 한 곳에 유지했다.
- `ProjectWorkbench.makeSnapshot`은 I/O 없는 projection 조립이지만 하나의 immutable `WorkbenchSnapshot` interface를 완성한다. 필드 묶음을 얕은 forwarding 함수로 흩뜨리면 호출자가 알아야 할 interface만 늘어 유지했다.
- `session-runtime.ts`의 큰 부분은 세션 이벤트 상태 머신, `session-stats.ts`는 이미 projection 단계별 내부 함수, `todo-ledger.ts`는 영속 Todo use case와 검증 정책으로 분리되어 있었다. 단순 파일 길이만으로 seam을 추가하지 않았다.
- `dplan-v1`, 상태명, digest framing 문자열, 공개 텍스트 제한은 외부화 가능한 환경 설정이 아니라 재생 결정성과 문서 projection을 규정하는 프로토콜/제품 정책이므로 Core에 유지했다.

## 검증

- `bun test test/work-flow.test.ts test/workflow-projection.test.ts test/execution-run.test.ts test/native-plan-wiring.test.ts`: 58 pass, 0 fail, 279 assertions.
- 최종 통합 focused 실행은 Workbench/plan 7개 suite에 `artifact-control`, `rpa-artifact-control`, `project-activity-artifact-control`, `request-runtime`, `request-controller`를 더한 12개 suite다: 242 pass, 0 fail, 1,385 assertions.
- `bun run check`: 성공 (`tsc --noEmit`).
- `git diff --check`: 성공.
- 변경 파일 및 관련 테스트에서 미완성 `TODO`, `test.skip`, `test.only`, `describe.skip/only`, `it.skip/only`: 없음. 테스트 fixture의 문자열 `TODO.md` 한 건은 Todo 문서 경로이며 작업 표식이 아니다.
- 공개 export 변화 없음.

## 공유 작업트리 주의

검증 시점에 adapter와 CLI 파일의 다른 작업자 변경이 보였다. 이 작업은 `src/core/domain/work/workflow-projection.ts`, `src/core/application/orchestration/project-workbench.ts`, `src/core/application/orchestration/request-controller.ts`, `src/core/domain/development/artifact-control.ts`와 이 증거 파일만 수정했으며 다른 변경을 되돌리지 않았다.

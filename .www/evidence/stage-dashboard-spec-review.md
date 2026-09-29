# Stage 및 진입 Dashboard Spec Review

## 범위와 확인 근거

- 사용자 요구: Stage가 실제 공개 보고에 따라 0/7에서 갱신되어야 함, 첫 화면이 `RELEASE → PROJECT → NOW → ACTIVITY`이며 현재 버전과 해당 릴리스 노트를 보여야 함, 기존 작업 보존.
- 확인 파일: `src/core/runtime/request-runtime.ts`, `src/core/application/orchestration/project-workbench.ts`, `src/core/application/orchestration/request-protocol.ts`, `src/adapters/inbound/tui/features/dashboard/view/entry-dashboard-view.ts`, 관련 diff와 테스트.
- 실행: `bun test test/request-runtime.test.ts test/entry-dashboard-view.test.ts` — 27 passed, 0 failed.

## CRITICAL

없음.

## HIGH

1. **Stage는 실제 작업 상태가 아니라 모델의 자발적 형식 보고에만 의존한다.** `src/core/runtime/request-runtime.ts:323-336`은 assistant message가 `[www-runtime]` JSON이거나 v2 `runtime/stage-report`일 때만 Stage를 바꾼다. 보고가 한 번도 도착하지 않고 Native turn이 끝나면 `:370-380`이 미정산 Stage 전부를 blocked로 바꾼다. 사용자가 본 `0/7`과 `Ⅱ UNDERSTAND …`가 바로 이 경로와 일치한다. 현재 diff는 프롬프트 문구와 parser fixture만 고쳤을 뿐, 요청 시작·공개 보고·화면 갱신을 연결하는 실행 경로를 만들지 않았다.

2. **기존 Goal이 있을 때의 일반 후속 입력은 Runtime 관리 대상이 아니다.** `src/core/application/orchestration/project-workbench.ts:854-859`에서 `effectiveGoal`은 `goal || this.sessionGoal === null`이다. 세션 Goal이 이미 존재하는 상태에서 일반 입력/큐 입력은 `false`가 되고, `:877-880`, `:958-959`에서 request submitted/queued/started 관측과 protocol context가 생략된다. 따라서 이 입력의 Stage는 갱신될 수 없으며, queued follow-up continuity를 추가한 `:1032-1036`도 실행되지 않는다.

3. **RELEASE에는 버전과 무관한 최신 Linear Project Update가 표시된다.** `src/adapters/inbound/tui/features/dashboard/view/entry-dashboard-view.ts:74-84`의 `updateRows`는 `LinearDashboardUpdate`의 body/createdAt만 출력하며, 도메인 타입 `src/core/domain/work/linear-dashboard.ts:12-15`에도 릴리스 버전·릴리스 ID·매칭 정보가 없다. 그런데 `:362`가 이를 `v${PRODUCT_VERSION}`과 같은 RELEASE 섹션에 둔다. 즉 0.0.21 옆에 0.0.21과 관계없는 가장 최근 Update가 릴리스 노트인 것처럼 보인다.

## MEDIUM

1. **loading/unavailable 첫 화면은 요구한 네 섹션 구조를 유지하지 않는다.** `entry-dashboard-view.ts:341-352`는 RELEASE와 PROJECT만 출력하고 NOW/ACTIVITY를 완전히 생략한다. 첫 진입의 실사용 상태가 loading이므로, 사용자는 요청한 정보 구조가 아닌 두 섹션만 보게 된다.

2. **테스트가 실제 사용자 실패를 재현하지 않는다.** `test/request-runtime.test.ts:56-64`는 Journal에 형식이 맞는 Stage message를 직접 주입하고, `:94-102`는 queued 흐름 없이 skip report만 직접 주입한다. `test/entry-dashboard-view.test.ts:106-119`는 순서와 문자열만 검사한다. startTurn → assistant public report 부재/도착 → Runtime projection → `WwwExecutionHeading`의 `Stages n/7`을 잇는 black-box 테스트와, 버전별 릴리스 노트 매칭 테스트가 없다.

3. **버전 assertion이 고정값이다.** `test/entry-dashboard-view.test.ts:112`는 `v0.0.21`을 고정 확인한다. 다음 버전으로 PRODUCT_VERSION이 바뀌면 제품 동작은 맞아도 테스트가 실패하며, 현재 버전 상수를 표시한다는 계약을 직접 검증하지 못한다.

## LOW

1. **ACTIVITY의 경계가 혼합되어 있다.** `entry-dashboard-view.ts:374-388`는 Comment 뒤에 최근 갱신 이슈·blocked/stale 건강도·sync 시각을 같은 ACTIVITY 섹션 안에 이어 붙인다. 정보는 유용하지만 Activity가 Comment만 뜻하는지 프로젝트 상태까지 뜻하는지 명확하지 않아 표면 의미가 흐려진다.

## 설계 충실도 판정

- 라이브 TUI 컴포넌트와 기존 theme primitive(`colors`, `a`)를 사용하며, 스크린샷·raster background-image를 UI 대체물로 사용한 흔적은 확인하지 못했다.
- 다만 위 HIGH 항목으로 실제 Runtime 상태/릴리스 계약은 충족되지 않는다.

## 권고

**REQUEST_CHANGES** — Stage는 관찰 가능한 Runtime 전이로 보장하고, RELEASE 데이터에 버전-릴리스 노트의 명시적 연결을 추가한 뒤, 실제 queue/start/turn-complete 경로를 black-box로 검증해야 한다.

## 최종 재검토

- `runWww` 기본을 observational Runtime으로 연결해 후속 요청도 관리한다.
- 최근 Project Update 20건에서 `v0.0.N`과 `0.0.N`을 정규화하고 현재 `PRODUCT_VERSION`과 일치하는 릴리스만 선택한다.
- loading·unavailable에서도 RELEASE → PROJECT → NOW → ACTIVITY 네 섹션을 유지한다.
- 집중 회귀 73개, TypeScript, import·table 정렬, diff 검사가 통과했다.
- 최종 판정: **CLEAR**.

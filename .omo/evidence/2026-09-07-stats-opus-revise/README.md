# WOO-714 Stats Opus REVISE 보완 증거

기준 HEAD: `10fb132a5cff59d7ea2c395f1a50c88cab322be0`

변경 diff SHA-256: `4d6d17055d7be3bee88ab0b0bc42e2b77a7777839428e1fb6803057182e423cf`

## 수락 시나리오와 이진 관측값

1. `ProjectWorkbench`가 만든 실제 앱 스냅샷에서 신규 세션은
   `totalTokens: 0, observedTotalTokens: null`이고, 최초 Native zero
   관측 뒤에는 `observedTotalTokens: 0`이다. 재개 세션은 최초 누적
   500을 기준선으로만 받아 계속 `null`이며, 두 번째 500 뒤 정확히
   `0`으로 전환한다. 같은 스냅샷을 `projectSessionStats`에 전달하면
   동일하게 `null`과 `0`을 구분한다.
   - 실행: `bun test test/project-workbench.test.ts test/session-stats.test.ts test/session-stats-view.test.ts test/workbench-telemetry.test.ts test/observability-dashboard.test.ts`
   - 관측: `111 pass, 0 fail, 958 expect() calls`
   - 테스트: `test/project-workbench.test.ts`의 `preserves real usage observation coverage from ProjectWorkbench into Stats`

2. 실행 중인 세션에 completed/failed/cancelled root turn이 섞여도 헤더에
   `ROOT OUTCOMES · completed 1 · failed 1 · cancelled 1 · active 1 · boundary-only 0`가
   남고, 40/80/120열에서 각 수가 첫 구분선 위에 렌더된다.
   - 실행: 위 targeted test
   - 관측: session stats view의 mixed outcome 및 40/80/120열 3개 검사 통과
   - 테스트: `test/session-stats-view.test.ts`

3. `TOKENS / ROOT TURN`의 캡션은 실제 계산식과 동일하게
   `interactive tokens ÷ N completed root turns`를 표시한다.
   - 실행: 위 targeted test
   - 관측: `renders coverage, observation units, denominators, and acceptance boundary` 통과
   - 테스트: `test/session-stats-view.test.ts`

## 전체 회귀

- `bun test` → `633 pass, 0 fail, 4505 expect() calls`
- `bun run check` → `tsc --noEmit` 성공
- `git diff --check` → 출력 없음
- 변경 파일 marker scan (`TODO|FIXME|test.skip|test.only`) → 출력 없음

`change.patch`는 이 검증 때의 전체 미커밋 diff다. 기존 Native PTY 증거와
scratchpad 파일은 변경하거나 삭제하지 않았다.

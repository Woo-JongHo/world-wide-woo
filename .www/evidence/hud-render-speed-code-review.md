# HUD 렌더 속도 표시 독립 리뷰

대상: `src/adapters/inbound/tui/shell/www-surface.ts`, `src/adapters/inbound/tui/shell/workbench-shell.ts`, `test/www-ui.test.ts`

## Skill-perspective check

`remove-ai-slops`와 `programming` 스킬은 이 작업 환경의 Available skills에 없어서 로드할 수 없었다. 그 기준(요구 밖 데이터 가공·불필요한 추상화·구현을 그대로 복제한 테스트·취약한 문자열 테스트)을 직접 적용했다. 새로운 production parsing/normalization이나 불필요한 계층은 없고, 기존 성능 스냅샷을 HUD에 주입하는 변경은 범위에 맞다. 다만 아래 테스트는 실제 shell 갱신 계약을 검증하지 못한다.

## Findings

없음.

## Re-review

- `src/adapters/inbound/tui/shell/workbench-shell.ts:197-208`은 terminal write 완료 시, 실제 계측 trace가 있었던 WWW 프레임에만 후속 `tui.requestRender()`를 요청한다. trace 집합을 비운 뒤 요청하므로 그 후속 프레임은 다시 refresh를 예약하지 않아 루프가 생기지 않는다.
- `src/adapters/inbound/tui/shell/workbench-shell.ts:364`의 HUD callback은 매 렌더에서 workbench의 최신 성능 윈도우를 읽는다.
- `src/adapters/inbound/tui/shell/www-surface.ts:540-545`는 100열급 HUD에서 Render를 quota/activity/cache보다 먼저 유지하고, 20열처럼 runtime까지 보존해야 하는 폭에서는 정상적으로 제거한다.
- `test/tui-shell-characterization.test.ts:238`은 실제 WWW shell terminal output에서 `Render p95`가 나타날 때까지 기다린다. 기존의 직접 HUD 단위 테스트만으로는 놓치던 freshness 배선을 이 테스트가 덮는다.
- 재실행: `npm test -- --runInBand test/tui-shell-characterization.test.ts test/www-ui.test.ts` — 93 pass. `npx tsc --noEmit` — pass. `git diff --check` — pass.

## 색상 경계 재리뷰

없음. `displayedP95 = Math.round(p95)`가 라벨 및 세 색상 분기에 공통으로 쓰인다. `test/www-ui.test.ts`는 32.4/32.5 및 100.4/100.5에서 ANSI 색상과 표시 문자열 전환을 검증하고, 20열에서는 Render가 생략됨도 유지한다. `npm test -- --runInBand test/www-ui.test.ts` — 78 pass, `git diff --check` — pass.

## Verdict

- codeQualityStatus: CLEAR
- recommendation: APPROVE
- blockers: 없음.

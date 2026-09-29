## 변경

- 일반 observe Chat과 F3에서 7단계 HUD·단계 시간 요약을 숨기고, GOAL·Native PLAN·해석된 PROGRESS를 구분해 표시했다.
- PROGRESS의 PLAN task 중복을 제거하고 TEST 요약에는 명령 대신 검증 결과를 먼저 표시했다.
- 질문에 테마 userSurface 배경을 적용하고, observe WORK는 Native가 검증하지 않은 작업도 사실대로 기록할 수 있게 했다. Broker 단계 게이트는 유지했다.

## 영향

- 사용자는 계획 항목과 그 안에서 실제로 진행된 일을 혼동하지 않고, 자신의 질문을 채팅에서 빠르게 찾을 수 있다.
- 테스트·검증 실행 여부는 Native가 작업에 맞춰 정하고, 미실행 검증을 완료로 표시하지 않는다.

## 분류

Improvement · Fix · Validation

## 검증

- bun test test/www-ui.test.ts test/plan-activity-view.test.ts test/request-runtime.test.ts: 121 pass, 0 fail.
- bun run check 및 git diff --check: 통과.
- Claude Sonnet 5 독립 검토: 세션 한도로 미실행. 실제 TUI 사용자 수락: 미실행.

## 연결

- Primary Linear: WOO-700 · Native Plan projection
- Related Linear: WOO-680 · Layout
- Evidence: .www/evidence/2026-09-28-native-goal-plan-progress
- Branch: dev · HEAD 8486a759746ab2e0748beb1ab9fdd4d250fa6b27 · uncommitted

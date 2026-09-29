## 변경

- WwwGoalBar의 GOAL 문구에 기존 wwwFlowText 그라데이션을 연결했다.
- 색상 변화와 기존 GOAL·좁은 폭 표시를 테스트로 확인했다.

## 영향

- GOAL 문구를 단색 대신 기존 주황·분홍 그라데이션으로 표시한다.
- 새 주기적 렌더나 별도 모델 호출은 추가하지 않는다.

## 분류

Fix · Validation

## 검증

- bun run build: 2862 modules bundled, exit 0.
- bun run check: exit 0.
- bun test test/www-ui.test.ts test/www-ui-preview.test.ts: 87 pass, 0 fail.
- git diff --check: exit 0.
- woo-code-readability 링크 대상 부재로 지정 스크립트는 미실행.

## 연결

- Linear: WOO-700 기존 GOAL 표시 결속
- Code: src/adapters/inbound/tui/shell/www-surface.ts; test/www-ui.test.ts
- Evidence: .www/evidence/2026-09-28-goal-gradient-build

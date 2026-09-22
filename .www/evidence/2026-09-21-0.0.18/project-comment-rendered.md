## 변경

- Workbench에 /theme Gruvbox·Tokyo Night 전환과 theme-aware render cache 재생성을 연결했다.
- Plan 세부·Queue 입력 placeholder·5행 bounded terminal output·provider 구독 잔여 HUD를 현재 화면 계약에 맞춰 정리했다.
- WWW 환영 화면에 동일질량 figure-eight 삼체 수치 궤도와 결정적 narrow-width 렌더를 추가했다.
- Linear Dashboard가 최신 Project Activity Comment 5건을 읽고 입장 화면 ACTIVITY에 최근 3건을 표시하도록 복구했다.

## 영향

- Linear Update만 멈춰 보이던 입장 화면에서 실제 작업 Comment의 작성자·경과·요약을 확인할 수 있다.
- Comment 조회가 실패해도 기존 이슈·Update·마일스톤 Dashboard는 유지된다.
- 새 Workbench 시각 기능과 렌더링 캐시 경계가 0.0.18 릴리스 후보에 함께 고정된다.

## 분류

Feature · Improvement · Fix · Validation

## 검증

- bun run check 통과
- bun test: 1311 pass, 0 fail, 16834 assertions, 146 files
- Linear Dashboard·Activity·Workbench·Astra 대상 회귀 285 pass, 0 fail
- git diff --check 통과 및 bun src/cli.ts --version → 0.0.18
- Comment 조회 실패 fallback과 narrow-width ACTIVITY 렌더 검증 통과

## 연결

- Linear: WOO-912
- Branch: ui/workbench-visual-polish
- Package: 0.0.18
- Evidence: .www/evidence/2026-09-21-0.0.18
- Research: docs/research/2026-09-21-three-body-special-solutions.md

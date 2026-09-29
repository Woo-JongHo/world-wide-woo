## 변경

- Chat composer가 sidebar와 같은 visibility 조건을 사용해 sidebar가 보일 때 38열 줄어들도록 조립했다.
- HUD의 provider quota·context·cache·runtime 구조는 유지하고 Render p95 조각만 제거했다.
- 제품 경로의 18행 threshold, workbench 외 비활성 gate, sidebar toggle 복원을 회귀 테스트로 고정했다.

## 영향

- 입력창이 우측 관측 sidebar 아래로 침범하지 않고 Figma의 좌측 작업영역 폭에 맞는다.
- Render Health 측정은 Monitor에 남되 하단 HUD의 상시 표시에서는 제외된다.

## 분류

Improvement · Fix · Validation

## 검증

- Figma node 142:5의 고해상도 design context와 1536×960 screenshot을 대조했다.
- 관련 UI·shell·HUD·architecture 회귀 166개와 6681개 assertion이 통과했다.
- tsc --noEmit과 git diff --check가 통과했고 skip·only·TODO 표식이 발견되지 않았다.
- 독립 Claude Sonnet 5 리뷰의 threshold·gate 테스트 지적을 반영해 재검증했다.
- 프로젝트 가독성 스킬 경로는 파일이 없어 전용 스크립트를 실행하지 못했다.

## 연결

- Primary Linear: WOO-680 · Layout
- Related Linear: WOO-915 · Render Health monitoring
- Figma: Q7kGUdqiaQRJI8CZlPMRX7 · node 142:3890 / implementation reference 142:5
- Evidence: .www/evidence/2026-09-28-figma-chat-input-hud
- Review: .www/scratchpad/2026-09-28-figma-chat-layout-review.md

## 변경

- 요청 접수 직후 request objective를 provisional Session Goal로 투영하고 UNDERSTAND 완료 시 정제 결과로 교체한다.
- queued follow-up이 provisional Goal을 포함한 현재 snapshot을 이어받게 했다.
- HUD가 live layer performance의 관측된 Render p95를 표시하고 terminal-write 측정 직후 한 번만 후속 repaint한다.
- WWW 저빈도 상태 시계를 120ms에서 1초로 낮춰 불필요한 전체 화면 깜빡임을 줄였다.

## 영향

- 활성 요청에서 GOAL이 비어 보이는 구간을 없애고 이후 이해 결과의 정제를 유지한다.
- Render p95가 측정됐지만 다음 입력 전까지 HUD에 나타나지 않던 갱신 누락을 막는다.
- 빠른 Native activity 갱신은 유지하면서 정기적인 전체 repaint 빈도를 줄인다.

## 분류

Fix · Improvement · Validation

## 검증

- 관련 Workbench·HUD·shell 회귀 166개가 통과했다.
- bun run check와 git diff --check가 통과했다.
- 변경 TypeScript의 import normalization과 table alignment 검사가 통과했다.
- 실제 shell 특성 테스트에서 Render p95 문자열의 후속 repaint 노출을 확인했다.
- Claude Sonnet·Opus 독립 감사는 CLI max-turn 제한으로 판정문을 회수하지 못해 미완료다.

## 연결

- Linear: WOO-700 · WOO-915
- Evidence: .www/evidence/2026-09-27-goal-render-hud-repair
- Prior evidence: .www/evidence/2026-09-27-stage-dashboard-completion · .www/evidence/2026-09-27-render-health-monitoring
- Branch: dev · HEAD 495f61c0f3d5e3c9c6d58340d315c06b4ad70cc0 · uncommitted

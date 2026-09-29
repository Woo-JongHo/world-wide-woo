## 변경

- Chat의 전체 완료 Note·단계 시간 블록을 제거하고 사이드바 REPORT를 결과·작업/변경/차단·잔여/근거 4필드, 각 최대 2행으로 투영했다. 전체 원문은 /output에서 읽는다.
- 사이드바 PLAN→PROGRESS 최신 최대5→관측 TEST→REPORT 순서로 정리했다. PROGRESS 대체 단계 작업 경로도 최대5로 제한했다. REPORT는 현재 turn Note를 선택하며 렌더 결과를 재사용한다.
- TOP의 두 줄을 GOAL 왼쪽, LANGUAGE·실제 경로 오른쪽 한 줄로 변경하고 높이 예산을 조정했다.

## 영향

- request-report-v3 저장 템플릿은 유지하며 화면 표시만 축약한다. 4필드 안은 선택 질문에 답변이 없어 권장안으로 잠정 적용했다.
- 7단계 상태 로직은 유지한다. Chat의 ×는 failed와 blocked 모두 의미하고, Native 종료 시 미정착 단계가 차단될 수 있다. skipped 표기는 Chat · / 모니터 ✓로 다르다.

## 분류

Improvement · Refactor

## 검증

- bun run check와 git diff --check 통과. 변경한 Chat/Monitor 파일에서 TODO·test.skip·test.only 없음.
- 행동 테스트·실제 TUI·성능 실측·Claude Sonnet/Opus 독립 검토는 미실행. 필수 가독성 00/06 스크립트는 미발견. 구현 수락 완료를 주장하지 않는다.
- Obsidian 동일 identity draft Candidate를 준비했다. 최신 Vault bytes/digest 대조와 게시는 미실행이며 기존 expectedBefore는 게시 전에 갱신해야 한다.

## 연결

- [WOO-913](https://linear.app/woo-world/issue/WOO-913/workbench-monitoring-figma-5화면의-계측-의미와-정보-구조를-일치시킨다)
- docs/audit/2026-09-29-sidebar-report.md
- src/adapters/inbound/tui/features/chat/view/www-execution.ts
- src/adapters/inbound/tui/features/monitoring/view/www-monitor-view.ts
- src/adapters/inbound/tui/shell/www-surface.ts
- src/adapters/inbound/tui/shell/workbench-shell.ts
- .www/evidence/2026-09-29-sidebar-report

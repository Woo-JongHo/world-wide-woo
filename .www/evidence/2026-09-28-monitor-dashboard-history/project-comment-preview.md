## 변경

- Dashboard에 현재 세션의 요청 기록을 최신순으로 표시하고 ↑↓·Enter 또는 /monitor #번호로 질문별 Monitor를 연다.
- Monitor 기록 선택을 요청 ID로 유지하고 해당 turn의 활동·계획만 투영한다. Chat 우측 Monitor는 계속 현재 요청만 본다.
- Cache·Context 화면의 기본 선택기·명령 목록·데모 진입을 숨기고 직접 명령은 보존한다.
- 완료된 요청의 Monitor 경과 시간은 기록된 종료 시각으로 고정한다.

## 영향

- 현재 질문의 실시간 관측과 과거 질문의 Monitor 기록 탐색이 한 흐름으로 연결된다.
- 지난 질문을 열어도 Chat 우측 패널에 과거 기록이 섞이지 않는다.
- Cache·Context 기능은 삭제하지 않고 기본 탐색에서 보류한다.

## 분류

Feature · Improvement · Validation

## 검증

- bun run check 통과.
- bun test test/www-keymap.test.ts test/www-ui.test.ts test/workbench-shell-policy.test.ts test/www-shell.test.ts test/architecture.test.ts: 150 pass, 0 fail. Dashboard ↑↓·Enter 기록 열기와 /monitor 실시간 복귀를 셸 입력 테스트로 확인했다.
- git diff --check 통과.
- 실제 터미널 수동 수락과 독립 리뷰는 미실행.
- AGENTS.md의 woo-code-readability symlink 대상이 없어 지정 정렬 스크립트는 미실행.

## 연결

- Linear: WOO-674 (primary), WOO-675 (Monitor), WOO-680 (Chat 연결)
- Code: src/adapters/inbound/tui/features/dashboard/view/entry-dashboard-view.ts; src/adapters/inbound/tui/features/monitoring/view/www-monitor-view.ts; src/adapters/inbound/tui/shell/workbench-shell.ts
- Evidence: .www/evidence/2026-09-28-monitor-dashboard-history
- Branch: dev · HEAD 8486a759746ab2e0748beb1ab9fdd4d250fa6b27 · uncommitted

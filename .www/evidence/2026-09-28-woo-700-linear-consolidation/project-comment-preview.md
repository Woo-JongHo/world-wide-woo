## 변경

- WOO-700의 기존 게시 기록을 대조했다. 9월 26일 queued 후속 입력의 Plan 유지와 9월 27일 PLAN·PROGRESS·GOAL 보정은 이미 Project Activity에 게시돼 있어 새 완료 실적으로 중복 계산하지 않는다.
- 그 뒤 일반 observe 요청의 INTENT에 공개 계획을 받아 Native·Runtime Plan 목록으로 투영하고, WORK 종료 시 해당 항목을 완료 상태로 정리한다.
- 같은 요청의 PLAN 도착 전 PROGRESS는 대기시키고, queued 후속 요청은 새 Plan revision이 관측될 때까지 이전 계획을 유지한다. Plan 항목별 최신 진행을 해당 항목 아래에 묶어 보여준다.
- 현재 WOO-700은 In Progress다. 실제 TUI 사용자 수락과 독립 검토를 완료로 주장하지 않는다.

## 영향

- 사용자는 현재 요청의 계획과 각 항목의 진행을 구분해 읽고, 새 계획이 없는 후속 입력에서 이전 계획이 갑자기 사라지지 않는다.
- WOO-700의 진행 기록을 기존 게시물과 최신 검증에 연결하면서 Chat·Git Bash 전용 변경을 이 이슈의 완료 범위에 섞지 않는다.

## 분류

Improvement · Fix · Validation

## 검증

- 현재 worktree에서 bun test test/native-plan-wiring.test.ts test/plan-activity-view.test.ts test/plan-activity-narration.test.ts test/www-ui.test.ts: 127 pass, 0 fail, 2857 assertions.
- 현재 worktree에서 bun run check: 통과.
- Linear 앱 read-back: WOO-700은 WOO-682 하위, World Wide Woo 프로젝트, In Progress다. Project Activity에서 기존 WOO-700 관련 Comment 881b64cd·9112898e를 확인했다.

## 연결

- Linear: WOO-700 · UUID 770ebed8-f030-4610-9668-dd2023b26a9a · Parent WOO-682
- 기존 Project Activity: 881b64cd, 9112898e
- Evidence: .www/evidence/2026-09-28-woo-700-linear-consolidation
- 추가 소스: .www/evidence/2026-09-28-observe-plan-restoration, .www/evidence/2026-09-28-chat-stage-order-test-gate, .www/evidence/2026-09-28-plan-progress-action-boundary

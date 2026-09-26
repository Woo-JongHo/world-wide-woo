## 변경

- WWW 실행 화면 우측 사이드바의 Three Body 궤도 카드와 전용 애니메이션 렌더 조건을 제거했다.
- 사이드바는 Plan만 렌더하도록 단순화하고 /three-body 명령과 전체 화면 Lab 기능은 유지했다.
- 빈 실행 화면과 활성 대화 화면 모두 Three Body 카드가 노출되지 않는 회귀 테스트로 기존 궤도 표시 테스트를 교체했다.

## 영향

- 실행 화면에서 제품 작업과 무관한 시각 장식이 사라지고 Plan 정보가 사이드바 전체 높이를 사용한다.
- 사용자는 기존 /three-body 명령으로 실험실 기능을 계속 사용할 수 있다.

## 분류

Improvement · Validation

## 검증

- bun test test/plan-activity-view.test.ts: 8 pass, 0 fail, 165 assertions.
- bun run check의 tsc --noEmit 통과.
- 변경한 제품·테스트 파일 3개의 import 정규화와 표 정렬 검사에서 errors=0, misaligned=0.
- Claude Sonnet 5 독립 리뷰는 세션 한도로 미실행했으며 .www/scratchpad/2026-09-26-three-body-sidebar-review.md에 blocker를 기록했다.

## 연결

- Linear: WOO-912
- Code: src/adapters/inbound/tui/shell/www-surface.ts · src/adapters/inbound/tui/shell/workbench-shell.ts · test/plan-activity-view.test.ts
- Evidence: .www/evidence/2026-09-26-three-body-sidebar-removal
- Branch: dev · HEAD e17837f8a0a5cb226674f397b63b8c6011901670 · uncommitted

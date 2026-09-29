## 변경

- INTENT에 1~8개의 공개 작업 계획을 추가하고 DECOMPOSE와 PLAN 작업 목록에 투영한다.
- WORK가 완료되면 해당 계획 작업도 완료 상태로 정리한다.

## 영향

- 새 요청에서 UNDERSTAND 직후 구체적인 PLAN을 볼 수 있다.
- 기존 plan 없는 기록은 재생 호환성을 위해 계속 읽는다.

## 분류

Fix · Validation

## 검증

- 요청 Runtime·Controller·Native Plan 집중 회귀 56개 통과.
- Workbench·UI·앱·아키텍처 회귀 130개 통과.
- TypeScript 타입 검사와 git diff --check 통과.
- 실제 TUI 수락과 독립 Claude 리뷰는 미실행: Claude 세션 한도.

## 연결

- Linear: WOO-700
- Evidence: .www/evidence/2026-09-28-observe-plan-restoration
- Branch: dev · uncommitted

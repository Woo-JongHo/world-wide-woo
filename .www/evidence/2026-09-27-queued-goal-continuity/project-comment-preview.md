## 변경

- ESC로 대기한 후속 요청의 Runtime context에 queued-follow-up identity와 현재 Session Goal을 전달한다.
- 후속 요청이 같은 Goal의 보충인지, 목표·제약·성공 조건을 바꾸는지 UNDERSTAND 실행 전에 판정하도록 계약을 추가했다.
- 같은 Goal이면 UNDERSTAND를 pass하고 기존 Goal을 정확히 보존하며, Goal이 없거나 의미가 바뀌면 UNDERSTAND를 다시 수행한다.

## 영향

- 큐에 넣었다는 전달 방식만으로 UNDERSTAND가 불필요하게 반복되지 않는다.
- 연속 후속 요청에서도 Runtime objective가 판정 사유로 덮이지 않고 기존 Goal을 유지한다.

## 분류

Improvement · Fix · Validation

## 검증

- request-runtime과 project-workbench-recording 테스트 51개가 통과했다.
- ESC 사용자 입력 경계인 www-shell 테스트 7개가 통과했다.
- bun run check, import normalization, table alignment와 git diff --check가 통과했다.
- 독립 코드 리뷰의 Goal 보존 결함을 수정한 뒤 CLEAR·APPROVE 판정을 받았다.

## 연결

- Linear: WOO-700 · UUID 770ebed8-f030-4610-9668-dd2023b26a9a
- Parent: WOO-682
- Obsidian: Todo/Native Plan projection — AI가 세운 계획을 세션별로 실시간 확인한다.md
- Evidence: .www/evidence/2026-09-27-queued-goal-continuity
- Review: .www/evidence/queued-follow-up-goal-continuity-code-review.md
- Branch: dev · HEAD 495f61c0f3d5e3c9c6d58340d315c06b4ad70cc0 · uncommitted

## 변경

- STAGE 진행률을 completed·skipped 성공 수가 아니라 pending·running을 제외한 terminal 단계 수로 계산하도록 변경했다.
- failed·blocked 단계는 일반 단계 목표 대신 Runtime에 기록된 실제 종료 output을 우선 표시하도록 변경했다.
- Native 중단 회귀에 7/7 terminal 진행률과 사용자 가시 중단 사유 검증을 추가했다.

## 영향

- VERIFY까지 끝나고 DELIVER에서 중단된 요청이 6/7 running처럼 오해되지 않고 7/7 BLOCKED로 보인다.
- 중단을 완료로 위장하지 않으면서 사용자가 실제 종료 사유를 화면에서 바로 확인할 수 있다.

## 분류

Fix · Validation

## 검증

- bun test test/request-runtime.test.ts test/www-ui.test.ts: 97 pass, 0 fail, 2494 assertions.
- bun run check: exit 0.
- 변경 TypeScript import normalization·table alignment와 git diff --check가 통과했다.

## 연결

- Linear: WOO-688 · 답변 생성·완료·중단 과정을 보여준다
- Related Linear: WOO-700 · STAGE·PLAN·PROGRESS 표시
- Obsidian Candidate: .www/evidence/2026-09-27-terminal-stage-progress/obsidian-canonical-candidate.json
- Evidence: .www/evidence/2026-09-27-terminal-stage-progress
- Branch: dev · HEAD 495f61c0f3d5e3c9c6d58340d315c06b4ad70cc0 · uncommitted

## 변경

- Commit Candidate에 Fixes와 Verified 값을 필수 필드로 추가했다.
- validator가 두 값의 누락과 줄바꿈을 차단하고 renderer가 커밋 본문 마지막에 각각 정확히 한 번 출력하게 했다.
- 메시지 위치와 빈 값 거부를 commit-governance 회귀 테스트로 고정했다.

## 영향

- 스킬 문서와 실행기의 드리프트 때문에 승인된 커밋 메시지가 기록 계약을 위반할 수 있던 경로를 차단한다.
- 의미 단위 분할, 사용자 승인, 로컬 commit 전용이라는 기존 WOO-844 경계는 유지한다.

## 분류

Fix · Validation

## 검증

- bun test test/commit-governance.test.ts --reporter=dots: 10 pass, 0 fail.
- bun run check의 tsc --noEmit 통과.
- 대상 TypeScript import 정규화와 표 정렬 검사, 스킬 quick validation, 대상 diff check 통과.

## 연결

- Linear: WOO-844
- Code: schemas/commit-candidate.schema.json · src/core/commit/commit-governance.ts · test/commit-governance.test.ts
- Evidence: .www/evidence/2026-09-26-woo-commit-message-contract
- Commit Candidate: COMMIT-CANDIDATE-WOO-COMMIT-MESSAGE-CONTRACT-20260926

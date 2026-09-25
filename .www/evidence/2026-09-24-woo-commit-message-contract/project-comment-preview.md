## 변경

- woo-commit 제목이 실제 업무·모듈 소유자와 완성된 결과를 함께 말하도록 메시지 계약을 보강했다.
- 비자명한 변경 본문은 문제와 이전 동작, 이번 결정, 의도적으로 하지 않은 것의 이유를 서술하고 마지막에 Fixes와 Verified를 각각 한 번 기록하게 했다.
- 작은 기계적 변경은 제목만 허용해 형식 충족을 위한 의미 없는 본문을 만들지 않게 했다.

## 영향

- 커밋만 읽어도 운영상 문제의 역사, 선택한 수신자·상태 범위, 실제 통과한 검증을 복원할 수 있다.
- Conventional Commit 유형 접두어 금지는 유지하면서 14_HelixQAC 같은 실제 업무 소유자 접두어는 사용할 수 있다.

## 분류

Improvement

## 검증

- git diff --check -- .agents/skills/woo-commit/SKILL.md 통과.
- writing-for-agents의 pointer, 정보 계층, 완료 기준 규칙과 대조해 메시지 규칙을 한 절에 함께 배치했다.
- 게시 전 Project Activity 최신 Comment ID는 다시 조회해야 하며, 이 Candidate는 외부 게시하지 않았다.

## 연결

- Linear Candidate: .www/evidence/2026-09-24-woo-commit-message-contract/linear-issue-candidate.json
- Code: .agents/skills/woo-commit/SKILL.md
- Evidence: .www/evidence/2026-09-24-woo-commit-message-contract

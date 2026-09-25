# 커밋에서 업무 결정과 실제 검증을 복원한다

## 목적

짧은 결과 제목과 이유·검증 두 줄만으로는 이전 동작의 양면성, 선택한 범위, 의도적으로 제외한 동작을 복원할 수 없는 문제를 막는다.

## 범위

### 포함

- 제목에 실제 업무·모듈 소유자와 완성된 결과를 기록한다.
- 비자명한 변경은 문제와 이전 동작, 이번 결정, 비선택 사유 순으로 본문을 작성한다.
- 본문 마지막에 관측 가능한 문제를 Fixes로, 실제 통과한 검증만 Verified로 기록한다.

### 제외

- Conventional Commit 유형 접두어 도입
- Push·PR·Merge 자동 실행
- 작은 기계적 변경에 의미 없는 본문을 강제하는 것

## 완료 조건

- woo-commit 스킬이 업무 소유자 접두어와 결과 제목을 구분해 안내한다.
- 비자명한 변경 예시가 문제 역사, 결정, 비선택 사유, Fixes, Verified를 모두 포함한다.
- Verified에는 실제 실행한 검증만 기록하도록 명시한다.

## 연결

- Historical parent: WOO-747 · UUID 67c571a6-f8ff-4cc3-a2a1-7278f14ddc7b
- Code: .agents/skills/woo-commit/SKILL.md
- Evidence: .www/evidence/2026-09-24-woo-commit-message-contract

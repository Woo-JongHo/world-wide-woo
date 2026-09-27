## 변경

- Workbench의 사용자 표시 PLAN·PROGRESS·NEXT를 대문자로 통일했다.
- Composer에 `/`만 제출하면 대화로 dispatch하지 않고 slash 명령 안내를 유지하도록 차단했다.
- 같은 thread의 queued 후속 입력이 시작돼도 기존 PLAN·PROGRESS를 유지하고, 새 Plan이 journal에 기록된 뒤 새 turn으로 전환하도록 변경했다.
- 새 Plan 없이 queued turn이 terminal이 되면 보류 상태를 해제해 다음 queued turn 전환을 막지 않게 했다.

## 영향

- 사용자는 같은 작업 맥락의 후속 입력 중에도 현재 계획과 진행을 잃지 않고, 새 계획이 실제 도착한 시점에만 화면이 교체된다.
- 불완전한 slash 입력이 일반 대화로 전송되지 않으며 주요 실행 표기의 대소문자가 일관된다.

## 분류

Improvement · Fix · Validation

## 검증

- bun run check: 통과.
- bun test: 1573 pass, 0 fail, 21507 expect, 180 files.
- 변경 TypeScript의 import normalization과 table alignment: misaligned 0.
- git diff --check 및 변경 파일 test.skip·test.only·구현 TODO 검사: 통과.
- 실제 TUI의 연속 queue 입력과 slash popup 수동 조작은 미실행.

## 연결

- Linear: WOO-912 — Workbench 표기
- Linear: WOO-700 — Native Plan projection과 queued 전환
- Linear: WOO-909 — slash UI
- Obsidian Candidate: .www/evidence/2026-09-26-plan-context-and-slash/obsidian-canonical-candidate.json
- Branch: dev · HEAD 49898145b1348f85f9268d12c6451abe9dbc3f3e · uncommitted

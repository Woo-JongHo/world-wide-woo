## 변경

- 완료된 Git Bash 명령에 초록 계열 INPUT 카드와 관측된 출력의 별도 OUTPUT 카드를 표시한다.
- Git Bash 카드의 /source 행을 제거하고 실패 명령의 붉은 상태 강조는 유지한다.

## 영향

- 사용자가 명령 입력과 실제 출력을 구분해 읽고, 카드 안에서 불필요한 source 경로를 보지 않는다.

## 분류

Fix · Validation

## 검증

- bun test test/www-ui.test.ts test/chat-render-acceptance.test.ts test/workbench-transcript-views.test.ts: 133 pass, 0 fail.
- bun run check 및 git diff --check: 통과.
- 렌더링 지연의 직접 원인은 이번 변경에서 실측하지 않았다. 기존 docs/WWW_PERFORMANCE.md에 잔여 병목이 기록돼 있다.

## 연결

- Primary Linear: WOO-700 (이전 로컬 read-back 기준), Related: WOO-680
- Evidence: .www/evidence/2026-09-28-git-bash-card-restoration
- Obsidian Candidate: obsidian-canonical-candidate.json

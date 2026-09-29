## 변경

- Chat 오른쪽 PLAN·PROGRESS 아래에 현재 요청에서 관측된 VERIFY 명령과 결과를 표시했다.
- 현재 Stage의 공개 목표와 명시적으로 공개된 결정만 표시하고 Welcome 단축키 및 오래된 화면 테스트 기대값을 바로잡았다.

## 영향

- 검증 결과를 /test로 이동하기 전 Chat에서 확인할 수 있다. 원문 실패와 상세 출력은 기존 /test·Monitor에서 읽는다.
- 비공개 추론이나 관측되지 않은 검증 수치는 사이드바에 표시하지 않는다.

## 분류

Improvement · Fix · Validation

## 검증

- bun test test/architecture.test.ts test/www-ui.test.ts test/www-telemetry-duration.test.ts: 107 pass, 0 fail.
- bun test test/www-telemetry-duration.test.ts test/request-test-workspace.test.ts test/www-shell.test.ts: 23 pass, 0 fail.
- 전체 bun test: 1597 pass, 2 fail. 두 실패 모두 누락된 .agents/skills/woo-code-readability 링크 대상에 의존한다.
- bun run check와 git diff --check 통과.

## 연결

- Primary Linear: WOO-700 · Chat PLAN·PROGRESS
- Related Linear: WOO-674 · Welcome 입력 안내
- Existing VERIFY issue draft: .www/evidence/2026-09-28-raw-verify-sidebar/linear-issue-candidate.json
- Evidence: .www/evidence/2026-09-28-chat-rail-verify-followup

## 변경

- 공개 Runtime 보고를 별도 Thought로 추가하지 않고 기존 Bash·도구 실행 행의 전체 요약으로 사용한다. 접힌 실패의 JSON은 간결한 실패 행으로 바꾼다.
- Native PLAN이 비어 있으면 현재 요청의 Runtime 계획을 표시하고, 첫 GOAL은 UNDERSTAND 완료 뒤에 표시한다.

## 영향

- Chat에서 중복 Thought 없이 작업 요약을 읽고 원본 명령과 출력은 Ctrl+E로 확인한다.
- 입력 원문이 GOAL로 잠깐 노출되지 않으며 같은 요청의 계획이 누락되지 않는다.
- TEST는 관측된 검증 명령만 집계하며 관측되지 않은 실행은 결과로 표시하지 않는다.

## 분류

Fix · Improvement · Validation

## 검증

- bun test test/www-ui.test.ts test/www-transcript-cache.test.ts test/chat-render-acceptance.test.ts: 114 pass, 0 fail.
- bun run check 및 git diff --check 통과.
- woo-code-readability 지정 스크립트는 워크트리 경로 부재로 미실행.

## 연결

- Linear: WOO-700 (기존 Chat PLAN·PROGRESS·GOAL 결속), WOO-680 (Chat 표면)
- Code: www-execution.ts, www-monitor-view.ts, project-workbench.ts
- Evidence: .www/evidence/2026-09-28-chat-plan-test-goal-fix

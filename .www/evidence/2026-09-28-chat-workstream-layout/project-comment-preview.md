## 변경

- Chat 본문에 현재 요청의 공개 단계 목표·결과·결정과 관측된 소요 시간을 표시했다.
- 오른쪽 레일을 PLAN 체크리스트, 단계별 PROGRESS, 검증 명령·시간·통과·실패 표와 실패 요약으로 구성했다.

## 영향

- 현재 요청의 계획, 진행, 테스트 결과를 Chat에서 함께 읽는다.
- 관측되지 않은 시간과 통과·실패 수는 대시로 남기고 비공개 결정 근거는 출력하지 않는다.

## 분류

Improvement · Fix · Validation

## 검증

- bun test test/www-ui.test.ts test/www-telemetry-duration.test.ts test/www-shell.test.ts: 100 pass, 0 fail.
- bun run check와 변경 파일 git diff --check 통과.
- 전체 suite의 기존 결과는 1597 pass, 2 fail이며 누락된 가독성 스킬 링크 대상에 의존한다.

## 연결

- Primary Linear: WOO-700 · Chat PLAN·PROGRESS
- Related Linear: WOO-674 · Welcome 입력 안내
- Evidence: .www/evidence/2026-09-28-chat-workstream-layout

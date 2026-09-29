## 변경

- 작업 중인 응답의 도구 요약을 RES 작성 중 카드 안에만 표시하고 성공·실패 명령 모두의 이름과 상태를 나열했다.
- 요약의 /bin/zsh -lc 래퍼를 생략했으며 각 명령의 기존 Terminal/Git Bash 카드, exit 상태, /source를 유지했다.

## 영향

- 실패 명령만 보이던 요약에서도 실제 수행한 명령 전체를 확인할 수 있다.
- 도구 요약과 원본 실행 카드를 구분해 읽으며 추가 모델 호출 없이 관측된 명령만 사용한다.

## 분류

Improvement · Validation

## 검증

- bun test test/www-ui.test.ts test/www-transcript-cache.test.ts test/chat-render-acceptance.test.ts: 116 pass, 0 fail.
- bun run check 통과.
- git diff --check 통과.
- woo-code-readability 링크 대상 부재로 지정 스크립트는 미실행.

## 연결

- Linear: WOO-700 (기존 Chat Plan·Progress 결속), WOO-680 (Chat 표면)
- Code: src/adapters/inbound/tui/features/chat/view/www-execution.ts
- Evidence: .www/evidence/2026-09-28-native-tool-group-summary

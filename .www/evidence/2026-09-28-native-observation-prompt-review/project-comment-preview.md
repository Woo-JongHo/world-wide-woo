## 변경

- 첨부 프롬프트 18개 항목을 현재 Native Projection·Chat·Monitor·Dashboard 코드와 비교해 채택·조건부 채택·미구현 범위를 감사 문서로 정리했다.
- ACTION은 Chat 본문 카드에 있고 compact 사이드바는 PLAN·PROGRESS·DECISION·TEST만 표시함을 소스에서 확인했다. 실행 콘솔 문서에 이 경계를 명시했다.
- Raw/해석 분리, PLAN 목표와 PROGRESS 세부 목표, 관측된 관계와 Projection 관계 구분, TEST 결과 권위와 해석 label 분리를 기존 방향의 구체화로 채택했다.

## 영향

- 프롬프트의 개념 트리를 강제 직렬 lifecycle이나 RAW 인과로 오해하지 않고 현재 observe/broker 계약을 유지한다.
- Shell 설명 placeholder·직렬 LLM 큐, 성공 case별 TEST 모델, Progress 연결 provenance는 후속 구현 gap으로 남긴다. 전체 기능 구현 완료를 주장하지 않는다.

## 분류

Validation · Improvement

## 검증

- 현재 worktree의 Native event projection, narration queue, Chat 카드, compact Monitor sidebar, Dashboard 선택→Monitor routing을 직접 읽었다.
- git diff --check 통과. 문서 18개 판정 항목과 실행 콘솔 채택 원칙을 read-back했다.
- live RAW 캡처·LLM latency 측정·실제 TUI 시나리오 및 자동 테스트는 이번 문서 검토에서 실행하지 않았다.

## 연결

- Linear: WOO-913 (live read-back: World Wide Woo; parent WOO-674; Todo)
- Audit: docs/audit/2026-09-28-native-observation-prompt-review.md
- Contract: docs/WWW_EXECUTION_CONSOLE.md
- Evidence: .www/evidence/2026-09-28-native-observation-prompt-review

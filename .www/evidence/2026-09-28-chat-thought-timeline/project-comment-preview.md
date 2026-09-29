## 변경

- 채팅의 고정 NATIVE WORKSTREAM 블록과 하단 7단계 HUD를 제거했다.
- 수락된 공개 Runtime 보고를 도구·응답 사이의 Thought 항목으로 시간순 투영한다.
- 종료된 요청의 7단계 소요 시간을 최종 응답 뒤 REPORT에 표시한다.

## 영향

- 작업 중 채팅에 진행 요약이 응답처럼 누적된다.
- 단계별 시간은 진행 중 반복되지 않고 최종 리포트에서 확인한다.

## 분류

Improvement · Fix · Validation

## 검증

- Chat·shell·architecture 관련 144개 테스트와 5970개 assertion 통과.
- TypeScript 타입 검사와 git diff --check 통과.
- 실제 TUI 재시작 수락과 독립 Claude 리뷰는 남아 있다.

## 연결

- Linear: WOO-700
- Evidence: .www/evidence/2026-09-28-chat-thought-timeline
- Branch: dev · uncommitted

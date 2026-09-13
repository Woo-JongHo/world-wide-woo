# Conversation Recap

Conversation Recap은 현재 TUI Chat이 이미 받은 공개 user·assistant 메시지를 짧게 다시 읽는 투영이다. `Ctrl+E`로 실행 transcript를 펼쳤을 때 Chat 아래에 표시된다.

이 기능은 T-note나 Native compaction을 대체하지 않는다. T-note는 완료된 질문 하나를 비동기로 생성해 보존하고, compaction은 Native provider가 소유한 대화 history를 줄인다. Recap은 `WorkbenchSnapshot.chat`에서 매번 파생되며 별도 상태를 저장하거나 Native history를 수정하지 않는다.

Core 계약은 system 메시지, reasoning, activity와 tool payload를 입력 경계에서 제외한다. assistant completion envelope는 공개 answer만 남기고, terminal control과 알려진 credential은 렌더링 전에 제거한다. 첫 요청과 최근 메시지를 합쳐 최대 6개, 항목당 280 code point, 전체 1,400 code point까지만 반환한다. 생략 여부와 개수는 구조화된 결과에 포함한다.

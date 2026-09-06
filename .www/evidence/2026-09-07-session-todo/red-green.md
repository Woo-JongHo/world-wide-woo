# WOO-702 red-green 기록

## Red

새 회귀를 먼저 추가한 뒤 다음 실패를 확인했다.

1. Native Plan mirror가 `TodoDocument`와 item에 Input, turn, Plan revision, source identity, 실행 참조를 저장하지 않았다.
2. 낮은 sequence의 late Plan과 다른 thread key의 foreign Plan이 현재 Todo를 덮어썼다.
3. source-bound Todo 재개가 이미 파일이 있다는 이유로 journal의 더 최신 Plan을 대조하지 않았다. 예상 write 2회에 실제 write 1회였다.
4. 같은 Plan revision에 뒤늦게 도착한 Input 참조가 durable source를 보강하지 않았다. 예상 revision 1에 실제 0이었다.

## Green

- source schema의 strict parse/validation/deep freeze와 legacy optionality를 구현했다.
- source authority 비교, item identity mapping, Workbench turn-bound binding, source-bound resume reconciliation을 연결했다.
- 관측된 binding을 저장한 뒤 binding 없는 내부 replay가 참조를 unknown으로 낮추지 않는 회귀도 추가했다.
- 최종 대상 검증은 `136 pass / 0 fail`, 전체 검증은 `629 pass / 0 fail`이다.

이 기록은 테스트 주도 구현 증거다. 실제 Native provider 및 대화형 TUI 수락 증거가 아니다.

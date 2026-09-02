# Trace Pane 설계 검토

- 검토자: Claude Opus
- 방식: 읽기 전용 교차검토
- 판정: `REVISE`

## 가장 강한 반론

App Server가 모든 Tool 실행과 Todo 항목 사이의 부모·자식 관계를 제공하지 않으므로,
현재 활성 Plan 항목에 시간적으로 가까운 Activity를 붙인 결과를 관측된 관계처럼
표시하면 안 된다. 현재 Skill과 Validator도 독립적인 관측 이벤트가 없으므로 대응
이벤트가 실측되기 전에 화면 lane을 만들면 안 된다.

또한 기존 `TNotesSourceView`는 완료 기록뿐 아니라 `SESSION GOAL`, `ACTION`, `SOURCE`
inspector를 함께 소유한다. Pane 개편은 T-note vault나 Activity journal을 삭제하거나
Source 조회 경로를 끊는 방식이어서는 안 된다.

## 권고

- 내부 영역 이름: `Trace · Source` (TUI에는 제목을 렌더링하지 않음)
- 모든 계층 edge에 `observed`와 `inferred` 출처를 구분한다.
- 추정 연결은 기본적으로 접는다.
- T-note 이동은 표시 위치만 바꾸고 저장 기록은 보존한다.
- 완료 기록 번호는 화면 순서가 아니라 Native turn에 안정적으로 결속한다.

## 최소 변경 경계

이번 변경에서는 기능과 데이터 모델을 바꾸지 않고 화면 명칭만 변경한다. 실제 Trace
구현은 안정적인 Plan 항목 식별자, Activity attribution, Source inspector 보존 계약을
별도 Story로 정의한 뒤 진행한다.

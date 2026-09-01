# Project Workbench

`www`는 프로젝트 루트에서 Codex native session을 열고, 대화·실행 상태·세션 요약을
서로 다른 표면으로 보여주는 로컬 Workbench다.

## Language

**Chat**: Codex와 주고받은 대화와 사용자가 확인할 수 있는 native 중간 작업을 시간순으로 보여주는 표면.
_Avoid_: 별도 모델이 다시 쓴 세션 요약.

**Todo.md**: 현재 계획과 진행 상태를 즉시 확인하는 실행 원장.
_Avoid_: 지난 대화의 서술형 요약이나 raw activity log.

**T-note**: 완료된 세션 활동에서 목표, 결정, 변경 결과, 검증, 남은 일과 위험을 뽑은 세션 요약.
_Avoid_: 실시간 진행 표시, Todo 복제, raw transcript 나열.

**Summary checkpoint**: 완료된 turn 경계에서 충분한 새 활동이 누적됐는지 판단하고 T-note 생성을 예약하는 시점.
_Avoid_: activity가 들어올 때마다 요약을 다시 만드는 동작.


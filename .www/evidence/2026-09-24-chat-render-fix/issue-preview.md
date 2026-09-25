# 11. 긴 채팅 draft의 반복 렌더 지연을 제거한다

## 목적

긴 답변이 생성되는 동안 같은 draft의 행 수와 본문을 매 frame 반복 계산해 입력·스크롤·출력이 멈추는 문제를 production-like benchmark로 고정하고 renderer 병목을 제거한다.

## 결과

긴 답변이 생성되는 동안 steady frame과 입력 처리가 기존 성능 기준 안에 머물고, 사용자는 읽던 위치를 잃지 않고 입력·스크롤을 계속한다.

## 범위

### 포함

- 실제 snapshot과 같은 깊은 불변 조건의 production-like benchmark로 긴 draft steady update 비용을 재현한다.
- 긴 draft의 count·layout hot path를 계측해 반복 계산 범위를 줄이고 가시 출력과 exact height를 보존한다.
- steady draft frame 32ms와 입력 처리 50ms 기준을 변경하지 않고 회귀 게이트로 검증한다.
- cold render와 resize 비용은 steady update와 분리해 수치·병목·남은 미검증 범위를 기록한다.
- 실제 CMux 세션에서 긴 응답 중 입력·스크롤과 완료 후 탐색 동작을 확인한다.

### 제외

- 측정 없이 특정 최근 변경이나 CMux 자체를 원인으로 단정하는 일
- 정확한 스크롤 높이 계약 검토 없이 추정 높이 또는 progressive height를 도입하는 일
- WOO-689에서 완료한 durable transcript graph/count repair를 같은 완료로 다시 기록하는 일
- provider 수신부터 terminal pixel 표시까지 전 구간 계측 체계를 이번 수정의 필수 구현으로 만드는 일
- 동시 전수 검사의 프로젝트 재사용·병렬 예산 변경을 renderer 수정의 완료 조건으로 묶는 일
- 미계측 terminal pixel latency를 개선됐다고 단정하는 일

## 동작

- 실제 snapshot과 같은 깊은 불변 fixture로 긴 draft의 steady update를 재생한다.
- 변하지 않은 완료 block은 재사용하고 변경된 draft에 필요한 count·layout만 계산한다.
- 가시 출력·exact height·scroll anchor·follow-tail을 기준 출력과 대조한다.
- cold render와 resize 결과는 steady update 결과와 분리해 기록한다.
- 같은 시나리오를 실제 CMux에서 입력·스크롤·완료 후 탐색으로 확인한다.

## 완료 조건

- 고정한 production-like 긴 draft steady 시나리오가 frame p95 32ms 이하이고 입력 처리 p95 50ms 이하를 모두 충족한다.
- 긴 draft 갱신에서 변하지 않은 완료 block을 다시 계산하지 않고 가시 출력·exact height·scroll anchor·follow-tail이 기준 출력과 동등하다.
- cold render와 resize는 steady 기준 통과를 대신하지 않으며 측정값·지배 비용·후속 최적화 필요 여부가 별도로 기록된다.
- 실제 CMux에서 긴 응답 생성 중 입력·스크롤과 완료 후 탐색이 동작하고, 미계측 pixel latency는 수락 근거에서 제외된다.
- 변경 파일에 자리표시 구현과 test.skip·test.only가 없고 관련 행동·성능·회귀 검사가 통과한다.

## 연결

- Parent: WOO-679 [Chat] 대화·실행·결과를 읽기 좋은 하나의 흐름으로 보여준다
- Related: WOO-689 긴 결과의 durable transcript 재구축 최적화
- Related: WOO-680 폭 변경과 scroll anchor 계약
- Code-ID: Code-001, Code-003
- Obsidian: [WOO-679 Chat 상세 정본](obsidian://open?vault=5521cc40c75eb293&file=01_%ED%94%84%EB%A1%9C%EC%A0%9D%ED%8A%B8%2F99_WWW%2F01_%EB%AC%B8%EC%84%9C%2FTraceability%2FWOO-679.md)
- Evidence: docs/audit/2026-09-24-chat-render-system-diagnosis.md · .www/evidence/2026-09-24-chat-render-fix

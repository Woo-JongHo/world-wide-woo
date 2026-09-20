# Astra 실행 화면에서 Proposal과 Report가 한 실행 그룹에 함께 표시된다

## 문제

완료된 질문 요약에서 Proposal과 Report가 같은 ZChat 실행 그룹에 함께 표시되어, 계획으로 제안하는 내용과 실행 결과를 구분하기 어렵다.

## 확인 및 재현

- Astra T-note 요약을 확인하면 하나의 실행 그룹 안에 PROPOSAL과 REPORT가 함께 표시된다.
- Proposal은 다음 작업을 계획하는 내용이고 Report는 실행 결과를 기록하는 내용이라 서로 다른 화면 책임을 가진다.
- 현재 표시에서는 Proposal의 다음 작업과 Report의 Reason·Action·Test·Result가 같은 실행 타임라인에 섞여 읽힌다.
- 관련 구현은 Astra 실행 표현 계층의 T-note 렌더링과 Plan 표현 계층의 계획 표시를 함께 확인해야 한다.
- 기존 전체 테스트에서 이 분리를 보장하는 회귀 검증은 없었다.

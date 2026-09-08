---
name: rpa-map
description: RPA 신규 업무를 설계하거나 업무 정의가 바뀔 때 확인된 사실을 질문·결정과 안정적인 Process·Task·Unit 계약으로 만든다.
---

# RPA Map

번호는 `02`, Skill ID는 `RPA-DESIGN`이다. 입력과 출력은 [공통 Receipt 계약](../../../docs/workflows/RPA_RECEIPT_CONTRACT.md)을 따른다.

[RPA Workflow](../../../docs/workflows/RPA_WORKFLOW.md)의 계층을 정본으로 사용한다. 이 스킬은 `rpa-intake` 수집물에서만 계약을 만들며, 업무 원본에 없는 동작이나 안전 정책을 채우지 않는다.

## 정규화

1. 한 지속 업무를 Process 하나로 등록하고 업무명과 저장소 경로 대신 안정 Process ID로 식별한다.
2. Process 안의 검증·개발 단위는 Task로, Task 안에서 유지되는 책임은 Unit으로 나눈다. Unit은 파일·폴더·함수 변경만으로 새로 발급하지 않는다.
3. Task와 Unit은 최초 등록 때 받은 ID를 유지한다. 실행 순서는 별도 `sequence`이며 삽입·재배치가 기존 ID를 바꾸지 않는다.
4. 각 Unit에 입력, 출력, 원본 위치, 부작용, 승인 지점, 재실행 정책을 연결한다. 사실이 없는 필드는 `unknown`으로 남긴다.
5. 예외·테스트·메시지 Artifact를 Task와 Unit에 연결하되, 고객용과 운영자용 audience를 섞지 않는다.

필수 계약이 누락되거나 두 해석이 가능한 경우 한 번에 한 초점만 질문한다. 영향이 다른 2~4개 선택지, 권장안과 각 선택의 결과를 제시하고 결정 전에는 다음 쓰기 단계로 넘기지 않는다.

## 완료 기준

정규화 결과는 모든 Task와 Unit이 하나의 Process에 속하고, 모든 원본 참조가 intake revision으로 되돌아가며, 실행 순서와 안정 ID가 분리되어 있을 때만 유효하다. 동일한 책임의 기존 ID가 있으면 재사용한다. 성공한 다음 단계는 `rpa-build`, 미결정 계약은 `blocked`다.

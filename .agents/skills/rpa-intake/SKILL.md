---
name: rpa-intake
description: RPA 신규 개발·테스트·유지보수 전에 원격 코드와 업무 자료를 읽어 revision이 고정된 안전한 사실 Receipt를 만들 때 사용한다.
---

# RPA Intake

번호는 `01`, Skill ID는 `RPA-INTAKE`다. 출력은 [공통 Receipt 계약](../../../docs/workflows/RPA_RECEIPT_CONTRACT.md)을 따른다.

반복 업무를 정형화하기 전에 [RPA Workflow](../../../docs/workflows/RPA_WORKFLOW.md)의 Process–Task–Unit 계약을 읽는다. 이 스킬은 원격 소스의 사실 수집만 소유하며, 업무 코드·운영 환경·고객 데이터는 바꾸지 않는다.

1. 대상 저장소의 절대 경로, branch, HEAD, dirty 상태와 읽은 파일의 digest를 수집한다.
2. 업무 map, 실제 Task·Unit 구현, 예외 정의, 테스트, 메일·외부 쓰기 경로를 함께 읽는다.
3. Process별 수집물을 만들고 각 항목에 원본 경로와 revision을 연결한다. 입력·출력·외부 시스템·승인·재실행 정책이 원본에 없으면 `unknown`으로 기록한다.
4. 자격증명, `.env`, 고객 원문, 첨부파일, 대형 실행 로그는 수집물에 넣지 않는다. 필요한 경우 경로·존재 여부·digest만 남긴다.

완료는 네 가지가 모두 있는 수집물이다: 재현 가능한 source revision, map과 코드의 차이, 예외·테스트의 존재와 누락, 고객용·운영자용 메시지 및 실제 발송 Unit의 경계. 수집 실패는 `blocked` Receipt이며 다음 단계는 `rpa-map`이다.

---
name: rpa-build
description: 승인된 RPA Process·Task·Unit 설계를 실제 코드와 설정에 구현하거나 신규 자동화를 개발할 때 사용한다.
---

# RPA Build

번호는 `03`, Skill ID는 `RPA-BUILD`다. `rpa-map`의 확정 설계와 [공통 Receipt 계약](../../../docs/workflows/RPA_RECEIPT_CONTRACT.md)을 사용한다.

1. 대상 revision과 RPA ID를 다시 읽고 승인된 Unit별 변경 경계를 고정한다.
2. 외부 시스템 adapter와 업무 규칙을 분리하고 비밀·환경값은 코드 밖의 기존 설정 경계를 사용한다.
3. 한 Unit의 입력·출력·부작용·재실행 계약을 구현하고 그 계약을 관측하는 테스트와 안전 로그를 함께 작성한다.
4. 외부 쓰기와 Mail Unit은 dry-run 또는 격리된 fixture로 먼저 검증한다. 실제 고객 데이터·발송·운영 실행은 별도 명시 승인 없이는 수행하지 않는다.
5. 변경 파일, 실행한 검증, 미검증 환경과 다음 `rpa-safety` 입력을 Receipt에 남긴다.

완료는 모든 변경이 승인된 Unit으로 되돌아가고 정상·실패 경로가 테스트 가능하며 비밀과 고객 데이터가 산출물에 포함되지 않는 상태다. 계약이 바뀌어야 하면 구현을 멈추고 `rpa-map`으로 되돌린다.

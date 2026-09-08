---
name: rpa-safety
description: RPA 신규 개발이나 유지보수 결과의 예외·로그·외부 쓰기·메일·재실행과 테스트 안전성을 수락 전에 검증한다.
---

# RPA Safety

번호는 `04`, Skill ID는 `RPA-TEST`다. 입력과 출력은 [공통 Receipt 계약](../../../docs/workflows/RPA_RECEIPT_CONTRACT.md)을 따른다.

[RPA Workflow](../../../docs/workflows/RPA_WORKFLOW.md)의 Validation과 Operation handoff를 적용한다. 이 스킬은 구현 존재를 성공으로 승격하지 않고, 관측 가능한 안전 계약을 판정한다.

## 확인 항목

- 외부 쓰기와 Mail Unit마다 대상, 중복 실행 영향, 승인 지점, 재실행 또는 명시적 비멱등 정책이 있다.
- 중요한 실패는 `detect`, `control`, `recovery`, 담당자 조치, 재개 지점과 연결된 테스트를 가진다.
- 정상, 경계, 실패, 부분 실패, 재실행 시나리오가 Unit 또는 Task의 Test Contract에 연결된다.
- 고객 메시지와 운영자 메시지는 audience, 생성 조건, 전달 책임 Unit이 분명하다.
- 실제 환경·권한·Scheduler를 검증하지 못한 항목은 `uncertain` 또는 `blocked`이며 성공 증거로 바꾸지 않는다.

누락은 자동 보완하지 않는다. 누락한 계약, 영향을 받는 Task·Unit, 필요한 사람 조치를 명시한 실패 Receipt를 만들고 `rpa-map`, `rpa-build` 또는 업무 담당자에게 되돌린다. 모든 외부 쓰기와 메일 Unit이 위 조건을 만족하거나 명시적으로 미수락일 때 검증이 끝나며 다음 단계는 `rpa-publish`다.

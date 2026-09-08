---
name: rpa-publish
description: 검증된 RPA 계약을 Linear 작업과 Obsidian 상세 정본에 게시하고 두 표면을 read-back할 때 사용한다.
---

# RPA Publish

번호는 `06`, Skill ID는 `RPA-PUBLISH`다. 입력과 출력은 [공통 Receipt 계약](../../../docs/workflows/RPA_RECEIPT_CONTRACT.md)을 따른다.

이 스킬은 `rpa-map`의 안정 ID와 `rpa-safety` Receipt가 준비된 뒤에만 적용한다. Linear의 위치·계층은 [woo-linear-issue-intake](../woo-linear-issue-intake/SKILL.md)와 [woo-linear-title-hierarchy](../woo-linear-title-hierarchy/SKILL.md)를 적용한다. Linear는 WHAT·NOW·DONE, Obsidian은 WHY·계약·결정의 정본이다.

1. 기존 Linear 부모·형제·마일스톤·본문을 snapshot으로 저장하고 중복 후보를 대조한다.
2. Process를 업무 부모로, Task를 번호 하위 이슈로 초안화한다. 예외 처리와 테스트는 Process의 Task 형제로 둔다. Unit은 해당 Task 본문에 안정 ID와 책임으로 기록하며 독립 Work일 때만 이슈로 만든다.
3. 초안은 `woo-linear-title-hierarchy`의 계약 검증을 통과한 뒤에만 반영한다. 사용자 승인 범위 밖의 기존 이슈·상위 구조·상태는 바꾸지 않는다.
4. 공통 Agent·Skill 계약은 Linear 이슈 하나와 Obsidian 상세 정본 하나를 1:1로 연결한다. 프로젝트별 Process·Task·Unit은 Linear와 `rpa-map`이 소유하며 상세 정본이 실제로 필요할 때만 별도 Obsidian 문서를 만든다.
5. 승인된 초안만 반영한 뒤 Linear의 parent·milestone·상태·본문과 Obsidian의 경로·document_id·linear·revision을 각각 다시 읽어 대조한다.

완료는 안정 ID와 안전 Receipt가 Linear에서 재조회되고, 생성 대상인 Obsidian 정본도 계약 검사를 통과한 상태다. snapshot, 초안 게이트, 승인 범위, 반영, 양쪽 read-back 중 하나라도 없으면 게시 완료가 아니다. 성공한 다음 단계는 `rpa-reconcile`이다.

---
name: woo-obsidian-canonical
description: Linear 업무를 Obsidian schema v2 상세 정본 Candidate로 작성하거나 기존 정본 내용을 개정할 때 사용한다.
---

# Obsidian Canonical Author

[Obsidian 상세 정본 계약](../../../docs/planning/linear-development/OBSIDIAN_CANONICAL_CONTRACT.md)과 [템플릿](../../../docs/planning/linear-development/OBSIDIAN_TEMPLATE.md)을 읽는다. 새 capability 또는 되돌리기 어려운 계약 변경이면 [Design Document Contract](../../../docs/workflows/DESIGN_DOCUMENT_CONTRACT.md)로 작성 필요성과 깊이를 판정한다.

현재 문서 bytes와 Properties를 수집하고 같은 capability의 `document_id`, Linear UUID, Code-ID를 유지한다. 새 capability에만 새 ID를 발급한다. 확인된 계약·상태·예외·수락·증거를 14절과 Change Log에 채운 `obsidian-canonical` Candidate를 만든다. 추정은 결정이나 확인된 사실과 분리한다. 디자인 검토 대상이면 14절에 고비용 결정, 미결 질문의 다음 Evidence와 blocking 여부, 독립 리뷰와 결정 근거를 남긴다. blocking 질문이 남은 문서를 `active`로 만들거나 구현 완료로 표현하지 않고, `active` 문서에 placeholder를 남기지 않는다.

`artifact:control validate`와 `render` 결과까지 만드는 것이 완료다. Vault 쓰기와 ledger 변경은 `woo-obsidian-publish`가 소유한다.

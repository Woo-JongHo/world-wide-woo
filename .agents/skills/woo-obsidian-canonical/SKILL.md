---
name: woo-obsidian-canonical
description: Linear 업무를 Obsidian schema v2 상세 정본 Candidate로 작성하거나 기존 정본 내용을 개정할 때 사용한다.
---

# Obsidian Canonical Author

[Obsidian 상세 정본 계약](../../../docs/planning/linear-development/OBSIDIAN_CANONICAL_CONTRACT.md)과 [템플릿](../../../docs/planning/linear-development/OBSIDIAN_TEMPLATE.md)을 읽는다.

현재 문서 bytes와 Properties를 수집하고 같은 capability의 `document_id`, Linear UUID, Code-ID를 유지한다. 새 capability에만 새 ID를 발급한다. 확인된 계약·상태·예외·수락·증거를 14절과 Change Log에 채운 `obsidian-canonical` Candidate를 만든다. 추정은 결정이나 확인된 사실과 분리하고 `active` 문서에 placeholder를 남기지 않는다.

`artifact:control validate`와 `render` 결과까지 만드는 것이 완료다. Vault 쓰기와 ledger 변경은 `woo-obsidian-publish`가 소유한다.

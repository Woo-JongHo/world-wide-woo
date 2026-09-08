---
name: woo-obsidian-contract
description: Obsidian 상세 정본 Candidate와 Vault의 경로·identity·14절·wiki-link·digest drift를 읽기 전용으로 검증할 때 사용한다.
---

# Obsidian Contract Gate

Candidate에는 `artifact:control validate`를, 렌더된 Vault에는 `obsidian:check`를 실행한다. 기존 문서 변경이면 수집한 현재 bytes를 `expectedBefore`와 대조한다. `document_id`, Linear ID, Code-ID, canonical path, wiki-link, source revision 중 하나라도 충돌하면 blocking 오류로 반환한다.

검증 결과는 명령, 대상 revision, 오류 코드, 안전하게 정리된 근거를 포함한다. 미실행 검증과 placeholder가 있는 active 문서는 통과가 아니다. 외부 표면은 변경하지 않는다.

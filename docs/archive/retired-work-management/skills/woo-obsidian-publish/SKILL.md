---
name: woo-obsidian-publish
description: Obsidian 상세 정본 Candidate와 Vault의 계약 drift를 읽기 전용으로 검증하거나, 승인된 Candidate를 Vault에 반영하고 identity·링크·digest를 read-back해 Woo Receipt로 남길 때 사용한다.
---

# Obsidian Publish

[Artifact 제어 계약](../../../docs/workflows/ARTIFACT_CONTROL_CONTRACT.md)을 적용한다.

1. Candidate와 현재 문서 bytes를 검증하고 렌더 bytes와 digest를 사용자에게 제시한다.
2. 승인 직전에 현재 bytes를 다시 읽는다. `expectedBefore`가 달라졌으면 새 Candidate가 필요하다.
3. 승인된 한 문서만 쓰고 `obsidian:check`로 path·Properties·14절·wiki-link를 검증한다.
4. 파일을 다시 읽어 렌더 bytes와 같음을 확인하고 Woo Receipt를 기록한다.

Vault 쓰기만 소유한다. Linear URI, SQLite 재생성, Development Map은 `development-traceability`의 별도 단계이며 이 승인에 포함되지 않는다.

## 계약 검증 게이트

반영 없이 검증만 요청받았을 때도 이 절만 적용하며, 이때는 외부 표면을 변경하지 않는다.

- Candidate에는 `artifact:control validate`를, 렌더된 Vault에는 `obsidian:check`를 실행한다. 기존 문서 변경이면 수집한 현재 bytes를 `expectedBefore`와 대조한다.
- `document_id`, Linear ID, Code-ID, canonical path, wiki-link, source revision 중 하나라도 충돌하면 blocking 오류로 반환한다.
- 결과에는 명령, 대상 revision, 오류 코드, 안전하게 정리된 근거를 남긴다. 미실행 검증과 placeholder가 있는 active 문서는 통과가 아니다.

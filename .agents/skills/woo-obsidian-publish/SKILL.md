---
name: woo-obsidian-publish
description: 승인된 Obsidian Artifact Candidate를 Vault에 반영하고 identity·링크·digest를 read-back해 Woo Receipt로 남길 때 사용한다.
---

# Obsidian Publish

[Artifact 제어 계약](../../../docs/workflows/ARTIFACT_CONTROL_CONTRACT.md)을 적용한다.

1. Candidate와 현재 문서 bytes를 검증하고 렌더 bytes와 digest를 사용자에게 제시한다.
2. 승인 직전에 현재 bytes를 다시 읽는다. `expectedBefore`가 달라졌으면 새 Candidate가 필요하다.
3. 승인된 한 문서만 쓰고 `obsidian:check`로 path·Properties·14절·wiki-link를 검증한다.
4. 파일을 다시 읽어 렌더 bytes와 같음을 확인하고 Woo Receipt를 기록한다.

Vault 쓰기만 소유한다. Linear URI, SQLite 재생성, Development Map은 `development-traceability`의 별도 단계이며 이 승인에 포함되지 않는다.

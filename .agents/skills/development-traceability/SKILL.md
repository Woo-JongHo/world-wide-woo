---
name: development-traceability
description: WWW에서 Linear 이슈, Code-NNN Unit, 실제 Obsidian 상세 기록, SQLite 투영, Development Map을 생성·변경·복구하거나 연결 무결성을 검사할 때 사용한다.
---

# Development traceability

## 실행 순서

1. `docs/planning/linear-development/ISSUE_CONTRACT.yaml`과 대상 Linear 부모·형제·마일스톤을 읽고 전 snapshot을 저장한다. 완료: 대상의 UUID·parent·milestone·본문 원문이 있다.
2. 기존 Unit을 `.www/control-ledger/traceability-v2.json`에서 찾는다. 같은 책임이면 key와 UUID를 유지하고, 새 책임이면 `nextUnitKey`로 발급한다. 완료: tombstone·alias·key·UUID 중복이 없다.
3. 이름 있는 최상위 class/function 대표 선언 한 곳에 `@Unit Code-NNN`을 붙이고 원장 location과 맞춘다. 완료: AST 검사가 선언을 정확히 한 번 찾는다.
4. [Linear 템플릿](../../../docs/planning/linear-development/ISSUE_TEMPLATE.md)으로 얇은 본문을 만들고 [Obsidian 템플릿](../../../docs/planning/linear-development/OBSIDIAN_TEMPLATE.md)으로 실제 Vault 상세를 쓴다. 완료: 실제 Vault byte readback과 frontmatter ID가 원장과 같다.
5. Linear draft gate를 통과한 뒤 반영하고 readback gate를 다시 통과시킨다. 완료: parent·milestone·라벨·본문·UUID가 초안과 같다.
6. `bun run traceability:rebuild`, `bun run development-map:build`, `bun run traceability:check`를 순서대로 실행한다. 완료: 네 ID 진입점의 logical digest가 같고 Map 재생성 diff가 없다.

## 판정

SQLite는 원장에서 재구축하는 검색 투영이다. `.www/Development-Map.md`는 기존 Initiative·Epic·Story·Evidence 역할을 유지한 생성 화면이다. Linear/UI 직접 편집은 draft와 readback 차이로 감지하며 기술적으로 차단한다고 기록하지 않는다.

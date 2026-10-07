---
name: development-traceability
description: WWW의 Linear·Code-NNN·Obsidian·Test/Exception·SQLite 사이 연결을 재조정하거나 전체 drift와 무결성을 검사할 때 사용한다.
---

# Development traceability

상세 정본의 shape는 [Obsidian 템플릿](../../../docs/planning/linear-development/OBSIDIAN_TEMPLATE.md), 소유권·drift·gate는 [Obsidian 상세 정본 계약](../../../docs/planning/linear-development/OBSIDIAN_CANONICAL_CONTRACT.md)이 정본이다. 두 문서를 먼저 읽고 대상 문서의 현재 bytes와 Properties를 수집한다.

## 실행 순서

1. **Snapshot** — `ISSUE_CONTRACT.yaml`, 대상 Linear 부모·형제·마일스톤, ledger, Code manifest, Vault 문서를 읽고 전 snapshot과 byte digest를 보존한다. 완료: 대상의 UUID·parent·milestone·본문 원문과 모든 상세 문서의 `document_id`·경로·digest가 있다.
2. **Resolve identity** — 같은 capability이면 `document_id`, Linear UUID, Code-ID를 유지한다. 새 capability만 새 ID를 발급하고 `<도메인>/<기능명> — <제목>.md` 경로를 정한다. 완료: tombstone·alias·document_id·Linear·Code-ID가 중복되지 않고 `bun run obsidian:check -- --vault <vault> --spec-root <domain> --linear-ids <comma-separated-expected-issues>`가 파일명·Properties·wiki-link와 각 이슈당 정확히 하나인 정본 수를 통과한다.
3. **Prepare owned changes** — Linear Candidate는 `woo-linear-issue-intake`, Obsidian Candidate는 `woo-obsidian-canonical`로 만든다. 이 스킬은 둘 사이 Test·Exception·Code 관계와 적용 순서를 조정한다. 완료: 각 표면의 소유 스킬이 독립 검증 가능한 Candidate를 갖고 관계가 서로 모순되지 않는다.
4. **Bind code** — 이름 있는 최상위 class/function 대표 선언 한 곳에 `@Unit Code-NNN`을 붙이고 manifest·Obsidian `code_ids`·ledger location을 맞춘다. 완료: AST 검사가 대표 선언을 정확히 한 번 찾고 `bun run obsidian:check -- --vault <vault> --spec-root <domain> --linear-ids <comma-separated-expected-issues>`가 Code-ID 관계를 통과한다.
5. **Publish by owner** — Vault는 `woo-obsidian-publish`, Linear는 `woo-linear-publish`로 각각 별도 승인·적용·read-back한다. ledger apply output의 SQLite와 Linear URI 상태는 반드시 `pending`이며 다음 단계 완료를 뜻하지 않는다.
6. **Project and reconcile** — ledger apply 뒤 `traceability:rebuild`로 SQLite를 재생성하고 `development-map:build`, `obsidian:check`, `bun run traceability:check`를 실행한다. 완료: 표면별 Woo Receipt와 재생성 Receipt가 있고 logical digest, SQLite 삭제 재구축, Map 재생성이 stable하다.

## 판정

Obsidian은 WHY/contract/decision/scenario의 상세 정본, Linear는 WHAT/NOW/DONE의 얇은 투영, Git은 실제 code/test/evidence의 정본이다. SQLite는 ledger와 정본에서 재구축하는 검색 투영이고 `.www/Development-Map.md`는 생성 화면이다. Linear·Vault 직접 편집은 draft/readback digest 차이로 감지한다. drift, 수락 미검증, 중요한 예외의 recovery test 누락은 `succeeded`로 기록하지 않는다.

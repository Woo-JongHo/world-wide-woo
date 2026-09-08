# Obsidian 상세 정본 계약

## 목적

WWW의 기능 계약을 사람이 읽고 다시 개발할 수 있는 상세 정본으로 유지한다. [Obsidian 상세 정본 템플릿](OBSIDIAN_TEMPLATE.md)은 문서 shape를, 이 문서는 정본 소유권·변경 감지·게이트를 소유한다.

## 소유권

| 시스템 | 정본 |
|---|---|
| Obsidian | WHY, behavior contract, decision, scenario, state ownership, exception·recovery, verification strategy |
| Linear | WHAT, NOW, DONE: 얇은 결과·범위·완료 조건·상태 |
| Git | 실제 code·test code·CI 결과·snapshot·log·evidence artifact |
| Traceability ledger | 각 정본의 ID·관계·경로·digest journal |
| SQLite | ledger와 정본에서 다시 만드는 검색 graph projection |
| Development Map / Obsidian Bases·Dataview | 위 정본에서 만드는 읽기 projection |

SQLite, Map, Bases, Dataview는 수동 수정하지 않는다. 실제 실행 수치와 긴 로그는 Evidence/Receipt로 남기고 상세 정본에는 계약과 Evidence link만 남긴다.

## 문서 identity와 관계

- 문서는 `document_id` UUID로 식별한다. rename·move·title 변경은 ID를 바꾸지 않는다.
- 파일명은 `<도메인>/<기능명> — <사람이 읽는 제목>.md`다. Linear·Code·Test·Exception ID와 숫자 접두어는 Properties로만 기록한다.
- `linear`는 문서 하나와 Linear 이슈 하나의 관계다. 하나의 이슈에 여러 상세 문서가 필요하면 capability를 분리해 Linear 이슈도 분리한다.
- `parent`, `related`는 wiki-link Property다. 문서 본문에는 관계 목록을 중복하지 않는다.
- `spec_ids`, `code_ids`, `test_ids`, `exception_ids`, `decision_ids`는 관계 graph의 외부 ID 목록이다. 관계의 근거와 lifecycle은 각각 본문 계약 절에 기록한다.

## 문서 lifecycle

```text
draft ── contract complete ──→ active ── superseded ──→ deprecated
```

- `draft`는 아직 결정되지 않은 항목을 명시적으로 남길 수 있다.
- `active`는 14절, Required Properties, 실제 Source Revision, Acceptance 상태를 모두 가져야 한다. template marker와 미표시 예시는 허용하지 않는다.
- `deprecated`는 `related` 또는 Decision으로 후속 정본을 가리킨다. 과거 계약과 Evidence는 지우지 않는다.

## 변경 감지와 동기화

`bun run obsidian:check -- --vault <vault> [--spec-root <domain>] [--linear-ids WOO-001,WOO-002]`는 Vault의 각 상세 정본을 읽기 전용으로 검사한다. 범위를 제한할 때는 `--linear-ids`로 그 범위에 반드시 있어야 할 이슈를 함께 선언한다. 그래야 파일이 통째로 사라진 경우도 0개 정본으로 차단된다.

- schema·필수 Properties·파일명·14절·status별 placeholder
- document ID·Linear ID 중복
- 끊어진 `parent`·`related` wiki-link
- 존재하지 않는 Code/Test/Exception/Decision ID
- ledger의 document path·digest·relationship drift
- Vault root 탈출과 symbolic link

동기화는 하나의 원자적 명령이 아니라 네 개의 독립 gate다. `obsidian:sync preview/apply`는 Vault rename/move만, `note-migration-preview/apply`는 ledger의 stable `document_id`·Properties edge만 다룬다. ledger apply 뒤 SQLite를 별도로 rebuild하고, Linear Obsidian URI는 별도 draft 승인과 readback으로 갱신한다. 각 단계는 `previewed / applied / pending / separate-draft-readback` 상태를 출력하며, 뒤 단계가 끝나기 전에는 전체 동기화 완료라고 기록하지 않는다. 사람이 preview 뒤 편집한 문서는 digest 불일치 drift로 반환한다.

## 게이트

| 시점 | 조건 | 실패 결과 |
|---|---|---|
| Work start | 대상 active/draft 상세 정본과 Linear leaf가 존재 | `SPEC_MISSING` |
| 문서 변경 | `obsidian:check` 통과와 preview digest | `OBSIDIAN_CONTRACT_INVALID` 또는 `OBSIDIAN_DRIFT` |
| Test 추가 | Test-ID가 Acceptance·Risk·Pass와 연결 | `UNMAPPED_TEST` |
| Exception 추가 | 사용자/복구 의미가 있으면 Exception-ID와 detect/control/recovery Test 연결 | `IMPORTANT_EXCEPTION_UNVERIFIED` |
| Commit | 변경된 상세 정본의 ID·경로·Code-ID 정합 | `TRACEABILITY_DRIFT` |
| PR | Acceptance·Exception coverage, Receipt, Evidence, `traceability:check` 통과 | `ACCEPTANCE_UNVERIFIED` |

Gate가 실패하면 결과를 PASS로 기록하지 않는다. 검증 대상 밖의 조건은 Receipt의 `not_validated`에 남긴다.

## 첫 적용과 이관

Todo와 Tracer를 Pilot으로 한다. 기존 `WOO-NNN.md` 문서는 원문 digest와 backup을 남긴 뒤 사람이 읽는 이름으로 이동한다. 확인되지 않은 과거 내용은 추정해 채우지 않고 `NOT TESTED` 또는 Gap으로 기록한다. Pilot의 Vault readback, Linear URI, Code-ID, Test·Exception 관계, SQLite rebuild, Development Map이 모두 일치한 뒤 나머지 active 문서로 이관한다.

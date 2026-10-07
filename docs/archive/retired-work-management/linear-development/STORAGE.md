# 저장·연결 설계 논의

상태: 아래 본문은 2026-09-05 논의 보존용 초안이다. 당시의 미확정 항목을 현재 결정으로 읽지 않는다. 사용자는 문서 작성까지만 진행하고 `woojongho`에서 작업을 이어가기로 했다. 이 문서는 구현 지시나 migration 완료 기록이 아니다.

2026-09-06 정정: **공유 DB는 SQLite로 확정**됐다는 사용자 결정을 적용한다. PostgreSQL 및 DB-only 정본 전환 제안은 철회했다. 최신 [개발 기록 연결 설계](KNOWLEDGE_BRIDGE_DESIGN.md)는 Git·Evidence 원본을 유지하고 SQLite를 재구축 가능한 관계 인덱스로 사용하는 제품 적용안이다. DB 배치와 실제 Vault binding은 미확인이며 엔진을 재선택하는 문제가 아니다. 아래 대안·미결정 목록은 역사로만 보존한다. 현재 v1에는 TUI 20개 Issue 연결이 있다.

## 확정된 전제

- 지속 기능의 Unit ID와 변경 작업의 Linear Issue ID는 분리한다.
- Linear 내용을 사용자와 하나씩 논의한 뒤 코드 개발로 연결한다.
- 현재 코드를 근거로 문서를 정리한다. 미래 구조를 현재 구현처럼 설명하지 않는다.
- README는 당분간 추가 수정하지 않는다. 기존 dirty 변경도 임의로 되돌리지 않는다.

## 현재 코드에서 확인한 사실

- `src/adapters/outbound/persistence/planning-store.ts`: `bun:sqlite`를 사용한 `planning-lock.sqlite`는 파일 쓰기 직렬화용이다. Planning 본체는 `catalog.jsonl`과 Markdown projection을 사용한다.
- `src/adapters/outbound/persistence/todo-store.ts`: `todo-lock.sqlite`도 파일 쓰기 잠금에 사용한다.
- `src/core/domain/work/traceability.ts`: schemaVersion 1의 reference와 link 계약이다. Unit·Run reference kind는 아직 없다.
- `.www/control-ledger/traceability.json`: 현재 code/test 참조와 연결이 있으며 실제 Linear 연결은 없다.

따라서 기존 SQLite 사용을 Unit 연결 DB의 구현 완료로 해석하지 않는다.

## 연결할 정보 후보

| 대상 | 연결 정보 후보 |
| --- | --- |
| Unit | 지속 ID·정의 |
| Linear Issue | 원격 UUID·표시 번호·관련 Unit |
| 문서 | 관련 Unit·문서 역할·경로 |
| 코드·테스트 | 관련 Unit·파일 또는 symbol·Git revision |
| 검증 근거 | 검증 대상·실행 결과·확인한 revision 또는 dirty 상태 식별 |

파일 경로를 영구 Unit ID로 사용하지 않는다. 파일 이동과 Unit 소멸은 다른 사건이다. 연결됐다는 사실과 요구사항 수락을 구분한다.

## 아직 결정하지 않은 것

1. 첫 범위: 개발 추적 연결만 다룰지, 제품의 Session·Run·Journal 저장까지 포함할지.
2. Unit과 연결 관계의 정본: DB인지, Git의 연결 파일인지.
3. DB 엔진·위치·여러 머신 간 갱신 방식.
4. Unit ID 형식·발급 권한·기존 EP/ST와의 매핑.
5. schema 이관·실패 복구·백업과 검증 절차.

### 정본 위치의 두 대안

- DB 정본: Unit과 관계를 DB에서 관리한다. 별도 백업·복구와 머신 간 동기화 계약이 필요하며, Git checkout만으로 당시 관계가 복구된다고 가정하지 않는다.
- Git 연결 파일 정본 + DB 조회용: 관계를 코드와 함께 검토하고 DB는 재생성 가능한 조회 projection으로 둔다. 파일 변경에 따른 갱신·stale 판별이 필요하다.

작성자는 개발 추적부터 시작할 경우 두 번째를 우선 검토하자고 제안했다. 사용자 선택은 아직 없다. DB와 연결 파일 양쪽을 독립 편집 가능한 정본으로 만들지 않는다.

Linear의 요구·진행 상태, Git의 코드·테스트, Markdown 본문은 각각의 원본을 유지하는 방향으로 검토한다. 외부 정보의 캐시가 필요하면 조회 시점과 원본 참조를 함께 관리하고 원본처럼 취급하지 않는다.

## 재개 시 순서

원격 저장소 위치·브랜치·dirty 상태 확인 → 문서 정리 범위 확인 → DB 첫 범위 선택 → 정본 위치 선택 → schema와 migration 설계. 결정 전 DB 생성·데이터 이동·Linear 변경은 하지 않는다.

관련 문서: [ID 계약](IDENTITY.md), [개발 흐름](DEVELOPMENT_FLOW.md), [원격 작업 인계](HANDOFF.md).

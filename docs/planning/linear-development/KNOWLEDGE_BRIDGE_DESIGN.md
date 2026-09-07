# Linear·Code·SQLite·Obsidian 개발 기록 연결 설계

2026-09-06 정정안. **공유 DB는 SQLite**라는 사용자 결정을 적용한다. PostgreSQL 권고와 DB-only 정본 전환 제안은 철회했다. 아래는 기존 계약을 대조한 제품 설계이며 DB 생성·Unit 발급·Vault 반영·통합 구현 완료를 뜻하지 않는다.

## 근거와 적용 범위

- 사용자 요청: Linear 요구로 개발하고, 기능 Unit과 Issue를 코드에 연결하며, DB에서 관계를 조회하고 개발 대화·테스트 진행 기록을 Obsidian에서 읽는다. 기능 Unit ID와 Linear Issue ID는 분리한다.
- [제품 방향](../../WWW_PRODUCT_DIRECTION.md): 서로 다른 도구에서도 Work Chain·Logical ID·Handoff Contract로 업무 의미와 Evidence를 유지한다. 외부 원본을 중앙 본문으로 대체하지 않는다.
- [ID 결정](IDENTITY.md): 기능의 수명과 변경 Issue의 수명은 다르며 관계는 다대다다. 파일마다 Unit을 발급하지 않는다.
- WES DEC-0019·Verification Repository 계약: Git·content-addressed Evidence가 권위를 소유하고 SQLite는 재구축 가능한 projection이다. 이는 WES 검증 인덱스의 수락된 계약이며, 제품과 같은 물리 DB라는 뜻은 아니다. 이 설계는 그 권위 경계를 유지하는 방향으로 제품 연결 모델에 적용한다.
- WES Obsidian Tool Contract: Raw는 append-only 원문 증거, 일반 note는 이해용 화면이다. 시스템 결정·정책은 명시적 Promotion으로 Git에 회수한다. note 편집으로 자동 역동기화하지 않는다.
- [Product Workflow](../../workflows/PRODUCT_WORKFLOW.md)의 “Decision Truth”와 WES의 “Git 결정 정본”은 같은 말이 아니다. 제품 문서의 장기 역할 설명을 시스템 정책 정본 이전으로 해석하지 않는다. 이번에는 승인된 Git 결정 링크를 Obsidian에서 읽는 계약을 적용한다.

기존 Product Workflow는 모든 대화·실행 로그 복제를 범위로 삼지 않았다. 최신 요청은 **선택한 개발 업무의 대화·테스트 기록을 보존·연결하는 범위 확장**이다. 모든 provider의 전체 세션 수집이나 무제한 복제를 이미 승인·구현된 것으로 확대하지 않는다.

원문·상태·미확인 범위는 [WES 결정 감사](../../../.www/scratchpad/2026-09-06-sqlite-decision-audit.md), [로컬 목적 감사](../../../.www/scratchpad/2026-09-06-local-purpose-audit.md), [정정 기록](DECISION_RECONCILIATION.md)에 남긴다.

## 정보의 소유권

| 정보 | 보존 원본 | SQLite 역할 |
| --- | --- | --- |
| Linear 요구·우선순위·업무 상태 | Linear Issue | UUID·표시 번호·URL·조회 시각·원격 revision의 캐시 |
| 기능 Unit·명시적 관계·기술 계약 | 버전 관리하는 WWW 연결 manifest와 코드 선언 | 검증된 관계의 검색·결합 인덱스 |
| 코드·테스트 정의 | Git의 revision과 파일·symbol | snapshot별 위치·선언 관계 색인 |
| 실행·대화·테스트 관측 | 보존된 Raw/Evidence bytes와 provenance manifest | 기록 ID·digest·원본 locator·대상·상태 색인 |
| 정책·채택 결정·수락 | 적용 범위의 Git 결정/수락 기록 및 외부 업무 원본 | 서로 다른 판정의 참조·조회 |
| 사람이 읽는 개발 기록 | Obsidian의 note·backlink·MOC | Document ID·Vault locator·원본 대응·digest |

DB에만 남는 Unit 정의·연결·수락을 만들지 않는다. 변경 명령은 먼저 검증 가능한 source manifest/receipt를 보존한 뒤 SQLite를 갱신한다. DB 직접 수정은 원본 변경으로 인정하지 않는다. SQLite를 지워도 보존 source에서 관계를 재구축할 수 있어야 한다. 원본이 유실되면 DB 복사본을 자동 정본으로 승격하지 않는다.

대화 본문과 테스트 출력 전체를 Git에 무조건 넣지 않는다. Git에는 공개 범위에 맞는 식별·관계·provenance를, Raw 저장소에는 허용된 원문을 둔다. private 원문의 경로·내용이 공개 export로 새지 않도록 기존 classification 규칙을 따른다.

## ID와 코드의 연결

Unit은 기존 WWW Logical ID 체계에서 지속 기능을 식별하는 단위다. 별도의 경쟁 Work Identity 체계를 만들지 않는다. Unit ID의 문법·발급 규칙은 기존 ID 계약을 확장해 정하며, 이전 초안의 UNT/DEV/REC/TST/DOC 접두어 예시는 채택된 규격이 아니다.

- Issue identity는 Linear UUID, 사람에게는 WOO 번호와 URL을 보여준다.
- Unit↔Issue, Unit↔Code, Issue↔Evidence는 다대다다.
- 코드의 `@unit`은 지속 기능 선언, `@linear`는 해당 코드의 요구 출처 참조다. 경로·symbol은 위치이며 영구 identity가 아니다.
- 같은 파일에 나타난 모든 Unit과 Issue를 자동으로 서로 연결하지 않는다. 명시적 Unit–Issue manifest와 실제 선언 범위를 검사한다.
- 코드 이동은 새 위치 관측이며 Unit 재발급이 아니다. 분할·병합은 새 관계 이력을 남기고 과거 테스트를 새 기능의 수락으로 바꾸지 않는다.
- Development Session은 업무 맥락이며 기존 Run 및 provider thread/turn과 명시적으로 연결한다. 새 이름으로 기존 실행 identity를 중복 발급하지 않는다.

현재 v1 `traceability.json`의 20개 Linear Issue 참조와 코드·테스트·Evidence 관계를 보존한다. Unit kind와 실행/문서 관계는 아직 구현되지 않았다. ID 문법을 확정하고 schema를 버전 업하기 전 예시 ID를 실제 코드에 넣지 않는다.

## SQLite에 만드는 읽기 모델

다음은 필요한 논리 관계이며 최종 DDL은 아니다. 각 행에 stable ID, project/repository 범위, source locator/revision/digest를 연결한다.

| 영역 | 최소 관계 |
| --- | --- |
| 기능·요구 | Unit, LinearIssue, UnitIssue |
| 코드 | Repository, Worktree, CodeSnapshot, CodeLocation, UnitCode, IssueCode |
| 개발 맥락 | DevelopmentSession, 기존 Run 참조, BindingVersion, SessionIssue, SessionUnit |
| 기록 | Record, Artifact, RecordIssue, RecordUnit |
| 검증 | TestDefinition, TestRun, Attempt, Observation, Evidence, Review, Acceptance |
| 문서 | Document, DocumentVersion, DocumentLocation, RecordDocument |
| 투영 상태 | SourceManifest, BuildReceipt, ExportRequest, ExportReceipt, Conflict |

WES의 Requirement–Definition–Run–Attempt–Observation–Evidence–Review–Acceptance를 검토해 재사용·매핑한다. `TestRun=pass`를 Review나 Acceptance로 변환하지 않는다. 이름이 같은 제품 entity와 WES entity를 근거 없이 같은 ID로 취급하지 않는다.

명시 관계, 코드 선언, note metadata, 세션 맥락은 `origin`을 구별한다. 기록은 발생 당시 BindingVersion을 참조하며 작업 전환 후 과거 기록을 소급 재귀속하지 않는다. 한 세션의 활성 binding version은 하나이고 그 안에 여러 대상이 있을 수 있다. 모호한 기록은 unassigned로 보존한다. 테스트의 맥락 연결과 실제로 검증한 요구는 별도 관계다.

빌더는 schema·필수 참조·중복 ID·digest·입력 revision을 검사한다. 새 DB는 임시 위치에서 검사한 뒤 교체하며 schema version과 builder version을 분리한다. 같은 입력은 같은 논리 데이터 hash를 내야 한다. query는 읽기 전용으로 freshness·무결성을 확인하고 stale/corrupt 상태를 정상 진행률로 표시하지 않는다. 복구는 원본 검증과 명시적 receipt를 남긴 rebuild로 처리한다.

## 공유 범위와 저장 배치

엔진은 SQLite로 고정한다. 기존 `planning-lock.sqlite`와 `todo-lock.sqlite`는 파일 쓰기 잠금용이며 새 관계 인덱스의 구현이나 저장 위치가 아니다. WES verification DB를 제품 DB와 같은 파일로 합치는 결정도 하지 않는다.

공유 SQLite의 실제 경로·소유 프로세스·머신 간 접근 경로는 현재 확인한 기록에서 확정하지 못했다. 초기 구현안은 **DB가 있는 호스트의 하나의 조정자가 source 검증·index build를 소유하고 TUI/CLI가 공개 조회 계약을 이용하는 방식**이다. 여러 머신이 필요하면 그 조정자에 접근하는 adapter를 추가하는 제안이며, 별도 서버 구축이 확정됐다는 뜻은 아니다. 동기화 폴더에 DB 파일을 놓고 여러 머신이 직접 쓰는 방식으로 추정하지 않는다.

내구성을 요구하는 capture/export 요청은 DB-only outbox에만 두지 않고 source event와 receipt로 보존한다. DB는 pending 상태를 재구성한다. 보존 원본의 백업·실제 data root·동시 writer 정책은 구현 전 현장 설정과 계약을 대조해야 한다. 이전 초안의 RPO 24시간/RTO 4시간·30일 보존은 근거 없이 추가한 수치로 철회한다. WES의 현재 Vault 백업 책임은 operator이며 자동 백업 구현으로 표시하지 않는다.

## 개발 한 건의 흐름

1. **요구 확인:** Linear Issue의 요구·수락 조건·현재 상태를 읽고 Unit과 기존 코드/Evidence 연결을 조회한다. 조회 시각·UUID·요구 revision을 남긴다.
2. **맥락 결속:** repository/worktree, 기존 Run, Issue·Unit binding을 source manifest에 기록한다. SQLite가 이를 색인한다.
3. **개발:** `@unit`/`@linear` 선언과 명시 관계를 검사한다. 코드 위치는 checkout/snapshot별로 기록하여 다른 branch 위치를 덮어쓰지 않는다.
4. **대화 보존:** 선택한 업무의 공개 사용자·assistant 메시지 및 허용된 tool 결과를 원문과 digest로 보존한다. source event ID, Run, 당시 binding, 수집 범위를 남긴다. 기존에 수집하지 않은 원문은 재구성하지 않는다.
5. **테스트 보존:** 명령·환경·시작/종료 시각·코드 snapshot·exit/signal·stdout/stderr·구조화 결과와 검증 대상을 저장한다. 중단·실패·미실행을 통과와 구분한다.
6. **Obsidian 기록:** Raw 참조와 Git/Linear/코드 링크를 포함한 읽기 좋은 업무 note를 만든다. 대화·테스트·결정 후보를 구분한다. 실제 파일을 읽어 digest/ID/링크를 확인한 후 export receipt를 남긴다.
7. **왕복 조회:** Issue 또는 Unit에서 코드·대화·테스트·note를 찾고, note에서는 같은 ID로 요구와 근거로 돌아간다. `/map` 연결은 이 읽기 모델을 소비하는 후속 제품 구현이다.

Raw capture는 durable source를 먼저 보존하고, manifest/receipt를 기록한 뒤 index와 note를 만든다. 프로세스 종료나 export 실패 뒤에도 같은 source event/request ID로 재시도한다. 같은 ID에 다른 bytes가 오면 충돌로 남기며 덮어쓰지 않는다. DB 행 생성, 원문 보존, Vault 반영은 각각 상태를 표시한다.

## 코드 snapshot과 실제 진행 근거

commit만으로 dirty 작업 상태를 식별하지 않는다. tracked 변경·untracked 입력·lockfile·관련 설정·submodule revision의 manifest와 hash를 남긴다. 재현에 필요한 bytes/base+patch가 없으면 `reconstructable=false`다. 비밀 설정과 외부 환경 등 미보존 입력을 명시한다.

live worktree 테스트는 시작/종료 상태와 실행 중 변경 관측을 보존하되 모든 변경을 탐지했다고 주장하지 않는다. 고정 소스에서 실행한 경우와 관측만 한 경우를 구분한다. 실행 중 코드가 바뀌면 단일 revision의 통과 증거로 사용하지 않는다.

Native thread는 원 대화의 출처다. 새 Raw는 그중 관측·수집한 범위의 보존 사본이며 Native 실행/재개 정본을 대체하지 않는다. Journal의 redaction/truncation과 미관측 범위는 새 DB로 옮겨도 복원되지 않는다. 대화 coverage는 기본 partial/unknown이며 complete는 명시한 공개 수집 범위에 대해서만 증명한다. summary를 원문이나 provider의 숨겨진 추론으로 표시하지 않는다.

## Obsidian의 기록과 가독성

실제 Vault binding을 확인한 후 경로를 정한다. WES의 독립 Vault, 제품 `.www/vault`, 사용자의 다른 Vault를 같은 저장소로 추정하지 않는다. 기존 Todo의 같은 Markdown 파일 편집 계약도 새 기록 exporter로 대체하지 않는다.

업무 note는 다음 읽기 순서를 제안한다.

- 목적·연결된 Linear Issue·Unit·현재 확인 시점
- 개발 중 생긴 주요 대화와 결정 후보: 요약에서 원문으로 이동
- 구현 변경과 코드 snapshot
- 테스트 진행: 검증 대상, 결과, 실패/미검증, Evidence 링크
- 다음 행동과 원본 링크

frontmatter는 document ID·project/Unit/Issue refs·source record IDs·digest·renderer version을 보존하는 단순 property로 구성한다. 실제 속성명은 ID schema와 함께 확정한다. 파일명·제목을 identity로 쓰지 않는다. rename은 locator 갱신이고 같은 ID의 충돌 사본은 자동 병합하지 않는다.

Raw는 append-only다. 새 자동 note는 request에 예약된 ID와 create-exclusive 쓰기로 생성하고 read-back한다. 재렌더는 새 버전/명시적 supersedes 관계로 남긴다. 사람이 편집한 note는 자동 덮어쓰지 않는다. 동일 logical Vault에 여러 exporter가 생기면 단일 활성 writer와 재시도 receipt 계약을 먼저 구현한다.

note는 Git 결정·코드·Evidence 및 Linear 업무 원본을 가리킨다. 문서 내용에서 승인이나 Issue Done을 자동 생성하지 않는다. 정책/결정 후보의 Promotion은 기존 계약을 따른다. 이번 사용자의 기록 저장 요청을 매번 재승인받는 흐름으로 만들지는 않는다.

## 구현 순서와 수락 조건

첫 범위는 **한 Issue·한 Unit·한 개발 Run·한 테스트·한 Obsidian note의 왕복 연결**이다. 기존 v1 연결을 유지하고 새 schema/source manifest를 검증한 뒤 SQLite 읽기 모델을 추가한다. 기존 원장을 DB-only 정본으로 전환하지 않는다.

1. ID/schema와 source manifest, 기존 v1 및 WES 검증 모델의 매핑을 정의한다.
2. source validator·SQLite builder/query·receipt·rebuild를 구현한다.
3. 한 업무의 대화·테스트 capture와 Obsidian exporter를 연결한다.
4. 실제 TUI/CLI 및 Obsidian에서 왕복 조회하고 다음 실패 시나리오를 검증한다.

- 기존 20개 Linear UUID와 v1 관계가 누락·변경되지 않는다.
- 코드와 문서 이동 뒤에도 Unit/Issue/Record identity로 원본을 찾는다.
- 작업 전환 뒤 과거 대화·테스트의 귀속과 판정이 바뀌지 않는다.
- DB 삭제 후 같은 source에서 같은 논리 관계/hash로 재구축한다.
- stale·손상 DB, source 유실·digest 불일치는 정상 결과와 구분한다.
- capture 이후 종료·Vault 쓰기 실패·재시도에서 Raw 유실·중복 note·사람 편집 덮어쓰기가 없다.
- 테스트 통과, 독립 review, 사람 acceptance가 서로 구분되어 보인다.
- 실제 note에서 Linear·코드·원문으로 이동하고 TUI에서도 같은 연결을 조회한다.

이 검증 전까지 “연결 통합 완료”로 기록하지 않는다. 제품 코드에 현재 있는 것은 v1 연결과 일부 기록 저장소이며, 공유 SQLite 인덱스와 Obsidian 왕복 통합은 구현 대상이다.

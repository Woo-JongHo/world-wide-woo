# woojongho 작업 재개 인계

작성일: 2026-09-05. 원격 반영 완료를 뜻하지 않는 인계 문서다.

2026-09-06 정정: 아래 미결정 목록은 당시 이력이다. 공유 DB 엔진은 사용자 결정에 따라 SQLite다. 현재 저장·연결 방향은 [정정 설계](KNOWLEDGE_BRIDGE_DESIGN.md)를 따른다.

접속 확인: `woojongho:/Users/woojongho/woo/00_project/99_www`, origin은 `https://github.com/Woo-JongHo/world-wide-woo.git`, branch `main`, HEAD `19bad6c`. 원격도 dirty이며 로컬과 변경 목록이 다르다. 원격에는 `src/core/domain/work/` 분해·traceability 신규 파일이 상태 목록에 없었다. 이번 전달 대상은 기존 원격 파일과 충돌하지 않는 `docs/planning/linear-development/` 문서 폴더뿐이다. 다른 코드·문서의 로컬 변경은 전송하지 않는다.

## 현재 요청

로컬에서는 문서까지만 작성하고 `ssh woojongho` 쪽에서 이어서 작업한다. DB 구현·코드 전체 이관·Linear 변경·commit/push는 이번 문서 작성 범위가 아니다.

## 가장 먼저 할 일

- 원격의 실제 저장소 경로, Git remote, HEAD, branch, `git status --short --branch`를 확인한다.
- 로컬 기준은 `main`, HEAD `19bad6c`이며 미커밋 코드·문서·신규 파일이 존재한다. HEAD만 복제하면 현재 작업은 전달되지 않는다.
- 원격의 기존 dirty 변경과 비교한 뒤 전달 방법을 정한다. 강제 덮어쓰기·reset·삭제는 하지 않는다.
- 이번 전달에서 문서만 보냈다면, 문서가 설명하는 미커밋 코드까지 원격에 있다고 가정하지 않는다.

## 코드 기반 문서 정리 계획

README는 당분간 건드리지 않는다. 다음은 제안 목록이며 아직 일괄 생성·개정·이동한 상태가 아니다.

| 구분 | 대상과 목적 |
| --- | --- |
| 생성 후보 | `docs/README.md`: 현재 구현·기획·과거 기록 안내. 루트 README와는 별개지만 생성 여부도 재개 시 확인 |
| 생성 후보 | `docs/DEVELOPMENT.md`: package와 script로 확인한 개발 절차 |
| 생성 후보 | `docs/CODE_MAP.md`: 기능→코드→테스트 위치 안내. 상태 원장이나 Unit 원장 아님 |
| 개정 후보 | `CONTEXT.md`, `docs/WWW_CODE_ARCHITECTURE.md`, `docs/WWW_OBSERVABILITY_VIEW_ARCHITECTURE.md`: 실제 코드와 대조 |
| 개정 후보 | `docs/RELEASE_V010.md`: 현행 절차를 검증한 뒤 `docs/RELEASING.md` 분리 검토 |
| 개정 후보 | `.www/planning/README.md`, `.www/Development-Map.md`: 기존 계약과 최신 확인 범위를 구분 |
| 보관 후보 | `docs/archive/2026-09/{architecture,milestones,research}/`: 대체된 제안·종료된 조사만 보관 |
| 보관 색인 후보 | `docs/archive/README.md`: 원래 위치·보관 이유·대체 문서 기록 |

아카이브 이동 전에 유효한 내용과 모든 참조를 확인한다. 현재 검토 중인 기획은 단순히 오래됐다는 이유로 보관하지 않는다. 기존 `.www/planning/artifacts/`, catalog, Epics/Stories, evidence, control-ledger는 코드가 참조하는 데이터이므로 문서 청소로 일괄 이동하지 않는다. scratchpad 감사 원문도 기존 위치에 보존한다.

## 결정과 미결정

- 확정: Unit ID와 Linear Issue ID 분리.
- 기획: TUI/System/Workflows 탐색 축, 하위 트리는 후보이며 현행 코드는 layer-first.
- 미결정: DB 첫 범위·정본 위치·엔진·동기화·ID 형식·schema 이관. [STORAGE.md](STORAGE.md)에 대안 보존.
- Linear 내용은 사용자와 한 항목씩 논의한다. 이전 제안을 일괄 승인으로 해석하지 않는다.

## 검증 이력의 한계

앞선 로컬 검사에서 타입 검사와 테스트 617개가 통과했다. 이것은 해당 로컬 dirty 상태의 결과이며 원격의 검증이나 사용자 수락을 대신하지 않는다. 앞선 Opus 문서 감사는 REVISE였고 지적 일부를 수정했으나 재감사 PASS는 없다. 이번 인계·저장 초안 역시 독립 검토 전이다.

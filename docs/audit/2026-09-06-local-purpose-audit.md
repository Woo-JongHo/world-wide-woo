# 로컬 목적·정본·연결 기록 감사

- 감사일: 2026-09-06
- 작업 위치: `/Users/jonghoPro/woo/00_project/99_www`, `main`; 시작 시 cwd와 dirty 상태 확인.
- 역할: 기존 원문 읽기·대조. 제품/설계 파일 수정 없음. 이 보고서만 작성.
- 최우선 확정: 최신 사용자가 **공유 DB는 SQLite**라고 정정했다. 로컬 과거 문서의 미확정 표현은 이 사용자 결정 이후 현재 선택지로 되살리지 않는다.
- 판정: 기존 설계의 PostgreSQL 권장 및 DB 엔진 미확정 서술은 철회해야 한다. DB-only registry 정본, 신규 ID 유형/형식, 모든 공개 대화의 Obsidian 자동 생성은 기존 기록에서 수락된 결정으로 확인되지 않는다.

## 실제 완독 범위

| 파일 | 분량 | 지위/일자 |
|---|---:|---|
| `docs/WWW_PRODUCT_DIRECTION.md` | 443행 | 장기 제품 방향, 2026-09-03 |
| `docs/WWW_CONTROL_PLANE_PLANNING_PROPOSAL.md` | 815행 | 사용자 검증 대기, v0.2~v0.3 proposal; 수락된 catalog 아님 |
| `docs/WWW_V010_ARCHITECTURE_PROPOSAL.md` | 726행 | 2026-09-01 구현 후보, 사람 수락·출시 증거 대기 |
| `docs/WWW_V010_EXECUTION_HANDOFF.md` | 216행 | implementation-candidate, 본문 측정 기준 2026-09-01 |
| `docs/workflows/PRODUCT_WORKFLOW.md` | 132행 | 장기 Workflow Profile |
| `.www/planning/README.md` | 72행 | 기존 EP/ST 저장·검증 계약, 현재 Linear 개발 기획으로 이동 안내 있음 |
| `README.md` | 전체 | 현재 dirty 사용자 표면, 장기 문서 링크 추적 |
| `.www/planning/artifacts/EP-011.md` | 전체 | immutable artifact, 2026-08-31T22:01:54.372Z |
| `.www/planning/artifacts/ST-011-10.md` | 전체 | immutable artifact, 2026-08-31T22:01:54.402Z |
| `.www/planning/artifacts/ST-011-11.md` | 전체 | immutable artifact, 2026-08-31T22:01:54.409Z |
| `.www/planning/001-planning-package-v1/ARCHITECTURE.md` | 전체 | Planning Package v1 경계 |
| `docs/planning/linear-development/IDENTITY.md` | 전체 | 9/5 Unit/Issue 분리 사용자 결정, 9/6 구현 후속 |
| `docs/planning/linear-development/STORAGE.md` | 전체 | 9/5 논의 보존 초안; 최신 사용자 정정 전 문서 |
| `docs/planning/linear-development/KNOWLEDGE_BRIDGE_DESIGN.md` | 수정 전 238행 중 관련 원본/ID/DB/Obsidian/복구/배치/이관 섹션 | 9/6 새 설계 제안, 감사 도중 주 작업자가 수정 중; 이하 충돌은 수정 전 기준 |

긴 출력의 잘린 구간은 별도 범위 읽기로 보충했다. 이하 줄번호는 감사 시점 파일 기준이며 후속 수정으로 달라질 수 있다.

## 근거와 설계 충돌

| 쟁점 | 기존 원문과 위치 | 해석·필요 조치 |
|---|---|---|
| 제품 목적 | Product Direction:38–57: 도구/역할 경계에서 업무 의미 유지, Standard·Binding·Contract·Logical ID·Progress·Evidence의 운영 이력 | 단순 기록 수집 DB를 제품 최상위 목적으로 새로 만들지 않는다. Unit–Issue–코드–기록은 기존 Work Chain과 Handoff의 개발 slice로 정의해야 한다. |
| 강한 연결 | Product Direction:61–75: 각 도구 Truth 유지, 원본·결정·이유·수락 조건 보존; 중앙 복제가 목적 아님 | 저장소 중심 설명보다 원본 소유권과 업무 의미를 먼저 명시한다. |
| ID 소유 | Product Direction:112–124, 276: WWW Logical ID와 외부 ID는 합치지 않고 명시 매핑; 발급/매핑 책임 WWW | ID registry를 WWW가 소유하는 것은 목적에 맞지만 DB-only 물리 정본이라는 결정까지 함의하지 않는다. |
| 기존 Unit 결정 | IDENTITY:3, 11–15: 지속 기능 Unit과 닫히는 변경 Issue 분리는 9/5 사용자 결정; 형식·발급 단위·원장 이관 미완 | Unit을 새 아이디어처럼 제시하지 않는다. `UNT-/DEV-/REC-/TST-/DOC-` UUID 규칙은 신규 제안으로 남겨야 한다. |
| Work Chain 의미 | Product Workflow:80–95: 도구 순서가 아닌 같은 기능의 원본/Projection 관계; WWW가 Identity·Handoff·Progress·Approval·Evidence 관리 | Unit과 Work Chain을 중복 최상위 identity로 만들지 않는다. 기존 Work Identity/Logical ID와 Unit의 관계를 명시해야 한다. |
| 5도구 구조 | Control Plane:3–7, 224–241, 494–508: 검증 대기 제안, `www.work.<project>.<sequence>`와 외부 refs; 중복/프로젝트 혼합 방지, 변경 이력 | 이 문자열 포맷이나 모든 도구 필수 규칙은 수락됐다고 단정 불가. 확정된 의미와 검증 대기 표기를 구분한다. |
| 정본 경계 | v0.1 Architecture:33–42, 416–430: Obsidian 지식/Linear 계획·판정/GitHub 코드·기술 증거; WWW는 link/cache/workbench이며 네 번째 정본 아님 | `KNOWLEDGE_BRIDGE:31–35`의 DB-only로 관계 원장 전환은 기존 결정에서 도출되지 않는다. 외부 본문 정본화와 WWW 자체 관계 저장은 구별하되, 물리 정본 변경은 명시 전환 설계가 필요하다. |
| DB-only 미결정 증거 | STORAGE의 “아직 결정하지 않은 것” 2번, “정본 위치의 두 대안”: DB 정본 vs Git 연결 파일+DB projection; 작성자는 후자 제안, 사용자 선택 없음 | 최신 SQLite 엔진 정정은 이 두 가지 중 DB-only를 선택한 말이 아니다. 엔진 선택과 관계 원장 authority 선택을 섞지 않는다. |
| SQLite 범위 | Planning v1 ARCHITECTURE:22: `SQLite BEGIN IMMEDIATE mutex`; v0.1 Architecture:583: SQLite/검색/remote telemetry backend 제외 | 전자는 파일 쓰기 잠금, 후자는 해당 옛 릴리스 범위. 공유 SQLite의 설계 결정 부재나 금지의 근거가 아니다. 사용자 최신 SQLite 결정을 기준으로 구현 여부만 별도로 적는다. |
| DB 원안 오류 | KNOWLEDGE_BRIDGE:77, 206–208: 두 엔진 adapter, 공유 PostgreSQL 권장, SQLite는 단일 머신 축소안, 엔진 미선택 | 모두 최신 사용자 결정과 충돌. “공유”를 네트워크 파일 공유나 다중 머신 서버로 자동 번역해서 엔진을 다시 선택하지 않는다. |
| Obsidian 역할 | Product Workflow:76–78: Decision Truth, 모든 대화·실행 로그 복제하지 않음. Control Plane:68–79, 147, 684–687: 장기 문서/정책/의사결정, 문서 ref·승인 promotion | 사용자가 이번에 대화와 테스트 진행 기록의 저장을 요구한 것은 명시적인 범위 확장이다. 예전부터 원문 전량 보존 합의였다고 쓰지 말고 기록/요약/판단 정본을 구별한다. |
| 원 대화 | v0.1 Architecture:69–70, 228–230, 316–350: native thread가 원본, WWW journal은 관찰 사본; stdout 상한·ignored artifact; 재시작 native 우선 복구 | 수집기+DB가 native 대화의 새 원본이라고 선언하지 않는다. 새 개발 기록은 출처/수집 범위를 남기는 기록이다. |
| 테스트 판정 | v0.1 Architecture:35–37, 325–326; Product Workflow:54–74, 115–119 | TestRun 관측과 기술 증거, Linear의 acceptance/판정을 분리해야 한다. Obsidian 설명의 pass 편집은 원 실행/Linear 수락을 바꾸지 않는다. |
| 승격과 기록 | v0.1 Architecture:54–59, 250–262, 299–311, 640–642; ST-011-11:7 | 저장과 승인/장기 결정 승격은 다르다. 사용자의 현재 개발 기록 저장 요청을 매번 다시 허락받을 이유로 해석할 필요는 없지만 generated note를 승인된 결정처럼 기록해서는 안 된다. |
| same-file | EP-011:4, Handoff:42–44: 승인 Markdown Git/GitHub/Obsidian same-file. ST-011-10:6는 tracked `.www/vault/Todo.md` 한 벌 | DB용 별도 Markdown과 Obsidian용 복사본을 두 개의 독립 편집 정본으로 만들면 안 된다. 실제 Vault 위치를 이 문서만으로 확정할 수는 없다. |
| 내부 기록 충돌 | ST-011-10:6는 project 단일 Todo, Handoff:62는 thread별 Todo+명시 promotion; v0.1 Architecture:447–449는 기존 vault를 정본으로 강제하지 않음; Control Plane:158–161은 Native Plan projection로 이동하고 legacy 보존 제안 | 어느 하나를 최신 확정이라고 조용히 취사선택하면 안 된다. 역사/제안/구현 사실을 별도 표기하고 현재 코드 및 최신 Linear 기록으로 현재 동작을 확인해야 한다. 기존 immutable Story는 고치지 않는다. |
| 옛 Planning 정본 | .www/planning/README:3, 37, 69–72 | “외부 tracker를 정본으로 만들지 않음”은 옛 EP/ST Package v1의 비범위다. 현재 Linear 작업의 authority를 부정하는 전역 규칙으로 해석하면 틀린다. |
| 현재 단계 | Product Direction:29, 372–430; v0.1 Architecture:580–588, 601, 682–683 | 장기 Work Chain와 연동은 설계로 표기돼 있으며 옛 local release와 새 Linear First Public Release가 동일하지 않음(현 README:11). 최신 요청은 연동 요구 정리의 권한이지 구현/출시 완료 증거 아님. |

## DB-only 판단의 정확한 범위

1. **부정확한 주장 A:** 네 번째 정본 금지니까 SQLite에 어떤 ID/관계도 소유할 수 없다. 이는 WWW가 Logical ID·Work Chain을 소유한다는 장기 목적과 맞지 않는다.
2. **부정확한 주장 B:** WWW가 ID를 소유하니까 Git 원장을 제거하고 DB-only를 선택한 것이 이미 확정이다. STORAGE는 authority 대안을 명시적으로 미결정으로 남겼다.
3. **확인한 결론:** 공유 SQLite 엔진은 최신 사용자 결정으로 확정. 외부 원본 소유권은 유지. Unit/관계의 영속 정본과 versioned 기록/복구 모델은 기존 Git 원장과 상위 결정 자료를 대조해 정해야 한다. 첫 설계에서 DB-only와 새 export를 확정인 것처럼 만든 것은 근거 부족이다.

## 권장 수정 방향 (감사 의견이며 새 확정 결정 아님)

- 제목/흐름을 기존 Work Chain의 개발 추적 slice에 연결하고 Unit이 기존 Logical ID 체계의 어떤 단위인지 기록한다.
- PostgreSQL 대안 및 엔진 미결정 표현을 철회하고 SQLite engine과 topology/writer/복구 설계를 구분한다.
- 기존 관계 원장을 보존하는 최소 SQLite index부터 설계할 수 있지만 상위 WES 기록이 이미 원장 위치를 확정했다면 그것을 우선한다. 이 감사는 상위 결정을 대신하지 않는다.
- Obsidian에 개발 대화/테스트 기록을 남기는 최신 요청을 기존 Decision Truth 정책의 명시 확장으로 기록하고 관찰 원문·사람 설명·승인된 결정의 상태를 구별한다.
- old `.www/vault`와 실제 Vault를 자동 동일시하거나 항상 별개로 강제하지 않는다. 같은 Markdown을 여는 방식과 위치 binding을 먼저 확인한다.
- DB 백업 일일/30일/RPO24h/RTO4h, 별도 공유 서버·exporter topology는 과거 수락된 수치/구성으로 확인되지 않았다. 제안 또는 설계 보류로 표시한다.

## 확인하지 않은 범위

- 중앙 WES의 실제 SQLite/shared-db 결정은 다른 감사 담당 범위다. 이 로컬 감사에서 확인했다고 주장하지 않는다.
- Linear MCP의 현재 project/issue/document와 Obsidian 실제 Vault 내용은 이 패스에서 조회하지 않았다.
- Git 전체 이력·모든 catalog event·모든 evidence artifact·실제 코드의 현재 동작을 전수 조사하지 않았다. Handoff의 PASS는 과거 문서에 적힌 주장으로 읽었으며 현재 실행 검증을 다시 수행한 것이 아니다.
- 위 완독 목록 밖의 모든 repository 문서를 읽었다는 주장을 하지 않는다. 보고서는 유한한 지정 목적 문서와 직접 관련 원문에 대한 감사다.

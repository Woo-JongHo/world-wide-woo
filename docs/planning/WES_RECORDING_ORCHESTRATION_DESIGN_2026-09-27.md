# WES 기록·오케스트레이션 재설계

상태: Draft  
작성일: 2026-09-27

## 1. 문제

현재 WWW에는 Linear 후보, Obsidian 정본 후보, Git 변경, Evidence, traceability ledger,
SQLite projection, Development Map을 다루는 도구가 이미 있다. 그러나 이들은 하나의
작업 상태기계로 연결되지 않았다. 그 결과 후보는 만들어졌지만 게시되지 않거나,
게시됐지만 read-back ID가 ledger에 귀속되지 않거나, Obsidian의 상세 정본 링크가
Linear에서 낡은 경로를 가리키는 일이 생긴다. 0.0.19와 0.0.20 기록 누락은 이 단절의
실제 사례다.

WES도 현재는 제품의 중심 오케스트레이터가 아니다. `project-workbench-session.ts`의
`enableWooEntry`가 켜질 때만 `WesEntryCollector`를 만들며, 일반 Chat 세션은 WES를
수집하거나 WES 상태를 노출하지 않도록 명시돼 있다. 지금의 WES는 읽기 전용 정책
snapshot 공급자에 가깝다.

## 2. 정본 소유권

| 표면 | 소유하는 사실 | 소유하지 않는 사실 |
|---|---|---|
| Obsidian | WHY, 행동 계약, 결정, 시나리오, 장기 설명 | 현재 실행 상태, 배포 성공 판정 |
| Linear Issue | WHAT, NOW, DONE, 우선순위와 계층 | 상세 설계의 전문 |
| Linear Project Comment | 한 작업 단위의 변경·영향·검증 | 장기 정본, 릴리스 집계 |
| Linear Project Update | 한 기능 버전의 집계와 health | 개별 작업의 상세 로그 |
| Git | 실행 코드, 테스트, revision | 업무 의도와 승인 상태 |
| Evidence | 명령·조회·게시·read-back의 불변 영수증 | 사람이 편집하는 정본 |
| traceability-v3 ledger | 모든 identity와 relation의 정본 | 문서 전문, 런타임 캐시 |
| SQLite·Development Map | ledger에서 재생성되는 조회 projection | 독립 쓰기 정본 |

`traceability-v2.json`, legacy ledger와 기존 planning ID는 새 쓰기의 정본이 아니다.
호환 읽기만 허용하고 신규 relation은 `traceability-v3.json`으로 수렴시킨다.

## 3. 목표 상태기계

모든 기록 작업은 동일한 `RecordingRun`으로 표현한다.

`observed → classified → candidates_ready → approval_pending → publishing → read_back → reconciled`

실패 상태는 `blocked_auth`, `blocked_precondition`, `publish_uncertain`, `reconcile_failed`로
구분한다. 각 전이는 append-only receipt를 남긴다.

- `observed`: Git revision, 변경 파일, 테스트, 연결된 Linear/Obsidian identity를 수집한다.
- `classified`: Issue, Comment, Update, Obsidian 변경 필요성을 정책으로 판정한다.
- `candidates_ready`: 외부 쓰기 없는 후보와 digest를 만든다.
- `approval_pending`: 외부 쓰기 항목과 대상, 본문 digest를 고정한다.
- `publishing`: precondition을 다시 읽고 idempotency key로 한 번만 게시한다.
- `read_back`: 원격 ID, 본문, health, parent를 재조회해 후보와 비교한다.
- `reconciled`: receipt를 ledger에 연결하고 SQLite와 Development Map을 재생성한다.

## 4. 자동화 경계

자동화해야 하는 것은 후보 생성, 중복 검사, precondition 조회, read-back, reconcile과
drift 경보다. 외부 쓰기는 승인 정책을 통과한 `PublicationIntent`만 수행한다. 승인된
intent에는 대상, operation, candidate digest, expected-before, expiry가 포함된다.
같은 digest와 대상의 성공 receipt가 있으면 재게시하지 않는다.

커넥터 인증 실패는 UI fallback으로 조용히 바꾸지 않는다. `blocked_auth`로 남기고,
명시적으로 선택된 adapter만 사용한다. UI fallback을 쓰면 short ID만 관측되는 한계를
receipt에 기록하며, full UUID를 추정하지 않는다.

## 5. WES 역할

WES는 새 정본이 아니라 기록 흐름의 coordinator다.

1. 세션 진입 시 저장소·branch·연결 project·열린 RecordingRun을 읽는다.
2. 변경과 검증 이벤트를 수집해 `observed` 상태를 갱신한다.
3. 스킬 정책으로 필요한 artifact 후보를 만들고 한 승인 묶음으로 제시한다.
4. 승인 후 adapter별 publisher를 실행하고 read-back을 강제한다.
5. ledger reconcile과 projection rebuild가 끝나야 완료로 판정한다.
6. HUD에는 Goal과 함께 현재 RecordingRun 상태, blocker, 다음 한 행동만 투영한다.

현재 `WooEntry`의 bounded read-only snapshot 계약은 유지한다. 쓰기 오케스트레이션은
별도 application service가 소유하고, snapshot에는 그 서비스가 만든 상태 요약만 넣는다.

## 6. 코드 경계

- `core/application/recording/recording-run.ts`: 상태와 전이 불변식
- `core/application/recording/recording-orchestrator.ts`: 후보·승인·게시·재조정 순서
- `core/ports/recording-publication.ts`: Linear·Obsidian publisher port
- `adapters/outbound/recording/*`: MCP, UI fallback, filesystem adapter
- `adapters/outbound/persistence/recording-run-store.ts`: append-only receipt와 재개
- 기존 `artifact-publication-capability.ts`: publication 실행 primitive로 재사용
- 기존 `skill-run.ts`: 실행 telemetry로 재사용하되 기록 정본으로 승격하지 않음
- `WesEntryCollector`: 상태 요약을 읽는 역할만 유지

## 7. 구현 순서

### 단계 1 — 관측과 재조정

- `RecordingRun` schema와 append-only store를 도입한다.
- candidate·approval·publish receipt의 identity와 digest를 하나로 묶는다.
- ledger v3만 신규 relation을 받게 하고 SQLite·Development Map rebuild를 한 명령으로 묶는다.
- stale Obsidian 경로, 미게시 candidate, read-back 없는 게시를 drift로 검출한다.

### 단계 2 — 안전한 게시 오케스트레이션

- Linear Comment·Update와 Obsidian publish를 동일한 precondition/idempotency 계약으로 감싼다.
- 인증 실패, 충돌, timeout과 uncertain publish를 구분한다.
- 재시작 시 성공 receipt부터 재생해 중복 게시를 막는다.

### 단계 3 — WES 제품 통합

- 일반 세션에서도 WES read-only snapshot을 기본 연결하되 실패가 Chat을 막지 않게 한다.
- HUD에 RecordingRun 상태와 실제 blocker를 표시한다.
- 사용자가 요청한 경우에만 승인된 publication intent를 실행한다.
- release boundary가 충족되면 Comment 집합에서 Update 후보를 자동 생성한다.

## 8. 수락 기준

- 한 기능 변경에서 Issue, Obsidian, Git revision, Evidence, Comment, Update의 relation이
  ledger v3에서 한 번만 나타난다.
- 게시 성공을 주장하려면 원격 read-back receipt가 반드시 존재한다.
- 같은 intent를 세 번 실행해도 외부 artifact는 하나만 생긴다.
- 인증 단절과 원격 timeout 뒤 재개해도 중복 게시하지 않는다.
- SQLite와 Development Map을 삭제 후 재생성해 같은 relation 집합이 나온다.
- WES가 꺼지거나 BLOCKED여도 Chat은 작동하고, 기록 상태는 UNKNOWN이 아닌 명시 blocker다.

## 9. 현재 우선순위

첫 구현은 새 HUD가 아니라 `RecordingRun + reconcile`이다. 현재 문제의 원인은 화면이
아니라 게시와 read-back이 분리된 데 있다. 그 위에 WES snapshot과 HUD projection을
올려야 또 다른 경쟁 정본을 만들지 않는다.

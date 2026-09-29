# WES가 기록 후보부터 read-back과 재조정까지 한 실행으로 관리한다

## 목적

Linear·Obsidian·Git·Evidence 기록이 서로 독립 실행되어 후보 누락, 중복 게시, 낡은 링크와 ledger drift가 생기는 문제를 없앤다.

## 결과

한 기능 변경의 관측, 분류, 후보, 승인, 게시, read-back, ledger reconcile이 RecordingRun 하나로 재개되며 WES는 그 상태를 조정하고 HUD에는 상태 요약만 투영한다.

## 범위

### 포함

- RecordingRun 상태기계와 append-only receipt를 도입한다.
- Issue·Comment·Update·Obsidian 후보와 승인·게시·read-back identity를 digest로 결속한다.
- traceability-v3에 신규 relation을 수렴시키고 SQLite·Development Map을 재생성한다.
- 인증 실패, precondition 충돌, uncertain publish와 reconcile 실패를 구분한다.
- 동일 publication intent 재실행 시 중복 외부 artifact 생성을 막는다.
- WES snapshot과 HUD에는 RecordingRun 상태, blocker, 다음 행동만 투영한다.

### 제외

- WES를 Linear·Obsidian·Git을 대체하는 새 정본으로 만드는 것
- 사용자 승인 없이 외부 기록을 자동 게시하는 것
- 첫 구현에서 HUD 시각 요소를 우선 확장하는 것
- legacy traceability 원장에 신규 relation을 계속 쓰는 것

## 동작

- 관측된 변경은 classified 전까지 어떤 외부 기록도 요구하지 않는다.
- 후보가 준비되면 대상·operation·digest·expected-before·expiry가 고정된 승인 intent를 만든다.
- 게시 성공은 원격 read-back과 후보 비교가 끝난 경우에만 인정한다.
- 재시작 시 성공 receipt부터 재생하고 미완료 전이만 계속한다.
- WES가 차단되어도 Chat은 계속 작동하고 기록 상태는 명시 blocker로 남는다.

## 완료 조건

- RecordingRun의 정상·인증 차단·충돌·uncertain publish·reconcile 실패 전이가 테스트된다.
- 같은 intent를 세 번 실행해도 외부 artifact는 하나만 존재한다.
- 게시 성공 주장마다 원격 read-back receipt가 존재한다.
- ledger v3에서 Issue·Obsidian·Git revision·Evidence·Comment·Update relation이 한 번만 나타난다.
- SQLite와 Development Map을 삭제 후 재생성해 같은 relation 집합을 얻는다.
- WES 비활성 또는 BLOCKED 상태에서도 Chat 동작과 명시 blocker 표시를 확인한다.

## 연결

- Planning: EP-004 WES Context · ST-004-06 Decision·Evidence projection
- Related: WOO-910 7단계 Runtime 통제
- Design: docs/planning/WES_RECORDING_ORCHESTRATION_DESIGN_2026-09-27.md
- Evidence: .www/evidence/2026-09-27-wes-recording-orchestration
- Position gate: Linear connector 재인증 뒤 부모·milestone·중복을 다시 확인한다.

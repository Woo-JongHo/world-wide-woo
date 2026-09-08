# RPA Workflow

Agent·Skill·상태 머신·승인·Monitor의 실행 계약은 [Skill Runtime Contract](SKILL_RUNTIME_CONTRACT.md)가 소유한다.

- 상태: 장기 Workflow Profile
- 적용 대상: 반복 업무를 자동화하고 운영하는 RPA 업무
- 공통 계약: [WWW README](../../README.md)의 Work Chain·Handoff·Progress·Approval·Evidence

## 목적

RPA Workflow는 화면 디자인보다 실제 업무 프로세스, 데이터, 예외와 운영 안전성을 중심으로 자동화를 정의하고 검증한다.

```text
업무 발견
  → 프로세스 정의
  → 입력·출력·예외 Contract
  → 자동화 개발
  → 실제 업무 데이터 검증
  → 배포·스케줄
  → 운영·장애·업무 변경
```

Product Workflow와 같은 WWW 계약을 사용하지만 Figma Stage를 기본 전제로 하지 않는다.

## 역할과 원본

### 업무 담당자 — Process Truth

업무의 목적, 실제 수행 순서, 판단 기준, 입력과 기대 결과를 소유한다. 자동화 구현이 현재 업무와 다르면 업무 담당자의 확인 가능한 절차가 기준이다.

### rpa-map — Automation Contract

`rpa-map`은 확인된 업무 사실을 다음 계층으로 정규화한다.

```text
Process: 지속 업무
├─ Task: 독립적으로 개발·검증·추적할 업무 단위
│  └─ Unit: Task 안에서 유지되는 안정 책임
├─ 예외 처리
└─ 테스트
```

Unit ID는 경로나 실행 순서가 아니라 책임을 식별한다. 실행 순서는 별도 필드이며, 원본에 없는 재실행·중단·승인 정책은 `unknown` 또는 미수락 계약으로 남긴다.

### Linear·Obsidian — Automation Work and Contract

Linear는 Process를 업무 부모로, Task를 번호 하위 이슈로 추적한다. 예외 처리와 테스트는 Task와 같은 Process 하위에 둔다. Unit은 해당 Task 본문에 안정 ID와 책임으로 기록하고, 독립적인 변경·검증·종료가 필요한 경우에만 별도 Work 이슈로 만든다.

공통 RPA Agent·Skill은 Linear의 얇은 WHAT·NOW·DONE과 Obsidian의 상세 WHY·계약·결정을 1:1로 연결한다. 프로젝트별 Process·Task·Unit은 Linear와 `rpa-map`을 기본 원본으로 삼고, 장기 결정이나 별도 상세 계약이 생길 때만 Obsidian 정본을 추가한다.

### GitHub — Implementation Truth

GitHub는 자동화 코드, 설정 Schema, Test, Commit, PR, Check와 배포 가능한 변경의 원본을 소유한다.

### 운영 시스템 — Run Truth

Scheduler, Queue, 업무 시스템과 실행 환경은 실제 Run 상태와 외부 결과의 원본을 소유한다. WWW는 관측한 결과를 Evidence로 연결하며 성공을 추정하지 않는다.

## Work Chain

```text
Business Process
  └── Task / Unit contract
        └── Linear Work
              └── GitHub Change
                    └── Deployment / Scheduled Run
                          └── Operational Evidence
```

업무 정의와 구현뿐 아니라 실제 운영 Run까지 같은 Logical Work Chain으로 추적한다.

## Handoff Contracts

### Process → Contract

- 자동화 목적과 수동 기준선이 명확하다.
- 입력·출력과 대상 시스템이 식별되어 있다.
- 사람 판단이 필요한 단계가 구분되어 있다.
- 정상·예외·재처리 흐름과 source revision이 연결되어 있다.

### Contract → Development

- 업무 규칙이 설정과 코드의 책임으로 구분되어 있다.
- 환경별 값과 비밀정보의 경계가 정의되어 있다.
- 외부 Write와 사람 승인이 필요한 지점이 식별되어 있다.
- 고객용·운영자용 메시지는 별도 Artifact와 전달 책임 Unit을 가진다.

### Development → Validation

- 업무 Unit과 코드 변경이 연결되어 있다.
- 정상·경계·실패·부분 실패·재실행 Test가 수행됐거나 미수행 범위가 표시되어 있다.
- 실제 환경에서 검증하지 못한 범위가 표시되어 있다.
- 데이터 손상, 중복 실행과 부분 실패의 복구 조건이 검증됐다.

### Validation → Operation

- 실행 계정·권한·Schedule·Timeout이 확인됐다.
- 관측·알림·중단·재개 절차가 존재한다.
- 실패 시 책임자와 수동 대체 절차가 연결되어 있다.
- 실제 Run 결과를 수집할 Evidence 경로가 존재한다.

## 완료 판단

RPA의 완료는 코드와 Test가 통과한 시점만을 뜻하지 않는다.

```text
Implementation passed
  → Contract validation
  → Environment validation
  → Required approval
  → Observed run evidence
  → Operational acceptance
```

실제 로그인, 외부 시스템, 운영 데이터나 Scheduler를 확인하지 못했다면 해당 범위는 `uncertain` 또는 `blocked`로 남긴다. 고객 메일의 실제 발송은 명시된 Mail Unit과 그 승인·재실행 정책이 있을 때만 운영 수락에 포함된다.

## Runtime

`skill:runtime`은 프로젝트 Skill frontmatter와 bytes를 Git revision 및 registry digest에 고정한다. RPA intent를 고정 체인으로 계획하고 Process가 없는 실행을 차단하며, 한 번에 한 Skill만 `running`으로 전이한다. 외부 변경 Candidate가 있으면 정확한 SHA-256 digest 승인 뒤에만 검증 단계로 이동한다. 각 단계는 공통 Woo Receipt를 남기고 Monitor에는 업무 데이터 대신 Run·Skill·Process·Task·Candidate·Receipt identity만 투영한다.

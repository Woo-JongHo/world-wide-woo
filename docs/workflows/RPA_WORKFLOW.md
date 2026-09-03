# RPA Workflow

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

### Atlas — Automation Definition

Atlas는 자동화할 Unit과 관계를 개발 가능한 수준으로 구조화한다.

```text
정산 메일 처리
├─ 대상 메일 식별
├─ 첨부파일 다운로드
├─ Excel 검증·가공
├─ 결과 업로드
└─ 완료·실패 알림
```

프로세스 단계, 업무 규칙, 입력·출력, 외부 시스템, 예외와 운영 조건을 연결하되 실행 이력과 코드를 원본으로 복제하지 않는다.

### Linear — Automation Work

Linear는 Automation Unit을 구현·검증 가능한 개발 업무와 Acceptance Criteria로 나눈다.

### GitHub — Implementation Truth

GitHub는 자동화 코드, 설정 Schema, Test, Commit, PR, Check와 배포 가능한 변경의 원본을 소유한다.

### 운영 시스템 — Run Truth

Scheduler, Queue, 업무 시스템과 실행 환경은 실제 Run 상태와 외부 결과의 원본을 소유한다. WWW는 관측한 결과를 Evidence로 연결하며 성공을 추정하지 않는다.

### Obsidian — Decision Truth

업무 규칙 변경, 예외 허용, 운영 정책과 장애 후 결정처럼 장기적으로 다시 사용할 판단 근거를 보존한다.

## Work Chain

```text
Business Process
    └── Atlas Automation Unit
            └── Linear Work
                    └── GitHub Change
                            └── Deployment / Scheduled Run
                                      └── Operational Evidence
```

업무 정의와 구현뿐 아니라 실제 운영 Run까지 같은 Logical Work Chain으로 추적한다.

## Handoff Contracts

### Process → Automation Definition

- 자동화 목적과 수동 기준선이 명확하다.
- 입력·출력과 대상 시스템이 식별되어 있다.
- 사람 판단이 필요한 단계가 구분되어 있다.
- 정상·예외·재처리 흐름이 정의되어 있다.

### Definition → Development

- 업무 규칙이 설정과 코드의 책임으로 구분되어 있다.
- 환경별 값과 비밀정보의 경계가 정의되어 있다.
- Acceptance Criteria와 대표 Fixture가 존재한다.
- 외부 Write와 사람 승인이 필요한 지점이 식별되어 있다.

### Development → Validation

- 업무 Unit과 코드 변경이 연결되어 있다.
- 정상·경계·실패·재실행 Test가 수행됐다.
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

실제 로그인, 외부 시스템, 운영 데이터나 Scheduler를 확인하지 못했다면 해당 범위는 `PARTIAL` 또는 `BLOCKED`로 남긴다.

# Product Workflow

- 상태: 장기 Workflow Profile
- 적용 대상: Web·App·Tool 등 사용자 경험과 제품 기능을 만드는 업무
- 공통 계약: [WWW README](../../README.md)의 Work Chain·Handoff·Progress·Approval·Evidence

## 목적

Product Workflow는 기획·디자인·개발·검증이 서로 다른 도구에서 이루어져도 같은 기능의 의도와 완료 조건이 끊어지지 않게 연결한다.

```text
Designer                       Developer
   │                               │
   ▼                               ▼
 Figma                         Linear ─────▶ GitHub
    ╲                            ╱
     ╲                          ╱
      └──────── Atlas ─────────┘
                 ▲
                 │
                 PM

Decision ─────────────────────────────▶ Obsidian
```

이 도구 구성은 Product Workflow의 대표적인 Project Binding이다. 다른 도구를 사용해도 역할과 Contract의 의미는 유지한다.

## 역할과 원본

### Figma — Design Truth

Figma는 Screen·Component·User Flow·Interaction·Visual State의 원본을 소유한다. WWW는 별도 디자인 원본을 만들지 않는다.

### Atlas — PM Projection

Atlas는 PM이 디자인과 개발 업무를 프로젝트 수준에서 이해하는 View다. 새로운 Source of Truth가 아니라 기존 원본의 관계를 구조화한 Projection이다.

```text
로그인

[Figma Preview]

Features
├─ 이메일 로그인
├─ 로그인 실패 처리
├─ 비밀번호 찾기
└─ 자동 로그인

Progress       3 / 4
Development    LIN-128 ~ LIN-131
```

Atlas는 화면, 기능, 기능 간 관계, 개발 업무 연결, 진행 상태, 주요 결정과 Evidence를 보여주되 개발 세부사항 전체를 소유하지 않는다.

### Linear — Development Work

Linear는 Feature를 Requirement·Acceptance Criteria·Implementation Task·Dependency·Validation으로 확장하는 개발 업무 원본이다.

```text
Atlas: 이메일 로그인

Linear
├─ 이메일 형식 검증
├─ 비밀번호 필수 검증
├─ /auth/login 연동
├─ 401 실패 처리
├─ Session 처리
├─ Acceptance Criteria
└─ Test Scenario
```

### GitHub — Implementation Truth

GitHub는 Code·Commit·Pull Request·Test·Check·Review의 원본을 소유하고 Linear 업무가 실제 변경으로 이어진 결과를 보존한다.

### Obsidian — Decision Truth

Obsidian은 무엇을 왜 결정했고 어떤 대안과 업무에 영향을 주었는지 장기적으로 다시 사용할 판단 근거를 소유한다. 모든 대화와 실행 로그를 복제하지 않는다.

## Work Chain

Work Chain은 도구 사용 순서가 아니라 같은 기능이 여러 원본과 Projection에서 동일한 업무로 식별되도록 유지하는 관계다.

```text
Figma Screen
    │
    ├── Feature: Login
    │       ├── Linear Issue
    │       │       └── GitHub PR
    │       └── Obsidian Decision
    └── Atlas Projection
```

WWW는 이 관계의 Work Identity·Handoff·Progress·Approval·Evidence를 관리한다.

## Handoff Contracts

### Design → Product

- 원본 화면이 연결되어 있다.
- 주요 기능과 Identity가 식별되어 있다.
- 화면과 기능의 관계가 명확하다.
- 필요한 상태와 예외가 정의되어 있다.

### Product → Development

- 개발 대상 기능과 범위가 명확하다.
- 원본 디자인과 결정이 연결되어 있다.
- Acceptance Criteria가 존재한다.
- 필요한 의존성과 다음 책임이 연결되어 있다.

### Development → Implementation / Validation

- Linear 업무와 코드 변경이 연결되어 있다.
- Acceptance Criteria가 검증됐다.
- 필요한 Test·Check·Review·Approval이 완료됐다.
- 완료를 뒷받침하는 Evidence가 존재한다.

## 대표 흐름

```text
사용자 문제와 제품 요구
  → Design
  → PM Projection
  → Development Work
  → Implementation
  → Validation / Approval / Evidence
  → Accepted
  → Release / Operation / Maintenance
```

모든 업무가 모든 Stage를 거치지는 않는다. 적용할 Blueprint와 Project Binding이 필요한 Stage와 생략 가능한 경계를 결정한다.

# World Wide Woo

> **Different tools. One project. No broken handoffs.**

> **프로젝트와 도구가 바뀌어도 업무 방식은 유지되는 Service Lifecycle Orchestration Harness.**

**World Wide Woo(WWW)**는 Figma, Atlas, Linear, GitHub, Obsidian처럼 서로 다른 도구에서 이루어지는 하나의 프로젝트를 **검증 가능한 Work Chain으로 연결하는 개인화 Service Lifecycle Orchestration Harness**다.

각 역할은 자신에게 맞는 도구에서 필요한 깊이까지만 일한다. WWW는 모든 정보를 하나의 도구로 합치거나 원본을 복제하지 않는다.

대신 업무가 역할과 도구의 경계를 넘을 때 **무엇이 전달되어야 하고, 무엇을 만족해야 다음 단계로 갈 수 있는지 Contract로 통제한다.**

WWW가 지키는 것은 특정 AI나 도구가 아니라 사용자의 업무 방식이다. 프로젝트 환경이나 실행기가 달라져도 **Workflow·Contract·Progress·Approval·Evidence**의 의미를 유지한다.

> **현재 상태:** WWW는 개발 중이며, 현재 제품은 프로젝트별 업무를 다루는 초기 Workbench다. 이 README는 WWW가 지향하는 제품의 역할과 핵심 계약을 설명한다.

## Why WWW

서비스 개발은 하나의 도구 안에서 이루어지지 않는다.

디자이너는 Figma에서 화면과 사용자 경험을 만든다.

개발자는 Linear에서 개발해야 할 기능과 세부 업무를 확인하고 수행한다.

실제 코드와 변경 이력은 GitHub에 남는다.

PM은 Atlas에서 Figma의 화면과 그 화면에 포함된 기능, 개발 업무와의 연결, 현재 진행 상태를 프로젝트 수준에서 확인한다.

장기적으로 다시 참고해야 할 결정과 그 이유는 Obsidian에 남긴다.

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

문제는 각 도구 자체가 아니다.

**역할과 도구 사이의 경계가 사람이 기억하고 전달해야 하는 영역으로 남아 있다는 것**이 문제다.

디자인이 개발 업무로 넘어갈 때 어떤 기능을 구현해야 하는지 누락될 수 있다.

개발이 끝났다고 해도 어떤 요구사항을 충족했고 무엇으로 검증했는지 연결되지 않을 수 있다.

중간에 중요한 결정이 내려져도 이후 왜 그렇게 구현됐는지 추적하기 어려워진다.

WWW는 각 도구의 원본을 그대로 유지하면서 같은 업무를 **Work Chain으로 연결하고, 역할 사이의 Handoff를 Contract로 검증한다.**

```text
각 역할은 자기 도구에서 일한다.

WWW는 그 사이를 통제한다.

Identity
Contract
Progress
Approval
Evidence
```

## How WWW Connects Work

WWW는 모든 역할에게 모든 정보를 보여주지 않는다.

**같은 업무를 역할마다 필요한 깊이로 보여준다.**

### Figma — Design Truth

Figma는 디자인 원본을 소유한다.

```text
Screen
Component
User Flow
Interaction
Visual State
```

디자이너는 디자인 작업을 Figma에서 계속 수행한다. WWW가 별도의 디자인 원본을 만들지 않는다.

### Atlas — PM Projection

Atlas는 PM이 프로젝트 전체를 이해하기 위한 **View / Projection**이다.

Figma의 화면을 그대로 보여주고, 그 화면에 어떤 기능이 존재하는지와 각 기능이 어떤 개발 업무와 연결되어 있는지 보여준다.

```text
로그인

[Figma Preview]

Features
├─ 이메일 로그인
├─ 로그인 실패 처리
├─ 비밀번호 찾기
└─ 자동 로그인

Progress
3 / 4

Development
LIN-128
LIN-129
LIN-130
LIN-131
```

Atlas는 개발 세부사항을 모두 소유하지 않는다. PM에게 필요한 수준인 다음 정보까지만 보여준다.

```text
화면
기능
기능 간 관계
개발 업무와의 연결
현재 진행 상태
주요 결정과 Evidence
```

즉 Atlas는 새로운 Source of Truth가 아니라 **기존 원본을 프로젝트 수준에서 이해하기 위한 구조화된 Projection**이다.

### Linear — Development Work

Linear는 개발자가 실제 업무를 수행하는 영역이다. Atlas에서 하나의 기능으로 보이는 항목은 Linear에서 필요한 개발 깊이로 확장된다.

```text
Feature
Requirement
Acceptance Criteria
Implementation Task
Dependency
Validation
Progress
```

예를 들어 Atlas에서는 단순히 `이메일 로그인`으로 보이지만 Linear에서는 다음과 같은 실제 개발 업무가 된다.

```text
이메일 형식 검증
비밀번호 필수 검증
/auth/login 연동
401 실패 처리
Session 처리
Acceptance Criteria
Test Scenario
```

### GitHub — Implementation Truth

GitHub는 실제 구현과 변경의 원본을 소유한다.

```text
Code
Commit
Pull Request
Test
Check
Review
```

Linear의 업무가 실제 어떤 코드 변경으로 이어졌는지 연결한다.

### Obsidian — Decision Truth

Obsidian은 장기적으로 다시 참고해야 하는 **결정과 그 이유**를 소유한다. 모든 대화와 실행 로그를 옮겨 적는 공간은 아니다.

```text
무엇을 결정했는가
왜 그렇게 결정했는가
어떤 대안을 검토했는가
어떤 업무와 변경에 영향을 주었는가
```

나중에 다시 판단 근거로 사용해야 하는 내용만 남긴다.

## Work Chain

WWW의 Work Chain은 단순한 도구 사용 순서를 의미하지 않는다.

**같은 업무가 여러 원본과 Projection에서 동일한 업무로 식별될 수 있도록 관계를 유지하는 것**이다.

```text
Design Truth          Work Truth          Implementation Truth
   Figma   ───────────   Linear   ───────────   GitHub
      ╲                    │
       ╲                   │
        └──── Atlas ───────┘
              PM View

Decision Truth ─────────────────────────── Obsidian
```

예를 들어 하나의 로그인 기능은 다음 관계를 가질 수 있다.

```text
Figma Screen
    │
    ├── Feature: Login
    │       │
    │       ├── Linear Issue
    │       │       │
    │       │       └── GitHub PR
    │       │
    │       └── Obsidian Decision
    │
    └── Atlas Projection
```

각 도구는 자신의 Truth를 계속 소유한다. WWW는 그 위에서 다음을 관리한다.

```text
Work Identity
Relationship
Handoff
Progress
Approval
Evidence
```

## Handoff Contract

WWW가 가장 강하게 통제하는 것은 각 도구 안의 작성 방식이 아니라 **역할 사이의 경계**다.

각 역할은 자신의 도구에서 자유롭게 일할 수 있다. 하지만 다음 역할로 업무를 넘기기 위해서는 필요한 정보가 충족되어야 한다.

### Design → Product

디자인이 프로젝트 기능으로 연결될 때 확인한다.

```text
원본 화면이 연결되어 있는가
주요 기능이 식별되어 있는가
화면과 기능의 관계가 명확한가
필요한 상태와 예외가 정의되어 있는가
```

### Product → Development

기능이 실제 개발 업무로 넘어갈 때 확인한다.

```text
개발 대상 기능이 명확한가
원본 디자인과 연결되어 있는가
업무의 의도와 범위가 전달됐는가
Acceptance Criteria가 존재하는가
필요한 결정과 의존성이 연결되어 있는가
```

### Development → Implementation / Validation

개발 업무가 실제 구현과 완료로 넘어갈 때 확인한다.

```text
Linear 업무와 코드 변경이 연결되어 있는가
Acceptance Criteria가 검증됐는가
Test / Check가 수행됐는가
필요한 Evidence가 존재하는가
필요한 Review와 Approval이 완료됐는가
```

WWW가 강하게 규제하는 것은 문서의 양이 아니다.

**다음 역할이 이전 역할의 의도를 추측하거나 다시 물어보지 않아도 될 만큼 업무의 의미가 보존되어 있는가**를 검증한다.

## Lifecycle & Standard

WWW는 프로젝트의 업무를 Service Lifecycle로 본다.

```text
기획 → 디자인 → 개발 → 검증 → 배포 → 운영 → 유지보수
```

모든 업무가 모든 Stage를 거칠 필요는 없다. 업무 유형과 프로젝트 규칙에 따라 필요한 Stage를 선택하고, Stage 사이의 Handoff와 완료 조건을 관리한다.

여러 프로젝트에서 반복되는 업무 방식은 버전이 있는 `Standard`로 정의한다.

```text
Standard
├─ Blueprint
├─ Contract
└─ Project Binding
```

- **Standard** — 반복해서 사용하는 업무 규칙
- **Blueprint** — 어떤 Stage와 Handoff를 거치는가
- **Contract** — 무엇을 만족해야 통과하는가
- **Project Binding** — 프로젝트별 환경, 값과 허용 예외
- **Skill** — 특정 작업을 실제로 수행하는 방법

Skill은 실행 방법일 뿐이다. Skill이나 AI가 정상적으로 작업을 끝냈다는 사실만으로 Contract가 충족되거나 업무가 완료되지는 않는다.

## Progress & Evidence

도구가 보고하는 성공과 사용자가 판단하는 업무 완료는 다르다.

```text
Execution succeeded
        ↓
Contract validation
        ↓
Required approval
        ↓
Evidence accepted
        ↓
Work accepted
```

WWW는 **작업 성공과 업무 수락을 분리한다.** 완료 조건은 Contract가 결정하고, 완료 여부는 Evidence로 검증한다.

Evidence는 업무에 따라 다음과 같은 형태가 될 수 있다.

```text
Test result
Command result
Git diff
Commit / PR
Screenshot
Generated artifact
Validator result
Human approval
External system result
```

WWW는 관측하지 않은 결과를 성공으로 추정하지 않는다. 필요한 경우 결과를 `PASS`, `PARTIAL`, `BLOCKED`로 구분한다.

## Workbench

WWW의 TUI는 단순한 AI 채팅창이 아니라 **현재 업무와 실행 상태를 함께 관찰하고 통제하는 Workbench**다.

사용자는 작업 중 최소한 다음 질문에 답할 수 있어야 한다.

```text
지금 무엇을 하고 있는가
왜 하고 있는가
무엇이 막혀 있는가
무엇으로 완료를 증명하는가
다음 행동은 무엇인가
```

현재 Workbench는 같은 Run의 Chat·T-note·Todo를 한 화면에서 보여준다.

```text
┌──────────────────────────────────────────────────────────┐
│ Dashboard · Project · Model · 상태 · 승인 정책           │
├───────────────────────────────────┬──────────────────────┤
│                                   │ T-note               │
│ Chat                              │ 완료된 질문과 결과   │
│ 대화와 공개 가능한 실행 과정     ├──────────────────────┤
│                                   │ Todo                 │
│                                   │ 현재 Run Plan        │
├───────────────────────────────────┴──────────────────────┤
│ Composer · 사용자 입력                                  │
├──────────────────────────────────────────────────────────┤
│ 상태 · Context · 사용량                                 │
└──────────────────────────────────────────────────────────┘
```

Dashboard의 오른쪽 위는 완료된 T-note를 보여준다. 실행 상태를 자세히 볼 때는 같은 위치를 Monitor로 전환해 Trace·Source를 확인한다. 오른쪽 아래 Todo와 왼쪽 Chat은 같은 Workbench 상태를 유지한다.

좁은 화면에서는 Chat·T-note 또는 Monitor·Todo를 한 열로 순서대로 배치하며, 내용과 Source의 의미는 바꾸지 않는다.

### Chat

사용자와 AI가 작업하는 주 화면이다. 일반 대화뿐 아니라 Tool 사용, 승인 요청과 공개 가능한 중간 작업을 함께 보여준다.

### Todo

현재 작업을 위해 만들어진 **Run Plan의 read-only Projection**이다. 별도의 할 일 관리 도구가 아니라 지금 어떤 순서로 작업이 진행되고 있는지 보여준다.

### T-note

긴 대화를 다시 읽지 않고도 중요한 질문과 결론을 확인하기 위한 Projection이다.

```text
Question
Reason
Result
Chat reference
```

### Trace / Source

Monitor에서 선택한 Run에 실제로 무엇이 실행됐는지와 그 출처를 확인한다.

```text
Plan
Agent
Tool
Approval
Result
Source
```

모델의 hidden reasoning이 아니라 **관측 가능한 실행과 Evidence의 출처**를 보여준다.

Workbench에서는 실행에 필요한 제어도 함께 수행한다.

```text
Model / effort 선택
Approval / decline
Run cancel
Thread resume
Source 확인
Usage 확인
```

WWW의 목적은 AI가 `success`를 반환했다는 사실을 보여주는 것이 아니다.

**어떤 업무가 어떤 경로로 실행됐고, 무엇을 근거로 완료됐는지 사용자가 확인할 수 있게 하는 것**이다.

## What WWW Owns

WWW는 각 도구의 원본 데이터를 소유하지 않는다.

**도구 사이를 연결하는 의미와 규칙을 소유한다.**

```text
Lifecycle semantics

Standard
Blueprint
Contract
Project Binding

Work Chain Identity
Handoff Contract

Progress
Approval
Validation
Evidence

Role Projection
Execution Observation
```

WWW의 핵심은 모든 도구를 하나로 합치는 것이 아니다.

**각 역할은 자신에게 맞는 도구에서 일하고, WWW는 그 업무가 다음 역할로 넘어갈 때 의도·관계·완료 조건이 끊어지지 않도록 연결과 규칙을 유지한다.**

## What WWW Is Not

- 특정 Coding Agent를 대체하기 위한 또 하나의 범용 Coding Agent
- 여러 AI·Model·Provider를 묶어 제공하는 배포판
- Figma·Linear·GitHub·Obsidian의 원본을 복제하는 중앙 데이터베이스
- Atlas를 또 하나의 프로젝트 원본 저장소로 만드는 시스템
- 모든 역할에게 동일한 정보를 보여주는 프로젝트 관리 도구
- 모델의 hidden reasoning을 보여주는 관찰 도구
- Tool이나 Agent의 `success`를 그대로 업무 완료로 판단하는 시스템
- Dashboard나 Pane 자체를 목적으로 하는 TUI

## Design Principles

- **WWW owns the lifecycle**: 도구와 실행기가 바뀌어도 Workflow와 완료의 의미를 유지한다.
- **Strong boundaries, loose tools**: 각 역할의 도구 사용은 자유롭게 두되 Handoff는 엄격하게 검증한다.
- **Right depth for each role**: 모든 사람이 모든 정보를 보는 대신 역할에 필요한 깊이까지만 보여준다.
- **Evidence before completion**: 실행 성공과 업무 수락을 분리한다.
- **Observed before inferred**: 관측하지 않은 관계나 결과를 사실처럼 표시하지 않는다.
- **One owner per truth**: 각 시스템의 원본 소유권을 유지하고 reference로 연결한다.
- **Schema-EN / Prose-KO**: 기계가 읽는 identifier와 schema는 영어, 사람을 위한 설명과 화면은 한국어를 사용한다.
- **Human authority**: AI가 실행·제안·검증해도 최종 승인 권한은 사용자에게 있다.

## Documentation

- [제품 방향과 Agent 실행 경계](docs/WWW_PRODUCT_DIRECTION.md)
- [Service Lifecycle의 기존 Control Plane 설계](docs/WWW_CONTROL_PLANE_PLANNING_PROPOSAL.md)
- [오픈소스 제품과 WWW의 경계](docs/OSS_POSITIONING.md)
- [Agent TUI 비교](docs/TUI_COMPARISON.md)
- [기능별 TUI 코드 구성표](docs/TUI_CODE_MATRIX.md)
- [README 구조 조사](docs/README_STRUCTURE_RESEARCH.md)
- [릴리스 절차](docs/RELEASE_V010.md)

세부 Architecture, 설치·개발·검증 절차와 구현 계획은 README에서 반복하지 않고 각 문서를 정본으로 사용한다.

## License

현재 공개 배포용 라이선스는 정해져 있지 않으며 npm package도 private이다.

라이선스와 외부 배포 정책이 확정되기 전까지 공개 사용·수정·재배포 권한을 가정하지 않는다.

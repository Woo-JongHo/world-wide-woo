# World Wide Woo

> **Different tools. One project. No broken handoffs.**

> **프로젝트와 도구가 바뀌어도 업무 방식은 유지되는 Service Lifecycle Orchestration Harness.**

**World Wide Woo(WWW)**는 Figma, Atlas, Linear, GitHub, Obsidian처럼 서로 다른 도구에서
이루어지는 하나의 프로젝트를 **검증 가능한 Work Chain으로 연결하는 개인화 Service
Lifecycle Orchestration Harness**다.

각 역할은 자신에게 맞는 도구에서 필요한 깊이까지만 일한다. WWW는 도구를 하나로 합치거나
원본을 복제하지 않는다. 대신 업무가 역할과 도구의 경계를 넘을 때 **무엇이 전달되어야
하고, 무엇을 만족해야 다음 단계로 갈 수 있는지 Contract로 통제한다.**

WWW가 지키는 것은 특정 AI나 도구가 아니라 사용자의 업무 방식이다. 프로젝트 환경이나
실행기가 달라져도 **Workflow·Contract·Progress·Approval·Evidence**의 의미를 유지한다.

> **현재 상태:** WWW는 개발 중이며, 현재 제품은 프로젝트별 업무를 다루는 초기
> Workbench다. 이 README는 WWW가 지향하는 제품의 역할과 핵심 계약을 설명한다.

## Why WWW

서비스 개발은 하나의 도구 안에서 이루어지지 않는다.

```text
Designer        PM             Developer          Code
  Figma  ───▶  Atlas  ───▶      Linear    ───▶   GitHub
                 │
                 │
              Project View

Long-term Decision ─────────────────────▶ Obsidian
```

디자이너는 Figma에서 화면과 사용자 경험을 만든다.

PM은 Atlas에서 Figma의 화면을 그대로 보면서 **어떤 기능이 존재하고, 기능들이 어떻게
연결되어 있으며, 현재 어디까지 진행됐는지** 확인한다.

개발자는 Linear에서 기능의 세부 요구사항, 실행 항목, Acceptance Criteria와 진행 상태를
확인하고 구현한다.

실제 코드와 PR, Check는 GitHub에 남고, 장기적으로 보존해야 하는 중요한 결정과 그 이유는
Obsidian에 기록한다.

문제는 각 도구 자체가 아니라 **도구와 역할 사이의 경계**다.

```text
Figma
  │ 화면의 어떤 기능이 개발 대상인가?
  ▼
Atlas
  │ 이 기능을 개발하려면 무엇을 해야 하는가?
  ▼
Linear
  │ 실제로 무엇이 변경됐고 검증됐는가?
  ▼
GitHub
```

역할이 바뀌는 순간 업무의 의도, 원본과의 관계, 결정, 완료 조건과 검증 근거가 쉽게 끊어진다.
WWW는 이 연결고리를 Work Chain으로 유지하고, 각 경계를 **Handoff Contract**로 검증한다.

## Role Boundaries

WWW는 모든 역할에게 모든 정보를 보여주지 않는다. 각 역할은 자신의 판단에 필요한
깊이까지만 본다.

```text
Figma   화면 / UX / 디자인 원본
  ↓
Atlas   화면 + 기능 + 관계 + 프로젝트 상태
  ↓
Linear  기능 상세 + 실행 항목 + Acceptance Criteria
  ↓
GitHub  실제 구현 + PR + Test + Check
```

### Figma

디자인의 원본이다. 화면, Component, Flow와 사용자 경험을 소유한다.

### Atlas

PM과 프로젝트 전체를 보기 위한 **View / Projection**이다. 새로운 원본을 만들기보다 Figma와
개발 업무의 관계를 보여준다.

```text
로그인

[Figma Preview]

기능
├─ 이메일 로그인
├─ 로그인 실패 처리
├─ 비밀번호 찾기
└─ 자동 로그인

Progress       3 / 4
Development    LIN-128 ~ LIN-134
```

Atlas는 개발 세부사항을 모두 담지 않는다. **화면에 어떤 기능이 있고, 그 기능이 어떤 개발
업무와 연결되어 있으며, 현재 상태가 무엇인지** 보여주는 것이 핵심이다.

### Linear

개발자가 실제 업무를 수행하는 실행 영역이다. Requirement, Acceptance Criteria,
Implementation Task, Dependency, Progress와 Validation을 관리한다. Atlas가 `무엇이 있는가`와
`어디까지 됐는가`를 보여준다면, Linear는 **그 기능을 실제로 어떻게 완성할 것인가**를 다룬다.

### GitHub

실제 코드와 변경의 원본이다. Commit, PR, Test, Check와 구현 결과를 소유한다.

### Obsidian

장기적으로 다시 참고해야 하는 **결정과 그 이유**를 보존한다. 실행 중 발생한 모든 기록이
아니라, 이후에도 프로젝트의 판단 근거로 사용할 내용을 남긴다.

## Work Chain

WWW는 여러 도구의 원본을 하나의 중앙 데이터베이스로 복제하지 않는다. 각 역할과 도구가
자신의 Truth를 소유한 상태에서 하나의 업무와 그 전달 경계를 `Logical Work Chain ID`로
연결한다.

```text
Figma Screen → Atlas Feature → Linear Issue → GitHub PR
                    │
                    └──────────────▶ Obsidian Decision
```

각 도구는 자신의 원본을 계속 소유한다. WWW는 그 위에서 Identity, Relationship, Handoff,
Progress, Approval과 Evidence를 관리한다.

## Handoff Contract

WWW가 가장 강하게 통제하는 것은 각 도구 안의 작성 방식이 아니라 **다음 역할로 넘어가는
경계**다.

```text
Figma → Atlas
화면 원본이 연결되어 있는가
주요 기능이 식별되어 있는가
각 기능의 Identity가 유지되는가

Atlas → Linear
개발해야 할 기능이 명확한가
원본 화면과 기능의 의도·범위가 전달됐는가
Acceptance Criteria가 존재하는가

Linear → GitHub
Issue와 실제 변경이 연결되어 있는가
Acceptance Criteria가 검증됐는가
Test / Check Evidence가 존재하는가
```

WWW가 강하게 규제하는 것은 정보의 양이 아니다. **다음 역할이 추측이나 복사·붙여넣기에
의존하지 않아도 될 만큼 업무의 의미가 보존되었는가**를 검증한다.

## Workflow

WWW는 하나의 요청을 필요한 Service Lifecycle Stage로 연결한다.

```text
기획 → 디자인 → 개발 → 검증 → 배포 → 운영 → 유지보수
```

모든 업무가 모든 Stage를 거칠 필요는 없다. 업무 유형과 프로젝트 규칙에 따라 필요한
Stage를 선택하고, 각 Stage의 완료 조건과 다음 Handoff를 관리한다.

```text
"로그인 기능을 만들어줘"
  ↓
Design: Figma 화면과 사용자 흐름
  ↓
Project View: Atlas 기능 정의와 관계
  ↓
Development: Linear 실행 항목
  ↓
Implementation: GitHub Code / PR / Test
  ↓
Validation / Approval / Evidence
  ↓
Accepted
```

AI는 각 Stage의 작업을 수행하거나 Workflow를 제안할 수 있지만, **무엇을 만족해야 다음
단계로 이동할 수 있는지는 WWW의 Contract가 결정한다.**

## Standard and Contract

프로젝트마다 같은 업무 방식을 다시 설명하지 않도록 반복 가능한 규칙을 Standard로 정의한다.

```text
Standard
├─ Blueprint
├─ Contract
└─ Project Binding
```

- **Blueprint** — 어떤 Stage와 Handoff를 사용하는가
- **Contract** — 무엇을 만족해야 통과할 수 있는가
- **Project Binding** — 프로젝트별 환경, 값과 허용 예외
- **Skill** — 특정 작업을 실제로 수행하는 방법

Skill이 성공했다고 해서 업무가 자동으로 완료되는 것은 아니다. 실행 결과는 Contract와
Evidence를 통해 별도로 검증한다.

## Progress and Evidence

도구가 보고하는 성공과 사용자가 판단하는 업무 완료는 다르다.

```text
작업 결과
   ↓
Contract validation
   ↓
Required approval
   ↓
Evidence accepted
   ↓
Work accepted
```

WWW는 **작업 성공과 업무 수락을 분리한다.** Evidence는 작업에 따라 다음과 같은 형태가
될 수 있다.

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

WWW는 관측하지 않은 결과를 성공으로 추정하지 않는다.

## Observable Work

WWW의 Workbench는 AI의 최종 답변만 보여주는 화면이 아니다. 사용자는 지금 무엇을 하고
있는지, 왜 하는지, 무엇이 막혔는지, 무엇으로 완료를 증명하는지와 다음 행동을 확인할 수
있어야 한다.

현재 초기 Workbench의 TUI는 다음 책임으로 나뉜다.

```text
┌──────────────────────────────────────────────────────────┐
│ Project · Model · 상태 · 승인 정책                      │ Header
├───────────────────────────────────┬──────────────────────┤
│                                   │ T-note / Trace       │
│ Chat                              │ 질문 결과와 실행 근거│
│ 대화와 공개 가능한 중간 작업     ├──────────────────────┤
│                                   │ Todo                 │
│                                   │ 현재 Run Plan        │
├───────────────────────────────────┴──────────────────────┤
│ Composer · 사용자 입력                                  │
├──────────────────────────────────────────────────────────┤
│ Context · 사용량 · 작업 상태                            │ Status
└──────────────────────────────────────────────────────────┘
```

```text
Chat    사용자와 AI의 대화 및 공개 가능한 중간 작업
Todo    현재 Run Plan
T-note  완료된 질문과 결과
Trace   Plan·Agent·Tool·Approval·Result·Source
```

이 배치는 고정된 최종 Dashboard가 아니다. 현재는 개발자가 하나의 Run을 관측하는
Workbench이고, 장기적으로는 같은 Work Chain을 역할별 깊이에 맞게 보여주는 Role
Projection으로 확장한다. WWW는 모델의 hidden reasoning을 노출하지 않고 관측 가능한
활동과 Evidence만 다룬다.

## What WWW Owns

```text
Service Lifecycle

Workflow
Standard / Blueprint / Contract
Project Binding

Work Chain Identity
Handoff Contract

Progress
Approval
Validation
Evidence

Role Projection
Observable Work
```

WWW의 핵심은 모든 도구를 하나로 합치는 것이 아니다. **각 역할은 자신에게 맞는 도구에서
일하고, WWW는 그 업무가 다음 역할로 넘어갈 때 의미와 완료 조건이 끊어지지 않도록 연결과
규칙을 소유한다.**

## What WWW Is Not

- 특정 Coding Agent를 대체하는 또 하나의 범용 Coding Agent
- 여러 AI·Model·Provider를 묶어 제공하는 배포판
- Figma·Linear·GitHub·Obsidian의 원본을 복제하는 중앙 데이터베이스
- 모든 역할에게 동일한 정보를 보여주는 프로젝트 관리 도구
- 모델의 hidden reasoning을 보여주는 관찰 도구
- Tool이나 Agent의 `success`를 그대로 업무 완료로 판단하는 시스템
- Dashboard나 Pane 자체를 목적으로 하는 TUI

## Design Principles

- **WWW owns the lifecycle**: 도구와 실행기가 바뀌어도 Workflow와 완료의 의미를 유지한다.
- **Strong boundaries, loose tools**: 각 도구의 사용 자유는 유지하되 역할 사이의 Handoff는 엄격하게 검증한다.
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

세부 Architecture, 설치·개발·검증 절차와 구현 계획은 README에서 반복하지 않고 각 문서를
정본으로 사용한다.

## License

현재 공개 배포용 라이선스는 정해져 있지 않으며 npm package도 private이다. 라이선스와 외부
배포 정책이 확정되기 전까지 공개 사용·수정·재배포 권한을 가정하지 않는다.

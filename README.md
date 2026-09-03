# World Wide Woo

> **Different tools. One project. No broken handoffs.**

> **프로젝트와 도구가 바뀌어도 업무 방식은 유지되는 Service Lifecycle Orchestration Harness.**

**World Wide Woo(WWW)**는 기획·디자인·개발·검증·배포·운영·유지보수를 여러 AI와 도구에
배분하고, 사용자가 정의한 **업무 규칙·승인·Evidence** 아래 일관되게 관리하는 개인화
Service Lifecycle Orchestration Harness다.

WWW가 지키는 것은 특정 모델이나 도구가 아니라 사용자의 업무 방식이다. 프로젝트 환경이
달라져도 **Workflow·Contract·Progress·Approval·Evidence**의 의미를 유지한다.

> **현재 상태:** WWW는 개발 중이다. 현재 제품은 프로젝트별 업무를 다루는 초기
> Workbench이며, 이 문서는 완성하려는 제품의 목적과 계약을 설명한다.

## Why WWW

서비스를 만들고 운영하는 사람은 역할에 따라 편한 도구도, 확인해야 할 내용도 다르다.

| 역할 | 주로 다루는 원본 | 필요한 관점 |
|---|---|---|
| PM·기획 | 요구사항·일정·의사결정 | 범위·우선순위·의존성·위험·수락 상태 |
| 디자인 | 디자인 원본·상태·승인 | 사용자 흐름·화면 상태·결정·개발 연결 |
| 개발 | 구조·코드·테스트·변경 이력 | 지금 하는 일·이유·결과·막힘·검증 근거 |
| 검증·운영 | 재현·검증·배포·운영 기록 | 완료 조건·회귀·릴리스·장애 Evidence |

Figma·Atlas·Linear·GitHub·Obsidian 같은 도구는 각 역할의 원본을 잘 다룬다. 문제는
역할과 도구의 경계를 사람이 매번 연결하면서 의도, 결정, 상태와 완료 기준이 누락되거나
다르게 해석된다는 점이다.

- 프로젝트마다 같은 업무 규칙을 다시 설명해야 한다.
- 역할마다 다른 화면과 용어를 보면서도 같은 업무를 보고 있는지 확인하기 어렵다.
- 기획에서 디자인, 디자인에서 개발로 넘어갈 때 전달 내용과 원본의 관계가 깨진다.
- 작업이 성공했다고 보고돼도 실제 완료 조건을 만족했는지는 별도로 확인해야 한다.
- 모델·Skill·Context·effort 변경이 품질과 비용에 미치는 영향을 비교하기 어렵다.
- 담당 도구가 바뀌면 계획과 작업 맥락도 함께 끊어진다.
- 기획부터 유지보수까지 같은 기준으로 이어지는 기록이 부족하다.

WWW는 도구별 기능을 한곳에 복제하지 않는다. 각 역할과 도구가 자기 원본을 소유하게
두면서, 경계를 넘을 때 보존해야 할 내용은 Handoff Contract로 검증하고 같은 업무는
Work Chain으로 연결한다. 사용자는 역할에 맞는 화면에서 필요한 판단과 근거를 본다.

```text
바뀔 수 있는 것                 WWW가 유지하는 것

AI / Model                       Standard / Contract
Subscription                     Work Chain Identity
Client / Tool                    Progress Model
Project Environment              Approval / Evidence
                                 Operations View
```

## Product Model

WWW는 사용자의 짧은 요청을 서비스 생애주기의 업무로 연결한다.

```text
사용자 의도
   ↓
업무 유형과 필요한 Stage 결정
   ↓
Standard·Blueprint·Project Binding 적용
   ↓
역할과 도구 배분
   ↓
역할별 View와 Handoff Contract 적용
   ↓
진행 상태와 관계 관측
   ↓
Contract 검증·Approval·Evidence
   ↓
업무 수락과 다음 Stage
```

예를 들어 `로그인 기능을 만들어줘`라는 요청은 코드 변경 하나로 끝나지 않는다.

```text
요구사항
  → 사용자 경험과 보안 설계
  → 개발
  → 검증과 독립 검토
  → 사용자 수락
  → 배포
  → 운영과 유지보수
```

각 Stage는 서로 다른 AI와 도구가 담당할 수 있다. 그러나 Stage의 목적, 필요한 입력,
완료 조건과 결과의 의미는 WWW가 일관되게 관리한다.

## Core Concepts

### Service Lifecycle

WWW가 관리하는 최상위 업무 범위다.

```text
기획 → 디자인 → 개발 → 검증 → 배포 → 운영 → 유지보수
```

모든 업무가 모든 Stage를 거치는 것은 아니다. 프로젝트와 업무 유형에 필요한 Stage를
선택하고, 생략하거나 되돌아간 이유도 Workflow 상태의 일부로 다룬다.

### Standard

여러 프로젝트에서 반복해서 사용하는 업무 방식을 버전이 있는 Standard로 정의한다.

```text
Standard
├─ Blueprint       어떤 Stage를 어떤 순서로 수행하는가
├─ Contract        무엇을 만족해야 완료로 인정하는가
└─ Project Binding 프로젝트별 값·환경·허용 예외
```

Skill은 특정 Stage를 수행하는 방법이다. Skill이 정상적으로 끝났다는 사실만으로 Standard가
적용되거나 Contract가 충족된 것은 아니다.

### Workflow

Workflow는 업무를 완료하기 위해 Stage를 선택하고 연결하는 상위 흐름이다.

```text
Stage 선택
  → 역할과 도구 배정
  → 결과 확인
  → Contract 검증
  → 통과 / 재작업 / 기준 보강 / 사용자 승인 / 중단
  → 다음 Stage
```

AI는 Workflow 후보를 제안할 수 있지만, 실제 Workflow는 적용 가능한 Blueprint와 Project
Binding을 기준으로 확정한다.

### Work Chain

WWW는 여러 도구의 원본을 하나의 중앙 데이터베이스로 복제하지 않는다. 각 역할과 도구가
자신의 Truth를 소유한 상태에서 하나의 업무와 그 전달 경계를 `Logical Work Chain ID`로
연결한다.

```text
Product: Figma → Atlas → Linear → GitHub → Obsidian
RPA:              Atlas → Linear → GitHub → Obsidian
```

| Tool | Ownership |
|---|---|
| Figma | 디자인 원본 |
| Atlas | 개발 구조와 정의 |
| Linear | 실행 항목과 진행 상태 |
| GitHub | 코드·Commit·PR·Check |
| Obsidian | 장기 의사결정과 재사용 지식 |

WWW는 원본을 대체하지 않고 참조, 관계와 Lifecycle 상태를 관리한다.

### Role View와 Handoff Contract

하나의 프로젝트라도 역할마다 필요한 화면은 달라야 한다. WWW의 Role View는 동일한 Work
Chain을 PM·디자인·개발·검증의 책임에 맞게 보여준다. 역할별로 별도 상태를 만드는 것이
아니라, 같은 업무에서 지금 판단해야 할 내용과 원본, 승인과 Evidence를 다르게 투영한다.

Handoff Contract는 역할이나 도구가 바뀔 때 다음 내용이 끊기지 않았는지 확인한다.

```text
업무 의도와 범위
원본 Artifact와 변경 관계
결정과 그 이유
현재 상태와 다음 책임
Acceptance Criteria
필요한 승인과 Evidence
```

WWW가 기획·디자인·개발을 강하게 결합한다는 것은 모두를 하나의 도구에 가두는 뜻이 아니다.
각자 편한 도구를 사용하되 다음 역할이 추측이나 복사·붙여넣기에 의존하지 않도록 업무의
의미와 완료 조건을 보존한다는 뜻이다.

### Progress Model

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

WWW는 **작업 성공과 업무 수락을 분리한다.** 사용자는 자신의 기준에서 무엇을 시작, 진행,
대기, 위험과 완료로 판단할지 Progress Model로 정의한다.

### Approval

사용자 판단이나 외부 변경이 필요한 경계에서는 결정의 대상과 영향을 먼저 보여준다.
승인은 특정 작업, 입력과 대상에 결속되며 대상이나 범위가 바뀌면 다시 확인한다.

### Evidence

완료는 주장보다 Evidence를 우선한다.

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

어떤 Evidence가 필요한지는 Stage의 Contract가 결정한다. WWW는 관측하지 않은 결과를 성공으로
추정하지 않으며 `PASS`, `PARTIAL`, `BLOCKED`를 구분한다.

## Observable Work

개발자에게 WWW의 화면은 AI의 최종 답변만 보여주는 곳이 아니다. 지금 무엇을 하고 있고,
정해진 규칙대로 제대로 수행하고 있는지를 확인하는 작업 창이다. 사용자는 다음 질문에
답할 수 있어야 한다.

- 지금 무엇을 하고 있으며 왜 하는가?
- 어떤 Plan 항목이 진행 중인가?
- 어떤 AI와 도구가 참여했는가?
- 어떤 승인이나 사용자 개입이 있었는가?
- 무엇이 실패하거나 막혔는가?
- 다음 행동은 무엇인가?
- 완료를 뒷받침하는 Evidence가 존재하는가?
- 이전 작업보다 Token·시간·재시도·품질이 개선됐는가?

화면은 책임에 따라 분리한다.

```text
Chat    사용자와 AI의 대화 및 공개 가능한 중간 작업
Todo    현재 Run Plan의 read-only Projection
T-note  완료된 질문의 질문·이유·결과와 Chat reference
Trace   Plan·Agent·Tool·Approval·Result·Source
```

WWW는 모델의 hidden reasoning을 노출하지 않는다. 관측 가능한 활동과 Evidence만 다룬다.

## What WWW Owns

```text
Service Lifecycle
Workflow
Standard / Blueprint / Contract
Project Binding
Progress Model
Approval / Validation / Evidence
Work Chain Identity
Role View / Handoff Contract
Work Projection
```

WWW의 핵심은 AI가 일을 하게 만드는 것만이 아니다. **한 프로젝트의 기획·디자인·개발을
검증 가능한 업무 관계로 결합하고, 역할마다 필요한 화면과 내용을 제공하며, 무엇을
만족해야 완료인지 일관되게 관리하는 것**이다.

## What WWW Is Not

- 특정 Coding Agent를 대체하기 위한 또 하나의 범용 Coding Agent
- 여러 AI·Model·Provider를 묶어서 제공하는 배포판
- Figma·Linear·GitHub·Obsidian의 원본을 복제하는 중앙 데이터베이스
- 모델의 hidden reasoning을 보여주는 관찰 도구
- 도구의 `success`를 그대로 업무 완료로 판단하는 시스템
- 많은 Pane이나 Dashboard 자체를 목적으로 하는 TUI

## Design Principles

- **WWW owns the lifecycle**: 도구가 바뀌어도 Workflow·Progress·Approval·Evidence의 의미를 유지한다.
- **Evidence before completion**: 작업 성공과 업무 수락을 분리한다.
- **Observed before inferred**: 관측하지 않은 관계나 결과를 사실처럼 표시하지 않는다.
- **One owner per truth**: 각 시스템의 원본 소유권을 유지하고 reference로 연결한다.
- **Schema-EN / Prose-KO**: 기계가 읽는 identifier와 schema는 영어, 사람을 위한 설명과 화면은 한국어를 사용한다.
- **Human authority**: AI가 제안하고 검증해도 최종 승인 권한은 사용자에게 있다.

## Documentation

- [제품 방향과 Agent 실행 경계](docs/WWW_PRODUCT_DIRECTION.md)
- [Service Lifecycle의 기존 Control Plane 설계](docs/WWW_CONTROL_PLANE_PLANNING_PROPOSAL.md)
- [오픈소스 제품과 WWW의 경계](docs/OSS_POSITIONING.md)
- [Agent TUI 비교](docs/TUI_COMPARISON.md)
- [기능별 TUI 코드 구성표](docs/TUI_CODE_MATRIX.md)
- [README 구조 조사](docs/README_STRUCTURE_RESEARCH.md)
- [릴리스 절차](docs/RELEASE_V010.md)

내부 구조와 개발·설치·검증 절차는 README에서 반복하지 않고 해당 문서와 프로젝트 명령을
정본으로 사용한다.

## License

현재 공개 배포용 라이선스는 정해져 있지 않으며 npm package도 private이다. 라이선스와 외부
배포 정책이 확정되기 전까지 공개 사용·수정·재배포 권한을 가정하지 않는다.

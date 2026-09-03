# World Wide Woo

> **Different tools. One project. No broken handoffs.**

> **프로젝트와 도구가 바뀌어도 업무 방식은 유지되는 Service Lifecycle Orchestration Harness.**

**World Wide Woo(WWW)**는 AI와 도구가 지금 무엇을 하고 있는지 보여주고, 사용자의 업무 규칙에 맞게 제대로 수행했는지 확인·통제하는 개인화 Workbench다.

WWW는 하나의 Workflow를 모든 업무에 강요하지 않는다. Product, RPA처럼 성격이 다른 업무에는 서로 다른 `Workflow Profile`을 적용하되, **Work Chain·Contract·Progress·Approval·Evidence**라는 공통 원칙으로 연결과 완료를 관리한다.

> **현재 상태:** WWW는 개발 중이며, 현재 제품은 프로젝트별 AI 작업을 관측하고 통제하는 초기 Workbench다. Workflow Profile과 전체 Service Lifecycle 연결은 장기 제품 방향이다.

## Why WWW

AI에게 일을 맡기면 최종 답변만으로는 작업을 믿기 어렵다.

```text
지금 무엇을 하고 있는가?
왜 이 명령과 도구를 사용하는가?
어느 단계까지 진행됐는가?
무엇이 실패하거나 막혔는가?
결과가 내 업무 규칙을 만족하는가?
무엇으로 완료를 증명하는가?
```

대화, 명령, Tool 결과와 승인이 서로 떨어져 보이면 사용자는 작업 과정을 추적할 수 없다. 실행기가 `success`를 반환해도 실제 요구사항과 완료 조건을 충족했는지는 별개의 문제다.

WWW는 실행 과정을 읽을 수 있는 작업 단위로 보여주고, 사용자의 Contract와 Evidence를 기준으로 **실행 성공과 업무 수락을 분리한다.**

## Workbench

WWW의 TUI는 단순한 AI 채팅창이 아니다. 현재 업무와 실행 상태를 함께 관찰하고 필요한 결정을 내리는 Workbench다.

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

- **Chat** — 대화, Tool 사용, 승인 요청과 공개 가능한 중간 작업
- **Todo** — 현재 Run Plan의 읽기 전용 Projection
- **T-note** — 완료된 질문의 Question·Reason·Result와 Chat reference
- **Trace / Source** — Monitor에서 확인하는 Plan·Agent·Tool·Approval·Result와 출처
- **Session Stats** — `/stats`에서 확인하는 목적·행동·결과, 속도·사용량·실패·복구의 읽기 전용 Projection

Dashboard의 오른쪽 위는 T-note를 보여준다. 실행 상태를 자세히 볼 때는 같은 위치를 Monitor로 전환해 Trace·Source를 확인한다. 좁은 화면에서는 같은 내용을 한 열로 배치한다.

WWW는 모델의 hidden reasoning을 노출하지 않는다. 사용자가 확인할 수 있는 활동과 Evidence만 다룬다.

## Workflow Philosophy

WWW의 Workflow는 고정된 도구 순서가 아니라, 업무 유형에 필요한 Stage와 Handoff를 선택하고 각 경계의 완료 조건을 검증하는 방식이다.

```text
요청
  ↓
Workflow Profile 선택
  ↓
Stage와 역할 배정
  ↓
Handoff Contract 검증
  ↓
Approval과 Evidence
  ↓
Work accepted
```

공통 구조는 다음과 같다.

```text
Standard
├─ Blueprint        어떤 Stage와 Handoff를 거치는가
├─ Contract         무엇을 만족해야 통과하는가
└─ Project Binding  프로젝트별 환경·값·허용 예외
```

Skill과 AI는 작업을 수행하는 방법이다. 작업이 정상적으로 끝났다는 주장만으로 Contract가 충족되거나 업무가 완료되지는 않는다.

### Workflow Profiles

| Profile | 출발점 | 중심 계약 | 상세 |
|---|---|---|---|
| Product | 사용자 문제·제품 요구 | 디자인·기능·구현·검증 사이의 Handoff | [Product Workflow](docs/workflows/PRODUCT_WORKFLOW.md) |
| RPA | 업무 프로세스·자동화 요구 | 입력·출력·예외·재실행·운영 안전성 | [RPA Workflow](docs/workflows/RPA_WORKFLOW.md) |

두 Profile은 별도 제품이 아니다. 동일한 WWW Workbench와 Lifecycle 계약 위에서 서로 다른 Blueprint와 Contract를 사용한다.

## Shared Contracts

업무 유형이 달라도 WWW가 유지하는 의미는 같다.

```text
Work Chain Identity
Handoff Contract
Progress
Approval
Validation
Evidence
Role Projection
Execution Observation
```

- 각 도구와 역할은 자신의 원본을 계속 소유한다.
- WWW는 원본을 복제하지 않고 관계와 Handoff를 연결한다.
- 역할마다 판단에 필요한 깊이만 Projection한다.
- 관측하지 않은 결과를 성공으로 추정하지 않는다.
- 완료 결과는 `PASS`, `PARTIAL`, `BLOCKED`를 구분한다.

## What WWW Is Not

- 특정 Coding Agent를 대체하는 범용 Coding Agent
- 여러 AI·Model·Provider를 묶어 제공하는 배포판
- 외부 도구의 원본을 복제하는 중앙 데이터베이스
- 모든 업무에 하나의 Workflow를 강요하는 시스템
- 모든 역할에게 동일한 정보를 보여주는 프로젝트 관리 도구
- 모델의 hidden reasoning을 보여주는 관찰 도구
- Tool이나 Agent의 `success`를 그대로 업무 완료로 판단하는 시스템
- Dashboard나 Pane 자체를 목적으로 하는 TUI

## Design Principles

- **WWW owns the lifecycle**: 도구와 실행기가 바뀌어도 Workflow와 완료의 의미를 유지한다.
- **Observable work**: 무엇을 왜 하고 있으며 어떤 결과가 나왔는지 연결해 보여준다.
- **Profiles over one workflow**: 업무 유형별 Workflow는 나누고 공통 Lifecycle 계약은 유지한다.
- **Strong boundaries, loose tools**: 각 역할의 도구 사용은 자유롭게 두되 Handoff는 엄격하게 검증한다.
- **Right depth for each role**: 역할의 판단에 필요한 깊이까지만 보여준다.
- **Evidence before completion**: 실행 성공과 업무 수락을 분리한다.
- **One owner per truth**: 각 시스템의 원본 소유권을 유지하고 reference로 연결한다.
- **Human authority**: AI가 실행·제안·검증해도 최종 승인 권한은 사용자에게 있다.

## Documentation

- [전체 개발 현황 Map](.www/Development-Map.md)
- [Product Workflow](docs/workflows/PRODUCT_WORKFLOW.md)
- [RPA Workflow](docs/workflows/RPA_WORKFLOW.md)
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

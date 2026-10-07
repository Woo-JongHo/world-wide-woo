# World Wide Woo Linear Project Handoff

- 작성일: 2026-09-04
- 목적: 다른 세션에서 Linear Project와 첫 Milestone을 생성하기 위한 결정 사항 전달
- 범위: Project와 Milestone 생성까지. Issue·Sub-issue·Cycle·Label 상세 등록은 후속 작업

## 1. 제품을 이해하는 기준

World Wide Woo는 다음 세 요소로 이해한다.

```text
TUI
  └── System
       └── Specialized Workflow
```

실행 관점에서는 TUI 안에서 공통 System이 동작하고 그 위에서 업무별 Workflow가 수행된다. 정책 소유권 관점에서는 Workflow가 해야 할 일을 결정하고 System은 실행·기록·통제 수단을 제공한다.

### TUI

사용자가 WWW를 이용하는 터미널 작업 공간이다.

- 요청 입력
- 진행 관측
- 승인과 통제
- Stats·Dashboard·Monitor
- Todo·T-note·Review
- Evidence와 결과 확인
- Session 종료와 재개

### System

모든 Workflow에 공통인 실행·Identity·관측·통제 기반이다.

- Feature·Work·Run·Evidence Identity
- Session·Run·Activity·Journal
- Codex·Pi 등 Executor
- Approval·Review·Evidence
- 외부 도구 연결
- Thin Control Ledger

### Specialized Workflow

System 위에서 특정 업무를 시작부터 Acceptance까지 수행하는 강력한 규칙이다.

- WWW TUI 기능 개발 Workflow
- Web Development Workflow
- RPA Development Workflow
- 향후 추가될 업무별 Workflow

Workflow는 단순한 Step Runner가 아니다. 실행기 선택·진행·승인·검증·Evidence·Handoff·Acceptance를 조정하며 `PASS`, `PARTIAL`, `BLOCKED`, `REJECTED`, `UNCERTAIN`을 구분한다.

## 2. 제품 원칙

```text
Different tools.
One project.
No broken handoffs.
```

- 실행 성공과 업무 수락을 구분한다.
- 관측하지 못한 값은 추정하지 않는다.
- Runtime/Executor는 lifecycle 의미와 Acceptance를 소유하지 않는다.
- 판단 근거는 원본 도구에서 확인한다.
- 하나의 사실에는 하나의 canonical owner만 둔다.

## 3. 외부 도구의 정본

| 정보 | Canonical owner |
|---|---|
| 디자인 | Figma |
| 업무 항목과 진행 상태 | Linear |
| 코드·Diff·Commit | Git |
| 구조와 Feature 관계 | Atlas |
| 판단 근거·결정·장기 지식 | Obsidian |
| Identity 연결·규약 이행 상태 | WWW Control Ledger |

WWW DB는 외부 원문을 복제하는 중앙 정본이 아니다. 무엇이 무엇과 연결됐고, 필요한 규약을 확인했는지, stale·missing·conflicted 상태인지 추적하는 얇은 Control Ledger다. 실제 내용은 해당 도구로 이동해 확인한다.

## 4. Identity와 관계

서로의 연결은 대부분 다대다다.

```text
Feature ↔ Work
Feature ↔ External Artifact
Work ↔ External Artifact
Work ↔ Run
Run ↔ Evidence
Feature ↔ Feature
```

ID 역할은 분리한다.

| Identity | 의미 |
|---|---|
| Feature ID | 계속 유지되는 제품 기능 |
| EP/ST 또는 Linear Issue ID | 특정 변경 작업 |
| Run ID | 특정 실행 인스턴스 |
| Evidence ID | 특정 검증 근거 |
| External ID | Figma·Linear·Git·Atlas·Obsidian 원본 |

작업 흐름은 ID를 사후 태그로 붙이는 것이 아니다.

```text
요청
→ 기존 Feature ID 검색 또는 신규 Identity 제안
→ Work 연결
→ 관련 Context 수집
→ 기획
→ 개발
→ Diff 분석
→ 영향 Feature와 관계 조정
→ 관련 도구 업데이트 제안
→ 승인·적용·Read-back
→ Evidence
→ Acceptance
```

## 5. Linear 운영 결정

WWW는 하나의 제품이므로 Linear Project도 하나로 만든다. TUI·System·Workflow를 별도 Project 세 개로 분리하지 않는다. 분리하면 하나의 기능을 위해 여러 Project를 횡단하게 되고 WWW가 해결하려는 handoff 단절을 Linear 안에서 다시 만든다.

### Project

```text
World Wide Woo
```

### Project summary

```text
서로 다른 도구와 실행기 사이에서도 하나의 프로젝트 맥락과 업무 인수인계를 유지하는 Service Lifecycle Orchestration Harness
```

### Project description

```markdown
# World Wide Woo

World Wide Woo는 터미널 작업 공간을 기반으로 공통 실행·관측·통제 System을 구축하고, 그 위에서 특정 업무에 특화된 Workflow를 수행하는 Service Lifecycle Orchestration Harness다.

## 제품 구조

- **TUI**: 사용자가 요청하고 실행을 관측·통제하며 결과와 Evidence를 확인하는 작업 공간
- **System**: Identity, Run, Executor, Activity Journal, Approval, Evidence, Integration을 제공하는 공통 기반
- **Workflow**: TUI 개발, Web 개발, RPA 개발처럼 특정 업무를 시작부터 Acceptance까지 수행하는 강력한 규칙

## 제품 원칙

Different tools. One project. No broken handoffs.

실행 성공과 업무 수락을 구분하고, 관측하지 못한 값은 추정하지 않으며, 판단 근거는 원본 도구에서 확인한다. WWW의 Control Ledger는 외부 원본을 복제하지 않고 Identity·관계·규약 이행 상태를 얇게 추적한다.

## 버전 운영

- `v0.0.n`: 공개 배포 전 개발 버전. 기능 추가·수정마다 증가한다.
- `v0.1.0`: 첫 공개 배포 목표.
- Milestone은 특정 버전에서 완료하고 검증할 제품 약속이다.
- 출시 전 발견된 필수 버그는 현재 Milestone에 포함하고, 출시 후 버그는 Patch Milestone으로 관리한다.
```

## 6. Version과 Milestone

개발 중에는 변경이 발생할 때마다 다음처럼 증가한다.

```text
v0.0.1
v0.0.2
v0.0.3
...
```

`v0.0.n`은 공개 배포 전 개발 Snapshot이다. 각각에 Linear Milestone을 만들지는 않는다.

첫 공개 배포 목표는 다음이다.

```text
v0.1.0
```

따라서 첫 Linear Milestone은 하나만 만든다.

### Milestone

```text
v0.1.0 — First Public Release
```

### Milestone description

```text
한 프로젝트에서 TUI로 작업을 요청하고, 공통 System을 통해 실행을 관측·통제하며, 첫 번째 업무 Workflow를 Evidence와 Acceptance까지 수행할 수 있는 첫 공개 배포.
```

Milestone은 제품이 계속 발전하는 개발축이 아니라 특정 Version에서 닫을 수 있는 약속이다.

```text
Project   = World Wide Woo라는 하나의 제품
Milestone = 특정 Release 목표
Version   = 완료된 Milestone 식별자
Issue     = 실제 구현·수정 단위
Cycle     = 일정 단위
```

## 7. v0.1.0 내부 구조에 대한 후속 결정

Linear는 Milestone 중첩을 사용하지 않는다. `v0.1.0` 아래에 다음 세 결과를 Parent Issue로 만들고, 실제 구현을 Sub-issue로 나누는 방향을 논의했다.

```text
Project: World Wide Woo
└── Milestone: v0.1.0 — First Public Release
    ├── Parent Issue: TUI에서 업무를 수행하고 통제할 수 있다
    ├── Parent Issue: 공통 실행·관측 System이 동작한다
    └── Parent Issue: 첫 번째 업무 Workflow를 끝까지 수행한다
```

중요: 이번 handoff 작업에서는 이 Parent Issue와 Sub-issue를 아직 만들지 않는다. Project와 Milestone까지만 생성하고 실제 `v0.1.0` scope inventory 후 Issue를 확정한다.

세 개발축은 영구 분류지만 Parent Issue 제목은 `TUI`, `System`, `Workflow`처럼 끝나지 않는 명사가 아니라 `v0.1.0`에서 닫을 수 있는 결과 문장으로 작성한다.

## 8. 새 버그와 기능 요청 처리

새 Issue는 발견 즉시 현재 Milestone에 넣지 않는다.

```text
새로운 문제
→ Triage
→ 유효성·영향·현재 Release 차단 여부 판단
```

분류:

```text
현재 v0.1.0 Acceptance를 막음
→ v0.1.0에 포함

유효하지만 현재 Release를 막지 않음
→ Backlog, Milestone 없음

다음 Version에 포함하기로 확정
→ 해당 Milestone에 배정

이미 배포한 계약의 버그
→ v0.1.1 Patch Milestone 후보

새 사용자 Capability
→ v0.2.0 Minor Milestone 후보
```

핵심 원칙:

> Issue는 문제 보관 단위이고 Milestone은 특정 Version에서 해결하겠다는 약속이다.

## 9. Linear 상태와 Health

### Issue status

```text
Triage
Backlog
Planned
In Progress
In Review
Blocked
Done
Canceled
```

### Project health

```text
On track
At risk
Off track
```

`On track`은 Milestone이나 Issue 상태가 아니다. 현재 Release 목표를 계획대로 달성할 가능성에 대한 최신 Project Update다.

현재 정확한 `v0.1.0` scope와 수동 Acceptance가 아직 확정되지 않았으므로 초기 Project Health를 설정해야 한다면 보수적으로 `At risk`가 적절하다. Project 생성 시 Health 입력이 필수가 아니라면 설정하지 않고 첫 scope review 후 Update를 작성한다.

## 10. 다른 세션의 실행 절차

Linear MCP:

```text
name: linear-woo
url: https://mcp.linear.app/mcp
scope: read + write
```

2026-09-04에 `claude mcp login linear-woo` OAuth 인증을 완료했다. 새 세션에서는 먼저 연결 상태를 재확인한다.

실행 순서:

1. Linear Workspace와 Team을 조회한다.
2. 정확히 `World Wide Woo`라는 기존 Project가 있는지 검색한다.
3. 중복이 없으면 Project를 생성한다.
4. 기존 Project가 있으면 관련 없는 내용을 삭제하지 말고 summary/description만 필요한 범위에서 갱신한다.
5. Project 안에 정확히 `v0.1.0 — First Public Release` Milestone이 있는지 검색한다.
6. 중복이 없으면 Milestone을 생성한다.
7. Project와 Milestone을 read-back해 ID·이름·URL·Team을 확인한다.
8. 이번 작업에서는 Issue·Sub-issue·Cycle·Label·Document를 만들지 않는다.

## 11. 생성 결과 Receipt 형식

```text
Workspace:
Team:

Project
- ID:
- Name: World Wide Woo
- URL:
- Action: created | updated | unchanged

Milestone
- ID:
- Name: v0.1.0 — First Public Release
- URL:
- Action: created | updated | unchanged

Unsupported fields:
Verification:
```

## 12. 후속 작업

Project와 Milestone 생성 후 별도 작업으로 진행한다.

1. 현재 구현과 문서를 기준으로 `v0.1.0` scope inventory
2. TUI/System/Workflow 세 Parent Issue의 Acceptance 작성
3. 기존 EP/ST와 Linear Issue 간 중복·연결 정책 확정
4. 기존 완료 구현, 미수락 구현, 신규 구현 분류
5. Parent Issue와 Sub-issue 생성
6. Triage/Backlog 운영 시작
7. Release Notes와 Milestone close 절차 정의

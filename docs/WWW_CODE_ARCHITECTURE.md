# World Wide Woo Code Architecture

- 상태: Opus review 반영 migration 진행 중
- 기준: `Different tools. One project. No broken handoffs.`
- Review: `.www/scratchpad/2026-09-04-capability-architecture-opus-review.md`

## 왜 전면 Feature-first 전환을 하지 않는가

현재 layer-first 구조는 import 방향과 runtime-neutral domain을 지키는 실제 안전장치다. 문제는 layer 자체가 아니라 `ProjectWorkbench`, `work-steps`, `workbench-shell`, `workbench-views`에 책임이 집중되고 한 capability를 찾을 때 layer를 횡단한다는 점이다.

WWW의 Orchestration은 단순 runtime 호출 계층이 아니라 Work Chain·Contract·Progress·Approval·Evidence와 업무 수락을 통제하는 제품 전체다. 따라서 `src/orchestration/`을 step runner 코드로 만들거나 `src/runtimes/`가 lifecycle 의미를 소유하게 하지 않는다. 기존 layer 방향을 유지하면서 각 layer 내부를 제품 언어로 묶는다.

## 핵심 정의

- Capability: 사용자의 한 질문 묶음에 대해 관측, projection, 표현, acceptance evidence까지 책임지는 제품 영역.
- Feature: Capability 안에서 독립 수락 가능한 사용자 가치. 현재 영구 정본은 `EP-###`와 `ST-###-##`다.
- Workflow: Stage 사이 실행기 선택·재시도·승인·검증·완료를 조정해 PASS/PARTIAL/BLOCKED를 판정하는 lifecycle loop.
- Agent Execution Runtime: 모델·Tool loop·session·sandbox를 실행하는 교체 가능한 실행기. 업무 완료나 수락을 결정하지 않는다.

별도 `WWW-F-*`, `feature.yaml`, Workflow/Runtime registry는 현재 만들지 않는다. Planning catalog의 status/acceptance와 legacy ID 연결이 먼저다.

## Dependency 방향

```text
domain
  ↑
application
  ↑
infrastructure / presentation
  ↑
app.ts composition root
```

- domain은 Node, TUI, concrete adapter를 모른다.
- application은 infrastructure와 presentation을 import하지 않는다.
- presentation은 application-owned port와 domain projection만 사용한다.
- infrastructure는 application port를 구현한다.
- app.ts만 concrete implementation을 조립한다.
- ProjectActivity는 runtime-neutral 관측 경계이며 concrete executor 아래로 이동하지 않는다.

## 책임 Inventory와 Migration Map

| Current file | 현재 책임 | 분류 | 목표 위치/조치 | 이유 |
|---|---|---|---|---|
| `domain/workbench.ts` | immutable session UI 계약 | Domain session contract | `domain/session/workbench.ts` 후보 | 여러 capability의 공유 계약 |
| `domain/project-activity.ts` | runtime-neutral journal observation | Domain session contract | `domain/session/project-activity.ts` 후보 | Runtime이 의미를 소유하면 안 됨 |
| `domain/work-steps.ts` | Plan reconciliation, delegation, activity classification | Domain work | 내부 모듈 3개로 먼저 분해 | 1,000줄·소비자 다수 |
| `domain/session-stats.ts` | 단일 session review projection | Observability domain | EP-019 수동 수락 뒤 `domain/observability/` | 미수락 code 이동 금지 |
| `domain/observability-*` | aggregate/shared metrics | Observability domain | 같은 조건으로 `domain/observability/` | 하나의 capability |
| `domain/runtime-monitor.ts` | live monitor projection | Observability domain | 같은 조건으로 `domain/observability/` | runtime adapter가 아님 |
| `domain/todos.ts`, `t-notes.ts` | work/evidence contracts | Domain work/evidence | `domain/work/`, `domain/evidence/` 후보 | 사용자 가치별 응집 |
| `application/project-workbench.ts` | Application Runtime aggregate | Application session | 공개 seam 유지, 내부 협력자 분해 | capability 하나로 이동 불가 |
| `application/native-harness.ts` | executor port | Application port | `application/ports/executor-port.ts` | Pi가 Native 이름을 구현하는 모순 제거 |
| `application/todo-ledger.ts` | Todo use case | Application work | `application/work/` 후보 | Planning/work capability |
| `application/t-note-service.ts` | Evidence note use case | Application evidence | `application/evidence/` 후보 | Evidence capability |
| `application/review-service.ts` | review governance | Application review | `application/review/` 후보 | Governance 응집 |
| `infrastructure/codex-app-server.ts` | Codex executor adapter | Concrete executor | `infrastructure/executors/codex/` 후보 | Agent Execution Runtime 구현 |
| `infrastructure/pi-harness.ts` | Pi executor adapter | Concrete executor | `infrastructure/executors/pi/` 후보 | Codex와 독립 adapter |
| `infrastructure/native-harness-factory.ts` | executor composition | Infrastructure executor | `infrastructure/executors/factory.ts` 후보 | plugin registry는 불필요 |
| `infrastructure/activity-journal-store.ts` | JSONL persistence | Store | `infrastructure/store/` 후보 | generic persistence |
| `infrastructure/observability-history-source.ts` | Dashboard-specific read source | Observability adapter | EP-019 수락 뒤 capability grouping | generic platform이 아님 |
| `presentation/tui/workbench-shell.ts` | TUI lifecycle/navigation composition | Presentation shell | 내부 controller 분해 후 `presentation/shell/` 후보 | Feature renderer와 구분 |
| `presentation/tui/workbench-views.ts` | Chat rendering과 recap | Presentation chat | `presentation/chat/` 후보 | 거대 renderer 분해 필요 |
| `presentation/tui/*stats*`, `*dashboard*`, `runtime-monitor-view.ts` | Observability renderers | Presentation observability | EP-019 수락 뒤 grouping | View family 응집 |
| `app.ts` | composition root | Composition | 현재 위치 유지 | concrete wiring만 소유 |
| `cli.ts` | executable entry | Shell entry | 현재 위치 유지 | package bin 계약 |
| `legacy-*`, `session-runtime.ts` | legacy Router | Legacy | 별도 격리 유지 | 삭제·흡수는 별도 결정 |

나머지 작은 파일은 위 public boundary가 검증된 뒤 같은 의미 단위로 이동한다. 이름만 보고 일괄 이동하지 않는다.

## 교정된 목표 구조

```text
src/
├── domain/
│   ├── session/
│   ├── observability/
│   ├── work/
│   ├── planning/
│   └── shared/
├── application/
│   ├── ports/
│   ├── session/
│   ├── work/
│   ├── evidence/
│   ├── review/
│   └── legacy/
├── infrastructure/
│   ├── executors/
│   ├── store/
│   └── provider/
├── presentation/
│   ├── shell/
│   ├── chat/
│   ├── observability/
│   ├── overlay/
│   └── legacy/
├── app.ts
└── cli.ts
```

이 구조는 최종 강제 tree가 아니라 이동 중 behavior와 import direction을 지키는 목표다.

## 새로운 기능을 추가하는 방법

1. 사용자 가치와 acceptance를 EP/ST로 등록한다.
2. 기존 capability가 소유할 수 있는지 판단한다.
3. 순수 계약/projection은 domain의 해당 capability 폴더에 둔다.
4. use case는 application에 두고 외부 요구는 application-owned port로 선언한다.
5. adapter는 infrastructure, renderer는 presentation에 둔다.
6. 다른 capability는 internal 파일이 아니라 명시적 public entry를 사용한다.
7. Evidence와 architecture test를 함께 추가한다.

## 새로운 Workflow를 추가하는 방법

첫 제품 마일스톤 수락 전에는 범용 Workflow Engine을 만들지 않는다. 실제 Standard·Blueprint·Project Binding이 생기면 `.www/standards/`의 versioned data로 정의하고 application이 port를 통해 읽는다. Step은 concrete Codex/Pi가 아니라 요구 실행 capability를 표현하되, 완료 판정은 Workflow Contract가 소유한다.

## 새로운 Executor를 추가하는 방법

1. application의 `ExecutorPort` 계약을 구현한다.
2. infrastructure의 독립 adapter로 둔다.
3. factory composition에서 명시적으로 선택한다.
4. 지원하지 않는 기능은 capability negotiation에서 fail closed한다.
5. Runtime, Provider, Model, Run identity를 혼합하지 않는다.
6. 공유 contract suite를 통과한다.

## 중단 조건

- 이동과 behavior 변경이 같은 commit에 필요함
- journal schema 또는 Codex/Pi protocol 변경 필요
- 테스트 수 감소, skip/only 추가
- 미수락 capability를 pilot로 이동해야 함
- 기존 사용자 변경을 overwrite/stage해야 함

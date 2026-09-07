# World Wide Woo Code Architecture

- 상태: 현재 구현의 의존 규칙과 1차 migration 이력. 아래 과거 이관안은 최종 목표 트리가 아니다.
- 기준: `Different tools. One project. No broken handoffs.`
- Review: `.www/scratchpad/2026-09-04-capability-architecture-opus-review.md`

## 현재 구현과 목표 설계의 구분

새 목표 구조의 논의 원본은 [Linear 개발 아키텍처 초안](planning/linear-development/ARCHITECTURE.md)이다. TUI / System / Workflows를 기준으로 논의하되, 하위 구조와 이관 범위는 아직 전체 확정되지 않았다. 이 문서는 현재 layer-first 코드의 안전장치와 이전 이관 이력을 소유한다. 목표 폴더명을 승인된 코드 이동 지시로 해석하지 않는다.

## 기존 layer-first 구조를 유지해 온 이유

현재 layer-first 구조는 import 방향과 runtime-neutral domain을 지키는 실제 안전장치다. 문제는 layer 자체가 아니라 `ProjectWorkbench`, `work-steps`, `workbench-shell`, `workbench-views`에 책임이 집중되고 한 capability를 찾을 때 layer를 횡단한다는 점이다.

WWW의 Orchestration은 단순 runtime 호출 계층이 아니라 Work Chain·Contract·Progress·Approval·Evidence와 업무 수락을 통제하는 제품 전체다. 따라서 `src/orchestration/`을 step runner 코드로 만들거나 `src/runtimes/`가 lifecycle 의미를 소유하게 하지 않는다. 기존 layer 방향을 유지하면서 각 layer 내부를 제품 언어로 묶는다.

## 핵심 정의

- Capability: 사용자의 한 질문 묶음에 대해 관측, projection, 표현, acceptance evidence까지 책임지는 제품 영역.
- Feature: Capability 안에서 독립 수락 가능한 사용자 가치. 기존 구현은 `EP-###`와 `ST-###-##`를 사용한다. 새 개발 기획에서는 지속 기능 Unit ID와 Linear 변경 작업 ID를 분리한다.
- Workflow: Stage 사이 실행기 선택·재시도·승인·검증·완료를 조정해 PASS/PARTIAL/BLOCKED를 판정하는 lifecycle loop.
- Agent Execution Runtime: 모델·Tool loop·session·sandbox를 실행하는 교체 가능한 실행기. 업무 완료나 수락을 결정하지 않는다.

Unit/Issue 분리 결정은 [식별 계약](planning/linear-development/IDENTITY.md)을 따른다. 아직 ID 형식이나 schema migration은 확정하지 않았으므로 임의의 `WWW-F-*`, `feature.yaml`, registry를 추가하지 않는다. 기존 Planning catalog와 EP/ST 이력은 보존한다.

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

## 과거 책임 Inventory와 Migration 후보

아래 Current file은 이전 이관 검토 시점의 경로이며, 현재 파일 목록이 아니다. 완료한 이동은 마지막 Migration 결과와 아래 work 모듈 설명에서 확인한다. 나머지 후보를 새 목표 구조로 자동 채택하지 않는다.

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

## 과거 layer 내부 이관안 — 현재 목표 아님

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

이 구조는 이전 단계의 이관 검토 기록이다. 새 목표 트리는 위에서 연결한 Linear 개발 아키텍처 초안에서만 관리한다.

`src/domain/work/`는 기존 layer 의존성 안전망을 유지하며 traceability 계약을 정착시키는 현재 위치다. 과거의 TUI / Work / Runtime 및 `src/work/` 승격 제안은 새 목표 초안으로 대체한다. 기존 work 모듈을 통째로 workflows에 옮기지 않는다. 각 책임의 목적지와 Interface를 먼저 정하고 architecture test로 의존 규칙을 검증한다.

`domain/work-steps.ts`는 activity classification과 native delegation projection을 각각 `domain/work/activity-classification.ts`, `domain/work/delegation.ts`로 분리했다. Workflow projection과 plan reconciliation은 revision identity, journal validation, association/orphan 처리 상태를 하나의 invariant로 공유하므로 억지로 내부 API를 만들지 않고 `domain/work/workflow-projection.ts`로 함께 이동했다. 모든 소비자를 canonical Work entry인 `domain/work/index.ts`로 전환했고 legacy `domain/work-steps.ts` compatibility facade는 삭제했다. Architecture test가 canonical entry의 순수성과 legacy 경로 부재를 함께 강제한다.

## 새로운 기능을 추가하는 방법

1. [Linear 개발 흐름](planning/linear-development/DEVELOPMENT_FLOW.md)에 따라 사용자와 작업 범위·수락 조건을 먼저 논의한다. 기존 EP/ST를 보존하고 새 작업의 이중 발급은 자동 수행하지 않는다.
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

## 1차 Migration 결과

```text
src/application/
├── ports/
│   ├── index.ts
│   └── executor-port.ts
└── session/
    └── session-usage-tracker.ts

src/infrastructure/
└── executors/
    ├── factory.ts
    ├── codex-app-server.ts
    └── pi-harness.ts
```

| Before | After | 의미 |
|---|---|---|
| `application/native-harness.ts` | `application/ports/executor-port.ts` | Native 전용처럼 보이던 이름을 Codex/Pi 공통 실행 계약으로 교정 |
| `application/ports.ts` | `application/ports/index.ts` | application-owned port public boundary |
| `infrastructure/codex-app-server.ts` | `infrastructure/executors/codex-app-server.ts` | concrete Codex executor |
| `infrastructure/pi-harness.ts` | `infrastructure/executors/pi-harness.ts` | concrete Pi executor |
| `infrastructure/native-harness-factory.ts` | `infrastructure/executors/factory.ts` | composition-time executor 선택 |
| `ProjectWorkbench` 내부 usage state | `application/session/session-usage-tracker.ts` | aggregate seam을 유지한 내부 협력자 |
| presentation의 `execFile(git status)` | `infrastructure/git-telemetry-source.ts` + application port | OS process를 presentation 밖으로 이동 |
| presentation 인라인 history structural type | `ObservabilityHistoryReader` | application이 요구하는 read contract 명시 |

이번 migration은 Workflow Engine, Runtime Registry, Feature Registry를 만들지 않았다. `ExecutorPort`는 실행 capability만 소유하며 Workflow·업무 완료·acceptance는 계속 상위 domain/Application Runtime이 소유한다.

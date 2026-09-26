# WWW 코드 구조 현황과 목표 구조 검토 보고서

- 작성일: 2026-09-25
- 대상 저장소: `99_www`
- 기준 브랜치: `dev`
- 조사 원칙: README나 과거 설계 문서가 아니라 현재 실행 코드와 테스트를 우선한다.
- 문서 목적: 다른 검토자에게 “사용자가 이해한 WWW 시스템을 중심으로 어떤 폴더 구조가 필요하며 무엇을 해결해야 하는가?”를 질문할 수 있는 공통 사실 자료를 제공한다.
- 설계 교차검증: Claude Opus 읽기 전용 반박 감사 `ACCEPT_WITH_CHANGES`
- 구현 최종 감사: 고정 Opus 호출이 조직 정책 403으로 판정을 반환하지 못해 미실행
- 감사 전문: `.www/scratchpad/www-structure-opus-audit-2026-09-25.md`
- 실행 승인: 큰 구조 승인, 실행 순서는 §17의 상태 계약 우선 순서로 수정

> 우선순위: §18의 현재 구현 결과가 최우선이다. §1~§17은 2026-09-25 조사·설계·실행 순서를 보존한 역사 기록이며, 미래형 문장이나 옛 Astra/평면 경로가 §18과 충돌하면 현재 사실로 해석하지 않는다.

## 0. 설계 교차검증 당시 최종 판정

이 절은 구현 전 Opus 교차검증 뒤 확정한 설계 정정이다. 현재 구현 상태는 §18이 소유한다.

사용자의 목표 모델은 타당하다. 다만 다음 세 가지를 정확히 고쳐 이해해야 한다.

1. **7계층은 제품 기능 계층이 아니라 관측 pipeline이다.** 마지막 `layout-materialize`, `terminal-write`의 완료 경계는 WWW 본체가 아니라 patched `pi-tui`가 발행한다.
2. **Summary는 신규 Projection이 아니다.** `/tnote` 흐름에 범위 결정·redaction·모델 생성·canonical 검증·append-only 저장이 이미 있다. 필요한 일은 새 Summary Core를 만드는 것이 아니라 제품명과 사용자 배선을 정리하는 것이다.
3. **Activity는 내구 사실의 정본이지만 화면의 유일한 원천은 아니다.** Chat은 Activity와 휘발 Native delta를 합성하며, Usage·Auth·Git·DevelopmentMap·ObservabilityHistory는 현재 Outbound reader에서 TUI shell로 직접 주입된다.

Opus가 확인한 구조상 가장 중요한 정정은 다음과 같다.

- `Astra` 대 “호환 Workbench”가 진짜 이중 제품은 아니다. `design`은 단일 shell의 chrome flag이고 비-Astra 경로는 CLI에서 도달하지 않는다.
- 실제 별도 실행면은 `www router`와 legacy SessionRuntime이다. 약 2,721줄과 전용 테스트가 있어 유지·폐기 결정을 별도로 해야 한다.
- `ProjectWorkbench`는 1,546줄이지만 public 진입점이 10개인 deep Module이다. 분할 자체가 목표가 되어서는 안 된다. 문제는 넓고 일부 가변인 Snapshot 반환 타입과 상태 소유권이다.
- 현재 architecture test는 허용 폴더 그룹을 화이트리스트로 고정한다. 따라서 폴더 이동은 마지막 단계이며 테스트 계약을 먼저 결정해야 한다.
- 가장 확실한 과소 분해 지점은 `core/ports/index.ts`이고, 가장 먼저 필요한 안전장치는 7계층 end-to-end 완료 trace 테스트다.

## 1. 사용자 목적

사용자가 이해하고 원하는 WWW의 핵심은 다음과 같다.

> WWW에는 기능이 있다. Native가 제공하는 사건과 상태를 7개 출력 계층을 통해 사용자가 원하는 모습으로 보여준다. WWW는 TUI를 관리하며, 내부 판단과 외부 기능을 Inbound·Core·Outbound로 구분한다.

이 목적을 제품 언어로 풀면 다음 네 문장이다.

1. **Native는 원천이다.** Codex/Pi Native가 thread·turn·item·message·tool·approval·plan·result 사건을 제공한다.
2. **WWW는 의미를 부여한다.** WWW는 Native 사건을 Activity로 보존하고 Chat·Plan·Tracer·Summary·Note로 투영한다.
3. **TUI는 표현과 조작을 소유한다.** 화면·입력·이동·overlay·layout·terminal 출력은 Inbound TUI가 소유한다.
4. **외부 효과는 Adapter 뒤에 둔다.** Native executor, 파일, Git, Linear, Obsidian, 인증, usage provider 같은 외부 기능은 Outbound Adapter가 소유한다.

이 보고서는 이 사용자 모델이 현재 코드에 얼마나 반영되었는지, 어떤 명칭과 구조가 혼란을 만드는지, 목표 구조로 이동하려면 무엇을 바꿔야 하는지를 다룬다.

## 2. 조사 범위와 검증 방법

### 2.1 직접 읽은 실행 경로

다음 실제 실행 경로를 따라갔다.

```text
package.json bin:www
  → src/cli.ts
  → src/app.ts
  → createProjectWorkbenchSession()
  → ProjectWorkbench
  → runProjectWorkbenchShell()
  → TuiAltScreen
  → terminal write
```

주요 조사 대상은 다음과 같다.

- `src/cli.ts`
- `src/app.ts`
- `src/adapters/outbound/workspace/project-workbench-session.ts`
- `src/core/application/orchestration/project-workbench.ts`
- `src/core/domain/work/workbench.ts`
- `src/core/domain/observability/layer-performance.ts`
- `src/adapters/inbound/tui/shell/workbench-shell.ts`
- `src/adapters/inbound/tui/shell/www-surface.ts`
- `src/adapters/inbound/tui/features/feature-registry.ts`
- 각 TUI Feature의 `*.feature.ts`, `*.units.ts`

### 2.2 실행한 구조 검증

다음 테스트를 실행했다.

```text
bun test \
  test/layer-performance.test.ts \
  test/architecture.test.ts \
  test/tui-feature-registry.test.ts
```

결과는 21개 통과, 0개 실패였다.

이 결과가 증명하는 것은 제한적이다.

- 현재 선언된 7개 성능 계층의 recorder 계약이 동작한다.
- 현재 선언된 Core/Adapter import 규칙이 유지된다.
- 현재 Feature registry의 18개 Feature와 39개 Unit 목록이 내부적으로 일관된다.

다음은 증명하지 않는다.

- Feature 분류가 사용자 제품 모델과 일치한다.
- `Astra`라는 명칭이 적절하다.
- Note·Summary가 사용자 기대대로 완성되었다.
- 거대한 조립 Module이 유지보수하기 적절하다.
- 문서와 코드가 일치한다.

## 3. 현재 실제 시스템

## 3.1 기본 실행

`www`에 별도 명령을 주지 않으면 CLI는 `runAstra({})`를 호출한다. `runAstra()`는 `runApp({ design: "astra" })`를 호출한다. 실제 기본 제품이 `WWW`가 아니라 `Astra`라는 내부 이름을 통해 실행되는 구조다.

`runApp()`은 session factory와 shell을 연결하지만, 다음 구현의 실제 production factory 조립은 `adapters/outbound/workspace/project-workbench-session.ts`가 수행한다.

- 프로젝트 Workbench workspace
- Codex 또는 Pi Native executor
- Native thread 신규 시작 또는 재개
- Activity journal
- Todo ledger와 파일 저장
- T-note 생성·저장
- Note 정본 승격
- 외부 review
- Usage 조회
- Linear dashboard 읽기
- Development activity observer
- TUI shell

기본 Astra 실행의 중요한 실제 설정은 다음과 같다.

```text
requestCapabilityFactory가 있으면 requestRuntimeMode = broker
Astra이면 requestRuntimeMode = off
그 외 호환 Workbench이면 requestRuntimeMode = observe
```

즉 기본 Astra/현재 제품 화면은 7단계 Request Runtime을 실행하는 제품이 아니다. Request Runtime 7단계와 화면 출력 7계층은 서로 다른 개념이다.

WES 수집 구현도 존재하지만 `enableWooEntry`가 명시적으로 켜질 때만 조립된다. 기본 `runApp()`은 이 옵션을 넘기지 않는다. 따라서 WES는 현재 기본 제품 흐름의 활성 중심이 아니다.

## 3.2 Native에서 화면까지의 7개 계층

현재 코드에는 다음 7개 성능 계층이 명시적으로 존재한다.

```text
1. native-receive
2. event-queue
3. state-projection
4. snapshot-publish
5. render-schedule
6. layout-materialize
7. terminal-write
```

의미는 다음과 같다.

| 계층 | 현재 책임 | 현재 소유 위치 |
|---|---|---|
| `native-receive` | Native event를 수신하고 식별한다. | `ProjectWorkbench` |
| `event-queue` | Native event 처리를 직렬화한다. | `ProjectWorkbench` |
| `state-projection` | Activity와 실행 상태에서 Workbench 상태를 계산한다. | `ProjectWorkbench` |
| `snapshot-publish` | 계산한 Snapshot을 subscriber에 발행한다. | `ProjectWorkbench` |
| `render-schedule` | 새로운 frame 계산을 예약한다. | TUI shell / renderer observer |
| `layout-materialize` | 화면 Module을 terminal row로 만든다. | TUI layout / pi-tui |
| `terminal-write` | ANSI frame을 실제 terminal에 쓴다. | pi-tui / terminal Adapter |

이 계층은 **제품 기능 분류가 아니다.** Chat, Plan, Note 같은 모든 기능을 가로지르는 관측 pipeline이다. 따라서 7계층 이름을 최상위 Feature 폴더로 만들면 안 된다. 7계층은 Observability 계약과 성능 추적 모델로 유지하는 편이 맞다.

## 3.3 현재 상태 중심 객체

현재 제품 상태의 중심 Interface는 `WorkbenchSnapshot`이다. 이 Snapshot 하나가 다음을 모두 노출한다.

- 모델과 effort
- context와 usage
- MCP와 Skill inventory
- Linear dashboard
- WES entry
- thread와 active turn
- execution run
- delegation과 agent detail
- Activity 목록
- 선택된 Activity
- approval
- Chat과 queue
- reasoning summary
- live Activity
- Workflow projection
- T-note
- Todo
- cache telemetry
- 7계층 성능 telemetry
- 오류와 development recording 상태

이 구조의 장점은 모든 화면이 하나의 읽기 모델을 공유한다는 것이다. 단점은 호출자가 필요한 것보다 훨씬 큰 Interface를 배우며, 중심 기능 간 결합이 `WorkbenchSnapshot`에 집중된다는 것이다.

현재 파일 크기도 이 집중을 보여준다.

| 파일 | 줄 수 | 관측 |
|---|---:|---|
| `project-workbench.ts` | 1,546 | Native lifecycle, command dispatch, state, 승인, Activity, publish가 한 조율 Module에 집중됨 |
| `workbench-shell.ts` | 636 | 화면 생성, navigation, overlay, monitor, history, stats, map 조립이 집중됨 |
| `www-surface.ts` | 604 | 제품 page, theme 사용, layout, cache, 도움말이 Astra 이름 아래 집중됨 |

줄 수 자체가 결함은 아니다. 그러나 이 세 Module의 Interface와 변경 이유가 사용자의 핵심 기능 축보다 넓다는 점이 문제다.

## 4. 현재 기능 현황

## 4.1 등록된 Feature

현재 TUI registry는 다음 18개 Feature를 동급 목록으로 등록한다.

```text
Dashboard
Chat
Plan
Workflow
T-note
Trace
Monitor
Session
Stats
Usage
Project Map
Context
Cache
Test
Approval
Authentication
Model Selection
Repository
```

registry가 일관된 ID와 Unit 목록을 제공하는 점은 좋다. 그러나 한 목록에 다음 성격이 섞여 있다.

- 사용자의 핵심 작업 기능
- 관측 화면
- 일시적인 interaction
- 설정
- 인증
- 개발 도구
- 저장소 조회

그래서 registry만 읽어서는 무엇이 제품의 중심이고 무엇이 지원 기능인지 알 수 없다.

## 4.2 사용자 중심 기능과 실제 코드의 대응

### Chat

현재 가장 구현이 많은 Feature다. `features/chat`에 24개 파일이 있으며 다음을 포함한다.

- 질문·응답 transcript
- Native 실행 단계 카드
- Tool 결과와 Diff 표현
- Delegation tree
- scroll position
- 실행 제어
- Conversation Recap
- Welcome 화면
- 여러 rendering/cache 보조 구현

Chat은 이미 실질적인 중심 기능이다. 다만 `AstraExecution`, `WorkbenchChatView`, legacy card 등 이름과 세대가 혼재한다.

### Plan

Native Plan·Todo 읽기는 활성이다. 프로젝트 계획 초안 작성 Unit은 `legacy`다. Plan 화면과 Todo의 소유 관계가 완전히 정리된 상태는 아니다.

### Activity

Activity는 독립 TUI Feature 폴더가 아니라 Core의 실행 정본이다. Native event는 `ProjectActivity`로 영속화되고 다른 기능이 이를 읽는다. 이 방향은 맞다.

### Tracer

`features/trace`가 존재하며 Plan·실행 Flow와 정확한 Activity Source 선택을 제공한다. 현재 공식 키는 `trace`, 제목은 `Trace · Source`, route는 `source`다. 사용자가 말하는 `Tracer(Activity)`와 코드 용어가 세 갈래로 나뉜다.

권장 관계는 다음과 같다.

```text
Activity = 관측 사실의 정본
Tracer   = Activity 사이 관계를 보여주는 Feature
Source   = 선택한 Activity의 근거를 보여주는 Tracer의 한 view
```

### Summary

독립 Feature는 아니지만 Summary의 핵심 생성 계약은 이미 T-note 흐름으로 구현되어 있다. 현재 Summary라는 제품 이름이 다음 표현으로 분산된다.

- Chat의 Conversation Recap
- 완료 질문의 자동 T-note 생성
- Native reasoning public summary
- 완료 결과 카드
- Session Stats

`/tnote`는 완료 질문 또는 선택 범위를 요약하고, 격리된 외부 모델 생성과 canonical 검증을 거쳐 append-only 저장한다. 따라서 Summary는 순수 Projection이 아니라 provenance를 가진 파생 산출물이며 Note 수명선의 첫 단계다. Conversation Recap은 Chat message만 읽는 별도 순수 요약이므로 Activity 기반 Summary와 합치면 안 된다.

### Note

`features/tnote`와 Core의 T-note 생성·승격·외부 review 구현이 존재한다. 하지만 가장 기본적인 “질문별 완료 Note 읽기” Unit은 현재 `unwired`다.

따라서 Note는 저장·승격 기능은 있으나 중심 사용자 경험이 완성됐다고 보기 어렵다.

### Monitor

Runtime·Request live 상태, local workflow, 불확실한 외부 동작의 read-back을 다룬다. 7계층 성능 telemetry도 Monitor에 표시된다.

### Dashboard

세션과 프로젝트 개요를 제공한다. 현재 Linear dashboard, 성능 계층, 현재 상태 등 여러 소스의 요약을 한 화면에 조합한다.

### Cache

Activity journal, transcript render, usage 등의 관측 가능한 cache telemetry를 보여준다. 제품 업무 기능이라기보다 시스템 관측 기능이다.

### Context

세션 context, 권한, 사용량, MCP, Skill, delegation 등의 현재 환경을 보여준다. 역시 핵심 업무 기능보다는 관측·진단 기능에 가깝다.

## 5. Astra 명칭 문제

## 5.1 관측 규모

현재 `Astra` 문자열은 제품 코드·스크립트·테스트를 합쳐 82개 파일에 존재한다. 주요 실행·TUI 범위에서 최소 548개 참조가 확인됐다.

대표 예시는 다음과 같다.

- `runAstra`
- `design?: "astra"`
- `AstraPage`
- `AstraWorkspace`
- `AstraHeader`
- `AstraMonitorView`
- `www-surface.ts`
- `www-theme.ts`
- `www-keymap.ts`
- `www-ui-preview.ts`
- `www-render-benchmark.ts`
- Astra 전용 이름을 가진 다수 테스트

## 5.2 왜 단순 이름 문제가 아닌가

현재 코드는 다음 세 개를 서로 다른 개념처럼 표현한다.

```text
WWW
Workbench
Astra
```

그러나 실제 기본 제품은 WWW의 Native Workbench 하나다. Astra가 독립 제품·교체 가능한 디자인 Adapter·실험용 preview 중 무엇인지 Interface로 정의되어 있지 않다.

그 결과 다음 질문이 매 변경마다 발생한다.

- 새 화면은 WWW인가 Astra인가?
- `Workbench` 구현과 `Astra` 구현 중 어느 것이 현재 제품인가?
- `design?: "astra"`가 없을 때의 호환 화면은 유지 대상인가?
- Astra test는 제품 acceptance test인가 시각 실험 test인가?
- Astra theme는 제품 brand인가 임시 palette인가?

사용자의 제품명이 WWW이고 Astra가 별도 제품 개념이 아니라면, Astra 명칭은 전부 WWW 또는 역할 기반 이름으로 바꾸는 편이 맞다.

## 5.3 권장 명칭 원칙

| 현재 | 권장 |
|---|---|
| `runAstra` | `runWww` 또는 기본 `runApp` 단일화 |
| `design?: "astra"` | 제거하거나 실제 다중 UI Adapter가 생겼을 때 명시적 Interface로 대체 |
| `AstraPage` | `WwwPage` |
| `AstraWorkspace` | `WwwWorkspace` |
| `AstraHeader` | `WwwHeader` |
| `www-surface.ts` | `www-surface.ts` 또는 역할별 shell Module |
| `www-theme.ts` | `www-theme.ts` |
| `www-keymap.ts` | `www-keymap.ts` |
| `AstraMonitorView` | `WwwMonitorView` 또는 `MonitorView` |
| `astra:*` script | `www:*` script |

단, 기계적인 전역 치환 전에 호환 Workbench와 현재 WWW 화면 중 어느 것을 유지할지 결정해야 한다. 이름만 바꾸고 이중 구현을 남기면 혼란이 계속된다.

## 6. 현재 구조의 핵심 문제

## 6.1 제품 분류와 코드 분류가 다르다

사용자는 다음을 중심 기능으로 이해한다.

```text
Chat · Note · Plan · Tracer(Activity) · Summary
```

그리고 다음을 관측 기능으로 이해한다.

```text
Monitor · Dashboard · Cache · Context
```

현재 코드는 18개 Feature를 동급 목록으로 둔다. Approval, Authentication, Repository 같은 interaction/연동과 Chat, Plan 같은 중심 기능이 같은 추상 수준에 있다.

## 6.2 Summary의 Interface가 없다

Summary 생성 시점, 입력 Activity 범위, 출력 구조, 저장 여부, Note와의 차이가 하나의 Module에 모여 있지 않다. 이 때문에 요약 표현을 고칠 때 여러 Feature와 Application 구현을 함께 찾아야 한다.

## 6.3 Note의 사용자 흐름이 끊겨 있다

Note 생성·승격·review는 존재하지만 완료 Note 읽기 화면은 `unwired`다. 저장 기능이 존재하는 것과 제품 경험이 완성된 것은 다르다.

## 6.4 Tracer·Trace·Source·Activity 용어가 분산된다

Activity는 Core 정본, Trace는 Feature key, Source는 route와 화면 용어, Tracer는 사용자가 부르는 기능명이다. 이 네 용어의 관계를 명시해야 한다.

## 6.5 WorkbenchSnapshot이 너무 넓은 Interface다

모든 화면이 하나의 거대한 Snapshot을 소비한다. 한 화면을 테스트하려 해도 전체 상태 구조를 구성하게 되고, 한 필드의 변경이 많은 caller와 fixture에 영향을 줄 수 있다.

권장 방향은 Activity 정본과 전체 Snapshot을 제거하는 것이 아니다. 전체 Snapshot은 shell 조립용 내부 Interface로 두되, 각 Feature에는 좁은 Projection Interface를 제공하는 것이다.

예:

```text
ChatProjection
PlanProjection
SummaryProjection
NoteProjection
TracerProjection
MonitorProjection
ContextProjection
```

각 Projection은 Activity와 session state에서 계산되며 화면은 자신에게 필요한 Projection만 받는다.

## 6.6 조립 Module의 변경 이유가 너무 많다

`ProjectWorkbench`, `workbench-shell.ts`, `www-surface.ts`는 각각 여러 기능의 lifecycle과 표현을 함께 소유한다. deep Module이 크다는 것 자체는 문제가 아니지만, 현재는 Interface도 넓고 변경 이유도 많다.

목표는 파일을 작게 쪼개는 것이 아니라, 사용자 기능별로 작은 Interface 뒤에 충분한 구현을 숨기는 것이다.

## 6.7 legacy·active·unwired가 한 제품 표면에 공존한다

Feature Unit catalog에는 `active`, `legacy`, `unwired`가 함께 있다. registry가 존재한다고 해서 사용 가능한 기능이 완성된 것은 아니다.

관측된 주요 상태:

- Chat tool result·Diff card: `legacy`
- Plan 프로젝트 계획 초안: `legacy`
- Repository Git/GitHub 조회: `legacy`
- 완료 질문 Note 읽기: `unwired`

리팩터링 전에 유지·이관·삭제 대상을 정해야 한다.

## 7. 권장 제품 모델

## 7.1 정본과 Projection — 교차검증 후 정정

다음 소유 관계를 권장한다.

```text
Activity Journal (내구 정본, journalSequence)
    ├─→ Chat = f(Activity) ⊕ NativeStreamProjection(휘발 delta, revision)
    ├─→ Plan = f(Activity, Todo)
    ├─→ Tracer = f(Activity, 선택)
    └─→ Cache = f(journal telemetry)

Outbound reader (현재 Activity 파생이 아님)
    ├─→ Usage
    ├─→ Context / Auth
    ├─→ Dashboard / DevelopmentMap
    ├─→ Monitor / ObservabilityHistory
    └─→ Repository / GitTelemetry

CompletedTurnNoteScope(Activity)
    ↓ DetachedGenerator + canonical validation
Summary / TNoteDraft             provenance를 가진 파생 산출물
    ↓ 사용자 보존·검토
Note                             지속 기록
    ↓ 승인 token
Canonical document               외부 정본 또는 프로젝트 문서
```

핵심 원칙은 다음과 같다.

- Activity는 내구 사실의 정본이지만 휘발 delta와 외부 read의 정본은 아니다.
- Chat·Plan·Tracer·Cache는 Activity를 주요 입력으로 하는 Projection이다.
- Usage·Context·Dashboard·Monitor·Repository는 현재 Outbound reader와 shell 지역 상태를 함께 사용한다.
- Summary는 Projection이 아니라 모델 생성과 검증을 거친 파생 산출물이다.
- Note는 Summary/TNoteDraft의 수명을 관리하는 지속 기록이다.
- Summary는 Activity를 대체하지 않는다.
- TUI는 Projection을 표시하고 command를 전달할 뿐 Core 규칙을 소유하지 않는다.
- Outbound Adapter의 결과가 직접 화면 상태를 소유하지 않는다.

## 7.2 기능 분류

```text
Core Work
├─ Chat
├─ Plan
├─ Tracer
├─ Summary
└─ Note

Observability
├─ Monitor
├─ Dashboard
├─ Cache
└─ Context

Control
├─ Approval
├─ Session
├─ Authentication
└─ Model Selection

Integration / Development
├─ Usage
├─ Repository
├─ Project Map
├─ Workflow
└─ Test Evidence
```

Activity는 위 목록과 다른 종류다. Activity는 Feature가 아니라 여러 Feature가 공유하는 Core 정본이다.

## 8. 권장 폴더 구조 초안 — 그대로 실행하지 않음

현재의 `core / adapters` 방향은 유지할 가치가 있다. 아래 트리는 최초 가설을 보존한 것이며, Opus 감사 결과 현재 architecture test의 화이트리스트 및 legacy Router를 누락하므로 그대로 실행해서는 안 된다. 실행 가능한 정정 구조는 §16.2를 따른다.

```text
src/
├─ core/
│  ├─ domain/
│  │  ├─ activity/                 # Native 공개 사건, identity, ordering, provenance
│  │  ├─ chat/                     # Chat 상태와 공개 대화 규칙
│  │  ├─ plan/                     # Native Plan, Todo 연결 규칙
│  │  ├─ tracer/                   # Activity 관계와 Source 선택 규칙
│  │  ├─ summary/                  # 완료 질문·실행 요약 계약
│  │  ├─ note/                     # 지속 Note와 승격 상태
│  │  └─ observability/
│  │     ├─ monitor/               # live 상태
│  │     ├─ dashboard/             # overview
│  │     ├─ cache/                 # cache telemetry
│  │     ├─ context/               # 권한·도구·사용량 context
│  │     └─ layer-performance.ts   # 7개 출력 계층
│  ├─ application/
│  │  ├─ activity/                 # 수신·기록·재생·Projection 조율
│  │  ├─ chat/                     # send, queue, cancel, clear
│  │  ├─ plan/                     # plan/todo use case
│  │  ├─ tracer/                   # trace/source 조회 use case
│  │  ├─ summary/                  # summary 생성 use case
│  │  ├─ note/                     # capture, review, promote
│  │  └─ workbench/                # 위 Module의 얇은 조립
│  ├─ ports/
│  │  ├─ execution/                # Native executor Interface
│  │  ├─ persistence/              # Activity, Note, Todo 저장 Interface
│  │  ├─ integration/              # Linear 등 true external Interface
│  │  └─ observability/            # usage/telemetry source Interface
│  ├─ runtime/                     # reducer/checkpoint/receipt
│  └─ commit/                      # commit control
│
├─ adapters/
│  ├─ inbound/
│  │  ├─ cli/
│  │  └─ tui/
│  │     ├─ foundation/            # theme, layout, rendering, common TUI primitives
│  │     ├─ features/
│  │     │  ├─ chat/
│  │     │  ├─ plan/
│  │     │  ├─ tracer/
│  │     │  ├─ summary/
│  │     │  ├─ note/
│  │     │  ├─ monitor/
│  │     │  ├─ dashboard/
│  │     │  ├─ cache/
│  │     │  └─ context/
│  │     ├─ controls/              # approval, session, auth, model selection
│  │     ├─ commands/              # slash command parser/descriptor
│  │     └─ shell/                 # WWW navigation, lifecycle, composition
│  └─ outbound/
│     ├─ execution/                # Codex/Pi Native Adapter
│     ├─ persistence/              # file/jsonl stores
│     ├─ authentication/
│     ├─ observability/
│     ├─ git/
│     ├─ review/
│     ├─ workspace/
│     └─ development/              # Linear/Obsidian/traceability 개발 도구
│
├─ app.ts                          # production Adapter 조립
└─ cli.ts                          # process entry
```

이 트리는 최종 확정안이 아니라 검토 기준안이다. 특히 `domain/<feature>`를 만들기 전에 해당 기능에 실제 domain invariant가 있는지 확인해야 한다. 단순 표시 코드뿐이라면 Inbound Feature에 남겨야 한다.

## 9. 권장 Module Interface

기능마다 화면 파일을 늘리는 대신 다음과 같은 깊은 Module을 권장한다.

### Activity Module

```text
입력: Native event
출력: durable ProjectActivity, replay result
숨길 것: native variant 정규화, digest, ordering, journal write 순서
```

### Chat Module

```text
명령: send, queue/steer, cancel, clear projection
조회: ChatProjection
숨길 것: Native turn 시작, delivery uncertainty, stream delta, queue drain
```

### Plan Module

```text
입력: Native Plan Activity, Todo command
조회: PlanProjection
숨길 것: revision 선택, root/child 구분, Todo mirror
```

### Tracer Module

```text
입력: Activity 선택
조회: TracerProjection, SourceProjection
숨길 것: 관계 추론, provenance, 선택 검증
```

### Summary Module

```text
입력: 완료된 question/turn 범위
출력: SummaryProjection
숨길 것: 범위 결정, 공개 정보 제한, redaction, 길이 제한
```

### Note Module

```text
명령: capture, review preview/send, promote preview/confirm
조회: NoteProjection
숨길 것: Summary→Note 변환, 저장 identity, 승인 token, canonical promotion
```

각 TUI Feature는 전체 `WorkbenchSnapshot` 대신 해당 Projection을 받는 것을 목표로 한다. Shell만 전체 조립을 알고 각 Feature는 sibling 구현을 직접 참조하지 않는다.

## 10. Inbound / Core / Outbound 책임

## 10.1 Inbound

소유해야 하는 것:

- 키 입력
- composer
- navigation
- page/overlay focus
- layout
- rendering
- 사용자 command를 Core command로 변환
- Core Projection 표시

소유하면 안 되는 것:

- Native event의 업무 의미 판정
- Activity 정본 생성 규칙
- Summary 범위 결정
- Note 승격 규칙
- 직접 filesystem/process/network 실행

## 10.2 Core

소유해야 하는 것:

- Activity 정규화와 정본 규칙
- Chat lifecycle
- Plan과 Todo 의미
- Tracer 관계
- Summary 생성 계약
- Note lifecycle
- 승인과 불확실성 상태
- 각 TUI Projection
- Port Interface

## 10.3 Outbound

소유해야 하는 것:

- Codex/Pi Native 연결
- 파일·JSONL 저장
- Git process
- Linear MCP
- Obsidian vault 접근
- 인증 credential
- usage provider
- review provider
- WES collector

Outbound는 외부 시스템 종류별 Adapter로 나누는 현재 방향을 유지한다. Chat, Plan 같은 제품 기능 이름으로 Outbound를 재분류하면 같은 외부 Adapter가 여러 기능에 중복될 수 있다.

## 11. 리팩터링 순서 초안 — §16.4가 대체함

## 11.1 1단계: 제품 언어 고정

코드를 옮기기 전에 다음 용어를 확정한다.

```text
제품명: WWW
원천 사실: Activity
관계 화면: Tracer
선택 근거 화면: Source
자동 완료 요약: Summary
지속 기록: Note
실시간 실행 관측: Monitor
```

Acceptance:

- 코드와 화면에서 같은 개념에 여러 이름을 사용하지 않는다.
- Astra가 별도 제품이 아니라면 제품 표면에서 제거한다.
- Trace/Tracer/Source의 관계가 타입과 route에 드러난다.

## 11.2 2단계: Astra 제거와 WWW 단일 실행면

- `runAstra`를 기본 WWW 실행으로 통합한다.
- `design?: "astra"` 분기의 실제 필요성을 검토한다.
- 현 WWW 화면과 호환 Workbench 중 유지 대상을 정한다.
- 파일·타입·script·test 이름을 WWW 또는 역할 기반 이름으로 변경한다.
- preview/demo 전용 코드는 제품 코드와 명확히 분리한다.

Acceptance:

- `rg -i astra src test scripts package.json` 결과가 0이거나 명시적으로 보존 승인된 역사 fixture만 남는다.
- `www` 기본 실행 경로가 한 문장으로 설명된다.
- UI 선택 옵션이 실제 두 Adapter가 있을 때만 존재한다.

## 11.3 3단계: Feature taxonomy 정리

- 18개 Feature를 Core Work / Observability / Control / Integration으로 분류한다.
- page, embedded, interaction을 동일 계층의 제품 Feature처럼 취급하지 않는다.
- `legacy`, `unwired` Unit의 유지·완성·삭제를 결정한다.

Acceptance:

- Feature registry를 읽으면 중심 기능과 지원 기능이 구분된다.
- Feature route와 사용자 명칭이 일치한다.
- 등록됐지만 접근할 수 없는 핵심 Unit이 없다.

## 11.4 4단계: Summary와 Note 분리

- Summary의 입력 범위와 출력 schema를 정의한다.
- 질문별 Summary를 Chat timeline에 표시한다.
- Summary를 Note로 캡처하는 명시적 전환을 둔다.
- 완료 Note 읽기 Unit을 실제 연결하거나 제품 범위에서 제거한다.

Acceptance:

- Summary와 Note의 차이를 코드 Interface로 설명할 수 있다.
- Activity 없이 독립적으로 Summary가 정본처럼 떠돌지 않는다.
- Note capture/read/review/promote 흐름이 하나의 행동 테스트로 검증된다.

## 11.5 5단계: Projection Interface 축소

- 각 화면이 사용하는 필드를 조사한다.
- 전체 `WorkbenchSnapshot`에서 Feature별 Projection을 계산한다.
- TUI 생성자는 해당 Projection 조회 함수만 받는다.
- Shell 조립만 전체 Session 상태를 안다.

Acceptance:

- Chat 화면 테스트가 Linear dashboard나 Cache fixture를 요구하지 않는다.
- Context 화면 변경이 Plan fixture를 깨지 않는다.
- Feature 구현은 sibling Feature 구현을 참조하지 않는다.

## 11.6 6단계: 조립 Module deepening

- `ProjectWorkbench`에서 Activity 수신, Chat command, Note, Workflow 조율의 seam을 식별한다.
- 단순 forwarding class를 늘리지 않는다.
- 각 Module은 작은 Interface 뒤에 복잡성을 숨긴다.
- 새 Module Interface를 테스트 표면으로 삼고 내부 구현 테스트는 교체한다.

Acceptance:

- `ProjectWorkbench`의 public Interface가 더 넓어지지 않는다.
- command 추가가 거대한 switch와 Snapshot 필드 추가를 항상 요구하지 않는다.
- 기능별 변경의 주요 파일 위치를 예측할 수 있다.

## 11.7 7단계: 7계층 관측 유지

기능 리팩터링 중에도 다음 성능 trace identity를 유지한다.

```text
native-receive → event-queue → state-projection → snapshot-publish
→ render-schedule → layout-materialize → terminal-write
```

Acceptance:

- 7계층 테스트가 계속 통과한다.
- Module 이동 때문에 관측 경계가 중복되거나 사라지지 않는다.
- 없는 timing을 0으로 추정하지 않는다.

## 12. 주요 위험

### 위험 1: 이름만 바꾸고 이중 구조를 유지

`Astra`를 `WWW`로 전역 치환하더라도 호환 Workbench와 새 화면의 중복이 남으면 구조적 혼란은 해결되지 않는다.

### 위험 2: 기능별 폴더를 지나치게 세분화

모든 파일을 Chat/Plan/Note 중 하나에 억지로 넣으면 Activity, approval, session 같은 공유 계약이 중복된다. 제품 기능과 공통 Core 정본을 분리해야 한다.

### 위험 3: Summary를 새 정본으로 만듦

Summary가 Activity provenance 없이 저장되면 “무엇을 근거로 만든 결과인가”를 잃는다. Summary는 항상 source Activity/turn identity를 가져야 한다.

### 위험 4: TUI가 Core 규칙을 흡수

화면별 폴더 정리를 하면서 Summary 범위, Note 승격, Trace 관계를 view 파일로 옮기면 Inbound가 업무 규칙을 소유하게 된다.

### 위험 5: 거대한 Snapshot을 잘게 복사

Feature별 Projection을 만든다는 이유로 동일 상태를 여러 store에 복제하면 새 동기화 문제가 생긴다. Activity/Session 정본은 하나이고 Projection은 계산 또는 revision-bound cache여야 한다.

### 위험 6: legacy 기능을 무조건 보존

현재 registry와 tests가 존재한다는 이유만으로 모든 legacy 화면을 유지하면 WWW 단일 제품 구조로 수렴하지 못한다.

### 위험 7: 폴더 이동을 architecture 개선으로 착각

파일 경로만 바꾸고 Interface가 그대로 넓으면 유지보수성은 개선되지 않는다. 리팩터링의 수락 기준은 경로가 아니라 호출자가 알아야 하는 개념의 감소다.

## 13. 다른 검토자에게 묻는 질문

다른 모델이나 설계 검토자에게는 다음 질문을 그대로 전달할 수 있다.

1. 사용자 제품 모델인 `Chat · Plan · Tracer(Activity) · Summary · Note`를 Core Work로 두는 구조에 누락된 핵심 capability가 있는가?
2. `Monitor · Dashboard · Cache · Context`를 Observability Projection으로 묶는 것이 적절한가?
3. Activity를 정본으로 두고 나머지를 Projection으로 두는 관계에 모순이 있는가?
4. Summary와 Note의 권장 수명 분리가 충분한가?
5. 현재 `WorkbenchSnapshot`을 유지하면서 Feature별 Projection Interface를 추가하는 것이 단계적 이관으로 안전한가?
6. `ProjectWorkbench`를 어떤 seam에서 나눠야 shallow forwarding Module이 늘지 않는가?
7. Astra 명칭을 WWW로 제거할 때 이름 변경 외에 반드시 함께 제거해야 할 이중 구현은 무엇인가?
8. 현재 7개 성능 계층이 리팩터링 뒤에도 올바른 end-to-end 관측 경계를 이루는가?
9. 제안 폴더 구조가 제품 기능과 기술 계층을 과도하게 혼합하지 않는가?
10. 현재 테스트 중 어떤 것은 새 Interface 행동 테스트로 교체하고 어떤 것은 유지해야 하는가?

## 14. 완료 정의

이 구조 정리는 다음 상태가 되어야 완료로 볼 수 있다.

- 제품명과 코드명은 WWW로 일치한다.
- 기본 실행 경로에 설명되지 않는 Astra/호환 디자인 분기가 없다.
- 사용자가 말한 다섯 중심 기능을 코드에서 즉시 찾을 수 있다.
- Activity, Tracer, Source의 관계가 명확하다.
- Summary와 Note의 수명·정본·전환이 명확하다.
- Monitor, Dashboard, Cache, Context가 관측 Projection으로 분류된다.
- TUI는 표시와 조작을, Core는 의미와 상태를, Outbound는 외부 효과를 소유한다.
- Feature는 거대한 Snapshot 대신 필요한 Projection Interface를 소비한다.
- 7개 출력 계층 telemetry가 유지된다.
- architecture, layer performance, Feature registry, 핵심 행동 테스트가 통과한다.
- `legacy`와 `unwired` 상태가 제품 범위에 맞게 해소된다.

## 15. 현재 판정

### 맞게 되어 있는 부분

- `core / adapters` 의존 방향이 테스트로 보호된다.
- Inbound가 Outbound 구현을 직접 import하지 않는다.
- Native 사건을 Activity로 기록하고 Snapshot으로 투영한다.
- 7개 출력 성능 계층이 실제 코드와 테스트에 존재한다.
- Chat, Plan, Trace, Monitor, Dashboard, Cache, Context의 Feature 폴더가 존재한다.
- Outbound가 execution, persistence, authentication, git, observability, review, workspace, development로 분리된다.

### 아직 부족한 부분

- Astra가 WWW와 경쟁하는 두 번째 제품명처럼 코드 전반에 남아 있다.
- 18개 Feature가 제품 우선순위 없이 동급 registry에 섞여 있다.
- Summary가 하나의 제품 Module로 정리되지 않았다.
- Note의 핵심 읽기 Unit이 연결되지 않았다.
- Trace/Tracer/Source/Activity 용어가 일관되지 않다.
- WorkbenchSnapshot과 주요 조립 파일의 Interface가 지나치게 넓다.
- legacy·unwired 기능의 제품 수명이 정리되지 않았다.

### 최종 결론

사용자의 시스템 이해는 현재 실제 코드의 좋은 목표 모델이다.

```text
Native
  → Activity
  → 7개 출력 계층
  → Chat / Plan / Tracer / Summary / Note
  → WWW TUI

Inbound → Core ← Outbound
```

다만 한 가지를 보정해야 한다. 7개 출력 계층은 Activity에서 개별 Feature로 가는 제품 계층이 아니라 Native event가 terminal frame으로 도달하는 관측 pipeline이다. 제품 기능은 이 pipeline 위에서 각각 Projection을 제공한다.

현재 코드는 이 목표의 기반을 상당히 구현했지만, 명칭과 Module 구조가 사용자 제품 모델로 수렴하지 않았다. 따라서 필요한 작업은 새로운 시스템을 처음 만드는 일이 아니라, 이미 존재하는 구현을 WWW 언어와 기능 중심 Interface로 재정렬하고 불필요한 이중 실행면을 제거하는 리팩터링이다.

## 16. Opus 교차검증 반영 정정안

## 16.1 추가로 확인된 현황

### Architecture gate가 폴더 계약을 고정한다

`test/architecture.test.ts`는 다음 그룹을 화이트리스트로 강제한다.

```text
core/domain         : development, execution, observability, review, work
core/application    : development, orchestration, review, routing, session, work
adapters/inbound/tui: foundation, features, commands, shell, legacy
```

따라서 §8 초안처럼 `core/domain/chat`, `core/application/summary`, `tui/controls`를 바로 만들면 첫 변경에서 architecture test가 실패한다. 이 화이트리스트가 장기 계약인지 현재 상태를 기록한 gate인지 먼저 결정해야 한다.

### 진짜 두 번째 실행면은 legacy Router다

비-Astra Workbench는 별도 구현이 아니라 같은 shell의 chrome-off 경로이며 CLI에서 도달하지 않는다. 반면 `www router`는 다음 독립 구조를 갖는다.

```text
src/legacy-router-app.ts
core/application/routing/
core/application/session/session-runtime.ts
adapters/inbound/tui/legacy/legacy-session-shell.ts
관련 전용 테스트
```

이 표면은 약 2,721줄이므로 Astra rename과 함께 암묵적으로 삭제해서는 안 된다. 유지 또는 폐기는 독립된 제품 결정이다. `session-model-usage.ts`는 현재 Native Workbench도 사용하므로 legacy 폴더 전체를 일괄 삭제해서도 안 된다.

### 7계층 end-to-end 검증이 없다

현재 recorder 단위 테스트는 7개 ID와 시간 계산을 검증하지만 실제 Native event에서 terminal write까지 complete trace가 만들어지는지는 증명하지 않는다. 마지막 두 계층의 완료 경계는 `patches/@earendil-works__pi-tui@0.84.4.patch`에 의존한다.

따라서 모든 rename과 파일 이동 전에 다음 행동 테스트가 필요하다.

```text
Native event 발생
→ 7개 계층 모두 queued/started/completed 관측
→ trace.state === "complete"
→ trace.totalMs !== null
```

### 상태 원천은 세 종류다

현재 화면 원천을 하나로 단순화할 수 없다.

1. Activity Journal: 완료되고 내구성 있는 공개 사건
2. NativeStreamProjection: 아직 Journal에 없는 휘발 streaming delta
3. Outbound reader: Usage, Auth, Git, DevelopmentMap, ObservabilityHistory 등 외부 read

이 세 원천을 모두 Activity Projection이라고 부르면 실제 동작을 잃는다.

### `ProjectWorkbench`보다 Snapshot과 소유권이 문제다

`ProjectWorkbench`의 public 진입점은 10개로 좁고 내부 협력 Module도 이미 분리돼 있다. 따라서 클래스 분할을 목표로 잡지 않는다.

우선 해결할 것은 다음이다.

- `WorkbenchSnapshot`과 `WorkbenchChatMessage`의 가변 필드를 readonly로 고정
- 전체 Snapshot을 받는 Feature에 필요한 Projection Interface 제공
- `ThreadBoundActivityJournal`, `ThreadScopedTNoteSource`, `ThreadScopedTodoSource`의 Core 불변식을 Outbound workspace 파일에서 Core Application으로 이동
- `core/ports/index.ts`의 persistence/integration/observability Interface 분리
- Composer draft의 Core draft와 FileComposerDraftController 중 소유권 명시

## 16.2 실행 가능한 목표 구조

```text
src/
├─ core/
│  ├─ domain/
│  │  ├─ activity/              # 승인 후 신설 후보: 공개 사건 정본
│  │  ├─ execution/             # 유지
│  │  ├─ work/                  # Chat·Plan·Tracer 규칙 우선 유지
│  │  │  └─ note/               # 실제 깊이가 확인되면 승격 후보
│  │  ├─ observability/         # 7계층 recorder 유지
│  │  ├─ review/
│  │  └─ development/
│  ├─ application/
│  │  ├─ orchestration/         # Activity/Thread binding 불변식 회수
│  │  ├─ work/                  # Summary/T-note, Todo, Recap 유지
│  │  ├─ session/               # Native 현역 코드 분리 보존
│  │  ├─ routing/               # legacy 결정 전 유지
│  │  ├─ review/
│  │  └─ development/
│  ├─ ports/
│  │  ├─ execution/
│  │  ├─ persistence/           # 명확한 과소 분해 지점
│  │  ├─ integration/
│  │  └─ observability/
│  ├─ runtime/
│  ├─ commit/
│  ├─ skills/
│  └─ workflows/
├─ adapters/
│  ├─ inbound/
│  │  ├─ cli/
│  │  └─ tui/
│  │     ├─ foundation/
│  │     ├─ features/            # 기존 kind에 productGroup만 추가
│  │     ├─ commands/
│  │     ├─ shell/
│  │     └─ legacy/              # 독립 결정 전 유지
│  └─ outbound/                  # 현행 8그룹 유지
├─ app.ts                        # 장기적으로 production composition 회수
├─ cli.ts
└─ legacy-router-app.ts          # 유지/폐기 결정 전 명시
```

이 구조에서 `tui/controls`는 만들지 않는다. registry가 이미 `page | embedded | interaction`을 소유하므로 다음 분류 축만 추가한다.

```text
productGroup:
  core-work | observability | control | integration
```

### 16.2.1 전체 Hexagonal + TUI 내부 MVC

외부 연결과 업무 처리는 현재 Hexagonal 구조를 유지한다.

```text
Inbound Adapter → Core Application + Domain ← Port ← Outbound Adapter
```

Core가 정제한 Projection을 TUI에 전달한 뒤에는 MVC식 책임으로 분리한다.

```text
사용자 입력 → Controller → Workbench Command → Core
Core Projection → ViewModel → View → Terminal
```

MVC의 Model을 TUI에 다시 만들지 않는다. 업무 Model은 `core/domain`, 업무 Service/Use Case는 `core/application`, Repository·Client Interface는 `core/ports`, 구현은 `adapters/outbound`가 소유한다.

### 16.2.2 기능마다 한 단계 더 들어가는 동일 구조

사용자가 원하는 최종 탐색 단위는 기술 파일 종류가 아니라 기능이다. 따라서 TUI의 중심 기능은 다음처럼 **기능 폴더를 먼저 선택하고, 그 안에서 같은 책임 슬롯을 선택**할 수 있어야 한다.

```text
src/adapters/inbound/tui/features/
├─ chat/
│  ├─ controller/               # 사용자 의도 → Workbench Command
│  ├─ view-model/               # Core Projection → 화면 전용 데이터
│  ├─ view/                     # renderer, card, overlay
│  └─ registration/             # *.feature.ts, *.units.ts
├─ note/
│  ├─ controller/
│  ├─ view-model/
│  ├─ view/
│  └─ registration/
├─ plan/
│  ├─ controller/
│  ├─ view-model/
│  ├─ view/
│  └─ registration/
├─ tracer/
│  ├─ controller/
│  ├─ view-model/
│  ├─ view/
│  └─ registration/
└─ summary/
   ├─ controller/
   ├─ view-model/
   ├─ view/
   └─ registration/
```

Monitor·Dashboard·Cache·Context도 같은 MVC 슬롯 어휘를 사용한다. 차이는 registry의 `productGroup`과 실제 제공하는 Unit으로 표현한다.

각 슬롯의 파일명도 역할을 반복해서 찾을 수 있도록 다음 규칙으로 통일한다.

```text
<feature>/
├─ controller/<feature>.controller.ts
├─ view-model/<feature>.view-model.ts
├─ view/<feature>.view.ts
└─ registration/
   ├─ <feature>.feature.ts
   └─ <feature>.units.ts
```

단, 이 모양을 맞추려고 `TODO`, 빈 export, no-op action 같은 **가짜 구현 파일을 만들지는 않는다.** 모든 기능이 동일한 슬롯 어휘를 사용하되, 해당 책임이 없는 슬롯은 디렉터리와 파일을 만들지 않는다. 동일 구조란 모든 폴더의 물리적 개수를 강제로 같게 한다는 뜻이 아니라, 파일을 어디에서 찾아야 하는지와 책임 경계를 같게 한다는 뜻이다.

이 구조의 중요한 경계는 다음과 같다.

- Core Projection Interface는 `core/application` 또는 `core/domain`의 실제 의미 소유 위치에 둔다. TUI가 같은 업무 계약을 재정의하지 않는다.
- `view-model`은 외부 I/O를 하지 않는다. Core Projection을 터미널 행·표시 상태로 바꾸되 업무 판단을 하지 않는다.
- `view`는 렌더링만 담당하며 Summary 범위 결정, Note 승격, Activity 저장 같은 규칙을 소유하지 않는다.
- `controller`는 사용자의 의도를 Workbench Command로 변환하고 Core Application 진입점을 호출한다. Snapshot을 직접 변경하지 않는다.
- `registration`은 route, page/embedded/interaction kind, `productGroup`, order와 Unit 조립만 소유한다.
- 외부 도구 접근은 계속 `adapters/outbound/<kind>`에 둔다. `features/chat/outbound` 같은 역방향 복제는 만들지 않는다.

현재 코드에 적용하면 다음처럼 매핑된다.

| 기능 | 현재 파일 예 | 목표 슬롯 |
|---|---|---|
| Chat | `bounded-public-projection.ts`, `chat-live-activity.ts` | Core Chat Projection 검토 후 `chat/view-model/` |
| Chat | `chat-message-renderer.ts`, `result-cards.ts`, `workbench-views.ts` | `chat/view/` |
| Chat | `chat.feature.ts`, `chat.units.ts` | `chat/registration/` |
| Plan | `www-plan-view.ts` | rename 후 `plan/view/plan.view.ts` |
| Tracer | `workbench-tracer-view.ts` | `tracer/view/tracer.view.ts` |
| Summary | T-note 범위·생성 결과를 보여주는 TUI | Core Summary Projection + `summary/view-model`, `summary/view` |
| Note | `t-notes-source-view.ts`, 완료 Note 읽기 Unit | `note/controller`, `note/view-model`, `note/view`, `note/registration` |

Summary와 Note는 현재 `tnote` 한 폴더에 섞여 있으므로 물리적 이동 전에 수명 경계를 먼저 고정한다. Summary는 provenance를 가진 생성 결과를 보여주고, Note는 그 결과의 저장·읽기·review·promotion 수명을 노출한다. 생성·검증·저장 업무 규칙 자체는 Core Application에 남는다.

Architecture gate도 이 깊이를 이해해야 한다. 현재 sibling feature 검사는 `features/` 바로 아래 첫 경로 조각을 기능 identity로 보므로, `features/chat/...` 구조는 유지할 수 있다. 반대로 `features/core-work/chat/...`처럼 product group을 물리 폴더로 한 단계 끼우면 Chat과 Plan의 교차 import를 같은 기능으로 오인한다. 따라서 `productGroup`은 registry metadata로 두고 물리적 상위 폴더로 만들지 않는다.

## 16.3 반드시 먼저 결정할 질문

1. Architecture group 화이트리스트는 장기 계약인가, 현재 상태를 기록한 gate인가?
2. `www router`와 legacy SessionRuntime을 유지하는가 폐기하는가?
3. CLI에서 도달하지 않는 non-Astra `runApp`/`design` 경로를 삭제해도 되는가?
4. 사용자가 말하는 Summary는 기존 `/tnote` 생성 산출물과 같은가?
5. Chat은 Activity 단일 Projection이 아니라 Activity와 휘발 delta의 합성이라는 계약을 수용하는가?
6. Outbound reader를 Core Port 뒤로 옮길 것인가, 읽기 전용 데이터는 Inbound shell 직접 주입을 허용할 것인가?
7. patched `pi-tui`를 7계층 관측의 정식 일부로 인정할 것인가?

부차 결정:

- Three Body Lab과 demo mode를 제품 기능으로 유지할지 preview 영역으로 옮길지
- Cache와 Test의 동일한 `order: 120` 충돌 처리
- 저장소 루트의 `test.jsp` 처리

## 16.4 안전한 최종 순서

### 0단계 — 관측 회귀 방지막

- layer telemetry public 메서드의 duck typing 접근 제거
- 7계층 complete trace end-to-end 테스트 추가
- vendor patch 유실 시 테스트가 실패하는지 확인

### 1단계 — 죽은 경로와 분류 충돌 정리

- CLI 미도달 `runApp`/`design` 분기를 단일 WWW 실행으로 접기
- Feature `order: 120` 충돌 해결
- Three Body/demo/test.jsp의 제품 지위 결정

### 2단계 — Astra를 WWW로 단일화

- `runAstra`와 `Astra*` 타입·파일·스크립트·테스트를 WWW 또는 역할 기반 이름으로 변경
- `AstraPage`, `feature.route`, `navigation.mode`를 하나의 route identity로 통합
- 수락 기준: 허용된 역사 fixture를 제외하고 `rg -i astra src test scripts package.json` 결과 0

### 3단계 — Summary/Note 사용자 흐름 완성

- Summary를 신규 Projection으로 만들지 않음
- `/tnote`를 사용자 Summary 용어로 정렬
- command palette의 `tnote`/`tnotes` 필터와 `/tnotes` 스텁 처리
- 완료 Note 읽기 Unit을 연결하거나 명시적으로 제거
- capture → read → review → promote 행동 테스트 추가

### 4단계 — 상태 소유권 교정

- ThreadBound/ThreadScoped 불변식 세 Module을 Core Application으로 회수
- `core/ports`를 persistence/integration/observability로 분리
- Snapshot·Chat message를 readonly로 고정
- Outbound reader의 shell 직접 주입 정책을 결정하고 코드에 반영

### 5단계 — Feature Projection Interface 축소

- Chat은 Activity와 NativeStreamProjection의 합성임을 타입으로 표현
- Plan·Tracer는 기존 순수 Projection seam부터 축소
- `revision`과 `journalSequence`의 이중 갱신 계약을 명문화
- `ProjectWorkbench` 클래스 자체는 분할하지 않음

### 6단계 — 승인된 폴더만 이동

- Architecture 화이트리스트 결정을 반영
- 각 TUI 기능을 `controller / view-model / view / registration` 책임으로 한 기능씩 이동
- Plan 또는 Tracer를 pilot으로 이동하고 gate를 보강한 뒤 다른 기능으로 반복하며, 합성이 복잡한 Chat은 계약 안정화 뒤 이동
- Monitor·Dashboard·Cache·Context와 보조 기능에도 같은 슬롯 어휘를 적용하되 빈 파일은 만들지 않음
- importer 영향과 배럴 재수출을 사용해 Activity 이동을 단계화
- 실제 domain depth가 확인된 Note만 추가 승격 검토
- 같은 변경에서 architecture gate와 Code-ID를 갱신

### 7단계 — Legacy Router 처분

- 유지면 제품 표면과 책임을 명시
- 폐기면 전용 마이그레이션과 테스트 제거를 독립 작업으로 수행
- Native Workbench가 사용하는 session-model-usage는 보존

## 16.5 최종 완료 정의

- WWW가 유일한 현재 제품명이다.
- Native Workbench와 legacy Router의 관계가 명시되어 있다.
- 7개 계층이 end-to-end 테스트로 보호된다.
- Activity, 휘발 delta, Outbound read의 상태 소유권이 구분된다.
- Summary는 provenance가 있는 생성 산출물이고 Note는 그 수명을 관리한다.
- Chat·Plan·Tracer·Summary·Note와 Monitor·Dashboard·Cache·Context를 registry 분류로 찾을 수 있다.
- 각 TUI 기능에서 같은 어휘로 controller·view-model·view·registration 책임을 찾을 수 있다.
- Inbound/Core/Outbound 책임이 단순 import 방향뿐 아니라 실제 상태 소유권과 외부 read 경로에서도 설명된다.
- Projection Interface 축소 후에도 streaming, resume, approval, Todo, T-note 동작이 유지된다.
- 폴더 이동은 architecture 계약 승인 뒤에만 수행된다.

## 17. 사용자 승인 후 최종 실행 계약

이 절은 2026-09-25 사용자가 §0·§16을 검토한 뒤 내린 최종 판정이다. **큰 구조는 승인하지만 실행 순서는 상태 책임을 먼저 고정하도록 변경한다.** 이후 Sol 구현 계획과 수락 기준은 이 절을 우선한다.

### 17.1 서로 섞지 않을 세 분류 축

| 분류 축 | 답하려는 질문 | WWW 표현 |
|---|---|---|
| 책임 경계 | 누가 의미를 판단하고, 표시하고, 외부 작업을 수행하는가? | Inbound / Core / Outbound |
| 제품 기능 | 사용자가 무엇을 할 수 있는가? | Chat / Plan / Tracer / Summary / Note 등 |
| 관측 pipeline | Native 사건이 화면에 반영되는 과정에서 어디에 시간이 걸리는가? | `native-receive` → … → `terminal-write` |

결정:

- Inbound / Core / Outbound는 유지한다.
- 7계층은 여러 기능을 가로지르는 관측 경계이며 제품 폴더가 아니다.
- 제품 분류는 우선 registry의 `productGroup` metadata로 표현한다.
- `page | embedded | interaction`과 `productGroup`은 서로 다른 축이다.
- 제품 분류 정리와 실제 코드 이동은 별도 단계다.
- Chat이라는 제품 기능이 있다는 이유만으로 `core/domain/chat`을 만들지 않는다. 숨길 업무 규칙과 불변식이 확인될 때만 Core Module을 만든다.

### 17.2 `design`과 Astra 제거 전 Runtime 정책 보호

`design`이 단일 shell의 chrome flag라는 사실은 그 옵션 삭제가 실행 정책에 무해하다는 뜻이 아니다. 현재 보고된 분기는 다음과 같다.

```text
requestCapabilityFactory가 있으면 → broker
Astra이면                         → off
그 외 호환 Workbench이면           → observe
```

따라서 이름 변경·화면 선택·실행 정책 변경을 한 변경으로 처리하지 않는다. 먼저 다음을 코드와 테스트로 고정한다.

- 기본 WWW 실행의 Runtime 모드
- `requestCapabilityFactory`가 있을 때 `broker`가 우선하는 규칙
- 기본 실행의 `off` 동작
- 프로그램 내부 호출·테스트·preview에서 non-Astra 경로를 사용하는지 여부
- 검증된 미사용 경로만 삭제하는 기준

### 17.3 전체 정본 하나가 아니라 같은 사실의 정본 하나

모든 상태를 Activity에 넣지 않는다. 같은 사실을 두 주체가 독립적으로 변경하지 못하게 한다.

| 상태 | 정본 또는 변경 책임 | 고정할 규칙 |
|---|---|---|
| 내구 실행 사실 | Activity Journal과 Core 정규화 규칙 | 무엇이 발생했는지 보존한다. |
| 미확정 streaming 출력 | Core `NativeStreamProjection` | 최종 Activity와 중복 표시하지 않는다. |
| 사용자 Todo | Todo ledger와 관련 Core 규칙 | Native Plan과 동기화·충돌 규칙을 명시한다. |
| Summary·Note | 생성 산출물과 Note 저장·수명 관리 | 출처·버전·검토·승격 상태를 유지한다. |
| Usage·Auth·Git 조회 | 외부 원천과 명시적인 읽기 Interface | 조회 시점·실패·stale 결과를 구분한다. |
| 편집 초안·focus·scroll·overlay | TUI shell UI 상태 | 화면 이동과 업무 실행 상태를 혼동하지 않는다. |

Composer의 편집 버퍼는 shell이 관리하고 제출된 요청과 실행 queue는 Core가 관리한다. 파일 저장은 보존 Adapter이며 같은 초안을 독립 변경하는 두 번째 writer가 아니다.

반드시 테스트로 고정할 계약:

1. **streaming → final 교체**: 같은 message/item identity를 사용해 휘발 표현을 최종 Activity로 교체하며 이어 붙여 중복 표시하지 않는다.
2. **늦은 결과의 scope**: Native delta, Summary 생성 결과, 프로젝트별 외부 조회 결과가 시작한 project/thread/request에만 적용된다.
3. **sequence 의미 분리**: `journalSequence`는 내구 기록의 증가, `revision`은 휘발 projection 갱신을 나타내며 하나의 숫자처럼 취급하지 않는다.

### 17.4 ProjectWorkbench보다 Snapshot Interface를 먼저 줄인다

`ProjectWorkbench`의 줄 수를 이유로 먼저 분할하지 않는다. 전체 Snapshot은 shell 조립용으로 유지할 수 있지만 Feature에는 필요한 읽기 Interface만 제공한다.

```text
Shell          → 전체 조립 상태
Chat Feature   → Chat 읽기 Interface
Plan Feature   → Plan 읽기 Interface
Tracer Feature → Tracer 읽기 Interface
```

`readonly` 타입만 붙이는 것으로 완료하지 않는다. Snapshot #11을 발행한 뒤에도 이미 발행한 Snapshot #10의 메시지·배열·중첩 값이 바뀌지 않는 참조 안정성을 행동 테스트로 증명한다. Core 읽기 Interface에는 terminal 폭·ANSI·focus 같은 TUI 표현 세부사항을 넣지 않는다.

### 17.5 Core로 회수할 것과 직접 읽기를 허용할 조건

- `ThreadBoundActivityJournal`, `ThreadScopedTNoteSource`, `ThreadScopedTodoSource`의 thread binding 불변식은 Core Application으로 회수한다.
- 파일 경로·직렬화·네트워크 프로토콜은 Outbound Adapter에 남긴다.
- production 조립은 장기적으로 `app.ts` 또는 명시적인 composition root가 소유하되 거대한 한 파일로 합치지 않는다.
- 단순 외부 읽기는 조립 지점에서 명시적인 Port/조회 Interface를 주입하는 형태를 허용한다.
- Inbound가 Outbound 구현을 직접 import하거나 파일·네트워크 프로토콜을 다루는 것은 금지한다.
- 조회 결과가 실행 허용·승인·Note 승격 같은 업무 판단에 영향을 주면 Core Application을 거친다.
- 전달만 하는 얕은 Core 중계 Module은 만들지 않는다.

### 17.6 Summary와 Note의 최종 의미

```text
Summary = 특정 Activity·turn 범위를 근거로 생성한 provenance 보유 산출물
Note    = 그 산출물의 보존·검토·승격 등 지속적인 사용을 관리하는 기록
```

Summary와 Note를 단순히 휘발성 대 영속성으로 나누지 않는다. 기존 `/tnote`의 범위 결정·모델 생성·검증·append-only 저장 흐름을 유지한다. 추가로 다음을 결정한다.

- capture가 내용을 복사하는가, 같은 산출물을 등록하는가, 원본 identity를 참조하는가
- Summary 생성과 저장된 Summary 조회의 Interface 분리
- 완료 Note 읽기 연결
- capture → read → review → promote 전체 사용자 흐름

### 17.7 7계층 E2E 관측 계약

모든 Native event가 독립 frame/write를 가져야 한다고 가정하지 않는다. 다음 경우를 구분한다.

| 상황 | 검증 내용 |
|---|---|
| 화면을 변경하는 단일 event | 7개 경계가 연결되고 완료 시간이 계산되는가 |
| 여러 delta가 한 frame으로 합쳐짐 | 어느 event 변화가 어느 frame에 반영됐는지 추적 가능한가 |
| 화면 변경이 필요 없는 event | 의도적 미렌더와 계측 누락을 구분하는가 |
| vendor patch 누락 | 완료 경계 누락을 감지하고 테스트가 실패하는가 |

`terminal-write` 완료가 write 호출 반환인지 다른 완료 신호인지 Interface에 명시한다.

### 17.8 승인된 실제 변경 순서

| 순서 | 작업 | 완료 기준 |
|---:|---|---|
| 0 | 현재 동작 보호 | 기본 Runtime 모드, streaming→final 전환, resume·approval, 7계층 완료 경계를 테스트로 고정 |
| 1 | 상태 소유권 교정 | ThreadScoped 규칙을 Core로 회수하고 초안·Todo·Note·외부 조회의 writer를 명시 |
| 2 | Port·Snapshot 계약 정리 | Port를 책임별로 분리하고 과거 Snapshot의 참조 안정성을 보장 |
| 3 | Feature 읽기 Interface 축소 | Plan·Tracer부터 시작해 Chat의 Activity+delta 합성 계약까지 좁힘 |
| 4 | 제품 흐름 완성 | Summary/Note 용어와 완료 Note 읽기, capture→read→review→promote 연결 |
| 5 | 실행면·명칭 정리 | Runtime 정책을 보존하며 검증된 미사용 경로와 Astra 명칭 제거 |
| 6 | 승인된 폴더 이동 | 정리된 Interface에 맞춰 architecture gate·Code-ID·추적 경로 갱신 |

`productGroup` 같은 작은 metadata 분류는 앞에서 진행할 수 있다. Legacy Router의 유지·폐기는 이 순서와 별도의 제품 결정으로 관리한다.

### 17.9 코드 주석과 가독성 계약

주석은 구현을 반복 설명하지 않고 탐색과 Interface 계약만 소유한다.

- 기능 구현 파일에는 필요한 경우 `GROUP | FUNCTION | INPUT | RETURN | CALLS | ROLE` 함수 지도를 둔다.
- 공개 optional 속성의 생략 의미가 이름만으로 불명확하면 선언 바로 앞 JSDoc을 둔다.
- 상태 writer, identity 교체, scope guard, sequence 의미는 타입과 테스트가 주 계약이며 주석은 그 이유와 불변식만 설명한다.
- 모든 변경 TypeScript 파일은 작성 시 가독성 축 계약을 적용하고 완료 시 `00_normalize-imports.ts`와 `06_align-tables.ts --file`을 통과한다.
- 함수 지도를 추가했다면 `08_function-map.ts --file`로 drift를 검사한다.

### 17.10 구현 주체와 단계

1. Luna `xhigh`가 폴더·파일·함수·Unit·상태 흐름·가독성·문서 영향 데이터를 읽기 전용으로 수집한다.
2. 수집 결과로 파일별 책임 배분표와 Sol 실행 계획을 만든다.
3. Sol이 승인된 순서대로 한 작업 묶음씩 구현한다.
4. 각 묶음은 행동 테스트, 가독성 검사, architecture gate, 문서 갱신을 함께 완료한다.

최종 기준은 폴더 모양이 아니라 다음 질문에 답할 수 있는가이다.

> 이 상태는 누가 변경할 수 있고, 화면은 어느 identity와 어느 시점의 값을 받는가?

## 18. 2026-09-25 구현 완료 뒤 현재 상태

이 절은 앞의 조사 당시 수치·미래형 단계·옛 Astra 식별자·평면 Feature 경로를 대체한다. 역사적 문제 발견과 결정 과정은 삭제하지 않되 현재 코드 설명으로 재사용하지 않는다.

### 18.1 현재 구조

```text
Inbound Adapter → Core Application + Domain ← Port ← Outbound Adapter

사용자 입력 → TUI Controller → Workbench Command → Core
Core Projection → TUI ViewModel → View → Terminal
```

- Core Port는 `execution`, `persistence`, `integration`, `observability` 4그룹으로 분리됐다. `core/ports/index.ts`는 선언 없는 type-only 호환 barrel이고 제품·테스트는 책임별 파일을 직접 import한다.
- TUI registry는 18 Feature·39 Unit을 `core-work`, `observability`, `control`, `integration` 제품 분류와 `page`, `embedded`, `interaction` 표시 종류의 독립 축으로 유지한다.
- Feature 구현은 실제 책임이 있는 `controller`, `view-model`, `view`, `registration`에 배치됐다. 현재 파일 수는 각각 `1`, `7`, `60`, `36`이며 빈 책임 폴더는 없다.
- ViewModel은 pi-tui·chalk·ANSI·terminal 폭을 알지 않고 View가 실제 렌더링을 소유한다. sibling Feature import, Inbound→Outbound, Core→Adapter와 역할 역방향 의존은 architecture gate가 차단한다.
- 전체 `WorkbenchSnapshot`은 shell 조립용으로 유지하며 Plan·Tracer·Chat·Note는 좁은 readonly Feature Projection을 소비한다.

### 18.2 실행·상태 계약

| 계약 | 현재 결과 |
|---|---|
| Runtime | 명시적 capability/config `broker`, 일반 `runWww` `off`, 호환 `runApp` 기본 `observe` |
| streaming → final | 같은 thread/turn/item identity로 durable Activity에 정착하고 휘발 표현 제거 |
| Snapshot | 이후 publish 뒤에도 과거 Snapshot object graph 불변 |
| async scope | close·thread·turn·generation이 다른 늦은 결과 폐기 |
| Composer | TUI Editor 단일 writer, generation-aware persistence queue |
| Thread scope | Activity·Todo·Note 결속 규칙을 Core Application이 소유 |
| Note | stable source idempotency와 응답 유실 read-back, `/tnotes` 목록·선택·상세 사용자 흐름 |

### 18.3 7계층 관측

```text
native-receive → core-apply → projection-publish → render-schedule
               → layout-materialize → terminal-write-start → terminal-write
```

실제 Native event에서 terminal write까지 E2E로 연결한다. 여러 delta가 한 frame으로 합쳐질 때 event→frame identity를 보존하고, 의도적 `no-render`와 observer 누락을 구분한다. `terminal-write completed`는 OS flush가 아니라 동기 `Terminal.write` 반환까지다. vendor observer wiring과 layout/write 실패도 해당 계층에서 검증한다.

### 18.4 현재 제품명과 실행면

- 현재 제품·TUI·스크립트 이름은 WWW다. `www astra`는 도움말에 노출하지 않는 deprecated alias로만 남고 `gpt-6-astra`는 외부 모델 ID다.
- `www router` Legacy Router는 별도 실행면으로 보존했다. 유지·폐기는 WWW rename과 분리한 제품 결정이다.

### 18.5 남은 Gap

| Gap | 현재 상태 | 필요한 결정 |
|---|---|---|
| Summary → Note capture identity | 동일 provenance 산출물을 복사하지 않고 같은 identity로 Note 수명주기에 등록하기로 결정 | capture·review·promote lifecycle 구현과 승인 계약 |
| Legacy Router | 별도 migration 완료 뒤 폐기하기로 결정; 코드·전용 진입점은 이관 전까지 보존 | migration 범위·호환 종료·폐기 수락 테스트 |
| Opus 구현 최종 감사 | 조직 정책 403으로 판정 미반환 | 접근 가능한 고정 Opus 환경에서 재실행; 낮은 모델 대체 금지 |
| 외부 기록 | Linear·Obsidian Candidate만 준비 | 항목별 사용자 승인 뒤 게시·read-back |

S0-A~S6 구조 리팩터링과 독립 코드 리뷰는 완료됐다. 위 Gap은 숨기거나 구현 완료로 승격하지 않는다.

### 18.6 2026-09-26 표시·가독성 보정

이 보정은 아키텍처 경계를 바꾸지 않는다. Core는 Plan 생성 지시와 Activity 표시 의미를 소유하고, TUI View는 terminal 폭·행·색상·배치를 소유한다.

| 요구 | 현재 구현 |
|---|---|
| Chat 왼쪽 여백 축소 | execution transcript inset 1칸 |
| 실행 진행 위치 | Composer 바로 위 한 행; 다른 page에는 미표시 |
| 진행 표현 | Braille spinner + 경과·terminal 수 + 실제 `Esc` 중단 힌트 |
| Plan/Activity 밀도 | compact status typography, 항목당 최대 2행 |
| 간결한 Plan | Native 지시 80자 이내 한 문장, Activity 표시 첫 문장·120자 제한 |
| 원본 보존 | 표시 Projection만 정규화하고 Activity identity·payload·provenance는 유지 |

`2pt`는 terminal renderer에 존재하지 않는 단위이므로 font size를 흉내 내지 않고 padding·테두리·행 수를 줄이는 방식으로 같은 정보 밀도 목표를 달성했다.

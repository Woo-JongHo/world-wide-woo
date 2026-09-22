---
acceptance: partial
capability: Workbench
code_ids: []
decision_ids:
  - DEC-WORKBENCH-001
  - DEC-WORKBENCH-002
  - DEC-WORKBENCH-003
document_id: 742cd6b6-37d9-4f64-a96d-273f4cfb4bea
domain: Workbench
exception_ids:
  - EXC-WORKBENCH-001
  - EXC-WORKBENCH-002
  - EXC-WORKBENCH-003
linear: WOO-674
parent: null
record_type: detailed-canonical
related:
  - "[[Todo — AI가 세운 계획을 세션별로 실시간 확인한다]]"
  - "[[Tracer — Todo의 내부 실행 과정을 세션별로 실시간 확인한다]]"
schema_version: 2
source_revision: worktree:9546aa46bf2646d393eb75c78c2f5b808edc063a:dirty
spec_ids: []
status: active
tags:
  - www/spec
  - domain/workbench
  - capability/orchestration
  - status/partial
test_ids:
  - TEST-WORKBENCH-001
  - TEST-WORKBENCH-002
  - TEST-WORKBENCH-003
  - TEST-WORKBENCH-004
  - TEST-WORKBENCH-005
  - TEST-WORKBENCH-006
updated_at: 2026-09-22T15:16:23+09:00
---

# Workbench — 대화와 계획을 통제한다

## 1. Intent

### 사용자 문제

사용자는 한 세션에서 대화를 보내고, 현재 계획과 공개 실행 상태를 읽고, 필요하면 승인·취소·화면 전환을 해야 한다. 이 흐름이 서로 다른 view가 임의로 상태를 해석하거나 입력을 직접 다루면, 실행 중인지·대기 중인지·무엇을 취소하는지 알기 어렵다.

### 기대 결과

Workbench는 Native 세션의 snapshot을 한 곳에서 받아 Chat, Todo, Tracer와 관측 화면에 전달하고, 사용자 명령을 명시적 receipt로 돌려준다. Todo와 Tracer는 이 Workbench Linear work item(WOO-674)의 하위 capability이며, 각각의 계획·activity 의미와 영속 계약은 하위 정본이 소유한다.

### Reference

Linear readback과 ISSUE_CONTRACT.yaml에서 WOO-674는 Workbench root이고, WOO-680은 별도 Layout 하위 issue임을 확인했다. 과거 traceability observation은 WOO-674가 workbench shell, bottom HUD, usage strip, telemetry를 구현 대상으로 둔 기록을 보존한다. 이 문서는 그 기록을 현재 core / adapters 경로로 다시 대조한다.

## 2. Scope

### In Scope

- Workbench snapshot·phase·command·receipt의 runtime 경계
- Chat input, 취소, approval, model/session 설정을 dispatch하는 orchestration
- Workbench와 Dashboard·Monitor·Stats·Map·Source 화면의 navigation 경계
- Todo·Tracer 하위 capability를 Properties relation으로 연결하는 parent-of 관계

### Out of Scope

- Todo Plan 생성·2계층 projection·Todo.md 저장의 세부 계약
- Tracer activity association·Source evidence 판정의 세부 계약
- WOO-680 Layout의 viewport 크기·scroll anchor·resize 계약
- model provider 또는 Native App Server 자체의 lifecycle

### Boundary

ProjectWorkbench는 현재 turn의 state와 command serialization을 소유한다. TUI shell은 snapshot을 표현하고 입력을 command로 바꾼다. Todo·Tracer·Layout은 Workbench snapshot에서 필요한 데이터를 읽되, Workbench parent가 각 하위 domain state를 다시 소유하지 않는다.

## 3. Desired Behavior

### Scenario DB-001 · 대화를 Workbench command로 보낸다

**Given** Workbench가 ready 또는 working이고 사용자가 Composer에 자연어 입력을 작성했다.

**When** shell이 chat.send command를 dispatch한다.

**Then** Workbench는 accepted·queued·rejected·uncertain 중 하나의 receipt를 반환하고, shell은 그 receipt에 따라 input을 유지하거나 비운다. uncertain 상태에서는 자동 재시도하지 않고 명시적 /cancel reconciliation을 안내한다.

### Scenario DB-002 · 승인 대기는 작업 중 animation으로 표현하지 않는다

**Given** Native runtime이 pending approval을 snapshot에 올렸다.

**When** 사용자가 승인 또는 거절 문구를 입력한다.

**Then** shell은 approval.resolve command로 바꾸고, waiting 상태는 background work animation과 구분된다.

### Scenario DB-003 · 하위 capability와 관측 화면을 오간다

**Given** Workbench가 Chat, Todo, Tracer의 현재 projection을 가지고 있다.

**When** 사용자가 /dashboard, /monitor, /map, /stats, 또는 exact activity Source를 선택하고 Escape로 돌아온다.

**Then** view mode만 바뀌고 Workbench가 보존한 snapshot·selected activity·draft의 의미를 새 view가 임의로 재작성하지 않는다.

### Scenario DB-004 · WWW Dashboard에서 작업을 시작한다

**Given** 사용자가 plain `www`로 Astra Execution Console을 실행했다.

**When** Workbench가 첫 snapshot을 발행한다.

**Then** 첫 화면은 WWW Dashboard로 열리고 세션, 현재 작업, 목표, 대화·계획·Todo, 승인·오류와 Linear 연결 상태를 같은 snapshot에서 표시한다. 기본 본문 글자는 흰색이며 입력란은 즉시 사용할 수 있다.

### Scenario DB-005 · 공개 대화를 제한된 Recap으로 다시 읽는다

**Given** 현재 snapshot에 공개 user·assistant 메시지가 있다.

**When** 사용자가 실행 화면의 읽기 모드에서 `Ctrl+E`로 상세를 펼친다.

**Then** system·reasoning·tool payload를 제외한 최대 6개·1,400자의 Conversation Recap이 나타나며 Native history와 T-note는 변경되지 않는다.

## 4. Domain Contract

### INV-001 · snapshot은 runtime state의 단일 공개 projection이다

WorkbenchSnapshot은 phase, thread/turn, chat, pending approval, workFlow, Todo, activity, draft, error를 한 번에 제공한다. view는 snapshot을 추정해서 다른 lifecycle state를 만들지 않는다.

### INV-002 · 모든 사용자 변경은 command receipt를 가진다

Workbench command는 accepted, queued, rejected, uncertain 중 하나로 귀결된다. chat.cancel은 별도 control signal로, 직렬 command queue 뒤에 무기한 대기하지 않는다.

### INV-003 · 하위 capability의 의미를 parent가 중복 소유하지 않는다

Todo의 canonical plan/TodoDocument 및 Tracer의 exact activity 선택은 각 하위 capability 계약이 소유한다. Workbench는 해당 projection을 연결하고 표시한다.

### INV-004 · Dashboard와 Recap은 snapshot의 비영속 공개 투영이다

Dashboard와 Conversation Recap은 WorkbenchSnapshot에서 매번 파생한다. Recap은 공개 user·assistant 본문만 입력으로 받고 credential과 terminal control을 제거하며 별도 대화 정본을 만들지 않는다.

### 용어

| 용어 | 정의 |
|---|---|
| Workbench | Native 세션의 공개 snapshot과 command를 TUI에 연결하는 상위 orchestration capability |
| snapshot | 현재 Workbench state를 listener에 전달하는 immutable 공개 projection |
| receipt | command 수락·대기·거절·불확실성을 나타내는 구조화된 결과 |
| view mode | Workbench, Dashboard, Monitor, Stats, Map, Source 중 현재 TUI 표현을 고르는 presentation state |

### INV-005 · Context 비율과 meter는 전체 Native window를 같은 분모로 사용한다

Context 사용률은 `usedTokens / contextWindow`의 raw 비율이다. label과 meter는 동일한 두 값을 사용하며, MCP·Skills·Notes의 loaded count를 token 점유율로 해석하지 않는다. 관측되지 않는 source별 token 기여량은 0 또는 추정 bar가 아니라 unavailable로 표시한다.

## 5. State Model

### 상태

| State | 의미 |
|---|---|
| loading | Native session 초기화 또는 준비 중 |
| ready | 입력을 수락할 수 있고 실행 중 turn이 없음 |
| working | 현재 turn 또는 공개 activity가 진행 중 |
| error | Workbench가 사용자에게 표시할 오류 상태 |
| closed | Workbench session이 종료되어 command를 수락하지 않음 |

### 상태 전이

| From | Event / Condition | To | 비고 |
|---|---|---|---|
| loading | session 준비 완료 | ready | waitUntilReady()가 해소된 뒤 command를 처리 |
| ready | chat.send accepted | working | Native activity/turn이 시작되면 snapshot에 반영 |
| working | turn 완료 및 active turn 해제 | ready | 완료 메시지와 public state를 보존 |
| ready / working | recoverable command 실패 | ready / working | receipt는 rejected 또는 uncertain; process 상태를 추측해 바꾸지 않음 |
| any | close() 완료 | closed | 이후 command는 rejected |

허용되지 않는 전이: closed 이후 native send·Todo write·approval resolve를 accepted로 보고하면 안 된다.

## 6. Data & Runtime Flow

```text
Native App Server / session event
        ↓
ProjectWorkbench reducer and activity journal
        ↓
WorkbenchSnapshot + WorkbenchCommandReceipt
        ↓
Workbench shell
        ├── Chat / Composer
        ├── Todo projection
        ├── Tracer / Source selection
        └── Dashboard · Monitor · Stats · Map
```

### Ownership

| State / Data | Owner | Writer | Reader |
|---|---|---|---|
| Workbench snapshot·phase | ProjectWorkbench | runtime event reducer | TUI shell and view projections |
| user draft | shell Composer and snapshot update path | user input | shell renderer |
| command receipt | ProjectWorkbench.dispatch | command handler | shell notice/input policy |
| Todo document | Todo capability | Todo source/ledger | Workbench and Todo view |
| trace selection | Tracer capability | exact activity resolver | Source view |
| view mode | TUI shell | navigation command/key | Workbench view host |

### Context usage projection

```text
Native context usage (usedTokens, contextWindow)
        ↓
SessionUsageTracker: raw full-window percent
        ↓
WorkbenchSnapshot.contextUsage
        ↓
AstraContextView
        ├── overall occupancy: label + meter (same ratio)
        ├── loaded capabilities: Skills / MCP counts
        └── source allocation: unavailable until observed
```

MCP·Skills count는 capability availability를 뜻하며 context token 소비량의 입력이 아니다.

## 7. Identity & Persistence Contract

### Identity

| 대상 | ID |
|---|---|
| Workbench document | document_id 742cd6b6-37d9-4f64-a96d-273f4cfb4bea |
| Linear work item | WOO-674 |
| Native session | threadId |
| 현재 실행 | activeTurnId |
| user command | runtime-generated commandId |

Code-ID와 Spec-ID는 WOO-674에 안정적으로 지정된 근거를 찾지 못했으므로 비어 있다. Code-013은 WOO-680 Layout의 createDashboardLayout unit이며 이 Workbench document에 연결하지 않는다.

### Persistence

thread-bound activity journal과 session-scoped Todo source는 workspace adapter가 만든다. Workbench가 session 밖의 provider history를 복원한다는 근거는 없다.

### Resume

WorkbenchResumeCoverage는 fresh 또는 partial-local-journal을 명시하며 priorProviderHistoryHydrated: false다. 따라서 resume은 local journal coverage만 표현할 수 있고, 완전한 provider history 복원을 주장하지 않는다.

### Idempotency / Concurrency

일반 command는 command queue로 직렬화한다. cancel은 out-of-band control signal이다. 같은 외부 mutation approval은 displayed/executable payload에서 만든 identity로 결속되어 다른 candidate에 재사용되면 안 된다.

## 8. Integration Contract

```text
Workbench (WOO-674)
 ├─ Todo (WOO-682)
 ├─ Tracer (WOO-681)
 ├─ Chat (WOO-679)
 └─ Layout (WOO-680)
```

Todo와 Tracer의 parent Property는 이 canonical Workbench 문서를 가리킨다. SQLite/ledger는 그 wiki relation을 parent-of edge로 투영해야 하며, 위 목록은 읽기 위한 projection이다.

### Properties view

아래 Dataview query는 Obsidian Properties와 활성 Dataview plugin의 frontmatter를 읽기 전용으로 보여 준다. 관계·상태·수락·Linear를 body의 반복 목록 대신 Properties에서 탐색한다.

```dataview
TABLE capability AS Capability, status AS Status, acceptance AS Acceptance, linear AS Linear, file.link AS Note
FROM "01_프로젝트/99_WWW/01_문서/Workbench"
WHERE capability
SORT capability ASC
```

## 9. Failure & Recovery Contract

| ID | Failure | Detection | User-visible State | Recovery | Preserve |
|---|---|---|---|---|---|
| EXC-WORKBENCH-001 | send 결과가 Native state와 확정적으로 일치하지 않음 | command handler가 uncertain error 반환 | explicit reconciliation notice | 자동 재시도하지 않고 /cancel로 확인 | 입력과 durable activity evidence |
| EXC-WORKBENCH-002 | closed Workbench에 command가 들어옴 | closed guard | rejected receipt | 새 session을 열어 다시 시도 | 기존 journal·Todo source |
| EXC-WORKBENCH-003 | provider history가 resume에 존재하지 않음 | partial-local-journal coverage | coverage가 partial임을 표시 | local journal 범위에서만 계속 | local journal evidence |

EXC-WORKBENCH-003의 실제 Native TUI recovery acceptance는 아직 독립 evidence가 없다.

## 10. Acceptance Contract

| AC-ID | Acceptance Criterion | Test-ID | Evidence | Status |
|---|---|---|---|---|
| AC-WORKBENCH-001 | shell은 receipt에 따라 Composer input을 유지·정리하고 uncertain 상태에서 명시적 reconciliation을 안내한다. | TEST-WORKBENCH-001 | test/workbench-shell-policy.test.ts | PASS |
| AC-WORKBENCH-002 | Dashboard·Monitor·Stats·Map·Source는 명시적인 view mode로 전환되고 Workbench로 돌아온다. | TEST-WORKBENCH-002 | test/workbench-shell-policy.test.ts | PASS |
| AC-WORKBENCH-003 | Workbench parent와 Todo·Tracer child가 Properties relation으로 탐색되고 SQLite/ledger에 같은 parent-of edge로 투영된다. | TEST-WORKBENCH-003 | canonical document check | PARTIAL |
| AC-WORKBENCH-004 | 실제 Native TUI에서 send·approval wait·cancel·resume이 한 세션에서 관찰 가능하다. | — | — | NOT TESTED |
| AC-WORKBENCH-005 | Context label과 meter는 raw `usedTokens/contextWindow` 비율로 일치하며 MCP·Skills count와 분리되고, source별 token 원천이 없으면 unavailable을 표시한다. | TEST-WORKBENCH-005 | test/astra-ui.test.ts, test/session-usage-tracker.test.ts, test/project-workbench.test.ts | PASS |

## 11. Verification Strategy

| Test-ID | 검증 대상 | 방법 | 연결 계약 |
|---|---|---|---|
| TEST-WORKBENCH-001 | receipt notice, composer 정책, approval input, uncertain send | Unit / shell policy | AC-WORKBENCH-001, INV-002, EXC-WORKBENCH-001 |
| TEST-WORKBENCH-002 | view route, Escape return, selected session identity, viewport host 보존 | Unit / TUI frame | AC-WORKBENCH-002, INV-001 |
| TEST-WORKBENCH-003 | Workbench/Todo/Tracer Properties와 canonical document schema | Contract / Obsidian checker | AC-WORKBENCH-003, INV-003 |
| TEST-WORKBENCH-004 | Native TUI send·approval·cancel·resume | Behavioral / manual capture | AC-WORKBENCH-004, EXC-WORKBENCH-003 |

TEST-WORKBENCH-004의 terminal capture와 receipt evidence는 없으므로 NOT TESTED다.
| TEST-WORKBENCH-005 | Context raw window 비율, label/meter 일치, capability count 분리, source allocation unavailable | Unit / TUI behavior | AC-WORKBENCH-005, INV-005 |

## 12. Implementation Map

| Responsibility | Module / Component | Code-ID |
|---|---|---|
| Workbench snapshot·dispatch·command serialization | src/core/application/orchestration/project-workbench.ts | — (stable Code-ID not assigned) |
| Workbench command and snapshot contract | src/core/domain/work/workbench.ts | — (stable Code-ID not assigned) |
| session writer, thread-scoped journal/Todo source | src/adapters/outbound/workspace/project-workbench-session.ts | — (stable Code-ID not assigned) |
| native TUI shell and view-mode host | src/adapters/inbound/tui/shell/workbench-shell.ts | — (stable Code-ID not assigned) |
| session context usage 계산 | src/core/application/session/session-usage-tracker.ts | — (stable Code-ID not assigned) |
| Context monitoring projection | src/adapters/inbound/tui/features/context/astra-context-view.ts | — (stable Code-ID not assigned) |
| HUD, usage, telemetry projections | src/adapters/inbound/tui/dashboard/workbench-bottom-hud.ts, usage-strip-view.ts, workbench-telemetry.ts | — (stable Code-ID not assigned) |

## 13. Current State & Gaps

### Implemented

- ProjectWorkbench exposes a single snapshot and accepts typed commands through dispatch.
- shell policy tests cover composer receipt behavior, approval parsing, exact trace route, current plan activity labels, animation stopping at completion, and local view routing.
- Workbench parent is now WOO-674; Todo and Tracer canonical documents point to this document through Properties.
- Context 화면은 전체 Native window 점유율을 하나의 label·meter 계약으로 표시하고 MCP·Skills loaded count와 분리한다.
- 관측되지 않는 source별 token allocation은 가짜 bar 대신 unavailable로 표시한다.
- Preview 합성 fixture는 모든 화면에서 DEMO DATA provenance를 표시한다.
- Dashboard rail의 queue·approval·recording은 System load가 아니라 Session state로 표시한다.
- Cache byte 비율은 capacity occupancy가 아니라 observed logical-byte distribution으로 표시한다.

### Partial

- Workbench's child links are present in Obsidian frontmatter and document validation, but this pilot does not write a new SQLite/ledger projection.
- partial-local-journal resume coverage is represented in the runtime contract, but its user-visible Native TUI behavior was not captured in this pilot.

### Gap

| GAP-ID | 관련 Contract | 내용 | Linear |
|---|---|---|---|
| GAP-WORKBENCH-001 | AC-WORKBENCH-003 | parent wiki links가 SQLite/ledger parent-of edge로 실제 투영됐다는 readback evidence가 이 Vault-only 변경에는 없다. | WOO-674 |
| GAP-WORKBENCH-002 | AC-WORKBENCH-004 | Native TUI의 send→approval wait→cancel→resume 전체 capture가 없다. | WOO-674 |
| GAP-WORKBENCH-003 | Identity | WOO-674에 대한 stable Code-ID와 Spec-ID가 inventory에 아직 등록되지 않았다. | WOO-674 |

## 14. Decisions & Evidence

### Decisions

#### DEC-WORKBENCH-001 · WOO-674을 Workbench parent canonical document로 둔다

**Decision**

Workbench — 대화와 계획을 통제한다의 Linear identity는 WOO-674이다. Todo(WOO-682)와 Tracer(WOO-681)는 이 문서를 Properties parent로 참조한다.

**Why**

Linear hierarchy contract는 WOO-674를 workbench root로, WOO-680을 Layout child로 구분한다. WOO-680/Code-013을 Workbench에 연결하면 Layout과 orchestration의 ownership이 섞인다.

**Alternatives**

WOO-680 Layout document를 parent로 쓰는 안은 거절했다. navigation-only note를 parent로 쓰는 안도 SQLite/ledger identity가 없어서 채택하지 않았다.

**Impact**

WOO-674에 Code-013을 기록하지 않으며, Workbench module들은 Code-ID 미연결 상태를 GAP으로 유지한다.

### Evidence

| Date | Evidence | Covers |
|---|---|---|
| 2026-09-08 | Evidence/2026-09-08-vault-pilot/verification.md | TEST-WORKBENCH-001, TEST-WORKBENCH-002, TEST-WORKBENCH-003 |
| 2026-09-06 | .www/control-ledger/observations/2026-09-06-dirty-worktree-traceability.json | WOO-674 historical implementation/test relations |

#### DEC-WORKBENCH-002 · Context 점유율은 보정 없는 전체 Native window 비율로 표시한다

**Decision**

Context percent와 meter는 `usedTokens / contextWindow`를 공통 입력으로 사용한다. 과거 percent에만 적용하던 12,000-token baseline 보정은 제거한다. MCP·Skills는 loaded capability count로만 표시하고 source별 token allocation은 관측 전까지 unavailable이다.

**Why**

서로 다른 분모를 쓰면 같은 화면의 label과 meter가 충돌한다. 또한 Figma의 예시 source bar를 실제 데이터처럼 복제하면 MCP가 전체 Context 점유율의 원인이라는 잘못된 인과를 만든다.

**Alternatives**

percent에만 baseline을 차감하는 안과 MCP·Skills count를 token share로 환산하는 안은 관측 계약이 없어 거절했다. source별 allocation을 0% bar로 표시하는 안도 unavailable과 observed zero를 구분하지 못해 채택하지 않았다.

**Impact**

기존 snapshot의 `usedTokens`와 `contextWindow`가 유일한 점유율 입력이 된다. source별 token 관측이 추가되기 전에는 allocation meter를 확장하지 않는다.

### 2026-09-22 Evidence

| Date | Evidence | Covers |
|---|---|---|
| 2026-09-22 | docs/audit/2026-09-22-astra-figma-implementation-readiness.md | Figma 50:609의 기능·데이터·시각·불가 항목 대조 |
| 2026-09-22 | test/astra-ui.test.ts, test/session-usage-tracker.test.ts, test/project-workbench.test.ts | TEST-WORKBENCH-005 |

독립 시각 리뷰와 실제 TUI viewport capture는 후속 Evidence로 남아 있으며 전체 다섯 화면 완료를 주장하지 않는다. 이 미결 항목은 Context P0 계약 반영을 막지는 않지만 Figma 전체 수락에는 blocking이다.

#### DEC-WORKBENCH-003 · 관측 범위를 넘는 계측기 의미를 만들지 않는다

**Decision**

Preview 합성 값은 모든 화면에 DEMO DATA provenance를 표시한다. Dashboard의 queue·approval·recording은 Session state이며 system load가 아니다. Cache logicalBytes의 합과 비율은 관측된 byte 분포이며 capacity utilization이 아니다.

**Why**

실제 telemetry가 없는 값을 Figma의 시각적 meter에 그대로 대입하면 상태·용량·분포가 같은 의미처럼 보인다. 화면의 시각적 완성도보다 값의 출처와 분모를 우선한다.

**Alternatives**

Preview에만 암묵적으로 synthetic 값을 두는 안, queue를 system load로 유지하는 안, 알려진 byte 합을 capacity denominator로 사용하는 안은 모두 관측 근거가 없어 거절했다.

**Impact**

실제 OS load 또는 cache capacity source가 추가될 때까지 해당 지표를 capacity meter로 승격하지 않는다. TEST-WORKBENCH-006은 preview provenance, Dashboard Session state, Cache byte distribution 문구를 검증한다.

## Change Log

| Date | Change | Reason |
|---|---|---|
| 2026-09-08 | WOO-674 schema v2 Workbench canonical document로 교정 | Linear readback에서 WOO-680은 Layout, WOO-674는 Workbench root임을 재확인 |
| 2026-09-22 | Context 점유율을 raw Native window 비율로 통일하고 capability count·source unavailable을 분리 | Figma 시각 구조가 MCP count와 전체 점유율을 혼동시키고 label·meter 분모가 달랐던 문제를 교정 |
| 2026-09-22 | Preview provenance, Dashboard Session state, Cache logical-byte distribution 계약을 명시 | 관측되지 않은 system load·capacity를 Figma 장식에서 추론하지 않도록 교정 |

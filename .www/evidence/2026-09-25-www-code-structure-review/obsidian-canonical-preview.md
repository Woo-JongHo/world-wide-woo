---
acceptance: partial
capability: WWW 상태 소유권
code_ids:
  - Code-001
  - Code-002
  - Code-003
  - Code-004
  - Code-005
decision_ids:
  - DEC-WWW-STATE-001
  - DEC-WWW-ORDER-001
  - DEC-WWW-ARCH-001
document_id: 2dcbd54e-eb5c-4cf2-8f4a-6af409974fd6
domain: Architecture
exception_ids:
  - EXC-WWW-STALE-001
  - EXC-WWW-PATCH-001
  - EXC-WWW-SNAPSHOT-001
linear: WOO-842
parent: null
record_type: detailed-canonical
related: []
schema_version: 2
source_revision: worktree:e17837f8a0a5cb226674f397b63b8c6011901670:dirty
spec_ids:
  - SPEC-WWW-STATE-001
status: draft
tags:
  - www/spec
  - domain/architecture
  - capability/state-ownership
  - status/draft
test_ids:
  - TEST-WWW-RUNTIME-001
  - TEST-WWW-STREAM-001
  - TEST-WWW-SNAPSHOT-001
  - TEST-WWW-ASYNC-001
  - TEST-WWW-LAYERS-001
  - TEST-WWW-NOTE-READ-001
  - TEST-WWW-FEATURES-001
updated_at: 2026-09-25T23:54:13+09:00
---

# WWW 상태 소유권 — 화면이 받는 사실과 시점을 고정한다

## 1. Intent

### 사용자 문제

폴더 이름보다 상태의 변경 책임과 화면 전달 시점이 불명확해 같은 사실이 중복되거나 늦은 결과가 다른 범위에 적용될 위험이 있다.

### 기대 결과

각 상태의 writer·identity·revision과 화면 합성 시점을 설명하고 테스트할 수 있다.

### Reference

Git의 현재 core/adapters 구현, WOO-842, `docs/reviews/WWW_CODE_STRUCTURE_CURRENT_STATE_AND_TARGET_2026-09-25.md` §17, `docs/planning/WWW_STATE_OWNERSHIP_REFACTOR_PLAN_2026-09-25.md`를 따른다.

## 2. Scope

### In Scope

- Runtime mode 선택, Activity와 Native delta 합성, late async scope, Snapshot 안정성
- Thread scope 불변식, Port 4그룹과 Feature 읽기 Interface, 완료 Note 읽기
- 7계층 event→frame→terminal-write 관측
- 전체 Hexagonal 경계와 TUI 내부 Controller·ViewModel·View 책임

### Out of Scope

- Inbound/Core/Outbound 폐기
- Legacy Router를 결정 없이 삭제하는 일
- Summary capture identity와 review·promote 정책을 사용자 결정 없이 발명하는 일
- TUI 안에 업무 Model·Service·Repository를 복제하는 일

### Boundary

시스템 전체는 Hexagonal 구조를 유지한다. Core는 Model과 Service/Use Case를, Port는 Repository·Client Interface를, Outbound Adapter는 파일·프로세스·네트워크 구현을 소유한다. TUI 내부는 Controller가 사용자 의도를 Workbench Command로 바꾸고, ViewModel이 Core Projection을 ANSI 없는 화면 의미로 바꾸며, View가 pi-tui·색상·폭·줄바꿈을 담당한다.

## 3. Desired Behavior

### Scenario DB-001 · streaming 응답이 최종 사실로 정착한다

**Given** 같은 turn/item의 휘발 assistant delta가 표시 중이다.

**When** 대응하는 terminal Activity가 journal에 저장된다.

**Then** 최종 Activity가 같은 응답 identity를 차지하고 휘발 표현은 제거되어 중복되지 않는다.

### Scenario DB-002 · 늦은 결과를 버린다

**Given** thread A에서 시작한 비동기 조회 뒤 사용자가 thread B 또는 다른 화면 범위로 이동했다.

**When** A의 결과가 늦게 완료된다.

**Then** 현재 project/thread/request/generation과 맞지 않는 결과는 적용하지 않는다.

### Scenario DB-003 · 과거 Snapshot을 보존한다

**Given** Snapshot A가 이미 발행됐다.

**When** 새 delta와 durable 상태로 Snapshot B가 발행된다.

**Then** A의 배열·메시지·중첩 값은 변하지 않는다.

## 4. Domain Contract

### INV-001

같은 사실에는 하나의 변경 책임만 있다. Activity는 내구 실행 사실, NativeStreamProjection은 미확정 출력, TodoLedger는 사용자 Todo, TNote/Note use case는 요약 산출물과 수명을 소유한다.

### INV-002

`journalSequence`는 내구 append 순서이고 `revision`은 휘발 변화를 포함한 in-process projection 변화다.

### INV-003

Feature 읽기 Interface는 의미만 제공하며 terminal 폭·ANSI·focus 같은 표현 정보를 Core에 넣지 않는다.

### 용어

| 용어 | 정의 |
|---|---|
| Activity | append-only로 보존된 실행 사실 |
| Native delta | terminal 전 휘발 출력 |
| Summary | Activity·turn provenance를 가진 생성 산출물 |
| Note | Summary의 보존·검토·승격 수명 기록 |

## 5. State Model

### 상태

| State | 의미 |
|---|---|
| volatile | Native delta가 아직 terminal Activity로 정착하지 않음 |
| durable | Activity가 journal에 append됨 |
| projected | Snapshot과 Feature Interface에 표시 의미가 계산됨 |
| stale | 현재 scope와 맞지 않는 늦은 외부 결과 |

### 상태 전이

| From | Event / Condition | To | 비고 |
|---|---|---|---|
| volatile | matching terminal append | durable | append 뒤 volatile 제거 |
| durable | snapshot publish | projected | journalSequence 증가 |
| volatile | 다른 owner의 terminal | volatile | 제거하지 않음 |
| any | scope mismatch | stale | 현재 화면에 적용 금지 |

## 6. Data & Runtime Flow

```text
사용자 입력 → TUI Controller → Workbench Command → Core Application
Native event
  ├─ durable normalization → Activity Journal
  └─ delta normalization   → NativeStreamProjection
                 ↓
          ProjectWorkbench composition
                 ↓
        immutable Snapshot / Core Projection
                 ↓
          TUI ViewModel → View → Terminal
                 ↓
render-schedule → layout-materialize → terminal-write
```

### Ownership

| State / Data | Owner | Writer | Reader |
|---|---|---|---|
| durable activity | Core journal coordinator | ActivityJournalStore adapter | Core Projection |
| streaming delta | NativeStreamProjection | Native event lifecycle | Chat Projection |
| UI focus/scroll/overlay | Inbound shell | TUI Controller | View |
| 화면 전용 데이터 | TUI ViewModel | pure mapping | View |
| external read result | injected reader + scope owner | Outbound reader | Core 또는 TUI ViewModel |

## 7. Identity & Persistence Contract

### Identity

| 대상 | ID | 생성 주체 | 유지 범위 |
|---|---|---|---|
| thread/turn/item | Native refs | Native provider | stream→final |
| Activity | activity id + sequence | journal | resume |
| Snapshot | revision + journalSequence | ProjectWorkbench | process |
| Summary/Note | source turn/activity ids + note identity | Core service/store | review·promotion |

### Persistence

Activity·Todo·T-note는 각각의 Adapter에 저장하며 휘발 delta와 UI focus/scroll은 저장 정본이 아니다.

### Resume

Native thread와 journal/Todo/Note scope를 같은 owner에 재결속한다.

### Idempotency / Concurrency

terminal event 중복, 다른 thread rebind, 동일 turn note 중복, stale async 결과를 거부한다.

## 8. Integration Contract

```text
TUI Controller → Workbench Command → Core Application
Core Projection → TUI ViewModel → View
Core use case → Port ← Outbound Adapter
```

단순 외부 읽기는 조립 지점에서 주입한 Interface를 TUI가 사용할 수 있다. 조회 결과가 실행 허용·승인·Note 승격 판단에 영향을 주면 Core Application을 거친다. Inbound는 concrete Outbound 구현을 import하지 않는다. ViewModel은 업무 상태를 변경하지 않고 View는 Port나 Adapter를 알지 않는다.

## 9. Failure & Recovery Contract

| ID | Failure | Detection | User-visible State | Recovery | Preserve |
|---|---|---|---|---|---|
| EXC-WWW-STALE-001 | 이전 thread/request 결과가 늦게 완료 | scope/generation mismatch | 기존 현재 값 유지 또는 stale 표시 | 결과 폐기 후 현재 scope 재조회 | 현재 Snapshot과 durable facts |
| EXC-WWW-PATCH-001 | pi-tui observer patch 누락 | 7계층 E2E에서 완료 경계 부재 | 관측 불완전 | 설치/patch wiring 복구 | Activity와 terminal output |
| EXC-WWW-SNAPSHOT-001 | 새 publish가 과거 Snapshot 참조를 변경 | history stability test | 수락 실패 | clone/freeze ownership 수정 | 이전 Snapshot 값 |

## 10. Acceptance Contract

| AC-ID | Acceptance Criterion | Test-ID | Evidence | Status |
|---|---|---|---|---|
| AC-WWW-001 | capability/config broker > runWww off > 호환 runApp observe Runtime 계약을 session까지 보존한다. | TEST-WWW-RUNTIME-001 | `test/app-runtime-mode.test.ts` | PASS |
| AC-WWW-002 | streaming이 같은 final identity로 정착하며 중복·누락되지 않는다. | TEST-WWW-STREAM-001 | `test/project-workbench-lifecycle.test.ts` | PASS |
| AC-WWW-003 | 이후 publish 뒤에도 과거 Snapshot이 변하지 않는다. | TEST-WWW-SNAPSHOT-001 | `test/project-workbench.test.ts` | PASS |
| AC-WWW-004 | coalescing/no-render/vendor failure를 구분하며 7계층을 추적한다. | TEST-WWW-LAYERS-001 | `test/tui-shell-characterization.test.ts`, `test/layer-performance.test.ts` | PASS |
| AC-WWW-005 | close 또는 새 scope 뒤 늦은 비동기 결과를 적용하지 않는다. | TEST-WWW-ASYNC-001 | `test/project-workbench-async-scope.test.ts` | PASS |
| AC-WWW-006 | 완료 Note를 목록·선택·provenance 상세로 읽고 정확한 empty/stale 상태를 본다. | TEST-WWW-NOTE-READ-001 | `test/tnote-read-flow.test.ts` | PASS |
| AC-WWW-007 | 18 Feature·39 Unit의 실제 책임을 controller·view-model·view·registration에서 찾는다. | TEST-WWW-FEATURES-001 | `test/tui-feature-registry.test.ts`, `test/architecture.test.ts` | PASS |

## 11. Verification Strategy

| Test-ID | 검증 대상 | 방법 | 연결 계약 |
|---|---|---|---|
| TEST-WWW-RUNTIME-001 | capability/config·runWww·runApp 선택표 | app integration | AC-WWW-001 |
| TEST-WWW-STREAM-001 | delta→terminal identity/clear 순서 | Workbench integration | INV-001, AC-WWW-002 |
| TEST-WWW-SNAPSHOT-001 | Snapshot deep history stability | Workbench integration | INV-002, AC-WWW-003 |
| TEST-WWW-ASYNC-001 | close·scope 교체 뒤 late result 폐기 | Workbench integration | AC-WWW-005, EXC-WWW-STALE-001 |
| TEST-WWW-LAYERS-001 | Native event→frame→terminal observer | TUI/vendor integration | AC-WWW-004, EXC-WWW-PATCH-001 |
| TEST-WWW-NOTE-READ-001 | /tnotes 목록→선택→상세와 lifecycle | terminal integration | AC-WWW-006 |
| TEST-WWW-FEATURES-001 | registry identity와 MVC 의존 경계 | architecture | AC-WWW-007 |

## 12. Implementation Map

| Responsibility | Module / Component | Code-ID |
|---|---|---|
| Model·불변식 | `src/core/domain/*` | Code-002 |
| Service/Use Case·Feature Projection | `src/core/application/*`, `workbench-feature-reads.ts` | Code-002 |
| 실행 Port | `src/core/ports/execution/*` | Code-005 |
| 저장 Port | `src/core/ports/persistence/*` | Code-005 |
| 외부 기능 Port | `src/core/ports/integration/*` | Code-005 |
| 관측 Port | `src/core/ports/observability/*` | Code-005 |
| 외부 구현 | `src/adapters/outbound/*` | Code-005 |
| TUI Controller | `src/adapters/inbound/tui/features/*/controller/*` | Code-001 |
| TUI ViewModel | `src/adapters/inbound/tui/features/*/view-model/*` | Code-003 |
| TUI View | `src/adapters/inbound/tui/features/*/view/*` | Code-003 |
| TUI registration | `src/adapters/inbound/tui/features/*/registration/*` | Code-001 |
| shell/render 관측 | `src/adapters/inbound/tui/shell/workbench-shell.ts` | Code-004 |

## 13. Current State & Gaps

### Implemented

- S0-A~E Runtime·stream/final·Snapshot·late result·7계층 E2E 계약
- S1-A~C Thread scope Core 회수, Composer 단일 writer, Todo·Note·외부 reader 계약과 stable Note idempotency
- S2-A Port의 execution·persistence·integration·observability 분리와 직접 import gate
- S2-B/C Plan·Tracer·Chat·Note readonly Feature Projection과 실제 소비 경로
- S3 18 Feature·39 Unit productGroup 분류
- S4-A 완료 Note 목록·선택·provenance 상세 읽기
- S5 WWW 제품명과 broker·off·observe Runtime 정책 분리
- S6 controller 1·view-model 7·view 60·registration 36 물리 이동과 ViewModel terminal 의존 금지

### Partial

- 구조 리팩터링과 독립 코드 리뷰는 완료됐다. 외부 Linear·Obsidian은 Candidate만 있으며 게시·read-back 전이다.
- 고정 Opus 구현 최종 감사는 S0-E에서 조직 정책 403이었고 2026-09-26 전체 재시도는 claude-opus-5로 실행됐으나 5분 30초·51턴 뒤 verdict 없이 tool-use에 머물러 중단했다. 낮은 모델로 대체하지 않았다.

### Gap

| GAP-ID | 관련 Contract | 내용 | Linear |
|---|---|---|---|
| GAP-WWW-005 | INV-001 | 동일 산출물 identity 결정 완료; capture·review·promote lifecycle 구현 대기 | WOO-842 |
| GAP-WWW-006 | DEC-WWW-ARCH-001 | 별도 migration 뒤 폐기 결정 완료; migration 범위·호환 종료 수락 구현 대기 | WOO-842 |
| GAP-WWW-007 | Verification | 고정 Opus 구현 최종 감사 미실행 | WOO-842 |

## 14. Decisions & Evidence

### Open Design Questions

| Q-ID | Question | Cost of Wrong | Options | Next Evidence | Owner | Blocking |
|---|---|---|---|---|---|---|
| Q-WWW-001 | `subscribe(afterSequence)`의 delta-only replay 부재를 유지할 것인가? | late subscriber가 최신 stream을 놓칠 수 있음 | 유지 / revision cursor 추가 | Phase 0 sequence test | Sol | yes |

### Decisions

#### DEC-WWW-STATE-001 · 상태별 단일 writer를 우선한다

**Status**

approved

**Decision**

폴더 이동 전에 상태 변경 책임, 다중 원천 합성, Feature 읽기 Interface를 고정한다.

**Why**

폴더 정리는 중복 writer와 늦은 결과 적용을 해결하지 못한다.

**Alternatives**

기능 폴더부터 일괄 이동하는 안은 검토 단위를 키우므로 기각했다.

**Cost of Wrong**

상태 소유권이 잘못되면 resume·streaming·Note가 조용히 중복 또는 유실될 수 있다.

**Impact**

Phase 0–4가 rename·folder move보다 선행한다.

**Decision Authority**

2026-09-25 사용자 판정.

#### DEC-WWW-ORDER-001 · 보호→소유권→Interface→흐름→명칭→폴더 순서

**Status**

approved

**Decision**

실행 순서를 Phase 0–6으로 고정한다.

**Why**

광범위 rename과 상태 변경을 섞지 않고 회귀 원인을 분리한다.

**Alternatives**

Astra rename과 Chat 폴더 이동을 먼저 하는 안은 기각했다.

**Cost of Wrong**

검토 불가능한 대규모 diff와 runtime 정책 drift가 생긴다.

**Impact**

첫 Sol 작업은 Runtime 선택표 테스트다.

**Decision Authority**

2026-09-25 사용자 판정과 Luna 조사.

#### DEC-WWW-ARCH-001 · 전체 Hexagonal + TUI 내부 MVC를 사용한다

**Status**

approved

**Decision**

외부 연결과 업무 처리는 Hexagonal 경계를 유지하고, Core가 정제한 Projection을 표시하는 TUI 내부는 Controller·ViewModel·View로 나눈다.

**Why**

사용자가 익숙한 MVC·Service·Repository 어휘로 탐색성을 높이면서 현재의 올바른 의존 방향을 보존하기 위해서다.

**Alternatives**

전체 시스템을 MVC로 바꾸는 안과 TUI에 Model·Service·Repository를 중복 생성하는 안은 기각했다. 기존 `contract/projection/presentation/interaction` 기술 슬롯은 탐색 어휘로 사용하지 않는다.

**Cost of Wrong**

TUI가 업무 Model을 복제하면 상태 writer가 다시 늘어나고 View가 외부 구현에 결합된다.

**Impact**

기능별 목표 폴더는 실제 책임이 있는 `controller/view-model/view/registration`만 만들며, Model·Service·Port는 Core에 남긴다.

**Decision Authority**

2026-09-25 사용자 판정.

#### DEC-WWW-NOTE-001 · Summary와 Note는 동일 산출물 identity를 공유한다

**Status**

approved

**Decision**

Summary 내용을 복사해 별도 record를 만들지 않고 같은 provenance 산출물을 Note 수명주기에 등록한다. Note는 보존·검토·승격 상태만 관리한다.

**Why**

동일 내용의 독립 writer와 수정 책임 분기를 막기 위해서다.

**Alternatives**

참조 record와 내용 복사 record를 검토했으며, 별도 identity·writer가 생기는 복사 방식은 기각했다.

**Cost of Wrong**

Summary와 Note가 서로 다른 내용으로 drift하거나 재시도 시 중복 record가 생길 수 있다.

**Impact**

기존 stable source identity와 append-only 저장을 유지하고 capture·review·promote는 같은 산출물 identity의 lifecycle 전이로 구현한다.

**Decision Authority**

2026-09-26 사용자 판정.

#### DEC-WWW-ROUTER-001 · Legacy Router는 별도 migration 뒤 폐기한다

**Status**

approved

**Decision**

Legacy Router를 즉시 삭제하지 않고 공동 session 의존과 사용자 진입을 별도 migration으로 이전·검증한 뒤 폐기한다.

**Why**

WWW 명칭 변경과 실행면 폐기를 분리하면서 기존 session 복원 경로의 회귀를 막기 위해서다.

**Alternatives**

영구 유지와 즉시 삭제를 검토했으며, 제품 표면을 단일화하면서도 안전한 이관 증거를 남기는 단계적 폐기를 선택했다.

**Cost of Wrong**

migration 전 삭제하면 기존 Router session과 공동 사용 코드가 손실될 수 있다.

**Impact**

별도 Linear migration 범위, 호환 기간, read-back과 폐기 수락 테스트가 필요하다.

**Decision Authority**

2026-09-26 사용자 판정.

### Evidence

| Date | Evidence | Covers |
|---|---|---|
| 2026-09-25 | `docs/reviews/WWW_CODE_STRUCTURE_CURRENT_STATE_AND_TARGET_2026-09-25.md` | 구조 검토·Opus 감사 |
| 2026-09-25 | `docs/planning/WWW_STATE_OWNERSHIP_REFACTOR_PLAN_2026-09-25.md` | 실행 계획 |
| 2026-09-25 | `.www/scratchpad/www-refactor-plan-2026-09-25/` | Luna 코드·상태·가독성·문서 조사 |

## Change Log

| Date | Change | Reason |
|---|---|---|
| 2026-09-25 | WOO-842 schema v2 draft Candidate 작성 | 큰 구조 승인과 상태 소유권 우선 실행 순서를 정본화하기 위해 |
| 2026-09-25 | S0-A~D 검증 결과와 Hexagonal + TUI MVC 결정 반영 | 실제 완료 상태와 사용자가 선택한 탐색 어휘를 계약에 맞추기 위해 |
| 2026-09-25 | S0-E~S6 구현 결과, Port 4그룹, Feature Projection·폴더·Note 읽기와 남은 Gap 반영 | 코드·테스트·독립 리뷰 뒤 현재 계약으로 동기화하기 위해 |

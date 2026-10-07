---
acceptance: partial
capability: Provenance
code_ids: []
decision_ids:
  - DEC-PROVENANCE-001
document_id: 041ca2ff-498a-491f-b770-9c6d30a0137d
domain: Runtime
exception_ids:
  - ERR-PROVENANCE-001
linear: WOO-906
parent: null
record_type: detailed-canonical
related:
  - "[[Chat Rendering — 긴 대화에서 진행 표시 렌더 비용을 분리한다]]"
schema_version: 2
source_revision: git:128fedc3528766b903925105ef679b10992fa22e
spec_ids: []
status: draft
tags:
  - www/spec
  - domain/runtime
  - capability/provenance
test_ids:
  - TST-PROVENANCE-001
updated_at: 2026-09-08T23:12:00+09:00
---

# Provenance — 실행 중인 WWW가 검증한 저장소 revision을 증명한다

## 1. Intent

### 사용자 문제

개발자가 workspace에서 수정·테스트한 코드가 실제 terminal의 `www` process에 로드되지 않으면, 성능 수치와 UX 판단이 다른 프로그램을 대상으로 한 것이 된다. 같은 version 문자열만 보면 이 불일치를 발견할 수 없다.

### 기대 결과

실행 중인 WWW의 source root·entrypoint·revision·dirty 상태를 한 번에 확인하고, Evidence가 같은 provenance를 선언할 때만 해당 실행을 검증 근거로 사용한다.

### Reference

2026-09-08 cmux Workbench 진단에서 workspace는 `45aec4a`의 dirty worktree였지만, 실제 `Www` process는 Bun global package의 물리 복사본 entrypoint를 사용했다. 두 위치는 모두 version `0.0.16`이라 version만으로는 차이를 드러내지 못했다.

## 2. Scope

### In Scope

- CLI와 TUI process의 source root, entrypoint, git revision, dirty 상태, package identity 관측
- workspace와 global installation 또는 symlink의 provenance mismatch 판정
- UX Evidence와 PTY 실행본의 provenance 결속

### Out of Scope

- 공개 package release 정책의 전면 재설계
- 사용자가 진행 중인 기존 TUI session의 강제 종료 또는 재시작
- Chat transcript 가상화와 highlighter 교체

### Boundary

Chat renderer는 화면을 빠르게 그리는 책임을 갖고, Runtime Provenance는 그 renderer가 실제로 어떤 source에서 실행 중인지 증명하는 책임을 갖는다.

## 3. Desired Behavior

### Scenario DB-001 · workspace에서 실행

**Given**

개발자가 dirty 또는 clean workspace에서 `www`를 실행한다.

**When**

TUI가 시작되고 diagnostics 또는 Evidence를 만든다.

**Then**

source root, resolved entrypoint, HEAD revision, dirty 상태와 package identity가 같은 관측 record에 표시된다.

### Scenario DB-002 · global copy drift

**Given**

현재 workspace와 다른 물리 global package가 `www` entrypoint로 선택된다.

**When**

개발자가 runtime verification을 시작한다.

**Then**

동일 semver라도 mismatch를 표시하고, 어떤 source를 검증해야 하는지와 재연결 방법을 안내한다.

## 4. Domain Contract

### INV-001

실행 provenance는 version 문자열 하나가 아니라 `sourceRoot + resolvedEntrypoint + revision + dirty + packageIdentity`의 묶음이다.

### INV-002

UX Evidence는 그것을 만든 PTY process provenance를 보존하지 않으면 현재 workspace 변경의 수락 근거가 될 수 없다.

### 용어

| 용어 | 정의 |
|---|---|
| Workspace revision | 개발자가 수정·테스트한 Git HEAD와 dirty 상태 |
| Runtime provenance | 실행 process가 실제로 로드한 source와 revision을 식별하는 record |
| Drift | workspace revision과 runtime provenance가 달라 검증 대상이 바뀐 상태 |

## 5. State Model

### 상태

| State | 의미 |
|---|---|
| unknown | 실행본 provenance를 아직 수집하지 못했다 |
| matched | runtime과 검증 workspace가 같은 source revision을 가리킨다 |
| mismatched | runtime과 workspace가 다른 source 또는 revision을 가리킨다 |
| unverifiable | git 또는 entrypoint 정보를 읽지 못해 일치를 주장할 수 없다 |

### 상태 전이

| From | Event / Condition | To | 비고 |
|---|---|---|---|
| unknown | process provenance 수집 성공 | matched 또는 mismatched | 각 identity field를 대조한다 |
| unknown | entrypoint 또는 revision 수집 실패 | unverifiable | 일치로 승격하지 않는다 |
| mismatched | 새 process를 일치 source에서 시작 | matched | 기존 process는 자동 변경하지 않는다 |

## 6. Data & Runtime Flow

```text
CLI invocation
        ↓
Resolved entrypoint + source root
        ↓
Git HEAD / dirty / package identity
        ↓
Runtime provenance record
        ↓
TUI diagnostics + PTY Evidence
        ↓
Verification acceptance
```

### Ownership

| State / Data | Owner | Writer | Reader |
|---|---|---|---|
| Runtime provenance | Runtime | CLI/TUI bootstrap | diagnostics, Evidence writer |
| Workspace revision | Git worktree | Git | runtime comparator |
| UX Evidence binding | Verification flow | PTY runner | reviewer, acceptance gate |

## 7. Identity & Persistence Contract

### Identity

| 대상 | ID | 생성 주체 | 유지 범위 |
|---|---|---|---|
| Runtime instance | process ID와 start time | OS | process lifetime |
| Provenance record | source root·entrypoint·revision tuple | CLI bootstrap | process lifetime와 Evidence |
| Evidence binding | run ID와 provenance digest | verification flow | Evidence retention period |

### Persistence

민감한 환경 변수나 전체 command line은 저장하지 않는다. 확인에 필요한 source root, entrypoint, revision, dirty 상태, package identity와 측정 시각만 보존한다.

### Resume

재시작한 process는 새 provenance record를 만든다. 이전 record를 새 process의 증거로 재사용하지 않는다.

### Idempotency / Concurrency

동시에 실행 중인 여러 `www` process는 각각 별도 record를 가진다. process ID 또는 tty 없이 가장 최근 record 하나를 현재 실행으로 추정하지 않는다.

## 8. Integration Contract

```text
Workspace Git state
        ↓
CLI bootstrap ─→ Runtime provenance
        ↓                    ↓
Workbench diagnostics     PTY Evidence
        ↓                    ↓
Chat UX acceptance ←───── provenance comparison
```

`WorkbenchChatView`의 렌더 cache 최적화는 관련 문서가 소유하고, 이 계약은 그 최적화가 실제 TUI에 로드됐는지를 판정한다.

## 9. Failure & Recovery Contract

| ID | Failure | Detection | User-visible State | Recovery | Preserve |
|---|---|---|---|---|---|
| ERR-PROVENANCE-001 | global physical package가 workspace와 다른 revision을 실행 | resolved entrypoint와 source root·revision 대조 | `mismatched`와 두 위치 표시 | 일치 workspace link 또는 install로 새 process 시작 | 기존 process, session과 관측 Evidence |
| ERR-PROVENANCE-002 | git revision 또는 entrypoint를 읽을 수 없음 | provenance collector 실패 | `unverifiable` | 원인을 표시하고 검증 수락을 중단 | 수집 가능한 identity와 오류 사유 |

## 10. Acceptance Contract

| AC-ID | Acceptance Criterion | Test-ID | Evidence | Status |
|---|---|---|---|---|
| AC-001 | 현재 TUI process의 source root·entrypoint·revision·dirty 상태를 조회한다 | TST-PROVENANCE-001 | `www provenance --assert-workspace` readback과 `/stats diagnostics` view test | PARTIAL |
| AC-002 | 같은 semver의 다른 source revision을 mismatch로 판정한다 | TST-PROVENANCE-001 | same-semver physical global-copy fixture | PASS |
| AC-003 | UX Evidence가 PTY process provenance와 결속된다 | TST-PROVENANCE-003 | 새 cmux process 필요 | NOT TESTED |

## 11. Verification Strategy

| Test-ID | 검증 대상 | 방법 | 연결 계약 |
|---|---|---|---|
| TST-PROVENANCE-001 | resolved entrypoint와 workspace revision 수집, CLI assertion | Unit / CLI | INV-001, AC-001 |
| TST-PROVENANCE-002 | 동일 semver의 다른 revision fixture | Unit / Integration | INV-001, AC-002 |
| TST-PROVENANCE-003 | 실제 cmux PTY session과 Evidence tuple 일치 | Runtime | INV-002, AC-003 |

`test/runtime-provenance.test.ts`는 physical global copy가 같은 `0.0.16` package version을 가져도 source root와 revision 차이로 `mismatched`가 되는지를 검사한다. `test/cli.test.ts`와 `test/session-stats-view.test.ts`는 CLI assertion과 diagnostics 표면을 검사한다.

## 12. Implementation Map

| Responsibility | Module / Component | Code-ID |
|---|---|---|
| Provenance comparison rule | `src/core/domain/execution/runtime-provenance.ts` | 미발급 |
| File·Git provenance collector | `src/adapters/outbound/workspace/runtime-provenance-source.ts` | 미발급 |
| CLI assertion | `src/cli.ts` | Code-001 |
| TUI diagnostics wiring | `src/adapters/inbound/tui/shell/workbench-shell.ts` | Code-001 |
| Diagnostics rendering | `src/adapters/inbound/tui/dashboard/session-stats-view.ts` | 미발급 |

## 13. Current State & Gaps

### Implemented

`128fedc`는 provenance tuple 수집·비교와 `www provenance --assert-workspace`를 구현했다. clean worktree의 direct CLI readback은 source root, entrypoint, revision, dirty 상태가 `matched`임을 반환했다. 같은 `0.0.16`의 physical global-copy fixture는 `mismatched`로 거부됐다.

### Partial

`/stats diagnostics`는 runtime source root, resolved entrypoint, revision, dirty 상태, expected workspace와 mismatch reasons를 표시한다. 기존 cmux session은 이전 global copy를 메모리에 보존하므로 이 새 표면을 사용할 수 없다.

### Gap

| GAP-ID | 관련 Contract | 내용 | Linear |
|---|---|---|---|
| GAP-PROVENANCE-001 | AC-003 | 새 cmux process의 diagnostics tuple과 Chat UX Evidence를 하나의 runtime run으로 결속하는 PTY scenario가 아직 없다 | WOO-906 |

## 14. Decisions & Evidence

### Decisions

#### DEC-PROVENANCE-001 · version 대신 실행 provenance tuple을 수락 기준으로 사용한다

**Decision**

runtime verification은 version만 비교하지 않고 source root, resolved entrypoint, git revision, dirty 상태, package identity를 함께 기록·대조한다.

**Why**

실제 관측에서 workspace와 global copy가 모두 `0.0.16`이었지만, renderer 수정이 로드되지 않은 서로 다른 source였다.

**Alternatives**

전역 package를 항상 재설치하는 방식은 우연한 drift를 줄일 수 있으나, 어떤 process가 어떤 source를 사용했는지 증명하지 못한다.

**Impact**

Chat 성능, Workflow 상태, 모든 실제 TUI 수락 Evidence에 provenance field가 필요하다. `128fedc` 이후 CLI와 diagnostics 표면이 이 값을 제공한다.

### Evidence

| Date | Evidence | Covers |
|---|---|---|
| 2026-09-08 | `.www/scratchpad/2026-09-08-runtime-provenance-drift/linear-candidate.json` 및 실제 cmux process 관측 | ERR-PROVENANCE-001, DEC-PROVENANCE-001 |
| 2026-09-08 | `git:128fedc3528766b903925105ef679b10992fa22e`, `bun test` 916 pass, `bun src/cli.ts provenance --assert-workspace` | AC-001, AC-002, TST-PROVENANCE-001 |

## Change Log

| Date | Change | Reason |
|---|---|---|
| 2026-09-08 | 초안 생성 | 실제 TUI가 검증 workspace와 다른 global package를 실행한 runtime drift를 기록했다 |
| 2026-09-08 | provenance collector·CLI assertion·diagnostics 구현 기록 | 자동 검증은 통과했으나 PTY Evidence 결속은 아직 수락하지 않았다 |

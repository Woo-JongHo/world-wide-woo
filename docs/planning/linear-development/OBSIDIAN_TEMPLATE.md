# Obsidian 상세 정본 템플릿 · Schema v2

이 템플릿은 WWW 기능의 **상세 정본**이다. Linear의 얇은 작업 이슈나 Git의 실행 결과를 복제하지 않는다. 생성·이동·변경 전에는 [Obsidian 상세 정본 계약](OBSIDIAN_CANONICAL_CONTRACT.md)과 `development-traceability` 스킬을 적용한다.

## 파일명과 Properties

파일 경로는 `<도메인>/<기능명> — <사람이 읽는 제목>.md`다.

```text
Workbench/Todo — AI가 세운 계획을 세션별로 실시간 확인한다.md
Workbench/Tracer — Todo의 내부 실행 과정을 세션별로 실시간 확인한다.md
```

파일명에는 `WOO-NNN`, `Code-NNN`, 번호 접두어, `[라벨]`을 넣지 않는다. 제목이 충돌하면 번호를 붙이지 말고 사용자가 구분할 수 있는 capability 또는 결과로 제목을 구체화한다.

`document_id`는 이동·이름 변경에도 유지되는 UUID다. 외부 ID와 문서 관계는 Properties가 소유한다. `parent`, `related`는 Obsidian wiki-link Property로 작성한다. 본문 `## 연결` 절이나 ID 목록을 만들지 않는다.

```yaml
---
document_id: <uuid-v4>
schema_version: 2
record_type: detailed-canonical
status: draft
acceptance: not-tested
domain: <도메인>
capability: <기능명>
linear: WOO-000
parent: "[[상위 문서 제목]]"
related: []
spec_ids: []
code_ids: []
test_ids: []
exception_ids: []
decision_ids: []
tags:
  - www/spec
  - domain/<도메인 소문자>
  - capability/<기능명 소문자>
source_revision: worktree:<40-char-head>:dirty
updated_at: <ISO-8601>
---
```

`status`는 `draft | active | deprecated`, `acceptance`는 `not-tested | partial | pass | fail`만 사용한다. `draft` 외 상태에는 `<...>` 자리표시를 남길 수 없다.

## 본문

```md
# <기능명> — <사람이 읽는 제목>

## 1. Intent

### 사용자 문제
이 기능이 없어서 사용자가 겪는 문제를 적는다.

### 기대 결과
기능이 존재함으로써 사용자가 얻게 되는 결과를 적는다.

### Reference
참고한 제품·기능·기존 구현이 있다면 기록한다. Reference 전체를 복제하지 않고 채택한 behavior와 채택하지 않은 경계를 적는다.

---

## 2. Scope

### In Scope
이번 기능이 책임지는 범위.

### Out of Scope
의도적으로 하지 않는 범위.

### Boundary
인접 기능과 책임이 나뉘는 지점.

---

## 3. Desired Behavior

사용자가 실제로 관찰해야 하는 동작을 정의한다.

### Scenario DB-001 · 기본 동작

**Given**

조건

**When**

사용자 또는 Runtime의 행동

**Then**

관찰 가능한 결과

### Scenario DB-002 · 다른 주요 동작

동일한 형식으로 작성한다.

---

## 4. Domain Contract

구현이 바뀌어도 지켜져야 하는 규칙을 정의한다.

### INV-001

규칙 설명.

### INV-002

규칙 설명.

### 용어

| 용어 | 정의 |
|---|---|
| Plan | |
| Todo | |
| Activity | |

---

## 5. State Model

### 상태

| State | 의미 |
|---|---|
| pending | |
| running | |
| completed | |
| blocked | |

### 상태 전이

| From | Event / Condition | To | 비고 |
|---|---|---|---|
| pending | 실행 연결 | running | |
| running | 완료 이벤트 | completed | |

허용되지 않는 전이도 필요한 경우 명시한다.

---

## 6. Data & Runtime Flow

기능의 주요 데이터 흐름만 기록한다.

```text
Input / Native Event
        ↓
Activity Journal
        ↓
Projection
        ↓
Todo State
        ↓
Todo View
        ↓
Trace / Evidence
```

### Ownership

| State / Data | Owner | Writer | Reader |
|---|---|---|---|
| Native Plan | | | |
| Activity | | | |
| Todo Projection | | | |
| Todo.md | | | |

---

## 7. Identity & Persistence Contract

### Identity

| 대상 | ID | 생성 주체 | 유지 범위 |
|---|---|---|---|
| Session | | | |
| Turn | | | |
| Plan | | | |
| Todo Item | | | |
| Activity | | | |

### Persistence

저장되는 데이터와 저장되지 않는 데이터를 정의한다.

### Resume

프로세스 또는 애플리케이션 재시작 뒤 복원해야 하는 상태를 정의한다.

### Idempotency / Concurrency

중복 이벤트, 재처리, 동시에 발생한 갱신의 처리 규칙을 정의한다.

---

## 8. Integration Contract

연결되는 기능 사이의 관계와 `explicit | inferred` 근거를 정의한다.

```text
Chat
 └─ Plan
     └─ Todo
         ├─ Activity
         └─ Trace
```

---

## 9. Failure & Recovery Contract

| ID | Failure | Detection | User-visible State | Recovery | Preserve |
|---|---|---|---|---|---|
| ERR-001 | | | | | |
| ERR-002 | | | | | |

`Preserve`에는 실패해도 잃으면 안 되는 데이터·연결·증거를 적는다.

---

## 10. Acceptance Contract

기능 완료 여부를 판단하는 정본이다.

| AC-ID | Acceptance Criterion | Test-ID | Evidence | Status |
|---|---|---|---|---|
| AC-001 | | | | NOT TESTED |
| AC-002 | | | | NOT TESTED |

Status는 `NOT TESTED | PASS | PARTIAL | FAIL`만 사용한다.

---

## 11. Verification Strategy

실행 결과가 아니라 무엇을 왜 검증해야 하는지 적는다.

| Test-ID | 검증 대상 | 방법 | 연결 계약 |
|---|---|---|---|
| TST-001 | | Unit / Integration / Runtime | AC-001 |
| TST-002 | | | INV-001 |
| TST-003 | | | ERR-001 |

실제 실행 횟수, assertion 수, binary hash는 Evidence와 Receipt가 소유한다.

---

## 12. Implementation Map

현재 구현과 Contract의 연결을 보여주는 파생 영역이다. 구조 변경 시 갱신하지만 Contract 자체로 취급하지 않는다.

| Responsibility | Module / Component | Code-ID |
|---|---|---|
| | | |

---

## 13. Current State & Gaps

### Implemented

현재 Contract 중 구현된 부분.

### Partial

일부만 구현된 부분.

### Gap

| GAP-ID | 관련 Contract | 내용 | Linear |
|---|---|---|---|
| GAP-001 | AC-000 | | |

---

## 14. Decisions & Evidence

### Decisions

#### DEC-001 · 결정 제목

**Decision**

선택한 내용.

**Why**

선택 이유.

**Alternatives**

검토했지만 선택하지 않은 대안.

**Impact**

이 결정으로 영향을 받는 Contract.

### Evidence

실행 결과 전문을 복사하지 않고 Evidence를 연결한다.

| Date | Evidence | Covers |
|---|---|---|
| | | AC-001, TST-001 |

---

## Change Log

| Date | Change | Reason |
|---|---|---|
| | | |
```

## 예시 표기

체크박스·시나리오·표·코드가 실제 작업 또는 실제 결과가 아닌 설명용 예시라면 바로 위에 다음 문구를 쓴다.

> **표현 예시 — 실제 데이터가 아님**

이 표기가 없는 예시는 실제 계약·상태·증거로 읽힌다. `draft`의 template marker는 이 규칙의 예외지만, `active` 문서에는 남길 수 없다.

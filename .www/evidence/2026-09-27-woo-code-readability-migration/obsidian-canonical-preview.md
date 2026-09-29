---
acceptance: partial
capability: 코드 가독성 이중 저장소 동기화
code_ids: []
decision_ids:
  - DEC-READABILITY-COPIES-001
  - DEC-READABILITY-BOUNDARY-001
document_id: bf5ba990-e73a-47c7-8617-04617ef5336f
domain: Development
exception_ids:
  - EXC-READABILITY-DRIFT-001
  - EXC-READABILITY-LINK-001
linear: WOO-911
parent: null
record_type: detailed-canonical
related: []
schema_version: 2
source_revision: worktree:216b9d9faa09bcb19151f0f188792e8ce7113bf6:dirty
spec_ids:
  - SPEC-READABILITY-001
status: draft
tags:
  - www/spec
  - domain/development
  - capability/code-readability
  - status/draft
test_ids:
  - TEST-READABILITY-TOOLS-001
  - TEST-READABILITY-WWW-INTEGRATION-001
updated_at: 2026-09-27T02:30:00+09:00
---

# 코드 가독성 — 여러 에이전트가 하나의 규칙과 검사기를 사용한다

## 1. Intent

### 사용자 문제

99_www 제품 규칙과 98_Plugin 배포 규칙은 현재 같아야 하지만 소유권과 변경 주기는 다르다.

### 기대 결과

두 저장소가 실제 파일을 각각 소유하고, 동기화 시점에는 byte 동일성을 검증한다.

## 2. Scope

### In Scope

- 99_www 제품 로컬 Skill 복사본
- 98_Plugin 배포용 Skill 복사본
- 현재 내용 동일성 검사

### Out of Scope

- 두 저장소를 symlink로 결합
- 한쪽 변경의 자동 덮어쓰기
- 외부 marketplace 게시

## 3. Desired Behavior

### Scenario DB-001 · 독립 소유

두 Skill의 realpath는 다르고 각 Git 저장소가 자기 파일을 추적한다.

### Scenario DB-002 · 동기화 확인

동기화 완료 시 두 디렉터리의 재귀 diff가 비어 있다.

### Scenario DB-003 · 제품 실행

99_www 검사는 제품 로컬 Skill 경로로 실행된다.

## 4. Domain Contract

### INV-001

99_www는 `.agents/skills/woo-code-readability/`를 제품 로컬 파일로 소유한다.

### INV-002

98_Plugin은 `skills/woo-code-readability/`를 배포 파일로 소유한다.

### INV-003

동기화는 명시적 작업이며 symlink가 두 소유권을 합치지 않는다.

## 5. State Model

| State | 의미 |
|---|---|
| aligned | 두 복사본의 재귀 diff가 비어 있음 |
| drifted | 내용 차이가 존재함 |
| reviewed | 차이를 검토해 반영 방향을 결정함 |

`drifted → reviewed → aligned`는 명시적 검토와 복사·검증으로만 전이한다.

## 6. Data & Runtime Flow

```text
99_www product skill ← explicit reviewed sync → 98_Plugin distribution skill
        ↓ product checks                         ↓ global/plugin consumers
```

## 7. Identity & Persistence Contract

두 Skill은 이름은 같지만 저장소 identity가 다르다. identity는 저장소 root와 상대 경로의 조합이며, 동일성은 realpath가 아니라 재귀 content diff로 판정한다.

## 8. Integration Contract

99_www의 AGENTS.md와 테스트는 제품 로컬 경로를 사용한다. Codex 전역 설치는 98_Plugin 경로를 가리킨다. 어느 쪽도 상대 저장소를 runtime symlink로 참조하지 않는다.

## 9. Failure & Recovery Contract

| ID | Failure | Detection | Recovery |
|---|---|---|---|
| EXC-READABILITY-DRIFT-001 | 복사본 내용 불일치 | `diff -qr` 실패 | 차이를 검토하고 선택한 방향으로 동기화 |
| EXC-READABILITY-LINK-001 | 제품 Skill이 symlink로 회귀 | `lstat` 검사 실패 | 실제 디렉터리로 복원 |

## 10. Acceptance Contract

| AC-ID | Acceptance Criterion | Status |
|---|---|---|
| AC-READABILITY-001 | 두 Skill의 realpath가 다르다 | PASS |
| AC-READABILITY-002 | 두 디렉터리의 재귀 diff가 비어 있다 | PASS |
| AC-READABILITY-003 | 98_Plugin 106개와 WWW 통합 2개 테스트가 통과한다 | PASS |

## 11. Verification Strategy

- `diff -qr`로 현재 byte 동일성을 확인한다.
- WWW 통합 테스트로 실제 디렉터리·상이한 realpath·제품 검사 실행을 확인한다.
- 98_Plugin 전체 suite로 배포 복사본의 106개 행동을 확인한다.

## 12. Implementation Map

| Responsibility | Module / Component |
|---|---|
| 제품 Skill | `.agents/skills/woo-code-readability/` |
| 배포 Skill | `../98_Plugin/skills/woo-code-readability/` |
| 독립성·동일성 회귀 | `test/code-readability-tools.test.ts` |

## 13. Current State & Gaps

두 저장소는 각각 실제 디렉터리를 소유하고 현재 70개 Skill 파일이 동일하다. TypeScript call-statements는 호출 대상·matcher 괄호, matcher 점, 종결 세미콜론과 우측 주석 열을 검사한다. object-rows는 여는·닫는 중괄호와 위치별 속성·콜론·값·쉼표·행 꼬리를 검사하며 마지막 속성 trailing comma도 보존한다. 자동 양방향 병합은 없고, 향후 drift가 발견되면 변경 의도와 소유권을 검토해야 한다.

## 14. Decisions & Evidence

### Decisions

#### DEC-READABILITY-COPIES-001 · 두 저장소가 별도 복사본을 소유한다

**Decision**

99_www 제품용과 98_Plugin 배포용 Skill을 symlink가 아닌 실제 파일로 각각 관리한다.

**Why**

두 저장소의 책임과 변경 주기가 다르며 한 저장소의 편집이 다른 저장소에 즉시 전파되면 안 된다.

**Rejected**

98_Plugin을 유일 원본으로 두고 99_www가 참조하는 방식은 사용자 정정으로 폐기했다.

### Evidence

2026-09-27: 70개 파일 재귀 diff 없음, plugin 106 pass, WWW integration 2 pass.

## Change Log

| Date | Change | Reason |
|---|---|---|
| 2026-09-27 | 단일 원본 symlink 결정을 독립 복사본 계약으로 교정 | 저장소별 관리 책임이 다르다는 사용자 정정 |

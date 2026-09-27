---
acceptance: partial
capability: 코드 가독성 단일 원본
code_ids: []
decision_ids:
  - DEC-READABILITY-SOURCE-001
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

같은 이름의 가독성 스킬이 프로젝트와 에이전트 전역 경로에 서로 다른 사본으로 존재하면 어떤 규칙과 스크립트가 실행되는지 사용자가 예측할 수 없다.

### 기대 결과

Codex, Claude, ZCode 계열, Pi·OMP와 프로젝트 로컬 경로가 하나의 규칙·검사기 원본을 참조하고, 제품 전용 운영 정책은 해당 제품 저장소가 소유한다.

### Reference

`docs/research/2026-09-26-woo-code-readability-omp-distribution.md`의 skill + 독립 도구 경계를 채택했다. npm·OMP marketplace 공개는 아직 채택하지 않았다.

## 2. Scope

### In Scope

- TypeScript 가독성 계약, 결정론적 검사기, fixtures와 도구 테스트의 단일 원본
- 에이전트별 발견 경로를 symlink로 연결하는 설치 계약
- 99_www와 Codex 전역 경로의 이관·복구·검증

### Out of Scope

- npm·GitHub·OMP marketplace 공개
- 세션 lifecycle extension과 자동 실행 hook
- 각 제품 저장소의 Receipt, 승인 흐름, Code-ID와 아키텍처 게이트

### Boundary

standalone 저장소는 범용 규칙과 실행 가능한 검사기를 소유한다. 99_www는 스킬 적용 시점, 제품 검사자, Evidence·Receipt와 제품 테스트를 소유한다.

## 3. Desired Behavior

### Scenario DB-001 · 모든 발견 경로가 같은 정본을 읽는다

**Given** 여러 에이전트에 `woo-code-readability`가 설치돼 있다.

**When** 각 발견 경로의 실제 위치와 SKILL.md digest를 읽는다.

**Then** 같은 standalone 디렉터리와 같은 digest가 관찰된다.

### Scenario DB-002 · 제품 경계를 보존한다

**Given** 설치된 검사기가 제품 저장소 파일을 검사한다.

**When** 제품 파일은 저장소 안에 있고 symlink 너머의 스킬 구현은 저장소 밖에 있다.

**Then** 검사기는 제품 파일을 처리하지만 저장소 밖 임의 대상 파일은 거부한다.

### Scenario DB-003 · 기존 사본을 복구할 수 있다

**Given** 발견 경로에 일반 디렉터리 사본이 있다.

**When** 설치기가 symlink로 전환한다.

**Then** 기존 사본은 타임스탬프 백업으로 보존되고 새 경로는 단일 원본을 가리킨다.

## 4. Domain Contract

### INV-001

가독성 규칙, references, scripts와 fixtures의 작성 원본은 standalone `skills/woo-code-readability/` 하나다.

### INV-002

에이전트 발견 경로는 복사본이 아니라 standalone 원본을 가리키는 symlink다.

### INV-003

WWW Receipt·승인·Linear·Obsidian 경로는 범용 스킬에 들어가지 않고 99_www가 소유한다.

### 용어

| 용어 | 정의 |
|---|---|
| standalone 정본 | `woo-readability/skills/woo-code-readability/` |
| 발견 경로 | 각 에이전트가 스킬을 검색하는 디렉터리 |
| 제품 어댑터 | 적용 시점·검사자·Receipt를 제품 저장소에 결속하는 규칙 |

## 5. State Model

### 상태

| State | 의미 |
|---|---|
| copied | 발견 경로가 독립 일반 디렉터리다 |
| backed-up | 기존 사본이 복구용 이름으로 이동했다 |
| linked | 발견 경로가 standalone 정본을 가리킨다 |
| drifted | 실제 경로나 digest가 정본과 다르다 |

### 상태 전이

| From | Event / Condition | To | 비고 |
|---|---|---|---|
| copied | install | backed-up | 기존 파일 보존 |
| backed-up | symlink create | linked | read-back 필요 |
| linked | target move 또는 copy overwrite | drifted | 검사 실패 |
| drifted | relink | linked | realpath·digest 재검증 |

## 6. Data & Runtime Flow

```text
standalone SKILL.md + references + scripts + fixtures
                    ↓ symlink discovery
Codex / Claude / ZCode / Pi·OMP / project-local
                    ↓ product file path
repository boundary check → deterministic inspector → result
```

### Ownership

| State / Data | Owner | Writer | Reader |
|---|---|---|---|
| 범용 가독성 계약 | woo-readability | standalone maintainers | installed agents |
| 검사기와 fixtures | woo-readability | standalone maintainers | Bun·TypeScript runtime |
| 제품 적용 정책 | product repository | product maintainers | product agents |
| 이관 Evidence | 99_www | WWW workflow | review·recording gates |

## 7. Identity & Persistence Contract

### Identity

| 대상 | ID | 생성 주체 | 유지 범위 |
|---|---|---|---|
| skill | `woo-code-readability` | standalone repository | 모든 에이전트 |
| source | canonical realpath + content digest | filesystem·Git | 설치 read-back |
| backup | destination + UTC timestamp | install.sh | 수동 복구까지 |

### Persistence

정본 파일과 테스트는 standalone Git 저장소에 유지한다. 발견 경로에는 symlink만 둔다.

### Resume

새 머신은 standalone 저장소를 받은 뒤 `install.sh`로 필요한 발견 경로를 다시 연결한다.

### Idempotency / Concurrency

이미 같은 실제 경로를 가리키는 설치는 `already linked`로 종료한다. 서로 다른 목적지는 덮어쓰지 않고 별도 백업한 뒤 연결한다.

## 8. Integration Contract

```text
99_www AGENTS.md → .agents/skills/woo-code-readability symlink
Codex inventory   → ~/.codex/skills/woo-code-readability symlink
                              ↓
              standalone skill + TypeScript 7
```

프로젝트 로컬 포인터는 기존 상대 경로를 유지한다. 설치기는 Codex·Claude·공용 Agent Skills·Pi와 프로젝트 로컬 대상을 명시적으로 선택한다. 공개 marketplace 배포는 별도 capability다.

## 9. Failure & Recovery Contract

| ID | Failure | Detection | User-visible State | Recovery | Preserve |
|---|---|---|---|---|---|
| EXC-READABILITY-DRIFT-001 | 동명 사본이 다른 규칙을 제공 | realpath·digest 불일치 | 호출 결과가 경로별로 달라짐 | 구본 백업 후 relink | 구본과 변경 이력 |
| EXC-READABILITY-LINK-001 | standalone 이동으로 symlink 단절 | `test -e`, quick_validate 실패 | 스킬 발견 또는 스크립트 실행 실패 | 저장소 복원 또는 새 경로로 relink | 제품 코드와 Evidence |

## 10. Acceptance Contract

| AC-ID | Acceptance Criterion | Test-ID | Evidence | Status |
|---|---|---|---|---|
| AC-READABILITY-001 | standalone 검사기의 기존 30개 행동이 최종 위치에서 통과한다. | TEST-READABILITY-TOOLS-001 | `.www/evidence/2026-09-27-woo-code-readability-migration/receipt.json` | PASS |
| AC-READABILITY-002 | 99_www 경로가 standalone 정본을 가리키고 제품 파일 검사가 실행된다. | TEST-READABILITY-WWW-INTEGRATION-001 | `test/code-readability-tools.test.ts` | PASS |
| AC-READABILITY-003 | Codex 전역 경로와 99_www 경로의 realpath·SKILL.md digest가 같다. | TEST-READABILITY-WWW-INTEGRATION-001 | migration Receipt | PASS |
| AC-READABILITY-004 | Claude·ZCode·Pi 설치 경로와 공개 배포가 실제 소비 환경에서 검증된다. | NOT ASSIGNED | 미실행 | NOT TESTED |

## 11. Verification Strategy

| Test-ID | 검증 대상 | 방법 | 연결 계약 |
|---|---|---|---|
| TEST-READABILITY-TOOLS-001 | import·AST·LSP·표 정렬·조건·함수 지도 | standalone black-box | AC-READABILITY-001 |
| TEST-READABILITY-WWW-INTEGRATION-001 | project symlink와 repository boundary | product integration | AC-READABILITY-002, AC-READABILITY-003 |

새 에이전트 배포 채널은 실제 발견·호출 read-back을 추가한 뒤 AC-READABILITY-004를 갱신한다.

## 12. Implementation Map

| Responsibility | Module / Component | Code-ID |
|---|---|---|
| 범용 skill | `../woo-readability/skills/woo-code-readability/` | N/A |
| 설치·백업 | `../woo-readability/install.sh` | N/A |
| 포팅 계약 | `../woo-readability/docs/agent-portability.md` | N/A |
| 독립 회귀 | `../woo-readability/test/code-readability-tools.test.ts` | N/A |
| WWW 연결 회귀 | `test/code-readability-tools.test.ts` | N/A |

## 13. Current State & Gaps

### Implemented

- standalone 저장소와 Bun·TypeScript 7 의존성
- 범용화된 SKILL.md, references, scripts, fixtures
- Codex·Claude·공용 Agent Skills·Pi·프로젝트 설치기
- 99_www·Codex symlink와 백업
- standalone 30개 및 WWW 통합 2개 테스트

### Partial

- 현재 저장소들은 미커밋 상태이며 외부 게시·read-back 전이다.

### Gap

| GAP-ID | 관련 Contract | 내용 | Linear |
|---|---|---|---|
| GAP-READABILITY-001 | AC-READABILITY-004 | Claude·ZCode·Pi 실제 발견 경로 미검증 | WOO-911 |
| GAP-READABILITY-002 | Integration | npm·GitHub·OMP marketplace 공개 계약 미구현 | WOO-911 |

## 14. Decisions & Evidence

### Open Design Questions

| Q-ID | Question | Cost of Wrong | Options | Next Evidence | Owner | Blocking |
|---|---|---|---|---|---|---|
| Q-READABILITY-001 | 첫 공개 배포 채널을 GitHub+OMP와 npm 중 어디로 둘 것인가? | 설치·업데이트 계약 재작업 | GitHub/OMP 우선 / npm 동시 | 실제 OMP 설치 smoke와 패키지 이름 결정 | WOO-911 | no |

### Decisions

#### DEC-READABILITY-SOURCE-001 · standalone 단일 원본을 사용한다

**Status**

approved

**Decision**

가독성 규칙과 검사기를 99_www 밖 형제 저장소의 단일 원본으로 이관하고 모든 발견 경로는 symlink로 연결한다.

**Why**

복사 설치는 규칙과 실행 경로가 다시 갈라지는 구조적 원인이다.

**Alternatives**

99_www 정본을 전역 경로에서 직접 가리키는 안과 도구별 복사 설치를 검토했으며, 독립 배포와 갱신을 막거나 drift를 재발시키므로 기각했다.

**Cost of Wrong**

standalone 위치가 불안정하면 모든 소비 경로가 동시에 끊긴다. 백업과 link read-back으로 복구 가능성을 유지한다.

**Impact**

정본 수정과 테스트는 woo-readability에서 수행하고 99_www는 제품 통합 테스트만 소유한다.

**Decision Authority**

2026-09-27 사용자 선택 `이관`과 migration Receipt.

#### DEC-READABILITY-BOUNDARY-001 · 제품 운영 정책은 제품 저장소에 남긴다

**Status**

approved

**Decision**

Receipt, Linear·Obsidian 연결, 한 파일 승인 흐름과 제품 검사자 정의를 범용 스킬에서 분리한다.

**Why**

다른 에이전트와 저장소가 99_www의 schema·evidence 경로에 결합되지 않게 하기 위해서다.

**Alternatives**

현재 스킬 폴더 전체를 그대로 배포하는 안은 범용 사용자가 존재하지 않는 WWW 경로를 실행하게 하므로 기각했다.

**Cost of Wrong**

경계를 너무 얇게 잡으면 필수 안전 규칙이 제품 어댑터에서 누락될 수 있다. 제품 통합 테스트와 AGENTS.md 포인터가 이를 감시한다.

**Impact**

standalone과 99_www가 각각 독립 테스트와 통합 테스트를 소유한다.

**Decision Authority**

2026-09-27 사용자 선택과 `docs/research/2026-09-26-woo-code-readability-omp-distribution.md`.

### Evidence

| Date | Evidence | Covers |
|---|---|---|
| 2026-09-26 | `docs/research/2026-09-26-woo-code-readability-omp-distribution.md` | 배포 경계 조사 |
| 2026-09-27 | `.www/evidence/2026-09-27-woo-code-readability-migration/receipt.json` | 이관·테스트·링크 read-back |

## Change Log

| Date | Change | Reason |
|---|---|---|
| 2026-09-27 | WOO-911 schema v2 draft Candidate 작성 | standalone 단일 원본과 제품 운영 정책의 권위 경계를 기록하기 위해 |

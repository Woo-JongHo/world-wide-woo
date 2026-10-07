---
document_id: 5fe819c3-4914-44b2-9a14-36d32634bb0a
linear: WOO-891
record_type: detailed-canonical
schema_version: 2
status: draft
acceptance: not-tested
domain: RPA
capability: RPA Intake
parent: null
related: ["[[01_프로젝트/99_WWW/01_문서/Agents/RPA Agent — 의도와 Skill 실행을 조정한다]]"]
spec_ids: [RPA-007]
code_ids: []
test_ids: [TEST-RPA-007]
exception_ids: [EXC-RPA-007]
decision_ids: [DEC-RPA-007]
tags: [www/spec, domain/skills, capability/rpa-intake]
updated_at: 2026-09-08T14:20:00+09:00
source_revision: worktree:87c21b5da12793b78523b447d48de171d6eb6e13:dirty
---
# RPA Intake — 안전한 업무 사실을 수집한다

## 1. Intent
RPA 작업 전에 원격 코드와 업무 자료를 revision이 고정된 사실 Receipt로 만든다.
## 2. Scope
저장소 상태, map, 코드, 예외, 테스트, 메일과 외부 쓰기 경계를 포함한다.
## 3. Desired Behavior
관측 사실과 unknown을 분리하고 고객 데이터 대신 경로·존재·digest만 보존한다.
## 4. Domain Contract
입력은 대상과 읽기 범위, 출력은 source revision·출처·차이·누락을 가진 Receipt다.
## 5. State Model
`requested → scoped → collected → sanitized → verified`이며 접근 실패는 `blocked`다.
## 6. Data & Runtime Flow
revision을 먼저 고정하고 관련 원본을 읽은 뒤 map·code 차이와 안전 경계를 정리한다.
## 7. Identity & Persistence Contract
Skill ID는 `RPA-INTAKE`, Work는 WOO-891이며 모든 사실은 source revision으로 돌아간다.
## 8. Integration Contract
신규 개발은 Design, 장애 요청은 Maintenance에 같은 Receipt를 전달한다.
## 9. Failure & Recovery Contract
접근 실패는 업무 없음으로 해석하지 않으며 실패 위치와 재개 조건을 남긴다.
## 10. Acceptance Contract
revision, map·code 차이, 예외·테스트 누락, 메시지·외부 쓰기 경계가 모두 있어야 한다.
## 11. Verification Strategy
clean·dirty 저장소, 누락 map, 접근 실패, 민감정보 포함 표본으로 수집과 정제를 시험한다.
## 12. Implementation Map
실행 지침은 `.agents/skills/rpa-intake/SKILL.md`, 공통 출력은 RPA Receipt 계약이 소유한다.
## 13. Current State & Gaps
Skill 지침과 작업 계약은 존재하나 실제 원격 저장소 E2E Evidence는 아직 없다.
## 14. Decisions & Evidence
DEC-RPA-007: 수집 실패는 빈 업무가 아니라 BLOCKED다. WOO-891이 작업 증거다.
## Change Log
- 2026-09-08: Intake 상세 계약을 생성했다.

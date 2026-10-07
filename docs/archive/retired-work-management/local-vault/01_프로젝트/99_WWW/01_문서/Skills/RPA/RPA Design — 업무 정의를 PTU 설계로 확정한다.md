---
document_id: f4f19483-f284-4be1-812b-99aac4b26a73
linear: WOO-885
record_type: detailed-canonical
schema_version: 2
status: draft
acceptance: not-tested
domain: RPA
capability: RPA Design
parent: null
related: ["[[01_프로젝트/99_WWW/01_문서/Agents/RPA Agent — 의도와 Skill 실행을 조정한다]]"]
spec_ids: [RPA-002]
code_ids: []
test_ids: [TEST-RPA-002]
exception_ids: [EXC-RPA-002]
decision_ids: [DEC-RPA-002]
tags: [www/spec, domain/skills, capability/rpa-design]
updated_at: 2026-09-08T14:00:00+09:00
source_revision: worktree:87c21b5da12793b78523b447d48de171d6eb6e13:dirty
---
# RPA Design — 업무 정의를 PTU 설계로 확정한다

## 1. Intent
업무정의서와 담당자 대화를 구현 전의 완전한 Process·Task·Unit 계약으로 바꾼다.
## 2. Scope
수동 기준선, 입출력, 판단, 부작용, 승인, 재실행, PTU와 sequence를 포함한다. 운영 실행은 제외한다.
## 3. Desired Behavior
정의된 사실과 결정을 분리하고, 누락된 필수 계약은 한 초점 질문과 선택지로 확정한다.
## 4. Domain Contract
Process는 지속 업무, Task는 독립 개발·검증 단위, Unit은 Task 안의 안정 책임이다. 순서는 identity가 아니다.
## 5. State Model
`collected → questioned → mapped → safety-checked → publishable`이며 미결정 필드가 있으면 `questioned`에 머문다.
## 6. Data & Runtime Flow
업무정의서 수집 후 수동 절차를 정규화하고 PTU 안정 ID, 입력·출력, 부작용과 sequence를 생성한다.
## 7. Identity & Persistence Contract
Skill ID는 `RPA-DESIGN`, Work는 WOO-885다. 생성한 프로젝트 ID는 revision과 함께 `rpa-map`에 보존한다.
## 8. Integration Contract
RPA Agent가 호출하며 `rpa-intake`의 사실을 받아 `rpa-build`가 구현할 확정 계약을 전달한다.
## 9. Failure & Recovery Contract
출처 없는 업무 규칙과 확인되지 않은 재실행 정책은 추정하지 않는다. 미결정 항목과 재개 질문을 Receipt에 남긴다.
## 10. Acceptance Contract
모든 Task가 목적·입력·출력·Unit·부작용·완료 조건을 가지며 안정 ID와 실행 순서가 구분되어야 한다.
## 11. Verification Strategy
완전한 정의서, 단계 누락, 상충 규칙, 사람 판단, 외부 쓰기와 메일을 포함한 표본으로 Gate를 시험한다.
## 12. Implementation Map
정규화는 `.agents/skills/rpa-map`, 수집은 `rpa-intake`, 안전 검증은 `rpa-safety`가 소유한다.
## 13. Current State & Gaps
공통 절차와 Linear 작업은 존재한다. 자동 질문 집합과 프로젝트 생성 E2E Evidence는 아직 없다.
## 14. Decisions & Evidence
DEC-RPA-002: 프로젝트별 상세 업무는 Linear와 rpa-map을 기본 원본으로 유지한다. WOO-885가 현재 작업 정의다.
## Change Log
- 2026-09-08: 신규 개발 계약 초안을 생성했다.

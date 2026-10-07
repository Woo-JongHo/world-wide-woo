---
document_id: 171baaae-434e-409e-91b1-ea74b586d9c8
linear: WOO-890
record_type: detailed-canonical
schema_version: 2
status: draft
acceptance: not-tested
domain: RPA
capability: RPA Publish
parent: null
related: ["[[01_프로젝트/99_WWW/01_문서/Agents/RPA Agent — 의도와 Skill 실행을 조정한다]]"]
spec_ids: [RPA-009]
code_ids: []
test_ids: [TEST-RPA-009]
exception_ids: [EXC-RPA-009]
decision_ids: [DEC-RPA-009]
tags: [www/spec, domain/skills, capability/rpa-publish]
updated_at: 2026-09-08T14:20:00+09:00
source_revision: worktree:87c21b5da12793b78523b447d48de171d6eb6e13:dirty
---
# RPA Publish — 검증된 계약을 게시한다

## 1. Intent
안전 검증된 RPA 계약을 승인 범위의 Linear와 Obsidian에 게시한다.
## 2. Scope
snapshot, 중복 대조, 초안, 승인, 반영과 read-back을 포함한다.
## 3. Desired Behavior
Linear에는 작업 상태를, Obsidian에는 필요한 상세 계약을 쓰고 두 표면을 재조회한다.
## 4. Domain Contract
입력은 PASS 또는 명시적 PARTIAL Safety Receipt, 출력은 identity와 digest를 가진 Publish Receipt다.
## 5. State Model
`snapshotted → drafted → gated → authorized → applied → read-back`을 사용한다.
## 6. Data & Runtime Flow
기존 구조를 저장하고 초안을 검증한 뒤 승인된 변경만 적용하고 양쪽을 다시 읽는다.
## 7. Identity & Persistence Contract
Skill ID는 `RPA-PUBLISH`, Work는 WOO-890이며 기존 Linear UUID와 document_id를 유지한다.
## 8. Integration Contract
Safety 결과를 받아 Linear 계층 계약과 Obsidian schema v2를 적용하고 Reconcile로 넘긴다.
## 9. Failure & Recovery Contract
snapshot 변화, digest 불일치, 중복 identity는 반영을 중단하고 새 초안을 요구한다.
## 10. Acceptance Contract
승인된 초안과 Linear·Obsidian read-back의 parent·ID·내용·digest가 일치해야 한다.
## 11. Verification Strategy
중복, 동시 변경, 잘못된 parent, stale digest와 정상 게시 시나리오를 검증한다.
## 12. Implementation Map
실행 지침은 `.agents/skills/rpa-publish/SKILL.md`, 각 표면의 계약 Skill을 함께 적용한다.
## 13. Current State & Gaps
게시 지침과 작업 계약은 존재하지만 7개 전체를 대상으로 한 통합 게시 Evidence는 아직 없다.
## 14. Decisions & Evidence
DEC-RPA-009: 게시와 정합 감사를 분리해 적용 직후 독립 read-back을 수행한다. WOO-890이 증거다.
## Change Log
- 2026-09-08: Publish 상세 계약을 생성했다.

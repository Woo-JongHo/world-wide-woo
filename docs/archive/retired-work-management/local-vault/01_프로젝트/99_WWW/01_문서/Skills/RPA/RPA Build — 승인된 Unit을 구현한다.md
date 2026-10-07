---
document_id: 6c790e19-f41e-4899-aed1-a05930776573
linear: WOO-889
record_type: detailed-canonical
schema_version: 2
status: draft
acceptance: not-tested
domain: RPA
capability: RPA Build
parent: null
related: ["[[01_프로젝트/99_WWW/01_문서/Agents/RPA Agent — 의도와 Skill 실행을 조정한다]]"]
spec_ids: [RPA-008]
code_ids: []
test_ids: [TEST-RPA-008]
exception_ids: [EXC-RPA-008]
decision_ids: [DEC-RPA-008]
tags: [www/spec, domain/skills, capability/rpa-build]
updated_at: 2026-09-08T14:20:00+09:00
source_revision: worktree:87c21b5da12793b78523b447d48de171d6eb6e13:dirty
---
# RPA Build — 승인된 Unit을 구현한다

## 1. Intent
확정된 PTU 설계를 실제 자동화 코드·설정·테스트로 구현한다.
## 2. Scope
승인된 Unit 변경과 격리 검증을 포함하며 실제 고객 실행은 별도 승인을 요구한다.
## 3. Desired Behavior
모든 코드 변경이 한 Unit 계약으로 되돌아가고 업무 규칙과 외부 adapter가 분리된다.
## 4. Domain Contract
입력은 Design Receipt, 출력은 변경 위치·검증·미검증 환경을 가진 Build Receipt다.
## 5. State Model
`accepted → bounded → implemented → locally-verified → handed-off`를 사용한다.
## 6. Data & Runtime Flow
Unit 경계를 고정하고 구현·안전 로그·테스트를 함께 작성해 Test Skill로 전달한다.
## 7. Identity & Persistence Contract
Skill ID는 `RPA-BUILD`, Work는 WOO-889이며 변경은 RPA ID와 revision을 유지한다.
## 8. Integration Contract
Design에서 확정된 계약만 받고 계약 변경이 필요하면 Design으로 되돌린다.
## 9. Failure & Recovery Contract
부분 외부 쓰기와 메일은 격리 fixture로 검증하고 실제 부작용 발생 전 중단 지점을 둔다.
## 10. Acceptance Contract
변경 Unit, 정상·실패 테스트, 안전 로그, 비밀·고객 데이터 부재가 확인되어야 한다.
## 11. Verification Strategy
Unit별 정상·실패·중복 실행과 adapter 실패를 테스트하고 미검증 운영 환경을 표시한다.
## 12. Implementation Map
실행 지침은 `.agents/skills/rpa-build/SKILL.md`, 설계는 `rpa-map`, 수락은 `rpa-safety`가 소유한다.
## 13. Current State & Gaps
Skill 지침과 계약은 존재하지만 첫 프로젝트 구현 Evidence는 아직 없다.
## 14. Decisions & Evidence
DEC-RPA-008: 설계 변경과 코드 구현을 별도 Skill로 분리한다. WOO-889가 작업 증거다.
## Change Log
- 2026-09-08: Build 상세 계약을 생성했다.

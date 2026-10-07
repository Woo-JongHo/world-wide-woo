---
document_id: 29e017fd-84ce-4779-b9d1-4a0d3133e725
linear: WOO-886
record_type: detailed-canonical
schema_version: 2
status: draft
acceptance: not-tested
domain: RPA
capability: RPA Maintenance
parent: null
related: ["[[01_프로젝트/99_WWW/01_문서/Agents/RPA Agent — 의도와 Skill 실행을 조정한다]]"]
spec_ids: [RPA-005]
code_ids: []
test_ids: [TEST-RPA-005]
exception_ids: [EXC-RPA-005]
decision_ids: [DEC-RPA-005]
tags: [www/spec, domain/skills, capability/rpa-maintenance]
updated_at: 2026-09-08T14:00:00+09:00
source_revision: worktree:87c21b5da12793b78523b447d48de171d6eb6e13:dirty
---
# RPA Maintenance — 고객 요청과 버그를 처리한다

## 1. Intent
복사된 고객 요청, 현상과 로그를 안전하게 정제하고 재현 가능한 최소 수정 Flow로 전환한다.
## 2. Scope
민감정보 제거, 문제 유형, 영향 PTU, revision, 재현, 원인 확인, 회귀와 운영 복귀를 포함한다.
## 3. Desired Behavior
관찰 사실과 추정을 분리하며 확인된 원인에만 최소 변경을 적용하고 연결된 회귀 범위를 검증한다.
## 4. Domain Contract
입력은 sanitized report와 revision이다. 출력은 classification, affected_ids, reproduction, cause, change_scope, verification이다.
## 5. State Model
`intake → sanitized → classified → reproduced → diagnosed → changed → verified → restored`를 사용한다.
## 6. Data & Runtime Flow
입력을 정제하고 문제 유형과 영향 PTU를 찾은 뒤 재현, 진단, 최소 수정, 회귀, 운영 복귀 순서로 진행한다.
## 7. Identity & Persistence Contract
Skill ID는 `RPA-MAINT`, Work는 WOO-886이다. 원 요청, code revision, 수정 revision과 영향 RPA ID를 함께 기록한다.
## 8. Integration Contract
Monitor 이벤트와 고객 입력을 받아 Test 및 Reconciliation Skill에 수정 범위와 검증 대상을 전달한다.
## 9. Failure & Recovery Contract
재현 실패는 원인 확정이 아니다. 비밀이나 고객 데이터는 저장 전에 제거하고 마지막 재현 가능한 상태에서 재개한다.
## 10. Acceptance Contract
문제 유형, 확인 원인, 수정 Unit, 회귀 테스트, 재실행 범위와 운영 복귀 Evidence가 연결되어야 한다.
## 11. Verification Strategy
설정 오류, 코드 결함, 외부 시스템, 데이터 품질, 권한, 네트워크와 오분류 시나리오를 검증한다.
## 12. Implementation Map
진단 결과는 프로젝트 코드와 Test Receipt에 연결하고 작업 상태는 WOO-886 및 프로젝트 이슈에 기록한다.
## 13. Current State & Gaps
유지보수 Flow와 Linear 작업은 정의됐다. 자동 분류기와 프로젝트 회귀 Evidence는 아직 없다.
## 14. Decisions & Evidence
DEC-RPA-005: 로그만으로 원인을 확정하지 않고 재현과 코드 근거를 요구한다. WOO-886이 작업 증거다.
## Change Log
- 2026-09-08: 유지보수 계약 초안을 생성했다.

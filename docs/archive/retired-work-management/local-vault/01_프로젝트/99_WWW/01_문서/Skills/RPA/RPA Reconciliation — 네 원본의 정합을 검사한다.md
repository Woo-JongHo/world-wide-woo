---
document_id: 3a041a99-cb28-47f8-bca2-c61641a6af95
linear: WOO-887
record_type: detailed-canonical
schema_version: 2
status: draft
acceptance: not-tested
domain: RPA
capability: RPA Reconciliation
parent: null
related: ["[[01_프로젝트/99_WWW/01_문서/Agents/RPA Agent — 의도와 Skill 실행을 조정한다]]"]
spec_ids: [RPA-006]
code_ids: []
test_ids: [TEST-RPA-006]
exception_ids: [EXC-RPA-006]
decision_ids: [DEC-RPA-006]
tags: [www/spec, domain/skills, capability/rpa-reconciliation]
updated_at: 2026-09-08T14:00:00+09:00
source_revision: worktree:87c21b5da12793b78523b447d48de171d6eb6e13:dirty
---
# RPA Reconciliation — 네 원본의 정합을 검사한다

## 1. Intent
코드, rpa-map, Linear, Obsidian의 RPA 연결이 변경 과정에서 끊어지는 것을 차단한다.
## 2. Scope
로컬, Commit, PR, Merge의 변경 감지, drift 분류와 read-back을 포함한다. 별도 업무 DB 정본은 두지 않는다.
## 3. Desired Behavior
변경된 RPA ID의 네 원본을 비교하고 불일치의 소유 원본과 복구 행동을 명확히 제시한다.
## 4. Domain Contract
drift는 `CODE_ONLY`, `MAP_ONLY`, `LINEAR_ONLY`, `OBSIDIAN_ONLY`, `CONTRACT_MISMATCH` 중 하나다.
## 5. State Model
`detected → compared → consistent|drifted → repaired → read-back`이며 drifted 상태는 다음 Gate를 차단한다.
## 6. Data & Runtime Flow
변경 파일과 ID를 수집하고 네 원본의 revision·identity·계약을 비교한 뒤 복구 후 전체를 다시 읽는다.
## 7. Identity & Persistence Contract
Skill ID는 `RPA-RECON`, Work는 WOO-887이다. DB는 정본이 아니라 재생성 가능한 검사 인덱스로만 허용한다.
## 8. Integration Contract
Git 변경, rpa-map, Linear API와 Obsidian schema v2 문서를 입력으로 사용하고 Gate Receipt를 반환한다.
## 9. Failure & Recovery Contract
원본 우선순위가 불명확하면 자동 덮어쓰기를 중단하고 사용자 결정을 요구한다. 복구 후 네 표면을 모두 read-back한다.
## 10. Acceptance Contract
RPA ID 없는 관련 변경과 단독 원본 변경이 탐지되며 각 drift에 소유자와 복구 행동이 있어야 한다.
## 11. Verification Strategy
각 단독 drift, identity 충돌, revision 불일치, 문서 경로 drift와 성공 read-back을 fixture로 검증한다.
## 12. Implementation Map
Linear 검사는 `scripts/linear-contract.ts`, Obsidian 검사는 `obsidian-contract-cli.ts`, 연결 검사는 traceability 계층이 소유한다.
## 13. Current State & Gaps
Linear·Obsidian 계약 검사는 존재한다. RPA ID 기반 네 원본 통합 Gate의 E2E Evidence는 아직 없다.
## 14. Decisions & Evidence
DEC-RPA-006: SQLite는 별도 정본이 아니라 필요 시 재생성 가능한 인덱스로 제한한다. WOO-887이 작업 증거다.
## Change Log
- 2026-09-08: 네 원본 정합 계약 초안을 생성했다.

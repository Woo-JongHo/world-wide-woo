---
document_id: 76786a3d-fab9-4898-9160-93d700cb96da
linear: WOO-883
record_type: detailed-canonical
schema_version: 2
status: draft
acceptance: not-tested
domain: Monitor
capability: RPA Monitor
parent: null
related: ["[[01_프로젝트/99_WWW/01_문서/Agents/RPA Agent — 의도와 Skill 실행을 조정한다]]"]
spec_ids: [RPA-004]
code_ids: []
test_ids: [TEST-RPA-004]
exception_ids: [EXC-RPA-004]
decision_ids: [DEC-RPA-004]
tags: [www/spec, domain/skills, capability/rpa-monitor]
updated_at: 2026-09-08T14:00:00+09:00
source_revision: worktree:87c21b5da12793b78523b447d48de171d6eb6e13:dirty
---
# RPA Monitor — 안전한 운영 상태를 제공한다

## 1. Intent
내부 업무 데이터를 노출하지 않고 실행 위치, 오류 영향과 다음 행동을 신속하게 보여준다.
## 2. Scope
Process·Task·Unit, revision, 상태, 안전 오류 요약과 재개 지점을 포함한다. 고객·계좌·메일 원문은 제외한다.
## 3. Desired Behavior
운영자는 현재 실패 Unit, 확인된 현상, 즉시 조치, 수동 대체와 재개 조건을 한 화면에서 판단한다.
## 4. Domain Contract
이벤트는 run_id, RPA ID, revision, state, occurred_at, safe_error_code, next_action을 가진다.
## 5. State Model
`queued → running → succeeded|failed|paused|unknown`을 사용하며 이벤트가 없으면 진행률을 추정하지 않는다.
## 6. Data & Runtime Flow
Run 이벤트를 공통 상태로 정규화하고 Sanitizer를 통과시킨 뒤 코드 중심 요약과 복구 행동을 제공한다.
## 7. Identity & Persistence Contract
Skill ID는 `RPA-MONITOR`, Work는 WOO-883이다. run identity와 PTU identity를 분리하고 revision을 필수로 둔다.
## 8. Integration Contract
운영 시스템의 관측 이벤트를 읽고 Test의 안전 규칙과 Maintenance의 진단 입력에 연결한다.
## 9. Failure & Recovery Contract
민감 필드가 발견되면 이벤트 게시를 차단한다. 이벤트 단절은 `unknown`으로 표시하고 마지막 관측 시각을 보존한다.
## 10. Acceptance Contract
금지 데이터가 노출되지 않고 현재 위치·revision·다음 행동·재개 지점을 확인할 수 있어야 한다.
## 11. Verification Strategy
정상 수행, Unit 실패, 이벤트 지연, sanitizer 차단, 재개와 중복 이벤트를 시나리오로 검증한다.
## 12. Implementation Map
공통 이벤트 계약은 이 문서와 WOO-883이 소유하며 프로젝트별 수집기는 각 프로젝트에서 구현한다.
## 13. Current State & Gaps
표시 계약은 정의됐지만 이벤트 schema 구현과 실제 Monitor 화면 검증은 아직 없다.
## 14. Decisions & Evidence
DEC-RPA-004: Monitor는 내부 데이터가 아닌 코드·계약 상태만 제공한다. WOO-883이 작업 증거다.
## Change Log
- 2026-09-08: 보안 중심 Monitor 계약 초안을 생성했다.

---
document_id: 7e42f6ea-e3e4-4c88-af50-e06ece44d092
linear: WOO-884
record_type: detailed-canonical
schema_version: 2
status: draft
acceptance: not-tested
domain: RPA
capability: RPA Test
parent: null
related: ["[[01_프로젝트/99_WWW/01_문서/Agents/RPA Agent — 의도와 Skill 실행을 조정한다]]"]
spec_ids: [RPA-003]
code_ids: []
test_ids: [TEST-RPA-003]
exception_ids: [EXC-RPA-003]
decision_ids: [DEC-RPA-003]
tags: [www/spec, domain/skills, capability/rpa-test]
updated_at: 2026-09-08T14:00:00+09:00
source_revision: worktree:87c21b5da12793b78523b447d48de171d6eb6e13:dirty
---
# RPA Test — 예외 로그 테스트를 검증한다

## 1. Intent
프로젝트별 실패 표현을 일관된 예외·로그·테스트 계약과 Evidence로 바꾼다.
## 2. Scope
정상, 경계, 실패, 부분 실패, 재실행과 안전 로그를 포함한다. 실제 고객 데이터를 로그에 저장하지 않는다.
## 3. Desired Behavior
중요 실패마다 탐지, 제어, 복구, 재개 지점과 검증 결과를 같은 ID로 찾을 수 있어야 한다.
## 4. Domain Contract
예외는 trigger·detect·control·recovery·escalation을, 테스트는 setup·action·oracle·evidence를 가진다.
## 5. State Model
테스트 결과는 `not-tested`, `partial`, `pass`, `fail`이며 관측하지 않은 범위는 pass로 승격하지 않는다.
## 6. Data & Runtime Flow
외부 쓰기와 Mail Unit을 먼저 식별하고 예외 계약, sanitized 로그, 다섯 테스트 유형, Evidence를 연결한다.
## 7. Identity & Persistence Contract
Skill ID는 `RPA-TEST`, Work는 WOO-884다. 예외와 테스트 ID는 PTU 및 source revision과 함께 유지한다.
## 8. Integration Contract
개발 산출물을 입력받고 Monitor의 안전 이벤트 및 Maintenance의 회귀 범위에 검증 결과를 제공한다.
## 9. Failure & Recovery Contract
로그의 민감정보, oracle 부재, 복구 미검증은 차단 사유다. 실패 시 마지막 안전 상태와 재시험 조건을 남긴다.
## 10. Acceptance Contract
중요 예외마다 복구 테스트가 있고 민감정보가 배제되며 결과 상태와 Evidence가 일치해야 한다.
## 11. Verification Strategy
중복 실행, 타임아웃, 부분 쓰기, 메일 직전·직후 실패, 재개 시나리오를 독립적으로 검증한다.
## 12. Implementation Map
예외·재실행 수락 규칙은 `.agents/skills/rpa-safety`, PTU 연결은 `rpa-map`이 소유한다.
## 13. Current State & Gaps
계약과 Linear 작업은 생성됐다. 공통 로그 schema와 실제 프로젝트별 Evidence는 아직 미검증이다.
## 14. Decisions & Evidence
DEC-RPA-003: 테스트 통과와 운영 수락을 다른 상태로 관리한다. WOO-884 read-back이 작업 증거다.
## Change Log
- 2026-09-08: 테스트·예외 계약 초안을 생성했다.

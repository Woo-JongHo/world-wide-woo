---
document_id: 03aa9448-77c2-4ed6-97a0-7038901b0521
linear: WOO-847
record_type: detailed-canonical
schema_version: 2
status: draft
acceptance: not-tested
domain: Agents
capability: RPA Agent
parent: null
related: ["[[01_프로젝트/99_WWW/01_문서/Skills/RPA/RPA Intake — 안전한 업무 사실을 수집한다]]", "[[01_프로젝트/99_WWW/01_문서/Skills/RPA/RPA Design — 업무 정의를 PTU 설계로 확정한다]]", "[[01_프로젝트/99_WWW/01_문서/Skills/RPA/RPA Build — 승인된 Unit을 구현한다]]", "[[01_프로젝트/99_WWW/01_문서/Skills/RPA/RPA Test — 예외 로그 테스트를 검증한다]]", "[[01_프로젝트/99_WWW/01_문서/Skills/RPA/RPA Maintenance — 고객 요청과 버그를 처리한다]]", "[[01_프로젝트/99_WWW/01_문서/Skills/RPA/RPA Publish — 검증된 계약을 게시한다]]", "[[01_프로젝트/99_WWW/01_문서/Skills/RPA/RPA Reconciliation — 네 원본의 정합을 검사한다]]", "[[01_프로젝트/99_WWW/01_문서/Monitor/RPA Monitor — 안전한 운영 상태를 제공한다]]"]
spec_ids: [RPA-001]
code_ids: []
test_ids: [TEST-RPA-001]
exception_ids: [EXC-RPA-001]
decision_ids: [DEC-RPA-001]
tags: [www/spec, domain/agents, capability/rpa-agent]
updated_at: 2026-09-08T14:00:00+09:00
source_revision: worktree:87c21b5da12793b78523b447d48de171d6eb6e13:dirty
---
# RPA Agent — 의도와 Skill 실행을 조정한다

## 1. Intent
신규 개발, 테스트, Monitor, 유지보수, 정합 요청을 한 가지 실행 Flow로 분류하고 확정된 Skill만 호출한다.

## 2. Scope
의도 분류, 계약 누락 탐지, 한 초점 질문, 사용자 결정 기록, Skill 순서 조정을 포함한다. 실제 업무 실행과 고객 메일 발송은 제외한다.

## 3. Desired Behavior
의도가 명확하면 즉시 해당 Skill의 입력 계약을 구성한다. 의미가 둘 이상이면 영향이 다른 선택지와 권장안을 제시하고 결정 전에는 쓰기 단계를 시작하지 않는다.

## 4. Domain Contract
입력은 사용자 요청과 현재 Process context다. 출력은 `intent`, `confirmed_decisions`, `skill_sequence`, `blocked_fields`를 가진 조정 Receipt다.

## 5. State Model
`received → classified → clarifying → decided → executing → verified`를 사용한다. 필수 결정이 없으면 `clarifying`, Gate 실패는 `blocked`에 머문다.

## 6. Data & Runtime Flow
입력을 정제한 뒤 다섯 Intent로 분류하고 필요한 질문만 수행한다. 확정된 결정과 RPA ID를 각 Skill에 전달하고 결과 Receipt를 다음 단계의 입력으로 삼는다.

## 7. Identity & Persistence Contract
RPA Agent의 안정 ID는 `RPA-AGENT`, 작업 ID는 WOO-847이다. 결정은 DEC-RPA-001 계열로 기록하고 실행 순서 변경과 identity 변경을 분리한다.

## 8. Integration Contract
Intake, Design, Build, Test, Maintenance, Publish, Reconcile의 일곱 Skill과 v0.1.0 Monitor를 연결한다. Linear는 현재 작업 상태를, 이 문서는 Agent 행동 계약을 소유한다.

## 9. Failure & Recovery Contract
분류 신뢰도가 부족하거나 입력 계약이 충돌하면 실행을 멈추고 정확히 한 초점만 질문한다. 실패 Receipt에는 실패 단계, 보존된 결정, 재개 Skill을 남긴다.

## 10. Acceptance Contract
다섯 Intent가 올바른 Skill로 연결되고, 모호한 요청이 무승인 실행으로 넘어가지 않으며, 실패 후 동일 결정에서 재개할 수 있어야 한다.

## 11. Verification Strategy
각 Intent의 정상 예제, 두 Intent가 충돌하는 예제, 필수 값 누락, Gate 실패와 재개를 시나리오 테스트한다.

## 12. Implementation Map
실행 규칙은 `agents/rpa/AGENT.md`, 세부 절차는 `.agents/skills/rpa-*`, 장기 Workflow는 `docs/workflows/RPA_WORKFLOW.md`에 있다.

## 13. Current State & Gaps
Linear 구조와 문서 계약은 생성됐다. 실제 Intent router의 자동 분류와 행동 테스트 Evidence는 아직 없다.

## 14. Decisions & Evidence
DEC-RPA-001: Environment, Skills, Agents를 최상위 형제로 분리하고 RPA Agent를 Agents 아래 둔다. Linear WOO-847 read-back이 현재 구조의 증거다.

## Change Log
- 2026-09-08: B 구조와 일곱 Skill 조정 계약으로 갱신했다.

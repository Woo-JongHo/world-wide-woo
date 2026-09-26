# WWW 기능을 동일한 TUI 책임 구조와 Native 관측 경계로 정렬한다

## 목적

개발자가 Chat·Note·Plan·Tracer·Summary를 기능 폴더에서 먼저 찾고, Native 사건이 7계층 관측과 Core 규칙을 거쳐 TUI에 표시되는 책임을 같은 어휘로 이해하게 한다.

## 결과

WWW가 유일한 현재 제품명이 되고 전체는 Hexagonal 경계를 유지하며 각 TUI 기능은 controller·view-model·view·registration 책임을 같은 어휘로 찾을 수 있고 실제 상태 소유권이 코드와 검사에 일치한다.

## 범위

### 포함

- 7계층 관측 pipeline의 end-to-end 회귀 검사와 event→frame/no-render/vendor failure 계약을 유지한다.
- WWW 명칭과 broker·off·observe Runtime 선택표를 분리해 보존한다.
- 18 Feature·39 Unit을 기능별 controller·view-model·view·registration 책임에서 찾게 하고 빈 역할 폴더는 만들지 않는다.
- 완료 Note 읽기를 유지하고 Summary capture identity와 Note review·promotion 수명 경계를 결정한다.
- Activity·휘발 Native delta·Outbound reader의 상태 소유권, Core Port 4그룹과 readonly Feature Projection을 유지한다.
- legacy Router 유지 또는 폐기를 별도 제품 결정으로 기록한다.
- 승인된 물리 이동과 함께 architecture gate·Code-ID·추적 경로를 갱신한다.

### 제외

- 현재 정본인 core/adapters를 폐기하고 src/tui·src/system·src/workflows로 일괄 이동하는 작업
- 7개 관측 계층을 제품 기능 폴더로 만드는 작업
- Summary를 Activity와 무관한 새 정본 또는 단순 Projection으로 만드는 작업
- 기능 구조를 맞추기 위한 빈 파일·TODO·no-op 구현 생성
- 결정 없이 legacy Router나 Native Session 코드를 일괄 삭제하는 작업
- 이번 조사 단계에서 Linear·Obsidian 외부 기록을 승인 없이 게시하는 작업

## 동작

- 개발자는 features/chat 같은 기능 폴더를 먼저 선택하고 controller·view-model·view·registration의 동일한 어휘에서 책임을 찾는다.
- Native 사건은 Activity 내구 정본과 휘발 delta를 구분한 채 Core를 거쳐 화면 Projection으로 전달된다.
- TUI View는 렌더링만 소유하고 ViewModel은 Core Projection을 화면 데이터로 바꾸며 Summary 범위·Note 승격·Activity 저장 규칙은 Core Application에 남는다.
- 외부 시스템 접근은 adapters/outbound에 유지하며 기능 폴더 안에 outbound를 복제하지 않는다.
- 없는 책임은 빈 파일로 위장하지 않고 registry metadata와 실제 제공 Unit으로 차이를 표현한다.

## 완료 조건

- 제품 파일·식별자·테스트·스크립트는 WWW 또는 역할 이름을 사용하고 deprecated CLI alias와 외부 모델 ID만 명시적으로 보존한다.
- 7계층 complete trace가 실제 TUI render 경로까지 end-to-end로 검증된다.
- 18 Feature·39 Unit에서 실제 책임이 있는 동일 슬롯 이름으로 TUI 책임을 찾고 sibling feature import 금지가 유지된다.
- 완료 Note 읽기 행동 테스트가 통과하고 Summary는 복제하지 않은 동일 산출물 identity로 Note 수명주기에 등록한다.
- Activity·Native delta·Outbound read의 소유권과 readonly Projection 계약이 타입과 테스트로 설명된다.
- Legacy Router는 공동 session 경로를 보존한 별도 migration을 완료한 뒤 폐기한다.
- 아키텍처 검사·TypeScript 검사·전체 회귀·Code-ID 및 추적성 검사가 통과하고 고정 Opus 최종 감사 결과가 기록된다.

## 연결

- Parent: WOO-672 공통 실행·관측 System이 동작한다
- Related: WOO-911 코드 실행 흐름을 역할별 최소 구조와 측정 가능한 열로 정리한다
- Report: docs/reviews/WWW_CODE_STRUCTURE_CURRENT_STATE_AND_TARGET_2026-09-25.md
- Plan: docs/planning/WWW_STATE_OWNERSHIP_REFACTOR_PLAN_2026-09-25.md
- Independent audit: .www/scratchpad/www-structure-opus-audit-2026-09-25.md
- Evidence: .www/evidence/2026-09-25-www-code-structure-review

# WWW Development Map

- 상태: Chat·Todo·Tracer·Stats·Code Map 개발 PR 진행 중·Opus 최종 감사 대기; Monitor·Dashboard는 이슈·설계만 보존
- 기준일: 2026-09-07 (Linear·PR·코드 원장·검증 증거 재확인)
- 확인 revision: Stats `664c40b`; Chat `05e2829`/`e1b188b`; Todo `5bf2d53`; Tracer `2fd2405`; Code Map `4d4dd8d`
- 확인 파일: [연결 원장](./control-ledger/traceability.json), [Chat Evidence](./evidence/2026-09-06-chat-development/assessment.md), [Stats PTY Evidence](./scratchpad/2026-09-07-stats-request-enter.md)
- 관련 Issue: [#26](https://github.com/Woo-JongHo/world-wide-woo/issues/26)

이 문서는 제품 전체의 현재 위치와 다음 전환을 보여주는 읽기 전용 지도다. 세부 요구사항과 완료 권한은 연결된 Planning artifact와 Evidence가 소유한다.

현재 첫 제품 마일스톤은 [WWW 첫 제품 마일스톤](../docs/WWW_FIRST_PRODUCT_MILESTONE.md)이
정의한다. 장기 Service Lifecycle 비전 전체를 현재 구현 범위로 해석하지 않는다.

Native Workbench에서 `/map`을 실행하면 Planning catalog, Initiative manifest, 기존 Epic·Story projection과 Evidence 파일 변경을 감지해 전체 화면 구조도를 자동 갱신한다. 이 Markdown은 탐색용 기준 문서이며 실행 중 화면 상태의 정본은 아니다.

## 읽는 법

```text
Development Map
  → INIT-###  제품 범위
  → EP-###    수락 가능한 결과
  → ST-###-## 실행 가능한 사용자 가치
  → Run/Todo  현재 실행 단계
  → Evidence  검증 근거
```

`Todo completed`, `Story accepted`, `Epic completed`는 서로 다른 상태다. 이 Map은 하위 상태를 근거 없이 상위 완료로 승격하지 않는다.

## 현재 제품

### Chat·Todo·Tracer·Stats 개발 현황과 Linear 연결 — 2026-09-07

| 작업 ID | 관측 상태 | 근거·연결 | 다음 전환 |
| --- | --- | --- | --- |
| [WOO-679](https://linear.app/woo-world/issue/WOO-679) · Chat | PR #38 + #39/#40 진행·Opus 최종 감사 대기 | [개발 확인](./evidence/2026-09-06-chat-development/assessment.md) · [PR #38](https://github.com/Woo-JongHo/world-wide-woo/pull/38) · [PR #40](https://github.com/Woo-JongHo/world-wide-woo/pull/40) · [연결 원장](./control-ledger/traceability.json) | 하위 acceptance와 실제 TUI 수락 후 Opus 판정 |
| [WOO-683](https://linear.app/woo-world/issue/WOO-683) · Message | 부분 구현 | 동일 Evidence | 하위 보존·격리·예외 항목 해결 |
| [WOO-684](https://linear.app/woo-world/issue/WOO-684) · Bash | 부분 구현 | 동일 Evidence | 원문 이동·실패/취소/폭 matrix |
| WOO-686 · Markdown / WOO-687 · 역할 | 기반 구현·전체 수락 미완료 | 동일 Evidence | Markdown·상태·색상·폭 조합 확인 |
| [WOO-688](https://linear.app/woo-world/issue/WOO-688) · 상태 전이 | PR #40 진행·Opus 감사 대기 | [runtime probes](./evidence/2026-09-06-chat-development/runtime-probes.json) · [PR #40](https://github.com/Woo-JongHo/world-wide-woo/pull/40) | Opus 판정 및 Linear 기록 |
| [WOO-689](https://linear.app/woo-world/issue/WOO-689) · 긴 내용 | 부분 구현·캐시 회귀 통과 | 동일 Evidence | 최초 렌더/resize 실측·실제 탐색 수락 |
| [WOO-690](https://linear.app/woo-world/issue/WOO-690) · 재개/identity | PR #39 진행·Opus 감사 대기 | [runtime probes](./evidence/2026-09-06-chat-development/runtime-probes.json) · [PR #39](https://github.com/Woo-JongHo/world-wide-woo/pull/39) | Opus 판정 및 Linear 기록 |
| [WOO-691](https://linear.app/woo-world/issue/WOO-691) · 예외 | 부분 구현 | 동일 Evidence | 빈/unknown/renderer 실패 처리 |
| [WOO-692](https://linear.app/woo-world/issue/WOO-692) · 통합 수락 | 자동 검증 근거 확보·실제 TUI 미검증 | [617개 회귀 결과](./evidence/2026-09-06-chat-development/tests-baseline.log) | 실제 Native TUI 시나리오·캡처·사용자 수락 |
| [WOO-682](https://linear.app/woo-world/issue/WOO-682) · Todo | PR #43 Ready·Terra 승인·Native resume/Opus 대기 | [PR #43](https://github.com/Woo-JongHo/world-wide-woo/pull/43) · [테스트 방법론](./vault/Development/2026-09-07-TUI-Test-Methodology.md) · [연결 원장](./control-ledger/traceability.json) | Native Plan → Todo.md → 모델 귀속의 실제 세션 증거 |
| [WOO-681](https://linear.app/woo-world/issue/WOO-681) · Tracer | PR #44 Ready·Native 성공 경로 수동 수락 대기 | [PR #44](https://github.com/Woo-JongHo/world-wide-woo/pull/44) · [테스트 방법론](./vault/Development/2026-09-07-TUI-Test-Methodology.md) · [연결 원장](./control-ledger/traceability.json) | Todo/Chat 선택 → 같은 실행 Source 왕복 증거 |
| [WOO-677](https://linear.app/woo-world/issue/WOO-677) · Stats | PR #41 Ready·Spark 승인·Opus 최종 대기 | [Stats PTY Evidence](./scratchpad/2026-09-07-stats-request-enter.md) · [PR #41](https://github.com/Woo-JongHo/world-wide-woo/pull/41) · [테스트 방법론](./vault/Development/2026-09-07-TUI-Test-Methodology.md) | Opus 판정 후 Linear/PR 상태 갱신 |
| [WOO-695](https://linear.app/woo-world/issue/WOO-695) · Code Map | PR #42 Ready·Map 감사 기록 완료 | [PR #42](https://github.com/Woo-JongHo/world-wide-woo/pull/42) · [테스트 방법론](./vault/Development/2026-09-07-TUI-Test-Methodology.md) · [연결 원장](./control-ledger/traceability.json) | Unit·Linear·SQLite·Obsidian 왕복 수락 증거 |
| [WOO-696](https://linear.app/woo-world/issue/WOO-696) · SQLite | 구현·자동 검증 완료·PR 분리 대기 | [development-store](../src/adapters/outbound/development-store.ts) · [SQLite tests](../test/development-store.test.ts) | commit/PR과 Opus 감사 |
| [WOO-697](https://linear.app/woo-world/issue/WOO-697) · 개발 기록 | PR #45 Ready·테스트 방법론 기록 추가 | [development-service](../src/core/application/development-service.ts) · [test runner](../src/adapters/outbound/development-test-runner.ts) · [PR #45](https://github.com/Woo-JongHo/world-wide-woo/pull/45) | Linear 요약·Obsidian 상세 이중 기록 검증 |
| [WOO-698](https://linear.app/woo-world/issue/WOO-698) · Obsidian | PR #45 Ready·상세 방법론 문서 추가 | [development-vault](../src/adapters/outbound/development-vault.ts) · [Vault tests](../test/development-vault.test.ts) · [테스트 방법론](./vault/Development/2026-09-07-TUI-Test-Methodology.md) | Linear ID·테스트 ID·증거 경로 readback |

WOO 번호와 Linear UUID는 작업 ID다. 별도 Unit ID는 미발급이며 기존 EP/ST와 자동 동치 연결하지 않았다. 코드/테스트 연결과 관측은 [원장 안내](./control-ledger/README.md)로 탐색한다. 테스트 통과를 이슈 수락으로 승격하지 않는다. 아래 제품 전체 행은 이번 Chat 감사로 재판정하지 않았다.

### Monitor·Dashboard 범위 결정 — 2026-09-07

| 작업 ID | 관측 상태 | 근거·연결 | 다음 전환 |
| --- | --- | --- | --- |
| [WOO-675](https://linear.app/woo-world/issue/WOO-675) · Monitor | 이슈·설계만 유지; 제품 개발/진행 코멘트 없음 | [연결 원장](./control-ledger/traceability.json) | Chat·Todo·Tracer·Stats 수락 뒤 개발 여부 결정 |
| [WOO-676](https://linear.app/woo-world/issue/WOO-676) · Dashboard | 이슈·설계만 유지; 제품 개발/진행 코멘트 없음 | [연결 원장](./control-ledger/traceability.json) | Monitor 범위 결정 뒤 개발 여부 결정 |

### 기존 제품 전체 관측 — 2026-09-04

| 제품 영역 | Initiative | Epic | 현재 상태 | 세부 Work | 확인 근거 | 다음 전환 |
|---|---|---|---|---|---|---|
| Product Shell | 미연결 | [`EP-001`](./Epics.md#ep-001--제품-shell) | 완료 | [`ST-001-*`](./Stories.md#ep-001--제품-shell) | Story checklist | Native Workbench 기준으로 legacy 범위 재분류 |
| Output Contract | 미연결 | [`EP-002`](./Epics.md#ep-002--출력-계약) | 진행 중 | [`ST-002-*`](./Stories.md#ep-002--출력-계약) | Story checklist | streaming·completion report·긴 출력 UX |
| Agent Runtime | 미연결 | [`EP-003`](./Epics.md#ep-003--agent-runtime) | 진행 중 | [`ST-003-*`](./Stories.md#ep-003--agent-runtime) | Story checklist | Turn·approval·edit 경계 완성 |
| WES Context | 미연결 | [`EP-004`](./Epics.md#ep-004--wes-context) | 진행 중 | [`ST-004-*`](./Stories.md#ep-004--wes-context) | Story checklist | Display와 Context policy 분리 |
| Product Quality | 미연결 | [`EP-005`](./Epics.md#ep-005--제품-품질) | 진행 중 | [`ST-005-*`](./Stories.md#ep-005--제품-품질) | Story checklist | terminal·OS·인증·장기 session 검증 |
| Distribution | 미연결 | [`EP-006`](./Epics.md#ep-006--배포) | 예정 | [`ST-006-*`](./Stories.md#ep-006--배포) | Story checklist | CI·배포·복구 계약 |
| Monitoring | 미연결 | [`EP-007`](./Epics.md#ep-007--monitoring-dashboard) | 완료 | [`ST-007-*`](./Stories.md#ep-007--monitoring-dashboard) | Story checklist | Native Workbench Monitor와 정합성 재검증 |
| Work Narration | 미연결 | [`EP-008`](./Epics.md#ep-008--work-narration-ux) | 완료 | [`ST-008-*`](./Stories.md#ep-008--work-narration-ux) | Story checklist | Issue #22·#24 회귀 보완 |
| 01_www Adapt-In | 미연결 | [`EP-009`](./Epics.md#ep-009--01_www-adapt-in) | 진행 중 | [`ST-009-*`](./Stories.md#ep-009--01_www-adapt-in) | Story checklist | 역할·Planning capability 단위 흡수 |
| Planning Package | [`INIT-001`](./planning/001-planning-package-v1/INITIATIVE.json) | [`EP-010`](./planning/artifacts/EP-010.md) | 구현됨·미수락 | [`ST-010-01~05`](./planning/artifacts/ST-010-01.md) | catalog·artifact·planning tests | 상태·Evidence event 계약 |
| Native Workbench | 상위 Initiative 미연결 | [`EP-011`](./planning/artifacts/EP-011.md) | 로컬 main 통합·미수락 | [`ST-011-06~13`](./planning/artifacts/ST-011-06.md) | [실행 Handoff](../docs/WWW_V010_EXECUTION_HANDOFF.md)·Story Evidence·Native Workbench tests | 첫 제품 마일스톤 흐름과 Story acceptance 재검증 |
| Session Stats | 상위 Initiative 미연결 | [`EP-012`](./planning/artifacts/EP-012.md) | 로컬 main 통합·미수락 | [`ST-012-14~19`](./planning/artifacts/ST-012-14.md) | Planning catalog·Session Stats tests | 실제 `/stats` TUI 수동 검증과 Evidence 연결 |
| Observability Workspace | 상위 Initiative 미연결 | [`EP-019`](./planning/artifacts/EP-019.md) | 로컬 구현·자동 검증 완료·수동 QA 대기 | [`ST-019-01~08`](./planning/artifacts/ST-019-01.md) | [Architecture](../docs/WWW_OBSERVABILITY_VIEW_ARCHITECTURE.md)·[입력](./planning/inputs/OBS-20260904-01.md)·[Evidence](./evidence/EP-019-observability-workspace.md) | 실제 TUI에서 rotation·drilldown·live state 수동 수락 |


## 장기 제품 방향

| 제품 영역 | Initiative | Epic | 현재 상태 | 상세 | ID·계획 공백 | 다음 전환 |
|---|---|---|---|---|---|---|
| Lifecycle Workflow Core | 미발급 | 미발급 | 설계 | [제품 방향](../docs/WWW_PRODUCT_DIRECTION.md) | Initiative·Epic·Story 없음 | [첫 제품 마일스톤](../docs/WWW_FIRST_PRODUCT_MILESTONE.md) 수락 뒤 최소 vertical slice 정의 |
| Product Workflow Profile | 미발급 | 미발급 | 문서화 | [Product Workflow](../docs/workflows/PRODUCT_WORKFLOW.md) | Initiative·Epic·Story 없음 | Project Binding 하나를 Story로 정의 |
| RPA Workflow Profile | 미발급 | 미발급 | 문서화 | [RPA Workflow](../docs/workflows/RPA_WORKFLOW.md) | Initiative·Epic·Story 없음 | 실제 RPA 하나를 Story로 정의 |
| Role View·Handoff Contract | 미발급 | 미발급 | 설계 | [제품 방향](../docs/WWW_PRODUCT_DIRECTION.md) | Validator·Projection Story 없음 | 한 경계의 Contract 검증 |
| Pi Embedded Executor | 미발급 | 미발급 | Phase A 코드 병합·Story 미발급 | [제품 방향](../docs/WWW_PRODUCT_DIRECTION.md) | [PR #25](https://github.com/Woo-JongHo/world-wide-woo/pull/25)·stable Story ID 없음 | 인증된 text lane 실측 후 Phase B Event 계약 |

## 현재 첫 제품 마일스톤

| 작업 묶음 | Planning ID | 현재 상태 | 다음 전환 |
|---|---|---|---|
| A. 목표와 현재 위치 고정 | 미발급 | 이 문서와 첫 제품 마일스톤 문서에 반영·미수락 | 사용자 방향 확인 뒤 Planning ID 발급 여부 결정 |
| B. 사용자 마찰 제거 | 미발급 | `/model` HUD와 의미 기반 완료 회고의 사용자 마찰이 보고됨·Issue 미등록 | Issue 미리보기 승인 후 각각 추적 |
| C. 내부 구조 정리 | 미발급 | 구조 감사에서 거대 Workbench·Shell·View 책임 혼합 확인 | 외부 interface를 유지한 내부 모듈 분리 Story 정의 |
| D. 수락 근거 | 미발급 | 로컬 typecheck와 587개 테스트 통과, 실제 milestone TUI·CI 검증 미실행 | 대표 흐름·terminal matrix·OS·CI 근거 연결 |

원격에는 이전 전달용 PR #27~34가 열린 상태지만, 현재 로컬 `main`에는 해당 변경이 통합돼
있다. 이전 PR별 의존·병합 상세는 Git log와 PR 기록이 소유하며 이 Projection에 복제하지
않는다. 원격 PR 상태만으로 로컬 구현의 수락 또는 배포 완료를 주장하지 않는다.

## ID 연결 상태

```text
INIT-001
└─ EP-010
   └─ ST-010-01 ~ ST-010-05

상위 Initiative 미연결
├─ EP-011
│  └─ ST-011-06 ~ ST-011-13
└─ EP-012
   └─ ST-012-14 ~ ST-012-19

ID 미발급
├─ Lifecycle Workflow Core
├─ Product Workflow Profile
├─ RPA Workflow Profile
├─ Role View·Handoff Contract
└─ Pi Embedded Executor
```

EP-001~009는 Planning Package v1 이전의 legacy projection이라 Initiative manifest와 연결되지 않았다. 새 ID를 추정해 채우지 않고 migration 또는 supersede 결정 전까지 `미연결`로 표시한다.

## 상태 출처와 제한

- EP-001~009 상태는 [Epics.md](./Epics.md)의 명시 상태를 그대로 표시한다.
- EP-010·011 관계는 [planning catalog](./planning/catalog.jsonl)와 immutable artifact를 기준으로 한다.
- `구현됨·미수락`은 코드 또는 검증 표면이 존재하지만 명시적인 Story/Epic acceptance event가 없음을 뜻한다.
- 현재 catalog는 `epic.created`, `story.created`만 소유한다. `/map`은 명시된 checkbox 상태와 Evidence 파일 존재를 따로 보여주며, Evidence로 acceptance를 추론하지 않는다.
- 다음 버전은 `status changed`, `evidence linked`, `acceptance recorded`의 정본 계약과 Map 상세 탐색·필터를 연결해야 한다.

## 상세 탐색

| 질문 | 정본 |
|---|---|
| 어디까지 왔는가 | 이 Development Map |
| 어디에 무엇이 있는가 | [Map.md](./Map.md) |
| 왜 만드는가 | Initiative의 `PRD.md` |
| 어떤 경계로 만드는가 | Initiative의 `ARCHITECTURE.md` |
| 어떤 결과를 수락하는가 | `EP-*.md` |
| 무엇을 구현하고 검증하는가 | `ST-*.md` |
| 지금 무엇을 하는가 | Run의 `Todo.md` |
| 완료 근거가 무엇인가 | Story-linked Evidence |

<!-- traceability:generated:start -->
## Linear–Code–Obsidian 추적 투영

이 표는 schema v3 그래프 원장과 work manifest에서 생성하며, SQLite 투영과 canonical digest를 대조한다. 상세 요구와 검증 증거는 registry/evidence source가 소유하며 여기에는 복제하지 않는다.

| Initiative | Epic | Story | Evidence | Linear | Code Unit | Obsidian | PR code evidence | Validation Receipt | 무결성 | 다음 전환 |
|---|---|---|---|---|---|---|---|---|---|---|
| 미연결 | 미연결 | 미연결 | .www/evidence/2026-09-06-tui-preparation/assessment.md | WOO-674 | 미연결 | 742cd6b6-37d9-4f64-a96d-273f4cfb4bea | 미연결 | 미관측 | 깨짐 | 누락 edge 복구 |
| 미연결 | 미연결 | 미연결 | 미연결 | WOO-678 | Code-010 | WOO-678 | 미연결 | 미관측 | 연결됨 | 수락 상태 확인 |
| 미연결 | 미연결 | 미연결 | .www/evidence/2026-09-06-chat-development/assessment.md | WOO-679 | Code-001<br>Code-002<br>Code-003<br>Code-004<br>Code-005 | WOO-679 | #46 (Chat v0.1 code) | 미관측 | 연결됨 | 수락 상태 확인 |
| 미연결 | 미연결 | 미연결 | .www/evidence/2026-09-06-tui-preparation/assessment.md | WOO-680 | Code-013 | WOO-680 | 미연결 | 미관측 | 연결됨 | 수락 상태 확인 |
| 미연결 | 미연결 | 미연결 | .www/evidence/2026-09-06-tui-preparation/assessment.md | WOO-681 | Code-012 | a53bc69a-ae43-4350-bdc1-ca1e0b08fc45 | 미연결 | 미관측 | 연결됨 | 수락 상태 확인 |
| 미연결 | 미연결 | 미연결 | .www/evidence/2026-09-06-tui-preparation/assessment.md | WOO-682 | Code-011 | 034d0686-30cf-4318-a70c-94b65e98bce7 | 미연결 | 미관측 | 연결됨 | 수락 상태 확인 |
| 미연결 | 미연결 | 미연결 | .www/evidence/2026-09-06-chat-development/assessment.md | WOO-686 | Code-001 | WOO-686 | #46 (Chat v0.1 code) | VR-CHAT-001-001<br>VR-CHAT-001-001<br>VR-CHAT-001-001 | 연결됨 | 수락 상태 확인 |
| 미연결 | 미연결 | 미연결 | .www/evidence/2026-09-06-chat-development/assessment.md | WOO-687 | Code-001 | WOO-687 | #46 (Chat v0.1 code) | 미관측 | 연결됨 | 수락 상태 확인 |
| 미연결 | 미연결 | 미연결 | .www/evidence/2026-09-06-chat-development/assessment.md | WOO-688 | Code-001<br>Code-002 | WOO-688 | #46 (Chat v0.1 code) | 미관측 | 연결됨 | 수락 상태 확인 |
| 미연결 | 미연결 | 미연결 | .www/evidence/2026-09-06-chat-development/assessment.md | WOO-689 | Code-001<br>Code-003 | WOO-689 | #46 (Chat v0.1 code) | 미관측 | 연결됨 | 수락 상태 확인 |
| 미연결 | 미연결 | 미연결 | .www/evidence/2026-09-06-chat-development/assessment.md | WOO-690 | Code-002 | WOO-690 | #46 (Chat v0.1 code) | 미관측 | 연결됨 | 수락 상태 확인 |
| 미연결 | 미연결 | 미연결 | .www/evidence/2026-09-06-chat-development/assessment.md | WOO-691 | Code-001<br>Code-002 | WOO-691 | #46 (Chat v0.1 code) | 미관측 | 연결됨 | 수락 상태 확인 |
| 미연결 | 미연결 | 미연결 | .www/evidence/2026-09-06-chat-development/assessment.md | WOO-692 | Code-001<br>Code-002<br>Code-003<br>Code-004<br>Code-005 | WOO-692 | #46 (Chat v0.1 code) | 미관측 | 연결됨 | 수락 상태 확인 |
| 미연결 | 미연결 | 미연결 | 미연결 | WOO-695 | Code-006<br>Code-007 | WOO-695 | 미연결 | 미관측 | 연결됨 | 수락 상태 확인 |
| 미연결 | 미연결 | 미연결 | 미연결 | WOO-696 | Code-008 | WOO-696 | 미연결 | 미관측 | 연결됨 | 수락 상태 확인 |
| 미연결 | 미연결 | 미연결 | 미연결 | WOO-697 | Code-008 | WOO-697 | 미연결 | 미관측 | 연결됨 | 수락 상태 확인 |
| 미연결 | 미연결 | 미연결 | 미연결 | WOO-698 | Code-007 | WOO-698 | 미연결 | 미관측 | 연결됨 | 수락 상태 확인 |
| 미연결 | 미연결 | 미연결 | 미연결 | WOO-699 | Code-009 | WOO-699 | 미연결 | 미관측 | 연결됨 | 수락 상태 확인 |
| 미연결 | 미연결 | 미연결 | 미연결 | WOO-700 | Code-011 | WOO-700 | 미연결 | 미관측 | 연결됨 | 수락 상태 확인 |
| 미연결 | 미연결 | 미연결 | 미연결 | WOO-701 | Code-011 | WOO-701 | 미연결 | 미관측 | 연결됨 | 수락 상태 확인 |
| 미연결 | 미연결 | 미연결 | 미연결 | WOO-702 | Code-011 | WOO-702 | 미연결 | 미관측 | 연결됨 | 수락 상태 확인 |
| 미연결 | 미연결 | 미연결 | 미연결 | WOO-703 | Code-011 | WOO-703 | 미연결 | 미관측 | 연결됨 | 수락 상태 확인 |
| 미연결 | 미연결 | 미연결 | 미연결 | WOO-704 | Code-012 | WOO-704 | 미연결 | 미관측 | 연결됨 | 수락 상태 확인 |
| 미연결 | 미연결 | 미연결 | 미연결 | WOO-705 | Code-012 | WOO-705 | 미연결 | 미관측 | 연결됨 | 수락 상태 확인 |
| 미연결 | 미연결 | 미연결 | 미연결 | WOO-706 | Code-012 | WOO-706 | 미연결 | 미관측 | 연결됨 | 수락 상태 확인 |
| 미연결 | 미연결 | 미연결 | 미연결 | WOO-707 | Code-013 | WOO-707 | 미연결 | 미관측 | 연결됨 | 수락 상태 확인 |
| 미연결 | 미연결 | 미연결 | 미연결 | WOO-708 | Code-013 | WOO-708 | 미연결 | 미관측 | 연결됨 | 수락 상태 확인 |
| 미연결 | 미연결 | 미연결 | 미연결 | WOO-709 | Code-012 | WOO-709 | 미연결 | 미관측 | 연결됨 | 수락 상태 확인 |
| 미연결 | 미연결 | 미연결 | 미연결 | WOO-718 | Code-001<br>Code-002<br>Code-004<br>Code-005 | WOO-718 | #46 (Chat v0.1 code) | 미관측 | 연결됨 | 수락 상태 확인 |
| 미연결 | 미연결 | 미연결 | 미연결 | WOO-719 | Code-001<br>Code-002<br>Code-004 | WOO-719 | #46 (Chat v0.1 code) | 미관측 | 연결됨 | 수락 상태 확인 |
| 미연결 | 미연결 | 미연결 | 미연결 | WOO-720 | Code-001<br>Code-002<br>Code-003<br>Code-004<br>Code-005 | WOO-720 | #46 (Chat v0.1 code) | 미관측 | 연결됨 | 수락 상태 확인 |
| 미연결 | 미연결 | 미연결 | 미연결 | WOO-721 | Code-011 | WOO-721 | 미연결 | 미관측 | 연결됨 | 수락 상태 확인 |
| 미연결 | 미연결 | 미연결 | 미연결 | WOO-722 | Code-011 | WOO-722 | 미연결 | 미관측 | 연결됨 | 수락 상태 확인 |
| 미연결 | 미연결 | 미연결 | 미연결 | WOO-723 | Code-012 | WOO-723 | 미연결 | 미관측 | 연결됨 | 수락 상태 확인 |
| 미연결 | 미연결 | 미연결 | 미연결 | WOO-724 | Code-012 | WOO-724 | 미연결 | 미관측 | 연결됨 | 수락 상태 확인 |
| 미연결 | 미연결 | 미연결 | 미연결 | WOO-725 | Code-013 | WOO-725 | 미연결 | 미관측 | 연결됨 | 수락 상태 확인 |
| 미연결 | 미연결 | 미연결 | 미연결 | WOO-726 | Code-013 | WOO-726 | 미연결 | 미관측 | 연결됨 | 수락 상태 확인 |

<!-- traceability:generated:end -->

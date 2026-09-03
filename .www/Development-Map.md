# WWW Development Map

- 상태: TUI 실시간 Projection 1차 구현·미수락, 열린 변경 6 PR
- 기준일: 2026-09-03
- working tree 기준 revision: `0357563fa2ca91a269aa4a78a9a0f97f61780b6b`
- 최신 `origin/main`: `beeb2e659af8bbc3d743b9b2b9be8bc7610c1716`
- 관련 Issue: [#26](https://github.com/Woo-JongHo/world-wide-woo/issues/26)

이 문서는 제품 전체의 현재 위치와 다음 전환을 보여주는 읽기 전용 지도다. 세부 요구사항과 완료 권한은 연결된 Planning artifact와 Evidence가 소유한다.

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
| Native Workbench | 상위 Initiative 미연결 | [`EP-011`](./planning/artifacts/EP-011.md) | 보완 중·6 PR 검증 대기 | [`ST-011-06~13`](./planning/artifacts/ST-011-06.md) | [실행 Handoff](../docs/WWW_V010_EXECUTION_HANDOFF.md)·Story Evidence·[#27~32](https://github.com/Woo-JongHo/world-wide-woo/pulls) | 의존 PR 순서대로 병합 후 acceptance 재검증 |
| Session Stats | 상위 Initiative 미연결 | [`EP-012`](./planning/artifacts/EP-012.md) | 구현 중·미수락 | [`ST-012-14~19`](./planning/artifacts/ST-012-14.md) | Planning catalog·Session Stats tests | 실제 `/stats` build 수동 검증 |


## 장기 제품 방향

| 제품 영역 | Initiative | Epic | 현재 상태 | 상세 | ID·계획 공백 | 다음 전환 |
|---|---|---|---|---|---|---|
| Lifecycle Workflow Core | 미발급 | 미발급 | 설계 | [제품 방향](../docs/WWW_PRODUCT_DIRECTION.md) | Initiative·Epic·Story 없음 | 최소 vertical slice 정의 |
| Product Workflow Profile | 미발급 | 미발급 | 문서화 | [Product Workflow](../docs/workflows/PRODUCT_WORKFLOW.md) | Initiative·Epic·Story 없음 | Project Binding 하나를 Story로 정의 |
| RPA Workflow Profile | 미발급 | 미발급 | 문서화 | [RPA Workflow](../docs/workflows/RPA_WORKFLOW.md) | Initiative·Epic·Story 없음 | 실제 RPA 하나를 Story로 정의 |
| Role View·Handoff Contract | 미발급 | 미발급 | 설계 | [제품 방향](../docs/WWW_PRODUCT_DIRECTION.md) | Validator·Projection Story 없음 | 한 경계의 Contract 검증 |
| Pi Embedded Executor | 미발급 | 미발급 | Phase A 코드 병합·Story 미발급 | [제품 방향](../docs/WWW_PRODUCT_DIRECTION.md) | [PR #25](https://github.com/Woo-JongHo/world-wide-woo/pull/25)·stable Story ID 없음 | 인증된 text lane 실측 후 Phase B Event 계약 |

## 현재 전달 상태

| 변경 | 상태 | 의존성 | 다음 전환 |
|---|---|---|---|
| [Issue #26](https://github.com/Woo-JongHo/world-wide-woo/issues/26) Development Map | 로컬 구현·미커밋·미수락 | PR #30과 `workbench-shell.ts`, `slash-commands.ts` 중첩 | PR #30 반영 후 충돌 검증·독립 수락 |
| [PR #30](https://github.com/Woo-JongHo/world-wide-woo/pull/30) T-note·Trace 화면 역할 | Ubuntu·Windows PASS, macOS queued | 없음 | PR #27보다 먼저 병합 |
| [PR #27](https://github.com/Woo-JongHo/world-wide-woo/pull/27) 저장된 T-note 번호 | Ubuntu·Windows PASS, macOS queued | PR #30 | #30 병합 후 base를 `main`으로 전환·재검증 |
| [PR #31](https://github.com/Woo-JongHo/world-wide-woo/pull/31) resume Todo bootstrap | Ubuntu·Windows PASS, macOS queued | 없음 | 독립 병합 후보 |
| [PR #28](https://github.com/Woo-JongHo/world-wide-woo/pull/28) Assistant envelope | Ubuntu·Windows PASS, macOS queued | 없음 | 독립 병합 후보 |
| [PR #29](https://github.com/Woo-JongHo/world-wide-woo/pull/29) Native 경로 축약 | Ubuntu·Windows PASS, macOS queued | 없음 | PR #32보다 먼저 병합 |
| [PR #32](https://github.com/Woo-JongHo/world-wide-woo/pull/32) 구조화 출력 강조 | Ubuntu·Windows PASS, macOS queued | PR #29 | #29 병합 후 base를 `main`으로 전환·재검증 |

## ID 연결 상태

```text
INIT-001
└─ EP-010
   └─ ST-010-01 ~ ST-010-05

상위 Initiative 미연결
└─ EP-011
   └─ ST-011-06 ~ ST-011-13

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

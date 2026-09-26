# WWW 상태 소유권 중심 리팩터링 실행 계획

- 작성일: 2026-09-25
- 상태: S0-A~S6 구현·독립 리뷰 완료, 제품 결정 2건과 Opus 최종 감사 대기
- 구현 주체: Codex Sol
- 선행 조사: Codex Luna `xhigh` 4개 읽기 전용 패스
- 구조 정본: `LAYERS.md`의 Inbound / Core / Outbound
- 상세 판정: `docs/reviews/WWW_CODE_STRUCTURE_CURRENT_STATE_AND_TARGET_2026-09-25.md` §17
- 결속 Linear: WOO-842

## 1. 목표

이번 리팩터링의 첫 질문은 “어느 폴더로 옮길까?”가 아니다.

> 이 상태는 누가 변경할 수 있고, 화면은 어느 identity와 어느 시점의 값을 받는가?

목표는 다음 네 가지다.

1. 상태별 writer와 source of truth를 한 곳으로 고정한다.
2. Activity·휘발 Native delta·외부 조회 결과가 화면에서 합성되는 규칙을 Interface와 테스트로 만든다.
3. 전체 `WorkbenchSnapshot`을 없애지 않고 Feature가 소비하는 읽기 Interface를 좁힌다.
4. 상태 계약을 먼저 안정시킨 뒤 WWW 명칭과 물리 폴더를 정리한다.

## 2. 변경하지 않는 큰 구조

- `Inbound Adapter → Core ← Outbound Adapter` 방향을 유지한다.
- `ProjectWorkbench`의 중심 조율 역할을 유지한다.
- Activity Journal을 내구 실행 사실로 유지한다.
- 기존 `/tnote` 범위 결정·모델 생성·검증·append-only 저장 흐름을 유지한다.
- 7계층은 기능 폴더가 아니라 관측 pipeline으로 유지한다.
- Legacy Router는 별도 제품 결정 전 삭제하지 않는다.

### 2.1 채택한 설계 언어 — 전체 Hexagonal, TUI 내부 MVC

시스템 전체의 외부 연결과 업무 처리는 Hexagonal 구조를 유지한다.

```text
Inbound Adapter → Core Application + Domain ← Port ← Outbound Adapter
```

TUI는 Core가 정제한 읽기 Projection을 받은 뒤 MVC식 책임으로 나눈다.

```text
사용자 입력 → Controller → Workbench Command → Core
Core Projection → ViewModel → View → Terminal
```

역할 대응은 다음과 같다.

| 익숙한 용어 | WWW 위치 | 책임 |
|---|---|---|
| Model | `core/domain` | 업무 상태·불변식 |
| Service / Use Case | `core/application` | 상태 전이·업무 흐름 |
| Repository·Client Interface | `core/ports` | 외부 구현이 지킬 Interface |
| Controller | `adapters/inbound/tui/features/*/controller` | 입력을 Command로 변환 |
| ViewModel | `adapters/inbound/tui/features/*/view-model` | Core Projection을 화면 데이터로 변환 |
| View | `adapters/inbound/tui/features/*/view` | 터미널 렌더링 |
| Repository·Client 구현 | `adapters/outbound` | 파일·Native·Linear·Git 구현 |

`Command는 Core로 들어가고 Snapshot/Projection은 TUI로 나온다.`를 양방향 계약으로 둔다. TUI Controller는 Snapshot을 직접 변경하지 않으며 View는 Repository·Native·Activity Journal을 알지 않는다.

## 3. Luna 조사 당시 기준선

| 조사 | 결과 | 원본 |
|---|---|---|
| 코드 인벤토리 | TypeScript 305개, TUI Feature 18개·Unit 39개, 지속 Code Unit 5개 | `.www/scratchpad/www-refactor-plan-2026-09-25/luna-code-inventory.md` |
| 상태 계약 | Runtime 선택, Journal/stream 합성, late result guard, Snapshot, 7계층 경계 | `.www/scratchpad/www-refactor-plan-2026-09-25/luna-state-contracts.md` |
| 가독성 | 핵심 24파일의 import/grid 검사 통과, 함수 지도·optional JSDoc 후보 식별 | `.www/scratchpad/www-refactor-plan-2026-09-25/luna-readability-audit.md` |
| 문서 | current/partially stale/stale/historical 분류와 Wave 0–6 영향표 | `.www/scratchpad/www-refactor-plan-2026-09-25/luna-docs-matrix.md` |

S0-A 이전에 확인한 Runtime 선택은 다음과 같았다. 현재 계약은 §18의 S5 결과와 §19를 우선한다.

```text
runtimeConfig 존재 → broker
design === astra    → off
그 외 runApp        → observe
```

확인된 streaming 정착 순서는 다음과 같다.

```text
Native delta
  → NativeStreamProjection(revision 증가, journalSequence 유지)
  → Snapshot publish
  → matching terminal Activity append
  → exact turn/item owner의 volatile projection 제거
```

## 4. 상태 소유권 목표표

| 상태 | writer | read Interface | persistence / Adapter | 금지 |
|---|---|---|---|---|
| 내구 실행 사실 | Core journal coordinator | Activity projection | ActivityJournalStore | TUI가 Activity 생성·수정 |
| streaming 출력 | Core NativeStreamProjection | Chat live projection | 없음 | final Activity와 이어 붙여 중복 표시 |
| Todo | Core TodoLedger | Todo projection | FileTodoStore | Native Plan과 무정책 양방향 수정 |
| Summary 산출물 | Core TNoteService와 validator | Summary read projection | FileTNoteStore | 출처 없는 새 Summary 정본 |
| Note 수명 | Core Note use case | Note read/review projection | canonical/review adapters | Summary 내용을 독립 복사본 두 곳에서 수정 |
| Usage·Auth·Git·Dashboard read | 주입된 읽기 Interface | TUI-local read state | 각 Outbound reader | Inbound가 concrete Outbound import |
| 편집 buffer·focus·scroll·overlay | TUI shell/controller | 해당 view state | draft persistence Adapter | Core 실행 queue와 동일 객체 공유 |

## 5. 실행 원칙

- 한 작업 묶음은 하나의 상태 계약 또는 하나의 Interface만 바꾼다.
- 이름 변경과 실행 정책 변경을 같은 묶음에 넣지 않는다.
- 폴더 이동과 업무 규칙 변경을 같은 묶음에 넣지 않는다.
- `ProjectWorkbench` 줄 수 감소를 성공 기준으로 사용하지 않는다.
- 새 Port는 production Adapter와 test Adapter가 모두 필요한 실제 seam에만 만든다.
- 전달만 하는 Core 중계 함수는 만들지 않는다.
- 전체 Snapshot은 shell 조립용으로 유지할 수 있다.
- Feature Interface에는 terminal width·ANSI·focus 같은 표현 세부사항을 넣지 않는다.
- 이전 Snapshot이 이후 publish로 바뀌지 않는 참조 안정성을 수락 기준으로 둔다.

## 6. Phase 0 — 현재 동작 보호

### 6.1 Runtime 선택표 고정

대상:

- `src/app.ts`
- `src/core/application/orchestration/request-runtime-mode.ts`
- `src/adapters/outbound/workspace/project-workbench-session.ts`
- `test/request-runtime-mode.test.ts`
- `test/cli.test.ts`
- 신규 또는 기존 app composition 집중 테스트

테스트 행렬:

| runtimeConfig | design | 기대 모드 | 기대 capability |
|---|---|---|---|
| 있음 | astra | broker | 있음 |
| 있음 | 없음 | broker | 있음 |
| 없음 | astra | off | 없음 |
| 없음 | 없음 | observe | 없음 |

완료 기준:

- `requestCapabilityFactory`가 Astra의 `off`보다 우선함을 session options까지 확인한다.
- plain `www`, `astra`, `--resume`, execution lane의 현재 모드를 고정한다.
- 내부 `runApp` 직접 호출과 test/preview caller를 목록화한다.
- 이 단계에서는 `design`과 `Astra` 이름을 제거하지 않는다.

### 6.2 streaming → final identity 고정

대상:

- `native-stream-projection.ts`
- `native-event-projection.ts`
- `native-event-lifecycle.ts`
- `workbench-projections.ts`
- `project-workbench.ts`
- `test/native-stream-projection.test.ts`
- `test/native-event-projection.test.ts`
- `test/project-workbench-lifecycle.test.ts`

필수 시나리오:

- 같은 item의 late delta는 무시한다.
- 같은 turn의 다른 item과 다른 turn은 identity에 따라 별도 처리한다.
- missing-final bridge는 matching draft item identity를 유지한다.
- final Activity append 전에 volatile stream을 지우지 않는다.
- final Activity가 나타난 Snapshot에서 대응 휘발 메시지는 제거된다.
- 중간 Snapshot에서도 같은 응답이 두 메시지로 동시에 나타나지 않는다.

### 6.3 Snapshot 역사 안정성 고정

대상:

- `core/domain/work/workbench.ts`
- `workbench-durable-projection.ts`
- `project-workbench.ts`
- project-workbench recovery/lifecycle tests

필수 시나리오:

1. Snapshot A를 보관한다.
2. delta, durable append, Todo 외부 변경, Note async 완료, model refresh를 각각 발생시킨다.
3. Snapshot B를 받는다.
4. Snapshot A의 배열·메시지·중첩 객체가 deep equality 기준으로 변하지 않았음을 확인한다.
5. 공개 객체의 필요한 부분이 freeze됐음을 확인한다.

`readonly` 키워드 추가만으로 완료 처리하지 않는다.

### 6.4 revision과 journalSequence 고정

- delta-only: `revision + 1`, `journalSequence` 동일
- durable append: 둘 다 변화
- `subscribe(afterSequence)`가 delta-only 상태를 즉시 replay하지 않는 현재 동작을 승인하거나 수정한다.
- 승인한 의미를 타입 JSDoc과 테스트 이름에 기록한다.

### 6.5 늦은 async 결과 scope 고정

대상:

- Linear dashboard refresh
- Observability dashboard read
- Usage initial refresh/polling
- Git telemetry
- model/auth/repository overlay request
- automatic T-note generation

완료 기준:

- project/thread/request/generation identity가 맞지 않는 결과는 버린다.
- 빠른 재진입에서 이전 요청 결과가 새 화면을 덮지 않는다.
- shell dispose 뒤 callback은 no-op이다.
- stale 결과 유지와 실제 오류 상태를 구분한다.

### 6.6 7계층 E2E와 vendor patch

대상:

- `layer-performance.ts`
- `render-scheduler.ts`
- `workbench-shell.ts`
- `patches/@earendil-works__pi-tui@0.84.4.patch`
- layer performance/render scheduler/terminal integration tests

필수 시나리오:

- 화면을 바꾸는 단일 event가 7경계를 연결한다.
- delta burst가 한 frame으로 coalesce되어도 event→frame 관계를 추적한다.
- 의도적인 no-render와 observer 누락을 구분한다.
- terminal Activity는 immediate flush한다.
- layout failure와 terminal write failure를 별도 경계에서 기록한다.
- vendor patch 또는 observer wiring이 빠지면 검사가 실패한다.
- `terminal-write complete`가 정확히 어떤 반환/신호인지 Interface에 정의한다.

Phase 0 종료 gate:

- 위 신규 행동 테스트 통과
- 기존 resume·approval·request runtime·shell 회귀 통과
- 제품 이름과 폴더 변화 없음

## 7. Phase 1 — 상태 소유권 교정

### 7.1 Thread scope 불변식 회수

현재 구현:

- `project-workbench-session.ts`의 `ThreadBoundActivityJournal`
- `ThreadScopedTNoteSource`
- `ThreadScopedTodoSource`

목표:

- bind-before-lease
- same-thread-only rebind
- pre-thread intake 허용 method whitelist
- Native thread에서 journal/Todo/Note scope를 만드는 규칙

위 의미 규칙을 Core Application의 명시적 Module/Interface로 회수한다. 파일 경로·JSONL·Todo.md·잠금·fsync는 Outbound에 남긴다.

완료 기준:

- 다른 thread rebind 거부
- intake adoption idempotency
- thread/start event window 부재
- 기존 `project-workbench-session` 테스트 보존
- Outbound Adapter가 scope 정책을 새로 판단하지 않음

### 7.2 Composer writer 고정

- 편집 중 text buffer: TUI shell/editor
- 제출된 request와 queue: Core
- FileComposerDraftController: persistence Adapter
- 파일 load 결과가 현재 editor generation을 덮지 않게 한다.

### 7.3 Todo·Summary·Note·외부 reader writer 문서화

각 Interface에 다음을 기록한다.

- writer
- identity
- revision/version
- 실패 시 보존할 값
- stale 판정
- resume/retry 규칙

Phase 1 종료 gate:

- 상태 소유권 표와 코드 Interface 일치
- Inbound→concrete Outbound import 없음
- 업무 판단은 Core에 위치
- 단순 read는 명시적인 주입 Interface로 허용

## 8. Phase 2 — Port와 Snapshot Interface 정리

### 8.1 Port 분류

`core/ports/index.ts`를 실제 책임에 따라 다음 후보로 분리한다.

```text
core/ports/
├─ execution/
├─ persistence/
├─ integration/
└─ observability/
```

단, 물리 이동은 import graph와 두 Adapter 필요성을 확인한 Port에만 적용한다.

### 8.2 Feature 읽기 Interface

후보:

```text
ShellSnapshot
PlanFeatureProjection
TracerFeatureProjection
ChatFeatureProjection
SummaryFeatureProjection
NoteFeatureProjection
```

이 이름은 확정 타입명이 아니라 책임 후보다. Sol은 기존 Projection을 재사용할 수 있는지 먼저 본다.

시작 순서:

1. Plan
2. Tracer
3. Chat

Plan·Tracer처럼 원천이 비교적 명확한 Feature부터 전체 Snapshot 의존을 줄인다. Chat은 Activity+volatile delta+queue+Note anchor 합성 계약을 마지막에 다룬다.

완료 기준:

- Feature test fixture가 `Partial<WorkbenchSnapshot>` 또는 넓은 cast에 덜 의존한다.
- shell만 전체 조립 Snapshot을 안다.
- Feature는 자신이 표시하는 의미 필드만 안다.
- 표현 세부사항은 Inbound에 유지한다.

## 9. Phase 3 — Feature registry 분류

물리 이동 전에 `productGroup`을 별도 축으로 추가한다.

```text
core-work | observability | control | integration
```

유지할 기존 축:

```text
page | embedded | interaction
```

함께 결정할 항목:

- Cache/Test의 동일 `order: 120` 허용 또는 해소 정책
- Trace / Tracer / Source 제품 용어
- T-note descriptor의 Summary/Note 표현
- `legacy`, `unwired`, `active` Unit 상태

완료 기준:

- registry 18 Feature·39 Unit identity 보존
- retired ID 재사용 없음
- productGroup은 물리 상위 폴더가 아님
- sibling feature import gate 유지

## 10. Phase 4 — Summary와 Note 사용자 흐름

최종 의미:

- Summary: Activity·turn 범위에서 생성한 provenance 보유 산출물
- Note: Summary의 보존·검토·승격 수명을 관리하는 기록

먼저 결정할 capture 계약:

1. 같은 Summary identity를 Note lifecycle에 등록
2. 원본 Summary를 참조하는 Note record 생성
3. 내용을 복사한 독립 record 생성

기본 권고는 1 또는 2이며, 독립 writer가 두 곳 생기는 3은 피한다.

구현 순서:

- 완료 Note 읽기 Unit 연결
- 저장된 Summary 조회 Projection
- capture identity
- read
- review
- promote

완료 기준:

- F004-U01 `unwired` 상태 해소 또는 명시적 제거
- source Activity/turn/version 보존
- 생성 실패·저장 실패·review 실패 상태 구분
- 기존 append-only/legacy read 호환 보존

## 11. Phase 5 — 실행면과 명칭

Phase 0–4가 통과한 뒤 수행한다.

- 검증된 미사용 non-Astra `runApp` 경로 처리
- `design` chrome flag 제거 또는 역할 기반 옵션으로 변경
- `runAstra`, `Astra*` 파일·타입·테스트 명칭을 WWW 또는 기능 역할 이름으로 변경
- CLI route와 runtime policy를 분리
- Legacy Router는 별도 결정으로 유지 또는 migration
- `session-model-usage.ts` 같은 Native/legacy 공동 사용 코드는 보존

완료 기준:

- Runtime 선택표 의미 보존
- 허용된 historical fixture 외 제품 코드의 Astra 명칭 0건
- legacy Router 처분이 독립 이슈/결정으로 추적됨

## 12. Phase 6 — 승인된 폴더 이동

상태와 Interface가 정리된 뒤 TUI 기능 내부를 익숙한 MVC 어휘로 정리한다.

```text
<feature>/
├─ controller/       # 사용자 의도 → Workbench Command
├─ view-model/       # Core Projection → 화면 전용 데이터
├─ view/             # 터미널 렌더링
└─ registration/
```

업무 Model·Service·Repository Interface는 Feature 폴더에 복제하지 않고 각각 `core/domain`, `core/application`, `core/ports`에 둔다. 저장·외부 통신 구현은 `adapters/outbound`에 둔다.

빈 폴더·빈 export·TODO·no-op 파일은 만들지 않는다.

이동 순서:

1. Chat을 기준 기능으로 한꺼번에 옮기지 않는다.
2. Phase 2에서 가장 먼저 좁힌 Plan 또는 Tracer 한 기능을 pilot으로 선택한다.
3. architecture/import/Unit/문서 gate를 검증한다.
4. 같은 패턴을 다른 기능에 반복한다.
5. Chat은 합성 계약이 안정된 뒤 이동한다.

이 순서는 기존 보고서의 “Chat을 기준 기능으로 먼저 이동” 제안을 수정한다. Chat은 가장 복잡한 합성 Feature이므로 pilot으로 부적합하다.

## 13. 코드 가독성과 주석 계획

Luna 검사 결과 핵심 24파일은 현재 다음 자동 gate를 통과했다.

- `00_normalize-imports.ts`: changed=0
- `06_align-tables.ts`: misaligned=0, compressed=0

이는 구조 단순화가 끝났다는 뜻이 아니다.

함수 지도 우선 후보:

1. `project-workbench.ts`
2. `project-workbench-session.ts`
3. `todo-ledger.ts`
4. `t-notes.ts`
5. `todos.ts`

다음 후보:

- `workbench-projections.ts`
- `native-event-lifecycle.ts`
- `native-event-projection.ts`
- `t-note-service.ts`

공개 optional JSDoc 후보:

- `request-runtime-mode.ts`의 `mode?`
- `feature.types.ts`의 `route?`
- `WorkbenchSnapshot`의 관측 전/legacy/loading 선택 필드
- `ProjectWorkbenchSessionOptions`의 runtime/capability/resume 선택 필드

규칙:

- 한 번에 제품 파일 하나만 저작한다.
- 함수 지도는 실제 선언과 1:1이며 `08_function-map.ts`로 검사한다.
- 코드가 이미 말하는 내용을 산문 주석으로 반복하지 않는다.
- state writer·identity·scope·sequence의 Why와 불변식만 주석으로 둔다.
- 변경 파일마다 `00`, `02`, `06`, 필요한 `08`, typecheck와 행동 테스트를 실행한다.

## 14. Markdown 갱신 계획

“MD 전부 갱신”은 현재 정본을 모두 일치시킨다는 뜻으로 적용한다. 과거의 계획·감사·성능 측정·handoff를 현재형으로 소급 변경하지 않는다.

### Wave 0–2 현재 정본

- `LAYERS.md`
- `README.md`
- `CONTEXT.md`
- `docs/WWW_CODE_ARCHITECTURE.md`
- `docs/WWW_OBSERVABILITY_VIEW_ARCHITECTURE.md`
- `docs/REQUEST_RUNTIME.md`
- 필요한 `docs/REQUEST_RUNTIME_STRICT.md`

### Wave 3 Feature 정본

- `docs/TUI_CODE_MATRIX.md`
- `docs/WWW_CODE_ARCHITECTURE.md`
- `README.md`
- `CONTEXT.md`
- `.agents/skills/woo-linear-issue-intake/SKILL.md`의 taxonomy

### Wave 4 Summary/Note 정본

- `docs/CONVERSATION_RECAP.md`
- 현재 이름의 Execution Console 문서
- `README.md`
- `CONTEXT.md`
- `.agents/skills/session-goal/SKILL.md`
- 관련 Obsidian schema v2 canonical

### Wave 5–6 명칭·경로 정본

- `LAYERS.md`
- `README.md`
- `CONTEXT.md`
- `docs/WWW_CODE_ARCHITECTURE.md`
- `docs/TUI_CODE_MATRIX.md`
- 제품 방향 문서의 현재 상태표
- 현재 운영 스킬의 링크와 taxonomy

역사 보존 대상:

- `docs/planning`의 과거 plan/result/handoff
- `docs/research` 조사 원문
- `docs/audit` 과거 감사
- 과거 benchmark와 changelog
- 과거 Astra 이름을 증거로 포함한 Receipt

역사 문서는 필요하면 상단에 “대체 문서” 링크만 추가하며 본문을 일괄 치환하지 않는다.

현재 확인된 문서 drift:

- `TUI_CODE_MATRIX.md`: 16 descriptor 및 구 경로
- `WWW_PRODUCT_DIRECTION.md`: 현재 package와 다른 진행 버전
- `REQUEST_RUNTIME.md`: 기본 observe 표현과 실제 Astra off 진입 차이
- Execution Console 문서: Astra/compat 용어
- 완료 Note 읽기를 구현 완료처럼 읽을 수 있는 문구
- recorder 단위 테스트와 실제 7-layer E2E를 같은 검증으로 표현한 문구

## 15. Sol 작업 묶음과 검토 단위

| 묶음 | 작업 | 최대 변경 성격 | 독립 수락 |
|---|---|---|---|
| S0-A | Runtime 선택표 테스트 | 테스트 중심 | runtime mode matrix |
| S0-B | streaming/final identity 테스트 | 테스트 중심 | 중복·누락 없음 |
| S0-C | Snapshot 역사 안정성 | 테스트 + 최소 수정 | 과거 snapshot 불변 |
| S0-D | async scope guard | 테스트 + 작은 수정 | stale/disposed no-op |
| S0-E | 7-layer/vendor wiring | 테스트 + 계측 seam | event/frame/write 추적 |
| S1-A | Thread scope Core 계약 | Core + Outbound adapter | 불변식 위치·행동 보존 |
| S1-B | Composer writer | TUI/Core/persistence | 편집/제출 분리 |
| S2-A | Port 분류 | Core ports/importers | architecture green |
| S2-B | Plan Projection·ViewModel | Core/TUI/tests | narrow fixture |
| S2-C | Tracer Projection·ViewModel | Core/TUI/tests | exact source identity |
| S2-D | Chat Projection·ViewModel | Core/TUI/tests | Activity+delta 합성 |
| S3 | productGroup | registry/tests/docs | 18/39 identity 보존 |
| S4 | Summary/Note flow | Core/TUI/outbound/tests | capture→promote |
| S5 | WWW naming | entry/TUI/tests/docs | runtime 의미 보존 |
| S6-N | 기능별 Controller/ViewModel/View 이동 | imports/gates/IDs/docs | 한 기능 단위 green |

각 묶음은 작성과 독립 검토를 분리한다. Phase 종료 전에는 다음 Phase의 광범위한 rename/move를 섞지 않는다.

## 16. 공통 검증 gate

각 Sol 변경 파일:

```text
00_normalize-imports.ts 검사 모드
02_audit-type-uncertainty.ts --file
06_align-tables.ts --file
08_function-map.ts --file   # 함수 지도 보유 파일
bun run check
관련 행동 테스트
test/architecture.test.ts   # 경계 영향 시
git diff --check
TODO / test.skip / test.only 직접 검색
```

Phase gate:

- 상태 writer와 identity를 테스트 이름으로 설명할 수 있다.
- 이전 Snapshot/이전 thread/폐기된 shell에 늦은 결과가 적용되지 않는다.
- Interface가 구현 세부사항보다 작아졌다.
- 새 얕은 pass-through Module을 만들지 않았다.
- Code-ID·TUI Unit·문서 정본이 변경 코드와 일치한다.
- 외부 Linear/Obsidian 게시 전 Candidate 승인과 read-back 절차를 지킨다.

## 17. 구현 시작 조건

Sol 구현은 다음 조건이 충족된 뒤 시작한다.

- 사용자가 이 계획의 Phase 0 범위와 순서를 승인한다.
- WOO-842 본문 개정 Candidate가 현재 계획과 일치한다.
- Obsidian WOO-842 schema v2 draft를 새로 만들지 또는 기존 정본 위치를 복구할지 결정한다.
- 같은 워크트리의 기존 보고서/Evidence 변경을 보존한다.

첫 구현은 `S0-A Runtime 선택표 테스트`다. 제품 코드 rename이나 폴더 이동으로 시작하지 않는다.

## 18. 실행 진행

### 2026-09-25 · S0-A Runtime 선택표 완료

- `runApp → createProjectWorkbenchSession` 조립 seam에 역할 기반 dependency injection을 추가했다.
- runtimeConfig/Astra/기본 4개 조합과 `runAstra` 진입을 7개 행동 테스트로 고정했다.
- 실패한 shell open이 session을 close하고 원래 error를 전파함을 검증했다.
- 관련 회귀 43건과 architecture 13건, TypeScript·가독성·diff 검사가 통과했다.
- Sonnet 리뷰 `APPROVE`, Opus 최종 감사 `PASS`다.

비차단 후속:

- 성공 경로에서 close 미호출 단언
- runtime config loader path 캡처
- production shell props의 design 전달 통합 검증
- Pi provider/model/effort/systemPrompt 전달 검증

### 2026-09-25 · S0-B streaming/final identity 완료

- 공개 `ProjectWorkbench` Snapshot 경계에서 동일 Native item의 streaming draft가 표시되는 동작을 고정했다.
- 최종 Activity append를 지연한 동안 별도 Snapshot을 발행해, durable append 전에 volatile draft가 지워지지 않음을 검증했다.
- append 완료 뒤 첫 Snapshot에는 동일 identity의 durable assistant message 하나만 있고 대응 draft는 없음을 검증했다.
- 구독으로 수집한 중간 Snapshot 어디에도 같은 논리 응답의 durable message와 volatile draft가 함께 나타나지 않음을 검증했다.
- missing-final 보존 Activity가 원래 draft의 thread/turn/item identity를 유지함을 공개 Chat→Activity 연결로 확인했다.
- 신규 테스트는 최초부터 green이었다. 현재 제품 순서가 계약을 이미 만족하므로 제품 코드는 변경하지 않고 회귀 계약만 보강했다.
- 집중 회귀 61건과 architecture 13건, 전체 1,502건, TypeScript·가독성·diff 검사가 통과했다.
- Sonnet 독립 리뷰 `APPROVE`, Opus 최종 감사 `PASS`다.

비차단 후속:

- draft 없는 missing-final placeholder identity 별도 검증
- journal gate의 명시적 timeout으로 실패 진단 개선
- `Bun.sleep(10)`을 구독 기반 정착 신호로 대체

### 2026-09-25 · S0-C Snapshot 역사 안정성 완료

- 공개 `subscribe`와 `snapshot` seam에서 Native delta·모델 catalog·Todo·Usage 갱신 후에도 과거 Snapshot의 중첩 값이 바뀌지 않음을 고정했다.
- 직접 mutation 차단과 이후 publish에 의한 역사 안정성을 별도로 검증했다.
- 기존 구현이 계약을 만족해 제품 코드는 변경하지 않았다.
- 전체 1,503건과 architecture 13건, TypeScript·가독성·diff 검사가 통과했다.

### 2026-09-25 · S0-D async scope guard 완료

- close 뒤 늦게 완료된 model catalog 결과가 폐기되도록 `ProjectWorkbench`를 수정했다.
- 이전 turn의 Todo sync가 최신 turn 상태를 덮지 못하도록 Native/Request sync 공용 revision guard를 추가했다.
- Linear Dashboard의 기존 thread/close guard를 공개 seam 테스트로 고정했다.
- T-note는 완료 turn 범위 포획과 abort/close drain이 이미 존재해 수정하지 않았다.
- 관련 123건, 전체 1,506건, architecture 13건과 TypeScript·가독성·diff 검사가 통과했다.

### 2026-09-25 · 구조 언어 정정

- 외부 연결과 업무 처리는 Hexagonal 구조를 유지한다.
- Core가 정제한 상태를 TUI로 전달한 뒤에는 Controller·ViewModel·View로 분리한다.
- 기존 `contract/projection/presentation/interaction/registration` 목표 어휘를 `Core Interface + controller/view-model/view/registration`으로 정정했다.
- 빈 Service·Repository·Domain 폴더와 얕은 전달 Module은 만들지 않는다.

### 2026-09-25 · S0-E 7-layer/vendor wiring 완료

- 화면을 바꾸는 Native event가 실제 Workbench와 patched TUI를 거쳐 `terminal-write`까지 7경계를 완료함을 고정했다.
- 여러 delta가 한 frame으로 합쳐져도 모든 trace가 같은 `terminal-frame-*` identity를 유지한다.
- 의도적인 `no-render`를 observer 누락인 `collecting`과 분리하고 window 집계에도 complete/no-render/incomplete를 구분했다.
- `terminal-write completed`는 OS flush가 아니라 동기 `Terminal.write` 반환 뒤라는 계약을 실제 호출 순서로 검증했다.
- 실제 TUI layout 예외와 terminal write 예외가 각 소유 계층의 `failed`로 기록됨을 통합 검증했다.
- focused 71건, 전체 1,513건, architecture 13건과 TypeScript·가독성·diff 검사가 통과했다.
- 독립 코드 리뷰는 blocker 없이 `APPROVE`; MEDIUM 두 건은 위 통합 테스트로 보강했다.
- Claude Opus 최종 감사는 조직 정책 403으로 판정을 반환하지 못해 하향 대체 없이 미실행 blocker로 기록했다.

다음 계획 묶음은 `S1-A Thread scope 불변식 회수`다.

### 2026-09-25 · S1-A Thread scope 불변식 회수 완료

- same-thread-only 결속, pre-thread intake whitelist, adoption provenance·멱등성, Note/Todo scope 규칙을 `core/application/session/thread-scope-policy.ts`로 회수했다.
- Outbound에는 Native scope ID, `Tracer.md`·`Todo.md` 경로와 store/ledger 생성만 남겼다.
- bind-before-lease, 동시 same/different thread bind, Todo initialize 실패 cleanup·retry를 행동 테스트로 고정했다.
- 독립 리뷰가 발견한 intake 중복 adoption과 trace rebuild 중 append 누락 경쟁을 결정적 Red로 재현하고 하나의 Core queue로 직렬화했다.
- trace append 실패 시 canonical journal은 보존하고 호출은 reject하며 다음 append queue는 회복한다.
- focused·architecture·traceability 47건, 전체 1,523건, TypeScript·가독성·diff 검사가 통과했고 재감사 결과는 `APPROVE`다.

다음 계획 묶음은 `S1-B Composer writer 고정`이다.

### 2026-09-25 · S1-B Composer writer 고정 완료

- live text의 단일 writer를 TUI Editor로 고정하고 제출 요청·queue 소유권은 Core Workbench에 유지했다.
- 제출 세대가 늦게 reject/error/accept되어도 이후 편집 세대를 복원하거나 지우지 않도록 generation 계약을 추가했다.
- 독립 리뷰가 발견한 in-flight clear와 shutdown save 역전은 `ComposerDraftPersistenceQueue`로 clear·보상 save·shutdown save를 직렬화해 제거했다.
- clear/save 중 추가 편집이 발생하면 안정된 최신 generation의 editor text까지 보상 저장한다.
- 초기 draft load는 shell 시작 전 값이고 File Controller는 persistence-only라는 Port 계약을 명시했다.
- focused 33건, architecture 13건, 직렬 전체 1,528건, TypeScript·가독성·diff 검사가 통과했고 재감사 결과는 `APPROVE`다.

다음 계획 묶음은 `S1-C Todo·Summary·Note·외부 reader writer 계약`이다.

### 2026-09-25 · S1-C writer/read 계약 완료

- Todo CAS·revision/conflict 보존, Summary/Note provenance·append/retry, Usage·Linear·Git·Auth·Repository freshness/stale 의미를 실제 Interface에 명시했다.
- 익명 Linear refresh type을 `LinearProjectDashboardReader` Core Port로 승격하고 Outbound MCP reader가 구현하게 했다.
- `packet.digest`는 생성 시각을 포함한 integrity digest이고 완료 source identity가 아님을 분리했다.
- `tNoteSourceIdempotencyKey`는 project·range·immutable source activity IDs에서 파생하며 기존 schema-v1 JSONL을 마이그레이션 없이 지원한다.
- File store의 프로세스 간 read-dedupe-append와 Service의 append 응답 유실 read-back이 같은 stable source key를 사용한다.
- 서로 다른 clock·model·text의 동시 capture는 한 record로 수렴하고 다른 source는 별 sequence를 유지한다.
- target 49건, architecture 13건, 전체 1,531건, TypeScript·가독성·diff 검사가 통과했고 최종 재감사는 `APPROVE`다.

Phase 1 상태 소유권 교정이 완료됐다. 다음 계획 묶음은 `S2-A Port 책임 분류와 Snapshot 노출 축소`다.

### 2026-09-25 · S2-A Port 책임 분류 완료

- `core/ports`를 `execution`, `persistence`, `integration`, `observability` 책임으로 물리 분리했다.
- `core/ports/index.ts`는 선언 없는 type-only 호환 barrel로 남기고 제품·테스트 소비자는 책임별 Port를 직접 import하게 했다.
- Architecture gate는 허용 그룹, definition-free barrel, 제품 코드의 직접 import를 검사하며 15건이 통과한다.
- `ArtifactPublicationPort`는 외부 게시 구현을 사용하지만 Core 관점의 실행 명령 경계이고, `RequestProjectionPort`는 요청 lifecycle capture 경계라는 현재 분류 의도를 다음 단계에서 JSDoc으로 고정한다.
- 관련 회귀 236건, 전체 1,533건, 루트 재검증 76건과 TypeScript·import·표 정렬·diff 검사가 통과했다.
- 독립 검토는 차단 이슈 없이 `APPROVE/WATCH`다. WATCH는 위 두 Port의 의미 설명과 test 소비자 gate 범위다.

다음 계획 묶음은 `S2-B Feature 읽기 Interface 축소`다. 전체 `WorkbenchSnapshot`은 shell 조립용으로 유지하고 Plan·Tracer부터 좁은 readonly Projection을 실제 소비 경로에 연결한다.

### 2026-09-25 · S2-B Plan·Tracer 읽기 Interface 축소 완료

- Plan과 Tracer에 전체 Snapshot과 독립적으로 생성 가능한 명시적 readonly Projection을 추가했다.
- shell 조립 지점만 `WorkbenchSnapshot`을 알고 `projectPlanFeature`·`projectTracerFeature`로 좁혀 실제 View에 전달한다.
- Projection에는 terminal width·ANSI·focus·scroll을 넣지 않았고 새 store·writer·상태 정본도 만들지 않았다.
- Tracer fixture의 `Partial<WorkbenchSnapshot>` 의존을 제거하고 Plan 독립 계약 렌더 및 architecture 회귀 gate를 추가했다.
- Snapshot 역사 안정성 1건, 관련 83건, 전체 1,538건과 TypeScript·import·표 정렬·diff 검사가 통과했다.
- 루트 재검증 54건과 독립 코드 리뷰 결과는 `CLEAR/APPROVE`다.

다음 계획 묶음은 `S2-C Chat 합성 Projection과 TUI ViewModel 경계`다. Chat의 durable Activity·final message·volatile delta·queue·T-note anchor를 한 writer로 합치지 않고 하나의 읽기 계약으로 투영한다.

### 2026-09-25 · S2-C Chat 합성 Projection 완료

- `ChatFeatureProjection`을 추가하고 일반 Chat·Astra transcript·execution heading·demo·motion·shell 갱신 경로를 모두 이 계약으로 배선했다.
- Chat 기능 폴더의 `WorkbenchSnapshot` 의존은 0건이며 architecture gate가 회귀를 차단한다.
- Projection은 Activity·final chat·volatile draft/reasoning/live activity·queue·T-note·실행 상태의 표시 의미만 고르고 writer나 store를 추가하지 않는다.
- streaming→final 동일 identity, 단일 final, volatile 제거와 과거 Projection 안정성 테스트를 추가했다.
- Chat 묶음 199건, 전체 1,540건, 루트 재검증 157건과 TypeScript·import·표 정렬·diff 검사가 통과했다.
- 독립 코드 리뷰 결과는 `CLEAR/APPROVE`다.

Phase 2의 Port·Feature 읽기 Interface 정리가 완료됐다. 다음 계획 묶음은 물리 이동 전 `S3 Feature registry 제품 분류 축`이다.

### 2026-09-25 · S3 Feature registry 제품 분류 완료

- 18개 Feature에 `core-work`, `observability`, `control`, `integration`의 `productGroup`을 추가하고 기존 `page`, `embedded`, `interaction` kind와 독립 축으로 유지했다.
- 39개 Unit ID·key·title과 retired ID 불변을 보존했다.
- Cache와 Test의 동일 `order: 120`은 key 기반 stable tie-break(`cache` → `test`)로 명문화했다.
- 실제 배선을 대조해 legacy 4개와 `TUI-F004-U01` unwired 상태를 유지했으며 Trace/Source·T-note identity rename은 하지 않았다.
- focused+architecture 24건, 전체 1,544건, 루트 재검증 24건과 TypeScript·가독성·diff 검사가 통과했다.
- 독립 코드 리뷰 결과는 `CLEAR/APPROVE`다.

다음 계획 묶음은 `S4-A 완료 Note 읽기 사용자 흐름`이다. 기존 생성·append-only 저장을 보존하고 `TUI-F004-U01`을 실제 배선과 행동 테스트로 active 전환한다.

### 2026-09-25 · S4-A 완료 Note 읽기 사용자 흐름 완료

- `/tnotes`를 실제 목록·선택·상세 overlay에 연결하고 기존 `TNotesSourceView`를 재사용했다.
- `TUI-F004-U01`을 `unwired`에서 `active`로 전환했으며 terminal 행동 테스트가 사용자 도달성을 증명한다.
- current·legacy·unknown provenance, Activity range·turn·model, empty·unavailable·stale와 생성·저장·읽기 실패를 구분한다.
- 독립 리뷰가 발견한 새 세션 영구 loading 결함을 수정해 bind 전 `awaiting-thread`, bind 후 `loading → ready/stale` 전이를 Core thread scope가 소유하게 했다.
- bind/read queue와 generation guard로 bind 실패·source 미구성·close 이후 늦은 결과를 현재 화면에 적용하지 않는다.
- focused 77건, 전체 1,553건, 루트 재검증 59건과 TypeScript·architecture·가독성·diff 검사가 통과했다.
- 실제 terminal `/tnotes → 선택 → 상세 provenance → 닫기` E2E 보강 후 독립 재감사는 `CLEAR/APPROVE`다.
- capture 등록/참조 방식과 review·promote 정책은 사용자 결정 전 새 writer·저장 형식을 발명하지 않고 명시적 Gap으로 남긴다.

다음 계획 묶음은 Runtime 정책을 보존한 `S5 Astra 제품 명칭 → WWW` 정리다.

### 2026-09-25 · S5 Astra 제품 명칭 → WWW 완료

- Native TUI의 `astra-*` 파일·식별자·테스트·스크립트를 `www-*`, `Www*` 또는 중립 이름으로 이동해 옛 이름의 제품 파일을 0건으로 만들었다.
- `RunAppOptions.surface`와 `requestRuntimeMode`를 분리해 이름·chrome 선택이 실행 정책을 암묵적으로 바꾸지 않게 했다.
- 명시적 capability/runtime config는 `broker`, plain `runWww`는 `off`, 호환 programmatic `runApp`은 `observe` 계약을 유지한다.
- `www astra`는 도움말 비노출 deprecated alias로만 유지하고 Legacy Router·공동 session 코드·외부 모델 ID `gpt-6-astra`는 보존했다.
- 독립 리뷰가 찾은 `REQUEST_RUNTIME.md` 정책 drift와 성능 문서 옛 경로를 교정하고 도움말 비노출 부정 테스트를 추가했다.
- 전체 1,554건, 루트 관련 117건, 보정 후 관련 83건과 TypeScript·architecture·가독성·Development Map·diff 검사가 통과했다.
- 보정 재감사 결과는 `CLEAR/APPROVE`이며 S5 현행 문서 링크 누락은 0건이다.

다음 계획 묶음은 확정된 경계에 따른 `S6 기능별 controller·view-model·view·registration 물리 이동`이다.

### 2026-09-25 · S6 기능별 TUI 책임 폴더 이동 완료

- 18개 Feature의 구현을 실제 책임이 있는 `controller`, `view-model`, `view`, `registration` 한 단계 아래로 이동했다.
- 현재 물리 파일 수는 `controller 1`, `registration 36`, `view-model 7`, `view 60`이며 빈 책임 폴더는 0개다.
- Feature 평면에는 전체 registry와 공통 type만 남기고 sibling Feature import 금지를 유지했다.
- ViewModel의 pi-tui·chalk·ANSI·terminal 폭 의존을 제거하고 View만 표현 기술을 소유하도록 architecture gate를 추가했다.
- `LAYERS.md`, TUI Matrix, Observability·Linear planning 문서와 Code-ID/traceability 경로를 이동된 실제 파일에 맞췄다.
- architecture+registry 25건, TypeScript, diff 검사가 통과했고 독립 재검토 결과는 `CLEAR/APPROVE`다.

## 19. 현재 최종 상태와 남은 결정

이 절은 앞부분의 미래형 계획·조사 당시 경로·옛 Astra 용어보다 우선하는 현재 상태다.

### 완료된 구조 계약

- 전체: `Inbound Adapter → Core Application + Domain ← Port ← Outbound Adapter`
- Port: `execution`, `persistence`, `integration`, `observability` 4그룹과 definition-free type-only 호환 barrel
- TUI: 기능별 `controller / view-model / view / registration`; 18 Feature·39 Unit, 물리 파일 `1 / 7 / 60 / 36`
- 읽기 계약: shell만 전체 Snapshot을 조립하고 Chat·Plan·Tracer·Note는 좁은 readonly Projection을 소비
- Note: 완료 Note의 `/tnotes → 목록 → 선택 → provenance 상세 → 닫기` 사용자 흐름 연결
- 명칭: 현재 제품·파일·스크립트는 WWW이며 `www astra`는 도움말 비노출 deprecated alias, `gpt-6-astra`는 외부 모델 ID
- Runtime: 명시적 capability/config는 `broker`, 일반 `runWww`는 `off`, 호환 `runApp`은 별도 설정이 없을 때 `observe`
- 관측: `native-receive`부터 `terminal-write`까지 7경계, coalesced frame, `no-render`, vendor observer 실패를 테스트로 구분

### 아직 닫지 않은 제품 결정

| 항목 | 현재 상태 | 다음 결정 |
|---|---|---|
| Summary → Note capture identity | 동일 provenance 산출물을 복사하지 않고 같은 identity로 Note 수명주기에 등록하기로 결정 | capture·review·promote를 동일 identity의 lifecycle 전이로 구현·검증 |
| Legacy Router | 별도 migration 완료 뒤 폐기하기로 결정; 현재 `www router`와 공동 session 코드는 보존 | migration 범위·호환 종료·폐기 수락 테스트를 별도 작업으로 실행 |
| Opus 최종 감사 | S0-E 호출은 조직 정책 403, 2026-09-26 전체 호출은 `claude-opus-5`로 실행됐으나 5분 30초·51턴 뒤 verdict 없이 tool-use에 머물러 중단 | 접근 가능한 환경에서 하향 대체 없이 재실행 |

구조 리팩터링 S0-A~S6와 두 제품 결정은 완료됐지만 capture lifecycle·Router migration 구현 및 외부 검증을 임의 완료로 표시하지 않는다. Linear·Obsidian 외부 표면도 별도 항목별 승인과 게시 후 read-back 전까지 변경되지 않았다.

### 2026-09-26 · 가독성 및 TUI·Plan UX 보정

- `ProjectWorkbench`의 Native lifecycle 의존성 조립을 전용 builder로 분리하고 읽기·쓰기·협력 객체·효과, 무인자·유인자 callback을 구분했다.
- value import와 type import, interface method 괄호, object colon·comma·semicolon 축을 동일한 가독성 계약으로 검사했다.
- Chat 왼쪽 inset을 줄이고 실행 상태를 Composer 바로 위 한 행으로 이동했다. 진행 중에만 Braille spinner와 실제 동작하는 `Esc` 중단 힌트를 표시한다.
- Plan·Activity를 compact typography로 통일하고 항목당 최대 2개 terminal row로 제한했다. Terminal에는 pt 단위 font가 없어 2pt 축소 요구는 행·padding·장식 밀도 축소로 구현했다.
- Native Plan에는 80자 이내 한 문장을 요청하고 Activity narration은 표시 Projection에서 첫 문장·120자 이내로 정규화한다. 원본 Activity와 provenance는 바꾸지 않는다.
- 관련 테스트 75건, architecture 17건, lifecycle 45건과 TypeScript·import·표 정렬 검사를 통과했다. frame identity와 Composer 상태행/Escape 통합 시나리오는 보정 후 3회 연속 22건 통과했다.

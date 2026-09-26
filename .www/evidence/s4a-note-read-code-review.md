# S4-A 완료 Note 읽기 흐름 독립 코드 리뷰

- 검토 범위: `TNoteBrowserController`·ViewModel·View, `/tnotes` parser/router/overlay, `NoteFeatureProjection`, T-note read-state/기존 append-only 계약과 관련 테스트.
- 검토 방식: 변경 diff와 호출 경로를 직접 추적하고, `bun test test/tnote-read-flow.test.ts test/astra-shell.test.ts test/tui-feature-registry.test.ts test/slash-commands.test.ts`(28 pass), `bun test test/t-notes.test.ts test/project-workbench-recording.test.ts test/project-workbench-session.test.ts`(69 pass), `bun test test/architecture.test.ts`, `git diff --check`를 실행했다.
- skill-perspective check: 이 세션에 `remove-ai-slops` 및 `programming` skill은 제공되지 않아 로드할 수 없었다. 그 기준(구현 상수만 확인하는 테스트, 불필요한 추출/정규화, 타입 우회, 불필요한 추상화)을 직접 적용했다. 새 browser 계층은 읽기 전용 UI 상태만 보유하며 Outbound concrete import·새 writer/storage format·가짜 review/promote를 추가하지 않아 해당 관점의 위반은 확인하지 못했다.

## Findings

### HIGH — thread-bound production source는 `/tnotes`를 영구 `loading`으로 남긴다

- 위치: `src/core/application/orchestration/workbench-note-narration.ts:79-105`, `src/core/application/orchestration/project-workbench.ts:755`, `src/core/application/session/thread-scope-policy.ts:195-199`.
- `WorkbenchNoteNarration`은 source가 있으면 초기 상태를 `loading`으로 둔다. 그러나 production은 `ThreadScopedTNoteSource`를 주입하므로 `bindThread` 메서드가 존재한다. `ProjectWorkbench.initialize()`은 그러한 source에 대해서는 `loadBoundNotes()`를 의도적으로 건너뛰며, 읽기는 새 Native thread가 생성되어 `bindThread()`가 호출된 뒤에만 수행된다.
- 따라서 새 WWW 세션에서 사용자가 `/tnotes`를 먼저 열면 실제 I/O가 진행 중이지 않은데도 "저장된 Note를 읽는 중입니다."가 무기한 표시된다. 이는 U01이 요구한 empty/unavailable/stale를 과장 없이 구분한다는 계약과 맞지 않고, 완료 Note 읽기 기능이 active라고 표시한 상태에서 표준 진입 경로를 잘못 설명한다.
- 수정 방향: 아직 Native thread 범위가 없다는 별도 read 상태(또는 정확한 `unavailable` 사유)를 Core projection으로 발행하고, bind 뒤에만 `loading → ready/stale` 전이를 하도록 계약을 정한다. 새 세션, resume, bind 실패 각각을 테스트해야 한다.

### MEDIUM — 실제 terminal 입력에서 populated 목록의 선택·상세 전환을 끝까지 보장하지 않는다

- 위치: `test/astra-shell.test.ts:67-73`, `test/tnote-read-flow.test.ts:62-82`.
- shell 테스트는 `/tnotes`가 빈 overlay를 여는지만 확인한다. 목록 선택·Enter·상세·Esc는 controller를 직접 호출해 확인하므로, 실제 overlay/sheet focus 및 key 전달이 populated Note에서 유지되는지를 한 테스트가 증명하지 않는다.
- controller unit test 자체는 유의미하고 중복도 아니다. 다만 U01의 "사용자 입력 → 목록 → 선택 → 상세" 완료 조건을 충족하려면 terminal harness에 current/legacy Note를 주입해 `/tnotes`, arrow/Enter/Esc의 화면 변화를 한 번 연결해 검증해야 한다.

### CRITICAL

없음.

### LOW

없음.

## 확인된 보존 사항

- `/tnotes`는 parser → command router → `WorkbenchOverlayController.openNotes()` → `TNoteBrowserController` → `projectNoteFeature()`로 연결된다. Inbound T-note/overlay 파일에서 concrete Outbound import는 발견되지 않았다.
- `projectTNote()`가 sequence, source range/activity IDs, completion thread/turn, model provenance, format을 projection에 보존하고, UI는 current·legacy 3/5-field·unknown을 읽기 전용으로 표시한다.
- 이 변경은 생성/append/저장 포맷이나 review/promote command를 추가하지 않는다. 읽기 실패는 `tnoteRead`에만 두며 Workbench execution error/action result와 분리한다.

## Verdict

- `codeQualityStatus`: BLOCK
- `recommendation`: REQUEST_CHANGES
- `blockers`:
  1. thread bind 전 영구 `loading` 상태를 정확한 Core read-state로 교정하고 fresh/resume/bind-failure 테스트를 추가할 것.
  2. `/tnotes` 실제 terminal 경로에서 populated list → selection → detail → close를 보장하는 통합 테스트를 추가할 것.

---

## 재감사 — 수정 후

- 검토 범위: 이전 HIGH/MEDIUM의 수정(`awaiting-thread`, bind queue/read generation/close guard, terminal populated Note E2E)과 그 주변의 Core/TUI 계약.
- 재실행: `bun test test/tnote-read-flow.test.ts test/astra-shell.test.ts test/t-notes.test.ts test/project-workbench-recording.test.ts test/project-workbench-session.test.ts test/slash-commands.test.ts test/tui-feature-registry.test.ts test/architecture.test.ts` — 117 pass, 0 fail, 4,111 assertions. `bun run check`, `git diff --check` 통과.
- skill-perspective check: 여전히 `remove-ai-slops`/`programming` skill이 이 세션에 제공되지 않았다. 같은 기준을 수동 적용했다. 이번 보정은 read-state 계약과 lifecycle guard에 한정되어 있고, production parsing/normalization·untyped escape hatch·불필요한 writer/추상화를 추가하지 않았다. 테스트는 lifecycle의 관측 가능한 상태 전이와 terminal input을 검증하므로 removal-only 또는 구현 상수 복제 테스트가 아니다.

### 이전 HIGH 해소

- `src/core/application/orchestration/workbench-note-narration.ts:82-87`은 thread-bound source의 초기 상태를 `unavailable/awaiting-thread`로 명시한다. view model은 이를 "Native 세션이 시작되면 저장된 Note를 읽습니다."로 표시한다.
- `bindThread()`는 queue를 통해 bind 후 `loading`을 발행하고 read 결과만 해당 generation에 `ready/stale`로 반영한다. `close()`는 generation을 무효화하여 늦은 read 결과가 닫힌 Workbench를 갱신하지 못하게 한다.
- fresh, resume, bind failure, source absent, close-late-read 케이스가 `test/tnote-read-flow.test.ts`에 추가되어 전이를 검증한다.

### 이전 MEDIUM 해소

- `test/astra-shell.test.ts:74-99`는 실제 terminal에서 populated `/tnotes` overlay를 열고, arrow 선택, Enter 상세, completion/provenance 렌더, Esc 상세 복귀와 close를 연속 검증한다. overlay focus/sheet 전달 경로의 공백이 해소됐다.

### 새 findings

없음. current/legacy/unknown read-only 형식 보존, append-only writer 분리, generation/storage/read 실패의 분리, Inbound의 concrete Outbound 비의존은 재확인했다.

## 최종 Verdict

- `codeQualityStatus`: CLEAR
- `recommendation`: APPROVE
- `blockers`: 없음.

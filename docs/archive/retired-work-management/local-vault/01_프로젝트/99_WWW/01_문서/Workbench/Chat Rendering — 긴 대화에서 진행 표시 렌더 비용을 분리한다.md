---
document_id: 094ed877-fc6b-4ee0-9285-cb478f0ec67a
schema_version: 2
record_type: detailed-canonical
status: draft
acceptance: partial
domain: Workbench
capability: Chat Rendering
linear: WOO-689
parent: null
related: []
spec_ids: []
code_ids: [Code-001]
test_ids: []
exception_ids: []
decision_ids: []
tags: [www/spec, domain/workbench, capability/chat-rendering]
source_revision: git:ccca4a378f73868cb7366c4dfae77867e405f758
updated_at: 2026-09-08T21:10:00+09:00
---

# Chat Rendering — 긴 대화에서 진행 표시 렌더 비용을 분리한다

## 1. Intent

### 사용자 문제

긴 Native 작업 중 진행 스피너가 바뀔 때마다 이미 읽은 Chat 활동 전체를 다시 렌더해 입력과 스크롤이 늦어진다.

### 기대 결과

진행 표시는 계속 움직이되, 동일한 Chat 본문과 과거 활동은 다시 투영하지 않는다.

### Reference

실행 중 Workbench의 활동 664개 재생에서 cache hit은 약 0.0013ms, spinner tick 뒤 전체 렌더는 평균 약 1,272ms였다. 이 수치는 현재 로컬 진단의 관측값이며 수락 검증 결과가 아니다.

## 2. Scope

### In Scope

`WorkbenchChatView`의 본문 행과 activity indicator 행을 별도로 갱신한다. 같은 snapshot과 폭에서 spinner frame만 바뀌면 본문 행을 재사용한다.

### Out of Scope

전체 transcript 가상화, Markdown highlighter 교체, terminal emulator 또는 cmux CPU 문제 해결, 외부 성능 모니터링 서비스 도입은 포함하지 않는다.

### Boundary

Chat은 행 구성과 cache를 소유한다. Shell은 redraw 요청만 소유하며, Native event의 상태 판단과 Activity Journal은 변경하지 않는다.

## 3. Desired Behavior

### Scenario DB-001 · 진행 표시만 갱신

**Given**

동일한 Chat snapshot과 터미널 폭으로 본문이 렌더되어 있고 activity indicator가 동작한다.

**When**

다음 spinner frame이 도착한다.

**Then**

과거 Chat 본문은 그대로 재사용하고 indicator 행만 새 frame으로 교체한다.

### Scenario DB-002 · 본문 상태가 바뀜

**Given**

새 Native event, assistant text, width 또는 view state가 변한다.

**When**

Workbench가 새 snapshot을 전달한다.

**Then**

기존 본문 cache를 폐기하고 새 snapshot 기준으로 전체 행을 다시 만든다.

## 4. Domain Contract

### INV-001

Spinner frame 변화만으로 Activity payload, Markdown source, card projection을 다시 계산하지 않는다.

### INV-002

본문 cache는 snapshot identity와 content width에만 결속된다. 그 둘 중 하나가 달라지면 이전 본문을 재사용하지 않는다.

### 용어

| 용어 | 정의 |
|---|---|
| 본문 행 | Chat 활동, 카드, draft, 오류와 action result로 구성한 안정된 출력 행 |
| indicator 행 | activity frame, 진행 문구, hint로 구성한 시간 변화 출력 행 |
| spinner tick | frame만 바꾸는 timer event |

## 5. State Model

| State | 의미 |
|---|---|
| body-cached | 특정 snapshot·폭의 본문 행이 준비됨 |
| body-stale | snapshot 또는 폭 변화로 본문을 다시 만들어야 함 |
| indicator-idle | 진행 표시가 없음 |
| indicator-active | 진행 표시가 있고 frame만 순환함 |

| From | Event / Condition | To | 비고 |
|---|---|---|---|
| body-cached | spinner tick | body-cached | indicator 행만 교체 |
| body-cached | snapshot 또는 폭 변경 | body-stale | 다음 render에서 본문 재계산 |
| body-stale | render 완료 | body-cached | 현재 indicator suffix를 포함 |

## 6. Data & Runtime Flow

```text
Native event / timer
        ↓
Workbench snapshot / activity frame
        ↓
WorkbenchChatView
        ├─ 본문 cache
        └─ indicator suffix
        ↓
Pi TUI redraw
```

| State / Data | Owner | Writer | Reader |
|---|---|---|---|
| Chat snapshot | ProjectWorkbench | Runtime projection | WorkbenchChatView |
| 본문 행 cache | WorkbenchChatView | render | WorkbenchChatView |
| indicator frame | WorkbenchChatView | activity timer | WorkbenchChatView |

## 7. Identity & Persistence Contract

### Identity

본문 cache는 persisted identity가 아니다. snapshot object identity와 content width에서만 유효한 프로세스 내 최적화다.

### Persistence

Activity Journal과 Chat source는 기존 persistence를 사용한다. 본문 행 cache와 spinner frame은 저장하지 않는다.

### Resume

재시작 뒤에는 cache를 복원하지 않고, Journal에서 새 snapshot을 만들고 처음 렌더한다.

### Idempotency / Concurrency

같은 timer tick이 중복돼도 현재 frame suffix를 다시 만드는 것 외에 Activity Journal이나 Workbench state를 쓰지 않는다.

## 8. Integration Contract

`WorkbenchShell`은 timer에서 redraw를 요청한다. `WorkbenchChatView`는 redraw의 이유가 spinner뿐일 때 본문 cache를 보존한다. `RenderScheduler`의 Native delta coalescing 규칙은 변경하지 않는다.

## 9. Failure & Recovery Contract

| ID | Failure | Detection | User-visible State | Recovery | Preserve |
|---|---|---|---|---|---|
| ERR-001 | cache suffix 위치를 알 수 없음 | cache가 없거나 snapshot·폭 불일치 | 다음 redraw에서 현재 화면 재구성 | 본문 전체 렌더 | Journal과 현재 snapshot |
| ERR-002 | 새 snapshot이 들어옴 | object identity 변경 | 최신 상태 표시 | 본문 cache 폐기 후 재투영 | 새 snapshot 우선 |

## 10. Acceptance Contract

| AC-ID | Acceptance Criterion | Test-ID | Evidence | Status |
|---|---|---|---|---|
| AC-001 | spinner tick이 과거 Activity 전체 projection을 다시 실행하지 않는다 | `workbench-views.test.ts` | spinner cache 회귀 테스트 | PASSED |
| AC-002 | 새 snapshot·폭 변경 뒤에는 최신 본문으로 재렌더한다 | 미정 | 없음 | NOT TESTED |
| AC-003 | 실제 긴 세션에서 입력과 스크롤 지연이 개선된다 | 미정 | 없음 | NOT TESTED |

## 11. Verification Strategy

`bun test test/workbench-views.test.ts`는 77개, `bun test`는 909개 테스트를 통과했다. `bun run check`와 `bun build src/cli.ts --target=bun`도 통과했다. 새 회귀 테스트는 spinner tick 뒤 `renderMessage` 호출 수가 증가하지 않고 indicator만 바뀌는지 확인한다. 실제 terminal에서 입력·스크롤·resize를 관찰하는 수락 검증은 아직 실행하지 않았다.

## 12. Implementation Map

| Responsibility | Module / Component | Code-ID |
|---|---|---|
| Chat 본문·indicator suffix cache | `src/adapters/inbound/tui/chat/workbench-views.ts` | Code-001 |
| redraw timer와 scheduler 연결 | `src/adapters/inbound/tui/shell/workbench-shell.ts` | Code-001 |
| spinner cache 회귀 검사 | `test/workbench-views.test.ts` | Code-001 |

## 13. Current State & Gaps

### Implemented

spinner frame 갱신은 cache된 본문 행의 suffix만 교체하도록 구현한다.

### Partial

개별 observation card의 incremental projection과 viewport 가상화는 구현하지 않는다.

### Gap

| GAP-ID | 관련 Contract | 내용 | Linear |
|---|---|---|---|
| GAP-001 | AC-002~003 | snapshot·폭 변경과 실제 terminal 성능 수락 검증은 아직 없음 | WOO-689 |
| GAP-002 | INV-001 | 고부하 spinner frame의 지속 측정은 아직 없음 | WOO-689 |

## 14. Decisions & Evidence

### Decisions

#### DEC-001 · spinner를 본문 cache 무효화 원인으로 취급하지 않는다

**Decision**

본문 행의 끝 위치를 보존하고, timer는 그 뒤의 indicator 행만 다시 만든다.

**Why**

실측에서 cache hit과 spinner-driven cache miss의 차이가 매우 컸고, 구문 강조를 꺼도 대부분의 지연이 남았다.

**Alternatives**

spinner 주기를 느리게 하거나 구문 강조만 끄는 방법은 전체 본문 재투영을 남기므로 선택하지 않는다.

**Impact**

INV-001, AC-001, Workbench Chat 렌더 경로.

### Evidence

| Date | Evidence | Covers |
|---|---|---|
| 2026-09-08 | `.www/scratchpad/2026-09-08-render-latency/replay-before.json` | 원인 관측 |
| 2026-09-08 | `.www/scratchpad/2026-09-08-render-latency/replay-no-highlight.json` | highlighter 단독 원인 배제 |
| 2026-09-08 | `bun test test/workbench-views.test.ts`, `bun test`, `bun run check`, Bun bundle | cache 회귀·전체 테스트·타입·번들 |

## Change Log

| Date | Change | Reason |
|---|---|---|
| 2026-09-08 | spinner와 본문 cache의 무효화 경계를 상세화 | 긴 실행 세션의 렌더 지연 관측 |
| 2026-09-08 | spinner cache 회귀 테스트와 자동 검증 결과를 기록 | 구현 후 검증 완료 |

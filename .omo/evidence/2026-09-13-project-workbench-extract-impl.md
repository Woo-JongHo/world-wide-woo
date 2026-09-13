# ProjectWorkbench 순수 책임 추출 구현 증거

- 작성일: 2026-09-13
- 기준 브랜치: `astra/terminal-ui`
- 설계 근거: `.omo/evidence/2026-09-13-project-workbench-refactor-design.md`
- 범위: Native event projection, completed-turn T-note scope, 두 focused test, `ProjectWorkbench` caller 배선

## 구현 판정

설계의 첫 두 순수 책임을 각각 하나의 작은 interface 뒤로 이동했다.

1. `src/core/application/orchestration/native-event-projection.ts`
   - `projectNativeEvent`가 raw `NativeHarnessEvent`를 delta 또는 durable projection으로 한 번에 분류한다.
   - delta text/channel/activity kind, durable kind/phase/payload/lifecycle/assistant ownership을 같은 seam에서 판정한다.
   - reasoning completion은 raw content를 버리고 bounded public summary만 남긴다.
   - `projectNativeEvidence`가 Native journal과 approval response evidence에 같은 bounded/redacted projection을 제공한다.
   - `nativeTurnLifecycle`는 live event와 restored activity 양쪽에서 재사용한다.

2. `src/core/application/work/completed-turn-note-scope.ts`
   - `resolveCompletedTurnNoteScope(activities, selector)`가 `turn`, `latest`, `exact-selection`을 단일 interface로 제공한다.
   - owning outbound question, target thread/turn, completed terminal, sequence 증가, 800자 sanitized question을 한곳에서 판정한다.
   - `questionForTurn`은 SessionGoal projection과 동일한 질문 소유권 규칙을 공유한다.

`ProjectWorkbench`는 command/event/todo/tnote/request-projection queue, journal append, publish, Native/Todo/T-note I/O와 모든 공개 interface를 계속 소유한다. `recordNativeEvent`의 append 전후 순서와 `applyDelta`의 in-memory accumulator도 이동하지 않았다. 파일은 기존 dirty 기준 3,171행에서 2,883행으로 줄었다.

## 불변식 증거

- cancel out-of-band: 기존 `delivers cancel immediately...` 회귀 통과.
- approval write-ahead/uncertain no-retry: 기존 approval preparation, uncertain, restore interlock 회귀 통과. serializer만 `projectNativeEvidence`로 교체했다.
- durable-before-publish / delta ephemeral: 기존 `keeps deltas ephemeral...` 회귀 통과.
- sparse owner / exact identity clearing: ownerless completion, sparse refs, repeated item/turn, late delta 회귀 통과.
- reasoning redaction: focused reasoning completion test와 기존 raw reasoning/public summary 회귀 통과.
- slow T-note/Todo nonblocking: 기존 slow generation/sync 회귀 통과. 관련 queue와 I/O는 수정하지 않았다.
- Code-002: `@Unit Code-002`, `@codeId 0002`, `export class ProjectWorkbench`는 `project-workbench.ts`에 그대로 있다. 새 module에는 Code ID annotation이 없다.
- placeholder 검사: 변경 파일에서 `TODO`, `test.skip`/`test.only`, `describe.skip`/`describe.only`, 미구현 throw 패턴 없음.

## 검증 결과

| 명령 | 결과 |
|---|---|
| `bun test test/native-event-projection.test.ts test/completed-turn-note-scope.test.ts` | PASS, 19 tests / 46 assertions |
| `bun test test/project-workbench.test.ts` | PASS, 124 tests / 701 assertions |
| `bun test test/native-plan-wiring.test.ts test/project-workbench-session.test.ts test/native-model-catalog.test.ts test/request-runtime.test.ts test/request-controller.test.ts test/request-runtime-mode.test.ts test/architecture.test.ts` | PASS, 90 tests / 2,085 assertions |
| focused `bunx tsc --ignoreConfig ...` (두 새 module과 focused tests) | PASS |
| `git diff --check` (변경 source/tests) | PASS |
| `bun run check` | 기존 dirty TUI blocker로 FAIL: `src/adapters/inbound/tui/features/chat/work-step-public-projection.ts`가 존재하지 않는 `./work-step-output-renderer`를 import함 |
| `bun test` | 1,198 PASS / 1 FAIL. 유일한 실패는 기존 dirty `src/adapters/inbound/tui/features/chat/chat-durable-transcript.ts`의 unlinked `WOO-679` traceability |
| `bun scripts/code-id.ts` | 기존 dirty baseline 문제로 FAIL: 옮겨진 old TUI path, 대표 annotation 중복, Code-0001~0005 detail 문서 부재. 이번 변경에서 `0002` location mismatch/duplicate/unregistered declaration은 추가되지 않음 |

전체 check/test/Code-ID blocker는 이 작업의 수정 허용 범위 밖인 진행 중 TUI·원장 변경에 있다. 이번 추출을 직접 포함하는 source architecture와 모든 관련 회귀는 통과했다.

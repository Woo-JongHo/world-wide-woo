# Opus 후속 지적 보완

## A1 · append 불변 검증 비용

`AstraExecutionHeading`은 깊은 불변 검증을 통과한 frozen node를 인스턴스별 `WeakSet`에 기억한다. 새 activities 배열이 durable append로 생기면 새 배열과 새 activity graph는 검증하지만 기존 activity의 `payload`·`nativeRefs` 하위 graph는 다시 순회하지 않는다.

검증 결과를 순회 도중 바로 신뢰 cache에 넣지 않는다. 한 validation transaction의 방문 node를 임시 `Set`에 모으고 전체 graph가 성공한 뒤에만 `WeakSet`에 반영한다. 순환 참조가 아직 검증되지 않은 invalid ancestor로 돌아가는 경우에도 부분 신뢰가 남지 않는다.

회귀 테스트 증거:

- 첫 frozen history 검증에서는 retained activity proxy의 구조 scan이 발생한다.
- 동일 node를 보존한 append 배열 검증에서는 기존 activity proxy의 구조 scan이 0회다.
- self-cycle을 통과하며 shared frozen node를 먼저 방문한 뒤 frozen `Date`에서 실패하는 graph는 shared node를 신뢰하지 않는다. 다음 valid graph에서 shared node를 다시 구조 검사한다.

기존 clean append 관측 p95 4.450ms/5 samples와 이번 history-1 smoke p95 1.567ms는 history와 실행 시점이 달라 수치 A/B로 사용하지 않는다. 구조 계수만 직접 전후 계약으로 고정했고, 최종 동일 조건 benchmark는 root 실행이 소유한다.

## A2 · 생산 snapshot 불변성

생산 durable activity의 깊은 동결은 `WorkbenchJournalCoordinator`가 `immutable(structuredClone(value))`로 activity를 만들 때 소유한다. `WorkbenchDurableProjection`은 이 frozen activity 참조들을 새 frozen 배열에 담는다. `ProjectWorkbench.makeSnapshot()`도 최종 snapshot을 `deepFreeze(...)`로 감싸지만, helper는 이미 frozen activities 배열에서는 하위로 내려가지 않는다. 따라서 activity child의 불변성 근거는 journal coordinator이고, 배열 identity의 불변성 근거는 durable projection이다.

실행 검증:

```text
bun test test/project-workbench-recovery.test.ts -t "keeps deltas ephemeral and durably appends completed native observations before publishing"
1 pass / 0 fail / 11 assertions
```

이 생산 회귀는 완료 observation 게시 뒤 `workbench.snapshot`과 `snapshot.activities`가 frozen이고 배열 mutation이 throw함을 확인한다. heading 자체는 plain prototype과 깊은 freeze를 다시 검증하므로 생산 계약을 벗어난 mutable caller도 cache하지 않는다.

## A3 · invalidate 호출

생산 shell의 snapshot 갱신은 `chat.update(snapshot)` 뒤 `tui.requestRender()`를 호출한다. heading의 `invalidate()`를 호출하지 않는다. 120ms Astra motion clock도 `tui.requestRender()`만 호출한다. `renderLayoutFrame` 자체가 heading을 invalidate하지 않는지 실제 `AstraWorkspace`에 invalidation-count heading을 주입해 세 frame을 렌더했고 count 0을 확인했다.

명시적인 heading `invalidate()`는 안전하게 파생 cache를 비운다. 기존 테스트에서 invalidate 후 activity indexed read가 다시 발생함을 확인한다.

## A4 · benchmark cleanup 예외 보존

`MemoryTerminal`은 `start()` 관측 여부를 기록한다. shell이 terminal start 전에 실패하면 cleanup input을 호출하지 않아 원인 예외를 그대로 보존한다. replay와 cleanup이 모두 실패하면 `AggregateError([replayError, cleanupError], ..., { cause: replayError })`로 두 오류를 모두 보존한다. replay만 실패하거나 cleanup만 실패하면 해당 원래 오류를 던진다.

## working streaming + input gate

기존 `memoryTerminalInput`은 ready 상태 input→첫 synchronized frame 측정을 그대로 유지한다. 별도 `streamingMemoryTerminalInput`은 다음을 한 `terminal.frame()` action 안에서 수행한다.

1. immutable durable history를 공유하는 약 37KB `phase: "working"` draft snapshot을 실제 subscription callback으로 publish
2. 한 글자 input 전달
3. input 우선순위로 도착하는 첫 synchronized terminal frame까지 대기

생산 `RenderScheduler`는 stream snapshot의 `chat.update(snapshot)`을 최대 32ms 뒤에 수행하고 input을 우선 처리한다. 따라서 이 metric은 최신 draft가 포함된 frame latency가 아니라 **stream update가 대기 중일 수 있는 상태에서 input이 먼저 표시되는 시간**이다. 각 draft의 visible tail에는 고유 marker를 두고, 반복 후 최종 marker가 bounded wait 안에 terminal output으로 실제 paint되는지를 별도 비계측 assertion으로 확인한다.

모든 fixture 생성과 freeze는 frame timer 밖이다. 반복 뒤 Enter를 전달해 ready 입력과 streaming 입력 전체가 누락·중복 없이 dispatch됐는지 확인한다. 의도적인 working animation 중에는 idle-write 0을 요구하지 않는다. 새 gate는 기존 input과 같은 p95 50ms, p99 100ms이며 기존 threshold는 변경하지 않았다.

history 1 / 5 samples smoke:

```text
ASTRA_BENCH_COUNTS=1 ASTRA_BENCH_REPS=5 ASTRA_BENCH_BUDGET_MS=60000 bun scripts/astra-render-benchmark.ts
GREEN
ready input p95/p99: 13.209 / 13.209ms
stream pending 중 input-first-frame p95/p99: 21.827 / 21.827ms
long draft p95: 10.640ms
final unique draft marker: bounded paint assertion 통과
```

이 smoke는 wiring·문자열 무손실·cleanup만 확인한다. 최종 1,000-history/50-sample 수락 실행을 대신하지 않는다.

## 최종 targeted 검증

```text
bun test test/astra-execution-heading-performance.test.ts test/astra-ui.test.ts
76 pass / 0 fail / 1687 assertions

bun run check
tsc --noEmit / exit 0

rg TODO / test.skip / test.only
no matches in owned production, benchmark, and heading test files
```

범위 밖 gate는 넓히지 않았다. cold, unseen width, durable append, journal bump는 기존대로 diagnostic이며 threshold도 완화하지 않았다. snapshot projection, provider, PTY, 실제 terminal pixel/backpressure는 benchmark 범위 밖이다.

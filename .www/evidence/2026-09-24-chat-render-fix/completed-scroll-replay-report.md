# 실제 완료 transcript 스크롤 replay

## 목적과 범위

사용자 증상은 응답 완료 뒤 chat 표시와 스크롤이 느린 현상이다. 지정된 실제 journal을 한 번 읽은 뒤 6,236 activities / 252 chat messages의 immutable completed snapshot으로 고정했다. 재현용 정본은 첫 6,236 records이며 digest는 `sha256:a2f9c59e4e2f703dba2694bba8e2edcc14790fac9de89ab8cbb9268c410926b8`이다. raw journal 사본은 만들지 않았다.

생산 `AstraWorkspace`, `AstraExecutionHeading`, `ChatScrollView`와 `renderLayoutFrame`을 사용했다. 스크롤은 shell routing과 같은 공개 `scrollBy`, `scrollToStart`, `scrollToEnd` 메서드로 수행했다. 원문, activity ID, message 본문은 stdout과 결과 파일에 출력하지 않았다.

완료 transcript 끝의 cold/warm frame, 첫 이전 viewport, 같은 viewport 반복, 한 줄 위/아래, Home/End, 150×44 wide sidebar와 80×24 compact layout을 측정했다. 각 frame은 navigation부터 layout 완료까지 wall과 process CPU, transcript 공개 cache delta를 기록했다.

제안 diagnostic 신호는 두 가지로 분리한다.

- `maxStageP95`: first-earlier 단일 표본과 up/down/Home/End 각 stage p95 중 최댓값
- `combinedScrollP95`: first-earlier + up/down + Home/End navigation frame 61개를 합친 p95

32ms 초과 RED는 기존 제품 acceptance gate가 아닌 이번 진단 신호다.

## 두 실행 결과

첫 실행은 공유 머신에서 증상과 같은 wide RED를 재현했다. 같은 6,236-record prefix를 명시적으로 고정한 두 번째 실행은 GREEN이었다.

| 실행 | viewport | max-stage p95 | combined p95 | 판정 |
|---|---|---:|---:|---|
| 최초, digest 미기록 | 150×44 | 115.66ms | 당시 미산출 | RED |
| 최초, digest 미기록 | 80×24 | 25.53ms | 당시 미산출 | GREEN |
| pinned prefix 재실행 | 150×44 | 10.95ms | 10.00ms | GREEN |
| pinned prefix 재실행 | 80×24 | 3.61ms | 1.64ms | GREEN |

최초 실행의 150×44 주요 값은 warm End p95 103.61ms, 첫 이전 viewport 115.66ms wall / 32.47ms CPU, 한 줄 위 p95 35.42ms, 아래 p95 53.70ms, Home p95 67.80ms였다. 같은 이전 viewport 반복도 p95 34.17ms였다.

Pinned 재실행의 150×44 값은 warm End p95 4.63ms, 첫 이전 viewport 10.00ms, 한 줄 위 p95 10.62ms, 아래 p95 8.49ms, Home p95 10.95ms, End p95 6.46ms였다. 80×24에서는 모든 stage p95가 3.61ms 이하였다.

Cold End도 최초 wide 3,213.70ms / compact 2,544.10ms에서 pinned wide 483.01ms / compact 433.20ms로 크게 달랐다. snapshot 내용만으로 고정되는 상수 비용이 아니다.

## cache와 경계 관측

두 실행 모두 wide 첫 이전 viewport는 48 rows를 요청하고 새 block 8개를 materialize했다. 최초 materialization은 14.19ms, pinned는 1.52ms였다. 최초 한 줄 아래 20회는 block render 0, materialization 합계 3.01ms인데 wall p95 53.70ms였다. 높은 tail을 transcript block render 하나로 설명할 수 없다.

모든 warm/scroll stage에서 exact-count rebuild와 durable graph rebuild는 0이었다. 기록 전체의 count graph를 매 scroll마다 다시 만든 흔적은 없다.

같은 pinned prefix의 별도 completed warm boundary 계측은 다음과 같다.

| 150×44 warm boundary | p50 / p95 |
|---|---:|
| full frame | 3.87 / 5.97ms |
| heading | 0.22 / 0.43ms |
| transcript setup | 0.21 / 0.49ms |
| transcript visible rows | 0.05 / 0.09ms |
| 기타 layout + sidebar | 3.40 / 5.10ms |
| sidebar off full frame | 1.40 / 1.48ms |

이 더 빠른 재측정 표본에서 heading과 cached transcript rows는 warm 병목이 아니었다. sidebar가 있는 wide layout의 잔여 비용이 compact보다 크지만 32ms 신호에는 미달했다.

## 판정

실제 완료 transcript seam은 높은 공유 부하에서 wide RED를 재현했지만, 동일 크기의 pinned journal prefix 재실행에서는 wide와 compact 모두 GREEN이었다. 따라서 현재 증거는 고정된 transcript 내용만으로 항상 발생하는 deterministic scroll 회귀보다 공유 시스템 경쟁 가설을 지지한다. 두 실행의 시스템 부하와 소스 전후를 통제하지 않아 인과·기여율은 확정하지 않는다.

첫 미방문 영역은 cache hit viewport보다 block materialization 비용이 추가된다. wide sidebar/layout도 compact보다 지속 비용이 크다. 두 요소는 부하가 높을 때 사용자 체감을 더 악화시킬 수 있지만, 현재 pinned 실행만으로 제품 수정 대상을 하나로 확정하지 않는다.

실제 CMux pixel latency, terminal/PTY, snapshot producer, provider는 포함하지 않았다. 다른 앱이나 진행 중인 작업을 중단하지 않았다.

## 산출물과 재현

- 실행기: `completed-scroll-replay.ts`
- 최초 숫자 결과: `completed-scroll-replay.json`
- 고정 prefix 결과: `completed-scroll-replay-pinned-6236.json`
- 고정 prefix warm 경계: `completed-warm-boundaries-pinned-6236.json`

```text
bun .www/scratchpad/2026-09-24-render-fix/completed-scroll-replay.ts \
  .www/runtime/activity/native-b5139c9362091450db7344de59dbd4afd12098a2069411ba.jsonl \
  .www/scratchpad/2026-09-24-render-fix/completed-scroll-replay-pinned-6236.json \
  --records=6236
```

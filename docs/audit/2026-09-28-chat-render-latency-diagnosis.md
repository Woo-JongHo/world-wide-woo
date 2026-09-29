# WWW Chat 렌더 지연 진단

날짜: 2026-09-28

범위: 원인 진단. 제품 코드 수정은 하지 않았다.

## 결론

현재 Chat 경로에는 두 가지 확인된 비용이 있다.

1. 스트리밍 초안이 갱신될 때 Markdown 전체를 다시 파싱하고 터미널 폭으로 다시 감싼다. 바뀐 초안 블록은 행 수 계산과 실제 화면 재료화에서 각각 렌더되어, 갱신 한 번에 두 차례 처리된다.
2. 초안 갱신도 durable transcript 변경으로 판정된다. 이력이 길면 매 갱신마다 durable 블록 그래프와 폭별 행 수 인덱스를 다시 구성한다. 첫 표시와 아직 계산하지 않은 폭에서는 전체 이력의 정확한 행 수 계산이 특히 비싸다.

따라서 보고된 Chat 버벅임을 설명할 수 있는 앱 내부 병목은 재현됐다. 다만 이 수치만으로 실제 세션의 모든 지연이나 Codex와의 성능 차이를 확정하지는 않는다. 측정은 `WwwWorkspace`와 production shell의 렌더 경로를 메모리 터미널로 실행했으며 PTY, 터미널 픽셀 표시, 실제 Codex와의 동일 입력 비교는 포함하지 않았다.

## 측정 방법

- 기존 `scripts/www-render-benchmark.ts`를 실행했다. 이 벤치마크는 `WwwWorkspace`와 `WwwExecutionHeading`을 80×24 프레임으로 렌더하고, 1개 및 1,000개 이력 조건에서 cold/warm 표시와 초안 갱신을 따로 잰다.
- 첫 수집은 실제 `www` 세션에서 Bun 테스트가 실행되는 동안 이뤄졌다. 이후 그 작업이 끝난 뒤 1개 이력 조건을 20회, 1,000개 이력 조건을 5회 다시 측정했다. 호스트의 GUI 부하는 완전히 통제하지 못했으므로 두 구간을 깨끗한 idle 대조군으로 보지는 않는다.
- 추가 임시 계측은 이력 1개와 1,000개에서 각각 긴 초안 갱신 8회를 수행하고, 공개 cache metrics의 행 렌더·행 수 재사용·그래프 구성 카운터를 기록했다.
- 벤치마크 기준은 긴 초안 렌더 p95 32ms다. 실제 Codex 성능 기준이나 Codex와의 직접 비교값은 아니다.

## 관측 결과

| 조건 | 결과 | 해석 |
|---|---:|---|
| 이력 1개, warm 정적 프레임 | p95 0.49ms | 캐시가 준비된 정적 화면 자체는 빠르다. |
| 이력 1개, 1.87KB 초안 갱신 | p95 7.50ms | 짧은 초안은 기존 32ms 기준 안에 든다. |
| 이력 1개, 약 37KB 초안 갱신 | p50 48.53ms, p95 57.47ms; 20회 모두 32ms 초과 | 긴 스트리밍 초안만으로도 프레임 기준을 넘는다. |
| 이력 1,000개, 첫 프레임 | 1,024ms; 그중 exact row-count build 916.83ms, 화면 행 재료화 1.62ms | 첫 표시에서는 화면에 요청된 26행보다 전체 이력의 정확한 행 수 계산이 지배적이다. |
| 이력 1,000개, 미계산 폭 첫 표시 | 628.46ms; exact row-count build 607.07ms | 새 터미널 폭에서도 전체 이력 행 수 계산이 반복된다. |
| 이력 1,000개, 약 37KB 초안 갱신 | p50 67.32ms, p95 74.95ms | 긴 이력 조건도 기준을 초과한다. |
| 초안 갱신 계측, 이력 1,000개 | 갱신마다 `renderedBlocks=2`, `durableCountRenderedBlocks=1`, 이전 행 수 1,000개 재사용; 평균 그래프 구성 6.69ms, exact count repair 23.48ms, 요청 행 재료화 24.81ms | 초안 한 블록은 행 수 계산과 viewport 재료화에서 다시 렌더되고, 이전 블록의 행 수도 인덱스에 재배치된다. 시간은 부하 변동이 큰 호스트에서 얻은 참고치다. |

긴 초안 CPU profile은 벤치마크 전체 실행 중 수집됐다. Markdown 표 파서의 정규식이 self time 13.9%, `next`가 12.2%, `segment`가 8.2%였고, ANSI 분리 및 grapheme/동아시아 폭 계산도 상위에 나타났다. 이 profile은 초안 갱신 하나만 분리한 자료가 아니므로 파서·줄바꿈 경로를 지지하는 보조 근거로만 사용한다.

## 코드 경로

- [`www-execution.ts`](../../src/adapters/inbound/tui/features/chat/view/www-execution.ts)는 durable revision에 `draft`를 포함하고, `durableRevisionChanged`에서 `left.draft !== right.draft`이면 durable 블록 갱신을 요청한다.
- 같은 파일의 `appendDraftBlock`은 draft 블록의 재사용을 금지하고, 매 렌더마다 최신 초안을 sanitize한 뒤 `md("draft", ...)`에 전달한다. `md`는 텍스트가 바뀌면 Markdown `setText`를 호출해 렌더하고, 자체 행 캐시를 무효화한다.
- [`www-transcript-cache.ts`](../../src/adapters/inbound/tui/features/chat/view/www-transcript-cache.ts)의 `repairDurableWidths`는 기존 블록 행 수를 재사용하더라도 새 인덱스를 위해 전체 후보 블록 목록을 순회한다. 새 draft 블록은 `durableCount`를 통해 한 번 렌더된다. 이후 viewport용 `renderBlock`은 같은 블록을 다시 렌더해 실제 행을 만든다.
- 따라서 Markdown 파싱·폭 계산의 반복과 긴 이력에서의 행 수 인덱스 재구성은 계측 카운터 및 구현 경로와 일치한다.

## 다른 원인 후보와 한계

- **동시 작업 부하:** 실제 세션에서 테스트가 끝난 뒤에도 이력 1개/37KB 초안은 p95 57.47ms로 기준을 넘었다. 그러므로 당시 테스트 부하는 유일한 원인이 아니다. 다만 GUI 프로세스 부하를 통제하지 못해 부하가 더한 지연의 크기는 아직 모른다.
- **터미널 출력 지연:** 세션 대시보드에서 128개 trace 기준 `terminal-write wait` p95 342ms가 표시됐다. [`layer-performance.ts`](../../src/core/domain/observability/layer-performance.ts)는 이 값을 queued→started 시간으로 정의한다. [`workbench-shell.ts`](../../src/adapters/inbound/tui/shell/workbench-shell.ts)는 `chat.update` 뒤에 이를 queue하고 TUI render를 요청하므로, 이 값은 스케줄링과 레이아웃 대기를 포함하며 `Terminal.write` 실행 시간, OS flush, 픽셀 표시 시간을 직접 뜻하지 않는다. 이 집계는 특정 느린 Chat 프레임과 연결되지 않아 터미널이 원인이라고 판정할 수 없다.
- **Codex와의 동등성:** 벤치마크 자체가 `Not Native parity`라고 범위를 명시하고 있다. 같은 터미널 폭, 이력 크기, 초안, 호스트 부하에서 실제 Codex와 직접 재지 않았으므로 목표 달성 여부는 미확인이다.

## 작업 산출물과 다음 진단

- 벤치마크 결과, CPU profile, 초안 갱신 계측은 gitignored `.www/scratchpad/2026-09-28-chat-render-diagnosis/`에 보관했다.
- 다음 비교에서는 실제 느린 프레임 하나에 대해 render-schedule, layout-materialize, terminal-write의 동일 frame ID 경계를 수집하고, 그 입력을 Codex와 같은 폭·이력·초안 크기로 재생해 앱 내부 계산과 터미널 대기를 분리해야 한다.
- 이번 진단에서는 제품 코드 변경이나 테스트 스위트 실행을 하지 않았다. 기존 성능 벤치마크는 기준 초과를 반환해 RED였다.

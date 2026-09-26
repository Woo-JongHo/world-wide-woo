# WWW 성능·경량화 진행 기록

이 문서는 현재 WWW 렌더 경로의 재현 안내와, 제품명이 Astra였던 시점의 측정 기록을 함께 보존한다.
아래 역사 구간의 `Astra*` 식별자와 `astra-performance-plan` 증거 경로는 당시 코드·artifact의
정확한 이름이며 현행 구현 이름이 아니다. 현행 명령과 코드 참조는 `Www*` 및 `www-*`를 사용한다.

2026-09-14 · exact row-count + lazy range, volatile count→paint handoff에 이어
durable immutable block의 방문 폭 count를 write-through로 재사용하도록 구현했다.
최종 source SHA-256은
`3c75eb13d771ba5f7fb35d2e44f98a110f1db3b880d54cfd501a523142d51ca8`다.
Luna 독립 전체 검증은 **1,271 pass / 0 fail / 16,669 expects / 141 files /
30.97s / exit 0**이다. 한 차례 1,270-pass 후보가 놓친 unanchored T-note 중복은
public literal 회귀가 RED(2회)→GREEN(1회)이 된 뒤 폐기 후보와 함께 보존했다.

색상을 켠 동일 synthetic public seam에서 frozen old/new 9쌍을 교대로 실행했다.
full rows는 byte-equivalent였고 durable event 100ms gate는 9/9 통과했다.

| 구간 | old append | candidate append | old journal-only | candidate journal-only |
|---|---:|---:|---:|---:|
| 1,000 records · p95 범위 | 138.43–167.46ms | **4.56–4.96ms** | 137.44–153.39ms | **0.51–1.16ms** |
| 5,000 records · p95 범위 | 679.76–804.33ms | **16.91–19.84ms** | 804.76–1,007.67ms | **1.69–2.65ms** |
| 2,000×4KiB · max-of-5 범위 | 4,241.72–5,463.09ms | **24.25–27.52ms** | 4,005.79–8,917.93ms | **0.67–1.94ms** |

원본 summary SHA-256은
`3560f854b213c0500aa7342a7d9f162ccb44b3d99c3c0437e3fe8c39e83b1899`다.
측정 중 공유 머신에서 짧은 다른 Bun 실행이 있었을 가능성을 숨기지 않으며,
사용자의 검증 축소 요청에 따라 재측정하지 않았다. 이 결과는 durable append와
journal-only 경로의 개선을 증명하지만 Native 동급, 초기/cold 렌더, 37KB streaming
draft, 실제 provider·IME·terminal pixel/backpressure, 전체 앱 RSS/설치 크기 감소를
증명하지 않는다. 따라서 **durable event slice는 GREEN, 전체 Native parity는
미검증**으로 구분한다.

이전 GLM은 handoff 코드 안전성과 durable 설계에 조건부 READY를 냈다. 최종 actual
code 전용 추가 리뷰는 토큰 사용을 줄이라는 사용자 요청에 따라 완료 전에 중단했으므로
CODE READY로 승격하지 않는다. 주 세션은 사용자가 Sol 전환을 확인했다.

## Volatile count→paint handoff 후속

37KB streaming draft의 exact count와 viewport paint가 같은 volatile block을 두 번
Markdown render하던 경로를 기존 8MiB row LRU로 넘겨 한 번만 render하게 했다.
새 cache, cap 증가, durable 전체 rows 보존, 공개 flag, 추정 height는 추가하지
않았다. 실제 `WwwWorkspace + renderLayoutFrame`에서 수정 전 `renderedBlocks`
delta **2** RED를 확인했고, 수정 뒤 delta **1**과 dense compatibility 전체 출력의
byte 동등성을 확인했다. 100번 draft revision, ANSI/Unicode/combining mark/partial
Markdown, follow=false 과거 읽기, 8MiB 초과 block의 non-retain delta 2 fallback,
5,000 marker 전체 순회도 유지한다.

중복 콘텐츠에서 reader anchor는 “정확한 원래 행”을 식별하지 않는다. 현재 계약은
정규화된 최대 80자의 **첫 일치**를 우선하고 찾지 못하면 과거 높이 비율로
fallback하는 휴리스틱이다. 실제 dense compatibility와 lazy frame이 반복 본문에서
같은 frame/scrollTop/follow=false를 만드는 회귀를 추가했지만, 중복 행의 고유
identity를 보장한다는 뜻은 아니다. 또한 upstream lazy `measureWidth`는 부여된 폭을
반환해 내용 최대폭을 재는 dense auto-size 부모와 잠재적으로 다르다. WWW의 현재
scroll은 basis/grow로 폭이 정해져 있어 관측된 영향은 없으며, 별도 width API 변경은
이번 범위에 넣지 않았다.

동일 benchmark manifest `6864f31187a144da22487a77a8accad85b01c36d4cccdfffff463d046c5a59e3`
에서 1,000개 3 process×50, 5,000개 3 process×20을 순차 실행했다. warm 지표는
**durable history와 배열 참조가 불변인 frame**만 뜻한다. durable append와
`journalSequence`만 증가한 첫 frame은 각 process에서 별도 5 samples 진단으로
측정했고 아직 수락 threshold를 부여하지 않았다. 이 구간의 기존 percentile 식은
`ceil(5×0.95)-1=4`이므로 표의 꼬리값은 통계적 p95가 아니라 **max-of-5**로 부른다.

| 지표 | 1,000개 · 3 process | 5,000개 · 3 process |
|---|---:|---:|
| cold body | 385.51–478.46ms | 3,162.29–4,100.15ms |
| unseen width body | 398.95–442.00ms | 2,053.83–2,555.46ms |
| durable 불변 warm body p95 | 2.55–4.00ms | 5.35–7.65ms |
| 약 1.9KB draft p95 | 4.99–8.75ms | 10.18–14.78ms |
| 약 37KB draft p95 | **67.27–83.55ms** | **79.23–222.90ms** |
| 방문한 두 폭 반복 resize p95 | 4.55–7.77ms | 8.96–20.99ms |
| MemoryTerminal 입력→frame p95 | 4.47–7.03ms | 15.07–37.31ms |
| durable append→첫 frame max-of-5 · 진단 | 338.37–470.77ms | 3,028.35–4,043.83ms |
| journal bump-only→첫 frame max-of-5 · 진단 | 354.62–532.71ms | 3,060.80–3,739.22ms |
| retained row / width metadata | 10,840 / 32,288 B | 10,456 / 160,288 B |
| process RSS | 102,547,456–111,853,568 B | 108,150,784–130,646,016 B |

6개 process 모두 37KB draft 32ms 기준 때문에 exit 1 / **RED**였다. raw sample과
고지연 값을 제거하지 않았다. 측정 중 한 시점의 읽기 전용 process inventory에는
benchmark 외 여러 고CPU 프로세스가 동시에 관측됐지만, 이것이 지연의 원인이라는
인과는 확인하지 못했다. 따라서 이 결과는 “원인 미확인 고지연 run”으로 보존하며,
앞선 38–45ms 범위와 직접 배수 비교하지 않는다. 후보 1의 결정론적 효과는 같은
operation set에서 1,000개 `renderedBlocks` 2,162→2,086, 5,000개
10,101→10,055로 줄어든 점이다. 이는 각각 76/46회 volatile 중복 render 제거와
일치하지만 전체 시간 gate를 통과했다는 뜻은 아니다.

실제 production snapshot 흐름도 읽기·기존 테스트로 대조했다. active turn의 첫
공개 assistant delta는 `turn/first-output-observed` durable activity를 한 번 기록할
수 있어 journal이 한 번 증가한다. 이후 같은 item의 assistant delta들은
`activities`/`chat` 참조와 `journalSequence`를 유지한 채 draft와 snapshot revision만
갱신한다. 따라서 durable 불변 draft 벤치는 steady streaming을 대표하지만 첫 공개
delta나 tool/activity 기록 직후 frame은 대표하지 않는다. durable append 및 관측
activity 뒤 exact-count 전체 재구축은 측정된 잔여 병목이며, generation 재사용 또는
불필요 journal invalidation 제거는 별도 설계·검증 없이는 구현하지 않는다.

GLM이 지적한 기존 5k `1,036.112292ms` 값은 단일 표본 라벨이 아니다. 해당 JSON의
long-draft raw는 20개이고 구현식은 `ceil(n*0.95)-1`, 즉 정렬 index 18을 선택한다.
따라서 p95는 1,036.112292ms, max/p99는 1,147.290625ms다. 고지연 원인은 확정하지
않지만 통계 라벨은 raw와 코드에 따라 p95로 유지한다.

이 후속의 관련 10-file 검증은 112 pass / 0 fail, production journal/routeWheel
표적 검증은 3 pass였다. `TuiAltScreen` 공개 mouse input으로 끝에 도달한 contained
pane의 잔여 wheel delta가 primary pane으로 전달되지 않음도 확인했다. 최종
`bun run check`는 exit 0, 전체 suite는 **1,260 pass / 0 fail**, 141 files,
16,611 assertions, 43.96초다. 최신 artifact hash는 로컬
`volatile-row-handoff.md` 및 후속 delta packet이 소유한다. current handoff source를
import한 새 isolated actual-PTY smoke도 exit 0 / PASS였다. 실행 시점 bundle
`sourceRevision`은
`aea5aa09b8d92dcde9f3039af70f24fc84fc9e6bbaa6ad737bb5017cc9d6ec8c`이며 결과·stdout
·stderr·exit·종료 후 PID 부재는
[`current-handoff-pty-report.md`](../.www/scratchpad/astra-performance-plan/current-handoff-pty-report.md)에
보존했다. 이는 완성된 한글·emoji 문자열의 PTY 전송, synthetic offline submit,
production shell shutdown만 검증한다. 실제 provider/IME/pixel timing/backpressure,
Native 동급, persistence, 사용자 WWW session 반영은 검증하지 않았다.

## 이전 단계 기록 — Lazy row 연결 결과

이 절부터는 현재 판정의 blocker 목록이 아니라, 위 handoff 이전 단계에서 당시
관측한 수치와 판단을 시간순으로 보존한 역사 기록이다.

`AstraTranscriptView`의 기존 whole-transcript 두 폭 rows cache를 stable
message/tool/T-note/volatile block index로 **교체**했다. 폭마다 각 block의 정확한
행 수와 단순 prefix sum을 만들고, layout은 viewport 앞뒤 2행에 겹치는 block만
row 문자열로 요청한다. `render(width)`는 같은 source를 전체 범위로 읽는 dense
호환 경로다. 추정 height, 기록 축소, 색상 제거, 검색/복사 범위 축소는 넣지 않았다.

`AstraInset`은 lazy source를 range 단위로 padding/fit하고, `ChatScrollView`는
pi-tui의 `prepareLayout(contentWidth)`에서 이전 logical rows 4개를 읽어 폭 변경
anchor를 잡는다. 실제 `AstraWorkspace + renderLayoutFrame`에서 dense 독립 oracle,
120→80→40→120 reader anchor, follow-tail/disable-follow, exact content height와
scrollbar geometry를 검증했다. 5,000 message source를 256행 chunk로 처음부터
끝까지 읽어 marker 5,000개가 각각 정확히 한 번 존재함도 확인했다.

Resource 경계는 다음처럼 분리한다.

- rendered block rows: transcript 인스턴스 전체 LRU 합산 UTF-16 논리 **8MiB**.
- count/prefix metadata: durable/volatile generation마다 최근 폭 4개, generation당
  UTF-16과 무관한 논리 **2MiB**; 현재 두 generation 합산 최대 4MiB. 숫자 한
  원소를 8 bytes, width entry overhead를 64 bytes로 계수한다.
- Markdown renderer의 자체 last-width rows는 block render 직후 invalidate하여
  숨은 전 기록 cache가 되지 않게 했다. 원문은 snapshot이 소유하며 복제하지 않는다.
- 현재 5,000 fixture의 두 방문 폭 후 retained transcript rows는 10,456 bytes,
  count metadata는 160,288 bytes였다. 이는 heap/RSS 상한이 아니다.

별도 프로세스 결과는 실패와 outlier를 제거하지 않은 범위다.

| 지표 | 1,000개 · 3 process×50 | 5,000개 · 3 process×20 |
|---|---:|---:|
| cold body | 137.55–340.49ms | 716.77–746.67ms |
| cold exact count-build | 134.03–246.17ms | 707.57–736.79ms |
| unseen width body | 115.54–137.40ms | 521.51–553.40ms |
| unseen exact count-build | 111.80–132.17ms | 515.23–549.02ms |
| warm body p95 | 1.01–1.84ms | 1.57–1.62ms |
| 약 1.9KB draft p95 | 2.58–19.53ms | 3.45–4.43ms |
| 약 37KB draft p95 | **36.25–63.07ms** | **38.02–45.34ms** |
| 방문한 두 폭 반복 resize p95 | 1.33–2.50ms | 2.67–2.86ms |
| MemoryTerminal 입력→frame p95 | 2.20–6.07ms | 3.03–4.50ms |
| ready idle writes | 0 | 0 |
| RSS | 115,720,192–133,595,136 B | 201,621,504–210,567,168 B |

5,000 반복 resize의 opt-in 100ms 진단 gate는 세 실행 모두 통과했다. 그러나
스크립트 전체 verdict는 37KB draft의 기존 32ms 기준 미달 때문에 1,000/5,000
모든 실행에서 **RED**다. 1,000 첫 실행의 cold 340.49ms, draft 19.53ms,
long-draft 63.07ms도 outlier로 삭제하지 않았다.

마지막 empty→append 세대 보정 뒤 동일 source revision을 확인한 추가 gate도
1,000 exit 1/RED, 5,000 exit 1/RED였다. 1,000은 repeated resize p95 2.19ms,
long-draft 40.66ms였다. 5,000은 repeated resize p95 4.27ms로 100ms 기준을
유지했지만, 공유 머신 부하가 큰 cold 2,998.86ms, unseen 835.14ms,
long-draft 1,036.11ms 표본이 있었다. 이 표본도 제외하지 않으며 앞선 안정된
세 프로세스 범위를 대체하지 않는다.

마지막 source revision의 5,000 exact-count 전용 CPU profile에서는 source 생성
729.26ms 중 계측된 count build가 717.32ms, 마지막 28행 materialization이
1.65ms였다. 앞선 profile은 513.57/505.77/0.45ms였고 둘 다 보존한다. call tree에서
`renderBlock` 84.5%, message Markdown render 45.5%, Markdown parse/wrap과
grapheme/ANSI width 계산이 주요 하위 비용이었다. 즉 visited-width frame의 full
row materialization은 제거했지만 cold/unseen exact count는 여전히 모든 block을
한 번 render한다. 이 잔여 비용은 추정 height/refinement의 별도 설계 결정점이며,
이번 변경에서 추정치를 exact로 가장하지 않는다.

당시 검증은 `bun run check` exit 0, 전체 **1,254 pass / 0 fail**, 141 files,
16,575 assertions, 41.92초다. 관련 9-file 묶음은 94 pass / 0 fail이었고 새 실제
Astra seam은 empty→append 회귀를 포함해 5 tests 모두 통과했다. 실제 PTY synthetic shell의 한글·emoji
입력→전송→안전 종료도 PASS다. provider, 실제 IME, terminal pixel/backpressure,
Native 동급, 사용자 실행 세션 반영은 검증하지 않았다. commit/push/deploy/restart는
하지 않았다. 이 lazy-row 당시 revision의 GLM packet은 로컬 준비만 하며 창 연결 실패로
미제출·미수락이었다. 기존 `glm-final-packet.md`는 연결 전 revision이므로 당시
수락 근거가 아니다.

원시 결과: `.www/scratchpad/astra-performance-plan/lazy-integration-1k-run{1,2,3}.json`,
`lazy-integration-5k-run{1,2,3}.json`, `lazy-exact-count-5k.cpuprofile.md`,
`lazy-integration-final-{1k,5k}.json`, `lazy-exact-count-5k-final.cpuprofile.md`,
`full-test-lazy-integration-final.log`, `pty-smoke-lazy-integration-final.json`,
`astra-lazy-row-integration.md`.

## 이전 후속 결과 (2026-09-14, lazy row 연결 전)

아래 1,244-pass와 985–1,117ms repeated-resize 결과는 lazy row 연결 전 기준이다.

## 당시 최신 후속 결과 (2026-09-14)

이번 후속은 기존 Interface를 유지하며 두 가지를 추가했다.

- **반복 resize:** `AstraTranscriptView`가 같은 durable 기록의 최근 두 폭을 LRU로 보존한다. 두 entry **합산 UTF-16 논리 8MiB** 상한이며, 초과하면 정상 재계산한다. thread/project/content/expanded 변경 및 invalidate/dispose 시 폐기한다. immutable snapshot의 동일 collection은 참조 비교하고, 사본은 실제 표시 관련 값을 비교한다. 같은 길이 콘텐츠 변경도 별도 검증했다.
- **초기 로딩:** 구문 색상 native adapter를 첫 `supports`/예산 이내 `highlight`까지 동기 지연 로드한다. 설치 의존성이나 기능은 삭제하지 않았다. unknown/oversize/오류 plain fallback과 색상은 유지한다.

모듈 시작 부담은 같은 시점의 eager/lazy control을 번갈아 **별도 프로세스 15회** 측정했다. syntax import median **14.847 → 0.663ms**, RSS median **34.438 → 14.078MiB**, 첫 highlight **32.629 → 32.789ms**였다. 이는 해당 모듈 경로이며 전체 앱 시작/RSS 감소량이 아니다. 초기 병렬 부하 상태에서 측정한 163/202ms는 개선량 산정에서 제외했다.

당시 실제 Astra 경로 실측(별도 프로세스 3회, 일반 구간 50 samples / 긴 draft·반복 resize 20 samples):

| 지표 | 1,000개 기록 p95 | 5,000개 stress p95 (5 samples) |
|---|---:|---:|
| warm body | 1.19–2.23ms | 6.32ms |
| 약 1.9KB draft | 3.10–5.09ms | 13.37ms |
| 약 37KB draft | 20.42–23.89ms | 29.22ms |
| MemoryTerminal 입력→frame write | 3.37–9.62ms | 12.58ms |
| 이미 방문한 폭의 반복 resize | 44.23 / **223.54** / 61.43ms | **985.02ms** |

첫 body는 1,000개 170–198ms / 5,000개 905ms, 처음 보는 폭은 각각 154–164ms / 727ms다. 이 값은 p95가 아니라 각 프로세스의 첫 측정이다. 입력 p99는 1,000개 4.21–25.86ms이며 작은 표본의 통계이지 SLA가 아니다. ready idle 출력은 0이다.

반복 resize의 내부 진단 예산 100ms 기준 **1,000개 2 GREEN / 1 RED**, **5,000개 RED**다. 실패 표본을 제외하거나 목표를 느슨하게 바꾸지 않았다. 이전 긴 draft 39–46ms 대비 현재 수치의 차이는 긴 문단 알고리즘을 직접 바꾼 효과로 단정하지 않는다. 실행 환경 부하가 달랐으므로 이전·현재의 배수 및 Native 대비 우위를 주장하지 않는다.

5,000개는 두 폭 합산이 cache 상한을 넘을 수 있어 반복 재배치가 남는다. 첫 표시·새 폭·대형 기록은 row-count index/visible-range 설계가 다음 과제다. 전체 경량화 완료가 아니다.

추가 재현(같은 코드, 별도 5-sample process)에서도 5,000개 반복 resize p95 **1,117.29ms**로 exit 1/RED였다. 첫 body 958.29ms, 새 폭 782.01ms, warm body p95 8.42ms, 입력 p95 13.88ms, 긴 draft p95 27.22ms, RSS 236,339,200 bytes였다. 일반 resize에는 4,025.44ms 표본도 있으며 제거하지 않았다. 앞선 985.02ms 결과와 함께 큰 기록 resize 병목의 재현 근거로 사용한다. `large-history-baseline-repeat.json` 참조.

후속 설계 전 실제 `AstraWorkspace` 공개 frame/scroll 경로도 확인했다. 40-message 진단에서 120→80→40→120열 왕복 시 읽던 marker-17과 follow=false를 유지하고 scrollTop은 120→154→290→120으로 복구됐다. 이 한 시나리오는 anchor 보존의 기준이며 모든 sidebar/기록 조합 수락을 뜻하지 않는다. `astra-scroll-anchor-probe.ts` 참조.

검증 및 한계:

- `bun run check` 및 전체 suite: **1,244 pass / 0 fail**, 139 files, 11,469 assertions, 27.17초.
- cache/fit 행동 테스트에서 timing assertion을 제거했다. 출력/바이트/상한은 결정론적으로 검사하고, 성능 조건은 별도 warm paired benchmark의 exit code에 반영한다. focused microbenchmark는 cold body 측정 뒤 실행한다.
- 실제 PTY의 별도 합성 세션에서 한글·emoji 입력→전송→안전 종료 PASS. 실제 provider/IME/픽셀 지연/저장 지속성/Native 동급을 검증한 것은 아니다.
- Bun source/bundle/compile의 native **sidecar 경로** smoke PASS. native asset 없는 compile은 기존 eager control도 실패한다. 전체 CLI 배포·embedded addon 제작·다른 OS는 검증하지 않았다.
- GLM v1 캐시 한정 READY 및 지적은 회수·보완했다. **v2 Map/fit와 이번 추가 변경의 최종 GLM 수락은 아직 없다.** ZCode 프로세스는 보이나 창 연결이 `cgWindowNotFound`로 실패해 새 패킷은 미제출이다.
- 테스트 관측 0 캡처와 설명은 기존 책임의 [Linear WOO-843](https://linear.app/woo-world/issue/WOO-843)에 게시하고 첨부/코멘트/다운로드 SHA-256을 확인했다. GitHub 게시 없음. 원인 해결 상태로 바꾸지 않았다.
- 당시 사용 중인 WWW는 수정 전 프로세스였다. 자동 재시작·commit·push·배포·사용자 cache/dist 삭제는 하지 않았다.

원시 결과: `.www/scratchpad/astra-performance-plan/followup-run{1,2,3}.json`, `followup-stress-isolated.json`, `syntax-startup-paired.json`, `full-test-followup.log`, `pty-smoke-final.json`. `followup-stress.json`은 PTY smoke 시작과 겹친 진단 실행이므로 주 측정에서 제외했다. GLM 재개 패킷은 `glm-final-packet.md`다.

이하 2026-09-13 기록은 이전 단계의 근거로 보존한다.

## 왜 반복해서 느려졌는가

기존 채팅 벤치마크는 `WorkbenchChatView`를 직접 호출해 실제 Astra의 inset → scroll → layout 경로를 통과하지 않았다. Transcript 자체가 캐시되어도 `AstraInset`이 매 입력·스트리밍 갱신마다 모든 과거 행의 ANSI/grapheme 폭과 padding을 재계산했다. 1,000개 기록 진단에서 inset map callback의 inclusive CPU sample 비중은 약 83%였다.

즉 현재 차이를 곧바로 TypeScript/Bun과 Rust의 좁힐 수 없는 격차로 볼 근거는 없다. 반복 작업을 없애는 것만으로 큰 개선이 가능했다. 다만 Native와 동일한 history/기능을 재생한 종단 비교는 아직 하지 않았다.

## 이번 구현

- `AstraInset`: 인스턴스별 마지막 generation의 **문자열 값**으로 렌더 결과를 공유한다. ANSI 색상도 키에 포함한다. 같은 배열 내부의 변경, 행 이동, 반환 배열의 외부 변경에 안전하다.
- 캐시는 최대 16,384 고유 행 및 UTF-16 논리 8MiB 중 먼저 도달하는 값으로 제한한다. 논리 예산은 실제 heap/RSS와 다르다. 상한 밖 행도 정상 출력하며 기록을 삭제하지 않는다. 이전 draft의 Map을 누적하지 않는다.
- 위 상한은 **인스턴스당 보존 generation 하나**의 예산이다. 교체 중 이전/현재 Map 두 세대가 함께 살아 있을 수 있고, child transcript와 반환 배열의 메모리는 별도다. 앱 전체 메모리가 8MiB라는 뜻이 아니다.
- `fit`: pi-tui의 `truncateToWidth(..., pad=true)`를 사용해 clipping 뒤 폭을 한 번 더 스캔하던 계산을 제거한다.
- 실제 Astra body와 `runProjectWorkbenchShell`의 MemoryTerminal 입력→동기화 frame write 벤치마크를 추가했다. 구형 채팅 벤치마크 통과를 Astra 검증으로 대신하지 않는다.

처음 적용한 index별 prefix 캐시는 5,000개 기록에서 상한 밖 중복 행을 계속 계산했다. 이 설계는 최종안이 아니며 값 기반 중복 공유로 교체했다.

## 실측 결과

Apple M1 / 8GiB / Bun 1.4.0, truecolor, 고정 한글 Markdown fixture, 80×24. 다른 앱이 실행 중인 개발 머신 측정이다.

| 지표 | 이전 | 최종 수정 후 |
|---|---:|---:|
| 1,000개 / warm body p95 | 346.46ms | 2.41–4.10ms |
| 1,000개 / 약 1.9KB draft 갱신 p95 | 412.70ms | 4.71–4.93ms |
| 1,000개 / MemoryTerminal 입력 p95 | 직접 비교 baseline 없음 | 4.39–12.58ms |
| 5,000개 / MemoryTerminal 입력 p95 | 중간 prefix안 1,259.32ms | 30.42ms |
| 5,000개 / warm body p95 | 진단 2,050.88ms | 14.51ms |

이전 진단은 3 warmup + 20 samples. 최종 1,000개는 별도 프로세스 3회 × 50 samples이고 표는 각 실행의 p95 범위다. 5,000개는 5 samples의 stress spot check이므로 안정적인 tail 보장은 아니다. 지표가 다른 Native 빈 화면 PTY 측정과 배수 비교하지 않는다.

MemoryTerminal은 실제 shell을 통과하지만 실제 PTY syscall/backpressure/터미널 픽셀 표시/모델 대기/snapshot projection을 포함하지 않는다. **Native보다 빠르다는 증거가 아니다.**

## 아직 미달인 부분

- 37KB draft 갱신 p95: 1,000개에서 39.05–46.48ms, 5,000개에서 50.50ms. 내부 목표 32ms 미달.
- 첫 body layout: 1,000개 약 280–333ms, 5,000개 약 2.80초. 이는 프로세스 startup이 아니라 첫 layout 비용이다.
- resize 왕복: 1,000개 p95 약 302–1,866ms, 5,000개 p95 약 6.53초. 기록 전체를 다시 배치하며 큰 지연이 남는다.
- 따라서 전체 성능 게이트는 **RED**로 보존한다. 일반 입력·warm 갱신의 개선만 완료로 기록한다.
- 별도 37KB draft CPU profile(4.72초/2,962 samples)에서는 Markdown 파싱 정규식 self 약 13.4%, grapheme/ANSI 처리도 남았다. profiler 실행의 시간은 위 비계측 벤치마크 결과와 섞지 않는다.

## 다음 구현 순서

1. **첫 표시·resize·장기 기록:** `WwwTranscriptView`, `ChatScrollView`, layout 경계에 message/block별 row-count index와 visible-range 렌더링 계약을 설계한다. contentHeight, scrollTop, anchor, follow-end, scrollbar를 유지해야 한다. 단순 slice나 history 삭제는 금지한다. 현재 측정으로 검토 트리거는 충족됐으며, 별도 viewport 변경안에서 행동 테스트와 baseline부터 만든다.
2. **긴 응답:** 완료된 Markdown block 재사용과 열린 마지막 block 갱신을 검토한다. fence/list/table/reference가 앞 block의 의미를 바꾸는 경우 안전하게 재계산해야 한다. 하나의 긴 paragraph도 포함해 측정하며 토큰을 누락하거나 응답 길이를 줄여 목표를 맞추지 않는다.
3. **시작·RSS 경량화:** startup import-only/ready-to-input/RSS를 먼저 분리 계측한다. T-note·review의 첫 generation 호출까지 registry를 실제 지연 생성한다. session factory 안으로 import만 옮겨 즉시 await하는 변경은 충분하지 않다. 인증/usage의 별도 eager 경로도 확인한다.
4. **배포 용량:** 개발 설치와 배포 artifact를 분리한다. 런타임 의존성 제거·native syntax 지연 로드는 단독 Bun binary, 인증, usage, Markdown 회귀 검증 뒤 별도 반영한다.

## 전체 크기와 “무거움”의 구분

앞선 디스크 실측: 개발 workspace 약 1.35GiB, node_modules 약 795MiB(그 안의 설치 store 약 511MiB 포함), dist 약 285MiB(복수 binary/백업 포함), 제품 src 약 2.25MiB. 단일 기존 WWW binary 약 79.8MiB, 당시 Codex CLI binary 약 210.4MiB였다. 기능·패키징이 달라 크기만으로 속도를 판정할 수 없다.

별도 읽기 전용 재확인(2026-09-13 22:06–22:07 UTC)은 workspace 약 1.59GiB,
node_modules 약 1001.7MiB, dist 약 285.0MiB, src 약 2.28MiB였고 두 binary의
logical bytes는 이전과 같았다. 이는 다른 시점의 dirty 개발 설치이므로 이번 렌더
변경의 용량 증감이나 RSS·속도 개선으로 귀속하지 않는다. 원시는
[`weight-recheck-20260913T2206Z.md`](../.www/scratchpad/astra-performance-plan/weight-recheck-20260913T2206Z.md)에
보존했다.

이번 변경은 반복 CPU 작업을 줄인 것이며 설치 용량 삭제는 하지 않았다. 캐시는 소량의 보존 메모리를 사용하는 대신 반복 계산을 줄인다. RSS가 감소했다고 주장하지 않는다. 설치 store와 과거 dist 정리는 정확한 파일 목록 승인 후 수행하며 사용자 기록·실행 중 파일은 건드리지 않는다.

## 재현 및 증거

```sh
bun run check
bun test
WWW_BENCH_REPS=5 bun scripts/www-render-benchmark.ts
WWW_BENCH_REPS=50 WWW_BENCH_OUTPUT=/tmp/www-benchmark.json bun scripts/www-render-benchmark.ts
WWW_BENCH_COUNTS=5000 WWW_BENCH_REPS=5 WWW_BENCH_BUDGET_MS=180000 bun scripts/www-render-benchmark.ts
```

- 최종 로컬 전체 suite: **1,240 pass / 0 fail**, 137 files, 11,436 assertions, 약 55초. 타입 검사 및 별도 benchmark 타입 검사 통과.
- 신규 캐시 테스트 6개: mutable input/returned output, 독립 구식 oracle, 행 이동, ANSI/폭, entry/byte 상한, 100 generation/resize 및 invalidate.
- 신규 fit 테스트 2개: 특수 입력 14종 × 폭 11개 = 154개 바이트 동등성, 중복 폭 계산 상대성능 RED→GREEN.
- 상세 계획·원시 결과·RED/GREEN 로그는 로컬 `.www/scratchpad/astra-performance-plan/`에 있다. 진단 정본은 `.www/scratchpad/2026-09-13-astra-render-performance-audit.md`다.
- GLM-5.3-Flash 계획 검토 REVISE를 회수하고 수정했다. 최종 v2 변경의 독립 검토 수락은 아직 회수하지 못했다. 사용자 ZCode 작업과 충돌해 UI 검토를 무리하게 계속하지 않는다.
- 실행 중 WWW는 자동 재시작하지 않았다. 새 소스가 현재 사용 중인 세션에 반영됐다고 주장하지 않는다. commit/push/배포도 하지 않았다.

# WOO-915 채팅 렌더 수정과 검증

2026-09-24. [WOO-915](https://linear.app/woo-world/issue/WOO-915)에 결속한다. 초기 진단은 [시스템 진단](2026-09-24-chat-render-system-diagnosis.md)에 보존한다.

## 현재 판정

수정 코드의 생산 조건 합성 벤치는 GREEN이다. 최종 통합58개 검사와 Opus 재감사를 통과했다. 기존 CMux www에서 새 작업이 시작되어 재시작 적용은 보류했다. WOO-915는 In Progress로 유지하며 실제 사용자 세션의 지연 해결 완료를 주장하지 않는다.

## 전체 흐름의 진단

| 경계 | 확인한 사실 | 해석·제한 |
|---|---|---|
| 머신 | 8코어에서 load average 111, 이후 199와 swap 약13.6GB 관측. 최종 측정 즈음 load 약6까지 하락 | 부하가 함께 작용한다. load는 CPU 사용률이 아니며 swap 할당량은 swap-in 속도가 아니다. 기여율은 미계측 |
| event→snapshot | bounded stream tail, durable projection은 활동 길이+thread cache 재사용 | delta마다 전체 완료 chat을 재투영한다는 가설은 cache-hit 경로에서 기각 |
| snapshot 집계 | 실제 journal 5,683개와 파생 workFlow, synthetic working run으로 projectPerformance 20회 wall p95 1.806ms | 집계 단독; 나머지 snapshot 조립·freeze·publish는 제외. 이 표본은 큰 지연을 설명하지 않아 코드 미변경 |
| snapshot→벤치 | 실제 생산자는 frozen durable graph 사용, 종전 벤치는 mutable fixture | 실제 heading과 깊은 불변 fixture로 교정. 기존 mutable caller 방어 및 수락 기준 유지 |
| 긴 draft→행 | 공통 폭·토큰·clip·wrap의 반복 grapheme 처리 | 정확한 문자 부분집합에서 선형 처리; 복잡한 Unicode는 원래 경로 |
| heading→history | 같은 history를 매 frame 재집계, append에서 불변 검증 전체 반복 | immutable revision 파생값과 검증된 frozen node 재사용 |
| scheduler→terminal | stream 갱신을 32ms 간격으로 합치고 입력 우선 frame 제공 | 입력 frame과 최신 draft 표시를 구분. pixel/backpressure는 미계측 |
| 최초 폭·resize | exact height 계산 필요 | steady 수락과 분리된 진단 지표. 추정 높이·내용 절삭은 도입하지 않음 |

## 구현

- `pi-tui` patch: printable ASCII, Box Drawing, 완성형 한글, 제한된 한자 범위의 width/token/clip/linear wrap 빠른 경로. ANSI clip은 기존 parser/finalizer를 사용한다. 결합 문자·자모·이모지·ZWJ·variation selector·제어문자는 기존 경로로 돌아간다. 임의 Markdown 전체를 빠르게 만들었다는 뜻은 아니다.
- 기존 `tui.js` patch hunk의 누락 context 공백 3개를 복구했다. 동작 의미 변경 없이 패치 적용을 복구했고 최종 lockfile 및 frozen install을 확인했다.
- `AstraExecutionHeading`: 깊은 불변 plain data만 캐시한다. 새 배열 append에서 이미 검증한 frozen node는 재검사하지 않는다. 전체 검증 성공 후에만 trust cache를 갱신해 순환/실패 graph가 부분 신뢰를 남기지 않는다. 함수·Date·mutable caller는 캐시하지 않는다. thread/active turn 변경은 재집계하고 clock/hint/width/live 상태는 매번 반영한다.
- 생산 activity child 동결은 journal coordinator가 소유하고 durable projection은 frozen 배열을 제공한다. 이미 frozen 배열을 makeSnapshot이 다시 재귀 검사한다고 해석하지 않는다. 실제 layout 3회 heading invalidate 0회를 확인했다.
- benchmark: fixture 준비·freeze는 타이머 밖, 실제 heading 포함. ready 입력과 stream pending 입력을 별도 측정하며 최신 draft tail marker 출력과 입력 dispatch 무손실을 확인한다. cleanup 실패가 원인 예외를 가리지 않도록 보존한다.
- Artifact issue: 기존4절 exact output을 유지하면서 optional paired result/behavior의6절 호환을 추가했다. 반쪽 필드·unknown key·필수값 누락 오류를 구분한다. WOO-915의 실제 UUID와 테스트를 traceability 원장에 연결했다.

## 최종 성능 수락

`ASTRA_BENCH_REPS=50 ASTRA_BENCH_BUDGET_MS=240000 bun scripts/astra-render-benchmark.ts`, 1,000 messages / 80×24. exit0 / GREEN. 240000은 전체 harness watchdog이며 프레임 threshold가 아니다.

| 항목 | 표본 | p95 | p99 | 기준 |
|---|---:|---:|---:|---|
| warm body | 50 | 1.19ms | 1.36ms | 16ms |
| short draft | 50 | 1.40ms | 1.47ms | 32ms |
| 37KB long draft | 20 | 11.14ms | 12.92ms | 32ms |
| ready input→frame write | 50 | 3.72ms | 11.03ms | 50ms / p99 100ms |
| stream pending 중 input 우선 frame | 50 | 9.59ms | 14.23ms | 50ms / p99 100ms |

- source manifest: `5c2cd0cb8e6c29a8ee1c08914848dee3264aad4ed651c1dde7822b038a90c603`. 실행 전후 source 변화 0건.
- ready idle writes: 0. working 애니메이션에는 idle0를 요구하지 않는다.
- input 우선 frame이 최신 draft paint를 뜻하지 않는다. 마지막 unique marker가 출력에 도달하는지 별도 bounded assertion으로 확인하며 그 대기를 latency 수락으로 사용하지 않는다.
- cold body 110.03ms / 신규 폭 61.87ms / durable append p95 20.84ms / journal bump p95 1.76ms는 진단 지표다.
- 이전 고부하 실행에서는 long draft p95 261.16ms였다. 설치와 시작 구간이 겹친 그 결과도 보존한다. 동일 부하의 코드 전후 A/B가 아니므로 제품 전체 속도 개선 배율을 주장하지 않는다.

## 정확성·통합 검증

원본 utils oracle와 16,148건 byte 비교를 통과했다. 최종 문자 처리 검사7개/38 assertions, 헤더 검사8개/26 assertions, Artifact 관련16개, 앞선 heading/UI 관련76개 및 타입 검사가 통과했다. 마지막 통합 검사는 58 pass /0 fail /6,160 assertions /6files다(`final-integration-tests.log`).

앞선 전체 suite는 1,468 pass /3 fail이었다. readability timeout2건과 신규 이슈 traceability 누락1건이며 등록 후 timeout30초의 관련65개 검사가 통과했다. 기본 timeout의 전체 suite를 다시 GREEN으로 검증했다고 주장하지 않는다. 최종 patch 파싱(utils +191행), frozen install, 대상 diff-check 및 자리표시 검사도 확인했다.

최초 Claude Opus 정적 감사는 utils 정확성 반례를 찾지 못했고 append 검증 비용·cleanup 예외 은폐·Artifact 오류를 지적했다. 이를 보완했다. root 후속 검토에서 mutable function의 toString 반례도 차단했다. Opus 최종 재감사는 코드 정확성 blocker 없음·적용 가능으로 판정했다. 요청한 E1(count1000/sample50/idle0)는 원본 JSONL 첫 행에서 확인하고 `benchmark-final-full.json`으로 손실 없이 합쳤다. root의 마지막 함수 guard도 별도 Opus PASS다. 두 감사 모두 도구 없이 제공된 코드를 읽은 정적 판정이며 실행 검사는 Codex가 소유했다.

## 실제 CMux

별도 새 프로세스의 오프라인 production shell에서 1,000개 history, 37KB draft 180개 갱신을 재생했다. 한국어 입력 보존, 스크롤, 완료 후 Home/End, `QA915` dispatch, 정상 종료를 확인했다. 외부 provider 호출과 pixel latency 측정은 없었다.

실제 journal 5,514 records /238 messages immutable replay는 cold311.05ms, warm3표본2.73~3.22ms, 신규 폭221.69ms였다. raw 메시지는 증거에 출력하지 않았다.

기존 www PID86770의 별도 작업은 13:43:38 종료 화면을 확인했으나, 재시작 직전 다시 조회하니 새 “Readability 계약과 현재 정규화기 결함 재현” 작업이 실행 중이었다. Ctrl+D나 재시작 명령을 보내지 않았다. 작업 중단 선택에 대한 답은 아직 없어 원래 프로세스를 유지했다. 같은 native thread의 재개 방법은 확인했으며 적용·실사용 확인은 남아 있다.

## 기록

Evidence root: `.www/evidence/2026-09-24-chat-render-fix/`.

- 이슈 생성·read-back: `issue-publish-receipt.json`
- 구현 Project Comment: `1196a23e-1f9f-4bff-b6c8-83f5a1a4e5ab`, `project-comment-publish-receipt.json`
- 최종 benchmark: `benchmark-audited.json`, `source-final-check.json`
- 초기 감사 및 판정: `opus-initial-review.md`, `opus-disposition.md`
- 기존 exact height·scroll anchor·내용 보존·mutable caller 계약 내부 구현이다. 신규 capability나 제품 WHY·공개 계약·되돌리기 어려운 설계 결정을 채택하지 않아 별도 Obsidian Candidate는 만들지 않았다.
- 커밋·push는 하지 않았다. 동시 가독성 작업 변경은 이 수정의 소유 범위에 포함하지 않는다.


## 사용자 증상 구체화: 응답 완료 후 표시·스크롤 지연

사용자가 가장 심한 증상을 “응답은 끝났는데 채팅 화면 표시·스크롤이 느림”으로 특정했다. 따라서 앞의 streaming/draft GREEN은 이 증상 전체의 수락으로 사용하지 않는다. 재시작은 진행 중인 작업 종료 뒤로 명시 승인받았으며 원래 www PID86770은 계속 실행 중이다.

완료 snapshot을 실제 journal 첫6,236 records /252 messages로 고정했다. canonical newline 포함 digest는 `a2f9c59e4e2f703dba2694bba8e2edcc14790fac9de89ab8cbb9268c410926b8`다. shell harness의 digest `847dfe008b9535c55717f094e9f735a95102ec4ef41d6fdeab9e7f7739e2519d`는 동일 내용의 마지막 newline만 제외한 값임을 직접 대조했다. raw 대화는 증거에 복제하거나 출력하지 않았다.

| 경계 | 결과 | 제한 |
|---|---|---|
| 150×44 첫 이전 viewport | 최초115.66ms wall /32.47ms processCPU, pinned 재실행10.00ms | 최초 digest 미기록, 동일 prefix 크기의 재실행이며 동시 시스템 부하와 소스 전후를 통제한 A/B 아님 |
| pinned 실제 navigation61개 합산 | wide p9510.00ms, compact1.64ms | renderer seam;32ms 신호는 이번 진단용이며 기존 이슈 gate 아님 |
| cache-hit 아래 이동20회 | 최초 block render0, materialization 합계3.01ms, wallp9553.70ms | 전체 transcript 재계산만으로 긴 wall tail을 설명할 수 없음 |
| pinned warm 경계 | fullp955.97ms, heading0.43, visible rows0.09, 기타 layout/sidebar5.10 | boundary instrumentation 표본; 각 percentile은 서로 더하는 값이 아님 |
| 같은 snapshot sidebar-off | fullp951.48ms | 제거 대조이며 제품 패널을 없애자는 결정 아님 |
| 실제 shell 키입력→write | PageUp20회p9547.88ms, PageDown20회41.55ms, Home10회21.10ms, End10회30.81ms | ready/reduced-motion MemoryTerminal; 실제 키 라우팅·frame cadence 포함, renderer32ms와 직접 비교하지 않음 |
| 실제 shell 첫 paint | 592.41ms | 기존 live process 최초 paint/terminal pixels는 아님 |

모든 warm/scroll stage에서 exact-count rebuild와 durable graph rebuild는0이었다. 처음 보는 viewport에서는 새 block8개 계산이 추가됐다. 렌더 지연은 재실행에 따라 크게 달랐고, cache-hit 단계에서도 wall 지연이 커졌다. 공유 시스템 경쟁은 후보이지만 corpus digest·소스·부하를 함께 통제하지 않아 세 후보의 기여를 구분할 수 없다. 루트가 관측한 주변 시스템은8GB RAM, load약13, VSCode renderer130%CPU와 기존www42%CPU 등 여러 프로세스가 동작했다. 다른 앱을 종료하지 않았다.

현재 CMux의 과거 완료 대화 Home/End 이동을 확인하고 입력 위치로 복원했다. UI 도구의 실행 시간은 pixel latency로 사용하지 않았다. 현재 프로세스에는 이번 코드가 미적용이라 재시작 이후 검증을 대신하지 못한다. 이번 완료-scroll 추가 조사에서는 제품 코드를 더 변경하지 않았다.


### 완료 영수증 경계로 다시 고정한 최종 관측

앞의6,236-record replay는 현재 작업 이벤트까지 포함한 고정 history를 ready로 재생한 것이며, 실제 완료 순간의 원본 snapshot이 아니다. 이 점을 보완하여 마지막 `turn/completed`5682번째와 `execution/completion-receipt`5683번째까지 잘랐다. 다음 `turn/started`는5688번째이므로 제외했다. 결과는5,683 records /244 messages, canonical digest `d24e21fb746fb042946e53c4791a98367c7214cdf975befe6d557d3ab5e0eff2`다.

- 완료 후 정적 scroll navigation61개: wide renderer p953.93ms, compact0.84ms. 최초 화면은 이 통계에 포함되지 않으므로 전체 사용자 증상의 GREEN 판정이 아니다.
- 실제 shell PageUp/Down에서 chat scrollTop 감소/증가, Home0, End follow 상태를 각각 단언했다. 키 입력이 삼켜진 상황을 통과로 처리하지 않는다. PageUp20회p9524.16ms, PageDown20회23.19ms, Home10회17.70ms, End10회23.09ms였다. 실제 terminal pixel은 여전히 제외된다. 소표본10회 p95는 최댓값과 같다는 제한이 있다.
- 해당 shell 최초 paint는535.24ms다. 첫 표시 비용을 수락에서 숨기지 않고 별도로 남긴다. 실행 전후 loadavg는4.333/6.900/8.846이었다.
- 완료 전환도 별도로 만들었다. 최종280-character body를 working draft로 합성하고, 마지막 완료 assistant record직전5,674개에서 완료영수증5,683개로 교체했다. wide5표본 합계 wall 중앙18.92ms /최대43.46ms, compact중앙12.96ms /최대20.80ms였다. 실제 ephemeral draft·provider event 간격의 재현은 아니다.
- 완료 전환1회마다 기존 durable blocks784개를 재사용하고 신규1개만 count했다. graph/count repair는1회 발생했고, 전체 history를 다시 렌더하지는 않았다. 후속 warm 정적 탐색과 완료 전환을 같은 측정으로 취급하지 않는다.

Opus 추가 진단 감사의 유효 지적(완료 전환 누락, 키 이동 검증 부재, 최초 표시와 정상 스크롤 분리, 원인 기여 미확정)을 반영했다. 최초 원본JSON에는 records6236이 명시되어 있으나 최초digest가 없어 byte동일성은 확립하지 않는다. shell입력→write에는 cadence가 포함되므로 renderer32ms 기준으로 직접 RED/GREEN을 매기라는 지적은 채택하지 않는다. 전체 verdict는 계속 미결이며, 최신코드 실사용 적용 및 사용자 증상의 해소를 인증하지 않는다.

이후 제품 코드 변경은 없다. 기존 PID86770은 새 작업의 감사가 진행 중이고 대기 요청도 표시되었다. 사용자 승인대로 진행 중 작업과 대기 요청을 훼손하지 않고 재시작 적용을 기다린다.

Opus 후속 감사는 보완된 관측을 “제한된 진단 주장으로 수용 가능, 전체는 계속 미결”로 판정했다. 두5683-record digest는 root가 원본 prefix에서 마지막 newline 유무만 바꿔 직접 계산하여 둘 다 일치함을 확인했다(`completed-corpus-crosscheck.json`). 실제 pixel·provider·실사용 해결은 인증하지 않는다.


### 15:57 KST 실제 세션 적용

앞선 재시작 대기 상태는 해소했다. 별도 작업의 15:27:52 종료, Plan 3/3, Next 없음 확인 후 사용자 승인대로 Ctrl+D 정상 종료했다. PID86770 부재를 확인하고 같은 thread를 `www --resume`으로 복원했다. 새 PID36300 시작 시각은15:57:39다. 최신 HEAD868ce9b 및 dirty 소스로 시작했으며 기존 benchmark 고정 소스와 같다고 주장하지 않는다. 설치된 pi-tui의 선형 wrap과 heading 소스 digest를 `live-restart-verification.json`에 남겼다.

실제 CMux에서 기존 완료 보고 복원, Home 첫 요청, PageDown 다음 과거 대화, End 마지막 완료 보고 복귀를 확인하고 입력 모드로 되돌렸다. 새로운 provider 요청은 보내지 않았다. 이는 실제 적용과 탐색 기능 확인이며 terminal pixel latency 측정이나 장시간 지연 해소 인증은 아니다. WOO-915는 In Progress로 유지한다. 후속 Comment는 `applied-render-comment-candidate.json`으로 갱신·검증했으며 외부 게시 전 승인 대상이다. 기존 승인된 진단 Comment는 이미 게시·read-back되어 중복 게시하지 않는다. 기존 계약 내 최적화라 Obsidian 신규 기록은 필요하지 않다.

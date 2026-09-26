# 채팅 지연: 시스템 부하와 렌더 경로 진단

2026-09-24 KST. 현재 판정은 **시스템 고부하 관측·렌더 harness 지연 재현, 사용자 CMux 증상과의 인과 미확인**이다.
제품 코드는 변경하지 않았다. 실행 중 www를 재시작하거나 다른 작업을 중단하지 않았다.

## 현재 막힌 확인과 필요한 자료

CMux 내부 터미널에서 다음 읽기 전용 명령으로 세션 위치를 확인하고,
www surface ref를 넣어 화면을 수집할 수 있다. 실제 명령 성공은 이 세션에서 검증하지 못했다.
CLI 경로는 이 머신에 설치된 경로다.

```sh
/Applications/cmux.app/Contents/Resources/bin/cmux tree --all
/Applications/cmux.app/Contents/Resources/bin/cmux read-screen --surface <www-surface-ref> --lines 40
```

화면 문자만으로 픽셀 지연은 측정되지 않는다. 증상이 시작된 시각, 응답 중/완료 후 여부,
입력·스크롤 중 무엇이 멈췄는지도 함께 필요하다. 이 세션에서는 해당 증상 질문을 보냈으나
문서 작성 시점까지 답변을 확보하지 못했다. 본문에 민감정보가 있으면 공유 전에 가린다.
아래 디스크 소스 실험이 실행 중 www의 같은 revision을 측정한다는 보장은 없다.

## 확인된 사실

- 작업 위치는 `99_www`, 브랜치는 `dev`. 진입 시 다수의 미커밋 변경과 진행 중인 다른 작업이 있었다.
- CMux PID 13102, 그 셸 PID 13165 아래 www PID 86770이 실행 중이었다. cwd는 이 저장소이며 실행 진입점의 symlink도 이 저장소 `src/cli.ts`로 해석된다.
- www 시작 시각은 08:30:19. 실행 이후 수정된 소스가 프로세스에 반영됐는지, 메모리에 로드된 revision은 확인하지 못했다. 현재 디스크 소스의 재현과 실행 중 프로세스는 구분한다.
- 08:50 첫 측정은 논리 CPU 8개, load average 111.47/102.88/56.64, swap 사용 약 8,028MiB였다. 08:54 후속 load average 77.11/91.03/60.74. 이는 CPU 사용률 자체나 현재 swap-in 속도가 아니다.
- www의 자식 Codex PID 86774에서 시작된 가독성 전수 수집 PID 92699/92702가 `xargs -P 8`로 파일별 검사를 실행하고 있었다. www가 시작한 작업과 렌더 프로세스의 동시 실행을 확인했다. 자원 경쟁으로 지연이 증폭될 가능성은 추론이며 기여율은 미측정이다.
- 각 검사는 `load-source-file.ts`에서 TypeScript API 인스턴스를 만들고 프로젝트 snapshot을 열며 native tsc 자식 프로세스를 생성한다. 측정 시 6~8개 tsc가 동시에 나타났다. 첫 ps 표본에서 tsc 약 5.5~29.8%, iTerm2 80.9%, WindowServer 56.7%를 관측했다. 이 값은 서로 다른 후속 ps 표본과 합산하지 않는다.
- 이 파이프라인은 `result=$(...)`와 마지막 `awk END`로 요약을 모은다. 명령 실행 중 출력이 적은 현상과 화면 렌더가 막히는 현상을 구분해야 한다. 이것이 사용자 증상의 직접 원인인지는 미확인이다.
- CMux CLI는 `Access denied - only processes started inside cmux can connect`로 화면 조회를 거절했다. 정책을 우회하지 않았다. 실제 키 입력·스크롤·픽셀 표시 지연은 측정하지 못했다.
- 실행 중 www의 3초 OS sample은 footprint 240.7MiB, peak 948.4MiB를 기록했다. Bun/JIT stack이 다수 미심볼화돼 특정 TypeScript 함수의 병목 증거로 사용하지 않는다.

## 재현과 대조

원시 파일은 `.www/scratchpad/2026-09-24-render-diagnosis/`에 보존했다.
가독성 전수 검사 프로세스는 baseline 전·중과 minimal 이후 조회에서도 실행 중이었다.
각 frame과 동시에 CPU·swap 속도를 기록하지는 않았다. baseline과 최초 minimal은 잠시 겹쳤고,
이후 frozen 및 동일 1,000개 fixture 대조는 순차 실행했다. 부하를 통제한 A/B 실험이 아니다. 작은 표본은 p95 보장으로 해석하지 않는다.

기존 명령:

```sh
WWW_BENCH_REPS=5 WWW_BENCH_COUNTS=1000 WWW_BENCH_OUTPUT=.www/scratchpad/2026-09-24-render-diagnosis/baseline.json bun scripts/www-render-benchmark.ts
```

약 87.9초, exit 1 / RED. 첫 body 2,630ms, 짧은 draft 3,239~7,820ms,
긴 draft 1,323~1,938ms. MemoryTerminal 입력은 7.7~24.2ms였다.
**이 수 초 결과를 실사용 streaming 회귀로 판정하면 안 된다.**
짧은 draft가 긴 draft보다 느린 역전은 원인 미설명으로 보존한다. 동시 부하·캐시 상태를
통제하지 않았으므로 본문 길이별 속도 비교나 선형 비용 추정에 이 수치를 사용하지 않는다.
기존 benchmark fixture는 가변 객체이고 현재 캐시는 깊은 불변성을 요구한다.
실제 `ProjectWorkbench.makeSnapshot()`은 deepFreeze를 수행한다.
HEAD의 기존 `www-execution.ts`에도 같은 불변성 검사와 block 재사용 조건이 있고,
HEAD의 `project-workbench.ts`도 snapshot을 deepFreeze한다. 따라서 이 조건 차이를
현재 미커밋 모듈 분리에서 새로 도입한 회귀라고 지목하지 않는다.
따라서 기존 벤치는 적어도 불변성 축에서 현재 앱의 snapshot 조건과 다른 보수적 재계산 경로를 측정한다.

최소 harness는 `AstraWorkspace`와 pi-tui의 `renderLayoutFrame`을 실제 import한다.
캐시나 renderer 로직을 재구현하지 않는다. fixture 생성과 deepFreeze만 harness가 수행한다.
production event queue/snapshot producer 자체는 이 실험에 포함되지 않는다.

최소 대조 명령:

```sh
COUNT=1000 REPEAT=50 bun .www/scratchpad/2026-09-24-render-diagnosis/minimal.ts
FROZEN=1 COUNT=1000 REPEAT=50 bun .www/scratchpad/2026-09-24-render-diagnosis/minimal.ts
FROZEN=1 bun .www/scratchpad/2026-09-24-render-diagnosis/minimal.ts
```

| 같은 1,000개 메시지 fixture | 가변 | 깊은 불변 |
|---|---:|---:|
| 첫 body | 671ms | 654ms |
| 짧은 draft 3회 | 632 / 615 / 745ms | 34 / 21 / 19ms |
| durableCountRenderedBlocks 누계 | 1000→2000→3000→4000 | 1000 유지 |
| durableGraphBuilds 누계 | 1→2→3→4 | 1 유지 |

시간 배율은 부하 통제 실험이 아니므로 인과 효과 크기로 사용하지 않는다.
불변 여부 하나를 바꿨을 때 과거 block 재계산 횟수가 사라지는 것은 직접 관측했다.
캐시 조건을 느슨하게 바꿔 이 벤치를 통과시키면 mutable caller의 정합성을 해칠 수 있다.

작은 실제 Astra fixture(채팅 2개, durable block 4개)에 약 37KB의 긴 본문을 넣으면,
깊은 불변 상태에서도 frame 211 / 183 / 160ms, 32ms 기준 RED였다.
기록 재계산은 4개에서 증가하지 않았으며 count-build 누계는 각 frame에 약 208 / 182 / 158ms 증가했다.
별도 `requestedMaterializationMs` 증분은 각각 약 0.047 / 0.034 / 0.039ms였다.
이 세 표본에서 viewport row materialization은 frame 지연의 대부분을 설명하지 않는다.
이 결과는 **긴 본문 전체의 행 수 계산이 남는 것**을 보여주지만,
부하 없는 머신의 성능 수치나 사용자 CMux 증상의 직접 재현을 증명하지 않는다.
짧은 입력 실험도 3개 중 한 frame이 32ms를 넘었으므로 전체 GREEN으로 기록하지 않았다.

## 전체 흐름과 측정 공백

| 경계 | 현재 코드 | 확인 / 미확인 |
|---|---|---|
| Provider→수신 | `codex-app-server.ts` subscribe/emit | 경로 확인, 실제 수신 간격 미계측 |
| 이벤트 순차 처리 | `project-workbench.ts:425` eventQueue | ready→record 순차 연결, 대기열 시간 미계측 |
| delta→상태 | `native-event-lifecycle.ts:250` applyDelta | delta마다 publish; 첫 출력 durable 기록 경로 존재 |
| snapshot 생성 | `project-workbench.ts:1292` publish/makeSnapshot | projection과 deepFreeze가 render scheduler보다 앞에 있음 |
| 표시 요청 합치기 | `workbench-shell.ts:520`, `render-scheduler.ts` | streaming 32ms 스케줄, 앞단 projection 비용까지 합치지는 않음 |
| 기록/본문 | `www-execution.ts`, `www-transcript-cache.ts` | durable/volatile 세대, 깊은 불변성 검증, 폭별 count index |
| 첫 표시·새 폭 | `www-transcript-cache.ts:349` widthIndex | 정확한 행 수를 얻기 위해 모든 해당 block을 동기 render |
| viewport | `www-surface.ts`, `chat-scroll.view.ts` | 가시 범위 row 요청과 anchor/follow 처리 |
| terminal | pi-tui→Terminal.write→PTY→CMux | MemoryTerminal write까지만 기존 benchmark에 포함 |

과거 기록의 viewport 가상화만으로 긴 단일 응답 block의 계산이 작아지지는 않는다.
RenderScheduler의 32ms는 계산시간 상한이 아니다. **구조상 추론:** harness에서처럼 하나의 동기 layout이 160ms를 쓰면
그동안 같은 JS thread의 입력 처리는 진행될 수 없다. 실제 체감 정지의 크기는 별도 측정이 필요하다.

## 부분 수정이 반복되지 않게 하는 실행 순서

1. **실제 세션 재현을 먼저 확보한다.** CMux에서 접근 가능한 진단 세션에서 증상 시점의 입력·스크롤, provider 수신, event queue, projection, layout, terminal write를 동일 단조 시계로 연결한다. 본문과 인증정보 대신 event ID·길이·시간·queue depth를 기록한다. 화면 접근과 사용자 증상 확인이 현재 미해결 경계다.
2. **작업 실행 자원 예산을 포함한다.** 대화가 실행한 전수 검사도 UI와 같은 머신을 쓴다. 파일마다 프로젝트를 새로 여는 8병렬 방식 대신 프로젝트 재사용·묶음 처리·제한된 병렬 수를 비교한다. 다른 실행 중 작업을 임의 중단하지 않는다. 저부하 대조 없이 시스템 기여율을 숫자로 선언하지 않는다.
3. **성능 검사를 실제 producer에 연결한다.** production snapshot 또는 production event replay를 주 경로로 사용한다. mutable fixture는 정합성 방어용 별도 시나리오로 유지한다. 고정 snapshot body 벤치만으로 전체 앱 수락을 판단하지 않는다.
4. **긴 응답 계산을 별도 설계한다.** 완료 Markdown block 재사용, 열린 마지막 block 갱신, 폭 변경 시 재계산 범위와 취소·양보 전략을 비교한다. 긴 단일 문단, fence/list/table/reference에 의한 앞부분 재해석을 포함한다. 정확한 스크롤 높이를 유지하려면 계산을 어디서 언제 할지부터 정해야 한다. 추정 높이는 별도 계약 결정이다.
5. **수락은 입력과 진행 중 변경을 함께 측정한다.** ready 상태 입력뿐 아니라 긴 draft streaming 중 입력·스크롤, tool burst, durable append, 첫 표시, 미방문 폭 변경, 과거 위치 유지, 실행 부하 동시 발생을 포함한다. 누락·중복·순서·출력 동등성과 메모리도 함께 검사한다. 기존 32ms body / 50ms input 기준과 실제 terminal 표시 목표를 구별한다.

## 판단의 한계

사용자가 체감 지연을 겪은 정확한 시각을 확보하지 못해 고부하 측정 구간과의 시간적 중첩도 미확인이다.
최근 변경 전체를 고정한 전후 실행 비교는 하지 않았다. 따라서 특정 최근 커밋이나
현재 미커밋 refactor를 회귀의 원인으로 지목하지 않는다. 실행 중 프로세스 revision,
CMux 실제 프레임, 부하 제거 후 재현, provider부터 화면까지의 시간은 미확인이다.
이번 결과는 전체 점검의 진단 산출물이며 수정 완료·사용자 증상 해결 판정이 아니다.
Opus 읽기 전용 문서 감사는 `opus-review.txt`에 보존했다. 도구 없이 문서 논리만 검토했으며
원본 코드/계측을 독립 재실행하지 않았다. 최초 판정 REVISE의 인과 과장, 시각·동시 부하·
harness 범위·별도 materialization 계수·접근 차단 해제 자료 요청을 반영했다.
수정본의 추가 독립 PASS를 받았다는 뜻은 아니다.

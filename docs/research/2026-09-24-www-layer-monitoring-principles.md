# WWW Layer Monitoring 원칙

## 목적

`/monitor`와 `/dashboard`가 장식용 상태판이 아니라, 사용자가 느끼는 지연을 어느 실행 계층에서 만들었는지 추적하는 진단 표면이 되게 한다. 이 문서는 Google SRE의 공식 모니터링 원칙을 WWW의 기존 관측 계약에 맞게 번역한다.

## 외부 기준

Google SRE는 대시보드가 서비스의 핵심 질문에 답하고 Four Golden Signals를 포함해야 한다고 설명한다. 네 신호는 latency, traffic, errors, saturation이다. 또한 사용자에게 보이는 증상과 내부 원인을 분리하고, 사람이 대응해야 하는 알림은 단순하고 실행 가능하며 잡음이 낮아야 한다고 권고한다.

- Google SRE, [Monitoring Distributed Systems](https://sre.google/sre-book/monitoring-distributed-systems/)
- Google SRE Workbook, [Monitoring](https://sre.google/workbook/monitoring/)
- Google Cloud Observability, [Application Monitoring supported infrastructure](https://docs.cloud.google.com/monitoring/docs/application-monitoring-services)

Google SRE Workbook은 latency 평균만으로 꼬리 지연을 숨기지 말고 p50·p95·p99 같은 percentile을 사용할 수 있어야 한다고 설명한다. 데이터 freshness가 낮으면 원인과 결과를 잘못 연결할 수 있으므로 수집 시각과 stale 상태도 측정값의 일부다.

## WWW 원칙

1. **관측값만 표시한다.** 관측되지 않은 값은 `0`, `정상`, `비어 있음`으로 바꾸지 않고 `unobserved`로 유지한다.
2. **Synthetic은 Demo에만 둔다.** 합성 fixture는 `DEMO DATA · synthetic fixtures · not live telemetry`를 표시하고 Live snapshot과 합치지 않는다.
3. **증상과 원인을 분리한다.** 사용자 증상은 end-to-end frame/input latency와 error로, 내부 원인은 계층별 wait/work·queue·cache observation으로 보여준다.
4. **현재값과 추세를 분리한다.** 현재 snapshot만 있을 때 추세·heatmap·증가율을 추정하지 않는다. 시간 bucket source가 있을 때만 추세를 연다.
5. **평균만으로 수락하지 않는다.** count·min/max와 함께 p50·p95·p99를 보존하며, 표본 수가 부족하면 percentile을 미관측으로 표시한다.
6. **시간의 경계를 명시한다.** 모든 표본은 monotonic clock으로 측정하고 `collectedAt`, sample window, sample count, stale 여부를 함께 가진다.
7. **상관관계를 인과로 쓰지 않는다.** 느린 frame과 높은 cache miss가 동시에 보여도 원인으로 단정하지 않고 trace/span 연결이 있을 때만 같은 실행으로 묶는다.
8. **알림은 별도 계약이다.** Dashboard의 경고색은 즉시 paging을 뜻하지 않는다. 외부 알림은 사용자 영향, 지속 시간, 실행 가능한 대응이 모두 정해진 경우에만 연다.

## Golden Signals 번역

| 신호 | WWW 정의 | 최소 표시 |
|---|---|---|
| Latency | 한 실행이 계층에서 기다린 시간과 실제 처리한 시간 | wait/work p50·p95·p99, end-to-end |
| Traffic | 계층을 통과한 event·request·frame 수 | window당 count/rate, dropped/coalesced count |
| Errors | 실패·취소·deadline·불명 종료 | count/rate, 마지막 오류, source link |
| Saturation | 처리 용량에 가까워진 정도 | queue depth, backlog age, frame budget 점유, cache limit은 실제 limit이 있을 때만 |

## 7계층과 두 시간

추천 실행 계층은 다음과 같다.

1. Native Receive
2. Event Queue
3. State Projection
4. Snapshot Publish
5. Render Schedule
6. Layout / Materialize
7. Terminal Write

각 계층은 두 시간을 가진다.

- `waitMs`: 앞 단계가 끝난 뒤 이 계층의 처리가 시작되기까지 기다린 시간
- `workMs`: 이 계층이 실제로 처리한 시간

`totalMs`는 독립 측정값처럼 저장하지 않고 같은 trace의 첫 수신부터 terminal write 완료까지 계산한다. 중첩 실행의 계층 시간을 단순 합산해 end-to-end라고 부르지 않는다.

## 화면 계약

- `/monitor`: 현재 trace 한 건의 7계층 waterfall과 Golden Signals를 보여준다.
- `/dashboard`: 최근 window의 사용자 증상, p95/p99, traffic, error, saturation과 가장 느린 계층을 요약한다.
- `/cache`: 기존 7개 cache slice의 hit/miss/eviction/latency/coverage를 유지한다. 실행 파이프라인 7계층과 같은 것으로 합치지 않는다.
- `/context`: 전체 Native context 점유율과 입력 source의 존재 여부를 분리한다. source별 token allocation이 없으면 비율 bar를 만들지 않는다.

Context의 `[] [] [] [] []` 표현은 전체 context window의 동일 크기 bucket이다. 채워진 bucket은 전체 `usedTokens/contextWindow`만 나타내며, 색으로 SYS·CONV·SKILL 같은 source 비율을 주장하지 않는다. source 목록은 별도 legend에서 `loaded/unobserved` 상태로 표시한다.

## 구현 게이트

- 동일 trace ID 없이 서로 다른 실행의 시간을 합치지 않는다.
- wall clock은 표시 시각에만 쓰고 duration은 monotonic clock으로 잰다.
- hot path의 telemetry 기록은 bounded memory이고 render를 재귀 호출하지 않는다.
- 계측 활성화 전후의 latency overhead를 같은 fixture로 비교한다.
- 표본 누락, duplicate terminal event, clock 역행, queue overflow를 테스트한다.
- 관측되지 않은 계층이 있으면 전체 pipeline을 `complete`로 표시하지 않는다.

## 실행 주체와 모델

### z.ai — 전체 Woo-Readability 리팩터링

- 모델: `glm-5.3`
- 역할: 제품 TypeScript 전체에 `woo-code-readability`의 표형 정렬, `@` alias, 긴 예외 구조 간결화를 파일 단위로 적용한다.
- 실행 방식: z.ai App adapter가 연결된 뒤 파일 목록을 고정하고, 한 파일씩 `inspect → transform → file gate`를 수행한다.
- 금지: 동작 변경, 여러 파일의 무관한 재설계, 검사 결과만 내고 리팩터링 완료로 선언하기.
- 산출물: 파일별 변경 목록, 적용/제외 이유, 검증 명령과 결과. z.ai adapter가 없는 현재 세션에서는 실행됐다고 주장하지 않는다.

### Claude — Cache/Context 읽기 전용 진단

- 모델: `claude-sonnet-4-6`
- 역할: `Unknown`의 발생 경로와 Runtime에만 값이 몰리는 원인을 반대 provider 관점에서 추적한다.
- 권한: 읽기 전용. 코드 수정은 하지 않고, 관측 source·누락된 adapter wiring·거짓 추정 위험을 파일/심볼 근거로 보고한다.
- Codex 후속: Claude의 진단을 대조한 뒤 실제 수정과 통합을 소유한다.
- Opus: 이번 구현자가 아니다. 변경 완료 후 최종 감사가 필요할 때만 `opus` 고정으로 별도 실행한다.

### Figma — Monitoring 정보 구조

- 기준 노드: `06 MONITOR — Layer Performance` (`77:2`)
- 역할: `/monitor`의 현재 trace, `/dashboard`의 최근 window, `/context`의 전체 점유율 cell 표현을 시각 계약으로 고정한다.
- Live 화면은 실제 source가 없는 값을 `NOMINAL`, `0`, 비율로 꾸미지 않는다. 시안 숫자는 반드시 synthetic 또는 reference로 표시한다.

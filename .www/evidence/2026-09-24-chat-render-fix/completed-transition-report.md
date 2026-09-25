# 완료 전환 replay

## 경계와 방법

지정 journal을 한 번 읽고 첫 5,683 records에 고정했다. post-completion prefix digest는 `sha256:d24e21fb746fb042946e53c4791a98367c7214cdf975befe6d557d3ab5e0eff2`이다. 이 prefix의 마지막 completed assistant message는 5,675번째 record이며, 그 record 직전 5,674 records의 digest는 `sha256:c34e12ade7dc8e238824a5f4213eb642564db9c267d03c22c2115e2f5c26fee4`이다.

Pre-completion snapshot은 5,675번째 message와 이후 records를 제외한 activities/chat, `phase=working`, 해당 turn의 `activeTurnId`로 만들었다. 실제 중간 draft 이벤트가 보존되어 있지 않으므로 completed assistant의 최종 280-character body를 draft로 합성했다. Post-completion snapshot은 전체 5,683 records, `phase=ready`, `activeTurnId=null`, 빈 draft를 사용했다. 원문과 ID는 출력하지 않았다.

각 viewport마다 fresh `AstraWorkspace` 5개를 만들었다. 각 workspace에서 pre-completion frame을 두 번 render해 warm 상태를 만든 다음, `transcript.update(postSnapshot)`과 실제 `renderLayoutFrame`을 연속 측정했다. 수치는 5표본의 최솟값/중앙값/최댓값이며 통계적 p95나 acceptance gate가 아니다.

## 결과

| viewport | update min/median/max | layout min/median/max | 합계 wall min/median/max | CPU min/median/max |
|---|---:|---:|---:|---:|
| 150×44 | 0.003 / 0.005 / 0.048ms | 14.61 / 18.92 / 43.41ms | 14.61 / 18.92 / 43.46ms | 19.32 / 27.10 / 40.65ms |
| 80×24 | 0.002 / 0.003 / 0.005ms | 12.35 / 12.96 / 20.79ms | 12.36 / 12.96 / 20.80ms | 13.30 / 14.47 / 21.20ms |

Paired OS load average는 시작 `4.276 / 6.933 / 8.869`, 종료 `4.333 / 6.900 / 8.846`이었다.

5회 합산 cache delta는 다음과 같다.

| viewport | exact count builds / ms | durable graph builds / ms | retained durable blocks | newly counted durable blocks | rendered blocks | requested materialization ms |
|---|---:|---:|---:|---:|---:|---:|
| 150×44 | 5 / 5.27 | 5 / 34.83 | 3,920 | 5 | 35 | 15.40 |
| 80×24 | 5 / 3.32 | 5 / 30.30 | 3,920 | 5 | 25 | 10.23 |

각 fresh workspace의 완료 전환마다 exact count repair와 durable graph build가 한 번 발생했다. 회당 기존 durable block 784개를 재사용하고 새 block 1개를 count했다. 화면 materialization은 wide 회당 7 blocks, compact 회당 5 blocks였다. `transcript.update` 자체는 중앙값 0.005ms 미만이었고 관측 시간은 실제 layout에서 발생했다.

## 판정과 한계

이 합성 경계에서는 완료 전환이 전체 history를 다시 render하지 않았다. durable count는 기존 784 blocks를 유지했고 새 block 1개만 계산했다. 다만 완료 전환은 exact count/graph repair와 새 화면 block materialization을 유발했고, wide 중앙값 18.92ms와 단일 최대 43.46ms를 보였다. 실제 shell input 경로의 scheduler cadence나 terminal write는 포함하지 않았다.

이 harness는 최종 body를 pre-completion draft로 대입했으므로 실제 producer가 마지막 draft와 completion event 사이에서 보인 latency, draft 형태, event 간격을 포착하지 않는다. 표본 5개와 비통제 공유 시스템에서 얻은 기술적 관측이며, 각 비용의 인과 비율이나 사용자 pixel latency를 산출할 수 없다. 이 결과만으로 locale formatting 등 별도 cold-path 수정을 정당화하지 않는다.

## 산출물

- harness: `completed-transition-replay.ts`
- aggregate-only result: `completed-transition-replay.json`
- report: `completed-transition-report.md`

```text
bun .www/scratchpad/2026-09-24-render-fix/completed-transition-replay.ts \
  .www/runtime/activity/native-b5139c9362091450db7344de59dbd4afd12098a2069411ba.jsonl \
  .www/scratchpad/2026-09-24-render-fix/completed-transition-replay.json
```

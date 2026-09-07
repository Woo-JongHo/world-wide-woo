# WOO-714 세션 통계 관측 경계 검증

- Linear ID: `WOO-714`
- Linear UUID: `b7db4486-ed21-413d-8c35-541bfd536fc1`
- Parent: `WOO-677` Stats
- Baseline: `19bad6c00b2dbb4f8c58fd632eb362aae6d31d8d`
- Branch: `woo-714-stats-observations`
- 최초 Opus review receipt UUID: `55b59f28-8278-41f6-b6a6-da46a4f8c6c0`
- 수정 후 Opus 재검토 시도 receipt UUID: `e93091fb-a9a9-491b-b6bb-0ee55a7f3e6b` (`429 session limit`, 판정 없음)
- 검증일: 2026-09-07 (Asia/Seoul)

## 재현과 Opus 교정

구현 전 회귀 fixture는 빈 세션의 완료 승격, 사용량 미관측의 0 평탄화, terminal-only root turn의 `0ms` 평균 오염, request와 root turn 분모 혼용, 부분 journal 내부 event의 active 추정을 재현했다.

첫 구현 뒤 Opus 읽기 전용 검토는 `REVISE`를 판정했다. 자동 fixture에서만 `sessionUsage`를 생략했지만 실제 `ProjectWorkbench.makeSnapshot()`은 `SessionUsageTracker.snapshot()`을 항상 제공하므로 미관측 화면 분기가 실제 앱에서 죽어 있었다. 또한 active 상태가 과거 실패·취소 수를 가렸고, tokens/root turn의 분자가 interactive tokens임을 화면에 쓰지 않았다.

교정 구현은 다음 실제 경로를 추가로 검증한다.

- fresh `ProjectWorkbench`의 tracker 초기 0은 미관측이다.
- fresh Native cumulative usage 0 reading은 interactive 관측 0이다.
- resume의 첫 cumulative reading 500은 baseline일 뿐이며 현재 세션 token으로 더하지 않는다.
- resume의 두 번째 같은 reading은 interactive 관측 0이다.
- detached 0-token invocation도 detached namespace의 관측이다.
- interactive 100과 detached 50을 합친 실제 Workbench snapshot이 Stats에서 총 150과 두 namespace row로 이어진다.

WOO-688의 실제 Native PTY 측정 원본
`/Users/jonghoPro/woo/00_project/99_www-pr-chat-lifecycle/.www/scratchpad/2026-09-07-native-pty-events.jsonl`은 정상 종료와 Escape 중단이 모두 `method=turn/completed`로 오며, 각각 중첩 Native turn status가 `completed`, `interrupted`임을 보였다. 기존 Stats는 method만 읽어 중단을 성공으로 집계했다. 실제 형태의 회귀 fixture는 수정 전에 3건 실패했고, 수정 뒤에는 과거 journal의 `params.turn.status`와 향후 보정된 activity phase를 모두 읽어 interrupted/failed를 completed count와 completed elapsed 평균에서 제외한다.

실제 Native PTY Stats 실행은 의미 집계와 별개의 표시 결함도 찾았다. `.www/evidence/2026-09-07-stats-native-pty-before-layout-fix/05-cancelled-stats-80.txt`에서 상태는 `CANCELLED`, 완료율은 `1/2 = 50%`로 올바르지만 completed·failed·cancelled·active·boundary-only 개별 수는 80열 화면에 보이지 않았다. 집계를 세션 헤더 바로 아래의 독립 줄바꿈 행으로 옮겼으며, component snapshot은 첫 구분선 이전에서 전체 outcome 문장이 40·80·120열 모두 보이고 각 행이 viewport 폭을 넘지 않음을 검증한다. 표시 수정 후 실제 PTY를 다시 실행했고 40·80·120열 outcome 건수와 Esc 중단 집계를 확인했다. 상세 범위와 남은 캡션/스크롤 검증은 `../2026-09-07-stats-native-pty-after-layout-fix/README.md`에 기록했다.

## 수락 대조

| 수락 경계 | 코드·fixture 대조 | 판정 |
|---|---|---|
| empty·active·failed·cancelled·관측상 completed | `SessionReviewState`, domain projection을 입력으로 한 상태별 view fixture | 자동 검증 충족 |
| mixed active/failed/cancelled/completed | `ROOT OUTCOMES`가 각 root turn 수를 동시에 표시 | 자동 검증 충족 |
| fresh·partial coverage | 실제 fresh Workbench와 partial journal header fixture | 자동 검증 충족 |
| 미관측 usage·관측 0 | tracker의 interactive/detached `observationCoverage`, Workbench→Stats 통합 fixture | 자동 검증 충족 |
| resume baseline 비가산 | baseline 500 뒤 total 0·미관측 유지 | 자동 검증 충족 |
| 모델 귀속·미귀속 | namespace row와 unattributed interactive warning/합계 fixture | 자동 검증 충족 |
| 한 request의 여러 root turn·detached call | request 1개, root turn 2개, detached call 3개 fixture | 자동 검증 충족 |
| completion·tokens/root turn·elapsed·first output 분모 | root turn·paired event 관측 수와 화면 분모 fixture | 자동 검증 충족 |
| tokens/root turn 분자 | `interactive tokens ÷ N completed root turns` 문구 | 자동 검증 충족 |
| start/terminal 한쪽만 있는 elapsed | partial terminal-only turn 평균 제외와 `0/1 completed pairs` | 자동 검증 충족 |
| Native `turn/completed`의 실제 outcome | `params.turn.status=interrupted/failed` 및 보정 phase fixture, 완료 평균 제외 | 자동 검증 충족 |
| outcome count의 좁은 화면 가시성 | 첫 구분선 이전 독립 행, 40·80·120열 wrap·폭 snapshot | 자동 검증 충족 |
| 부분 재개 시간 가정 | `local journal start → terminal only` 및 이전 runtime 누락 가능성 공시 | 자동 검증 충족 |
| tool·approval pair | 미짝 terminal 제외, pair 수, 겹칠 수 있는 tool 합산 공시 | 자동 검증 충족 |
| 업무 수락·추정 비용 경계 | `not task acceptance`, `Cost unavailable` assertion | 자동 검증 충족 |

## 검증 기록

첫 Opus 검토 전 실행 결과는 이전 구현의 기록이며 현재 결과로 사용하지 않는다.

```text
pre-review: bun test
624 pass, 0 fail, 4265 expect() calls, 73 files
```

Opus D1·D2·D3와 실제 Native terminal outcome 교정 뒤 새로 실행했다.

```text
$ bun test test/session-stats.test.ts test/session-stats-view.test.ts test/project-workbench.test.ts test/observability-dashboard.test.ts test/workbench-telemetry.test.ts
111 pass
0 fail
955 expect() calls

$ bun run check
$ tsc --noEmit
exit 0

$ bun test
633 pass
0 fail
4502 expect() calls
73 files

$ git diff --check
exit 0
```

코드와 테스트의 대표 선언에는 `@linear WOO-714`만 둔다. Linear UUID와 review receipt UUID는 이 Evidence와 `manifest.json`에서 서로 다른 필드로 보존한다.

실제 Native TUI PTY는 수정 전 실행되어 정상 완료와 Escape 중단의 의미 집계는 확인했고, outcome count 표시 결함을 발견했다. 표시 수정 뒤 실제 PTY에서 40·80·120열 outcome 가시성과 중단 집계를 재확인했다. 나머지 분모 캡션 및 전체 탐색 수락은 아직 남아 있다. 최초 Opus `REVISE`의 D1·D2·D3는 수정했지만 재검토는 `429 session limit`로 끝나 판정이 없다. 따라서 최종 독립 승인과 Stats 전체 수락은 미완료다. 이번 재개에서 전체633 tests/typecheck를 다시 실행한 전문은 logs/에 저장했다.

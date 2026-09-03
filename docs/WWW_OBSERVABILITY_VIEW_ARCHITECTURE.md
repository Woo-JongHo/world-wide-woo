# WWW Observability View Architecture

- 상태: 구조 승인 완료·로컬 구현 검증 중
- 기준일: 2026-09-04
- Epic: `EP-019`
- 입력: [`OBS-20260904-01`](../.www/planning/inputs/OBS-20260904-01.md)

## 책임 계약

| View | Scope | 질문 | 소유 | 제외 |
|---|---|---|---|---|
| Monitor | current runtime / active execution | 지금 무슨 일이 일어나는가? | active request, agent/model/tool, elapsed, approval/wait, retry/failure, recent activity | trend, aggregate usage, 과거 review |
| Stats | one session | 이번 세션은 어떻게 수행됐는가? | purpose/result/status, elapsed/completion, token/model/request 성능, coverage | live stream, 다중 session 비교 |
| Dashboard | observed sessions/projects/range | 전체적으로 어떻게 돌아가는가? | status, aggregate usage, trend, attention, recent sessions | raw activity, request 상세, session narrative |

## 현재 구조 조사

### 1. Stats projection

`src/domain/session-stats.ts`의 `projectSessionStats(snapshot)`이 `WorkbenchSnapshot.activities`, usage, T-note, session goal을 lifecycle/performance/model usage/request/issues/diagnostics로 투영한다. `SessionStatsView`는 projection만 렌더링하고 journal 파일을 직접 읽지 않는다. 현재 scope는 열린 Workbench의 한 session이다.

### 2. Journal source

`ActivityJournalStore`가 `.www/runtime/activity/**/*.jsonl`에 `ProjectActivity`를 append-only로 저장한다. `ProjectWorkbench`는 Native event를 직렬화해 journal에 append하고 immutable `WorkbenchSnapshot`을 subscriber에 publish한다. 현재 로컬 표본은 14개 journal 파일, 15,894 events, 90개 thread ref, 관측 범위 `2026-09-01T00:03:43.148Z`~`2026-09-03T18:33:48.567Z`다. usage event에서 신뢰 가능한 aggregate token을 복원하지 못했으므로 Dashboard mockup에는 token을 `—`로 둔다.

### 3. 새 Dashboard projection 위치

`src/domain/observability-dashboard.ts`에 순수 `projectObservabilityDashboard(session summaries, coverage)`를 둔다. 파일 탐색과 journal read는 `src/infrastructure/observability-history-source.ts`가 담당한다. renderer는 `src/presentation/tui/observability-dashboard-view.ts`이며 Stats renderer를 재사용하지 않는다.

### 4. 새 Monitor projection 위치

`src/domain/runtime-monitor.ts`에 bounded incremental projection과 state machine을 둔다. 입력은 이미 정규화된 `ProjectActivity`와 현재 `WorkbenchSnapshot`이다. renderer는 `src/presentation/tui/runtime-monitor-view.ts`다. 기존 `WorkbenchMonitorView`의 raw snapshot/JSON 표시를 대체하되 `/source` 상세 책임은 유지한다.

### 5. Shared metric contract

`src/domain/observability-metrics.ts`가 공통 이름과 계산만 소유한다.

- elapsed: 관측된 첫 activity와 마지막/현재 시각의 차이
- completion: terminal completed root turns / observed root turns
- tokens: usage source가 귀속한 token 합계만 포함
- tool time: 동일 tool identity의 started→terminal pair 합; 겹침을 aggregate wall time처럼 표현하지 않음
- retry/failure/wait: 정규화된 semantic event count/duration
- coverage: 시작·종료·누락 source를 함께 보존하며 Today/7 days는 source가 그 범위를 실제 지원할 때만 사용

Stats, Dashboard, Monitor는 이 계산 결과를 소비하며 같은 이름을 재정의하지 않는다.

### 6. Navigation state

```text
Workbench base view
  └─ enter ObservabilityWorkspace { returnView, activeView, statsTarget, selectedSession }
       ├─ Stats
       ├─ Dashboard
       └─ Monitor
```

`r`/`R`/`1`/`2`/`3`은 `activeView`만 바꾼다. history push와 journal append는 없다. `Esc`는 `returnView`로 한 번에 돌아간다. `statsTarget`과 `selectedSession`은 sibling 이동 중 보존한다. historical session을 Monitor가 관측할 수 없으면 `NO ACTIVE EXECUTION`을 반환한다.

### 7. Keyboard routing

`workbench-shell.ts`의 TUI key handler에서 overlay, autocomplete, editor focus, approval 입력을 먼저 처리한 뒤 workspace가 keyboard-navigation 상태일 때만 shortcut을 처리한다. 일반 Composer focus에서는 `r/1/2/3`을 Editor에 전달한다. refresh는 event-driven이며 `r`을 사용하지 않는다.

## ASCII architecture

```text
Native runtime ──receipt/event──┐
                               v
                    Activity Journal + Usage
                     canonical observed facts
                               |
                    Event normalization
                               |
             +-----------------+-----------------+
             |                 |                 |
             v                 v                 v
      RuntimeMonitor     SessionStats      Dashboard
       Projection         Projection       Projection
       current/live       one session      aggregate
             |                 |                 |
             +-------- Observability Workspace -+
                      r/R · 1/2/3 · Esc
```

## 현재 데이터 기반 Dashboard mockup

Token과 trend는 현재 historical source에서 신뢰성 있게 복원되지 않아 `—`/unavailable로 표시한다.

### Wide (>=160)

```text
WORLD WIDE WOO · DASHBOARD                     OBSERVED · Sep 1 00:03 — Sep 4 03:33 KST
ACTIVE        COMPLETED        TOKENS        FAILURES
   —              —               —              —
MODEL USAGE                                      HEALTH / TREND
Sol     observed · aggregate tokens unavailable  Completion —  Retry —  Wait —
                                                 Trend unavailable · no reliable buckets
ATTENTION
! Historical terminal state needs normalized session boundaries
RECENT SESSIONS
SESSION       PROJECT       RESULT       MODEL       ELAPSED    TOKENS
native-909…   99_www       observed     Sol              —         —
r next · R prev · 1 Stats · [2 Dashboard] · 3 Monitor · Esc back
```

### Normal (110~159)

```text
WORLD WIDE WOO · DASHBOARD   OBSERVED · Sep 1 — Sep 4
ACTIVE —   COMPLETED —   TOKENS —   FAILURES —
MODEL USAGE
Sol   aggregate tokens unavailable
HEALTH   Completion — · Retry — · Wait —
TREND    unavailable · no reliable buckets
ATTENTION
! Session boundary normalization required
RECENT SESSIONS
SESSION       RESULT      MODEL      TIME    TOKENS
native-909…   observed    Sol           —       —
r/R · 1 Stats · [2 Dashboard] · 3 Monitor · Esc
```

### Narrow (<110)

```text
DASHBOARD · OBSERVED Sep 1 — Sep 4
ACTIVE —        COMPLETED —
TOKENS —        FAILURES —
MODEL  Sol · aggregate unavailable
TREND  unavailable
! Session boundaries need normalization
RECENT
native-909…  observed  Sol  —
r/R · 1 · [2] · 3 · Esc
```

## Monitor state와 normalization

| Journal/native fact | Semantic event | Monitor effect |
|---|---|---|
| request/started | REQUEST | active request와 start time |
| turn/started | MODEL/AGENT | running execution |
| item/tool started | TOOL | current tool + elapsed, percentage 없음 |
| first public output | OUTPUT | first-output marker |
| approval requested/resolved | APPROVAL/WAIT | waiting state와 duration |
| retry observation | RETRY | bounded count와 timeline row |
| terminal failure | FAILURE | failed state와 source ref |
| turn completed/interrupted | completion | completed/idle handoff |

State precedence는 `FAILED > BLOCKED/APPROVAL > RUNNING TOOL > RUNNING AGENT/MODEL > COMPLETED > IDLE`이다. 원인을 모르면 추정하지 않는다. recent event buffer는 12개로 제한하고 snapshot subscription 때만 갱신한다.

## 변경 예정 파일

- 추가: `src/domain/observability-metrics.ts`
- 추가: `src/domain/observability-dashboard.ts`
- 추가: `src/domain/runtime-monitor.ts`
- 추가: `src/infrastructure/observability-history-source.ts`
- 추가: `src/presentation/tui/observability-dashboard-view.ts`
- 추가: `src/presentation/tui/runtime-monitor-view.ts`
- 변경: `src/presentation/tui/workbench-shell.ts`
- 변경: `src/presentation/tui/slash-commands.ts`
- 변경/제거: 기존 `WorkbenchMonitorView`
- 테스트: projection, navigation, keyboard safety, renderer, subscription/performance 파일

## Test plan

1. `/stats → r → Dashboard → r → Monitor → r → Stats`
2. `Stats + Shift+R → Monitor`
3. sibling 회전 후 `Esc` 한 번으로 원래 Workbench view 복귀
4. `1/2/3` direct navigation
5. Composer/검색/편집 focus에서 `r/1/2/3` 문자 입력 보존
6. 회전 전후 journal sequence와 activity count 불변
7. Stats request/session selection 보존
8. historical selection의 Monitor는 `NO ACTIVE EXECUTION`
9. Dashboard aggregate determinism, coverage, unknown token, insufficient trend sample
10. Monitor idle/model/tool/agent/approval/retry/failure/completion/rapid burst
11. recent event buffer 12개 상한과 event-driven redraw
12. wide/normal/narrow width bound 및 한 행 truncate
13. 전체 `bun run check`, `bun test`, `git diff --check`

사용자 승인 후 EP-019 구현을 시작했다. 구현·검증 결과는 `.www/evidence/EP-019-observability-workspace.md`가 소유한다.

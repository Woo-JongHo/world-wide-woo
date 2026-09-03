# EP-019 Observability Workspace Evidence

- 입력: `OBS-20260904-01`
- Architecture: `docs/WWW_OBSERVABILITY_VIEW_ARCHITECTURE.md`
- 상태: 자동 검증 완료·실제 TUI 수동 수락 대기

## 구현

- 공통 metric: elapsed, completion, attributed token
- History source: nested append-only journal discovery, bounded stream/activity retention, partial coverage
- Dashboard projection/view: status, usage, health/trend, attention, recent sessions
- Monitor projection/view: idle/running/waiting/blocked/failed/completed, current execution/tool, bounded 12-event timeline
- Workspace: `/stats`, `/dashboard`, `/monitor`, r/R rotation, 1/2/3 direct, one-Esc return
- Input safety: keyboard-navigation 상태에서만 printable shortcut 소비
- Context: Stats request target 유지, Dashboard recent session 선택과 historical Stats drilldown, 관측 불가능한 historical Monitor는 idle
- Source detail: `/source`와 `/trace`는 Live Monitor와 분리된 Source view 유지

## 실제 local journal

- coverage: partial-local-journal
- observed: `2026-09-01T14:02:02.071Z` — `2026-09-03T18:55:09.320Z`
- streams: 16
- projected sessions: active 5, completed 6, failures 0
- aggregate tokens/model usage: unavailable
- attention: Session boundary normalization required

위 값은 구현 당시 실제 `.www/runtime/activity`를 read-only로 projection한 결과다. 누락 usage는 추정하지 않았다.

## 자동 검증

- `bun run check`
- `bun test`
- `git diff --check`
- 실제 journal을 `ObservabilityHistorySource → projectObservabilityDashboard → ObservabilityDashboardView`로 렌더

- implementation: `b31d59d`
- verification HEAD: `b31d59d`
- `bun run check` PASS
- `bun test` PASS — 608 tests
- `git diff --check` PASS
- Bun bundle PASS — 2,514 modules

## 성능

스크롤 원인·수치·개선은 `scroll-performance-20260904.md`에 분리했다.

# Workbench scroll performance — 2026-09-04

## 사용자 관측

기존 스크롤이 여전히 심하게 버벅인다는 실제 사용 보고를 기준으로 이전의 위치 정확성 테스트만으로 해결됐다는 판단을 철회했다.

## 원인

wheel event 자체가 아니라 `WorkbenchChatView.render()`가 scroll-only frame마다 전체 transcript를 다시 projection한 것이 주 병목이다.

- 전체 activities/messages 재순회
- step마다 `activities.some/find`, message마다 `activities.find`가 중첩되어 장기 session에서 quadratic lookup 발생
- 매 render마다 새 row array를 반환해 `SectionDocument` identity cache가 무효
- working indicator가 80ms timer로 전체 화면 redraw를 계속 요청

TypeScript/Bun 언어 자체가 주 원인이라는 근거는 없다. 동일한 full-document rebuild와 O(messages × activities) lookup은 언어를 바꿔도 남는다. Bun/GC는 상수 비용을 키울 수 있으나 이번 측정에서 먼저 제거해야 할 원인은 projection 구조다.

## 변경

- snapshot·width 기준 complete chat row projection cache
- scroll-only render는 동일 row array를 반환
- activity ID index로 중첩 `find/some` 제거
- 80ms spinner timer 제거; 실제 activity 상태 변화에서만 indicator redraw
- scroll position/follow 계약은 유지

## 수치

환경: Darwin arm64, Apple M1, Bun 1.4.0.
Fixture: assistant message/activity 5,000개, width 100.

- cached scroll-only render: 평균 `0.000490ms/frame`
- 동일 내용을 새 snapshot으로 넣어 complete projection을 다시 만든 비교 경로: 평균 `306.718ms/frame`
- 600 cached frames와 20 rebuilt frames를 동일 프로세스에서 warm state로 측정

비교 경로는 과거 commit을 별도 binary로 실행한 값이 아니라 과거의 핵심 동작인 “frame마다 complete projection rebuild”를 현재 구현에서 강제로 재현한 값이다. 따라서 절대적인 전후 제품 수치가 아니라 cache 경계 효과 측정이다.

## 자동 차단

`test/workbench-views.test.ts`는 5,000-message fixture에서 600회 scroll-only render가 같은 row identity를 반환하고 평균 0.25ms 미만인지 검사한다. streaming 중 scroll follow가 복원되지 않는 기존 회귀도 유지한다.

## 남은 수동 검증

실제 PTY trackpad/wheel의 input-to-terminal-write p95와 5,000-message scaling은 별도 실제 terminal capture가 필요하다. 자동 benchmark는 projection 병목 재발을 차단하지만 terminal compositor 체감까지 증명하지 않는다.

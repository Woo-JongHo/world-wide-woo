# test — 남은 절 순서 후보 3건 (의도적 유지)

`www-test-view.ts`의 내부 helper(`count`, `elapsed`, `symbol`, `statusLabel`, `colorStatus`, `result`, `suiteResult`, `row`)는 모두 `const` 화살표 함수다.
계약 원칙 6(실행 순서 우선)과 스킬 4단계에 따라 `const`는 옮기지 않는다. 이번 작업 차분(`work.diff`)은 가독성 검사기 정렬뿐이다.
`function` 선언으로 바꿔 옮기는 것은 선언 형태를 바꾸는 별도 작업이므로 이번 범위에 넣지 않았다.

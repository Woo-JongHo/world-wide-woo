## 변경

- 실행 사이드바를 PLAN·PROGRESS·TEST 세 영역으로 바꾸고, 별도 STATUS 패널 및 입력창 옆 STATUS 이어붙이기를 제거했다.
- PLAN은 20%, PROGRESS는 40%를 쓰고 TEST는 남은 높이를 사용한다. /monitor 상세 화면의 STATUS는 유지한다.

## 영향

- 계획·진행·검증만 남겨 실행 화면의 정보량을 줄이고 검증 패널에 더 많은 공간을 준다.
- 완료·상태 상세는 기존 /monitor 조회 경로에 남는다.

## 분류

Improvement · Validation

## 검증

- bun run check 통과.
- bun test test/www-ui.test.ts --test-name-pattern 'execution sidebar shows PLAN PROGRESS TEST|detailed monitor retains its STATUS': 2 pass, 0 fail.
- 00_normalize-imports.ts 및 두 변경 TypeScript 파일의 06_align-tables.ts 통과. git diff --check 통과. 실제 TUI 수동 확인은 미실행.

## 연결

- [WOO-700](https://linear.app/woo-world/issue/WOO-700/01-내-입력에-대한-계획이-세워지는-과정-세션-todo)
- [WOO-680](https://linear.app/woo-world/issue/WOO-680/layout-화면-크기가-달라져도-읽던-위치와-입력-흐름을-유지한다)
- [WOO-674](https://linear.app/woo-world/issue/WOO-674/workbench-대화와-계획을-읽고-입력과-상태를-통제한다)
- src/adapters/inbound/tui/shell/www-surface.ts · test/www-ui.test.ts
- .www/evidence/2026-09-29-sidebar-three-panel

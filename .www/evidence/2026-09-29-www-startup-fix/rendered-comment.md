## 변경

- WwwWorkspace 생성 중 wwwBodyHeight가 아직 만들어지지 않은 www.page를 읽어 ReferenceError를 내던 경로를 수정했다. www를 먼저 null로 선언하고 Workspace 생성 후 할당한다.

## 영향

- 초기 화면 조립이 예외로 중단되지 않고 WWW TUI가 첫 화면을 표시한다.

## 분류

Fix · Validation

## 검증

- 수정 전 bun run www:preview는 Cannot access 'www' before initialization으로 종료했다. 수정 후 같은 명령에서 SESSION OVERVIEW 대시보드가 렌더됐다.
- bun test test/www-shell.test.ts --test-name-pattern 'production Www shell routes'는 TDZ 오류를 넘겼으나 이후 INPUT 1 문자열 기대값에서 실패했다. 전체 셸 테스트 통과로 주장하지 않는다.
- bun run check, git diff --check, 00_normalize-imports.ts, 06_align-tables.ts --file src/adapters/inbound/tui/shell/workbench-shell.ts 통과.

## 연결

- [WOO-680](https://linear.app/woo-world/issue/WOO-680/layout-화면-크기가-달라져도-읽던-위치와-입력-흐름을-유지한다)
- [WOO-674](https://linear.app/woo-world/issue/WOO-674/workbench-대화와-계획을-읽고-입력과-상태를-통제한다)
- src/adapters/inbound/tui/shell/workbench-shell.ts
- .www/evidence/2026-09-29-www-startup-fix

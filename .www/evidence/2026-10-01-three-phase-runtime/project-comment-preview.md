## 변경

- 새 요청에 protocol v4를 적용했다. UNDERSTAND에서 Plan 필요 여부·이유를 공개 보고한 뒤, 필요하면 같은 turn의 유효한 Native Plan을 확인해야 WORK로 전환한다.
- RESULT 작성 보고 뒤 REPORTING으로 표시한다. 누락·잘못된 보고는 단계를 추정해 넘기지 않고, 과거 v1~v3 기록은 기존 의미로 재생한다.
- 실제 TUI 검증에서 세 단계가 모두 관측된 뒤 상태줄이 UNDERSTANDING으로 되돌아가는 현상을 찾아 마지막 도달 단계를 유지하도록 수정했다.

## 영향

- 단순 요청은 Plan 불필요 이유를 기록하고, 다단계 요청은 실제 Plan 수신 뒤 WORKING으로 넘어간다. Plan 판단만으로 실행·게시 권한은 생기지 않는다.

## 분류

Feature · Fix · Validation

## 검증

- bun run check, bun test test/architecture.test.ts 17 pass, 집중 Runtime 7개·Native 연결 1개·TUI 2개 테스트 통과, git diff --check 통과.
- 실제 Native TUI에서 단순 요청은 Plan 불필요, 읽기 전용 다단계 요청은 Plan 필요 및 같은 turn Plan Activity를 확인했다. 두 Journal 재생에서 세 Checkpoint가 모두 observed였고 Request는 completed였다.
- 전체 request-runtime 및 project-workbench 테스트에는 각각 9건의 과거 기대값 실패가 남아 있다. Sonnet 검토와 Opus 감사 호출은 Execution error로 미실행이며 Obsidian 정본 개정도 미실행이다.

## 연결

- [WOO-700](https://linear.app/woo-world/issue/WOO-700/01-내-입력에-대한-계획이-세워지는-과정을-세션-todo로-보여준다)
- docs/REQUEST_RUNTIME.md · docs/WWW_EXECUTION_CONSOLE.md
- .www/evidence/2026-10-01-three-phase-runtime/local-verification.md

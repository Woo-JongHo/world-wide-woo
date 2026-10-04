# 3단계 Request Runtime 로컬 검증

- 대상: 기존 WOO-700의 새 protocol v4. 과거 v1~v3 재생 계약은 유지한다.
- 타입 검사: `bun run check` 통과.
- 아키텍처 검사: `bun test test/architecture.test.ts` 17 pass.
- 집중 검증: v4 Runtime 7개, ProjectWorkbench Native 연결 1개, TUI 상태·사이드바 2개 통과.
- `git diff --check` 통과.

## 실제 Native TUI

1. `1+1은?` 요청: Plan 불필요 결정과 이유가 공개 Activity에 기록됐다. Journal 재생 결과 `UNDERSTAND/WORK/RESULT = observed/observed/observed`, Request `completed`.
2. 코드 수정 없는 3부분 분석 요청: Plan 필요 결정과 현재 turn의 Native Plan Activity ID `09b8318c-87b1-4f8a-8cad-d2d563a398e5`가 기록됐다. Journal 재생 결과 세 Checkpoint 모두 `observed`, Request `completed`, 프로토콜 issue 없음. TUI에서 `WORKING` 표시를 확인했다.
3. 두 번째 요청 중 세 Checkpoint가 모두 관측 완료된 뒤 turn 종료 전 상태줄이 `UNDERSTANDING`으로 돌아가는 현상을 발견했다. 도달한 마지막 단계를 유지하도록 수정했고 TUI 상태 단위 테스트로 확인했다. 해당 수정 이후 실제 Native TUI는 재실행하지 않았다.

## 남은 검증 경계

- 전체 `test/request-runtime.test.ts`는 오래된 7단계 렌더 기대값 등 9건 실패, `test/project-workbench.test.ts`는 과거 프로토콜 기대값 등 9건 실패. 전체 테스트 통과 판정은 하지 않는다.
- Claude Sonnet 읽기 전용 검토와 Opus 감사 호출은 결과 대신 `Execution error`를 반환했다. 독립 검토 완료로 기록하지 않는다.
- Obsidian 앱은 로딩 화면에 머물렀지만, 등록된 Vault 경로에서 구형 WOO-700 원문을 읽었다. 기존 WOO-700 schema v2 draft identity를 유지한 개정 Candidate를 준비하고 artifact 검증·렌더를 통과했다. 구형 원문에서 schema v2 target으로의 이관과 Vault 게이트, 게시 승인은 남아 있다.

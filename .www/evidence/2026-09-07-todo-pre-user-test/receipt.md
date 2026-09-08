# Todo 사용자 테스트 직전 1차 개발 근거

- 작업 worktree: `/Users/jonghoPro/woo/00_project/99_www-todo-pre-user-test`
- branch: `woo-todo-pre-user-test`
- 기준: `17832cd93a8c6d6952322b07a8789cc14d35d254` (`woo-702-session-todo`)
- 관련 Linear: WOO-682, WOO-700, WOO-701, WOO-702, WOO-703
- 판정: 자동 검증과 실제 TTY 기동 통과. 최종 사용자 수락은 실사용 테스트로 남긴다.

## 구현 관측

1. 빈 Todo는 `0/0 완료`로 표시하지 않고, 유휴 상태의 `현재 계획 없음`과 실행 중 `공개 계획을 기다리는 중`을 구분한다.
2. 저장된 root model/run 참조와 현재 Plan에 결속된 복수 agent의 model, agent ID, task, 상태를 Todo 항목 아래에 표시한다. 결속되지 않은 공개 실행은 추측하지 않고 `실행 연결 미확정`으로 안내한다.
3. 42열 미만에서는 현재 항목을 우선하면서 숨긴 항목 수를 표시한다.
4. Todo 저장 상태를 `동기화 중 / 저장 확인 / 저장 보류`로 표시한다. 저장 실패 중에도 Chat의 active turn과 사용자 메시지는 유지되고 다음 Plan 관측에서 자동 복구한다.

## 검증 시나리오

### Todo 계획·실행·저장 회귀

- invocation: `bun test test/workspace-todo-view.test.ts test/project-workbench.test.ts test/todo-ledger.test.ts test/todo-store.test.ts test/native-plan-wiring.test.ts`
- binary observable: `121 pass`, `0 fail`, `642 expect() calls`
- 포함 시나리오: 빈 계획/계획 대기, 30·40·70·120열, root와 병렬 agent 2개, 저장 실패 중 Chat 유지, 다음 Plan 갱신 후 저장 확인, 실제 임시 Todo.md CAS/round-trip, root Native Plan 배선
- artifact: `targeted-tests.log`
- sha256: `1a0e1cb703ca20473e9e8a9ea880fd5f409f085a89ba53fa123fb8162d407b7e`

### 타입 검사

- invocation: `bun run check`
- binary observable: `tsc --noEmit`, exit 0
- artifact: `typecheck.log`
- sha256: `1a77b41ad5010c7b374d8b3c09048f2a99eddb715afe238f144b44a8537287e4`

### 실제 컴파일 바이너리 TTY 기동

- build: `bun build src/cli.ts --compile --outfile dist/www-todo-pre-user-test`
- invocation: `script -q .www/evidence/2026-09-07-todo-pre-user-test/native-tty.log dist/www-todo-pre-user-test`, 이후 `/exit`
- binary observable: Workbench가 실제 alternate-screen TUI로 열리고 Todo 패널에 `TODO · 현재 계획 없음`을 표시한 뒤 `Workbench를 안전하게 종료하는 중…`을 거쳐 exit 0
- binary version: `0.1.11`
- binary sha256: `835c96f411046d9fa9a8761a96c28b5c406a0964a55ffd2dbd966bc8367343c6`
- artifact: `native-tty.log`
- artifact sha256: `44f3d484b9298621eafb8ea6053ea51c719bf51bd43787d34519cf0d2b99df6b`

## 독립 검토 상태

- invocation: Claude CLI `sonnet`, read-only plan permission
- observable: `You've hit your session limit · resets 6:20pm (Asia/Seoul)`, exit 1
- 판정: AGENTS.md가 요구하는 Sonnet 독립 검토는 provider 한도로 미실행 blocker다. 하위 모델로 대체하지 않았으며 상위 통합의 Opus 감사 대상에 포함해야 한다.

## 남은 사용자 수락

- 실제 사용자 Input에서 provider가 Plan을 발행할 때 Todo.md 생성과 화면 갱신을 눈으로 확인한다.
- 실제 복수 모델/agent 병렬 실행에서 Plan 결속과 미결속 안내가 의도대로 읽히는지 확인한다.
- 실제 좁은 터미널에서 숨김 안내와 Todo 영역의 스크롤 사용성을 확인한다.
- 실제 파일 충돌/권한 실패를 만들었을 때 안내 문구와 다음 Plan 관측 복구가 이해되는지 확인한다.

commit, push, PR, merge, Linear/Obsidian 쓰기는 수행하지 않았다.

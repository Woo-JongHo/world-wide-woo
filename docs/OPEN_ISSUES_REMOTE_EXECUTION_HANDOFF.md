# WWW 열린 이슈 원격 실행 인계

기준 시각: 2026-09-02 06:10 KST
저장소: `Woo-JongHo/world-wide-woo`
기준 HEAD: `8ba8ba837c8c9e2777c0f3bce0c0168e590382e8`

## 실행 목표

GitHub 열린 이슈 #2, #4, #5, #6, #7, #8, #9, #10을 현재 로컬 worktree 위에서 모두 해결한다. 각 이슈는 구현, 회귀 테스트, 실제 사용자 표면 검증, 이슈별 증거를 갖춰야 한다. 마지막에 원격 결과를 원래 `99_www` worktree로 되가져와 전체 검증하고 GitHub 이슈 상태를 실제 결과와 일치시킨다.

## 보존해야 할 현재 기준

- 현재 worktree에는 이전 Ultragoal 결과가 커밋되지 않은 채 존재한다. 원격 작업은 `origin/main`에서 새로 시작하면 안 되고 현재 worktree 스냅샷을 받아야 한다.
- 기존 사용자 변경을 reset, stash, checkout, clean, delete 하지 않는다.
- `.gjc`, `.www/runtime`, `.www/sessions`, credential 파일은 전송하거나 수정하지 않는다.
- 현재 검증 기준: `bun run check` 통과, `bun test` 419 pass / 0 fail / 2167 assertions.
- 기존 PTY 증거: `.www/evidence/ultragoal-g008-tui.ansi`.
- 기존 독립 차단: ST-011-13 Windows Terminal·release operator 수동 증거. 이번 GitHub 이슈와 혼합하거나 자동 통과시키지 않는다.

## 원격 작업 공간 계약

권장 원격 경로:

```text
~/gjc-worktrees/world-wide-woo-open-issues
```

로컬에서 원격으로 기준 스냅샷을 보낼 때 포함:

- 추적 소스와 테스트
- 현재 untracked 제품 소스와 테스트
- `docs/`, `decisions/`, `scripts/`, `spikes/`
- `package.json`, `bun.lock`, `tsconfig.json`, `AGENTS.md`, `CONTEXT.md`, `CHANGELOG.md`

제외:

```text
.git/
.gjc/
node_modules/
.www/runtime/
.www/sessions/
.www/drafts/
.www/scratchpad/
.www/vault/
.www/evidence/*.ansi
.env*
```

원격 결과 회수는 전체 디렉터리 덮어쓰기가 아니라, 원격 기준 스냅샷과 최종 상태 사이의 diff 및 새 파일 목록을 먼저 검토한 뒤 적용한다. 로컬에서 동시에 바뀐 파일은 자동 덮어쓰지 않고 3-way로 조정한다.

## 실행 순서와 의존성

공통 상태를 공유하므로 이슈 번호순으로 병렬화하지 않는다.

1. #10 세션 lease 식별 — 다중 Workbench의 기반
2. #7 첫 요청 즉시 피드백 — turn 시작 상태 모델
3. #9 승인 대기/대기열 상태 — #7 상태 모델 위에서 구현
4. #8 Native subagent 관찰 — Chat 활동 읽기 모델 확장
5. #5 Step 카드 반복 라벨 제거 — #8과 같은 카드 표면을 정리
6. #6 T-notes 역할 고정 — 완료 기록과 실시간 상태 분리
7. #4 Dashboard/Monitor 분리 — 위 상태 소스를 별도 화면으로 구성
8. #2 WES Context Composer — Display/Context 정책을 마지막에 명시적 경계로 연결

# Ultragoal brief

공통 제약:

- 각 이슈 본문과 실제 코드에서 재현 조건을 먼저 확인한다.
- 제품 동작을 바꾸는 각 목표는 실패하는 회귀 테스트를 먼저 확보한다.
- 직접 관련된 소스, 테스트, CLI/TUI 도움말 및 문서만 갱신한다.
- 기존 SessionGoal, 질문별 T-note, Todo what/why, usage separation, native PTY 계약을 회귀시키지 않는다.
- 이슈별 완료 후 focused test를 실행하고, 최종 경계에서 `bun run check`, `bun test`, 실제 PTY/TUI 캡처를 수행한다.
- 이슈 종료는 테스트 통과만으로 하지 않는다. GitHub 이슈의 재현 절차가 실제로 해결됐다는 증거를 남긴 뒤 닫는다.

@goal: #10 같은 프로젝트에서 여러 Workbench 실행
동일 프로젝트의 각 새 `www` 실행이 고유한 로컬 session/lease identity를 사용하도록 수정한다. `--resume`은 지정한 native thread를 재개하되 다른 새 Workbench와 충돌하지 않아야 한다. 같은 프로젝트에서 첫 Workbench가 활성인 동안 두 번째 Workbench가 1초 안에 lease 오류로 종료되지 않는 통합 테스트와 프로세스 수명주기 정리 테스트를 추가한다. stale lease와 정상 close 후 재실행도 검증한다.

@goal: #7 첫 요청 즉시 피드백
사용자가 첫 메시지를 전송한 직후, native thread/start 또는 첫 assistant delta를 기다리지 않고 접수된 사용자 메시지와 명확한 준비/접수 상태를 렌더링한다. 실패·불확실 전송·재시도 시 거짓 진행 상태를 남기지 않는다. 첫 화면 변화의 동기 경계와 turn 이벤트 이후 전이를 테스트하고 실제 PTY에서 확인한다.

@goal: #9 승인 대기 상태와 메시지 대기열 표현
승인 요청 동안 현재 turn이 일시중지됐음을 spinner와 구분해 표시한다. 백그라운드 작업 여부, 승인 전에는 전송되지 않는 queued message 수와 전달 조건을 한 화면에서 설명한다. approve/decline/cancel 이후 상태와 큐 drain을 검증하고 Manual permission PTY 시나리오를 남긴다.

@goal: #8 Native subagent 관찰 흐름
`collabAgentToolCall`과 `subAgentActivity`를 Codex native event의 읽기 모델로 정제한다. 위임 작업, agent 상태, 모델, reasoning effort, 하위 활동, IRC 메시지를 한 Chat 흐름에 중복 없이 보여준다. WWW 자체 모델 선택/오케스트레이션 정책은 만들지 않는다. 순서 뒤바뀜, lifecycle 갱신 중복, 실패/취소, 좁은 폭을 테스트한다.

@goal: #5 Step 카드 반복 라벨 제거
Step 카드에서 반복되는 `무엇을 하고 있는지` 라벨을 제거하고 해석된 작업 문장을 바로 표시한다. Step 번호, 상태, why, 명령, 출력, omission semantics는 보존한다. running/completed/failed 및 좁은 폭 스냅샷을 갱신한다.

@goal: #6 T-notes를 완료된 질문 기록으로 고정
T-notes pane이 작업 중 목표·진행률·현재 Step을 표시하지 않고 완료된 질문의 `질문/왜/결과` 기록만 보여주도록 보장한다. 실시간 현재/다음 작업은 Todo와 Chat/Step에만 둔다. active turn, completed turn, failed detached generation, resume/reconcile를 검증한다.

@goal: #4 프로젝트 Dashboard와 실행 Monitor 분리
`/dashboard`는 프로젝트 요약과 작업 진입을, `/monitor`는 session/turn/tool/subagent 실행 관찰을 각각 다른 화면과 읽기 모델로 제공한다. 화면 이동 중 active Chat, streaming, composer draft, Todo, pending approval이 유지돼야 한다. command routing, overlay lifecycle, 상태 보존, 좁은 폭을 테스트한다.

@goal: #2 WES Context Composer 경계 연결
Display Policy와 모델 Context Policy를 별도 application/domain 경계로 만든다. context source, repository identity, revision, inclusion/exclusion reason, byte/token budget을 추적 가능하게 한다. 화면 접힘/생략이 모델 context 제외와 같은 의미가 되지 않도록 한다. WES는 명시적 opt-in을 유지하고 기본 Chat에 BLOCKED 정책이나 외부 runner 출력을 주입하지 않는다. deterministic composer unit/integration test와 provenance 표시를 추가한다.

## 이슈별 완료 증거

각 이슈에 다음을 남긴다.

```text
Issue: #N
Root cause:
Changed files:
Focused commands:
Observed result:
PTY/E2E artifact:
Regression risks checked:
GitHub action: comment/close, or reason left open
```

## 최종 경계

1. `git diff --check`
2. `bun run check`
3. `bun test`
4. 동일 프로젝트에서 Workbench 2개 동시 실행 시나리오
5. 첫 요청 즉시 접수 상태 PTY
6. Manual approval pause + queued messages PTY
7. Native subagent lifecycle 렌더링
8. `/dashboard`와 `/monitor` 상태 보존 이동
9. WES opt-in/off 기본 경계
10. 원격 최종 diff를 로컬 최신 worktree와 비교하고 충돌 없이 적용
11. 로컬에서 1~9를 다시 검증
12. 증거가 있는 이슈만 GitHub에 결과를 댓글로 남기고 닫기

## 원격 GJC 시작 명령

원격 스냅샷을 만든 뒤 repository root에서:

```sh
gjc ultragoal create-goals --brief-file docs/OPEN_ISSUES_REMOTE_EXECUTION_HANDOFF.md
gjc ultragoal complete-goals
```

Ultragoal worker는 `.gjc` goal/checkpoint를 직접 소유하지 않는다. leader가 이슈별 증거를 받아 checkpoint하고 마지막 경계 검증 및 GitHub 상태 동기화를 담당한다.

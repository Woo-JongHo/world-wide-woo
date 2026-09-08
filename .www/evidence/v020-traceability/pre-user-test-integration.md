# Chat · Todo · Tracer 사용자 테스트 전 통합 증거

작성일: 2026-09-07  
통합 정본: `/Users/jonghoPro/woo/00_project/99_www`  
최종 바이너리: `/Users/jonghoPro/woo/00_project/99_www/dist/www-pre-user-test`

## 판정

v0.2 HUD/traceability 위에 Chat lifecycle, Todo Native Plan 동기화, Tracer activity identity를 의미 병합하고 결과를 main working tree에 회수했다. main에 먼저 존재하던 Development observer/CLI, observability, stats, delegation, work domain 분할 변경은 유지했다. 제품 집중 테스트, TypeScript 검사, conflict/diff 검사와 arm64 compile은 통과했다.

traceability 명령은 동결된 17-file repo export manifest에 대해서는 PASS다. 그러나 이번에 실제 Vault에 작성·보강한 상세 노트 21개와 인덱스 1개는 repo export/control ledger로 아직 동기화하지 않았다. 실제 Vault에는 대상 네 폴더 기준 Markdown 37개가 있고, frozen manifest는 17개이며 WOO-678의 현재 실제 파일 SHA도 manifest와 다르다. 따라서 **actual Vault까지 포함한 최신 traceability 전체 동기화 PASS는 주장하지 않는다.**

## 통합과 main 회수

- 입력: v020/HUD working tree, Chat HEAD `238c563`, Todo 6-file 추가 diff, Tracer 2-file 추가 diff.
- 방법: 공통 base `19bad6c` 기준 3-way 병합 후 충돌 파일을 의미 병합했다. `workbench-shell`, workbench views, `project-workbench`, work domain의 Chat/Todo/Tracer/HUD 계약을 함께 유지했다.
- main의 통합 전 tracked diff는 `main-before-unified.patch`, 상태는 `main-before-unified-status.log`에 보존했다.
- main 고유 변경 가운데 `app.ts`, usage service, Development/observability/stats/delegation views와 tests, architecture docs, `src/domain/work/*` 모듈 분할을 유지했다.
- observable: 최종 conflict marker 0, `git diff --check` exit 0.
- artifacts: `main-final-conflict-markers.log`, `main-final-diff-check.log`, `main-final-status.log`, `main-before-unified.patch`.

## 제품 시나리오 검증

### Chat · Todo · Tracer · Work view 집중 세트

Invocation:

```sh
bun test \
  test/chat-render-acceptance.test.ts \
  test/chat-scroll-acceptance.test.ts \
  test/workbench-views.test.ts \
  test/workspace-todo-view.test.ts \
  test/trace-selection.test.ts \
  test/workbench-shell-policy.test.ts \
  test/work-flow.test.ts \
  test/native-plan-wiring.test.ts
```

Observable: `144 pass`, `0 fail`, `1337 expect()`.

핵심 확인 범위:

- Chat: 완료 render, scroll/focus 경계, root thread identity와 optimistic request 중복 방지.
- Todo: Native Plan activity 반영, revision-bound sync, blocked 뒤 복구, Markdown/native plan 상태 해석.
- Tracer: turn 사이에서 item id가 재사용돼도 exact `activityId`로 선택하고 공개 가능한 source만 표시.
- HUD/View: v0.2 한 줄 HUD와 Chat/Todo/Tracer live context 결합.

Artifact: `main-final-feature-tests.log`.

### ProjectWorkbench 교차 기능

Invocation:

```sh
bun test test/project-workbench.test.ts \
  -t 'mirrors Native plan activity|keeps Chat usable while Todo sync is blocked|preserves rewritten root-plan identity|shows the first optimistic request once|isolates root chat identity|selects Trace by exact activity'
```

Observable: 아래 실제 6개 시나리오가 `6 pass`, `0 fail`.

1. Native plan activity를 실시간 Chat을 늦추지 않고 Todo로 반영한다.
2. Todo sync가 blocked여도 Chat을 유지하고 다음 sync에서 warning을 지운다.
3. 다시 작성된 root plan identity를 Todo sync/resume 뒤에도 유지한다.
4. journaling 중 optimistic request를 한 번만 보인다.
5. child thread 및 turn 간 반복 item id에서 root chat identity를 격리한다.
6. turn 간 반복 item id에서도 Trace를 exact activity로 선택한다.

Artifact: `main-final-project-focus.log`.

### Traceability 단위 계약

Invocation:

```sh
bun test test/development-traceability.test.ts test/development-store.test.ts test/work-traceability.test.ts test/linear-contract-v2.test.ts test/code-id.test.ts
```

Observable: `28 pass`, `0 fail`, `434 expect()`.

Artifact: `main-final-traceability-unit-tests.log`.

## 정적 검사와 생성물

### TypeScript

Invocation: `bun run check`  
Observable: `tsc --noEmit`, exit 0.  
Artifact: `main-final-typecheck.log`.

### Development Map과 동결 manifest gate

Invocations:

```sh
bun run development-map:build
bun run traceability:check
```

Observables:

- Map: `Development Map generated: 17 issues`.
- frozen manifest gate: `Traceability OK: 10 Units, 17 issues, 17 notes, 110 edges`, exit 0.
- actual Vault direct comparison: 37 scoped Markdown files, manifest 17 files, newly detailed records 21 + index 1, WOO-678 SHA drift.

Artifacts: `main-final-development-map-build.log`, `main-final-traceability-gate.log`, `main-final-actual-vault-drift.log`, `.www/scratchpad/2026-09-07-obsidian-detailed-records.md`.

## 최종 바이너리

Invocation:

```sh
bun build --compile --target=bun-darwin-arm64 src/cli.ts --outfile dist/www-pre-user-test
file dist/www-pre-user-test
./dist/www-pre-user-test --version
shasum -a 256 dist/www-pre-user-test
```

Observables:

- compile exit 0: `bundle 2556 modules`, `compile dist/www-pre-user-test`.
- file: `Mach-O 64-bit executable arm64`.
- version: `0.0.15`.
- SHA-256: `3cb25e2580309c96f8b77d6b03de38e2feea0213717729fee64e0c70371645e0`.

Artifacts: `main-final-compile.log`, `main-final-binary-file.log`, `main-final-version.log`, `main-final-binary-sha256.log`.

## 작업 경계

- commit, push, PR, Linear mutation은 수행하지 않았다.
- 제품 전체 suite를 반복 실행하지 않고 각 기능의 핵심 집중 세트와 결합 시나리오만 실행했다.
- Test2 터미널에서의 사람 대상 실행은 최종 바이너리와 이 receipt를 넘긴 뒤 상위 실행 단계가 수행한다.

## Test2 Native Plan 무이벤트 blocker 후속 수정

Test2 실제 실행에서 공개 번호형 계획 뒤에도 Native `turn/plan/updated`가 0건인 경로를 확인했다. plan mode 성공 turn의 공개 완료 assistant plan만 사용하는 bounded fallback, 같은-turn 활동의 소급 association, 다음 manual turn carry를 추가했다. structured plan 우선과 일반 답변·불연속 목록·실패·중단 차단을 검증했다.

- wiring: `7 pass`, `0 fail`.
- domain regression: `48 pass`, `0 fail`.
- ProjectWorkbench regression: `4 pass`, `0 fail`.
- TypeScript, conflict marker, diff check: PASS.
- 갱신 바이너리 SHA-256: `c6a53deaf9bfacbc32d7076838234c95909318fbe9802d9694cdbc1368a80bf3`.
- 상세 증거: `.www/evidence/v020-traceability/public-plan-fallback.md`.

## Test2 compiled OAuth import blocker 후속 수정

T-note 생성 시 `pi-ai` OAuth flow의 variable dynamic import가 Bun standalone filesystem에서 누락되는 문제를 재현했다. 패키지가 제공하는 `registerBunOAuthFlows()`를 model registry에 정적으로 등록했다. source와 arm64 compiled smoke에서 OAuth derivation 및 T-note provider API module load가 통과했다.

- focused source tests: `7 pass`, `0 fail`.
- TypeScript와 diff check: PASS.
- 최종 바이너리 SHA-256: `c9ec34d640865b99a7db55e5942e994b55586f98027d85cc5ad1a2a9611f54d9`.
- 상세 증거: `.www/evidence/v020-traceability/compiled-oauth-import-fix.md`.

## Test2 주간-only HUD 회귀 복원

하단 HUD를 주간 잔여량 한 행으로 복원했다. 정확 렌더 smoke는 `Codex 80% · 7d | Claude 84% · 7d | Gemini —`, 집중 테스트는 `31 pass`, 타입·diff·marker 검사는 PASS다. 갱신한 arm64 바이너리 버전은 `0.0.15`, SHA-256은 `2586e1b66530b0ff81aa965dbe28eaf78d8d7cea42610e885e4d554d2be1c829`이다. 상세 증거는 `.www/evidence/v020-traceability/hud-weekly-only-fix.md`에 있다.

## Plan 본문 미수신 goal fallback

정상 완료된 Plan turn이 structured/public-numbered plan 없이 실제 work만 남길 때 공개 사용자 요청을 Todo title로, `계획 본문 미수신`을 단일 pending 항목으로 투영한다. 같은 turn의 관측 activity만 연결하며 exact Trace 선택을 검증했다. manual, failed, no-work turn은 생성하지 않고 structured/public-numbered plan이 우선한다. 집중 테스트 `11 pass`, TypeScript/diff/marker PASS. 최종 arm64 바이너리 v0.0.15 SHA-256은 `a2b716a4336067582523b9c1c5db4009d8c4e5d69a83bb70707e2d53dae8ed7d`다. 상세 증거: `.www/evidence/v020-traceability/missing-plan-goal-fix.md`.

## Test2 Native 번호 heading Plan 투영 수정

실제 journal에는 plan 본문이 없었던 것이 아니라 status 표식 없는 `## 1`~`## 3` Native plan 본문이 있었다. 이를 명시적 3단계로 투영하고, plan보다 앞선 같은-turn Bash를 첫 running 단계에 연결했다. 실제 이벤트 순서 회귀는 수정 전 실패, 수정 후 `1 pass`; 전체 집중 검증은 `35 pass`, TypeScript/diff/marker PASS다. 최종 arm64 v0.0.15 SHA-256은 `425c152ff5ee3992854e61240c6781ef7322760fbe853b19be2bd956eb56495d`다. 상세 증거: `.www/evidence/v020-traceability/test2-native-heading-plan-fix.md`.

## Test2 plan-heading 아래 번호 목록 투영

Native `type: plan`의 `## 3단계` 아래 연속 1~3 번호 목록을 정식 step으로 수용하고, 뒤의 검증/전제 구역을 제외했다. 2~12개만 허용하며 한 항목·불연속·13개를 거부한다. 실제 순서 regression은 수정 전 실패, 수정 후 통과했고 집중 검증은 `41 pass`, TypeScript/diff/marker PASS다. 최종 arm64 v0.0.15 SHA-256은 `9b926b181846e8ac9ef494de4a8a1697a882906b2cb6f608a8d4fd12e9992828`이다. 상세 증거: `.www/evidence/v020-traceability/test2-numbered-list-plan-fix.md`.

## Test2 top-level 번호형 Native Plan 투영

Native `type: plan` 자체를 권위 경계로 사용해 H1 제목 직후의 연속 2~12 top-level 번호 목록도 정식 step으로 수용한다. 들여쓴 bullet은 상세로 제외하고 굵은 표식을 제거한다. 실제 seq46→47/48 Bash→53/54 plan→58 turn 순서 regression은 수정 전 실패, 수정 후 Todo 3개와 Bash Trace association으로 통과했다. 최신 journal 전체 직접 replay도 3단계, seq48 Bash association true, rejection 0을 확인했다. 일반 assistant 번호 목록의 strict fallback은 그대로 유지했다. 집중 검증은 `43 pass`, TypeScript/diff/marker PASS다. 최종 arm64 v0.0.15 SHA-256은 `438f85fb74201e5f3a6cb6bef5a9434917d7c1472489a192b6714c3fc45d143f`이다. 상세 증거: `.www/evidence/v020-traceability/test2-top-level-numbered-plan-fix.md`.

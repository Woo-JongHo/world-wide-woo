# Plan 본문 미수신 goal fallback 증거

- 날짜: 2026-09-07
- 범위: 실제 Plan mode에서 structured plan과 번호형 public final이 모두 없고 같은 turn에 관측된 work가 있는 경우
- 최종 바이너리: `/Users/jonghoPro/woo/00_project/99_www/dist/www-pre-user-test`

## 문제와 수정

정상 완료된 Plan turn이 tool/activity만 남기고 계획 본문을 보내지 않으면 Todo가 `현재 계획 없음`으로 사라지고 Tracer association을 만들 수 없었다.

`ProjectWorkbench`의 terminal checkpoint에 다음 경계를 추가했다.

- 해당 turn의 collaboration mode가 `plan`이다.
- `turn/completed` 상태가 정상 완료다.
- 같은 thread/turn에 structured Native plan과 안전하게 파싱된 공개 번호형 plan이 모두 없다.
- 같은 turn에 분류 가능한 action 또는 observation이 하나 이상 있다.
- 공개 사용자 요청을 같은 request identity로 찾을 수 있다.

이 조건에서만 `public-user-request` 출처의 단일 synthetic plan revision을 남긴다. Todo 제목은 공개 사용자 요청이며 단일 항목은 `계획 본문 미수신`, 상태는 `pending`이다. 작업 단계는 추론하지 않으며 hidden reasoning을 읽거나 저장하지 않는다. synthetic revision 이전에 같은 turn에서 실제 관측된 work만 해당 항목에 association한다.

structured plan 또는 공개 번호형 plan이 있으면 기존 경로가 먼저 선택된다. 새 fallback은 다음 manual turn으로 carry하지 않는다.

변경 파일:

- `src/application/project-workbench.ts`
- `src/domain/work/workflow-projection.ts`
- `test/native-plan-wiring.test.ts`

기존 공개 번호형 fallback, OAuth 정적 provider 등록, 주간-only HUD 변경은 유지했다. commit, push, PR, Linear mutation은 수행하지 않았다.

## 집중 실행 시나리오

Invocation:

```sh
bun test test/native-plan-wiring.test.ts
```

Positive observable:

- Plan mode에서 공개 사용자 요청 `현재 구조를 점검해줘`를 보낸다.
- Native는 `rg --files src` command activity만 보내고 turn을 정상 완료한다.
- Todo title은 사용자 요청, 단일 항목은 `계획 본문 미수신`/`pending`이다.
- Todo native source에 model `codex`, runId `turn-plan`이 남는다.
- 같은 turn의 실제 command activity가 fallback 항목의 observation association에 포함된다.
- 그 exact activity ID를 `trace.select`에 전달하면 `selected`, `planAssociation: inferred`를 반환한다. 이는 TUI의 exact `/trace <activity-id>` 경로와 같은 application command다.

Priority/negative observables:

- structured Native plan과 공개 번호형 plan은 기존 authoritative 경로를 유지한다.
- manual mode + work, failed Plan turn + work, 정상 Plan turn + work 없음은 `public-user-request` fallback과 Todo 문서를 만들지 않는다.
- 일반 목록, 불연속 번호, 실패/중단 공개 plan 차단도 계속 통과한다.

Test result: `11 pass`, `0 fail`, `89 expect() calls`.

Artifact: `missing-plan-goal-tests.log`.

## 정적 검사

Invocations and observables:

- `bun run check` → `tsc --noEmit`, exit 0.
- `git diff --check` → `PASS`, exit 0.
- 변경 파일의 `[DEBUG-]`, conflict marker, `test.skip`/`test.only`, `TODO` scan → 일치 0.

Artifacts: `missing-plan-goal-typecheck.log`, `missing-plan-goal-diff-check.log`, `missing-plan-goal-marker-scan.log`.

## arm64 compiled 바이너리

Invocation:

```sh
bun build --compile --target=bun-darwin-arm64 src/cli.ts --outfile dist/www-pre-user-test
file dist/www-pre-user-test
./dist/www-pre-user-test --version
shasum -a 256 dist/www-pre-user-test
```

Observables:

- compile: `bundle 2722 modules`, `compile dist/www-pre-user-test`, exit 0.
- file: `Mach-O 64-bit executable arm64`.
- version: `0.0.15`.
- SHA-256: `a2b716a4336067582523b9c1c5db4009d8c4e5d69a83bb70707e2d53dae8ed7d`.

Artifacts: `missing-plan-goal-compile.log`, `missing-plan-goal-binary-file.log`, `missing-plan-goal-version.log`, `missing-plan-goal-sha256.log`.

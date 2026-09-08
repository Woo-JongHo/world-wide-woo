# Test2 public Plan fallback blocker 수정 증거

작성일: 2026-09-07

## 실제 증상

Test2에서 `/mode plan` 뒤 명시적인 3단계 계획 요청을 보냈다. 공개 assistant 응답은 `3단계 Plan입니다.`와 연속된 `1.`, `2.`, `3.` 계획을 포함했고 그 뒤 읽기 전용 Bash 활동과 최종 답변이 이어졌지만, Native `turn/plan/updated`는 0건이었다. 결과는 `TODO · 현재 계획 없음`이었다.

Artifact: `.www/evidence/2026-09-07-test2/plan-without-native-event.txt`.

## 수정

- plan mode로 시작된 turn의 collaboration mode를 turn identity에 결속한다.
- 정상 완료된 root turn에 structured Native plan이 하나도 없을 때만 공개 완료 assistant 본문에서 번호형 plan block을 추출한다.
- 요청 또는 plan 서문에 plan 의도가 있고, 번호가 1부터 연속되며 2~12단계인 경우에만 `turn/plan/public-fallback` projection을 journal에 남긴다.
- 목록 뒤 공개 prose는 plan block 밖으로 두고 저장하지 않는다. reasoning 및 비공개 envelope는 입력으로 사용하지 않는다.
- structured Native plan은 항상 우선하며, 일반 번호 목록, 불연속 번호, 실패·중단 turn은 fallback을 만들지 않는다.
- turn 완료 때 fallback을 확정하면서 공개 plan 메시지 이후 같은 turn의 tool 활동을 소급 연결한다.
- 다음 manual turn에는 마지막 public fallback을 명시적으로 carry해 이후 tool activity가 Todo와 Trace plan association을 유지한다.

변경 파일: `src/application/project-workbench.ts`, `src/domain/work/workflow-projection.ts`, `test/native-plan-wiring.test.ts`.

## Red → Green 재현

Invocation:

```sh
bun test test/native-plan-wiring.test.ts -t "projects a completed public numbered Plan reply"
```

수정 전 observable: `0 pass`, `1 fail`; Todo document가 `undefined`여서 세 단계 예상과 불일치.

Artifact: `.www/evidence/v020-traceability/public-plan-fallback-red.log`.

수정 후 전체 wiring invocation:

```sh
bun test test/native-plan-wiring.test.ts
```

Observable: `7 pass`, `0 fail`, `67 expect()`.

검증 시나리오:

1. 실제 Test2 형식의 공개 계획, 뒤따른 안전 약속 prose, 같은-turn 읽기 활동을 Todo와 Trace에 연결한다.
2. 다음 manual turn의 실행 activity를 carried fallback plan에 연결하고 exact activity Trace 선택을 수락한다.
3. structured Native plan과 공개 번호 목록이 함께 있으면 structured plan만 사용한다.
4. 일반 번호 목록, 불연속 번호, failed turn, interrupted turn은 projection과 Todo write가 0건이다.

Artifact: `.www/evidence/v020-traceability/public-plan-fallback-tests.log`.

## 집중 회귀 검증

Invocations:

```sh
bun test test/work-flow.test.ts test/todo-ledger.test.ts test/trace-selection.test.ts
bun test test/project-workbench.test.ts -t 'mirrors Native plan activity|keeps Chat usable while Todo sync is blocked|preserves rewritten root-plan identity|selects Trace by exact activity'
bun run check
git diff --check
```

Observables:

- domain regression: `48 pass`, `0 fail`, `192 expect()`.
- ProjectWorkbench regression: `4 pass`, `0 fail`, `27 expect()`.
- TypeScript: `tsc --noEmit`, exit 0.
- conflict marker: 0.
- diff check: PASS.

Artifacts: `public-plan-fallback-domain-regression.log`, `public-plan-fallback-project-regression.log`, `public-plan-fallback-typecheck.log`, `public-plan-fallback-conflict-markers.log`, `public-plan-fallback-diff-check.log`.

## 최종 바이너리

Invocation:

```sh
bun build --compile --target=bun-darwin-arm64 src/cli.ts --outfile dist/www-pre-user-test
file dist/www-pre-user-test
./dist/www-pre-user-test --version
shasum -a 256 dist/www-pre-user-test
```

Observables:

- `bundle 2710 modules`, compile exit 0.
- `Mach-O 64-bit executable arm64`.
- version `0.0.15`.
- SHA-256 `c6a53deaf9bfacbc32d7076838234c95909318fbe9802d9694cdbc1368a80bf3`.

Artifacts: `public-plan-fallback-compile.log`, `public-plan-fallback-binary-file.log`, `public-plan-fallback-version.log`, `public-plan-fallback-binary-sha256.log`.

commit, push, PR, Linear mutation은 수행하지 않았다. 새 바이너리의 실제 Test2 재실행은 상위 세션이 같은 터미널에서 수행한다.

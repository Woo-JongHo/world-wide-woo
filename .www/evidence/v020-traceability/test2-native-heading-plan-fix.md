# Test2 Native 번호 heading Plan 투영 수정 증거

- 날짜: 2026-09-07
- 입력 화면 캡처: `.www/evidence/2026-09-07-test2/missing-plan-goal-retest-final.txt`
- 실제 journal: `.www/runtime/activity/native-58e67cacf9b052f188254be8c6f91a2f2beeb9fb2af41817.jsonl`
- 최종 바이너리: `/Users/jonghoPro/woo/00_project/99_www/dist/www-pre-user-test`

## 직접 확인한 원인

화면에는 Bash 성공과 assistant final 뒤 `TODO · 현재 계획 없음`이 표시됐다. 실제 journal을 직접 읽어 다음 순서를 확인했다.

1. seq 47: assistant `item/completed`.
2. seq 48~49: Bash `item/started` → `item/completed`.
3. seq 54: Native plan `item/started`, text 길이 0.
4. seq 55: 같은 Native plan `item/completed`, text 길이 568. 공개 본문에는 `## 1. 값 추출`, `## 2. 의미 비교`, `## 3. 결과 보고`가 있다.
5. seq 59: `turn/completed`.

따라서 이 사례는 plan 본문 미수신이 아니었다. 기존 parser가 status 표식 없는 번호형 Markdown heading과 하위 bullet을 거부했지만, `ProjectWorkbench`의 guard는 `type: plan` 존재만 보고 missing-plan fallback도 중단했다. 그 결과 workflow step과 Todo가 모두 비었다.

Artifact: `test2-native-heading-journal-observation.log`.

## 최소 수정

`workflow-projection.ts`가 Native plan item의 명시적인 연속 번호 H2~H6 heading을 plan step으로 읽는다. 첫 heading은 running, 나머지는 pending이며 heading 아래 설명 bullet은 step으로 추론하지 않는다. 번호가 불연속이면 기존처럼 거부한다.

첫 유효 Native plan revision보다 같은 turn의 Bash가 먼저 관측된 경우, turn start 이후 plan revision 이전의 실제 action/observation만 유일한 running step에 소급 연결한다. 다른 thread/turn의 activity는 포함하지 않는다.

이 사례에는 공개 Native plan 본문이 있으므로 `계획 본문 미수신` synthetic fallback을 만들지 않는다. 기존 truly-missing plan fallback, 공개 번호형 fallback, structured plan priority는 유지한다.

변경 파일:

- `src/domain/work/workflow-projection.ts`
- `test/native-plan-wiring.test.ts`

## 실제 순서 회귀 테스트

Invocation:

```sh
bun test test/native-plan-wiring.test.ts --test-name-pattern 'Test2 numbered-heading'
```

수정 전 observable: Todo document가 없어 `toHaveLength(3)`가 실패했다.

Artifact: `test2-native-heading-red.log`.

수정 후 observables:

- Todo: `값 추출` running, `의미 비교` pending, `결과 보고` pending.
- `public-user-request` synthetic fallback 없음.
- plan보다 앞선 같은-turn Bash completed activity가 첫 step association에 포함됨.
- exact Bash activity ID의 `trace.select` 결과가 `selected`, `planAssociation: inferred`.

Result: `1 pass`, `0 fail`, `9 expect() calls`.

Artifact: `test2-native-heading-green.log`.

## 집중 회귀와 정적 검사

Invocation:

```sh
bun test test/native-plan-wiring.test.ts test/work-flow.test.ts
bun run check
git diff --check
```

Observables:

- focused tests: `35 pass`, `0 fail`, `190 expect() calls`.
- TypeScript: `tsc --noEmit`, exit 0.
- diff check: PASS.
- 변경 파일 debug tag, conflict marker, `test.skip`/`test.only`, `TODO` placeholder: 일치 0.

Artifacts: `test2-native-heading-focused-tests.log`, `test2-native-heading-typecheck.log`, `test2-native-heading-diff-check.log`, `test2-native-heading-marker-scan.log`.

## arm64 compiled 바이너리

Invocation:

```sh
bun build --compile --target=bun-darwin-arm64 src/cli.ts --outfile dist/www-pre-user-test
file dist/www-pre-user-test
./dist/www-pre-user-test --version
shasum -a 256 dist/www-pre-user-test
```

Observables:

- compile: `bundle 2723 modules`, `compile dist/www-pre-user-test`, exit 0.
- file: `Mach-O 64-bit executable arm64`.
- version: `0.0.15`.
- SHA-256: `425c152ff5ee3992854e61240c6781ef7322760fbe853b19be2bd956eb56495d`.

Artifacts: `test2-native-heading-compile.log`, `test2-native-heading-binary-file.log`, `test2-native-heading-version.log`, `test2-native-heading-sha256.log`.

commit, push, Linear 수정, 새 worktree 생성은 수행하지 않았다. Dashboard, Monitor, approval 소유 파일은 수정하지 않았다.

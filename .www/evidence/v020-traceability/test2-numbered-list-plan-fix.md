# Test2 numbered-list-under-heading Native Plan 수정 증거

- 날짜: 2026-09-07
- 화면 증거: `.www/evidence/2026-09-07-test2/native-heading-plan-actual.txt`
- 실제 journal: `.www/runtime/activity/native-6d31dfddaf8dd325afc38069310298b3ef454c53a11e600f.jsonl`
- 최종 바이너리: `/Users/jonghoPro/woo/00_project/99_www/dist/www-pre-user-test`

## 실제 원인

최신 journal을 직접 확인했다.

- seq 73: Native plan `item/started`, 빈 text.
- seq 74: Native plan `item/completed`, 394자 공개 본문.
- 본문 형식: `## 3단계` 아래 연속 `1.`~`3.` 목록, 뒤에 `## 검증 및 전제`와 설명 bullet.
- seq 78: final assistant observation missing.
- seq 79: 정상 `turn/completed`.

기존 dplan parser는 상태 표식(`[pending]`, `— 완료`)이 있는 번호 목록과 `## 1. 제목` 형태는 읽었지만, 계획 구역 아래의 상태 없는 최상위 번호 목록을 거부했다. Native plan activity 자체는 존재해 missing-plan fallback도 생성되지 않았으므로 Todo가 비었다.

Artifact: `test2-numbered-list-journal-observation.log`.

## 최소 수정

Native `type: plan` 본문에서 H2~H6 제목에 `계획`, `단계`, `plan`, `step` 의도가 명시된 구역만 찾는다. 그 구역 바로 아래의 최상위 번호 목록을 다음 조건으로 투영한다.

- 번호는 `1.`부터 끊김 없이 이어진다.
- 항목 수는 2~12개다.
- 첫 항목은 running, 이후 항목은 pending이다.
- `## 3단계` 같은 구역 제목은 step이 아니다.
- 다음 heading부터의 검증/전제와 bullet은 step이 아니다.
- 기존 status 표식 plan은 기존 parser에 맡긴다.
- 한 항목, 불연속 번호, 13개 목록은 계속 거부한다.

기존 `## 1. 값 추출` 방식, status 포함 dplan, 공개 번호형 fallback, truly-missing plan fallback을 유지했다. hidden reasoning은 읽거나 저장하지 않는다.

변경 파일:

- `src/domain/work/workflow-projection.ts`
- `test/native-plan-wiring.test.ts`
- `test/work-flow.test.ts`

## 실제 순서 regression

Invocation:

```sh
bun test test/native-plan-wiring.test.ts --test-name-pattern 'step-count heading'
```

수정 전 observable: Todo document가 없어 `toHaveLength(3)`에서 실패했다.

Artifact: `test2-numbered-list-red.log`.

수정 후 observables:

- plan started의 빈 text 뒤 completed 본문과 turn completed, final assistant 없음 순서를 재현했다.
- workflow는 공개 번호 목록 세 문장만 3단계로 투영했다.
- status는 running, pending, pending이다.
- `3단계` heading은 step title에 포함되지 않는다.
- `public-user-request` synthetic fallback은 생성되지 않는다.

Result: `1 pass`, `0 fail`, `8 expect() calls`.

Artifact: `test2-numbered-list-green.log`.

## 집중 회귀와 경계

Invocation:

```sh
bun test test/native-plan-wiring.test.ts test/work-flow.test.ts
```

Observables:

- `41 pass`, `0 fail`, `215 expect() calls`.
- 2개와 12개 plain numbered plan 수용.
- 1개, 불연속, 13개 plain numbered plan 거부.
- 기존 H2 numbered heading, structured/public/missing fallback 경계 통과.

Artifact: `test2-numbered-list-focused-tests.log`.

## 정적 검사

- `bun run check` → `tsc --noEmit`, exit 0.
- `git diff --check` → PASS.
- 변경 파일 debug tag, conflict marker, `test.skip`/`test.only`, `TODO` placeholder → 일치 0.

Artifacts: `test2-numbered-list-typecheck.log`, `test2-numbered-list-diff-check.log`, `test2-numbered-list-marker-scan.log`.

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
- SHA-256: `9b926b181846e8ac9ef494de4a8a1697a882906b2cb6f608a8d4fd12e9992828`.

Artifacts: `test2-numbered-list-compile.log`, `test2-numbered-list-binary-file.log`, `test2-numbered-list-version.log`, `test2-numbered-list-sha256.log`.

commit, push, Linear 수정, 새 worktree 생성은 수행하지 않았다.

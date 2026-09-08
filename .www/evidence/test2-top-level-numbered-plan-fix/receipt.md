# Test2 top-level 번호형 Native Plan 수정

## 관찰된 실패

- 실제 journal: `.www/runtime/activity/native-e0a3e7aee38dd2a9f7507165e41a36f1f027e1bb7e594d07.jsonl`
- 실제 화면: `.www/evidence/2026-09-07-test2/numbered-list-plan-and-layout-final.txt`
- 순서: seq46 assistant 완료 → seq47/48 Bash 실행 → seq53 plan 시작 → seq54 plan 완료 → seq58 turn 완료.
- seq54는 `item.type=plan`이며 H1 제목 다음에 `1. **표기 추출**`, `2. **의미 비교**`, `3. **결과 정리**`와 들여쓴 상세 bullet을 담았다. 기존 파서는 별도의 H2–H6 계획 표제를 요구해 이 본문을 거부했고 Todo는 `현재 계획 없음`이었다.
- 관찰 요약 artifact: `test2-top-level-numbered-journal-observation.log`.
- 최신 journal 전체를 현재 `projectWorkFlow`에 직접 replay한 smoke는 같은 source turn에서 3단계와 seq48 Bash의 `bashAssociated: true`, rejection 0을 확인했다. Artifact: `test2-top-level-numbered-actual-journal-smoke.log`.

## 수정

`src/domain/work/workflow-projection.ts`의 Native plan Markdown 경계에서 H1을 포함한 선택적 heading 뒤의 top-level 번호 블록을 공통 해석한다.

- `item.type=plan`으로 확인된 Native 이벤트에서만 적용한다.
- 번호는 1부터 연속된 2~12개만 허용한다.
- `## 3단계` 같은 heading의 숫자는 단계로 해석하지 않는다.
- 번호 단계 아래의 공백 들여쓴 `-`, `*`, `+` bullet은 상세로 제외한다.
- 굵은 글씨 표식을 제거해 Todo 제목을 만든다.
- status가 있는 기존 dplan 형식은 기존 status parser가 계속 소유한다.
- 일반 assistant 답변은 `ProjectWorkbench`의 별도 strict public fallback 경계를 그대로 사용한다.

## 회귀 시나리오

`test/native-plan-wiring.test.ts`가 실제 순서를 재현한다: Plan mode 요청, assistant 공개 문장, Bash started/completed, 빈 plan started, H1 + top-level 번호 목록 plan completed, turn completed. 관찰 결과는 Todo 3개(`표기 추출` running, 나머지 pending), 상세 bullet 제외, public-user-request fallback 없음, 앞선 Bash activity의 exact Trace 선택과 inferred plan association이다.

- 수정 전: `bun test test/native-plan-wiring.test.ts --test-name-pattern 'top-level numbered Native plan'` → `0 pass, 1 fail`; Todo items가 undefined. Artifact: `test2-top-level-numbered-red.log`.
- 수정 후 같은 명령 → `1 pass, 0 fail`. Artifact: `test2-top-level-numbered-green.log`.
- 집중 검증: `bun test test/native-plan-wiring.test.ts test/work-flow.test.ts` → `43 pass, 0 fail`, 225 assertions. 일반 assistant 번호 목록 거절, structured plan 우선, 실패·중단 turn 차단을 포함한다. Artifact: `test2-top-level-numbered-focused-tests.log`.
- 실제 latest journal replay → `표기 추출` running, `의미 비교` pending, `결과 정리` pending, seq48 Bash association true, rejection 0. Artifact: `test2-top-level-numbered-actual-journal-smoke.log`.

## 정적 검증

- `bun run check` → exit 0. Artifact: `test2-top-level-numbered-typecheck.log`.
- `git diff --check` → PASS. Artifact: `test2-top-level-numbered-diff-check.log`.
- 소유 파일 conflict marker, `test.skip`, `test.only`, TODO placeholder scan → PASS. Artifact: `test2-top-level-numbered-marker-scan.log`.

## 바이너리

Invocation:

```sh
bun build --compile --target=bun-darwin-arm64 src/cli.ts --outfile dist/www-pre-user-test
file dist/www-pre-user-test
./dist/www-pre-user-test --version
shasum -a 256 dist/www-pre-user-test
```

Observables:

- `bundle 2723 modules`, compile exit 0.
- `Mach-O 64-bit executable arm64`.
- version `0.0.15`.
- SHA-256 `438f85fb74201e5f3a6cb6bef5a9434917d7c1472489a192b6714c3fc45d143f`.
- Artifact: `test2-top-level-numbered-build.log`.

커밋, push, PR, Linear 변경, 새 worktree 생성은 수행하지 않았다. 기존 6:4 레이아웃과 다른 작업자의 파일은 수정하지 않았다.

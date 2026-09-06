# WOO-705 Tracer 실행 identity 구현 영수증

- Linear: [WOO-705](https://linear.app/woo-world/issue/WOO-705)
- Linear UUID: `4738e3c5-c5b3-4cc2-9cea-ff9bf600367d`
- 부모: WOO-681
- 기준 HEAD: `05e2829`
- 작업 branch: `woo-705-tracer-identity`
- 검증일: 2026-09-07 (Asia/Seoul)

## 결과

`/trace`의 Native `itemId` 역순 검색을 제거하고 exact ProjectActivity ID를 application 경계에서 검증하도록 바꿨다. 선택 성공은 observed `activityId/threadId/turnId/itemId`와 inferred Plan association을 별도 필드로 반환한다. 잘못된 ID, 중복 ID, 현재 thread/Plan turn 불일치, Native ref 누락, Plan association 불일치와 부분 journal 범위 밖 선택은 coverage를 포함한 구조화 failure로 반환한다.

실패한 선택은 기존 selected activity를 바꾸거나 Source view로 이동하지 않는다. partial journal에서 찾지 못한 activity를 `itemId` 일치 또는 latest activity로 대체하지 않는다.

## Red / Green

기준 revision `05e2829` 임시 tree에 실제 workspace dependencies를 연결하고 변경 테스트를 실행해 환경 오류 없는 red를 확인했다.

- red: `bun test test/project-workbench.test.ts` → `74 pass / 2 fail / 436 assertions`, exit 1
  - invalid selection의 structured failure/coverage 부재
  - `trace.select` exact activity application command 부재
- targeted green: `bun test test/trace-selection.test.ts test/project-workbench.test.ts test/workbench-shell-policy.test.ts test/workbench-views.test.ts` → `161 pass / 0 fail / 1511 assertions`, exit 0
- full green: `bun test` → `624 pass / 0 fail / 74 files / 4233 assertions`, exit 0
- Terra 독립 검토 뒤 CLI help 보완 검증: `bun test test/cli.test.ts test/trace-selection.test.ts test/project-workbench.test.ts test/workbench-shell-policy.test.ts test/workbench-views.test.ts` → `173 pass / 0 fail / 1551 assertions`, exit 0
- typecheck: `bun run check`, exit 0
- `git diff --check`, exit 0
- 변경 대상 `test.skip`, `test.only`, `describe.skip`, `describe.only`, `it.skip`, `it.only`, debug marker 없음

## 계약 검증

- 서로 다른 turn의 두 activity가 동일한 `itemId`와 제목을 사용해도 exact `activityId`로 각각 올바른 refs가 선택된다.
- 둘째 Plan에서 첫 turn activity를 선택하면 `turn_mismatch`다.
- Native `itemId`만 `/trace` 입력으로 사용하면 exact activity가 아니므로 `activity_not_found`다.
- Plan relation은 `inferred`, activity identity refs는 `observed`로 분리된다.
- fresh invalid ID는 `activity_not_found`, partial local journal에서 미관측 ID는 `outside_observed_journal`이며 두 결과 모두 관측 activity 수와 sequence 범위를 포함한다.

## 변경 파일 fingerprint

- `src/domain/trace-selection.ts`: `88830c13be3856fadeb1070128b7db8770b5ce8e94070a41316170403d4e16b9`
- `src/domain/workbench.ts`: `b5aca190d8904433c974ca29034462b392234271fb03f922da6001d882eb1e1d`
- `src/application/project-workbench.ts`: `1bec331b276537c8e55bd0b369220a01fd66e5819ce200d986f8de2557219fe0`
- `src/presentation/tui/slash-commands.ts`: `03c3b33993b2b56240d65c62d6358dd625b0eca447fd7fd94311fc6abc4bc65d`
- `src/presentation/tui/workbench-shell.ts`: `61666c8c9fa42269e7d51d134284d67900287b2ee87847936653db80ada64b99`
- `src/presentation/tui/workbench-views.ts`: `92548521cc1491e30e9951cc4f4100f7495d5688515360ca55ac6a81b4ba108c`
- `src/cli.ts`: `267957bfab7f69c1645aba8cacaadf8527d5821b9fdcf9cf0489d4841c480ccf`
- `test/trace-selection.test.ts`: `a52712f915d5217b73f00a34d3835561a6ecf81b60078f54ea1cebb65ee4558a`
- `test/project-workbench.test.ts`: `8ba6b0c37aa6ce8583d79e34270b8af9cb486b157dc1185ac18529990fec67e8`
- `test/workbench-shell-policy.test.ts`: `40608bfbca97f15739212636212ec18f1555b589b49769c88fea90de28038963`
- `test/workbench-views.test.ts`: `ee467d13cae427a4b503a241ff6be1a043e5beafd939653403f606aeac2e0800`

## 범위와 미실행 항목

- `src/domain/work-steps.ts`, Development Map, Monitor/Dashboard 기능은 변경하지 않았다.
- 실제 Native App Server와 Native TUI 조작은 미실행이다. 이 receipt는 코드/fixture 검증 증거이며 WOO-705 전체 수락 증거가 아니다.
- Terra 독립 코드 검토는 WATCH / APPROVE였고 HIGH·MEDIUM blocker가 없었다. LOW finding인 CLI help의 `/trace <activity-id>` 누락은 보완했다.
- Claude Opus 독립 최종 감사는 03:20 KST limit reset 전이라 미실행이며 낮은 모델로 대체하지 않았다.
- commit, push, PR, Linear write는 실행하지 않았다.
- 저장소에 `LAYERS.md`가 없어 지침 위치와 실제 checkout이 불일치했다. 제품 구현은 `AGENTS.md`와 실제 코드/계획/Linear 계약을 기준으로 계속했다.

전문 구현 기록은 `.www/scratchpad/2026-09-07-tracer-identity-implementation.md`에 보존했다.

# CLI·scripts 함수 레벨 리팩터링 증거

## 범위와 규칙

- 작업 저장소: `/Users/jonghoPro/woo/00_project/99_www`
- 브랜치: `astra/terminal-ui`
- 읽은 정본: 루트 `AGENTS.md`, `LAYERS.md`, `.agents/skills/woo-entry/SKILL.md`, 머신 `~/.codex/woo.yaml`이 가리키는 WES `AGENTS.md`
- 적용한 설계 기준: `codebase-design`의 작은 인터페이스, 책임별 내부 seam, locality. 공개 CLI 인터페이스인 `runCli(args, dependencies)`는 유지하고 구현만 private 함수로 나눴다.
- 수정 소유 범위: `src/cli.ts`, CLI 전용 `test/cli.test.ts`, 이 증거 파일. `core/**`, `adapters/**`와 다른 작업자의 변경은 수정하지 않았다.
- `.www/linear-project.json`은 Woo-World / World Wide Woo 연결을 기록하지만, 현재 세션에는 `linear-woo` 도구가 노출되지 않아 원격 read-back은 수행하지 못했다. 로컬 변경과 무관한 블로커다.

## 조사 결과

### `src/cli.ts`

기존 `runCli` 한 함수가 다음을 모두 소유했다.

1. 전역 `--help` / `--version` 우선 처리
2. development/auth/workflow/astra/router/list/resume/default 명령 디스패치
3. Astra 옵션 순차 파싱과 중복 검출
4. native thread 목록 조회, picker 취소, 재개 실행
5. sessions/threads 출력 포맷
6. 오류 문자열 출력과 exit code 변환

이 구조에서는 옵션 변경이 디스패치·재개·오류 순서까지 함께 건드리게 된다. 공개 함수는 그대로 두고 `writeInformationalOutput`, `dispatchCommand`, `parseAstraOptions`, `runAstraCommand`, `runRouterCommand`, `selectResumeThread`, `resumeAstra`, `writeSessions`, `writeThreads`, `requireAstra`로 책임을 분리했다. 각 함수는 CLI 내부 구현이며 새 공개 seam을 만들지 않았다.

보존한 관찰 가능 계약:

- `development` 외 명령에서는 help가 version보다 먼저이며 둘 다 실행보다 먼저다.
- `development` 인자는 전역 help/version으로 가로채지 않는다.
- Astra 옵션은 기존과 같은 순서로 읽고, 같은 flag가 다시 나타날 때 `중복 옵션`을 낸다.
- `--resume` 뒤의 비-option 값만 thread id로 소비한다.
- 누락/잘못된 Astra 옵션은 기존 usage 문자열로 실패한다.
- picker 목록이 비었으면 기존 오류, picker가 취소되면 실행 없이 exit code 0이다.
- top-level `--resume <id>`의 기존 추가 인자 무시 동작도 바꾸지 않았다.
- top-level `--resume ""`의 빈 문자열은 기존 falsy 판정대로 picker를 연다.
- 주입된 `runAstra`는 `dependencies.runAstra(...)` method call로 실행해 기존 receiver를 보존한다.
- 모든 명령 실행 오류는 기존처럼 `writeError` 한 번과 exit code 1로 변환한다. help/version 출력은 기존처럼 그 try/catch 바깥에 있다.

### `src/app.ts`와 `src/legacy-router-app.ts`

두 파일을 읽고 함수 경계를 대조했다. `runApp`은 production 조립과 shell handoff, 실패 시 project close를 한 흐름으로 소유한다. `runLegacyRouter`도 router 조립, shell handoff, handoff 전 실패 cleanup 순서가 핵심이며 `test/legacy-router-app.test.ts`가 `monitor.dispose → runtime.close → release lease` 경로를 검증한다. 이번 CLI 파싱/디스패치 locality 개선과 독립이고, 작은 pass-through 함수를 추가하면 인터페이스만 늘어나므로 수정하지 않았다.

### `scripts/**`

`scripts`의 모든 TypeScript 파일을 파일 목록, 줄 수, `process.argv`, 분기/반복 패턴으로 조사했다. 목록 측정 스크립트는 다른 작업자 소유이므로 수정하지 않았다.

| 파일군 | 관찰 | 판정 |
|---|---|---|
| `traceability.ts`, `release-gate.ts`, `linear-contract.ts`, `code-map.ts`, `code-id.ts` | 긴 검증 흐름이지만 검증 단계별 함수와 export seam이 이미 존재한다. 오류 문자열과 파일 write 순서가 계약이다. | 별도 행동 변경 없이 함수만 더 쪼개면 shallow pass-through가 늘어 유지. |
| `skill-runtime.ts`, `artifact-control.ts`, `local-units.ts`, `woo-receipts.ts`, `rpa-description.ts` | 직접 argv를 읽지만 각각 단일 실행 스크립트이며 현재 호출처와 usage가 위치 인자에 의존한다. | 공통 parser 도입은 수락/거부 변경 위험이 더 커 유지. |
| canary/smoke/benchmark 스크립트 | 한 시나리오를 순차 실행하며 짧다. | 함수 추출 이득 없음. |
| hook/install 스크립트 | host 입력/출력 또는 git hook 설치라는 단일 책임이다. | 하드코딩된 등록 경로는 호스트 계약이므로 유지. |

구체적으로 동일 flag 조회가 몇 파일에 있지만 허용 flag, 위치 인자, 오류 방식이 서로 달라 공통화할 실제 두 번째 adapter가 없다. 안전한 최소 수정 후보가 없다고 판정해 scripts에는 변경을 만들지 않았다.

## 검증

- `bun test test/cli.test.ts test/legacy-router-app.test.ts`: 18 pass, 0 fail, 71 expectations
- `bun run check`: TypeScript no-emit 통과
- 새 회귀 테스트:
  - `router --version --help`가 help만 출력하고 router를 실행하지 않음
  - `astra --resume` picker 취소가 오류 없이 0을 반환하고 Astra를 실행하지 않음
  - 주입된 `runAstra`가 dependency object를 `this`로 받음
  - top-level `--resume ""`가 빈 id를 직접 실행하지 않고 picker를 엶
- 변경 파일의 `TODO`, `test.skip`, `test.only`, `describe.skip`, `describe.only`, `it.skip`, `it.only`를 검색하며 완료 전 다시 확인한다.

## 유지 이유

외부 interface는 `runCli` 하나로 유지했다. 옵션 파싱과 재개 선택을 private 구현으로 숨겨 CLI 호출자가 알아야 할 내용은 늘리지 않았고, 각 오류/취소 순서의 locality를 높였다. app/router 조립과 scripts는 현재 책임이 응집돼 있고 이번 변경 목적에 필요한 두 번째 구현이나 반복 호출자가 없어 불필요한 seam을 추가하지 않았다.

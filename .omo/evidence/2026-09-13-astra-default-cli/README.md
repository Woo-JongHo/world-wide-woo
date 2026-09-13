# Astra 기본 CLI 진입 검증

시도 디렉터리 조회 명령 `omo ulw-loop status --json`는 이 환경에 `omo` 실행 파일이 없어 실패했다. 따라서 프로젝트 규칙에 따라 `.omo/evidence/`에 기록한다.

| 성공 기준 | 시나리오 | 호출 | 이진 관찰값 | 원본 산출물 |
| --- | --- | --- | --- | --- |
| 기본 `www`가 Astra를 연다 | 의존성을 주입한 `runCli([])` | `bun test test/cli.test.ts test/astra-shell.test.ts` | `opens the Astra console for plain www...` 통과, `runAstra({})` 수신 | `cli-astra-tests.log` |
| 기존 `www astra`가 호환된다 | runtime config와 explicit resume | `bun test test/cli.test.ts test/astra-shell.test.ts` | `www astra keeps explicit Runtime scope...` 통과, 같은 options 전달 | `cli-astra-tests.log` |
| 기본 resume·lane도 Astra 설계다 | `--resume`, `--execution-lane pi|codex` | `bun test test/cli.test.ts test/astra-shell.test.ts` | 세 계약 테스트 통과, picker에 `astra` 전달 | `cli-astra-tests.log` |
| 설치된 명령이 변경 진입점을 사용한다 | 전역 `www` bin과 도움말 | `type -a www; www --help` | bin이 `src/cli.ts`를 가리키고 기본 도움말이 Astra Console을 표시 | `installed-www.log` |
| TypeScript·경계가 유지된다 | 프로젝트 정적 검사와 architecture contract | `bun run check`; `bun test test/architecture.test.ts` | 두 명령 exit 0 | `typecheck.log`, `architecture-test.log` |

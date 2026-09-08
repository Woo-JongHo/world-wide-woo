# Test2 주간-only HUD 회귀 복원 증거

- 날짜: 2026-09-07
- 범위: Test2에서 확인된 하단 HUD 회귀만 수정
- 최종 바이너리: `/Users/jonghoPro/woo/00_project/99_www/dist/www-pre-user-test`

## 재현 증상과 수정

Test2 compiled 화면이 `● Codex 5h — 주 80%↻7d | ● Claude 5h 0%↻3h 주 84%↻7d | ● Gemini —`로 표시됐다. `UsageStripView`가 5시간·주간 창, 장식 점, reset 기호를 함께 합성하고 하단 HUD가 추가 상태를 붙이던 경로를 주간 snapshot 한 줄로 복원했다.

수정 후 계약은 정확히 `Codex 80% · 7d | Claude 84% · 7d | Gemini —`이다. `ready`이지만 주간 값이 없으면 `—`, 명시적인 loading/auth/error 상태만 짧은 상태 문구로 표시한다. `WorkbenchBottomHudView`는 캐릭터와 telemetry를 합성하지 않고 이 한 행만 렌더링한다.

변경 경계:

- `src/presentation/tui/usage-strip-view.ts`
- `src/presentation/tui/workbench-bottom-hud.ts`
- `src/presentation/tui/workbench-shell.ts`의 HUD 배치
- `test/usage-strip.test.ts`
- `test/workbench-bottom-hud.test.ts`

Todo, Tracer, compiled OAuth 배선은 유지했다. commit, push, PR, Linear mutation은 수행하지 않았다.

## 정확 문자열 렌더 smoke

Invocation:

```sh
bun -e '<UsageStripView에 Test2와 같은 5h/7d snapshot을 주입하고 ANSI 제거 후 출력>'
```

Binary observable:

```text
Codex 80% · 7d | Claude 84% · 7d | Gemini —
```

Artifact: `hud-weekly-only-render-smoke.log`.

## 집중 회귀 테스트

Invocation:

```sh
bun test test/usage-strip.test.ts test/workbench-bottom-hud.test.ts test/workbench-shell-policy.test.ts
```

Observable: `31 pass`, `0 fail`, `116 expect() calls`. 정확 문자열, 한 행/폭 제한, 5h·점·WOONI·telemetry 부재, ready+weekly-missing 대시, 명시 provider 상태를 검사했다.

Artifact: `hud-weekly-only-tests.log`.

## 정적 검사

Invocations and observables:

- `bun run check` → `tsc --noEmit`, exit 0.
- `git diff --check` → exit 0.
- 변경 파일의 conflict marker, `test.skip`/`test.only`, `TODO` scan → 일치 0.

Artifacts: `hud-weekly-only-typecheck.log`, `hud-weekly-only-diff-check.log`, `hud-weekly-only-marker-scan.log`.

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
- SHA-256: `2586e1b66530b0ff81aa965dbe28eaf78d8d7cea42610e885e4d554d2be1c829`.

Artifacts: `hud-weekly-only-compile.log`, `hud-weekly-only-binary-file.log`, `hud-weekly-only-version.log`, `hud-weekly-only-sha256.log`.

## 후속 범위

Plan provider가 실제 실행에서 번호형 final을 내지 않는 현상은 이번 HUD 범위에서 수정하지 않고 후속으로 남긴다.

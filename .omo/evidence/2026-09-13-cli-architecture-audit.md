# CLI 아키텍처 감사 — 2026-09-13

## 범위와 판정

대상은 현재 `astra/terminal-ui` 작업트리의 `src/cli.ts`(221행), 실행 조립 진입점, CLI·Astra·native-thread-picker 관련 테스트다. 이 문서는 코드 수정 없이 읽기 전용으로 작성했다.

**판정: `src/cli.ts`는 실행 가능한 최상위 파일을 함께 둔 inbound CLI adapter이며, 별도 제품 capability module이나 application composition root는 아니다. 지금 리팩터링은 불필요하다.**

파일 끝의 `import.meta.main` 분기만 process bootstrap이고(221행), 실제 application/outbound/TUI 구현의 조립은 `src/app.ts:12-48` 및 `src/legacy-router-app.ts:32-79`가 맡는다. 반면 `runCli(args, dependencies)`는 argv 해석, public 사용법, native/legacy 구분, resume 선택 흐름, stdout/stderr 결과를 한 interface 뒤에 둔다. 이 동작은 얇은 전달자가 아니며 CLI adapter로 응집돼 있다.

`app.ts`는 60행 이하로 제한하는 architecture test의 composition root다. `cli.ts`를 그 파일에 합치면 terminal policy와 process I/O가 application/TUI 조립과 섞이고, 현재의 dependency-injection test seam도 사라진다.

## 실제 실행 경로

```text
package.json bin/start
  -> src/cli.ts:221 process.argv / process.exitCode
  -> runCli(argv, CliDependencies)
     -> default Workbench: productionDependencies.runApp
        -> src/app.ts:runApp -> Project Workbench session + native shell
     -> astra: productionDependencies.runAstra
        -> src/app.ts:runAstra -> runApp({ design: "astra" })
     -> router: productionDependencies.runRouter
        -> legacy-router-app.ts:runLegacyRouter -> legacy shell
     -> auth: src/app.ts:runAuth -> inbound auth-command + auth controller
     -> resume without id: listNativeThreads -> TUI-F007 picker -> runApp/runAstra
```

`src/app.ts:49`의 Astra 함수는 `design: "astra"`만 주입하는 작은 adapter이고, `src/legacy-router-app.ts:31-79`는 명시적 호환 Router 조립을 별도로 보유한다. 따라서 CLI가 Router/Auth/Astra의 내부 구현을 재구성하지 않는다.

## 줄 단위 책임 분류

| `src/cli.ts` 줄 | 분류 | 실제 책임 | I/O·조립 경계 |
|---|---|---|---|
| 1 | process bootstrap 선언 | Bun executable shebang | 실행기만 인식한다. |
| 3–6 | 계약/상수 import | `RunAppOptions`, native thread summary, legacy Router options, 버전 | side effect 없음. |
| 8–20 | CLI adapter interface | 실행, 목록, 선택, 출력/오류를 주입 가능한 `CliDependencies`로 선언 | 테스트와 production이 같은 seam을 넘는다. |
| 22–64 | production adapter wiring | lazy app/Router/Auth/Development/Workflow/picker 호출과 `console` writer 결속 | composition을 일부 위임하고 terminal I/O adapter를 제공한다. 42–48행의 Development/Workflow 직접 lazy import는 루트 파일의 국소 조립이다. |
| 66–89 | terminal first-paint | TTY일 때만 Workbench/Router/Astra bootstrap 한 줄 출력 | `process.stdout`를 직접 쓰는 유일한 명시적 first-paint 정책이다. |
| 91–132 | public help projection | 명령·호환 범위·제약을 문자열로 고정 | 순수 문자열 생성; help의 public contract다. |
| 134–136 | Router 입력 검증 | legacy session id 형식 제한 | 순수 predicate다. |
| 138–146 | 전역 옵션 parsing | Development 외 `--help/-h`, `--version/-v` 단락 | `writeOut` port만 사용한다. |
| 148–156 | Development/Workflow dispatch | argv를 재해석하지 않고 slice를 넘겨 결과 출력 | 각 하위 CLI가 자기 parsing을 소유한다. |
| 152 | Auth dispatch | auth argv를 `runAuth`로 전달 | 실제 prompt/secret/auth I/O는 `adapters/inbound/cli/auth-command.ts:1-129`에 있다. |
| 157–177 | Astra command parsing 및 resume policy | 중복 flag 거절, `--resume`, lane, runtime config 해석, id 없을 때 picker, 취소 시 정상 종료 | 유일하게 누적된 CLI 정책이다. 최종 실행은 `runAstra` port다. |
| 178–183 | Router parsing | `router` 또는 검증된 `--resume <legacy-id>`만 허용 | legacy Router로 위임한다. |
| 184–199 | 목록 presentation | legacy session/native thread 목록을 Korean locale과 preview normalization으로 출력 | 데이터 조회는 port, 표시 형식은 CLI adapter가 소유한다. |
| 200–208 | 기본 Workbench resume policy | id 없으면 native thread 목록과 picker, 취소 시 실행하지 않음 | picker는 TUI-F007, Workbench 시작은 `runApp` port다. |
| 209–214 | 기본 command dispatch | 빈 argv 및 top-level lane, unknown command 오류 | 실행은 port, 문법은 CLI가 소유한다. |
| 215–218 | 오류 수렴 | 모든 command 오류를 메시지와 exit status `1`로 변환 | `writeError` port만 사용한다. |
| 221 | executable lifecycle | `process.argv.slice(2)`를 전달하고 `process.exitCode` 설정 | process lifecycle만 소유한다. |

## Parsing·help·picker·dispatch·I/O의 소유

### Command parsing

`runCli`의 closed command vocabulary는 `development`, `auth`, `workflow`, `astra`, `router`, `sessions`, `threads`, 기본 Workbench와 top-level `--resume`/`--execution-lane`이다. `development`만 help/version을 하위 command로 보존하며(`138–146`, `148–151`), `test/development-cli.test.ts:48-53`은 `a; echo secret`, `$(echo x)`를 shell 재해석 없이 그대로 전달하는 것을 고정한다.

### Help 및 public behavior

`helpText`(91–132)는 Native Workbench, Astra Execution Console, 호환 Router의 기능 경계를 명시한다. `test/cli.test.ts:75-81`은 Router의 native approval/sandbox/skill 비제공 문구와 provider model 범위를 검증한다. 버전은 `test/cli.test.ts:68-73`에서 package release 값으로 고정된다.

### Resume picker

CLI의 책임은 **언제** picker를 열지와 선택/취소 후 어느 app entry를 실행할지다.

- top-level `www --resume`: `200–208`, normal design으로 `runApp`을 실행한다.
- `www astra --resume`: `157–177`, Astra design으로 `runAstra`를 실행한다.
- picker 자체는 `src/adapters/inbound/tui/features/session/native-thread-picker.ts:20-90`가 소유한다. 이 module은 interactive TTY 확인, alt screen, SelectList, 종료 cleanup을 구현한다.
- `test/native-thread-picker.test.ts:20-35`은 UI 행/선택을, `test/cli.test.ts:133-146`과 `test/astra-shell.test.ts:124-139`은 CLI의 목록·선택·취소·실행 semantics를 각각 검증한다.

따라서 picker를 CLI로 옮기거나 CLI에서 TUI 인터페이스를 새로 만들면 feature의 process I/O와 lifecycle를 중복한다.

### Auth, Router, Astra dispatch

| 표면 | CLI의 역할 | 실제 기능/조립 소유자 |
|---|---|---|
| `auth` | argv 전달 (`152`) | `app.ts:51-55`가 auth controller와 `adapters/inbound/cli/auth-command.ts`를 조립한다. prompt/secret/console I/O는 auth-command다. |
| `router` | 제한된 문법 및 legacy id 검증 (`178–183`) | `legacy-router-app.ts:32-79`가 settings, credentials, model router, session, legacy shell을 조립한다. |
| `astra` | CLI options와 picker-aware resume policy (`157–177`) | `app.ts:49`가 `runApp`에 Astra design을 주입하고, `app.ts:12-48`가 Workbench session과 shell을 조립한다. |

## 깊은 module seam 평가

현재 가장 깊은 module은 이미 `runCli(args, dependencies): Promise<number>`이다. 하나의 호출로 문법, output, 오류/exit status, native/legacy 세션 구별과 launch를 제공하고, 내부의 구체적 process/TUI/app 구현은 `CliDependencies`에 감춘다. 삭제하면 test와 executable caller 양쪽에 command dispatch, picker flow, 출력 형식이 재출현하므로 실제 leverage가 있다.

### 추출하지 않을 것

| 후보 | 지금 분리하지 않는 근거 |
|---|---|
| `parseAstraArgs` | 한 호출자만 있고 12줄 남짓의 flag parsing이다. 별도 interface는 `RunAppOptions`와 오류 문자열을 다시 노출하는 얕은 wrapper가 된다. |
| `ResumePickerService` | picker implementation은 TUI-F007에 이미 있으며 CLI의 decision policy와 view lifecycle을 분리하면 두 module이 thread 목록/TTY/취소 semantics를 함께 알아야 한다. |
| `CliOutputFormatter` | sessions/threads/help가 세 종류뿐이다. formatter module은 output strings와 locale 규칙을 caller가 여전히 알아야 해 깊이가 없다. |
| `CommandRouter` | `runCli`과 동일한 switch 및 ports를 하나 더 만드는 이름만 바꾼 pass-through가 된다. |
| `cli.ts`를 `app.ts`로 병합 | `app.ts`의 production composition과 command/public I/O policy를 합쳐 LAYERS의 `app.ts` 역할 및 60행 composition gate를 깨뜨린다. |

### 조건부로 만들 seam

다음 중 하나가 실제로 생길 때만 `AstraLaunchRequest` module을 `adapters/inbound/cli/`에 추출한다.

1. Astra option 문법을 GUI/deep link/다른 executable도 소비한다.
2. `astra`에 독립적인 subcommand, mutually-exclusive options, config validation, 또는 dry-run이 추가된다.
3. 동일한 native resume policy가 세 번째 launcher에서 필요해진다.

그 때의 작은 external interface는 `resolveAstraLaunch(args, { listNativeThreads, selectNativeThread }): Promise<RunAppOptions | null>` 한 개면 충분하다. `null`은 취소, 오류는 현재 사용법 오류를 유지한다. 이것은 parsing과 picker-aware selection 전체를 숨기므로 실제 depth가 생긴다. 현재는 두 launch path가 같은 `runCli` body 안에 있고 사용자가 하나뿐이므로 이 seam은 가설이다.

## TUI feature / Unit 연결 후보

현재 TUI registry는 `TUI-F001`~`TUI-F016`을 제공하며, `TUI-F007`은 `session` interaction, `TUI-F014`는 `authentication` interaction이다. 반면 `.woo/units.yaml` 및 code-id catalog의 active Unit은 `Code-001`~`Code-005` 다섯 개뿐이며 CLI 또는 Session picker 전용 Unit은 없다. `bun run units:check`는 `5 Units · 32 Linear links · valid`를 보고했다.

| CLI capability | 현재 연결할 TUI feature | 현재 Unit/추적 | 후보 판정 |
|---|---|---|---|
| `--resume`, `astra --resume`, `threads` | **TUI-F007 Session** (`session.feature.ts:3-10`), picker는 `native-thread-picker.ts` | 전용 Code Unit 없음. `Code-002`/`Code-005`는 대화 lifecycle/thread 범위라 picker 자체를 대표하지 않는다. | TUI-F007에 연결만 유지한다. 독립 Unit을 만들지 않는다. |
| `auth status/login/logout` | **TUI-F014 Authentication** | 전용 Code Unit 없음; CLI auth command는 `app.ts` 조립 뒤 inbound CLI adapter다. | provider auth가 CLI와 overlay에서 공통 상태/flow module을 실제로 공유할 때만 "Authentication capability" Unit을 검토한다. |
| `astra` launch | 개별 TUI feature가 아니라 Astra design을 주입하는 shell/app entry | 전용 Unit 없음 | feature ID를 만들지 않는다. 이는 화면 기능이 아니라 launcher selection이다. |
| default Workbench launch | Chat **TUI-F002**, Dashboard **TUI-F001** 등 다수 feature의 shell 진입 | Code-004는 `runProjectWorkbenchShell` 입력/이동, Code-002/005는 lifecycle/thread 범위 | 다수 feature를 여는 composition action이므로 CLI 전용 Unit으로 중복 등록하지 않는다. |
| `router`, `sessions` | 현재 TUI feature registry 밖의 legacy compatibility surface | 전용 Unit 없음 | legacy Router가 계속 독립적으로 변할 때에만 legacy compatibility Unit을 검토한다. |
| `development`, `workflow` | TUI feature registry와 별개의 개발 기록/RPA command | traceability에서 `src/cli.ts`는 WOO-699 구현 위치로 연결됨 | 기존 WOO-699 연결을 유지한다. CLI facade만으로 새 Unit을 만들지 않는다. |

## 테스트 결합과 public CLI behavior

`runCli`을 직접 import하는 테스트는 `test/cli.test.ts`, `test/astra-shell.test.ts`, `test/development-cli.test.ts` 세 파일이다. 세 파일 모두 process globals를 mock하지 않고 `CliDependencies` fake를 주입한다. 이는 production wiring과 command policy를 분리한 좋은 test seam이다. Picker view는 `test/native-thread-picker.test.ts` 및 `test/astra-ui.test.ts`가 직접 다룬다.

이번 감사에서 아래를 실행했다.

```text
bun test test/cli.test.ts test/astra-shell.test.ts test/native-thread-picker.test.ts test/development-cli.test.ts test/architecture.test.ts
35 pass, 0 fail, 1959 expect() calls

bun run units:check
5 Units · 32 Linear links · valid · 4a5b0089fcb5000b498507a4e9cbeca5037841ab19f9ed9c9ca4f56ec231d2cc

git diff --check
pass
```

대상 source/test에서 `TODO`, `FIXME`, `test.skip`, `test.only`, `describe.skip`, `describe.only`, `it.skip`, `it.only`를 검색했으며 활성 placeholder는 없었다.

## 리팩터링 결론

**지금은 불필요.** Astra 추가는 현재 `CliDependencies.runAstra`, `writeAstraBootstrap`, `runCli`의 한 command branch, picker의 `design` argument라는 기존 seam에 정확히 들어왔다. 직전 diff도 `cli.ts` +42/-5행, `app.ts` +9/-4행, `test/cli.test.ts` +10/-1행, picker test import 경로 변경 한 건으로 제한된다. 관련 targeted test와 architecture gate가 통과했다.

주의할 구조적 신호는 `productionDependencies`의 Development/Workflow direct lazy import(`42–48`)뿐이다. 이는 `cli.ts`가 command별 composition을 약간 중복한다는 신호지만, 현재 각각 단일 CLI consumer이고 `runCli`의 public contract가 더 넓어지는 문제를 만들지 않는다. 해당 command가 TUI/HTTP/다른 executable에서 재사용되거나 CLI parsing이 확대될 때 `app.ts` 또는 `adapters/inbound/cli` 아래의 실제 deep module로 승격할 근거가 생긴다. 그 전에는 현재 단일 deep CLI adapter를 유지하는 편이 public behavior와 test locality를 보존한다.

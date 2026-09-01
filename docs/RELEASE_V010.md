# WWW v0.1.0 릴리스 절차

이 릴리스는 개인 프로젝트 폴더에서 실행하는 로컬 CLI/TUI의 첫 제품 기준선이다.
패키지는 계속 `private: true`이며, 자동 publish·commit·push를 수행하지 않는다.

## 사전 조건

- Bun 1.4.x 이상
- Git
- Codex CLI 로그인(App Server 대화를 사용할 때)
- macOS에서는 Terminal/iTerm2, Windows에서는 Windows Terminal 또는 동등한
  ANSI/UTF-8 터미널

## 새 설치

```sh
git clone <repository-url> www
cd www
bun install --frozen-lockfile
bun run check
bun test
bun run release:gate -- --platform-check
bun start
```

Windows PowerShell에서도 같은 `bun` 명령을 실행한다. 작업 데이터는 프로젝트의
`.www/` 아래에 보관되므로 설치 디렉터리와 작업 디렉터리를 혼동하지 않는다.

## 업데이트

작업 중인 `.www/`와 로컬 변경을 먼저 백업한 뒤, 현재 ref를 기록한다.

```sh
git status --short --branch
git rev-parse --short HEAD
git fetch --tags origin
git pull --ff-only
bun install --frozen-lockfile
bun run check
bun test
```

`git pull`이 충돌하거나 로컬 변경이 있으면 자동 병합하지 않고 중단한다. 업데이트
후에는 `www --help` 또는 `bun start`로 진입 smoke를 수행한다.

## 롤백

업데이트 직전에 기록한 ref 또는 알려진 정상 tag를 사용한다. 작업 데이터 보존을
위해 먼저 `.www/`를 별도 위치에 복사한다.

```sh
git status --short --branch
git log -1 --oneline
git switch --detach <known-good-ref>
bun install --frozen-lockfile
bun run check
bun test
```

롤백은 코드 ref만 되돌린다. `.www/`의 session, Todo, T-note를 임의로 삭제하거나
덮어쓰지 않는다. 복구가 끝나면 별도 브랜치에서 변경을 정리한다.

## 릴리스 gate

`release-gate`는 변경된 `package.json`, `src/`, `scripts/`, `test/`의 JS/TS 파일에서
placeholder/skip/only/미구현 흔적을 찾고, 각 Story evidence 파일의 존재와 판정 상태를
확인한다. evidence 디렉터리는 자동으로 만들거나 성공으로 채우지 않는다.

```sh
bun run release:gate -- \
  --evidence-dir /path/to/ep011-evidence \
  --story ST-011-06 --story ST-011-07 --story ST-011-08 \
  --story ST-011-09 --story ST-011-10 --story ST-011-11 \
  --story ST-011-12 --story ST-011-13
```

각 evidence 파일은 최소 한 줄의 `Status: PASS` 또는 `Status: BLOCKED`를 가져야
한다. `BLOCKED`/`FAIL`은 릴리스 차단이다. 사람이 실제로 확인하지 않은 macOS E2E와
Windows Terminal smoke는 PASS로 기록하지 않는다.

### 변경 범위 기준(`--base`)

- `--base`를 생략하면 gate는 `HEAD^..worktree` 범위를 검사한다. 즉 최신
  커밋과 staged/unstaged 변경을 함께 포함하며, untracked 파일도 별도로 포함한다.
- 부모 커밋이 없는 initial commit이나 shallow clone 경계처럼 `HEAD^`를 확인할 수
  없으면 전체 tracked 파일을 검사한다. 이때도 untracked 파일은 포함된다.
- 둘 이상의 커밋을 한 릴리스로 묶을 때는 기본값에 의존하지 말고 반드시
  `--base <last-release-tag-or-known-base>`를 지정한다. 이 값은 실제로 존재하는 마지막
  릴리스 tag 또는 검증된 기준 commit이어야 한다. 예를 들어 `v0.1.0` tag가 실제로
  생성된 뒤 다음 릴리스를 검증한다면 `--base v0.1.0`을 사용한다. 첫 릴리스인 현재
  v0.1.0에는 이전 tag가 없을 수 있으므로 존재하지 않는 가상 tag를 넣지 않는다.
- `--base HEAD`는 현재 worktree와 `HEAD` 사이만 비교한다. 따라서 commit 직후
  worktree가 clean이면 검사할 tracked 변경 범위가 비고 WARNING이 나온다. 릴리스
  전체 검증의 base로 사용하지 않는다.

여러 커밋 범위를 검증하는 명령의 형식은 다음과 같다. 꺾쇠 안의 값은 그대로
복사하는 문자열이 아니라, 위 기준에 따라 선택한 실제 ref로 바꾼다.

```sh
bun run release:gate -- \
  --base <last-release-tag-or-known-base> \
  --evidence-dir /path/to/ep011-evidence \
  --story ST-011-06 --story ST-011-07 --story ST-011-08 \
  --story ST-011-09 --story ST-011-10 --story ST-011-11 \
  --story ST-011-12 --story ST-011-13
```

## 플랫폼 검증

CI의 세 OS job은 install, typecheck, 전체 얇은 회귀 테스트, 플랫폼 파일/process
진입점을 실행한다.

```sh
bun run release:gate -- --platform-check
```

이 검사는 `path.join` 기반 경로 생성, 자식 process 종료/출력, CRLF 보존·정규화,
파일 읽기 이후 rename을 실제 임시 디렉터리에서 확인한다. 이것은 Windows Terminal
렌더링/input smoke를 대체하지 않는다.

## 수동 차단 체크

- [ ] macOS에서 13단계 E2E를 수행하고 로그/스크린샷 경로를 기록
- [ ] Windows Terminal에서 입력, ANSI/한글 렌더링, Ctrl-C/종료를 실제 수행
- [ ] ST-011-06~13 각각의 evidence 파일을 독립 검토자가 읽고 판정
- [ ] 위 evidence를 지정하여 `release:gate` 재실행
- [ ] 사용자가 release ref를 확인한 뒤에만 tag/publish/commit/push를 별도로 수행

자동화가 이 체크박스를 완료로 표시하지 않는다.

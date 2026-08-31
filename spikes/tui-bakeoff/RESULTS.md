# WES TUI Bake-off 결과

> 이 문서는 AI가 수행한 기술 Spike의 관측 기록이다. 사용자 승인 Decision이 아니다.

## 비교 범위

동일한 `fixtures/session-events.jsonl`을 사용해 다음 두 후보를 구현했다.

- Bubble Tea `v1.3.10`
- `@gajae-code/tui` `v0.15.5`

동일 화면 요소:

- WES Session header
- Conversation
- Live Execution
- Action / Decision / Evidence
- Composer
- Tab을 이용한 Conversation/Execution focus 전환

## 실행 방법

```sh
# Bubble Tea
cd bubbletea
go run . ../fixtures/session-events.jsonl

# Gajae TUI
cd gajae
bun src/main.ts ../fixtures/session-events.jsonl
```

두 구현 모두 `Tab`으로 활성 pane을 바꾸고 `q`로 종료한다. Bubble Tea 구현은 활성 pane에서 방향키 스크롤을 지원한다.

## 캡처

| 후보 | 120×40 | 80×24 | Execution focus |
| --- | --- | --- | --- |
| Bubble Tea | `captures/bubbletea-120x40.ansi` | `captures/bubbletea-80x24.ansi` | `captures/bubbletea-focus-execution.ansi` |
| Gajae TUI | `captures/gajae-120x40.ansi` | `captures/gajae-80x24.ansi` | `captures/gajae-focus-execution.ansi` |

ANSI 캡처는 원래 색상 escape를 보존한다. 일반 텍스트로 열어도 레이아웃을 읽을 수 있다.

## 직접 관측

### 120×40

- 두 후보 모두 동일한 정보 구조를 안정적으로 표시했다.
- Bubble Tea는 각 section을 독립 viewport로 구성하기 쉬웠다.
- Gajae TUI는 더 적은 prototype 코드로 같은 문서형 화면을 만들었다.
- 두 후보 모두 한글 샘플이 깨지지 않았다.

### 80×24

- Bubble Tea는 화면 높이를 정확히 24행으로 유지했다. 대신 위쪽 header와 Conversation 일부가 viewport 밖으로 밀려 캡처 시작점에서 보이지 않았다.
- Gajae TUI는 32행 문서를 terminal scrollback에 유지했다. 모든 내용은 보존됐지만 한 화면에 고정되지 않았다.
- 따라서 작은 화면에서 Bubble Tea는 **application-owned viewport**, Gajae TUI는 **terminal-owned document/scrollback** 성향이 나타났다.

### Focus 전환

- Bubble Tea 캡처에서 `Conversation ○`, `Live Execution ●`로 바뀌었다.
- Gajae TUI도 `setFocus(screen)`을 명시한 뒤 같은 전환이 확인됐다.
- Gajae TUI는 focus 등록을 하지 않으면 component의 `handleInput`이 호출되지 않는다.

## 구현 비용

측정 시점의 prototype 크기:

| 항목 | Bubble Tea | Gajae TUI |
| --- | ---: | ---: |
| 직접 작성 source files | 2 | 2 |
| 직접 작성 source lines | 195 | 108 |
| 실행 산출물 | 4,978,034-byte 단일 바이너리 | Bun + npm dependencies |

`go.sum`, `bun.lock`, 설치 dependency와 생성 바이너리는 source line 집계에서 제외했다.

## 판단

### Bubble Tea가 더 나은 경우

- 독립 pane과 application-owned scrolling이 핵심일 때
- Agent runtime과 UI를 프로세스 경계로 분리할 때
- 단일 실행 파일 배포가 중요할 때
- WES 이벤트를 Elm식 `Model → Update → View`로 엄격히 투영할 때

### Gajae TUI가 더 나은 경우

- GJC session/tool/runtime과 같은 TypeScript 프로세스에서 바로 결합할 때
- terminal scrollback을 원본 실행 기록의 주요 표면으로 사용할 때
- 최소 코드로 GJC의 Markdown·Editor·autocomplete·IME 지원을 재사용할 때

## 현재 기술 판정

**외형만으로 승자를 고를 수 없다.** 두 후보의 결정적 차이는 화면 철학이다.

```text
Bubble Tea = 고정된 앱 viewport 안에서 pane을 관리
Gajae TUI  = 터미널 scrollback에 이어지는 문서를 관리
```

사용자가 Git/Bash 원문을 크게 실시간으로 보고 터미널 기본 scrollback도 중시한다면 Gajae TUI가 자연스럽다. Conversation과 Live Execution을 항상 독립적으로 고정·스크롤하고 싶다면 Bubble Tea가 자연스럽다.

다음 채택 판단은 실제로 선호하는 작은 화면 동작을 보고 내려야 한다. 이 결과는 Proposal/Evidence이며 Accepted Decision이 아니다.

## 검증 명령

```sh
(cd bubbletea && go test ./... && go build -o wes-bubbletea .)
(cd gajae && bunx tsc --noEmit --module esnext --moduleResolution bundler --target esnext --types bun src/main.ts)
```

추가 동작 검증은 tmux `120×40`, `80×24` 세션에서 부팅, Tab focus 전환, `q` 종료와 ANSI capture로 수행했다.

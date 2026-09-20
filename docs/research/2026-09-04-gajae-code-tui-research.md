# Gajae Code 터미널·TUI 외부 조사

- 조사일: 2026-09-04 (Asia/Seoul)
- 조사 대상: `Yeachan-Heo/gajae-code`
- 고정 기준: commit [`bf188c1cda0665219f8af2edbed1256eede317bc`](https://github.com/Yeachan-Heo/gajae-code/tree/bf188c1cda0665219f8af2edbed1256eede317bc), 패키지 버전 `0.16.1`
- 범위: 프로젝트 식별, 터미널 화면 구조, 렌더러, 색상·테마, 구문 강조, HUD/status line, 입력·출력·상태 표시, TUI 요소, 확장성
- 증거 정책: 공식 저장소의 문서와 소스만 판정 근거로 사용했다. npm/공식 사이트는 프로젝트 식별 보조 근거다.

## 1. 공개 프로젝트 식별

사용자가 말한 **Gajae Code**는 거의 확실하게 GitHub의 [`Yeachan-Heo/gajae-code`](https://github.com/Yeachan-Heo/gajae-code)다.

식별 근거:

1. 공식 README는 제품명을 `Gajae-Code`, 실행 명령을 `gjc`, 성격을 “외부 코딩 에이전트 하네스”로 설명한다. [README.ko.md](https://github.com/Yeachan-Heo/gajae-code/blob/bf188c1cda0665219f8af2edbed1256eede317bc/README.ko.md)
2. npm의 `gajae-code`, `@gajae-code/coding-agent`, `@gajae-code/tui`가 모두 같은 저장소를 가리킨다. 특히 `@gajae-code/tui`는 “differential rendering과 synchronized output을 갖춘 minimal terminal UI framework”라고 명시한다. [TUI README](https://github.com/Yeachan-Heo/gajae-code/blob/bf188c1cda0665219f8af2edbed1256eede317bc/packages/tui/README.md)
3. 공식 사이트가 `gjc`, Native & TUI, 터미널 pet, theme를 제품 기능으로 노출한다. [공식 사이트](https://gajae-code.com/)

혼동 가능한 후보:

- [`devswha/gajae-code-app`](https://github.com/devswha/gajae-code-app)은 Gajae Code 세션을 다루는 별도 데스크톱·self-hosted 인터페이스다. 본체 CLI/TUI 구현이 아니다.
- 검색 결과의 오래된 `gajaE` Java 코드 생성 연구는 이름만 유사한 별개 프로젝트다.
- 따라서 아래 분석은 `Yeachan-Heo/gajae-code` 본체만 대상으로 한다.

## 2. 한눈에 보는 터미널 구조

GJC는 전통적인 alternate-screen 풀스크린 앱이라기보다 **터미널의 네이티브 스크롤백을 보존하면서, 아래쪽 입력·상태 영역을 고정하는 대화형 transcript TUI**에 가깝다. coding-agent가 의미 있는 UI 트리를 만들고, 별도 `@gajae-code/tui` 엔진이 메시지 의미를 모른 채 `Component.render(width)` 결과를 페인트한다. 이 분리는 공식 내부 문서의 명시적 경계다. [TUI runtime internals](https://github.com/Yeachan-Heo/gajae-code/blob/bf188c1cda0665219f8af2edbed1256eede317bc/docs/tui-runtime-internals.md)

실제 direct-child 순서는 소스상 대략 다음과 같다.

```text
[welcome 또는 대화 transcript / IRC split view]
[pending messages]
[transient status: loader, retry, compaction]
[todo]
[BTW 작업]
────────────────────────────────────────────
[persistent status line + skill HUD + hook statuses]  ← bottom-pinned 경계
[hook widget: above]
[rounded-border multiline composer/editor]
[pixel pet floor]
[hook widget: below]
```

근거: `InteractiveMode`가 `statusLine → hookWidgetAbove → editorContainer → petFloor → hookWidgetBelow` 순서로 추가하고 `statusLine`을 bottom-pinned component로 지정한다. [interactive-mode.ts#L872-L889](https://github.com/Yeachan-Heo/gajae-code/blob/bf188c1cda0665219f8af2edbed1256eede317bc/packages/coding-agent/src/modes/interactive-mode.ts#L872-L889)

이 구조의 중요한 성질:

- 상태선 이후의 direct children 전체가 수동 history scrolling 중에도 바닥에 고정된다.
- transcript만 남은 높이 안에서 움직인다.
- 좁은 높이에서는 decorative pet/저우선순위 행을 먼저 버리고, 포커스된 editor와 status content를 보존한다.
- overlay는 별도 stack으로 합성되고, 숨겨지면 포커스를 이전 overlay나 원래 컴포넌트로 복구한다.

## 3. TUI 엔진과 렌더링

### 3.1 컴포넌트 모델

핵심 인터페이스는 작다.

```ts
interface Component {
  render(width: number): string[];
  handleInput?(data: string): void;
  handleMouse?(event: MouseEvent): void;
  invalidate(): void;
  dispose?(): void;
}
```

컴포넌트는 폭을 받아 ANSI가 포함된 행 배열을 반환하며, 각 행은 terminal width를 넘지 않아야 한다. 포커스, overlay, hardware cursor marker, render revision, lifecycle cleanup은 엔진 레벨 계약으로 더해진다. [tui.ts#L221-L317](https://github.com/Yeachan-Heo/gajae-code/blob/bf188c1cda0665219f8af2edbed1256eede317bc/packages/tui/src/tui.ts#L221-L317)

내장 컴포넌트에는 `Container`, `Box`, `Text`, `TruncatedText`, single-line `Input`, multiline `Editor`, `Markdown`, `Loader`, `CancellableLoader`, `SelectList`, `SettingsList`, `Spacer`, `Image`, `TabBar`, pixel pet가 있다. [packages/tui/src/components](https://github.com/Yeachan-Heo/gajae-code/tree/bf188c1cda0665219f8af2edbed1256eede317bc/packages/tui/src/components)

### 3.2 repaint 전략

렌더 요청은 `process.nextTick` 단위로 합쳐진다. 렌더 파이프라인은 component tree 렌더 → overlay 합성 → cursor marker 추출 → ANSI/OSC line terminator 부착 → repaint 방식 선택 → hardware cursor 재배치 순이다.

- steady state: 변경된 line range만 patch하고, 줄어든 trailing line을 clear한다.
- width/height 변경, 강제 렌더, live viewport 위쪽 변경: 실제 process terminal에서는 **현재 viewport만 repaint**해 네이티브 scrollback을 지우거나 재생하지 않는다.
- markerless virtual/headless terminal: 일반 redraw에서 full clear/replay 가능.
- 모든 쓰기는 기본적으로 `CSI ?2026h` / `CSI ?2026l` synchronized-output frame으로 감싸 tearing/flicker를 줄인다. 환경변수 `GJC_TUI_SYNCHRONIZED_OUTPUT=0`으로 끌 수 있다. [tui.ts#L1225-L1227](https://github.com/Yeachan-Heo/gajae-code/blob/bf188c1cda0665219f8af2edbed1256eede317bc/packages/tui/src/tui.ts#L1225-L1227), [TUI runtime internals](https://github.com/Yeachan-Heo/gajae-code/blob/bf188c1cda0665219f8af2edbed1256eede317bc/docs/tui-runtime-internals.md)

장시간 세션에는 virtual viewport 최적화가 있다. 폭과 off-screen raw prefix가 그대로이면 terminal rows + overscan만 normalize/diff해 매 프레임 `O(total transcript)` 작업을 피한다. 다만 off-screen edit, width change, forced render, first frame에서는 full path로 돌아간다.

### 3.3 scrollback과 수동 viewport

`PageUp/PageDown` 또는 mouse wheel로 transcript history를 읽는 동안 status/composer가 고정된다. semantic anchor를 유지해 streaming, contraction, reflow 중에도 읽던 위치를 보존한다. 새 semantic output이 생기면 정확히 `New output — type to follow`를 표시하며, 단순 theme/geometry 변화에는 띄우지 않는다. composer 입력을 시작하거나 live-follow를 요청하면 최신 출력으로 복귀한다. [TUI README: Manual viewport](https://github.com/Yeachan-Heo/gajae-code/blob/bf188c1cda0665219f8af2edbed1256eede317bc/packages/tui/README.md#manual-viewport-and-pinned-suffix)

mouse 지원은 opt-in이며 wheel, click, drag, release를 SGR mouse report로 해석한다. 반복 클릭은 자체 시간 측정으로 char → word → line selection으로 승격하며, wide grapheme를 쪼개지 않도록 grapheme-aligned column을 사용한다. [tui.ts#L221-L245](https://github.com/Yeachan-Heo/gajae-code/blob/bf188c1cda0665219f8af2edbed1256eede317bc/packages/tui/src/tui.ts#L221-L245)

## 4. 입력 영역과 키보드 경험

기본 composer는 rounded closed border, 좌우 padding, input prefix, placeholder를 가진 multiline editor다. [interactive-mode.ts#L266-L275](https://github.com/Yeachan-Heo/gajae-code/blob/bf188c1cda0665219f8af2edbed1256eede317bc/packages/coding-agent/src/modes/interactive-mode.ts#L266-L275)

주요 기능:

- multiline editing, word wrap, undo, history
- `/` command autocomplete
- `Tab` 기반 file path completion (`~/`, `./`, `../`, `@` attachment prefix 포함)
- 10행을 넘는 large paste를 `[paste #N +M lines]` marker로 접는 bracketed-paste 처리
- fake cursor와 선택적인 hardware cursor. hardware cursor marker는 IME candidate window 위치를 맞추는 용도다.
- Kitty keyboard protocol을 질의하고, 불가하면 xterm `modifyOtherKeys` fallback을 쓴다. 단 Windows와 Apple Terminal에서는 CJK/한글 IME 파손을 피하려 fallback을 건너뛴다.
- `!` prefix는 bash mode, `$` prefix는 python mode로 전환하며 editor border 색도 mode token으로 바뀐다.
- keybinding은 user remap과 extension 추가를 반영하고 `/hotkeys`가 실제 runtime binding의 권위 있는 뷰다. [keybindings.md](https://github.com/Yeachan-Heo/gajae-code/blob/bf188c1cda0665219f8af2edbed1256eede317bc/docs/keybindings.md)

## 5. 출력과 대화 표현

### 5.1 assistant/markdown

assistant 출력은 streaming 중 같은 `Markdown` 인스턴스를 재사용해 text만 갱신한다. heading, link, URL, inline code, fenced code, quote, horizontal rule, list bullet, bold/italic/strike/underline가 각각 theme token을 가진다. Markdown lexer와 syntax highlighting 결과에는 bounded cache가 있으며 theme 변경 시 stale style을 피하려 cache를 비운다. [markdown.ts](https://github.com/Yeachan-Heo/gajae-code/blob/bf188c1cda0665219f8af2edbed1256eede317bc/packages/tui/src/components/markdown.ts), [assistant-message.ts#L313-L356](https://github.com/Yeachan-Heo/gajae-code/blob/bf188c1cda0665219f8af2edbed1256eede317bc/packages/coding-agent/src/modes/components/assistant-message.ts#L313-L356)

### 5.2 tool call/result

도구 출력은 pending/success/error background, title/output, diff added/removed/context 같은 semantic token으로 구분한다. tool별 renderer가 존재해 diff, JSON tree, status lines, browser/computer/gh/edit/LSP 등 richer output을 만들 수 있다. 연속 read tool call은 하나의 visual block으로 group한다. [renderers.ts](https://github.com/Yeachan-Heo/gajae-code/blob/bf188c1cda0665219f8af2edbed1256eede317bc/packages/coding-agent/src/tools/renderers.ts), [TUI runtime internals: Streaming](https://github.com/Yeachan-Heo/gajae-code/blob/bf188c1cda0665219f8af2edbed1256eede317bc/docs/tui-runtime-internals.md#streaming-and-incremental-ui-updates)

### 5.3 transient 상태

`statusContainer`에는 agent loader, retry loader, auto-compaction loader 같은 transient 상태가 들어간다. 기본 loader는 80ms 주기로 frame을 바꾸며 render를 요청한다. retry/compaction 중 Escape handler를 임시 교체해 해당 작업을 취소하고 종료 시 원래 handler를 복구한다.

## 6. 색상·테마 체계

### 6.1 semantic token 설계

테마는 단순한 accent 몇 개가 아니라 UI 의미별로 분리된 계약이다. 현재 필수 token은 대략 다음 군으로 나뉜다.

- core: accent, border variants, success/error/warning, text/muted/dim/thinking
- background: selection, user/custom message, tool pending/success/error, status line
- markdown 10종
- diff 3종 + syntax 9종
- thinking effort/mode border
- status line segment 14종

모든 custom theme color token은 필수이며 Zod runtime schema로 검증된다. 값은 hex, 0–255 palette index, recursive variable reference, terminal default를 의미하는 빈 문자열을 허용한다. [theme.md](https://github.com/Yeachan-Heo/gajae-code/blob/bf188c1cda0665219f8af2edbed1256eede317bc/docs/theme.md), [theme-schema.json](https://github.com/Yeachan-Heo/gajae-code/blob/bf188c1cda0665219f8af2edbed1256eede317bc/packages/coding-agent/src/modes/theme/theme-schema.json)

### 6.2 기본 팔레트와 migration themes

기본 dark theme는 `red-claw`, light slot은 `blue-crab`이다.

- red-claw: 거의 검정에 가까운 red/brown surface, shell-white text, bright coral claw accent, deep-red border/status background, kelp green additions, 별도 danger/diff-removal red.
- blue-crab: navy/abyss surface, pale blue-white text, cyan claw accent, ocean blue border/status background, mint/seafoam success와 coral danger.

그 밖에 `claude-code`, `codex`, `opencode`, `gruvbox-dark`, `ouroboros` 같은 bundled theme가 소스에 있다. `claude-code`, `codex`, `opencode`는 익숙한 도구에서의 eye-migration을 위한 팔레트로 공식 문서가 명시한다. [theme defaults](https://github.com/Yeachan-Heo/gajae-code/tree/bf188c1cda0665219f8af2edbed1256eede317bc/packages/coding-agent/src/modes/theme/defaults)

상징 체계도 theme 일부다. `unicode`, `nerd`, `ascii` preset과 개별 override가 있으며 status, navigation, tree, boxes, separators, model/plan/goal/git/token/context/subagent icon, 언어별 icon까지 중앙화돼 있다. 사용자 `symbolPreset`이 theme preset보다 우선한다. [theme.ts#L48-L216](https://github.com/Yeachan-Heo/gajae-code/blob/bf188c1cda0665219f8af2edbed1256eede317bc/packages/coding-agent/src/modes/theme/theme.ts#L48-L216)

### 6.3 terminal 적응과 live switching

- `COLORTERM`, `WT_SESSION`, `TERM`으로 truecolor/256-color mode를 선택한다.
- dark/light 자동 선택은 OSC 11 background luminance → `COLORFGBG` → 알려진 macOS/Zellij fallback → dark 순이다.
- `/theme`은 selector를 열고 live preview를 제공하며 `/theme <name>`은 즉시 적용·저장한다.
- custom theme는 기본 `~/.gjc/agent/themes`에 두며 현재 파일을 watch해 성공한 변경만 live reload한다.
- theme 변경은 status line, editor border, chat를 즉시 다시 렌더한다.
- color-blind mode는 현재 diff-added green만 blue 쪽으로 HSV shift한다. 즉 전면적인 색각 보정은 아니다.

## 7. 구문 하이라이팅

GJC의 fenced-code highlighting은 JavaScript 정규식 수준이 아니라 lazy-loaded `@gajae-code/natives`의 native highlighter를 쓴다. theme은 다음 semantic token을 native binding에 넘긴다: comment, keyword, function, variable, string, number, type, operator, punctuation, inserted, deleted. 언어가 지원 목록에 있으면 해당 언어를 넘기고, 아니면 language undefined fallback으로 처리한다. native binding이 없거나 throw하면 plain themed text로 degrade한다. [theme.ts#L2406-L2469](https://github.com/Yeachan-Heo/gajae-code/blob/bf188c1cda0665219f8af2edbed1256eede317bc/packages/coding-agent/src/modes/theme/theme.ts#L2406-L2469)

Markdown code block은 fence label을 별도 border style로 표시하고, 너무 큰 block에서는 하이라이팅을 건너뛰었다는 sentinel을 보여 준다. 이는 대형 생성 코드가 TUI 반응성을 잡아먹는 것을 막는 명시적 방어다. [markdown.ts#L359-L386](https://github.com/Yeachan-Heo/gajae-code/blob/bf188c1cda0665219f8af2edbed1256eede317bc/packages/tui/src/components/markdown.ts#L359-L386)

## 8. Status line과 HUD

### 8.1 persistent status line

Status line은 고정된 문자열이 아니라 segment registry + preset + separator + width-aware allocation 구조다.

내장 preset:

- `default`: model/mode/git/PR/path | session name/jobs/token rate/cost
- `default-usage`: 위 구성 + provider usage
- `minimal`: path/git | session/jobs/mode/context%
- `compact`: model/mode/git/PR | session/jobs/cost
- `full`: host/model/mode/path/git/PR/subagents | session/jobs/input/output/rate/cache/cost/time
- `nerd`: Nerd Font icon을 활용한 가장 풍부한 구성
- `ascii`: Nerd Font 의존 없는 구성
- `custom`: 좌우 segment와 separator를 사용자 지정

[presets.ts](https://github.com/Yeachan-Heo/gajae-code/blob/bf188c1cda0665219f8af2edbed1256eede317bc/packages/coding-agent/src/modes/components/status-line/presets.ts)

표현 가능한 상태는 model과 thinking effort, context %, fast mode, Plan/Goal 및 pause, cwd/scratch dir, git branch와 staged/unstaged/untracked count, 현재 PR(OSC 8 clickable hyperlink), subagent count, background monitor/cron/folded job과 실패, token in/out/rate/cache, 비용 또는 subscription/premium request, provider quota usage, session name/id, elapsed/current time, hostname 등이다. [segments.ts](https://github.com/Yeachan-Heo/gajae-code/blob/bf188c1cda0665219f8af2edbed1256eede317bc/packages/coding-agent/src/modes/components/status-line/segments.ts)

Git branch/status는 1초 cache와 `.git/HEAD` watcher, provider usage는 5분 cache를 두어 status bar 자체가 과도한 I/O를 만들지 않게 한다. action registry와 현재 focus domain을 보고 가용 단축키 hint도 폭 안에 whole-token 단위로 배치한다. [tool-status-header.ts#L33-L146](https://github.com/Yeachan-Heo/gajae-code/blob/bf188c1cda0665219f8af2edbed1256eede317bc/packages/coding-agent/src/modes/components/tool-status-header.ts#L33-L146)

### 8.2 workflow skill HUD

별도의 skill HUD는 `deep-interview`, `ralplan`, `ultragoal`, `autoresearch` 같은 workflow의 phase/metric/gate를 persistent status 영역에 투영한다.

- 최대 2 physical rows
- 폭 tier: wide ≥100, medium ≥60, tight <60
- wide: skill:phase + summary + 모든 chip
- medium: 핵심 metric 하나 중심
- tight: skill 이름과 심각도 중심
- error/blocked/warning glyph는 폭 부족 때도 mandatory token으로 최대한 보존
- planning pipeline은 중복 노출을 collapse
- overflow는 ellipsis로 표시

[skill-hud/render.ts](https://github.com/Yeachan-Heo/gajae-code/blob/bf188c1cda0665219f8af2edbed1256eede317bc/packages/coding-agent/src/modes/components/skill-hud/render.ts)

각 workflow는 UI 문자열을 임의 생성하지 않고 state → versioned HUD chips로 derive한다. 예를 들어 deep-interview는 phase, ambiguity/threshold, round, target, weakest dimension, spec status를, ralplan은 stage/iteration/reviewer pass/verdict/handoff를, ultragoal은 goal count/current/gate/blocked 상태를 제공한다. [workflow-hud.ts](https://github.com/Yeachan-Heo/gajae-code/blob/bf188c1cda0665219f8af2edbed1256eede317bc/packages/coding-agent/src/skill-state/workflow-hud.ts)

### 8.3 hook/extension status

Status line은 key별 hook status를 받아 stable order로 표시할 수 있다. 이는 확장 기능이 자기 상태를 persistent chrome에 주입하는 seam이다. 단 줄바꿈·탭은 sanitize하고 terminal width에 맞춰 제한한다. [tool-status-header.ts#L149-L240](https://github.com/Yeachan-Heo/gajae-code/blob/bf188c1cda0665219f8af2edbed1256eede317bc/packages/coding-agent/src/modes/components/tool-status-header.ts#L149-L240)

## 9. 그 밖의 TUI 요소

- overlay/selector: model/theme/settings/session/queued-message 등 선택 UI를 main transcript 위에 합성하고 focus stack을 유지한다.
- inline images: Kitty, iTerm2, Sixel protocol 감지/강제 선택을 지원한다. renderer는 raster lease와 invalidation/erase transaction까지 관리해 text repaint와 이미지 영역 충돌을 통제한다.
- terminal pets: 16×16 pixel animation을 status/composer 하단에 렌더한다. 공식 사이트는 RedGajae/BlueGajae/Ouroboros와 idle/working/signature animation을 노출한다. terminal height가 부족하면 우선 희생되는 장식 요소다.
- hyperlinks: terminal capability가 있으면 PR/Markdown URL 등에 OSC 8 hyperlink를 쓴다. 각 line terminator가 OSC 8을 닫아 다음 행으로 link style이 새지 않게 한다.
- notifications: agent completion/approval/ask에 terminal BEL과 외부 notification integration을 사용할 수 있다.
- suspend/background: Ctrl+Z 또는 `/background`는 TUI를 정지하고 POSIX job control로 넘기며 resume 시 강제 repaint한다.

## 10. 확장성 구현

확장성은 여러 층이다.

1. **TUI package 재사용**: `@gajae-code/tui` 자체가 공개 package이며 Terminal interface만 구현하면 `ProcessTerminal` 대신 headless/virtual terminal에서도 component tree를 돌릴 수 있다.
2. **custom components/renderers**: extension/hook custom message renderer가 `Component`를 반환할 수 있다. 실패하거나 아무것도 반환하지 않으면 `[customType]` label + themed Markdown frame으로 안전하게 fallback한다. [message-frame.ts](https://github.com/Yeachan-Heo/gajae-code/blob/bf188c1cda0665219f8af2edbed1256eede317bc/packages/coding-agent/src/modes/components/message-frame.ts)
3. **hook widgets/status**: editor 위·아래 widget container와 status-line hook status를 통해 persistent UI에 삽입 가능하다.
4. **custom theme/symbol**: JSON theme, custom semantic colors, symbol preset/override, live reload.
5. **custom keybindings/actions**: extension action과 사용자 remap이 runtime `/hotkeys` 및 status action hint에 반영된다.
6. **loose extensions/hooks/MCP/skills와 bundle plugin**: project `.gjc/` 또는 user `~/.gjc/agent/`에 loose surface를 둘 수 있고, 배포 가능한 bundle은 manifest/hash/collision ownership/quarantine를 제공한다. 다만 bundle은 기존 4개 workflow skill/role을 확장할 뿐 새 top-level workflow를 등록하지 못한다. [gjc-plugins.md](https://github.com/Yeachan-Heo/gajae-code/blob/bf188c1cda0665219f8af2edbed1256eede317bc/docs/gjc-plugins.md)

보안상 중요한 제한: distributable plugin hook의 supplied GJC API는 `exec`, `sendMessage`, renderer/command registration 등을 막지만, 모듈은 같은 Bun process에 import되므로 OS sandbox는 아니다. 설치 plugin은 trusted executable code로 봐야 한다. [hooks.md](https://github.com/Yeachan-Heo/gajae-code/blob/bf188c1cda0665219f8af2edbed1256eede317bc/docs/hooks.md)

## 11. 설계상 강점

1. **scrollback 친화적 TUI**: transcript UX와 terminal-native history를 동시에 살리면서 status/composer를 sticky하게 유지한다.
2. **렌더 효율이 다층적**: tick coalescing, differential line patch, viewport repaint, virtual viewport, component/Markdown cache, async 상태 cache가 겹쳐 있다.
3. **의미 기반 시각 언어**: theme가 단순 팔레트가 아니라 message/tool/diff/syntax/status/mode 의미를 분리한다.
4. **상태 가시성이 매우 높음**: model, context, cost, git, PR, jobs, subagents, plan/goal/workflow gate가 같은 status rail에 연결된다.
5. **좁은 화면 degradation이 구체적**: HUD tier, mandatory severity, pinned suffix 우선순위, max row, ellipsis가 명시돼 있다.
6. **IME·터미널 호환성에 신경 쓴다**: hardware cursor marker, fragmented escape buffering, Kitty protocol, CJK fallback 예외, truecolor/256-color, multiplexer 경로가 있다.
7. **확장 seam이 시각 표면까지 이어진다**: custom renderer, widget, hook status, theme, action hint가 별개 island가 아니라 공통 component/theme 계약을 쓴다.
8. **테스트 가능성**: `VirtualTerminal`과 headless xterm 경로, render revision, metrics, 고정된 component interface가 있다.

## 12. 약점·트레이드오프·주의점

1. **복잡도가 높다**: native scrollback + sticky suffix + manual semantic anchors + overlay + raster images + mouse selection을 한 renderer가 책임진다. 기능은 강하지만 유지보수 표면과 terminal별 edge case가 매우 크다.
2. **terminal capability 편차가 곧 UX 편차다**: OSC 11, CSI 2026, Kitty keyboard, image protocol, OSC 8 지원 여부에 따라 보이는 결과와 입력 품질이 달라진다.
3. **상태선 정보 과밀 위험**: full/nerd preset과 skill HUD, hook status, action hints를 동시에 쓰면 좁은 창에서 요약/생략이 많아진다. width-aware 정책은 이를 완화하지만 정보 구조 자체는 무겁다.
4. **custom theme 작성 비용**: 모든 필수 color token을 채워야 해 엄격하고 안전한 대신 소규모 customization 진입비용이 크다.
5. **색각 접근성은 제한적**: 현 color-blind mode는 `toolDiffAdded` 한 token만 이동시킨다. status severity와 전체 팔레트의 shape/pattern redundancy를 보장하는 포괄 모드는 아니다.
6. **native binding 의존**: syntax highlighter와 일부 terminal 기능은 `@gajae-code/natives`가 없으면 degrade한다. graceful fallback은 있지만 visual fidelity/성능이 동일하지 않다.
7. **headless/real terminal 경로 차이**: 실제 terminal은 scrollback 보존 때문에 viewport repaint, headless는 clear/replay를 쓸 수 있어 byte-level 동작이 완전히 같지는 않다.
8. **plugin은 진짜 sandbox가 아니다**: API가 constrained여도 ambient Bun/JS 권한이 남는다.
9. **일부 `PI_` 환경변수/legacy alias가 남음**: `PI_TUI_VIRTUAL_VIEWPORT`, `PI_TUI_METRICS`, legacy `pi` status segment 같은 흔적은 Pi 계보/porting의 기술 부채 또는 호환성 표면으로 보인다. 이는 소스에서 확인되는 사실이며, 현재 제품명과의 일관성 관점에서 주의할 부분이다.
10. **빠르게 움직이는 beta**: 조사 당일 remote HEAD는 package 0.16.1이고 npm 검색 결과도 단기간 다수 release를 보였다. 비교 시 반드시 commit을 고정해야 한다.

## 13. 우리 구조와 비교할 때 사용할 체크리스트

아래 질문에 답하면 기능 유무 나열보다 구조 차이를 정확히 드러낼 수 있다.

| 비교 축 | Gajae Code 기준 질문 |
|---|---|
| 화면 소유권 | alternate screen인가, native scrollback+sticky suffix인가 |
| 렌더 단위 | full frame인가, line diff인가, component/subtree revision이 있는가 |
| 장시간 세션 | 전체 transcript를 매번 다루는가, virtual viewport가 있는가 |
| 상태 모델 | 문자열을 직접 찍는가, domain state→versioned HUD projection인가 |
| status rail | model/context/cost/git/jobs/subagent/workflow 중 무엇이 실시간인가 |
| 좁은 폭 | 단순 truncate인가, tier/priority/mandatory severity 정책이 있는가 |
| 색상 | raw ANSI인가, semantic token schema인가, custom theme validation이 있는가 |
| highlighting | Markdown과 source code가 분리되는가, language-aware native highlighter인가 |
| 입력 | multiline/history/paste/autocomplete/IME/keyboard protocol이 있는가 |
| overlay | focus stack·resize visibility·mouse routing이 있는가 |
| 확장 UI | status/widget/message renderer/action hint를 외부가 추가할 수 있는가 |
| terminal compatibility | tmux/Windows/macOS/CJK/image/OSC8/CSI2026 fallback이 있는가 |
| 접근성 | ASCII symbol, 색각 보정, 색 외 severity cue가 있는가 |
| 테스트 | virtual terminal, snapshot, width/resize/headless 경로를 검증하는가 |

## 14. 근거 신뢰도와 한계

- **높음**: component tree, render pipeline, status/HUD, theme schema, highlighting, extension renderer는 고정 commit의 upstream source로 직접 확인했다.
- **중간**: 실제 색의 체감, 좁은 terminal에서의 usability, terminal emulator별 flicker/IME 품질. 소스 계약은 확인했지만 이 조사에서는 여러 terminal에서 직접 실행·육안 QA하지 않았다.
- **주의**: 저장소가 빠르게 변화하고 있어 `main` 링크가 아니라 반드시 본 문서의 commit permalink로 비교해야 한다.
- **범위 밖**: Gajae Code App 데스크톱 UI, 실제 모델 품질, agent workflow 자체의 성능, SenPI/Pi/우리 구현과의 최종 상대평가.

## 15. 조사 종료 기준

프로젝트 식별, 화면 트리, 렌더·viewport, 입력, 출력, theme, syntax, status/HUD, TUI 부가요소, 확장성에 대해 모두 upstream 고정 commit 근거를 확보했다. 남은 핵심 공백은 “실제 terminal emulator별 육안/interaction 품질”뿐이며, 이는 코드 조사보다 별도 실행 QA 과제다.

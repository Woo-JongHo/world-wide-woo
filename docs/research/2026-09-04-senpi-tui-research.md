# SenPI/Senpi 터미널·TUI 조사

- 조사일: 2026-09-04
- 대상 저장소: [`code-yeongyu/senpi`](https://github.com/code-yeongyu/senpi)
- 고정 revision: [`f91130e0fa3c8f3db5a60301878cd3e0c5a869b7`](https://github.com/code-yeongyu/senpi/tree/f91130e0fa3c8f3db5a60301878cd3e0c5a869b7)
- 조사 범위: 식별, 화면 구조, 색상/테마, 구문 강조, HUD성 상태 표면, 입력/출력, 렌더러, 확장성, upstream Pi와의 관계
- 증거 등급: 공식 README·문서와 해당 revision의 upstream 소스만 사용. 아래의 “평가/시사점”은 이 증거에서 도출한 분석이다.

## 1. 정확한 식별

사용자가 말한 “SenPI/Senpi”에 가장 정확히 대응하는 공개 프로젝트는 `code-yeongyu/senpi`다. npm 사용자 패키지는 `@code-yeongyu/senpi`, 실행 명령은 `senpi`다. 프로젝트 스스로를 `badlogic/pi-mono`의 **experimental, opinionated, in-flight fork**이자 Dori의 coding-agent runtime으로 규정하며, upstream과 가까이 유지하되 curated builtin extensions와 core tweaks를 추가한다고 설명한다. 즉 독립 TUI 프레임워크를 새로 만든 제품이라기보다 Pi 계열의 모노레포와 `@earendil-works/pi-tui`를 계승·변형한 포크다. [README](https://github.com/code-yeongyu/senpi/blob/f91130e0fa3c8f3db5a60301878cd3e0c5a869b7/README.md)

주의할 점은 현재 문서와 코드에 `pi`, `senpi`, `@earendil-works/pi-*` 명칭이 혼재한다는 것이다. 이는 “별개의 SenPI UI 프레임워크”의 증거가 아니라 포크·리브랜딩의 흔적이다. 분석할 때 제품 표면은 Senpi, 기반 라이브러리는 Pi TUI 계열로 구분해야 한다.

## 2. 전체 화면 구조

### 2.1 두 가지 TUI 운용 모드

Senpi는 하나의 고정 화면 구조만 갖지 않는다.

| 모드 | 화면 소유권 | transcript | 입력·상태 영역 | 장점 | 비용/제약 |
|---|---|---|---|---|---|
| `regular` (기본) | 터미널 main screen | 터미널 자체 scrollback | transcript 뒤에 이어지는 composer/footer | 네이티브 scrollback·선택·iTerm2 이미지와 잘 맞음 | 입력/footer가 뷰포트 하단에 영구 고정되지 않음 |
| `fullscreen` (experimental) | 앱이 viewport 소유 | 앱 내부 scroll region | queued messages, working status, extension widgets, editor, footer를 하단에 고정 | IDE 같은 안정된 dock, 키보드·마우스/트랙패드 transcript 탐색 | alternate-screen/마우스 프로토콜 복잡성, iTerm2 이미지는 placeholder, 종료 출력 정책 필요 |

이 구분과 inline image 차이는 공식 usage 문서에 명시돼 있다. fullscreen에서는 Kitty/Ghostty의 Kitty graphics protocol 이미지는 지원하지만, iTerm2의 inline-image protocol은 앱 소유 scrolling 중 placement 삭제/crop이 불가능해 placeholder로 대체한다. [`usage.md` L263-L277](https://github.com/code-yeongyu/senpi/blob/f91130e0fa3c8f3db5a60301878cd3e0c5a869b7/packages/coding-agent/docs/usage.md#L263-L277)

개념적 화면 계층은 다음과 같다.

```text
regular
┌ terminal-owned scrollback ───────────────────────────┐
│ welcome / user / assistant / thinking / tool results │
│ queued messages / extension messages                 │
│ working or retry or compaction status                 │
│ extension widgets (above editor)                      │
│ editor/composer                                       │
│ extension widgets (below editor)                      │
│ footer/HUD                                            │
└───────────────────────────────────────────────────────┘

fullscreen
┌ app-owned viewport ───────────────────────────────────┐
│ scrollable transcript (+ search, scrollbar)           │
├ fixed bottom dock ────────────────────────────────────┤
│ queue / status / widgets / editor / widgets / footer  │
└───────────────────────────────────────────────────────┘
```

### 2.2 컴포넌트 모델

기본 추상화는 매우 작다. 각 컴포넌트는 `render(width): string[]`, 선택적인 `handleInput`, `invalidate`를 구현한다. 한 줄은 주어진 폭을 넘으면 안 되며 TUI는 각 줄 끝에 SGR/OSC 8 reset을 붙여 스타일 누출을 막는다. `Focusable`은 zero-width cursor marker로 하드웨어 커서를 실제 편집 위치에 놓아 IME 후보창 위치를 보정한다. 한국어 입력 관점에서 특히 중요한 설계다. [`tui.md` L9-L85](https://github.com/code-yeongyu/senpi/blob/f91130e0fa3c8f3db5a60301878cd3e0c5a869b7/packages/coding-agent/docs/tui.md#L9-L85)

공개 빌딩 블록에는 `Text`, `Box`, `Container`, `Spacer`, `Markdown`, `Input`, `Editor`, `SelectList`, `SettingsList`, stack/scroll 계열, loader, image/LaTeX 등이 있다. 컴포넌트가 문자열 line 배열을 반환하므로 React/DOM식 가상 트리보다 저수준이고, ANSI 폭·CJK·SGR 생명주기를 직접 이해해야 한다. 반대로 extension이 별도 UI 런타임 없이 같은 렌더 파이프라인에 바로 들어갈 수 있다. [TUI source index](https://github.com/code-yeongyu/senpi/blob/f91130e0fa3c8f3db5a60301878cd3e0c5a869b7/packages/tui/src/index.ts)

### 2.3 Grok chrome 변형

기본 chrome 외에 `grok` chrome 전략이 존재한다. 이는 editor factory, editor theme, footer, welcome content, working indicator, tool presentation, root arrangement를 교체하는 명시적 seam이다. Grok editor는 둥근 `╭─╮ / │ │ / ╰─╯` 입력 카드로 감싸며, transcript는 위쪽에 두고 입력 tail을 실제 화면 바닥에 붙이기 위해 남은 행 수만큼 spacer를 계산한다. footer에도 별도 surface background를 씌운다. [`grok/chrome.ts`](https://github.com/code-yeongyu/senpi/blob/f91130e0fa3c8f3db5a60301878cd3e0c5a869b7/packages/coding-agent/src/modes/interactive/grok/chrome.ts), [`grok/input-card.ts`](https://github.com/code-yeongyu/senpi/blob/f91130e0fa3c8f3db5a60301878cd3e0c5a869b7/packages/coding-agent/src/modes/interactive/grok/input-card.ts)

이 구조의 의미는 “스킨”이 색만 바꾸는 데 그치지 않고 화면 chrome과 tool presentation까지 전략으로 교체될 수 있다는 것이다. 다만 현재 공개 seam은 범용 layout DSL이라기보다 interactive mode가 정의한 전략 인터페이스에 가깝다.

## 3. 색상·테마

### 3.1 semantic token 체계

테마는 JSON이고, 문서상 51개 required token에 일부 optional fallback token을 더한다. 주요 그룹은 다음과 같다.

- Core UI 11: accent, border 계층, success/error/warning, muted/dim/text, thinking text
- Background/content: selection, search, user/custom message, tool pending/success/error, tool title/output
- Markdown 10: heading/link/URL/inline code/code block/fence/quote/rule/list bullet
- Diff 3: added/removed/context
- Syntax 9: comment/keyword/function/variable/string/number/type/operator/punctuation
- Thinking-level border: off/minimal/low/medium/high/xhigh/max
- Bash mode

색 값은 hex, ANSI 256 index, 빈 문자열(터미널 기본색), 또는 `vars` 참조가 가능하다. built-in `dark`, `light` 외에 Senpi revision에는 `grok-day`, `grok-night`도 소스에 포함된다. global `~/.senpi/agent/themes`, trusted project `.senpi/themes`, package manifest, settings, 반복 가능한 CLI `--theme`에서 발견한다. [`themes.md` L17-L169](https://github.com/code-yeongyu/senpi/blob/f91130e0fa3c8f3db5a60301878cd3e0c5a869b7/packages/coding-agent/docs/themes.md#L17-L169), [theme directory](https://github.com/code-yeongyu/senpi/tree/f91130e0fa3c8f3db5a60301878cd3e0c5a869b7/packages/coding-agent/src/modes/interactive/theme)

### 3.2 자동 선택과 hot reload

첫 실행 때 terminal background를 감지해 dark/light를 고르고, `lightTheme/darkTheme` 쌍으로 terminal appearance를 따라갈 수 있다. 현재 활성 custom theme file은 편집 시 hot reload된다. 테마는 JSON Schema validation을 사용하며 누락된 필수 토큰을 진단한다. [`themes.md` L30-L165](https://github.com/code-yeongyu/senpi/blob/f91130e0fa3c8f3db5a60301878cd3e0c5a869b7/packages/coding-agent/docs/themes.md#L30-L165), [`theme.ts` watcher](https://github.com/code-yeongyu/senpi/blob/f91130e0fa3c8f3db5a60301878cd3e0c5a869b7/packages/coding-agent/src/modes/interactive/theme/theme.ts#L864-L1011)

### 3.3 기본 dark 팔레트의 시각 문법

기본 dark는 cyan/blue를 경계·강조, green을 성공·code block·bash, red를 오류, yellow를 warning, 회색 단계를 보조·비활성 정보에 쓴다. 사용자 메시지, pending/success/error tool box, custom message에 서로 다른 어두운 배경을 두고, thinking level은 회색→청색→보라→magenta로 강도를 올린다. [`dark.json`](https://github.com/code-yeongyu/senpi/blob/f91130e0fa3c8f3db5a60301878cd3e0c5a869b7/packages/coding-agent/src/modes/interactive/theme/dark.json)

장점은 상태 의미와 색 이름이 분리된다는 점, 단점은 토큰 수가 많아 새 테마 진입비용이 높고 색각 이상/저색상 terminal에서 의미 중복 표현을 테마 작성자가 책임져야 한다는 점이다. 다행히 footer는 색만이 아니라 `$`, `%`, `(auto)`, `(SDK)`, `:thinking` 등의 텍스트 표지도 함께 쓴다.

## 4. Markdown·구문 하이라이팅·diff

Markdown 렌더링은 heading, link/URL, inline code, fenced code, quote, rule, list bullet, bold/italic/underline/strikethrough에 서로 다른 semantic style을 적용한다. 코드 fence에 유효한 언어명이 있을 때 `cli-highlight` 계열 highlighter와 9개 syntax token을 사용한다. 언어가 없거나 지원되지 않으면 자동 감지를 하지 않고 `mdCodeBlock` 단색으로 폴백한다. 소스 주석은 자동 감지가 영어 산문을 AppleScript/LiveCodeServer 등으로 오인하기 때문이라고 명시한다. 이것은 화려함보다 예측 가능성을 선택한 좋은 방어다. [`theme.ts` L1171-L1194, L1267-L1303](https://github.com/code-yeongyu/senpi/blob/f91130e0fa3c8f3db5a60301878cd3e0c5a869b7/packages/coding-agent/src/modes/interactive/theme/theme.ts#L1171-L1303)

파일 확장자 기반 언어 매핑은 TS/JS/Python/Rust/Go/Java/Kotlin/Swift/C/C++/C#/PHP/shell/PowerShell/SQL/web formats/JSON/YAML/TOML/Markdown/Dockerfile/Makefile/CMake/Lua/Perl/R/Scala/Clojure/Elixir/Erlang/Haskell/OCaml/Vim/GraphQL/Protobuf/HCL 등을 명시한다. [`theme.ts` L1196-L1265](https://github.com/code-yeongyu/senpi/blob/f91130e0fa3c8f3db5a60301878cd3e0c5a869b7/packages/coding-agent/src/modes/interactive/theme/theme.ts#L1196-L1265)

도구 diff는 added/removed/context 색을 별도로 갖고, tool box는 pending/success/error 배경을 구분한다. 따라서 “코드 자체의 구문”, “패치 의미”, “도구 실행 상태”가 서로 다른 색상 축이다. 이는 한 팔레트의 green/red를 무분별하게 공유하는 UI보다 정보 구조가 명확하지만, 동시에 좁은 terminal에서 배경 block이 시각적으로 무거워질 수 있다.

## 5. HUD에 해당하는 표면

Senpi 소스에서 독립된 `HUD`라는 단일 패널을 핵심 개념으로 쓰지는 않는다. 기능적으로는 아래 네 층이 HUD 역할을 분담한다.

### 5.1 Footer

기본 footer가 표시할 수 있는 정보:

- 현재 cwd (`HOME` 하위는 `~` 축약)
- git branch
- session name
- cache hit rate (`CHxx.x%`, hit rate가 10% 이상이고 cache 사용이 있을 때)
- 누적 cost 또는 subscription 표지
- context tokens / context window / percentage
- auto-compaction `(auto)`와 외부 SDK 위임 `(SDK)`
- provider와 다중 credential account suffix
- fast mode `⚡`
- model id와 thinking level

context는 70% 초과 warning, 90% 초과 error 색으로 변한다. model은 오른쪽 끝에 고정되고, provider prefix는 공간이 충분할 때만 보인다. [`footer.ts` L142-L245](https://github.com/code-yeongyu/senpi/blob/f91130e0fa3c8f3db5a60301878cd3e0c5a869b7/packages/coding-agent/src/modes/interactive/components/footer.ts#L142-L245)

좁은 폭 대응도 단순 truncate가 아니다. full → 오른쪽부터 middle stats 생략 → cwd 머리 생략(경로 tail 보존) → 왼쪽 전체 축약 → 최후에는 model label 자체 truncate 순의 width ladder를 갖는다. cwd/branch/context와 model을 anchor로 취급하고 중간 통계를 희생한다. [`footer-layout.ts`](https://github.com/code-yeongyu/senpi/blob/f91130e0fa3c8f3db5a60301878cd3e0c5a869b7/packages/coding-agent/src/modes/interactive/components/footer-layout.ts)

평가: “많이 보여주기”보다 우선순위 있는 graceful degradation이 강점이다. 반면 단일 행 문자열 HUD이므로 복수 agent, 병렬 task, 장기 workflow, permission queue 같은 다차원 상태를 동시에 시각화하기에는 한계가 있다. 그런 정보는 extension widgets로 올라가야 한다.

### 5.2 Working/retry/compaction 상태 행

working은 accent spinner + muted message, retry는 warning spinner와 `attempt/max`, 남은 초, cancel key를 표시한다. compaction은 reason별 문구, cancel hint, streamed progress tail을 한 줄에 폭 우선순위로 배치하고, 좁아지면 짧은 label로 전환한다. branch summary도 별도 상태다. [`status-indicator.ts`](https://github.com/code-yeongyu/senpi/blob/f91130e0fa3c8f3db5a60301878cd3e0c5a869b7/packages/coding-agent/src/modes/interactive/components/status-indicator.ts)

### 5.3 Extension status와 widgets

확장 API는 `setStatus(key,text)`로 footer의 지속 status segment를, `setWidget(key, ...)`로 editor 위/아래의 다중 행 widget을 제공한다. widget은 문자열 배열 또는 component factory일 수 있다. 확장은 working message/visibility/spinner frame, footer 전체, terminal title, editor text, tool expansion, editor component, theme, autocomplete provider까지 바꿀 수 있다. [`extensions.md` L2885-L2985](https://github.com/code-yeongyu/senpi/blob/f91130e0fa3c8f3db5a60301878cd3e0c5a869b7/packages/coding-agent/docs/extensions.md#L2885-L2985)

따라서 Senpi의 HUD 전략은 core가 모든 상태를 소유하는 것이 아니라:

```text
짧고 지속적인 상태       → footer setStatus
여러 줄/구조화된 상태    → above/below-editor widget
현재 활동                → working/status row
상호작용이 필요한 상태   → dialog / custom component / overlay
전체 chrome 교체          → custom footer/editor/theme 또는 mode chrome
```

로 승격시키는 구조다.

### 5.4 Todo 등의 실제 HUD 활용

Senpi builtin `todotools`는 todo sidebar/widget 상태와 continuation을 제공하고, persistent goal과 terminal monitor 등도 public `setStatus`를 사용한다. 이는 확장 API가 예제용이 아니라 실제 builtin observability에 쓰이는 dogfooding 증거다. [builtin registry](https://github.com/code-yeongyu/senpi/blob/f91130e0fa3c8f3db5a60301878cd3e0c5a869b7/packages/coding-agent/src/core/extensions/builtin/index.ts), [`todotools`](https://github.com/code-yeongyu/senpi/tree/f91130e0fa3c8f3db5a60301878cd3e0c5a869b7/packages/coding-agent/src/core/extensions/builtin/todotools)

## 6. 입력·탐색·상호작용

- multiline editor와 history/keybindings를 제공한다.
- `@` 입력은 fuzzy file reference completion, slash command completion과 extension autocomplete provider가 같은 editor에 결합된다.
- `!command`는 shell output을 model context에 보내고 `!!command`는 context에 넣지 않는다. [Quickstart](https://github.com/code-yeongyu/senpi/blob/f91130e0fa3c8f3db5a60301878cd3e0c5a869b7/packages/coding-agent/docs/quickstart.md)
- paste는 대용량 collapse marker와 image marker를 다루며, 지원 terminal에서는 clipboard/drag image도 받을 수 있다.
- fullscreen transcript는 PageUp/Down, half/line scroll, message jump, search, mouse/trackpad, OSC 8 hyperlink click, drag selection/copy를 다룬다. default unmodified navigation key는 fullscreen transcript, ctrl 변형은 editor로 routing된다. [`keybindings.md` L89-L100](https://github.com/code-yeongyu/senpi/blob/f91130e0fa3c8f3db5a60301878cd3e0c5a869b7/packages/coding-agent/docs/keybindings.md#L89-L100)
- dialog API는 select/confirm/input/multiline editor/notify를 제공하고 timeout·AbortSignal을 지원한다. [Extensions custom UI](https://github.com/code-yeongyu/senpi/blob/f91130e0fa3c8f3db5a60301878cd3e0c5a869b7/packages/coding-agent/docs/extensions.md#L2818-L2883)
- overlay는 9방향 anchor, width/height, row/column, margin, responsive visibility, stacking/focus handle을 지원한다. [`tui.md` L122-L200](https://github.com/code-yeongyu/senpi/blob/f91130e0fa3c8f3db5a60301878cd3e0c5a869b7/packages/coding-agent/docs/tui.md#L122-L200)

IME cursor contract와 CJK 폭 테스트가 있는 것은 한국어 환경에 실질적 장점이다. 다만 terminal별 keyboard/mouse/graphics protocol 차이를 흡수하는 코드와 QA 면적은 커진다.

## 7. 출력·도구 실행 표현

출력은 user message, assistant Markdown, thinking, custom/extension message, tool execution, bash execution, diff, image, Mermaid/LaTeX 등의 component로 분리돼 있다. tool output은 접기/펼치기가 가능하고 streaming reveal, tool-result reveal, progress update를 별도 모듈로 관리한다. [interactive components](https://github.com/code-yeongyu/senpi/tree/f91130e0fa3c8f3db5a60301878cd3e0c5a869b7/packages/coding-agent/src/modes/interactive/components)

Grok chrome은 tool execution을 단순한 guide/marker row로 표현하는 별도 presentation을 제공한다. pending은 spinner, success/error/warning은 의미색 marker로 바뀐다. [`grok/tool-row.ts`](https://github.com/code-yeongyu/senpi/blob/f91130e0fa3c8f3db5a60301878cd3e0c5a869b7/packages/coding-agent/src/modes/interactive/grok/tool-row.ts)

평가: tool마다 custom renderer를 둘 수 있고 상태 전이가 시각적으로 드러나는 것이 강점이다. 반면 transcript가 장시간 누적되면 풍부한 box/Markdown/diff/image가 정보 밀도를 높이므로, compact row와 detailed expansion 사이의 일관된 정책이 중요하다.

## 8. 렌더링 구현과 성능 지향

기반 패키지는 스스로를 differential rendering TUI library로 소개한다. main-screen renderer와 alternate-screen renderer를 분리하고, viewport diff, SGR coalescing/reset, cursor write hygiene, render FPS cap, shrink, scroll/diff, CJK boundary, emoji/regional indicator width, tmux focus/passthrough, terminal color/capability, inline image를 광범위하게 테스트한다. [TUI package](https://github.com/code-yeongyu/senpi/tree/f91130e0fa3c8f3db5a60301878cd3e0c5a869b7/packages/tui), [TUI tests](https://github.com/code-yeongyu/senpi/tree/f91130e0fa3c8f3db5a60301878cd3e0c5a869b7/packages/tui/test)

fork README는 Senpi 고유 TUI 차이로 differential rendering fast paths와 flicker-budget enforcement를 명시한다. 다만 이는 프로젝트 자체 설명이며, 이 조사에서는 upstream 대비 benchmark를 재실행하지 않았으므로 실제 우위 수치로 해석하면 안 된다. [README fork change table](https://github.com/code-yeongyu/senpi/blob/f91130e0fa3c8f3db5a60301878cd3e0c5a869b7/README.md)

## 9. 확장성

### 9.1 UI 확장 계층

Senpi는 다음 단계로 확장 가능하다.

1. semantic JSON theme와 hot reload
2. status/footer segment와 editor 위/아래 widget
3. working indicator/message, tool expansion, terminal title
4. slash/path completion 위에 autocomplete provider 합성
5. custom editor, custom footer
6. `ctx.ui.custom()`로 임시 전체 component 또는 floating overlay
7. custom tool/message renderers
8. RPC/JSON/print/headless mode로 UI 자체를 다른 client에 위임

`ctx.ui.custom()` callback은 TUI, 현재 theme, keybinding manager, completion callback을 주며, overlay가 아니면 editor를 임시 대체한다. [`extensions.md` L3032-L3060](https://github.com/code-yeongyu/senpi/blob/f91130e0fa3c8f3db5a60301878cd3e0c5a869b7/packages/coding-agent/docs/extensions.md#L3032-L3060)

### 9.2 패키지/배포

extension, skill, prompt template, theme을 npm/git/local Pi package로 묶을 수 있고, conventional directories 또는 `package.json`의 `pi` manifest에서 발견한다. project-local resource는 trust 이후 로드된다. 단, extension은 사용자 권한으로 arbitrary code를 실행하므로 package ecosystem의 장점과 supply-chain 위험이 함께 있다. [`packages.md`](https://github.com/code-yeongyu/senpi/blob/f91130e0fa3c8f3db5a60301878cd3e0c5a869b7/packages/coding-agent/docs/packages.md)

### 9.3 headless와 외부 UI

interactive TUI 외에도 print, JSONL event, RPC, Codex-compatible app-server가 있다. RPC는 dialogs와 `notify/setStatus/setWidget/setHeader/setFooter` 등을 protocol event로 내보내 외부 client가 표시하거나 무시할 수 있지만, terminal component가 필요한 `custom()`은 RPC에서 `undefined`다. 즉 UI 상태 계약의 일부는 transportable하지만 arbitrary TUI component는 process-local이다. [`rpc.md` extension UI protocol](https://github.com/code-yeongyu/senpi/blob/f91130e0fa3c8f3db5a60301878cd3e0c5a869b7/packages/coding-agent/docs/rpc.md#L1818-L1837)

## 10. 장점과 단점 요약

### 장점

1. **terminal-native와 fixed-dock 양쪽 선택지**: regular scrollback과 fullscreen viewport를 모두 제공한다.
2. **semantic visual system**: message/tool/diff/Markdown/syntax/thinking/search가 token으로 분리된다.
3. **상태 우선순위가 코드화됨**: footer가 폭에 따라 중요도가 낮은 정보부터 버린다.
4. **HUD가 확장 API임**: core status뿐 아니라 extension이 footer/widget/working/overlay를 재사용한다.
5. **한국어/IME 친화 기반**: cursor marker, visible-width, CJK regression tests가 있다.
6. **강한 terminal protocol 실무성**: Kitty keyboard/image, tmux, OSC 8, mouse, alternate screen을 명시적으로 다룬다.
7. **headless와 외부 client 경로**: 동일 agent runtime을 TUI에 묶지 않고 RPC/app-server로 사용할 수 있다.
8. **예측 가능한 highlighting**: 언어가 불명확할 때 잘못된 자동 강조보다 단색 fallback을 택한다.

### 단점·리스크

1. **실험적 포크**: 프로젝트 스스로 production pipeline에 의존하지 말라고 경고한다.
2. **브랜드·upstream 혼재**: 문서의 `pi/senpi`, 패키지 scope가 섞여 사용자가 계층을 이해하기 어렵다.
3. **terminal별 분기 비용**: fullscreen mouse/graphics/link/IME는 terminal과 multiplexer마다 예외가 많다.
4. **문자열 line 기반 확장 난도**: 단순 컴포넌트 계약은 가볍지만 ANSI 폭, reset, focus, lifecycle을 extension 저자가 지켜야 한다.
5. **테마 표면 과대**: 50개 이상의 token은 정교하지만 커스텀 테마 제작·접근성 QA 비용이 크다.
6. **단일행 footer의 한계**: 병렬 agent/workflow/approval queue 같은 고차 상태는 별도 widget 없이는 표현하기 어렵다.
7. **regular/fullscreen 동작 차이**: scroll, 이미지, exit output, key routing이 모드마다 달라 일관성·테스트 비용이 증가한다.
8. **arbitrary extension 신뢰 문제**: UI 확장도 full system access를 가진 코드 실행이다.
9. **RPC parity가 완전하지 않음**: status/widget event는 전달되지만 arbitrary `custom()` TUI는 외부 client로 직렬화되지 않는다.

## 11. 우리 구조와 비교할 때 사용할 체크리스트

이 문서는 Senpi 외부 조사만 담당하므로 WWW에 대한 결론은 내리지 않는다. 통합 비교에서는 아래 항목을 1:1로 대조하면 된다.

| 비교 축 | Senpi 기준 질문 |
|---|---|
| 화면 소유권 | terminal scrollback과 app-owned fullscreen을 모두 지원하는가? 전환 가능한가? |
| 고정 dock | queue/status/widgets/editor/footer 중 무엇이 하단 고정인가? |
| HUD 정보 | cwd/branch/session/cache/cost/context/compaction/provider/account/model/thinking/fast mode 중 무엇이 보이는가? |
| 폭 축소 | 정보 우선순위와 단계적 elision이 있는가, 단순 잘림인가? |
| 테마 | semantic tokens, dark/light auto, project/package theme, hot reload, schema validation이 있는가? |
| 하이라이팅 | Markdown, language fence, file extension, diff, tool state가 구분되는가? unknown language 정책은? |
| 입력 | multiline/history/file refs/slash/shell/paste/image/IME/autocomplete extension이 있는가? |
| transcript 탐색 | search, message jump, mouse/trackpad, link, selection, scrollbar가 있는가? |
| 상태 확장 | status/widget/working/custom footer/editor/overlay를 third party가 추가 가능한가? |
| renderer | diff render, FPS cap, ANSI reset, CJK/emoji width, shrink/resize 회귀 테스트가 있는가? |
| terminal 호환 | Kitty/Ghostty/iTerm2/tmux/Windows에 대한 명시적 capability 및 fallback이 있는가? |
| transport | print/JSON/RPC/app-server와 TUI 기능의 parity 경계가 명확한가? |
| 위험 | extension trust, project trust, permission dialog가 화면 계약과 연결되는가? |

## 12. 통합 비교에 바로 쓸 핵심 판정

- Senpi의 가장 강한 UI 아이디어는 “예쁜 theme”보다 **상태 표면을 footer/status/widget/overlay로 계층화하고 extension에게 같은 API를 주는 것**이다.
- 가장 강한 터미널 구조 아이디어는 **regular scrollback과 fixed-dock fullscreen을 선택 가능하게 분리한 것**이다.
- 가장 강한 HUD 아이디어는 **우선순위 기반 폭 축소**와 context 경고 임계치다.
- 가장 강한 색상 아이디어는 **Markdown/syntax/diff/tool lifecycle/thinking level을 서로 다른 semantic token 축으로 분리**한 것이다.
- 가장 주의할 설계 부채는 **두 렌더 모드 × 여러 terminal protocol × 확장 component lifecycle**이 만드는 조합 폭발이다.
- WWW가 observability 중심이라면 Senpi footer를 그대로 복제하기보다, footer에는 즉시성 높은 anchor만 두고 병렬 작업·evidence·approval·provider 교차검증처럼 구조적 상태는 별도 widget/overlay로 올리는 편이 Senpi 자신의 계층 원리에도 맞다.

# Pi Coding Agent 터미널/TUI 조사

- 조사일: 2026-09-04 (Asia/Seoul)
- 조사 대상: 사용자가 말한 “PI”는 **Pi Coding Agent**로 식별한다.
- upstream: `https://github.com/badlogic/pi-mono` (현재 문서와 npm scope는 `earendil-works`, 소스 링크도 `earendil-works/pi-mono`를 정본으로 안내한다.)
- 고정 revision: [`4e69b0c28060f0f02fbe38bfa7c21a2e2eb25057`](https://github.com/earendil-works/pi-mono/commit/4e69b0c28060f0f02fbe38bfa7c21a2e2eb25057), 2026-09-02
- 라이선스: [MIT](https://github.com/earendil-works/pi-mono/blob/4e69b0c28060f0f02fbe38bfa7c21a2e2eb25057/LICENSE)

## 1. 식별과 제품 철학

Pi는 단순한 챗 CLI가 아니라 `pi-ai`(provider 통합), `pi-agent-core`(agent loop/state), `pi-coding-agent`(사용자 CLI), `pi-tui`(렌더러), `pi-web-ui` 등으로 나뉜 모노레포다. 사용자가 가리킨 비교 대상은 그중 `pi-coding-agent`의 interactive mode와 `pi-tui`다. 공식 README는 Pi를 “minimal terminal coding harness”로 정의하며 TypeScript extension, skill, prompt template, theme로 코어 수정 없이 확장하는 방식을 핵심 철학으로 둔다. 반대로 sub-agent와 plan mode는 기본 제공하지 않는다고 명시한다. 실행 표면은 interactive, print/JSON, RPC, SDK의 네 가지다. [README lines 15-19](https://github.com/earendil-works/pi-mono/blob/4e69b0c28060f0f02fbe38bfa7c21a2e2eb25057/packages/coding-agent/README.md#L15-L19)

이 철학은 TUI에도 그대로 드러난다. 코어 화면은 절제되어 있지만, 확장자가 UI 구성요소와 렌더링을 깊게 갈아 끼울 수 있다. 따라서 Pi의 장점은 “완성된 대시보드를 많이 내장”한 데 있다기보다 “작은 기본 화면 위에 사용자 제품을 만들 수 있는 안정된 TUI API”에 있다.

## 2. 기본 화면 구조

공식 설명의 수직 구조는 다음과 같다. [README lines 147-158](https://github.com/earendil-works/pi-mono/blob/4e69b0c28060f0f02fbe38bfa7c21a2e2eb25057/packages/coding-agent/README.md#L147-L158)

```text
startup header
loaded resources (AGENTS.md / skills / prompts / extensions)
scrolling transcript
  user message
  assistant text / thinking
  tool call + streaming result
  notifications / errors / extension messages
pending-message queue
working/retry/compaction status
extension widget(s) above editor
editor
extension widget(s) below editor
footer / extension status line
```

소스의 실제 composition도 이 구조와 일치한다. 문서 영역은 header → loaded resources → chat으로 묶이고, dock은 pending messages → status → above widget → editor → below widget → footer 순이다. fullscreen에서는 transcript가 가변 높이 scroll view, dock이 하단 고정 영역이 된다. [interactive-mode lines 590-616](https://github.com/earendil-works/pi-mono/blob/4e69b0c28060f0f02fbe38bfa7c21a2e2eb25057/packages/coding-agent/src/modes/interactive/interactive-mode.ts#L590-L616), [lines 920-949](https://github.com/earendil-works/pi-mono/blob/4e69b0c28060f0f02fbe38bfa7c21a2e2eb25057/packages/coding-agent/src/modes/interactive/interactive-mode.ts#L920-L949)

### 두 렌더 모드

`pi-tui`는 같은 component tree를 두 렌더러에 올린다.

- **main-screen**: 일반 터미널 버퍼/scrollback을 보존한다. shell 친화적이고 종료 후 기록이 자연스럽다.
- **alternate-screen/fullscreen**: 터미널 높이를 앱이 소유한다. transcript `ScrollView` + 고정 dock, mouse/trackpad/keyboard scroll, scrollbar, 검색과 오버레이에 유리하다. 종료 시 main buffer를 복원하고 완성 transcript를 출력할 수 있다.

공식 TUI README는 interchangeable renderer, changed-line/viewport-row differential rendering, CSI 2026 synchronized output, bracketed paste, Kitty/iTerm2 image, autocomplete를 기능으로 명시한다. [pi-tui README](https://github.com/earendil-works/pi-mono/blob/4e69b0c28060f0f02fbe38bfa7c21a2e2eb25057/packages/tui/README.md)

**평가:** 터미널 scrollback과 완전한 app viewport 사이를 설정으로 선택할 수 있다는 점은 강점이다. 다만 두 표면에서 레이아웃·selection·scroll 의미가 달라 QA 축이 늘어난다. fullscreen 레이아웃은 풍부하지만 기본 Pi는 IDE식 좌우 패널보다 단일 transcript 중심이다.

## 3. 색상과 테마

Pi는 built-in `dark`/`light`를 제공하고 첫 실행 때 터미널 배경을 감지한다. global(`~/.pi/agent/themes`), trusted project(`.pi/themes`), package, settings path, CLI에서 JSON theme을 발견하며 `/settings` 또는 `--use-theme`으로 선택한다. custom theme은 저장 즉시 hot reload된다. [themes.md](https://github.com/earendil-works/pi-mono/blob/4e69b0c28060f0f02fbe38bfa7c21a2e2eb25057/packages/coding-agent/docs/themes.md)

테마는 단순 8/16색 이름 모음이 아니라 semantic token 체계다.

- core: `accent`, border 3종, success/error/warning, muted/dim/text
- surfaces: selected, scrollbar, search match, user/custom message, tool pending/success/error background
- markdown: heading/link/url/inline code/code block/border/quote/hr/list bullet
- diff: added/removed/context
- syntax: comment/keyword/function/variable/string/number/type/operator/punctuation
- reasoning: thinking off/minimal/low/medium/high/xhigh/max
- mode: bash mode

현재 dark theme은 `#d4d4d4` text, 청록 `#8abeb7` accent, 사용자 메시지 `#343541`, tool pending `#282832`, success/error별 어두운 녹/적 surface를 쓴다. Markdown heading은 황색, link는 blue, inline code는 accent, code block은 green이다. 구문색은 VS Code 계열에 가까운 blue keyword, yellow function, light-blue variable, orange string, green comment/type 조합이다. [dark.json](https://github.com/earendil-works/pi-mono/blob/4e69b0c28060f0f02fbe38bfa7c21a2e2eb25057/packages/coding-agent/src/modes/interactive/theme/dark.json)

사용자 메시지는 background box + Markdown이고, assistant 메시지는 별도 배경 없는 Markdown이다. 이 비대칭이 대화 turn을 구분하되 assistant 출력은 문서처럼 읽게 만든다. [user-message.ts lines 38-57](https://github.com/earendil-works/pi-mono/blob/4e69b0c28060f0f02fbe38bfa7c21a2e2eb25057/packages/coding-agent/src/modes/interactive/components/user-message.ts#L38-L57), [assistant-message.ts lines 100-114](https://github.com/earendil-works/pi-mono/blob/4e69b0c28060f0f02fbe38bfa7c21a2e2eb25057/packages/coding-agent/src/modes/interactive/components/assistant-message.ts#L100-L114)

**평가:** 상태별 배경과 콘텐츠별 semantic token이 분리되어 확장 renderer도 일관된 시각 언어를 쓸 수 있다. hot reload와 JSON Schema는 theme authoring 경험이 좋다. 반면 필수 token 수가 많아 가벼운 테마 제작의 진입비용이 있고, 테마가 정보 구조 자체를 바꾸지는 못한다(그 역할은 extension component가 담당).

## 4. 하이라이팅과 콘텐츠 렌더링

### Markdown / 코드

assistant와 user 모두 Markdown component를 사용한다. fenced code는 language grammar가 지원되면 highlight.js 기반 semantic syntax token으로 변환된다. 전체 언어 grammar는 startup의 첫 frame 이후 지연 로딩되어 initial paint를 막지 않는다. theme 변경 시 component `invalidate()`가 cached/pre-baked ANSI를 다시 생성하도록 계약되어 있다. [theme.ts syntax mapping](https://github.com/earendil-works/pi-mono/blob/4e69b0c28060f0f02fbe38bfa7c21a2e2eb25057/packages/coding-agent/src/modes/interactive/theme/theme.ts#L1138-L1188), [TUI theme invalidation guide](https://github.com/earendil-works/pi-mono/blob/4e69b0c28060f0f02fbe38bfa7c21a2e2eb25057/packages/coding-agent/docs/tui.md)

### Diff

추가/삭제/문맥을 green/red/gray semantic token으로 구분한다. 정확히 한 줄 삭제 + 한 줄 추가인 변경은 word diff를 계산해 변경된 토큰에 inverse를 더한다. 즉 line-level 색 + intra-line 강조를 함께 쓴다. [diff.ts lines 21-65](https://github.com/earendil-works/pi-mono/blob/4e69b0c28060f0f02fbe38bfa7c21a2e2eb25057/packages/coding-agent/src/modes/interactive/components/diff.ts#L21-L65), [lines 73-146](https://github.com/earendil-works/pi-mono/blob/4e69b0c28060f0f02fbe38bfa7c21a2e2eb25057/packages/coding-agent/src/modes/interactive/components/diff.ts#L73-L146)

### Thinking / streaming / 오류

thinking은 italic + `thinkingText`로 본문과 분리한다. 숨김 상태에서는 `Thinking...` 같은 단일 label로 축약하며 Ctrl+T로 토글할 수 있다. assistant content는 stream event마다 같은 component를 update하여 점진 렌더링한다. length truncation, abort, error를 content 아래 error color로 명시한다. [assistant-message.ts lines 89-195](https://github.com/earendil-works/pi-mono/blob/4e69b0c28060f0f02fbe38bfa7c21a2e2eb25057/packages/coding-agent/src/modes/interactive/components/assistant-message.ts#L89-L195)

tool call/result는 pending/success/error surface가 있고 partial streaming을 지원하며, Ctrl+O로 접고 펼친다. 각 tool은 `renderCall`/`renderResult`를 등록해 generic fallback 대신 고유 UI를 반환할 수 있다. [tool-execution.ts](https://github.com/earendil-works/pi-mono/blob/4e69b0c28060f0f02fbe38bfa7c21a2e2eb25057/packages/coding-agent/src/modes/interactive/components/tool-execution.ts)

**평가:** Markdown, syntax, diff, tool state가 동일 theme vocabulary 아래 연결된다. 특히 intra-line diff와 partial tool rendering은 실제 코딩 작업에 직접 유용하다. 다만 transcript 안에 모든 activity가 선형으로 쌓이므로 동시 작업/여러 agent를 공간적으로 비교하는 HUD는 기본 제공하지 않는다.

## 5. 입력 TUI와 상호작용

Editor는 다음을 기본 제공한다. [README lines 160-171](https://github.com/earendil-works/pi-mono/blob/4e69b0c28060f0f02fbe38bfa7c21a2e2eb25057/packages/coding-agent/README.md#L160-L171)

- `@` project file fuzzy search, Tab path completion
- multiline, undo/delete-word 등 일반 편집 keybinding
- 외부 편집기 진입
- clipboard text/image paste와 terminal image drag
- `!command`(결과를 LLM에 전달), `!!command`(로컬 실행만)
- `/` command autocomplete; model/thinking/settings/session tree 등의 selector UI
- editor border color로 현재 thinking level 표시
- configurable keybindings; model cycling, thinking cycling, tool/thinking collapse

IME를 위한 focus contract도 명시적이다. focused component가 zero-width cursor marker를 렌더하면 TUI가 hardware cursor 위치를 맞추며, CJK candidate window가 엉뚱한 곳에 뜨는 문제를 피한다. 기본 Editor/Input은 이미 이를 구현한다. [tui.md IME section](https://github.com/earendil-works/pi-mono/blob/4e69b0c28060f0f02fbe38bfa7c21a2e2eb25057/packages/coding-agent/docs/tui.md#focusable-interface-ime-support)

작업 중 입력은 단순 차단되지 않는다. Enter는 현재 turn의 tool calls 뒤에 전달될 steering message, Alt+Enter는 모든 일이 끝난 뒤의 follow-up으로 queue하고, Escape abort 시 queue를 editor로 복원한다. Alt+Up으로 queued message를 되가져온다. [README lines 222-229](https://github.com/earendil-works/pi-mono/blob/4e69b0c28060f0f02fbe38bfa7c21a2e2eb25057/packages/coding-agent/README.md#L222-L229)

**평가:** “agent가 일하는 동안 인간이 다음 의도를 전달”하는 흐름이 일급 UI 상태다. steering/follow-up의 의미를 key로 나눈 것은 강력하지만, 새 사용자는 Enter와 Alt+Enter의 delivery semantics를 학습해야 하며 화면만 보고 차이를 완전히 예측하기 어렵다.

## 6. Footer/HUD와 상태 표시

기본 footer는 사실상 Pi의 내장 HUD다.

- 1행: cwd, git branch, session name
- 2행 좌측: 누적 input/output/cache-read/cache-write, 최신 cache hit rate, cost/subscription, context percent/window, auto-compaction 여부
- 2행 우측: provider(폭이 허용할 때), model, thinking level
- 추가 행: extension statuses (key 정렬, 한 줄로 결합, 폭 초과 truncation)

context는 70% 초과 warning, 90% 초과 error 색으로 전환한다. 좁은 폭에서는 provider를 먼저 생략하고 model을 줄이며, 좌우 정보도 terminal width에 맞춰 truncate한다. [footer.ts lines 45-231](https://github.com/earendil-works/pi-mono/blob/4e69b0c28060f0f02fbe38bfa7c21a2e2eb25057/packages/coding-agent/src/modes/interactive/components/footer.ts#L45-L231)

footer 위의 status indicator는 별도다. working은 accent spinner + muted label, retry는 warning spinner + attempt/countdown/cancel hint, compaction과 branch summary는 이유와 cancel hint를 표시한다. [status-indicator.ts](https://github.com/earendil-works/pi-mono/blob/4e69b0c28060f0f02fbe38bfa7c21a2e2eb25057/packages/coding-agent/src/modes/interactive/components/status-indicator.ts)

**평가:** 비용·cache·context·model을 항상 보이는 최소 HUD로 압축한 점이 좋고, 폭 저하 정책도 있다. 반면 작업 계획, 현재 phase, sub-agent 수/상태, approval queue, test/build 상태 같은 orchestration HUD는 기본값에 없다. 이들은 extension status/widget/custom footer로 구현해야 한다.

## 7. TUI 확장성

Pi의 가장 큰 차별점이다. extension은 다음을 할 수 있다. [extensions UI API](https://github.com/earendil-works/pi-mono/blob/4e69b0c28060f0f02fbe38bfa7c21a2e2eb25057/packages/coding-agent/docs/extensions.md#widgets-status-and-footer)

- select/confirm/input/editor 같은 modal prompt
- success/info/warning/error notification
- persistent keyed status
- working message 교체
- editor 위/아래 widget
- built-in footer 전체 교체
- header 전체 교체
- terminal title, editor text, tool-expanded state 제어
- Vim 등 custom editor 교체
- theme 열람/즉시 전환
- custom message renderer와 tool renderer
- keyboard focus를 가진 arbitrary component 및 overlay

overlay는 center/9방향 anchor, 절대/백분율 위치, width/minWidth/maxHeight, margin, responsive visibility, focus ownership, hide/show handle을 제공한다. 여러 overlay stack도 가능하다. [tui.md overlays](https://github.com/earendil-works/pi-mono/blob/4e69b0c28060f0f02fbe38bfa7c21a2e2eb25057/packages/coding-agent/docs/tui.md#overlays)

component 계약은 작다: `render(width): string[]`, optional `handleInput`, key-release opt-in, `invalidate`. built-in은 Text, Box, Container, Markdown, Editor/Input, Loader, SelectList, SettingsList, image, VStack/HStack/ScrollView 등을 제공한다. `requestRender()` 기반이고 core renderer가 differential update를 맡는다. 따라서 extension 작성자가 curses식 cell loop나 repaint를 직접 관리하지 않는다.

Widget 총 높이는 10행으로 제한해 editor/footer가 extension에 의해 밀려 사라지는 일을 방지한다. custom footer/header는 기존 component를 dispose하고 교체하며 restore도 가능하다. [interactive-mode lines 2296-2356](https://github.com/earendil-works/pi-mono/blob/4e69b0c28060f0f02fbe38bfa7c21a2e2eb25057/packages/coding-agent/src/modes/interactive/interactive-mode.ts#L2296-L2356)

**평가:** UI extension이 장식 수준이 아니라 editor/header/footer/tool/message/overlay까지 관통한다. 이는 Pi를 “terminal agent framework”로 쓰기 좋게 만든다. 대가로 extension이 core UX 품질·접근성·키 충돌을 좌우하고, arbitrary ANSI/string-width 처리와 invalidate 규약을 extension author가 이해해야 한다. 패키지 공급망과 project trust도 운영 리스크다.

## 8. 강점과 약점 요약

| 축 | 강점 | 약점/비용 |
|---|---|---|
| 구조 | transcript와 dock이 명확하고 main/fullscreen 양립 | 다중 pane/agent overview는 기본 부재 |
| 렌더링 | differential + synchronized output, terminal scrollback 보존 선택 | renderer 2종의 behavior/QA 복잡도 |
| 색상 | semantic tokens, dark/light, schema, hot reload | 많은 token을 완성해야 하는 theme author 부담 |
| 하이라이팅 | Markdown/syntax/diff/intra-line/tool-state 통합 | 모든 activity가 긴 선형 transcript에 누적 |
| HUD | context/cost/cache/model/thinking을 작게 상시 노출 | plan/phase/agent/test/approval orchestration 정보 없음 |
| 입력 | fuzzy refs, autocomplete, image, shell, queue/steer/follow-up | delivery key semantics 학습 필요 |
| 확장성 | header/footer/editor/widget/overlay/tool/message까지 교체 | 키 충돌, layout, lifecycle, trust를 extension이 책임 |
| 제품 철학 | 작은 core, 강한 composability, RPC/SDK 병행 | sub-agent/plan mode 같은 기대 기능을 기본 제공하지 않음 |

## 9. WWW 비교 시 확인할 질문

Pi와 WWW의 장단점을 공정하게 비교하려면 WWW에서 아래의 실제 구현 증거를 대조해야 한다.

1. 화면 구조가 transcript 중심인가, phase/agent 중심인가? 하단 dock의 고정 정보는 무엇인가?
2. HUD는 토큰/비용/context/model뿐 아니라 initiative/story/evidence, active goal, delegated agent, approvals, gates를 보여주는가?
3. theme token이 semantic한가? tool lifecycle·diff·thinking·selection·warning threshold가 token으로 분리됐는가?
4. syntax/Markdown/diff는 streaming 중에도 안정적으로 갱신되는가? intra-line diff가 있는가?
5. agent 실행 중 steering/follow-up 입력을 받고 화면에서 delivery semantics를 설명하는가?
6. inline scrollback과 app-owned fullscreen 중 무엇을 선택했고, 그 선택의 copy/search/scroll tradeoff는 무엇인가?
7. extension이 widget/status/footer/editor/tool renderer를 추가할 수 있는가, 아니면 core 변경이 필요한가?
8. narrow terminal, CJK/IME, ANSI width, resize, theme reload, long widget/status를 어떻게 검증하는가?

## 10. 결론

Pi TUI의 본질은 화려한 기본 HUD가 아니라 **얇은 transcript UI + 정교한 semantic presentation + 매우 깊은 extension seam**이다. 기본 화면만 비교하면 orchestration 가시성은 제한적이다. 그러나 `pi-tui`와 extension API까지 포함하면 custom HUD, modal workflow, status integration을 core fork 없이 만들 수 있어 구조적 확장성은 매우 높다. WWW가 initiative/story/evidence, multi-agent, review gate를 제품의 핵심으로 삼는다면 Pi보다 richer default HUD를 제공할 이유가 있다. 동시에 Pi에서 가져올 만한 핵심은 (a) semantic theme token, (b) context threshold HUD, (c) steering/follow-up queue, (d) main/fullscreen renderer 분리, (e) 작은 component contract와 renderer extension point다.

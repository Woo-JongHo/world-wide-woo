# WWW 기능별 TUI 코드 구성표

조사 기준: 2026-08-31. 이 문서는 제품 외형 비교가 아니라 **기능이 어느 계층과 코드 경계에 구현되어 있는지**를 정리한다. `채택`은 코드를 복사한다는 뜻이 아니라 WWW가 소유할 계약을 뜻한다.

## 1. 계층 분류

| 계층 | 대상 | 실제 책임 | WWW와의 관계 |
|---|---|---|---|
| Host terminal | iTerm2, Ghostty | PTY, terminal parser/grid, GPU renderer, window/tab/split, IME, clipboard, OSC | WWW가 실행되는 호스트. 내부 코드를 import하지 않고 capability만 감지한다. |
| Host shell framework | Oh My Zsh | zsh bootstrap, prompt, completion, alias/function/plugin source | WWW 실행 전후 shell 환경. TUI renderer나 Agent session 정본이 아니다. |
| TUI engine | `@earendil-works/pi-tui`, `@gajae-code/tui`, Bubble Tea, OpenTUI | cell diff, layout, viewport, focus, input, Markdown, overlay | WWW presentation 구현 기반 또는 비교 대상이다. |
| Agent TUI product | Gajae Code, Pi, Oh My Pi, Codex CLI, OpenCode, Claude Code | transcript, model turn, tool/approval/session lifecycle | 기능·event 계약을 참고하되 제품 화면과 runtime 전체를 복제하지 않는다. |
| Agent extension/HUD | OMC, Oh My OpenAgent | host agent hook, workflow, subagent orchestration, status/HUD | deterministic Shell과 future workflow registry를 분리할 때 참고한다. |
| WWW product | World Wide Woo | WES Conversation·Execution·Context·Router projection | 위 계층을 선택적으로 합성하고 정본과 UI를 직접 소유한다. |

## 2. 조사 대상 코드 기준점

| 대상 | 기준점 또는 공개 경계 | 주 코드 루트 |
|---|---|---|
| Gajae Code | `@gajae-code/coding-agent` 0.15.6 | `packages/coding-agent/src`, `packages/tui/src` |
| Pi | `earendil-works/pi` 공개 main | `packages/coding-agent/src`, `packages/tui/src` |
| Oh My Pi | `can1357/oh-my-pi` 공개 main | `packages/coding-agent/src`, Rust native/LSP/DAP packages |
| Codex CLI | `94cbbddafc1776d5e377bca1b05932c697e82238` | `codex-rs/tui`, `codex-rs/app-server` |
| OpenCode | `10765ff2a9da8c3b88e4de873aa383a49c318912` | `packages/tui`, `packages/opencode`, `packages/schema` |
| Claude Code | 코어 비공개 | 공식 sessions/commands/checkpoint/statusline 문서만 사용 |
| OMC | `134f4c96e2bdc0e10a0ee6bbbd413ded0d3c57b6` | `src/hud`, `src/workflow`, `commands`, `skills` |
| Oh My OpenAgent | `11f1274cdab677b6eef81bb04b087ce7c3732846` (`dev`, source-available SUL) | `packages/omo-opencode/src`, `packages/model-core`, `packages/skills-loader-core` |
| iTerm2 | `5ff63dade30865fe9faf2ac7003971dd55c46c88` | `sources/VT100`, `sources/TerminalView`, `sources/MetalRenderer`, `sources/StatusBar` |
| Ghostty | `e8aa098674a42e2b4ed1b8c42f4224564ad9fc1e` | `src/terminal`, `src/renderer`, `src/apprt`, `macos/Sources` |
| Oh My Zsh | `a5ecff7560b2e26f612032c632a12c75a3048bd0` | `oh-my-zsh.sh`, `lib`, `plugins`, `themes`, `tools` |
| WWW | 현재 저장소 main | `src/domain`, `src/application`, `src/infrastructure`, `src/presentation/tui` |

## 3. Terminal host와 renderer

| 기능 | 제품·코드 위치 | 구성과 상태 정본 | WWW 판단 |
|---|---|---|---|
| Terminal parser/grid | iTerm2 terminal/screen 계층; Ghostty `src/terminal` | escape sequence를 terminal grid/cursor/mode state로 해석한다. | Host 책임. WWW가 parser/grid를 재구현하지 않는다. |
| GPU/native renderer | iTerm2 text view/Metal 경로; Ghostty `src/renderer` | terminal cell, glyph atlas, damage와 frame를 그린다. | Host 책임. WWW는 ANSI/cell output만 생산한다. |
| Differential TUI render | Gajae/Pi TUI `tui.ts`, `tui-alt-screen.ts` | Component `render(width) -> string[]` 결과를 이전 frame과 비교한다. | **채택 완료.** `TuiAltScreen`과 constrained layout을 사용한다. |
| Elm update/render | Bubble Tea `tea.go`, renderer; `spikes/tui-bakeoff/bubbletea/main.go` | `Model → Update(Msg) → View`가 application viewport의 정본이다. | event reducer 참고. Go runtime 전체는 비채택이다. |
| Zig core UI | OpenTUI core + TypeScript/Solid bindings | flex/scroll/input를 native core가 처리하고 client framework가 component tree를 만든다. | 복잡한 GUI형 TUI에는 강하지만 현재 pi-tui 경계를 교체하지 않는다. |
| Alternate screen | Pi TUI `TuiAltScreen`; Codex/OpenCode full-screen route | 앱 viewport가 terminal scrollback과 분리된다. | **채택 완료.** 안전 종료 때 mode를 복원한다. |
| Synchronized output | Gajae/Pi renderer와 host terminal capability | 한 frame의 escape output을 묶어 tearing을 줄인다. | engine capability를 사용하고 host별 private API는 호출하지 않는다. |
| Truecolor/ANSI fallback | Gajae semantic theme, iTerm2/Ghostty color capability | semantic token을 terminal color escape로 투영한다. | Claude-derived semantic palette를 유지하고 fallback matrix를 검증한다. |

## 4. Layout, viewport, focus, input

| 기능 | 참고 코드 | 핵심 구성 | WWW 적용 |
|---|---|---|---|
| Constrained layout | Pi TUI `HStack`, `VStack`, `ScrollView`; WWW `dashboard-layout.ts` | basis/grow/shrink/min/max로 pane 예산을 계산한다. | 단일 외곽 프레임 안의 3영역과 usage 2행을 유지한다. |
| Responsive collapse | Gajae `welcome.ts`; OpenCode session route/sidebar | 최소폭·높이에 따라 2열을 순차 projection 또는 overlay로 바꾼다. | `width >= 88 && height >= 14`를 현재 계약으로 유지하고 콘텐츠 최소폭 기반으로 발전시킨다. |
| 독립 scrolling | Bubble Tea viewport, Pi TUI `ScrollView` | pane별 offset과 focus를 분리한다. | wide에서는 3영역 독립 scroll, compact에서는 모든 영역에 순차 접근한다. |
| Overlay stack | Pi TUI `showOverlay`; Codex bottom pane view stack | focus 이전·복원과 temporary surface를 관리한다. | bottom-centered `OverlaySheet`, Esc cancel, 선택 후 자동 닫기를 사용한다. |
| Composer/IME | Pi/Gajae `Editor`; iTerm2/Ghostty IME host support | grapheme, paste, cursor marker, history, hardware IME 위치를 처리한다. | 공식 Editor를 사용하고 수동 key parser를 만들지 않는다. |
| Slash autocomplete | Pi Editor + `CombinedAutocompleteProvider`; Gajae command metadata | command metadata에서 suggestion/argument completion을 만든다. | typed `SLASH_COMMANDS`와 exact parser를 유지한다. 가까운 후보를 자동 실행하지 않는다. |
| Host keybinding | iTerm2/Ghostty key mapping; Oh My Zsh `bindkey` | terminal 또는 shell이 key sequence를 command로 바꾼다. | WWW keybinding과 host keybinding 충돌을 진단하되 host 설정을 변경하지 않는다. |

## 5. Markdown, code, streaming

| 기능 | 제품·경로 | 구현 방식 | WWW 적용 |
|---|---|---|---|
| Markdown token render | Pi TUI `components/markdown.ts` | marked token을 ANSI line으로 만들고 width에 맞춰 wrap/cache한다. | assistant transcript의 기본 renderer다. |
| Streaming Markdown | Gajae TUI `components/markdown.ts` | 64ms full-parse throttle, instance/LRU parse/render cache, terminal final flush를 둔다. | `RenderScheduler`로 delta repaint를 64ms 병합하고 terminal state는 즉시 flush한다. |
| Syntax highlight | Gajae theme + `@gajae-code/natives` tree-sitter | language support를 확인하고 semantic syntax color를 ANSI로 반환한다. | `SyntaxHighlightPlugin` adapter 뒤에서 사용한다. Gajae renderer는 import하지 않는다. |
| Code size cap | Gajae Markdown | byte·line 상한 이후 plain rendering으로 전환한다. | native highlighter에 200KB/2,000행 상한을 적용했다. |
| Rich/raw projection | Codex `history_cell`, command lifecycle | viewport용 rich lines와 copy/export용 raw lines를 분리한다. | 화면 truncate/fold가 append-only raw evidence를 바꾸지 않아야 한다. |
| Diagram/image | Gajae/Pi Markdown·terminal image protocol | Kitty/iTerm/Sixel capability에 따라 image 또는 fallback을 렌더한다. | Agent runtime 이후 capability adapter로 보류한다. |

## 6. Transcript와 실행 lifecycle

| 기능 | 제품·경로 | 상태 계약 | WWW 적용 |
|---|---|---|---|
| Session→Turn→Item | Codex `app-server/README.md` | `turn/start`, `item/started`, delta, `item/completed`, `turn/completed`. | WWW 정본 vocabulary로 채택한다. |
| Session→Message→Part | OpenCode schema/session processor | text, reasoning, tool, patch, compaction part와 상태 union. | item variant와 unknown-tool fallback을 설계할 때 채택한다. |
| Event projection | Gajae `controllers/event-controller.ts` | serial event queue가 동일 toolCallId renderer handle을 갱신한다. | transport/store와 renderer state를 분리하고 stable item ID로 갱신한다. |
| Active vs committed | Codex `ChatWidget`, `HistoryCell` | mutable active cell과 immutable committed history를 분리한다. | streaming draft와 완료 turn을 분리한 현재 구조를 유지한다. |
| Append-only session | Gajae/Pi session manager; WWW session store | entry ID/parent 또는 sequence/correlation으로 history를 저장한다. | 현재 JSONL event store가 정본이다. |
| Completion report | WWW `domain/output.ts`, `result-cards.ts` | title, numbered sections, bullets, verification. | 자유형 마지막 문장 대신 구조화 완료 projection을 사용한다. |

## 7. Bash, tool, approval card

| 기능 | 제품·경로 | 코드 구성 | WWW 적용 |
|---|---|---|---|
| Bash lifecycle card | Gajae `components/bash-execution.ts`, `execution-shared.ts` | running loader, recent output, expand, exit/cancel/truncation footer. | `CommandResultSnapshot`과 `BashResultCard`에 상태·stdout/stderr·tail·exit·duration을 구현했다. |
| Tool renderer seam | Pi extension types, OMP custom tools | `renderCall`/`renderResult`와 generic fallback. | executor 이후 item-kind renderer registry로 도입한다. |
| Rich IDE tools | OMP LSP/DAP/tool renderer | client/config/session/tool/render를 분리한다. | executor 이후 도입하며 현재 placeholder를 만들지 않는다. |
| Approval correlation | Codex app-server approvals | request가 thread/turn/item ID와 결부되고 resolve 후 final item으로 끝난다. | effectful item에 once/session/deny approval을 연결한다. |
| Diff permission | OpenCode permission component | allow/ask/deny, split/unified diff, reject feedback. | edit executor 단계에서 preview와 reject feedback을 채택한다. |
| Unknown tool | OpenCode TUI generic tool renderer | 모르는 input/metadata를 `unknown`으로 받아 한 카드에 격리한다. | renderer 오류가 session 전체를 깨지 않도록 반드시 generic fallback을 둔다. |

## 8. Model, authentication, quota

| 기능 | 제품·경로 | 코드 구성 | WWW 적용 |
|---|---|---|---|
| Explicit model | Pi model resolver | canonical `provider/model`, scoped set, thinking level. | `(provider, model, effort)` atomic setting을 유지한다. |
| Role router | OMP model roles | smol/slow/plan/designer/task/advisor 역할별 model/fallback. | task/retry owner가 생기기 전에는 보류한다. |
| Provider ecosystem | OpenCode provider layer + Models.dev | provider package/loader와 capability/variant를 동적으로 선택한다. | 지원 provider를 명시 등록하며 dynamic npm provider 설치는 하지 않는다. |
| OAuth/API split | Codex/Claude/Pi provider auth | subscription OAuth와 API key를 별도 credential identity로 취급한다. | `openai-codex`와 `openai`, Anthropic OAuth/API key를 분리한다. |
| Usage adapter | Gajae AI `usage/claude.ts`, `usage/openai-codex.ts` | credential을 adapter에 주고 display report를 받는다. | credential/raw payload는 UI에 전달하지 않는다. |
| Compact quota HUD | OMC `src/hud/elements/limits.ts`, `render.ts` | compact bucket/reset, threshold, stale marker, width 후 line cap. | Codex/Claude 고정 2행과 `%남음`, reset, stale/429를 유지한다. |
| Quota backoff | OMC `usage-api.ts`; WWW `usage-service.ts` | single-flight, cache, Retry-After/backoff, last-known-good. | Claude 5분 success cache, 429 provider backoff, stale snapshot을 적용했다. 비공식 credential 직접 접근은 금지한다. |

## 9. Slash command, workflow, plugin

| 기능 | 제품·경로 | loader/dispatch | WWW 적용 |
|---|---|---|---|
| Deterministic command | Gajae builtin registry; Pi commands; Claude built-ins | name/alias/arguments metadata와 fixed handler. | Router/Auth/Usage/Commit/Issue 같은 Shell command로 유지한다. |
| Skill/workflow | Claude skills; OMC `skills`, `workflow/registry.ts`; OMO agents/hooks | prompt/instruction를 lazy-load하고 agent lifecycle을 오케스트레이션한다. | deterministic command와 별도 registry로 Agent 단계에서 도입한다. |
| Pi extension | Pi extension API | tool/command/shortcut/event/custom UI/provider 등록. | 먼저 내부 typed port/card seam을 안정화한다. |
| OMP extension | OMP hooks, custom tools, command discovery | 여러 harness command/plugin을 하나의 dispatch pipeline에 합친다. | provenance/precedence/trust 계약 전에는 외부 loader를 열지 않는다. |
| Oh My Zsh plugin | `oh-my-zsh.sh`, `plugins/*/*.plugin.zsh` | ordered list를 현재 shell에 source하고 custom path가 stock을 shadow한다. | deterministic order만 참고한다. arbitrary shell source와 ambient authority는 비채택이다. |
| WWW syntax plugin | `syntax-highlighter.ts` | 작은 typed interface 뒤에 native highlighter를 주입한다. | plugin-like 내부 adapter의 현재 예다. |

## 10. Session, context, checkpoint

| 기능 | 제품·경로 | 상태 효과 | WWW 적용 |
|---|---|---|---|
| Resume | Pi/Gajae/Claude/Codex/OpenCode session picker | stable ID, project/cwd, recent/search, model 일부를 복원한다. | recent session resume를 유지하고 search/cwd mismatch 확인을 추가한다. |
| Clear | Claude `/clear` | 새 conversation/context를 시작한다. | compact/branch와 다른 명령으로 유지한다. |
| Compact | Claude `/compact`, Pi/OpenCode compaction | 같은 session history를 summary로 바꾼다. | raw provenance와 context policy가 정의된 뒤 도입한다. |
| Branch/fork | Claude branch, Codex thread fork, OpenCode fork | 원본 session을 보존하고 새 identity를 만든다. | Agent history tree가 생긴 뒤 도입한다. |
| Checkpoint/rewind | Claude official UX | user prompt 전 code snapshot, 복원 범위 제한. | edit provenance와 Git 비대체 경고 없이 UI만 만들지 않는다. |
| Display vs Context | Gajae custom entry, WWW WES 목표 | 화면 visibility와 model context participation을 분리한다. | WWW의 핵심 차별점이며 별도 policy로 소유한다. |

## 11. Git, Commit, Issue

| 기능 | 제품·경로 | 방식 | WWW 적용 |
|---|---|---|---|
| Prompt Git status | Oh My Zsh `lib/git.zsh`, git plugin | optional lock을 피한 read-only helper가 branch/dirty/ahead/behind를 prompt로 만든다. | alias는 비채택, non-invasive structured query 원칙은 채택한다. |
| Agent Git action | Gajae/OMP/Codex tool execution | Bash/tool이 git 명령을 실행하고 승인·결과 card에 투영한다. | executor 전에는 자동 commit/push를 만들지 않는다. |
| Repository snapshot | WWW `domain/repository.ts`, `infrastructure/repository-insights.ts` | shell interpolation 없는 git argv, status/log를 typed DTO로 정규화한다. | `/commits` bottom sheet에서 branch/upstream/change/recent commit을 읽는다. |
| GitHub Issue query | WWW `RepositoryInsights.issues`, `gh issue list --json` adapter | bounded JSON을 `IssueSummary`로 변환하고 error를 redaction한다. | `/issues`에서 열린 Issue를 읽는다. 생성/수정은 preview·승인 전까지 보류한다. |
| Contribution workflow | WWW `.github/ISSUE_TEMPLATE`, `PULL_REQUEST_TEMPLATE`, `quality.yml` | structured issue intake, secret warning, Conventional PR title, type/test gate. | 저장소 운영 기본값으로 채택한다. |

## 12. Shell integration, update, diagnostics, trust

| 기능 | 제품·경로 | 상태/보안 경계 | WWW 적용 |
|---|---|---|---|
| Shell bootstrap | Oh My Zsh `oh-my-zsh.sh`, `.zshrc` template | 현재 zsh 함수/alias/option/fpath/prompt를 변형한다. | WWW app lifecycle과 host shell bootstrap을 분리한다. |
| Completion cache | Oh My Zsh completion/compfix | OMZ revision+fpath fingerprint로 invalidate하고 compaudit한다. | command registry version 기반 cache 원칙만 참고한다. |
| Async prompt | Oh My Zsh `lib/async_prompt.zsh` | Git 등 비싼 값을 background에서 계산하고 ZLE prompt를 reset한다. | repository/status snapshot의 async refresh와 stale replacement에 참고한다. |
| Update | Oh My Zsh updater | mode/frequency/lock을 두지만 mutable checkout을 pull한다. | check/apply 분리는 채택, signed artifact+atomic replacement 없이 auto-update하지 않는다. |
| Diagnostics | Oh My Zsh diagnostics; terminal debug logs | system/config 내용을 모으지만 민감성 경고가 필요하다. | allowlist schema, secret/path redaction, 사용자 동의가 있는 bundle만 허용한다. |
| Plugin trust | OMZ source, Pi/OMP TS extension, OpenCode npm plugin | 대부분 host process와 동일 권한이다. | 외부 plugin은 manifest/API version/capability/approval/격리 전에는 공개하지 않는다. |
| Host terminal config | iTerm2 profile, Ghostty config | font/window/keybinding/shell integration을 host가 소유한다. | WWW가 파일을 자동 수정하지 않고 진단과 권장 설정만 제공한다. |

## 13. WWW 실제 파일 배치

| 기능 | Domain | Application port/use case | Infrastructure | TUI projection |
|---|---|---|---|---|
| Model/Router | `domain/model-settings.ts` | `ModelClient`, `RouterSettingsController`, `RouterService` | `model-router.ts`, `settings-store.ts` | `router-overlays.ts`, `RouterModelView` |
| Auth | provider/auth state | `AuthController` | `auth-service.ts`, `credential-store.ts` | `auth-overlay.ts`, `/login`, `/logout` |
| Usage | display-safe limit snapshot | `UsageMonitor` | `usage-service.ts` + Gajae AI adapter | `UsageStripView`, `/usage` |
| Session | `session-events.ts` | `SessionRuntime`, `SessionRepository` | `session-store.ts` | `TranscriptView`, `SessionFlowView` |
| Output | `output.ts`, `narration.ts` | `SessionRuntime` event projection | `agent-tools.ts` | truthful narration, `BashResultCard`, `CompletionSummaryCard` |
| Monitoring | `monitoring.ts` | `SessionMonitor` | Session/Todo 정본 재사용 | `MonitoringOverlay`, `/monitor`, `/dashboard` |
| Planning | `planning.ts` | `PlanningService` | `planning-store.ts`, project-local catalog/artifacts | `/planning`, `/epic`, `/story` |
| Direct terminal | `terminal.ts`, `output.ts` | `TerminalCommandExecutor`, `SessionRuntime` lifecycle | restricted env, non-interactive process group executor | `!<command>` is explicit user authority, never an Agent auto-tool |
| Commit/Issue | `repository.ts` | `RepositoryInsights` | `repository-insights.ts` | `repository-overlays.ts`, `/commits`, `/issues` |
| Markdown | assistant text item | render scheduling boundary | native syntax package adapter | `syntax-highlighter.ts`, `render-scheduler.ts`, theme |
| Layout | 없음 | 없음 | 없음 | `dashboard-layout.ts`, `OverlaySheet`, `app-shell.ts` |

## 14. 최종 채택 규칙

| 규칙 | 근거 |
|---|---|
| Host terminal, shell framework, TUI engine, Agent runtime을 한 plugin 계층으로 섞지 않는다. | 각 제품의 state owner와 lifecycle이 다르다. |
| 외부 제품에서는 event/DTO/정보 예산 원칙을 가져오고 renderer/runtime 내부를 직접 결합하지 않는다. | 업데이트 비용과 제품 복제 위험을 줄인다. |
| 화면 projection은 raw session/output/Git 정본을 바꾸지 않는다. | truncate, fold, filter가 증거 손실로 이어지지 않게 한다. |
| 색상은 semantic token이며 label/border/position을 함께 사용한다. | terminal palette와 접근성 차이를 견딘다. |
| plugin은 작은 typed internal seam부터 시작한다. | arbitrary in-process code는 trust와 rollback이 없다. |
| effectful Git/Issue/tool 동작은 preview와 명시적 승인 후에만 실행한다. | TUI 조회와 repository mutation을 분리한다. |

## 15. 관련 문서

- [`TUI_COMPARISON.md`](./TUI_COMPARISON.md): 제품 철학과 채택/비채택 비교
- [`../decisions/0001-tui-foundation.md`](../decisions/0001-tui-foundation.md): pi-tui 기반 별도 Shell 결정
- [`../spikes/tui-bakeoff/RESULTS.md`](../spikes/tui-bakeoff/RESULTS.md): Bubble Tea와 Gajae TUI 실측 비교
- [`../.www/Epics.md`](../.www/Epics.md) · [`../.www/Stories.md`](../.www/Stories.md): 누적 Epic·Story 계획

## 16. Ghostty 정확한 Host Terminal 코드 지도

| 기능 | 코드 경로 | WWW 책임선 |
|---|---|---|
| PTY·프로세스·IO | [`src/termio/Exec.zig`](https://github.com/ghostty-org/ghostty/blob/main/src/termio/Exec.zig), [`src/pty.zig`](https://github.com/ghostty-org/ghostty/blob/main/src/pty.zig) | command executor와 별개인 host 책임이다. |
| VT parser | [`src/terminal/Parser.zig`](https://github.com/ghostty-org/ghostty/blob/main/src/terminal/Parser.zig), [`parse_table.zig`](https://github.com/ghostty-org/ghostty/blob/main/src/terminal/parse_table.zig), [`osc.zig`](https://github.com/ghostty-org/ghostty/blob/main/src/terminal/osc.zig) | 재구현하지 않는다. model/tool의 control sequence는 card 경계에서 sanitize한다. |
| Terminal grid/state | [`Terminal.zig`](https://github.com/ghostty-org/ghostty/blob/main/src/terminal/Terminal.zig), [`Screen.zig`](https://github.com/ghostty-org/ghostty/blob/main/src/terminal/Screen.zig), [`PageList.zig`](https://github.com/ghostty-org/ghostty/blob/main/src/terminal/PageList.zig) | WWW 정본은 cell grid가 아니라 Session/Turn/Item이다. |
| Renderer-neutral bridge | [`src/terminal/render.zig`](https://github.com/ghostty-org/ghostty/blob/main/src/terminal/render.zig) | canonical state와 dirty projection 분리 원칙만 채택한다. |
| GPU renderer | [`src/renderer/generic.zig`](https://github.com/ghostty-org/ghostty/blob/main/src/renderer/generic.zig), [`Metal.zig`](https://github.com/ghostty-org/ghostty/blob/main/src/renderer/Metal.zig), [`OpenGL.zig`](https://github.com/ghostty-org/ghostty/blob/main/src/renderer/OpenGL.zig) | glyph/GPU/compositor는 host에 남긴다. |
| macOS surface | [`SurfaceView_AppKit.swift`](https://github.com/ghostty-org/ghostty/blob/main/macos/Sources/Ghostty/Surface%20View/SurfaceView_AppKit.swift), [`TerminalController.swift`](https://github.com/ghostty-org/ghostty/blob/main/macos/Sources/Features/Terminal/TerminalController.swift) | NSView/window/tab lifecycle은 host 책임이다. |
| Linux surface | [`src/apprt/gtk/class/surface.zig`](https://github.com/ghostty-org/ghostty/blob/main/src/apprt/gtk/class/surface.zig), [`window.zig`](https://github.com/ghostty-org/ghostty/blob/main/src/apprt/gtk/class/window.zig) | GTK widget/window를 WWW에 도입하지 않는다. |
| Native split tree | [`SplitTree.swift`](https://github.com/ghostty-org/ghostty/blob/main/macos/Sources/Features/Splits/SplitTree.swift), [`split_tree.zig`](https://github.com/ghostty-org/ghostty/blob/main/src/apprt/gtk/class/split_tree.zig) | host split leaf는 독립 PTY다. WWW panel은 같은 session projection이므로 다른 개념이다. |
| Typed config | [`src/config/Config.zig`](https://github.com/ghostty-org/ghostty/blob/main/src/config/Config.zig), [`file_load.zig`](https://github.com/ghostty-org/ghostty/blob/main/src/config/file_load.zig) | app-owned model/display/keymap만 WWW settings에 둔다. |
| Key routing | [`src/input/Binding.zig`](https://github.com/ghostty-org/ghostty/blob/main/src/input/Binding.zig), [`key_encode.zig`](https://github.com/ghostty-org/ghostty/blob/main/src/input/key_encode.zig) | OS-global/terminal encoding은 host, slash/focus/cancel은 WWW가 소유한다. |
| Shell integration | [`src/shell-integration`](https://github.com/ghostty-org/ghostty/tree/main/src/shell-integration) | interactive shell startup을 변경하지 않는다. cwd/exit는 Agent event로 얻는다. |
| Clipboard·OSC 52 | [`src/terminal/clipboard.zig`](https://github.com/ghostty-org/ghostty/blob/main/src/terminal/clipboard.zig), [OSC 52 docs](https://ghostty.org/docs/vt/osc/52) | 명시적 copy action만 host capability를 사용하고 model output의 OSC는 신뢰하지 않는다. |
| IME | macOS `NSTextInputClient` in `SurfaceView_AppKit.swift`, GTK `GtkIMMulticontext` in `class/surface.zig` | WWW가 OS IME를 구현하지 않고 pi-tui Editor가 composition을 보존한다. |
| Accessibility | macOS `SurfaceView_AppKit.swift`; GTK는 current main에서 terminal text adapter 미완료 | WWW 보장은 non-color label, plain-text export, logical focus에 한정한다. |

## 17. Oh My Zsh 정확한 Shell Framework 코드 지도

| 기능 | 코드 경로 | loader/state 방식 | WWW 판단 |
|---|---|---|---|
| 설치 | [`tools/install.sh`](https://github.com/ohmyzsh/ohmyzsh/blob/a5ecff7560b2e26f612032c632a12c75a3048bd0/tools/install.sh), [`zshrc` template](https://github.com/ohmyzsh/ohmyzsh/blob/a5ecff7560b2e26f612032c632a12c75a3048bd0/templates/zshrc.zsh-template) | checkout, 기존 config backup, 선택적 login-shell 변경 | backup/비대화형 원칙만 채택하고 shell 변경은 하지 않는다. |
| 시작 순서 | [`oh-my-zsh.sh`](https://github.com/ohmyzsh/ohmyzsh/blob/a5ecff7560b2e26f612032c632a12c75a3048bd0/oh-my-zsh.sh) | `fpath/completion → lib → plugins → custom → theme`를 현재 zsh에 source | composition 순서만 참고하고 ambient shell state를 WWW 정본으로 삼지 않는다. |
| Plugin loader | `oh-my-zsh.sh`, [`lib/cli.zsh`](https://github.com/ohmyzsh/ohmyzsh/blob/a5ecff7560b2e26f612032c632a12c75a3048bd0/lib/cli.zsh) | ordered `plugins=(...)`, custom path가 stock을 shadow | typed registry/order는 채택, arbitrary `.zsh` source는 비채택이다. |
| Theme/prompt | [`lib/theme-and-appearance.zsh`](https://github.com/ohmyzsh/ohmyzsh/blob/a5ecff7560b2e26f612032c632a12c75a3048bd0/lib/theme-and-appearance.zsh), [`async_prompt.zsh`](https://github.com/ohmyzsh/ohmyzsh/blob/a5ecff7560b2e26f612032c632a12c75a3048bd0/lib/async_prompt.zsh) | `PROMPT/RPROMPT`, precmd/ZLE async refresh | semantic color와 async stale 교체만 참고한다. |
| Completion | [`lib/completion.zsh`](https://github.com/ohmyzsh/ohmyzsh/blob/a5ecff7560b2e26f612032c632a12c75a3048bd0/lib/completion.zsh), [`compfix.zsh`](https://github.com/ohmyzsh/ohmyzsh/blob/a5ecff7560b2e26f612032c632a12c75a3048bd0/lib/compfix.zsh) | revision+fpath fingerprint, compinit/compaudit/cache | registry fingerprint invalidate만 WWW command completion에 적용할 수 있다. |
| Git | [`plugins/git/git.plugin.zsh`](https://github.com/ohmyzsh/ohmyzsh/blob/a5ecff7560b2e26f612032c632a12c75a3048bd0/plugins/git/git.plugin.zsh), [`lib/git.zsh`](https://github.com/ohmyzsh/ohmyzsh/blob/a5ecff7560b2e26f612032c632a12c75a3048bd0/lib/git.zsh) | aliases/helper와 non-locking prompt snapshot | alias 주입은 거부하고 read-only structured snapshot만 채택한다. |
| Update | [`check_for_upgrade.sh`](https://github.com/ohmyzsh/ohmyzsh/blob/a5ecff7560b2e26f612032c632a12c75a3048bd0/tools/check_for_upgrade.sh), [`upgrade.sh`](https://github.com/ohmyzsh/ohmyzsh/blob/a5ecff7560b2e26f612032c632a12c75a3048bd0/tools/upgrade.sh) | mode/frequency/cache/lock 후 mutable checkout pull | check/apply 분리는 채택, signed artifact 없는 self-update는 비채택이다. |
| Diagnostics | [`lib/diagnostics.zsh`](https://github.com/ohmyzsh/ohmyzsh/blob/a5ecff7560b2e26f612032c632a12c75a3048bd0/lib/diagnostics.zsh) | system/shell/config dump와 민감성 경고 | allowlist schema+redaction+동의가 있는 bundle로만 변형 채택한다. |
| Trust | plugin/theme/custom 파일을 같은 shell 권한으로 source | completion 일부 외에는 sandbox 없음 | external WWW plugin 모델로 복제하지 않는다. |

## 18. iTerm2 정확한 Host Terminal 코드 지도

| 기능 | 코드 경로 | 구현 경계 | WWW 판단 |
|---|---|---|---|
| VT parser | [`sources/VT100/VT100Parser.h`](https://github.com/gnachman/iTerm2/blob/master/sources/VT100/VT100Parser.h) | byte stream을 `VT100Token`으로 바꾼다. | ANSI를 생산하는 WWW가 다시 VT parser를 갖지 않는다. |
| Terminal protocol state | [`VT100Terminal.h`](https://github.com/gnachman/iTerm2/blob/master/sources/VT100/VT100Terminal.h) | mode/encoding/escape dispatch를 소유한다. | host terminal 책임이다. |
| Mutable screen state | [`VT100ScreenMutableState.h`](https://github.com/gnachman/iTerm2/blob/master/sources/VT100Screen/VT100ScreenMutableState.h), [`TerminalDelegate`](https://github.com/gnachman/iTerm2/blob/master/sources/VT100Screen/VT100ScreenMutableState%2BTerminalDelegate.h) | cursor/buffer/scroll region/text mutation과 side effect 경계를 둔다. | protocol/state/side-effect 분리 원칙만 채택한다. |
| Metal renderer | [`iTermMetalDriver.h`](https://github.com/gnachman/iTerm2/blob/master/sources/MetalRenderer/iTermMetalDriver.h), [`iTermMetalView.swift`](https://github.com/gnachman/iTerm2/blob/master/sources/MetalRenderer/iTermMetalView.swift), [`Renderers`](https://github.com/gnachman/iTerm2/tree/master/sources/MetalRenderer/Renderers) | frame datasource로 grid/glyph/cursor/IME/image를 비동기 draw한다. | render snapshot 분리는 참고하지만 GPU/glyph renderer는 host에 남긴다. |
| Window/tab/split | [`PseudoTerminal.h`](https://github.com/gnachman/iTerm2/blob/master/sources/TerminalView/PseudoTerminal.h), [`PTYTab.h`](https://github.com/gnachman/iTerm2/blob/master/sources/TerminalView/PTYTab.h), [`PTYSplitView.h`](https://github.com/gnachman/iTerm2/blob/master/sources/TerminalView/PTYSplitView.h) | macOS window→tab→session/split topology를 소유한다. | WWW panel/overlay와 host pane/tab을 구분한다. |
| Terminal text/input view | [`PTYTextView.h`](https://github.com/gnachman/iTerm2/blob/master/sources/TerminalView/PTYTextView.h), [`PTYTextView.m`](https://github.com/gnachman/iTerm2/blob/master/sources/TerminalView/PTYTextView.m) | 한 terminal surface의 display, selection, input, `NSTextInputClient`를 처리한다. | OS IME는 host, command/editor intent는 WWW가 소유한다. |
| tmux control mode | [`TmuxGateway.h`](https://github.com/gnachman/iTerm2/blob/master/sources/TmuxIntegration/TmuxGateway.h), [`TmuxController.h`](https://github.com/gnachman/iTerm2/blob/master/sources/TmuxIntegration/TmuxController.h), [`TmuxLayoutParser.h`](https://github.com/gnachman/iTerm2/blob/master/sources/TmuxIntegration/TmuxLayoutParser.h) | protocol gateway, connection state, layout parser, dashboard를 분리한다. | 외부 protocol adapter와 UI 분리만 참고하고 WWW를 tmux client로 만들지 않는다. |
| Shell integration | [`ShellIntegrationInjection.swift`](https://github.com/gnachman/iTerm2/blob/master/sources/ShellIntegration/ShellIntegrationInjection.swift), [`sources/ShellIntegration`](https://github.com/gnachman/iTerm2/tree/master/sources/ShellIntegration) | shell별 script를 주입하고 prompt/command/cwd semantic mark를 수신한다. | user login shell을 수정하지 않고 Agent event의 cwd/command/exit를 사용한다. |
| Status components | [`iTermStatusBarLayout.h`](https://github.com/gnachman/iTerm2/blob/master/sources/StatusBar/Core/iTermStatusBarLayout.h), [`LayoutAlgorithm.h`](https://github.com/gnachman/iTerm2/blob/master/sources/StatusBar/Core/iTermStatusBarLayoutAlgorithm.h), [`Components`](https://github.com/gnachman/iTerm2/tree/master/sources/StatusBar/Components) | stable layout/overflow를 Core가, data/view를 component가 소유한다. | WWW HUD도 component contract와 정보 우선순위를 분리한다. |
| Triggers | [`Trigger.h`](https://github.com/gnachman/iTerm2/blob/master/sources/Triggers/Trigger.h), [`Trigger.m`](https://github.com/gnachman/iTerm2/blob/master/sources/Triggers/Trigger.m) | regex matcher, action parameter, scope/provenance, callback scheduler를 분리한다. | structured Agent event를 우선하고 terminal output 전체 scrape는 하지 않는다. |
| Profiles | [`ProfileModel.h`](https://github.com/gnachman/iTerm2/blob/master/sources/Settings/Profiles/ProfileModel.h), [`ProfilesPanel`](https://github.com/gnachman/iTerm2/tree/master/sources/ProfilesPanel), [`AutomaticProfileSwitching`](https://github.com/gnachman/iTerm2/tree/master/sources/AutomaticProfileSwitching) | stored model, edit UI, context-selected effective profile을 분리한다. | source가 있는 effective settings 원칙은 채택하되 terminal font/TERM/profile은 중복 소유하지 않는다. |
| Accessibility | [`iTermTextViewAccessibilityHelper.h`](https://github.com/gnachman/iTerm2/blob/master/sources/Accessibility/iTermTextViewAccessibilityHelper.h) | cell/line 좌표를 text range, selection, cursor, bounds로 변환한다. | native bridge는 host에 위임하고 WWW는 semantic label/focus/plain text를 제공한다. |

## 19. Oh My OpenAgent 정확한 Extension 코드 지도

Oh My OpenAgent는 OpenCode 전체 TUI를 구현하지 않는다. **OpenCode host TUI가 shell·renderer·theme·model picker·toast를 소유하고 OMO가 slot/sidebar/workflow를 등록한다.** 설치 화면은 별도의 `@clack/prompts` wizard다.

| 기능 | 코드 경로 | 핵심 타입·정본 | WWW 판단 |
|---|---|---|---|
| 설치 wizard | [`cli/install.ts`](https://github.com/code-yeongyu/oh-my-openagent/blob/dev/packages/omo-opencode/src/cli/install.ts), [`tui-installer.ts`](https://github.com/code-yeongyu/oh-my-openagent/blob/dev/packages/omo-opencode/src/cli/tui-installer.ts), [`tui-install-prompts.ts`](https://github.com/code-yeongyu/oh-my-openagent/blob/dev/packages/omo-opencode/src/cli/tui-install-prompts.ts) | `@clack/prompts` UI, CLI args/config가 입력이고 결과는 OpenCode/OMO config | runtime TUI와 installer를 분리한다. |
| TUI plugin entry | [`packages/omo-opencode/src/tui.ts`](https://github.com/code-yeongyu/oh-my-openagent/blob/dev/packages/omo-opencode/src/tui.ts) | `TuiPluginModule`, host slot API | 외부 agent가 전체 shell을 교체하지 않고 named slot만 등록하는 장기 모델에 참고한다. |
| Sidebar projection | [`features/tui-sidebar`](https://github.com/code-yeongyu/oh-my-openagent/tree/dev/packages/omo-opencode/src/features/tui-sidebar), [`snapshot-builder.ts`](https://github.com/code-yeongyu/oh-my-openagent/blob/dev/packages/omo-opencode/src/features/tui-sidebar/snapshot-builder.ts), [`render-view.ts`](https://github.com/code-yeongyu/oh-my-openagent/blob/dev/packages/omo-opencode/src/features/tui-sidebar/render-view.ts) | `TuiRuntimeSnapshot`, `AgentRow`, `RosterRow`; BackgroundManager/session/config에서 만든 mirror | projection을 정본으로 취급하지 않는다. 단일 process WWW는 file polling mirror를 복제할 이유가 없다. |
| BTW side UI | [`features/btw-side/tui-wiring.ts`](https://github.com/code-yeongyu/oh-my-openagent/blob/dev/packages/omo-opencode/src/features/btw-side/tui-wiring.ts) | host `Prompt`, `Slot`, `toast`, theme/renderer를 소비 | side conversation은 host-owned overlay/slot으로 구성한다. |
| Agent registry/config | [`agent-names.ts`](https://github.com/code-yeongyu/oh-my-openagent/blob/dev/packages/omo-opencode/src/config/schema/agent-names.ts), [`builtin-agents.ts`](https://github.com/code-yeongyu/oh-my-openagent/blob/dev/packages/omo-opencode/src/agents/builtin-agents.ts), [`agent-config-handler.ts`](https://github.com/code-yeongyu/oh-my-openagent/blob/dev/packages/omo-opencode/src/plugin-handlers/agent-config-handler.ts) | builtin agent definition과 effective model config가 정본 | future AgentCard는 registry+effective model+runtime status의 projection으로 만든다. |
| Background tasks | [`background-agent/manager.ts`](https://github.com/code-yeongyu/oh-my-openagent/blob/dev/packages/omo-opencode/src/features/background-agent/manager.ts), [`types.ts`](https://github.com/code-yeongyu/oh-my-openagent/blob/dev/packages/omo-opencode/src/features/background-agent/types.ts), [`tools/background-task`](https://github.com/code-yeongyu/oh-my-openagent/tree/dev/packages/omo-opencode/src/tools/background-task) | `BackgroundManager.tasks`, `pending/running/completed/error/cancelled/interrupt` | task store/event를 정본으로 두고 sidebar/toast/card를 독립 projection으로 만든다. |
| Toast | [`task-toast-manager/manager.ts`](https://github.com/code-yeongyu/oh-my-openagent/blob/dev/packages/omo-opencode/src/features/task-toast-manager/manager.ts) | OMO가 payload를 만들고 OpenCode가 렌더 | notification 요청과 host rendering을 분리한다. |
| Hook registry | [`create-hooks.ts`](https://github.com/code-yeongyu/oh-my-openagent/blob/dev/packages/omo-opencode/src/create-hooks.ts), [`plugin/hooks`](https://github.com/code-yeongyu/oh-my-openagent/tree/dev/packages/omo-opencode/src/plugin/hooks), [`config/schema/hooks.ts`](https://github.com/code-yeongyu/oh-my-openagent/blob/dev/packages/omo-opencode/src/config/schema/hooks.ts) | config enablement, ordered composition, dispose | typed registry가 enablement/order/dispose를 소유하게 한다. 파일 존재를 activation으로 보지 않는다. |
| Slash discovery | [`builtin-commands/commands.ts`](https://github.com/code-yeongyu/oh-my-openagent/blob/dev/packages/omo-opencode/src/features/builtin-commands/commands.ts), [`command-discovery.ts`](https://github.com/code-yeongyu/oh-my-openagent/blob/dev/packages/omo-opencode/src/tools/slashcommand/command-discovery.ts), [`auto-slash-command/hook.ts`](https://github.com/code-yeongyu/oh-my-openagent/blob/dev/packages/omo-opencode/src/hooks/auto-slash-command/hook.ts) | project/user/builtin/plugin command를 precedence로 dedup | command provenance와 duplicate policy를 명시하고 Shell command와 workflow를 분리한다. |
| Model resolution | [`model-resolution-pipeline.ts`](https://github.com/code-yeongyu/oh-my-openagent/blob/dev/packages/model-core/src/model-resolution-pipeline.ts), [`agent-config-handler.ts`](https://github.com/code-yeongyu/oh-my-openagent/blob/dev/packages/omo-opencode/src/plugin-handlers/agent-config-handler.ts) | UI choice→override→category→provider fallback→default, provenance 포함 | picker/auth/catalog는 WWW host, Agent policy는 순수 resolution service가 소유한다. silent fallback은 금지한다. |
| Usage/status | [`tui-sidebar/snapshot-builder.ts`](https://github.com/code-yeongyu/oh-my-openagent/blob/dev/packages/omo-opencode/src/features/tui-sidebar/snapshot-builder.ts), [`hooks/goal/types.ts`](https://github.com/code-yeongyu/oh-my-openagent/blob/dev/packages/omo-opencode/src/hooks/goal/types.ts) | session/background status와 goal token/time usage; 일반 quota dashboard는 없음 | provider quota는 host UsageMonitor, plugin은 agent/goal 전용 status만 제공한다. |
| Git skill | [`git-master.ts`](https://github.com/code-yeongyu/oh-my-openagent/blob/dev/packages/skills-loader-core/src/features/builtin-skills/skills/git-master.ts), [`git-master-sections`](https://github.com/code-yeongyu/oh-my-openagent/tree/dev/packages/skills-loader-core/src/features/builtin-skills/skills/git-master-sections) | commit/rebase/history를 가르치는 prompt skill, Git repository가 정본 | Git process는 host executor, skill은 정책/workflow만 제공한다. Git UI와 혼동하지 않는다. |
| Worktree sweep | [`cli/worktree-sweep/git.ts`](https://github.com/code-yeongyu/oh-my-openagent/blob/dev/packages/omo-opencode/src/cli/worktree-sweep/git.ts), [`sweep.ts`](https://github.com/code-yeongyu/oh-my-openagent/blob/dev/packages/omo-opencode/src/cli/worktree-sweep/sweep.ts) | 실제 git CLI orchestration | destructive cleanup은 preview·approval과 별도 process lifecycle이 필요하다. |
| Issue/PR triage | [`.agents/skills/github-triage/SKILL.md`](https://github.com/code-yeongyu/oh-my-openagent/blob/dev/.agents/skills/github-triage/SKILL.md) | repository maintainer용 GET-only skill; runtime OMO Issue UI가 아님 | OMO parity로 오인하지 않고 WWW `RepositoryInsights` 고유 기능으로 명시한다. |

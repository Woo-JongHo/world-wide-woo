# Gajae Code·Senpi·Pi·WWW 터미널/TUI 심층 비교

- 조사일: 2026-09-04 (Asia/Seoul)
- Gajae Code: [`bf188c1`](https://github.com/Yeachan-Heo/gajae-code/tree/bf188c1cda0665219f8af2edbed1256eede317bc), v0.16.1
- Senpi: [`f91130e`](https://github.com/code-yeongyu/senpi/tree/f91130e0fa3c8f3db5a60301878cd3e0c5a869b7)
- Pi: [`4e69b0c`](https://github.com/earendil-works/pi-mono/tree/4e69b0c28060f0f02fbe38bfa7c21a2e2eb25057)
- WWW: 이 저장소의 2026-09-04 worktree. WES snapshot은 연결되지 않았으므로 비교하지 않는다.

이 문서의 `Pi`는 Pi Coding Agent를, `Senpi`는 `code-yeongyu/senpi`를 뜻한다. Senpi는 Pi의 실험적 포크이며, WWW도 현재 `@earendil-works/pi-tui` 0.84.4를 사용한다. 따라서 네 제품은 단순한 외형 경쟁이 아니라 **공통 TUI 계보 위에서 제품이 어디까지 책임지는가**의 차이로 봐야 한다.

## 1. 결론부터

| 대상 | 가장 강한 점 | 가장 큰 비용 | WWW가 배울 것 |
|---|---|---|---|
| Gajae Code | scrollback을 보존하면서도 status/composer를 고정하고, theme·status rail·workflow HUD·terminal edge case를 제품 수준으로 완성 | 기능과 상태 축이 많아 내부 복잡도·호환성·플러그인 신뢰 비용이 큼 | HUD 정보 예산, semantic symbol/theme, viewport anchor, theme fallback, workflow state→chip 투영 |
| Senpi | Pi의 구조를 유지하면서 permission·goal·todo·compaction·model preset을 기본 제품에 넣고 footer 폭 축소를 정교화 | upstream 추종과 자체 변경, 두 renderer, 여러 terminal protocol의 조합 폭발 | footer 우선순위 축소, 상태 surface 계층화, 실전 builtin과 core의 경계 |
| Pi | 작은 core, 두 renderer, 깊은 extension API, 안정적인 Markdown·diff·editor·overlay seam | orchestration·plan·multi-agent 관찰은 기본 화면에 없고 extension 품질에 의존 | TUI engine과 제품 projection 분리, main/fullscreen 선택, steering/follow-up, 교체 가능한 renderer |
| WWW | Chat·T-note·Todo·Map·Stats·Monitor, Native activity, evidence와 usage를 제품 기본 구조로 엮는 Operations Workbench | pi-tui를 사용하면서도 자체 theme/HUD/layout을 직접 소유해 유지·검증 부담이 큼; 외부 수준의 테마·터미널 matrix는 미완 | 외형보다 Progress Model·Evidence·Approval의 정보 구조를 더 선명하게 만들되 기반 엔진 기능은 재사용 |

가장 중요한 판단은 다음과 같다.

1. **Gajae의 외형을 복제할 이유는 없다.** Gajae의 강점은 붉은 팔레트나 pet이 아니라 상태를 semantic token, glyph, 위치, label로 중복 표현하는 정보 설계다.
2. **Senpi와 Pi는 별개 엔진처럼 비교하면 안 된다.** Senpi는 Pi 계열의 productized fork다. 차이는 renderer보다 builtin 정책, footer 정보, permission/goal/todo/compaction 통합에 있다.
3. **WWW의 차별점은 더 많은 pane이 아니다.** Native 실행 상태를 사용자가 정의한 Progress·Contract·Evidence로 재해석하는 control-plane projection이어야 한다.
4. **현재 WWW는 시각적 기본기는 이미 상당히 갖췄다.** semantic palette, native syntax highlighting, bounded rendering, 3-pane layout, overlay, usage HUD, activity indicator가 있다. 약점은 theme ecosystem, main-screen mode, intra-line diff, 입력 queue 의미, terminal matrix와 확장 API다.

## 2. 제품 계보와 책임 경계

```text
Pi / pi-tui
  ├─ minimal coding agent product
  ├─ main-screen + alternate-screen renderer
  └─ extension-first UI seam
       │
       ├─ Senpi
       │    └─ Pi + permission/goal/todo/compaction/presets + 정교한 footer
       │
       └─ WWW
            └─ pi-tui engine + 별도 domain/application/infrastructure/presentation

Gajae Code
  └─ 독립 product/runtime + 자체 @gajae-code/tui + workflow/status/theme 체계
```

Gajae의 coding-agent는 의미 있는 화면 트리와 workflow 상태를 만들고, `@gajae-code/tui`는 `Component.render(width) -> string[]`의 결과를 differential render한다. [TUI runtime internals](https://github.com/Yeachan-Heo/gajae-code/blob/bf188c1cda0665219f8af2edbed1256eede317bc/docs/tui-runtime-internals.md)

Pi 역시 `pi-ai`, `pi-agent-core`, `pi-coding-agent`, `pi-tui`를 분리하고 interactive/print/JSON/RPC/SDK 표면을 둔다. 기본 제품은 의도적으로 작고 header/footer/editor/widget/overlay/tool/message를 extension이 바꿀 수 있다. [Pi README](https://github.com/earendil-works/pi-mono/blob/4e69b0c28060f0f02fbe38bfa7c21a2e2eb25057/packages/coding-agent/README.md), [extensions UI API](https://github.com/earendil-works/pi-mono/blob/4e69b0c28060f0f02fbe38bfa7c21a2e2eb25057/packages/coding-agent/docs/extensions.md#widgets-status-and-footer)

Senpi는 스스로 Pi의 opinionated fork임을 밝히고 core 수정은 `changes.md`로 추적한다. permission system, todo continuation, goal, model preset, compaction 등을 builtin으로 넣어 Pi의 조립식 기반을 일상용 제품으로 좁힌다. [Senpi README](https://github.com/code-yeongyu/senpi/blob/f91130e0fa3c8f3db5a60301878cd3e0c5a869b7/README.md)

WWW는 `src/domain → application → infrastructure → presentation/tui` 경계를 두고 pi-tui를 presentation engine으로만 쓴다. 이 선택은 올바르다. 다만 `patches/@earendil-works%2Fpi-tui@0.84.4.patch`가 있으므로 upstream engine과의 차이를 명시적으로 관리해야 한다.

## 3. 실제 화면 구조

| 층 | Gajae Code | Senpi | Pi | WWW |
|---|---|---|---|---|
| 상단/본문 | welcome, transcript 또는 IRC split | startup header + transcript | startup header + transcript | 외곽 frame + Chat/T-note/Todo 또는 Monitor/Map/Stats |
| 실행 출력 | transcript 안 rich tool/Bash card, grouped read | Pi 계열 tool card + builtin widget | transcript 안 tool card | `WorkStepCard`, result card, public projection |
| 일시 상태 | loader/retry/compaction/todo/BTW | working/retry/compaction + widgets | working/retry/compaction + widgets | Native activity indicator, approval/queue, telemetry |
| 하단 고정 | status line + skill HUD + hook status + editor + pet | pending/status/widget/editor/footer | pending/status/widget/editor/footer | telemetry/editor + 4행 usage/Wooni HUD |
| 보조 surface | overlay, selector, jobs/tasks/session dashboard | overlay, fullscreen search, custom widgets | overlay, fullscreen search, custom widgets | approval/model/repository/monitoring overlay, view mode |

### 구조 평가

- **Gajae Code**는 native scrollback을 살리면서 suffix를 bottom-pin한다. 수동 history 탐색 중 semantic anchor를 유지하고 새 의미 출력에만 `New output` 표지를 띄운다. 장시간 transcript UX가 가장 정교하다. [TUI README](https://github.com/Yeachan-Heo/gajae-code/blob/bf188c1cda0665219f8af2edbed1256eede317bc/packages/tui/README.md#manual-viewport-and-pinned-suffix)
- **Pi/Senpi**는 main-screen과 alternate-screen/fullscreen을 같은 component tree 위에서 선택한다. 전자는 shell scrollback, 후자는 고정 dock·독립 scroll·검색에 유리하다. [Pi TUI README](https://github.com/earendil-works/pi-mono/blob/4e69b0c28060f0f02fbe38bfa7c21a2e2eb25057/packages/tui/README.md)
- **WWW**는 `TuiAltScreen`을 고정 선택한다. Chat/T-note/Todo를 동시에 보여 주는 데는 적합하지만 shell scrollback·copy/search 친화성은 Pi의 main-screen보다 낮다. 반대로 다중 영역의 공간적 관계는 세 경쟁 제품 기본 화면보다 강하다.

## 4. 렌더링과 터미널 안정성

| 항목 | Gajae Code | Senpi/Pi | WWW |
|---|---|---|---|
| component 계약 | width→ANSI lines, input/mouse/focus/dispose | 거의 같은 작은 계약 + layout nodes | pi-tui component를 조합 |
| repaint | changed-line range, synchronized output, virtual viewport | changed lines/viewport rows, synchronized output | pi-tui differential render + `RenderScheduler` |
| stream throttling | Markdown cache/throttle + terminal flush | component update/invalidate | token delta 64ms 병합, terminal frame 즉시 |
| long transcript | off-screen prefix virtualization + semantic anchor | fullscreen ScrollView / main scrollback | bounded public projection과 view별 scroll |
| IME/CJK | hardware cursor, Kitty/xterm fallback 예외, grapheme selection | cursor marker, CJK width·native modifiers | pi-tui Editor에 의존; 실제 terminal matrix 미수락 |
| image | Kitty/iTerm2/Sixel, lease와 erase 관리 | Kitty/iTerm2 및 tmux capability | 아직 제품 기능 아님 |

Gajae는 `CSI ?2026` synchronized output, viewport repaint, resize/replay/IME/perf red-team 테스트를 자체 엔진에 축적했다. 이 점은 기능 수보다 더 큰 경쟁력이다. [gajae tui.ts](https://github.com/Yeachan-Heo/gajae-code/blob/bf188c1cda0665219f8af2edbed1256eede317bc/packages/tui/src/tui.ts), [TUI tests](https://github.com/Yeachan-Heo/gajae-code/tree/bf188c1cda0665219f8af2edbed1256eede317bc/packages/tui/test)

WWW는 repaint coalescing과 ANSI 폭 보존을 직접 보강했지만 `.www/Stories.md`의 ST-005-02가 아직 미완료다. 즉 truecolor·256색·무색 terminal 대비, 실제 Windows Terminal·장기 session은 **구현 추정이 아니라 수락 근거가 부족한 상태**다.

## 5. 색상과 semantic theme

### Gajae Code

가장 넓은 체계다. core, surface, Markdown, diff, syntax, thinking, status segment, symbol을 분리한다. dark 기본은 red-claw, light 기본은 blue-crab이고 Claude Code/Codex/OpenCode migration theme도 번들한다. `unicode/nerd/ascii` symbol preset까지 theme contract에 포함하며 OSC 11→`COLORFGBG`→platform fallback으로 배경 명도를 판단한다. custom theme schema, live preview, file watch reload가 있다. [theme docs](https://github.com/Yeachan-Heo/gajae-code/blob/bf188c1cda0665219f8af2edbed1256eede317bc/docs/theme.md), [theme source](https://github.com/Yeachan-Heo/gajae-code/blob/bf188c1cda0665219f8af2edbed1256eede317bc/packages/coding-agent/src/modes/theme/theme.ts)

### Pi와 Senpi

둘의 기본 dark JSON은 현재 사실상 같은 Pi 계열 팔레트다. text `#d4d4d4`, accent `#8abeb7`, blue border, user/tool 상태별 dark surface, VS Code 계열 syntax 색을 쓴다. core/surface/Markdown/diff/syntax/thinking/bash mode가 semantic token으로 분리되고 theme schema와 hot reload를 제공한다. [Pi dark theme](https://github.com/earendil-works/pi-mono/blob/4e69b0c28060f0f02fbe38bfa7c21a2e2eb25057/packages/coding-agent/src/modes/interactive/theme/dark.json), [Senpi dark theme](https://github.com/code-yeongyu/senpi/blob/f91130e0fa3c8f3db5a60301878cd3e0c5a869b7/packages/coding-agent/src/modes/interactive/theme/dark.json)

### WWW

WWW는 graphite/teal/steel/amber 팔레트와 user/tool 상태 surface, Markdown, diff, syntax, effort 색을 코드 상수로 소유한다. 색상 선택 자체는 경쟁력이 있다. 특히 assistant는 terminal canvas, user만 surface를 가져 읽기 흐름이 좋다. 하지만 현재는:

- 단일 hard-coded theme이며 dark/light·terminal-default·256색 fallback theme가 없다.
- 사용자 theme schema, live preview/reload, symbol preset이 없다.
- semantic token이 Gajae만큼 세분화되지 않아 status segment와 view별 색이 `colors.*`에 직접 결합된다.
- 색각 대응은 별도 계약으로 확인되지 않는다.

따라서 다음 발전은 팔레트 교체가 아니라 **`ThemeTokens + SymbolTokens + CapabilityProjection`을 분리하는 것**이어야 한다.

## 6. Markdown·syntax·diff 하이라이팅

| 기능 | Gajae Code | Senpi | Pi | WWW |
|---|---|---|---|---|
| Markdown semantic style | 풍부 | 풍부 | 풍부 | 풍부 |
| syntax engine | lazy native highlighter | `cli-highlight` 계열, unknown fallback | highlight.js 계열, lazy grammar | native highlighter adapter |
| 대형 코드 방어 | block budget/sentinel | renderer budget | lazy/cache | 200KB 또는 2,000행 이후 plain |
| diff | line + rich tool renderer | line/intra-line 계열 | line + 1삭제/1추가 intra-line inverse | add/remove/context semantic 색 |
| streaming cache | instance/LRU, theme invalidation | Pi 계열 | component cache/invalidate | `RenderScheduler` + plugin boundary |

WWW의 `SyntaxHighlightPlugin` 경계와 budget은 좋다. native implementation을 presentation 전체에 누출하지 않고, 실패하면 plain themed text로 degrade한다. 다만 Pi가 제공하는 **intra-line diff**는 실제 리뷰 효율이 높고 WWW의 명확한 기능 차이다. [Pi diff](https://github.com/earendil-works/pi-mono/blob/4e69b0c28060f0f02fbe38bfa7c21a2e2eb25057/packages/coding-agent/src/modes/interactive/components/diff.ts)

## 7. HUD와 상태선

### Gajae Code: 가장 폭넓은 제품 HUD

status line은 문자열 하나가 아니라 segment registry + preset + separator + width allocator다. model/mode/git/PR/path/session/jobs/context/token rate/cache/cost/provider quota/time/host/subagent를 조합한다. `minimal`, `compact`, `full`, `nerd`, `ascii`, `custom` preset이 있다. [status presets](https://github.com/Yeachan-Heo/gajae-code/blob/bf188c1cda0665219f8af2edbed1256eede317bc/packages/coding-agent/src/modes/components/status-line/presets.ts)

별도 workflow HUD는 state를 versioned chips로 바꾸고 최대 2행, wide/medium/tight tier로 축약한다. blocked/error 같은 mandatory token을 먼저 보존한다. 이 구조는 WWW에 가장 직접적인 참고점이다. [skill HUD renderer](https://github.com/Yeachan-Heo/gajae-code/blob/bf188c1cda0665219f8af2edbed1256eede317bc/packages/coding-agent/src/modes/components/skill-hud/render.ts), [workflow HUD projection](https://github.com/Yeachan-Heo/gajae-code/blob/bf188c1cda0665219f8af2edbed1256eede317bc/packages/coding-agent/src/skill-state/workflow-hud.ts)

### Pi: 작고 범용적인 runtime HUD

기본 footer는 cwd/branch/session과 input/output/cache/cost/context/model/thinking을 2행에 넣고 context 70%/90%에서 warning/error로 바꾼다. extension status가 추가 행을 쓴다. orchestration 상태는 기본값에 없다. [Pi footer](https://github.com/earendil-works/pi-mono/blob/4e69b0c28060f0f02fbe38bfa7c21a2e2eb25057/packages/coding-agent/src/modes/interactive/components/footer.ts)

### Senpi: Pi footer의 productized 확장

Senpi는 anchor, middle, tail, right를 분리하고 폭이 줄면 middle 우측부터 버린 뒤 cwd의 앞을 생략하고, 그래도 안 되면 최소 model label을 남긴다. provider/account/model/thinking/fast와 context가 정보 우선순위 안에서 움직인다. [footer layout](https://github.com/code-yeongyu/senpi/blob/f91130e0fa3c8f3db5a60301878cd3e0c5a869b7/packages/coding-agent/src/modes/interactive/components/footer-layout.ts)

### WWW: runtime HUD보다 operations HUD에 가깝다

WWW는 frame title에 project/model/effort/phase/mode/permission/queue/approval을 넣고, 4행 bottom HUD에 usage와 Wooni identity를 둔다. 별도 activity indicator는 전송·분석·실행·응답·승인 대기·마무리를 Native public state에서 derive한다. Dashboard/Monitor/Map/Stats를 전용 view로 나눈다.

강점은 runtime 숫자뿐 아니라 업무 상태를 보여 주려는 점이다. 약점은 다음과 같다.

- frame title이 길고 width-aware semantic priority allocator가 아니다.
- `WorkbenchBottomHudView`는 4행 고정이며 폭이 작을 때 Wooni를 통째로 버리는 단순 breakpoint다.
- usage와 identity가 4행을 항상 점유하므로 낮은 terminal에서 transcript budget을 압박한다.
- Gajae처럼 `blocked/approval/failure`를 mandatory token으로 끝까지 보존하는 공통 HUD 계약이 없다.
- 현재 진행 중인 업무·Story·Evidence·검증 gate가 frame 어디에서 항상 보이는지 아직 일관되지 않다.

추천은 **Gajae의 chip projection + Senpi의 priority allocator**를 결합하되, WWW 의미로 다시 정의하는 것이다.

```text
필수 anchor: project · active work · phase · blocked/approval/failure
조건부 middle: active agent/tool · queue · elapsed · verification/evidence
필수 tail: context risk · provider/model
별도 view: 누적 usage · 비용 · 전체 agent tree · activity history
```

## 8. 입력, queue, focus

Gajae는 multiline editor, command/path completion, large-paste folding, IME cursor, remappable keybinding, bash/python mode를 갖춘다. Pi는 여기에 작업 중 Enter=steering, Alt+Enter=follow-up을 구분하고 abort 시 queue를 editor로 복원한다. Senpi는 이 기반을 상속하면서 permission·goal/todo 흐름을 제품에 붙인다.

WWW는 typed slash registry, model/approval overlay, queue receipt, permission correlation이 강하다. 그러나 Pi와 비교하면 사용자가 **현재 turn에 끼워 넣는 입력**과 **다음 turn에 예약하는 입력**을 명시적으로 선택하는 UX가 약하다. 단순 queue depth보다 delivery semantics를 화면에 보여 주는 것이 중요하다.

우선순위는 다음과 같다.

1. composer에 `현재 턴 steering`과 `후속 turn`을 구분한 명시적 상태를 둔다.
2. approval pending 중 입력의 전송 시점을 label로 고정한다.
3. queue item을 되가져오기·편집·취소할 수 있게 한다.
4. keyboard shortcut은 focused surface가 소비한 뒤 global command가 처리하는 현재 원칙을 유지한다.

## 9. tool, Bash, diff, approval 표현

Gajae는 tool별 renderer, read grouping, pending/success/error surface, bounded tail, exit/cancel/truncation을 한 lifecycle 카드에 넣는다. Pi/Senpi는 `renderCall/renderResult` seam과 generic fallback이 강점이다. WWW는 `WorkStepCard`, bounded public projection, Bash metadata, unknown fallback을 이미 갖췄다.

WWW의 구조적 우위는 raw Native event를 그대로 화면 정본으로 삼지 않고 display-safe public projection을 만드는 데 있다. 이 원칙은 유지해야 한다. 개선점은:

- exact changed token을 보여 주는 intra-line diff,
- 동일 tool item의 started→delta→terminal 시각적 identity 강화,
- 접힌 카드에서도 exit/duration/cancel/truncation/evidence ref를 잃지 않는 mandatory footer,
- tool별 renderer 실패를 카드 하나에 격리했다는 실제 fault test,
- approval request와 결과가 동일 item/correlation에 붙는 화면 검증이다.

## 10. 확장성 차이

| 확장 surface | Gajae Code | Senpi | Pi | WWW |
|---|---|---|---|---|
| custom tool/message renderer | 있음 | 있음 | 있음 | 내부 registry/seam 중심 |
| status/widget | hook/extension status, skill HUD | keyed status/widget | keyed status/widget | 제품 내부 component |
| header/footer 교체 | 제품/hook surface | extension API | extension API | 공개 extension API 없음 |
| editor 교체 | custom editor | 가능 | 가능 | 고정 조합 |
| overlay | 풍부 | 풍부 | 풍부 | 제품 내부 overlay 다수 |
| theme package/reload | 있음 | 있음 | 있음 | 없음 |
| trust/isolation | project trust와 hook/plugin 정책 필요 | package/extension 신뢰 비용 | package/extension 신뢰 비용 | arbitrary plugin 미개방으로 공격면이 작음 |

WWW가 지금 arbitrary TypeScript UI plugin을 열지 않은 것은 약점만은 아니다. Progress·Evidence·Approval contract가 안정되기 전에 footer/editor 전체 교체를 허용하면 제품 의미가 extension에 의해 무너진다. 권장 순서는:

1. 내부 `StatusSegment`, `OperationCardRenderer`, `ViewContribution` typed seam을 먼저 만든다.
2. built-in contribution으로 fault isolation과 width contract를 검증한다.
3. provenance, project trust, version compatibility, dispose, render budget을 정의한다.
4. 그 뒤 제한된 외부 extension surface를 공개한다.

## 11. 기능 차이 점수표

점수는 소스에서 확인된 현재 제품 기본 제공 수준을 0~5로 상대 평가한 것이다. 미구현과 미검증은 구분하되, 여기서는 사용자 관점의 준비도로 합쳤다.

| 축 | Gajae | Senpi | Pi | WWW | 해석 |
|---|---:|---:|---:|---:|---|
| transcript/scrollback | 5 | 4 | 4 | 3 | WWW는 fullscreen workbench에 최적화 |
| multi-pane operations | 3 | 2 | 1 | 5 | WWW의 명확한 우위 |
| semantic theme | 5 | 4 | 4 | 3 | WWW는 palette는 좋지만 theme system이 아님 |
| syntax/Markdown | 5 | 4 | 4 | 4 | 네 제품 모두 강함 |
| diff 가독성 | 5 | 4 | 5 | 3 | WWW intra-line gap |
| persistent HUD | 5 | 4 | 3 | 4 | WWW는 operations 의미, Gajae는 폭/기능 완성도 우위 |
| workflow/goal HUD | 5 | 4 | 1 | 4 | WWW는 구조가 있으나 공통 compact projection 미완 |
| input queue/steering | 4 | 5 | 5 | 3 | delivery semantics 보강 필요 |
| overlay/selector | 5 | 5 | 5 | 4 | WWW 제품 기능은 충분, 외부 seam은 좁음 |
| extension API | 5 | 5 | 5 | 2 | 의도적으로 닫혀 있음 |
| terminal compatibility evidence | 5 | 4 | 4 | 2 | WWW의 가장 큰 실증 gap |
| evidence/progress control plane | 3 | 3 | 1 | 5 | WWW가 지켜야 할 제품 중심 |

## 12. WWW의 구체적 장단점

### 장점

- `domain/application/infrastructure/presentation` 경계가 있어 TUI가 Native wire를 그대로 소유하지 않는다.
- Chat, T-note, Todo, Development Map, Stats, Monitor가 같은 workbench navigation 안에 있다.
- theme이 user/assistant/tool/diff/effort 의미를 이미 구분하고 있다.
- native syntax highlighter를 작은 replaceable adapter 뒤에 두고 byte/line budget을 둔다.
- `RenderScheduler`가 token delta와 terminal state의 urgency를 구분한다.
- approval, permission, model, queue, activity를 frame state에 연결한다.
- unknown/malformed output을 bounded public projection으로 격리하려는 방향이 명확하다.

### 단점 또는 미완성

- alt-screen 단일 선택으로 native scrollback 사용성이 약하다.
- theme가 코드 상수라 light/256/no-color/user-theme 전환이 없다.
- frame title과 bottom HUD의 정보 우선순위 축소가 정교하지 않다.
- intra-line diff와 inline image/diagram이 없다.
- Pi식 steering/follow-up queue UX가 없다.
- public TUI extension surface가 없어 작은 사용자 맞춤도 core 변경이 필요하다.
- terminal/OS/color/IME/resize/long-session은 테스트 코드보다 실제 수락 evidence가 부족하다.
- 4행 HUD와 다중 pane이 낮은 높이에서 핵심 transcript를 잠식할 수 있다.

## 13. 채택 우선순위

### P0 — 외형보다 먼저 검증

1. truecolor·256색·no-color, macOS/Linux/Windows Terminal, CJK IME, resize, 장시간 stream matrix를 실제 PTY/terminal evidence로 닫는다.
2. HUD semantic priority 계약을 만들고 `blocked/approval/failure/current work/context risk`를 mandatory token으로 지정한다.
3. 80×24, 120×40, 낮은 높이에서 Chat/overlay/approval/usage를 golden + real terminal로 검증한다.

### P1 — 체감 효율이 큰 기능

1. Pi의 intra-line diff를 WWW card projection에 맞게 도입한다.
2. steering/follow-up queue와 queue recall/edit/cancel을 제공한다.
3. main-screen/native scrollback mode를 실험해 fullscreen과 선택 가능한지 bake-off한다.
4. theme token을 코드 색상 함수에서 분리하고 dark/light/no-color 최소 3개 projection을 만든다.

### P2 — 제품 정체성을 강화

1. Gajae skill HUD처럼 `ProgressSnapshot → compact chips`의 versioned projection을 만든다.
2. Story/Evidence/verification gate와 active agent/tool을 같은 compact grammar로 표시한다.
3. usage는 4행 상시 고정보다 context risk 중심 compact HUD + `/stats` 상세로 재배치한다.
4. Wooni identity는 낮은 높이에서 항상 먼저 희생되는 decorative budget으로 명시한다.

### P3 — contract가 안정된 뒤

1. typed internal status/card/view contribution API.
2. theme와 symbol preset package.
3. inline image/diagram capability adapter.
4. trust·dispose·budget·compatibility가 있는 제한적 외부 extension API.

## 14. 최종 제품 판단

Gajae Code는 현재 네 대상 중 **터미널 제품 완성도**가 가장 높다. Pi는 **TUI 프레임워크와 확장성**이 가장 좋고, Senpi는 그 기반을 **실전 코딩 에이전트 정책**으로 가장 공격적으로 채운다. WWW는 이 세 축에서 정면으로 이기려 하면 유지비만 커진다.

WWW가 이길 수 있는 자리는 다르다.

> 모델이 지금 무엇을 출력하는지를 넘어, 어떤 업무 계약 아래 무엇이 진행 중이고,
> 무엇이 막혔으며, 어떤 근거로 완료를 수락할 수 있는지를 한 프레임에서 보여 주는 것.

그러므로 Gajae에서 가져올 것은 시각 브랜드가 아니라 **정보 예산과 workflow projection**, Senpi에서 가져올 것은 builtin 개수가 아니라 **우선순위 기반 축소**, Pi에서 가져올 것은 완제품 HUD가 아니라 **작은 component/renderer seam과 입력 queue 의미**다. WWW는 이 기반 위에서 Progress·Evidence·Approval을 기본 제품 언어로 만드는 편이 가장 일관된다.

## 15. 조사 원문

- [Gajae Code 조사 원문](../.www/scratchpad/2026-09-04-gajae-code-tui-research.md)
- [Senpi 조사 원문](../.www/scratchpad/2026-09-04-senpi-tui-research.md)
- [Pi 조사 원문](../.www/scratchpad/2026-09-04-pi-tui-research.md)
- 기존 범용 비교: [TUI_COMPARISON.md](./TUI_COMPARISON.md)
- 계층별 코드 지도: [TUI_CODE_MATRIX.md](./TUI_CODE_MATRIX.md)

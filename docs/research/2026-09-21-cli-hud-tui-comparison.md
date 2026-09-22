# Codex·Claude Code·ZCode·Gemini CLI HUD/TUI 비교

- 조사일: 2026-09-21 (Asia/Seoul)
- 목적: WWW의 Chat·Plan·Todo·Tracer HUD를 다듬을 때 참고할 공개 CLI/TUI의 문구와 화면 구조를 비교한다.
- 범위: 각 프로젝트의 공식 저장소·공식 문서만 사용했다. 화면을 그대로 복제하지 않고, 재사용 가능한 정보 구조와 상태 언어를 추린다.
- 주의: GitHub의 `main`은 이동하는 기준선이다. 아래 SHA는 조사 시점에 확인한 `main` HEAD다.

## 결론

WWW에 가장 직접적으로 가져올 만한 조합은 다음과 같다.

1. Codex의 `Ready / Working` 상태 행과 `Model · Context · Progress · Approval` 상태 항목.
2. Gemini CLI의 라벨 행/값 행 footer와 폭이 좁을 때 우선순위가 낮은 항목을 줄이는 규칙.
3. ZCode의 `Workflow label - status (settled/total steps)` 축약 행과 `+ to expand` / `- to collapse` 상세 전환.
4. Claude Code의 `/diff`처럼 transcript 옆에 변경 파일·hunk를 고정하는 pane 개념과 `plan` 권한 상태.

반대로 Ctrl+G 같은 수동 단축키 안내를 항상 노출하는 것은 이번 방향과 맞지 않는다. 단축키는 명시적으로 열었을 때만 보이고, 평상시에는 상태·진행·승인 정보가 우선이어야 한다.

## 비교표

| 제품 | 공개 범위 | 실제로 확인한 HUD/TUI 언어 | 가져올 만한 구조 | WWW 적용 적합도와 주의 |
|---|---|---|---|---|
| **OpenAI Codex CLI** | CLI/TUI 전체가 공개 저장소에 있으며 Apache-2.0 라이선스다. | `Working`, `esc to interrupt`, `Ready`, `Thinking`, `Model`, `Context`, `Usage`, `Approval`, `Thread`, `Progress`, `Task Progress`. | composer 위의 live status row, 설정 가능한 status line, model/path/branch/usage/mode/thread/progress별 accent, terminal 폭에 따른 footer 축약. | **매우 높음.** WWW의 `▎ 준비` 행과 Plan 진행 상태를 정렬하는 기준으로 좋다. Codex의 색·문구·브랜드를 그대로 복사하지 말고 정보 계층만 가져온다. |
| **Anthropic Claude Code** | 공식 공개 저장소에는 plugin/mod·문서·테스트 표면이 공개된다. 핵심 CLI UI 구현 전체가 공개된 저장소는 아니다. | `/diff`, `plan`, `permission`, `allowedTools`, `disallowedTools`, `Read-only`, 파일별 `hunks`. | transcript 옆 diff pane, 수정/실행 전 승인 상태, 분석만 가능한 plan 모드, 명시적인 permission 표면. | **구조 참고용.** `/diff` mod는 공식 공개 소스지만 전체 화면 렌더링의 정본으로 보면 안 된다. WWW에서는 `Plan`과 `변경 파일`을 별도 rail/pane으로 두는 방식만 채택한다. |
| **Z.ai ZCode** | 공식 ZCode 저장소와 `@zcode/tui`가 공개되어 있으며 Apache-2.0이다. TUI·Agent CLI·공유 UI 소스가 함께 있다. | `Ready.`, `Thinking...`, `Calling model...`, `Tool ... pending/running/completed/failed`, `Context`, `Todos`, `Progress`, `Modified Files`, `Workspace`, `+ to expand`, `- to collapse`. | 빈 transcript, input status, Sidebar section, workflow card, actor/usage/log/result/error 상세, `settled/total steps` 진행률. | **매우 높음.** 현재 WWW의 Plan·Todo·Tracer를 하나의 workflow 상태 모델로 묶을 때 유용하다. ZCode의 OpenTUI/색상/문자 장식은 그대로 가져오지 않는다. |
| **Google Gemini CLI** | CLI 전체가 공개 저장소에 있으며 Apache-2.0이다. Ink/React UI 컴포넌트와 설정 문서가 공개되어 있다. | terminal title의 `Ready: ◇`, `Action Required: ✋`, `Working: ✦`, `? for shortcuts`, `compact tool output`, `Context Summary`, footer item label. | 두 줄 footer(label/value), 설정 가능한 footer 항목, terminal 폭에 따른 column fitting, 낮은 우선순위 항목 제거와 `…`, 승인 중 drawer 축소, banner/context/footer 숨김 설정. | **높음.** 120열 기준 정보 밀도를 조절할 때 좋다. 다만 WWW는 Ctrl+G 안내를 상시 노출하지 않고, 라벨은 `Model / Context / Progress`처럼 핵심만 유지한다. |

## 제품별 근거

### OpenAI Codex CLI

Codex의 `StatusIndicatorWidget`은 작업 중 composer 위에 live status row를 두고 기본 헤더를 `Working`으로 렌더링한다. 폭이 부족하면 상세 설명을 아래 줄로 넘기며, elapsed time과 interrupt hint를 우선한다. 이는 WWW의 Chat 헤더를 `▎ 준비`에서 `▎ 작업 중`으로 바꾸더라도 같은 기준선에 Plan rail을 맞출 수 있다는 뜻이다.

Codex의 status line 설정에는 model, current directory/project root, git branch, permissions, approval mode, context usage, usage limits, thread, task progress가 독립 항목으로 정의되어 있다. WWW에서는 이 중 `Model · Context · Approval · Progress`만 1차 후보로 삼는 것이 적절하다.

footer 구현은 status line, instructional footer, contextual footer를 구분하고, terminal width에 맞춰 hint·queue·context를 단계적으로 줄인다. 따라서 상시 가이드보다 현재 상태를 우선하고, 좁은 창에서는 덜 중요한 정보를 제거하는 방향이 코드 구조와도 맞는다.

근거:

- [Codex 저장소](https://github.com/openai/codex/tree/7d99ee82d74325cabf485ea1e2adbd0c2625ab19) — `main` HEAD `7d99ee82d74325cabf485ea1e2adbd0c2625ab19`
- [작업 중 상태 행](https://github.com/openai/codex/blob/7d99ee82d74325cabf485ea1e2adbd0c2625ab19/codex-rs/tui/src/status_indicator_widget.rs)
- [status line 항목과 설정 화면](https://github.com/openai/codex/blob/7d99ee82d74325cabf485ea1e2adbd0c2625ab19/codex-rs/tui/src/bottom_pane/status_line_setup.rs)
- [status line 색상 범주](https://github.com/openai/codex/blob/7d99ee82d74325cabf485ea1e2adbd0c2625ab19/codex-rs/tui/src/bottom_pane/status_line_style.rs)
- [폭 기반 footer 축약](https://github.com/openai/codex/blob/7d99ee82d74325cabf485ea1e2adbd0c2625ab19/codex-rs/tui/src/bottom_pane/footer.rs)

### Anthropic Claude Code

Claude Code의 공개 `mods/diff`는 `/diff`를 transcript 옆 pane으로 열고, 파일별 hunk를 Claude가 파일을 수정하거나 명령을 실행할 때 갱신하는 구조를 설명한다. 이 구조는 WWW의 Tracer가 단순 로그가 아니라 “이번 작업에서 변경된 파일을 옆에서 계속 확인하는 표면”이 되어야 한다는 참고점이다.

공식 문서는 `plan` permission mode를 분석은 허용하지만 파일 수정·명령 실행은 허용하지 않는 상태로 정의한다. 따라서 WWW의 Plan은 단순한 목록 제목이 아니라, 실행 가능 여부를 표시하는 상태로 확장할 여지가 있다.

다만 공개 저장소의 범위는 plugin/mod와 주변 계약에 한정된다. 이 비교에서 Claude는 “전체 TUI 구현을 참고한다”가 아니라 “공식 공개된 diff/permission 개념을 정보 구조로 참고한다”로 판정한다.

근거:

- [Claude Code 공식 저장소](https://github.com/anthropics/claude-code/tree/7974a70773fa229e4cc65aa1b356cc21f5c216c4) — `main` HEAD `7974a70773fa229e4cc65aa1b356cc21f5c216c4`
- [공식 built-in mods 설명](https://github.com/anthropics/claude-code/blob/7974a70773fa229e4cc65aa1b356cc21f5c216c4/mods/README.md)
- [공식 CLI reference](https://docs.anthropic.com/en/docs/claude-code/cli-usage)
- [공식 권한/plan 모드 문서](https://docs.anthropic.com/ko/docs/claude-code/iam)

### Z.ai ZCode

ZCode의 공개 TUI 소스는 기능 단위가 명확하다. `app-input-status.tsx`는 active 상태에 spinner, interrupt hint, context badge를 두고, composer 상태에는 model/provider를 넣는다. `app-workflow-card.tsx`는 workflow 상태를 `pending / running / completed / errored / stopped`로 나누고, 접힌 줄에는 label·status·settled/total steps를 보여주며, 펼치면 actors·usage·log·result·error를 보여준다.

i18n 문자열은 `Ready.`, `Thinking...`, `Calling model...`, `Tool ... pending/running/completed/failed`, `Todos`, `Progress`, `Modified Files`, `Context`, `Workspace`를 명시한다. 이 어휘는 WWW에서 한글 상태명과 내부 enum을 분리할 때 좋은 기준이다.

근거:

- [ZCode 공식 저장소](https://github.com/zai-org/ZCode/tree/872ad960de7ec172591f7e1952f7849229f94521) — `main` HEAD `872ad960de7ec172591f7e1952f7849229f94521`
- [ZCode README: CLI·TUI 구조](https://github.com/zai-org/ZCode/blob/872ad960de7ec172591f7e1952f7849229f94521/README.en.md)
- [TUI 소스 목록](https://github.com/zai-org/ZCode/tree/872ad960de7ec172591f7e1952f7849229f94521/apps/zcode-cli/packages/tui/src)
- [workflow card](https://github.com/zai-org/ZCode/blob/872ad960de7ec172591f7e1952f7849229f94521/apps/zcode-cli/packages/tui/src/app-workflow-card.tsx)
- [input status](https://github.com/zai-org/ZCode/blob/872ad960de7ec172591f7e1952f7849229f94521/apps/zcode-cli/packages/tui/src/app-input-status.tsx)
- [영문 UI 문자열](https://github.com/zai-org/ZCode/blob/872ad960de7ec172591f7e1952f7849229f94521/apps/zcode-cli/packages/i18n/src/locales/en-US.ts)

### Google Gemini CLI

Gemini CLI footer는 항목을 column으로 만들고, `showLabels`가 켜지면 label 행과 값 행을 분리한다. 각 column은 `flexGrow`·`flexShrink`를 갖고, terminal 폭에 맞지 않는 항목은 우선순위에 따라 버리며 마지막에 `…`을 추가한다. 이는 WWW의 Plan/Chat 양쪽에 정보를 넣을 때 “넣을 수 있는 만큼 모두 보인다”가 아니라 “핵심 정보가 항상 남는다”를 보장하는 참고 구조다.

설정 문서의 `dynamicWindowTitle`은 `Ready / Action Required / Working` 세 상태를 아이콘으로 구분한다. 또한 `hideTips`, `showShortcutsHint`, `compactToolOutput`, `hideBanner`, `hideContextSummary`, `hideFooter`, `collapseDrawerDuringApproval`을 별도 설정으로 둔다. WWW의 현재 방향에서는 상시 Ctrl+G 가이드는 제거하고, 첫 로딩의 WWW welcome은 유지하며, 승인/오류처럼 사용자의 판단이 필요한 상태만 강조하는 것이 적절하다.

근거:

- [Gemini CLI 공식 저장소](https://github.com/google-gemini/gemini-cli/tree/cfbcaa8df13ea4610bb379b377b56d62980c0032) — `main` HEAD `cfbcaa8df13ea4610bb379b377b56d62980c0032`
- [Footer 컴포넌트](https://github.com/google-gemini/gemini-cli/blob/cfbcaa8df13ea4610bb379b377b56d62980c0032/packages/cli/src/ui/components/Footer.tsx)
- [UI 설정 문서](https://github.com/google-gemini/gemini-cli/blob/cfbcaa8df13ea4610bb379b377b56d62980c0032/docs/reference/configuration.md)

## WWW에 적용할 1차 어휘와 구조

| WWW 표면 | 1차 문구 | 상태 변화 | 참고한 구조 |
|---|---|---|---|
| Chat 상단 | `▎ 준비` / `▎ 작업 중` / `▎ 승인 대기` | idle → running → approval → ready/error | Codex live status row, Gemini status icon 상태 |
| Plan rail | `Plan 1/3` 또는 `Progress 1/3` | pending → active → done | Codex `Task Progress`, ZCode settled/total steps |
| Todo rail | `Todo` + 현재 항목 | waiting / running / completed / blocked | ZCode `Todos`, sidebar status |
| Tracer rail | `Tracer` + `Modified Files` / `Tool` | pending / running / completed / failed | ZCode tool/workflow card, Claude `/diff` pane |
| 하단 상태 | `Model · Context · Workspace` | 데이터가 없으면 숨김 | Codex status line, Gemini labeled footer |
| 승인 표면 | `Approval required` 또는 `승인 필요` | 승인 전에는 실행 잠금 | Claude plan/permission, Gemini approval drawer collapse |

## 현재 WWW에 대한 판정

- 이미 반영한 `Chat` 준비 헤더와 `Plan` 제목의 baseline 정렬은 Codex식 live status row + side rail 구조와 일치한다.
- `Ctrl+G 화면 ...`을 제거한 것은 Gemini의 `hideTips`/`showShortcutsHint` 분리와 같은 방향이다. 상시 노출 가이드와 명시적 단축키 패널을 분리해야 한다.
- 첫 로딩에 WWW welcome을 보여주는 것은 Gemini의 `hideBanner`와 반대되는 선택이지만, 제품 정체성을 보여주는 초기 empty transcript로서 ZCode의 empty transcript 표면과 함께 해석할 수 있다.
- 다음 세부 변경은 `Plan / Todo / Tracer`의 상태 어휘를 먼저 고정한 뒤, 폭이 좁을 때 어떤 항목을 숨길지 우선순위를 테스트하는 순서가 좋다.

## 재사용하지 않을 것

- 제품명, 로고, 고유 ASCII 그림, 고유 색상 팔레트와 문구를 그대로 복제하지 않는다.
- Claude Code의 비공개 핵심 TUI 구현이 공개되어 있다고 가정하지 않는다.
- `Ctrl+G` 같은 단축키를 정보 계층의 중심에 두지 않는다.
- 모델·컨텍스트·사용량을 항상 모두 노출하지 않는다. 데이터가 없거나 창이 좁으면 숨겨야 한다.


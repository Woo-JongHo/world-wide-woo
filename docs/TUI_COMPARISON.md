# WWW Agent TUI 비교 분석

조사 기준: 2026-08-31. WWW는 **World Wide Woo**이며, 여러 Agent TUI의 화면을 복제하는 제품이 아니라 검증된 장점을 하나의 WES Shell 계약으로 합성하는 제품이다.

기능별 실제 코드 경로와 계층 지도는 [`TUI_CODE_MATRIX.md`](./TUI_CODE_MATRIX.md)에 분리했다.

## 1. 비교 대상과 근거 경계

| 제품 | 공개성 | 제품 중심 | 이 문서에서 보는 강점 |
|---|---|---|---|
| Gajae Code 0.15.6 | 오픈소스 | tool-rich coding agent | 정보 예산, Bash/tool lifecycle 카드, event projection, semantic theme |
| Pi | 오픈소스 | 작은 extension-first agent core | 단순한 active model, typed command, append-only session, renderer seam |
| Oh My Pi | 오픈소스 Pi fork | IDE가 결합된 완제품 agent | LSP/DAP, rich cards, 역할별 모델, subagent, 광범위 도구 |
| OpenAI Codex CLI | 오픈소스 | OpenAI coding agent/client | Thread→Turn→Item, approval correlation, rich/raw transcript 분리 |
| OpenCode | 오픈소스 | provider-neutral client/server agent | 반응형 TUI, Session→Message→Part, SDK 경계, generic tool fallback |
| Claude Code | 코어 비공개·공식 UX 문서 공개 | Anthropic coding agent | session/clear/compact 구분, checkpoint UX, slash menu, status line 계약 |
| Oh My Claude Code | 오픈소스 Claude Code plugin | workflow와 HUD 확장 | 1~2줄 minimal HUD, compact quota/reset, stale/backoff 표현 |
| WWW | 오픈소스 | WES Agent TUI Shell | Conversation·Router·Usage·Context를 한 프레임에서 통제하는 projection |

Claude Code 공식 저장소는 README, changelog, plugin/example을 공개하지만 코어 CLI 소스는 제공하지 않으며 라이선스는 All rights reserved다. 따라서 Claude Code 항목은 내부 구현 추정 없이 공식 문서의 관찰 가능한 UX 계약만 비교한다.

## 2. 한눈에 보는 기능 비교

| 축 | Gajae Code | Pi / Oh My Pi | Codex CLI | OpenCode | Claude Code / OMC | WWW 결론 |
|---|---|---|---|---|---|---|
| 기본 화면 | launch dashboard + transcript + status rail | Pi는 단순 transcript, OMP는 rich tool surface | committed history + active live cell + bottom pane | 중앙 transcript + composer + wide sidebar | transcript + composer + status line/HUD | 단일 외곽 프레임 안의 대화·Router·세션, 아래 2줄 usage 유지 |
| 반응형 | 높이·폭별 정보 우선순위와 생략 표지 | component별 width-aware collapse | bottom pane의 임시 view stack | wide sidebar, 좁으면 overlay | status command에 COLUMNS/LINES 제공 | breakpoint 숫자를 복제하지 않고 pane 최소폭과 높이 예산으로 결정 |
| 실행 정본 | AgentSessionEvent와 append-only tree | JSONL session과 tool lifecycle | Thread→Turn→Item event | Session→Message→Part | 공식 session transcript 계약 | Session→Turn→Item, `started→delta→completed`를 정본으로 채택 |
| Bash/tool 카드 | running loader, bounded tail, expand, exit/cancel/truncation | Pi renderer seam, OMP 전용 rich renderer | rich lines와 raw lines 분리 | built-in renderer + unknown generic fallback | tool 결과 UX는 공개 계약만 사용 | raw evidence와 bounded card projection 분리, specialized + generic fallback |
| 승인 | renderer/runtime에 결합된 approval surface | extension/runtime별 정책 | request가 threadId/turnId/itemId에 결부 | allow/ask/deny + once/always/reject + diff | checkpoint 복원 범위와 permission mode 명시 | effectful item은 ask/deny 기본, once/session/deny와 correlation ID 채택 |
| 모델 | provider/model + reasoning | Pi 단일 active model; OMP role router | model과 provider 분리 | `provider_id/model_id`, 75+ provider | model/effort가 status 계약에 노출 | `(provider, model, effort)` atomic selection, silent model fallback 금지 |
| 인증 | provider adapter와 user credential | provider별 login/key | user-scope provider credential | provider ecosystem auth | Claude subscription/API 계정 | Codex OAuth와 OpenAI API를 분리하고 project가 user credential을 덮지 못하게 함 |
| 세션 | append-only tree, resume/dashboard | resume/tree/fork/compact 풍부 | list/read/resume/fork/archive + cwd 확인 | search/pin/busy/fork/revert | continue/resume/branch/clear/compact | 현재 append-only JSONL과 recent resume, 이후 search·cwd mismatch 확인 |
| slash command | 선언형 metadata가 completion/help 생성, registry는 큼 | built-in + extension + skill/template | deterministic commands | command/dialog/plugin | built-in과 skill을 구분, `/` filter | 작은 typed registry; deterministic Shell command와 future workflow 분리 |
| quota/HUD | status segment와 usage cache | extension/provider usage | provider별 surface | context/cost footer | OMC compact `5h:45%(3h42m)`, stale marker | Codex/Claude 고정 2행, 잔여율·reset·stale 의미를 명시 |
| 확장성 | tool renderer, slash provider, custom entry | Pi extension-first; OMP batteries included | app-server/MCP/plugin API | server SDK, TUI plugin, ACP | skill/plugin/status command | 먼저 내부 card/command/port seam, arbitrary plugin은 trust/version 뒤에 공개 |

## 3. 제품별 채택 판단

### 3.1 Gajae Code

**가져온다**

- canonical output과 화면 preview를 분리한다.
- 동일 item ID의 start/update/end가 한 카드를 갱신한다.
- 출력이나 HUD를 생략하면 `… N`으로 생략 사실을 표시한다.
- `pending/success/error/cancelled` 같은 semantic theme slot을 사용한다.
- 색뿐 아니라 label, border, 위치로 상태를 중복 표현한다.

**가져오지 않는다**

- Forge/Claw 랜드마크, red-orange 주색, 동일한 welcome section을 복제하지 않는다.
- Gajae renderer 내부 타입이나 AgentSessionManager 전체를 import하지 않는다.
- 2,000행이 넘는 builtin registry와 모든 runtime 기능을 Shell에 선행 이식하지 않는다.
- stream preview buffer를 raw output 정본으로 사용하지 않는다.

### 3.2 Pi와 Oh My Pi

**Pi에서 가져온다**

- 하나의 명시적인 active `provider/model`과 별도 reasoning effort.
- tool의 `renderCall/renderResult`와 같은 작은 renderer seam.
- unknown slash를 모델 prompt로 흘리지 않는 exact command boundary.
- append-only session과 resume 계약.

**Oh My Pi에서 나중에 가져온다**

- executor 이후 LSP/DAP의 client/config/tool/renderer 분리.
- typed subagent result, worktree isolation, live task 상태.
- tool별 rich card와 background execution lifecycle.

**보류한다**

- role router, model fallback chain, credential round-robin은 task/retry owner가 생기기 전에는 넣지 않는다.
- arbitrary TypeScript extension loader는 trust, provenance, dispose, crash isolation 계약 전에는 열지 않는다.

### 3.3 Codex CLI

**가져온다**

- `Session → Turn → Item`과 `started → delta* → completed` lifecycle.
- approval request를 `sessionId/turnId/itemId`에 결부한다.
- mutable active item과 committed transcript를 분리한다.
- rich viewport representation과 raw/copy/export representation을 분리한다.
- completed payload가 권위 있는 최종 snapshot이며 delta 누적본은 임시 projection이다.

**가져오지 않는다**

- OpenAI Responses 중심 app-server wire schema 전체를 WWW domain으로 사용하지 않는다.
- stdio, socket, WebSocket transport를 동시에 만들지 않는다.

### 3.4 OpenCode

**가져온다**

- wide/compact에서 sidebar가 사라져도 접근 경로를 유지하는 반응형 원칙.
- specialized tool renderer와 unknown-tool generic fallback.
- malformed metadata나 renderer 오류를 카드 하나에 격리한다.
- TUI가 backend private module을 직접 import하지 않고 SDK/DTO/event 경계를 소비하는 구조.
- session picker의 search, busy/error, cwd mismatch 확인.

**가져오지 않는다**

- OpenTUI/Solid, embedded HTTP server, generated SDK, npm plugin loader를 한꺼번에 도입하지 않는다.
- 75개 이상 provider breadth와 dynamic npm provider 설치를 현재 목표로 삼지 않는다.
- 대부분 allow인 permission 기본값을 WWW 안전 기본값으로 사용하지 않는다.

### 3.5 Claude Code와 OMC

**가져온다**

- `/clear`, `/compact`, `/branch`, `/resume`이 서로 다른 session/context 효과를 가진다는 구분.
- command menu의 filter와 exact execution 분리. 가까운 후보를 자동 실행하지 않는다.
- read-only 즉시 명령, queued mutation, interrupt 명령의 미래 분류.
- status presentation이 credential/API를 직접 읽지 않고 display-safe snapshot을 받는 경계.
- OMC minimal HUD의 compact label, reset countdown, warning threshold, stale marker.

**가져오지 않는다**

- OMC의 비공식 Anthropic OAuth usage endpoint 직접 호출.
- Claude Keychain/credential file을 presentation이나 usage renderer가 직접 읽는 구조.
- checkpoint UI를 edit provenance와 복원 범위 없이 먼저 노출하는 것.
- OMC workflow/agent/todo HUD 전체를 WWW usage strip에 섞는 것.

## 4. WWW 합성 아키텍처

```text
WWW Session
  └─ Turn: 한 번 수락된 사용자 의도와 terminal outcome
      ├─ Item: user_text
      ├─ Item: assistant_text | reasoning
      ├─ Item: command | file_change | tool
      ├─ Item: approval_request | approval_resolution
      └─ Item: completion_report

Item lifecycle: started → delta* → completed | failed | cancelled
정본: append-only event/raw evidence
화면: renderer registry(item.kind) → specialized card | generic fallback
```

### 불변 조건

1. 모든 effectful item은 stable `sessionId`, `turnId`, `itemId`를 가진다.
2. 화면 truncate/fold는 저장 원문과 model context를 바꾸지 않는다.
3. `completed`가 최종 snapshot이며 streaming projection은 정본이 아니다.
4. Bash stdout과 stderr는 구분하고 exit code, duration, cancellation을 terminal 상태로 남긴다.
5. 완료 요약은 자유형 마지막 문장이 아니라 `CompletionReport`의 번호·bullet·검증 구조다.
6. credential, OAuth token, raw quota payload는 display DTO에 들어오지 않는다.
7. unknown tool은 generic card로 남고 renderer 하나의 오류가 session 전체를 깨지 않는다.

## 5. WWW UI 정체성

| 요소 | WWW 소유 결정 |
|---|---|
| 제품 마크 | `🐙 WWW`, World Wide Woo |
| 주색 | Claude-derived blue, lavender, clay, parchment, moss, ochre |
| 첫 화면 | WWW wave/world landmark + 제품 정의 + 실제 model/effort/auth pill |
| 공간 | 한 외곽 프레임, 왼쪽 Conversation, 오른쪽 Router·Model/Session·Flow |
| 사용량 | 카드 바로 아래 Codex/Claude 2행; 잔여율과 reset 표시 |
| 출력 | Bash와 completion을 카드로 표현하되 transcript 정본과 분리 |
| 명령 | `!<command>`, `/model`, `/effort`, `/login`, `/logout`, `/usage`, `/monitor`, `/dashboard`, `/planning`, `/epic`, `/story`, `/status`, `/help`, `/exit` |

WWW는 Gajae Code의 Claw, OMP의 IDE surface, Codex의 단일 chat pane, OpenCode의 sidebar, Claude의 status line 중 어느 것도 그대로 복사하지 않는다. **사용자가 대화·실행·Context·Router를 같은 화면에서 의식적으로 통제한다**는 정보 구조가 차별점이다.

## 6. 실행 우선순위

| 시점 | 채택 |
|---|---|
| 지금 | Shell, Router/auth/model, 2행 usage, append-only session, Bash/Completion card DTO와 projection |
| Agent runtime 시작 전 | Session/Turn/Item ID와 lifecycle event, raw/rich dual projection, renderer fallback |
| executor 단계 | approval correlation, once/session/deny, Bash streaming, cancellation, diff preview |
| 후속 | session search/resume/cwd 확인, LSP, DAP, subagent, compaction, branch |
| 신뢰 모델 이후 | third-party tool/card/command plugin, ACP/MCP adapter |
| 비채택 | 비공식 quota endpoint, credential 직접 재사용, silent model fallback, 타 제품 브랜딩 복제 |

## 7. 주요 출처

### Gajae Code

- https://github.com/Yeachan-Heo/gajae-code
- [`welcome.ts`](https://github.com/Yeachan-Heo/gajae-code/blob/main/packages/coding-agent/src/modes/components/welcome.ts)
- [`bash-execution.ts`](https://github.com/Yeachan-Heo/gajae-code/blob/main/packages/coding-agent/src/modes/components/bash-execution.ts)
- [`event-controller.ts`](https://github.com/Yeachan-Heo/gajae-code/blob/main/packages/coding-agent/src/modes/controllers/event-controller.ts)
- [`session-manager.ts`](https://github.com/Yeachan-Heo/gajae-code/blob/main/packages/coding-agent/src/session/session-manager.ts)

### Pi / Oh My Pi

- https://github.com/earendil-works/pi
- https://github.com/can1357/oh-my-pi
- [Pi extensions](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/extensions.md)
- [OMP slash internals](https://github.com/can1357/oh-my-pi/blob/main/docs/slash-command-internals.md)
- [OMP model roles](https://github.com/can1357/oh-my-pi/blob/main/docs/models.md)

### Codex CLI / OpenCode

- Codex 조사 SHA: [`94cbbdd`](https://github.com/openai/codex/commit/94cbbddafc1776d5e377bca1b05932c697e82238)
- [Codex app-server protocol](https://github.com/openai/codex/blob/main/codex-rs/app-server/README.md)
- [Codex command lifecycle](https://github.com/openai/codex/blob/main/codex-rs/tui/src/chatwidget/command_lifecycle.rs)
- OpenCode 조사 SHA: [`10765ff`](https://github.com/anomalyco/opencode/commit/10765ff2a9da8c3b88e4de873aa383a49c318912)
- [OpenCode TUI package boundary](https://github.com/anomalyco/opencode/blob/dev/specs/tui-package.md)
- [OpenCode permissions](https://github.com/anomalyco/opencode/blob/dev/packages/web/src/content/docs/permissions.mdx)

### Claude Code / OMC

- [Claude Code sessions](https://code.claude.com/docs/en/sessions)
- [Claude Code commands](https://code.claude.com/docs/en/commands)
- [Claude Code checkpointing](https://code.claude.com/docs/en/checkpointing)
- [Claude Code status line](https://code.claude.com/docs/en/statusline)
- OMC 조사 SHA: [`134f4c9`](https://github.com/Yeachan-Heo/oh-my-claudecode/commit/134f4c96e2bdc0e10a0ee6bbbd413ded0d3c57b6)
- [OMC limit renderer](https://github.com/Yeachan-Heo/oh-my-claudecode/blob/134f4c96e2bdc0e10a0ee6bbbd413ded0d3c57b6/src/hud/elements/limits.ts)
- [OMC HUD compositor](https://github.com/Yeachan-Heo/oh-my-claudecode/blob/134f4c96e2bdc0e10a0ee6bbbd413ded0d3c57b6/src/hud/render.ts)

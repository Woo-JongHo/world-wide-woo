# Astra Dashboard · Conversation Recap 최종 코드 리뷰

- 검토자: 읽기 전용 독립 코드 리뷰
- 검토 범위: plain `www`의 Astra 기본 진입, Astra 첫 화면 `WWW Dashboard`, 기본 흰색 텍스트, Conversation Recap, 그리고 같은 작업 트리의 TUI/Core 대규모 이동이 해당 경로에 미치는 통합 회귀
- 상태: **WATCH**
- 권고: **APPROVE**

## 검증한 사실

- 작업 트리는 `astra/terminal-ui`이며, 기준 커밋 `559b295` 위에 118개 소스·테스트 경로의 대규모 미커밋 변경이 있다. 삭제된 옛 TUI 경로와 새 `foundation`/`features`/`shell` 경로를 함께 대조했다.
- plain `www`, `www astra`, `--resume`, `--execution-lane`은 `runAstra`로 연결된다. 명시 `router` 경로는 별도로 남아 있다. `src/cli.ts:157-177`, `src/cli.ts:200-217`, `test/cli.test.ts`를 대조했다.
- 실제 shell 조립에서 Astra는 `WwwDashboardView`를 주입하고 즉시 `dashboard` 페이지로 전환한다. 시작 시 메모리 terminal 출력에서 `WWW Dashboard`와 `현재 Workbench snapshot`을 확인하는 production-shell 테스트가 있다. `src/adapters/inbound/tui/shell/workbench-shell.ts:304-314`, `test/astra-shell.test.ts:29-53`.
- 첫 화면의 `Tab` browse 전환, `Ctrl+G` 화면 선택, `Esc` 복귀, 입력 중 숫자의 일반 입력 처리는 production shell 입력으로 검증한다. `Ctrl+E`는 읽기(browse) 상태에서만 transcript 확장을 전환하고, 입력 focus에서는 editor의 줄 끝 동작을 보존한다. `src/adapters/inbound/tui/shell/workbench-shell.ts:1096-1112`, `src/adapters/inbound/tui/shell/astra-surface.ts:40-48`.
- Recap은 `WorkbenchSnapshot.chat`만 읽고 새 상태를 저장하거나 Native history를 변경하지 않는다. `system` role, activity, tool payload는 type/input 경계에서 선택 대상이 아니며 assistant completion envelope는 공개 `answer`만 남긴다. credential 및 terminal escape 제거도 `sanitizeTerminalTextUnbounded`를 거친다. `src/core/domain/work/conversation-recap.ts:30-67`, `src/core/domain/review/redaction.ts:98-170`, `src/core/domain/execution/terminal.ts:59-83`.
- 직접 재현: `sk-private-secret`은 `[redacted]`로, `authorization: Bearer topsecret`은 `authorization: [redacted]`로 투영됐다. local path는 이 local-only Recap의 현재 계약상 남는다. 문서는 알려진 credential과 terminal control만 제거한다고 명시한다. `docs/CONVERSATION_RECAP.md:3-7`.
- Recap은 첫 공개 요청과 최신 공개 메시지를 최대 6개/항목 280 code point/전체 1,400 code point로 제한하며, `Ctrl+E`를 통해 expanded transcript 내부에서만 나타난다. `src/core/domain/work/conversation-recap.ts:34-57`, `src/adapters/inbound/tui/features/chat/conversation-recap-view.ts:7-19`, `src/adapters/inbound/tui/features/chat/astra-execution.ts:135`.
- `git diff --check`, 관련 83개 테스트, 타입 검사, 전체 테스트를 현 워크트리에서 재실행했다.

## 실행 증거

| 실행 | 결과 |
| --- | --- |
| `git diff --check` | exit 0 |
| `bun test test/conversation-recap.test.ts test/entry-dashboard-view.test.ts test/astra-shell.test.ts test/astra-ui.test.ts test/cli.test.ts test/architecture.test.ts test/tui-feature-registry.test.ts --reporter=dot` | 83 pass, 0 fail |
| `bun run check` | `tsc --noEmit`, exit 0 |
| `bun test --reporter=dot` | 1,204 pass, 0 fail, 9,670 assertions |

## Findings

### CRITICAL

없음.

### HIGH

없음.

### MEDIUM

1. **테마 회귀 테스트가 구현 상수를 그대로 재확인한다.** `test/entry-dashboard-view.test.ts:25-28`은 `palette.foreground`와 `astraPalette.text`의 literal 값만 비교한다. 이 테스트는 렌더된 기본 본문 텍스트가 실제로 흰색인지, 각 theme consumer가 해당 token을 사용하는지, 또는 사용자에게 보이는 동작을 검증하지 않는다. token 이름/구현을 함께 바꾸면 잘못된 색상으로도 쉽게 동기화되어 통과할 수 있으므로 false confidence를 만든다. render ANSI 색 또는 대표 surface의 실제 style 적용을 검증하는 동작 테스트로 바꾸는 것이 적절하다.

### LOW

1. **Dashboard 재진입은 명시된 동작이 아니다.** `WWW Dashboard`는 첫 화면으로만 설정되고 (`workbench-shell.ts:313`), `ASTRA_VIEWS`/slash 명령에는 이 페이지로 돌아오는 항목이 없다 (`astra-surface.ts:20-30`). 요구가 “시작 화면”에 한정되므로 현 변경의 차단 사유는 아니다. 다만 dashboard를 세션 중 다시 확인해야 하는 제품 요구가 있다면 진입 명령과 상호작용 테스트를 추가해야 한다.

## 스킬 관점 점검

요청된 `remove-ai-slops` 및 `programming` 스킬은 현재 제공된 skill 목록에 없어서 로드할 수 없었다. 대신 요청문에 명시된 기준으로 생산 코드와 테스트를 직접 점검했다.

- `remove-ai-slops` 관점: deletion-only test, requested removal만 확인하는 test, tautology, production의 불필요한 추출/정규화는 발견하지 못했다. 단, 위 MEDIUM의 literal theme-token test는 구현 상수 미러링으로 위반한다.
- `programming` 관점: brittle prompt assertion, untyped escape hatch, 불필요한 abstraction, 경계가 요구하지 않는 validation/parsing은 발견하지 못했다. Recap의 sanitize/bounds는 공개 projection 경계와 문서 계약에 직접 필요하다. 단, 위 theme test는 사용자 결과가 아닌 구현 세부를 고정한다.

## 판정

신규 기본 진입·첫 화면·키 동작·Recap 공개 경계·TUI/Core 이동의 관련 통합 검증은 통과했다. HIGH/CRITICAL finding은 없으며, MEDIUM test-quality 항목은 다음 정리 작업으로 처리 가능하다.

```json
{
  "codeQualityStatus": "WATCH",
  "recommendation": "APPROVE",
  "reportPath": ".omo/evidence/2026-09-13-astra-dashboard-recap-final-review.md",
  "blockers": []
}
```

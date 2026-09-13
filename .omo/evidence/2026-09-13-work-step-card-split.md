# Work step card deep-module split evidence

- 날짜: 2026-09-13
- 브랜치: `astra/terminal-ui`
- 대상: `src/adapters/inbound/tui/features/chat/work-step-card.ts` (분리 전 715행)
- 동작 계약: 기존 direct import 공개 export, 화면 출력, 공개 payload 제한, ANSI/가시 폭, 구조화 출력 parsing budget을 유지한다.

## 파일별 책임과 행수

| 파일 | 책임 | 행수 |
|---|---|---:|
| `src/adapters/inbound/tui/features/chat/work-step-card.ts` | 기존 direct import 공개 표면만 유지하는 compatibility facade | 16 |
| `src/adapters/inbound/tui/features/chat/work-step-public-projection.ts` | Native payload·MCP envelope를 공개 step model로 축소하고, reasoning/identifier/secret field 제거와 project/home path 투영 및 status/action 의미를 소유 | 271 |
| `src/adapters/inbound/tui/features/chat/work-step-output-renderer.ts` | bounded JSON/YAML/Markdown parsing·highlight, Bash frame, semantic line tone, ANSI-safe row clipping과 status presentation을 소유 | 281 |
| `src/adapters/inbound/tui/features/chat/work-step-components.ts` | `WorkStepCard`·`ObservationCard`의 사용자 의미, card별 layout·label·input/output 조립, visible work 판정을 소유 | 137 |

합계는 705행이다. facade는 구현을 복제하지 않고 세 역할 모듈의 기존 공개 symbol만 re-export한다. `workbench-views.ts`, feature registry, `.feature.ts`, `.units.ts`는 수정하지 않았다.

## 검증

- `bun test test/work-step-card-highlight.test.ts test/result-cards.test.ts`: 32 pass, 0 fail.
- `bun run check`: pass.
- `bun test test/architecture.test.ts`: 13 pass, 0 fail. 상대 import cycle과 TUI feature/foundation 의존 방향 포함.
- `bun test test/work-traceability.test.ts`: 6 pass, 0 fail.
- `bun test`: 1,199 pass, 0 fail (133 files, 9,609 assertions).
- `TODO`, `FIXME`, `test.skip`, `test.only`, `describe.skip`, `describe.only`, `it.skip`, `it.only` 검색: 대상 source/test에서 없음.

## 독립 검토 상태

Claude Sonnet 읽기 전용 검토를 실행했으나 Claude CLI weekly limit (`resets 4am Asia/Seoul`)로 시작되지 않았다. 저장소 규칙에 따라 동일 provider나 낮은 모델 결과로 대체 판정하지 않았으며 독립 검토는 미실행 blocker로 남긴다.

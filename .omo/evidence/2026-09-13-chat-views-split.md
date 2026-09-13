# Chat view 책임 분리 증거

- 날짜: 2026-09-13
- 저장소: `/Users/jonghoPro/woo/00_project/99_www`
- 브랜치: `astra/terminal-ui`
- 범위: `src/adapters/inbound/tui/features/chat/workbench-views.ts`와 `chat-*.ts` 역할 모듈, 직접 대응 테스트의 import·검증
- 기준: `.omo/evidence/2026-09-13-tui-unit-inventory.md`의 `features/chat/workbench-views.ts` 책임 구간

## 결과

기존 653행 `WorkbenchChatView`를 다음 책임으로 분리했다.

| 파일 | 책임 | 행 수 |
|---|---|---:|
| `workbench-views.ts` | welcome/entry dashboard, approval presentation 연결, durable/live 조립, 전체 행 cache | 123 |
| `chat-durable-transcript.ts` | journal 순서에 따른 메시지·lifecycle·실행 카드·notice 조립과 step cache | 312 |
| `chat-message-renderer.ts` | user/assistant/system 메시지 공개 projection, Markdown cache, streaming draft render | 152 |
| `chat-public-lifecycle.ts` | Native plan/collaboration/compaction/reasoning lifecycle의 공개 행 projection | 69 |
| `chat-live-activity.ts` | live activity owner 대조, spinner/hint render, interval 생명주기 | 107 |

`WorkbenchChatView`와 `ChatApprovalPresentation`은 기존 `features/chat/workbench-views.ts` 경로에서 계속 export한다. Code-ID가 요구하는 `WorkbenchChatView.renderMessage`도 facade의 실제 주입 경로로 유지했다. T-note와 Monitor feature 구현을 Chat으로 가져오지 않았고 `.feature.ts`, `.units.ts`, feature registry, `work-step-card.ts` 및 그 분리 파일은 수정하지 않았다.

## 보존한 동작

- durable activity 순서와 optimistic user delivery 규칙을 유지한다.
- assistant 공개 본문 sanitizing, 완료/부분 본문 처리, Markdown 실패 격리와 cache를 메시지 렌더러가 그대로 소유한다.
- welcome 및 Linear entry dashboard는 visible Chat content가 생기기 전까지만 표시한다.
- approval presentation은 `WorkbenchChatView` constructor의 세 번째 인자로 계속 주입한다.
- spinner frame tick은 durable transcript를 다시 투영하지 않고 cache의 live tail만 교체한다.
- `invalidate`, `update`, `dispose`, `playWelcomeIntro`, `syncActivity` 공개 생명주기와 폭별 render cache를 유지한다.
- MCP startup/retry telemetry를 Chat에서 제외하는 공개 lifecycle filter를 유지한다.

## 검증

| 명령 | 결과 |
|---|---|
| `bun run check` | 통과 (`tsc --noEmit`) |
| `bun run units:check` | 통과, 5 Units · 32 Linear links · digest `4a5b0089fcb5000b498507a4e9cbeca5037841ab19f9ed9c9ca4f56ec231d2cc` |
| `bun test test/workbench-views.test.ts test/chat-render-acceptance.test.ts test/workbench-lifecycle-noise.test.ts` | 94 pass, 0 fail, 1110 assertions |
| 위 관련 테스트 + `test/architecture.test.ts` | 107 pass, 0 fail, 2664 assertions |
| `bun test test/work-traceability.test.ts` | 6 pass, 0 fail, 327 assertions |
| `bun test` | 1199 pass, 0 fail, 9609 assertions, 133 files |
| `git diff --check` | 통과 |
| 변경 파일의 `TODO`, `FIXME`, `test.skip`, `test.only`, `describe.skip`, `describe.only`, `it.skip`, `it.only` 검색 | 새 blocker 없음 |

추가로 `bun scripts/chat-render-benchmark.ts`를 실행했으나 병렬 작업에서 이미 수정된 해당 스크립트가 존재하지 않는 `src/core/domain/work-steps`를 import해 시작 전에 실패했다. 이 스크립트는 본 작업 소유권 밖이라 수정하지 않았다. 동일 cache 경로는 `workbench-views.test.ts`의 5,000-message scroll-only 재사용과 spinner frame 재사용 테스트, 전체 suite에서 통과했다.

## 남은 검토 경계

작성 패스와 독립 검토 패스는 분리해야 한다. 이 문서는 구현·자동 검증 증거이며 최종 독립 코드 리뷰 판정은 통합 소유자가 별도 패스로 수행한다.

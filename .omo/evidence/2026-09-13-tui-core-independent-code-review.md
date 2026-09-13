# TUI·Core 독립 코드 품질 검토

- 일자: 2026-09-13
- 범위: TUI Feature Unit catalog, Chat `work-step`/`workbench-views` 책임 분리, Core native-plan revision·native-event projection·completed-turn note scope 추출
- 판정: **BLOCK**
- 권고: **REQUEST_CHANGES**

## 검토 방법

현재 `astra/terminal-ui` dirty worktree를 읽기 전용으로 확인했다. 구현자가 남긴 증거는 신뢰하지 않고 현재 소스, 기존 `HEAD` 구현, 호출 지점, 테스트, 그리고 게이트를 직접 대조했다. `remove-ai-slops`와 `programming` 스킬은 제공된 전역/로컬 skill catalog 및 `.agents`에서 찾을 수 없어 로드하지 못했다. 그 대신 요청에 명시된 관점으로 과적합 테스트·구현 상수 미러링·불필요한 parsing/normalization·무형식 escape hatch를 수동 검토했다.

## CRITICAL

없음.

## HIGH

1. **TUI 이동 뒤 Code-ID 게이트가 실패한다.** `bun scripts/code-id.ts`는 현재 `src/adapters/inbound/tui/features/chat/workbench-views.ts:1`과 `src/adapters/inbound/tui/shell/workbench-shell.ts:284`의 대표 Code-ID 선언에 Linear 이슈 목록이 중복된다고 보고하고, 삭제된 이전 TUI 경로 35개를 컴파일러가 읽을 수 없다고 보고한다. 또한 Code-0001~0005의 detail 경로가 저장소 안에 없다고 실패한다. 실제 원장은 새 Chat 위치를 가리키지만([`.www/control-ledger/code-ids.json:10`](/Users/jonghoPro/woo/00_project/99_www/.www/control-ledger/code-ids.json:10)), 전체 이동의 승인 필수 게이트가 red이므로 추적성/Code-ID 계약은 완료되지 않았다. 이 상태에서는 새 catalog와 분리된 surface를 승인할 수 없다.

   - 해결: 대표 선언의 중복 Linear annotation을 계약에 맞게 정리하고, scanner가 소비하는 모든 ledger/detail/경로 참조를 새 feature/foundation/legacy 트리로 일관되게 갱신한 뒤 `bun scripts/code-id.ts`를 통과시켜야 한다.

## MEDIUM

없음.

## LOW

없음.

## 확인된 사항

- Feature registry는 정적 descriptor/lookup만 소유하며 component factory나 plugin 등록을 넣지 않았다([`feature-registry.ts:24`](/Users/jonghoPro/woo/00_project/99_www/src/adapters/inbound/tui/features/feature-registry.ts:24)). 16 Feature와 35 Unit의 ID·부모 관계·순번·retired-ID 충돌을 검증하는 catalog 테스트는 목표에 필요한 수준이다. 고정된 inventory title 검증은 catalog 계약을 검증하므로 slop이 아니다.
- Chat facade는 기존 public `WorkbenchChatView` 경로와 lifecycle API를 유지하고, durable transcript/message/live activity를 책임별로 분리했다([`workbench-views.ts:17`](/Users/jonghoPro/woo/00_project/99_www/src/adapters/inbound/tui/features/chat/workbench-views.ts:17)). foundation이 feature/shell을 역참조하지 않고 feature 간 직접 의존이 없다는 architecture test도 통과했다.
- Native-plan reader는 domain 내부 의존만 사용하며 workflow facade는 revision parsing 결과에 hash/redaction/reconciliation을 계속 소유한다([`native-plan-revision.ts:39`](/Users/jonghoPro/woo/00_project/99_www/src/core/domain/work/native-plan-revision.ts:39), [`workflow-projection.ts:336`](/Users/jonghoPro/woo/00_project/99_www/src/core/domain/work/workflow-projection.ts:336)). event projection과 T-note scope도 Core application/domain 경계를 지킨다.
- 새 production 코드에서 불필요한 extraction, parsing, normalization 또는 untyped escape hatch를 발견하지 못했다. `record()`의 `unknown` narrowing은 Native event 입력 경계에 필요한 방어적 projection이다. 테스트에는 삭제만 확인하는 사례, requested-removal만 확인하는 사례, tautology, implementation 상수만 비추는 불필요한 사례를 발견하지 못했다.

## 재실행 증거

| 명령 | 결과 |
| --- | --- |
| `bun run check` | PASS |
| 집중 관련 테스트 11개 파일 | PASS — 285 tests, 3,766 assertions |
| `bun test` | PASS |
| `bun test test/work-traceability.test.ts` | PASS — 6 tests, 327 assertions |
| `bun run units:check` | PASS — 5 Units, 32 Linear links |
| `git diff --check` | PASS |
| `bun scripts/code-id.ts` | **FAIL** — 위 HIGH finding |

## Blockers

1. `bun scripts/code-id.ts`를 통과시킬 수 있도록 TUI 이동에 남은 Code-ID/ledger/detail 경로와 대표 선언 annotation을 정합시켜야 한다.

## 최종 반환값

```json
{
  "codeQualityStatus": "BLOCK",
  "recommendation": "REQUEST_CHANGES",
  "reportPath": ".omo/evidence/2026-09-13-tui-core-independent-code-review.md",
  "blockers": [
    "TUI 이동 후 bun scripts/code-id.ts가 대표 Code-ID annotation 중복, 삭제된 이전 경로, 누락된 Code detail 경로 때문에 실패한다."
  ]
}
```

## 재감사 — Code-ID 정합 수정 후

- 재감사 시각: 2026-09-13
- 판정: **CLEAR**
- 권고: **APPROVE**

이전 HIGH blocker는 해소됐다. `code-ids.json`의 Code-001~005 detail은 존재하는 `traceability-v3.json`으로 이동했고, 그 원장에는 각 `Code-###` entity 및 4자리 legacy ID에서의 migration alias가 있다. `scripts/code-id.ts`는 이 alias를 직접 확인하며, 삭제됐지만 Git index에는 아직 남는 TUI 파일은 TypeScript source scan 대상에서 제외한다. 이는 물리적 이동 뒤 source scan을 정상화하는 좁은 변경이고, 원장 위치·대표 선언의 검증을 약화시키지 않는다.

직접 재실행한 결과:

| 명령 | 결과 |
| --- | --- |
| `bun scripts/code-id.ts` | PASS — Code-ID 5개 등록·대표 선언·파일·문서 연결 통과 |
| `bun run check` | PASS |
| `bun run units:check` | PASS — 5 Units, 32 Linear links |
| architecture/traceability/catalog/Chat/Core 집중 게이트 | PASS |
| `bun test` | PASS — 1,199 tests, 9,608 assertions |
| `git diff --check` | PASS |

원장·검사 스크립트 diff와 전체 TUI 이동 경로를 다시 확인했으며 새 HIGH/CRITICAL/MEDIUM finding은 없다. 이전 보고서의 BLOCK/REQUEST_CHANGES는 이 재감사 결과로 대체한다.

```json
{
  "codeQualityStatus": "CLEAR",
  "recommendation": "APPROVE",
  "reportPath": ".omo/evidence/2026-09-13-tui-core-independent-code-review.md",
  "blockers": []
}
```

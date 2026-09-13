# Conversation Recap 구현 증거

- 작업 경로: `/Users/jonghoPro/woo/00_project/99_www`
- 브랜치: `astra/terminal-ui`
- 범위: Core domain/application, TUI Chat feature, registry Unit, 직접 테스트와 계약 문서

## 공개 경계와 Native 보존

- 시나리오: user 메시지의 credential, assistant completion envelope의 private analysis, system 메시지, 메시지 객체에 덧붙인 tool payload를 함께 입력한다. Recap에는 redacted user 본문과 공개 assistant answer만 남고 입력 JSON은 호출 전후가 같아야 한다.
- 호출: `bun test test/conversation-recap.test.ts test/tui-feature-registry.test.ts test/astra-ui.test.ts`
- 이진 관측: `Conversation Recap > derives only public user and assistant text without mutating native messages` PASS. 전체 47 pass, 0 fail.
- 캡처: `.omo/evidence/2026-09-13-conversation-recap-tests.log` (SHA-256 `188a9b6cc141b8ff2943b0e248fedc6660c1be91606610b4a733da0292e10283`)

## 고정 출력 상한

- 시나리오: 500 code point 본문을 가진 공개 메시지 12개를 입력한다. 첫 요청과 최신 메시지 5개를 유지하면서 최대 6개, 항목당 280 code point, 전체 1,400 code point 이하이고 생략 수가 6이어야 한다.
- 호출: 위 직접 테스트 호출과 동일하다.
- 이진 관측: `Conversation Recap > keeps the first request and latest public messages inside fixed bounds` PASS.
- 캡처: `.omo/evidence/2026-09-13-conversation-recap-tests.log`

## TUI 조회와 Unit 등록

- 시나리오: 40열에서 Recap rows를 렌더링하고 모든 행 폭을 확인한다. Astra transcript의 기본 상태에는 Recap이 없고 기존 `Ctrl+E` 확장 상태에는 `Conversation Recap`이 표시되어야 한다. Registry에는 `TUI-F002-U08`을 포함한 36개 Unit이 연속 ID로 등록되어야 한다.
- 호출: 위 직접 테스트 호출과 동일하다.
- 이진 관측: Recap TUI 테스트와 registry 4개 테스트, Astra 회귀 테스트 모두 PASS.
- 캡처: `.omo/evidence/2026-09-13-conversation-recap-tests.log`

## 계층과 타입 계약

- 시나리오: 전체 TypeScript 그래프가 컴파일되고 Core→Adapter 역참조, TUI sibling feature 참조, 상대 import cycle이 없어야 한다.
- 호출: `bun run check`; `bun test test/architecture.test.ts`
- 이진 관측: `tsc --noEmit` exit 0; architecture 13 pass, 0 fail.
- 캡처: `.omo/evidence/2026-09-13-conversation-recap-typecheck.log` (SHA-256 `1a77b41ad5010c7b374d8b3c09048f2a99eddb715afe238f144b44a8537287e4`), `.omo/evidence/2026-09-13-conversation-recap-architecture.log` (SHA-256 `f289d9f976616310aa7b27f4a1e7d26f447572d0515efe816b4f7d5ab74ba07f`)

## 자리표시 검사

- 시나리오: 변경 파일에서 `TODO`, `test.skip`, `test.only`, `describe.skip`, `describe.only`, `IMPLEMENT_ME`, `placeholder`를 검색한다.
- 호출: `rg -n "TODO|test\\.skip|test\\.only|describe\\.skip|describe\\.only|IMPLEMENT_ME|placeholder" <changed files>`
- 이진 관측: 일치 항목 0개.
- 캡처: 이 문서의 실행 기록.

독립 Claude Sonnet/Opus 검토는 이 세션에 해당 provider 실행 도구가 노출되지 않아 수행하지 않았다. 구현자가 자기 결과를 승인하지 않으며, 상위 통합 단계에서 읽기 전용 교차검증이 필요하다.

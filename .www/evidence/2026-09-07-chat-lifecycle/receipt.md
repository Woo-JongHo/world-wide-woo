# WOO-688 Chat lifecycle 구현 영수증

<!-- @linear WOO-688 | 6336cca1-a828-45b9-ac62-cbaa3b35b7d8 -->

- Linear: [WOO-688 — Message 03. 답변 생성·완료·중단 과정을 보여준다](https://linear.app/woo-world/issue/WOO-688/message-03-%E1%84%83%E1%85%A1%E1%86%B8%E1%84%87%E1%85%A7%E1%86%AB-%E1%84%89%E1%85%A2%E1%86%BC%E1%84%89%E1%85%A5%E1%86%BC%E1%84%8B%E1%85%AA%E1%86%AB%E1%84%85%E1%85%AD%E1%84%8C%E1%85%AE%E1%86%BC%E1%84%83%E1%85%A1%E1%86%AB-%E1%84%80%E1%85%AA%E1%84%8C%E1%85%A5%E1%86%BC%E1%84%8B%E1%85%B3%E1%86%AF-%E1%84%87%E1%85%A9%E1%84%8B%E1%85%A7%E1%84%8C%E1%85%AE%E1%86%AB%E1%84%83%E1%85%A1)
- Linear UUID: `6336cca1-a828-45b9-ac62-cbaa3b35b7d8`
- 작업 branch: `woo-688-chat-lifecycle`
- 구현 기준: `5dbc970` (`d35b2bb` WOO-690 보완을 이 branch에 cherry-pick한 동등 commit)
- 검증일: 2026-09-07 (Asia/Seoul)

## 재현

실제 `ProjectWorkbench`, `MemoryJournal`, `FakeNativeHarness`를 사용한 application 회귀와 실제 `WorkbenchChatView`/pi-tui layout projection 회귀를 먼저 추가했다.

- [`red-project-workbench.log`](red-project-workbench.log): 기존 구현에서 부분 답변 소실, 빈 완료 오인, duplicate completed 덮어쓰기, late delta 재등장, resume 뒤 terminal item 재등장을 포함해 `75 pass / 8 fail`.
- [`red-workbench-views.log`](red-workbench-views.log): 기존 renderer에서 미수신 label과 `streaming → incomplete` 정제가 없어 `59 pass / 4 fail`.

후속 자체 검토에서 item terminal만 오고 turn terminal이 오지 않는 실패·취소 경로도 같은 소실 위험이 있음을 확인해 별도 회귀로 고정했다. 이 후속 회귀는 최초 red 로그 뒤에 추가했으므로 red 실행 근거라고 주장하지 않는다.

## 코드 계약

- `src/application/project-workbench.ts`
  - terminal item을 완전한 `(threadId, turnId, itemId)` identity로 기억하며 startup local journal에서 복원한다.
  - exact terminal item의 duplicate terminal observation과 late delta를 무시한다. 같은 item ID라도 다른 turn/thread 소유자는 차단하지 않는다.
  - final assistant observation 없이 active root turn이 끝나면 현재 bounded public draft를 terminal activity보다 먼저 durable message로 보존한다.
  - draft가 전혀 없으면 `최종 답변 본문을 받지 못했습니다.`를 별도 incomplete message로 남겨 정상 빈 답변처럼 보이지 않게 한다.
  - synthetic payload는 `partial`, `finalObservation: "missing"`, `observationScope`, `terminalMethod`를 기록한다. local delta의 bounded projection만 보존했으며 provider 원문 전체를 받았다고 주장하지 않는다.
  - failed/cancelled turn과 body 없는 terminal agent-message도 받은 partial을 각각 `failed`/`cancelled`로 남긴다.
  - turn terminal cleanup은 같은 thread/turn의 draft·reasoning·live projection만 정리한다.
- `src/domain/workbench.ts`
  - message 완결성을 위한 `incomplete` status와 실제 partial text 존재를 구분하는 `partial` observation을 추가한다.
  - Native turn/activity phase는 변경하지 않는다.
- `src/presentation/tui/workbench-views.ts`
  - partial incomplete는 `부분 응답 · 최종 본문 미수신`, empty incomplete는 `최종 본문 미수신`으로 구분한다.
  - incomplete도 terminal public response 정제를 적용한다. status가 기존 markdown cache key에 포함되므로 같은 본문이어도 `streaming → incomplete`가 다시 투영된다.
  - incomplete message는 정상 completed recap anchor가 아니다.

Monitor/Dashboard 제품 코드는 변경하지 않았다.

## 검증

- [`targeted-project-workbench.log`](targeted-project-workbench.log): `86 pass / 0 fail / 471 assertions`, exit 0.
- [`targeted-workbench-views.log`](targeted-workbench-views.log): `67 pass / 0 fail / 999 assertions`, exit 0. 이 파일은 40/80/120열 `WorkbenchChatView`와 full pi-tui dashboard layout fixture를 포함한다.
- [`typecheck.log`](typecheck.log): `bun run check`, exit 0.
- [`full-test.log`](full-test.log): `642 pass / 0 fail / 73 files / 4282 assertions`, exit 0.
- [`cli-help.log`](cli-help.log): 실제 CLI entry가 로드되고 native Workbench 및 `/cancel` 경로를 안내함을 확인했다. Chat lifecycle 또는 Native provider 수락 증거로 사용하지 않는다.
- `git diff --check`: exit 0.
- 변경 코드·테스트에서 `test.skip`, `test.only`, `describe.skip`, `describe.only`, `[DEBUG` marker를 찾지 못했다. 기존 제품 문자열 `TODO.md`와 UI assertion `TODO 0/0`만 검색됐다.

## 파일 fingerprint

- `src/application/project-workbench.ts`: `2ebb9fe30cf937d7075656b1199a31d021f1c2615aa0d159888559fa09c71ebf`
- `src/domain/workbench.ts`: `377d17b18376a3f15df25fb7885ba81c7463a4eb8f96fbfa969643834a3a568e`
- `src/presentation/tui/workbench-views.ts`: `0ef937cdb10a027fe2d90ed9b4f12571b0605cabcaf0afb8390f4f5587e3b1f1`
- `test/project-workbench.test.ts`: `90ae7e19cfdcc96a5e6a0937dc22ab1e9fed3dc1cda3545885ea662f92d2396d`
- `test/workbench-views.test.ts`: `0f4fc0e995843d75def972539bd13101d1cc339f2075e2ec653025b672e36628`

Fingerprint는 receipt 작성 직전 값이다. 이후 코드 수정이 생기면 다시 산출해야 한다.

## 남은 수락 범위

- 실제 Codex Native provider에서 final item 미수신, body 없는 terminal agent-message, late delta를 강제로 발생시키지 않았다. Fake event shape가 실제 provider의 sparse refs 전부를 대표한다고 주장하지 않는다.
- 실제 interactive TUI 녹화로 40/80/120열의 깜빡임, 읽던 위치, scroll/focus를 확인하지 않았다. 자동 fixture는 실제 pi-tui renderer/layout을 통과하지만 사람의 화면 수락을 대체하지 않는다.
- `node_modules`는 준비용 untracked symlink다. commit 후보가 아니다.
- 이 worktree에서 commit, push, PR 생성, Linear 쓰기를 수행하지 않았다.

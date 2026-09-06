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

실제 Native·PTY 재현은 최초 자동 검증 뒤 두 번 실행했고 둘 다 실패했다. 정상 `item/completed`의 `userMessage`(`text` 없음, `content: [{ type: "text" }]`)를 빈 assistant final로 오인했으며, Esc 중단은 `turn/completed`의 nested `turn.status: "interrupted"`로 전달돼 성공 완료로 오분류됐다. 원본과 분석은 `.www/scratchpad/2026-09-07-native-pty-*` 및 `2026-09-07-chat-lifecycle-native-qa-findings.md`에 보존했다.

1차 Opus 감사는 `REVISE`였다. 실패·중단 partial 정제 누락, 불균형 private envelope 노출, non-item terminal의 duplicate·late overwrite 가능성을 지적했고, 이번 보완 diff에서 모두 수정·회귀화했다.

## 코드 계약

- `src/application/project-workbench.ts`
  - terminal item을 완전한 `(threadId, turnId, itemId)` identity로 기억하며 startup local journal에서 복원한다.
  - exact terminal item의 duplicate terminal observation과 late delta를 무시한다. 같은 item ID라도 다른 turn/thread 소유자는 차단하지 않는다.
  - final assistant observation 없이 active root turn이 끝나면 현재 bounded public draft를 terminal activity보다 먼저 durable message로 보존한다.
  - draft가 전혀 없으면 `최종 답변 본문을 받지 못했습니다.`를 별도 incomplete message로 남겨 정상 빈 답변처럼 보이지 않게 한다.
  - synthetic payload는 `partial`, `finalObservation: "missing"`, `observationScope`, `terminalMethod`를 기록한다. local delta의 bounded projection만 보존했으며 provider 원문 전체를 받았다고 주장하지 않는다.
  - failed/cancelled turn과 body 없는 terminal agent-message도 받은 partial을 각각 `failed`/`cancelled`로 남긴다.
  - turn terminal cleanup은 같은 thread/turn의 draft·reasoning·live projection만 정리한다.
  - terminal assistant item은 generic `*Message`가 아니라 실제 `agentMessage` shape로 식별한다. Native `userMessage` completion은 synthetic assistant 미수신 응답을 만들지 않는다.
  - exact `turn/completed`는 nested `turn.status`의 interrupted/cancelled/failed를 먼저 읽어 terminal phase를 정규화한다. 정상 완료 checkpoint와 자동 T-note는 정규화된 `completed` phase에서만 실행한다.
  - non-item method로 전달된 terminal item도 observation kind·phase·완전 identity로 기억해 duplicate terminal과 late delta를 차단한다.
  - 공백뿐인 delta는 보존할 공개 답변으로 세지 않고 outputless terminal 안내를 사용한다.
- `src/domain/workbench.ts`
  - message 완결성을 위한 `incomplete` status와 실제 partial text 존재를 구분하는 `partial` observation을 추가한다.
  - Native turn/activity phase는 변경하지 않는다.
- `src/presentation/tui/workbench-views.ts`
  - partial incomplete는 `부분 응답 · 최종 본문 미수신`, empty incomplete는 `최종 본문 미수신`으로 구분한다.
  - incomplete도 terminal public response 정제를 적용한다. status가 기존 markdown cache key에 포함되므로 같은 본문이어도 `streaming → incomplete`가 다시 투영된다.
  - incomplete message는 정상 completed recap anchor가 아니다.
- `src/domain/redaction.ts`
  - partial 응답은 별도 fail-closed 정제를 거친다. 불균형 `<analysis>` 같은 private envelope가 중간에 끊겨도 내부 내용을 표시하지 않고, envelope 밖의 일반 Markdown·fenced 예시는 유지한다.
  - 이 partial 정제는 incomplete뿐 아니라 보존된 failed/cancelled 본문에도 동일하게 적용한다.

Monitor/Dashboard 제품 코드는 변경하지 않았다.

## 검증

- [`targeted-project-workbench.log`](targeted-project-workbench.log): `86 pass / 0 fail / 471 assertions`, exit 0.
- [`targeted-workbench-views.log`](targeted-workbench-views.log): `67 pass / 0 fail / 999 assertions`, exit 0. 이 파일은 40/80/120열 `WorkbenchChatView`와 full pi-tui dashboard layout fixture를 포함한다.
- [`typecheck.log`](typecheck.log): `bun run check`, exit 0.
- [`full-test.log`](full-test.log): `642 pass / 0 fail / 73 files / 4282 assertions`, exit 0.
- [`cli-help.log`](cli-help.log): 실제 CLI entry가 로드되고 native Workbench 및 `/cancel` 경로를 안내함을 확인했다. Chat lifecycle 또는 Native provider 수락 증거로 사용하지 않는다.
- `git diff --check`: exit 0.
- 변경 코드·테스트에서 `test.skip`, `test.only`, `describe.skip`, `describe.only`, `[DEBUG` marker를 찾지 못했다. 기존 제품 문자열 `TODO.md`와 UI assertion `TODO 0/0`만 검색됐다.
- [`post-opus-validation.md`](post-opus-validation.md): 보완 뒤 targeted `168 pass / 0 fail / 1518 assertions`, 전체 `657 pass / 0 fail / 74 files / 4330 assertions`, typecheck와 diff check exit 0. marker 직접 검사 결과도 함께 기록했다.

## 파일 fingerprint

- `src/application/project-workbench.ts`: `e823f6a0a88f73143210b3f755aae58406c881c31f4ff0b118e3829c89594399`
- `src/domain/workbench.ts`: `377d17b18376a3f15df25fb7885ba81c7463a4eb8f96fbfa969643834a3a568e`
- `src/domain/redaction.ts`: `3050726cfa59a124d8f062c3fa3eaeaeeed0407a382dce2bb1cb0a75e630640c`
- `src/presentation/tui/workbench-views.ts`: `99e7cb6ee7b893b17d49b16d48fbab50d649356ff912e19051ae4862f1def47f`
- `test/project-workbench.test.ts`: `81cd992b07dd997aafed77780072bf3605ba38f6376ee828e0313f19682043c4`
- `test/workbench-views.test.ts`: `3e0f76f9a8b56fb3e072f5af70a7ce9dd99d974dd1601d3a604d7cfdb664c7ec`
- `test/redaction.test.ts`: `f81cf3d068c06e2a22cff5a01692c3a5d5268c65c7f24acc18de0513479ab81b`

Fingerprint는 receipt 작성 직전 값이다. 이후 코드 수정이 생기면 다시 산출해야 한다.

## 남은 수락 범위

- 수정 전 실제 Codex Native·PTY 실행은 두 결함을 재현해 실패했다. 수정 뒤 같은 harness를 재실행했고 정상 응답의 거짓 미수신 bubble이 사라졌으며 Esc 중단의 partial+`중단됨` 표시를 확인했다. 원본은 `../2026-09-07-chat-lifecycle-native-pty-after-fix/`에 있다. 실제 provider에서 final item 미수신, body 없는 terminal agent-message, failed terminal, late delta를 모두 강제로 발생시킨 것은 아니며 이 경계는 자동 회귀 범위다.
- 실제 interactive TUI의 40/80/120열 깜빡임, 읽던 위치, scroll/focus 수락은 아직 완료되지 않았다. 자동 fixture는 실제 pi-tui renderer/layout을 통과하지만 사람의 화면 수락을 대체하지 않는다.
- 1차 Opus `REVISE` 지적은 코드와 회귀로 보완했지만, 보완 diff에 대한 최종 Opus 감사는 세션 제한으로 아직 실행하지 않았다. 더 낮은 모델로 대체하지 않는다.
- `node_modules`는 준비용 untracked symlink다. commit 후보가 아니다.
- 이 worktree에서 commit, push, PR 생성, Linear 쓰기를 수행하지 않았다.

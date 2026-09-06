# WOO-690 Chat identity 수정 영수증

- Linear: [WOO-690](https://linear.app/woo-world/issue/WOO-690)
- Linear UUID: `a417df98-8479-4222-b7e8-170ea4230f97`
- 기준 HEAD: `19bad6c00b2dbb4f8c58fd632eb362aae6d31d8d`
- 작업 branch: `woo-690-chat-identity`
- 검증일: 2026-09-06~07 (Asia/Seoul)

## 재현

`bun test test/project-workbench.test.ts`로 다음 세 결함을 fix 전에 각각 red로 확인했다.

1. child thread가 root와 같은 `itemId`를 쓰면 root 답변이 사라지고 마지막 같은-ID 답변만 남았다.
2. 같은 `itemId`의 다른 turn delta가 기존 draft에 이어 붙었다.
3. resume 요청과 다른 thread ID를 Native가 반환해도 초기화가 성공했다.

기존 조사 probe의 “child message and cross-thread item ID collision”과 같은 실제 `ProjectWorkbench` 경로를 회귀 테스트로 최소화했다. Fake provider 기반 결정론적 application test이며 실제 Native provider 또는 TUI 수락 증거는 아니다.

1차 Opus 읽기 검토의 `REVISE` 뒤 다음 세 누락도 회귀로 red를 확인했다.

1. 관측된 root turn의 message에서 `threadId`만 빠지면 완료 답변이 root Chat에서 사라졌다.
2. delta와 completion의 refs 밀도가 다르면 draft/live activity가 이어지거나 지워지지 않았다.
3. `thread/read`가 재개한 thread와 다른 ID를 반환해도 초기화가 성공했다.

## 코드

- `src/application/project-workbench.ts`
  - Chat message key를 `(threadId, turnId, itemId)`가 결속된 identity로 만든다.
  - root Chat projection은 현재 root thread와 정확히 일치하는 message activity만 받는다. child activity는 Trace/WorkFlow 관측을 위해 snapshot activities와 journal에 계속 남는다.
  - assistant, reasoning, reasoning summary draft와 live tool activity의 교체·완료 판정을 같은 identity로 통일한다.
  - sparse refs는 기존 관측으로 thread/turn 소유자가 정확히 하나일 때만 보완한다. 소유권이 없거나 충돌하면 root event wildcard로 수용하지 않는다.
  - item-scoped delta/completion을 완전한 identity로 정규화할 수 없으면 현재 draft/live 상태에 합치거나 전체 clear하지 않는다.
  - resume 응답 thread ID가 요청 ID와 다르면 source binding, `thread/read`, journal append 전에 실패한다.
  - `thread/read` 응답 ID도 재개한 ID와 대조하고 불일치하면 reconciliation journal append 전에 실패한다.
  - durable Chat cache에 root thread authority를 포함해 thread 채택 뒤 stale projection을 재사용하지 않는다.
- `test/project-workbench.test.ts`
  - child/root 동일 item ID 충돌, root의 다른 turn 동일 item ID, child draft 격리, 다른 turn 완료에 의한 draft/live activity 오삭제, resume/read mismatch fail-closed를 검증한다.
  - thread 또는 turn 하나가 빠진 sparse message/tool refs를 유일한 관측 소유자로 정규화하고, 소유권 없는 item-only 완료는 root wildcard로 쓰지 않는지 검증한다.
  - resume snapshot이 `partial-local-journal`이며 provider 과거 history를 hydrate하지 않았음을 계속 공개하는지 검증한다.
- `test/project-workbench-session.test.ts`
  - 전체 회귀에서 드러난 모순된 FakeNative fixture를 실제 계약처럼 요청 thread ID를 반환하도록 바로잡았다. 최초 전체 실행은 이 fixture 때문에 `614 pass / 1 fail`이었고, fixture 수정 뒤 최종 전체 실행은 통과했다.

## 검증

- [`targeted-project-workbench.log`](targeted-project-workbench.log): `73 pass / 0 fail`, exit 0
- [`targeted-project-workbench-session.log`](targeted-project-workbench-session.log): `13 pass / 0 fail`, exit 0
- [`typecheck.log`](typecheck.log): `bun run check`, exit 0
- [`full-test.log`](full-test.log): `619 pass / 0 fail / 73 files / 4211 assertions`, exit 0
- `git diff --check`: exit 0
- 변경한 코드·테스트에서 `test.skip`, `test.only`, `describe.skip`, `describe.only`, `[DEBUG-...]`를 찾지 못했다.

## 파일 fingerprint

- `src/application/project-workbench.ts`: `dd91fb6dd0c39c768dad3ada45121d4d121fe29c78a59294a2a4a5ac12fad396`
- `test/project-workbench.test.ts`: `a1ea4ffd04bf79d92f01642f939e5894497b000a2526da3f5b0e17e5da7480f1`
- `test/project-workbench-session.test.ts`: `6959de1803c88e0905aa52bcbc15676a8e4a0ce139f186b8fd7d4e9f107df967`

## 남은 수락 범위

- 실제 Codex Native 연결에서 root/child가 동시에 동일 item ID를 내보내는 시나리오를 실행하지 않았다.
- 실제 TUI에서 재개 전후 순서, root Chat 가시성, 스크롤·focus를 확인하지 않았다. 따라서 WOO-690 전체 수락 완료를 주장하지 않으며 이 변경은 부분 구현 PR 근거다.
- WOO-688의 final 미수신 부분 답변 소실과 terminal item late delta는 별도 후속 범위로 남겼고 이번 변경에서 수정하지 않았다.
- commit, push, PR 생성, Linear write는 이 worktree에서 수행하지 않았다.

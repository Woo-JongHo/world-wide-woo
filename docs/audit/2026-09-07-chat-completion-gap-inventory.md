# Chat 01~08 완료 공백 inventory — 2026-09-07

## 범위와 판정 규칙

이 문서는 코드·두 Chat worktree·GitHub PR·보존된 Evidence를 읽기 전용으로 대조한 현재 inventory다. 코드나 Linear를 수정하지 않았다. 테스트 로그의 PASS는 해당 fixture/commit의 동작 증거이며, 현재 `main`에 반영됐거나 Linear 수락이 끝났다는 뜻으로 해석하지 않는다.

확인한 위치:

- 기준 worktree: `/Users/jonghoPro/woo/00_project/99_www`, `main...origin/main`, 기존 사용자 변경이 다수 남아 있음.
- identity worktree: `/Users/jonghoPro/woo/00_project/99_www-pr-chat-identity`, branch `woo-690-chat-identity`, HEAD `05e2829`, untracked evidence와 `node_modules`가 있음.
- lifecycle worktree: `/Users/jonghoPro/woo/00_project/99_www-pr-chat-lifecycle`, branch `woo-688-chat-lifecycle`, HEAD `e1b188b`, untracked evidence와 `node_modules`가 있음.
- 두 feature branch 모두 `main`의 조상이 아니며, lifecycle branch는 identity branch를 포함한다.

## PR 상태와 branch 차이

| PR | 대상 | 현재 상태 | 실제 내용 | 판정상 의미 |
|---|---|---|---|---|
| #38 | Chat 기록/Linear 연결, WOO-679 | OPEN, `woo-chat-pr-workflow`, `UNSTABLE` | 제품 코드 변경 없음. 기록 연결과 기존 수락/미수락 경계를 보존 | 기준선 문서 PR이지 Chat 완료 PR이 아님 |
| #39 | WOO-690 Message 05 | OPEN, `woo-690-chat-identity`, `UNSTABLE` | `project-workbench.ts` identity 격리, optimistic 중복 및 itemless TTFT 수정, 회귀와 Native smoke Evidence | Opus 최종 보완 검토는 PASS로 저장돼 있으나 WOO-690 전체 수락·실제 재개 TUI는 명시적으로 미완료 |
| #40 | WOO-688 Message 03 | CLOSED, `woo-688-chat-lifecycle`, base `woo-690-chat-identity`, 미병합 | partial/missing-final/failed/cancelled/late-delta lifecycle과 PTY Evidence | PR 자체는 닫혔고 merge 시각/merge commit이 없다. 닫힘 사유는 GitHub timeline에 owner의 `closed` 이벤트만 있고 설명·리뷰 코멘트가 없다. lifecycle 보완 diff에 대한 최종 Opus 감사도 실행되지 않았다. |

PR #40은 초기 Opus REVISE 이후 코드·테스트를 보완했지만, `receipt.md`와 `post-opus-validation.md`가 모두 “최종 Opus 감사는 아직 실행하지 않음”을 명시한다. Terra의 lifecycle code review는 `recommendation: APPROVE`였고 runtime rereview도 APPROVE였지만, 이는 Opus 최종 감사의 대체가 아니다. 초기 Opus가 지적한 D1/D2/D3는 보완됐다고 기록되어 있고, 이후 남은 경계는 실제 provider가 내는 bodyless/failed/late-delta와 재시작·scroll/focus/IME다.

PR #39의 최신 저장 Opus 결과는 `2026-09-07-chat-identity-opus-final.json`의 **PASS**가 아니라 같은 파일의 `result`가 **REVISE**인 초기/중간 판정과 혼동되기 쉽다. `chat-identity-opus-resolution.json`의 결과는 실제 `claude-opus-5` 사용 기록과 함께 PASS이며 D1/D2를 고쳤다고 확인한다. 그래도 D3(실제 assistant/reasoning refs 밀도), D4(추론 refs가 digest 전에 저장됨), D5(소유권 Map pruning 없음)는 비차단 한계다. Opus가 실제로 실행됐다고 볼 수 있는 근거는 두 JSON의 `modelUsage.claude-opus-5`와 결과 본문이며, lifecycle 보완 diff에는 그런 최종 결과가 없다.

## Chat 01~08 현재 공백

| 항목 | Linear 기준 | 현재 코드·Evidence | 남은 공백 |
|---|---|---|---|
| 01 문서/코드 표시 | WOO-686 | `workbench-views.ts`, `syntax-highlighter.ts`, `terminal.ts`, `redaction.ts`; syntax/Markdown 회귀 존재 | 표·중첩 목록·TS/JSON/Bash·미완성 fence의 40/80/120 전체 조합, highlight 예외/budget 강제, 실제 TUI 수락 |
| 02 주체/상태 구분 | WOO-687 | role/status label, queue/error notice, 색상/renderer 회귀 | unknown role을 assistant로 추정하는 경계와 무채색·좁은 폭 실제 가독성 수락 |
| 03 생성/완료/중단 | WOO-688 | lifecycle branch의 657/0 full, PTY replay-002에서 정상 1 user+1 assistant 및 Esc partial+`중단됨` 확인 | 실제 provider 강제 bodyless final, failed terminal, late delta는 자동 fixture만; lifecycle 보완 diff 최종 Opus 없음. PR #40도 CLOSED라 통합 위치가 없음 |
| 04 긴 결과 탐색 | WOO-689 | projection cache, scroll/follow 테스트와 5,000-message 성능 assertion | CJK/emoji/결합문자/URL 40/80/120, 장기 memory 기준선, 실제 focus·최신 복귀 수락 |
| 05 재개/대상 유지 | WOO-690 | PR #39에서 root/child·turn/item identity, sparse refs, resume/read mismatch 회귀; Opus resolution PASS | PR #39 미병합. 실제 Native에서 root/child 동일 item, 재개 전후 순서·root visibility·scroll/focus를 함께 수락하지 않음. assistant delta refs 밀도 미실측 |
| 06 비정상 응답/복구 | WOO-691 | redaction, unknown role/status, missing final/renderer exception 테스트가 있음; lifecycle가 partial 상태를 보존 | 실제 화면에서 renderer 예외 후 입력 복구 matrix와 provider 경계(bodyless/failed/late/restart) 미수락 |
| 07 실제 TUI 수락 | WOO-692 | lifecycle replay-002는 archive runner, 40/80/120 resize, 정상/중단, source fingerprint를 보존 | PTY가 증명하지 않는 scroll/focus/IME/재시작/사람의 화면 수락이 남음. 자동 fixture를 전체 수락으로 승격할 수 없음 |
| 08 대화·실행·결과 흐름 | WOO-718 | 현재 구현은 Chat message와 native activity projection을 연결하고 `result-cards`/Tracer 관련 코드가 존재 | 최신 Linear hierarchy가 사용자 지시대로 WOO-679 직계인지 검증 가능한 최신 readback이 없음. local 2026-09-07 snapshot은 WOO-718 parent를 WOO-683으로 기록하며 서로 충돌한다. 실행 카드→Tracer 원문 이동/원본 부재 안내·최종 미수신 결과 안내의 통합 실제 수락도 남음 |

부모 범위도 분리한다. WOO-679는 실행 카드의 Tracer 이동·원본 부재 안내·최종 메시지 미수신 결과 안내가 남아 있다. 사용자가 알려준 최신 상태에서는 WOO-683이 삭제됐으므로, WOO-718을 WOO-683 아래에 둔 오래된 snapshot은 정본으로 사용할 수 없다. `.www/scratchpad/2026-09-07-linear-normalization-readback.json`의 `archivedAt: null`과 이 최신 상태가 충돌하므로 Linear 최신 readback이 필요하다. WOO-719(예외)와 WOO-720(테스트)은 사용자가 지정한 대로 WOO-679 직계 기준으로 추적해야 한다.

## 3~5개 actionable gaps

1. **통합 기준 branch를 먼저 만들고 #39와 lifecycle 변경을 하나의 검토 가능한 후보로 합쳐야 한다.** 현재 `main`에는 어느 PR도 들어가지 않았고 #40은 닫혀 있다. `woo-688-chat-lifecycle`은 `woo-690-chat-identity`를 포함하지만 PR #40은 base가 #39 branch라서, 두 PR을 그대로 별개 완료로 세면 재현·검증 SHA가 갈라진다. 대상은 `src/application/project-workbench.ts`, `src/domain/redaction.ts`, `src/domain/workbench.ts`, `src/presentation/tui/workbench-views.ts` 및 관련 세 테스트다.

2. **lifecycle 보완 diff에 대해 실제 `claude-opus-5` 최종 감사가 필요하다.** 현재 증거는 초기 Opus REVISE와 후속 Terra APPROVE, 자동 657/0 및 PTY replay-002다. `receipt.md`가 명시한 미실행 상태를 PASS로 승격하면 안 된다. 대상 Evidence는 `.www/evidence/2026-09-07-chat-lifecycle/receipt.md`, `post-opus-validation.md`, `.www/evidence/2026-09-07-chat-lifecycle-native-pty-after-fix/replay-002/`다.

3. **Native 경계의 미수락 시나리오를 닫아야 한다.** provider에서 bodyless agent terminal, failed terminal, completed item 뒤 late delta, 재시작을 실제 경로로 관측하고, sparse `threadId/turnId/itemId` 및 assistant/reasoning refs 밀도를 남겨야 한다. 현재 자동 회귀는 이 경계를 흉내 낸 fixture이고, lifecycle replay는 정상·Esc partial만 실행했다. 핵심 코드는 `src/application/project-workbench.ts`의 terminal/identity 정규화와 `src/presentation/tui/workbench-views.ts`의 partial projection이다.

4. **WOO-692/689/686/687의 실제 PTY 수락을 하나의 matrix로 묶어야 한다.** 40/80/120열 resize는 lifecycle replay에 있으나, scroll/focus/IME/재시작과 CJK·emoji·결합문자·URL, syntax budget/unknown role은 각각 미수락이다. `WorkbenchChatView`, `dashboard-layout.ts`, `syntax-highlighter.ts`, `theme.ts`를 동일 제품 HEAD에서 확인하고 캡처/입력 복구까지 기록해야 한다.

5. **Linear hierarchy와 삭제 상태를 최신 readback으로 정리해야 한다.** WOO-683 삭제, WOO-718 직계 WOO-679, WOO-719/720 직계 WOO-679라는 현재 지시와 local snapshot의 WOO-718→WOO-683/683 active 기록이 모순된다. 이 메타데이터가 정리되기 전에는 Chat 01~08 완료를 Linear에 반영하거나 WOO-718을 닫을 근거가 없다.

## 결론

현재 가장 강한 결론은 “identity/lifecycle 코드와 자동 회귀는 feature branch에 존재하고, 일부 정상·중단 PTY 증거도 있으나 Chat 01~08 전체 완료는 아니다”다. 특히 #40 CLOSED는 merge나 수락을 뜻하지 않고, lifecycle 최종 Opus 감사는 실행되지 않았다. 완료를 주장하기 전에 통합 branch의 동일 HEAD에서 위 다섯 gap을 해소하고, 각 이슈의 실제 TUI/Native 경계를 별도 Evidence로 남겨야 한다.

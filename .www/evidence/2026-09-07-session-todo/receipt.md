# WOO-702 세션 Todo identity·보존·재개 구현 근거

- Linear: [WOO-702](https://linear.app/woo-world/issue/WOO-702)
- Linear UUID: `62bdc3c2-cb9b-428f-8e86-7e69350a400b`
- 기준 HEAD: `d35b2bbb1f784a0f177c6e80453ce634d6d93d74`
- 작업 branch: `woo-702-session-todo`
- 검증일: 2026-09-07 (Asia/Seoul)
- 판정: 코드 및 결정론적 회귀 통과, 실제 Native Plan 미발행으로 Native/Todo 수락 실패, TUI 미실행

## 구현

- `TodoDocument.source`에 Native thread key digest, turn, Input activity/request, Plan revision, root execution 참조를 저장한다. 각 `TodoItem.source`에는 64자 원본 source identity, origin/current Plan revision, 실행 참조를 저장한다.
- 표시 ID는 원본 identity의 48자 prefix에서 파생하지만 충돌은 저장 전에 거부한다. 삽입, 재정렬, 문구 편집, 중복 replay 뒤에도 원본 identity가 유지된다.
- 같은 session thread의 더 높은 journal sequence만 현재 Plan을 갱신한다. 이전 sequence, 같은 sequence의 다른 revision/turn, 다른 thread key digest는 현재 Todo를 덮지 않는다.
- Workbench는 해당 turn의 `request/started` journal 관측에서만 Input과 model을 결속한다. provider/agent가 관측되지 않으면 `null`로 남기고, 현재 선택 모델을 과거 실행에 소급하지 않는다.
- source-bound Todo는 재개 시 현재 journal projection과 다시 대조한다. source 없는 비어 있지 않은 기존 문서는 재개 자동 동기화 대상에서 제외하며, 읽기와 동일 문서 patch에서 소유하지 않은 원문과 줄바꿈을 보존한다.
- source 없는 빈 기존 문서는 기존 bootstrap 계약에 따라 관측된 재개 Plan으로 전환한다. 이후 새 Native 요청에서 관측된 Plan은 session Todo의 관리 projection을 갱신하지만, FileTodoStore patch는 관리 밖 Markdown을 유지한다.

## 수락 요구 대조

| 요구 | 코드/결정론적 근거 | 판정 |
|---|---|---|
| 세션별 Todo 경로 | 서로 다른 Native thread를 `scopedTodoSessionId`와 실제 `FileTodoStore` factory로 열어 서로 다른 경로 및 refs 확인 | 통과 |
| Input/turn/Plan revision 연결 | Markdown domain round trip, Workbench journal binding, FileTodoStore 재개 round trip | 통과 |
| source item identity 유지 | 삽입·재정렬·편집·replay 회귀 및 prefix 충돌 거부 | 통과 |
| late/foreign Plan 보호 | 이전 sequence, 동일 sequence 불일치, 다른 thread digest에서 write/event가 늘지 않음 | 통과 |
| model/agent/Plan 재개 | 관측 model은 저장, 미관측 model/agent는 `null`, source-bound 문서는 최신 revision으로 재개 | 통과 |
| reference-free legacy 보존 | domain byte-identical patch와 실제 파일 read의 무변경 확인 | 통과 |
| Native 종료·Plan 완료·작업 수락 구분 | 기존 상태 전이를 유지하고 이 변경은 종료/완료를 작업 수락으로 승격하지 않음 | 코드 계약 유지, 실제 TUI 미확인 |
| 실제 Native Plan→Todo.md | App Server 0.153.4 actual run 3회는 terminal 정상 종료, `turn/plan/updated`와 `plan` item 0건, Todo null | 실패 |
| 실제 Native 세션 재개·격리 | actual Plan이 없어 저장 선행조건 미충족; fake fixture 결과를 actual로 승격하지 않음 | 미실행 blocker |
| 실제 TUI 세션 재개 | 실행하지 않음 | 미실행 |

## 검증

- [targeted-tests.log](targeted-tests.log): `137 pass / 0 fail / 5 files / 695 assertions`, exit 0
- [typecheck.log](typecheck.log): `bun run check`, exit 0
- [full-test.log](full-test.log): `630 pass / 0 fail / 73 files / 4256 assertions`, exit 0
- [red-green.md](red-green.md): source refs, stale resume, late/foreign 방어가 없던 red와 구현 뒤 green 기록
- [native-qa.log](native-qa.log): 실제 App Server 3회 실패 원문, 공개 item type, process exit, schema 대조와 최종 회귀
- `git diff --check`: exit 0
- 변경한 코드·테스트에서 `test.skip`, `test.only`, `describe.skip`, `describe.only`, `[DEBUG-...]`, placeholder 표식을 찾지 못했다.

## 증거의 종류와 한계

- `test/todo-store.test.ts`는 임시 디렉터리에 실제 `Todo.md`를 쓰고 다시 읽는 FileTodoStore 검증이다.
- `test/project-workbench*.test.ts`는 Fake Native 및 memory/tracking store 기반 결정론적 application/session 검증이다.
- 실제 Codex Native provider는 `gpt-5.6-sol`, low, ephemeral, read-only, approval never로 세 번 실행했다. 모든 turn은 정상 terminal이었으나 Native Plan 이벤트와 `plan` item을 발행하지 않아 Todo.md가 생성되지 않았다. 실제 Plan→파일→재개·격리 검증은 blocker이며 WOO-702 전체 수락 완료를 주장하지 않는다.
- App Server 0.153.4 schema에는 `turn/plan/updated`, `PlanThreadItem`, `item/plan/delta`가 있지만 별도 Plan 강제 옵션은 찾지 못했다. Plan collaboration mode와 default mode의 `update_plan` 명시를 모두 실측했다. 관측 item은 user/reasoning/assistant/command뿐이라 adapter가 실제 Plan을 버렸다는 증거는 없다.
- 대화형 TUI 화면은 실행하지 않았다. 재개 전후 Todo 표시, unknown model/agent 표현, 새 요청 전환의 사용자 인지는 WOO-701 표시 계약과 통합한 실제 TUI QA가 필요하다.
- WOO-703이 소유한 conflict/failure UX와 Monitor/Dashboard는 수정하지 않았다. Development Map/traceability 연결도 WOO-695 통합 범위라 이 worktree에서 새 원장을 만들지 않았다.
- commit, push, PR, Linear write는 수행하지 않았다.

## 파일 fingerprint

- `src/domain/todos.ts`: `de9cef16468ad92ad4a7982d60c94f44f825cc14474a614bb3d6eb5aabb1c3f7`
- `src/application/todo-ledger.ts`: `c20fc6fa9453444c0fd97a9f9349f8f18d7b9e36b35704260de6efc1b29b6bb3`
- `src/application/project-workbench.ts`: `a7f7830b658bbf5bacf9953646dfffa7f547e7dbd3a2d0aa47f8c6605d4756bd`
- `src/infrastructure/project-workbench-session.ts`: `9050cd6f18dc3d59589473cdca3d255b0dc90f13d4766842d35e4a58d348f5ed`
- `test/todos-domain.test.ts`: `4a79fa91669406c6a6638f4b2d1b5da309b4b013d5fd67e7ab1ed03fca9e54e2`
- `test/todo-ledger.test.ts`: `de290273cfb0ca9abaa05b61b822ed2901678ed2f99b551a02bd93af2a01b1c4`
- `test/todo-store.test.ts`: `e368e29d946108dce4bad9b80b2c1ba8dd2f4811829bc9073b0f5eba71c3b9d7`
- `test/project-workbench.test.ts`: `c5fd34f784ba67ff83899331050ef1b1d37b75a55eeb0ca700885219d84b115b`
- `test/project-workbench-session.test.ts`: `d41de6eafa075c094888c03c584f182b968a0cf904b33a637f5185b844d71716`
- `.www/scratchpad/2026-09-07-session-todo-native-qa.ts`: `aca449d9c4aabd6458699b519e44b070b12cdb440e869d73b0e2bdc4d49745db`

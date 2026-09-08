# Test1 입력 잠김 수정 검증

## 진단

실제 Test1 화면은 `working · Permission manual · 대기 2`와 Tool `RUNNING`을 표시했지만 승인 overlay는 없었다. 동일 root turn의 journal을 payload 원문 없이 identity/lifecycle만 대조한 결과 approval activity는 0개였다. Tool `exec-b3b0…`는 2026-09-01T22:35:02.513Z에 시작해 22:38:28.182Z에 완료됐고, turn은 22:39:39.083Z에 완료됐다. 따라서 이 사례는 pending approval이 아니라 약 206초 동안 tool terminal 결과를 받지 못한 장기 실행이었다.

원본 화면은 `../2026-09-07-test1-approval-stall/screen.txt`, 최소 journal 대조 결과는 `journal-diagnosis.json`에 있다. 실제 Test1 세션에는 입력·중단·승인 조작을 보내지 않았다.

## 변경 결과

- exact active root turn의 Tool 시작이 3분을 넘고 terminal이 없으면 `관측 단절 가능`과 `Esc 또는 /cancel 즉시 중단`을 표시한다. shell clock이 1초마다 다시 판정하므로 추가 native event가 없어도 전환된다.
- `chat.cancel`은 command queue와 journal event queue를 기다리지 않고 active turn에 전달된다. 이미 대기 중인 사용자 메시지 FIFO는 그대로 유지한다.
- approval 요청은 현재 root thread와 일치할 때만 pending으로 채택한다. 다른 thread의 같은 request shape은 overlay와 resolution 대상에 섞이지 않는다.
- 실제 pending approval overlay는 대상·이유·결정 선택지를 그대로 표시하고, Esc는 overlay를 닫은 뒤 현재 turn 중단을 즉시 전달한다.
- Dashboard 공통 배선은 refresh 전 선택한 sessionId를 새 정렬에서 다시 찾고, history read 실패 시 마지막 snapshot을 유지하며 오류 notice를 표시한다.

## 검증표

| 성공 기준 | 시나리오 | invocation | 이진 관측 | artifact |
|---|---|---|---|---|
| 실제 상태 구분 | Test1 root turn의 approval 수와 Tool start/completed, turn terminal을 journal에서 추출 | `jq -s … .www/runtime/activity/project-21bfdbceca5222a7a78f2bdb.jsonl` | target turn approval `0`, Tool started/completed 존재 | `journal-diagnosis.json` |
| stalled 표시 | exact thread/turn/item Tool을 180001ms 경과시켜 indicator 판정 | focused Bun test | `marks an exact root tool … PASS`, 승인 대기 문구 부재 | `focused-tests.log` |
| 즉시 cancel/FIFO | Tool journal append를 gate로 막은 채 cancel dispatch | focused Bun test | 50ms timeout 전 interrupt 1회, queue 내용 유지, PASS | `focused-tests.log` |
| approval thread 격리와 root approval 동작 | foreign thread approval 무시, root approval resolve 및 복수 FIFO 유지, overlay 결정 렌더 | focused Bun test | 관련 테스트 모두 PASS | `focused-tests.log` |
| Dashboard refresh 선택 identity | refresh reorder와 선택 세션 삭제를 순수 함수로 검사 | focused Bun test | identity 보존 및 clamp PASS | `focused-tests.log` |
| 관련 회귀 | shell policy, ProjectWorkbench, ApprovalOverlay 전체 | `bun test test/workbench-shell-policy.test.ts test/project-workbench.test.ts test/approval-overlay.test.ts --timeout 20000` | `139 pass`, `0 fail`, `657 expect()` | `focused-tests.log` |
| 타입 계약 | 전체 TypeScript 검사 | `bun run check` | exit 0 | `tsc.log` |
| compiled build | CLI entry를 임시 디렉터리에 Bun bundle | `bun build src/cli.ts --target=bun --outdir <temp>` | 2723 modules bundle, exit 0 | `build.log` |
| diff 형식 | 소유 파일 대상 whitespace 검사 | `git diff --check -- <owned files>` | PASS | `diff-check.log` |


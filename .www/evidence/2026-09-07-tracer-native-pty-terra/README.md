# WOO-705 Terra 실제 Native/PTTY 수락 관측

- 대상 HEAD: `d8835fa7b666fffb42cc802e689c2b2ca5ede9c4`
- 실행일: 2026-09-07 (Asia/Seoul)
- 경로: 실제 Codex App Server → `ProjectWorkbench` → `runProjectWorkbenchShell`
- 실행 모델: `gpt-5.6-sol`, low; ephemeral thread, 임시 cwd, read-only sandbox
- 판정: **BLOCKED** — 이 실제 실행은 Plan source/association을 만들지 않았다. fixture로 대체하지 않았다.

## 실제로 확인한 것

`01-plan-mode-80.txt`는 `/mode plan` 뒤의 `Plan 모드: 다음 요청부터 계획 중심으로 응답합니다.`를 표시한다. 이 뒤 첫 요청은 실제 Native thread/turn을 만들었고, `events.jsonl`에는 같은 thread/turn의 `turn/started`, userMessage, reasoning metadata, agentMessage, `turn/completed`/`completed`가 있다. `03-first-native-plan-80.txt`에는 모델의 `계획 완료` 응답이 보이며 `steps.json`의 마지막 exitCode는 0이다.

그러나 이 run의 JSONL에는 `turn/plan/updated`가 없고, 최종 snapshot의 `workFlow.source`는 null이며 steps는 빈 배열이다. itemId를 가진 activity와 current Plan association의 교집합도 없다. 따라서 exact activityId를 입력할 수 없었고 `/trace <activity-id>` 성공, 성공 후 Source 이동, 다른 turn에서 첫 activity를 골랐을 때의 `turn_mismatch`는 실행하지 않았다. 이 evidence는 그 빈칸을 fixture나 synthetic event로 메우지 않는다.

`/trace not-an-activity`는 80열에서 `Activity 선택 실패 (activity_not_found): not-an-activity`를 표시했고 Source 화면으로 이동하지 않았다. 40·80·120열 steps 모두 `sourceScreen: false`, `selectedActivityId: null`을 보존한다. 40열 notice는 화면 폭에 맞춰 말줄임되지만 80·120열 원문은 보인다.

## 산출물

- `native-pty-probe.ts`: 실제 App Server·Workbench·TUI 경로를 시작하고 public metadata만 state/JSONL에 기록하는 harness
- `run-native-pty.py`: PTY, 키 입력, resize, pyte 화면 해석 runner. worktree root에서 `uv run --with pyte==0.8.2 -- python .www/evidence/2026-09-07-tracer-native-pty-terra/run-native-pty.py`로 실행한다. 격리 설치 의존성은 Evidence에 복제하지 않는다.
- `events.jsonl`: refs, method, status, item type만 기록한다. reasoning item은 `textType: undefined`, 빈 contentTypes이며 숨은 reasoning 본문을 보관하지 않는다.
- `steps.json`, 화면 frame과 `terminal.ansi`: 실제 조작 결과
- `run-result.json`: 이 run의 두 blocker와 exitCode

## 제한

이 문서는 한 실제 fresh Plan-mode turn에서 source event가 없었다는 관측이다. provider가 다른 실행에서 Plan event를 내지 않는다는 일반 명제는 아니다. WOO-705의 successful trace/cross-turn Native 수락은 실제 `turn/plan/updated`와 association을 생성할 수 있는 source가 관측된 뒤 별도 실행해야 한다.

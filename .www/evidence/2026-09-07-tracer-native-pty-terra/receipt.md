# WOO-705 Terra Native/PTTY receipt

- 대상: PR44, `d8835fa7b666fffb42cc802e689c2b2ca5ede9c4`
- 방법: 실제 Codex App Server → ProjectWorkbench → Native TUI, ephemeral/read-only/PTY
- 결과: invalid `/trace not-an-activity`의 `activity_not_found`와 Source 이동 억제를 40/80/120열에서 확인
- 상태: **BLOCKED**

이 실제 Plan-mode turn은 Native `turn/plan/updated`, `workFlow.source`, Plan association을 만들지 않았다. 그러므로 exact activityId 성공, cross-turn `turn_mismatch`, successful trace의 폭 검증은 fixture로 대체하지 않고 미실행으로 남긴다. `run-result.json`, `events.jsonl`, `steps.json`, frames, `terminal.ansi`, harness와 source fingerprints를 같은 디렉터리에 보존한다.

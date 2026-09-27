## 변경

- 새 Workbench 세션은 Native 모델·MCP·Dashboard 준비 완료를 기다리지 않고 loading snapshot과 함께 반환하도록 변경했다.
- 재개 세션은 기존 thread lease 충돌과 durable 기록 복원을 반환 전에 확정하도록 동기 준비 계약을 유지했다.
- 느린 Native startup이 끝나면 기존 Workbench snapshot 구독을 통해 loading 화면이 ready 상태로 전환된다.

## 영향

- 실제 production 조립에서 첫 화면을 열 수 있는 시점이 10.98–12.53초에서 1.117초로 줄었다.
- 모델·MCP·Dashboard 준비는 11.585초에 완료되지만 첫 화면을 막지 않으며, --resume 안전 계약은 바뀌지 않는다.

## 분류

Fix · Improvement · Validation

## 검증

- production createProjectWorkbenchSession 실측: first-screen-ready 1117ms loading, background-ready 11585ms ready, MCP 12개.
- bun run check: 통과.
- bun test test/architecture.test.ts test/project-workbench-session.test.ts test/app-runtime-mode.test.ts: 44 pass, 0 fail, 3490 expect.
- 변경 TypeScript import normalization changed=0, table alignment misaligned=0, git diff --check 통과.
- 변경 파일의 TODO·test.skip·test.only 검사에서 미완료 표식이 발견되지 않았다.

## 연결

- Linear: WOO-674 · UUID 4674a1dc-ba01-4007-9803-3346a1f83dcc
- Parent: WOO-673
- Predecessor: .www/evidence/2026-09-26-welcome-octopus-removal/project-comment-candidate.json
- Evidence: .www/evidence/2026-09-26-first-screen-startup
- Code: src/adapters/outbound/workspace/project-workbench-session.ts · test/project-workbench-session.test.ts
- Branch: dev · HEAD 216b9d9faa09bcb19151f0f188792e8ce7113bf6 · uncommitted

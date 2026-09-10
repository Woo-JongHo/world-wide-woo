# 현재 Native Workbench smoke — 2026-09-10

Status: PASS

- 실행: `bun .www/evidence/2026-09-10-current-native-smoke/probe.ts`를 현재 worktree 소스와 실제 OAuth로 재실행
- 인증: `openai-codex` OAuth 연결 확인 (`bun src/cli.ts auth status`)
- 실제 provider/model: Codex App Server / `gpt-5.6-sol`, effort `low`
- 결과: thread `01a08a28-bdea-7761-ad07-77742c53435d`, `activeTurnId: null`, Workbench `ready`
- 관측: assistant `연결 확인`, activity 48건, timeout `false`
- 범위: 실제 Native → ProjectWorkbench → 현재 core projection. 승인·child delegation·재시작·PTY 조작은 이 smoke에서 실행하지 않았다.

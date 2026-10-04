## 변경

- WWW가 PATH의 구형 ChatGPT 번들 CLI 대신 프로젝트가 관리하는 Codex CLI 0.160.0을 우선 실행하도록 변경하고 버전 문자열을 0.0.24로 올렸다.
- 의존성 재설치 때 pi-tui 패치가 잘못 적용되는 문제를 패치 문맥 수정으로 복구했다.

## 영향

- 동일 계정의 Native model/list가 GPT-6.1 Sol을 반환하면 모델 선택 화면에 자동 반영한다. 현재 0.160.0에서 gpt-6.1-sol을 확인했다.
- 전체 테스트 90건 실패와 필수 Claude Opus 감사 한도 때문에 0.0.24 커밋·푸시는 보류했다.

## 분류

Fix · Improvement · Validation

## 검증

- 깨끗한 bun install 뒤 실제 WWW CodexAppServer.listModels에서 gpt-6.1-sol을 확인했다.
- 집중 테스트 13개, bun run check, bun run build, 아키텍처 테스트 17개, 가독성 검사와 git diff --check 통과.
- 전체 bun test: 1607 pass, 90 fail, 2 errors. Claude Opus 감사: 주간 한도 초과로 미실행.

## 연결

- [WOO-674](https://linear.app/woo-world/issue/WOO-674/workbench-대화와-계획을-읽고-입력과-상태를-통제한다) — 모델 선택을 포함한 Workbench 상위 책임
- .www/evidence/2026-10-04-gpt61-model-catalog
- src/adapters/outbound/execution/codex-app-server-transport.ts · test/codex-binary-selection.test.ts · package.json · bun.lock

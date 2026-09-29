## 변경

- package.json 버전을 0.0.21에서 0.0.22로 갱신하고 CLI 로딩·--version, Codex App Server handshake, Workbench 환영 화면의 테스트 기대값을 맞췄다.

## 영향

- 단일 PRODUCT_VERSION 정본을 읽는 사용자 표시와 연결 정보가 0.0.22를 가리킨다.
- 전체 회귀 실패가 남아 있어 0.0.22를 수락된 기능 릴리스나 게시 완료로 판정하지 않는다.

## 분류

Improvement · Validation

## 검증

- npm run check 및 git diff --check 통과.
- bun test test/cli.test.ts test/codex-app-server.test.ts test/workbench-welcome.test.ts: 39 pass, 0 fail.
- 첫 전체 bun test: 1599 pass, 13 fail, 1612 tests. 버전 관련 기대값 갱신 뒤 전체 재실행은 아직 하지 않았다.

## 연결

- Linear: WOO-912 · 기존 버전 표기 작업 결속(로컬 기록 기준)
- Evidence: .www/evidence/2026-09-28-version-0.0.22
- Branch: dev · HEAD 8486a759746ab2e0748beb1ab9fdd4d250fa6b27 · uncommitted

## 변경

- package 버전을 0.0.18에서 0.0.19로 승격해 CLI와 Native App Server가 공유하는 PRODUCT_VERSION 정본에 반영했다.
- Astra 로딩 화면과 Workbench 환영 화면에 같은 정본의 v0.0.19를 표시했다.
- 커밋·작업 기록 훅과 release:gate를 실행·검사해 현재 자동 버전 승격 규칙이 없고 일반 릴리스 게이트는 별도 Evidence와 hygiene을 검사한다는 경계를 확인했다.

## 영향

- 사용자는 실행 직후 현재 WWW 버전을 확인할 수 있고 --version 및 Native handshake와 화면 표기가 같은 값을 사용한다.
- 0.0.19 코드 반영은 검증됐지만 일반 릴리스 게이트는 기존 TODO 표식과 ST-011-12·ST-011-13 BLOCKED Evidence 때문에 아직 차단 상태다.

## 분류

Feature · Improvement · Validation

## 검증

- bun test test/cli.test.ts test/workbench-welcome.test.ts test/codex-app-server.test.ts: 38 pass, 0 fail.
- bun run check 통과; architecture와 release-gate 대상 테스트 17 pass, 0 fail; platform-check 통과.
- 변경 범위 TODO·test.skip·test.only 없음. 일반 bun run release:gate는 test/obsidian-contract.test.ts TODO와 ST-011-12·ST-011-13 BLOCKED로 exit 1을 반환했다.

## 연결

- Linear: https://linear.app/woo-world/issue/WOO-912
- Package: 0.0.19
- Evidence: .www/evidence/2026-09-24-version-0.0.19

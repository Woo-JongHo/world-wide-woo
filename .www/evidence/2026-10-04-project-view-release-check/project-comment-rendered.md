## 변경

- Project View의 새 구조 맵·근거 맵 탐색 이름에 맞춰 최상위 탐색 Playwright 테스트를 고쳤다.
- 현재 TUI 소스에서 기능 지도를 재생성하고 19개 기능의 지도 정합을 확인했다.

## 영향

- Project View의 구조·근거·Database 세 최상위 화면이 실제 탐색과 현재 페이지 표시로 검증된다.
- Project View 독립 검증은 통과했지만 루트 전체 테스트 실패는 별도 미완료 상태로 유지한다.

## 분류

Fix · Validation

## 검증

- bun run project-view:check와 project-view:build 통과, project-view:test 21 pass.
- bun run feature-map:build 후 feature-map:check에서 19개 기능 current 확인, npm run check와 git diff --check 통과.
- 루트 전체 bun test는 직전 실행에서 1607 pass, 90 fail, 2 errors였으며 이 Project View 수정 뒤 재실행하지 않았다.

## 연결

- apps/project-view/tests/navigation.spec.ts · docs/features/FEATURE_MAP.md
- .www/evidence/2026-10-04-project-view-release-check
- Project View의 독립 브라우저 capability에 일치하는 기존 WOO 이슈는 현재 프로젝트 조회에서 확인되지 않았다.

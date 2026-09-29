## 변경

- 구독 HUD의 7d·5h 행에서 Kitty 로고가 서로 다른 이미지 ID를 사용하게 해 첫 행 로고가 두 번째 행에 덮이지 않도록 수정했다.
- 로고 칸과 잔여 비율 사이의 빈 배경 셀을 제거해 색칠된 수치 영역이 로고 바로 뒤에서 시작하게 했다.

## 영향

- 각 공급자의 두 기간 행 모두에서 로고와 잔여 비율·초기화 시간이 같은 순서로 보인다.

## 분류

Fix · Validation

## 검증

- bun test test/www-provider-meter-fidelity.test.ts test/www-provider-logos.test.ts: 5 pass, 0 fail. 두 행의 로고 8개가 고유 이미지 ID를 사용하는지 확인했다.
- bun run check와 git diff --check 통과. 변경 파일에서 TODO·test.skip·test.only 검색 결과 없음.

## 연결

- Linear: WOO-912 https://linear.app/woo-world/issue/WOO-912/workbench-ui-모드모델계획구독-잔여-표기를-정리한다
- Code: src/adapters/inbound/tui/features/usage/view/www-usage.ts · test/www-provider-logos.test.ts
- Evidence: .www/evidence/2026-09-29-hud-logo-row-placement

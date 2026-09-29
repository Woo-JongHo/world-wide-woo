## 변경

- 구독 HUD를 7d overall과 5h session 두 행으로 분리해 서로 다른 잔여율을 각각 표시한다.
- 네 공급자의 막대 폭을 제한하고 아이콘을 바 안의 어두운 칸에 배치해 밝은 채움색과 구분한다.
- 80열에서는 Antigravity 이름을 Gemini로 축약해 로그인 상태를 표시한다.

## 영향

- 여러 구독을 위한 가로 공간을 남기면서 전체 한도와 5시간 세션 한도가 사라지지 않는다.
- 공급자 아이콘이 바 안에서 보이고 채움색에 묻히지 않는다.

## 분류

Fix · Validation

## 검증

- bun test test/www-provider-meter-fidelity.test.ts test/www-provider-logos.test.ts test/www-ui.test.ts: 98 pass, 0 fail.
- bun run check: 통과.
- git diff --check: 통과.
- 전체 bun test: 1633 pass, 12 fail. 릴리스 수락은 보류한다.
- Live Linear read-back 2026-09-28: WOO-912 is In Progress in World Wide Woo under WOO-674.

## 연결

- Linear: WOO-912 https://linear.app/woo-world/issue/WOO-912/workbench-ui-모드모델계획구독-잔여-표기를-정리한다 (live read-back 2026-09-28; In Progress)
- Evidence: .www/evidence/2026-09-28-provider-hud-two-window-repair

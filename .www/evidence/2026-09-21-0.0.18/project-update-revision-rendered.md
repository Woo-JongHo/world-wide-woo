# 0.0.18

## 전달 기능

- 사용자는 /theme으로 Gruvbox·Tokyo Night를 전환하고 cached transcript·syntax highlight가 새 색으로 다시 그려지는 것을 확인한다.
- 입장 Dashboard에서 Linear의 최신 Project Activity Comment를 읽고 ACTIVITY 구획의 작성자·경과·요약을 확인한다.
- WWW 첫 화면에서 Plan 중심 상태·Queue placeholder·bounded terminal output·provider 구독 잔여 HUD와 동일질량 라그랑주 정삼각형 원형해 애니메이션을 확인한다.

## 함께 반영

- Plan·Todo·Tracer 정보 계층, provider 표시, 좁은 폭 레이아웃과 Queue/steer 입력 전달을 함께 정리했다.
- Comment 조회 실패 시 기존 Linear Dashboard를 유지하고, 삼체 계산은 G=1·m=1·R=1 정규화의 닫힌 원형해와 결정적 narrow-width projection으로 제한했다.
- 렌더 캐시 무효화·terminal tail 경계·provider logo·화면 폭·9행 삼체 캔버스 회귀 테스트를 현재 production layout 계약에 맞췄다.

## 검증

- bun run check 통과
- bun test: 1312 pass, 0 fail, 16851 assertions, 146 files
- 삼체·환영·Astra 대상 회귀: 62 pass, 0 fail, 1296 assertions
- git diff --check 통과 및 bun src/cli.ts --version → 0.0.18
- bun build src/cli.ts --compile --outfile dist/www-0.0.18 통과, arm64 Mach-O와 --help 출력 확인
- 미검증: 실제 사용자 수동 화면 수락과 Git commit/tag/push는 아직 수행하지 않았다.

## 작업 Comment

- 60397261-ebba-4620-ab47-41570f4a872e
- a5853135-2921-4b6d-b35d-d501d59d61be
- 7c2cd97d-d51b-4cca-906c-cfec0c1a4e91
- 769e9b2d-4fc7-44fe-8ae1-61a5df3aa793
- 48bd0853-1220-4ae1-b18a-f5223e34880c
- cad53592-6d1e-467e-be6d-86f052dc7340

## 연결

- Linear: WOO-912
- Branch: ui/workbench-visual-polish
- Package: 0.0.18
- Artifact: dist/www-0.0.18
- Evidence: .www/evidence/2026-09-21-0.0.18
- Research: docs/research/2026-09-21-three-body-special-solutions.md

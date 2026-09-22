## 변경

- 기존 figure-eight RK4 투영을 동일질량 라그랑주 정삼각형 원형해로 교체했다.
- 각 입자는 G=1·m=1·R=1 정규화에서 같은 원을 돌고, 입자 사이의 위상 차이는 120°로 유지된다.
- Y축 캔버스를 6행에서 9행으로 늘리고 희미한 원형 가이드와 최근 궤적을 함께 표시한다.

## 영향

- G=1은 중력상수를 실제 단위가 아닌 1로 정규화했다는 뜻이며, 화면의 시간·거리 스케일을 결정하는 기준값이다.
- 터미널에서 세 점이 한 정삼각형을 유지한 채 공통 중심을 도는 구조가 보이고, 작은 화면에서도 Y축 움직임이 눌리지 않는다.

## 분류

Feature · Improvement · Validation

## 검증

- 삼체·환영·Astra 대상 회귀: 62 pass, 0 fail, 1296 assertions
- 전체 테스트: 1312 pass, 0 fail, 16851 assertions, 146 files
- bun run check 통과 및 git diff --check 통과
- bun build src/cli.ts --compile --outfile dist/www-0.0.18 통과
- ./dist/www-0.0.18 --version → 0.0.18 및 arm64 Mach-O 확인

## 연결

- Linear: WOO-912
- Branch: ui/workbench-visual-polish
- Package: 0.0.18
- Artifact: dist/www-0.0.18
- Evidence: .www/evidence/2026-09-21-0.0.18
- Research: docs/research/2026-09-21-three-body-special-solutions.md

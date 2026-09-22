## 변경

- 원형 좌표 데모를 12개 상태값의 뉴턴 중력 ODE와 Velocity Verlet 적분을 사용하는 동일질량 Figure-8 해로 교체했다.
- 2×4 Unicode Braille 궤적과 A·B·C 물체, 에너지·드리프트·운동량·각운동량·상태표를 표시하는 /three-body 전체 화면 실험실을 추가했다.
- Space 일시정지, R 초기화, +/- 속도, T 궤적, Q/Esc 복귀와 화면 수명주기를 Astra shell에 연결했다.

## 영향

- 사용자는 첫 WWW 화면에서 실제 적분된 Figure-8을 보고 /three-body에서 터미널 공간을 넓게 쓰는 비선형 삼체 시뮬레이션을 조작할 수 있다.
- G=1은 무차원 정규화임을 화면과 문서에서 설명하며, 물리 엔진과 TUI renderer를 분리해 다른 언어 엔진으로 교체 가능한 경계를 유지한다.

## 분류

Feature · Improvement · Fix · Validation

## 검증

- 삼체 물리·Braille·Lab·환영·Astra·아키텍처 집중 테스트 99 pass, 0 fail
- 전체 회귀 1315 pass 후 모델 설정 기대값 수정 및 8MiB 캐시 스트레스 2건 단독 재검증 통과
- bun run check와 git diff --check 통과
- dist/www-0.0.18 재빌드, Mach-O arm64·--version 0.0.18·--help 실행 확인
- 미검증: 실제 사용자 수동 화면 수락과 Git commit/tag/push

## 연결

- Linear: WOO-912
- Branch: ui/workbench-visual-polish
- Package: 0.0.18
- Artifact: dist/www-0.0.18
- Evidence: .www/evidence/2026-09-21-0.0.18
- Research: docs/research/2026-09-21-three-body-special-solutions.md

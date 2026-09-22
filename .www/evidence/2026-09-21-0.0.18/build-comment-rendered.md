## 변경

- 0.0.18 소스를 Bun compile로 macOS Apple Silicon arm64 실행 파일 dist/www-0.0.18로 빌드했다.
- 기존 dist/www 0.0.15는 덮어쓰지 않고 보존했으며 새 산출물은 gitignored dist/ 아래에 둔다.

## 영향

- 다른 환경에서 별도 빌드 없이 dist/www-0.0.18을 실행해 Workbench UI를 테스트할 수 있다.
- 이 바이너리는 현재 머신과 같은 macOS arm64 환경용이며 Intel·Linux에서는 해당 환경에서 재빌드해야 한다.

## 분류

Validation · Operation

## 검증

- bun build src/cli.ts --compile --outfile dist/www-0.0.18 통과
- 생성물 file 확인: Mach-O 64-bit executable arm64
- ./dist/www-0.0.18 --version → 0.0.18
- ./dist/www-0.0.18 --help 정상 출력

## 연결

- Linear: WOO-912
- Branch: ui/workbench-visual-polish
- Package: 0.0.18
- Artifact: dist/www-0.0.18
- Evidence: .www/evidence/2026-09-21-0.0.18

# 0.0.18 릴리스 후보 근거

status: PASS

## 전달 범위

- `/theme`으로 Gruvbox·Tokyo Night를 전환하고 cached transcript가 즉시 다시 그려진다.
- Plan 세부와 Queue 입력 placeholder, bounded terminal tail, provider 구독 HUD를 한 Workbench 흐름으로 표시한다.
- WWW 환영 화면에 실제 적분된 동일질량 Figure-8 궤도를 표시하고, `/three-body` 전체 화면 실험실에서 조작한다.
- 입장 Dashboard가 Linear의 최신 Project Activity Comment를 읽어 `ACTIVITY`에 bounded preview로 표시한다.

## 검증

- `bun run check` 통과
- 전체 회귀 실행: 1315 pass; 모델 기대값 수정 뒤 해당 4/4 통과, 8MiB 캐시 스트레스 2건 단독 통과
- 대상 회귀: 삼체 물리·Braille·Lab·환영·Astra·아키텍처 99 pass, 0 fail
- `git diff --check` 통과
- `bun src/cli.ts --version` → `0.0.18`
- `bun build src/cli.ts --compile --outfile dist/www-0.0.18` 통과 및 arm64 실행 확인
- Comment 조회 실패 시 기존 Linear Dashboard를 유지하는 fallback 테스트 통과
- Linear Comment 게시 read-back: `769e9b2d-4fc7-44fe-8ae1-61a5df3aa793`
- Linear build Comment 게시 read-back: `48bd0853-1220-4ae1-b18a-f5223e34880c`
- Linear circular-orbit Comment 게시 read-back: `cad53592-6d1e-467e-be6d-86f052dc7340`
- Linear Figure-8 Lab Comment 게시 read-back: `187d0883-9013-4bcd-b11a-fc8d33343a26`
- Linear Project Update 게시 read-back: `864ec8bd-eff1-47fe-81fb-4062b1f06681` (`atRisk`)

## 남은 범위

- 실제 사용자의 여러 터미널 크기·색상 환경에서 수동 화면 수락은 아직 별도 확인하지 않았다.
- Git commit·tag·push는 아직 수행하지 않았다.

## 연결

- Linear: WOO-912
- Branch: `ui/workbench-visual-polish`
- Package: `0.0.18`
- Evidence: `.www/evidence/2026-09-21-0.0.18`
- Research: `docs/research/2026-09-21-three-body-special-solutions.md`
- Comment Receipt: `.www/evidence/2026-09-21-0.0.18/project-comment-receipt.json`
- Update Receipt: `.www/evidence/2026-09-21-0.0.18/project-update-receipt.json`
- Build Comment Receipt: `.www/evidence/2026-09-21-0.0.18/build-comment-receipt.json`
- Circular Orbit Comment Receipt: `.www/evidence/2026-09-21-0.0.18/orbit-comment-receipt.json`
- Project Update Revision Receipt: `.www/evidence/2026-09-21-0.0.18/project-update-revision-receipt.json`
- Figure-8 Lab Comment Receipt: `.www/evidence/2026-09-21-0.0.18/figure-eight-lab-comment-receipt.json`

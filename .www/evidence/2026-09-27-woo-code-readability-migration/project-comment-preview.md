## 변경

- woo-code-readability의 범용 SKILL.md, references, scripts, fixtures와 30개 도구 테스트를 형제 standalone 저장소 woo-readability로 이관했다.
- 99_www 프로젝트 경로와 Codex 전역 경로를 standalone 정본의 symlink로 전환하고, Codex 구본은 타임스탬프 백업으로 보존했다.
- WWW 전용 Receipt·승인·검사자 흐름은 제품 저장소에 남기고, WWW의 기존 전체 도구 테스트는 standalone 테스트와 2개 연결 통합 테스트로 분리했다.

## 영향

- 동명 스킬 사본이 서로 다른 규칙과 존재하지 않는 스크립트 경로를 제공하던 drift가 제거됐다.
- Codex와 99_www가 같은 실제 디렉터리와 같은 SKILL.md 해시를 읽으며, 다른 에이전트도 install.sh를 통해 같은 원본에 연결할 수 있다.
- npm·GitHub·OMP marketplace 공개와 Claude·ZCode·Pi 전역 연결은 이번 작업에서 수행하지 않았다.

## 분류

Improvement · Refactor · Validation · Operation

## 검증

- standalone 최종 위치에서 bun test: 30 pass, 0 fail, 255 expect() calls.
- 99_www의 symlink 소비 경계에서 2 pass, 0 fail, 4 expect() calls; 변경 테스트 파일은 import changed=0, table misaligned=0.
- quick_validate, install.sh 구문, git diff --check, 두 발견 경로 realpath·SHA-256 일치, Receipt digest 검증을 통과했다.
- 현재 세션에 linear-woo 도구가 없어 최신 Activity 중복 조회와 게시 read-back은 수행하지 않았다. 게시 직전 재조회와 사용자 승인이 필요하다.

## 연결

- Linear: WOO-911 · UUID b00b02eb-2d80-4b10-9c9a-a29db4f1a74d
- Standalone: /Users/jonghoPro/woo/00_project/woo-readability
- Evidence: .www/evidence/2026-09-27-woo-code-readability-migration
- Research: docs/research/2026-09-26-woo-code-readability-omp-distribution.md
- Branch: dev · HEAD 216b9d9faa09bcb19151f0f188792e8ce7113bf6 · uncommitted

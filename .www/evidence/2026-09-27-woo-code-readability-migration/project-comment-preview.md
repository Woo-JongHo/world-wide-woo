## 변경

- 99_www의 woo-code-readability symlink를 제거하고 70개 파일의 제품 로컬 Skill 디렉터리로 전환했다.
- 98_Plugin은 배포용 Skill 저장소로 별도 유지하고 Codex 전역 설치는 그 플러그인을 계속 가리키게 했다.
- WWW 통합 테스트가 서로 다른 realpath와 현재 디렉터리 내용 동일성을 함께 검증하도록 교정했다.
- TypeScript 연속 호출문을 call-statements 표로 등록해 호출 대상·matcher 괄호, matcher 점, 종결 세미콜론과 우측 주석 열을 정렬한다.
- TypeScript 객체 배열은 여는·닫는 중괄호, 위치별 속성·콜론·값·쉼표와 행 꼬리를 object-rows 축으로 정렬하며 마지막 속성 trailing comma도 보존한다.

## 영향

- 제품 저장소와 배포 플러그인이 서로 다른 변경 주기와 책임으로 관리된다.
- 현재 규칙·스크립트·fixtures는 두 저장소에서 byte 단위로 같고 이후 drift는 통합 테스트가 탐지한다.
- 복사본의 자동 덮어쓰기는 하지 않으며 어느 쪽 변경을 반영할지는 각 저장소 관리자가 결정한다.

## 분류

Improvement · Refactor · Validation · Operation

## 검증

- 98_Plugin에서 bun test: 106 pass, 0 fail, 386 expect() calls.
- 99_www 통합 경계에서 2 pass, 0 fail, 8 expect() calls; 두 Skill의 diff -qr 출력은 비어 있다.
- 99_www Skill quick_validate, 변경 테스트의 import changed=0 및 table misaligned=0을 확인했다.
- 현재 세션에 linear-woo 도구가 없어 게시 직전 Activity 재조회와 사용자 승인이 필요하다.

## 연결

- Linear: WOO-911 · UUID b00b02eb-2d80-4b10-9c9a-a29db4f1a74d
- Plugin: /Users/jonghoPro/woo/00_project/98_Plugin · Product Skill: .agents/skills/woo-code-readability
- Evidence: .www/evidence/2026-09-27-woo-code-readability-migration
- Research: docs/research/2026-09-26-woo-code-readability-omp-distribution.md
- Branch: dev · HEAD 216b9d9faa09bcb19151f0f188792e8ce7113bf6 · uncommitted

## 변경

- 현재 woo-code-readability의 규칙 문서, TypeScript AST/LSP 도구, fixtures, WWW 전용 운영 계약을 조사해 배포 경계를 정리했다.
- Oh My Pi 공식 extension loading, skill package, marketplace 계약을 대조해 첫 배포는 상주 extension 없이 얇은 OMP skill과 독립 CLI로 구성하는 안을 제안했다.
- 공개 인터페이스를 check, write, explain 세 명령으로 제한하고 WWW Receipt와 에이전트 교대 규칙은 저장소 어댑터에 남기는 구조를 문서화했다.
- GitHub marketplace와 npm CLI를 병행하고, OMP 생명주기 이벤트가 실제로 필요해질 때만 runtime extension을 추가하는 출시 순서를 제안했다.

## 영향

- WOO-911의 검사기 구현과 WWW 운영 정책을 분리해 오픈소스 배포 범위를 판단할 수 있는 근거가 생겼다.
- 이번 결과는 구현이나 채택된 제품 계약이 아니라 배포 설계 제안이며, 패키지 생성과 외부 출시는 아직 수행하지 않았다.

## 분류

Improvement · Validation

## 검증

- 로컬 woo-code-readability 디렉터리 216 KB와 스크립트 import, Bun·typescript/unstable 결합, WWW 전용 경로를 실측했다.
- OMP 공식 저장소의 extension authoring, extension loading, marketplace authoring 문서로 skill-only 배포와 GitHub marketplace 설치 계약을 확인했다.
- 연구 문서에서 TODO, TBD, test.skip, test.only가 발견되지 않았고 파일 생성 상태를 read-back했다.
- 현재 세션에 linear-woo 도구가 없어 최신 Project Activity는 같은 날 성공한 마지막 로컬 read-back e781ff90-faed-4c2b-b3bb-b17ecabb36fb를 사용했다. 게시 직전 실시간 재조회가 필요하다.

## 연결

- Linear: WOO-911 · UUID b00b02eb-2d80-4b10-9c9a-a29db4f1a74d
- Report: docs/research/2026-09-26-woo-code-readability-omp-distribution.md
- Evidence: .www/evidence/2026-09-26-woo-readability-omp-distribution
- Branch: dev · HEAD 216b9d9faa09bcb19151f0f188792e8ce7113bf6 · uncommitted

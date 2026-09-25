## 변경

- 단일 named import는 항상 한 줄, 다중 import는 표시 폭 120 이하만 한 줄, 긴 import는 } from을 같은 행에 두도록 정규화기를 수정하고 484개 TypeScript에 적용했다.
- 연속 한 줄 import의 from 열과 선언 표의 콜론·종결 세미콜론을 맞췄다.
- AST-safe 표 정렬기와 주석·attributes·CRLF·혼합 종결자 fail-close 회귀 테스트를 추가했다.
- Opus가 발견한 초기 출력의 누락 세미콜론 265개를 복구했다.
- 제품 인터페이스 20개 파일의 압축 멤버를 한 행씩 풀고, 기존 연속 선언의 = 경계를 120열 이하 표에 적용했다.

## 영향

- 단일 import가 불필요하게 여러 줄로 내려가거나 from이 별도 행으로 밀리는 선언 불일치를 제거했다.
- 조건식·for 헤더·실행 블록은 제외하고 같은 역할의 안전한 표만 정렬한다.

## 분류

Refactor · Fix · Validation

## 검증

- Import 전수 검사: 484 files, changed 0, errors 0; 세미콜론 없는 named from-import 0건.
- Readability 도구: 23 pass, 0 fail, 121 assertions; 압축 인터페이스 게이트와 = 경계 fixture 통과.
- TypeScript noEmit, architecture 13/13, git diff --check 통과.
- 전체 회귀: 1487 pass, 0 fail, 19251 assertions, 173 files.
- Claude Opus 재감사: 코드 항목 1–4 confirmed.

## 연결

- Linear: WOO-911 · UUID b00b02eb-2d80-4b10-9c9a-a29db4f1a74d
- Report: docs/audit/2026-09-24-readability-import-columns.md
- Evidence: .www/evidence/2026-09-24-readability-import-columns
- Commit: 868ce9bb15231d47650cb67f2704b2ce8507f313 · Readability 도구 8개 경로 · origin/dev push 확인
- Branch: dev · 제품 코드 전체 적용분은 다른 기능 변경과 겹쳐 아직 uncommitted

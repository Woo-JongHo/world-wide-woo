## 변경

- Readability 스킬에 STEP0 import 선언 정규화와 전용 검사기를 추가했다.
- 값과 type specifier가 섞인 import를 분리하고 120열 초과 named import와 선언부별 from 열을 통일했다.
- src와 test의 TypeScript 482개 파일을 기계적으로 정규화했다.
- Opus 반박 감사 세 차례에서 찾은 주석·side-effect·템플릿·UTF-16·숫자 식별자·CRLF·attributes 경계 결함을 수정하고 fixture로 고정했다.

## 영향

- 선언문이 파일마다 달라지는 문제를 전수 검사에서 재현 가능하게 차단한다.
- 지원하기 어려운 주석 포함 혼합 import는 손상시키지 않고 파일별 오류로 보고한다.

## 분류

Improvement · Refactor · Validation

## 검증

- Import 정규화 전수 검사: 482 files, changed 0, errors 0.
- Readability 도구 테스트: 15 pass, 0 fail, 69 assertions.
- TypeScript noEmit과 git diff --check 통과.
- 최종 전체 회귀: 1459 pass, 0 fail, 19122 assertions, 171 files.
- Claude Opus 5 최종 재게이트: APPROVE, blocking/high 잔여 0건.

## 연결

- Linear: WOO-911 · UUID b00b02eb-2d80-4b10-9c9a-a29db4f1a74d
- Code: .agents/skills/woo-code-readability/scripts/typescript/00_normalize-imports.ts
- Evidence: .www/evidence/2026-09-24-readability-import-declarations
- Branch: dev · HEAD ca775998641d284738cd87c50d2593f689b6c86c · uncommitted

당신은 99_www(WWW TUI, TypeScript/Bun) 저장소의 독립 검토자다. 읽기 전용으로만 작업하고 파일을 수정하지 마라. Linear·Obsidian 게시나 기록도 하지 마라.

먼저 `AGENTS.md`, `docs/workflows/FEATURE_IMPLEMENTATION_CONTRACT.md`, `.agents/skills/woo-feature-template/SKILL.md`를 읽어라. `.www/runtime`, `.www/sessions`, `.www/scratchpad`는 탐색하지 마라.

이것은 재검토다. 직전 검토(아래 원문 위치)가 `scripts/reorder-sections.ts`의 줄 단위 구현에서 P2 6건·P3 1건을 재현했다. 그에 따라 도구를 TypeScript 7 AST(`typescript/unstable/async` API의 `source.statements`)를 쓰는 구현으로 다시 작성했다. 직전 검토 원문: `.www/evidence/2026-10-03-feature-template-types/astra-review-types-result.md`.

## 검토 대상

- `scripts/reorder-sections.ts`: 최상위 문장을 AST 범위(full start ~ end, 같은 줄 끝 주석 포함)로 잘라 문장 단위로만 재배치한다. 역할은 AST 노드 종류·export 수정자로 정하고, `typeof` 판정은 TypeQuery 노드 존재로 한다. 쓴 뒤 다시 파싱해 문장 순서가 계획과 다르면 원본으로 복원한다.
- `test/reorder-sections.test.ts`: 직전 반례 7개(타입 뒤 실행문, 템플릿 안 선언 모양, 템플릿 빈 줄, 정규식 `}`·여러 줄 나눗셈, 시그니처 객체 타입, 데코레이터, 연속 줄 `typeof`·주석·문자열 `"typeof"`)를 테스트로 고정했다.
- `scripts/feature-map.ts`의 `typeOrderFindings`: 이제 도구와 같은 `plan("types")`로 계산한다. `test/feature-map.test.ts`.
- 동등성 증거: `.www/evidence/2026-10-03-feature-template-types/parity-check.ts` — 앞서 적용한 결과와 최상위 문장 순서가 같은지 확인(함수 이동 48개 사본, 타입 이동 11개 사본, 차이 0).
- 스킬 4단계의 도구 문구.

## 요청

한국어로 답하고 근거는 `파일:줄`로 대라. 추측은 추측이라고 표시하라. 필요하면 `bunx tsc --noEmit`, `bun test <파일>`, 임시 디렉터리의 입력 파일로 도구 함수 실행을 해도 된다.

1. 직전 7건이 실제로 해소됐는지 판정하라.
2. 새 구현의 결함을 P1/P2/P3로 찾아라: 같은 줄에 문장 여러 개, 파일 첫 줄 주석·shebang·`"use strict"`, CRLF, 끝 주석 뒤 코드, `export default`, `declare`·overload 묶음(본문 없는 시그니처가 본문 있는 구현과 떨어지는 경우), namespace/enum, 빈 파일, 다시 파싱 실패 시 복원 경로, API 세션 누수.
3. 마지막에 "바로 고칠 것 / 결정이 필요한 것 / 문제없음" 3줄로 요약하라.

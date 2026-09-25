## 변경

- 06_align-tables.ts에 표 종류 등록부를 연결하고 method-signature, type-alias, declaration-equals, registration, enum-member, case-clause를 포함한 종류별 축 진단·정렬을 고정했다.
- gap 축은 최소 한 칸을 남기고 insert 축은 기존 열을 보존하도록 분리했으며, 압축된 interface 멤버는 자동 확장하지 않고 fail closed로 남긴다.
- readability-contract.md와 typescript-grid-template.md에 작성 시 축 계약과 종류별 예시를 추가하고, SKILL.md와 AGENTS.md에 두 문서·검사기 일치 절차를 연결했다.
- table-kinds.ts fixture와 code-readability-tools.test.ts에 등록부 감지·정렬·idempotence·--explain·문서 동기화 회귀를 추가했다.
- development-store.ts의 제품 표본 정렬과 render-scheduler.ts·astra-monitoring-layout.test.ts의 순수 줄맞춤을 같은 Readability stage 후보로 묶어 전체 파일 경계를 보장했다.

## 영향

- 새 표 종류를 추가할 때 감지 문법, 정렬 축, 작성 예시, 회귀 fixture를 한 등록부에서 대조할 수 있다.
- 작성 시점의 열 관습과 06_align-tables.ts의 측정 결과가 어긋나면 테스트가 실패하므로 문서 예시가 검사기와 분리되어 drift하는 경로를 줄인다.
- 제품 동작과 공개 API는 바꾸지 않고 코드 가독성·검증 절차만 확장한다.

## 분류

Improvement · Refactor · Validation

## 검증

- bun run check 통과.
- bun test test/code-readability-tools.test.ts — 27 pass, 0 fail, 221 expect.
- bun test test/development-store.test.ts — 7 pass, 0 fail, 34 expect.
- bun test — 1491 pass, 0 fail, 19354 expect, 173 files.
- git diff --cached --check 통과; Readability 후보 132개 경로는 full-file stage·digest 검증을 통과했고 Workbench·증적 변경은 별도 후보로 분리했다.
- WOO-911 본문과 World Wide Woo Project Activity를 2026-09-25에 재조회했으며, 최신 Comment ID는 1196a23e-1f9f-4bff-b6c8-83f5a1a4e5ab이고 이 Candidate는 아직 게시하지 않았다.

## 연결

- Linear: WOO-911 · UUID b00b02eb-2d80-4b10-9c9a-a29db4f1a74d
- Evidence: .www/evidence/2026-09-24-woo-code-readability-maintain-registry
- Code: .agents/skills/woo-code-readability/scripts/typescript/grid-kinds.ts · 06_align-tables.ts
- Policy: AGENTS.md · Branch dev · HEAD 868ce9bb15231d47650cb67f2704b2ce8507f313 · uncommitted

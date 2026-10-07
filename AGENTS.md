# World Wide Woo 프로젝트 규칙

## 작업 진입

- 작업 시작·재개 시 [woo-entry](.agents/skills/woo-entry/SKILL.md)로 저장소 위치·브랜치·기존 변경을 확인한다.
- 2026-10-07 사용자 결정에 따라 Linear·WES·Obsidian 작업 관리 연결과 강제 기록 절차를 사용하지 않는다. 설계와 결정은 `docs/`, 구현은 Git, 검증 증거는 로컬 Evidence에 남긴다. 과거 기록은 현재 작업의 게시 의무가 아니다.

## 코드 구조

- 모듈을 생성·이동하거나 의존 경계를 수정할 때는 [LAYERS.md](LAYERS.md)를 읽고 `core / adapters` 정본과 아키텍처 게이트를 적용한다.
- TUI 기능을 새로 만들거나 기존 기능을 같은 형식으로 정리할 때는 [woo-feature-template](.agents/skills/woo-feature-template/SKILL.md)로 [Feature Implementation Contract](docs/workflows/FEATURE_IMPLEMENTATION_CONTRACT.md)의 장·절 순서를 적용하고, 단계마다 Codex Astra 독립 검토를 받는다.
- 제품·테스트 TypeScript를 작성하거나 반복 블록을 고칠 때는 [woo-code-readability](.agents/skills/woo-code-readability/SKILL.md)의 작성 시 축 계약([readability-contract.md](.agents/skills/woo-code-readability/references/readability-contract.md))대로 쓴다. 완료 전에 `00_normalize-imports.ts` 검사와 `06_align-tables.ts --file <대상 파일>` 검사를 통과해 증명한다.

## 산출물 위치

- 사람이 다시 읽는 문서(연구·설계·분석·감사 결과)는 `docs/`에 둔다. `.www` 숨김폴더는 제어·기록 평면이므로 새 문서를 만들지 않는다.
- 검증 증거·필요한 Receipt는 `.www/evidence/`에 둔다. 실행 계획은 Native PLAN, 설계 문서는 `docs/`가 소유한다.
- 버릴 수 있는 작업 중간 산출물은 `.www/scratchpad/`에 두고, 문서 지위를 얻으면 `docs/`로 승격한다. 세션 상태(`runtime`·`sessions`·`todos`)는 gitignored 영역에만 둔다.

## 조회 경계

- GitHub·증거 JSON을 조회할 때는 필터와 필요 필드로 범위를 제한한다. 같은 대상을 다시 읽을 때는 재조회 대신 이미 기록된 조회 결과(`issues-before`, Receipt 등)를 재사용한다.
- 하위 에이전트에 폭넓은 조사를 맡길 때는 `.www/runtime`·`.www/sessions`·`.www/scratchpad`를 전수 탐색 대상에서 제외하고, 필요한 파일은 경로를 지정해 직접 읽게 한다.

## 설계와 검증

- 여러 모듈의 계약·저장 형식·책임 경계를 바꾸는 작업은 [Design Document Contract](docs/workflows/DESIGN_DOCUMENT_CONTRACT.md)에 따라 저장소 `docs/`에 설계하고 독립된 패스로 검토한다.
- PLAN·PROGRESS·TEST·WORKING은 실제 실행 상태에서 표시한다. 외부 업무 원장이나 게시 성공 여부를 표시 조건으로 사용하지 않는다.

## Git 기록

- 커밋을 준비하거나 실행할 때는 프로젝트 로컬 `$woo-commit`을 사용한다.
- GitHub Issue를 생성하거나 수정할 때는 프로젝트 로컬 `$woo-github-issue-intake`를 사용한다.
- GitHub PR을 생성·수정할 때는 `$woo-github-pr`을 사용한다. Push·Merge·Release는 별도 권한이다.
- 제목은 한국어 문제·요청·결과 문장으로 쓴다. `feat:`, `fix(scope):` 같은 Conventional Commits 유형·범위 접두어는 사용하지 않으며, Issue 유형은 `bug` 또는 `enhancement` 라벨이 소유한다.

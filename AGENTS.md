# World Wide Woo 프로젝트 규칙

## 작업 진입

- 작업 시작·재개 시 [woo-entry](.agents/skills/woo-entry/SKILL.md)로 저장소 위치와 Linear 프로젝트 연결을 확인한 뒤 요청에 맞는 스킬을 적용한다.

## 코드 구조

- 모듈을 생성·이동하거나 의존 경계를 수정할 때는 [LAYERS.md](LAYERS.md)를 읽고 `core / adapters` 정본과 아키텍처 게이트를 적용한다.
- 제품·테스트 TypeScript를 작성하거나 반복 블록을 고칠 때는 [woo-code-readability](.agents/skills/woo-code-readability/SKILL.md)의 작성 시 축 계약([readability-contract.md](.agents/skills/woo-code-readability/references/readability-contract.md))대로 쓴다. 완료 전에 `00_normalize-imports.ts` 검사와 `06_align-tables.ts --file <대상 파일>` 검사를 통과해 증명한다.

## 산출물 위치

- 사람이 다시 읽는 문서(연구·설계·분석·감사 결과)는 `docs/`에 둔다. `.www` 숨김폴더는 제어·기록 평면이므로 새 문서를 만들지 않는다.
- 증거 Receipt·이슈 후보·read-back 기록은 `.www/evidence/`, 제어 원장은 `.www/control-ledger/`, 계획 소스는 `.www/planning/`에 둔다.
- 버릴 수 있는 작업 중간 산출물은 `.www/scratchpad/`에 두고, 문서 지위를 얻으면 `docs/`로 승격한다. 세션 상태(`runtime`·`sessions`·`todos`)는 gitignored 영역에만 둔다.

## 조회 경계

- Linear·GitHub·증거 JSON을 조회할 때는 필터와 필요 필드로 범위를 제한한다. 같은 대상을 다시 읽을 때는 재조회 대신 이미 기록된 조회 결과(`issues-before`, Receipt 등)를 재사용한다.
- 하위 에이전트에 폭넓은 조사를 맡길 때는 `.www/runtime`·`.www/sessions`·`.www/scratchpad`를 전수 탐색 대상에서 제외하고, 필요한 파일은 경로를 지정해 직접 읽게 한다.

## Linear 이슈

- Project Activity에 작업 경과 Comment를 남기거나 Project Update를 게시하기 전에는 [woo-linear-activity](.agents/skills/woo-linear-activity/SKILL.md)를 읽고 적용한다. Comment는 작업 단위 기록, Update는 직전 Update 뒤 Comment를 종합한 기능 릴리스 기록이다.
- `0.0.N` 기능 릴리스의 Project Update를 만들거나 갱신할 때는 [woo-linear-version-update](.agents/skills/woo-linear-version-update/SKILL.md)를 적용한다. 개선·리팩터링은 단독 버전으로 만들지 않고 기능 릴리스에 묶는다.
- Linear 제목·번호·하위 구조를 생성·정리하거나 이슈를 삭제할 때는 [woo-linear-title-hierarchy](.agents/skills/woo-linear-title-hierarchy/SKILL.md)를 읽고 적용한다.
- Linear 이슈를 생성·분할·이동하거나 본문을 수정하기 전에 프로젝트 로컬 [woo-linear-issue-intake](.agents/skills/woo-linear-issue-intake/SKILL.md)를 읽고 적용한다. 기존 계층·중복·가이드를 대조해 위치를 정한 뒤 작성한다.
- 승인된 Linear Candidate를 실제 반영할 때는 [woo-linear-publish](.agents/skills/woo-linear-publish/SKILL.md)를 적용해 현재 상태 대조와 read-back Receipt를 남긴다.

## Obsidian 정본

- Obsidian 상세 정본을 작성·검증·게시할 때는 각각 [woo-obsidian-canonical](.agents/skills/woo-obsidian-canonical/SKILL.md), [woo-obsidian-contract](.agents/skills/woo-obsidian-contract/SKILL.md), [woo-obsidian-publish](.agents/skills/woo-obsidian-publish/SKILL.md)를 적용한다.
- 새 capability나 되돌리기 어려운 계약 변경은 [Design Document Contract](docs/workflows/DESIGN_DOCUMENT_CONTRACT.md)로 설계 문서 필요성과 깊이를 판정한다. 별도 경쟁 정본을 만들지 않고 Obsidian 상세 정본의 `draft`에서 설계한다.

## Git 기록

- 커밋을 준비하거나 실행할 때는 프로젝트 로컬 `$woo-commit`을 사용한다.
- GitHub Issue를 생성하거나 수정할 때는 프로젝트 로컬 `$woo-issue-intake`를 사용한다.
- GitHub PR을 생성·수정하거나 Linear 연결을 검증할 때는 각각 `$woo-github-pr`, `$woo-github-pr-verify`를 사용한다. Push·Merge·Release는 별도 권한이다.
- 제목은 한국어 문제·요청·결과 문장으로 쓴다. `feat:`, `fix(scope):` 같은 Conventional Commits 유형·범위 접두어는 사용하지 않으며, Issue 유형은 `bug` 또는 `enhancement` 라벨이 소유한다.

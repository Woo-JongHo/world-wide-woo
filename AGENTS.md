# World Wide Woo 프로젝트 규칙

## 코드 구조

- 모듈을 생성·이동하거나 의존 경계를 수정할 때는 [LAYERS.md](LAYERS.md)를 읽고 `core / adapters` 정본과 아키텍처 게이트를 적용한다.

## Linear 이슈

- Linear 제목·번호·하위 구조를 생성·정리하거나 이슈를 삭제할 때는 [woo-linear-title-hierarchy](.agents/skills/woo-linear-title-hierarchy/SKILL.md)를 읽고 적용한다.
- Linear 이슈를 생성·분할·이동하거나 본문을 수정하기 전에 프로젝트 로컬 [woo-linear-issue-intake](.agents/skills/woo-linear-issue-intake/SKILL.md)를 읽고 적용한다. 기존 계층·중복·가이드를 대조해 위치를 정한 뒤 작성한다.

## Git 기록

- 커밋을 준비하거나 실행할 때는 프로젝트 로컬 `$woo-commit`을 사용한다.
- GitHub Issue를 생성하거나 수정할 때는 프로젝트 로컬 `$woo-issue-intake`를 사용한다.
- 제목은 한국어 문제·요청·결과 문장으로 쓴다. `feat:`, `fix(scope):` 같은 Conventional Commits 유형·범위 접두어는 사용하지 않으며, Issue 유형은 `bug` 또는 `enhancement` 라벨이 소유한다.

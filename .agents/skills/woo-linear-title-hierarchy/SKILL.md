---
name: woo-linear-title-hierarchy
description: 99_www Linear 기능 이슈의 제목·번호·직계 하위 구조를 생성, 정리, 삭제하거나 반영 전후 검증할 때 계약을 적용한다.
---

# Linear 제목 계층 규칙

이 스킬은 `World Wide Woo` 프로젝트의 Linear 기능 계층을 정리하거나 새 하위 이슈를 만들 때 사용한다. [이슈 계약](../../../docs/planning/linear-development/ISSUE_CONTRACT.yaml)이 계층·번호·본문 필수 절·보존 메타데이터의 정본이고, [작성 템플릿](../../../docs/planning/linear-development/ISSUE_TEMPLATE.md)은 적용 방법을 설명한다. 작업 전에 둘 다 읽는다. 계층의 책임은 `parentId`가 소유하고, 라벨은 검색·분류만 보조한다.

## 적용 절차

1. Linear에서 대상 기능 부모와 직계 하위를 조회해 JSON 스냅샷으로 보존한다. 활성·완료·취소·보관 후보를 대조하고 목록이 잘렸으면 계속 조회한다.
2. 정본과 스냅샷을 대조한다. 상위 기능명을 번호 제목에 반복하지 않고 두 자리 번호를 쓴다. 기존 컬렉션을 재사용하며 없는 항목만 제안한다.
3. 변경 초안을 Linear Artifact Candidate와 계약용 draft JSON으로 만들고 `artifact:control validate` 및 `bun scripts/linear-contract.ts <snapshot.json> <draft.json>`을 통과시킨다. 의도한 parentId·보호 메타데이터 변경만 `declaredChanges`에 적는다. 이 선언을 사용자 승인으로 간주하지 않으며, 실패한 초안은 반영하지 않는다.
4. 사용자 지시 범위만 게시 Candidate에 포함한다. 예시에서 빠진 항목을 삭제 대상으로 추정하지 않는다. 삭제는 `Canceled`로 대체하지 않으며, 중간 부모 삭제는 하위를 먼저 옮기고 빈 부모를 재조회한 뒤 명시적으로 승인된 대상에만 수행한다.
5. 외부 반영은 `woo-linear-publish`가 수행한다. 반영 결과를 다시 조회해 `bun scripts/linear-contract.ts <after.json>`을 통과시키고 Project·parentId·제목·본문·라벨·상태·Milestone을 초안과 대조한다.
6. 검증 결과와 실제 ID·URL을 증거에 남긴다. 실행하지 않은 테스트, 빈 본문 절, TODO는 통과로 기록하지 않는다.

이 스크립트는 에이전트의 반영 전후 게이트다. Linear MCP나 웹의 직접 변경을 기술적으로 차단한다고 주장하지 않는다. 사용자가 명시한 계층과 번호가 자동 분류보다 우선하며, 계약 변경이 필요하면 Linear부터 임의 변경하지 말고 정본과 사용자 결정을 먼저 맞춘다.

Linear 본문은 개발자를 위한 짧은 목적·완료 조건·현재 결과와 연결만 둔다. 상세 코드·설계·예외·테스트 기록은 실제 Obsidian Vault에 보존한 뒤 본문에서 걷어낸다. 코드 연결은 작성 템플릿의 `Code-ID: 0001` 패턴을 사용하며 경로·함수 설명을 본문에 늘어놓지 않는다.

Code-ID를 발급하거나 연결을 바꾸면 `bun run traceability:check -- --linear-snapshot <readback>`으로 `Code-NNN` 등록·대표 선언·노트 ID·SQLite Unit 별칭·Linear 본문을 함께 대조한다. 대표 선언은 이름 있는 최상위 class/function의 `@Unit Code-NNN` 주석에 한 번 둔다.
